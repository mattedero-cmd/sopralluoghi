import type { Punto } from '../db/types';

/**
 * RISOLUTORE GEOMETRICO (§10) — il motore parametrico del Menu Pianta.
 *
 * Le incognite sono le COORDINATE dei vertici (2 per vertice); ogni vincolo/
 * quota è un'equazione di residuo r(x)=0. Si minimizza Σ r² con
 * Levenberg–Marquardt (Gauss–Newton smorzato), Jacobiano numerico. Una debole
 * regolarizzazione verso le posizioni iniziali rende il sistema sempre
 * risolvibile e sceglie la soluzione PIÙ VICINA a quella corrente (variazione
 * minima), così modificando una quota il disegno si adatta senza stravolgersi.
 *
 * Gestisce quote/vincoli NON lineari (distanza tra due vertici qualsiasi,
 * angolo tra due lati) che il modello a lati orientati non può risolvere.
 * Se i vincoli sono incompatibili non converge: `ok=false` (il chiamante
 * avvisa, senza deformare male il disegno).
 */

const GRADI = Math.PI / 180;

export type VincoloGeom =
  /** distanza |Vb − Va| = valore (lato o diagonale) */
  | { tipo: 'lunghezza'; a: number; b: number; valore: number; peso?: number }
  /** angolo (in gradi) a–v–b al vertice v */
  | { tipo: 'angolo'; a: number; v: number; b: number; gradi: number; peso?: number }
  /** lato a→b orizzontale (stessa y) */
  | { tipo: 'orizzontale'; a: number; b: number; peso?: number }
  /** lato a→b verticale (stessa x) */
  | { tipo: 'verticale'; a: number; b: number; peso?: number }
  /** vertice a bloccato nella posizione (x,y) */
  | { tipo: 'fisso'; a: number; x: number; y: number; peso?: number };

export interface EsitoGeom {
  punti: Punto[];
  ok: boolean;
  /** norma dei residui dei vincoli "veri" (esclusa la regolarizzazione) */
  residuo: number;
  iterazioni: number;
}

export interface OpzioniSolver {
  maxIter?: number;
  /** tolleranza sui residui dei vincoli, in px (default: da estensione figura) */
  tolleranza?: number;
  /** peso della regolarizzazione verso le posizioni iniziali */
  regolarizzazione?: number;
}

// ---------------------------------------------------------------------------
// Residui dei vincoli
// ---------------------------------------------------------------------------

function pesoDi(v: VincoloGeom): number {
  return v.peso ?? 1;
}

