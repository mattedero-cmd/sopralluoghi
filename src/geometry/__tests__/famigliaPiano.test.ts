import { describe, expect, it } from 'vitest';
import { riferimentiPiano } from '../pianoDaForme';
import type { Annotazione } from '../../db/types';

/**
 * CHI CALIBRA LA PROSPETTIVA.
 *
 * Una misura richiamata si porta dietro la FORMA dell'originale e viene posata
 * dove serve il codice: su un'altra campata, più lontano, di sbieco. Quel
 * quadrilatero non è più l'immagine di un rettangolo visto da lì, e nel conto
 * dell'omografia chiederebbe alla prospettiva di assecondare una forma che
 * nella foto non esiste. Calibra solo l'ORIGINALE della famiglia (A1.1), che è
 * la misura presa sul posto con gli angoli puntati lì.
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

describe('solo l’originale della famiglia calibra il piano', () => {
  it('le forme senza famiglia entrano tutte', () => {
    expect(ids([forma('a', 100), forma('b', 500), forma('c', 900)])).toEqual(['a', 'b', 'c']);
  });

  it('la copia solo-etichetta non entra: non ha misure sue', () => {
    const originale = forma('o', 100, { gruppoQuota: 'o' });
    const copia = forma('c', 500, { gruppoQuota: 'o', soloEtichetta: true, segmenti: undefined });
    expect(ids([originale, copia])).toEqual(['o']);
  });

  it('la replica che si porta dietro le quote non calibra: la forma è dell’originale', () => {
    const originale = forma('o', 100, { gruppoQuota: 'o' });
    const gemella = forma('g', 500, { gruppoQuota: 'o' });
    expect(ids([originale, gemella])).toEqual(['o']);
  });

  it('e vale anche se la copia viene prima nell’elenco', () => {
    const gemella = forma('g', 500, { gruppoQuota: 'o' });
    const originale = forma('o', 100, { gruppoQuota: 'o' });
    expect(ids([gemella, originale])).toEqual(['o']);
  });

  it('cinque repliche dello stesso serramento restano tutte fuori', () => {
    const famiglia = [
      forma('o', 100, { gruppoQuota: 'o' }),
      ...[400, 700, 1000, 1300].map((x, i) => forma(`c${i}`, x, { gruppoQuota: 'o' }))
    ];
    const altra = forma('z', 1700);
    const dentro = ids([...famiglia, altra]);
    expect(dentro).toEqual(['o', 'z']);
  });

  it('se l’originale sta in un’altra foto, di quella famiglia non calibra nessuno', () => {
    // nessun membro ha id uguale alla chiave: l'originale non è in questa foto,
    // e quel che resta sono repliche — meglio un riferimento in meno che uno
    // sbagliato
    const piccola = forma('p', 100, { gruppoQuota: 'altrove' });
    const larga = grande('l', 600, { gruppoQuota: 'altrove' });
    expect(ids([piccola, larga])).toEqual([]);
    // ma le forme sue della foto continuano a calibrare
    expect(ids([piccola, larga, forma('z', 1200)])).toEqual(['z']);
  });

  it('famiglie diverse restano due riferimenti distinti', () => {
    const a = forma('a', 100, { gruppoQuota: 'a' });
    const a2 = forma('a2', 400, { gruppoQuota: 'a' });
    const b = forma('b', 800, { gruppoQuota: 'b' });
    const b2 = forma('b2', 1100, { gruppoQuota: 'b' });
    expect(ids([a, a2, b, b2])).toEqual(['a', 'b']);
  });
});
