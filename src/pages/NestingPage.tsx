import { useEffect, useMemo, useState } from 'react';
import { naviga } from '../router';
import { Modale, StatoApp } from '../components/comuni';
import { Icona } from '../components/Icona';
import { nuovoId } from '../utils/id';
import {
  calcolaNesting,
  passoGriglia,
  riepilogaNesting,
  type LastraNesting,
  type ParametriNesting,
  type PezzoNesting
} from '../geometry/nesting';
import { analizzaTestoPezzi } from '../utils/parserPezzi';
import { formattaNumero } from '../utils/format';

/**
 * NESTING — ottimizzazione del taglio.
 *
 * Si inseriscono le misure del supporto e dei pezzi; il layout si ricalcola a
 * ogni modifica con l'algoritmo MaxRects (vedi geometry/nesting.ts) e viene
 * disegnato in scala in SVG. Misure in millimetri.
 */

const CHIAVE_SALVATAGGIO = 'nesting.v1';

interface StatoNesting extends ParametriNesting {
  pezzi: PezzoNesting[];
}

const ESEMPIO: StatoNesting = {
  lastra: { larghezza: 2500, altezza: 1250 },
  lama: 3,
  abbondanza: 0,
  margine: 10,
  pezzi: [
    { id: 'e1', nome: 'Ripiano', larghezza: 560, altezza: 300, quantita: 6, ruotabile: true, tinta: 0 },
    { id: 'e2', nome: 'Anta', larghezza: 597, altezza: 720, quantita: 4, ruotabile: false, tinta: 138 },
    { id: 'e3', nome: 'Fianco', larghezza: 300, altezza: 800, quantita: 4, ruotabile: true, tinta: 275 },
    { id: 'e4', nome: 'Fondo', larghezza: 1160, altezza: 560, quantita: 2, ruotabile: true, tinta: 53 },
    { id: 'e5', nome: 'Cassetto', larghezza: 400, altezza: 140, quantita: 8, ruotabile: true, tinta: 190 }
  ]
};

/** tinte ben distanziate sulla ruota dei colori (angolo d'oro) */
function prossimaTinta(indice: number): number {
  return Math.round((indice * 137.508) % 360);
}
/** riempimento pastello: chiaro, così il testo scuro sopra resta leggibile
 *  sia con tema chiaro sia con tema scuro */
function tintaSfondo(t: number): string {
  return `hsl(${t},52%,74%)`;
}
function tintaBordo(t: number): string {
  return `hsl(${t},42%,42%)`;
}

function leggiSalvato(): StatoNesting | null {
  try {
    const grezzo = localStorage.getItem(CHIAVE_SALVATAGGIO);
    if (!grezzo) return null;
    const s = JSON.parse(grezzo) as StatoNesting;
    if (!s || !s.lastra || !Array.isArray(s.pezzi)) return null;
    return s;
  } catch {
    return null;
  }
}

