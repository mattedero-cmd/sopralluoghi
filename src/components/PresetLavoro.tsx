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

import { useState } from 'react';
import { Modale } from './comuni';
import { Icona } from './Icona';
import { FASCE_BOBINA } from '../utils/documentoNesting';
import { analizzaMisura, formattaNumero } from '../utils/format';
import type { AssePannelli, VersoSormonto } from '../geometry/pannelli';
import type { ModoSupporto, PresetProgetto, Venatura } from '../db/types';
import { PRESET_INIZIALE } from '../utils/preset';
import type { AbbondanzaPreset } from '../utils/preset';

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

export function PresetLavoro({
  preset,
  quanteForme,
  onSalva,
  onApplicaTutto,
  onChiudi
}: {
  preset: PresetProgetto | undefined;
  /** quante forme ci sono già nel lavoro, per il comando «applica a tutte» */
  quanteForme: number;
  onSalva: (p: PresetProgetto) => void;
  /** salva e porta TUTTO il preset — abbondanze e teli — su quello che c'è già */
  onApplicaTutto: (p: PresetProgetto) => void;
  onChiudi: () => void;
}) {
  const p0 = preset ?? PRESET_INIZIALE;
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
  const costruito = (): PresetProgetto => ({
    ...abbOra(),
    supporto: sup,
    teli
  });

  const salva = () => {
    onSalva(costruito());
    onChiudi();
  };

  const applicaTutto = () => {
    const p = costruito();
    onSalva(p);
    onApplicaTutto(p);
    onChiudi();
  };

  const numero = (v: number) => (v ? String(v).replace('.', ',') : '');
  const scriviSup = (m: Partial<typeof sup>) => setSup((s) => ({ ...s, ...m }));

  return (
    <Modale titolo="Preset del lavoro" onChiudi={onChiudi}>
      <div className="preset-lavoro">
      <p className="aiuto" style={{ marginTop: 0 }}>
        Da qui partono le cose nuove di questo sopralluogo: l’abbondanza di una forma appena
        disegnata, la divisione in teli, il piano di taglio. Quello che è già disegnato resta
        com’è — finché non tocchi «salva e applica a tutto», qui sotto.
      </p>

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
            <Numero
              etichetta="Fascia della bobina"
              valore={numero(sup.bobina.larghezza)}
              onCambia={(t) => scriviSup({ bobina: { ...sup.bobina, larghezza: analizzaMisura(t) ?? 0 } })}
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
            <Numero
              etichetta="Larghezza della lastra"
              valore={numero(sup.lastra.larghezza)}
              onCambia={(t) => scriviSup({ lastra: { ...sup.lastra, larghezza: analizzaMisura(t) ?? 0 } })}
              suggerito="2500"
            />
            <Numero
              etichetta="Altezza della lastra"
              valore={numero(sup.lastra.altezza)}
              onCambia={(t) => scriviSup({ lastra: { ...sup.lastra, altezza: analizzaMisura(t) ?? 0 } })}
              suggerito="1250"
            />
          </>
        )}
        <Numero
          etichetta="Lama (taglio consumato)"
          valore={numero(sup.lama)}
          onCambia={(t) => scriviSup({ lama: analizzaMisura(t) ?? 0 })}
          suggerito="0"
        />
        <Numero
          etichetta="Margine su tutti i lati"
          valore={numero(sup.margine)}
          onCambia={(t) => scriviSup({ margine: analizzaMisura(t) ?? 0 })}
          suggerito="10"
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
        <Numero
          etichetta="Sormonto fra due teli"
          valore={numero(teli.sormontoMm)}
          onCambia={(t) => setTeli((x) => ({ ...x, sormontoMm: analizzaMisura(t) ?? 0 }))}
          suggerito="10"
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

      {/*
        SALVA, OPPURE SALVA E APPLICA A TUTTO.
        Il preset da solo vale per le cose NUOVE. Su un albergo da cinquanta
        stanze già misurate questo non basta: il lavoro c'è già, ed è lì che
        serve. Il secondo tasto fa quello — e lo dice prima, perché rifà anche
        le divisioni in teli.
      */}
      {quanteForme > 0 && (
        <span className="nota-applica">
          «Applica a tutto» riscrive abbondanze e teli sulle{' '}
          {quanteForme === 1 ? 'forma già disegnata' : `${quanteForme} forme già disegnate`} di
          questo sopralluogo, al posto di quello che avevano: anche le giunzioni spostate a mano si
          rifanno.
        </span>
      )}
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button className="btn" onClick={salva}>
          Salva
        </button>
        <button className="btn primario" disabled={quanteForme === 0} onClick={applicaTutto}>
          <Icona nome="matita" dimensione={18} /> Salva e applica a tutto
        </button>
      </div>
      </div>
    </Modale>
  );
}
