import { describe, expect, it } from 'vitest';
import { maniglieDeiLati, pianoConLato, pianoConVertice } from '../pianoModifica';
import { applicaOmografia, invertiOmografia, omografiaPiano } from '../omografia';
import type { PianoProspettiva, Punto } from '../../db/types';

/** una parete di 4 × 2,6 m ripresa di tre quarti */
const piano: PianoProspettiva = {
  punti: [
    { x: 120, y: 240 },
    { x: 1060, y: 380 },
    { x: 1040, y: 900 },
    { x: 150, y: 830 }
  ],
  larghezzaReale: 4000,
  altezzaReale: 2600,
  unita: 'mm',
  celle: 4
};

/** quanto misura, secondo il piano, il segmento fra due punti della foto */
const misura = (p: PianoProspettiva, a: Punto, b: Punto) => {
  const H = omografiaPiano(p);
  const x = applicaOmografia(H, a);
  const y = applicaOmografia(H, b);
  return Math.hypot(y.x - x.x, y.y - x.y);
};

/** tre segmenti sparsi sulla foto: se non cambiano, la prospettiva è la stessa */
const provini: Array<[Punto, Punto]> = [
  [{ x: 300, y: 400 }, { x: 700, y: 450 }],
  [{ x: 400, y: 300 }, { x: 420, y: 800 }],
  [{ x: 800, y: 500 }, { x: 950, y: 700 }]
];

describe('tirare un lato', () => {
  it('allarga il riquadro senza toccare la prospettiva', () => {
    const prima = provini.map(([a, b]) => misura(piano, a, b));
    // si prende la maniglia del lato destro e la si porta più in là
    const maniglia = maniglieDeiLati(piano)[1];
    const tirato = pianoConLato(piano, 1, { x: maniglia.x + 260, y: maniglia.y + 30 })!;
    expect(tirato).toBeTruthy();
    // il riquadro è cresciuto…
    expect(tirato.larghezzaReale).toBeGreaterThan(piano.larghezzaReale);
    expect(tirato.altezzaReale).toBeCloseTo(piano.altezzaReale, 6);
    // …e ogni misura è rimasta identica, al millesimo
    provini.forEach(([a, b], i) => {
      expect(misura(tirato, a, b)).toBeCloseTo(prima[i], 3);
    });
  });

  it('vale per tutti e quattro i lati, anche tirando all’indietro', () => {
    for (const lato of [0, 1, 2, 3] as const) {
      const m = maniglieDeiLati(piano)[lato];
      // in fuori e in dentro, lungo la diagonale: basta che il piano regga
      for (const spinta of [120, -80]) {
        const verso = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] }[lato];
        const nuovo = pianoConLato(piano, lato, {
          x: m.x + verso[0] * spinta,
          y: m.y + verso[1] * spinta
        });
        expect(nuovo).toBeTruthy();
        provini.forEach(([a, b]) => {
          expect(misura(nuovo!, a, b)).toBeCloseTo(misura(piano, a, b), 3);
        });
      }
    }
  });

  it('il riquadro non può sparire né gonfiarsi all’infinito', () => {
    const m = maniglieDeiLati(piano)[1];
    // tirato tutto indietro, oltre il lato sinistro: resta un decimo
    const strizzato = pianoConLato(piano, 1, { x: piano.punti[0].x - 500, y: m.y })!;
    expect(strizzato.larghezzaReale).toBeCloseTo(piano.larghezzaReale * 0.1, 6);
    // e la prospettiva è ancora quella
    provini.forEach(([a, b]) => {
      expect(misura(strizzato, a, b)).toBeCloseTo(misura(piano, a, b), 3);
    });
  });

  it('un punto oltre l’orizzonte non allarga niente', () => {
    // l'orizzonte del piano: la riga w = 0 dell'omografia
    const H = omografiaPiano(piano);
    const suOrizzonte = (x: number) => ({ x, y: -(H[6] * x + H[8]) / H[7] });
    expect(pianoConLato(piano, 1, suOrizzonte(600))).toBeNull();
  });
});

describe('spostare un vertice', () => {
  it('cambia la prospettiva e tiene le misure reali del riquadro', () => {
    const nuovo = pianoConVertice(piano, 1, { x: 1120, y: 330 })!;
    expect(nuovo).toBeTruthy();
    expect(nuovo.larghezzaReale).toBe(piano.larghezzaReale);
    expect(nuovo.altezzaReale).toBe(piano.altezzaReale);
    // ora la foto si legge diversamente: è proprio quello che serve
    const cambiata = provini.some(
      ([a, b]) => Math.abs(misura(nuovo, a, b) - misura(piano, a, b)) > 1
    );
    expect(cambiata).toBe(true);
  });

  it('gli altri tre vertici restano dove sono', () => {
    const nuovo = pianoConVertice(piano, 2, { x: 1000, y: 950 })!;
    expect(nuovo.punti[0]).toEqual(piano.punti[0]);
    expect(nuovo.punti[1]).toEqual(piano.punti[1]);
    expect(nuovo.punti[3]).toEqual(piano.punti[3]);
  });

  it('un quadrilatero degenere si rifiuta', () => {
    // il vertice portato sopra un altro: tre punti in fila, niente omografia
    expect(pianoConVertice(piano, 1, { ...piano.punti[0] })).toBeNull();
    expect(pianoConVertice(piano, 9, { x: 0, y: 0 })).toBeNull();
  });
});

describe('le maniglie', () => {
  it('stanno a metà di ogni lato', () => {
    const m = maniglieDeiLati(piano);
    expect(m).toHaveLength(4);
    expect(m[0].x).toBeCloseTo((piano.punti[0].x + piano.punti[1].x) / 2, 6);
    expect(m[3].y).toBeCloseTo((piano.punti[3].y + piano.punti[0].y) / 2, 6);
  });
});

describe('le forme del sopralluogo non si muovono', () => {
  it('allargare o correggere il piano non tocca i pixel di una forma', () => {
    // una forma è fatta di punti sulla FOTO: la calibrazione non li sposta
    const forma = [
      { x: 400, y: 500 },
      { x: 600, y: 520 },
      { x: 600, y: 700 },
      { x: 400, y: 680 }
    ];
    const copia = forma.map((p) => ({ ...p }));
    pianoConLato(piano, 1, { x: 1300, y: 640 });
    pianoConVertice(piano, 1, { x: 1120, y: 330 });
    expect(forma).toEqual(copia);
    // e il piano di partenza non è stato modificato di nascosto
    expect(piano.larghezzaReale).toBe(4000);
    expect(invertiOmografia(omografiaPiano(piano))).toBeTruthy();
  });
});
