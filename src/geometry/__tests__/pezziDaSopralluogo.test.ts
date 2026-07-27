import { describe, expect, it } from 'vitest';
import { pezziDaAnnotazioni, raggruppaPezzi } from '../pezziDaSopralluogo';
import type { Annotazione } from '../../db/types';

/** foto calibrata: 1 px = 1 cm, così le misure sono facili da leggere */
const FOTO = { scala: { px: 1, reale: 1, unita: 'cm' as const }, piano: null };

const base = {
  id: 'x',
  fotoId: 'f',
  zIndex: 0,
  colore: '#fff',
  spessore: 2
};

function rett(
  b: number | null,
  h: number | null,
  extra: Partial<Record<string, unknown>> = {}
): Annotazione {
  return {
    ...base,
    tipo: 'quotaRett',
    punti: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 }
    ],
    valoreBase: b,
    valoreAltezza: h,
    unita: 'cm',
    stato: 'reale',
    ...extra
  } as unknown as Annotazione;
}

function cerchio(valore: number, margine?: number, nota?: string): Annotazione {
  return {
    ...base,
    tipo: 'quotaRaggio',
    centro: { x: 50, y: 50 },
    bordo: { x: 80, y: 50 },
    modo: 'diametro',
    valore,
    unita: 'cm',
    stato: 'reale',
    margine,
    nota
  } as unknown as Annotazione;
}

function poligono(
  punti: Array<[number, number]>,
  segmenti?: Array<{ da: number; a: number; valore: number; abbInizio?: number; abbFine?: number }>
): Annotazione {
  return {
    ...base,
    tipo: 'quotaPoligono',
    punti: punti.map(([x, y]) => ({ x, y })),
    segmenti,
    unita: 'cm',
    stato: 'reale'
  } as unknown as Annotazione;
}

describe('pezziDaAnnotazioni', () => {
  it('un rettangolo diventa un pezzo con le sue misure, in millimetri', () => {
    const p = pezziDaAnnotazioni([rett(120, 60, { etichetta: '3' })], FOTO);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ larghezza: 1200, altezza: 600, quantita: 1 });
    expect(p[0].nome).toContain('3');
  });

  it('di un trapezio si prende l’ingombro: la base maggiore e il lato più lungo', () => {
    // base superiore 120, i punti danno una base inferiore più corta
    const q = rett(120, 60, {
      punti: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 80, y: 50 },
        { x: 20, y: 50 }
      ]
    });
    const p = pezziDaAnnotazioni([q], FOTO);
    expect(p[0].larghezza).toBe(1200); // la base maggiore
    expect(p[0].altezza).toBeGreaterThanOrEqual(600);
  });

  it('un cerchio diventa il quadrato del suo diametro', () => {
    const p = pezziDaAnnotazioni([cerchio(40)], FOTO);
    expect(p[0]).toMatchObject({ larghezza: 400, altezza: 400, conAbbondanze: false });
  });

  it('l’abbondanza del cerchio entra nel taglio, tutt’intorno', () => {
    const p = pezziDaAnnotazioni([cerchio(40, 2)], FOTO);
    // 40 + 2·2 = 44 cm
    expect(p[0]).toMatchObject({ larghezza: 440, altezza: 440, conAbbondanze: true });
  });

  it('un poligono diventa il suo ingombro reale', () => {
    const p = pezziDaAnnotazioni([poligono([[0, 0], [200, 0], [200, 100], [0, 100]])], FOTO);
    expect(p[0]).toMatchObject({ larghezza: 2000, altezza: 1000 });
  });

  it('le abbondanze dei lati allungano l’ingombro nel verso giusto', () => {
    // lato in basso (orizzontale) con 5+5 di abbondanza → più largo
    // lato a destra (verticale) con 3 di abbondanza → più alto
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[0, 0], [200, 0], [200, 100], [0, 100]],
          [
            { da: 0, a: 1, valore: 200, abbInizio: 5, abbFine: 5 },
            { da: 1, a: 2, valore: 100, abbInizio: 3 },
            { da: 2, a: 3, valore: 200 },
            { da: 3, a: 0, valore: 100 }
          ]
        )
      ],
      FOTO
    );
    expect(p[0].larghezza).toBe(2100); // 200 + 10 cm
    expect(p[0].altezza).toBe(1030); // 100 + 3 cm
    expect(p[0].conAbbondanze).toBe(true);
  });

  it('le diagonali quotate non allungano niente: non sono lati da tagliare', () => {
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[0, 0], [200, 0], [200, 100], [0, 100]],
          [{ da: 0, a: 2, valore: 220, abbInizio: 50, abbFine: 50 }]
        )
      ],
      FOTO
    );
    expect(p[0]).toMatchObject({ larghezza: 2000, altezza: 1000, conAbbondanze: false });
  });

  it('quote lineari, angoli e testi non sono pezzi', () => {
    const altro = [
      { ...base, tipo: 'quota', unita: 'cm', valore: 100 },
      { ...base, tipo: 'quotaAngolo', valore: 90, unita: 'cm' },
      { ...base, tipo: 'testo', testo: 'nota' }
    ] as unknown as Annotazione[];
    expect(pezziDaAnnotazioni(altro, FOTO)).toEqual([]);
  });

  it('una forma senza misure non diventa un pezzo a caso', () => {
    expect(pezziDaAnnotazioni([rett(null, null)], FOTO)).toEqual([]);
    expect(pezziDaAnnotazioni([cerchio(0)], FOTO)).toEqual([]);
  });

  it('senza calibrazione il poligono non produce misure inventate', () => {
    const p = pezziDaAnnotazioni([poligono([[0, 0], [200, 0], [200, 100]])], {
      scala: null,
      piano: null
    });
    expect(p).toEqual([]);
  });
});

describe('raggruppaPezzi', () => {
  it('somma i pezzi identici e lascia distinti quelli diversi', () => {
    const p = raggruppaPezzi([
      { nome: 'Anta', larghezza: 600, altezza: 400, quantita: 1, conAbbondanze: false },
      { nome: 'Anta', larghezza: 600, altezza: 400, quantita: 1, conAbbondanze: true },
      { nome: 'Anta', larghezza: 600, altezza: 500, quantita: 1, conAbbondanze: false },
      { nome: 'Fianco', larghezza: 600, altezza: 400, quantita: 2, conAbbondanze: false }
    ]);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ nome: 'Anta', altezza: 400, quantita: 2, conAbbondanze: true });
    expect(p[2]).toMatchObject({ nome: 'Fianco', quantita: 2 });
  });

  it('non altera la lista di partenza', () => {
    const uno = { nome: 'A', larghezza: 1, altezza: 1, quantita: 1, conAbbondanze: false };
    const lista = [uno, { ...uno }];
    raggruppaPezzi(lista);
    expect(lista[0].quantita).toBe(1);
  });
});
