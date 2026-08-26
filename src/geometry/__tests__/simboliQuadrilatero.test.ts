import { describe, expect, it } from 'vitest';
import { simboliPoligono } from '../primitive';
import type { QuotaPoligono } from '../../db/types';

/**
 * BASE IN BASSO, ALTEZZA DI FIANCO. SEMPRE.
 *
 * Le foto di un sopralluogo si scattano dritte: il programma non deve
 * indovinare quale coppia di lati «sembra più parallela», né farsi guidare
 * dall'ordine in cui la forma è stata tracciata. I quattro angoli si mettono
 * in verso e i ruoli sono decisi.
 */

const base = {
  id: 'q1',
  fotoId: 'f1',
  zIndex: 0,
  stile: { colore: '#ffc400', spessore: 3, dimensioneTesto: 18 },
  tipo: 'quotaPoligono' as const,
  unita: 'cm' as const,
  stato: 'reale' as const
};

const forma = (
  punti: Array<[number, number]>,
  segmenti: Array<{ da: number; a: number; valore: number | null }>,
  extra: object = {}
): QuotaPoligono =>
  ({
    ...base,
    punti: punti.map(([x, y]) => ({ x, y })),
    segmenti,
    ...extra
  }) as unknown as QuotaPoligono;

/** rettangolo largo 200 e alto 100, tracciato in senso orario dall'alto-sx */
const RETTANGOLO: Array<[number, number]> = [
  [0, 0],
  [400, 0],
  [400, 200],
  [0, 200]
];

describe('simboli di un quadrilatero', () => {
  it('con quattro lati quotati: basi sopra e sotto, altezze di fianco', () => {
    const s = simboliPoligono(
      forma(RETTANGOLO, [
        { da: 0, a: 1, valore: 200 }, // sopra
        { da: 1, a: 2, valore: 100 }, // destra
        { da: 2, a: 3, valore: 200 }, // sotto
        { da: 3, a: 0, valore: 100 } // sinistra
      ])
    );
    expect(s).toEqual(['b', 'h', 'b', 'h']);
  });

  it('trapezio: le due altezze restano quelle di fianco, anche se più lunghe', () => {
    // base sopra 180, base sotto 200, fianchi 240 e 250: prima i fianchi
    // finivano per essere «le basi», perché erano la coppia più parallela
    const s = simboliPoligono(
      forma(
        [
          [20, 0],
          [380, 0],
          [400, 500],
          [0, 480]
        ],
        [
          { da: 0, a: 1, valore: 180 },
          { da: 1, a: 2, valore: 250 },
          { da: 2, a: 3, valore: 200 },
          { da: 3, a: 0, valore: 240 }
        ]
      )
    );
    // B = base maggiore (quella sotto), H = altezza maggiore (fianco destro)
    expect(s).toEqual(['b', 'H', 'B', 'h']);
  });

  it('non conta da dove è stata cominciata la forma', () => {
    // stesso rettangolo, tracciato partendo dal basso a destra in antiorario
    const s = simboliPoligono(
      forma(
        [
          [400, 200],
          [0, 200],
          [0, 0],
          [400, 0]
        ],
        [
          { da: 0, a: 1, valore: 200 }, // sotto
          { da: 1, a: 2, valore: 100 }, // sinistra
          { da: 2, a: 3, valore: 200 }, // sopra
          { da: 3, a: 0, valore: 100 } // destra
        ]
      )
    );
    expect(s).toEqual(['b', 'h', 'b', 'h']);
  });

  it('una forma alta e stretta ha comunque la base in basso', () => {
    const s = simboliPoligono(
      forma(
        [
          [0, 0],
          [100, 0],
          [100, 600],
          [0, 600]
        ],
        [
          { da: 0, a: 1, valore: 50 },
          { da: 1, a: 2, valore: 300 }
        ]
      )
    );
    // il lato corto in alto resta la base, quello lungo di fianco l'altezza
    expect(s).toEqual(['b', 'h']);
  });

  it('in prospettiva i ruoli non cambiano', () => {
    // finestra vista di sbieco: i due «orizzontali» sono inclinati
    const s = simboliPoligono(
      forma(
        [
          [30, 40],
          [420, 10],
          [430, 300],
          [20, 280]
        ],
        [
          { da: 0, a: 1, valore: 200 },
          { da: 1, a: 2, valore: 160 },
          { da: 2, a: 3, valore: 200 },
          { da: 3, a: 0, valore: 160 }
        ]
      )
    );
    expect(s).toEqual(['b', 'h', 'b', 'h']);
  });

  it('un simbolo scritto a mano comanda sempre', () => {
    const s = simboliPoligono(
      forma(RETTANGOLO, [
        { da: 0, a: 1, valore: 200 },
        { da: 1, a: 2, valore: 100 }
      ]).valueOf() as QuotaPoligono
    );
    expect(s[0]).toBe('b');
    const conSimbolo = simboliPoligono(
      forma(RETTANGOLO, [
        { da: 0, a: 1, valore: 200, simbolo: 'L' } as never,
        { da: 1, a: 2, valore: 100 }
      ])
    );
    expect(conSimbolo).toEqual(['L', 'h']);
  });

  it('il comando dedicato scambia i due ruoli, e solo quelli', () => {
    const s = simboliPoligono(
      forma(
        RETTANGOLO,
        [
          { da: 0, a: 1, valore: 200 },
          { da: 1, a: 2, valore: 100 },
          { da: 2, a: 3, valore: 210 },
          { da: 3, a: 0, valore: 100 }
        ],
        { simboliScambiati: true }
      )
    );
    // le due «basi» diventano altezze (e la maggiore prende la maiuscola)
    expect(s).toEqual(['h', 'b', 'H', 'b']);
  });

  it('le diagonali restano D e d', () => {
    const s = simboliPoligono(
      forma(RETTANGOLO, [
        { da: 0, a: 1, valore: 200 },
        { da: 1, a: 2, valore: 100 },
        { da: 0, a: 2, valore: 224 },
        { da: 1, a: 3, valore: 220 }
      ])
    );
    expect(s).toEqual(['b', 'h', 'D', 'd']);
  });
});
