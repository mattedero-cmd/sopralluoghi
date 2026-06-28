import { useEffect, useRef, useState } from 'react';
import { Modale } from './comuni';
import { leggiImpostazioni } from '../db/repository';
import { sincronizza } from '../cloud/sincronizzazione';
import { modificheInSospeso } from '../cloud/promemoria';
import { mostraToast } from '../state/toast';

/**
 * Promemoria di fine sessione. Un browser non può mostrare nulla mentre la
 * pagina è chiusa, quindi il promemoria appare alla PRIMA occasione utile dopo
 * la fine di una sessione: alla riapertura dell'app, o quando torna in primo
 * piano dopo essere stata in background per un po'. Compare solo se si è
 * connessi al cloud e ci sono modifiche non ancora sincronizzate, e offre la
 * scorciatoia diretta alla sincronizzazione forzata.
 */

// solo dopo una pausa "vera" in background, per non insistere a ogni cambio app
const SOGLIA_BACKGROUND_MS = 60_000;

export function PromemoriaSync() {
  const [visibile, setVisibile] = useState(false);
  const [operazione, setOperazione] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const giaMostrato = useRef(false); // evita di riproporlo nella stessa sessione in primo piano
  const nascostoDa = useRef<number | null>(null);

  useEffect(() => {
    let vivo = true;
    const forseMostra = async () => {
      if (giaMostrato.current || !modificheInSospeso()) return;
      try {
        const imp = await leggiImpostazioni();
        if (vivo && imp.cloud?.refreshToken) {
          giaMostrato.current = true;
          setVisibile(true);
        }
      } catch {
        /* impostazioni non leggibili: nessun promemoria */
      }
    };
    const suVisibilita = () => {
      if (document.visibilityState === 'hidden') {
        nascostoDa.current = Date.now();
        giaMostrato.current = false; // al ritorno è una nuova sessione
      } else {
        const da = nascostoDa.current;
        nascostoDa.current = null;
        if (da != null && Date.now() - da >= SOGLIA_BACKGROUND_MS) void forseMostra();
      }
    };
    document.addEventListener('visibilitychange', suVisibilita);
    // avvio a freddo: la sessione precedente è finita con modifiche non sincronizzate?
    const t = setTimeout(() => void forseMostra(), 1500);
    return () => {
      vivo = false;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', suVisibilita);
    };
  }, []);

  const sincronizzaOra = async () => {
    setOperazione('Sincronizzazione in corso…');
    setProgresso(0);
    try {
      const r = await sincronizza((msg, fr) => {
        setOperazione(msg);
        setProgresso(fr ?? null);
      });
      mostraToast(
        'successo',
        `Sincronizzato. Scaricate ${r.scaricate} foto, caricate ${r.caricate}.`
      );
      setVisibile(false);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Sincronizzazione non riuscita.');
    } finally {
      setOperazione(null);
      setProgresso(null);
    }
  };

  if (!visibile) return null;
  return (
    <Modale titolo="Modifiche non sincronizzate" onChiudi={() => setVisibile(false)} centro>
      <p style={{ color: 'var(--testo-2)' }}>
        Hai lavorato senza sincronizzare. Vuoi allineare ora i dati sul cloud, così li ritrovi
        aggiornati sugli altri dispositivi?
      </p>
      {operazione && (
        <div style={{ margin: '10px 0' }}>
          <p style={{ color: 'var(--testo-2)', margin: '0 0 6px' }}>
            {operazione}
            {progresso != null ? ` ${Math.round(progresso * 100)}%` : ''}
          </p>
          {progresso != null && (
            <div className="barra-avanzamento">
              <div className="riempimento" style={{ width: `${Math.round(progresso * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      <div className="riga-pulsanti">
        <button className="btn" disabled={operazione !== null} onClick={() => setVisibile(false)}>
          Più tardi
        </button>
        <button className="btn primario" disabled={operazione !== null} onClick={() => void sincronizzaOra()}>
          🔄 Sincronizza adesso
        </button>
      </div>
    </Modale>
  );
}
