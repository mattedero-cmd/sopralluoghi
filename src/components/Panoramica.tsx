/**
 * LA PANORAMICA, DALLO SCATTO ALLA FOTO.
 *
 * Tutto in una schermata sola, senza passare per la galleria del telefono:
 * si apre la fotocamera, si scatta quello che serve, si sceglie cosa tenere,
 * l'app cuce, e alla fine si ritaglia. Gli scatti non passano mai
 * dall'archivio: quelli che non si tengono non sono mai esistiti.
 */

import { useEffect, useRef, useState } from 'react';
import { Icona } from './Icona';
import { cuciPanoramica, CucituraFallita, raddrizza, riquadroPieno } from '../utils/cucitura';
import type { Punto } from '../db/types';
import {
  maniglieDeiLatiQuad,
  quadConLato,
  quadConVertice,
  type Lato,
  type Quad
} from '../geometry/ritaglio';
import { mostraToast } from '../state/toast';

interface Presa {
  blob: Blob;
  url: string;
  larghezza: number;
  altezza: number;
  tenuta: boolean;
}

type Fase = 'camera' | 'scelta' | 'lavoro' | 'ritaglio';

/**
 * ACCENDE LA FOTOCAMERA, e va chiamata DENTRO il gesto del dito.
 *
 * Su iPhone il permesso si chiede solo mentre l'attivazione dell'utente è
 * ancora valida: partendo da un effetto di React — che gira dopo che la
 * schermata è stata disegnata — il permesso risulta negato senza che nessuno
 * abbia chiesto niente. Per questo la richiesta parte dal `onClick` del
 * pulsante e la promessa viene passata di qua.
 */
export interface Obiettivo {
  deviceId: string;
  /** come si chiama sul telefono */
  etichetta: string;
  /** il numerino da mostrare: 0.5×, 1×, 2×… */
  segno: string;
  /** per metterli in ordine dal più largo al più stretto */
  ordine: number;
}

/**
 * GLI OBIETTIVI POSTERIORI del telefono, con il loro numerino.
 *
 * Le etichette le scrive il sistema, nella lingua del telefono: si riconosce
 * l'ultra-grandangolo e il teleobiettivo dalle parole, e tutto il resto è il
 * grandangolo normale. Se il sistema non dà nomi — capita finché non si è
 * concesso il permesso — non c'è niente da scegliere e non si mostra nulla.
 */
export async function obiettiviPosteriori(): Promise<Obiettivo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const tutti = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const video = tutti.filter((d) => d.kind === 'videoinput' && d.label);
  const davanti = /front|frontale|anteriore|face|selfie/i;
  const dietro = video.filter((d) => !davanti.test(d.label));
  const scelti = (dietro.length > 0 ? dietro : video).map((d) => {
    const l = d.label.toLowerCase();
    if (/ultra/.test(l)) return { d, segno: '0,5×', ordine: 0 };
    if (/tele/.test(l)) return { d, segno: '2×', ordine: 2 };
    return { d, segno: '1×', ordine: 1 };
  });
  // un solo obiettivo non è una scelta: non si mostra la fila
  if (scelti.length < 2) return [];
  return scelti
    .sort((a, b) => a.ordine - b.ordine)
    .map((x) => ({
      deviceId: x.d.deviceId,
      etichetta: x.d.label,
      segno: x.segno,
      ordine: x.ordine
    }));
}

export function chiediFotocamera(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('senza-fotocamera'));
  }
  // si chiede il massimo che la fotocamera sa dare: una panoramica serve a
  // vedere PIÙ dettaglio, non meno, e partire da un video sgranato
  // vanificherebbe tutto
  return navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 4096 }, height: { ideal: 3072 } }
      : {
          facingMode: { ideal: 'environment' },
          width: { ideal: 4096 },
          height: { ideal: 3072 }
        },
    audio: false
  });
}

/** Il perché di un rifiuto, detto in modo che si possa rimediare. */
export function perchéNiente(e: unknown): string {
  const nome = e instanceof DOMException ? e.name : e instanceof Error ? e.message : '';
  if (nome === 'senza-fotocamera') {
    return 'Questo browser non dà accesso alla fotocamera. Serve una connessione sicura (https) e un browser recente.';
  }
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'Permesso della fotocamera negato. Su iPhone: tocca «aA» nella barra dell’indirizzo → Impostazioni sito web → Fotocamera → Consenti. Se hai aggiunto l’app alla schermata Home, il permesso si chiede una volta sola: togli l’icona e riaggiungila.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
    return 'Nessuna fotocamera trovata su questo dispositivo.';
  }
  if (nome === 'NotReadableError' || nome === 'AbortError') {
    return 'La fotocamera è occupata da un’altra app: chiudila e riprova.';
  }
  return 'Fotocamera non disponibile.';
}

