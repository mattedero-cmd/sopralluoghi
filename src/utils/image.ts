import exifr from 'exifr';
import type { Foto, Geotag, RegioneCensura } from '../db/types';
import { disegnaCensure } from './censura';

/** Lato massimo predefinito dell'immagine archiviata (configurabile) */
const LATO_MAX = 2560;
const LATO_MINIATURA = 400;
const QUALITA_JPEG = 0.87;
const QUALITA_MINIATURA = 0.75;

/** Dimensione massima accettata del file in ingresso (foto troppo grandi) */
const MAX_FILE_BYTE = 80 * 1024 * 1024;

export interface FotoImportata {
  origine: ArrayBuffer;
  origineTipo: string;
  miniatura: ArrayBuffer;
  miniaturaTipo: string;
  larghezzaPx: number;
  altezzaPx: number;
  dataScatto: number;
  geotag: Geotag | null;
  /** volti rilevati da oscurare (privacy); vuoto se il rilevamento è spento */
  censure?: RegioneCensura[];
  /** true se il rilevamento automatico è stato effettivamente eseguito */
  voltiCercati?: boolean;
}

/**
 * Sorgente disegnabile di una foto: l'immagine decodificata oppure una tela
 * derivata (es. la copia con i volti oscurati). Le due sono intercambiabili
 * per canvas e Konva.
 */
export type ImmagineDisegnabile = HTMLImageElement | HTMLCanvasElement;

/** true se il contenuto della foto è assente o perso (record danneggiato) */
export function fotoIllegibile(f: Pick<Foto, 'origine' | 'danneggiata'>): boolean {
  if (f.danneggiata) return true;
  const legacy = (f as { blobOriginale?: Blob }).blobOriginale;
  if (legacy instanceof Blob) return false; // record legacy non ancora migrato
  return !(f.origine instanceof ArrayBuffer) || f.origine.byteLength === 0;
}

/**
 * Ricostruisce il Blob dell'originale dai dati archiviati.
 * Fallback sul vecchio campo Blob per i record non ancora migrati
 * (es. foto aperta prima che la migrazione all'avvio sia terminata).
 */
export function blobOrigine(f: Pick<Foto, 'origine' | 'origineTipo'>): Blob {
  if (f.origine instanceof ArrayBuffer && f.origine.byteLength > 0) {
    return new Blob([f.origine], { type: f.origineTipo || 'image/jpeg' });
  }
  const legacy = (f as { blobOriginale?: Blob }).blobOriginale;
  if (legacy instanceof Blob) return legacy;
  return new Blob([], { type: 'image/jpeg' });
}

export function blobMiniatura(f: Pick<Foto, 'miniatura' | 'miniaturaTipo'>): Blob {
  if (f.miniatura instanceof ArrayBuffer) {
    return new Blob([f.miniatura], { type: f.miniaturaTipo || 'image/jpeg' });
  }
  // record legacy: la miniatura è ancora un Blob
  return f.miniatura as unknown as Blob;
}

/**
 * Importa una foto: legge EXIF (data scatto, geotag), corregge
 * l'orientamento, ridimensiona al lato massimo e genera la miniatura.
 * Da qui in poi il blob archiviato non viene mai più modificato.
 */
