/**
 * Cache delle foto-dettaglio dei callout. La chiave è l'ArrayBuffer stesso
 * (WeakMap): quando l'utente sostituisce la foto cambia il buffer e quindi la
 * voce, senza bisogno di invalidare a mano. Le immagini servono sia all'editor
 * (sincrono, con ridisegno alla fine del caricamento) sia all'export (async).
 */
const cache = new WeakMap<ArrayBuffer, HTMLImageElement>();
const inCorso = new WeakSet<ArrayBuffer>();

/**
 * Immagine già pronta dal buffer, oppure null se non ancora caricata. Al
 * termine del caricamento chiama `onReady` (per far ridisegnare l'editor).
 */
export function immagineDettaglio(
  dati: ArrayBuffer | undefined,
  onReady?: () => void
): HTMLImageElement | null {
  if (!dati) return null;
  const pronto = cache.get(dati);
  if (pronto) return pronto;
  if (!inCorso.has(dati)) {
    inCorso.add(dati);
    const url = URL.createObjectURL(new Blob([dati]));
    const img = new Image();
    img.onload = () => {
      cache.set(dati, img);
      inCorso.delete(dati);
      URL.revokeObjectURL(url);
      onReady?.();
    };
    img.onerror = () => {
      inCorso.delete(dati);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  return null;
}

/** Versione asincrona, per l'export: risolve quando l'immagine è pronta. */
export function caricaDettaglio(dati: ArrayBuffer): Promise<HTMLImageElement> {
  const pronto = cache.get(dati);
  if (pronto) return Promise.resolve(pronto);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([dati]));
    const img = new Image();
    img.onload = () => {
      cache.set(dati, img);
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Foto-dettaglio non leggibile.'));
    };
    img.src = url;
  });
}
