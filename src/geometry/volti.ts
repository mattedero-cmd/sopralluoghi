import type { RegioneCensura } from '../db/types';
import { nuovoId } from '../utils/id';

/**
 * RILEVAMENTO AUTOMATICO DEI VOLTI (privacy).
 *
 * Le foto di sopralluogo finiscono nei PDF e nelle immagini condivise: i
 * volti delle persone di passaggio vanno oscurati. Il rilevatore gira
 * INTERAMENTE sul dispositivo (nessun invio di immagini a servizi esterni) e
 * funziona offline: il modello è archiviato nell'app.
 *
 * Modello: TinyFaceDetector (face-api) — leggero (~190 KB di pesi) e adatto
 * al telefono. La libreria è caricata su richiesta (import dinamico), così
 * non pesa sull'avvio dell'app.
 *
 * ATTENZIONE (limite dichiarato): nessun rilevatore trova il 100% dei volti.
 * Volti molto piccoli, di profilo, coperti o sfocati possono sfuggire: la
 * revisione a mano resta necessaria prima di consegnare un report.
 */

/** cartella dei pesi del modello, serviti dall'app (offline) */
const CARTELLA_MODELLO = '/modelli/volti';

/** lato massimo dell'immagine data in pasto al rilevatore */
const LATO_ANALISI = 640;

/**
 * Margine attorno al riquadro del volto. Il rilevatore restituisce un
 * riquadro stretto sul viso: un po' di margine copre fronte, mento e
 * orecchie senza invadere lo sfondo. Resta contenuto perché l'oscuramento
 * sfuma anche oltre il riquadro (vedi SFUMATURA in utils/censura), quindi la
 * copertura effettiva è più ampia di quella disegnata.
 */
const MARGINE_X = 0.08;
const MARGINE_SOPRA = 0.20;
const MARGINE_SOTTO = 0.10;

/** libreria caricata una sola volta (import dinamico) */
let libreria: Promise<typeof import('@vladmandic/face-api')> | null = null;
/** pesi caricati una sola volta */
let modelloPronto: Promise<void> | null = null;

async function caricaLibreria() {
  if (!libreria) libreria = import('@vladmandic/face-api');
  return libreria;
}

/**
 * Carica il modello (una sola volta). Va chiamata prima del rilevamento;
 * se i pesi non sono disponibili (primo avvio senza rete e prima che il
 * service worker li abbia messi in cache) solleva un errore parlante.
 */
export async function preparaRilevatoreVolti(): Promise<void> {
  if (modelloPronto) return modelloPronto;
  modelloPronto = (async () => {
    // il backend di calcolo (WebGL, con ripiego su CPU) è scelto dalla
    // libreria stessa al primo uso: qui bastano i pesi del modello
    const faceapi = await caricaLibreria();
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(CARTELLA_MODELLO);
    } catch {
      modelloPronto = null; // riprovabile
      throw new Error(
        'Modello per il rilevamento dei volti non disponibile: apri l’app una volta con la rete attiva.'
      );
    }
  })();
  return modelloPronto;
}

/** true se il rilevatore è già pronto all'uso (nessuna attesa) */
export function rilevatoreVoltiPronto(): boolean {
  return modelloPronto !== null;
}

/**
 * Allarga il riquadro del volto col margine di sicurezza e lo riporta dentro
 * i limiti dell'immagine. Esposta per i test (geometria pura).
 */
export function riquadroCensura(
  box: { x: number; y: number; larghezza: number; altezza: number },
  larghezzaImg: number,
  altezzaImg: number
): { x: number; y: number; larghezza: number; altezza: number } {
  const dx = box.larghezza * MARGINE_X;
  const x1 = box.x - dx;
  const x2 = box.x + box.larghezza + dx;
  const y1 = box.y - box.altezza * MARGINE_SOPRA;
  const y2 = box.y + box.altezza + box.altezza * MARGINE_SOTTO;
  const cx1 = Math.max(0, Math.min(larghezzaImg, x1));
  const cy1 = Math.max(0, Math.min(altezzaImg, y1));
  const cx2 = Math.max(0, Math.min(larghezzaImg, x2));
  const cy2 = Math.max(0, Math.min(altezzaImg, y2));
  return {
    x: Math.round(cx1),
    y: Math.round(cy1),
    larghezza: Math.max(0, Math.round(cx2 - cx1)),
    altezza: Math.max(0, Math.round(cy2 - cy1))
  };
}

/**
 * Cerca i volti in un'immagine già decodificata e restituisce le regioni da
 * oscurare, in PIXEL DELL'IMMAGINE PASSATA (`larghezza`×`altezza`).
 *
 * `sorgente` può essere un ImageBitmap (importazione) o un HTMLImageElement
 * (ri-analisi di una foto già in archivio).
 */
export async function rilevaVolti(
  sorgente: CanvasImageSource,
  larghezza: number,
  altezza: number
): Promise<RegioneCensura[]> {
  if (larghezza < 2 || altezza < 2) return [];
  await preparaRilevatoreVolti();
  const faceapi = await caricaLibreria();

  // si analizza una copia ridotta: il rilevatore non guadagna nulla dalla
  // piena risoluzione e sul telefono sarebbe molto più lento
  const fattore = Math.min(1, LATO_ANALISI / Math.max(larghezza, altezza));
  const w = Math.max(1, Math.round(larghezza * fattore));
  const h = Math.max(1, Math.round(altezza * fattore));
  const tela = document.createElement('canvas');
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(sorgente, 0, 0, w, h);

  const opzioni = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    // soglia bassa: in privacy conta trovarne di più (un riquadro di troppo
    // si toglie con un tocco, un volto mancato finisce nel report)
    scoreThreshold: 0.35
  });
  const trovati = await faceapi.detectAllFaces(tela, opzioni);

  const regioni: RegioneCensura[] = [];
  for (const d of trovati) {
    const b = d.box ?? d.relativeBox;
    if (!b) continue;
    // dalla scala di analisi a quella dell'immagine
    const r = riquadroCensura(
      {
        x: b.x / fattore,
        y: b.y / fattore,
        larghezza: b.width / fattore,
        altezza: b.height / fattore
      },
      larghezza,
      altezza
    );
    if (r.larghezza >= 2 && r.altezza >= 2) regioni.push({ id: nuovoId(), ...r, auto: true });
  }
  return regioni;
}
