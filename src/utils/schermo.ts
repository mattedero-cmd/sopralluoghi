/**
 * Mantiene lo schermo acceso durante operazioni lunghe (es. la
 * sincronizzazione), tramite la Screen Wake Lock API.
 *
 * Dettagli da gestire:
 *  - il lock si auto-rilascia quando la pagina va in background: va riacquisito
 *    al ritorno in primo piano finché l'operazione è ancora attiva;
 *  - va sempre rilasciato a fine operazione, anche in caso di errore;
 *  - più richieste concorrenti condividono un solo lock (conteggio reentrant);
 *  - se l'API non è disponibile (iOS < 16.4, contesti non sicuri) la funzione è
 *    un no-op silenzioso: l'operazione prosegue comunque.
 */

let sentinel: WakeLockSentinel | null = null;
let attive = 0;
let suVisibilita: (() => void) | null = null;

async function acquisisci(): Promise<void> {
  try {
    if (!('wakeLock' in navigator) || typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return; // l'API lo rifiuta se nascosto
    if (sentinel) return; // già attivo
    sentinel = await navigator.wakeLock.request('screen');
    // se il browser lo rilascia (es. background), azzera così si può riacquisire
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // permesso negato o API assente: si prosegue senza wake lock
    sentinel = null;
  }
}

/**
 * Tiene lo schermo acceso finché non si chiama la funzione restituita.
 * Va sempre invocata la funzione di rilascio (idealmente in un blocco finally).
 */
export function mantieniSchermoAcceso(): () => void {
  attive++;
  if (!suVisibilita) {
    suVisibilita = () => {
      if (attive > 0 && document.visibilityState === 'visible') void acquisisci();
    };
    document.addEventListener('visibilitychange', suVisibilita);
  }
  void acquisisci();

  let rilasciato = false;
  return () => {
    if (rilasciato) return; // idempotente: rilasciare due volte non scala il contatore
    rilasciato = true;
    attive = Math.max(0, attive - 1);
    if (attive === 0) {
      if (suVisibilita) {
        document.removeEventListener('visibilitychange', suVisibilita);
        suVisibilita = null;
      }
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => undefined);
    }
  };
}
