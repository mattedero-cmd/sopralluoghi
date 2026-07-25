import type { Foto, RegioneCensura } from '../db/types';

/**
 * CENSURA DELLE REGIONI SENSIBILI (volti).
 *
 * L'originale in archivio non viene mai alterato: la censura si applica ai
 * PIXEL DISEGNATI, in tutti i punti in cui la foto si vede o esce dall'app
 * (editor, miniature, PDF, immagine condivisa, export foto). Così una
 * rilevazione sbagliata si corregge sempre, senza aver perso l'immagine.
 *
 * Resa: mosaico (pixelatura). È irreversibile all'occhio, si legge subito
 * come "oscurato di proposito" e, a differenza della sfocatura, non lascia
 * intuire i lineamenti.
 */

/** quanti blocchi di mosaico lungo il lato maggiore della regione */
const BLOCCHI = 10;

/** regione valida e non degenere */
function regioneUtile(r: RegioneCensura): boolean {
  return r.larghezza >= 1 && r.altezza >= 1;
}

/** true se la foto ha almeno una regione da oscurare */
export function haCensure(foto: Pick<Foto, 'censure'>): boolean {
  return !!foto.censure?.some(regioneUtile);
}

/**
 * Disegna il mosaico sulle regioni indicate, campionando da `sorgente`.
 *
 * - le coordinate delle regioni sono in PIXEL DELL'ORIGINALE;
 * - `scala` converte dai pixel dell'originale a quelli del canvas di
 *   destinazione (1 = stessa risoluzione, <1 per miniature/anteprime).
 */
export function disegnaCensure(
  ctx: CanvasRenderingContext2D,
  sorgente: CanvasImageSource,
  censure: RegioneCensura[] | undefined,
  larghezzaSorgente: number,
  altezzaSorgente: number,
  scala = 1
): void {
  if (!censure?.length) return;
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d');
  if (!tctx) return;

  for (const r of censure) {
    if (!regioneUtile(r)) continue;
    // la regione va ritagliata nei limiti dell'immagine: drawImage con un
    // rettangolo sorgente fuori dai bordi non disegnerebbe nulla
    const sx = Math.max(0, Math.min(larghezzaSorgente, r.x));
    const sy = Math.max(0, Math.min(altezzaSorgente, r.y));
    const sw = Math.max(0, Math.min(larghezzaSorgente - sx, r.larghezza - (sx - r.x)));
    const sh = Math.max(0, Math.min(altezzaSorgente - sy, r.altezza - (sy - r.y)));
    if (sw < 1 || sh < 1) continue;

    const dx = sx * scala;
    const dy = sy * scala;
    const dw = Math.max(1, sw * scala);
    const dh = Math.max(1, sh * scala);

    // 1) si riduce la regione a pochi blocchi…
    const pw = Math.max(1, Math.round(BLOCCHI * Math.min(1, sw / Math.max(sw, sh))));
    const ph = Math.max(1, Math.round(BLOCCHI * Math.min(1, sh / Math.max(sw, sh))));
    tmp.width = pw;
    tmp.height = ph;
    tctx.clearRect(0, 0, pw, ph);
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(sorgente, sx, sy, sw, sh, 0, 0, pw, ph);

    // 2) …e si ridisegna ingrandita senza interpolazione: mosaico
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    ctx.drawImage(tmp, 0, 0, pw, ph, dx, dy, dw, dh);
    ctx.restore();
  }
}

/**
 * Rigenera la miniatura di una foto applicando le censure correnti. Serve
 * quando i riquadri cambiano a mano: le liste mostrano la miniatura
 * archiviata, che è un derivato e va tenuto allineato.
 */
export async function miniaturaCensurata(
  sorgente: CanvasImageSource,
  larghezza: number,
  altezza: number,
  censure: RegioneCensura[] | undefined,
  lato = 400,
  qualita = 0.75
): Promise<Blob> {
  const fattore = Math.min(1, lato / Math.max(larghezza, altezza));
  const w = Math.max(1, Math.round(larghezza * fattore));
  const h = Math.max(1, Math.round(altezza * fattore));
  const tela = document.createElement('canvas');
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sorgente, 0, 0, w, h);
  disegnaCensure(ctx, sorgente, censure, larghezza, altezza, fattore);
  return new Promise<Blob>((risolvi, rifiuta) => {
    tela.toBlob(
      (b) => (b ? risolvi(b) : rifiuta(new Error('Miniatura non generata.'))),
      'image/jpeg',
      qualita
    );
  });
}

/**
 * Copia dell'immagine con le censure già applicate, pronta da disegnare.
 * È la sorgente unica usata da editor, PDF ed export: così anche gli
 * ingrandimenti dei callout (che ricampionano l'immagine) pescano da pixel
 * già oscurati e non possono far riaffiorare un volto.
 *
 * Se non ci sono censure restituisce l'immagine originale (nessuna copia).
 */
export function immagineCensurata<T extends CanvasImageSource>(
  sorgente: T,
  larghezza: number,
  altezza: number,
  censure: RegioneCensura[] | undefined
): T | HTMLCanvasElement {
  if (!censure?.some(regioneUtile)) return sorgente;
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(larghezza));
  tela.height = Math.max(1, Math.round(altezza));
  const ctx = tela.getContext('2d');
  if (!ctx) return sorgente;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sorgente, 0, 0, tela.width, tela.height);
  disegnaCensure(ctx, sorgente, censure, larghezza, altezza, 1);
  return tela;
}
