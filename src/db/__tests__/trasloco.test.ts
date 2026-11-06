import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  aggiungiFoto,
  aggiornaFoto,
  creaProgetto,
  creaSezione,
  duplicaProgetto,
  duplicaSezioneInProgetto,
  salvaAnnotazioniFoto,
  spostaFotoInProgetto,
  spostaSezioneInProgetto
} from '../repository';
import type { Foto, Quota } from '../types';

/**
 * TRASLOCHI: FOTO E SEZIONI CHE CAMBIANO PROGETTO.
 *
 * Capita di scattare venti foto nel progetto sbagliato e accorgersene dopo:
 * finché non si potevano spostare, l'unica strada era rifare il lavoro.
 *
 * Quello che va tenuto fermo è che non resti MAI un riferimento a vuoto. Una
 * foto di dettaglio punta a un'altra foto dello stesso progetto, una pianta
 * alla foto da cui è nata, un piano prospettico alle forme da cui è stato
 * ricavato: portandone via una sola, l'altro capo del legame resta di là. In
 * uno spostamento il legame si scioglie, in una copia segue le copie.
 */

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

const quota = (fotoId: string, id: string): Quota => ({
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
});

const progetto = (nome: string) => creaProgetto({ nome, cliente: '', luogo: '' }, null);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('una foto che cambia progetto', () => {
  it('arriva nell’altro progetto, in fondo alla fila', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    await aggiungiFoto(b.id, datiFoto()); // in arrivo c'è già una foto
    const f = await aggiungiFoto(a.id, datiFoto());

    const esito = await spostaFotoInProgetto(f.id, b.id);

    expect(esito.foto).toBe(1);
    const mossa = await db.foto.get(f.id);
    expect(mossa?.progettoId).toBe(b.id);
    expect(mossa?.ordine).toBe(1);
    expect(await db.foto.where('progettoId').equals(a.id).count()).toBe(0);
  });

  it('si porta dietro le sue annotazioni: sono la misura, non un contorno', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const f = await aggiungiFoto(a.id, datiFoto());
    await salvaAnnotazioniFoto(f.id, [quota(f.id, 'q1'), quota(f.id, 'q2')]);

    await spostaFotoInProgetto(f.id, b.id);

    expect(await db.annotazioni.where('fotoId').equals(f.id).count()).toBe(2);
  });

  it('può arrivare dentro una sezione del progetto di destinazione', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const piano = await creaSezione(b.id, 'Piano 2', 'P2');
    const f = await aggiungiFoto(a.id, datiFoto());

    await spostaFotoInProgetto(f.id, b.id, piano.id);

    expect((await db.foto.get(f.id))?.sezioneId).toBe(piano.id);
  });

  it('non si porta dietro la sezione di partenza: lì non esiste', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const sez = await creaSezione(a.id, 'Piano 1');
    const f = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });

    await spostaFotoInProgetto(f.id, b.id);

    expect((await db.foto.get(f.id))?.sezioneId).toBeUndefined();
  });

  it('una sezione che non è del progetto di arrivo non vale', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const sezioneDiA = await creaSezione(a.id, 'Piano 1');
    const f = await aggiungiFoto(a.id, datiFoto());

    await spostaFotoInProgetto(f.id, b.id, sezioneDiA.id);

    expect((await db.foto.get(f.id))?.sezioneId).toBeUndefined();
  });

  it('il dettaglio che parte da solo non resta attaccato a una foto di un altro progetto', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const principale = await aggiungiFoto(a.id, datiFoto());
    const dettaglio = await aggiungiFoto(a.id, {
      ...datiFoto(),
      dettaglioDi: { fotoId: principale.id, etichettaId: 'et1', lettera: 'A' }
    });

    const esito = await spostaFotoInProgetto(dettaglio.id, b.id);

    expect(esito.legamiSciolti).toBe(1);
    expect((await db.foto.get(dettaglio.id))?.dettaglioDi).toBeUndefined();
  });

  it('e nemmeno chi resta resta attaccato a chi è partito', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const principale = await aggiungiFoto(a.id, datiFoto());
    const dettaglio = await aggiungiFoto(a.id, {
      ...datiFoto(),
      dettaglioDi: { fotoId: principale.id, etichettaId: 'et1', lettera: 'A' }
    });
    const pianta = await aggiungiFoto(a.id, { ...datiFoto(), ePianta: true, piantaDi: principale.id });

    const esito = await spostaFotoInProgetto(principale.id, b.id);

    expect(esito.legamiSciolti).toBe(2);
    expect((await db.foto.get(dettaglio.id))?.dettaglioDi).toBeUndefined();
    expect((await db.foto.get(pianta.id))?.piantaDi).toBeUndefined();
  });

  it('nello stesso progetto è solo un cambio di sezione', async () => {
    const a = await progetto('Unico');
    const sez = await creaSezione(a.id, 'Piano 1');
    const f = await aggiungiFoto(a.id, datiFoto());

    await spostaFotoInProgetto(f.id, a.id, sez.id);
    expect((await db.foto.get(f.id))?.sezioneId).toBe(sez.id);
    expect((await db.foto.get(f.id))?.ordine).toBe(0); // non si rimette in coda
  });

  it('su un progetto che non esiste non si sposta niente', async () => {
    const a = await progetto('Partenza');
    const f = await aggiungiFoto(a.id, datiFoto());
    await expect(spostaFotoInProgetto(f.id, 'progetto-inventato')).rejects.toThrow();
    expect((await db.foto.get(f.id))?.progettoId).toBe(a.id);
  });
});