export function NestingPage() {
  const [stato, setStato] = useState<StatoNesting>(() => leggiSalvato() ?? ESEMPIO);
  const [incolla, setIncolla] = useState(false);

  // il lavoro resta fra una navigazione e l'altra (e fra le sessioni)
  useEffect(() => {
    try {
      localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(stato));
    } catch {
      // spazio esaurito o modalità privata: si continua senza salvare
    }
  }, [stato]);

  const esito = useMemo(() => calcolaNesting(stato, stato.pezzi), [stato]);
  const riepilogo = useMemo(
    () => riepilogaNesting(stato, stato.pezzi, esito),
    [stato, esito]
  );

  const aggiornaPezzo = (id: string, modifiche: Partial<PezzoNesting>) =>
    setStato((s) => ({
      ...s,
      pezzi: s.pezzi.map((p) => (p.id === id ? { ...p, ...modifiche } : p))
    }));

  const aggiungiPezzo = () =>
    setStato((s) => ({
      ...s,
      pezzi: [
        ...s.pezzi,
        {
          id: nuovoId(),
          nome: `Pezzo ${s.pezzi.length + 1}`,
          larghezza: 400,
          altezza: 300,
          quantita: 1,
          ruotabile: true,
          tinta: prossimaTinta(s.pezzi.length)
        }
      ]
    }));

  const scartatiRaggruppati = useMemo(() => {
    const mappa = new Map<string, { nome: string; l: number; a: number; n: number }>();
    for (const s of esito.scartati) {
      const chiave = `${s.nome}|${s.larghezzaFinita}x${s.altezzaFinita}`;
      const v = mappa.get(chiave) ?? {
        nome: s.nome,
        l: s.larghezzaFinita,
        a: s.altezzaFinita,
        n: 0
      };
      v.n++;
      mappa.set(chiave, v);
    }
    return [...mappa.values()];
  }, [esito]);

  const senzaPezzi = riepilogo.pezziRichiesti === 0;

  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => naviga({ nome: 'archivio', cartellaId: null })}
        >
          <Icona nome="indietro" />
        </button>
        <h1>Nesting</h1>
        <StatoApp />
        <button
          className="btn icona"
          aria-label="Carica l’esempio"
          title="Carica l’esempio"
          onClick={() => setStato({ ...ESEMPIO, pezzi: ESEMPIO.pezzi.map((p) => ({ ...p })) })}
        >
          <Icona nome="auto" />
        </button>
        <button
          className="btn icona"
          aria-label="Svuota la lista"
          title="Svuota la lista"
          onClick={() => setStato((s) => ({ ...s, pezzi: [] }))}
        >
          <Icona nome="cestino" />
        </button>
        <button
          className="btn icona"
          aria-label="Stampa"
          title="Stampa"
          onClick={() => window.print()}
        >
          <Icona nome="documento" />
        </button>
      </header>

      <main className="contenuto nest">
        {/* --- Supporto ------------------------------------------------- */}
        <h2 className="nest-titolo">Supporto da tagliare</h2>
        <div className="nest-campi">
          <label className="campo">
            <span>Larghezza (mm)</span>
            <input
              type="number"
              min={1}
              inputMode="decimal"
              value={stato.lastra.larghezza}
              onChange={(e) =>
                setStato((s) => ({
                  ...s,
                  lastra: { ...s.lastra, larghezza: Math.max(1, Number(e.target.value) || 0) }
                }))
              }
            />
          </label>
          <label className="campo">
            <span>Altezza (mm)</span>
            <input
              type="number"
              min={1}
              inputMode="decimal"
              value={stato.lastra.altezza}
              onChange={(e) =>
                setStato((s) => ({
                  ...s,
                  lastra: { ...s.lastra, altezza: Math.max(1, Number(e.target.value) || 0) }
                }))
              }
            />
          </label>
        </div>

        {/* --- Abbondanze ----------------------------------------------- */}
        <h2 className="nest-titolo">Abbondanze</h2>
        <div className="nest-campi tre">
          <label className="campo">
            <span>Lama (mm)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              inputMode="decimal"
              value={stato.lama}
              onChange={(e) =>
                setStato((s) => ({ ...s, lama: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
            <small>Taglio consumato tra i pezzi</small>
          </label>
          <label className="campo">
            <span>Abbondanza (mm)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={stato.abbondanza}
              onChange={(e) =>
                setStato((s) => ({ ...s, abbondanza: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
            <small>Extra sommato alle misure</small>
          </label>
          <label className="campo">
            <span>Margine (mm)</span>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={stato.margine}
              onChange={(e) =>
                setStato((s) => ({ ...s, margine: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
            <small>Su tutti i lati della lastra</small>
          </label>
        </div>

        {/* --- Rettangoli ----------------------------------------------- */}
        <h2 className="nest-titolo">Rettangoli</h2>
        {stato.pezzi.length > 0 && (
          <div className="nest-tabella">
            <div className="nest-intestazione">
              <span />
              <span>Nome</span>
              <span className="nest-misure">
                <span className="c">L</span>
                <span className="c">A</span>
                <span className="c">Qtà</span>
                <span className="c">Ruota</span>
              </span>
              <span />
            </div>
            {stato.pezzi.map((p) => (
              <div className="nest-riga" key={p.id}>
                <span
                  className="nest-tinta"
                  style={{ background: tintaSfondo(p.tinta), borderColor: tintaBordo(p.tinta) }}
                />
                <input
                  type="text"
                  aria-label="Nome del pezzo"
                  value={p.nome}
                  onChange={(e) => aggiornaPezzo(p.id, { nome: e.target.value })}
                />
                <span className="nest-misure">
                  <input
                    type="number"
                    aria-label="Larghezza"
                    className="c"
                    min={1}
                    inputMode="decimal"
                    value={p.larghezza}
                    onChange={(e) =>
                      aggiornaPezzo(p.id, { larghezza: Math.max(1, Number(e.target.value) || 0) })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Altezza"
                    className="c"
                    min={1}
                    inputMode="decimal"
                    value={p.altezza}
                    onChange={(e) =>
                      aggiornaPezzo(p.id, { altezza: Math.max(1, Number(e.target.value) || 0) })
                    }
                  />
                  <input
                    type="number"
                    aria-label="Quantità"
                    className="c"
                    min={1}
                    inputMode="numeric"
                    value={p.quantita}
                    onChange={(e) =>
                      aggiornaPezzo(p.id, {
                        quantita: Math.max(1, Math.round(Number(e.target.value) || 1))
                      })
                    }
                  />
                  <span className="nest-ruota">
                    <input
                      type="checkbox"
                      aria-label="Rotazione di 90° consentita"
                      checked={p.ruotabile}
                      onChange={(e) => aggiornaPezzo(p.id, { ruotabile: e.target.checked })}
                    />
                  </span>
                </span>
                <button
                  className="btn icona piccolo"
                  aria-label={`Rimuovi ${p.nome}`}
                  onClick={() =>
                    setStato((s) => ({ ...s, pezzi: s.pezzi.filter((x) => x.id !== p.id) }))
                  }
                >
                  <Icona nome="chiudi" dimensione={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="riga-pulsanti">
          <button className="btn primario" onClick={aggiungiPezzo}>
            ＋ Aggiungi
          </button>
          <button className="btn" onClick={() => setIncolla(true)}>
            <Icona nome="documento" dimensione={18} /> Incolla da testo
          </button>
        </div>

        {/* --- Risultato ------------------------------------------------ */}
        {senzaPezzi ? (
          <div className="vuoto">
            <div className="grande">▦</div>
            <p>Aggiungi almeno un rettangolo per calcolare il nesting.</p>
          </div>
        ) : (
          <>
            <div className="nest-statistiche">
              <Statistica etichetta="Lastre usate" valore={String(riepilogo.lastreUsate)} />
              <Statistica
                etichetta="Resa"
                valore={formattaNumero(Math.round(riepilogo.resa * 10) / 10)}
                unita="%"
                barra={{ valore: riepilogo.resa, buona: true }}
              />
              <Statistica
                etichetta="Sfrido"
                valore={formattaNumero(Math.round(riepilogo.sfrido * 10) / 10)}
                unita="%"
                barra={{ valore: riepilogo.sfrido, buona: false }}
              />
              <Statistica
                etichetta="Pezzi piazzati"
                valore={
                  esito.scartati.length
                    ? `${riepilogo.pezziPiazzati} / ${riepilogo.pezziRichiesti}`
                    : String(riepilogo.pezziPiazzati)
                }
              />
            </div>

            {scartatiRaggruppati.length > 0 && (
              <div className="nest-avviso">
                <strong>
                  {esito.scartati.length}{' '}
                  {esito.scartati.length === 1 ? 'pezzo non entra' : 'pezzi non entrano'} nella
                  lastra
                </strong>{' '}
                nemmeno da soli, con abbondanze e margini. Riduci le misure o ingrandisci il
                supporto.
                <ul>
                  {scartatiRaggruppati.map((s, i) => (
                    <li key={i}>
                      {s.n}× {s.nome || 'pezzo'} ({formattaNumero(s.l)}×{formattaNumero(s.a)} mm)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {esito.lastre.map((lastra, i) => (
              <Lastra
                key={i}
                indice={i}
                lastra={lastra}
                stato={stato}
                legenda={i === 0}
              />
            ))}
          </>
        )}

        <p className="nest-nota">
          Nesting <strong>libero</strong> (MaxRects, Best-Area-Fit) su lastre identiche a quantità
          illimitata. La <em>resa</em> è l’area dei pezzi finiti sull’area delle lastre usate; lo{' '}
          <em>sfrido</em> comprende lama, abbondanze e margini. La rotazione di 90° si attiva per
          singolo pezzo. Misure in millimetri.
        </p>
      </main>

      {incolla && (
        <ModaleIncolla
          onChiudi={() => setIncolla(false)}
          onCompila={(pezzi, sostituisci) => {
            setStato((s) => {
              const base = sostituisci ? [] : s.pezzi;
              return {
                ...s,
                pezzi: [
                  ...base,
                  ...pezzi.map((p, i) => ({
                    id: nuovoId(),
                    nome: p.nome,
                    larghezza: p.larghezza,
                    altezza: p.altezza,
                    quantita: p.quantita,
                    ruotabile: p.ruotabile,
                    tinta: prossimaTinta(base.length + i)
                  }))
                ]
              };
            });
            setIncolla(false);
          }}
        />
      )}
    </div>
  );
}

function Statistica({
  etichetta,
  valore,
  unita,
  barra
}: {
  etichetta: string;
  valore: string;
  unita?: string;
  barra?: { valore: number; buona: boolean };
}) {
  return (
    <div className="nest-stat">
      <div className="k">{etichetta}</div>
      <div className="v">
        {valore}
        {unita && <small>{unita}</small>}
      </div>
      {barra && (
        <div className="misuratore">
          <i
            style={{
              width: `${Math.max(0, Math.min(100, barra.valore))}%`,
              background: barra.buona ? 'var(--ok)' : 'var(--pericolo)'
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Disegno in scala di una lastra: SVG con viewBox in millimetri. */
function Lastra({
  indice,
  lastra,
  stato,
  legenda
}: {
  indice: number;
  lastra: LastraNesting;
  stato: StatoNesting;
  legenda: boolean;
}) {
  const L = stato.lastra.larghezza;
  const A = stato.lastra.altezza;
  const mg = stato.margine;
  const latoMax = Math.max(L, A);
  const areaLastra = L * A;
  const usata = lastra.piazzamenti.reduce(
    (a, pc) => a + pc.larghezzaFinita * pc.altezzaFinita,
    0
  );
  const resa = areaLastra > 0 ? (usata / areaLastra) * 100 : 0;
  const passo = passoGriglia(latoMax / 9);

  const linee: number[][] = [];
  for (let x = passo; x < L; x += passo) linee.push([x, 0, x, A]);
  for (let y = passo; y < A; y += passo) linee.push([0, y, L, y]);

  return (
    <section className="nest-lastra">
      <div className="testa">
        <div className="titolo">
          Lastra {indice + 1}
          <span>
            {formattaNumero(L)}×{formattaNumero(A)} mm
          </span>
        </div>
        <div className="misure">
          {lastra.piazzamenti.length} pezzi · resa{' '}
          <strong>{formattaNumero(Math.round(resa * 10) / 10)}%</strong>
        </div>
      </div>
      <svg
        className="nest-svg"
        viewBox={`-4 -4 ${L + 8} ${A + 8}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Disposizione sulla lastra ${indice + 1}`}
      >
        <rect
          x={0}
          y={0}
          width={L}
          height={A}
          rx={2}
          fill="var(--sfondo-3)"
          stroke="var(--bordo)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <g stroke="var(--bordo)" strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke">
          {linee.map((l, i) => (
            <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />
          ))}
        </g>
        {mg > 0 && (
          <rect
            x={mg}
            y={mg}
            width={L - 2 * mg}
            height={A - 2 * mg}
            fill="none"
            stroke="var(--testo-2)"
            strokeWidth={1}
            strokeDasharray="6 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {lastra.piazzamenti.map((pc, i) => {
          const lato = Math.min(pc.larghezza, pc.altezza);
          const dim = Math.max(latoMax * 0.012, Math.min(lato * 0.2, latoMax * 0.05));
          const cx = pc.x + pc.larghezza / 2;
          const cy = pc.y + pc.altezza / 2;
          const conNome = lato > latoMax * 0.06 && pc.nome;
          const misura = `${formattaNumero(pc.larghezzaFinita)}×${formattaNumero(pc.altezzaFinita)}`;
          return (
            <g key={i}>
              <rect
                x={pc.x}
                y={pc.y}
                width={pc.larghezza}
                height={pc.altezza}
                rx={1.5}
                fill={tintaSfondo(pc.tinta)}
                stroke={tintaBordo(pc.tinta)}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              {conNome ? (
                <>
                  {/* testo scuro fisso: i riempimenti sono pastello chiari in
                      entrambi i temi, quindi non segue le variabili del tema */}
                  <text
                    x={cx}
                    y={cy - dim * 0.15}
                    textAnchor="middle"
                    fontSize={dim}
                    fontWeight={600}
                    fill="#20252b"
                  >
                    {pc.nome}
                  </text>
                  <text
                    x={cx}
                    y={cy + dim * 1.05}
                    textAnchor="middle"
                    fontSize={dim * 0.86}
                    fill="#3a424c"
                  >
                    {misura}
                  </text>
                </>
              ) : (
                lato > latoMax * 0.028 && (
                  <text
                    x={cx}
                    y={cy + dim * 0.34}
                    textAnchor="middle"
                    fontSize={dim * 0.9}
                    fill="#2a3138"
                  >
                    {misura}
                  </text>
                )
              )}
              {pc.ruotato && lato > latoMax * 0.05 && (
                <text
                  x={pc.x + pc.larghezza - dim * 0.35}
                  y={pc.y + dim * 1.1}
                  textAnchor="end"
                  fontSize={dim * 0.95}
                  fill={tintaBordo(pc.tinta)}
                >
                  ↻
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {legenda && (
        <div className="nest-legenda">
          {stato.pezzi
            .filter((p) => (Math.max(0, Math.round(p.quantita)) || 0) > 0)
            .map((p) => (
              <span className="voce" key={p.id}>
                <span
                  className="nest-tinta"
                  style={{ background: tintaSfondo(p.tinta), borderColor: tintaBordo(p.tinta) }}
                />
                <strong>{p.nome || '—'}</strong>
                <span className="q">
                  {formattaNumero(p.larghezza)}×{formattaNumero(p.altezza)} ·{' '}
                  {Math.max(0, Math.round(p.quantita)) || 0}×{p.ruotabile ? ' ↻' : ''}
                </span>
              </span>
            ))}
        </div>
      )}
    </section>
  );
}

/** Modale "Incolla da testo": anteprima di verifica prima di compilare. */
function ModaleIncolla({
  onChiudi,
  onCompila
}: {
  onChiudi: () => void;
  onCompila: (pezzi: ReturnType<typeof analizzaTestoPezzi>['pezzi'], sostituisci: boolean) => void;
}) {
  const [testo, setTesto] = useState('');
  const [sostituisci, setSostituisci] = useState(false);
  const esito = useMemo(() => analizzaTestoPezzi(testo), [testo]);
  const totale = esito.pezzi.reduce((a, p) => a + p.quantita, 0);

  return (
    <Modale titolo="Incolla da testo" onChiudi={onChiudi}>
      <p className="nest-sub">
        Incolla la lista, anche il riassunto di una discussione. Riconosco misure (
        <code>597x720</code>, <code>560 × 300</code>), quantità (<code>x4</code>,{' '}
        <code>4 pezzi</code>, <code>q.tà 6</code>) e la rotazione (<code>ruotabile</code> /{' '}
        <code>verso fisso</code>). Controlla l’anteprima prima di compilare.
      </p>
      <div className="campo">
        <textarea
          rows={6}
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          aria-label="Testo da interpretare"
          placeholder={
            'Es.\n- 4 ante 597 x 720\n- 6 ripiani 560x300 (ruotabili)\n- 2 fondi 1160×560 verso fisso\n- Cassetto 400x140 x8'
          }
        />
      </div>

      {testo.trim() !== '' && (
        <div className="nest-anteprima">
          {esito.pezzi.length > 0 ? (
            <>
              <div className="pv-testa">
                {esito.pezzi.length} pezzi riconosciuti · {totale} totali
              </div>
              <div className="pv-lista">
                {esito.pezzi.map((p, i) => (
                  <div className="pv-voce" key={i}>
                    <span className="n">{p.nome}</span>
                    <span className="d">
                      {formattaNumero(p.larghezza)}×{formattaNumero(p.altezza)} mm
                    </span>
                    <span className="q">×{p.quantita}</span>
                    <span className={p.ruotabile ? 'r' : 'r spento'}>
                      {p.ruotabile ? '↻' : '·'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="pv-testa avviso">
              Nessun pezzo riconosciuto — serve una misura tipo 600x400
            </div>
          )}
          {esito.ignorate.length > 0 && (
            <div className="pv-ignorate">
              <strong>Righe ignorate ({esito.ignorate.length}):</strong>{' '}
              {esito.ignorate.join(' · ')}
            </div>
          )}
        </div>
      )}

      <label className="fisc-check" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={sostituisci}
          onChange={(e) => setSostituisci(e.target.checked)}
        />
        Sostituisci la lista attuale
      </label>

      <div className="riga-pulsanti" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          style={{ flex: 1 }}
          disabled={esito.pezzi.length === 0}
          onClick={() => onCompila(esito.pezzi, sostituisci)}
        >
          Compila lista
        </button>
      </div>
    </Modale>
  );
}
