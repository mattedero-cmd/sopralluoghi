import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { pezziDaProgetto } from '../report';
import type { Annotazione, Foto, Progetto } from '../../db/types';

/**
 * IL PIANO DI TAGLIO RICEVE I TELI, NON LA PARETE.
 *
 * È il requisito che tiene insieme tutto il resto: si può disegnare la
 * divisione sulla foto quanto si vuole, ma se in laboratorio arriva una parete
 * da cinque metri e mezzo il lavoro non si taglia. Qui si verifica il percorso
 * completo, quello vero: annotazioni nel database → distinta di taglio.
 */

const ora = 1_700_000_000_000;

const progetto = (): Progetto =>
  ({
    id: 'p1',
    cartellaId: null,
    nome: 'Cantiere',
    cliente: '',
    luogo: '',
    stato: 'in_corso',
    note: '',
    sezioni: [],
    clienteId: null,
    creatoIl: ora,
    modificatoIl: ora
  }) as unknown as Progetto;

const foto = (id: string, ordine: number): Foto =>
  ({
    id,
    progettoId: 'p1',
    ordine,
    origine: new ArrayBuffer(4),
    origineTipo: 'image/jpeg',
    miniatura: new ArrayBuffer(4),
    miniaturaTipo: 'image/jpeg',
    larghezzaPx: 1000,
    altezzaPx: 800,
    dataScatto: ora,
    geotag: null,
    didascalia: '',
    noteDato: '',
    scala: null,
    piano: null
  }) as unknown as Foto;

/** parete 500×230 con 5 cm di abbondanza per lato: si taglia 510 × 240 */
const parete = (id: string, fotoId: string, extra: object = {}): Annotazione =>
  ({
    id,
    fotoId,
    zIndex: 0,
    stile: { colore: '#ffc400', spessore: 3, dimensioneTesto: 18 },
    tipo: 'quotaPoligono',
    unita: 'cm',
    stato: 'reale',
    creatoIl: ora,
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
    ...extra
  }) as unknown as Annotazione;

const TELI = { asse: 'verticale', sormonto: 2, verso: 'centro', giunti: [136, 271, 406] };

beforeEach(async () => {
  await Promise.all([
    db.progetti.clear(),
    db.foto.clear(),
    db.annotazioni.clear(),
    db.cartelle.clear()
  ]);
  await db.progetti.put(progetto());
  await db.foto.put(foto('f1', 1));
});

describe('pezziDaProgetto con una parete pannellizzata', () => {
  it('nella distinta arrivano i quattro teli, col loro codice', async () => {
    await db.annotazioni.put(parete('a1', 'f1', { pannelli: TELI }));
    const pezzi = await pezziDaProgetto('p1');

    expect(pezzi.map((p) => p.nome)).toEqual([
      'A1.a Quadrilatero',
      'A1.b Quadrilatero',
      'A1.c Quadrilatero',
      'A1.d Quadrilatero'
    ]);
    // 137 · 137 · 137 · 105 cm, in millimetri di taglio
    expect(pezzi.map((p) => p.larghezza)).toEqual([1370, 1370, 1370, 1050]);
    expect(pezzi.every((p) => p.altezza === 2400)).toBe(true);
  });

  it('senza divisione resta la parete intera, come prima', async () => {
    await db.annotazioni.put(parete('a1', 'f1'));
    const pezzi = await pezziDaProgetto('p1');
    expect(pezzi).toHaveLength(1);
    expect(pezzi[0]).toMatchObject({ larghezza: 5100, altezza: 2400 });
  });

  it('il materiale è la parete più un sormonto per giunzione', async () => {
    await db.annotazioni.put(parete('a1', 'f1', { pannelli: TELI }));
    const pezzi = await pezziDaProgetto('p1');
    const somma = pezzi.reduce((s, p) => s + p.larghezza, 0);
    expect(somma).toBe(5100 + 3 * 20);
  });

  it('una divisione rimasta fuori misura non produce teli fantasma', async () => {
    // le giunzioni erano state messe su una parete più larga, poi corretta
    await db.annotazioni.put(
      parete('a1', 'f1', { pannelli: { ...TELI, giunti: [900, 1200] } })
    );
    const pezzi = await pezziDaProgetto('p1');
    expect(pezzi).toHaveLength(1);
    expect(pezzi[0].larghezza).toBe(5100);
  });
});
