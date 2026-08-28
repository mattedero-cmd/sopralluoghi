import { describe, expect, it } from 'vitest';
import {
  bordiSagoma,
  ePannellizzabile,
  fasciaSagoma,
  formaQuadrilatera,
  pannelliDellaForma,
  sagomaDiTaglioQuad
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
    // si divide IL VETRO: 500, non i 510 del foglio
    expect(d?.totale).toBe(500);
    expect(d?.trasversale).toBe(230);
    expect(d?.abbondanze).toEqual({
      inizio: 5,
      fine: 5,
      trasversaleInizio: 5,
      trasversaleFine: 5
    });
    // i teli però si tagliano con le abbondanze: il primo e l'ultimo se le portano
    expect(d?.pannelli.map((p) => Math.round(p.larghezza))).toEqual([142, 137, 137, 100]);
    expect(d?.pannelli.every((p) => p.altezza === 240)).toBe(true);
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

  it('le abbondanze si leggono lato per lato', () => {
    const f = formaQuadrilatera(storta);
    // tutti e 10 i cm stanno a sinistra, i 4 stanno sotto
    expect(f?.abbondanze).toEqual({ sinistra: 10, destra: 0, sopra: 0, sotto: 4 });
    const d = pannelliDellaForma(storta);
    expect(d?.abbondanze).toEqual({
      inizio: 10,
      fine: 0,
      trasversaleInizio: 0,
      trasversaleFine: 4
    });
    // la giunzione a 200 divide il VETRO; il primo telo si porta i 10 cm
    expect(d?.pannelli.map((p) => p.larghezza)).toEqual([211, 301]);
    expect(d?.pannelli.every((p) => p.altezza === 234)).toBe(true);
  });

  it('sull’asse orizzontale comandano le abbondanze di sopra e di sotto', () => {
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
    expect(d?.abbondanze.inizio).toBe(6);
    expect(d?.totale).toBe(230);
  });
});

describe('la misura di taglio è la stessa della distinta', () => {
  /**
   * Trapezio: base corta 480 abbondata di 5 per parte (490 di materiale),
   * base lunga 500 senza abbondanze. L'ingombro è 500, non 510: la base corta
   * abbondata sta dentro quella lunga.
   */
  const trapezio = poligono(
    [
      [10, 0],
      [490, 0],
      [500, 230],
      [0, 230]
    ],
    [
      { da: 0, a: 1, valore: 480, abbInizio: 5, abbFine: 5 },
      { da: 1, a: 2, valore: 230 },
      { da: 2, a: 3, valore: 500 },
      { da: 3, a: 0, valore: 230 }
    ],
    { asse: 'verticale', sormonto: 2, verso: 'centro', giunti: [136, 271, 406] }
  );

  it('comanda il lato più lungo con le sue abbondanze, non la somma', () => {
    const f = formaQuadrilatera(trapezio);
    expect(f?.netta.larghezza).toBe(500);
    expect(f?.taglio.larghezza).toBe(500);
    // il lato che decide l'ingombro non ha abbondanze: non si sborda ai lati
    expect(f?.abbondanze.sinistra).toBe(0);
    expect(f?.abbondanze.destra).toBe(0);
  });

  it('i teli si dividono sul vetro, e il materiale resta quello', () => {
    const d = pannelliDellaForma(trapezio);
    expect(d?.totale).toBe(500);
    const somma = d!.pannelli.reduce((s, p) => s + p.larghezza, 0);
    expect(somma).toBe(500 + 3 * 2);
  });
});

/* --- la sagoma vera del vetro ----------------------------------------- */

describe('verticiNetti', () => {
  it('un rettangolo resta il suo riquadro', () => {
    const f = formaQuadrilatera(
      poligono(
        [
          [0, 0],
          [500, 0],
          [500, 230],
          [0, 230]
        ],
        [
          { da: 0, a: 1, valore: 500 },
          { da: 1, a: 2, valore: 230 },
          { da: 2, a: 3, valore: 500 },
          { da: 3, a: 0, valore: 230 }
        ]
      )
    )!;
    expect(f.rettangolare).toBe(true);
    expect(f.verticiNetti).toEqual([
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 230 },
      { x: 0, y: 230 }
    ]);
  });

  it('la finestra sotto falda è un trapezio, e la falda pende dal suo lato', () => {
    // come si quota davvero: base 300, altezza sinistra 200, destra 400.
    // La falda non si misura, la disegna il tetto
    const f = formaQuadrilatera(
      poligono(
        [
          [0, 200],
          [300, 0],
          [300, 400],
          [0, 400]
        ],
        [
          { da: 1, a: 2, valore: 400 },
          { da: 2, a: 3, valore: 300 },
          { da: 3, a: 0, valore: 200 }
        ]
      )
    )!;
    expect(f.rettangolare).toBe(false);
    expect(f.netta).toEqual({ larghezza: 300, altezza: 400 });
    // i quattro angoli, nel riquadro del vetro: il lato corto sta a sinistra,
    // dov'è stato misurato, e l'obliquo resta obliquo
    expect(f.verticiNetti).toEqual([
      { x: 0, y: 200 },
      { x: 300, y: 0 },
      { x: 300, y: 400 },
      { x: 0, y: 400 }
    ]);
  });

  it('quotando anche la falda l’elemento diventa un quadrilatero storto', () => {
    // quattro lati tutti diversi: non è più un trapezio rettangolo, ed è
    // giusto così — la forma la dicono le misure, non il nome
    const f = formaQuadrilatera(
      poligono(
        [
          [0, 200],
          [300, 0],
          [300, 400],
          [0, 400]
        ],
        [
          { da: 0, a: 1, valore: 360 },
          { da: 1, a: 2, valore: 400 },
          { da: 2, a: 3, valore: 300 },
          { da: 3, a: 0, valore: 200 }
        ]
      )
    )!;
    expect(f.rettangolare).toBe(false);
    // i vertici riempiono il riquadro dichiarato, che è quello in cui cadono
    // le giunzioni
    const xs = f.verticiNetti.map((p) => p.x);
    const ys = f.verticiNetti.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(f.netta.larghezza, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(f.netta.altezza, 6);
  });

  it('due altezze uguali non fanno una falda: il vetro resta rettangolare', () => {
    const f = formaQuadrilatera(
      poligono(
        [
          [0, 0],
          [300, 0],
          [300, 200],
          [0, 200]
        ],
        [
          { da: 0, a: 1, valore: 300 },
          { da: 1, a: 2, valore: 200 },
          { da: 2, a: 3, valore: 300 },
          { da: 3, a: 0, valore: 200 }
        ]
      )
    )!;
    expect(f.rettangolare).toBe(true);
  });
});

