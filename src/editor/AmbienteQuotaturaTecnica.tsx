import { useEffect, useMemo, useRef, useState } from 'react';
import { Modale } from '../components/comuni';
import { Icona } from '../components/Icona';
import type {
  FilettaturaTecnica,
  Foto,
  QuotaTecnica,
  SmussoTecnico,
  Unita,
  VersoQuota
} from '../db/types';
import { COLORE_QUOTA_TECNICA } from '../db/types';
import {
  applicaGeometria,
  designazioneFilettatura,
  designazioneSmusso,
  generaParallelo,
  generaProgressiva,
  ricalcolaForo,
  ricalcolaSmusso,
  ricalcolaValori
} from '../geometry/quotaTecnica';
import { distanza } from '../geometry/punti';

type CalibFoto = Pick<Foto, 'scala' | 'piano'>;

/**
 * Campo del valore di un singolo tratto: controllato, ma con un buffer di testo
 * locale così la virgola e i decimali si possono digitare liberamente. Si
 * risincronizza quando il valore cambia dall'esterno (cambio unità, ricalcolo),
 * evitando il numero "fantasma" di un input non controllato.
 */
function CampoValoreTecnico({
  valore,
  onCambia
}: {
  valore: number | null;
  onCambia: (v: number | null) => void;
}) {
  const testoDi = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  const [testo, setTesto] = useState(() => testoDi(valore));
  const ultimo = useRef(valore);
  useEffect(() => {
    if (valore !== ultimo.current) {
      ultimo.current = valore;
      setTesto(testoDi(valore));
    }
  }, [valore]);
  const conferma = () => {
    const pulito = testo.trim().replace(',', '.');
    const v = pulito === '' ? null : Number(pulito);
    if (v !== null && Number.isNaN(v)) {
      setTesto(testoDi(valore)); // ripristina l'ultimo valore valido
      return;
    }
    ultimo.current = v;
    onCambia(v);
  };
  return (
    <input
      className="input-misura"
      inputMode="decimal"
      value={testo}
      onChange={(e) => setTesto(e.target.value)}
      onBlur={conferma}
    />
  );
}

const UNITA: Unita[] = ['mm', 'cm', 'm'];
const COLORI_TECNICI = [COLORE_QUOTA_TECNICA, '#ff3b30', '#34c759', '#111111', '#ffffff'];

