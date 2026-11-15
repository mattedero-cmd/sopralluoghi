/**
 * IL PRESET DEL LAVORO: da dove parte questo sopralluogo.
 *
 * Un sopralluogo non comincia da una pagina bianca. Chi fa pellicole solari
 * lavora con la sua bobina, dà sempre gli stessi centimetri di abbondanza e
 * sormonta sempre allo stesso modo — ma finora niente di tutto questo si
 * poteva dire una volta per tutte, e andava rifatto a mano su ogni forma.
 *
 * Qui lo si dice una volta. Il preset dà i valori QUANDO LA COSA NASCE: la
 * forma che disegni prende la sua abbondanza, la divisione in teli parte
 * dalla fascia del supporto invece che da «due uguali», il piano di taglio
 * nasce con la macchina giusta. Poi lascia tutto libero: un'abbondanza
 * cambiata a mano su un pezzo resta quella, e cambiare il preset a lavoro
 * avviato non riscrive niente di quello che c'è già.
 *
 * Per portarlo anche su quello che c'è già c'è un comando a parte, che dice
 * prima quante forme toccherà. L'abbondanza sì, i teli no: una parete che
 * hai diviso spostando i giunti col dito non te la ridivide nessuno.
 */

import { useEffect, useRef, useState } from 'react';
import { Modale } from './comuni';
import { Icona } from './Icona';
import { FASCE_BOBINA } from '../utils/documentoNesting';
import { analizzaMisura, formattaNumero } from '../utils/format';
import type { AssePannelli, VersoSormonto } from '../geometry/pannelli';
import type { ID, MaterialePreset, ModoSupporto, PresetProgetto, Venatura } from '../db/types';
import { PRESET_INIZIALE } from '../utils/preset';
import type { AbbondanzaPreset } from '../utils/preset';
import { MaterialiLavoro } from './MaterialiLavoro';

/**
 * UNA RIGA NUMERICA, sempre la stessa: cosa è, il campo, l'unità.
 *
 * Qui non si usa il campo misura con la calcolatrice — quello serve a chi
 * somma pezzi presi col metro («100+124+113»), non a chi scrive la fascia
 * della bobina. E stretto com'è questa roba, la calcolatrice si mangiava
 * tutto il campo: restavano sei pixel per scriverci dentro, e i due segni
 * finivano addosso all'etichetta di fianco.
 *
 * È un `label`: si tocca anche la scritta e il dito va nel campo.
 */
function Numero({
  etichetta,
  valore,
  onCambia,
  unita = 'mm',
  suggerito
}: {
  etichetta: string;
  valore: string;
  onCambia: (t: string) => void;
  unita?: string;
  suggerito?: string;
}) {
  return (
    <label className="riga-numero">
      <span className="che">{etichetta}</span>
      <input
        className="input-misura"
        type="text"
        inputMode="decimal"
        value={valore}
        placeholder={suggerito}
        aria-label={etichetta}
        onChange={(e) => onCambia(e.target.value)}
      />
      <span className="unita">{unita}</span>
    </label>
  );
}

/**
 * UNA RIGA NUMERICA LEGATA A UN NUMERO, con il suo testo.
 *
 * Il campo non può mostrare il numero salvato così com'è: lo zero diventava
 * un campo vuoto — e sotto ricompariva il suggerimento grigio, «10» sul
 * margine, che sembra un valore vero — e scrivere «0,5» non si poteva,
 * perché lo «0» spariva appena battuto. Qui il testo è quello che si scrive,
 * e il numero ne segue; se il numero cambia da fuori (una fascia scelta col
 * tasto) il testo si rimette in pari.
 */
function NumeroValore({
  etichetta,
  valore,
  onCambia,
  unita = 'mm',
  suggerito
}: {
  etichetta: string;
  valore: number;
  onCambia: (v: number) => void;
  unita?: string;
  suggerito?: string;
}) {
  const scritto = (v: number) => String(v).replace('.', ',');
  const [testo, setTesto] = useState(() => scritto(valore));
  // il numero cambiato da fuori: il testo lo segue, se non dice già quello
  useEffect(() => {
    if ((analizzaMisura(testo) ?? 0) !== valore) setTesto(scritto(valore));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valore]);
  return (
    <Numero
      etichetta={etichetta}
      valore={testo}
      onCambia={(t) => {
        setTesto(t);
        onCambia(Math.max(0, analizzaMisura(t) ?? 0));
      }}
      unita={unita}
      suggerito={suggerito}
    />
  );
}

