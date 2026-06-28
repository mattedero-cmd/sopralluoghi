import { frazionaAvanzamento, type Avanzamento, type EsitoRipristino } from '../db/backup';
import { leggiImpostazioni, salvaImpostazioni } from '../db/repository';
import { backupSuCloud, elencaBackupCloud, ripristinaDaCloud } from './supabaseBackup';

/**
 * Sincronizzazione giornaliera tra dispositivi.
 *
 * Modello offline-first: ogni dispositivo, una volta al giorno, scarica dal
 * cloud lo stato più recente e lo unisce al proprio (pull), poi ripubblica
 * l'unione (push). I record si fondono per id: l'archivio converge sull'unione
 * di tutti i dispositivi.
 *
 * Pianificazione "notturna" (ancorata alle 2:00 di default):
 *  - se l'app/SW è viva all'ora prevista (es. Mac lasciato acceso) parte con un
 *    timer a quell'ora esatta;
 *  - altrimenti parte alla prima apertura/ritorno online successivo all'orario
 *    (caso iPhone): un browser non può garantire l'esecuzione a finestra chiusa,
 *    quindi l'orario è un "checkpoint giornaliero", non una sveglia hardware.
 */

const ORA_DEFAULT = 2;

let avviato = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Promessa della sync in corso: nuove chiamate vi si agganciano invece di partirne un'altra. */
let promessaInCorso: Promise<RisultatoSync> | null = null;

export interface RisultatoSync {
  /** quanti backup erano presenti sul cloud (nella cartella di questo utente) */
  filesCloud: number;
  /** nome del backup scaricato e unito, se presente */
  scaricato: string | null;
  /** conteggi del backup unito (totali contenuti, non solo i nuovi) */
  importato: EsitoRipristino | null;
  /** nome del backup caricato sul cloud */
  caricato: string;
}

/**
 * Sincronizzazione completa (pull + push). Usata sia dal pianificatore sia dal
 * pulsante manuale. Se una sync è già in corso, restituisce la STESSA promessa:
 * così il pulsante manuale attende il lavoro reale e ne riporta l'esito vero,
 * invece di dichiarare "successo" su un'operazione mai eseguita.
 */
export function sincronizzaGiornaliera(avanzamento?: Avanzamento): Promise<RisultatoSync> {
  if (promessaInCorso) return promessaInCorso;
  const p = eseguiSync(avanzamento);
  promessaInCorso = p;
  void p.catch(() => undefined).finally(() => {
    if (promessaInCorso === p) promessaInCorso = null;
  });
  return p;
}

async function eseguiSync(avanzamento?: Avanzamento): Promise<RisultatoSync> {
  // 1) PULL: prendi il backup più recente dal cloud e fondilo nell'archivio
  //    locale, senza toccare la sessione cloud di questo dispositivo.
  avanzamento?.('Lettura dal cloud…', 0);
  const lista = await elencaBackupCloud(); // già ordinati dal più recente
  let scaricato: string | null = null;
  let importato: EsitoRipristino | null = null;
  // se c'è qualcosa da scaricare, il pull occupa la prima parte della barra
  const pesoPull = lista.length > 0 ? 0.45 : 0;
  if (lista.length > 0) {
    scaricato = lista[0].name;
    importato = await ripristinaDaCloud(scaricato, frazionaAvanzamento(avanzamento, 0, pesoPull), {
      preservaSessioneCloud: true
    });
  }
  // 2) PUSH: ripubblica lo stato unito perché lo vedano gli altri dispositivi.
  const caricato = await backupSuCloud(frazionaAvanzamento(avanzamento, pesoPull, 1 - pesoPull));
  // 3) segna l'orario dell'ultima sincronizzazione riuscita
  const imp = await leggiImpostazioni();
  if (imp.cloud) {
    await salvaImpostazioni({ ...imp, cloud: { ...imp.cloud, ultimaSync: Date.now() } });
  }
  avanzamento?.('Completato', 1);
  return { filesCloud: lista.length, scaricato, importato, caricato };
}

/** Timestamp dell'ultima scadenza (ora:00) già passata: oggi se è passata, altrimenti ieri. */
function scadenzaGiornalieraPassata(ora: number): number {
  const adesso = new Date();
  const scadenza = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate(), ora, 0, 0, 0);
  if (scadenza.getTime() > adesso.getTime()) {
    scadenza.setDate(scadenza.getDate() - 1); // la scadenza di oggi non è ancora passata
  }
  return scadenza.getTime();
}

/** Sincronizza solo se è abilitata, c'è rete e non è già stato fatto dopo l'ultima scadenza. */
export async function forseSincronizza(): Promise<void> {
  if (promessaInCorso) return;
  let imp;
  try {
    imp = await leggiImpostazioni();
  } catch {
    return;
  }
  const c = imp.cloud;
  if (!c?.sincronizzaAuto || !c.refreshToken) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const scadenza = scadenzaGiornalieraPassata(c.oraSync ?? ORA_DEFAULT);
  if (c.ultimaSync && c.ultimaSync >= scadenza) return; // già sincronizzato oggi
  try {
    await sincronizzaGiornaliera();
  } catch (e) {
    // silenziosa: riproverà alla prossima apertura, al ritorno online o all'orario
    console.warn('Sincronizzazione notturna non riuscita:', e);
  }
}

/** Programma il timer all'ora esatta (per i dispositivi lasciati accesi). */
async function pianificaProssima(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  let imp;
  try {
    imp = await leggiImpostazioni();
  } catch {
    return;
  }
  const c = imp.cloud;
  if (!c?.sincronizzaAuto || !c.refreshToken) return;
  const ora = c.oraSync ?? ORA_DEFAULT;
  const adesso = new Date();
  const prossima = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate(), ora, 0, 0, 0);
  if (prossima.getTime() <= adesso.getTime()) prossima.setDate(prossima.getDate() + 1);
  const ms = prossima.getTime() - adesso.getTime(); // < 24h: dentro il limite di setTimeout
  timer = setTimeout(() => {
    void forseSincronizza().finally(() => void pianificaProssima());
  }, ms);
}

/**
 * Avvia (una sola volta) il pianificatore: checkpoint all'apertura, al ritorno
 * in primo piano e online, più il timer all'ora prevista. Chiamabile di nuovo
 * dopo un cambio di impostazioni per riprogrammare senza duplicare i listener.
 */
export function avviaPianificatoreSync(): void {
  if (!avviato) {
    avviato = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void forseSincronizza();
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void forseSincronizza());
    }
  }
  void forseSincronizza();
  void pianificaProssima();
}
