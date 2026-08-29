import { describe, expect, it } from 'vitest';
import {
  maniglieDeiLatiQuad,
  quadConLato,
  quadConVertice,
  retteDeiLati,
  type Quad
} from '../ritaglio';
import { applicaOmografia, calcolaOmografia } from '../omografia';
import type { Punto } from '../../db/types';

/** un ritaglio già messo in prospettiva: un muro visto di sbieco */
const storto: Quad = [
  { x: 120, y: 90 },
  { x: 880, y: 40 },
  { x: 910, y: 520 },
  { x: 100, y: 470 }
];
/** e uno dritto, il caso del ritaglio semplice */
const dritto: Quad = [
  { x: 100, y: 100 },
  { x: 900, y: 100 },
  { x: 900, y: 600 },
  { x: 100, y: 600 }
];

const daRetta = (r: { a: number; b: number; c: number }, p: Punto) =>
  Math.abs(r.a * p.x + r.b * p.y + r.c);

describe('spostare un lato non tocca la prospettiva', () => {
  for (const [nome, quad] of [
    ['dritto', dritto],
    ['storto', storto]
  ] as Array<[string, Quad]>) {
    it(`${nome}: gli altri tre lati restano sulle loro rette`, () => {
      const prima = retteDeiLati(quad);
      for (const lato of [0, 1, 2, 3] as const) {
        // si prende la maniglia del lato e la si sposta verso il centro
        const man = maniglieDeiLatiQuad(quad)!;
        const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
        const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
        const dove = {
          x: man[lato].x + (cx - man[lato].x) * 0.3,
          y: man[lato].y + (cy - man[lato].y) * 0.3
        };
        const nuovo = quadConLato(quad, lato, dove)!;
        expect(nuovo).toBeTruthy();
        for (const altro of [0, 1, 2, 3]) {
          if (altro === lato) continue;
          // stessa retta: i due angoli del lato non spostato ci cadono sopra
          expect(daRetta(prima[altro], nuovo[altro])).toBeLessThan(0.01);
          expect(daRetta(prima[altro], nuovo[(altro + 1) % 4])).toBeLessThan(0.01);
        }
      }
    });

    it(`${nome}: il lato tirato passa per il dito`, () => {
      for (const lato of [0, 1, 2, 3] as const) {
        const man = maniglieDeiLatiQuad(quad)!;
        const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
        const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
        const dove = {
          x: man[lato].x + (cx - man[lato].x) * 0.4,
          y: man[lato].y + (cy - man[lato].y) * 0.4
        };
        const nuovo = quadConLato(quad, lato, dove)!;
        const r = retteDeiLati(nuovo)[lato];
        expect(daRetta(r, dove)).toBeLessThan(0.5);
      }
    });
  }

  it('la prospettiva è proprio la stessa: i punti di fuga non si muovono', () => {
    /** dove si incontrano due rette */
    const incrocio = (
      r: { a: number; b: number; c: number },
      s: { a: number; b: number; c: number }
    ) => {
      const d = r.a * s.b - s.a * r.b;
      if (Math.abs(d) < 1e-12) return null;
      return { x: (r.b * s.c - s.b * r.c) / d, y: (s.a * r.c - r.a * s.c) / d };
    };
    const prima = retteDeiLati(storto);
    const man = maniglieDeiLatiQuad(storto)!;
    const nuovo = quadConLato(storto, 1, { x: man[1].x - 200, y: man[1].y - 20 })!;
    const dopo = retteDeiLati(nuovo);
    // fuga orizzontale: incrocio del lato alto col basso
    const f1 = incrocio(prima[0], prima[2])!;
    const f2 = incrocio(dopo[0], dopo[2])!;
    expect(Math.hypot(f1.x - f2.x, f1.y - f2.y)).toBeLessThan(0.5);
  });

  it('spostare un angolo invece la cambia, ed è quello che deve fare', () => {
    const prima = retteDeiLati(storto);
    const nuovo = quadConVertice(storto, 1, { x: 820, y: 130 });
    // il lato alto non è più sulla sua retta: la prospettiva è cambiata
    expect(daRetta(prima[0], nuovo[1])).toBeGreaterThan(10);
  });

  it('il lato non può passare oltre quello opposto', () => {
    const man = maniglieDeiLatiQuad(dritto)!;
    // si tira il lato sinistro ben oltre il destro
    const nuovo = quadConLato(dritto, 3, { x: 2000, y: man[3].y })!;
    expect(nuovo[0].x).toBeLessThan(nuovo[1].x);
    expect(nuovo[1].x - nuovo[0].x).toBeGreaterThan(0);
  });

  it('le maniglie stanno a metà del lato IN PROSPETTIVA, non a metà schermo', () => {
    const man = maniglieDeiLatiQuad(storto)!;
    // sul quadrilatero storto la maniglia del lato alto non è la media dei
    // due angoli: sarebbe la metà sbagliata, e si vedrebbe scivolare
    const mediaSchermo = {
      x: (storto[0].x + storto[1].x) / 2,
      y: (storto[0].y + storto[1].y) / 2
    };
    const H = calcolaOmografia(storto, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ]);
    // la maniglia, riletta nel rettangolo, sta esattamente a 0,5
    const u = applicaOmografia(H, man[0]);
    expect(u.x).toBeCloseTo(0.5, 6);
    expect(u.y).toBeCloseTo(0, 6);
    // e quella «a metà schermo» no
    const v = applicaOmografia(H, mediaSchermo);
    expect(Math.abs(v.x - 0.5)).toBeGreaterThan(0.0005);
  });

  it('un quadrilatero degenere non fa esplodere niente', () => {
    const piatto: Quad = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 }
    ];
    expect(quadConLato(piatto, 0, { x: 5, y: 5 })).toBeNull();
    expect(maniglieDeiLatiQuad(piatto)).toBeNull();
  });
});
