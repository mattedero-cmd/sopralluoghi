import type { PianoProspettiva, Punto } from '../db/types';

/**
 * Omografia 3x3 (row-major, h33 = 1) che mappa punti immagine →
 * coordinate reali sul piano di riferimento.
 */
export type Omografia = [number, number, number, number, number, number, number, number, number];

/**
 * DLT da 4 corrispondenze: risolve il sistema lineare 8x8 con
 * eliminazione di Gauss-Jordan a pivot parziale.
 * Lancia un errore se i punti sono degeneri (collineari/coincidenti).
 */
export function calcolaOmografia(sorgente: Punto[], destinazione: Punto[]): Omografia {
  if (sorgente.length !== 4 || destinazione.length !== 4) {
    throw new Error('Servono esattamente 4 corrispondenze di punti.');
  }
  // matrice aumentata 8x9
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = sorgente[i];
    const X = destinazione[i].x;
    const Y = destinazione[i].y;
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-9) {
      throw new Error('Punti del piano non validi: scegli 4 angoli ben distinti.');
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 9; c++) A[r][c] -= f * A[col][c];
    }
  }
  const h = A.map((riga, i) => riga[8] / riga[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applicaOmografia(H: Omografia, p: Punto): Punto {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 };
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w
  };
}

/**
 * Omografia del piano di riferimento: mappa l'immagine sul rettangolo
 * reale (0,0)-(L,0)-(L,A)-(0,A) nelle unità del piano.
 */
export function omografiaPiano(piano: PianoProspettiva): Omografia {
  const L = piano.larghezzaReale;
  const A = piano.altezzaReale;
  return calcolaOmografia(piano.punti, [
    { x: 0, y: 0 },
    { x: L, y: 0 },
    { x: L, y: A },
    { x: 0, y: A }
  ]);
}

/**
 * Omografia INVERSA del piano: mappa le coordinate reali (sul rettangolo
 * 0,0–L,A) di nuovo nei pixel dell'immagine. Serve per disegnare sull'immagine
 * elementi definiti in coordinate reali (es. la griglia di verifica).
 */
export function omografiaPianoInversa(piano: PianoProspettiva): Omografia {
  const L = piano.larghezzaReale;
  const A = piano.altezzaReale;
  return calcolaOmografia(
    [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: A },
      { x: 0, y: A }
    ],
    piano.punti
  );
}

/** Distanza reale tra due punti immagine misurata sul piano */
export function distanzaSulPiano(H: Omografia, p1: Punto, p2: Punto): number {
  const a = applicaOmografia(H, p1);
  const b = applicaOmografia(H, p2);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Omografia inversa: dal piano torna all'immagine (matrice aggiunta 3×3) */
export function invertiOmografia(H: Omografia): Omografia | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv: number[] = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d
  ];
  // si normalizza a h33 = 1, come tutte le omografie di casa
  const k = inv[8];
  if (!Number.isFinite(k) || Math.abs(k) < 1e-12) return null;
  return inv.map((v) => v / k) as Omografia;
}

/**
 * OMOGRAFIA AI MINIMI QUADRATI da N corrispondenze (N ≥ 4).
 *
 * Con quattro punti la soluzione è esatta e non c'è niente da scegliere; con
 * più punti — più forme quotate sulla stessa foto — nessuna omografia li
 * accontenta tutti, e si prende quella che sbaglia meno su tutti insieme.
 *
 * I punti si normalizzano prima (Hartley): baricentro nell'origine e distanza
 * media √2. Senza, un'immagine da quattro megapixel dà numeri da 10^12 nelle
 * equazioni normali e la soluzione si perde nell'arrotondamento.
 *
 * `pesi` (facoltativi) dicono quanto conta ogni corrispondenza: un riferimento
 * grande sulla foto è puntato meglio di uno piccolo.
 */
export function omografiaAiMinimiQuadrati(
  sorgente: Punto[],
  destinazione: Punto[],
  pesi?: number[]
): Omografia | null {
  const n = Math.min(sorgente.length, destinazione.length);
  if (n < 4) return null;
  const ns = normalizzaPunti(sorgente.slice(0, n));
  const nd = normalizzaPunti(destinazione.slice(0, n));
  if (!ns || !nd) return null;

  // equazioni normali 8×8 con h33 = 1 (dopo la normalizzazione è sempre lecito)
  const N: number[][] = Array.from({ length: 8 }, () => new Array(9).fill(0));
  const accumula = (riga: number[], termine: number, peso: number) => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) N[r][c] += peso * riga[r] * riga[c];
      N[r][8] += peso * riga[r] * termine;
    }
  };
  for (let i = 0; i < n; i++) {
    const { x, y } = ns.punti[i];
    const { x: X, y: Y } = nd.punti[i];
    const w = Math.max(1e-6, pesi?.[i] ?? 1);
    accumula([x, y, 1, 0, 0, 0, -X * x, -X * y], X, w);
    accumula([0, 0, 0, x, y, 1, -Y * x, -Y * y], Y, w);
  }
  const h = risolvi(N);
  if (!h) return null;

  // H = T_dest⁻¹ · H_norm · T_sorgente
  const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const H = prodotto(prodotto(nd.inversa, Hn), ns.diretta);
  if (!Number.isFinite(H[8]) || Math.abs(H[8]) < 1e-12) return null;
  return H.map((v) => v / H[8]) as Omografia;
}

/** normalizzazione di Hartley: baricentro in (0,0), distanza media √2 */
function normalizzaPunti(
  punti: Punto[]
): { punti: Punto[]; diretta: number[]; inversa: number[] } | null {
  const n = punti.length;
  const cx = punti.reduce((s, p) => s + p.x, 0) / n;
  const cy = punti.reduce((s, p) => s + p.y, 0) / n;
  const media = punti.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / n;
  if (!(media > 1e-12) || !Number.isFinite(media)) return null;
  const s = Math.SQRT2 / media;
  return {
    punti: punti.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })),
    diretta: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1],
    inversa: [1 / s, 0, cx, 0, 1 / s, cy, 0, 0, 1]
  };
}

/** prodotto di due matrici 3×3 in ordine di riga: incatena due omografie */
export function prodotto(A: number[], B: number[]): number[] {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[r * 3 + k] * B[k * 3 + c];
      C[r * 3 + c] = s;
    }
  }
  return C;
}

/** sistema 8×8 aumentato, per eliminazione di Gauss a pivot parziale */
function risolvi(A: number[][]): number[] | null {
  const n = A.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (!(Math.abs(A[pivot][col]) > 1e-12)) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  const x = A.map((riga, i) => riga[n] / riga[i]);
  return x.every((v) => Number.isFinite(v)) ? x : null;
}
