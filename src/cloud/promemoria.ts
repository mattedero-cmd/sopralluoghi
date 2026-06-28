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