/** il preset senza la lista dei materiali: quello che si scrive in una scheda */
type PresetScheda = Omit<PresetProgetto, 'materiali'>;

/**
 * I CAMPI DI UN PRESET — abbondanza, supporto, teli — per una scheda: il
 * predefinito del lavoro o quello di un materiale. Ogni modifica risale
 * subito, già costruita: chi li ospita tiene un preset per scheda e salva
 * tutto insieme.
 */
function CampiPreset({
  valore,
  onCambia
}: {
  valore: PresetScheda | undefined;
  onCambia: (p: PresetScheda) => void;
}) {
  const p0 = valore ?? PRESET_INIZIALE;
  const inCm = (mm: number | undefined) => (mm ? String(mm / 10).replace('.', ',') : '');
  const [abb, setAbb] = useState(inCm(p0.abbPerimetroMm));
  // i due campi vecchi (base e altezza) si leggono ancora: la base era
  // sinistra e destra insieme, l'altezza sopra e sotto
  const [sx, setSx] = useState(inCm(p0.abbSinistraMm ?? p0.abbBaseMm));
  const [dx, setDx] = useState(inCm(p0.abbDestraMm ?? p0.abbBaseMm));
  const [sopra, setSopra] = useState(inCm(p0.abbSopraMm ?? p0.abbAltezzaMm));
  const [sotto, setSotto] = useState(inCm(p0.abbSottoMm ?? p0.abbAltezzaMm));
  /**
   * DUE MODI DI DIRE LA STESSA COSA, e uno solo per volta.
   *
   * «Uguale attorno» è un numero; «lato per lato» sono quattro. Tenerli
   * accesi tutti insieme vorrebbe dire una regola in più da spiegare — quale
   * vince — e sarebbe la regola di nessuno: chi dà due centimetri di lato e
   * cinque sopra non ha anche un'abbondanza attorno.
   */
  const [perLati, setPerLati] = useState(
    !!(p0.abbSinistraMm || p0.abbDestraMm || p0.abbSopraMm || p0.abbSottoMm ||
      p0.abbBaseMm || p0.abbAltezzaMm)
  );
  const [sup, setSup] = useState(p0.supporto ?? PRESET_INIZIALE.supporto);
  const [teli, setTeli] = useState(p0.teli ?? PRESET_INIZIALE.teli);

  const mm = (t: string) => Math.max(0, (analizzaMisura(t) ?? 0) * 10);
  const abbMm = mm(abb);
  const lati = { sinistra: mm(sx), destra: mm(dx), sopra: mm(sopra), sotto: mm(sotto) };
  /** i campi dell'abbondanza come stanno adesso: il modo spento resta vuoto */
  const abbOra = (): AbbondanzaPreset => ({
    abbPerimetroMm: perLati ? undefined : abbMm || undefined,
    abbSinistraMm: perLati ? lati.sinistra || undefined : undefined,
    abbDestraMm: perLati ? lati.destra || undefined : undefined,
    abbSopraMm: perLati ? lati.sopra || undefined : undefined,
    abbSottoMm: perLati ? lati.sotto || undefined : undefined,
    // i campi vecchi si spengono: li rileggerebbe `abbAiLati` come se
    // valessero ancora
    abbBaseMm: undefined,
    abbAltezzaMm: undefined
  });
  /**
   * PASSANDO A «LATO PER LATO» i quattro campi partono dal numero di prima.
   *
   * Chi ha scritto due centimetri attorno e poi vuole cinque sopra non deve
   * riscrivere gli altri tre: li trova già a due, e cambia quello che cambia.
   */
  const aLati = () => {
    if (!Object.values(lati).some((v) => v > 0) && abb.trim()) {
      setSx(abb);
      setDx(abb);
      setSopra(abb);
      setSotto(abb);
    }
    setPerLati(true);
  };
  const costruito = (): PresetScheda => ({
    ...abbOra(),
    supporto: sup,
    teli
  });
  // ogni modifica risale; la prima volta no, che il valore è quello ricevuto
  const primo = useRef(true);
  const risali = useRef(onCambia);
  risali.current = onCambia;
  const impronta = JSON.stringify(costruito());
  useEffect(() => {
    if (primo.current) {
      primo.current = false;
      return;
    }
    risali.current(JSON.parse(impronta) as PresetScheda);
  }, [impronta]);

  const scriviSup = (m: Partial<typeof sup>) => setSup((s) => ({ ...s, ...m }));

  return (
    <>
      <div className="campo">
        <label>Abbondanza attorno alle forme</label>
        {/*
          UN NUMERO O QUATTRO: «attorno» è come si ragiona su una parete,
          lato per lato come si ragiona su una finestra. Due centimetri di
          lato per entrare sotto i fermavetro, cinque sopra per avere da
          tirare e zero sotto dove il pezzo va a filo del davanzale sono
          quattro numeri, e con un numero solo tre sono sbagliati.
        */}
        <span className="segmenti piena" role="group" aria-label="Come si dà l’abbondanza">
          <button className={perLati ? '' : 'attivo'} onClick={() => setPerLati(false)}>
            Uguale attorno
          </button>
          <button className={perLati ? 'attivo' : ''} onClick={aLati}>
            Lato per lato
          </button>
        </span>
        {perLati ? (
          <>
            <Numero etichetta="A sinistra" valore={sx} onCambia={setSx} unita="cm" suggerito="0" />
            <Numero etichetta="A destra" valore={dx} onCambia={setDx} unita="cm" suggerito="0" />
            <Numero etichetta="Sopra" valore={sopra} onCambia={setSopra} unita="cm" suggerito="0" />
            <Numero etichetta="Sotto" valore={sotto} onCambia={setSotto} unita="cm" suggerito="0" />
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
              Quanto esce il pezzo oltre il vetro, da quella parte: una finestra da 120 × 80 si
              taglia{' '}
              <strong>
                {formattaNumero(120 + (lati.sinistra + lati.destra) / 10)} ×{' '}
                {formattaNumero(80 + (lati.sopra + lati.sotto) / 10)} cm
              </strong>
              . Vale sulle forme a quattro lati; su una polilinea, dove un «sopra» non c’è, vale il
              più grande dei quattro tutt’intorno.
            </span>
          </>
        ) : (
          <>
            <Numero
              etichetta="Su ogni lato"
              valore={abb}
              onCambia={setAbb}
              unita="cm"
              suggerito="0"
            />
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
              La stessa che scriveresti a mano nella forma, sotto «abbondanza perimetrale». Una
              finestra da 120 × 80 si taglia{' '}
              <strong>
                {formattaNumero(120 + abbMm / 5)} × {formattaNumero(80 + abbMm / 5)} cm
              </strong>
              .
            </span>
          </>
        )}
      </div>

      <div className="campo">
        <label>Supporto da cui si taglia</label>
        <span className="segmenti piena" role="group" aria-label="Supporto">
          {(
            [
              ['bobina', 'Bobina'],
              ['lastre', 'Lastre']
            ] as Array<[ModoSupporto, string]>
          ).map(([v, testo]) => (
            <button key={v} className={sup.modo === v ? 'attivo' : ''} onClick={() => scriviSup({ modo: v })}>
              {testo}
            </button>
          ))}
        </span>
        {sup.modo === 'bobina' ? (
          <>
            <NumeroValore
              etichetta="Fascia della bobina"
              valore={sup.bobina.larghezza}
              onCambia={(v) => scriviSup({ bobina: { ...sup.bobina, larghezza: v } })}
              suggerito="1370"
            />
            <div className="fasce">
              {FASCE_BOBINA.map((f) => (
                <button
                  key={f}
                  className={`btn${sup.bobina.larghezza === f ? ' attivo' : ''}`}
                  onClick={() => scriviSup({ bobina: { ...sup.bobina, larghezza: f } })}
                >
                  {f}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <NumeroValore
              etichetta="Larghezza della lastra"
              valore={sup.lastra.larghezza}
              onCambia={(v) => scriviSup({ lastra: { ...sup.lastra, larghezza: v } })}
              suggerito="2500"
            />
            <NumeroValore
              etichetta="Altezza della lastra"
              valore={sup.lastra.altezza}
              onCambia={(v) => scriviSup({ lastra: { ...sup.lastra, altezza: v } })}
              suggerito="1250"
            />
          </>
        )}
        <NumeroValore
          etichetta="Lama (taglio consumato)"
          valore={sup.lama}
          onCambia={(v) => scriviSup({ lama: v })}
          suggerito="0"
        />
        <NumeroValore
          etichetta="Margine su tutti i lati"
          valore={sup.margine}
          onCambia={(v) => scriviSup({ margine: v })}
          suggerito="0"
        />
        <div className="riga-scelta">
          <span className="che">Venatura</span>
          <span className="segmenti" role="group" aria-label="Venatura">
            {(
              [
                ['nessuna', 'Nessuna'],
                ['orizzontale', '↔\uFE0E'],
                ['verticale', '↕\uFE0E']
              ] as Array<[Venatura, string]>
            ).map(([v, testo]) => (
              <button
                key={v}
                className={sup.venatura === v ? 'attivo' : ''}
                onClick={() => scriviSup({ venatura: v })}
              >
                {testo}
              </button>
            ))}
          </span>
        </div>
        <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 6 }}>
          Serve a due cose: il piano di taglio nasce già con questa macchina, e dividendo in teli
          dalla foto l’app sa quanto è larga la fascia — prima lo sapeva solo dalla pagina del
          taglio, e dalla foto i teli uscivano sempre due uguali.
        </span>
      </div>

      <div className="campo">
        <label>Divisione in teli</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="segmenti" role="group" aria-label="Verso dei teli">
            {(
              [
                ['verticale', '↕\uFE0E Verticali'],
                ['orizzontale', '↔\uFE0E Orizzontali']
              ] as Array<[AssePannelli, string]>
            ).map(([v, testo]) => (
              <button
                key={v}
                className={teli.asse === v ? 'attivo' : ''}
                onClick={() => setTeli((t) => ({ ...t, asse: v }))}
              >
                {testo}
              </button>
            ))}
          </span>
          <span className="segmenti" role="group" aria-label="Come dividere">
            {(
              [
                ['fascia', 'A fascia'],
                ['uguali', 'Uguali']
              ] as Array<['fascia' | 'uguali', string]>
            ).map(([v, testo]) => (
              <button
                key={v}
                className={teli.modo === v ? 'attivo' : ''}
                onClick={() => setTeli((t) => ({ ...t, modo: v }))}
              >
                {testo}
              </button>
            ))}
          </span>
        </div>
        <NumeroValore
          etichetta="Sormonto fra due teli"
          valore={teli.sormontoMm}
          onCambia={(v) => setTeli((x) => ({ ...x, sormontoMm: v }))}
          suggerito="0"
        />
        <div className="riga-scelta">
          <span className="che">Lembo</span>
          <span className="segmenti" role="group" aria-label="Da che parte sormonta">
            {(
              [
                ['centro', 'Al centro'],
                ['avanti', 'Avanti'],
                ['indietro', 'Indietro']
              ] as Array<[VersoSormonto, string]>
            ).map(([v, testo]) => (
              <button
                key={v}
                className={teli.verso === v ? 'attivo' : ''}
                onClick={() => setTeli((t) => ({ ...t, verso: v }))}
              >
                {testo}
              </button>
            ))}
          </span>
        </div>
        <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 6 }}>
          «A fascia» fa i teli larghi quanto il supporto, che è come si taglia davvero; «uguali» li
          divide in parti uguali. Quanti teli lo dice la fascia: quello che ci sta in un telo solo
          non si divide.
        </span>
      </div>

    </>
  );
}

