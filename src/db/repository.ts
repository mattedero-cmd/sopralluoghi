import { db } from './db';
import {
  IMPOSTAZIONI_DEFAULT,
  MIRINO_DEFAULT,
  type Annotazione,
  type Cartella,
  type Cliente,
  type DisegnoSvg,
  type Foto,
  type ID,
  type Impostazioni,
  type LavoroNesting,
  type PianoProspettiva,
  type Preventivo,
  type PresetProgetto,
  type Progetto,
  type Sezione
} from './types';
import { nuovoId } from '../utils/id';
import { conAbbondanzaDelPreset, teliDelPreset } from '../utils/preset';
import type { Pannellizzazione } from '../geometry/pannelli';
import { blobMiniatura, blobOrigine } from '../utils/image';
import { inizioSalvataggio, fineSalvataggio } from '../state/saveStatus';
import { mostraToast } from '../state/toast';
import { segnaModifica } from '../cloud/promemoria';

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
    segnaModifica(); // c'è lavoro nuovo da sincronizzare sul cloud
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

/** Aggiorna nome, etichetta e note della cartella in un colpo solo */
export async function aggiornaCartella(
  id: ID,
  dati: { nome?: string; etichetta?: string; note?: string }
): Promise<void> {
  const patch: Partial<Cartella> = { modificataIl: ora() };
  if (dati.nome !== undefined) patch.nome = dati.nome.trim();
  if (dati.etichetta !== undefined) patch.etichetta = dati.etichetta.trim() || undefined;
  if (dati.note !== undefined) patch.note = dati.note;
  await scrivi('aggiornare la cartella', () => db.cartelle.update(id, patch));
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
    db.transaction(
      'rw',
      [db.cartelle, db.progetti, db.foto, db.annotazioni, db.preventivi],
      async () => {
        const cartelle = await idCartelleDiscendenti(id);
        const progetti = await db.progetti.where('cartellaId').anyOf(cartelle).primaryKeys();
        const foto = await db.foto.where('progettoId').anyOf(progetti).primaryKeys();
        await db.annotazioni.where('fotoId').anyOf(foto).delete();
        await db.foto.bulkDelete(foto);
        await db.preventivi.where('progettoId').anyOf(progetti).modify({ progettoId: null });
        await db.progetti.bulkDelete(progetti);
        await db.cartelle.bulkDelete(cartelle);
      }
    )
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
  dati: Pick<Progetto, 'nome' | 'cliente' | 'luogo'> &
    Partial<Pick<Progetto, 'note' | 'stato' | 'clienteId'>>,
  cartellaId: ID | null
): Promise<Progetto> {
  const p: Progetto = {
    id: nuovoId(),
    cartellaId,
    nome: dati.nome.trim(),
    cliente: dati.cliente.trim(),
    clienteId: dati.clienteId ?? null,
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
  // quello che sta dentro il progetto viaggia con lui: la cartella segnata
  // serve a ritrovarlo se un giorno il progetto non c'è più
  await scrivi('spostare il contenuto del progetto', async () => {
    await db.nesting.where('progettoId').equals(id).modify({ cartellaId });
    await db.disegni.where('progettoId').equals(id).modify({ cartellaId });
  });
}

// --- Sezioni interne del progetto (piani/aree) -----------------------------

/** Crea una nuova sezione (es. "Piano 1") in coda a quelle del progetto */
export async function creaSezione(progettoId: ID, nome: string, etichetta?: string): Promise<Sezione> {
  const p = await db.progetti.get(progettoId);
  if (!p) throw new Error('Progetto non trovato.');
  const sezioni = p.sezioni ?? [];
  const sez: Sezione = {
    id: nuovoId(),
    nome: nome.trim() || 'Sezione',
    etichetta: etichetta?.trim() || undefined,
    ordine: sezioni.length
  };
  await aggiornaProgetto(progettoId, { sezioni: [...sezioni, sez] });
  return sez;
}

/** Aggiorna nome/etichetta di una sezione */
export async function aggiornaSezione(
  progettoId: ID,
  sezioneId: ID,
  dati: { nome?: string; etichetta?: string }
): Promise<void> {
  const p = await db.progetti.get(progettoId);
  if (!p) return;
  const sezioni = (p.sezioni ?? []).map((s) =>
    s.id === sezioneId
      ? {
          ...s,
          nome: dati.nome !== undefined ? dati.nome.trim() || s.nome : s.nome,
          etichetta: dati.etichetta !== undefined ? dati.etichetta.trim() || undefined : s.etichetta
        }
      : s
  );
  await aggiornaProgetto(progettoId, { sezioni });
}

/** Elimina una sezione; le sue foto tornano "senza sezione" (non vengono perse) */
export async function eliminaSezione(progettoId: ID, sezioneId: ID): Promise<void> {
  await scrivi('eliminare la sezione', () =>
    db.transaction('rw', [db.progetti, db.foto], async () => {
      const p = await db.progetti.get(progettoId);
      if (!p) return;
      const sezioni = (p.sezioni ?? []).filter((s) => s.id !== sezioneId);
      await db.progetti.update(progettoId, { sezioni, modificatoIl: ora() });
      const foto = await db.foto.where('progettoId').equals(progettoId).toArray();
      for (const f of foto) {
        if (f.sezioneId === sezioneId) {
          await db.foto.update(f.id, { sezioneId: undefined, modificataIl: ora() });
        }
      }
    })
  );
}

/** Assegna una foto a una sezione (o la toglie, con null) */
export async function assegnaFotoSezione(fotoId: ID, sezioneId: ID | null): Promise<void> {
  await scrivi('spostare la foto', () =>
    db.foto.update(fotoId, { sezioneId: sezioneId ?? undefined, modificataIl: ora() })
  );
}

export async function eliminaProgetto(id: ID): Promise<void> {
  await scrivi('eliminare il progetto', () =>
    db.transaction(
      'rw',
      [db.progetti, db.foto, db.annotazioni, db.preventivi, db.nesting, db.disegni],
      async () => {
        const foto = await db.foto.where('progettoId').equals(id).primaryKeys();
        await db.annotazioni.where('fotoId').anyOf(foto).delete();
        await db.foto.bulkDelete(foto);
        // i preventivi sono documenti commerciali: si scollegano, non si eliminano
        await db.preventivi.where('progettoId').equals(id).modify({ progettoId: null });
        // piani di taglio e disegni che stavano dentro: tornano sciolti nella
        // cartella, non si buttano via col progetto
        await db.nesting.where('progettoId').equals(id).modify({ progettoId: null });
        await db.disegni.where('progettoId').equals(id).modify({ progettoId: null });
        await db.progetti.delete(id);
      }
    )
  );
}

/**
 * COPIA UN GRUPPO DI FOTO, LEGAMI COMPRESI.
 *
 * Una foto non è sola: può essere il DETTAGLIO di un'altra (e allora punta
 * alla sua etichetta), può essere la PIANTA ricalcata su un'altra, e il suo
 * piano prospettico può seguire le forme da cui è nato. Copiare le foto
 * lasciando gli id vecchi fa puntare le copie agli originali — la pianta
 * copiata resterebbe attaccata alla foto di prima, in un altro progetto — e
 * nessuno se ne accorge finché non si guarda il report.
 *
 * Qui gli id si rifanno tutti e i riferimenti si riscrivono: quelli interni
 * al gruppo seguono le copie, quelli che escono dal gruppo si sciolgono.
 */
async function copiaFoto(
  originali: Foto[],
  aProgettoId: ID,
  sezioneDi: (f: Foto) => ID | undefined,
  daOrdine: number
): Promise<EsitoTrasloco> {
  const nuoveFoto = new Map<ID, ID>(originali.map((f) => [f.id, nuovoId()]));
  const nuoveAnn = new Map<ID, ID>();
  const annPerFoto = new Map<ID, Annotazione[]>();
  for (const f of originali) {
    const ann = await db.annotazioni.where('fotoId').equals(f.id).toArray();
    annPerFoto.set(f.id, ann);
    for (const a of ann) nuoveAnn.set(a.id, nuovoId());
  }

  let ordine = daOrdine;
  let legamiSciolti = 0;
  for (const f of originali) {
    const id = nuoveFoto.get(f.id) as ID;
    const copia: Foto = {
      ...f,
      id,
      progettoId: aProgettoId,
      sezioneId: sezioneDi(f),
      ordine: ordine++,
      creataIl: ora(),
      modificataIl: ora()
    };
    legamiSciolti += riscriviLegami(
      copia,
      (vecchio) => nuoveFoto.get(vecchio),
      (vecchio) => nuoveAnn.get(vecchio)
    );
    await db.foto.add(copia);
    await db.annotazioni.bulkAdd(
      (annPerFoto.get(f.id) ?? []).map((a) => ({
        ...a,
        id: nuoveAnn.get(a.id) as ID,
        fotoId: id
      }))
    );
  }
  return { foto: originali.length, legamiSciolti };
}

/**
 * Riscrive i riferimenti di una foto, in loco.
 *
 * `foto(id)` e `ann(id)` dicono dove è finito un vecchio id: `undefined`
 * significa «fuori dal gruppo», e allora il legame si scioglie invece di
 * restare appeso a un id che in questo progetto non esiste.
 */
function riscriviLegami(
  f: Foto,
  foto: (id: ID) => ID | undefined,
  ann: (id: ID) => ID | undefined
): number {
  let sciolti = 0;
  if (f.dettaglioDi) {
    const principale = foto(f.dettaglioDi.fotoId);
    if (principale === undefined) {
      delete f.dettaglioDi;
      sciolti++;
    } else {
      f.dettaglioDi = {
        ...f.dettaglioDi,
        fotoId: principale,
        etichettaId: ann(f.dettaglioDi.etichettaId) ?? f.dettaglioDi.etichettaId
      };
    }
  }
  if (f.piantaDi !== undefined) {
    const sorgente = foto(f.piantaDi);
    if (sorgente === undefined) {
      delete f.piantaDi;
      sciolti++;
    } else {
      f.piantaDi = sorgente;
    }
  }
  // il piano prospettico segue le forme da cui è nato: anche quelle hanno
  // cambiato id
  const rifai = (p: PianoProspettiva): PianoProspettiva =>
    p.origini ? { ...p, origini: p.origini.map((o) => ann(o) ?? o) } : p;
  if (f.piano) f.piano = rifai(f.piano);
  if (f.piani) f.piani = f.piani.map(rifai);
  return sciolti;
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
      // le sezioni del progetto copiato sono le stesse: le foto le ritrovano
      await copiaFoto(fotoOrig, copia.id, (f) => f.sezioneId, 0);
      return copia;
    })
  );
}

