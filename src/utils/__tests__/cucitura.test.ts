import { describe, expect, it } from 'vitest';
import { affineFraTriangoli, erroreDellaGriglia, grigliaAdatta, inScalaPiena } from '../cucitura';
import { applicaOmografia, type Omografia } from '../../geometry/omografia';

describe('l’affine fra due triangoli', () => {
  it('riporta i tre vertici esattamente al loro posto', () => {
    const s: [number, number][] = [
      [0, 0],
      [100, 0],
      [0, 80]
    ];
    const d: [number, number][] = [
      [15, 7],
      [122, 31],
      [3, 96]
    ];
    const m = affineFraTriangoli(s, d)!;
    expect(m).toBeTruthy();
    const applica = ([x, y]: [number, number]) => [
      m[0] * x + m[2] * y + m[4],
      m[1] * x + m[3] * y + m[5]
    ];
    s.forEach((p, i) => {
      const q = applica(p);
      expect(q[0]).toBeCloseTo(d[i][0], 6);
      expect(q[1]).toBeCloseTo(d[i][1], 6);
    });
  });

  it('un triangolo degenere non dà un’affine', () => {
    expect(
      affineFraTriangoli(
        [
          [0, 0],
          [10, 10],
          [20, 20]
        ],
        [
          [0, 0],
          [1, 0],
          [0, 1]
        ]
      )
    ).toBeNull();
  });
});

describe('l’omografia trovata sulle immagini ridotte', () => {
  /** una prospettiva qualunque, ma non degenere */
  const H: Omografia = [1.04, 0.03, -18, -0.02, 1.01, 9, 0.00012, 0.00004, 1];

  it('vale alla scala piena come valeva a quella ridotta', () => {
    const k = 0.35;
    const piena = inScalaPiena(H, k, k);
    for (const p of [
      { x: 0, y: 0 },
      { x: 1200, y: 300 },
      { x: 640, y: 900 },
      { x: 2400, y: 1600 }
    ]) {
      // il punto ridotto, mappato e riportato su: deve dare lo stesso punto
      const perLaVia = applicaOmografia(H, { x: p.x * k, y: p.y * k });
      const diretto = applicaOmografia(piena, p);
      expect(diretto.x).toBeCloseTo(perLaVia.x / k, 6);
      expect(diretto.y).toBeCloseTo(perLaVia.y / k, 6);
    }
  });

  it('tiene conto di due riduzioni diverse', () => {
    const ks = 0.4;
    const kd = 0.25;
    const piena = inScalaPiena(H, ks, kd);
    const p = { x: 900, y: 500 };
    const atteso = applicaOmografia(H, { x: p.x * ks, y: p.y * ks });
    const q = applicaOmografia(piena, p);
    expect(q.x).toBeCloseTo(atteso.x / kd, 6);
    expect(q.y).toBeCloseTo(atteso.y / kd, 6);
  });

  it('senza riduzione non cambia niente', () => {
    const uguale = inScalaPiena(H, 1, 1);
    uguale.forEach((v, i) => expect(v).toBeCloseTo(H[i], 9));
  });
});


describe('la griglia di triangoli approssima la prospettiva', () => {
  /** una prospettiva marcata: 20° di rotazione su uno scatto da 12 Mpx */
  const H: Omografia = [1.18, 0.04, -260, 0.02, 1.09, -120, 0.00019, 0.00003, 1];
  const W = 4000;
  const A = 3000;

  it('MISURA: quanto sbaglia al variare della griglia', () => {
    for (const [cx, cy] of [
      [4, 3],
      [8, 6],
      [12, 8],
      [16, 12],
      [28, 20]
    ]) {
      const e = erroreDellaGriglia(W, A, H, cx, cy);
      console.log(`griglia ${cx}×${cy}: errore massimo ${e.toFixed(3)} px`);
    }
  });

  it('la griglia si infittisce finché l’errore scende sotto il terzo di pixel', () => {
    const g = grigliaAdatta(W, A, H);
    console.log(`prospettiva marcata → griglia ${g.x}×${g.y}, errore ${g.errore.toFixed(3)} px`);
    expect(g.errore).toBeLessThan(0.35);
    expect(erroreDellaGriglia(W, A, H, g.x, g.y)).toBe(g.errore);
  });

  it('una prospettiva blanda si accontenta di poche celle', () => {
    // due scatti quasi allineati: la deformazione è quasi una traslazione
    const blanda: Omografia = [1.01, 0.004, -40, -0.003, 1.005, 12, 0.000012, 0.000004, 1];
    const g = grigliaAdatta(W, A, blanda);
    console.log(`prospettiva blanda → griglia ${g.x}×${g.y}, errore ${g.errore.toFixed(3)} px`);
    expect(g.x).toBeLessThanOrEqual(16);
  });

  it('una griglia grossolana invece si vede', () => {
    expect(erroreDellaGriglia(W, A, H, 2, 2)).toBeGreaterThan(1);
  });
});
