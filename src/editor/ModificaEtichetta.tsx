import { useState } from 'react';
import { Modale } from '../components/comuni';

/**
 * Modifica rapida di una singola etichetta: cambia la lettera e la descrizione
 * collegata alla legenda. La posizione si corregge trascinando il badge sulla
 * foto; l'eliminazione avviene dal pulsante del pannello.
 */
export function ModificaEtichetta({
  lettera,
  descrizione,
  onApplica,
  onChiudi
}: {
  lettera: string;
  descrizione: string;
  onApplica: (m: { lettera: string; descrizione: string }) => void;
  onChiudi: () => void;
}) {
  const [l, setL] = useState(lettera);
  const [d, setD] = useState(descrizione);

  const salva = () => {
    const v = l.trim().toUpperCase();
    if (v) onApplica({ lettera: v, descrizione: d });
    onChiudi();
  };

  return (
    <Modale titolo="Modifica etichetta" onChiudi={onChiudi} centro>
      <div className="campo">
        <label>Lettera (o numero)</label>
        <input
          value={l}
          maxLength={2}
          autoFocus
          onChange={(e) => setL(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && salva()}
        />
      </div>
      <div className="campo">
        <label>Descrizione (legenda)</label>
        <input
          value={d}
          placeholder="Descrizione"
          onChange={(e) => setD(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && salva()}
        />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button className="btn primario" onClick={salva}>
          Salva
        </button>
      </div>
    </Modale>
  );
}