const TITOLI: Record<string, string> = {
  serie: 'Quotatura in serie',
  parallelo: 'Quotatura in parallelo',
  progressiva: 'Quotatura progressiva',
  datum: 'Riferimento (datum)'
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
  const isParallelo = quota.sottotipo === 'parallelo';
  const isProgressiva = quota.sottotipo === 'progressiva';
  const isDatum = quota.sottotipo === 'datum';
  const isForo = quota.sottotipo === 'foro';
  const isSmusso = quota.sottotipo === 'smusso';
  const isFilettatura = quota.sottotipo === 'filettatura';
  const isCatena = isParallelo || isProgressiva || quota.sottotipo === 'serie';
  const hasUnita = isCatena || isForo || isSmusso;
  const foro = quota.foro;
  const smusso = quota.smusso;
  const filettatura = quota.filettatura;
  const sp = quota.stile.spessore;
  const estMax = Math.max(20, Math.round(sp * 12));
  const gapCorrente = quota.gapEstensione ?? sp * 1.5;
  const sporgenzaCorrente = quota.sporgenzaEstensione ?? sp * 2.5;
  const offsetCorrente = Math.abs(quota.quote[0]?.offset ?? 0);
  const passoCorrente =
    quota.passo ??
    (quota.quote.length >= 2
      ? Math.abs(Math.abs(quota.quote[1].offset) - Math.abs(quota.quote[0].offset))
      : 0);
  const origineCorrente = quota.origineEstremo ?? 'inizio';
  const offsetMax = useMemo(() => {
    const g = quota.lineaGuida;
    const lung = g ? distanza(g.a, g.b) : 0;
    return Math.max(200, Math.round(lung * 0.6));
  }, [quota.lineaGuida]);

  const conGeometria = (offset: number, passo: number, verso: VersoQuota): QuotaTecnica => ({
    ...quota,
    verso,
    passo: isParallelo ? passo : quota.passo,
    quote: applicaGeometria(quota, { offset, passo, verso })
  });

  const cambiaUnita = (unita: Unita) => {
    if (isForo) {
      onModifica({ ...quota, unita, foro: ricalcolaForo(quota, foto, unita) ?? quota.foro });
      return;
    }
    if (isSmusso) {
      onModifica({ ...quota, unita, smusso: ricalcolaSmusso(quota, foto, unita) ?? quota.smusso });
      return;
    }
    onModifica({ ...quota, unita, quote: ricalcolaValori(quota, foto, unita) });
  };

  const cambiaVerso = (verso: VersoQuota) => {
    onModifica(conGeometria(offsetCorrente, passoCorrente, verso));
  };

  const cambiaOffset = (offset: number) => {
    onModifica(conGeometria(offset, passoCorrente, quota.verso));
  };

  const cambiaPasso = (passo: number) => {
    onModifica(conGeometria(offsetCorrente, passo, quota.verso));
  };

  const cambiaOrigine = (origineEstremo: 'inizio' | 'fine') => {
    const base = { unita: quota.unita, verso: quota.verso, origineEstremo };
    const r = isParallelo
      ? generaParallelo(quota.puntiOriginali, foto, {
          ...base,
          offset: offsetCorrente,
          passo: passoCorrente
        })
      : generaProgressiva(quota.puntiOriginali, foto, { ...base, offset: offsetCorrente });
    onModifica({ ...quota, origineEstremo, lineaGuida: r.lineaGuida, quote: r.quote });
  };

  const cambiaColore = (colore: string) => {
    onModifica({ ...quota, stile: { ...quota.stile, colore } });
  };

  const cambiaValore = (indice: number, v: number | null) => {
    const quote = quota.quote.map((q, i) => (i === indice ? { ...q, valore: v } : q));
    onModifica({ ...quota, valoreAuto: false, quote });
  };

  const cambiaEtichetta = (etichetta: string) => {
    onModifica({ ...quota, etichetta: etichetta.toUpperCase().slice(0, 3) });
  };

  const cambiaModoForo = (modo: 'diametro' | 'raggio') => {
    if (!foro) return;
    onModifica({ ...quota, foro: { ...foro, modo } });
  };

  const cambiaValoreForo = (v: number | null) => {
    if (!foro) return;
    const raggioReale = foro.modo === 'diametro' ? (v === null ? null : v / 2) : v;
    const diametroReale = foro.modo === 'diametro' ? v : v === null ? null : v * 2;
    onModifica({ ...quota, valoreAuto: false, foro: { ...foro, raggioReale, diametroReale } });
  };

  const cambiaEtichettaForo = (etichetta: string) => {
    if (!foro) return;
    onModifica({ ...quota, foro: { ...foro, etichetta: etichetta.toUpperCase().slice(0, 3) } });
  };

  const aggiornaSmusso = (patch: Partial<SmussoTecnico>) => {
    if (!smusso) return;
    const s = { ...smusso, ...patch };
    onModifica({ ...quota, smusso: { ...s, designazione: designazioneSmusso(s) } });
  };

  const aggiornaFilettatura = (patch: Partial<FilettaturaTecnica>) => {
    if (!filettatura) return;
    const f = { ...filettatura, ...patch };
    onModifica({ ...quota, filettatura: { ...f, designazione: designazioneFilettatura(f) } });
  };

  return (
    <Modale titolo={TITOLI[quota.sottotipo] ?? 'Quotatura tecnica'} onChiudi={onChiudi} centro>
      <div className="quota-tecnica-editor">
        {/* Lettera del datum */}
        {isDatum && (
          <div className="qt-riga">
            <label className="qt-label">Lettera</label>
            <input
              className="input-misura"
              style={{ width: 80 }}
              value={quota.etichetta ?? ''}
              maxLength={3}
              onChange={(e) => cambiaEtichetta(e.target.value)}
              aria-label="Lettera del datum"
            />
          </div>
        )}

        {hasUnita && (
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
        )}

        {/* Foro: ⌀/R, valore, lettera */}
        {isForo && foro && (
          <>
            <div className="qt-riga">
              <label className="qt-label">Modo</label>
              <div className="segmenti" role="group" aria-label="Diametro o raggio">
                <button
                  className={foro.modo === 'diametro' ? 'attivo' : ''}
                  onClick={() => cambiaModoForo('diametro')}
                >
                  ⌀ Diametro
                </button>
                <button
                  className={foro.modo === 'raggio' ? 'attivo' : ''}
                  onClick={() => cambiaModoForo('raggio')}
                >
                  R Raggio
                </button>
              </div>
            </div>
            <div className="qt-riga">
              <label className="qt-label">{foro.modo === 'diametro' ? '⌀' : 'R'}</label>
              <CampoValoreTecnico
                valore={foro.modo === 'diametro' ? foro.diametroReale : foro.raggioReale}
                onCambia={cambiaValoreForo}
              />
              <span className="qt-misura-unita">{quota.unita}</span>
            </div>
            <div className="qt-riga">
              <label className="qt-label">Etichetta</label>
              <input
                className="input-misura"
                style={{ width: 80 }}
                value={foro.etichetta ?? ''}
                maxLength={3}
                onChange={(e) => cambiaEtichettaForo(e.target.value)}
                aria-label="Etichetta del foro"
              />
            </div>
          </>
        )}

        {/* Smusso: modo C/angolo, valore, angolo */}
        {isSmusso && smusso && (
          <>
            <div className="qt-riga">
              <label className="qt-label">Modo</label>
              <div className="segmenti" role="group" aria-label="Tipo di smusso">
                <button
                  className={smusso.modo === 'C' ? 'attivo' : ''}
                  onClick={() => aggiornaSmusso({ modo: 'C' })}
                >
                  C (45°)
                </button>
                <button
                  className={smusso.modo === 'lunghezzaAngolo' ? 'attivo' : ''}
                  onClick={() => aggiornaSmusso({ modo: 'lunghezzaAngolo' })}
                >
                  Lungh. × angolo
                </button>
              </div>
            </div>
            <div className="qt-riga">
              <label className="qt-label">Lunghezza</label>
              <CampoValoreTecnico
                valore={smusso.catetoReale}
                onCambia={(v) => aggiornaSmusso({ catetoReale: v })}
              />
              <span className="qt-misura-unita">{quota.unita}</span>
            </div>
            {smusso.modo === 'lunghezzaAngolo' && (
              <div className="qt-riga">
                <label className="qt-label">Angolo</label>
                <CampoValoreTecnico
                  valore={smusso.angoloGradi}
                  onCambia={(v) => aggiornaSmusso({ angoloGradi: v })}
                />
                <span className="qt-misura-unita">°</span>
              </div>
            )}
            <div className="qt-riga">
              <label className="qt-label">Callout</label>
              <strong style={{ color: 'var(--testo-1)' }}>{smusso.designazione}</strong>
            </div>
          </>
        )}

        {/* Filettatura: tipo, Ø nominale, passo, classe, lunghezza */}
        {isFilettatura && filettatura && (
          <>
            <div className="qt-riga">
              <label className="qt-label">Tipo</label>
              <div className="segmenti" role="group" aria-label="Filettatura interna o esterna">
                <button
                  className={filettatura.filettatura === 'interna' ? 'attivo' : ''}
                  onClick={() => aggiornaFilettatura({ filettatura: 'interna' })}
                >
                  Interna
                </button>
                <button
                  className={filettatura.filettatura === 'esterna' ? 'attivo' : ''}
                  onClick={() => aggiornaFilettatura({ filettatura: 'esterna' })}
                >
                  Esterna
                </button>
              </div>
            </div>
            <div className="qt-riga">
              <label className="qt-label">Ø nom. (M)</label>
              <CampoValoreTecnico
                valore={filettatura.diametroNominale}
                onCambia={(v) =>
                  aggiornaFilettatura({ diametroNominale: v ?? filettatura.diametroNominale })
                }
              />
            </div>
            <div className="qt-riga">
              <label className="qt-label">Passo</label>
              <CampoValoreTecnico
                valore={filettatura.passo ?? null}
                onCambia={(v) => aggiornaFilettatura({ passo: v ?? undefined })}
              />
            </div>
            <div className="qt-riga">
              <label className="qt-label">Classe</label>
              <input
                className="input-misura"
                style={{ width: 90 }}
                value={filettatura.classeTolleranza ?? ''}
                maxLength={6}
                onChange={(e) => aggiornaFilettatura({ classeTolleranza: e.target.value || undefined })}
                aria-label="Classe di tolleranza"
              />
            </div>
            <div className="qt-riga">
              <label className="qt-label">Lunghezza</label>
              <CampoValoreTecnico
                valore={filettatura.lunghezza ?? null}
                onCambia={(v) => aggiornaFilettatura({ lunghezza: v ?? undefined })}
              />
            </div>
            <div className="qt-riga">
              <label className="qt-label">Callout</label>
              <strong style={{ color: 'var(--testo-1)' }}>{filettatura.designazione}</strong>
            </div>
          </>
        )}

        {isCatena && (
          <>
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
          </>
        )}

        {/* Passo di impilamento (solo parallelo) */}
        {isParallelo && (
          <div className="qt-riga">
            <label className="qt-label">Passo</label>
            <input
              type="range"
              min={0}
              max={Math.max(40, Math.round(offsetMax / 2))}
              step={Math.max(1, Math.round(offsetMax / 200))}
              value={Math.min(passoCorrente, Math.max(40, Math.round(offsetMax / 2)))}
              onChange={(e) => cambiaPasso(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Passo tra le linee di quota"
            />
          </div>
        )}

        {/* Origine / zero (parallelo e progressiva) */}
        {(isParallelo || isProgressiva) && (
          <div className="qt-riga">
            <label className="qt-label">{isProgressiva ? 'Zero' : 'Origine'}</label>
            <div className="segmenti" role="group" aria-label={isProgressiva ? 'Punto zero' : 'Origine'}>
              <button
                className={origineCorrente === 'inizio' ? 'attivo' : ''}
                onClick={() => cambiaOrigine('inizio')}
              >
                Inizio
              </button>
              <button
                className={origineCorrente === 'fine' ? 'attivo' : ''}
                onClick={() => cambiaOrigine('fine')}
              >
                Fine
              </button>
            </div>
          </div>
        )}

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
        {isCatena && (
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
                <CampoValoreTecnico valore={q.valore} onCambia={(v) => cambiaValore(i, v)} />
                <span className="qt-misura-unita">{quota.unita}</span>
              </div>
            ))}
          </div>
        )}

        {/* Linee di estensione */}
        {isCatena && (
          <>
            <div className="qt-riga">
              <label className="qt-label">Estensioni</label>
              <button
                className={`btn${quota.estensioniVisibili === false ? '' : ' attivo'}`}
                onClick={() =>
                  onModifica({ ...quota, estensioniVisibili: quota.estensioniVisibili === false })
                }
              >
                {quota.estensioniVisibili === false ? 'Nascoste' : 'Visibili'}
              </button>
            </div>
            {quota.estensioniVisibili !== false && (
              <>
                <div className="qt-riga">
                  <label className="qt-label">Distacco est.</label>
                  <input
                    type="range"
                    min={0}
                    max={estMax}
                    step={1}
                    value={Math.min(gapCorrente, estMax)}
                    onChange={(e) => onModifica({ ...quota, gapEstensione: Number(e.target.value) })}
                    style={{ flex: 1 }}
                    aria-label="Distacco delle estensioni dall'oggetto"
                  />
                </div>
                <div className="qt-riga">
                  <label className="qt-label">Sporgenza</label>
                  <input
                    type="range"
                    min={0}
                    max={estMax}
                    step={1}
                    value={Math.min(sporgenzaCorrente, estMax)}
                    onChange={(e) =>
                      onModifica({ ...quota, sporgenzaEstensione: Number(e.target.value) })
                    }
                    style={{ flex: 1 }}
                    aria-label="Sporgenza delle estensioni oltre la linea"
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* Nel PDF */}
        {!isDatum && (
          <label className="fisc-check qt-riga">
            <input
              type="checkbox"
              checked={quota.partePerimetro}
              onChange={(e) => onModifica({ ...quota, partePerimetro: e.target.checked })}
            />
            Includi le misure nel riepilogo del PDF
          </label>
        )}
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
