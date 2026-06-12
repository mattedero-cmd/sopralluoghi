import type { Punto } from '../db/types';

/**
 * Snap ai bordi/spigoli: cerca il punto di massimo gradiente (Sobel)
 * in un intorno del punto toccato. La luminanza viene calcolata una
 * sola volta per foto, su una versione ridotta per restare fluidi.
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