// ---------------------------------------------------------------------------
// Traslochi: foto e sezioni che cambiano progetto
// ---------------------------------------------------------------------------

/** cos'è successo in un trasloco, per dirlo a chi l'ha chiesto */
export interface EsitoTrasloco {
  /** quante foto sono state spostate o copiate */
  foto: number;
  /** quanti legami fra foto si sono dovuti sciogliere */
  legamiSciolti: number;
}

/** l'ordine da dare alla prossima foto di un progetto: in fondo alla fila */
async function ordineInCoda(progettoId: ID): Promise<number> {
  const foto = await db.foto.where('progettoId').equals(progettoId).toArray();
  return foto.reduce((max, f) => Math.max(max, f.ordine + 1), 0);
}

/**
 * La sezione del progetto di arrivo che corrisponde a quella di partenza.
 *
 * Se ce n'è già una con lo stesso nome le foto vanno lì — spostare «Piano 1»
 * in un progetto che ha già il suo «Piano 1» non deve lasciare due sezioni
 * identiche — altrimenti la sezione si crea.
 */
async function sezioneGemella(aProgettoId: ID, modello: Sezione | null): Promise<ID | undefined> {
  if (!modello) return undefined;
  const dest = await db.progetti.get(aProgettoId);
  if (!dest) return undefined;
  const sezioni = dest.sezioni ?? [];
  const uguale = (a: string, b: string) =>
    a.trim().toLocaleLowerCase('it') === b.trim().toLocaleLowerCase('it');
  const gia = sezioni.find((s) => uguale(s.nome, modello.nome));
  if (gia) return gia.id;
  const nuova: Sezione = {
    id: nuovoId(),
    nome: modello.nome,
    etichetta: modello.etichetta,
    ordine: sezioni.length
  };
  await db.progetti.update(aProgettoId, {
    sezioni: [...sezioni, nuova],
    modificatoIl: ora()
  });
  return nuova.id;
}

