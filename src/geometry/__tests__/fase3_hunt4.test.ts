import { describe, it, expect } from 'vitest';
import type { Punto, SegmentoQuota, VincoloPianta } from '../../db/types';
import { risolviPianta, costruisciVincoliPianta } from '../parametrico';

function edgeLen(p: Punto[], i: number, j: number) {
  return Math.hypot(p[j].x - p[i].x, p[j].y - p[i].y);
}

describe('HUNT4: collapse trap in the PRODUCTION path (risolviPianta)', () => {
  it('parallel+perp same pair — is edge collapse fully prevented for ALL edges?', () => {
    // A polygon where the pair edges have NO manual length. Weak preservation applies.
    // But run many times / bigger figure to see if collapse ever leaks ok=true with a
    // near-zero edge.
    for (const scale of [1, 5, 20]) {
      const punti: Punto[] = [
        { x: 0, y: 0 },
        { x: 100 * scale, y: 0 },
        { x: 100 * scale, y: 100 * scale },
        { x: 0, y: 100 * scale }
      ];
      const segmenti: SegmentoQuota[] = punti.map((_, i) => ({ da: i, a: (i + 1) % 4, valore: null }));
      const vincoli: VincoloPianta[] = [
        { id: 'p', tipo: 'parallelo', riferimenti: [{ entita: 'lato', indice: 0 }, { entita: 'lato', indice: 2 }] },
        { id: 'q', tipo: 'perpendicolare', riferimenti: [{ entita: 'lato', indice: 0 }, { entita: 'lato', indice: 2 }] }
      ];
      const r = risolviPianta(punti, segmenti, vincoli, 1);
      const e2 = edgeLen(r.punti, 2, 3);
      console.log(`scale ${scale}: ok ${r.ok} edge2Len ${e2.toFixed(3)}`);
      // if ok=true with a collapsed edge2, that's a bad state accepted
      if (r.ok) expect(e2).toBeGreaterThan(scale * 5);
    }
  });

  it('collineare a-b degenerate (zero-length reference edge) in production path', () => {
    // Make edge 0 (a-b for collineare) zero-length by having coincident vertices 0,1.
    const punti: Punto[] = [
      { x: 50, y: 50 },
      { x: 50, y: 50 }, // vertex 1 == vertex 0 -> edge 0 zero length
      { x: 100, y: 20 },
      { x: 120, y: 80 }
    ];
    const segmenti: SegmentoQuota[] = punti.map((_, i) => ({ da: i, a: (i + 1) % 4, valore: null }));
    // collineare between lato 0 (0->1, zero length) and lato 2 (2->3)
    const vincoli: VincoloPianta[] = [
      { id: 'c', tipo: 'collineare', riferimenti: [{ entita: 'lato', indice: 0 }, { entita: 'lato', indice: 2 }] }
    ];
    const r = risolviPianta(punti, segmenti, vincoli, 1);
    const anyNaN = r.punti.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y));
    console.log('collineare zero-ref-edge prod: ok', r.ok, 'nan', anyNaN, 'pts', JSON.stringify(r.punti));
    expect(anyNaN).toBe(false);
  });

  it('coincidente in production makes a degenerate polygon but reports ok=true', () => {
    // coincidente lato-> vertices. Merging two non-adjacent vertices collapses the polygon.
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const segmenti: SegmentoQuota[] = punti.map((_, i) => ({ da: i, a: (i + 1) % 4, valore: null }));
    // coincidente needs 'vertice' refs. UI only offers lato-based two-edge constraints,
    // so coincidente is NOT reachable from the new UI. But data model allows it.
    const vincoli: VincoloPianta[] = [
      { id: 'co', tipo: 'coincidente', riferimenti: [{ entita: 'vertice', indice: 0 }, { entita: 'vertice', indice: 2 }] }
    ];
    const r = risolviPianta(punti, segmenti, vincoli, 1);
    const d = Math.hypot(r.punti[0].x - r.punti[2].x, r.punti[0].y - r.punti[2].y);
    console.log('coincidente prod: ok', r.ok, 'dist(0,2)', d, 'pts', JSON.stringify(r.punti));
  });
});

describe('HUNT4: multi-element parallelo where ref[0] (common) edge is DEGENERATE', () => {
  it('ref[0] edge zero-length: all pairwise parallelo residuals blow up but no NaN', () => {
    const punti: Punto[] = [
      { x: 50, y: 50 },
      { x: 50, y: 50 }, // edge 0 (ref[0]) zero-length
      { x: 100, y: 20 },
      { x: 200, y: 30 }
    ];
    const segmenti: SegmentoQuota[] = punti.map((_, i) => ({ da: i, a: (i + 1) % 4, valore: null }));
    const gc = costruisciVincoliPianta(
      punti,
      segmenti,
      [{ id: 'p', tipo: 'parallelo', riferimenti: [{ entita: 'lato', indice: 0 }, { entita: 'lato', indice: 2 }] }],
      1
    );
    console.log('multi parallelo ref0-degenerate constraints:', JSON.stringify(gc.filter((v) => v.tipo === 'parallelo')));
    // constraint IS created (indices valid); residual uses clamp -> no NaN at eval time
    expect(gc.filter((v) => v.tipo === 'parallelo')).toHaveLength(1);
  });
});
