import { describe, expect, it } from 'vitest';
import { diagnosiPezzi, pezziDaAnnotazioni, raggruppaPezzi } from '../pezziDaSopralluogo';
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
    // l'abbondanza da 100 cm sulla diagonale non entra da nessuna parte:
    // l'ingombro resta quello del rettangolo 200×100, in scala sulla diagonale
    expect(p[0].conAbbondanze).toBe(false);
    expect(p[0].larghezza).toBeGreaterThan(1900);
    expect(p[0].larghezza).toBeLessThan(2010);
    expect(p[0].altezza).toBeLessThan(1010);
  });

  it('vale la misura scritta, non come la forma è stata disegnata', () => {
    // rettangolo tracciato a mano su una foto: i vertici non sono perfetti,
    // ma il pezzo è b 140 · h 220 con +2 e +2 di lato e +10 sotto = 144 × 230
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[3, 1], [402, 6], [399, 622], [0, 618]],
          [
            { da: 0, a: 1, valore: 140, abbInizio: 2, abbFine: 2 },
            { da: 1, a: 2, valore: 220, abbFine: 10 }
          ]
        )
      ],
      FOTO
    );
    expect(p[0]).toMatchObject({ larghezza: 1440, altezza: 2300, conAbbondanze: true });
  });

  it('un triangolo si taglia appoggiato sul lato più lungo', () => {
    // 3-4-5: appoggiato sul 5 è alto 2,4
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[0, 0], [500, 0], [0, 300]],
          [
            { da: 0, a: 1, valore: 40 },
            { da: 1, a: 2, valore: 50 },
            { da: 2, a: 0, valore: 30 }
          ]
        )
      ],
      FOTO
    );
    expect(p[0]).toMatchObject({ larghezza: 500, altezza: 240 });
  });

  it('un trapezio prende la base maggiore e il lato più lungo', () => {
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[0, 0], [400, 0], [350, 200], [50, 200]],
          [
            { da: 0, a: 1, valore: 200 },
            { da: 1, a: 2, valore: 105 },
            { da: 2, a: 3, valore: 150 }
          ]
        )
      ],
      FOTO
    );
    // B 200 (maggiore di b 150) × h 105
    expect(p[0]).toMatchObject({ larghezza: 2000, altezza: 1050 });
  });

  it('senza misure scritte l’ingombro si ricava ancora dal disegno', () => {
    const p = pezziDaAnnotazioni([poligono([[0, 0], [200, 0], [200, 100], [0, 100]])], FOTO);
    expect(p[0]).toMatchObject({ larghezza: 2000, altezza: 1000 });
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

describe('forme quotate su foto NON calibrate', () => {
  /** la foto non ha né scala né piano: le misure stanno solo nelle quote */
  const SENZA = { scala: null, piano: null };

  it('un poligono quotato si misura lo stesso: la scala viene dai suoi lati', () => {
    // disegno 400×200 px, ma il lato lungo è quotato 200 cm → 1 px = 0,5 cm
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[0, 0], [400, 0], [400, 200], [0, 200]],
          [
            { da: 0, a: 1, valore: 200 },
            { da: 1, a: 2, valore: 100 },
            { da: 2, a: 3, valore: 200 },
            { da: 3, a: 0, valore: 100 }
          ]
        )
      ],
      SENZA
    );
    expect(p[0]).toMatchObject({ larghezza: 2000, altezza: 1000 });
  });

  it('le abbondanze valgono anche senza calibrazione', () => {
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[0, 0], [400, 0], [400, 200], [0, 200]],
          [
            { da: 0, a: 1, valore: 200, abbInizio: 5, abbFine: 5 },
            { da: 1, a: 2, valore: 100, abbInizio: 3 },
            { da: 2, a: 3, valore: 200 },
            { da: 3, a: 0, valore: 100 }
          ]
        )
      ],
      SENZA
    );
    expect(p[0]).toMatchObject({ larghezza: 2100, altezza: 1030, conAbbondanze: true });
  });

  it('un rettangolo quotato non ha mai avuto bisogno della calibrazione', () => {
    const p = pezziDaAnnotazioni([rett(120, 60)], SENZA);
    expect(p[0]).toMatchObject({ larghezza: 1200, altezza: 600 });
  });

  it('un cerchio quotato nemmeno', () => {
    const p = pezziDaAnnotazioni([cerchio(40, 2)], SENZA);
    expect(p[0]).toMatchObject({ larghezza: 440, altezza: 440 });
  });

  it('solo una forma senza misure e senza calibrazione resta fuori', () => {
    const p = pezziDaAnnotazioni([poligono([[0, 0], [400, 0], [400, 200]])], SENZA);
    expect(p).toEqual([]);
  });

  it('bastano le quote di un verso solo: l’altro segue le proporzioni', () => {
    const p = pezziDaAnnotazioni(
      [
        poligono(
          [[0, 0], [400, 0], [400, 200], [0, 200]],
          [{ da: 0, a: 1, valore: 200 }]
        )
      ],
      SENZA
    );
    expect(p[0]).toMatchObject({ larghezza: 2000, altezza: 1000 });
  });
});

