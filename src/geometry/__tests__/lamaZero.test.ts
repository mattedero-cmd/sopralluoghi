import { describe, expect, it } from 'vitest';
import { corsaLibera } from '../scorrimento';
import { sovrapposizioni } from '../controlloPiano';
import { penetrazione, sagomaDi } from '../distanzaPoligoni';
import { calcolaNestingAuto } from '../nestingSagome';
import type { Piazzamento, PezzoNesting } from '../nesting';

/**
 * LA LAMA A ZERO SPEGNEVA I CONTROLLI.
 *
 * Su una pellicola la lama non consuma niente, e chi lavora in bobina mette
 * «lama 0». Ma mezzo programma chiedeva «fra questi due passa la lama?», che
 * con la lama a zero diventa «la distanza è almeno zero?» — e la distanza fra
 * due sagome non è mai negativa. La domanda era sempre vera:
 *
 * - nello SCORRIMENTO una sagoma poteva scivolare dentro un'altra e fermarsi
 *   lì, perché il contatto non veniva mai riconosciuto;
 * - nel CONTROLLO del piano la verifica si spegneva alla prima riga, quindi
 *   nessuno se ne accorgeva.
 *
 * È il difetto che ha stampato un trapezio sopra un rettangolo in un lavoro
 * vero da 201 pezzi. Due pezzi che si accavallano sono sbagliati con
 * qualunque lama, e questi test lo tengono fermo.
 */

const P = (
  nome: string,
  x: number,
  y: number,
  l: number,
  a: number,
  extra: Partial<Piazzamento> = {}
): Piazzamento =>
  ({
    x,
    y,
    larghezza: l,
    altezza: a,
    larghezzaFinita: l,
    altezzaFinita: a,
    nome,
    tinta: 0,
    ruotato: false,
    chiave: `${nome}#0`,
    punti: [
      [0, 0],
      [l, 0],
      [l, a],
      [0, a]
    ],
    ...extra
  }) as Piazzamento;

/** il trapezio del cantiere: base 500, lato sinistro 2491, lato destro 2640 */
const trapezio = (nome: string, x: number, y: number): Piazzamento =>
  P(nome, x, y, 500, 2640, {
    forma: 'trapezioR',
    punti: [
      [0, 2640],
      [500, 2640],
      [500, 0],
      [0, 149]
    ]
  });

describe('lo scorrimento con la lama a zero', () => {
  it('una sagoma non entra dentro il pezzo che ha davanti', () => {
    const muro = P('muro', 0, 0, 700, 2770);
    const tz = trapezio('trapezio', 2000, 0);
    // il trapezio scivola verso l'origine: deve fermarsi a ridosso del muro,
    // non attraversarlo
    const corsa = corsaLibera(tz, [muro], 'x', -1, 0, 2000);
    expect(corsa).toBeLessThanOrEqual(1300.01);
    expect(corsa).toBeGreaterThan(1299);
  });

  it('e nemmeno dentro un altro trapezio', () => {
    const fermo = trapezio('fermo', 0, 0);
    const mobile = trapezio('mobile', 2000, 0);
    const corsa = corsaLibera(mobile, [fermo], 'x', -1, 0, 2000);
    // si ferma quando le due sagome si toccano: mai oltre
    const dopo = { ...mobile, x: 2000 - corsa };
    expect(penetrazione(sagomaDi(fermo), sagomaDi(dopo))).toBeLessThan(0.05);
  });

  it('con la lama larga si ferma prima, come sempre', () => {
    const muro = P('muro', 0, 0, 700, 2770);
    const tz = trapezio('trapezio', 2000, 0);
    const senza = corsaLibera(tz, [muro], 'x', -1, 0, 2000);
    const con = corsaLibera(tz, [muro], 'x', -1, 20, 2000);
    expect(senza - con).toBeCloseTo(20, 1);
  });
});

