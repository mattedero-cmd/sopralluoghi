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
  nestingInCartella,
  pdfDaRifare,
  prossimoNumeroPreventivo,
  rinominaNesting,
  disegniInCartella,
  eliminaDisegno,
  leggiDisegno,
  rinominaDisegno,
  salvaDisegno,
  spostaDisegno,
  salvaNesting,
  salvaPdfNesting,
  spostaNesting,
  spostaProgetto,
  nestingInProgetto,
  disegniInProgetto,
  dentroProgetto,
  salvaAnnotazioniFoto,
  spostaCartella,
  totaliPreventivo
} from '../repository';
import { costruisciIndice } from '../backup';
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

describe('lavori di nesting in archivio', () => {
  it('nasce nella cartella indicata e ci resta', async () => {
    const c = await creaCartella('Camera Rossi', null);
    await salvaNesting('n1', 'Taglio camera', { versione: 2, materiali: [] }, {
      cartellaId: c.id
    });
    expect((await nestingInCartella(c.id)).map((l) => l.nome)).toEqual(['Taglio camera']);
    expect(await nestingInCartella(null)).toEqual([]);
  });

  it('il salvataggio successivo non perde la cartella né la data di creazione', async () => {
    const primo = await salvaNesting('n2', 'Taglio', { a: 1 }, { cartellaId: 'cart' });
    const dopo = await salvaNesting('n2', 'Taglio rinominato', { a: 2 });
    expect(dopo.cartellaId).toBe('cart');
    expect(dopo.creatoIl).toBe(primo.creatoIl);
    expect(dopo.documento).toEqual({ a: 2 });
  });

  it('«non so dov’è» lascia il lavoro dov’è, «radice» invece lo sposta', async () => {
    // la distinzione che tiene il piano di taglio nella cartella del progetto:
    // chi salva senza sapere la cartella non deve dire «radice» per sbaglio
    await salvaNesting('n5', 'Taglio', { a: 1 }, { cartellaId: 'cart' });
    expect((await salvaNesting('n5', 'Taglio', { a: 2 }, { pdf: undefined })).cartellaId).toBe(
      'cart'
    );
    expect((await salvaNesting('n5', 'Taglio', { a: 3 }, { cartellaId: null })).cartellaId).toBe(
      null
    );
  });

  it('il PDF resta finché non ne arriva uno nuovo, e la data dice se è vecchio', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await salvaNesting('n3', 'Taglio', { a: 1 }, { pdf });
    const conPdf = await db.nesting.get('n3');
    expect(conPdf?.pdf).toBeInstanceOf(Blob);
    expect(conPdf!.pdfIl).toBe(conPdf!.modificatoIl);

    // una modifica senza nuovo PDF: il vecchio resta ma risulta da rifare
    await new Promise((r) => setTimeout(r, 2));
    await salvaNesting('n3', 'Taglio', { a: 2 });
    const dopo = await db.nesting.get('n3');
    expect(dopo?.pdf).toBeInstanceOf(Blob);
    expect(dopo!.pdfIl!).toBeLessThan(dopo!.modificatoIl);

    // rigenerato: torna allineato
    await salvaPdfNesting('n3', new Blob(['%PDF-1.4 nuovo']), 'build-1');
    const rifatto = await db.nesting.get('n3');
    expect(rifatto!.pdfIl!).toBeGreaterThanOrEqual(rifatto!.modificatoIl);
    expect(rifatto!.pdfApp).toBe('build-1');
  });

  it('spostare e rinominare non toccano il documento', async () => {
    await salvaNesting('n4', 'Taglio', { materiali: ['x'] }, { cartellaId: null });
    await spostaNesting('n4', { cartellaId: 'altra', progettoId: null });
    await rinominaNesting('n4', 'Nuovo nome');
    const l = await db.nesting.get('n4');
    expect(l).toMatchObject({ cartellaId: 'altra', nome: 'Nuovo nome' });
    expect(l!.documento).toEqual({ materiali: ['x'] });
  });

  it('un PDF fatto da una build precedente va rifatto, anche senza modifiche', async () => {
    await salvaNesting('n6', 'Taglio', { a: 1 });
    await salvaPdfNesting('n6', new Blob(['%PDF']), 'build-1');
    const l = (await db.nesting.get('n6'))!;
    expect(pdfDaRifare(l, 'build-1')).toBe(false);
    // l'app è stata aggiornata: il disegno può essere cambiato
    expect(pdfDaRifare(l, 'build-2')).toBe(true);
    // e senza PDF si rifà comunque
    expect(pdfDaRifare({ ...l, pdf: undefined }, 'build-1')).toBe(true);
    // così come dopo una modifica al lavoro
    expect(pdfDaRifare({ ...l, modificatoIl: l.pdfIl! + 1 }, 'build-1')).toBe(true);
  });

  it('il backup non porta con sé il Blob del PDF, che in JSON andrebbe perso', async () => {
    await salvaNesting('n5', 'Taglio', { a: 1 }, {
      pdf: new Blob(['%PDF'], { type: 'application/pdf' })
    });
    const indice = await costruisciIndice();
    const voce = indice.nesting?.find((l) => l.id === 'n5');
    expect(voce).toBeTruthy();
    expect(voce).not.toHaveProperty('pdf');
    // e ciò che resta sopravvive a un giro in JSON
    const giro = JSON.parse(JSON.stringify(indice.nesting));
    expect(giro.find((l: { id: string }) => l.id === 'n5').documento).toEqual({ a: 1 });
  });
});

