import { useEffect, useRef, useState } from 'react';
import type { ID, Porta } from '../db/types';
import { leggiPorta, salvaPorta } from '../db/repository';
import { contestoPorte } from '../utils/porteDocumento';
import { ModaleAnteprimaPdf } from './ModaleAnteprimaPdf';
import { Modale } from './comuni';
import { Icona } from './Icona';
import type { RiepilogoStrisce } from '../utils/portePiano';

/**
 * IL RILIEVO PORTA DENTRO L'APP.
 *
 * Il rilievo porta è un'app a sé (prototipi/rilievo-porta, servita come
 * /rilievo-porta.html): qui la si apre a tutto schermo in un riquadro e le si
 * parla per messaggi. All'apertura riceve le porte del progetto (con quante
 * ce ne sono, per il piano delle bobine nel PDF di montaggio); quando l'utente
 * tocca «Salva porta» consegna configurazione e pezzi, e la porta si salva nel
 * progetto. Il PDF di montaggio torna come file e si apre nell'anteprima.
 *
 * - `nuova`: guida dall'inizio;
 * - `scheda`: la parte finale (le quattro viste, modifica veloce e avanzata);
 * - `copia`: la porta richiamata si duplica e si apre in modifica veloce.
 */
export type ModoRilievo = 'nuova' | 'scheda' | 'copia' | 'lavoro';

/**
 * `lavoro`: il piano delle strisce delle porte, dentro il piano di taglio. Si
 * passano le porte da tagliare a strisce e le scelte salvate; ogni modifica
 * torna con `onPiano` (scelte + riepilogo per il PDF).
 */
export interface OpzioniLavoro {
  portaIds: ID[];
  piano?: Record<string, unknown>;
  onPiano: (piano: Record<string, unknown>, riepilogo: RiepilogoStrisce | null) => void;
}

