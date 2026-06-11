import { db } from './db';
import {
  IMPOSTAZIONI_DEFAULT,
  type Annotazione,
  type Cartella,
  type Foto,
  type ID,
  type Impostazioni,
  type Progetto
} from './types';
import { nuovoId } from '../utils/id';
import { inizioSalvataggio, fineSalvataggio } from '../state/saveStatus';
import { mostraToast } from '../state/toast';

/**
 * Tutte le scritture dell'applicazione passano da `scrivi()`:
 * - eseguite in transazione (atomiche: o tutto o niente);
 * - lo stato di salvataggio è sempre visibile nella UI;
 * - nessun fallimento silenzioso: ogni errore produce un messaggio chiaro.
 */
async function scrivi<T>(descrizione: string, op: () => Promise<T>): Promise<T> {
  inizioSalvataggio();
  try {
    const esito = await op();
    fineSalvataggio(true);
    return esito;
  } catch (err) {
    fineSalvataggio(false);
    mostraToast('errore', messaggioErroreScrittura(descrizione, err));
    throw err;
  }
}

function messaggioErroreScrittura(descrizione: string, err: unknown): string {
  const nome = err instanceof Error ? err.name : '';
  if (nome === 'QuotaExceededError' || `${err}`.includes('QuotaExceeded')) {
    return `Spazio di archiviazione esaurito: impossibile ${descrizione}. Libera spazio (elimina progetti vecchi dopo un backup) e riprova.`;
  }
  return `Errore durante: ${descrizione}. La modifica NON è stata salvata. Riprova; se l'errore persiste esegui un backup.`;
}

const ora = () => Date.now();

// ---------------------------------------------------------------------------
// Cartelle
// ---------------------------------------------------------------------------

export async function creaCartella(nome: string, parentId: ID | null): Promise<Cartella> {
  const c: Cartella = { id: nuovoId(), nome: nome.trim(), parentId, creataIl: ora(), modificataIl: ora() };
  await scrivi('creare la cartella', () => db.cartelle.add(c));
  return c;
}

export async function rinominaCartella(id: ID, nome: string): Promise<void> {
  await scrivi('rinominare la cartella', () =>
    db.cartelle.update(id, { nome: nome.trim(), modificataIl: ora() })
  );
}

export async function spostaCartella(id: ID, nuovoParentId: ID | null): Promise<void> {
  // Impedisce cicli: una cartella non può finire dentro sé stessa o un suo discendente
  let cursore = nuovoParentId;
  while (cursore !== null) {
    if (cursore === id) throw new Error('Spostamento non valido: ciclo di cartelle');
    const c = await db.cartelle.get(cursore);
    cursore = c?.parentId ?? null;
  }
  await scrivi('spostare la cartella', () =>
    db.cartelle.update(id, { parentId: nuovoParentId, modificataIl: ora() })
  );
}

/** Raccoglie ricorsivamente gli id di una cartella e di tutte le discendenti */
async function idCartelleDiscendenti(id: ID): Promise<ID[]> {
  const tutte: ID[] = [id];
  let frontiera = [id];
  while (frontiera.length > 0) {
    const figlie = await db.cartelle.where('parentId').anyOf(frontiera).toArray();
    frontiera = figlie.map((c) => c.id);
    tutte.push(...frontiera);
  }
  return tutte;
}

/**
 * Eliminazione in cascata (cartelle annidate, progetti, foto, annotazioni)
 * in un'unica transazione. La conferma esplicita spetta alla UI.
 */
export async function eliminaCartella(id: ID): Promise<void> {
  await scrivi('eliminare la cartella', () =>
    db.transaction('rw', [db.cartelle, db.progetti, db.foto, db.annotazioni], async () => {
      const cartelle = await idCartelleDiscendenti(id);
      const progetti = await db.progetti.where('cartellaId').anyOf(cartelle).primaryKeys();
      const foto = await db.foto.where('progettoId').anyOf(progetti).primaryKeys();
      await db.annotazioni.where('fotoId').anyOf(foto).delete();
      await db.foto.bulkDelete(foto);
      await db.progetti.bulkDelete(progetti);
      await db.cartelle.bulkDelete(cartelle);
    })
  );
}

/** Conteggio del contenuto, per messaggi di conferma espliciti */
export async function contenutoCartella(id: ID): Promise<{ progetti: number; foto: number }> {
  const cartelle = await idCartelleDiscendenti(id);
  const progetti = await db.progetti.where('cartellaId').anyOf(cartelle).primaryKeys();
  const foto = await db.foto.where('progettoId').anyOf(progetti).count();
  return { progetti: progetti.length, foto };
}

// ---------------------------------------------------------------------------
// Progetti
// ---------------------------------------------------------------------------

