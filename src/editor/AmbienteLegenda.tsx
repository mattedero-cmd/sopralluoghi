import { Modale } from '../components/comuni';

/**
 * Ambiente di lavoro della legenda: propone automaticamente tutte le etichette
 * presenti sulla foto (in ordine alfabetico) e per ciascuna fa scrivere la
 * descrizione. Le etichette con la stessa lettera condividono la descrizione.
 */
export function AmbienteLegenda({
  voci,
  onCambia,
  onChiudi
}: {
  voci: Array<{ lettera: string; descrizione: string; quantita?: number }>;
  onCambia: (lettera: string, descrizione: string) => void;
  onChiudi: () => void;
}) {
  return (
    <Modale titolo="Legenda della foto" onChiudi={onChiudi} centro>
      {voci.length === 0 ? (
        <p style={{ color: 'var(--testo-2)' }}>
          Nessuna etichetta sulla foto. Posa qualche etichetta con la modalità Note, poi torna qui
          per scriverne le descrizioni.
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--testo-2)', marginTop: 0 }}>
            Scrivi accanto a ogni etichetta la sua descrizione. L'elenco si aggiorna da sé quando
            aggiungi o togli etichette.
          </p>
          <div className="lista-legenda">
            {voci.map((v) => (
              <div key={v.lettera} className="riga-legenda">
                <span className="badge-legenda">{v.lettera}</span>
                {(v.quantita ?? 1) > 1 && <span className="conta-legenda">×{v.quantita}</span>}
                <input
                  value={v.descrizione}
                  placeholder="Descrizione"
                  aria-label={`Descrizione etichetta ${v.lettera}`}
                  onChange={(e) => onCambia(v.lettera, e.target.value)}
                />
              </div>
            ))}
          </div>
        </>
      )}
      <div className="riga-pulsanti" style={{ marginTop: 14 }}>
        <button className="btn primario" onClick={onChiudi}>
          Fatto
        </button>
      </div>
    </Modale>
  );
}
