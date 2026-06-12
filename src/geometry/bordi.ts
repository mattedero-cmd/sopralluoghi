import type { Punto, Rettangolo } from '../db/types';

/**
 * Analisi dell'immagine per snap ai bordi e autoquotatura: luminanza
 * calcolata una sola volta per foto, su una versione ridotta per
 * restare fluidi anche su telefoni.
 */
export class RicercaBordi {
  private lum: Float32Array;
  private w: number;
  private h: number;
  /** fattore immagine→ridotta */
  private fattore: number;

  constructor(immagine: CanvasImageSource, larghezzaPx: number, altezzaPx: number) {
    const latoMax = 1024;
    this.fattore = Math.min(1, latoMax / Math.max(larghezzaPx, altezzaPx));
    this.w = Math.max(2, Math.round(larghezzaPx * this.fattore));
    this.h = Math.max(2, Math.round(altezzaPx * this.fattore));
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas non disponibile.');
    ctx.drawImage(immagine, 0, 0, this.w, this.h);
    const rgba = ctx.getImageData(0, 0, this.w, this.h).data;
    this.lum = new Float32Array(this.w * this.h);
    for (let i = 0; i < this.lum.length; i++) {
      const j = i * 4;
      this.lum[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    }
  }

  /** Costruzione da dati grezzi (per i test, senza canvas) */
  static daDati(lum: Float32Array, w: number, h: number, fattore = 1): RicercaBordi {
    const r = Object.create(RicercaBordi.prototype) as RicercaBordi;
    r.lum = lum;
    r.w = w;
    r.h = h;
    r.fattore = fattore;
    return r;
  }

  /**
   * Restituisce il punto (in px immagine) con il gradiente più forte
   * entro `raggioPx` dal punto dato, oppure null se non c'è un bordo netto.
   */
  cerca(p: Punto, raggioPx: number): Punto | null {
    const cx = Math.round(p.x * this.fattore);
    const cy = Math.round(p.y * this.fattore);
    const r = Math.max(2, Math.min(24, Math.round(raggioPx * this.fattore)));
    let migliore = -1;
    let bx = cx;
    let by = cy;
    const x0 = Math.max(1, cx - r);
    const x1 = Math.min(this.w - 2, cx + r);
    const y0 = Math.max(1, cy - r);
    const y1 = Math.min(this.h - 2, cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
        const m = this.sobel(x, y);
        if (m > migliore) {
          migliore = m;
          bx = x;
          by = y;
        }
      }
    }
    // soglia: il bordo deve essere netto, altrimenti niente snap
    if (migliore < 60) return null;
    return { x: bx / this.fattore, y: by / this.fattore };
  }

  private sobel(x: number, y: number): number {
    const l = (xx: number, yy: number) => this.lum[yy * this.w + xx];
    const gx =
      -l(x - 1, y - 1) - 2 * l(x - 1, y) - l(x - 1, y + 1) +
      l(x + 1, y - 1) + 2 * l(x + 1, y) + l(x + 1, y + 1);
    const gy =
      -l(x - 1, y - 1) - 2 * l(x, y - 1) - l(x + 1, y - 1) +
      l(x - 1, y + 1) + 2 * l(x, y + 1) + l(x + 1, y + 1);
    return Math.hypot(gx, gy);
  }
}

// ---------------------------------------------------------------------------
// Autoquotatura: rilevamento della figura toccata
// ---------------------------------------------------------------------------

export interface FiguraRilevata {
  rettangolo: Rettangolo;
}

/**
 * Rileva la figura "netta" (porta, finestra, piastrella, pannello…)
 * che contiene il punto toccato: dal punto si scandisce nelle quattro
 * direzioni il profilo di luminanza mediato su una piccola banda e si
 * cerca il primo fronte di contrasto deciso — il bordo della figura.
 * Restituisce null se non c'è una figura sufficientemente netta.
 */
export function rilevaFigura(ricerca: RicercaBordi, p: Punto): FiguraRilevata | null {
  // accesso ai campi privati della classe (stesso modulo)
  const { lum, w, h, fattore } = ricerca as unknown as {
    lum: Float32Array;
    w: number;
    h: number;
    fattore: number;
  };
  const cx = Math.round(p.x * fattore);
  const cy = Math.round(p.y * fattore);
  if (cx < 2 || cy < 2 || cx > w - 3 || cy > h - 3) return null;

  const BANDA = 2; // mediamo su 5 righe/colonne: robusto al rumore
  const SOGLIA_FORTE = 16; // salto di luminanza (0–255) che definisce un bordo
  const MIN_DIST = 3;

  /** profilo mediato lungo x alla riga cy (banda ±BANDA) */
  const lungoX = (x: number): number => {
    let somma = 0;
    let n = 0;
    for (let dy = -BANDA; dy <= BANDA; dy++) {
      const y = cy + dy;
      if (y >= 0 && y < h) {
        somma += lum[y * w + x];
        n++;
      }
    }
    return somma / n;
  };
  const lungoY = (y: number): number => {
    let somma = 0;
    let n = 0;
    for (let dx = -BANDA; dx <= BANDA; dx++) {
      const x = cx + dx;
      if (x >= 0 && x < w) {
        somma += lum[y * w + x];
        n++;
      }
    }
    return somma / n;
  };

  /**
   * Scansione dal centro verso l'esterno: distanza del primo fronte
   * di contrasto forte (massimo locale del gradiente sopra soglia).
   */
  const primoBordo = (
    profilo: (t: number) => number,
    da: number,
    verso: 1 | -1,
    limite: number
  ): number | null => {
    let migliore: number | null = null;
    let miglioreGrad = 0;
    for (let dist = MIN_DIST; ; dist++) {
      const t = da + verso * dist;
      if (t < 1 || t > limite - 2) break;
      const grad = Math.abs(profilo(t + 1) - profilo(t - 1)) / 2;
      const gradSucc =
        t + verso >= 1 && t + verso <= limite - 2
          ? Math.abs(profilo(t + verso + 1) - profilo(t + verso - 1)) / 2
          : 0;
      if (grad >= SOGLIA_FORTE && grad >= gradSucc) {
        return dist; // primo fronte deciso: è il bordo della figura
      }
      if (grad > miglioreGrad) {
        miglioreGrad = grad;
        migliore = dist;
      }
    }
    // nessun fronte deciso: si accetta il massimo se comunque marcato
    return miglioreGrad >= SOGLIA_FORTE * 0.6 ? migliore : null;
  };

  const sinistra = primoBordo(lungoX, cx, -1, w);
  const destra = primoBordo(lungoX, cx, 1, w);
  const sopra = primoBordo(lungoY, cy, -1, h);
  const sotto = primoBordo(lungoY, cy, 1, h);
  if (sinistra === null || destra === null || sopra === null || sotto === null) return null;

  const x1 = (cx - sinistra) / fattore;
  const x2 = (cx + destra) / fattore;
  const y1 = (cy - sopra) / fattore;
  const y2 = (cy + sotto) / fattore;
  const minLato = 14 / fattore;
  if (x2 - x1 < minLato || y2 - y1 < minLato) return null;

  return { rettangolo: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } };
}
