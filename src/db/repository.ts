import { db } from './db';
import {
  IMPOSTAZIONI_DEFAULT,
  type Annotazione,
  type Cartella,
  type Cliente,
  type Foto,
  type ID,
  type Impostazioni,
  type LavoroNesting,
  type Preventivo,
  type Progetto,
  type Sezione
} from './types';
import { nuovoId } from '../utils/id';
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
    db.transaction('rw', [db.progetti, db.foto, db.annotazioni, db.preventivi], async () => {
      const foto = await db.foto.where('progettoId').equals(id).primaryKeys();
      await db.annotazioni.where('fotoId').anyOf(foto).delete();
      await db.foto.bulkDelete(foto);
      // i preventivi sono documenti commerciali: si scollegano, non si eliminano
      await db.preventivi.where('progettoId').equals(id).modify({ progettoId: null });
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
    ePianta: true,
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
    pdf: { ...IMPOSTAZIONI_DEFAULT.pdf, ...i.pdf }
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

/** i lavori dentro una cartella dell'archivio */
export async function nestingInCartella(cartellaId: ID | null): Promise<LavoroNesting[]> {
  const tutti = await db.nesting.toArray();
  return tutti
    .filter((l) => (l.cartellaId ?? null) === cartellaId)
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
  opzioni?: { cartellaId?: ID | null; pdf?: Blob }
): Promise<LavoroNesting> {
  const esistente = await db.nesting.get(id);
  const adesso = ora();
  const record: LavoroNesting = {
    id,
    nome,
    cartellaId:
      opzioni?.cartellaId !== undefined ? opzioni.cartellaId : (esistente?.cartellaId ?? null),
    creatoIl: esistente?.creatoIl ?? adesso,
    modificatoIl: adesso,
    documento,
    pdf: opzioni?.pdf ?? esistente?.pdf,
    pdfIl: opzioni?.pdf ? adesso : esistente?.pdfIl
  };
  await scrivi('salvare il lavoro di nesting', () => db.nesting.put(record));
  return record;
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

export async function spostaNesting(id: ID, cartellaId: ID | null): Promise<void> {
  await scrivi('spostare il lavoro di nesting', () =>
    db.nesting.update(id, { cartellaId, modificatoIl: ora() })
  );
}

export async function eliminaNesting(id: ID): Promise<void> {
  await scrivi('eliminare il lavoro di nesting', () => db.nesting.delete(id));
}