describe('disegni SVG in archivio', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1220mm" height="500mm"></svg>';

  beforeEach(async () => {
    await db.disegni.clear();
  });

  it('il disegno si salva con le sue misure e si ritrova nella cartella', async () => {
    await salvaDisegno('d1', 'Taglio rovere', SVG, {
      cartellaId: 'cart',
      larghezzaMm: 1220,
      altezzaMm: 500,
      misureReali: true,
      origine: 'taglio'
    });
    const dentro = await disegniInCartella('cart');
    expect(dentro.map((d) => d.nome)).toEqual(['Taglio rovere']);
    expect(dentro[0]).toMatchObject({ larghezzaMm: 1220, altezzaMm: 500, origine: 'taglio' });
    expect(await disegniInCartella(null)).toEqual([]);
  });

  it('il file si conserva identico: è quello che va in macchina', async () => {
    await salvaDisegno('d2', 'Disegno', SVG, { cartellaId: null });
    expect((await leggiDisegno('d2'))!.svg).toBe(SVG);
  });

  it('«non so dov’è» lascia il disegno dov’è, «radice» lo sposta', async () => {
    await salvaDisegno('d3', 'Disegno', SVG, { cartellaId: 'cart' });
    expect((await salvaDisegno('d3', 'Disegno', SVG)).cartellaId).toBe('cart');
    expect((await salvaDisegno('d3', 'Disegno', SVG, { cartellaId: null })).cartellaId).toBe(null);
  });

  it('si rinomina, si sposta e si elimina', async () => {
    await salvaDisegno('d4', 'Vecchio', SVG, { cartellaId: null });
    await rinominaDisegno('d4', 'Nuovo');
    await spostaDisegno('d4', { cartellaId: 'altra', progettoId: null });
    expect(await leggiDisegno('d4')).toMatchObject({ nome: 'Nuovo', cartellaId: 'altra' });
    await eliminaDisegno('d4');
    expect(await leggiDisegno('d4')).toBeUndefined();
  });

  it('la data di creazione non si perde a ogni salvataggio', async () => {
    const primo = await salvaDisegno('d5', 'Disegno', SVG, { cartellaId: null });
    await new Promise((r) => setTimeout(r, 2));
    const dopo = await salvaDisegno('d5', 'Disegno', SVG);
    expect(dopo.creatoIl).toBe(primo.creatoIl);
    expect(dopo.modificatoIl).toBeGreaterThan(primo.creatoIl - 1);
  });
});