export function Panoramica({
  richiesta,
  onFatta,
  onChiudi
}: {
  /** la fotocamera già chiesta nel gesto del dito, se si è potuto */
  richiesta: Promise<MediaStream> | null;
  /** la panoramica finita: si salva fuori di qui */
  onFatta: (blob: Blob, scatti: number, larghezza: number, altezza: number) => Promise<void>;
  onChiudi: () => void;
}) {
  const [fase, setFase] = useState<Fase>('camera');
  const [prese, setPrese] = useState<Presa[]>([]);
  const [lavoro, setLavoro] = useState({ quota: 0, cosa: '' });
  const [cucita, setCucita] = useState<{
    url: string;
    w: number;
    h: number;
    scatti: number;
    copertura: { dati: Uint8ClampedArray; larghezza: number; altezza: number } | null;
  } | null>(null);
  const preseRef = useRef<Presa[]>([]);
  preseRef.current = prese;

  // gli oggetti URL vanno liberati, o restano in memoria per tutta la sessione
  useEffect(
    () => () => {
      for (const p of preseRef.current) URL.revokeObjectURL(p.url);
    },
    []
  );

  const scelte = prese.filter((p) => p.tenuta);

  const cuci = async () => {
    if (scelte.length < 2) {
      mostraToast('info', 'Servono almeno due scatti per una panoramica.');
      return;
    }
    setFase('lavoro');
    try {
      const esito = await cuciPanoramica(
        scelte.map((s) => s.blob),
        { avanzamento: (quota, cosa) => setLavoro({ quota, cosa }) }
      );
      setCucita({
        url: URL.createObjectURL(esito.blob),
        w: esito.larghezza,
        h: esito.altezza,
        scatti: esito.scatti,
        copertura: esito.copertura
      });
      mostraToast(
        'successo',
        `Cucita: ${esito.larghezza}×${esito.altezza} px, giunzioni entro ` +
          `${Math.max(...esito.errori).toFixed(1)} px.`
      );
      setFase('ritaglio');
    } catch (e) {
      mostraToast(
        'errore',
        e instanceof CucituraFallita || e instanceof Error ? e.message : 'Panoramica non riuscita.'
      );
      setFase('scelta');
    }
  };

  return (
    <div className="pano-schermo">
      {fase === 'camera' && (
        <Fotocamera
          richiesta={richiesta}
          prese={prese}
          onScatto={(p) => setPrese((v) => [...v, p])}
          onFine={() => setFase(prese.length >= 2 ? 'scelta' : 'camera')}
          onAnnulla={onChiudi}
        />
      )}

      {fase === 'scelta' && (
        <Scelta
          prese={prese}
          onCambia={(i) =>
            setPrese((v) => v.map((p, k) => (k === i ? { ...p, tenuta: !p.tenuta } : p)))
          }
          onAncora={() => setFase('camera')}
          onCuci={() => void cuci()}
          onAnnulla={onChiudi}
        />
      )}

      {fase === 'lavoro' && (
        <div className="pano-lavoro">
          <h2>Cucio la panoramica</h2>
          <p className="aiuto">{lavoro.cosa}…</p>
          <div className="barra-avanzamento">
            <div className="riempimento" style={{ width: `${Math.round(lavoro.quota * 100)}%` }} />
          </div>
        </div>
      )}

      {fase === 'ritaglio' && cucita && (
        <Ritaglio
          url={cucita.url}
          larghezza={cucita.w}
          altezza={cucita.h}
          copertura={cucita.copertura}
          onFatto={async (blob, w, h) => {
            await onFatta(blob, cucita.scatti, w, h);
            onChiudi();
          }}
          onAnnulla={onChiudi}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. La fotocamera
// ---------------------------------------------------------------------------

function Fotocamera({
  richiesta,
  prese,
  onScatto,
  onFine,
  onAnnulla
}: {
  richiesta: Promise<MediaStream> | null;
  prese: Presa[];
  onScatto: (p: Presa) => void;
  onFine: () => void;
  onAnnulla: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flusso = useRef<MediaStream | null>(null);
  const [pronta, setPronta] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [misura, setMisura] = useState<string>('');
  const [scattando, setScattando] = useState(false);
  const [obiettivi, setObiettivi] = useState<Obiettivo[]>([]);
  const [attivo, setAttivo] = useState<string | null>(null);
  const galleria = useRef<HTMLInputElement>(null);

  const attacca = async (s: MediaStream) => {
    for (const t of flusso.current?.getTracks() ?? []) t.stop();
    flusso.current = s;
    if (video.current) {
      video.current.srcObject = s;
      await video.current.play().catch(() => {});
    }
    const t = s.getVideoTracks()[0];
    const g = t?.getSettings();
    if (g?.width && g?.height) setMisura(`${g.width}×${g.height}`);
    if (g?.deviceId) setAttivo(g.deviceId);
    setErrore(null);
    setPronta(true);
    // i nomi degli obiettivi il sistema li dà solo dopo il permesso
    setObiettivi(await obiettiviPosteriori());
  };

  /**
   * CAMBIA OBIETTIVO. Si può solo PRIMA del primo scatto: mescolare un
   * ultra-grandangolo e un teleobiettivo nella stessa panoramica si può
   * cucire — le due viste restano legate da un'omografia — ma un pezzo
   * verrebbe da un decimo dei pixel dell'altro, e in quel pezzo le misure
   * varrebbero un decimo. Meglio impedirlo che spiegarlo dopo.
   */
  const cambiaObiettivo = async (deviceId: string) => {
    if (prese.length > 0 || deviceId === attivo) return;
    setPronta(false);
    try {
      await attacca(await chiediFotocamera(deviceId));
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richiesta]);

  /** RIPROVA, questa volta con il dito ancora sul vetro: è ciò che iOS vuole */
  const riprova = async () => {
    try {
      await attacca(await chiediFotocamera());
    } catch (e) {
      setErrore(perchéNiente(e));
    }
  };

  const scatta = async () => {
    const v = video.current;
    if (!v || !v.videoWidth || scattando) return;
    setScattando(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.94));
      if (!blob) return;
      onScatto({
        blob,
        url: URL.createObjectURL(blob),
        larghezza: canvas.width,
        altezza: canvas.height,
        tenuta: true
      });
    } finally {
      setTimeout(() => setScattando(false), 250);
    }
  };

  /** DALLA GALLERIA: se la fotocamera non si apre, la panoramica si fa lo
   *  stesso con gli scatti fatti dall'app fotocamera del telefono. */
  const daGalleria = async (files: File[]) => {
    for (const f of files) {
      const bitmap = await createImageBitmap(f).catch(() => null);
      onScatto({
        blob: f,
        url: URL.createObjectURL(f),
        larghezza: bitmap?.width ?? 0,
        altezza: bitmap?.height ?? 0,
        tenuta: true
      });
      bitmap?.close?.();
    }
  };

  return (
    <>
      <div className="pano-mirino">
        <video ref={video} playsInline muted autoPlay />
        {errore && (
          <div className="pano-errore">
            <p>{errore}</p>
            <div className="riga-pulsanti" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="btn primario" onClick={() => void riprova()}>
                <Icona nome="fotocamera" dimensione={18} /> Riprova
              </button>
              <button className="btn" onClick={() => galleria.current?.click()}>
                <Icona nome="immagine" dimensione={18} /> Dalla galleria
              </button>
            </div>
          </div>
        )}
        {!errore && !pronta && <div className="pano-errore">Accendo la fotocamera…</div>}
        {scattando && <div className="pano-lampo" />}
        {obiettivi.length > 1 && !errore && (
          <div className="pano-obiettivi">
            {obiettivi.map((o) => (
              <button
                key={o.deviceId}
                className={`pano-obiettivo${o.deviceId === attivo ? ' attivo' : ''}`}
                title={o.etichetta}
                disabled={prese.length > 0}
                onClick={() => void cambiaObiettivo(o.deviceId)}
              >
                {o.segno}
              </button>
            ))}
          </div>
        )}
        {obiettivi.length > 1 && prese.length > 0 && (
          <div className="pano-obiettivi-bloccati">
            L’obiettivo si sceglie prima del primo scatto
          </div>
        )}
      </div>

      <input
        ref={galleria}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          // i file si copiano PRIMA di azzerare il campo: svuotarlo svuota
          // anche la FileList, e la funzione asincrona non troverebbe niente
          const scelti = Array.from(e.target.files ?? []);
          e.target.value = '';
          void daGalleria(scelti);
        }}
      />

      <div className="pano-striscia">
        {prese.length === 0 ? (
          <span className="aiuto">
            Gira sui piedi senza spostarti, sovrapponendo almeno un terzo fra uno scatto e il
            successivo.
          </span>
        ) : (
          prese.map((p, i) => (
            <img key={p.url} src={p.url} alt={`Scatto ${i + 1}`} className="pano-mini" />
          ))
        )}
      </div>

      <div className="pano-comandi">
        <button className="btn" onClick={onAnnulla}>
          Annulla
        </button>
        <button
          className="pano-otturatore"
          onClick={() => void scatta()}
          disabled={!pronta || !!errore}
          aria-label="Scatta"
        >
          <span />
        </button>
        <button className="btn primario" onClick={onFine} disabled={prese.length < 2}>
          Fine ({prese.length})
        </button>
      </div>
      {misura && <div className="pano-misura">Scatti da {misura} px</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. La scelta
// ---------------------------------------------------------------------------

function Scelta({
  prese,
  onCambia,
  onAncora,
  onCuci,
  onAnnulla
}: {
  prese: Presa[];
  onCambia: (i: number) => void;
  onAncora: () => void;
  onCuci: () => void;
  onAnnulla: () => void;
}) {
  const tenuti = prese.filter((p) => p.tenuta).length;
  return (
    <>
      <div className="pano-testa">
        <h2>Quali scatti tengo</h2>
        <p className="aiuto">
          Tocca uno scatto per escluderlo. Quelli esclusi vengono buttati: non entrano
          nell’archivio. Devono restare in fila, da un capo all’altro.
        </p>
      </div>
      <div className="pano-griglia">
        {prese.map((p, i) => (
          <button
            key={p.url}
            className={`pano-scelta${p.tenuta ? ' tenuta' : ''}`}
            onClick={() => onCambia(i)}
          >
            <img src={p.url} alt={`Scatto ${i + 1}`} />
            <span className="pano-numero">{i + 1}</span>
            {p.tenuta && (
              <span className="pano-spunta">
                <Icona nome="check" dimensione={18} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="pano-comandi">
        <button className="btn" onClick={onAnnulla}>
          Annulla
        </button>
        <button className="btn" onClick={onAncora}>
          <Icona nome="fotocamera" dimensione={18} /> Ancora
        </button>
        <button className="btn primario" onClick={onCuci} disabled={tenuti < 2}>
          Cuci ({tenuti})
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Il ritaglio
// ---------------------------------------------------------------------------

function Ritaglio({
  url,
  larghezza,
  altezza,
  copertura,
  onFatto,
  onAnnulla
}: {
  url: string;
  larghezza: number;
  altezza: number;
  copertura: { dati: Uint8ClampedArray; larghezza: number; altezza: number } | null;
  onFatto: (blob: Blob, w: number, h: number) => Promise<void>;
  onAnnulla: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const immagine = useRef<HTMLImageElement | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  /** cosa si sta trascinando: un angolo o un lato */
  const [preso, setPreso] = useState<{ cosa: 'angolo' | 'lato'; i: number } | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [vista, setVista] = useState({ scala: 1, x: 0, y: 0 });

  // il punto di partenza: il rettangolo più grande dentro la parte coperta
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      immagine.current = img;
      if (!copertura) {
        setQuad([
          { x: 0, y: 0 },
          { x: larghezza, y: 0 },
          { x: larghezza, y: altezza },
          { x: 0, y: altezza }
        ]);
        return;
      }
      const r = riquadroPieno(copertura.dati, copertura.larghezza, copertura.altezza);
      // la maschera è più piccola della foto: si riporta alla scala vera
      const kx = larghezza / copertura.larghezza;
      const ky = altezza / copertura.altezza;
      setQuad([
        { x: r.x * kx, y: r.y * ky },
        { x: (r.x + r.larghezza) * kx, y: r.y * ky },
        { x: (r.x + r.larghezza) * kx, y: (r.y + r.altezza) * ky },
        { x: r.x * kx, y: (r.y + r.altezza) * ky }
      ]);
    };
    img.src = url;
  }, [url, larghezza, altezza, copertura]);

  // come l'immagine sta nel riquadro: serve a convertire dito → pixel foto
  useEffect(() => {
    const misura = () => {
      const b = box.current?.getBoundingClientRect();
      if (!b) return;
      // un margine attorno: le maniglie dei quattro angoli devono restare
      // afferrabili anche quando il ritaglio arriva al bordo della foto
      const margine = 30;
      const scala = Math.min(
        (b.width - margine * 2) / larghezza,
        (b.height - margine * 2) / altezza
      );
      setVista({
        scala,
        x: (b.width - larghezza * scala) / 2,
        y: (b.height - altezza * scala) / 2
      });
    };
    misura();
    window.addEventListener('resize', misura);
    return () => window.removeEventListener('resize', misura);
  }, [larghezza, altezza]);

  const daSchermo = (e: React.PointerEvent): Punto => {
    const b = box.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(larghezza, (e.clientX - b.left - vista.x) / vista.scala)),
      y: Math.max(0, Math.min(altezza, (e.clientY - b.top - vista.y) / vista.scala))
    };
  };

  const applica = async (tuttoIntero: boolean) => {
    if (!immagine.current || !quad) return;
    setInCorso(true);
    try {
      const scelto: Quad = tuttoIntero
        ? [
            { x: 0, y: 0 },
            { x: larghezza, y: 0 },
            { x: larghezza, y: altezza },
            { x: 0, y: altezza }
          ]
        : quad;
      const r = await raddrizza(immagine.current, larghezza, altezza, scelto);
      await onFatto(r.blob, r.larghezza, r.altezza);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Ritaglio non riuscito.');
      setInCorso(false);
    }
  };

  return (
    <>
      <div className="pano-testa">
        <h2>Ritaglia e raddrizza</h2>
        <p className="aiuto">
          <strong>Gli angoli</strong> mettono la prospettiva: portali sugli spigoli del muro e
          quel muro lo vedrai di fronte. <strong>I lati</strong> invece non la toccano: allargano
          o stringono l’inquadratura seguendo la fuga. Le misure restano valide comunque.
        </p>
      </div>
      <div
        className="pano-tela"
        ref={box}
        onPointerMove={(e) => {
          if (!preso || !quad) return;
          const p = daSchermo(e);
          if (preso.cosa === 'angolo') setQuad(quadConVertice(quad, preso.i, p));
          else {
            // il lato scivola seguendo la fuga: la prospettiva non si tocca
            const nuovo = quadConLato(quad, preso.i as Lato, p);
            if (nuovo) setQuad(nuovo);
          }
        }}
        onPointerUp={() => setPreso(null)}
        onPointerCancel={() => setPreso(null)}
      >
        <img
          src={url}
          alt="Panoramica"
          style={{
            position: 'absolute',
            left: vista.x,
            top: vista.y,
            width: larghezza * vista.scala,
            height: altezza * vista.scala
          }}
        />
        {quad && (
          <>
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              pointerEvents="none"
            >
              <polygon
                points={quad
                  .map((p) => `${p.x * vista.scala + vista.x},${p.y * vista.scala + vista.y}`)
                  .join(' ')}
                fill="rgba(47,129,247,0.12)"
                stroke="#2f81f7"
                strokeWidth={2}
              />
            </svg>
            {quad.map((p, i) => (
              <div
                key={`a${i}`}
                className={`pano-maniglia${
                  preso?.cosa === 'angolo' && preso.i === i ? ' presa' : ''
                }`}
                style={{
                  left: p.x * vista.scala + vista.x,
                  top: p.y * vista.scala + vista.y
                }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setPreso({ cosa: 'angolo', i });
                }}
              />
            ))}
            {(maniglieDeiLatiQuad(quad) ?? []).map((p, i) => (
              <div
                key={`l${i}`}
                className={`pano-maniglia lato${i % 2 === 0 ? ' orizzontale' : ' verticale'}${
                  preso?.cosa === 'lato' && preso.i === i ? ' presa' : ''
                }`}
                style={{
                  left: p.x * vista.scala + vista.x,
                  top: p.y * vista.scala + vista.y
                }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setPreso({ cosa: 'lato', i });
                }}
              />
            ))}
          </>
        )}
      </div>
      <div className="pano-comandi">
        <button className="btn" onClick={onAnnulla} disabled={inCorso}>
          Annulla
        </button>
        <button className="btn" onClick={() => void applica(true)} disabled={inCorso}>
          Tieni tutta
        </button>
        <button
          className="btn primario"
          onClick={() => void applica(false)}
          disabled={inCorso || !quad}
        >
          <Icona nome="check" dimensione={18} /> {inCorso ? 'Salvo…' : 'Salva'}
        </button>
      </div>
    </>
  );
}
