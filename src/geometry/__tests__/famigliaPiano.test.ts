import { describe, expect, it } from 'vitest';
import { riferimentiPiano } from '../pianoDaForme';
import type { Annotazione } from '../../db/types';

/**
 * CHI CALIBRA LA PROSPETTIVA.
 *
 * Un elemento ripetuto porta sempre la stessa misura: se ogni sua copia
 * entrasse nel conto, quel serramento peserebbe quanto tutta la parete e la
 * prospettiva finirebbe per assecondare lui. Della famiglia entra una forma
 * sola — l'originale, cioè la misura presa sul posto.
 */
const forma = (id: string, x: number, extra: Record<string, unknown> = {}): Annotazione =>
  ({
    id,
    fotoId: 'f1',
    zIndex: 1,
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 12 },
    tipo: 'quotaPoligono',
    unita: 'cm',
    stato: 'reale',
    punti: [
      { x, y: 100 },
      { x: x + 200, y: 100 },
      { x: x + 200, y: 400 },
      { x, y: 400 }
    ],
    segmenti: [
      { da: 0, a: 1, valore: 122 },
      { da: 1, a: 2, valore: 180 },
      { da: 2, a: 3, valore: 122 },
      { da: 3, a: 0, valore: 180 }
    ],
    ...extra
  }) as unknown as Annotazione;

/** come sopra, ma più grande nell'immagine (stessa misura reale) */
const grande = (id: string, x: number, extra: Record<string, unknown> = {}): Annotazione => {
  const f = forma(id, x, extra) as unknown as { punti: Array<{ x: number; y: number }> };
  f.punti = [
    { x, y: 100 },
    { x: x + 400, y: 100 },
    { x: x + 400, y: 700 },
    { x, y: 700 }
  ];
  return f as unknown as Annotazione;
};

const ids = (ann: Annotazione[]) => riferimentiPiano(ann).map((r) => r.id);

describe('una sola forma per famiglia calibra il piano', () => {
  it('le forme senza famiglia entrano tutte', () => {
    expect(ids([forma('a', 100), forma('b', 500), forma('c', 900)])).toEqual(['a', 'b', 'c']);
  });

  it('la copia solo-etichetta non entra: non ha misure sue', () => {
    const originale = forma('o', 100, { gruppoQuota: 'o' });
    const copia = forma('c', 500, { gruppoQuota: 'o', soloEtichetta: true, segmenti: undefined });
    expect(ids([originale, copia])).toEqual(['o']);
  });

  it('due membri della stessa famiglia con le stesse quote contano per uno', () => {
    const originale = forma('o', 100, { gruppoQuota: 'o' });
    const gemella = forma('g', 500, { gruppoQuota: 'o' });
    expect(ids([originale, gemella])).toEqual(['o']);
  });

  it('e vale anche se la copia viene prima nell’elenco', () => {
    const gemella = forma('g', 500, { gruppoQuota: 'o' });
    const originale = forma('o', 100, { gruppoQuota: 'o' });
    expect(ids([gemella, originale])).toEqual(['o']);
  });

  it('cinque copie dello stesso serramento non lo fanno pesare cinque volte', () => {
    const famiglia = [
      forma('o', 100, { gruppoQuota: 'o' }),
      ...[400, 700, 1000, 1300].map((x, i) => forma(`c${i}`, x, { gruppoQuota: 'o' }))
    ];
    const altra = forma('z', 1700);
    const dentro = ids([...famiglia, altra]);
    expect(dentro).toEqual(['o', 'z']);
  });

  it('se l’originale sta in un’altra foto, di qua comanda quella che si vede meglio', () => {
    // nessun membro ha id uguale alla chiave: l'originale non è in questa foto
    const piccola = forma('p', 100, { gruppoQuota: 'altrove' });
    const larga = grande('l', 600, { gruppoQuota: 'altrove' });
    expect(ids([piccola, larga])).toEqual(['l']);
  });

  it('famiglie diverse restano due riferimenti distinti', () => {
    const a = forma('a', 100, { gruppoQuota: 'a' });
    const a2 = forma('a2', 400, { gruppoQuota: 'a' });
    const b = forma('b', 800, { gruppoQuota: 'b' });
    const b2 = forma('b2', 1100, { gruppoQuota: 'b' });
    expect(ids([a, a2, b, b2])).toEqual(['a', 'b']);
  });
});