describe('una sezione che cambia progetto', () => {
  it('porta con sé le sue foto e si ricrea di là', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const sez = await creaSezione(a.id, 'Piano 1', 'P1');
    const f1 = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });
    const f2 = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });
    const fuori = await aggiungiFoto(a.id, datiFoto());

    const esito = await spostaSezioneInProgetto(a.id, sez.id, b.id);

    expect(esito.foto).toBe(2);
    const dest = await db.progetti.get(b.id);
    const nuova = (dest?.sezioni ?? [])[0];
    expect(nuova?.nome).toBe('Piano 1');
    expect(nuova?.etichetta).toBe('P1');
    for (const f of [f1, f2]) {
      const m = await db.foto.get(f.id);
      expect(m?.progettoId).toBe(b.id);
      expect(m?.sezioneId).toBe(nuova.id);
    }
    // la foto fuori sezione resta dov'era
    expect((await db.foto.get(fuori.id))?.progettoId).toBe(a.id);
    // e la sezione svuotata non resta in giro
    expect((await db.progetti.get(a.id))?.sezioni).toHaveLength(0);
  });

  it('se di là c’è già una sezione con lo stesso nome, le foto vanno lì', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const qua = await creaSezione(a.id, 'Piano 1');
    const la = await creaSezione(b.id, 'piano 1'); // stesso nome, altra scrittura
    const f = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: qua.id });

    await spostaSezioneInProgetto(a.id, qua.id, b.id);

    expect((await db.progetti.get(b.id))?.sezioni).toHaveLength(1);
    expect((await db.foto.get(f.id))?.sezioneId).toBe(la.id);
  });

  it('i legami interni alla sezione sopravvivono: partono insieme', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const sez = await creaSezione(a.id, 'Piano 1');
    const principale = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });
    const dettaglio = await aggiungiFoto(a.id, {
      ...datiFoto(),
      sezioneId: sez.id,
      dettaglioDi: { fotoId: principale.id, etichettaId: 'et1', lettera: 'A' }
    });

    const esito = await spostaSezioneInProgetto(a.id, sez.id, b.id);

    expect(esito.legamiSciolti).toBe(0);
    expect((await db.foto.get(dettaglio.id))?.dettaglioDi?.fotoId).toBe(principale.id);
  });

  it('con null si spostano le foto che non stanno in nessuna sezione', async () => {
    const a = await progetto('Partenza');
    const b = await progetto('Arrivo');
    const sez = await creaSezione(a.id, 'Piano 1');
    const dentro = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });
    const sciolta = await aggiungiFoto(a.id, datiFoto());
    const pianta = await aggiungiFoto(a.id, { ...datiFoto(), ePianta: true });

    const esito = await spostaSezioneInProgetto(a.id, null, b.id);

    expect(esito.foto).toBe(1);
    expect((await db.foto.get(sciolta.id))?.progettoId).toBe(b.id);
    // la sezione vera e le piante non si muovono
    expect((await db.foto.get(dentro.id))?.progettoId).toBe(a.id);
    expect((await db.foto.get(pianta.id))?.progettoId).toBe(a.id);
    expect((await db.progetti.get(a.id))?.sezioni).toHaveLength(1);
  });

  it('non si sposta una sezione dentro il progetto dov’è già', async () => {
    const a = await progetto('Unico');
    const sez = await creaSezione(a.id, 'Piano 1');
    await expect(spostaSezioneInProgetto(a.id, sez.id, a.id)).rejects.toThrow();
  });
});

