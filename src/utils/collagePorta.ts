/**
 * LE FOTO DEL RILIEVO PORTA, IMPAGINATE IN UN A4.
 *
 * Il rilievo di una porta comincia dalle foto: porta chiusa dal lato esterno,
 * porta chiusa dal lato interno, lo stipite visto da sotto il traverso (il
 * profilo vero) e fino a quattro dettagli a scelta (cerniere, maniglia,
 * serratura, spioncino…). Le foto si compongono in un foglio A4 verticale
 * diviso in quattro quarti, uno per ruolo; i dettagli si dividono il quarto.
 *
 * Il collage diventa una foto del progetto (`Foto.collagePorta`) e porta con
 * sé dove sta ogni scatto: per rifare una foto sola si ritagliano le altre dal
 * collage, senza tenere da parte gli originali.
 */

import type { AreaScatto, RuoloScatto } from '../db/types';
import { canvasInBlob, caricaImmagine } from './image';

export type { AreaScatto, RuoloScatto };

/** Lato lungo del collage: lo stesso delle foto archiviate. */
export const ALTEZZA_COLLAGE = 2560;
/** A4 verticale: 210 × 297. */
export const LARGHEZZA_COLLAGE = Math.round((ALTEZZA_COLLAGE * 210) / 297);
/** quante foto di dettaglio stanno nell'ultimo quarto */
export const MAX_DETTAGLI = 4;

export interface Rett {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** I tre quarti fissi e il quarto dei dettagli, in ordine di lettura. */
export const QUARTI: Array<{ ruolo: RuoloScatto; titolo: string; istruzione: string }> = [
  {
    ruolo: 'esterno',
    titolo: 'Porta chiusa · lato esterno',
    istruzione: 'Fotografa la porta chiusa, tutta intera, dal lato esterno. Tieni il telefono in verticale.'
  },
  {
    ruolo: 'interno',
    titolo: 'Porta chiusa · lato interno',
    istruzione: 'Passa dall’altra parte e fotografa la porta chiusa, tutta intera, dal lato interno.'
  },
  {
    ruolo: 'stipite',
    titolo: 'Stipite · profilo',
    istruzione:
      'Apri la porta, mettiti sotto il traverso e fotografa lo stipite: deve vedersi bene il suo profilo.'
  },
  {
    ruolo: 'dettaglio',
    titolo: 'Dettagli',
    istruzione: `Fino a ${MAX_DETTAGLI} foto di quello che serve: cerniere, maniglia, serratura, spioncino…`
  }
];

/** Margine fra i quarti e attorno al foglio, in frazione della larghezza. */
const MARGINE = 0.012;

/** I quattro quarti del foglio (2 × 2), in pixel del collage. */
export function quartiCollage(W = LARGHEZZA_COLLAGE, H = ALTEZZA_COLLAGE): Rett[] {
  const m = Math.round(W * MARGINE);
  const w = (W - m * 3) / 2;
  const h = (H - m * 3) / 2;
  return [0, 1, 2, 3].map((i) => ({
    x: m + (i % 2) * (w + m),
    y: m + Math.floor(i / 2) * (h + m),
    w,
    h
  }));
}

/**
 * Le caselle dei dettagli dentro il loro quarto: uno occupa tutto, due uno
 * sopra l'altro, tre o quattro in griglia 2 × 2.
 */
export function caselleDettagli(quarto: Rett, n: number, W = LARGHEZZA_COLLAGE): Rett[] {
  const k = Math.max(0, Math.min(MAX_DETTAGLI, Math.floor(n)));
  if (k === 0) return [];
  if (k === 1) return [{ ...quarto }];
  const g = Math.round(W * MARGINE * 0.6);
  if (k === 2) {
    const h = (quarto.h - g) / 2;
    return [0, 1].map((i) => ({ x: quarto.x, y: quarto.y + i * (h + g), w: quarto.w, h }));
  }
  const w = (quarto.w - g) / 2;
  const h = (quarto.h - g) / 2;
  return Array.from({ length: k }, (_, i) => ({
    x: quarto.x + (i % 2) * (w + g),
    y: quarto.y + Math.floor(i / 2) * (h + g),
    w,
    h
  }));
}

/**
 * Come una foto entra nella sua casella. Se riempirla taglia poco (meno del
 * 18% di un lato) la foto la riempie tutta; altrimenti ci sta intera, con il
 * fondo attorno. Così una foto verticale riempie il suo quarto, e una
 * orizzontale messa per sbaglio non perde metà porta.
 *
 * `sorgente` è la parte della foto da usare, `destinazione` dove va.
 */
export function adattaInCasella(
  larghezza: number,
  altezza: number,
  casella: Rett
): { sorgente: Rett; destinazione: Rett } {
  const rFoto = larghezza / altezza;
  const rCasella = casella.w / casella.h;
  const taglio = rFoto > rCasella ? 1 - rCasella / rFoto : 1 - rFoto / rCasella;
  if (taglio <= 0.18) {
    // riempie: si ritaglia il centro della foto
    if (rFoto > rCasella) {
      const w = altezza * rCasella;
      return { sorgente: { x: (larghezza - w) / 2, y: 0, w, h: altezza }, destinazione: { ...casella } };
    }
    const h = larghezza / rCasella;
    return { sorgente: { x: 0, y: (altezza - h) / 2, w: larghezza, h }, destinazione: { ...casella } };
  }
  // intera, centrata
  const s = Math.min(casella.w / larghezza, casella.h / altezza);
  const w = larghezza * s;
  const h = altezza * s;
  return {
    sorgente: { x: 0, y: 0, w: larghezza, h: altezza },
    destinazione: { x: casella.x + (casella.w - w) / 2, y: casella.y + (casella.h - h) / 2, w, h }
  };
}

/** Una foto del rilievo, pronta da disegnare. */
export type ImmagineScatto = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface ScattiPorta {
  esterno?: ImmagineScatto | null;
  interno?: ImmagineScatto | null;
  stipite?: ImmagineScatto | null;
  dettagli: ImmagineScatto[];
}

export function contaScatti(s: ScattiPorta): number {
  return (s.esterno ? 1 : 0) + (s.interno ? 1 : 0) + (s.stipite ? 1 : 0) + s.dettagli.length;
}

const dimensioni = (img: ImmagineScatto) => ({
  w: 'naturalWidth' in img ? img.naturalWidth : img.width,
  h: 'naturalHeight' in img ? img.naturalHeight : img.height
});

/**
 * Compone il collage. Restituisce il JPEG e dove è finito ogni scatto (per
 * ritagliarli di nuovo). Un quarto senza foto resta vuoto, con il suo titolo.
 */
export async function componiCollage(
  scatti: ScattiPorta,
  titolo: string
): Promise<{ blob: Blob; larghezza: number; altezza: number; aree: AreaScatto[] }> {
  const W = LARGHEZZA_COLLAGE;
  const H = ALTEZZA_COLLAGE;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const quarti = quartiCollage(W, H);
  const aree: AreaScatto[] = [];
  const disegna = (img: ImmagineScatto, casella: Rett, ruolo: RuoloScatto, indice?: number) => {
    const { w, h } = dimensioni(img);
    if (!w || !h) return;
    const { sorgente: s, destinazione: d } = adattaInCasella(w, h, casella);
    ctx.fillStyle = '#e9edf0';
    ctx.fillRect(casella.x, casella.y, casella.w, casella.h);
    ctx.drawImage(img, s.x, s.y, s.w, s.h, d.x, d.y, d.w, d.h);
    const arrotonda = (r: Rett) => ({
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.w),
      h: Math.round(r.h)
    });
    aree.push({ ruolo, ...(indice !== undefined ? { indice } : {}), ...arrotonda(d) });
  };

