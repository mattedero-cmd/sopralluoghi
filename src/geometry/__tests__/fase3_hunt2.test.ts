import { describe, it, expect } from 'vitest';
import type { Punto } from '../../db/types';
import { risolviGeom, type VincoloGeom } from '../solverGeom';

function edgeAngle(a: Punto, b: Punto) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

describe('HUNT2: parallelo residual asymmetry (l1 = FIRST edge only)', () => {
  it('parallelo where the FIRST (reference) edge is SHORT and second is LONG', () => {
    // In costruisciVincoliPianta multi-element expansion, ref[0] edge is e1 (a,b).
    // Residual = cross(e1,e2)/|e1|. If |e1| is small, residual is amplified.
    // 30-degrees-off should still be rejected (good). But does an ALREADY parallel
    // pair with a tiny e1 get falsely rejected due to numerical noise? test both.
    // Case A: e1 short (10 px), e2 long (1000 px), 30deg off => should NOT be ok/parallel-accepted
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 }, // e1 short horizontal
      { x: 0, y: 500 },
      { x: 1000 * Math.cos((30 * Math.PI) / 180), y: 500 + 1000 * Math.sin((30 * Math.PI) / 180) }
    ];
    const e1x = 10, e1y = 0;
    const e2x = punti[3].x - punti[2].x, e2y = punti[3].y - punti[2].y;
    const l1 = Math.hypot(e1x, e1y);
    const rawRes = (e1x * e2y - e1y * e2x) / l1;
    console.log('short-e1 30deg parallelo raw residual (px):', rawRes, '(huge -> good, gets corrected)');

    // Case B: e1 short, e2 long, ALREADY parallel => residual should be ~0
    const punti2: Punto[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 500 },
      { x: 1000, y: 500 }
    ];
    const e2x2 = 1000, e2y2 = 0;
    const rawRes2 = (e1x * e2y2 - e1y * e2x2) / l1;
    console.log('short-e1 parallel(ok) raw residual (px):', rawRes2, '(should be ~0)');
    expect(Math.abs(rawRes2)).toBeLessThan(0.5);
  });

  it('perpendicolare where FIRST edge SHORT, second LONG, and they ARE perpendicular', () => {
    // dot/|e1|. e1 short (10), e2 long (1000), perpendicular => dot=0 => residual 0
    const e1x = 10, e1y = 0, e2x = 0, e2y = 1000;
    const l1 = Math.hypot(e1x, e1y);
    const res = (e1x * e2x + e1y * e2y) / l1;
    console.log('short-e1 perp(ok) residual:', res);
    expect(Math.abs(res)).toBeLessThan(0.5);
  });

  it('perpendicolare short-e1 long-e2, off by a small angle => residual amplified by long e2', () => {
    // e2 = 1000 long, tilted 1 degree off perpendicular. dot = |e1||e2|sin(1deg)
    // = 10*1000*0.01745 = 174.5, /|e1|=10 => 17.45 px. 1 degree off flagged? yes.
    const deg = 1;
    const e1x = 10, e1y = 0;
    const e2x = 1000 * Math.sin((deg * Math.PI) / 180);
    const e2y = 1000 * Math.cos((deg * Math.PI) / 180);
    const l1 = Math.hypot(e1x, e1y);
    const res = (e1x * e2x + e1y * e2y) / l1;
    console.log('perp 1deg-off, short-e1 long-e2 residual:', res);
    // This over-sensitivity: 1 degree off a 1000px edge scaled by the SHORT 10px edge
    // gives a big residual. It's numerically conservative (rejects), not a false OK.
    expect(res).toBeGreaterThan(4);
  });
});

describe('HUNT2: collineare with degenerate c-d and normalization by a-b', () => {
  it('collineare residual uses a-b as the LINE; if a-b tiny but c-d far => big residual', () => {
    // a-b is the reference line. If a-b is near-zero, lab clamps to 1e-9 and the
    // perpendicular distance blows up -> residual huge -> solver forced to act.
    const punti: Punto[] = [
      { x: 50, y: 50 },
      { x: 50.0001, y: 50 }, // a-b nearly zero (0.0001 px)
      { x: 20, y: 10 },
      { x: 80, y: 90 }
    ];
    const vincoli: VincoloGeom[] = [{ tipo: 'collineare', a: 0, b: 1, c: 2, d: 3 }];
    const r = risolviGeom(punti, vincoli);
    const anyNaN = r.punti.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y));
    console.log('tiny-ab collineare ok', r.ok, 'residuo', r.residuo, 'nan', anyNaN);
    expect(anyNaN).toBe(false);
  });
});

describe('HUNT2: unsatisfiable returns ok=false WITHOUT garbage/NaN', () => {
  it('parallel + perpendicular on same pair => impossible, no NaN', () => {
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
    const anyNaN = r.punti.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y));
    console.log('parallel+perp same pair ok', r.ok, 'nan', anyNaN);
    expect(anyNaN).toBe(false);
    expect(r.ok).toBe(false);
  });
});

describe('HUNT2: does parallelo have a DEGENERATE-solution trap (collapse e2 to zero)?', () => {
  it('parallelo residual is ALSO zero when e2 collapses to a point (cross=0)', () => {
    // KEY: cross(e1,e2)=0 not just when parallel, but also when e2 is ZERO length.
    // With only weak length preservation on that edge, could the solver satisfy
    // 'parallelo' by SHRINKING e2 to near-zero instead of rotating it?
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }, // e1 horizontal, FIXED
      { x: 200, y: 50 },
      { x: 200, y: 150 } // e2 = (0,100) vertical -> NOT parallel to e1
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'fisso', a: 1, x: 100, y: 0 },
      { tipo: 'fisso', a: 2, x: 200, y: 50 }, // fix c so only d can move
      { tipo: 'parallelo', a: 0, b: 1, c: 2, d: 3 },
      // weak length preservation like costruisciVincoliPianta adds
      { tipo: 'lunghezza', a: 2, b: 3, valore: 100, peso: 0.02 }
    ];
    const r = risolviGeom(punti, vincoli);
    const e2len = Math.hypot(r.punti[3].x - r.punti[2].x, r.punti[3].y - r.punti[2].y);
    console.log('parallelo-collapse-test e2 length after', e2len, 'angle', edgeAngle(r.punti[2], r.punti[3]), 'ok', r.ok);
    // if the solver collapsed e2 to satisfy parallelo cheaply, e2len ~ 0 => BUG
    expect(e2len).toBeGreaterThan(10);
  });

  it('perpendicolare residual is ALSO zero when e2 collapses (dot=0)', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }, // e1 horizontal FIXED
      { x: 200, y: 50 },
      { x: 300, y: 50 } // e2 = (100,0) horizontal -> parallel, need perpendicular
    ];
    const vincoli: VincoloGeom[] = [
      { tipo: 'fisso', a: 0, x: 0, y: 0 },
      { tipo: 'fisso', a: 1, x: 100, y: 0 },
      { tipo: 'fisso', a: 2, x: 200, y: 50 },
      { tipo: 'perpendicolare', a: 0, b: 1, c: 2, d: 3 },
      { tipo: 'lunghezza', a: 2, b: 3, valore: 100, peso: 0.02 }
    ];
    const r = risolviGeom(punti, vincoli);
    const e2len = Math.hypot(r.punti[3].x - r.punti[2].x, r.punti[3].y - r.punti[2].y);
    console.log('perp-collapse-test e2 length after', e2len, 'angle', edgeAngle(r.punti[2], r.punti[3]), 'ok', r.ok);
    expect(e2len).toBeGreaterThan(10);
  });
});
