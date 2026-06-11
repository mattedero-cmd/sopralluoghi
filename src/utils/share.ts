import { mostraToast } from '../state/toast';

export function scaricaBlob(blob: Blob, nomeFile: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Condivisione tramite Web Share API (verso Foto, email, messaggistica…)
 * con fallback affidabile al download. Una PWA non può scrivere
 * direttamente nella galleria di sistema: questi sono i due canali sicuri.
 */
export async function condividiOScarica(blob: Blob, nomeFile: string, titolo: string): Promise<void> {
  const file = new File([blob], nomeFile, { type: blob.type });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: titolo });
      return;
    } catch (err) {
      // L'utente ha annullato: nessun errore da segnalare
      if (err instanceof Error && err.name === 'AbortError') return;
      // Condivisione fallita: si ripiega sul download
    }
  }
  scaricaBlob(blob, nomeFile);
  mostraToast('info', `File scaricato: ${nomeFile}`);
}

/** Nome file sicuro a partire da un titolo libero */
export function nomeFileSicuro(titolo: string, estensione: string): string {
  const base = titolo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `${base || 'sopralluogo'}.${estensione}`;
}
