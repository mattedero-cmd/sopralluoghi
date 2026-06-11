import { useSyncExternalStore } from 'react';

/**
 * Store minimale basato su useSyncExternalStore: nessuna dipendenza
 * esterna, stato condiviso tra componenti e codice non-React.
 */
export interface Store<T> {
  get: () => T;
  set: (value: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (value) => {
      state = typeof value === 'function' ? (value as (prev: T) => T)(state) : value;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