describe('il controllo del piano con la lama a zero', () => {
  it('vede due pezzi nello stesso posto', () => {
    const lastra = { piazzamenti: [P('A', 10, 10, 700, 2770), trapezio('B', 10, 10)] };
    const trovate = sovrapposizioni(lastra, 0);
    expect(trovate).toHaveLength(1);
    expect(trovate[0].dentro).toBeGreaterThan(100);
  });

  it('vede anche un pezzo infilato a metà dentro un altro', () => {
    const lastra = { piazzamenti: [P('A', 0, 0, 700, 2770), P('B', 400, 0, 700, 2770)] };
    const trovate = sovrapposizioni(lastra, 0);
    expect(trovate).toHaveLength(1);
    expect(trovate[0].dentro).toBeCloseTo(300, 1);
  });

  it('ma due pezzi affiancati che si sfiorano vanno benissimo', () => {
    // è il caso normale quando la lama non consuma niente: si taglia a filo
    const lastra = { piazzamenti: [P('A', 0, 0, 700, 2770), P('B', 700, 0, 500, 2640)] };
    expect(sovrapposizioni(lastra, 0)).toHaveLength(0);
  });

  it('con la lama larga chi si sfiora non va più bene', () => {
    const lastra = { piazzamenti: [P('A', 0, 0, 700, 2770), P('B', 700, 0, 500, 2640)] };
    expect(sovrapposizioni(lastra, 3)).toHaveLength(1);
  });
});

describe('quanto due sagome si accavallano', () => {
  it('due rettangoli che si toccano: niente', () => {
    expect(penetrazione(sagomaDi(P('a', 0, 0, 100, 100)), sagomaDi(P('b', 100, 0, 100, 100)))).toBe(
      0
    );
  });

  it('due rettangoli staccati: niente', () => {
    expect(penetrazione(sagomaDi(P('a', 0, 0, 100, 100)), sagomaDi(P('b', 150, 0, 100, 100)))).toBe(
      0
    );
  });

  it('due rettangoli accavallati: di quanto', () => {
    const d = penetrazione(sagomaDi(P('a', 0, 0, 100, 100)), sagomaDi(P('b', 70, 0, 100, 100)));
    expect(d).toBeCloseTo(30, 6);
  });

  it('un cerchio dentro un rettangolo', () => {
    const cerchio = P('o', 40, 40, 40, 40, { forma: 'cerchio', punti: undefined });
    const d = penetrazione(sagomaDi(P('a', 0, 0, 100, 100)), sagomaDi(cerchio));
    // il centro è dentro: l'accavallamento è il raggio più la distanza dal bordo
    expect(d).toBeGreaterThan(40);
  });

  it('due cerchi che si sovrappongono', () => {
    const uno = P('o1', 0, 0, 100, 100, { forma: 'cerchio', punti: undefined });
    const due = P('o2', 80, 0, 100, 100, { forma: 'cerchio', punti: undefined });
    expect(penetrazione(sagomaDi(uno), sagomaDi(due))).toBeCloseTo(20, 6);
  });
});

describe('il piano di taglio senza lama', () => {
  it('non esce mai con due pezzi uno sopra l’altro', () => {
    // il caso del cantiere, ridotto: trapezi e rettangoli su una bobina da
    // 1370 con lama 0. Prima il trapezio finiva addosso al rettangolo
    const pezzi: PezzoNesting[] = [
      { id: '1', nome: 'W1', larghezza: 700, altezza: 2770, forma: 'rett', quantita: 1, ruotabile: true, tinta: 0 },
      { id: '2', nome: 'C1.c', larghezza: 500, altezza: 2490.6, misura3: 2640, forma: 'trapezioR', quantita: 1, ruotabile: true, tinta: 40 },
      { id: '3', nome: 'C1.a', larghezza: 1350, altezza: 1690, misura3: 2093.3, forma: 'trapezioR', quantita: 1, ruotabile: true, tinta: 80 },
      { id: '4', nome: 'R1', larghezza: 1350, altezza: 2760, forma: 'rett', quantita: 4, ruotabile: true, tinta: 120 },
      { id: '5', nome: 'S1.d', larghezza: 110, altezza: 3020, forma: 'rett', quantita: 3, ruotabile: true, tinta: 160 }
    ];
    const esito = calcolaNestingAuto(
      { lastra: { larghezza: 1370, altezza: 50000 }, lama: 0, abbondanza: 0, margine: 10 },
      pezzi
    );
    for (const l of esito.lastre) {
      expect(sovrapposizioni(l, 0), JSON.stringify(sovrapposizioni(l, 0))).toHaveLength(0);
    }
  });
});
