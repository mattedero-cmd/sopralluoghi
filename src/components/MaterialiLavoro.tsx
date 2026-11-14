/**
 * I MATERIALI DEL LAVORO, nel preset; e la scelta di uno di loro, dove una
 * cosa nasce.
 *
 * Un sopralluogo di pellicole quasi mai è di una pellicola sola: le vetrate
 * della sala prendono il solare, i bagni l'acidato, la porta d'ingresso la
 * sicurezza. Dirlo una volta qui vuol dire che una forma disegnata o una
 * porta rilevata se lo porta dietro, e che il piano di taglio esce già
 * diviso — un'essenza per materiale, ognuna col supporto del suo preset.
 */

import { useState } from 'react';
import type { ID, MaterialePreset } from '../db/types';
import { nuovoId } from '../utils/id';
import { MATERIALI_PREDEFINITI } from '../utils/preset';

const stesso = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function MaterialiLavoro({
  materiali,
  onCambia
}: {
  materiali: MaterialePreset[];
  onCambia: (m: MaterialePreset[]) => void;
}) {
  const [nuovo, setNuovo] = useState('');

  // i predefiniti prima, nel loro ordine; poi quelli aggiunti a mano
  const aggiunti = materiali.filter((m) => !MATERIALI_PREDEFINITI.some((n) => stesso(n, m.nome)));
  const scelto = (nome: string) => materiali.find((m) => stesso(m.nome, nome));

  const accendi = (nome: string) => {
    const gia = scelto(nome);
    if (gia) {
      onCambia(materiali.filter((m) => m.id !== gia.id));
    } else {
      onCambia([...materiali, { id: nuovoId(), nome }]);
    }
  };

  const aggiungi = () => {
    const nome = nuovo.trim();
    if (!nome) return;
    if (!scelto(nome)) onCambia([...materiali, { id: nuovoId(), nome }]);
    setNuovo('');
  };


  return (
    <div className="materiali-lavoro">
      <div className="materiali-scelta" role="group" aria-label="Materiali del lavoro">
        {MATERIALI_PREDEFINITI.map((n) => (
          <button
            key={n}
            className={`btn${scelto(n) ? ' attivo' : ''}`}
            aria-pressed={!!scelto(n)}
            onClick={() => accendi(n)}
          >
            {n}
          </button>
        ))}
        {aggiunti.map((m) => (
          <button
            key={m.id}
            className="btn attivo"
            aria-pressed
            title="Tocca per toglierlo"
            onClick={() => accendi(m.nome)}
          >
            {m.nome}
          </button>
        ))}
      </div>
      <div className="materiali-nuovo">
        <input
          value={nuovo}
          placeholder="Un altro materiale…"
          aria-label="Nome di un altro materiale"
          onChange={(e) => setNuovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') aggiungi();
          }}
        />
        <button className="btn" disabled={!nuovo.trim()} onClick={aggiungi}>
          Aggiungi
        </button>
      </div>

    </div>
  );
}

/**
 * LA SCELTA DEL MATERIALE, dove una cosa nasce: una fila di pastiglie, una
 * per materiale del preset. Un tocco basta.
 */
export function SceltaMateriale({
  materiali,
  valore,
  onScegli,
  etichetta = 'Materiale'
}: {
  materiali: MaterialePreset[];
  valore: ID | undefined;
  onScegli: (id: ID) => void;
  etichetta?: string;
}) {
  return (
    <div className="scelta-materiale" role="group" aria-label={etichetta}>
      {materiali.map((m) => (
        <button
          key={m.id}
          className={`btn${valore === m.id ? ' attivo' : ''}`}
          aria-pressed={valore === m.id}
          onClick={() => onScegli(m.id)}
        >
          {m.nome}
        </button>
      ))}
    </div>
  );
}
