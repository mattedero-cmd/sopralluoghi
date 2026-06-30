import { useMemo } from 'react';
import { Modale } from '../components/comuni';
import { Icona } from '../components/Icona';
import type { Foto, QuotaTecnica, Unita, VersoQuota } from '../db/types';
import { COLORE_QUOTA_TECNICA } from '../db/types';
import { applicaOffsetSerie, ricalcolaValoriSerie } from '../geometry/quotaTecnica';
import { distanza } from '../geometry/punti';

type CalibFoto = Pick<Foto, 'scala' | 'piano'>;

const UNITA: Unita[] = ['mm', 'cm', 'm'];
const COLORI_TECNICI = [COLORE_QUOTA_TECNICA, '#ff3b30', '#34c759', '#111111', '#ffffff'];

const TITOLI: Record<string, string> = {
  serie: 'Quotatura in serie'
};

/**
 * Ambiente di lavoro dedicato di una quota tecnica già generata (§8): si
 * regolano unità, lato e distanza della linea di quota, colore, valori e se la
 * misura entra nel riepilogo del PDF. La foto resta sullo sfondo; qui si
 * concentrano le opzioni avanzate, fuori dal menu principale.
 */
export function AmbienteQuotaturaTecnica({
  quota,
  foto,
  onModifica,
  onElimina,
  onChiudi
}: {
  quota: QuotaTecnica;
  foto: CalibFoto;
  onModifica: (q: QuotaTecnica) => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const offsetCorrente = Math.abs(quota.quote[0]?.offset ?? 0);
  const offsetMax = useMemo(() => {
    const g = quota.lineaGuida;
    const lung = g ? distanza(g.a, g.b) : 0;
    return Math.max(200, Math.round(lung * 0.6));
  }, [quota.lineaGuida]);

  const cambiaUnita = (unita: Unita) => {
    onModifica({ ...quota, unita, quote: ricalcolaValoriSerie(quota.quote, foto, unita) });
  };

  const cambiaVerso = (verso: VersoQuota) => {
    onModifica({ ...quota, verso, quote: applicaOffsetSerie(quota.quote, offsetCorrente, verso) });
  };

  const cambiaOffset = (offset: number) => {
    onModifica({ ...quota, quote: applicaOffsetSerie(quota.quote, offset, quota.verso) });
  };

  const cambiaColore = (colore: string) => {
    onModifica({ ...quota, stile: { ...quota.stile, colore } });
  };

  const cambiaValore = (indice: number, testo: string) => {
    const pulito = testo.trim().replace(',', '.');
    const v = pulito === '' ? null : Number(pulito);
    if (v !== null && Number.isNaN(v)) return;
    const quote = quota.quote.map((q, i) => (i === indice ? { ...q, valore: v } : q));
    onModifica({ ...quota, valoreAuto: false, quote });
  };

  return (
    <Modale titolo={TITOLI[quota.sottotipo] ?? 'Quotatura tecnica'} onChiudi={onChiudi} centro>
      <div className="quota-tecnica-editor">
        {/* Unità */}
        <div className="qt-riga">
          <label className="qt-label">Unità</label>
          <div className="segmenti" role="group" aria-label="Unità di misura">
            {UNITA.map((u) => (
              <button
                key={u}
                className={quota.unita === u ? 'attivo' : ''}
                onClick={() => cambiaUnita(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Lato della linea di quota */}
        <div className="qt-riga">
          <label className="qt-label">Lato</label>
          <div className="segmenti" role="group" aria-label="Lato della linea di quota">
            <button
              className={quota.verso === 'sinistra' ? 'attivo' : ''}
              onClick={() => cambiaVerso('sinistra')}
            >
              ◀ Sinistra
            </button>
            <button
              className={quota.verso === 'destra' ? 'attivo' : ''}
              onClick={() => cambiaVerso('destra')}
            >
              Destra ▶
            </button>
          </div>
        </div>

        {/* Distanza (offset) della linea di quota */}
        <div className="qt-riga">
          <label className="qt-label">Distacco</label>
          <input
            type="range"
            min={0}
            max={offsetMax}
            step={Math.max(1, Math.round(offsetMax / 100))}
            value={Math.min(offsetCorrente, offsetMax)}
            onChange={(e) => cambiaOffset(Number(e.target.value))}
            style={{ flex: 1 }}
            aria-label="Distacco della linea di quota"
          />
        </div>

        {/* Colore */}
        <div className="qt-riga">
          <label className="qt-label">Colore</label>
          <div className="qt-colori">
            {COLORI_TECNICI.map((c) => (
              <button
                key={c}
                className={`swatch${quota.stile.colore.toLowerCase() === c.toLowerCase() ? ' attivo' : ''}`}
                style={{ background: c }}
                aria-label={`Colore ${c}`}
                onClick={() => cambiaColore(c)}
              />
            ))}
            <label className="swatch-custom" title="Colore personalizzato">
              <Icona nome="goccia" dimensione={18} />
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(quota.stile.colore) ? quota.stile.colore : COLORE_QUOTA_TECNICA}
                onChange={(e) => cambiaColore(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Misure della catena */}
        <div className="qt-misure">
          <div className="qt-label" style={{ marginBottom: 6 }}>
            Misure ({quota.quote.length})
          </div>
          {quota.quote.length === 0 && (
            <p style={{ color: 'var(--testo-2)', margin: 0 }}>Nessuna misura: servono almeno 2 punti.</p>
          )}
          {quota.quote.map((q, i) => (
            <div key={i} className="qt-misura-riga">
              <span className="qt-misura-num">{i + 1}</span>
              <input
                className="input-misura"
                inputMode="decimal"
                defaultValue={q.valore === null ? '' : String(q.valore).replace('.', ',')}
                onBlur={(e) => cambiaValore(i, e.target.value)}
                aria-label={`Misura ${i + 1}`}
              />
              <span className="qt-misura-unita">{quota.unita}</span>
            </div>
          ))}
        </div>

        {/* Nel PDF */}
        <label className="fisc-check qt-riga">
          <input
            type="checkbox"
            checked={quota.partePerimetro}
            onChange={(e) => onModifica({ ...quota, partePerimetro: e.target.checked })}
          />
          Includi le misure nel riepilogo del PDF
        </label>
      </div>

      <div className="riga-pulsanti" style={{ justifyContent: 'space-between' }}>
        <button className="btn pericolo" onClick={onElimina}>
          <Icona nome="cestino" dimensione={18} /> Elimina
        </button>
        <button className="btn primario" onClick={onChiudi}>
          <Icona nome="check" dimensione={18} /> Fine
        </button>
      </div>
    </Modale>
  );
}