export function RilievoPorta({
  progettoId,
  modo,
  portaId,
  fotoId,
  onSalvata,
  onChiudi,
  lavoro,
  materialeId
}: {
  progettoId: ID;
  /** il materiale della porta nuova; una copia, senza, tiene quello della porta di partenza */
  materialeId?: ID;
  modo: ModoRilievo;
  portaId?: ID;
  /** foto da cui si rileva (diventa la foto del rilievo della porta nuova) */
  fotoId?: ID;
  /** `nuova` vero se la porta è stata creata adesso (e non aggiornata) */
  onSalvata?: (porta: Porta, nuova: boolean) => void;
  onChiudi: () => void;
  lavoro?: OpzioniLavoro;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [pdf, setPdf] = useState<{ blob: Blob; nome: string } | null>(null);
  const [chiedi, setChiedi] = useState(false);
  const [titolo, setTitolo] = useState('Rilievo porta');
  // la porta di questa apertura: dopo il primo salvataggio, aggiornarla
  const corrente = useRef<ID | null>(modo === 'scheda' ? portaId ?? null : null);
  const callback = useRef({ onSalvata, onChiudi, lavoro, materialeId });
  callback.current = { onSalvata, onChiudi, lavoro, materialeId };

  useEffect(() => {
    const manda = (msg: Record<string, unknown>) =>
      frame.current?.contentWindow?.postMessage(
        { destinazione: 'rilievo-porta', ...msg },
        window.location.origin
      );
    // porte, quantità, kit o strisce e scelte del piano di taglio: il PDF di
    // montaggio aperto da qui dice gli stessi rotoli del piano di taglio
    const elenco = async () => {
      const ctx = await contestoPorte(progettoId);
      return {
        porte: ctx.porte,
        piano: ctx.sezione?.piano ?? null,
        perIframe: ctx.perRilievo.map((p) => ({ ...p, qty: Math.max(1, p.qty) }))
      };
    };
    const ascolta = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.source !== frame.current?.contentWindow) return;
      const m = ev.data as { sorgente?: string; tipo?: string; [k: string]: unknown };
      if (!m || m.sorgente !== 'rilievo-porta') return;
      if (m.tipo === 'pronta') {
        const { porte, perIframe, piano } = await elenco();
        const p = porte.find((x) => x.id === portaId);
        if (modo === 'lavoro') {
          const l = callback.current.lavoro;
          setTitolo('Porte a strisce · bobine');
          manda({
            tipo: 'apri',
            modo,
            porte: perIframe.filter((x) => l?.portaIds.includes(x.id)),
            piano: l?.piano ?? null
          });
          return;
        }
        setTitolo(
          modo === 'scheda' && p ? p.nome : modo === 'copia' && p ? `Copia di ${p.nome}` : 'Rilievo porta'
        );
        manda({ tipo: 'apri', modo, id: portaId ?? null, porte: perIframe, piano });
      } else if (m.tipo === 'salva') {
        const id = (corrente.current ?? null) as ID | null;
        // una copia («Simile») resta nella famiglia della porta di partenza
        const origine = !id && modo === 'copia' && portaId ? await leggiPorta(portaId) : undefined;
        const porta = await salvaPorta({
          famiglia: origine ? (origine.famiglia ?? origine.id) : undefined,
          firma: typeof m.firma === 'string' ? m.firma : undefined,
          id,
          progettoId,
          descrizione: String(m.descrizione ?? ''),
          config: m.config,
          righe: (m.righe as Porta['righe']) ?? [],
          fotoRilievoId: fotoId ?? null,
          materialeId: callback.current.materialeId ?? origine?.materialeId
        });
        const nuova = !id;
        corrente.current = porta.id;
        setTitolo(porta.nome);
        const { perIframe } = await elenco();
        manda({ tipo: 'salvata', id: porta.id, nome: porta.nome, porte: perIframe });
        callback.current.onSalvata?.(porta, nuova);
      } else if (m.tipo === 'piano' && m.piano && typeof m.piano === 'object') {
        callback.current.lavoro?.onPiano(
          m.piano as Record<string, unknown>,
          (m.riepilogo as RiepilogoStrisce | null) ?? null
        );
      } else if (m.tipo === 'file' && m.blob instanceof Blob) {
        setPdf({ blob: m.blob, nome: String(m.nome ?? 'Istruzioni montaggio').replace(/\.pdf$/i, '') });
      } else if (m.tipo === 'stato') {
        if (m.modificata) setChiedi(true);
        else callback.current.onChiudi();
      }
    };
    window.addEventListener('message', ascolta);
    return () => window.removeEventListener('message', ascolta);
  }, [progettoId, modo, portaId, fotoId]);

  const chiudi = () => {
    const w = frame.current?.contentWindow;
    // il piano delle strisce si salva a ogni modifica: si esce e basta
    if (!w || modo === 'lavoro') return onChiudi();
    w.postMessage({ destinazione: 'rilievo-porta', tipo: 'stato' }, window.location.origin);
  };

  return (
    <div className="rilievo-porta" role="dialog" aria-label={titolo}>
      <div className="rilievo-porta-barra">
        <strong>{titolo}</strong>
        <button className="btn" onClick={chiudi} aria-label="Chiudi il rilievo porta">
          <Icona nome="chiudi" dimensione={18} /> Chiudi
        </button>
      </div>
      <iframe ref={frame} src="/rilievo-porta.html?ospite" title="Rilievo porta" />
      {chiedi && (
        <Modale titolo="Uscire senza salvare?" onChiudi={() => setChiedi(false)} centro>
          <p>La porta ha modifiche non salvate. Uscendo si perdono.</p>
          <div className="riga-pulsanti">
            <button className="btn" onClick={() => setChiedi(false)}>
              Resta
            </button>
            <button className="btn pericolo" onClick={onChiudi}>
              Esci senza salvare
            </button>
          </div>
        </Modale>
      )}
      {pdf && (
        <ModaleAnteprimaPdf
          blob={pdf.blob}
          titolo={pdf.nome}
          nomeFile={pdf.nome}
          onChiudi={() => setPdf(null)}
        />
      )}
    </div>
  );
}
