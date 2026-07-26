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

/**
 * Lato massimo di ogni immagine data in pasto al rilevatore. Il modello
 * ridimensiona comunque l'ingresso a questa misura: è LEI a decidere quanti
 * pixel restano a un viso, quindi la dimensione minima rilevabile.
 */
const LATO_ANALISI = 512;

/**
 * Sotto ~24 px di viso il rilevatore non vede più nulla. In una foto di
 * gruppo un volto può essere 60 px su 2560: ridotto in un colpo solo a 512
 * diventerebbe 12 px, invisibile — ed è il motivo per cui una foto piena di
 * persone poteva risultare "senza volti".
 *
 * Perciò l'immagine si analizza anche a RIQUADRI sovrapposti: ogni riquadro
 * arriva al rilevatore molto meno rimpicciolito, e i visi piccoli tornano di
 * una dimensione leggibile. La sovrapposizione evita che un viso a cavallo
 * di due riquadri venga tagliato da entrambi.
 */
const SOVRAPPOSIZIONE = 0.25;

/** quanti riquadri per lato, in base a quanto è grande la foto */
function riquadriPerLato(larghezza: number, altezza: number): number {
  const lato = Math.max(larghezza, altezza);
  if (lato >= 2000) return 3;
  if (lato >= 1100) return 2;
  return 1;
}

/** sovrapposizione di due riquadri (IoU): serve a fondere i doppioni */
function sovrapposizione(
  a: { x: number; y: number; larghezza: number; altezza: number },
  b: { x: number; y: number; larghezza: number; altezza: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.larghezza, b.x + b.larghezza);
  const y2 = Math.min(a.y + a.altezza, b.y + b.altezza);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const unione = a.larghezza * a.altezza + b.larghezza * b.altezza - inter;
  return unione > 0 ? inter / unione : 0;
}

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
      // due cause possibili, indistinguibili da qui: i pesi non ancora in
      // cache (prima apertura senza rete) oppure il motore grafico non
      // utilizzabile su questo dispositivo
      throw new Error(
        'Rilevamento dei volti non disponibile: apri l’app una volta con la rete attiva; ' +
          'se il problema resta, questo dispositivo non lo supporta e i volti vanno oscurati a mano.'
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

  const tela = document.createElement('canvas');
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  const opzioni = new faceapi.TinyFaceDetectorOptions({
    inputSize: LATO_ANALISI,
    // soglia bassa: in privacy conta trovarne di più (un riquadro di troppo
    // si toglie con un tocco, un volto mancato finisce nel report)
    scoreThreshold: 0.3
  });

  /** volti trovati finora, in pixel dell'immagine intera */
  const grezzi: Array<{ x: number; y: number; larghezza: number; altezza: number; punteggio: number }> =
    [];

  /** analizza una porzione dell'immagine e riporta i volti in coordinate assolute */
  const analizza = async (px: number, py: number, pw: number, ph: number): Promise<void> => {
    if (pw < 16 || ph < 16) return;
    // la porzione arriva al rilevatore rimpicciolita al minimo indispensabile
    const fattore = Math.min(1, LATO_ANALISI / Math.max(pw, ph));
    const w = Math.max(1, Math.round(pw * fattore));
    const h = Math.max(1, Math.round(ph * fattore));
    tela.width = w;
    tela.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sorgente, px, py, pw, ph, 0, 0, w, h);
    const trovati = await faceapi.detectAllFaces(tela, opzioni);
    for (const d of trovati) {
      const b = d.box ?? d.relativeBox;
      if (!b) continue;
      grezzi.push({
        x: px + b.x / fattore,
        y: py + b.y / fattore,
        larghezza: b.width / fattore,
        altezza: b.height / fattore,
        punteggio: d.score ?? 0
      });
    }
  };

  // 1) immagine intera: prende i volti grandi (e i ritratti)
  await analizza(0, 0, larghezza, altezza);

  // 2) riquadri sovrapposti: recuperano i volti piccoli delle foto di gruppo
  const n = riquadriPerLato(larghezza, altezza);
  if (n > 1) {
    const passoX = larghezza / n;
    const passoY = altezza / n;
    const margineX = passoX * SOVRAPPOSIZIONE;
    const margineY = passoY * SOVRAPPOSIZIONE;
    for (let riga = 0; riga < n; riga++) {
      for (let col = 0; col < n; col++) {
        const x1 = Math.max(0, col * passoX - margineX);
        const y1 = Math.max(0, riga * passoY - margineY);
        const x2 = Math.min(larghezza, (col + 1) * passoX + margineX);
        const y2 = Math.min(altezza, (riga + 1) * passoY + margineY);
        await analizza(x1, y1, x2 - x1, y2 - y1);
      }
    }
  }

  // 3) fusione dei doppioni: lo stesso viso compare in più riquadri
  grezzi.sort((a, b) => b.punteggio - a.punteggio);
  const tenuti: typeof grezzi = [];
  for (const g of grezzi) {
    if (tenuti.some((t) => sovrapposizione(g, t) > 0.3)) continue;
    tenuti.push(g);
  }

  const regioni: RegioneCensura[] = [];
  for (const t of tenuti) {
    const r = riquadroCensura(t, larghezza, altezza);
    if (r.larghezza >= 2 && r.altezza >= 2) regioni.push({ id: nuovoId(), ...r, auto: true });
  }
  return regioni;
}