export async function creaProgetto(
  dati: Pick<Progetto, 'nome' | 'cliente' | 'luogo'> & Partial<Pick<Progetto, 'note' | 'stato'>>,
  cartellaId: ID | null
): Promise<Progetto> {
  const p: Progetto = {
    id: nuovoId(),
    cartellaId,
    nome: dati.nome.trim(),
    cliente: dati.cliente.trim(),
    luogo: dati.luogo.trim(),
    stato: dati.stato ?? 'bozza',
    note: dati.note ?? '',
    creatoIl: ora(),
    modificatoIl: ora()
  };
  await scrivi('creare il progetto', () => db.progetti.add(p));
  return p;
}

export async function aggiornaProgetto(
  id: ID,
  modifiche: Partial<Omit<Progetto, 'id' | 'creatoIl'>>
): Promise<void> {
  await scrivi('salvare il progetto', () =>
    db.progetti.update(id, { ...modifiche, modificatoIl: ora() })
  );
}

export async function spostaProgetto(id: ID, cartellaId: ID | null): Promise<void> {
  await aggiornaProgetto(id, { cartellaId });
}

export async function eliminaProgetto(id: ID): Promise<void> {
  await scrivi('eliminare il progetto', () =>
    db.transaction('rw', [db.progetti, db.foto, db.annotazioni], async () => {
      const foto = await db.foto.where('progettoId').equals(id).primaryKeys();
      await db.annotazioni.where('fotoId').anyOf(foto).delete();
      await db.foto.bulkDelete(foto);
      await db.progetti.delete(id);
    })
  );
}

/**
 * Duplica un progetto come modello: copia dati, foto e annotazioni
 * con nuovi id, mantenendo tutte le relazioni.
 */
export async function duplicaProgetto(id: ID, nuovoNome?: string): Promise<Progetto> {
  return scrivi('duplicare il progetto', () =>
    db.transaction('rw', [db.progetti, db.foto, db.annotazioni], async () => {
      const orig = await db.progetti.get(id);
      if (!orig) throw new Error('Progetto non trovato');
      const copia: Progetto = {
        ...orig,
        id: nuovoId(),
        nome: nuovoNome ?? `${orig.nome} (copia)`,
        creatoIl: ora(),
        modificatoIl: ora()
      };
      await db.progetti.add(copia);
      const fotoOrig = await db.foto.where('progettoId').equals(id).toArray();
      for (const f of fotoOrig) {
        const nuovaFotoId = nuovoId();
        const annOrig = await db.annotazioni.where('fotoId').equals(f.id).toArray();
        await db.foto.add({ ...f, id: nuovaFotoId, progettoId: copia.id });
        await db.annotazioni.bulkAdd(
          annOrig.map((a) => ({ ...a, id: nuovoId(), fotoId: nuovaFotoId }))
        );
      }
      return copia;
    })
  );
}

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------

/**
 * La foto viene creata già collegata al progetto, in transazione:
 * non può esistere una foto orfana o sul progetto sbagliato.
 */
export async function aggiungiFoto(
  progettoId: ID,
  dati: Omit<Foto, 'id' | 'progettoId' | 'ordine' | 'creataIl' | 'modificataIl'>
): Promise<Foto> {
  return scrivi('salvare la foto', () =>
    db.transaction('rw', [db.progetti, db.foto], async () => {
      const progetto = await db.progetti.get(progettoId);
      if (!progetto) throw new Error('Progetto non trovato: foto non salvata');
      const esistenti = await db.foto.where('progettoId').equals(progettoId).toArray();
      const ordine = esistenti.reduce((max, f) => Math.max(max, f.ordine), -1) + 1;
      const f: Foto = {
        ...dati,
        id: nuovoId(),
        progettoId,
        ordine,
        creataIl: ora(),
        modificataIl: ora()
      };
      await db.foto.add(f);
      await db.progetti.update(progettoId, { modificatoIl: ora() });
      return f;
    })
  );
}

export async function aggiornaFoto(
  id: ID,
  modifiche: Partial<Omit<Foto, 'id' | 'progettoId' | 'origine' | 'origineTipo' | 'creataIl'>>
): Promise<void> {
  await scrivi('salvare le modifiche alla foto', () =>
    db.foto.update(id, { ...modifiche, modificataIl: ora() })
  );
}

export async function eliminaFoto(id: ID): Promise<void> {
  await scrivi('eliminare la foto', () =>
    db.transaction('rw', [db.foto, db.annotazioni], async () => {
      await db.annotazioni.where('fotoId').equals(id).delete();
      await db.foto.delete(id);
    })
  );
}

// ---------------------------------------------------------------------------
// Annotazioni
// ---------------------------------------------------------------------------

export async function salvaAnnotazione(a: Annotazione): Promise<void> {
  await scrivi("salvare l'annotazione", () => db.annotazioni.put(a));
}

/**
 * Sostituisce in transazione l'intero set di annotazioni di una foto.
 * Usata dall'autosave dell'editor: lo stato visibile a schermo e quello
 * su disco coincidono sempre, anche dopo undo/redo.
 */