/**
 * SCIOGLIE I LEGAMI CHE IL TRASLOCO LASCEREBBE NEL VUOTO.
 *
 * Una foto di dettaglio punta a un'altra foto dello STESSO progetto, e una
 * pianta ricalcata alla foto da cui è nata. Portandone via una sola, il
 * legame punterebbe fuori: qui le due foto tornano autonome, di qua e di là.
 * È la stessa regola di `eliminaFoto` — mai un riferimento a vuoto — e vale
 * nei due sensi: chi parte lascia il legame verso chi resta, chi resta lo
 * lascia verso chi parte.
 */
async function sciogliLegamiTrasloco(mosse: Foto[], daProgettoId: ID): Promise<number> {
  const parte = new Set(mosse.map((f) => f.id));
  let sciolti = 0;
  const scollega = async (f: Foto, verso: (id: ID) => boolean) => {
    const copia = { ...f };
    let tocco = false;
    if (copia.dettaglioDi && verso(copia.dettaglioDi.fotoId)) {
      delete copia.dettaglioDi;
      tocco = true;
    }
    if (copia.piantaDi !== undefined && verso(copia.piantaDi)) {
      delete copia.piantaDi;
      tocco = true;
    }
    if (!tocco) return;
    // `put` e non `update`: togliere un campo è l'unica cosa che l'update
    // non fa in modo ovvio, e qui il campo deve proprio sparire
    await db.foto.put({ ...copia, modificataIl: ora() });
    sciolti++;
  };
  for (const f of mosse) await scollega(f, (id) => !parte.has(id));
  const rimaste = await db.foto.where('progettoId').equals(daProgettoId).toArray();
  for (const r of rimaste) {
    if (parte.has(r.id)) continue;
    await scollega(r, (id) => parte.has(id));
  }
  return sciolti;
}

/** le foto di una sezione; con `null` quelle che stanno fuori da ogni sezione */
async function fotoDellaSezione(progettoId: ID, sezioneId: ID | null): Promise<Foto[]> {
  const p = await db.progetti.get(progettoId);
  const valide = new Set((p?.sezioni ?? []).map((s) => s.id));
  const tutte = await db.foto.where('progettoId').equals(progettoId).toArray();
  const ordinate = tutte.sort((a, b) => a.ordine - b.ordine);
  if (sezioneId !== null) return ordinate.filter((f) => f.sezioneId === sezioneId);
  // «senza sezione» è il gruppo che si vede in pagina: le piante stanno in un
  // gruppo loro e non si portano via insieme alle foto
  return ordinate.filter((f) => !f.ePianta && (!f.sezioneId || !valide.has(f.sezioneId)));
}

/**
 * Sposta UNA foto in un altro progetto (e, volendo, in una sua sezione).
 *
 * Succede: si scattano venti foto nel progetto sbagliato e ci si accorge
 * dopo. La foto si porta dietro tutto — annotazioni, misure, piani — e in
 * arrivo si mette in fondo alla fila.
 */
export async function spostaFotoInProgetto(
  fotoId: ID,
  aProgettoId: ID,
  aSezioneId: ID | null = null
): Promise<EsitoTrasloco> {
  return scrivi('spostare la foto in un altro progetto', () =>
    db.transaction('rw', [db.progetti, db.foto], async () => {
      const f = await db.foto.get(fotoId);
      if (!f) throw new Error('Foto non trovata.');
      const dest = await db.progetti.get(aProgettoId);
      if (!dest) throw new Error('Progetto di destinazione non trovato.');
      const sezione = (dest.sezioni ?? []).some((s) => s.id === aSezioneId)
        ? (aSezioneId as ID)
        : undefined;
      if (f.progettoId === aProgettoId) {
        // stesso progetto: è solo un cambio di sezione
        await db.foto.update(fotoId, { sezioneId: sezione, modificataIl: ora() });
        return { foto: 1, legamiSciolti: 0 };
      }
      const legamiSciolti = await sciogliLegamiTrasloco([f], f.progettoId);
      await db.foto.update(fotoId, {
        progettoId: aProgettoId,
        sezioneId: sezione,
        ordine: await ordineInCoda(aProgettoId),
        modificataIl: ora()
      });
      await db.progetti.update(f.progettoId, { modificatoIl: ora() });
      await db.progetti.update(aProgettoId, { modificatoIl: ora() });
      return { foto: 1, legamiSciolti };
    })
  );
}

/**
 * Sposta un'intera sezione in un altro progetto, con tutte le sue foto.
 *
 * Nel progetto di arrivo la sezione si ricrea com'era (o si riusa quella con
 * lo stesso nome, se c'è già) e in partenza sparisce. Con `sezioneId` a null
 * si spostano le foto che non stanno in nessuna sezione.
 */
