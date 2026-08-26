import { describe, expect, it } from 'vitest';
import {
  ePannellizzabile,
  formaQuadrilatera,
  pannelliDellaForma
} from '../formaQuadrilatera';
import type { Annotazione } from '../../db/types';
import type { Pannellizzazione } from '../pannelli';

const base = { id: 'x', fotoId: 'f', zIndex: 0, stile: { colore: '#fff', spessore: 2, dimensioneTesto: 16 } };

/** quota elemento: quadrilatero con base e altezza scritte */
function elemento(b: number | null, h: number | null, pannelli?: Pannellizzazione): Annotazione {
  return {
    ...base,
    tipo: 'quotaRett',
    punti: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 0, y: 200 }
    ],
    valoreBase: b,
    valoreAltezza: h,
    unita: 'cm',
    stato: 'reale',
    pannelli
  } as unknown as Annotazione;
}

/**
 * Poligono di 4 vertici quotato sui lati. `punti` in ordine libero: è proprio
 * quello che deve reggere, perché una forma si disegna come viene.
 */
function poligono(
  punti: Array<[number, number]>,
  segmenti: Array<{ da: number; a: number; valore: number; abbInizio?: number; abbFine?: number }>,
  pannelli?: Pannellizzazione
): Annotazione {
  return {
    ...base,
    tipo: 'quotaPoligono',
    punti: punti.map(([x, y]) => ({ x, y })),
    segmenti,
    unita: 'cm',
    stato: 'reale',
    pannelli
  } as unknown as Annotazione;
}

describe('ePannellizzabile', () => {
  it('vale per la quota elemento e per i poligoni a quattro vertici', () => {
    expect(ePannellizzabile(elemento(200, 200))).toBe(true);
    expect(
      ePannellizzabile(
        poligono(
          [
            [0, 0],
            [500, 0],
            [500, 230],
            [0, 230]
          ],
          [{ da: 0, a: 1, valore: 500 }]
        )
      )
    ).toBe(true);
  });

  it('non vale per un triangolo né per una copia solo-etichetta', () => {
    const tri = poligono(
      [
        [0, 0],
        [100, 0],
        [50, 80]
      ],
      [{ da: 0, a: 1, valore: 100 }]
    );
    expect(ePannellizzabile(tri)).toBe(false);
    const copia = poligono(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ],
      [],
      undefined
    ) as Annotazione & { soloEtichetta?: boolean };
    copia.soloEtichetta = true;
    expect(ePannellizzabile(copia)).toBe(false);
  });
});

describe('formaQuadrilatera', () => {
  it('la quota elemento dà le sue misure, senza abbondanze', () => {
    const f = formaQuadrilatera(elemento(200, 200));
    expect(f?.netta).toEqual({ larghezza: 200, altezza: 200 });
    expect(f?.taglio).toEqual({ larghezza: 200, altezza: 200 });
    expect(f?.unita).toBe('cm');
  });

  it('senza misure scritte non si pannellizza', () => {
    expect(formaQuadrilatera(elemento(null, 200))).toBeNull();
  });

  it('una parete quotata con abbondanze perimetrali: netto e taglio', () => {
    // 500 × 230 con 5 cm per lato: si taglia 510 × 240
    const parete = poligono(
      [
        [0, 0],
        [500, 0],
        [500, 230],
        [0, 230]
      ],
      [
        { da: 0, a: 1, valore: 500, abbInizio: 5, abbFine: 5 },
        { da: 1, a: 2, valore: 230, abbInizio: 5, abbFine: 5 },
        { da: 2, a: 3, valore: 500, abbInizio: 5, abbFine: 5 },
        { da: 3, a: 0, valore: 230, abbInizio: 5, abbFine: 5 }
      ]
    );
    const f = formaQuadrilatera(parete);
    expect(f?.netta).toEqual({ larghezza: 500, altezza: 230 });
    expect(f?.taglio).toEqual({ larghezza: 510, altezza: 240 });
  });

  it('mette in verso i vertici, comunque sia stata disegnata la forma', () => {
    // disegnata partendo dal basso a destra, in senso antiorario
    const f = formaQuadrilatera(
      poligono(
        [
          [500, 230],
          [0, 230],
          [0, 0],
          [500, 0]
        ],
        [
          { da: 2, a: 3, valore: 500 },
          { da: 3, a: 0, valore: 230 }
        ]
      )
    );
    expect(f?.quad[0]).toEqual({ x: 0, y: 0 }); // alto-sinistra
    expect(f?.quad[2]).toEqual({ x: 500, y: 230 }); // basso-destra
    // e i lati vengono letti nel verso giusto: 500 di base, 230 di altezza
    expect(f?.netta).toEqual({ larghezza: 500, altezza: 230 });
  });

  it('legge le misure anche su un quadrilatero in prospettiva', () => {
    const f = formaQuadrilatera(
      poligono(
        [
          [20, 10],
          [480, 40],
          [470, 250],
          [30, 210]
        ],
        [
          { da: 0, a: 1, valore: 500 },
          { da: 1, a: 2, valore: 230 }
        ]
      )
    );
    // le misure vengono dalle QUOTE, non dai pixel del disegno
    expect(f?.netta).toEqual({ larghezza: 500, altezza: 230 });
  });
});

