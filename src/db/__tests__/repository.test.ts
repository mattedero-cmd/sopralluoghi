import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  aggiornaCliente,
  aggiungiFoto,
  creaCartella,
  creaCliente,
  creaPreventivo,
  creaProgetto,
  duplicaProgetto,
  eliminaCartella,
  eliminaCliente,
  eliminaFoto,
  eliminaProgetto,
  migraFotoLegacy,
  prossimoNumeroPreventivo,
  salvaAnnotazioniFoto,
  spostaCartella,
  totaliPreventivo
} from '../repository';
import type { Foto, Quota } from '../types';

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
    db.impostazioni.clear(),
    db.clienti.clear(),
    db.preventivi.clear()
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

  it('eliminando la foto principale, le foto di dettaglio tornano autonome (non orfane)', async () => {
    const p = await creaProgetto({ nome: 'Test', cliente: '', luogo: '' }, null);
    const principale = await aggiungiFoto(p.id, datiFoto());
    const dettaglio = await aggiungiFoto(p.id, {
      ...datiFoto(),
      dettaglioDi: { fotoId: principale.id, etichettaId: 'et1', lettera: 'A' }
    });
    await eliminaFoto(principale.id);
    const rimasta = await db.foto.get(dettaglio.id);
    expect(rimasta).toBeTruthy();
    // niente più collegamento a una foto inesistente: è una foto normale
    expect(rimasta?.dettaglioDi).toBeUndefined();
    expect(await db.foto.get(principale.id)).toBeUndefined();
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

describe('migrazione foto legacy (Blob → ArrayBuffer)', () => {
  it('converte i record salvati come Blob dalle prime versioni', async () => {
    const p = await creaProgetto({ nome: 'Legacy', cliente: '', luogo: '' }, null);
    const legacy = {
      id: 'foto-legacy',
      progettoId: p.id,
      blobOriginale: new Blob(['vecchio-jpeg'], { type: 'image/jpeg' }),
      miniatura: new Blob(['vecchia-mini'], { type: 'image/jpeg' }),
      larghezzaPx: 100,
      altezzaPx: 100,
      dataScatto: Date.now(),
      geotag: null,
      didascalia: 'legacy',
      noteDato: '',
      scala: null,
      ordine: 0,
      creataIl: Date.now(),
      modificataIl: Date.now()
    };
    await db.foto.put(legacy as never);

    await migraFotoLegacy();

    const migrata = await db.foto.get('foto-legacy');
    expect(migrata).toBeDefined();
    expect(migrata!.origine).toBeInstanceOf(ArrayBuffer);
    expect(migrata!.miniatura).toBeInstanceOf(ArrayBuffer);
    expect(migrata!.origineTipo).toBe('image/jpeg');
    expect('blobOriginale' in migrata!).toBe(false);
    expect(new TextDecoder().decode(migrata!.origine)).toBe('vecchio-jpeg');
    // idempotente: una seconda esecuzione non altera nulla
    await migraFotoLegacy();
    expect(new TextDecoder().decode((await db.foto.get('foto-legacy'))!.miniatura)).toBe(
      'vecchia-mini'
    );
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

describe('anagrafica clienti (Fase 3)', () => {
  it('rinominare un cliente aggiorna il nome denormalizzato sui progetti', async () => {
    const cliente = await creaCliente({ nome: 'Rossi Mario' });
    const p = await creaProgetto(
      { nome: 'Bagno', cliente: cliente.nome, luogo: '', clienteId: cliente.id },
      null
    );
    await aggiornaCliente(cliente.id, { nome: 'Rossi Mario SRL' });
    expect((await db.progetti.get(p.id))?.cliente).toBe('Rossi Mario SRL');
  });

  it('eliminare un cliente scollega progetti e preventivi senza eliminarli', async () => {
    const cliente = await creaCliente({ nome: 'Bianchi' });
    const p = await creaProgetto(
      { nome: 'Tetto', cliente: 'Bianchi', luogo: '', clienteId: cliente.id },
      null
    );
    const prev = await creaPreventivo(p.id, cliente.id);
    await eliminaCliente(cliente.id);
    expect(await db.clienti.count()).toBe(0);
    expect((await db.progetti.get(p.id))?.clienteId).toBeNull();
    expect((await db.preventivi.get(prev.id))?.clienteId).toBeNull();
    expect((await db.progetti.get(p.id))?.cliente).toBe('Bianchi'); // il nome resta
  });
});

describe('preventivi (Fase 3)', () => {
  it('numerazione progressiva per anno', async () => {
    const anno = new Date().getFullYear();
    expect(await prossimoNumeroPreventivo()).toBe(`${anno}-001`);
    await creaPreventivo(null, null);
    expect(await prossimoNumeroPreventivo()).toBe(`${anno}-002`);
  });

  it('eliminare un progetto scollega i preventivi senza eliminarli', async () => {
    const p = await creaProgetto({ nome: 'Casa', cliente: '', luogo: '' }, null);
    const prev = await creaPreventivo(p.id, null);
    await eliminaProgetto(p.id);
    const dopo = await db.preventivi.get(prev.id);
    expect(dopo).toBeDefined();
    expect(dopo?.progettoId).toBeNull();
  });

  it('totali: imponibile, sconto, IVA e totale', () => {
    const totali = totaliPreventivo({
      voci: [
        { id: 'a', descrizione: 'Posa', quantita: 10, unita: 'm²', prezzoUnitario: 25 },
        { id: 'b', descrizione: 'Materiale', quantita: 1, unita: 'corpo', prezzoUnitario: 250 }
      ],
      scontoPercento: 10,
      ivaPercento: 22
    });
    expect(totali.imponibile).toBe(500);
    expect(totali.sconto).toBe(50);
    expect(totali.scontato).toBe(450);
    expect(totali.iva).toBeCloseTo(99);
    expect(totali.totale).toBeCloseTo(549);
  });
});
