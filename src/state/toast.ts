import { createStore } from './store';

export type TipoToast = 'info' | 'successo' | 'errore';

export interface Toast {
  id: number;
  tipo: TipoToast;
  messaggio: string;
}

export const toastStore = createStore<Toast[]>([]);

let prossimoId = 1;

export function mostraToast(tipo: TipoToast, messaggio: string, durataMs = 4000) {
  const id = prossimoId++;
  toastStore.set((prev) => [...prev, { id, tipo, messaggio }]);
  // Gli errori restano più a lungo: niente fallimenti silenziosi né fugaci
  const durata = tipo === 'errore' ? Math.max(durataMs, 8000) : durataMs;
  setTimeout(() => {
    toastStore.set((prev) => prev.filter((t) => t.id !== id));
  }, durata);
}

export function chiudiToast(id: number) {
  toastStore.set((prev) => prev.filter((t) => t.id !== id));
}