describe('sagomaDiTaglioQuad', () => {
  const riquadro = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 }
  ];

  it('su un rettangolo sono i quattro spigoli allargati, lato per lato', () => {
    expect(sagomaDiTaglioQuad(riquadro, { sinistra: 2, destra: 5, sopra: 10, sotto: 1 })).toEqual([
      { x: -2, y: -10 },
      { x: 405, y: -10 },
      { x: 405, y: 301 },
      { x: -2, y: 301 }
    ]);
  });

  it('senza abbondanze la sagoma non si muove', () => {
    expect(sagomaDiTaglioQuad(riquadro, { sinistra: 0, destra: 0, sopra: 0, sotto: 0 })).toEqual(
      riquadro
    );
  });

  it('su una falda l’obliquo resta obliquo e il pezzo cresce di quel che deve', () => {
    // trapezio rettangolo: base 400, h sx 200, h dx 300
    const falda = [
      { x: 0, y: 100 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 }
    ];
    const t = sagomaDiTaglioQuad(falda, { sinistra: 10, destra: 10, sopra: 20, sotto: 20 });
    const xs = t.map((p) => p.x);
    const ys = t.map((p) => p.y);
    // l'ingombro cresce esattamente delle abbondanze
    expect(Math.min(...xs)).toBeCloseTo(-10, 6);
    expect(Math.max(...xs)).toBeCloseTo(410, 6);
    expect(Math.max(...ys)).toBeCloseTo(320, 6);
    // il lato obliquo si è spostato in fuori restando parallelo a sé stesso:
    // la sua pendenza non cambia
    const pend = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      (b.y - a.y) / (b.x - a.x);
    expect(pend(t[0], t[1])).toBeCloseTo(pend(falda[0], falda[1]), 9);
    // e sta più in alto dell'originale, di quanto vale l'abbondanza in verticale
    const dist =
      (t[0].y - falda[0].y) / Math.hypot(1, pend(falda[0], falda[1])) === 0
        ? 0
        : Math.abs(
            ((falda[1].y - falda[0].y) * t[0].x -
              (falda[1].x - falda[0].x) * t[0].y +
              falda[1].x * falda[0].y -
              falda[1].y * falda[0].x) /
              Math.hypot(falda[1].x - falda[0].x, falda[1].y - falda[0].y)
          );
    expect(dist).toBeCloseTo(20, 6);
  });
});

describe('bordiSagoma e fasciaSagoma', () => {
  // trapezio rettangolo: base 300, altezza sinistra 200, destra 400
  const falda = [
    { x: 0, y: 200 },
    { x: 300, y: 0 },
    { x: 300, y: 400 },
    { x: 0, y: 400 }
  ];

  it('a metà base la giunzione va dal davanzale alla falda, non da cima a fondo', () => {
    expect(bordiSagoma(falda, 'verticale', 150)).toEqual({ da: 100, a: 400 });
    // ai due capi comandano i lati verticali, che sono quelli misurati
    expect(bordiSagoma(falda, 'verticale', 0)).toEqual({ da: 200, a: 400 });
    expect(bordiSagoma(falda, 'verticale', 300)).toEqual({ da: 0, a: 400 });
  });

  it('sull’asse orizzontale i bordi sono gli altri due', () => {
    // a 100 dall'alto la falda è già scesa: la fascia parte da lì
    expect(bordiSagoma(falda, 'orizzontale', 100)?.a).toBeCloseTo(300, 6);
    expect(bordiSagoma(falda, 'orizzontale', 100)?.da).toBeCloseTo(150, 6);
  });

  it('fuori dalla sagoma non c’è niente da misurare', () => {
    expect(bordiSagoma(falda, 'verticale', -10)).toBeNull();
    expect(bordiSagoma(falda, 'verticale', 400)).toBeNull();
  });

  it('un telo ritagliato dalla falda è ancora un trapezio', () => {
    const telo = fasciaSagoma(falda, 'verticale', 0, 150);
    const xs = telo.map((p) => p.x);
    const ys = telo.map((p) => p.y);
    expect(telo).toHaveLength(4);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(150, 6);
    // il lato di taglio è alto quanto dice la falda in quel punto
    expect(Math.min(...ys)).toBeCloseTo(100, 6);
    expect(Math.max(...ys)).toBeCloseTo(400, 6);
  });
});