export async function salvaAnnotazioniFoto(fotoId: ID, annotazioni: Annotazione[]): Promise<void> {
  await scrivi('salvare le annotazioni', () =>
    db.transaction('rw', [db.annotazioni, db.foto], async () => {
      const incoerenti = annotazioni.filter((a) => a.fotoId !== fotoId);
      if (incoerenti.length > 0) throw new Error('Annotazione non collegata alla foto corretta');
      await db.annotazioni.where('fotoId').equals(fotoId).delete();
      await db.annotazioni.bulkAdd(annotazioni);
      await db.foto.update(fotoId, { modificataIl: ora() });
    })
  );
}

export async function eliminaAnnotazione(id: ID): Promise<void> {
  await scrivi("eliminare l'annotazione", () => db.annotazioni.delete(id));
}

// ---------------------------------------------------------------------------
// Impostazioni
// ---------------------------------------------------------------------------

export async function leggiImpostazioni(): Promise<Impostazioni> {
  const i = await db.impostazioni.get('app');
  if (!i) return IMPOSTAZIONI_DEFAULT;
  // merge con i default: i campi aggiunti nelle nuove versioni restano validi
  return {
    ...IMPOSTAZIONI_DEFAULT,
    ...i,
    professionista: { ...IMPOSTAZIONI_DEFAULT.professionista, ...i.professionista },
    stileDefault: { ...IMPOSTAZIONI_DEFAULT.stileDefault, ...i.stileDefault }
  };
}

export async function salvaImpostazioni(i: Impostazioni): Promise<void> {
  await scrivi('salvare le impostazioni', () => db.impostazioni.put({ ...i, id: 'app' }));
}

// ---------------------------------------------------------------------------
// Storage: persistenza e quota
// ---------------------------------------------------------------------------

export interface StatoStorage {
  usatoByte: number;
  quotaByte: number;
  percentuale: number;
  persistente: boolean;
}

export async function statoStorage(): Promise<StatoStorage | null> {
  if (!('storage' in navigator) || !navigator.storage?.estimate) return null;
  const stima = await navigator.storage.estimate();
  const usato = stima.usage ?? 0;
  const quota = stima.quota ?? 0;
  const persistente = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return {
    usatoByte: usato,
    quotaByte: quota,
    percentuale: quota > 0 ? (usato / quota) * 100 : 0,
    persistente
  };
}

/**
 * Migra le foto salvate dalle prime versioni come Blob al formato
 * ArrayBuffer. Su iOS/WebKit i Blob in IndexedDB possono diventare
 * illeggibili dopo il riavvio: ciò che è ancora leggibile viene
 * convertito; ciò che il browser ha già corrotto viene segnalato.
 */
export async function migraFotoLegacy(): Promise<void> {
  type FotoLegacy = Foto & { blobOriginale?: Blob };
  const tutte = (await db.foto.toArray()) as FotoLegacy[];
  let irrecuperabili = 0;
  for (const f of tutte) {
    const vecchiaOrigine = f.blobOriginale;
    const vecchiaMiniatura = f.miniatura as unknown;
    if (vecchiaOrigine === undefined && !(vecchiaMiniatura instanceof Blob)) continue;
    const { blobOriginale: _b, ...resto } = f;
    try {
      const origine =
        vecchiaOrigine instanceof Blob ? await vecchiaOrigine.arrayBuffer() : f.origine;
      const miniatura =
        vecchiaMiniatura instanceof Blob ? await vecchiaMiniatura.arrayBuffer() : f.miniatura;
      if (!origine || origine.byteLength === 0) throw new Error('contenuto perso');
      await db.foto.put({
        ...resto,
        origine,
        origineTipo: 'image/jpeg',
        miniatura,
        miniaturaTipo: 'image/jpeg'
      });
    } catch {
      // Il browser ha perso il contenuto: si marca il record come
      // danneggiato così la UI lo spiega chiaramente e ne propone
      // l'eliminazione, invece di fallire a ogni apertura.
      irrecuperabili++;
      await db.foto
        .put({
          ...resto,
          origine: new ArrayBuffer(0),
          origineTipo: 'image/jpeg',
          miniatura: new ArrayBuffer(0),
          miniaturaTipo: 'image/jpeg',
          danneggiata: true
        })
        .catch(() => {});
    }
  }
  if (irrecuperabili > 0) {
    mostraToast(
      'errore',
      `${irrecuperabili} foto delle versioni precedenti non sono più leggibili: il loro contenuto è stato perso dal browser (bug di iOS/Safari, ora aggirato) e non è recuperabile. Sono contrassegnate con ⚠️: puoi eliminarle.`
    );
  }
}

/**
 * Chiede al browser di proteggere i dati dall'eviction automatica
 * e avvisa preventivamente se lo spazio sta per esaurirsi.
 */
export async function inizializzaStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
    await migraFotoLegacy();
    const stato = await statoStorage();
    if (stato && stato.quotaByte > 0 && stato.percentuale > 80) {
      mostraToast(
        'errore',
        `Attenzione: spazio di archiviazione quasi esaurito (${stato.percentuale.toFixed(0)}%). Esegui un backup e libera spazio.`
      );
    }
  } catch {
    // La stima dello storage non è critica: l'app continua a funzionare
  }
}
