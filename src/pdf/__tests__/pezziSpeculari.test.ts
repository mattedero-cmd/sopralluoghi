import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { pezziDaProgetto } from '../report';
import type { Annotazione, Foto, Progetto } from '../../db/types';

/**
 * DUE FINESTRE IDENTICHE E SPECULARI.
 *
 * Sotto il colmo di un tetto le finestre vanno a coppie: stesse misure, falda
 * che sale da una parte e dall'altra. Rilevarle due volte sarebbe lavoro
 * doppio e una fonte di errori, quindi si richiama la misura e la si specula.
 *
 * Quello che NON deve succedere è che finiscano in distinta come due copie
 * dello stesso pezzo: sono due pezzi diversi, e montarne uno al posto
 * dell'altro vuol dire buttarlo.
 */

const ora = 1_700_000_000_000;

const progetto = (): Progetto =>
  ({
    id: 'p1',
    cartellaId: null,
    nome: 'Baita',
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

/** la finestra sotto falda: base 82, lato sinistro 113, lato destro 151 */
const falda = (id: string, extra: object = {}): Annotazione =>
  ({
    id,
    fotoId: 'f1',
    zIndex: 0,
    stile: { colore: '#ffc400', spessore: 3, dimensioneTesto: 18 },
    tipo: 'quotaPoligono',
    unita: 'cm',
    stato: 'reale',
    creatoIl: ora,
    gruppoQuota: 'fam',
    punti: [
      { x: 0, y: 38 },
      { x: 82, y: 0 },
      { x: 82, y: 151 },
      { x: 0, y: 151 }
    ],
    segmenti: [
      { da: 3, a: 2, valore: 82 },
      { da: 0, a: 3, valore: 113 },
      { da: 1, a: 2, valore: 151 }
    ],
    ...extra
  }) as unknown as Annotazione;

/** la copia richiamata: solo etichetta, la misura resta dell'originale */
const richiamo = (id: string, speculare: boolean): Annotazione =>
  falda(id, {
    creatoIl: ora + 1000,
    soloEtichetta: true,
    segmenti: undefined,
    speculare
  });

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

describe('pezziDaProgetto con una copia speculare', () => {
  it('la gemella ribaltata è un pezzo A SÉ, con la falda dall’altra parte', async () => {
    await db.annotazioni.bulkPut([falda('o'), richiamo('c', true)]);
    const pezzi = await pezziDaProgetto('p1');

    expect(pezzi).toHaveLength(2);
    const dritta = pezzi.find((p) => !p.nome.includes('%'))!;
    const gemella = pezzi.find((p) => p.nome.includes('%'))!;
    expect(dritta.quantita).toBe(1);
    expect(gemella.quantita).toBe(1);

    // stesse misure…
    expect(dritta.sagoma?.forma).toBe('trapezioR');
    expect(gemella.sagoma?.forma).toBe('trapezioR');
    expect(dritta.sagoma!.d1).toBe(gemella.sagoma!.d1);
    // …e le due altezze scambiate: è questo che le rende diverse
    expect(gemella.sagoma!.d2).toBe(dritta.sagoma!.d3);
    expect(gemella.sagoma!.d3).toBe(dritta.sagoma!.d2);
  });

  it('due copie DRITTE restano un pezzo solo in quantità due, come prima', async () => {
    await db.annotazioni.bulkPut([falda('o'), richiamo('c', false)]);
    const pezzi = await pezziDaProgetto('p1');
    expect(pezzi).toHaveLength(1);
    expect(pezzi[0].quantita).toBe(2);
  });

  it('tre finestre, due dritte e una specchiata: due voci, 2 + 1', async () => {
    await db.annotazioni.bulkPut([falda('o'), richiamo('c1', false), richiamo('c2', true)]);
    const pezzi = await pezziDaProgetto('p1');
    expect(pezzi).toHaveLength(2);
    const perNome = Object.fromEntries(pezzi.map((p) => [p.nome.includes('%'), p.quantita]));
    expect(perNome.false).toBe(2);
    expect(perNome.true).toBe(1);
  });
});
