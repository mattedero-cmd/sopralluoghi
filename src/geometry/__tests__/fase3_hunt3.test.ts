import { describe, it, expect } from 'vitest';
import type { Punto, SegmentoQuota, VincoloPianta } from '../../db/types';
import { risolviGeom, type VincoloGeom } from '../solverGeom';
import { risolviPianta } from '../parametrico';

describe('HUNT3: parallel+perp collapse investigation', () => {
  it('shows the geometry when parallel+perp on same pair returns ok=true', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'fisso', a: 1, x: 100, y: 0 },
      { tipo: 'parallelo', a: 0, b: 1, c: 2, d: 3 },
      { tipo: 'perpendicolare', a: 0, b: 1, c: 2, d: 3 }
    ];
    const r = risolviGeom(punti, vincoli);
    const e2len = Math.hypot(r.punti[3].x - r.punti[2].x, r.punti[3].y - r.punti[2].y);
    console.log('COLLAPSE: ok', r.ok, 'residuo', r.residuo, 'e2 length', e2len);
    console.log('points', JSON.stringify(r.punti));
    // If the ONLY way to satisfy both is e2->0, then e2 collapses (degenerate polygon)
    // and yet ok=true would be a false-positive: a self-degenerate shape reported as valid.
  });

  it('REAL scenario via risolviPianta: parallel + perpendicular on the SAME edge pair', () => {
    // User applies both "parallelo lato 0-2" and "perpendicolare lato 0-2" through the UI.
    // Nothing in the UI prevents adding contradictory constraints on the same pair.
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const segmenti: SegmentoQuota[] = punti.map((_, i) => ({ da: i, a: (i + 1) % 4, valore: null }));
    const vincoli: VincoloPianta[] = [
      { id: 'p', tipo: 'parallelo', riferimenti: [{ entita: 'lato', indice: 0 }, { entita: 'lato', indice: 2 }] },
      { id: 'q', tipo: 'perpendicolare', riferimenti: [{ entita: 'lato', indice: 0 }, { entita: 'lato', indice: 2 }] }
    ];
    const r = risolviPianta(punti, segmenti, vincoli, 1);
    // edge 2 is vertices (2,3). Check its length after solving.
    const e2len = Math.hypot(r.punti[3].x - r.punti[2].x, r.punti[3].y - r.punti[2].y);
    console.log('risolviPianta parallel+perp: ok', r.ok, 'edge2 len', e2len, 'pts', JSON.stringify(r.punti));
    // With weak length preservation (peso 0.02) on edge 2, does it collapse or is it prevented?
  });
});

describe('HUNT3: ugualeLunghezza NOT scale-normalized vs parallelo/perp — tolerance interplay', () => {
  it('ugualeLunghezza residual (l1-l2) can dominate/interact with px tolerance', () => {
    // ugualeLunghezza residual is raw px (l1-l2). On a big figure the tol is capped at 4px.
    // Two edges differing by 3px would be reported ok even though "equal" is violated by 3px.
    // Is that acceptable? It's a length equality; 3px on a 1000px edge is 0.3% — fine.
    // But cross-check: could a genuinely-unequal pair (e.g. 100 vs 200) be falsely OK? No.
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 }
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'ugualeLunghezza', a: 0, b: 1, c: 1, d: 2 }
    ];
    const r = risolviGeom(punti, vincoli);
    const l1 = Math.hypot(r.punti[1].x - r.punti[0].x, r.punti[1].y - r.punti[0].y);
    const l2 = Math.hypot(r.punti[2].x - r.punti[1].x, r.punti[2].y - r.punti[1].y);
    console.log('ugualeLunghezza l1', l1, 'l2', l2, 'ok', r.ok);
    expect(Math.abs(l1 - l2)).toBeLessThan(4);
  });
});
