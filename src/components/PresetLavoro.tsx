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
import { InputMisura } from './InputMisura';
import { FASCE_BOBINA } from '../utils/documentoNesting';
import { analizzaMisura, formattaNumero } from '../utils/format';
import type { AssePannelli, VersoSormonto } from '../geometry/pannelli';
import type { ModoSupporto, PresetProgetto, Venatura } from '../db/types';
import { PRESET_INIZIALE } from '../utils/preset';

export function PresetLavoro({
  preset,
  quanteForme,
  onSalva,
  onApplicaAbbondanza,
  onChiudi
}: {
  preset: PresetProgetto | undefined;
  /** quante forme ci sono già nel lavoro, per il comando «applica a tutte» */
  quanteForme: number;
  onSalva: (p: PresetProgetto) => void;
  /** scrive l'abbondanza del preset su tutte le forme già disegnate */
  onApplicaAbbondanza: (mm: number) => void;
  onChiudi: () => void;
}) {
  const p0 = preset ?? PRESET_INIZIALE;
  const [abb, setAbb] = useState(
    p0.abbPerimetroMm ? String(p0.abbPerimetroMm / 10).replace('.', ',') : ''
  );
  const [sup, setSup] = useState(p0.supporto ?? PRESET_INIZIALE.supporto);
  const [teli, setTeli] = useState(p0.teli ?? PRESET_INIZIALE.teli);

  const abbMm = Math.max(0, (analizzaMisura(abb) ?? 0) * 10);
  const costruito = (): PresetProgetto => ({
    abbPerimetroMm: abbMm || undefined,
    supporto: sup,
    teli
  });

  const salva = () => {
    onSalva(costruito());
    onChiudi();
  };

  const numero = (v: number) => (v ? String(v).replace('.', ',') : '');
  const scriviSup = (m: Partial<typeof sup>) => setSup((s) => ({ ...s, ...m }));

  return (
    <Modale titolo="Preset del lavoro" onChiudi={onChiudi}>
      <p className="aiuto" style={{ marginTop: 0 }}>
        Da qui partono le cose nuove di questo sopralluogo: l’abbondanza di una forma appena
        disegnata, la divisione in teli, il piano di taglio. Quello che è già fatto non si tocca.
      </p>

      <div className="campo">
        <label>Abbondanza attorno alle forme nuove</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <InputMisura
            valore={abb}
            onCambia={setAbb}
            etichetta="Abbondanza del preset"
            placeholder="0"
            style={{ flex: '1 1 150px', maxWidth: 200 }}
          />
          <span style={{ color: 'var(--testo-2)', fontSize: 13 }}>cm su ogni lato</span>
        </div>
        <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
          La stessa che scriveresti a mano nella forma, sotto «abbondanza perimetrale». Un lato
          che ne vuole una sua la dichiara da solo, e il preset non gliela tocca.
        </span>
      </div>

      <div className="campo">
        <label>Supporto da cui si taglia</label>
        <span className="segmenti" role="group" aria-label="Supporto">
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              <InputMisura
                valore={numero(sup.bobina.larghezza)}
                onCambia={(t) =>
                  scriviSup({ bobina: { ...sup.bobina, larghezza: analizzaMisura(t) ?? 0 } })
                }
                etichetta="Fascia della bobina in mm"
                placeholder="1370"
                style={{ flex: '0 0 130px' }}
              />
              <span style={{ color: 'var(--testo-2)', fontSize: 13 }}>mm di fascia</span>
            </div>
            <div className="riga-pulsanti" style={{ marginTop: 8 }}>
              {FASCE_BOBINA.map((f) => (
                <button
                  key={f}
                  className={`btn piccolo${sup.bobina.larghezza === f ? ' attivo' : ''}`}
                  onClick={() => scriviSup({ bobina: { ...sup.bobina, larghezza: f } })}
                >
                  {f}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <InputMisura
              valore={numero(sup.lastra.larghezza)}
              onCambia={(t) => scriviSup({ lastra: { ...sup.lastra, larghezza: analizzaMisura(t) ?? 0 } })}
              etichetta="Larghezza della lastra in mm"
              placeholder="2500"
              style={{ flex: '0 0 120px' }}
            />
            <span style={{ color: 'var(--testo-2)' }}>×</span>
            <InputMisura
              valore={numero(sup.lastra.altezza)}
              onCambia={(t) => scriviSup({ lastra: { ...sup.lastra, altezza: analizzaMisura(t) ?? 0 } })}
              etichetta="Altezza della lastra in mm"
              placeholder="1250"
              style={{ flex: '0 0 120px' }}
            />
            <span style={{ color: 'var(--testo-2)', fontSize: 13 }}>mm</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ color: 'var(--testo-2)', fontSize: 13, minWidth: 54 }}>Lama</span>
          <InputMisura
            valore={numero(sup.lama)}
            onCambia={(t) => scriviSup({ lama: analizzaMisura(t) ?? 0 })}
            etichetta="Lama in mm"
            placeholder="0"
            style={{ flex: '0 0 92px' }}
          />
          <span style={{ color: 'var(--testo-2)', fontSize: 13, minWidth: 62 }}>Margine</span>
          <InputMisura
            valore={numero(sup.margine)}
            onCambia={(t) => scriviSup({ margine: analizzaMisura(t) ?? 0 })}
            etichetta="Margine in mm"
            placeholder="10"
            style={{ flex: '0 0 92px' }}
          />
          <span style={{ color: 'var(--testo-2)', fontSize: 13 }}>mm</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ color: 'var(--testo-2)', fontSize: 13 }}>Venatura</span>
          <span className="segmenti" role="group" aria-label="Venatura">
            {(
              [
                ['nessuna', 'Nessuna'],
                ['orizzontale', '↔'],
                ['verticale', '↕']
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
                ['verticale', '↕ Verticali'],
                ['orizzontale', '↔ Orizzontali']
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ color: 'var(--testo-2)', fontSize: 13, minWidth: 68 }}>Sormonto</span>
          <InputMisura
            valore={numero(teli.sormontoMm)}
            onCambia={(t) => setTeli((x) => ({ ...x, sormontoMm: analizzaMisura(t) ?? 0 }))}
            etichetta="Sormonto in mm"
            placeholder="10"
            style={{ flex: '0 0 92px' }}
          />
          <span style={{ color: 'var(--testo-2)', fontSize: 13 }}>mm</span>
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
          divide in parti uguali. Vale per le divisioni NUOVE: una parete già divisa coi giunti
          spostati a mano resta com’è.
        </span>
      </div>

      {quanteForme > 0 && abbMm > 0 && (
        <div className="campo">
          <label>Quello che è già disegnato</label>
          <button className="btn" onClick={() => onApplicaAbbondanza(abbMm)}>
            <Icona nome="matita" dimensione={18} /> Applica l’abbondanza alle{' '}
            {quanteForme === 1 ? 'forma già fatta' : `${quanteForme} forme già fatte`}
          </button>
          <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
            Scrive {formattaNumero(abbMm / 10)} cm attorno a tutte, comprese quelle a cui avevi già
            messo un valore diverso. I teli non si rifanno: quelli restano come li hai messi.
          </span>
        </div>
      )}

      <div className="azioni">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button className="btn primario" onClick={salva}>
          Salva il preset
        </button>
      </div>
    </Modale>
  );
}
