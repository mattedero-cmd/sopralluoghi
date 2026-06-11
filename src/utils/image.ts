import exifr from 'exifr';
import type { Foto, Geotag } from '../db/types';

/** Lato massimo dell'immagine archiviata: qualità da documentazione tecnica */
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
}

/** Ricostruisce il Blob dell'originale dai dati archiviati */
export function blobOrigine(f: Pick<Foto, 'origine' | 'origineTipo'>): Blob {
  return new Blob([f.origine], { type: f.origineTipo || 'image/jpeg' });
}

export function blobMiniatura(f: Pick<Foto, 'miniatura' | 'miniaturaTipo'>): Blob {
  return new Blob([f.miniatura], { type: f.miniaturaTipo || 'image/jpeg' });
}

/**
 * Importa una foto: legge EXIF (data scatto, geotag), corregge
 * l'orientamento, ridimensiona al lato massimo e genera la miniatura.
 * Da qui in poi il blob archiviato non viene mai più modificato.
 */
export async function importaFoto(file: File | Blob): Promise<FotoImportata> {
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
    const principale = await ridimensiona(bitmap, LATO_MAX, QUALITA_JPEG);
    const miniatura = await ridimensiona(bitmap, LATO_MINIATURA, QUALITA_MINIATURA);
    return {
      origine: await principale.blob.arrayBuffer(),
      origineTipo: 'image/jpeg',
      miniatura: await miniatura.blob.arrayBuffer(),
      miniaturaTipo: 'image/jpeg',
      larghezzaPx: principale.larghezza,
      altezzaPx: principale.altezza,
      dataScatto,
      geotag
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
  qualita: number
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
