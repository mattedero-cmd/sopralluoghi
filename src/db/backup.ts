import JSZip from 'jszip';
import { db } from './db';
import type {
  Annotazione,
  Cartella,
  Cliente,
  ConfigCloud,
  Foto,
  Impostazioni,
  Preventivo,
  Progetto
} from './types';

const VERSIONE_BACKUP = 2;

/**
 * Callback di avanzamento: messaggio per l'utente e, quando è nota, la
 * frazione completata (0..1) della fase in corso, per la barra di progresso.
 */
export type Avanzamento = (messaggio: string, frazione?: number) => void;

interface ManifestBackup {
  app: 'sopralluoghi';
  versione: number;
  esportatoIl: number;
  cartelle: Cartella[];
  progetti: Progetto[];
  /** metadati foto senza i dati binari (salvati come file nello zip) */
  foto: Array<Omit<Foto, 'origine' | 'miniatura'>>;
  annotazioni: Annotazione[];
  impostazioni: Impostazioni | null;
  /** dalla versione 2 */
  clienti?: Cliente[];
  preventivi?: Preventivo[];
}

/**
 * Backup locale su file: rete di sicurezza indipendente da qualsiasi
 * servizio cloud. Contiene TUTTO: struttura, metadati e foto originali.
 */
export async function esportaBackup(avanzamento?: Avanzamento): Promise<Blob> {
  avanzamento?.('Lettura archivio…');
  const [cartelle, progetti, foto, annotazioni, impostazioni, clienti, preventivi] =
    await Promise.all([
      db.cartelle.toArray(),
      db.progetti.toArray(),
      db.foto.toArray(),
      db.annotazioni.toArray(),
      db.impostazioni.get('app'),
      db.clienti.toArray(),
      db.preventivi.toArray()
    ]);

  const manifest: ManifestBackup = {
    app: 'sopralluoghi',
    versione: VERSIONE_BACKUP,
    esportatoIl: Date.now(),
    cartelle,
    progetti,
    foto: foto.map(({ origine: _o, miniatura: _m, ...resto }) => resto),
    annotazioni,
    impostazioni: impostazioni ?? null,
    clienti,
    preventivi
  };

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(manifest));
  for (const f of foto) {
    zip.file(`foto/${f.id}.jpg`, f.origine);
    zip.file(`miniature/${f.id}.jpg`, f.miniatura);
  }
  avanzamento?.('Compressione…', 0);
  return zip.generateAsync(
    { type: 'blob', compression: 'STORE' }, // i JPEG sono già compressi
    (meta) => avanzamento?.('Compressione…', meta.percent / 100)
  );
}

export interface EsitoRipristino {
  cartelle: number;
  progetti: number;
  foto: number;
  annotazioni: number;
}

/**
 * Ripristino da file di backup. L'importazione avviene in un'unica
 * transazione (o tutto o niente) e unisce per id: rieseguirla è
 * idempotente e non crea duplicati.
 */
export async function importaBackup(
  file: Blob,
  avanzamento?: Avanzamento,
  opzioni?: { preservaSessioneCloud?: boolean }
): Promise<EsitoRipristino> {
  avanzamento?.('Lettura file…');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('File non valido: non è un backup di Sopralluoghi.');
  }
  const manifestFile = zip.file('backup.json');
  if (!manifestFile) throw new Error('Backup incompleto: manca backup.json.');

  let manifest: ManifestBackup;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch {
    throw new Error('Backup danneggiato: manifest illeggibile.');
  }
  if (manifest.app !== 'sopralluoghi') {
    throw new Error('Il file non è un backup di questa applicazione.');
  }
  if (manifest.versione > VERSIONE_BACKUP) {
    throw new Error(
      'Backup creato con una versione più recente dell’app: aggiorna l’app e riprova.'
    );
  }

  avanzamento?.('Estrazione foto…', 0);
  const totaleFoto = manifest.foto.length;
  const fotoComplete: Foto[] = [];
  for (let i = 0; i < totaleFoto; i++) {
    const meta = manifest.foto[i];
    const fOrig = zip.file(`foto/${meta.id}.jpg`);
    const fMini = zip.file(`miniature/${meta.id}.jpg`);
    if (!fOrig) throw new Error(`Backup incompleto: manca l'immagine della foto ${meta.id}.`);
    const origine = await fOrig.async('arraybuffer');
    const miniatura = fMini ? await fMini.async('arraybuffer') : origine.slice(0);
    fotoComplete.push({
      ...meta,
      origine,
      origineTipo: meta.origineTipo || 'image/jpeg',
      miniatura,
      miniaturaTipo: meta.miniaturaTipo || 'image/jpeg'
    });
    avanzamento?.('Estrazione foto…', totaleFoto ? (i + 1) / totaleFoto : 1);
  }

  // Durante la sincronizzazione automatica la sessione cloud locale (token,
  // userId, impostazioni di sync) NON deve essere sovrascritta dal backup di
  // un altro dispositivo: la preserviamo e la reinnestiamo nelle impostazioni.
  let cloudLocale: ConfigCloud | null = null;
  if (opzioni?.preservaSessioneCloud) {
    cloudLocale = (await db.impostazioni.get('app'))?.cloud ?? null;
  }

  avanzamento?.('Scrittura nel database…');
  await db.transaction(
    'rw',
    [db.cartelle, db.progetti, db.foto, db.annotazioni, db.impostazioni, db.clienti, db.preventivi],
    async () => {
      await db.cartelle.bulkPut(manifest.cartelle);
      await db.progetti.bulkPut(manifest.progetti);
      await db.foto.bulkPut(fotoComplete);
      await db.annotazioni.bulkPut(manifest.annotazioni);
      if (manifest.impostazioni) {
        const imp = opzioni?.preservaSessioneCloud
          ? { ...manifest.impostazioni, cloud: cloudLocale }
          : manifest.impostazioni;
        await db.impostazioni.put(imp);
      }
      // presenti dalla versione 2 del backup
      if (manifest.clienti) await db.clienti.bulkPut(manifest.clienti);
      if (manifest.preventivi) await db.preventivi.bulkPut(manifest.preventivi);
    }
  );

  return {
    cartelle: manifest.cartelle.length,
    progetti: manifest.progetti.length,
    foto: fotoComplete.length,
    annotazioni: manifest.annotazioni.length
  };
}

