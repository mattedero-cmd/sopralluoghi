/**
 * IL MATERIALE DI UNA PORTA, nell'elenco delle porte: uno per tutta la porta
 * e, aprendo «Colori diversi», uno per la maestà e uno per l'anta. Se il
 * rilievo divide lo stipite sulla battuta (colori diversi fra i lati) i posti
 * diventano quattro: maestà e anta, lato esterno e lato interno.
 */

import type { MaterialePreset, Porta, PresetProgetto } from '../db/types';
import { cambiaMaterialePorta, cambiaMaterialePostoPorta } from '../db/repository';
import { materialeDelPreset } from '../utils/preset';
import { haColoriDiversi, materialePosto, postiPorta } from '../utils/porteMateriali';
import { SceltaMateriale } from './MaterialiLavoro';

export function MaterialiPorta({
  porta,
  materiali,
  preset
}: {
  porta: Porta;
  materiali: MaterialePreset[];
  preset: PresetProgetto | undefined;
}) {
  const diversi = haColoriDiversi(porta);
  return (
    <div className="materiali-porta">
      <SceltaMateriale
        materiali={materiali}
        valore={diversi ? undefined : materialeDelPreset(preset, porta.materialeId)?.id}
        onScegli={(id) => void cambiaMaterialePorta(porta.id, id)}
        etichetta={`Materiale di ${porta.nome}`}
      />
      <details className="colori-porta" open={diversi}>
        <summary>Colori diversi</summary>
        {!porta.latiDiversi && (
          <p className="nota-colori">
            Per lato esterno e interno di colori diversi rispondi «Colori diversi» nella guida
            del rilievo: lo stipite si divide sulla battuta.
          </p>
        )}
        {postiPorta(porta).map(([posto, nome]) => (
          <div key={posto} className="posto-materiale">
            <span>{nome}</span>
            <SceltaMateriale
              materiali={materiali}
              valore={materialePosto(porta, posto, preset) || undefined}
              onScegli={(id) => void cambiaMaterialePostoPorta(porta.id, posto, id)}
              etichetta={`${nome} di ${porta.nome}`}
            />
          </div>
        ))}
      </details>
    </div>
  );
}
