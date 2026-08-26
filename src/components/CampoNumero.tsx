import { useEffect, useState } from 'react';

/**
 * Campo numerico che si lascia MODIFICARE davvero.
 *
 * Un campo controllato che rinormalizza a ogni battuta impedisce di cancellare
 * l'ultima cifra: svuotandolo il valore tornerebbe subito al minimo. Qui il
 * testo digitato vive per conto suo, il valore esce solo quando è valido e la
 * normalizzazione avviene all'uscita dal campo.
 */
export function CampoNumero({
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
        // entrare e uscire da un campo senza toccarlo non è una modifica: chi
        // ascolta può fare cose serie — ridistribuire dei teli, per dire — e
        // non deve farle per un dito appoggiato di passaggio
        if (v !== valore) onCambia(v);
        setTesto(String(v));
      }}
    />
  );
}
