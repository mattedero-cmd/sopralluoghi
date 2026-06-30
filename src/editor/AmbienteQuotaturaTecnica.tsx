import { Modale } from '../components/comuni';
import type { Strumento } from './StageEditor';

/**
 * Ambiente di lavoro dedicato della QUOTATURA TECNICA (§8 del briefing).
 * Fase 1 (infrastruttura): è una shell — scelta tipo quota, guida, riferimento,
 * posa/spostamento punti, stile e salvataggio arrivano nelle fasi successive.
 */
const TITOLI: Partial<Record<Strumento, string>> = {
  tecSerie: 'Quotatura in serie',
  tecParallelo: 'Quotatura in parallelo',
  tecProgressiva: 'Quotatura progressiva',
  tecForo: 'Quotatura fori (⌀ / R)',
  tecSmusso: 'Quotatura smusso',
  tecFilettatura: 'Quotatura filettatura',
  tecDatum: 'Riferimento (datum)'
};

export function AmbienteQuotaturaTecnica({
  strumento,
  onChiudi
}: {
  strumento: Strumento;
  onChiudi: () => void;
}) {
  return (
    <Modale titolo={TITOLI[strumento] ?? 'Quotatura tecnica'} onChiudi={onChiudi} centro>
      <p style={{ color: 'var(--testo-2)' }}>
        Ambiente di lavoro della quotatura tecnica. L'infrastruttura è pronta; la posa guidata dei
        punti, il riferimento e la generazione delle quote arrivano nelle prossime fasi.
      </p>
      <div className="riga-pulsanti">
        <button className="btn primario" onClick={onChiudi}>
          Fine
        </button>
      </div>
    </Modale>
  );
}