/**
 * DENTRO UN PROGETTO. L'archivio ha due contenitori, non uno: le cartelle e i
 * progetti. Un piano di taglio o un disegno archiviato dentro un sopralluogo
 * si trova aprendo quel sopralluogo, e non compare più fra i file sciolti
 * della cartella.
 */
describe('piani e disegni dentro un progetto', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm"></svg>';

  beforeEach(async () => {
    await Promise.all([db.nesting.clear(), db.disegni.clear()]);
  });

  it('quello che sta dentro un progetto non è più sciolto nella cartella', async () => {
    const c = await creaCartella('Rossi', null);
    const p = await creaProgetto({ nome: 'Cucina', cliente: '', luogo: '' }, c.id);
    await salvaNesting('n1', 'Taglio', { materiali: [] }, {
      cartellaId: c.id,
      progettoId: p.id
    });
    await salvaDisegno('d1', 'Disegno', SVG, { cartellaId: c.id, progettoId: p.id });

    expect(await nestingInCartella(c.id)).toEqual([]);
    expect(await disegniInCartella(c.id)).toEqual([]);
    expect((await nestingInProgetto(p.id)).map((l) => l.nome)).toEqual(['Taglio']);
    expect((await disegniInProgetto(p.id)).map((d) => d.nome)).toEqual(['Disegno']);
  });

  it('si sposta dentro e si tira fuori, e la cartella resta segnata', async () => {
    const c = await creaCartella('Rossi', null);
    const p = await creaProgetto({ nome: 'Cucina', cliente: '', luogo: '' }, c.id);
    await salvaNesting('n2', 'Taglio', { materiali: [] }, { cartellaId: c.id });
    expect((await nestingInCartella(c.id)).map((l) => l.id)).toEqual(['n2']);

    await spostaNesting('n2', await dentroProgetto(p.id));
    expect(await nestingInCartella(c.id)).toEqual([]);
    expect((await nestingInProgetto(p.id)).map((l) => l.id)).toEqual(['n2']);
    // la cartella resta segnata: serve a ritrovarlo se il progetto sparisce
    expect((await db.nesting.get('n2'))!.cartellaId).toBe(c.id);

    await spostaNesting('n2', { cartellaId: c.id, progettoId: null });
    expect((await nestingInCartella(c.id)).map((l) => l.id)).toEqual(['n2']);
    expect(await nestingInProgetto(p.id)).toEqual([]);
  });

  it('spostando il progetto, quello che ha dentro lo segue', async () => {
    const a = await creaCartella('A', null);
    const b = await creaCartella('B', null);
    const p = await creaProgetto({ nome: 'Cucina', cliente: '', luogo: '' }, a.id);
    await salvaNesting('n3', 'Taglio', { materiali: [] }, await dentroProgetto(p.id));
    await spostaProgetto(p.id, b.id);
    expect((await db.nesting.get('n3'))!.cartellaId).toBe(b.id);
    expect((await nestingInProgetto(p.id)).map((l) => l.id)).toEqual(['n3']);
  });

  it('eliminando il progetto il lavoro NON si butta: torna sciolto nella cartella', async () => {
    const c = await creaCartella('Rossi', null);
    const p = await creaProgetto({ nome: 'Cucina', cliente: '', luogo: '' }, c.id);
    await salvaNesting('n4', 'Taglio', { materiali: ['x'] }, await dentroProgetto(p.id));
    await salvaDisegno('d4', 'Disegno', SVG, await dentroProgetto(p.id));

    await eliminaProgetto(p.id);

    expect((await nestingInCartella(c.id)).map((l) => l.id)).toEqual(['n4']);
    expect((await disegniInCartella(c.id)).map((d) => d.id)).toEqual(['d4']);
    expect((await db.nesting.get('n4'))!.documento).toEqual({ materiali: ['x'] });
  });
});
