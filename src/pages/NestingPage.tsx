import { useEffect, useMemo, useRef, useState } from 'react';
import { naviga } from '../router';
import { Modale, StatoApp } from '../components/comuni';
import { Icona } from '../components/Icona';
import { nuovoId } from '../utils/id';
import {
  calcolaNesting,
  lunghezzaUsata,
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

/** supporto: lastre uguali a volontà, oppure un rotolo di lunghezza data */
type ModoSupporto = 'lastre' | 'bobina';

/** direzione della venatura del materiale (o assenza) */
type Venatura = 'nessuna' | 'orizzontale' | 'verticale';

interface StatoNesting extends ParametriNesting {
  modo?: ModoSupporto;
  /** larghezza del rotolo (mm) e metri disponibili */
  bobina?: { larghezza: number; metri: number };
  /** venatura del materiale: vincola il verso dei pezzi e si vede nel disegno */
  venatura?: Venatura;
  pezzi: PezzoNesting[];
}

/**
 * Campo numerico che si lascia MODIFICARE davvero.
 *
 * Un campo controllato che rinormalizza a ogni battuta impedisce di cancellare
 * l'ultima cifra: svuotandolo il valore tornerebbe subito al minimo. Qui il
 * testo digitato vive per conto suo, il valore esce solo quando è valido e la
 * normalizzazione avviene all'uscita dal campo.
 */
function CampoNumero({
  valore,
  onCambia,
  min = 0,
  intero,
  etichetta,
  classe
}: {
  valore: number;
  onCambia: (v: number) => void;
  min?: number;
  intero?: boolean;
  etichetta?: string;
  classe?: string;
}) {
  const [testo, setTesto] = useState(() => String(valore));
  const [inModifica, setInModifica] = useState(false);

  // se il valore cambia da fuori (esempio, incolla, svuota) e non si sta
  // scrivendo, il campo si riallinea
  useEffect(() => {
    if (!inModifica) setTesto(String(valore));
  }, [valore, inModifica]);

  return (
    <input
      type="text"
      inputMode={intero ? 'numeric' : 'decimal'}
      aria-label={etichetta}
      className={classe}
      value={testo}
      onFocus={(e) => {
        setInModifica(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const t = e.target.value;
        setTesto(t); // si può svuotare: nessuna correzione mentre si scrive
        const n = parseFloat(t.replace(',', '.'));
        if (Number.isFinite(n) && n >= min) onCambia(intero ? Math.round(n) : n);
      }}
      onBlur={() => {
        setInModifica(false);
        const n = parseFloat(testo.replace(',', '.'));
        const v = Number.isFinite(n) ? Math.max(min, intero ? Math.round(n) : n) : min;
        onCambia(v);
        setTesto(String(v));
      }}
    />
  );
}

/** larghezza in pixel di un elemento, per dimensionare i testi dell'SVG */
function useLarghezza() {
  const ref = useRef<HTMLDivElement>(null);
  const [larghezza, setLarghezza] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLarghezza(el.getBoundingClientRect().width);
    const osservatore = new ResizeObserver((voci) => {
      setLarghezza(voci[0].contentRect.width);
    });
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, []);
  return [ref, larghezza] as const;
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

/**
 * Righe della venatura dentro un pezzo. Il "filo" appartiene al MATERIALE:
 * resta parallelo alla lastra e non gira insieme al pezzo — è proprio per
 * questo che si vede a colpo d'occhio se un pezzo è impaginato controvena.
 */
function righeVenatura(
  pc: { x: number; y: number; larghezza: number; altezza: number },
  venatura: Venatura,
  passo: number
): number[][] {
  const righe: number[][] = [];
  if (passo <= 0) return righe;
  if (venatura === 'orizzontale') {
    for (let y = pc.y + passo; y < pc.y + pc.altezza; y += passo) {
      righe.push([pc.x, y, pc.x + pc.larghezza, y]);
    }
  } else if (venatura === 'verticale') {
    for (let x = pc.x + passo; x < pc.x + pc.larghezza; x += passo) {
      righe.push([x, pc.y, x, pc.y + pc.altezza]);
    }
  }
  return righe;
}

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

  const modo: ModoSupporto = stato.modo ?? 'lastre';
  const bobina = stato.bobina ?? { larghezza: 1000, metri: 50 };
  const venatura: Venatura = stato.venatura ?? 'nessuna';
  const orientamenti = useMemo(() => stato.orientamenti ?? {}, [stato.orientamenti]);

  /** gira di 90° una singola copia già impaginata e ricalcola */
  const giraPezzo = (chiave: string, eraRuotato: boolean) =>
    setStato((s) => {
      const nuovi = { ...(s.orientamenti ?? {}) };
      const richiesto = !eraRuotato;
      // tornare al verso che il calcolo sceglierebbe da solo = togliere il vincolo
      if (nuovi[chiave] === richiesto) delete nuovi[chiave];
      else nuovi[chiave] = richiesto;
      return { ...s, orientamenti: nuovi };
    });

  /** parametri effettivi: la bobina è un'unica "lastra" lunga quanto il rotolo */
  const parametri = useMemo<ParametriNesting>(
    () =>
      modo === 'bobina'
        ? {
            lastra: { larghezza: bobina.larghezza, altezza: Math.max(1, bobina.metri * 1000) },
            lama: stato.lama,
            abbondanza: stato.abbondanza,
            margine: stato.margine,
            massimoLastre: 1,
            orientamenti
          }
        : {
            lastra: stato.lastra,
            lama: stato.lama,
            abbondanza: stato.abbondanza,
            margine: stato.margine,
            orientamenti
          },
    [
      modo,
      bobina.larghezza,
      bobina.metri,
      stato.lastra,
      stato.lama,
      stato.abbondanza,
      stato.margine,
      orientamenti
    ]
  );

  const esito = useMemo(() => calcolaNesting(parametri, stato.pezzi), [parametri, stato.pezzi]);
  const riepilogo = useMemo(
    () => riepilogaNesting(parametri, stato.pezzi, esito),
    [parametri, stato.pezzi, esito]
  );

  /** consumo del rotolo: quanto materiale serve davvero */
  const consumo = useMemo(() => {
    if (modo !== 'bobina') return null;
    const usatiMm = lunghezzaUsata(esito.lastre[0], stato.margine);
    const usatiM = usatiMm / 1000;
    const areaConsumata = bobina.larghezza * usatiMm;
    let areaPezzi = 0;
    for (const pc of esito.lastre[0]?.piazzamenti ?? []) {
      areaPezzi += pc.larghezzaFinita * pc.altezzaFinita;
    }
    return {
      usatiM,
      rimanentiM: Math.max(0, bobina.metri - usatiM),
      // resa sul materiale EFFETTIVAMENTE consumato, non sull'intero rotolo
      resa: areaConsumata > 0 ? (areaPezzi / areaConsumata) * 100 : 0
    };
  }, [modo, esito, stato.margine, bobina.larghezza, bobina.metri]);

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
          // con la venatura attiva il verso conta: il pezzo nasce vincolato
          ruotabile: (s.venatura ?? 'nessuna') === 'nessuna',
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
        <div className="segmenti" role="group" aria-label="Tipo di supporto">
          <button
            className={modo === 'lastre' ? 'attivo' : ''}
            onClick={() => setStato((s) => ({ ...s, modo: 'lastre' }))}
          >
            Lastre
          </button>
          <button
            className={modo === 'bobina' ? 'attivo' : ''}
            onClick={() => setStato((s) => ({ ...s, modo: 'bobina' }))}
          >
            Bobina
          </button>
        </div>
        {modo === 'lastre' ? (
          <div className="nest-campi">
            <label className="campo">
              <span>Larghezza (mm)</span>
              <CampoNumero
                valore={stato.lastra.larghezza}
                min={1}
                onCambia={(v) =>
                  setStato((s) => ({ ...s, lastra: { ...s.lastra, larghezza: v } }))
                }
              />
            </label>
            <label className="campo">
              <span>Altezza (mm)</span>
              <CampoNumero
                valore={stato.lastra.altezza}
                min={1}
                onCambia={(v) => setStato((s) => ({ ...s, lastra: { ...s.lastra, altezza: v } }))}
              />
            </label>
          </div>
        ) : (
          <div className="nest-campi">
            <label className="campo">
              <span>Larghezza bobina (mm)</span>
              <CampoNumero
                valore={bobina.larghezza}
                min={1}
                onCambia={(v) =>
                  setStato((s) => ({ ...s, bobina: { ...bobina, larghezza: v } }))
                }
              />
            </label>
            <label className="campo">
              <span>Metri disponibili</span>
              <CampoNumero
                valore={bobina.metri}
                min={0.1}
                onCambia={(v) => setStato((s) => ({ ...s, bobina: { ...bobina, metri: v } }))}
              />
              <small>Lunghezza totale sul rotolo</small>
            </label>
          </div>
        )}

        <div className="nest-venatura">
          <span className="et">Venatura del materiale</span>
          <div className="segmenti" role="group" aria-label="Venatura del materiale">
            <button
              className={venatura === 'nessuna' ? 'attivo' : ''}
              onClick={() => setStato((s) => ({ ...s, venatura: 'nessuna' }))}
            >
              Nessuna
            </button>
            <button
              className={venatura === 'orizzontale' ? 'attivo' : ''}
              onClick={() => setStato((s) => ({ ...s, venatura: 'orizzontale' }))}
            >
              ↔ Orizzontale
            </button>
            <button
              className={venatura === 'verticale' ? 'attivo' : ''}
              onClick={() => setStato((s) => ({ ...s, venatura: 'verticale' }))}
            >
              ↕ Verticale
            </button>
          </div>
          {venatura !== 'nessuna' && (
            <small>
              Togli la spunta «Ruota» ai pezzi che devono seguire la venatura. Nell’anteprima
              tocca un pezzo per girarlo di 90°.
            </small>
          )}
        </div>

        {/* --- Abbondanze ----------------------------------------------- */}
        <h2 className="nest-titolo">Abbondanze</h2>
        <div className="nest-campi tre">
          <label className="campo">
            <span>Lama (mm)</span>
            <CampoNumero
              valore={stato.lama}
              onCambia={(v) => setStato((s) => ({ ...s, lama: v }))}
            />
            <small>Taglio consumato tra i pezzi</small>
          </label>
          <label className="campo">
            <span>Abbondanza (mm)</span>
            <CampoNumero
              valore={stato.abbondanza}
              onCambia={(v) => setStato((s) => ({ ...s, abbondanza: v }))}
            />
            <small>Extra sommato alle misure</small>
          </label>
          <label className="campo">
            <span>Margine (mm)</span>
            <CampoNumero
              valore={stato.margine}
              onCambia={(v) => setStato((s) => ({ ...s, margine: v }))}
            />
            <small>{modo === 'bobina' ? 'Dai bordi del rotolo' : 'Su tutti i lati'}</small>
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
                  <CampoNumero
                    etichetta="Larghezza"
                    classe="c"
                    min={1}
                    valore={p.larghezza}
                    onCambia={(v) => aggiornaPezzo(p.id, { larghezza: v })}
                  />
                  <CampoNumero
                    etichetta="Altezza"
                    classe="c"
                    min={1}
                    valore={p.altezza}
                    onCambia={(v) => aggiornaPezzo(p.id, { altezza: v })}
                  />
                  <CampoNumero
                    etichetta="Quantità"
                    classe="c"
                    min={1}
                    intero
                    valore={p.quantita}
                    onCambia={(v) => aggiornaPezzo(p.id, { quantita: v })}
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
              {consumo ? (
                <>
                  <Statistica
                    etichetta="Metri usati"
                    valore={formattaNumero(Math.round(consumo.usatiM * 100) / 100)}
                    unita="m"
                    barra={{
                      valore: bobina.metri > 0 ? (consumo.usatiM / bobina.metri) * 100 : 0,
                      buona: true
                    }}
                  />
                  <Statistica
                    etichetta="Metri rimanenti"
                    valore={formattaNumero(Math.round(consumo.rimanentiM * 100) / 100)}
                    unita="m"
                  />
                  <Statistica
                    etichetta="Resa sul consumato"
                    valore={formattaNumero(Math.round(consumo.resa * 10) / 10)}
                    unita="%"
                    barra={{ valore: consumo.resa, buona: true }}
                  />
                </>
              ) : (
                <>
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
                </>
              )}
              <Statistica
                etichetta="Pezzi piazzati"
                valore={
                  esito.scartati.length
                    ? `${riepilogo.pezziPiazzati} / ${riepilogo.pezziRichiesti}`
                    : String(riepilogo.pezziPiazzati)
                }
              />
            </div>

            {Object.keys(orientamenti).length > 0 && (
              <div className="riga-pulsanti" style={{ marginBottom: 12 }}>
                <button
                  className="btn"
                  onClick={() => setStato((s) => ({ ...s, orientamenti: {} }))}
                >
                  ↺ Togli i {Object.keys(orientamenti).length} versi imposti a mano
                </button>
              </div>
            )}

            {scartatiRaggruppati.length > 0 && (
              <div className="nest-avviso">
                <strong>
                  {esito.scartati.length}{' '}
                  {esito.scartati.length === 1 ? 'pezzo non entra' : 'pezzi non entrano'}
                </strong>{' '}
                {modo === 'bobina'
                  ? 'nella bobina: o sono più larghi del rotolo, o i metri disponibili non bastano.'
                  : 'nella lastra nemmeno da soli, con abbondanze e margini. Riduci le misure o ingrandisci il supporto.'}
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
                parametri={parametri}
                pezzi={stato.pezzi}
                bobina={modo === 'bobina'}
                venatura={venatura}
                imposti={orientamenti}
                onGira={giraPezzo}
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
  parametri,
  pezzi,
  bobina,
  venatura,
  imposti,
  onGira,
  legenda
}: {
  indice: number;
  lastra: LastraNesting;
  parametri: ParametriNesting;
  pezzi: PezzoNesting[];
  bobina: boolean;
  venatura: Venatura;
  imposti: Record<string, boolean>;
  onGira: (chiave: string, eraRuotato: boolean) => void;
  legenda: boolean;
}) {
  const L = parametri.lastra.larghezza;
  const mg = parametri.margine;
  // sulla bobina si disegna solo il tratto CONSUMATO: mostrare 50 m di rotolo
  // vuoto renderebbe i pezzi illeggibili
  const consumata = lunghezzaUsata(lastra, mg);
  const A = bobina ? Math.max(consumata, 1) : parametri.lastra.altezza;
  const latoMax = Math.max(L, A);
  const areaLastra = L * A;
  const usata = lastra.piazzamenti.reduce(
    (a, pc) => a + pc.larghezzaFinita * pc.altezzaFinita,
    0
  );
  const resa = areaLastra > 0 ? (usata / areaLastra) * 100 : 0;
  const passo = passoGriglia(latoMax / 9);

  // I testi vanno dimensionati in PIXEL DI SCHERMO: l'SVG ha il viewBox in
  // millimetri, quindi una misura espressa in mm su una lastra da 2,5 m
  // diventerebbe illeggibile sul telefono. Si misura la larghezza resa e si
  // converte la dimensione desiderata da px a unità del disegno.
  const [rifSvg, larghezzaResa] = useLarghezza();
  const mmPerPx = larghezzaResa > 0 ? (L + 8) / larghezzaResa : 0;
  const inUnita = (px: number) => px * mmPerPx;

  const linee: number[][] = [];
  for (let x = passo; x < L; x += passo) linee.push([x, 0, x, A]);
  for (let y = passo; y < A; y += passo) linee.push([0, y, L, y]);

  return (
    <section className="nest-lastra">
      <div className="testa">
        <div className="titolo">
          {bobina ? 'Bobina' : `Lastra ${indice + 1}`}
          <span>
            {bobina
              ? `${formattaNumero(L)} mm × ${formattaNumero(Math.round(consumata) / 1000)} m usati`
              : `${formattaNumero(L)}×${formattaNumero(A)} mm`}
          </span>
        </div>
        <div className="misure">
          {lastra.piazzamenti.length} pezzi · resa{' '}
          <strong>{formattaNumero(Math.round(resa * 10) / 10)}%</strong>
        </div>
      </div>
      <div ref={rifSvg}>
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
          const cx = pc.x + pc.larghezza / 2;
          const cy = pc.y + pc.altezza / 2;
          const misura = `${formattaNumero(pc.larghezzaFinita)}×${formattaNumero(pc.altezzaFinita)}`;
          // dimensioni pensate in px di schermo, poi convertite nelle unità
          // del disegno: così restano leggibili a qualsiasi scala
          const dim = inUnita(12);
          const dimMisura = inUnita(11);
          const dimSola = inUnita(10);
          // ci sta? (larghezza del testo ≈ 0,58 × corpo × caratteri)
          const largo = (corpo: number, testo: string) => corpo * 0.58 * testo.length;
          const conNome =
            !!pc.nome &&
            mmPerPx > 0 &&
            largo(dim, pc.nome) <= pc.larghezza * 0.94 &&
            largo(dimMisura, misura) <= pc.larghezza * 0.94 &&
            dim * 2.5 <= pc.altezza;
          const soloMisura =
            !conNome &&
            mmPerPx > 0 &&
            largo(dimSola, misura) <= pc.larghezza * 0.94 &&
            dimSola * 1.5 <= pc.altezza;
          // pezzo stretto e alto: la misura non ci sta in orizzontale ma ci
          // sta girata di 90°, come si scrive sui listelli
          const misuraRuotata =
            !conNome &&
            !soloMisura &&
            mmPerPx > 0 &&
            largo(dimSola, misura) <= pc.altezza * 0.94 &&
            dimSola * 1.5 <= pc.larghezza;
          return (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`${pc.nome || 'pezzo'} ${misura}: gira di 90°`}
              style={{ cursor: 'pointer' }}
              onClick={() => onGira(pc.chiave, pc.ruotato)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onGira(pc.chiave, pc.ruotato);
                }
              }}
            >
              <title>{`${pc.nome || 'Pezzo'} ${misura} — tocca per girare di 90°`}</title>
              <rect
                x={pc.x}
                y={pc.y}
                width={pc.larghezza}
                height={pc.altezza}
                rx={1.5}
                fill={tintaSfondo(pc.tinta)}
                stroke={tintaBordo(pc.tinta)}
                strokeWidth={imposti[pc.chiave] != null ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
              {/* venatura: righe parallele nel verso del materiale, ritagliate
                  dentro il pezzo. Sono i "fili" del legno, quindi seguono la
                  lastra e NON girano col pezzo. */}
              {venatura !== 'nessuna' && (
                <g clipPath={`url(#taglio-${indice}-${i})`} opacity={0.28}>
                  <clipPath id={`taglio-${indice}-${i}`}>
                    <rect x={pc.x} y={pc.y} width={pc.larghezza} height={pc.altezza} rx={1.5} />
                  </clipPath>
                  {righeVenatura(pc, venatura, Math.max(inUnita(7), 12)).map((l, k) => (
                    <line
                      key={k}
                      x1={l[0]}
                      y1={l[1]}
                      x2={l[2]}
                      y2={l[3]}
                      stroke="#3a2a18"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              )}
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
                    y={cy + dimMisura * 1.05}
                    textAnchor="middle"
                    fontSize={dimMisura}
                    fill="#3a424c"
                  >
                    {misura}
                  </text>
                </>
              ) : (
                (soloMisura && (
                  <text
                    x={cx}
                    y={cy + dimSola * 0.34}
                    textAnchor="middle"
                    fontSize={dimSola}
                    fill="#2a3138"
                  >
                    {misura}
                  </text>
                )) ||
                (misuraRuotata && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={dimSola}
                    fill="#2a3138"
                    transform={`rotate(-90 ${cx} ${cy})`}
                  >
                    {misura}
                  </text>
                ))
              )}
              {pc.ruotato && conNome && (
                <text
                  x={pc.x + pc.larghezza - dim * 0.3}
                  y={pc.y + dim * 1.1}
                  textAnchor="end"
                  fontSize={dim * 0.9}
                  fill={tintaBordo(pc.tinta)}
                >
                  ↻
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </div>
      {legenda && (
        <div className="nest-legenda">
          {pezzi
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
