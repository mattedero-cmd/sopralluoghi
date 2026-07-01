import { describe, expect, it } from 'vitest';
import { risolviGeom, type VincoloGeom } from '../solverGeom';
import type { Punto } from '../../db/types';

const dist = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y);
function angolo(a: Punto, v: Punto, b: Punto): number {
  const ax = a.x - v.x;
  const ay = a.y - v.y;
  const bx = b.x - v.x;
  const by = b.y - v.y;
  let cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

describe('risolviGeom — vincolo di lunghezza', () => {
  it('porta un lato alla lunghezza richiesta mantenendo la direzione (soluzione più vicina)', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'lunghezza', a: 0, b: 1, valore: 150 }
    ];
    const r = risolviGeom(punti, vincoli);
    expect(r.ok).toBe(true);
    expect(dist(r.punti[0], r.punti[1])).toBeCloseTo(150, 2);
    expect(r.punti[1].y).toBeCloseTo(0, 1); // resta sull'asse (variazione minima)
  });
});

describe('risolviGeom — vincolo angolare', () => {
  it('impone un angolo di 120° al vertice', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'fisso', a: 1, x: 100, y: 0 },
      { tipo: 'angolo', a: 0, v: 1, b: 2, gradi: 120 }
    ];
    const r = risolviGeom(punti, vincoli);
    expect(r.ok).toBe(true);
    expect(angolo(r.punti[0], r.punti[1], r.punti[2])).toBeCloseTo(120, 0);
  });
});

describe('risolviGeom — rettangolo orizzontale/verticale, modifica un lato', () => {
  it('allungando il lato in alto, i vincoli H/V mantengono il rettangolo e la chiusura', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'orizzontale', a: 0, b: 1 },
      { tipo: 'verticale', a: 1, b: 2 },
      { tipo: 'orizzontale', a: 2, b: 3 },
      { tipo: 'verticale', a: 3, b: 0 },
      { tipo: 'lunghezza', a: 0, b: 1, valore: 200 } // top 100 → 200
    ];
    const r = risolviGeom(punti, vincoli);
    expect(r.ok).toBe(true);
    expect(dist(r.punti[0], r.punti[1])).toBeCloseTo(200, 1); // top
    expect(dist(r.punti[2], r.punti[3])).toBeCloseTo(200, 1); // bottom segue
    expect(dist(r.punti[1], r.punti[2])).toBeCloseTo(100, 1); // lati invariati
    // angoli retti conservati
    expect(angolo(r.punti[3], r.punti[0], r.punti[1])).toBeCloseTo(90, 0);
  });
});

describe('risolviGeom — diagonale che comanda la forma', () => {
  it('impostando la diagonale, un quadrato diventa un rombo coerente', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'lunghezza', a: 0, b: 1, valore: 100 },
      { tipo: 'lunghezza', a: 1, b: 2, valore: 100 },
      { tipo: 'lunghezza', a: 2, b: 3, valore: 100 },
      { tipo: 'lunghezza', a: 3, b: 0, valore: 100 },
      { tipo: 'lunghezza', a: 0, b: 2, valore: 120 } // diagonale (rombo)
    ];
    const r = risolviGeom(punti, vincoli);
    expect(r.ok).toBe(true);
    expect(dist(r.punti[0], r.punti[2])).toBeCloseTo(120, 1);
    // lati mantenuti a 100
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0]
    ]) {
      expect(dist(r.punti[a], r.punti[b])).toBeCloseTo(100, 1);
    }
  });
});

describe('risolviGeom — angolo con lati liberi non collassa i bracci', () => {
  it('vincolando un angolo, i bracci restano di lunghezza sensata (no collasso a zero)', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    // solo vincolo angolare al vertice 1, nessuna lunghezza: la regolarizzazione
    // tiene i bracci vicini all'iniziale invece di collassarli a zero
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'angolo', a: 0, v: 1, b: 2, gradi: 100 }
    ];
    const r = risolviGeom(punti, vincoli);
    expect(r.ok).toBe(true);
    expect(dist(r.punti[1], r.punti[0])).toBeGreaterThan(20); // braccio non collassato
    expect(dist(r.punti[1], r.punti[2])).toBeGreaterThan(20);
    expect(angolo(r.punti[0], r.punti[1], r.punti[2])).toBeCloseTo(100, 0);
  });
});

describe('risolviGeom — vincoli incompatibili', () => {
  it('lati che violano la disuguaglianza triangolare → ok=false', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'lunghezza', a: 0, b: 1, valore: 100 },
      { tipo: 'lunghezza', a: 1, b: 2, valore: 100 },
      { tipo: 'lunghezza', a: 0, b: 2, valore: 300 } // 100+100 < 300 impossibile
    ];
    const r = risolviGeom(punti, vincoli);
    expect(r.ok).toBe(false);
  });

  it('quadrato con tutti i lati bloccati e diagonale oltre il massimo → ok=false', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'lunghezza', a: 0, b: 1, valore: 100 },
      { tipo: 'lunghezza', a: 1, b: 2, valore: 100 },
      { tipo: 'lunghezza', a: 2, b: 3, valore: 100 },
      { tipo: 'lunghezza', a: 3, b: 0, valore: 100 },
      // con lati 100+100 la diagonale 0–2 non può superare 200: 250 è impossibile
      { tipo: 'lunghezza', a: 0, b: 2, valore: 250 }
    ];
    const r = risolviGeom(punti, vincoli);
    expect(r.ok).toBe(false);
  });
});
