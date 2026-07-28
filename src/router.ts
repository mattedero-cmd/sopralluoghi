import { useSyncExternalStore } from 'react';

/**
 * Router minimale basato su hash: robusto offline (nessuna dipendenza
 * dal service worker per la navigazione) e senza librerie esterne.
 */
export type Rotta =
  | { nome: 'archivio'; cartellaId: string | null }
  | { nome: 'progetto'; id: string }
  | { nome: 'foto'; id: string }
  | { nome: 'clienti' }
  | { nome: 'cliente'; id: string }
  | { nome: 'preventivo'; id: string }
  | { nome: 'nesting'; id?: string; nuovoIn?: string; dentro?: string }
  | { nome: 'disegno'; id: string }
  | { nome: 'impostazioni' };

export function analizzaHash(hash: string): Rotta {
  const pulito = hash.replace(/^#\/?/, '');
  const parti = pulito.split('/').filter(Boolean);
  if (parti[0] === 'cartella' && parti[1]) return { nome: 'archivio', cartellaId: parti[1] };
  if (parti[0] === 'progetto' && parti[1]) return { nome: 'progetto', id: parti[1] };
  if (parti[0] === 'foto' && parti[1]) return { nome: 'foto', id: parti[1] };
  if (parti[0] === 'clienti') return { nome: 'clienti' };
  if (parti[0] === 'cliente' && parti[1]) return { nome: 'cliente', id: parti[1] };
  if (parti[0] === 'preventivo' && parti[1]) return { nome: 'preventivo', id: parti[1] };
  if (parti[0] === 'nesting') {
    // #/nesting              → bozza corrente
    // #/nesting/<id>         → lavoro salvato in archivio
    // #/nesting/nuovo/<cart> → lavoro nuovo dentro una cartella
    // #/nesting/in/<cart>    → bozza corrente, aperta DA una cartella: se non
    //                          è ancora in archivio, quella diventa casa sua
    if (parti[1] === 'nuovo') return { nome: 'nesting', nuovoIn: parti[2] };
    if (parti[1] === 'in' && parti[2]) return { nome: 'nesting', dentro: parti[2] };
    if (parti[1]) return { nome: 'nesting', id: parti[1] };
    return { nome: 'nesting' };
  }
  if (parti[0] === 'disegno' && parti[1]) return { nome: 'disegno', id: parti[1] };
  if (parti[0] === 'impostazioni') return { nome: 'impostazioni' };
  return { nome: 'archivio', cartellaId: null };
}

export function urlRotta(r: Rotta): string {
  switch (r.nome) {
    case 'archivio':
      return r.cartellaId ? `#/cartella/${r.cartellaId}` : '#/';
    case 'progetto':
      return `#/progetto/${r.id}`;
    case 'foto':
      return `#/foto/${r.id}`;
    case 'clienti':
      return '#/clienti';
    case 'cliente':
      return `#/cliente/${r.id}`;
    case 'preventivo':
      return `#/preventivo/${r.id}`;
    case 'nesting':
      if (r.id) return `#/nesting/${r.id}`;
      if (r.nuovoIn) return `#/nesting/nuovo/${r.nuovoIn}`;
      if (r.dentro) return `#/nesting/in/${r.dentro}`;
      return '#/nesting';
    case 'disegno':
      return `#/disegno/${r.id}`;
    case 'impostazioni':
      return '#/impostazioni';
  }
}

export function naviga(r: Rotta): void {
  location.hash = urlRotta(r);
}

export function indietro(): void {
  history.back();
}

function sottoscrivi(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRotta(): Rotta {
  const hash = useSyncExternalStore(sottoscrivi, () => location.hash, () => '');
  return analizzaHash(hash);
}
