import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  aggiungiFoto,
  contaPorte,
  creaProgetto,
  duplicaProgetto,
  eliminaPorta,
  eliminaProgetto,
  portePerProgetto,
  prossimaLetteraPorta,
  salvaAnnotazioniFoto,
  salvaPorta
} from '../repository';
import type { Etichetta, Foto } from '../types';

function datiFoto(): Omit<Foto, 'id' | 'progettoId' | 'ordine' | 'creataIl' | 'modificataIl'> {
  return {
    origine: new TextEncoder().encode('jpeg-finto').buffer as ArrayBuffer,
    origineTipo: 'image/jpeg',
    miniatura: new TextEncoder().encode('mini').buffer as ArrayBuffer,
    miniaturaTipo: 'image/jpeg',
    larghezzaPx: 2000,
    altezzaPx: 1500,
    dataScatto: Date.now(),
    geotag: null,
    didascalia: '',
    noteDato: '',
    scala: null
  };
}

function etichettaPorta(fotoId: string, id: string, portaId: string, extra: Partial<Etichetta> = {}): Etichetta {
  return {
    id,
    fotoId,
    tipo: 'etichetta',
    posizione: { x: 10, y: 10 },
    lettera: 'Porta A',
    portaId,
    zIndex: 1,
    stile: { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 },
    ...extra
  };
}

const riga = { nome: 'Coprifilo esterno · traverso', larghezza: 80, lunghezza: 1020, anta: false };

beforeEach(async () => {
  await Promise.all([db.progetti.clear(), db.foto.clear(), db.annotazioni.clear(), db.porte.clear()]);
});

describe('porte del rilievo porta', () => {
  it('le lettere seguono A…Z, poi AA, AB', () => {
    expect(prossimaLetteraPorta([])).toBe('A');
    expect(prossimaLetteraPorta(['A', 'B'])).toBe('C');
    expect(prossimaLetteraPorta(['A', 'C'])).toBe('B');
    const tutte = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    expect(prossimaLetteraPorta(tutte)).toBe('AA');
  });

  it('una porta nuova prende la lettera, un aggiornamento la tiene', async () => {
    const p = await creaProgetto({ nome: 'Hotel', cliente: '', luogo: '' }, null);
    const a = await salvaPorta({ progettoId: p.id, descrizione: 'A', config: { v: 1 }, righe: [riga] });
    const b = await salvaPorta({ progettoId: p.id, descrizione: 'B', config: { v: 2 }, righe: [riga] });
    expect([a.nome, b.nome]).toEqual(['Porta A', 'Porta B']);
    const a2 = await salvaPorta({ id: a.id, progettoId: p.id, descrizione: 'A2', config: { v: 3 }, righe: [] });
    expect(a2.nome).toBe('Porta A');
    expect((await portePerProgetto(p.id)).map((x) => x.descrizione)).toEqual(['A2', 'B']);
  });

  it('il numero di porte viene dalle etichette, col moltiplicatore', async () => {
    const p = await creaProgetto({ nome: 'Hotel', cliente: '', luogo: '' }, null);
    const a = await salvaPorta({ progettoId: p.id, descrizione: '', config: {}, righe: [riga] });
    const f1 = await aggiungiFoto(p.id, datiFoto());
    const f2 = await aggiungiFoto(p.id, datiFoto());
    await salvaAnnotazioniFoto(f1.id, [etichettaPorta(f1.id, 'e1', a.id, { rilievo: true })]);
    await salvaAnnotazioniFoto(f2.id, [
      etichettaPorta(f2.id, 'e2', a.id, { moltiplicatore: 12 }),
      etichettaPorta(f2.id, 'e3', a.id)
    ]);
    expect((await contaPorte(p.id)).get(a.id)).toBe(14);
  });

  it('eliminare una porta toglie anche le sue etichette', async () => {
    const p = await creaProgetto({ nome: 'Hotel', cliente: '', luogo: '' }, null);
    const a = await salvaPorta({ progettoId: p.id, descrizione: '', config: {}, righe: [] });
    const f = await aggiungiFoto(p.id, datiFoto());
    await salvaAnnotazioniFoto(f.id, [etichettaPorta(f.id, 'e1', a.id)]);
    await eliminaPorta(a.id);
    expect(await db.porte.count()).toBe(0);
    expect(await db.annotazioni.count()).toBe(0);
  });

  it('la copia del progetto ha porte sue, e le etichette puntano a quelle', async () => {
    const p = await creaProgetto({ nome: 'Hotel', cliente: '', luogo: '' }, null);
    const f = await aggiungiFoto(p.id, datiFoto());
    const a = await salvaPorta({ progettoId: p.id, descrizione: '', config: { v: 1 }, righe: [riga], fotoRilievoId: f.id });
    await salvaAnnotazioniFoto(f.id, [etichettaPorta(f.id, 'e1', a.id, { rilievo: true })]);
    const copia = await duplicaProgetto(p.id);
    const [pc] = await portePerProgetto(copia.id);
    expect(pc.id).not.toBe(a.id);
    expect(pc.nome).toBe('Porta A');
    const fotoCopia = await db.foto.where('progettoId').equals(copia.id).toArray();
    expect(pc.fotoRilievoId).toBe(fotoCopia[0].id);
    expect((await contaPorte(copia.id)).get(pc.id)).toBe(1);
    // eliminando il progetto originale, la copia resta intera
    await eliminaProgetto(p.id);
    expect(await portePerProgetto(copia.id)).toHaveLength(1);
    expect(await portePerProgetto(p.id)).toHaveLength(0);
  });
});
