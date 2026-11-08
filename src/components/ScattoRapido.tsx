/**
 * LA FOTOCAMERA DEL SOPRALLUOGO: si scatta di fila, senza uscire.
 *
 * Toccando «Scatta» il telefono apre la SUA fotocamera, e ogni foto è un giro
 * completo: otturatore, «Usa foto», l'app che torna, l'importazione. In una
 * camera d'albergo le foto sono sei o otto, e quel giro lo si fa otto volte.
 *
 * Qui il mirino è dentro l'app: si scatta, si scatta, si scatta, e ogni foto
 * entra nel sopralluogo mentre si inquadra la prossima. L'otturatore non
 * aspetta il salvataggio — prendere il fotogramma dal video è immediato, è il
 * ridimensionamento e la ricerca dei volti a prendersi il loro tempo — e
 * quindi gli scatti finiscono in una CODA che si smaltisce da sola. Sotto si
 * vede sempre a che punto è: scattate e salvate.
 *
 * La fotocamera è la stessa delle panoramiche, con gli stessi accorgimenti
 * già pagati: si accende piano e la definizione si alza dopo (chiederla
 * all'accensione fa cadere la scheda su iPhone), gli obiettivi si leggono
 * solo a permesso dato, e un rifiuto si spiega invece di restare uno schermo
 * nero. Qui però l'obiettivo si può cambiare quando si vuole: gli scatti sono
 * foto indipendenti, non pezzi di una stessa figura.
 */

import { useEffect, useRef, useState } from 'react';
import { Icona } from './Icona';
import {
  allaMassimaDefinizione,
  chiediFotocamera,
  obiettiviPosteriori,
  perchéNiente,
  type Obiettivo
} from './Panoramica';

