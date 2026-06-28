import type { ConfigCloud } from '../db/types';
import { leggiImpostazioni, salvaImpostazioni } from '../db/repository';

/**
 * Accesso e archiviazione su Supabase Storage via REST (senza SDK, per tenere
 * leggera l'app). Offline-first: il cloud serve a sincronizzare e a fare da
 * copia di sicurezza, l'app non ne dipende mai per funzionare.
 *
 * La sincronizzazione (vedi sincronizzazione.ts) è incrementale: ogni foto è un
 * oggetto singolo caricato una volta sola, più un piccolo indice JSON con i
 * metadati. Niente più mega-zip che superano i limiti di dimensione/timeout.
 *
 * Setup richiesto (una tantum, su supabase.com, piano gratuito):
 * 1. crea un progetto;
 * 2. Authentication → crea un utente email+password;
 * 3. Storage → crea un bucket privato chiamato "backup";
 * 4. aggiungi le policy del bucket per consentire agli utenti autenticati
 *    lettura/scrittura sulla propria cartella;
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

// ---------------------------------------------------------------------------
// Contesto cloud: sessione aperta UNA volta per sincronizzazione, così non si
// rinnova il token a ogni singolo oggetto caricato/scaricato.
// ---------------------------------------------------------------------------

export interface ContestoCloud {
  cfg: ConfigCloud;
  accessToken: string;
  userId: string;
}

export async function apriContesto(): Promise<ContestoCloud> {
  const { cfg, sessione } = await sessioneCorrente();
  return { cfg, accessToken: sessione.accessToken, userId: sessione.userId };
}

function intestazioni(ctx: ContestoCloud): Record<string, string> {
  return { apikey: ctx.cfg.anonKey, Authorization: `Bearer ${ctx.accessToken}` };
}

interface RispostaCaricamento {
  ok: boolean;
  status: number;
  testo: string;
}

/** POST con barra di avanzamento reale dell'upload (fetch non espone il progresso). */
function caricaConProgresso(
  url: string,
  headers: Record<string, string>,
  corpo: Blob,
  onProgresso?: (frazione: number) => void
): Promise<RispostaCaricamento> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgresso) onProgresso(e.loaded / e.total);
    };
    xhr.onload = () =>
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, testo: xhr.responseText });
    xhr.onerror = () => reject(new Error('rete'));
    xhr.ontimeout = () => reject(new Error('rete'));
    xhr.send(corpo);
  });
}

/** Carica (upsert) un oggetto nella cartella dell'utente; percorso relativo a userId. */
export async function caricaOggetto(
  ctx: ContestoCloud,
  percorso: string,
  corpo: Blob,
  tipo: string,
  onProgresso?: (frazione: number) => void
): Promise<void> {
  let risposta: RispostaCaricamento;
  try {
    risposta = await caricaConProgresso(
      `${baseUrl(ctx.cfg)}/storage/v1/object/${BUCKET}/${ctx.userId}/${percorso}`,
      { ...intestazioni(ctx), 'Content-Type': tipo, 'x-upsert': 'true' },
      corpo,
      onProgresso
    );
  } catch {
    throw new Error('Caricamento interrotto: connessione assente o instabile. Riprova.');
  }
  if (!risposta.ok) {
    let dettaglio: string | number = risposta.status;
    try {
      dettaglio = (JSON.parse(risposta.testo) as { message?: string }).message ?? risposta.status;
    } catch {
      /* corpo non JSON: si usa lo status */
    }
    throw new Error(
      `Il cloud ha rifiutato il caricamento: ${dettaglio}. Verifica che il bucket "backup" esista e abbia le policy per gli utenti autenticati.`
    );
  }
}

/** Scarica un oggetto come Blob, o null se non esiste. */
export async function scaricaOggetto(ctx: ContestoCloud, percorso: string): Promise<Blob | null> {
  let risposta: Response;
  try {
    risposta = await fetch(`${baseUrl(ctx.cfg)}/storage/v1/object/${BUCKET}/${ctx.userId}/${percorso}`, {
      headers: intestazioni(ctx)
    });
  } catch {
    throw new Error('Scaricamento interrotto: connessione assente o instabile.');
  }
  if (risposta.status === 404 || risposta.status === 400) return null;
  if (!risposta.ok) throw new Error('Scaricamento non riuscito dal cloud.');
  return risposta.blob();
}

/** Scarica un oggetto di testo (es. l'indice JSON), o null se non esiste. */
export async function scaricaTesto(ctx: ContestoCloud, percorso: string): Promise<string | null> {
  const blob = await scaricaOggetto(ctx, percorso);
  return blob ? blob.text() : null;
}

/**
 * Elenca i nomi degli oggetti sotto una sotto-cartella dell'utente (relativi
 * alla sotto-cartella). Pagina automaticamente oltre i 1000 risultati.
 */
export async function elencaNomi(ctx: ContestoCloud, sottocartella: string): Promise<string[]> {
  const nomi: string[] = [];
  const limite = 1000;
  for (let offset = 0; ; offset += limite) {
    let risposta: Response;
    try {
      risposta = await fetch(`${baseUrl(ctx.cfg)}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: { ...intestazioni(ctx), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: `${ctx.userId}/${sottocartella}`,
          limit: limite,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        })
      });
    } catch {
      throw new Error('Impossibile leggere l’elenco dal cloud: connessione assente o instabile.');
    }
    if (!risposta.ok) throw new Error('Impossibile leggere l’elenco dal cloud.');
    const lista = (await risposta.json()) as Array<{ name: string }>;
    for (const f of lista) nomi.push(f.name);
    if (lista.length < limite) break;
  }
  return nomi;
}