/** Valuta i residui "veri" (uno o due per vincolo) dato lo stato x (coord appiattite). */
function residuiVincoli(x: number[], vincoli: VincoloGeom[]): number[] {
  const r: number[] = [];
  const px = (i: number) => x[2 * i];
  const py = (i: number) => x[2 * i + 1];
  for (const v of vincoli) {
    const w = Math.sqrt(pesoDi(v));
    if (v.tipo === 'lunghezza') {
      const dx = px(v.b) - px(v.a);
      const dy = py(v.b) - py(v.a);
      r.push((Math.hypot(dx, dy) - v.valore) * w);
    } else if (v.tipo === 'orizzontale') {
      r.push((py(v.b) - py(v.a)) * w);
    } else if (v.tipo === 'verticale') {
      r.push((px(v.b) - px(v.a)) * w);
    } else if (v.tipo === 'fisso') {
      r.push((px(v.a) - v.x) * w);
      r.push((py(v.a) - v.y) * w);
    } else if (v.tipo === 'angolo') {
      const ax = px(v.a) - px(v.v);
      const ay = py(v.a) - py(v.v);
      const bx = px(v.b) - px(v.v);
      const by = py(v.b) - py(v.v);
      // denominatori con clamp anti-divisione-per-zero: NON si forza il residuo
      // a 0 (direbbe "vincolo soddisfatto" anche con un braccio collassato)
      const la = Math.max(Math.hypot(ax, ay), 1e-9);
      const lb = Math.max(Math.hypot(bx, by), 1e-9);
      let cos = (ax * bx + ay * by) / (la * lb);
      cos = Math.max(-1, Math.min(1, cos));
      const ang = Math.acos(cos); // [0, π] (angolo non orientato)
      r.push((ang - v.gradi * GRADI) * w);
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Algebra lineare (sistema normale)
// ---------------------------------------------------------------------------

/** Risolve M·x = b (Gauss-Jordan, pivot parziale). Null se singolare. */
function risolviSistema(M: number[][], b: number[]): number[] | null {
  const m = M.length;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let c = col; c <= m; c++) A[col][c] /= d;
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let c = col; c <= m; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row) => row[m]);
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

function estensione(punti: Punto[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of punti) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Math.max(maxX - minX, maxY - minY, 1);
}

/**
 * Risolve la geometria: parte dai vertici correnti, applica i vincoli e
 * restituisce i nuovi vertici. `ok=false` se i vincoli non sono soddisfacibili.
 */
export function risolviGeom(
  puntiIniziali: Punto[],
  vincoli: VincoloGeom[],
  opts: OpzioniSolver = {}
): EsitoGeom {
  const n = puntiIniziali.length;
  const N = 2 * n;
  const maxIter = opts.maxIter ?? 80;
  const ext = estensione(puntiIniziali);
  // "convergiuto" = vincoli soddisfatti entro ~mezzo pixel o 0.05% dell'estensione,
  // MA con un tetto assoluto (4 px): su piante molto grandi non si accettano
  // scostamenti crescenti con la dimensione. Sopra soglia = incompatibili → ok=false.
  const tol = opts.tolleranza ?? Math.min(4, Math.max(0.5, ext * 5e-4));
  // regolarizzazione: molla DEBOLE verso la posizione iniziale di ogni coord
  // (risolve l'ambiguità dei gradi di libertà residui scegliendo la soluzione
  // più vicina, senza impedire ai vincoli di essere soddisfatti)
  const reg = opts.regolarizzazione ?? 1e-3;

  const x0 = new Array<number>(N);
  for (let i = 0; i < n; i++) {
    x0[2 * i] = puntiIniziali[i].x;
    x0[2 * i + 1] = puntiIniziali[i].y;
  }

  // residui completi = vincoli veri + regolarizzazione (x - x0)*reg
  const residuiCompleti = (x: number[]): number[] => {
    const rv = residuiVincoli(x, vincoli);
    for (let k = 0; k < N; k++) rv.push((x[k] - x0[k]) * reg);
    return rv;
  };

  let x = x0.slice();
  let lambda = 1e-3;
  const eps = Math.max(1e-6, ext * 1e-7);
  let iter = 0;
  let costo = sommaQuadrati(residuiCompleti(x));
  for (; iter < maxIter; iter++) {
    const r = residuiCompleti(x);
    const m = r.length;
    // Jacobiano numerico (differenze in avanti): m righe × N colonne
    const J: number[][] = Array.from({ length: m }, () => new Array<number>(N).fill(0));
    for (let c = 0; c < N; c++) {
      const xp = x.slice();
      xp[c] += eps;
      const rp = residuiCompleti(xp);
      for (let rr = 0; rr < m; rr++) J[rr][c] = (rp[rr] - r[rr]) / eps;
    }
    // sistema normale (JᵀJ + λ·diag(JᵀJ)) Δ = −Jᵀr
    const JtJ: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
    const Jtr = new Array<number>(N).fill(0);
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        let s = 0;
        for (let rr = 0; rr < m; rr++) s += J[rr][a] * J[rr][b];
        JtJ[a][b] = s;
      }
      let g = 0;
      for (let rr = 0; rr < m; rr++) g += J[rr][a] * r[rr];
      Jtr[a] = g;
    }
    const A = JtJ.map((row, i) => row.map((val, j) => (i === j ? val + lambda * (val + 1e-9) : val)));
    const delta = risolviSistema(
      A,
      Jtr.map((g) => -g)
    );
    if (!delta) {
      lambda *= 4;
      if (lambda > 1e12) break;
      continue;
    }
    const xNuovo = x.map((v, k) => v + delta[k]);
    const costoNuovo = sommaQuadrati(residuiCompleti(xNuovo));
    if (costoNuovo < costo) {
      // passo accettato
      const passo = Math.hypot(...delta);
      x = xNuovo;
      costo = costoNuovo;
      lambda = Math.max(1e-9, lambda * 0.6);
      if (passo < eps) {
        iter++;
        break;
      }
    } else {
      lambda *= 3;
      if (lambda > 1e12) break;
    }
  }

  const punti = puntiIniziali.map((_, i) => ({ x: x[2 * i], y: x[2 * i + 1] }));
  // residuo dei soli vincoli HARD (peso ≥ 0.5): i vincoli DEBOLI (preservazione
  // della forma, peso piccolo) partecipano all'ottimizzazione ma non decidono
  // se la modifica è "possibile" — altrimenti bloccherebbero ok anche quando
  // cedono legittimamente al vincolo forte
  const rv = residuiVincoli(
    x,
    vincoli.filter((v) => (v.peso ?? 1) >= 0.5)
  );
  const residuo = Math.sqrt(sommaQuadrati(rv));
  return { punti, ok: residuo <= tol, residuo, iterazioni: iter };
}

function sommaQuadrati(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return s;
}
