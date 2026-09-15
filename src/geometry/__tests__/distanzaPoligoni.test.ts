import { describe, expect, it } from 'vitest';
import {
  distanzaPoligoni,
  distanzaSagome,
  sagomaDi,
  segmentiIncidenti,
  type Punto
} from '../distanzaPoligoni';
import type { Piazzamento } from '../nesting';

/**
 * LE PROVE DELLA MISURA, prima delle prove del nesting.
 *
 * Questa funzione è il metro con cui si giudica se fra due pezzi passa la
 * lama. Un metro sbagliato non fa fallire niente: fa passare tutto. I casi
 * qui sotto sono i tre errori veri in cui sono cascato scrivendola.
 */

const rett = (x: number, y: number, l: number, a: number): Punto[] => [
  [x, y],
  [x + l, y],
  [x + l, y + a],
  [x, y + a]
];

describe('segmentiIncidenti', () => {
  it('due segmenti che si tagliano a croce', () => {
    expect(segmentiIncidenti([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
  });

  it('due segmenti collineari e STACCATI non si tagliano', () => {
    // il caso che rompeva tutto: due pezzi appoggiati alla stessa riga del
    // margine hanno i lati allineati, e tutti i prodotti vettoriali a zero
    expect(segmentiIncidenti([0, 0], [10, 0], [50, 0], [60, 0])).toBe(false);
  });

  it('due segmenti collineari e SOVRAPPOSTI si tagliano', () => {
    expect(segmentiIncidenti([0, 0], [10, 0], [5, 0], [20, 0])).toBe(false || true);
    expect(segmentiIncidenti([0, 0], [10, 0], [5, 0], [20, 0])).toBe(true);
  });

  it('un estremo appoggiato sull’altro segmento', () => {
    expect(segmentiIncidenti([0, 0], [10, 0], [5, 0], [5, 8])).toBe(true);
  });

  it('due segmenti paralleli e lontani, no', () => {
    expect(segmentiIncidenti([0, 0], [10, 0], [0, 7], [10, 7])).toBe(false);
  });
});

describe('distanzaPoligoni', () => {
  it('due rettangoli affiancati: la distanza è il vuoto fra loro', () => {
    expect(distanzaPoligoni(rett(0, 0, 100, 100), rett(103, 0, 100, 100))).toBeCloseTo(3, 6);
    expect(distanzaPoligoni(rett(0, 0, 100, 100), rett(0, 103, 100, 100))).toBeCloseTo(3, 6);
  });

  it('due rettangoli in diagonale: conta la distanza fra gli spigoli', () => {
    expect(distanzaPoligoni(rett(0, 0, 100, 100), rett(103, 104, 100, 100))).toBeCloseTo(5, 6);
  });

  it('due rettangoli che si accavallano stanno a zero', () => {
    // senza il test di taglio questo tornava «50», e una prova costruita
    // sopra avrebbe dichiarato sano un piano con due pezzi uno sull'altro
    expect(distanzaPoligoni(rett(0, 0, 100, 100), rett(50, 50, 100, 100))).toBe(0);
  });

  it('un pezzo tutto dentro un altro sta a zero', () => {
    // nessun lato taglia niente, eppure di distanza non ce n'è
    expect(distanzaPoligoni(rett(0, 0, 100, 100), rett(20, 20, 20, 20))).toBe(0);
    expect(distanzaPoligoni(rett(20, 20, 20, 20), rett(0, 0, 100, 100))).toBe(0);
  });

  it('due rettangoli che si toccano stanno a zero', () => {
    expect(distanzaPoligoni(rett(0, 0, 100, 100), rett(100, 0, 100, 100))).toBe(0);
  });

  it('un triangolo e un rettangolo infilato nel vuoto della falda', () => {
    // il caso del piano di taglio, ed è il conto che conta: il rettangolo sta
    // dentro l'INGOMBRO del triangolo — cosa che con i rettangoli d'ingombro
    // sarebbe un accavallamento — ma nel vuoto lasciato dalla falda, e la
    // distanza vera è quella fra lo spigolo e il lato in pendenza
    const falda: Punto[] = [
      [0, 0],
      [200, 0],
      [200, 200]
    ];
    // la falda è l'ipotenusa y = x, e il pieno sta sotto; il rettangolo sta
    // sopra, e il suo spigolo più vicino è (60, 100)
    const nelVuoto = rett(20, 100, 40, 40);
    expect(distanzaPoligoni(falda, nelVuoto)).toBeCloseTo(40 / Math.SQRT2, 6);
  });

  it('due rettangoli lontani, in rettangoli affiancati sulla stessa riga', () => {
    // i lati bassi sono collineari: è il caso che tornava zero
    expect(distanzaPoligoni(rett(0, 0, 100, 50), rett(400, 0, 100, 50))).toBeCloseTo(300, 6);
  });
});

describe('distanzaSagome: il cerchio resta un cerchio', () => {
  // il cerchio non diventa un poligono fitto: la distanza è quella dal centro
  // meno il raggio, esatta. Un poligono inscritto lo farebbe sembrare più
  // piccolo di com'è — e la lama passerebbe dentro il pezzo.
  const pezzo = (dati: Partial<Piazzamento>): Piazzamento =>
    ({
      x: 0, y: 0, larghezza: 100, altezza: 100, nome: 'p', tinta: 0,
      ruotato: false, chiave: 'p#0', ...dati
    }) as Piazzamento;

  it('due cerchi affiancati: centro contro centro, meno i raggi', () => {
    const a = sagomaDi(pezzo({ forma: 'cerchio', x: 0, y: 0, larghezza: 100, altezza: 100 }));
    const b = sagomaDi(pezzo({ forma: 'cerchio', x: 140, y: 0, larghezza: 100, altezza: 100 }));
    // centri a (50,50) e (190,50): 140 − 50 − 50 = 40
    expect(distanzaSagome(a, b)).toBeCloseTo(40, 6);
  });

  it('due cerchi in diagonale stanno più lontani di quanto dicano gli ingombri', () => {
    const a = sagomaDi(pezzo({ forma: 'cerchio', x: 0, y: 0, larghezza: 100, altezza: 100 }));
    const b = sagomaDi(pezzo({ forma: 'cerchio', x: 100, y: 100, larghezza: 100, altezza: 100 }));
    // gli ingombri si toccano in uno spigolo: distanza zero. I cerchi no.
    expect(distanzaSagome(a, b)).toBeCloseTo(Math.hypot(100, 100) - 100, 6);
    expect(distanzaSagome(a, b)).toBeGreaterThan(41);
  });

  it('due cerchi sovrapposti stanno a zero', () => {
    const a = sagomaDi(pezzo({ forma: 'cerchio', x: 0, y: 0, larghezza: 100, altezza: 100 }));
    const b = sagomaDi(pezzo({ forma: 'cerchio', x: 40, y: 0, larghezza: 100, altezza: 100 }));
    expect(distanzaSagome(a, b)).toBe(0);
  });

  it('un cerchio accanto a un rettangolo', () => {
    const c = sagomaDi(pezzo({ forma: 'cerchio', x: 0, y: 0, larghezza: 100, altezza: 100 }));
    const r = sagomaDi(pezzo({ x: 150, y: 0, larghezza: 80, altezza: 100 }));
    // centro in (50,50), il lato del rettangolo in x=150: 100 − 50 = 50
    expect(distanzaSagome(c, r)).toBeCloseTo(50, 6);
    expect(distanzaSagome(r, c)).toBeCloseTo(50, 6);
  });

  it('un cerchio infilato nel vuoto di una falda', () => {
    // la falda è l'ipotenusa y = x del triangolo (0,0)-(200,0)-(200,200), che
    // ha il pieno SOTTO; il cerchio sta sopra, e la distanza è quella dal
    // centro alla falda meno il raggio
    const falda = sagomaDi(
      pezzo({ x: 0, y: 0, larghezza: 200, altezza: 200, forma: 'triangoloL', punti: [[0, 0], [200, 0], [200, 200]] })
    );
    const tondo = sagomaDi(pezzo({ forma: 'cerchio', x: 20, y: 120, larghezza: 60, altezza: 60 }));
    // centro (50,150): distanza dalla retta y=x è 100/√2, meno il raggio 30
    expect(distanzaSagome(falda, tondo)).toBeCloseTo(100 / Math.SQRT2 - 30, 6);
  });

  it('il cerchio dentro un pezzo grande sta a zero', () => {
    const grande = sagomaDi(pezzo({ x: 0, y: 0, larghezza: 400, altezza: 400 }));
    const tondo = sagomaDi(pezzo({ forma: 'cerchio', x: 100, y: 100, larghezza: 60, altezza: 60 }));
    expect(distanzaSagome(grande, tondo)).toBe(0);
  });
});
