import type { Punto } from '../db/types';

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
  /** angoli del quadrilatero rilevato: alto-sx, alto-dx, basso-dx, basso-sx */
  punti: [Punto, Punto, Punto, Punto];
}

/** retta x = a·y + b (lati verticali) oppure y = a·x + b (lati orizzontali) */
interface RettaLato {
  a: number;
  b: number;
}

/**
 * Rileva la figura "netta" (porta, finestra, piastrella, pannello…)
 * che contiene il punto toccato. La forma NON è un rettangolo
 * ortogonale: ogni lato viene TRACCIATO seguendo il fronte di
 * contrasto (campioni lungo il bordo + fit ai minimi quadrati), così
 * il quadrilatero segue i bordi reali anche quando la prospettiva li
 * inclina. Restituisce null se non c'è una figura sufficientemente netta.
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

  const xL = cx - sinistra;
  const xR = cx + destra;
  const yT = cy - sopra;
  const yB = cy + sotto;
  if (xR - xL < 14 || yB - yT < 14) return null;

  // -------------------------------------------------------------------------
  // Tracciamento dei lati: si segue il fronte di contrasto campione per
  // campione (finestra mobile) e si interpola la retta del lato.
  // -------------------------------------------------------------------------

  const grad = (x: number, y: number, orizzontale: boolean): number => {
    // gradiente perpendicolare al lato, mediato su 3 righe/colonne
    let somma = 0;
    for (let k = -1; k <= 1; k++) {
      if (orizzontale) {
        const xx = Math.max(1, Math.min(w - 2, x + k));
        somma += Math.abs(lum[y * w + xx + 1] - lum[y * w + xx - 1]);
      } else {
        const yy = Math.max(1, Math.min(h - 2, y + k));
        somma += Math.abs(lum[(yy + 1) * w + x] - lum[(yy - 1) * w + x]);
      }
    }
    return somma / 6;
  };

  /** fit ai minimi quadrati: v = a·t + b sui campioni raccolti */
  const fitRetta = (campioni: Array<{ t: number; v: number }>): RettaLato | null => {
    const n = campioni.length;
    if (n < 4) return null;
    let st = 0;
    let sv = 0;
    let stt = 0;
    let stv = 0;
    for (const c of campioni) {
      st += c.t;
      sv += c.v;
      stt += c.t * c.t;
      stv += c.t * c.v;
    }
    const den = n * stt - st * st;
    if (Math.abs(den) < 1e-9) return null;
    const a = (n * stv - st * sv) / den;
    if (Math.abs(a) > 0.6) return null; // lato troppo inclinato: non plausibile
    return { a, b: (sv - a * st) / n };
  };

  /**
   * Traccia un lato verticale (x ≈ costante) tra tMin e tMax (coordinate y):
   * a ogni passo cerca il massimo del gradiente orizzontale in una
   * finestra attorno alla x del passo precedente.
   */
  const tracciaLato = (vIniziale: number, tMin: number, tMax: number, verticale: boolean): RettaLato => {
    const campioni: Array<{ t: number; v: number }> = [];
    const passi = 9;
    const FINESTRA = 7;
    let vPrec = vIniziale;
    for (let i = 0; i < passi; i++) {
      const t = Math.round(tMin + ((tMax - tMin) * i) / (passi - 1));
      let meglioV = -1;
      let meglioG = 0;
      for (let dv = -FINESTRA; dv <= FINESTRA; dv++) {
        const v = Math.round(vPrec) + dv;
        if (v < 1 || v > (verticale ? w : h) - 2) continue;
        const g = verticale ? grad(v, t, true) : grad(t, v, false);
        if (g > meglioG) {
          meglioG = g;
          meglioV = v;
        }
      }
      if (meglioV >= 0 && meglioG >= SOGLIA_FORTE * 0.6) {
        campioni.push({ t, v: meglioV });
        vPrec = meglioV;
      }
    }
    // fallback: lato dritto alla posizione iniziale
    return fitRetta(campioni) ?? { a: 0, b: vIniziale };
  };

  // margini dai presunti angoli, per non campionare gli spigoli
  const mY = Math.max(2, Math.round((yB - yT) * 0.18));
  const mX = Math.max(2, Math.round((xR - xL) * 0.18));
  const latoSinistro = tracciaLato(xL, yT + mY, yB - mY, true); // x = a·y + b
  const latoDestro = tracciaLato(xR, yT + mY, yB - mY, true);
  const latoAlto = tracciaLato(yT, xL + mX, xR - mX, false); // y = a·x + b
  const latoBasso = tracciaLato(yB, xL + mX, xR - mX, false);

  /** intersezione tra un lato verticale (x = a·y+b) e uno orizzontale (y = c·x+d) */
  const interseca = (vert: RettaLato, oriz: RettaLato): Punto | null => {
    const den = 1 - vert.a * oriz.a;
    if (Math.abs(den) < 0.05) return null;
    const x = (vert.a * oriz.b + vert.b) / den;
    const y = oriz.a * x + oriz.b;
    if (x < -w * 0.05 || x > w * 1.05 || y < -h * 0.05 || y > h * 1.05) return null;
    return { x, y };
  };

  const altoSx = interseca(latoSinistro, latoAlto);
  const altoDx = interseca(latoDestro, latoAlto);
  const bassoDx = interseca(latoDestro, latoBasso);
  const bassoSx = interseca(latoSinistro, latoBasso);
  if (!altoSx || !altoDx || !bassoDx || !bassoSx) return null;

  const minLato = 12;
  if (
    Math.hypot(altoDx.x - altoSx.x, altoDx.y - altoSx.y) < minLato ||
    Math.hypot(bassoSx.x - altoSx.x, bassoSx.y - altoSx.y) < minLato
  ) {
    return null;
  }

  const inImmagine = (q: Punto): Punto => ({ x: q.x / fattore, y: q.y / fattore });
  return { punti: [inImmagine(altoSx), inImmagine(altoDx), inImmagine(bassoDx), inImmagine(bassoSx)] };
}
