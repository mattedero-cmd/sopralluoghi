import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { pezziDaProgetto } from '../report';
import type { Annotazione, Foto, Progetto } from '../../db/types';

const ora = Date.now();

const progetto = (): Progetto =>
  ({
    id: 'p1',
    cartellaId: null,
    nome: 'Bagno Verdi',
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
    creataIl: ora,
    modificataIl: ora,
    origine: new ArrayBuffer(4),
    origineTipo: 'image/jpeg',
    miniatura: new ArrayBuffer(4),
    miniaturaTipo: 'image/jpeg',
    larghezzaPx: 1000,
    altezzaPx: 800,
    // nessuna calibrazione: le misure stanno nelle quote, come nei sopralluoghi veri
    scala: null,
    piano: null,
    sezioneId: null
  }) as unknown as Foto;

const comune = (fotoId: string) => ({
  fotoId,
  zIndex: 0,
  colore: '#ff0',
  spessore: 2,
  unita: 'cm' as const,
  stato: 'reale' as const
});

beforeEach(async () => {
  await Promise.all([db.progetti.clear(), db.foto.clear(), db.annotazioni.clear(), db.cartelle.clear()]);
  await db.progetti.put(progetto());
  await db.foto.bulkPut([foto('f1', 1), foto('f2', 2)]);
});

describe('pezziDaProgetto', () => {
  it('riconosce le forme per quello che sono, non come «poligono»', async () => {
    await db.annotazioni.bulkPut([
      {
        ...comune('f1'),
        id: 'a1',
        tipo: 'quotaPoligono',
        etichetta: 'A',
        punti: [
          { x: 0, y: 0 },
          { x: 300, y: 0 },
          { x: 0, y: 200 }
        ],
        segmenti: [
          { da: 0, a: 1, valore: 150 },
          { da: 1, a: 2, valore: 180 },
          { da: 2, a: 0, valore: 100 }
        ]
      },
      {
        ...comune('f1'),
        id: 'a2',
        tipo: 'quotaPoligono',
        etichetta: 'B',
        punti: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 350, y: 200 },
          { x: 50, y: 200 }
        ],
        segmenti: [
          { da: 0, a: 1, valore: 200 },
          { da: 1, a: 2, valore: 105 },
          { da: 2, a: 3, valore: 150 }
        ]
      }
    ] as unknown as Annotazione[]);

    const pezzi = await pezziDaProgetto('p1');
    const nomi = pezzi.map((p) => p.nome);
    expect(nomi.some((n) => n.startsWith('Triangolo'))).toBe(true);
    expect(nomi.some((n) => n.startsWith('Trapezio'))).toBe(true);
    expect(nomi.some((n) => n.includes('Poligono'))).toBe(false);
  });

  it('il nome porta il codice della forma, che rimanda alla foto', async () => {
    await db.annotazioni.put({
      ...comune('f1'),
      id: 'a1',
      tipo: 'quotaRett',
      etichetta: 'D',
      punti: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 60 },
        { x: 0, y: 60 }
      ],
      valoreBase: 120,
      valoreAltezza: 60
    } as unknown as Annotazione);

    const pezzi = await pezziDaProgetto('p1');
    expect(pezzi).toHaveLength(1);
    expect(pezzi[0].nome).toMatch(/^Rettangolo \S+/);
    expect(pezzi[0]).toMatchObject({ larghezza: 1200, altezza: 600, quantita: 1 });
  });

  it('una forma richiamata più volte è UN pezzo con la sua quantità', async () => {
    await db.annotazioni.bulkPut([
      {
        ...comune('f1'),
        id: 'orig',
        tipo: 'quotaPoligono',
        etichetta: 'B',
        gruppoQuota: 'fam-B',
        punti: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 200 },
          { x: 0, y: 200 }
        ],
        segmenti: [
          { da: 0, a: 1, valore: 200 },
          { da: 1, a: 2, valore: 100 }
        ]
      },
      {
        ...comune('f2'),
        id: 'copia',
        tipo: 'quotaPoligono',
        etichetta: 'B',
        gruppoQuota: 'fam-B',
        soloEtichetta: true,
        punti: [
          { x: 10, y: 10 },
          { x: 410, y: 10 },
          { x: 410, y: 210 },
          { x: 10, y: 210 }
        ],
        segmenti: []
      }
    ] as unknown as Annotazione[]);

    const pezzi = await pezziDaProgetto('p1');
    expect(pezzi).toHaveLength(1);
    expect(pezzi[0].quantita).toBe(2);
    // la misura è quella dell'originale, anche se la copia sta su un'altra foto
    expect(pezzi[0]).toMatchObject({ larghezza: 2000, altezza: 1000 });
  });

  it('le abbondanze inserite entrano nella misura di taglio', async () => {
    await db.annotazioni.bulkPut([
      {
        ...comune('f1'),
        id: 'a1',
        tipo: 'quotaPoligono',
        etichetta: 'A',
        punti: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 200 },
          { x: 0, y: 200 }
        ],
        segmenti: [
          { da: 0, a: 1, valore: 200, abbInizio: 5, abbFine: 5 },
          { da: 1, a: 2, valore: 100, abbInizio: 3 }
        ]
      },
      {
        ...comune('f2'),
        id: 'a2',
        tipo: 'quotaRaggio',
        centro: { x: 50, y: 50 },
        bordo: { x: 80, y: 50 },
        modo: 'diametro',
        valore: 40,
        margine: 2,
        nota: 'Foro lavabo'
      }
    ] as unknown as Annotazione[]);

    const pezzi = await pezziDaProgetto('p1');
    const poli = pezzi.find((p) => p.nome.startsWith('Rettangolo') || p.nome.startsWith('Trapezio'))!;
    expect(poli).toMatchObject({ larghezza: 2100, altezza: 1030, conAbbondanze: true });
    const cerchio = pezzi.find((p) => p.nome.startsWith('Cerchio'))!;
    expect(cerchio).toMatchObject({ larghezza: 440, altezza: 440 });
  });

  it('le quote lineari non diventano pezzi', async () => {
    await db.annotazioni.put({
      ...comune('f1'),
      id: 'q1',
      tipo: 'quota',
      valore: 250,
      p1: { x: 0, y: 0 },
      p2: { x: 250, y: 0 }
    } as unknown as Annotazione);
    expect(await pezziDaProgetto('p1')).toEqual([]);
  });

  it('un progetto che non esiste non fa danni', async () => {
    expect(await pezziDaProgetto('inesistente')).toEqual([]);
  });
});
