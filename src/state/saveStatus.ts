import { createStore } from './store';

export type StatoSalvataggio = 'salvato' | 'salvataggio' | 'errore';

export const saveStatusStore = createStore<StatoSalvataggio>('salvato');

let operazioniInCorso = 0;

export function inizioSalvataggio() {
  operazioniInCorso++;
  saveStatusStore.set('salvataggio');
}

export function fineSalvataggio(ok: boolean) {
  operazioniInCorso = Math.max(0, operazioniInCorso - 1);
  if (!ok) {
    saveStatusStore.set('errore');
  } else if (operazioniInCorso === 0 && saveStatusStore.get() !== 'errore') {
    saveStatusStore.set('salvato');
  }
}

/** Dopo un errore, una scrittura riuscita ripristina lo stato normale */
export function resetErroreSalvataggio() {
  if (operazioniInCorso === 0) saveStatusStore.set('salvato');
}