describe('pannelliDellaForma', () => {
  const pann: Pannellizzazione = {
    asse: 'verticale',
    sormonto: 2,
    verso: 'centro',
    giunti: [136, 271, 406]
  };

  it('la parete dell’esempio: quattro teli, l’ultimo più stretto', () => {
    const parete = poligono(
      [
        [0, 0],
        [500, 0],
        [500, 230],
        [0, 230]
      ],
      [
        { da: 0, a: 1, valore: 500, abbInizio: 5, abbFine: 5 },
        { da: 1, a: 2, valore: 230, abbInizio: 5, abbFine: 5 }
      ],
      pann
    );
    const d = pannelliDellaForma(parete);
    expect(d?.totale).toBe(510);
    expect(d?.trasversale).toBe(240);
    expect(d?.pannelli.map((p) => Math.round(p.larghezza))).toEqual([137, 137, 137, 105]);
    // le giunzioni si contano sul taglio; sulla foto si disegna il netto
    expect(d?.scostamento).toBe(5);
  });

  it('senza pannellizzazione, o con una sola giunzione fuori posto, non c’è niente', () => {
    const intera = elemento(200, 200);
    expect(pannelliDellaForma(intera)).toBeNull();
    const finta = elemento(200, 200, {
      asse: 'verticale',
      sormonto: 1,
      verso: 'centro',
      giunti: [900]
    });
    expect(pannelliDellaForma(finta)).toBeNull();
  });

  it('sull’asse orizzontale si divide l’altezza', () => {
    const d = pannelliDellaForma(
      elemento(200, 400, { asse: 'orizzontale', sormonto: 2, verso: 'centro', giunti: [200] })
    );
    expect(d?.totale).toBe(400);
    expect(d?.trasversale).toBe(200);
    expect(d?.pannelli.map((p) => p.larghezza)).toEqual([201, 201]);
  });
});

describe('abbondanze non simmetriche', () => {
  /** 500×230 con 10 cm di abbondanza solo a sinistra e 4 solo sotto */
  const storta = poligono(
    [
      [0, 0],
      [500, 0],
      [500, 230],
      [0, 230]
    ],
    [
      { da: 0, a: 1, valore: 500, abbInizio: 10 },
      { da: 1, a: 2, valore: 230, abbFine: 4 },
      { da: 2, a: 3, valore: 500 },
      { da: 3, a: 0, valore: 230 }
    ],
    { asse: 'verticale', sormonto: 2, verso: 'centro', giunti: [200] }
  );

  it('il taglio cresce solo dove c’è l’abbondanza', () => {
    const f = formaQuadrilatera(storta);
    expect(f?.netta).toEqual({ larghezza: 500, altezza: 230 });
    expect(f?.taglio).toEqual({ larghezza: 510, altezza: 234 });
  });

  it('lo scostamento è quello vero, non la metà dell’extra', () => {
    const f = formaQuadrilatera(storta);
    // tutti e 10 i cm stanno a sinistra: la giunzione a 200 di taglio cade a
    // 190 sul muro, non a 195
    expect(f?.scostamento).toEqual({ larghezza: 10, altezza: 0 });
    const d = pannelliDellaForma(storta);
    expect(d?.scostamento).toBe(10);
    expect(d?.scostamentoTrasversale).toBe(0);
  });

  it('sull’asse orizzontale lo scostamento è quello dell’altezza', () => {
    const oriz = poligono(
      [
        [0, 0],
        [500, 0],
        [500, 230],
        [0, 230]
      ],
      [
        { da: 0, a: 1, valore: 500 },
        { da: 1, a: 2, valore: 230, abbInizio: 6 },
        { da: 3, a: 0, valore: 230 }
      ],
      { asse: 'orizzontale', sormonto: 2, verso: 'centro', giunti: [100] }
    );
    // abbInizio del lato destro sta al vertice alto-destra: sborda in ALTO
    const d = pannelliDellaForma(oriz);
    expect(d?.scostamento).toBe(6);
    expect(d?.totale).toBe(236);
  });
});