export async function importaFoto(
  file: File | Blob,
  latoMax = LATO_MAX,
  opzioni?: {
    /** cerca i volti e prepara le regioni da oscurare (privacy) */
    censuraVolti?: boolean;
    /**
     * incorpora l'oscuramento direttamente nei pixel archiviati, invece di
     * tenerlo come regione modificabile. Serve per le immagini DERIVATE che
     * non hanno un editor proprio (es. l'inserto di un callout), dove non
     * esisterebbe modo di applicare la censura al momento del disegno.
     */
    incorporaCensure?: boolean;
  }
): Promise<FotoImportata> {
  if (file.size > MAX_FILE_BYTE) {
    throw new Error('Foto troppo grande (oltre 80 MB): riduci la risoluzione e riprova.');
  }
  if (file.size === 0) {
    throw new Error('Il file selezionato è vuoto.');
  }

  let dataScatto = Date.now();
  let geotag: Geotag | null = null;
  try {
    const exif = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate'] });
    const data: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (data instanceof Date && Number.isFinite(data.getTime())) {
      dataScatto = data.getTime();
    }
    const gps = await exifr.gps(file).catch(() => null);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      geotag = { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // EXIF assente o illeggibile: si usano data corrente e nessun geotag
  }

  const bitmap = await decodificaImmagine(file);
  try {
    const principale = await ridimensiona(bitmap, latoMax, QUALITA_JPEG);

    // PRIVACY: i volti si cercano qui, con l'immagine già decodificata. Le
    // regioni sono espresse nei pixel dell'immagine archiviata. L'originale
    // NON viene alterato: l'oscuramento avviene al disegno (editor, PDF,
    // export) e nella miniatura, che è un derivato rigenerabile.
    let censure: RegioneCensura[] = [];
    let voltiCercati = false;
    if (opzioni?.censuraVolti) {
      try {
        const { rilevaVolti } = await import('../geometry/volti');
        censure = await rilevaVolti(bitmap, principale.larghezza, principale.altezza);
        voltiCercati = true;
      } catch {
        // modello non disponibile (prima apertura offline) o rilevatore non
        // supportato: la foto si importa lo stesso, la censura resta manuale
      }
    }

    const riferimento = censure.length
      ? { censure, larghezzaRiferimento: principale.larghezza }
      : undefined;
    // immagini derivate senza editor: l'oscuramento entra nei pixel salvati
    const archiviata =
      riferimento && opzioni?.incorporaCensure
        ? await ridimensiona(bitmap, latoMax, QUALITA_JPEG, riferimento)
        : principale;
    const miniatura = await ridimensiona(bitmap, LATO_MINIATURA, QUALITA_MINIATURA, riferimento);
    return {
      origine: await archiviata.blob.arrayBuffer(),
      origineTipo: 'image/jpeg',
      miniatura: await miniatura.blob.arrayBuffer(),
      miniaturaTipo: 'image/jpeg',
      larghezzaPx: principale.larghezza,
      altezzaPx: principale.altezza,
      dataScatto,
      geotag,
      // se l'oscuramento è già nei pixel non si tramanda come regione: non
      // sarebbe più togliibile e verrebbe applicato una seconda volta
      censure: censure.length && !opzioni?.incorporaCensure ? censure : undefined,
      voltiCercati
    };
  } finally {
    bitmap.close?.();
  }
}

async function decodificaImmagine(file: Blob): Promise<ImageBitmap> {
  try {
    // 'from-image' applica automaticamente l'orientamento EXIF
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback per browser senza supporto all'opzione
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Immagine non leggibile o formato non supportato.'));
        el.src = url;
      });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function ridimensiona(
  bitmap: ImageBitmap,
  latoMax: number,
  qualita: number,
  /** se presente, la copia prodotta esce già con i volti oscurati */
  censura?: { censure: RegioneCensura[]; larghezzaRiferimento: number }
): Promise<{ blob: Blob; larghezza: number; altezza: number }> {
  const fattore = Math.min(1, latoMax / Math.max(bitmap.width, bitmap.height));
  const larghezza = Math.max(1, Math.round(bitmap.width * fattore));
  const altezza = Math.max(1, Math.round(bitmap.height * fattore));
  const canvas = document.createElement('canvas');
  canvas.width = larghezza;
  canvas.height = altezza;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, larghezza, altezza);
  if (censura?.censure.length) {
    // le regioni sono nei pixel dell'immagine archiviata: qui si convertono
    // nella scala di QUESTA copia (la miniatura è più piccola)
    const scala = larghezza / Math.max(1, censura.larghezzaRiferimento);
    const sorgente = document.createElement('canvas');
    sorgente.width = Math.max(1, Math.round(censura.larghezzaRiferimento));
    sorgente.height = Math.max(1, Math.round((bitmap.height / bitmap.width) * sorgente.width));
    const sctx = sorgente.getContext('2d');
    if (sctx) {
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(bitmap, 0, 0, sorgente.width, sorgente.height);
      disegnaCensure(ctx, sorgente, censura.censure, sorgente.width, sorgente.height, scala);
    }
  }
  const blob = await canvasInBlob(canvas, 'image/jpeg', qualita);
  return { blob, larghezza, altezza };
}

export function canvasInBlob(canvas: HTMLCanvasElement, tipo: string, qualita: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Errore nella generazione dell'immagine."));
      },
      tipo,
      qualita
    );
  });
}

/** Carica un Blob immagine come elemento utilizzabile su canvas */
export async function caricaImmagine(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Impossibile caricare la foto dal database.'));
      el.src = url;
    });
    return img;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  // NB: l'URL resta valido finché l'immagine è in uso; revocarlo subito
  // dopo il load è sicuro nei browser moderni, ma per prudenza lo si
  // lascia al garbage collector della pagina (le foto aperte sono poche).
}