  QUARTI.forEach((q, i) => {
    const quarto = quarti[i];
    if (q.ruolo === 'dettaglio') {
      const caselle = caselleDettagli(quarto, scatti.dettagli.length, W);
      scatti.dettagli.slice(0, MAX_DETTAGLI).forEach((img, j) => disegna(img, caselle[j], 'dettaglio', j));
      if (!scatti.dettagli.length) quartoVuoto(ctx, quarto);
    } else {
      const img = scatti[q.ruolo];
      if (img) disegna(img, quarto, q.ruolo);
      else quartoVuoto(ctx, quarto);
    }
    etichettaQuarto(ctx, quarto, `${i + 1} · ${q.titolo}`, W);
  });
  // il nome della porta, in alto a sinistra sul primo quarto
  if (titolo) etichettaQuarto(ctx, quarti[0], titolo, W, true);

  const blob = await canvasInBlob(canvas, 'image/jpeg', 0.88);
  return { blob, larghezza: W, altezza: H, aree };
}

function quartoVuoto(ctx: CanvasRenderingContext2D, r: Rett) {
  ctx.fillStyle = '#f2f5f7';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#c9d2d9';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 12]);
  ctx.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
  ctx.setLineDash([]);
}

/** Pillola scura con il titolo del quarto: in basso (o in alto, per il nome). */
function etichettaQuarto(ctx: CanvasRenderingContext2D, r: Rett, testo: string, W: number, inAlto = false) {
  const dim = Math.round(W * (inAlto ? 0.03 : 0.022));
  ctx.font = `bold ${dim}px system-ui, sans-serif`;
  const pad = dim * 0.5;
  const w = Math.min(r.w - pad * 2, ctx.measureText(testo).width + pad * 2);
  const h = dim * 1.6;
  const x = r.x + pad;
  const y = inAlto ? r.y + pad : r.y + r.h - h - pad;
  ctx.fillStyle = 'rgba(16,20,26,0.78)';
  ctx.beginPath();
  ctx.roundRect?.(x, y, w, h, h / 2);
  if (!ctx.roundRect) ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w - pad * 0.5, h);
  ctx.clip();
  ctx.fillText(testo, x + pad, y + h / 2);
  ctx.restore();
}

/**
 * Riprende gli scatti da un collage già fatto: ognuno è la parte del collage
 * dove era stato disegnato. Rimessi in un collage nuovo tornano identici.
 */
export async function scattiDaCollage(collage: Blob, aree: AreaScatto[]): Promise<ScattiPorta> {
  const img = await caricaImmagine(collage);
  const ritaglia = (a: AreaScatto) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, a.w);
    c.height = Math.max(1, a.h);
    c.getContext('2d')?.drawImage(img, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
    return c;
  };
  const scatti: ScattiPorta = { dettagli: [] };
  for (const a of aree) {
    if (a.ruolo === 'dettaglio') scatti.dettagli[a.indice ?? scatti.dettagli.length] = ritaglia(a);
    else scatti[a.ruolo] = ritaglia(a);
  }
  scatti.dettagli = scatti.dettagli.filter(Boolean);
  return scatti;
}

/**
 * Apre una foto appena scattata, già raddrizzata (EXIF) e ridotta: per il
 * collage basta il lato lungo del quarto, il resto è memoria sprecata.
 */
export async function apriScatto(file: Blob, latoMax = 1800): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const img = await caricaImmagine(file);
    bitmap = await createImageBitmap(img);
  }
  try {
    const f = Math.min(1, latoMax / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bitmap.width * f));
    c.height = Math.max(1, Math.round(bitmap.height * f));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return c;
  } finally {
    bitmap.close?.();
  }
}