describe('diagnosiPezzi', () => {
  const SENZA = { scala: null, piano: null };

  it('distingue le forme chiuse dalle quote lineari', () => {
    const quota = { ...base, tipo: 'quota', unita: 'cm', valore: 100 } as unknown as Annotazione;
    const d = diagnosiPezzi([rett(120, 60), quota, quota], FOTO);
    expect(d).toMatchObject({ formeChiuse: 1, senzaMisura: 0, quoteLineari: 2 });
  });

  it('conta le forme trovate ma senza misure utilizzabili', () => {
    const d = diagnosiPezzi([rett(null, null), poligono([[0, 0], [10, 0], [10, 5]])], SENZA);
    expect(d).toMatchObject({ formeChiuse: 2, senzaMisura: 2 });
  });

  it('il resto finisce fra le «altre»', () => {
    const testo = { ...base, tipo: 'testo', testo: 'ciao' } as unknown as Annotazione;
    expect(diagnosiPezzi([testo], FOTO)).toMatchObject({ altre: 1, formeChiuse: 0 });
  });
});

/* --- forme pannellizzate --------------------------------------------- */

describe('forme divise in teli', () => {
  /** parete 500×230 con 5 cm di abbondanza per lato: si taglia 510×240 */
  const parete = (giunti: number[]) =>
    ({
      ...base,
      tipo: 'quotaPoligono',
      punti: [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 230 },
        { x: 0, y: 230 }
      ],
      segmenti: [
        { da: 0, a: 1, valore: 500, abbInizio: 5, abbFine: 5 },
        { da: 1, a: 2, valore: 230, abbInizio: 5, abbFine: 5 },
        { da: 2, a: 3, valore: 500, abbInizio: 5, abbFine: 5 },
        { da: 3, a: 0, valore: 230, abbInizio: 5, abbFine: 5 }
      ],
      etichetta: 'A1',
      unita: 'cm',
      stato: 'reale',
      pannelli: { asse: 'verticale', sormonto: 2, verso: 'centro', giunti }
    }) as unknown as Annotazione;

  it('nella distinta arrivano i teli, non la parete intera', () => {
    const pezzi = pezziDaAnnotazioni([parete([136, 271, 406])], FOTO);
    expect(pezzi).toHaveLength(4);
    // millimetri di taglio: 137, 137, 137, 105 cm
    expect(pezzi.map((p) => p.larghezza)).toEqual([1370, 1370, 1370, 1050]);
    // l'altezza è quella di taglio, uguale per tutti
    expect(pezzi.every((p) => p.altezza === 2400)).toBe(true);
  });

  it('ogni telo porta il suo codice: …a, …b, …c', () => {
    const pezzi = pezziDaAnnotazioni([parete([136, 271, 406])], FOTO);
    expect(pezzi.map((p) => p.nome)).toEqual([
      'Poligono 4 lati A1.a',
      'Poligono 4 lati A1.b',
      'Poligono 4 lati A1.c',
      'Poligono 4 lati A1.d'
    ]);
  });

  it('somma dei teli = parete + un sormonto per giunzione', () => {
    const pezzi = pezziDaAnnotazioni([parete([136, 271, 406])], FOTO);
    const somma = pezzi.reduce((s, p) => s + p.larghezza, 0);
    expect(somma).toBe(5100 + 3 * 20);
  });

  it('senza giunzioni valide resta un pezzo solo', () => {
    const pezzi = pezziDaAnnotazioni([parete([])], FOTO);
    expect(pezzi).toHaveLength(1);
    expect(pezzi[0].larghezza).toBe(5100);
  });
});
