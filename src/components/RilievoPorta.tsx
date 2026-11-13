import { useEffect, useRef, useState } from 'react';
import type { ID, Porta } from '../db/types';
import { contaPorte, portePerProgetto, salvaPorta } from '../db/repository';
import { ModaleAnteprimaPdf } from './ModaleAnteprimaPdf';
import { Modale } from './comuni';
import { Icona } from './Icona';

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
export type ModoRilievo = 'nuova' | 'scheda' | 'copia';

export function RilievoPorta({
  progettoId,
  modo,
  portaId,
  fotoId,
  onSalvata,
  onChiudi
}: {
  progettoId: ID;
  modo: ModoRilievo;
  portaId?: ID;
  /** foto da cui si rileva (diventa la foto del rilievo della porta nuova) */
  fotoId?: ID;
  /** `nuova` vero se la porta è stata creata adesso (e non aggiornata) */
  onSalvata: (porta: Porta, nuova: boolean) => void;
  onChiudi: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [pdf, setPdf] = useState<{ blob: Blob; nome: string } | null>(null);
  const [chiedi, setChiedi] = useState(false);
  const [titolo, setTitolo] = useState('Rilievo porta');
  // la porta di questa apertura: dopo il primo salvataggio, aggiornarla
  const corrente = useRef<ID | null>(modo === 'scheda' ? portaId ?? null : null);
  const callback = useRef({ onSalvata, onChiudi });
  callback.current = { onSalvata, onChiudi };

  useEffect(() => {
    const manda = (msg: Record<string, unknown>) =>
      frame.current?.contentWindow?.postMessage(
        { destinazione: 'rilievo-porta', ...msg },
        window.location.origin
      );
    const elenco = async () => {
      const [porte, conto] = await Promise.all([portePerProgetto(progettoId), contaPorte(progettoId)]);
      return {
        porte,
        perIframe: porte.map((p) => ({
          id: p.id,
          nome: p.nome,
          qty: conto.get(p.id) ?? 1,
          config: p.config,
          descrizione: p.descrizione,
          righe: p.righe
        }))
      };
    };
    const ascolta = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.source !== frame.current?.contentWindow) return;
      const m = ev.data as { sorgente?: string; tipo?: string; [k: string]: unknown };
      if (!m || m.sorgente !== 'rilievo-porta') return;
      if (m.tipo === 'pronta') {
        const { porte, perIframe } = await elenco();
        const p = porte.find((x) => x.id === portaId);
        setTitolo(
          modo === 'scheda' && p ? p.nome : modo === 'copia' && p ? `Copia di ${p.nome}` : 'Rilievo porta'
        );
        manda({ tipo: 'apri', modo, id: portaId ?? null, porte: perIframe });
      } else if (m.tipo === 'salva') {
        const id = (corrente.current ?? null) as ID | null;
        const porta = await salvaPorta({
          id,
          progettoId,
          descrizione: String(m.descrizione ?? ''),
          config: m.config,
          righe: (m.righe as Porta['righe']) ?? [],
          fotoRilievoId: fotoId ?? null
        });
        const nuova = !id;
        corrente.current = porta.id;
        setTitolo(porta.nome);
        const { perIframe } = await elenco();
        manda({ tipo: 'salvata', id: porta.id, nome: porta.nome, porte: perIframe });
        callback.current.onSalvata(porta, nuova);
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
    if (!w) return onChiudi();
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
