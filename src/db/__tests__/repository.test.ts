import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  aggiungiFoto,
  creaCartella,
  creaProgetto,
  duplicaProgetto,
  eliminaCartella,
  eliminaProgetto,
  salvaAnnotazioniFoto,
  spostaCartella
} from '../repository';
import type { Foto, Quota } from '../types';

function datiFoto(): Omit<Foto, 'id' | 'progettoId' | 'ordine' | 'creataIl' | 'modificataIl'> {
  return {
    blobOriginale: new Blob(['jpeg-finto'], { type: 'image/jpeg' }),
    miniatura: new Blob(['mini'], { type: 'image/jpeg' }),
    larghezzaPx: 2000,
    altezzaPx: 1500,
    dataScatto: Date.now(),
    geotag: null,
    didascalia: '',
    noteDato: '',
    scala: null
  };
}

function quotaPer(fotoId: string, id = 'q1'): Quota {
  return {
    id,
    fotoId,
    tipo: 'quota',
    sottotipo: 'orizzontale',
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    offset: 40,
    valore: 50,
    unita: 'cm',
    posizioneTesto: 'sopra',
    stato: 'reale',
    zIndex: 1,
    stile: { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 }
  };
}

beforeEach(async () => {
  await Promise.all([
    db.cartelle.clear(),
    db.progetti.clear(),
    db.foto.clear(),
    db.annotazioni.clear(),
    db.impostazioni.clear()
  ]);
});

describe('relazioni e integrità', () => {
  it('la foto è sempre collegata a un progetto esistente', async () => {
    await expect(aggiungiFoto('progetto-inesistente', datiFoto())).rejects.toThrow();
    expect(await db.foto.count()).toBe(0);
  });

  it('le annotazioni devono appartenere alla foto indicata', async () => {
    const p = await creaProgetto({ nome: 'Test', cliente: '', luogo: '' }, null);
    const f = await aggiungiFoto(p.id, datiFoto());
    await expect(salvaAnnotazioniFoto(f.id, [quotaPer('altra-foto')])).rejects.toThrow();
    expect(await db.annotazioni.count()).toBe(0);
  });

  it("l'ordine delle foto è progressivo nel progetto", async () => {
    const p = await creaProgetto({ nome: 'Test', cliente: '', luogo: '' }, null);
    const f1 = await aggiungiFoto(p.id, datiFoto());
    const f2 = await aggiungiFoto(p.id, datiFoto());
    expect(f1.ordine).toBe(0);
    expect(f2.ordine).toBe(1);
  });
});

describe('eliminazione in cascata', () => {
  it('eliminaProgetto rimuove foto e annotazioni', async () => {
    const p = await creaProgetto({ nome: 'Test', cliente: '', luogo: '' }, null);
    const f = await aggiungiFoto(p.id, datiFoto());
    await salvaAnnotazioniFoto(f.id, [quotaPer(f.id)]);
    await eliminaProgetto(p.id);
    expect(await db.progetti.count()).toBe(0);
    expect(await db.foto.count()).toBe(0);
    expect(await db.annotazioni.count()).toBe(0);
  });

  it('eliminaCartella rimuove ricorsivamente cartelle annidate e contenuti', async () => {
    const radice = await creaCartella('Radice', null);
    const figlia = await creaCartella('Figlia', radice.id);
    const p = await creaProgetto({ nome: 'Annidato', cliente: '', luogo: '' }, figlia.id);
    const f = await aggiungiFoto(p.id, datiFoto());
    await salvaAnnotazioniFoto(f.id, [quotaPer(f.id)]);
    await eliminaCartella(radice.id);
    expect(await db.cartelle.count()).toBe(0);
    expect(await db.progetti.count()).toBe(0);
    expect(await db.foto.count()).toBe(0);
    expect(await db.annotazioni.count()).toBe(0);
  });
});

describe('spostamenti e duplicazione', () => {
  it('impedisce di spostare una cartella dentro una sua discendente', async () => {
    const a = await creaCartella('A', null);
    const b = await creaCartella('B', a.id);
    await expect(spostaCartella(a.id, b.id)).rejects.toThrow();
    expect((await db.cartelle.get(a.id))?.parentId).toBeNull();
  });

  it('duplicaProgetto copia foto e annotazioni con nuovi id e relazioni corrette', async () => {
    const p = await creaProgetto({ nome: 'Originale', cliente: 'C', luogo: 'L' }, null);
    const f = await aggiungiFoto(p.id, datiFoto());
    await salvaAnnotazioniFoto(f.id, [quotaPer(f.id)]);

    const copia = await duplicaProgetto(p.id);
    expect(copia.id).not.toBe(p.id);
    expect(copia.nome).toContain('copia');

    const fotoCopia = await db.foto.where('progettoId').equals(copia.id).toArray();
    expect(fotoCopia).toHaveLength(1);
    expect(fotoCopia[0].id).not.toBe(f.id);

    const annCopia = await db.annotazioni.where('fotoId').equals(fotoCopia[0].id).toArray();
    expect(annCopia).toHaveLength(1);
    expect(annCopia[0].fotoId).toBe(fotoCopia[0].id);

    // l'originale è intatto
    expect(await db.foto.where('progettoId').equals(p.id).count()).toBe(1);
    expect(await db.annotazioni.where('fotoId').equals(f.id).count()).toBe(1);
  });
});

describe('autosave annotazioni', () => {
  it('salvaAnnotazioniFoto sostituisce lo stato in modo atomico e idempotente', async () => {
    const p = await creaProgetto({ nome: 'Test', cliente: '', luogo: '' }, null);
    const f = await aggiungiFoto(p.id, datiFoto());
    await salvaAnnotazioniFoto(f.id, [quotaPer(f.id, 'a'), quotaPer(f.id, 'b')]);
    expect(await db.annotazioni.count()).toBe(2);
    // undo: si torna a una sola annotazione
    await salvaAnnotazioniFoto(f.id, [quotaPer(f.id, 'a')]);
    expect(await db.annotazioni.count()).toBe(1);
    // redo / risalvataggio identico
    await salvaAnnotazioniFoto(f.id, [quotaPer(f.id, 'a')]);
    expect(await db.annotazioni.count()).toBe(1);
  });
});
