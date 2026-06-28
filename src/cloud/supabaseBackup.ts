import type { ConfigCloud } from '../db/types';
import { esportaBackup, importaBackup, type EsitoRipristino } from '../db/backup';
import { leggiImpostazioni, salvaImpostazioni } from '../db/repository';

/**
 * Backup cloud unidirezionale (locale → cloud) su Supabase Storage,
 * implementato via REST senza SDK per tenere leggera l'app.
 * Offline-first: il cloud è solo una copia di sicurezza; l'app non ne
 * dipende mai per funzionare.
 *
 * Setup richiesto (una tantum, su supabase.com, piano gratuito):
 * 1. crea un progetto;
 * 2. Authentication → crea un utente email+password;
 * 3. Storage → crea un bucket privato chiamato "backup";
 * 4. aggiungi le policy del bucket per consentire agli utenti
 *    autenticati lettura/scrittura su "backup";
 * 5. incolla URL del progetto e chiave anon nelle Impostazioni dell'app.
 */

const BUCKET = 'backup';

interface Sessione {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

function controllaConfig(cfg: ConfigCloud | null | undefined): asserts cfg is ConfigCloud {
  if (!cfg || !cfg.url || !cfg.anonKey) {
    throw new Error('Backup cloud non configurato: inserisci URL e chiave del progetto Supabase.');
  }
}

function baseUrl(cfg: ConfigCloud): string {
  return cfg.url.replace(/\/+$/, '');
}

async function richiestaAuth(
  cfg: ConfigCloud,
  grant: 'password' | 'refresh_token',
  corpo: Record<string, string>
): Promise<Sessione> {
  let risposta: Response;
  try {
    risposta = await fetch(`${baseUrl(cfg)}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
      body: JSON.stringify(corpo)
    });
  } catch {
    throw new Error('Cloud non raggiungibile: controlla la connessione e l’URL del progetto.');
  }
  const dati = (await risposta.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    user?: { id?: string };
    error_description?: string;
    msg?: string;
  };
  if (!risposta.ok || !dati.access_token || !dati.refresh_token) {
    throw new Error(
      `Accesso al cloud rifiutato: ${dati.error_description ?? dati.msg ?? 'credenziali non valide o sessione scaduta. Ripeti l’accesso.'}`
    );
  }
  return {
    accessToken: dati.access_token,
    refreshToken: dati.refresh_token,
    userId: dati.user?.id ?? ''
  };
}

/** Accesso con email e password; la sessione viene persistita nelle impostazioni */
export async function accediCloud(email: string, password: string): Promise<void> {
  const imp = await leggiImpostazioni();
  controllaConfig(imp.cloud);
  const sessione = await richiestaAuth(imp.cloud, 'password', { email, password });
  await salvaImpostazioni({
    ...imp,
    cloud: {
      ...imp.cloud,
      email,
      refreshToken: sessione.refreshToken,
      userId: sessione.userId
    }
  });
}

export async function disconnettiCloud(): Promise<void> {
  const imp = await leggiImpostazioni();
  if (!imp.cloud) return;
  await salvaImpostazioni({
    ...imp,
    cloud: { ...imp.cloud, refreshToken: null, userId: null }
  });
}

/** Rinnova la sessione dal refresh token persistito */
async function sessioneCorrente(): Promise<{ cfg: ConfigCloud; sessione: Sessione }> {
  const imp = await leggiImpostazioni();
  controllaConfig(imp.cloud);
  if (!imp.cloud.refreshToken) {
    throw new Error('Non hai effettuato l’accesso al cloud: inserisci email e password.');
  }
  const sessione = await richiestaAuth(imp.cloud, 'refresh_token', {
    refresh_token: imp.cloud.refreshToken
  });
  // il refresh token ruota a ogni uso: si salva il nuovo
  await salvaImpostazioni({
    ...imp,
    cloud: { ...imp.cloud, refreshToken: sessione.refreshToken, userId: sessione.userId }
  });
  return { cfg: imp.cloud, sessione };
}

function nomeFileBackup(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `backup_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}

export interface FileCloud {
  name: string;
  /** dimensione in byte se nota */
  size: number | null;
  updatedAt: string | null;
}

/** Esegue il backup completo e lo carica nel bucket privato dell'utente */
export async function backupSuCloud(avanzamento?: (msg: string) => void): Promise<string> {
  const { cfg, sessione } = await sessioneCorrente();
  const blob = await esportaBackup(avanzamento);
  const nome = nomeFileBackup();
  const percorso = `${sessione.userId}/${nome}`;
  avanzamento?.(`Caricamento sul cloud… (${(blob.size / (1024 * 1024)).toFixed(1)} MB)`);
  let risposta: Response;
  try {
    risposta = await fetch(`${baseUrl(cfg)}/storage/v1/object/${BUCKET}/${percorso}`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${sessione.accessToken}`,
        'Content-Type': 'application/zip',
        'x-upsert': 'true'
      },
      body: blob
    });
  } catch {
    throw new Error('Caricamento interrotto: connessione assente o instabile. Riprova.');
  }
  if (!risposta.ok) {
    const errore = (await risposta.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      `Il cloud ha rifiutato il backup: ${errore.message ?? risposta.status}. Verifica che il bucket "backup" esista e abbia le policy per gli utenti autenticati.`
    );
  }
  const imp = await leggiImpostazioni();
  if (imp.cloud) {
    await salvaImpostazioni({ ...imp, cloud: { ...imp.cloud, ultimoBackup: Date.now() } });
  }
  return nome;
}

/** Elenco dei backup presenti sul cloud, dal più recente */
export async function elencaBackupCloud(): Promise<FileCloud[]> {
  const { cfg, sessione } = await sessioneCorrente();
  const risposta = await fetch(`${baseUrl(cfg)}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${sessione.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prefix: `${sessione.userId}/`,
      sortBy: { column: 'created_at', order: 'desc' },
      limit: 50
    })
  });
  if (!risposta.ok) {
    throw new Error('Impossibile leggere l’elenco dei backup dal cloud.');
  }
  const lista = (await risposta.json()) as Array<{
    name: string;
    updated_at?: string;
    metadata?: { size?: number };
  }>;
  return lista
    .filter((f) => f.name.endsWith('.zip'))
    .map((f) => ({
      name: f.name,
      size: f.metadata?.size ?? null,
      updatedAt: f.updated_at ?? null
    }));
}

/** Scarica un backup dal cloud e lo ripristina (unione per id, come da file) */
export async function ripristinaDaCloud(
  nomeFile: string,
  avanzamento?: (msg: string) => void,
  opzioni?: { preservaSessioneCloud?: boolean }
): Promise<EsitoRipristino> {
  const { cfg, sessione } = await sessioneCorrente();
  avanzamento?.('Scaricamento dal cloud…');
  let risposta: Response;
  try {
    risposta = await fetch(
      `${baseUrl(cfg)}/storage/v1/object/${BUCKET}/${sessione.userId}/${nomeFile}`,
      {
        headers: { apikey: cfg.anonKey, Authorization: `Bearer ${sessione.accessToken}` }
      }
    );
  } catch {
    throw new Error('Scaricamento interrotto: connessione assente o instabile.');
  }
  if (!risposta.ok) throw new Error('Backup non trovato sul cloud.');
  const blob = await risposta.blob();
  return importaBackup(blob, avanzamento, opzioni);
}
