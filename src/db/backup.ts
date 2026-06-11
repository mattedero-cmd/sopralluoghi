import JSZip from 'jszip';
import { db } from './db';
import type { Annotazione, Cartella, Foto, Impostazioni, Progetto } from './types';

const VERSIONE_BACKUP = 1;

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
}

/**
 * Backup locale su file: rete di sicurezza indipendente da qualsiasi
 * servizio cloud. Contiene TUTTO: struttura, metadati e foto originali.
 */
export async function esportaBackup(avanzamento?: (msg: string) => void): Promise<Blob> {
  avanzamento?.('Lettura archivio…');
  const [cartelle, progetti, foto, annotazioni, impostazioni] = await Promise.all([
    db.cartelle.toArray(),
    db.progetti.toArray(),
    db.foto.toArray(),
    db.annotazioni.toArray(),
    db.impostazioni.get('app')
  ]);

  const manifest: ManifestBackup = {
    app: 'sopralluoghi',
    versione: VERSIONE_BACKUP,
    esportatoIl: Date.now(),
    cartelle,
    progetti,
    foto: foto.map(({ origine: _o, miniatura: _m, ...resto }) => resto),
    annotazioni,
    impostazioni: impostazioni ?? null
  };

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(manifest));
  for (const f of foto) {
    zip.file(`foto/${f.id}.jpg`, f.origine);
    zip.file(`miniature/${f.id}.jpg`, f.miniatura);
  }
  avanzamento?.('Compressione…');
  return zip.generateAsync(
    { type: 'blob', compression: 'STORE' }, // i JPEG sono già compressi
    (meta) => avanzamento?.(`Compressione… ${meta.percent.toFixed(0)}%`)
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
  avanzamento?: (msg: string) => void
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

  avanzamento?.('Estrazione foto…');
  const fotoComplete: Foto[] = [];
  for (const meta of manifest.foto) {
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
  }

  avanzamento?.('Scrittura nel database…');
  await db.transaction(
    'rw',
    [db.cartelle, db.progetti, db.foto, db.annotazioni, db.impostazioni],
    async () => {
      await db.cartelle.bulkPut(manifest.cartelle);
      await db.progetti.bulkPut(manifest.progetti);
      await db.foto.bulkPut(fotoComplete);
      await db.annotazioni.bulkPut(manifest.annotazioni);
      if (manifest.impostazioni) await db.impostazioni.put(manifest.impostazioni);
    }
  );

  return {
    cartelle: manifest.cartelle.length,
    progetti: manifest.progetti.length,
    foto: fotoComplete.length,
    annotazioni: manifest.annotazioni.length
  };
}