// ---------------------------------------------------------------------------
// Indice per la sincronizzazione incrementale (metadati senza i binari).
// I binari delle foto viaggiano come oggetti singoli sul cloud, caricati una
// volta sola; l'indice tiene insieme struttura, quote, clienti e preventivi.
// ---------------------------------------------------------------------------

export interface IndiceArchivio {
  app: 'sopralluoghi';
  versione: number;
  aggiornatoIl: number;
  cartelle: Cartella[];
  progetti: Progetto[];
  /** metadati foto senza i dati binari (origine/miniatura sono oggetti separati) */
  foto: Array<Omit<Foto, 'origine' | 'miniatura'>>;
  annotazioni: Annotazione[];
  clienti: Cliente[];
  preventivi: Preventivo[];
  impostazioni: Impostazioni | null;
}

/** Costruisce l'indice dell'archivio locale (metadati, niente binari) da pubblicare sul cloud. */
export async function costruisciIndice(): Promise<IndiceArchivio> {
  const [cartelle, progetti, foto, annotazioni, impostazioni, clienti, preventivi] =
    await Promise.all([
      db.cartelle.toArray(),
      db.progetti.toArray(),
      db.foto.toArray(),
      db.annotazioni.toArray(),
      db.impostazioni.get('app'),
      db.clienti.toArray(),
      db.preventivi.toArray()
    ]);
  return {
    app: 'sopralluoghi',
    versione: VERSIONE_BACKUP,
    aggiornatoIl: Date.now(),
    cartelle,
    progetti,
    foto: foto.map(({ origine: _o, miniatura: _m, ...resto }) => resto),
    annotazioni,
    clienti,
    preventivi,
    // mai pubblicare la sessione cloud (token) nell'indice condiviso
    impostazioni: impostazioni ? { ...impostazioni, cloud: null } : null
  };
}

/**
 * Unisce i metadati dell'indice remoto nell'archivio locale (per id, senza
 * cancellare), preservando la sessione cloud locale. I binari e i metadati
 * delle nuove foto sono gestiti dal chiamante (vedi sincronizzazione).
 */
export async function applicaMetadati(indice: IndiceArchivio): Promise<void> {
  const impLocale = await db.impostazioni.get('app');
  const cloudLocale = impLocale?.cloud ?? null;
  // Le impostazioni remote si applicano solo se più recenti di quelle locali,
  // così la sincronizzazione non sovrascrive modifiche locali non ancora
  // inviate. La sessione cloud resta sempre quella locale.
  const impRemoteNuove =
    !!indice.impostazioni &&
    (indice.impostazioni.modificatoIl ?? 0) > (impLocale?.modificatoIl ?? 0);
  await db.transaction(
    'rw',
    [db.cartelle, db.progetti, db.annotazioni, db.impostazioni, db.clienti, db.preventivi],
    async () => {
      await db.cartelle.bulkPut(indice.cartelle);
      await db.progetti.bulkPut(indice.progetti);
      await db.annotazioni.bulkPut(indice.annotazioni);
      if (indice.clienti) await db.clienti.bulkPut(indice.clienti);
      if (indice.preventivi) await db.preventivi.bulkPut(indice.preventivi);
      if (impRemoteNuove) {
        await db.impostazioni.put({ ...indice.impostazioni!, cloud: cloudLocale });
      }
    }
  );
}
