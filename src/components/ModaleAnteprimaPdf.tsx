import { Suspense, lazy, useState } from 'react';
import { Modale } from './comuni';
import { Icona } from './Icona';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';

const AnteprimaPdf = lazy(() => import('./AnteprimaPdf'));

/**
 * ANTEPRIMA DEL PDF PRIMA DI MANDARLO VIA.
 *
 * Il PDF si guarda dentro l'app, pagina per pagina, e solo dopo — se va bene —
 * si condivide o si scarica. Prima l'unico modo di vederlo era mandarlo a
 * qualcuno, che è il momento sbagliato per accorgersi di un errore.
 */
export function ModaleAnteprimaPdf({
  blob,
  titolo,
  nomeFile,
  generando,
  onChiudi
}: {
  blob: Blob | null;
  titolo: string;
  /** nome del file senza estensione */
  nomeFile: string;
  /** vero mentre il PDF si sta ancora componendo */
  generando?: boolean;
  onChiudi: () => void;
}) {
  const [inCorso, setInCorso] = useState(false);

  const condividi = async () => {
    if (!blob) return;
    setInCorso(true);
    try {
      await condividiOScarica(blob, nomeFileSicuro(nomeFile, 'pdf'), titolo);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Modale titolo={titolo} onChiudi={onChiudi}>
      <div className="pdf-anteprima">
        <Suspense fallback={<div className="anteprima-pagina-vuota" />}>
          <AnteprimaPdf blob={blob} generando={generando} />
        </Suspense>
      </div>
      <div className="riga-pulsanti" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onChiudi}>
          Chiudi
        </button>
        <button
          className="btn primario"
          style={{ flex: 1 }}
          disabled={!blob || inCorso}
          onClick={() => void condividi()}
        >
          <Icona nome="condividi" dimensione={18} /> Condividi
        </button>
      </div>
    </Modale>
  );
}
