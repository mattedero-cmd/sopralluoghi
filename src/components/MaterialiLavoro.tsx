/**
 * I MATERIALI DEL LAVORO, nel preset; e la scelta di uno di loro, dove una
 * cosa nasce.
 *
 * Un sopralluogo di pellicole quasi mai è di una pellicola sola: le vetrate
 * della sala prendono il solare, i bagni l'acidato, la porta d'ingresso la
 * sicurezza. Dirlo una volta qui vuol dire che una forma disegnata o una
 * porta rilevata se lo porta dietro, e che il piano di taglio esce già
 * diviso — un'essenza per materiale, ognuna con la sua bobina.
 */

import { useState } from 'react';
import type { ID, MaterialePreset, ModoSupporto, PresetProgetto } from '../db/types';
import { FASCE_BOBINA } from '../utils/documentoNesting';
import { analizzaMisura, formattaNumero } from '../utils/format';
import { nuovoId } from '../utils/id';
import { MATERIALI_PREDEFINITI, PRESET_INIZIALE } from '../utils/preset';

type Supporto = NonNullable<PresetProgetto['supporto']>;

const stesso = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** «bobina 1370» / «lastre 2500×1250», per dire il supporto in una parola */
export function testoSupporto(s: Pick<Supporto, 'modo' | 'lastra' | 'bobina'>): string {
  return s.modo === 'bobina'
    ? `bobina ${formattaNumero(s.bobina.larghezza)}`
    : `lastre ${formattaNumero(s.lastra.larghezza)}×${formattaNumero(s.lastra.altezza)}`;
}

export function MaterialiLavoro({
  materiali,
  onCambia,
  supportoLavoro
}: {
  materiali: MaterialePreset[];
  onCambia: (m: MaterialePreset[]) => void;
  /** il supporto del preset: da qui parte chi ne vuole uno suo */
  supportoLavoro: Supporto;
}) {
  const [nuovo, setNuovo] = useState('');
  const [aperto, setAperto] = useState<ID | null>(null);

  // i predefiniti prima, nel loro ordine; poi quelli aggiunti a mano
  const aggiunti = materiali.filter((m) => !MATERIALI_PREDEFINITI.some((n) => stesso(n, m.nome)));
  const scelto = (nome: string) => materiali.find((m) => stesso(m.nome, nome));

  const accendi = (nome: string) => {
    const gia = scelto(nome);
    if (gia) {
      onCambia(materiali.filter((m) => m.id !== gia.id));
      if (aperto === gia.id) setAperto(null);
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

  const scrivi = (id: ID, m: Partial<MaterialePreset>) =>
    onCambia(materiali.map((x) => (x.id === id ? { ...x, ...m } : x)));

  const numero = (v: number) => (v ? String(v).replace('.', ',') : '');

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

      {materiali.length > 0 && (
        <ul className="materiali-elenco">
          {materiali.map((m) => {
            const proprio = m.supporto;
            const sup = proprio ?? supportoLavoro;
            const scriviSup = (s: Partial<Pick<Supporto, 'modo' | 'lastra' | 'bobina'>>) =>
              scrivi(m.id, {
                supporto: {
                  modo: sup.modo,
                  lastra: { ...sup.lastra },
                  bobina: { ...sup.bobina },
                  ...s
                }
              });
            return (
              <li key={m.id}>
                <button
                  className="materiale-riga"
                  aria-expanded={aperto === m.id}
                  onClick={() => setAperto(aperto === m.id ? null : m.id)}
                >
                  <strong>{m.nome}</strong>
                  <span>{proprio ? testoSupporto(proprio) : `come il lavoro (${testoSupporto(supportoLavoro)})`}</span>
                </button>
                {aperto === m.id && (
                  <div className="materiale-supporto">
                    <span className="segmenti piena" role="group" aria-label={`Supporto del ${m.nome}`}>
                      <button
                        className={proprio ? '' : 'attivo'}
                        onClick={() => scrivi(m.id, { supporto: undefined })}
                      >
                        Come il lavoro
                      </button>
                      {(
                        [
                          ['bobina', 'Sua bobina'],
                          ['lastre', 'Sue lastre']
                        ] as Array<[ModoSupporto, string]>
                      ).map(([v, testo]) => (
                        <button
                          key={v}
                          className={proprio?.modo === v ? 'attivo' : ''}
                          onClick={() => scriviSup({ modo: v })}
                        >
                          {testo}
                        </button>
                      ))}
                    </span>
                    {proprio?.modo === 'bobina' && (
                      <>
                        <label className="riga-numero">
                          <span className="che">Fascia della bobina</span>
                          <input
                            className="input-misura"
                            type="text"
                            inputMode="decimal"
                            value={numero(proprio.bobina.larghezza)}
                            placeholder={String(PRESET_INIZIALE.supporto.bobina.larghezza)}
                            onChange={(e) =>
                              scriviSup({
                                bobina: { ...proprio.bobina, larghezza: analizzaMisura(e.target.value) ?? 0 }
                              })
                            }
                          />
                          <span className="unita">mm</span>
                        </label>
                        <div className="fasce">
                          {FASCE_BOBINA.map((f) => (
                            <button
                              key={f}
                              className={`btn${proprio.bobina.larghezza === f ? ' attivo' : ''}`}
                              onClick={() => scriviSup({ bobina: { ...proprio.bobina, larghezza: f } })}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {proprio?.modo === 'lastre' && (
                      <>
                        {(['larghezza', 'altezza'] as const).map((k) => (
                          <label key={k} className="riga-numero">
                            <span className="che">{k === 'larghezza' ? 'Larghezza della lastra' : 'Altezza della lastra'}</span>
                            <input
                              className="input-misura"
                              type="text"
                              inputMode="decimal"
                              value={numero(proprio.lastra[k])}
                              onChange={(e) =>
                                scriviSup({
                                  lastra: { ...proprio.lastra, [k]: analizzaMisura(e.target.value) ?? 0 }
                                })
                              }
                            />
                            <span className="unita">mm</span>
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
