import { useRef, useState } from 'react';
import type { Foto } from '../db/types';
import { Modale, ImmagineBlob } from '../components/comuni';
import { Icona } from '../components/Icona';

/**
 * Modifica rapida di una singola etichetta: cambia la lettera e la descrizione
 * collegata alla legenda, e collega FOTO DI DETTAGLIO (ravvicinate) all'elemento.
 * La posizione si corregge trascinando il badge; l'eliminazione è nel pannello.
 */
export function ModificaEtichetta({
  lettera,
  descrizione,
  dettagli,
  candidati,
  onApplica,
  onAggiungiDettaglio,
  onCollega,
  onApriDettaglio,
  onChiudi
}: {
  lettera: string;
  descrizione: string;
  dettagli: Foto[];
  candidati: Foto[];
  onApplica: (m: { lettera: string; descrizione: string }) => void;
  onAggiungiDettaglio: (file: File) => void;
  onCollega: (id: string) => void;
  onApriDettaglio: (id: string) => void;
  onChiudi: () => void;
}) {
  const [l, setL] = useState(lettera);
  const [d, setD] = useState(descrizione);
  const [collega, setCollega] = useState(false);
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputGalleria = useRef<HTMLInputElement>(null);

  const salva = () => {
    const v = l.trim().toUpperCase();
    if (v) onApplica({ lettera: v, descrizione: d });
    onChiudi();
  };

  const scegliFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onAggiungiDettaglio(f);
    e.target.value = '';
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

      <div className="campo">
        <label>Foto di dettaglio dell'elemento {l}</label>
        {dettagli.length > 0 && (
          <div className="griglia-dettagli">
            {dettagli.map((f) => (
              <button key={f.id} className="cella-dettaglio" onClick={() => onApriDettaglio(f.id)}>
                <ImmagineBlob dati={f.miniatura} tipo={f.miniaturaTipo} alt={f.didascalia || 'Dettaglio'} />
                <span className="cella-dettaglio-titolo">{f.didascalia || 'Dettaglio'}</span>
              </button>
            ))}
          </div>
        )}
        <div className="riga-pulsanti" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => inputCamera.current?.click()}>
            <Icona nome="fotocamera" dimensione={18} /> Scatta
          </button>
          <button className="btn" onClick={() => inputGalleria.current?.click()}>
            <Icona nome="immagine" dimensione={18} /> Da galleria
          </button>
          <button
            className={`btn${collega ? ' primario' : ''}`}
            disabled={candidati.length === 0}
            onClick={() => setCollega((v) => !v)}
          >
            <Icona nome="dettaglio" dimensione={18} /> Collega esistente
          </button>
        </div>
        {collega && (
          <div className="griglia-dettagli" style={{ marginTop: 8 }}>
            {candidati.map((f) => (
              <button
                key={f.id}
                className="cella-dettaglio"
                onClick={() => {
                  onCollega(f.id);
                  setCollega(false);
                }}
              >
                <ImmagineBlob dati={f.miniatura} tipo={f.miniaturaTipo} alt={f.didascalia || 'Foto'} />
                <span className="cella-dettaglio-titolo">{f.didascalia || 'Foto'}</span>
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputCamera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={scegliFile}
        />
        <input ref={inputGalleria} type="file" accept="image/*" hidden onChange={scegliFile} />
      </div>

      <div className="riga-pulsanti" style={{ marginTop: 8 }}>
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
