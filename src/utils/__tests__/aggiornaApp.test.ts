import { afterEach, describe, expect, it, vi } from 'vitest';
import { svuotaCacheApp } from '../aggiornaApp';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('svuotaCacheApp', () => {
  it('toglie i service worker e svuota tutte le cache degli asset', async () => {
    const disiscrivi = vi.fn().mockResolvedValue(true);
    const eliminaCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: async () => [{ unregister: disiscrivi }] }
    });
    vi.stubGlobal('caches', {
      keys: async () => ['app-shell', 'workbox-precache'],
      delete: eliminaCache
    });

    await svuotaCacheApp();

    expect(disiscrivi).toHaveBeenCalledTimes(1);
    expect(eliminaCache).toHaveBeenCalledTimes(2);
    expect(eliminaCache).toHaveBeenCalledWith('workbox-precache');
  });

  it('un browser che non ha niente da svuotare non è un errore', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('caches', undefined);
    await expect(svuotaCacheApp()).resolves.toBeUndefined();
  });

  it('una cache che rifiuta di farsi leggere non blocca l’aggiornamento', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: async () => {
          throw new Error('non disponibile');
        }
      }
    });
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('modalità privata');
      }
    });
    await expect(svuotaCacheApp()).resolves.toBeUndefined();
  });
});
