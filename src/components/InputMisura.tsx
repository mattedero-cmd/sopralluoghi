import { useRef } from 'react';
import { analizzaMisura, eCalcolo, formattaNumero, normalizzaMisura } from '../utils/format';

/**
 * IL CAMPO DOVE SI SCRIVE UNA MISURA, CON LA CALCOLATRICE DENTRO.
 *
 * Al banco una misura viene quasi sempre a pezzi — 100 di qua, 124 di là, 113
 * di là ancora — e metterla insieme voleva dire uscire dall'app, cercare la
 * calcolatrice e tornare col totale. Qui il conto si scrive nel campo:
 * «100+124+113» vale 337, il totale si vede mentre si scrive e uscendo dal
 * campo resta scritto il numero.
 *
 * I TASTI «+» E «−» NON SONO UN ORNAMENTO. Sul telefono il campo apre la
 * tastiera numerica, che i segni non ce li ha: senza quei tasti la
 * calcolatrice non si potrebbe nemmeno usare, ed è anche il modo in cui chi
 * non lo sa scopre che c'è. Il meno serve quanto il più: una misura è spesso
 * un tutto a cui si leva qualcosa.
 *
 * Il valore esce come TESTO, non come numero: chi lo riceve lo legge con
 * `analizzaMisura` quando gli serve, e intanto il campo si lascia svuotare,
 * correggere e lasciare a metà senza che nessuno gli rimetta dentro uno zero.
 */
export function InputMisura({
  valore,
  onCambia,
  autoFocus,
  placeholder,
  classe,
  style,
  etichetta,
  inputRef
}: {
  valore: string;
  onCambia: (testo: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  classe?: string;
  style?: React.CSSProperties;
  etichetta?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const mio = useRef<HTMLInputElement>(null);
  const campo = inputRef ?? mio;
  const conto = eCalcolo(valore);
  const totale = conto ? analizzaMisura(valore) : null;

  return (
    <span className="campo-misura" style={style}>
      <input
        ref={campo}
        className={classe}
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={etichetta}
        title="Si può anche scrivere un conto: 100+124+113"
        value={valore}
        onChange={(e) => onCambia(e.target.value)}
        // uscendo dal campo il conto lascia il posto al suo totale
        onBlur={(e) => onCambia(normalizzaMisura(e.target.value))}
      />
      <span className="tasti-conto">
        {(
          [
            ['+', 'Somma un altro pezzo alla misura', 'Somma un altro pezzo: 100+124+113'],
            ['-', 'Togli un pezzo dalla misura', 'Togli un pezzo: 1200-150']
          ] as const
        ).map(([segno, etichettaTasto, spiega]) => (
          <button
            key={segno}
            type="button"
            className="btn tasto-conto"
            aria-label={etichettaTasto}
            title={spiega}
            // un segno dietro l'altro non è un conto: è un dito che scappa
            disabled={valore.trim() === '' || /[+\-*/]$/.test(valore.trim())}
            /*
             * IL TASTO NON DEVE RUBARE IL FUOCO. Toccandolo, il campo lo
             * perderebbe, e uscire dal campo chiude il conto nel suo totale:
             * «337+63» diventerebbe «400» e il pezzo scritto dopo finirebbe
             * in un conto nuovo. Impedendo il comportamento predefinito del
             * mousedown il fuoco resta dov'è, la catena resta scritta per
             * intero e il cursore è già al posto giusto per il pezzo dopo.
             */
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onCambia(`${valore.trim()}${segno}`);
              campo.current?.focus();
            }}
          >
            {segno === '-' ? '\u2212' : segno}
          </button>
        ))}
      </span>
      {conto && (
        <span className="totale-conto" aria-live="polite" title="Totale del conto">
          {totale === null ? '…' : `= ${formattaNumero(totale)}`}
        </span>
      )}
    </span>
  );
}