/** il preset di partenza di un materiale salvato con la sola bobina (1.96.0) */
function presetProprio(m: MaterialePreset, generale: PresetScheda): PresetScheda | undefined {
  if (m.preset) return m.preset;
  if (!m.supporto) return undefined;
  return {
    ...generale,
    supporto: { ...(generale.supporto ?? PRESET_INIZIALE.supporto), ...m.supporto }
  };
}

export function PresetLavoro({
  preset,
  quanteForme,
  onSalva,
  onApplicaTutto,
  onChiudi,
  creazione,
  richiediMateriali,
  perMateriale: perMaterialeProp,
  onBozza
}: {
  preset: PresetProgetto | undefined;
  /** quante forme ci sono già nel lavoro, per il comando «applica a tutte» */
  quanteForme: number;
  onSalva: (p: PresetProgetto) => void;
  /** salva e porta TUTTO il preset — abbondanze e teli — su quello che c'è già */
  onApplicaTutto?: (p: PresetProgetto) => void;
  onChiudi: () => void;
  /**
   * GLI ULTIMI PASSI DI UN PROGETTO COMPLESSO: prima si scelgono i materiali,
   * poi un preset per ognuno, uno dopo l'altro. Il progetto nasce all'ultimo,
   * con «crea il progetto»; «indietro» dal primo passo torna ai dati del
   * progetto invece di buttare tutto.
   */
  creazione?: boolean;
  /** un lavoro complesso: senza almeno un materiale il preset non si salva */
  richiediMateriali?: boolean;
  /**
   * UN PRESET PER MATERIALE, SEMPRE: il lavoro complesso. Non c'è una scheda
   * «predefinito» da cui i materiali dipendono: ognuno ha il suo, e uno
   * aggiunto dopo parte dai valori di default.
   */
  perMateriale?: boolean;
  /**
   * In creazione, tornando ai dati del progetto: quello che è stato detto
   * fin qui, perché tornando avanti lo si ritrovi.
   */
  onBozza?: (p: PresetProgetto) => void;
}) {
  const perMateriale = !!creazione || !!perMaterialeProp;
  const [generale, setGenerale] = useState<PresetScheda>(() => {
    const { materiali: _m, ...resto } = preset ?? PRESET_INIZIALE;
    return resto;
  });
  /**
   * DA DOVE PARTE IL PRESET DI UN MATERIALE: i valori di default del lavoro.
   * In un progetto nuovo sono quelli di fabbrica; in uno già avviato, il
   * preset che il lavoro aveva prima di dividerlo per materiale.
   */
  const partenza = (): PresetScheda => JSON.parse(JSON.stringify(generale)) as PresetScheda;
  // i materiali col loro preset; quelli della 1.96.0 (solo la bobina)
  // passano a un preset intero, il predefinito con quella bobina
  const [materiali, setMateriali] = useState<MaterialePreset[]>(() =>
    (preset?.materiali ?? []).map(({ supporto: _s, ...m }) => {
      const proprio = presetProprio({ ...m, supporto: _s }, generale);
      return proprio ? { ...m, preset: proprio } : m;
    })
  );
  /** il preset con cui si lavora un materiale: il suo, o quello da cui partirebbe */
  const presetDi = (m: MaterialePreset): PresetScheda => m.preset ?? partenza();
  /**
   * LA SCHEDA APERTA: il predefinito, o un materiale.
   *
   * Ogni pellicola si lavora a modo suo — il solare con due centimetri
   * attorno, il coverstyle con cinque e i teli orizzontali — e un preset solo
   * per tutte non basta.
   */
  const [scheda, setScheda] = useState<ID | 'predefinito'>(() =>
    perMateriale && preset?.materiali?.length ? preset.materiali[0].id : 'predefinito'
  );
  /**
   * IN CREAZIONE, IL PASSO: -1 è la scelta dei materiali, poi uno per
   * materiale, nell'ordine in cui sono stati scelti.
   */
  const [passo, setPasso] = useState(-1);
  /** cresce a ogni «uguale a…»: i campi ripartono dal preset copiato */
  const [copie, setCopie] = useState(0);
  const mancaMateriale = !!richiediMateriali && materiali.length === 0;
  const aperto =
    creazione && passo >= 0
      ? materiali[passo]
      : scheda === 'predefinito'
        ? undefined
        : materiali.find((m) => m.id === scheda);
  // un materiale tolto mentre era aperto: si torna al primo (o al predefinito)
  useEffect(() => {
    if (creazione || scheda === 'predefinito' || materiali.some((m) => m.id === scheda)) return;
    setScheda(perMateriale && materiali.length ? materiali[0].id : 'predefinito');
  }, [creazione, scheda, materiali, perMateriale]);

  const scriviMateriale = (id: ID, preset: PresetScheda | undefined) =>
    setMateriali((ms) =>
      ms.map((m) => {
        if (m.id !== id) return m;
        const { preset: _via, ...resto } = m;
        return preset ? { ...resto, preset } : resto;
      })
    );

  const costruito = (): PresetProgetto => ({
    ...generale,
    ...(materiali.length
      ? {
          // nel lavoro complesso ogni materiale esce col SUO preset, anche
          // quello lasciato com'era partito
          materiali: perMateriale ? materiali.map((m) => ({ ...m, preset: presetDi(m) })) : materiali
        }
      : {})
  });

  const salva = () => {
    if (mancaMateriale) return;
    onSalva(costruito());
    // in creazione chi riceve il preset crea il progetto e chiude lui: qui
    // «chiudi» vorrebbe dire tornare ai dati
    if (!creazione) onChiudi();
  };

  const applicaTutto = () => {
    if (mancaMateriale || !onApplicaTutto) return;
    const p = costruito();
    onSalva(p);
    onApplicaTutto(p);
    onChiudi();
  };

  /** il passo dei materiali, in creazione; tutto il resto, fuori */
  const sceltaMateriali = !creazione || passo < 0;
  const ultimo = creazione && passo === materiali.length - 1;
  const totalePassi = 3 + materiali.length;
  const precedente = creazione && passo > 0 ? materiali[passo - 1] : undefined;

  const avanti = () => {
    if (mancaMateriale) return;
    if (ultimo) return salva();
    setPasso((n) => n + 1);
  };
  const indietro = () => {
    if (creazione && passo >= 0) return setPasso((n) => n - 1);
    if (creazione) onBozza?.(costruito());
    onChiudi();
  };

  return (
    <Modale
      titolo={
        creazione
          ? aperto
            ? `Nuovo progetto · preset del ${aperto.nome}`
            : 'Nuovo progetto · materiali'
          : 'Preset del lavoro'
      }
      onChiudi={indietro}
    >
      <div className="preset-lavoro">
      {creazione ? (
        <p className="passi-progetto">
          {aperto
            ? `Passo ${4 + passo} di ${totalePassi} · materiale ${passo + 1} di ${materiali.length}`
            : `Passo 3 di ${materiali.length ? totalePassi : '…'} · i materiali del lavoro`}
        </p>
      ) : null}
      {sceltaMateriali && (
        <p className="aiuto" style={{ marginTop: 0 }}>
          {creazione
            ? 'Scegli le pellicole che si posano in questo sopralluogo. Poi, una per una, si dice il preset di ciascuna: abbondanza, supporto e teli. Forme e porte prendono il preset del loro materiale.'
            : 'Da qui partono le cose nuove di questo sopralluogo: il materiale e l’abbondanza di una forma appena disegnata, la divisione in teli, il piano di taglio. Quello che è già disegnato resta com’è — finché non tocchi «salva e applica a tutto», qui sotto.'}
        </p>
      )}

      {sceltaMateriali && (
        <div className="campo">
          <label>Materiali del lavoro{richiediMateriali ? ' *' : ''}</label>
          <span style={{ color: 'var(--testo-2)', fontSize: 13 }}>
            {perMateriale
              ? 'Una forma o una porta, quando nasce, prende uno di questi; il piano di taglio esce diviso per materiale. Ogni materiale ha il suo preset, che parte dai valori di default.'
              : 'Una forma o una porta, quando nasce, prende uno di questi; il piano di taglio esce diviso per materiale. Ogni materiale parte dal preset predefinito e può averne uno suo.'}
          </span>
          <MaterialiLavoro materiali={materiali} onCambia={setMateriali} />
          {mancaMateriale && (
            <span style={{ color: 'var(--avviso)', fontSize: 13, marginTop: 6 }}>
              Scegli almeno un materiale: in un progetto complesso ogni forma e ogni porta ne ha uno.
            </span>
          )}
        </div>
      )}

      {/*
        UNA SCHEDA PER PRESET (fuori dalla creazione): il predefinito — se il
        lavoro ne ha uno da cui i materiali dipendono — e uno per materiale.
        Le schede stanno sopra i campi, che sono gli stessi per tutti: cambia
        solo di chi sono i numeri.
      */}
      {!creazione && materiali.length > 0 && (
        <div className="schede-preset" role="tablist" aria-label="Di chi è il preset">
          {!perMateriale && (
            <button
              role="tab"
              aria-selected={scheda === 'predefinito'}
              className={scheda === 'predefinito' ? 'attivo' : ''}
              onClick={() => setScheda('predefinito')}
            >
              Predefinito
            </button>
          )}
          {materiali.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={scheda === m.id}
              className={scheda === m.id ? 'attivo' : ''}
              onClick={() => setScheda(m.id)}
            >
              {m.nome}
              {!perMateriale && m.preset ? (
                <span className="segno-suo" aria-label="(preset suo)"> ●</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {creazione && passo < 0 ? null : perMateriale ? (
        aperto && (
          <>
            {creazione && (
              <p className="aiuto" style={{ marginTop: 0 }}>
                Il preset del <strong>{aperto.nome}</strong>: come si lavora questa pellicola. Parte
                dai valori di default; cambia quello che per il {aperto.nome} è diverso.
              </p>
            )}
            {precedente && (
              <button
                className="btn largo"
                style={{ marginBottom: 10 }}
                onClick={() => {
                  scriviMateriale(aperto.id, JSON.parse(JSON.stringify(presetDi(precedente))));
                  setCopie((n) => n + 1);
                }}
              >
                Uguale al {precedente.nome}
              </button>
            )}
            <CampiPreset
              key={`${aperto.id}#${copie}`}
              valore={presetDi(aperto)}
              onCambia={(p) => scriviMateriale(aperto.id, p)}
            />
          </>
        )
      ) : aperto ? (
        <>
          <div className="campo">
            <label>Preset del {aperto.nome}</label>
            <span className="segmenti piena" role="group" aria-label={`Preset del ${aperto.nome}`}>
              <button
                className={aperto.preset ? '' : 'attivo'}
                onClick={() => scriviMateriale(aperto.id, undefined)}
              >
                Come il predefinito
              </button>
              <button
                className={aperto.preset ? 'attivo' : ''}
                // si parte dal predefinito com'è adesso, e si cambia quello che cambia
                onClick={() => !aperto.preset && scriviMateriale(aperto.id, { ...generale })}
              >
                Preset suo
              </button>
            </span>
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 6 }}>
              {aperto.preset
                ? `Le forme e le porte in ${aperto.nome} usano questi valori; il predefinito non li cambia più.`
                : `Le forme e le porte in ${aperto.nome} usano il predefinito. «Preset suo» lo copia qui, e da lì lo cambi.`}
            </span>
          </div>
          {aperto.preset && (
            <CampiPreset
              key={aperto.id}
              valore={aperto.preset}
              onCambia={(p) => scriviMateriale(aperto.id, p)}
            />
          )}
        </>
      ) : (
        <CampiPreset key="predefinito" valore={generale} onCambia={setGenerale} />
      )}

      {/*
        SALVA, OPPURE SALVA E APPLICA A TUTTO.
        Il preset da solo vale per le cose NUOVE. Su un albergo da cinquanta
        stanze già misurate questo non basta: il lavoro c'è già, ed è lì che
        serve. Il secondo tasto fa quello — e lo dice prima, perché rifà anche
        le divisioni in teli.
      */}
      {!creazione && quanteForme > 0 && (
        <span className="nota-applica">
          «Applica a tutto» riscrive abbondanze e teli sulle{' '}
          {quanteForme === 1 ? 'forma già disegnata' : `${quanteForme} forme già disegnate`} di
          questo sopralluogo, al posto di quello che avevano: anche le giunzioni spostate a mano si
          rifanno.
        </span>
      )}
      <div className="riga-pulsanti">
        <button className="btn" onClick={indietro}>
          {creazione ? 'Indietro' : 'Annulla'}
        </button>
        {creazione ? (
          <button className="btn primario" disabled={mancaMateriale} onClick={avanti}>
            {ultimo
              ? 'Crea il progetto'
              : `Avanti: preset del ${materiali[passo + 1]?.nome ?? '…'}`}
          </button>
        ) : (
          <>
            <button className="btn" disabled={mancaMateriale} onClick={salva}>
              Salva
            </button>
            <button
              className="btn primario"
              disabled={quanteForme === 0 || mancaMateriale || !onApplicaTutto}
              onClick={applicaTutto}
            >
              <Icona nome="matita" dimensione={18} /> Salva e applica a tutto
            </button>
          </>
        )}
      </div>
      </div>
    </Modale>
  );
}
