import type { Annotazione, Quota, Unita } from '../db/types';
import { daMillimetri, inMillimetri } from '../utils/format';
import { sonoInCatena } from './snap';

export interface Catena {
  quote: Quota[];
  /** Somma in mm delle quote con valore; null se nessuna quota ha valore */
  sommaMm: number | null;
  /** true se tutte le quote della catena hanno un valore inserito */
  completa: boolean;
  /** unità più usata nella catena, per presentare la somma */
  unita: Unita;
}

/**
 * Le catene sono calcolate dinamicamente dagli estremi condivisi
 * (componenti connesse del grafo di adiacenza): nessuno stato duplicato
 * da mantenere, sempre coerenti con la geometria reale.
 */
export function calcolaCatene(annotazioni: Annotazione[]): Catena[] {
  const quote = annotazioni.filter((a): a is Quota => a.tipo === 'quota');
  const visitate = new Set<string>();
  const catene: Catena[] = [];

  for (const q of quote) {
    if (visitate.has(q.id)) continue;
    const gruppo: Quota[] = [];
    const coda = [q];
    visitate.add(q.id);
    while (coda.length > 0) {
      const corrente = coda.pop()!;
      gruppo.push(corrente);
      for (const altra of quote) {
        if (!visitate.has(altra.id) && sonoInCatena(corrente, altra)) {
          visitate.add(altra.id);
          coda.push(altra);
        }
      }
    }
    if (gruppo.length >= 2) {
      catene.push(riassumiCatena(gruppo));
    }
  }
  return catene;
}

function riassumiCatena(quote: Quota[]): Catena {
  let sommaMm: number | null = null;
  let completa = true;
  const contoUnita = new Map<Unita, number>();
  for (const q of quote) {
    contoUnita.set(q.unita, (contoUnita.get(q.unita) ?? 0) + 1);
    if (q.valore === null) {
      completa = false;
    } else {
      sommaMm = (sommaMm ?? 0) + inMillimetri(q.valore, q.unita);
    }
  }
  let unita: Unita = 'cm';
  let max = 0;
  for (const [u, n] of contoUnita) {
    if (n > max) {
      max = n;
      unita = u;
    }
  }
  return { quote, sommaMm, completa, unita };
}

export function sommaCatenaInUnita(c: Catena): number | null {
  return c.sommaMm === null ? null : daMillimetri(c.sommaMm, c.unita);
}
