/**
 * I MATERIALI DI UNA PORTA, nel piano di taglio. Quali parti hanno un colore
 * diverso lo dichiara la guida del rilievo (passo «Colori»), che prepara tagli
 * e istruzioni; qui si assegnano i materiali: uno per tutta la porta, oppure
 * maestà e anta, oppure maestà e anta per lato esterno e interno.
 */

import type { MaterialePreset, Porta, PresetProgetto } from '../db/types';
import { cambiaMaterialePorta, cambiaMaterialePostoPorta } from '../db/repository';
import { materialeDelPreset } from '../utils/preset';
import { materialePosto, postiPorta } from '../utils/porteMateriali';
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
  const posti = postiPorta(porta);
  if (materiali.length < 2) {
    return posti.length ? (
      <p className="nota-colori">
        Colori diversi dichiarati nel rilievo: aggiungi i materiali del lavoro per assegnarli.
      </p>
    ) : null;
  }
  if (posti.length === 0) {
    return (
      <div className="materiali-porta">
        <SceltaMateriale
          materiali={materiali}
          valore={materialeDelPreset(preset, porta.materialeId)?.id}
          onScegli={(id) => void cambiaMaterialePorta(porta.id, id)}
          etichetta={`Materiale di ${porta.nome}`}
        />
      </div>
    );
  }
  return (
    <div className="materiali-porta">
      {posti.map(([posto, nome]) => (
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
    </div>
  );
}
