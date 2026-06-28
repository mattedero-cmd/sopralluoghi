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

let inCorso = false;
let avviato = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Esegue una sincronizzazione completa (pull + push). Usata anche dal pulsante manuale. */
export async function sincronizzaGiornaliera(avanzamento?: (msg: string) => void): Promise<void> {
  if (inCorso) return;
  inCorso = true;
  try {
    // 1) PULL: prendi il backup più recente dal cloud e fondilo nell'archivio
    //    locale, senza toccare la sessione cloud di questo dispositivo.
    avanzamento?.('Sincronizzazione: lettura dal cloud…');
    const lista = await elencaBackupCloud(); // già ordinati dal più recente
    if (lista.length > 0) {
      await ripristinaDaCloud(lista[0].name, avanzamento, { preservaSessioneCloud: true });
    }
    // 2) PUSH: ripubblica lo stato unito perché lo vedano gli altri dispositivi.
    avanzamento?.('Sincronizzazione: invio al cloud…');
    await backupSuCloud(avanzamento);
    // 3) segna l'orario dell'ultima sincronizzazione riuscita
    const imp = await leggiImpostazioni();
    if (imp.cloud) {
      await salvaImpostazioni({ ...imp, cloud: { ...imp.cloud, ultimaSync: Date.now() } });
    }
  } finally {
    inCorso = false;
  }
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
  if (inCorso) return;
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
