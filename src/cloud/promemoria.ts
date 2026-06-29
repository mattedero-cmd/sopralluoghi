/**
 * Tracciamento delle modifiche non ancora sincronizzate.
 *
 * Ogni scrittura sull'archivio (vedi repository.scrivi) marca lo stato come
 * "modificato"; una sincronizzazione riuscita lo azzera. Serve al promemoria di
 * fine sessione, che invita a sincronizzare solo se c'è lavoro non ancora salvato
 * sul cloud. Persistito in localStorage così sopravvive a ricariche e chiusure.
 */

const CHIAVE = 'sopralluoghi:ultimaModifica';

/** Marca che ci sono modifiche locali non ancora sincronizzate. */
export function segnaModifica(): void {
  try {
    localStorage.setItem(CHIAVE, String(Date.now()));
  } catch {
    /* localStorage non disponibile: il promemoria semplicemente non scatterà */
  }
}

/** Azzera lo stato: tutto è allineato al cloud. */
export function segnaSincronizzato(): void {
  try {
    localStorage.setItem(CHIAVE, '0');
  } catch {
    /* ignora */
  }
}

/** Ci sono modifiche locali in attesa di sincronizzazione? */
export function modificheInSospeso(): boolean {
  try {
    return Number(localStorage.getItem(CHIAVE) || 0) > 0;
  } catch {
    return false;
  }
}

// Frequenza del promemoria: al massimo una volta ogni 24 ore, così aprendo e
// chiudendo l'app più volte non viene riproposto di continuo.
const CHIAVE_PROMEMORIA = 'sopralluoghi:ultimoPromemoria';

/** Timestamp dell'ultimo promemoria mostrato. */
export function ultimoPromemoria(): number {
  try {
    return Number(localStorage.getItem(CHIAVE_PROMEMORIA) || 0);
  } catch {
    return 0;
  }
}

/** Segna che il promemoria è stato mostrato adesso (per diradarlo). */
export function segnaPromemoriaMostrato(): void {
  try {
    localStorage.setItem(CHIAVE_PROMEMORIA, String(Date.now()));
  } catch {
    /* ignora */
  }
}
