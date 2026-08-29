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
import { mostraToast } from '../state/toast';

interface Presa {
  blob: Blob;
  url: string;
  larghezza: number;
  altezza: number;
  tenuta: boolean;
}

type Fase = 'camera' | 'scelta' | 'lavoro' | 'ritaglio';

export function Panoramica({
  onFatta,
  onChiudi
}: {
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
  prese,
  onScatto,
  onFine,
  onAnnulla
}: {
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

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // si chiede il massimo che la fotocamera sa dare: una panoramica serve
        // a vedere PIÙ dettaglio, non meno, e partire da un video sgranato
        // vanificherebbe tutto
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 4096 },
            height: { ideal: 3072 }
          },
          audio: false
        });
        if (!vivo) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        flusso.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        const t = s.getVideoTracks()[0];
        const g = t?.getSettings();
        if (g?.width && g?.height) {
          setMisura(`${g.width}×${g.height}`);
        }
        setPronta(true);
      } catch (e) {
        setErrore(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Permesso della fotocamera negato: consentilo dalle impostazioni del browser.'
            : 'Fotocamera non disponibile su questo dispositivo.'
        );
      }
    })();
    return () => {
      vivo = false;
      for (const t of flusso.current?.getTracks() ?? []) t.stop();
    };
  }, []);

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

  return (
    <>
      <div className="pano-mirino">
        <video ref={video} playsInline muted autoPlay />
        {errore && <div className="pano-errore">{errore}</div>}
        {!errore && !pronta && <div className="pano-errore">Accendo la fotocamera…</div>}
        {scattando && <div className="pano-lampo" />}
      </div>

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
  const [quad, setQuad] = useState<[Punto, Punto, Punto, Punto] | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [vista, setVista] = useState({ scala: 1, x: 0, y: 0 });
  const [preso, setPreso] = useState<number | null>(null);

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
      const scelto: [Punto, Punto, Punto, Punto] = tuttoIntero
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
          Porta i quattro angoli sugli spigoli del muro: quello che c’è dentro diventa il
          rettangolo della foto. Lasciandoli dove sono è un semplice ritaglio. Le misure restano
          valide in tutti e due i casi.
        </p>
      </div>
      <div
        className="pano-tela"
        ref={box}
        onPointerMove={(e) => {
          if (preso === null || !quad) return;
          const p = daSchermo(e);
          setQuad(quad.map((q, i) => (i === preso ? p : q)) as [Punto, Punto, Punto, Punto]);
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
                key={i}
                className={`pano-maniglia${preso === i ? ' presa' : ''}`}
                style={{
                  left: p.x * vista.scala + vista.x,
                  top: p.y * vista.scala + vista.y
                }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setPreso(i);
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
