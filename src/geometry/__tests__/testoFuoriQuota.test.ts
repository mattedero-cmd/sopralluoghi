import { describe, expect, it } from 'vitest';
import {
  misuraLarghezzaTesto,
  primitiveQuota,
  scorrimentoFuori
} from '../primitive';
import type { Quota } from '../../db/types';

/**
 * IL NUMERO PORTATO FUORI DALLA QUOTA.
 *
 * Su una misura corta — una porta stretta, uno spessore — fra le due frecce
 * non ci sta niente. Il numero si porta oltre l'estremo, e la linea di quota
 * lo segue: senza il prolungamento resterebbe a mezz'aria, senza dire più a
 * quale misura appartiene.
 */

const stile = { colore: '#ffc400', spessore: 3, dimensioneTesto: 20 };

/** quota orizzontale lunga 40 px: il numero non ci sta in mezzo */
const corta = (scorrTesto?: number, posizioneTesto: Quota['posizioneTesto'] = 'sopra'): Quota =>
  ({
    id: 'q1',
    fotoId: 'f',
    zIndex: 0,
    stile,
    tipo: 'quota',
    sottotipo: 'orizzontale',
    p1: { x: 100, y: 200 },
    p2: { x: 140, y: 200 },
    offset: 0,
    valore: 40,
    unita: 'cm',
    posizioneTesto,
    scorrTesto,
    stato: 'reale'
  }) as unknown as Quota;

const linee = (p: ReturnType<typeof primitiveQuota>) =>
  p.filter((x): x is Extract<typeof x, { kind: 'linea' }> => x.kind === 'linea');
const testo = (p: ReturnType<typeof primitiveQuota>) =>
  p.find((x): x is Extract<typeof x, { kind: 'testo' }> => x.kind === 'testo')!;

describe('scorrimentoFuori', () => {
  it('porta il numero appena oltre l’estremo: mezza quota, mezza scritta e respiro', () => {
    const larghezza = misuraLarghezzaTesto('40 cm', 20);
    expect(scorrimentoFuori(40, '40 cm', 20, 1)).toBeCloseTo(20 + larghezza / 2 + 10, 6);
    // dall'altra parte è lo stesso valore, di segno opposto
    expect(scorrimentoFuori(40, '40 cm', 20, -1)).toBeCloseTo(-scorrimentoFuori(40, '40 cm', 20, 1), 6);
  });

  it('più è lunga la scritta, più si sposta: non deve accavallarsi alla freccia', () => {
    expect(scorrimentoFuori(40, '1000 cm', 20, 1)).toBeGreaterThan(scorrimentoFuori(40, '1 cm', 20, 1));
  });
});

describe('primitiveQuota col numero fuori', () => {
  it('in mezzo alla quota non c’è nessun prolungamento', () => {
    expect(linee(primitiveQuota(corta())).length).toBe(1);
  });

  it('portato fuori, la linea di quota si prolunga fino al numero', () => {
    const scorr = scorrimentoFuori(40, '40 cm', 20, 1);
    const prim = primitiveQuota(corta(scorr));
    const tratti = linee(prim);
    expect(tratti).toHaveLength(2); // la quota, più il prolungamento
    // il prolungamento parte dall'estremo destro (x 140) e arriva sotto al numero
    const prolunga = tratti[1].punti;
    expect(prolunga[0]).toBeCloseTo(140, 6);
    expect(prolunga[2]).toBeCloseTo(120 + scorr, 6);
    // e il numero sta lì sopra
    expect(testo(prim).posizione.x).toBeCloseTo(120 + scorr, 6);
  });

  it('dall’altra parte il prolungamento parte dall’estremo sinistro', () => {
    const scorr = scorrimentoFuori(40, '40 cm', 20, -1);
    const prolunga = linee(primitiveQuota(corta(scorr)))[1].punti;
    expect(prolunga[0]).toBeCloseTo(100, 6);
    expect(prolunga[2]).toBeCloseTo(120 + scorr, 6);
  });

  it('col numero SULLA linea il prolungamento si ferma prima, o gli passerebbe dentro', () => {
    const scorr = scorrimentoFuori(40, '40 cm', 20, 1);
    const conTesto = linee(primitiveQuota(corta(scorr, 'centro')))[1].punti;
    const sopra = linee(primitiveQuota(corta(scorr, 'sopra')))[1].punti;
    // arriva più corto: si ferma a mezza scritta dal numero
    expect(conTesto[2]).toBeLessThan(sopra[2]);
    expect(conTesto[2]).toBeGreaterThan(140);
  });

  it('su una quota corta le frecce restano rivolte in fuori', () => {
    // era già così, e portare il numero di lato non lo cambia
    const prim = primitiveQuota(corta(scorrimentoFuori(40, '40 cm', 20, 1)));
    expect(prim.some((x) => x.kind === 'poligono')).toBe(true);
  });
});
