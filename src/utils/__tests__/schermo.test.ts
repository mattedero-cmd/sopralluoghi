import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Verifica il ciclo di vita del wake lock, in particolare le race attorno
 * all'await di navigator.wakeLock.request(): il lock non deve mai restare
 * "orfano" (schermo acceso per sempre) né duplicarsi.
 */

interface SentinelFinto {
  release: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

function nuovoSentinel(): SentinelFinto {
  return { release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() };
}

let risolviRequest: ((s: SentinelFinto) => void) | null;
let request: ReturnType<typeof vi.fn>;
let docListener: Record<string, () => void>;

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetModules();
  risolviRequest = null;
  request = vi.fn(() => new Promise<SentinelFinto>((res) => (risolviRequest = res)));
  docListener = {};
  vi.stubGlobal('navigator', { wakeLock: { request } });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (ev: string, cb: () => void) => {
      docListener[ev] = cb;
    },
    removeEventListener: () => {
      docListener = {};
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mantieniSchermoAcceso', () => {
  it('rilascia il lock ottenuto se la richiesta si risolve dopo il rilascio (no orfano)', async () => {
    const { mantieniSchermoAcceso } = await import('../schermo');
    const sentinel = nuovoSentinel();

    const rilascia = mantieniSchermoAcceso(); // request in volo
    rilascia(); // operazione finita prima che il lock arrivi
    risolviRequest!(sentinel); // ora il browser concede il lock
    await flush();

    // il lock appena ottenuto va liberato subito, non lasciato acceso
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('non emette una seconda request mentre la prima è in volo', async () => {
    const { mantieniSchermoAcceso } = await import('../schermo');
    mantieniSchermoAcceso(); // request #1 in volo

    // un visibilitychange durante l'attesa non deve far partire una seconda request
    docListener['visibilitychange']?.();
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('mantiene il lock durante l’operazione e lo rilascia alla fine', async () => {
    const { mantieniSchermoAcceso } = await import('../schermo');
    const sentinel = nuovoSentinel();

    const rilascia = mantieniSchermoAcceso();
    risolviRequest!(sentinel);
    await flush();
    // operazione ancora in corso: il lock resta attivo
    expect(sentinel.release).not.toHaveBeenCalled();

    rilascia();
    await flush();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });
});