export async function spostaSezioneInProgetto(
  daProgettoId: ID,
  sezioneId: ID | null,
  aProgettoId: ID
): Promise<EsitoTrasloco> {
  return scrivi('spostare la sezione in un altro progetto', () =>
    db.transaction('rw', [db.progetti, db.foto], async () => {
      if (daProgettoId === aProgettoId) throw new Error('La sezione è già in questo progetto.');
      const da = await db.progetti.get(daProgettoId);
      const a = await db.progetti.get(aProgettoId);
      if (!da || !a) throw new Error('Progetto non trovato.');
      const modello = (da.sezioni ?? []).find((s) => s.id === sezioneId) ?? null;
      if (sezioneId !== null && !modello) throw new Error('Sezione non trovata.');

      const mosse = await fotoDellaSezione(daProgettoId, sezioneId);
      const legamiSciolti = await sciogliLegamiTrasloco(mosse, daProgettoId);
      const sezione = await sezioneGemella(aProgettoId, modello);
      let ordine = await ordineInCoda(aProgettoId);
      for (const f of mosse) {
        await db.foto.update(f.id, {
          progettoId: aProgettoId,
          sezioneId: sezione,
          ordine: ordine++,
          modificataIl: ora()
        });
      }
      // la sezione svuotata non resta in giro: le sue foto sono tutte partite
      if (modello) {
        await db.progetti.update(daProgettoId, {
          sezioni: (da.sezioni ?? []).filter((s) => s.id !== modello.id)
        });
      }
      await db.progetti.update(daProgettoId, { modificatoIl: ora() });
      await db.progetti.update(aProgettoId, { modificatoIl: ora() });
      return { foto: mosse.length, legamiSciolti };
    })
  );
}

/**
 * Duplica un'intera sezione in un altro progetto: le foto restano anche qui.
 *
 * Serve per i lavori che si somigliano — lo stesso stabile, due committenti —
 * dove il rilievo di partenza è lo stesso e da lì in poi le strade si
 * dividono.
 */
