/**
 * Dettatura vocale delle note in italiano (Web Speech API).
 * Richiede la rete su quasi tutti i dispositivi: è un acceleratore
 * opzionale, mai un requisito — la scrittura manuale resta sempre.
 */

interface RisultatoRiconoscimento {
  isFinal: boolean;
  0: { transcript: string };
}

interface EventoRiconoscimento {
  resultIndex: number;
  results: ArrayLike<RisultatoRiconoscimento>;
}

interface Riconoscitore {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoRiconoscimento) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function costruttore(): (new () => Riconoscitore) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Riconoscitore;
    webkitSpeechRecognition?: new () => Riconoscitore;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dettaturaDisponibile(): boolean {
  return costruttore() !== null;
}

/**
 * Avvia la dettatura it-IT. `onTesto` riceve i segmenti definitivi.
 * Restituisce la funzione di stop.
 */
export function avviaDettatura(
  onTesto: (testo: string) => void,
  onFine: (errore?: string) => void
): () => void {
  const Ctor = costruttore();
  if (!Ctor) {
    onFine('La dettatura vocale non è supportata da questo browser.');
    return () => {};
  }
  const r = new Ctor();
  r.lang = 'it-IT';
  r.continuous = true;
  r.interimResults = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        const t = res[0].transcript.trim();
        if (t) onTesto(t);
      }
    }
  };
  r.onerror = (e) => {
    const msg =
      e.error === 'not-allowed'
        ? 'Permesso microfono negato: abilitalo nelle impostazioni del browser.'
        : e.error === 'network'
          ? 'Dettatura non disponibile offline su questo dispositivo.'
          : e.error === 'no-speech'
            ? ''
            : `Dettatura interrotta (${e.error}).`;
    onFine(msg || undefined);
  };
  r.onend = () => onFine();
  try {
    r.start();
  } catch {
    onFine('Impossibile avviare la dettatura.');
  }
  return () => {
    r.onend = null;
    try {
      r.stop();
    } catch {
      // già fermo
    }
  };
}
