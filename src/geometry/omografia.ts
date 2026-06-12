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

/** Distanza reale tra due punti immagine misurata sul piano */
export function distanzaSulPiano(H: Omografia, p1: Punto, p2: Punto): number {
  const a = applicaOmografia(H, p1);
  const b = applicaOmografia(H, p2);
  return Math.hypot(a.x - b.x, a.y - b.y);
}