describe('una sezione duplicata in un altro progetto', () => {
  it('le foto restano anche di qua, e di là sono copie nuove', async () => {
    const a = await progetto('Modello');
    const b = await progetto('Nuovo lavoro');
    const sez = await creaSezione(a.id, 'Piano tipo', 'PT');
    const f = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });
    await salvaAnnotazioniFoto(f.id, [quota(f.id, 'q1')]);

    const esito = await duplicaSezioneInProgetto(a.id, sez.id, b.id);

    expect(esito.foto).toBe(1);
    expect((await db.foto.get(f.id))?.progettoId).toBe(a.id); // l'originale resta
    const copie = await db.foto.where('progettoId').equals(b.id).toArray();
    expect(copie).toHaveLength(1);
    expect(copie[0].id).not.toBe(f.id);
    // le annotazioni sono copiate, con id nuovi e attaccate alla copia
    const ann = await db.annotazioni.where('fotoId').equals(copie[0].id).toArray();
    expect(ann).toHaveLength(1);
    expect(ann[0].id).not.toBe('q1');
  });

  it('i legami della copia puntano alle copie, non agli originali', async () => {
    const a = await progetto('Modello');
    const b = await progetto('Nuovo lavoro');
    const sez = await creaSezione(a.id, 'Piano tipo');
    const principale = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });
    await salvaAnnotazioniFoto(principale.id, [quota(principale.id, 'et1')]);
    await aggiungiFoto(a.id, {
      ...datiFoto(),
      sezioneId: sez.id,
      dettaglioDi: { fotoId: principale.id, etichettaId: 'et1', lettera: 'A' }
    });

    await duplicaSezioneInProgetto(a.id, sez.id, b.id);

    const copie = await db.foto.where('progettoId').equals(b.id).toArray();
    const copiaDettaglio = copie.find((f) => f.dettaglioDi);
    const copiaPrincipale = copie.find((f) => !f.dettaglioDi);
    expect(copiaDettaglio?.dettaglioDi?.fotoId).toBe(copiaPrincipale?.id);
    expect(copiaDettaglio?.dettaglioDi?.fotoId).not.toBe(principale.id);
    // anche l'etichetta puntata è quella della COPIA
    const annCopia = await db.annotazioni.where('fotoId').equals(copiaPrincipale!.id).toArray();
    expect(copiaDettaglio?.dettaglioDi?.etichettaId).toBe(annCopia[0].id);
  });

  it('il piano prospettico della copia segue le forme copiate', async () => {
    const a = await progetto('Modello');
    const b = await progetto('Nuovo lavoro');
    const sez = await creaSezione(a.id, 'Piano tipo');
    const f = await aggiungiFoto(a.id, { ...datiFoto(), sezioneId: sez.id });
    await salvaAnnotazioniFoto(f.id, [quota(f.id, 'forma1')]);
    await aggiornaFoto(f.id, {
      piano: {
        punti: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 }
        ],
        larghezzaReale: 100,
        altezzaReale: 100,
        unita: 'cm',
        origini: ['forma1']
      }
    });

    await duplicaSezioneInProgetto(a.id, sez.id, b.id);

    const copia = (await db.foto.where('progettoId').equals(b.id).toArray())[0];
    const annCopia = await db.annotazioni.where('fotoId').equals(copia.id).toArray();
    expect(copia.piano?.origini).toEqual([annCopia[0].id]);
    expect(copia.piano?.origini).not.toEqual(['forma1']);
  });

  it('un legame che usciva dalla sezione si scioglie, e si sa quanti', async () => {
    const a = await progetto('Modello');
    const b = await progetto('Nuovo lavoro');
    const sez = await creaSezione(a.id, 'Piano tipo');
    const fuori = await aggiungiFoto(a.id, datiFoto());
    await aggiungiFoto(a.id, {
      ...datiFoto(),
      sezioneId: sez.id,
      dettaglioDi: { fotoId: fuori.id, etichettaId: 'et1', lettera: 'A' }
    });

    const esito = await duplicaSezioneInProgetto(a.id, sez.id, b.id);

    expect(esito.legamiSciolti).toBe(1);
    const copia = (await db.foto.where('progettoId').equals(b.id).toArray())[0];
    expect(copia.dettaglioDi).toBeUndefined();
  });
});

describe('duplicare un progetto intero', () => {
  it('anche lì le copie puntano alle copie', async () => {
    // stesso difetto, stessa correzione: la pianta copiata restava attaccata
    // alla foto del progetto di partenza
    const a = await progetto('Modello');
    const principale = await aggiungiFoto(a.id, datiFoto());
    await aggiungiFoto(a.id, { ...datiFoto(), ePianta: true, piantaDi: principale.id });

    const copia = await duplicaProgetto(a.id);

    const copie = await db.foto.where('progettoId').equals(copia.id).toArray();
    const piantaCopia = copie.find((f) => f.ePianta);
    const principaleCopia = copie.find((f) => !f.ePianta);
    expect(piantaCopia?.piantaDi).toBe(principaleCopia?.id);
    expect(piantaCopia?.piantaDi).not.toBe(principale.id);
  });
});