export async function duplicaSezioneInProgetto(
  daProgettoId: ID,
  sezioneId: ID | null,
  aProgettoId: ID
): Promise<EsitoTrasloco> {
  return scrivi('duplicare la sezione in un altro progetto', () =>
    db.transaction('rw', [db.progetti, db.foto, db.annotazioni], async () => {
      const da = await db.progetti.get(daProgettoId);
      const a = await db.progetti.get(aProgettoId);
      if (!da || !a) throw new Error('Progetto non trovato.');
      const modello = (da.sezioni ?? []).find((s) => s.id === sezioneId) ?? null;
      if (sezioneId !== null && !modello) throw new Error('Sezione non trovata.');

      const originali = await fotoDellaSezione(daProgettoId, sezioneId);
      const sezione = await sezioneGemella(aProgettoId, modello);
      // i legami interni alla sezione seguono le copie; quelli che uscivano
      // dalla sezione si sciolgono, e `copiaFoto` li conta
      const esito = await copiaFoto(
        originali,
        aProgettoId,
        () => sezione,
        await ordineInCoda(aProgettoId)
      );
      await db.progetti.update(aProgettoId, { modificatoIl: ora() });
      return esito;
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

/** Tela bianca PNG (per le piante, che non hanno una vera foto). */
async function immagineBianca(w: number, h: number): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  return blob ? blob.arrayBuffer() : new ArrayBuffer(0);
}

/**
 * Crea una PIANTA stanza (§12): una "foto" con tela bianca, su cui si
 * disegna lo schizzo della stanza. Riusa interamente l'editor e il PDF.
 */
export async function creaPianta(
  progettoId: ID,
  opzioni?: { larghezza?: number; altezza?: number }
): Promise<Foto> {
  const larghezzaPx = opzioni?.larghezza ?? 2000;
  const altezzaPx = opzioni?.altezza ?? 1500;
  const origine = await immagineBianca(larghezzaPx, altezzaPx);
  const miniatura = await immagineBianca(240, 180);
  return aggiungiFoto(progettoId, {
    origine,
    origineTipo: 'image/png',
    miniatura,
    miniaturaTipo: 'image/png',
    larghezzaPx,
    altezzaPx,
    dataScatto: ora(),
    geotag: null,
    didascalia: 'Pianta stanza',
    noteDato: '',
    scala: null,
    ePianta: true
  });
}

/**
 * Crea una PIANTA tracciata su una FOTO reale: copia l'immagine (e la
 * calibrazione, scala/piano) della foto sorgente in una nuova pianta. Così lo
 * schizzo nasce ben proporzionato e, se la foto è calibrata, i lati si
 * misurano già in reale. Lo sfondo è mostrato e si può nascondere a piacere.
 */
export async function creaPiantaDaFoto(progettoId: ID, sorgente: Foto): Promise<Foto> {
  // accessori robusti ai record legacy (origine ancora come Blob su iOS)
  const blobO = blobOrigine(sorgente);
  const blobM = blobMiniatura(sorgente);
  return aggiungiFoto(progettoId, {
    origine: await blobO.arrayBuffer(),
    origineTipo: blobO.type || sorgente.origineTipo || 'image/jpeg',
    miniatura: await blobM.arrayBuffer(),
    miniaturaTipo: blobM.type || sorgente.miniaturaTipo || 'image/jpeg',
    larghezzaPx: sorgente.larghezzaPx,
    altezzaPx: sorgente.altezzaPx,
    dataScatto: ora(),
    geotag: null,
    didascalia: 'Pianta su foto',
    noteDato: '',
    scala: sorgente.scala ? { ...sorgente.scala } : null,
    piano: sorgente.piano ?? null,
    // la calibrazione si copia INTERA: se la foto aveva due pareti, la pianta
    // ricalcata sopra deve avere le stesse due
    piani: sorgente.piani?.map((p) => ({ ...p })),
    ePianta: true,
    piantaDi: sorgente.id,
    sfondoNascosto: false,
    // PRIVACY: copiando i pixel si copiano anche le regioni oscurate, altrimenti
    // lo sfondo della pianta mostrerebbe i volti scoperti
    censure: sorgente.censure?.map((c) => ({ ...c })),
    voltiCercati: sorgente.voltiCercati
  });
}

/**
 * Imposta (o sostituisce) la FOTO DI RIFERIMENTO di una pianta esistente:
 * copia immagine, miniatura, dimensioni e calibrazione della foto sorgente
 * nella pianta, così lo schizzo si può ricalcare sopra una geometria reale.
 * `aggiornaFoto` non tocca `origine`/`origineTipo`, quindi qui si scrive
 * direttamente la tabella. Le annotazioni esistenti restano invariate.
 */
export async function impostaSfondoPianta(piantaId: ID, sorgente: Foto): Promise<void> {
  const blobO = blobOrigine(sorgente);
  const blobM = blobMiniatura(sorgente);
  const origine = await blobO.arrayBuffer();
  const miniatura = await blobM.arrayBuffer();
  await scrivi('impostare la foto di riferimento', () =>
    db.foto.update(piantaId, {
      origine,
      origineTipo: blobO.type || sorgente.origineTipo || 'image/jpeg',
      miniatura,
      miniaturaTipo: blobM.type || sorgente.miniaturaTipo || 'image/jpeg',
      larghezzaPx: sorgente.larghezzaPx,
      altezzaPx: sorgente.altezzaPx,
      scala: sorgente.scala ? { ...sorgente.scala } : null,
      piano: sorgente.piano ?? null,
      piani: sorgente.piani?.map((p) => ({ ...p })),
      // la pianta adesso è ricalcata su QUESTA foto: la porta «Pianta della
      // stanza» deve partire da qui, non dalla foto di prima
      piantaDi: sorgente.id,
      sfondoNascosto: false,
      // PRIVACY: le regioni oscurate seguono i pixel della foto di riferimento
      censure: sorgente.censure?.map((c) => ({ ...c })),
      voltiCercati: sorgente.voltiCercati,
      modificataIl: ora()
    })
  );
}

/**
 * PRIVACY — rende DEFINITIVO l'oscuramento: riscrive i pixel archiviati con
 * la versione già oscurata e cancella le regioni (non c'è più nulla da
 * applicare, né da togliere). Da qui in poi il volto non esiste più sul
 * dispositivo, quindi non può finire in un backup né in una sincronizzazione.
 *
 * Operazione IRREVERSIBILE: è l'unico punto in cui `origine` viene riscritto
 * dopo l'acquisizione, ed è volutamente separato da `aggiornaFoto` (che i
 * pixel non li tocca per contratto).
 */
export async function incorporaCensureFoto(
  id: ID,
  origine: ArrayBuffer,
  miniatura: ArrayBuffer
): Promise<void> {
  await scrivi('rendere definitivo l’oscuramento dei volti', () =>
    db.foto.update(id, {
      origine,
      origineTipo: 'image/jpeg',
      miniatura,
      miniaturaTipo: 'image/jpeg',
      censure: undefined,
      voltiCercati: true,
      modificataIl: ora()
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

/**
 * RIORDINA LE FOTO DI UN SOPRALLUOGO, in un colpo solo.
 *
 * L'ordine delle foto non è un vezzo: è quello che decide le LETTERE (A, B,
 * C…) e l'ordine delle pagine nel PDF. Chi misura un albergo entra nelle
 * stanze come può — quella libera prima, quella occupata dopo — e si ritrova
 * la parete A nella stanza 3. Rimetterle in fila dopo vuol dire riscrivere
 * l'ordine di tutte insieme, non una per volta.
 */
export async function riordinaFoto(idsInOrdine: ID[]): Promise<void> {
  if (idsInOrdine.length === 0) return;
  await scrivi('riordinare le foto', async () => {
    const adesso = ora();
    await db.transaction('rw', db.foto, async () => {
      for (let i = 0; i < idsInOrdine.length; i++) {
        await db.foto.update(idsInOrdine[i], { ordine: i, modificataIl: adesso });
      }
    });
  });
}

/**
 * Scrive l'etichetta di più foto insieme (vuota = torna la lettera automatica).
 * Serve ai due comandi della nomenclatura: «prendi i nomi» e «rimetti le
 * lettere», che su un albergo toccano trenta foto in una volta.
 */
export async function scriviEtichetteFoto(
  modifiche: Array<{ id: ID; etichetta: string | undefined }>
): Promise<void> {
  if (modifiche.length === 0) return;
  await scrivi('salvare le etichette delle foto', async () => {
    const adesso = ora();
    await db.transaction('rw', db.foto, async () => {
      for (const m of modifiche) {
        await db.foto.update(m.id, { etichetta: m.etichetta, modificataIl: adesso });
      }
    });
  });
}

export async function eliminaFoto(id: ID): Promise<void> {
  await scrivi('eliminare la foto', () =>
    db.transaction('rw', [db.foto, db.annotazioni], async () => {
      await db.annotazioni.where('fotoId').equals(id).delete();
      // le foto di DETTAGLIO collegate a questa foto tornano autonome (non
      // vengono cancellate né lasciate orfane verso un id inesistente)
      const collegate = await db.foto.filter((f) => f.dettaglioDi?.fotoId === id).toArray();
      for (const f of collegate) {
        const { dettaglioDi: _d, ...resto } = f;
        await db.foto.put({ ...resto, modificataIl: ora() });
      }
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

/** vero se due divisioni in teli dicono la stessa cosa */
function stessiTeli(
  a: Pannellizzazione | undefined,
  b: Pannellizzazione | undefined
): boolean {
  if (!a || !b) return !a && !b;
  const giro = (p: Pannellizzazione) =>
    JSON.stringify([
      p.asse,
      p.verso,
      Math.round(p.sormonto * 1e4),
      p.giunti.map((g: number) => Math.round(g * 1e4))
    ]);
  return giro(a) === giro(b);
}

/**
 * IL PRESET PORTATO SU TUTTO QUELLO CHE C'È GIÀ.
 *
 * È il comando «applica a tutto»: su un sopralluogo da cinquanta stanze
 * aprire ogni parete, scrivere le stesse abbondanze e rifare la stessa
 * divisione in teli è esattamente il lavoro che il preset doveva togliere.
 *
 * Fa DUE cose su ogni forma del sopralluogo:
 *
 * 1. le ABBONDANZE del preset, riscritte. Quello che una forma aveva addosso
 *    — perimetrale, per lato o sulle misure — va via, e al suo posto va il
 *    preset: lasciare mezze abbondanze vecchie vorrebbe dire che la regola
 *    del «vince il più grande» tiene in piedi un numero che si credeva
 *    sostituito.
 *
 * 2. la DIVISIONE IN TELI, rifatta con la fascia del supporto, il sormonto e
 *    il verso del preset. Le giunzioni spostate a mano si perdono: è il
 *    senso del comando. Una forma che sta in un telo solo resta intera, e
 *    una divisione vecchia le viene tolta.
 *
 * Torna quante forme ha guardato e quante ne ha cambiate, perché chi lo
 * lancia su cinquanta stanze deve poter vedere che è successo qualcosa.
 */
export async function applicaPresetATutto(
  progettoId: ID,
  preset: PresetProgetto
): Promise<{ forme: number; abbondanze: number; teli: number }> {
  return scrivi('applicare il preset al sopralluogo', async () => {
    const foto = await db.foto.where('progettoId').equals(progettoId).toArray();
    let forme = 0;
    let abbondanze = 0;
    let teli = 0;
    await db.transaction('rw', [db.annotazioni, db.foto], async () => {
      const toccate = new Set<ID>();
      for (const f of foto) {
        const dentro = await db.annotazioni.where('fotoId').equals(f.id).toArray();
        for (const a of dentro) {
          if (a.tipo !== 'quotaPoligono' && a.tipo !== 'quotaRett') continue;
          // le copie «solo etichetta» non sono forme: sono il codice di una
          // forma che sta altrove, e la misura è di quella
          if (a.tipo === 'quotaPoligono' && a.soloEtichetta) continue;
          forme++;
          const conAbb = conAbbondanzaDelPreset(a, preset, true);
          let nuova = conAbb ?? a;
          if (conAbb) abbondanze++;
          if (preset.teli) {
            // i teli si contano DOPO le abbondanze: sono le abbondanze a
            // decidere quanto materiale serve, e quindi quanti teli
            const pann = teliDelPreset(nuova, f, preset) ?? undefined;
            if (!stessiTeli(nuova.pannelli, pann)) {
              nuova = { ...nuova, pannelli: pann };
              teli++;
            }
          }
          if (nuova !== a) {
            await db.annotazioni.put(nuova);
            toccate.add(a.fotoId);
          }
        }
      }
      const adesso = ora();
      for (const id of toccate) await db.foto.update(id, { modificataIl: adesso });
    });
    return { forme, abbondanze, teli };
  });
}

export async function eliminaAnnotazione(id: ID): Promise<void> {
  await scrivi("eliminare l'annotazione", () => db.annotazioni.delete(id));
}

// ---------------------------------------------------------------------------
// Anagrafica clienti (Fase 3)
// ---------------------------------------------------------------------------

export async function creaCliente(
  dati: Partial<Omit<Cliente, 'id' | 'creatoIl' | 'modificatoIl'>> & Pick<Cliente, 'nome'>
): Promise<Cliente> {
  const c: Cliente = {
    id: nuovoId(),
    nome: dati.nome.trim(),
    telefono: dati.telefono ?? '',
    email: dati.email ?? '',
    indirizzo: dati.indirizzo ?? '',
    partitaIva: dati.partitaIva,
    codiceFiscale: dati.codiceFiscale,
    pec: dati.pec,
    sdi: dati.sdi,
    note: dati.note ?? '',
    creatoIl: ora(),
    modificatoIl: ora()
  };
  await scrivi('creare il cliente', () => db.clienti.add(c));
  return c;
}

export async function aggiornaCliente(
  id: ID,
  modifiche: Partial<Omit<Cliente, 'id' | 'creatoIl'>>
): Promise<void> {
  await scrivi('salvare il cliente', () =>
    db.transaction('rw', [db.clienti, db.progetti], async () => {
      await db.clienti.update(id, { ...modifiche, modificatoIl: ora() });
      // il nome denormalizzato sui progetti collegati resta allineato
      if (modifiche.nome !== undefined) {
        await db.progetti
          .where('clienteId')
          .equals(id)
          .modify({ cliente: modifiche.nome.trim(), modificatoIl: ora() });
      }
    })
  );
}

/**
 * Eliminazione cliente: i progetti e i preventivi collegati NON vengono
 * eliminati, solo scollegati (il nome resta come testo sui progetti).
 */
export async function eliminaCliente(id: ID): Promise<void> {
  await scrivi('eliminare il cliente', () =>
    db.transaction('rw', [db.clienti, db.progetti, db.preventivi], async () => {
      await db.progetti.where('clienteId').equals(id).modify({ clienteId: null });
      await db.preventivi.where('clienteId').equals(id).modify({ clienteId: null });
      await db.clienti.delete(id);
    })
  );
}

// ---------------------------------------------------------------------------
// Preventivi (Fase 3)
// ---------------------------------------------------------------------------

/** Numero progressivo per anno: "2026-001", "2026-002", … */
export async function prossimoNumeroPreventivo(): Promise<string> {
  const anno = new Date().getFullYear();
  const tutti = await db.preventivi.toArray();
  const prefisso = `${anno}-`;
  let max = 0;
  for (const p of tutti) {
    if (p.numero.startsWith(prefisso)) {
      const n = Number(p.numero.slice(prefisso.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `${prefisso}${String(max + 1).padStart(3, '0')}`;
}

export async function creaPreventivo(
  progettoId: ID | null,
  clienteId: ID | null
): Promise<Preventivo> {
  const numero = await prossimoNumeroPreventivo();
  const impostazioni = await leggiImpostazioni();
  const fisc = impostazioni.fiscale;
  const p: Preventivo = {
    id: nuovoId(),
    progettoId,
    clienteId,
    numero,
    data: ora(),
    stato: 'bozza',
    regime: fisc.regime,
    voci: [],
    scontoPercento: 0,
    ivaPercento: fisc.ivaDefault,
    cassaAttiva: fisc.cassaAttiva,
    cassaPercento: fisc.cassaPercento,
    ritenutaAttiva: fisc.ritenutaAttiva,
    ritenutaPercento: fisc.ritenutaPercento,
    bolloAttiva: false,
    bolloImporto: fisc.bolloImporto,
    coefficiente: fisc.coefficienteForfettario,
    dicituraFiscale: fisc.regime === 'forfettario' ? fisc.dicituraForfettario : '',
    note: '',
    creatoIl: ora(),
    modificatoIl: ora()
  };
  await scrivi('creare il preventivo', () => db.preventivi.add(p));
  return p;
}

export async function aggiornaPreventivo(
  id: ID,
  modifiche: Partial<Omit<Preventivo, 'id' | 'creatoIl'>>
): Promise<void> {
  await scrivi('salvare il preventivo', () =>
    db.preventivi.update(id, { ...modifiche, modificatoIl: ora() })
  );
}

export async function eliminaPreventivo(id: ID): Promise<void> {
  await scrivi('eliminare il preventivo', () => db.preventivi.delete(id));
}

export interface TotaliPreventivo {
  imponibile: number;
  sconto: number;
  scontato: number;
  iva: number;
  totale: number;
}

export function totaliPreventivo(p: Pick<Preventivo, 'voci' | 'scontoPercento' | 'ivaPercento'>): TotaliPreventivo {
  const imponibile = p.voci.reduce((s, v) => s + v.quantita * v.prezzoUnitario, 0);
  const sconto = (imponibile * (p.scontoPercento || 0)) / 100;
  const scontato = imponibile - sconto;
  const iva = (scontato * (p.ivaPercento || 0)) / 100;
  return { imponibile, sconto, scontato, iva, totale: scontato + iva };
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
    stileDefault: { ...IMPOSTAZIONI_DEFAULT.stileDefault, ...i.stileDefault },
    fiscale: { ...IMPOSTAZIONI_DEFAULT.fiscale, ...i.fiscale },
    pdf: { ...IMPOSTAZIONI_DEFAULT.pdf, ...i.pdf },
    mirino: { ...MIRINO_DEFAULT, ...i.mirino }
  };
}

export async function salvaImpostazioni(i: Impostazioni): Promise<void> {
  const esistente = await db.impostazioni.get('app');
  // Bump del timestamp solo se cambiano le IMPOSTAZIONI vere e proprie, non la
  // sola sessione cloud (token, ultimaSync…): così la sincronizzazione propaga
  // le modifiche dell'utente, ma non considera "nuove" le scritture interne.
  const cambiate = !esistente || !stesseImpostazioni(esistente, i);
  const da = cambiate ? { ...i, modificatoIl: ora() } : i;
  await scrivi('salvare le impostazioni', () => db.impostazioni.put({ ...da, id: 'app' }));
}

/** Confronta due impostazioni ignorando sessione cloud e timestamp di modifica. */
function stesseImpostazioni(a: Impostazioni, b: Impostazioni): boolean {
  const senza = (i: Impostazioni) => {
    const { cloud: _c, modificatoIl: _m, ...resto } = i;
    return stabile(resto); // ordine delle chiavi indifferente
  };
  return senza(a) === senza(b);
}

/** Serializzazione deterministica (chiavi ordinate) per confronti robusti. */
function stabile(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stabile).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => JSON.stringify(k) + ':' + stabile(o[k]))
    .join(',')}}`;
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

/* ------------------------------------------------------------------ */
/* Lavori di nesting                                                    */
/* ------------------------------------------------------------------ */

/** i lavori salvati, dal più recente */
export async function elencaNesting(): Promise<LavoroNesting[]> {
  const tutti = await db.nesting.toArray();
  return tutti.sort((a, b) => b.modificatoIl - a.modificatoIl);
}

/**
 * DOVE STA UN LAVORO nell'archivio: sciolto in una cartella, oppure dentro un
 * progetto. Sono due posti diversi, non due etichette dello stesso posto: un
 * piano di taglio dentro il sopralluogo non compare più fra i file sciolti
 * della cartella, si trova aprendo il progetto.
 *
 * La cartella resta comunque segnata anche per chi sta dentro un progetto: se
 * il progetto viene eliminato, il lavoro non si perde — torna sciolto lì.
 */
export interface Destinazione {
  cartellaId: ID | null;
  progettoId: ID | null;
}

/** la destinazione di un progetto: dentro di lui, nella sua cartella */
export async function dentroProgetto(progettoId: ID): Promise<Destinazione> {
  const p = await db.progetti.get(progettoId);
  return { cartellaId: p?.cartellaId ?? null, progettoId };
}

/** i lavori dentro una cartella dell'archivio */
export async function nestingInCartella(cartellaId: ID | null): Promise<LavoroNesting[]> {
  const tutti = await db.nesting.toArray();
  return tutti
    .filter((l) => (l.cartellaId ?? null) === cartellaId && !l.progettoId)
    .sort((a, b) => b.modificatoIl - a.modificatoIl);
}

/** i piani di taglio archiviati dentro un progetto */
export async function nestingInProgetto(progettoId: ID): Promise<LavoroNesting[]> {
  const tutti = await db.nesting.toArray();
  return tutti
    .filter((l) => l.progettoId === progettoId)
    .sort((a, b) => b.modificatoIl - a.modificatoIl);
}

export async function leggiNesting(id: ID): Promise<LavoroNesting | undefined> {
  return db.nesting.get(id);
}

/**
 * Salva un lavoro: crea il record se l'id non esiste ancora, altrimenti
 * lo sovrascrive. Il chiamante decide l'id, così «salva» e «salva come»
 * sono la stessa operazione con un id diverso.
 *
 * Il PDF si passa solo quando è stato rigenerato: se manca, resta quello di
 * prima e `pdfIl` più vecchio di `modificatoIl` dice che è da rifare.
 */
export async function salvaNesting(
  id: ID,
  nome: string,
  documento: unknown,
  opzioni?: { cartellaId?: ID | null; pdf?: Blob; progettoId?: ID | null }
): Promise<LavoroNesting> {
  const esistente = await db.nesting.get(id);
  const adesso = ora();
  const record: LavoroNesting = {
    id,
    nome,
    cartellaId:
      opzioni?.cartellaId !== undefined ? opzioni.cartellaId : (esistente?.cartellaId ?? null),
    progettoId:
      opzioni?.progettoId !== undefined ? opzioni.progettoId : (esistente?.progettoId ?? null),
    creatoIl: esistente?.creatoIl ?? adesso,
    modificatoIl: adesso,
    documento,
    pdf: opzioni?.pdf ?? esistente?.pdf,
    pdfIl: opzioni?.pdf ? adesso : esistente?.pdfIl
  };
  await scrivi('salvare il lavoro di nesting', () => db.nesting.put(record));
  return record;
}

/** il piano di taglio nato da un sopralluogo, se c'è (il più recente) */
export async function nestingDiProgetto(progettoId: ID): Promise<LavoroNesting | undefined> {
  const tutti = await db.nesting.toArray();
  return tutti
    .filter((l) => l.progettoId === progettoId)
    .sort((a, b) => b.modificatoIl - a.modificatoIl)[0];
}

/** aggiorna il solo PDF di un lavoro già salvato, con la build che l'ha fatto */
export async function salvaPdfNesting(id: ID, pdf: Blob, app: string): Promise<void> {
  await scrivi('salvare il PDF del piano di taglio', () =>
    db.nesting.update(id, { pdf, pdfIl: ora(), pdfApp: app })
  );
}

/**
 * Il PDF salvato è ancora buono?
 *
 * No se manca, se il lavoro è stato modificato dopo l'ultima stampa, oppure
 * se l'ha prodotto una versione precedente dell'app: il disegno cambia con
 * gli aggiornamenti, e un piano di taglio vecchio è peggio di nessun piano.
 */
export function pdfDaRifare(l: LavoroNesting, app: string): boolean {
  return !l.pdf || (l.pdfIl ?? 0) < l.modificatoIl || l.pdfApp !== app;
}

export async function rinominaNesting(id: ID, nome: string): Promise<void> {
  await scrivi('rinominare il lavoro di nesting', () =>
    db.nesting.update(id, { nome, modificatoIl: ora() })
  );
}

export async function spostaNesting(id: ID, dove: Destinazione): Promise<void> {
  await scrivi('spostare il lavoro di nesting', () =>
    db.nesting.update(id, {
      cartellaId: dove.cartellaId,
      progettoId: dove.progettoId,
      modificatoIl: ora()
    })
  );
}

export async function eliminaNesting(id: ID): Promise<void> {
  await scrivi('eliminare il lavoro di nesting', () => db.nesting.delete(id));
}

/* --- disegni SVG ----------------------------------------------------- */

/**
 * Salva un disegno: crea il record se l'id è nuovo, altrimenti lo sovrascrive.
 * Come per i piani di taglio, una cartella non indicata NON vuol dire radice:
 * vuol dire «lascialo dov'è».
 */
export async function salvaDisegno(
  id: ID,
  nome: string,
  svg: string,
  opzioni?: {
    cartellaId?: ID | null;
    larghezzaMm?: number | null;
    altezzaMm?: number | null;
    misureReali?: boolean;
    origine?: 'taglio' | 'file';
    nestingId?: ID | null;
    progettoId?: ID | null;
  }
): Promise<DisegnoSvg> {
  const esistente = await db.disegni.get(id);
  const adesso = ora();
  const record: DisegnoSvg = {
    id,
    nome,
    cartellaId:
      opzioni?.cartellaId !== undefined ? opzioni.cartellaId : (esistente?.cartellaId ?? null),
    creatoIl: esistente?.creatoIl ?? adesso,
    modificatoIl: adesso,
    svg,
    larghezzaMm: opzioni?.larghezzaMm ?? esistente?.larghezzaMm ?? null,
    altezzaMm: opzioni?.altezzaMm ?? esistente?.altezzaMm ?? null,
    misureReali: opzioni?.misureReali ?? esistente?.misureReali,
    origine: opzioni?.origine ?? esistente?.origine,
    nestingId: opzioni?.nestingId !== undefined ? opzioni.nestingId : (esistente?.nestingId ?? null),
    progettoId:
      opzioni?.progettoId !== undefined ? opzioni.progettoId : (esistente?.progettoId ?? null)
  };
  await scrivi('salvare il disegno', () => db.disegni.put(record));
  return record;
}

export async function leggiDisegno(id: ID): Promise<DisegnoSvg | undefined> {
  return db.disegni.get(id);
}

/** i disegni dentro una cartella dell'archivio, dal più recente */
export async function disegniInCartella(cartellaId: ID | null): Promise<DisegnoSvg[]> {
  const tutti = await db.disegni.toArray();
  return tutti
    .filter((d) => (d.cartellaId ?? null) === cartellaId && !d.progettoId)
    .sort((a, b) => b.modificatoIl - a.modificatoIl);
}

/** i disegni archiviati dentro un progetto */
export async function disegniInProgetto(progettoId: ID): Promise<DisegnoSvg[]> {
  const tutti = await db.disegni.toArray();
  return tutti
    .filter((d) => d.progettoId === progettoId)
    .sort((a, b) => b.modificatoIl - a.modificatoIl);
}

export async function rinominaDisegno(id: ID, nome: string): Promise<void> {
  await scrivi('rinominare il disegno', () =>
    db.disegni.update(id, { nome, modificatoIl: ora() })
  );
}

export async function spostaDisegno(id: ID, dove: Destinazione): Promise<void> {
  await scrivi('spostare il disegno', () =>
    db.disegni.update(id, {
      cartellaId: dove.cartellaId,
      progettoId: dove.progettoId,
      modificatoIl: ora()
    })
  );
}

export async function eliminaDisegno(id: ID): Promise<void> {
  await scrivi('eliminare il disegno', () => db.disegni.delete(id));
}
