import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applicaMetadati, costruisciIndice, type IndiceArchivio } from '../backup';
import { leggiImpostazioni, salvaImpostazioni } from '../repository';
import { IMPOSTAZIONI_DEFAULT, type ConfigCloud, type Foto, type Progetto } from '../types';

function cloud(refreshToken: string): ConfigCloud {
  return { url: 'x', anonKey: 'k', email: 'e', refreshToken, userId: 'u', ultimoBackup: null };
}

function progetto(id: string, nome: string): Progetto {
  return {
    id,
    nome,
    cliente: '',
    luogo: '',
    cartellaId: null,
    clienteId: null,
    sezioni: [],
    stato: 'bozza',
    note: '',
    creatoIl: 1,
    modificatoIl: 1
  };
}

function fotoMeta(id: string, progettoId: string): Omit<Foto, 'origine' | 'miniatura'> {
  return {
    id,
    progettoId,
    origineTipo: 'image/jpeg',
    miniaturaTipo: 'image/jpeg',
    larghezzaPx: 100,
    altezzaPx: 100,
    dataScatto: 1,
    geotag: null,
    didascalia: '',
    noteDato: '',
    scala: null,
    ordine: 0,
    creataIl: 1,
    modificataIl: 1
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

describe('indice di sincronizzazione', () => {
  it("l'indice non contiene i binari delle foto né la sessione cloud", async () => {
    await db.progetti.put(progetto('p1', 'Uno'));
    await db.foto.put({ ...fotoMeta('f1', 'p1'), origine: new ArrayBuffer(8), miniatura: new ArrayBuffer(4) });
    await db.impostazioni.put({ ...IMPOSTAZIONI_DEFAULT, cloud: cloud('segreto') });

    const indice = await costruisciIndice();
    expect(indice.progetti).toHaveLength(1);
    expect(indice.foto).toHaveLength(1);
    expect('origine' in indice.foto[0]).toBe(false);
    expect('miniatura' in indice.foto[0]).toBe(false);
    // mai pubblicare i token della sessione cloud nell'indice condiviso
    expect(indice.impostazioni?.cloud ?? null).toBeNull();
  });

  it('applicaMetadati unisce per id senza cancellare ciò che è solo locale', async () => {
    await db.progetti.put(progetto('locale', 'Solo locale'));
    const indice: IndiceArchivio = {
      app: 'sopralluoghi',
      versione: 2,
      aggiornatoIl: 2,
      cartelle: [],
      progetti: [progetto('remoto', 'Dal cloud')],
      foto: [],
      annotazioni: [],
      clienti: [],
      preventivi: [],
      impostazioni: null
    };
    await applicaMetadati(indice);
    const ids = (await db.progetti.toArray()).map((p) => p.id).sort();
    expect(ids).toEqual(['locale', 'remoto']);
  });

  function indiceConImpostazioni(impostazioni: IndiceArchivio['impostazioni']): IndiceArchivio {
    return {
      app: 'sopralluoghi',
      versione: 2,
      aggiornatoIl: 2,
      cartelle: [],
      progetti: [],
      foto: [],
      annotazioni: [],
      clienti: [],
      preventivi: [],
      impostazioni
    };
  }

  it('applica le impostazioni remote PIÙ RECENTI preservando la sessione cloud locale', async () => {
    await db.impostazioni.put({
      ...IMPOSTAZIONI_DEFAULT,
      cloud: cloud('mio-token'),
      modificatoIl: 100
    });
    // l'indice remoto è più recente e porta un colore PDF diverso, senza sessione cloud
    await applicaMetadati(
      indiceConImpostazioni({
        ...IMPOSTAZIONI_DEFAULT,
        pdf: { ...IMPOSTAZIONI_DEFAULT.pdf, colore: '#abcdef' },
        cloud: null,
        modificatoIl: 200
      })
    );
    const imp = await db.impostazioni.get('app');
    expect(imp?.pdf.colore).toBe('#abcdef'); // impostazione remota applicata
    expect(imp?.cloud?.refreshToken).toBe('mio-token'); // sessione cloud locale preservata
  });

  it('NON sovrascrive le impostazioni locali se le remote sono più vecchie', async () => {
    await db.impostazioni.put({
      ...IMPOSTAZIONI_DEFAULT,
      pdf: { ...IMPOSTAZIONI_DEFAULT.pdf, colore: '#111111' },
      cloud: cloud('mio-token'),
      modificatoIl: 500
    });
    await applicaMetadati(
      indiceConImpostazioni({
        ...IMPOSTAZIONI_DEFAULT,
        pdf: { ...IMPOSTAZIONI_DEFAULT.pdf, colore: '#999999' },
        cloud: null,
        modificatoIl: 200
      })
    );
    const imp = await db.impostazioni.get('app');
    expect(imp?.pdf.colore).toBe('#111111'); // la modifica locale recente resta
  });

  it('il timestamp delle impostazioni cambia solo per modifiche reali, non per la sessione cloud', async () => {
    await salvaImpostazioni({ ...IMPOSTAZIONI_DEFAULT, pdf: { ...IMPOSTAZIONI_DEFAULT.pdf, colore: '#123456' } });
    const dopo1 = await leggiImpostazioni();
    expect(typeof dopo1.modificatoIl).toBe('number');
    const t1 = dopo1.modificatoIl!;

    // scrittura della sola sessione cloud (es. ultimaSync): NON deve toccare il timestamp
    await salvaImpostazioni({ ...dopo1, cloud: cloud('nuovo-token') });
    expect((await leggiImpostazioni()).modificatoIl).toBe(t1);
  });
});