export function ScattoRapido({
  richiesta,
  onScatto,
  onChiudi,
  onRipiego
}: {
  /** la fotocamera già chiesta nel gesto del dito, se si è potuto */
  richiesta: Promise<MediaStream> | null;
  /** salva una foto nel sopralluogo; la coda aspetta che abbia finito */
  onScatto: (blob: Blob) => Promise<void>;
  /** chiude, dicendo quante ne sono entrate */
  onChiudi: (salvate: number) => void;
  /** la fotocamera non si può usare: si passa a quella del telefono */
  onRipiego: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flusso = useRef<MediaStream | null>(null);
  const [pronta, setPronta] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [misura, setMisura] = useState('');
  const [obiettivi, setObiettivi] = useState<Obiettivo[]>([]);
  const [attivo, setAttivo] = useState<string | null>(null);
  const [scattate, setScattate] = useState(0);
  const [salvate, setSalvate] = useState(0);
  const [fallite, setFallite] = useState(0);
  const [lampo, setLampo] = useState(false);
  const [miniature, setMiniature] = useState<string[]>([]);
  const [chiudendo, setChiudendo] = useState(false);

  /** gli scatti ancora da salvare, in ordine */
  const coda = useRef<Blob[]>([]);
  const smaltendo = useRef(false);
  const miniRef = useRef<string[]>([]);
  miniRef.current = miniature;
  /** le salvate lette da dentro `fine`: lo stato di React lì sarebbe vecchio */
  const salvateRef = useRef(0);
  salvateRef.current = salvate;

  const mostraMisura = (s: MediaStream) => {
    const g = s.getVideoTracks()[0]?.getSettings();
    if (g?.width && g?.height) setMisura(`${g.width}×${g.height}`);
    if (g?.deviceId) setAttivo(g.deviceId);
  };

  const attacca = async (s: MediaStream) => {
    for (const t of flusso.current?.getTracks() ?? []) t.stop();
    flusso.current = s;
    if (video.current) {
      video.current.srcObject = s;
      await video.current.play().catch(() => {});
    }
    mostraMisura(s);
    setErrore(null);
    setPronta(true);
    setObiettivi(await obiettiviPosteriori());
    // la definizione piena si chiede solo adesso, a preview in piedi
    await allaMassimaDefinizione(s);
    if (flusso.current !== s) return;
    mostraMisura(s);
  };

  const cambiaObiettivo = async (deviceId: string) => {
    if (deviceId === attivo) return;
    setPronta(false);
    try {
      await attacca(await chiediFotocamera(deviceId));
    } catch (e) {
      setErrore(perchéNiente(e));
    }
  };

  /** RIPROVA col dito ancora sul vetro: è quello che iOS vuole */
  const riprova = async () => {
    try {
      await attacca(await chiediFotocamera());
    } catch (e) {
      setErrore(perchéNiente(e));
    }
  };

  useEffect(() => {
    let vivo = true;
    if (!richiesta) {
      setErrore(perchéNiente(new Error('senza-fotocamera')));
      return;
    }
    richiesta
      .then((s) => {
        if (!vivo) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        void attacca(s);
      })
      .catch((e) => {
        if (vivo) setErrore(perchéNiente(e));
      });
    return () => {
      vivo = false;
      for (const t of flusso.current?.getTracks() ?? []) t.stop();
      for (const u of miniRef.current) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richiesta]);

  /**
   * Smaltisce la coda una foto per volta, finché ce n'è.
   *
   * Lo scatto che non riesce si conta e si va avanti: fermare la coda al
   * primo intoppo vorrebbe dire perdere anche le foto dietro, che non hanno
   * colpa — e lasciare «Fine» ad aspettare una coda che non si svuota più.
   */
  const smaltisci = async () => {
    if (smaltendo.current) return;
    smaltendo.current = true;
    try {
      for (;;) {
        const b = coda.current.shift();
        if (!b) break;
        try {
          await onScatto(b);
          setSalvate((n) => n + 1);
        } catch {
          setFallite((n) => n + 1);
        }
      }
    } finally {
      smaltendo.current = false;
    }
  };

  const scatta = () => {
    const v = video.current;
    if (!v || !v.videoWidth || !pronta || errore) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    setLampo(true);
    window.setTimeout(() => setLampo(false), 130);
    canvas.toBlob(
      (b) => {
        if (!b) return;
        setScattate((n) => n + 1);
        // l'ultima manciata basta: la striscia serve a dire «è entrata»,
        // non a rivedere il sopralluogo
        setMiniature((m) => {
          const nuove = [...m, URL.createObjectURL(b)];
          while (nuove.length > 8) URL.revokeObjectURL(nuove.shift()!);
          return nuove;
        });
        coda.current.push(b);
        void smaltisci();
      },
      'image/jpeg',
      0.94
    );
  };

  /**
   * Chiude, ma prima lascia finire la coda: una foto persa non torna.
   *
   * L'attesa però ha un limite. Se per qualche ragione il salvataggio non
   * finisse più, un mirino che non si chiude sarebbe peggio del problema:
   * dopo due minuti si esce lo stesso, dicendo quante ne sono entrate
   * davvero.
   */
  const fine = async () => {
    setChiudendo(true);
    const scade = Date.now() + 120_000;
    while ((smaltendo.current || coda.current.length > 0) && Date.now() < scade) {
      await new Promise((r) => window.setTimeout(r, 120));
    }
    setChiudendo(false);
    onChiudi(salvateRef.current);
  };

  const inCoda = scattate - salvate - fallite;

  /** la riga sotto i comandi: dice sempre a che punto è il salvataggio */
  const statoDelLavoro = () => {
    const perse = fallite > 0 ? ` · ${fallite} non ${fallite === 1 ? 'salvata' : 'salvate'}` : '';
    if (chiudendo) {
      return inCoda > 0
        ? `Aspetto: ${inCoda} ${inCoda === 1 ? 'foto ancora da salvare' : 'foto ancora da salvare'}…`
        : 'Chiudo…';
    }
    if (inCoda > 0) {
      return `${salvate} ${salvate === 1 ? 'salvata' : 'salvate'} · ${inCoda} in salvataggio…${perse}`;
    }
    if (scattate > 0) {
      return (
        `${salvate} ${salvate === 1 ? 'foto salvata' : 'foto salvate'}` +
        perse +
        (misura ? ` · ${misura} px` : '')
      );
    }
    return misura ? `Scatti da ${misura} px` : '';
  };

  return (
    <div className="pano-schermo">
      <div className="pano-mirino">
        <video ref={video} playsInline muted autoPlay />
        {errore && (
          <div className="pano-errore">
            <p>{errore}</p>
            <div className="riga-pulsanti" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="btn primario" onClick={() => void riprova()}>
                <Icona nome="fotocamera" dimensione={18} /> Riprova
              </button>
              <button className="btn" onClick={onRipiego}>
                <Icona nome="immagine" dimensione={18} /> Fotocamera del telefono
              </button>
            </div>
          </div>
        )}
        {!errore && !pronta && <div className="pano-errore">Accendo la fotocamera…</div>}
        {lampo && <div className="pano-lampo" />}
        {/*
          LA VIA D'USCITA VERSO LA FOTOCAMERA DEL TELEFONO.
          Il mirino qui dentro prende il fotogramma dal flusso video: pronto
          e senza giri, ma senza l'elaborazione che l'app Fotocamera fa sua.
          In una stanza buia quella differenza si vede, e allora si esce di
          qui per quello scatto — senza dover rinunciare al permesso.
        */}
        {!errore && (
          <button className="pano-rullino scatto-ripiego" onClick={onRipiego}>
            <Icona nome="fotocamera" dimensione={17} /> Fotocamera del telefono
          </button>
        )}
        {obiettivi.length > 1 && !errore && (
          <div className="pano-obiettivi">
            {obiettivi.map((o) => (
              <button
                key={o.deviceId}
                className={`pano-obiettivo${o.deviceId === attivo ? ' attivo' : ''}`}
                title={o.etichetta}
                onClick={() => void cambiaObiettivo(o.deviceId)}
              >
                {o.segno}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pano-striscia">
        {miniature.length === 0 ? (
          <span className="aiuto">
            Ogni scatto entra nel sopralluogo mentre inquadri il prossimo: non devi uscire e
            rientrare. Le misure si prendono dopo, toccando la foto.
          </span>
        ) : (
          miniature.map((u, i) => (
            <img
              key={u}
              src={u}
              alt={`Scatto ${scattate - miniature.length + i + 1}`}
              className="pano-mini"
            />
          ))
        )}
      </div>

      <div className="pano-comandi">
        <button className="btn" onClick={() => void fine()} disabled={chiudendo}>
          {scattate === 0 ? 'Annulla' : 'Chiudi'}
        </button>
        <button
          className="pano-otturatore"
          onClick={scatta}
          disabled={!pronta || !!errore || chiudendo}
          aria-label="Scatta"
        >
          <span />
        </button>
        <button className="btn primario" onClick={() => void fine()} disabled={chiudendo}>
          {chiudendo ? 'Salvo…' : `Fine (${scattate})`}
        </button>
      </div>
      <div className="pano-misura">{statoDelLavoro()}</div>
    </div>
  );
}
