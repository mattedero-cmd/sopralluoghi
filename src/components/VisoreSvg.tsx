import { useEffect, useMemo, useRef, useState } from 'react';
import { dimensioniDisegno, misureSvg, sanificaSvg } from '../utils/svgDisegno';

/**
 * VISORE DI DISEGNI SVG.
 *
 * Il disegno viene messo nella pagina, ma non com'è: prima passa dalla
 * ripulitura (vedi `sanificaSvg`), perché un SVG è un documento che il browser
 * esegue e un file ricevuto da fuori non deve poter toccare l'archivio. Quello
 * che si conserva e si condivide resta l'originale, intatto.
 *
 * LINEE VISIBILI. Un file di taglio disegna con linee da un quarto di
 * millimetro su fogli larghi un metro e venti: a schermo intero sarebbero
 * otto centesimi di pixel, cioè niente. Il visore parte quindi in modo
 * «leggibile» — tutte le linee alla stessa grossezza, ferma allo zoom — e con
 * un tocco si passa a «fedele», che mostra gli spessori veri del file.
 *
 * Si sposta col dito, si ingrandisce con due dita o con la rotella, due tocchi
 * lo riportano intero.
 */

const MIN = 0.02;
const MAX = 60;

export function VisoreSvg({ svg }: { svg: string }) {
  const pulito = useMemo(() => sanificaSvg(svg), [svg]);
  const misura = useMemo(() => dimensioniDisegno(misureSvg(svg)), [svg]);

  const scatolaRef = useRef<HTMLDivElement>(null);
  const [scala, setScala] = useState(1);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [leggibile, setLeggibile] = useState(true);
  /** scala a cui il disegno sta tutto dentro: partenza e ritorno */
  const adattoRef = useRef(1);
  const toccato = useRef(false);

  const puntatori = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ distanza: number; scala: number } | null>(null);

  /** rimette il disegno intero dentro la finestra */
  const adatta = () => {
    const scatola = scatolaRef.current;
    if (!scatola || !(misura.larghezza > 0) || !(misura.altezza > 0)) return;
    const s = Math.min(
      (scatola.clientWidth - 20) / misura.larghezza,
      (scatola.clientHeight - 20) / misura.altezza
    );
    const buona = s > 0 && Number.isFinite(s) ? s : 1;
    adattoRef.current = buona;
    toccato.current = false;
    setScala(buona);
    setDx(0);
    setDy(0);
  };

  // all'apertura, e quando la finestra cambia forma (rotazione del telefono),
  // ma senza strappare di mano un ingrandimento già scelto
  useEffect(() => {
    adatta();
    const scatola = scatolaRef.current;
    if (!scatola || typeof ResizeObserver === 'undefined') return;
    const oss = new ResizeObserver(() => {
      if (!toccato.current) adatta();
    });
    oss.observe(scatola);
    return () => oss.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulito, misura.larghezza, misura.altezza]);

  /** ingrandisce tenendo fermo il punto sotto le dita */
  const zoom = (fattore: number, cx?: number, cy?: number) => {
    const scatola = scatolaRef.current;
    if (!scatola) return;
    const r = scatola.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left - r.width / 2;
    const py = (cy ?? r.top + r.height / 2) - r.top - r.height / 2;
    toccato.current = true;
    setScala((s) => {
      const nuova = Math.min(MAX, Math.max(MIN, s * fattore));
      const k = nuova / s;
      setDx((v) => px - (px - v) * k);
      setDy((v) => py - (py - v) * k);
      return nuova;
    });
  };

  const giu = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (puntatori.current.size === 2) {
      const [a, b] = [...puntatori.current.values()];
      gesto.current = { distanza: Math.hypot(a.x - b.x, a.y - b.y), scala };
    }
  };

  const muove = (e: React.PointerEvent) => {
    const vecchio = puntatori.current.get(e.pointerId);
    if (!vecchio) return;
    const nuovo = { x: e.clientX, y: e.clientY };
    puntatori.current.set(e.pointerId, nuovo);

    if (puntatori.current.size >= 2 && gesto.current) {
      const [a, b] = [...puntatori.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && gesto.current.distanza > 0) {
        const obiettivo = (gesto.current.scala * d) / gesto.current.distanza;
        zoom(obiettivo / scala, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      return;
    }
    toccato.current = true;
    setDx((v) => v + (nuovo.x - vecchio.x));
    setDy((v) => v + (nuovo.y - vecchio.y));
  };

  const su = (e: React.PointerEvent) => {
    puntatori.current.delete(e.pointerId);
    if (puntatori.current.size < 2) gesto.current = null;
  };

  return (
    <div className={`svg-visore${leggibile ? ' leggibile' : ''}`}>
      <div
        className="tela"
        ref={scatolaRef}
        onPointerDown={giu}
        onPointerMove={muove}
        onPointerUp={su}
        onPointerCancel={su}
        onDoubleClick={() => (toccato.current ? adatta() : zoom(3))}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY)}
      >
        {pulito ? (
          <div
            className="disegno"
            style={{
              width: misura.larghezza,
              height: misura.altezza,
              // il -50% mette il centro del disegno al centro della finestra;
              // da lì lo spostamento del dito e l'ingrandimento
              transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scala})`
            }}
            // già ripulito sopra: restano solo i tag che disegnano
            dangerouslySetInnerHTML={{ __html: pulito }}
          />
        ) : (
          <p className="svg-guasto">
            Questo file non si riesce a disegnare: potrebbe essere rovinato o non essere un SVG.
          </p>
        )}
      </div>
      <div className="comandi">
        <button className="btn icona" aria-label="Riduci" onClick={() => zoom(1 / 1.4)}>
          −
        </button>
        <button className="btn" onClick={adatta}>
          Adatta
        </button>
        <button className="btn icona" aria-label="Ingrandisci" onClick={() => zoom(1.4)}>
          +
        </button>
        <button
          className={`btn${leggibile ? ' attivo' : ''}`}
          title="Linee tutte della stessa grossezza, sempre visibili"
          aria-pressed={leggibile}
          onClick={() => setLeggibile((v) => !v)}
        >
          {leggibile ? 'Leggibile' : 'Fedele'}
        </button>
        <span className="ingrandimento">{arrotonda(scala)}</span>
      </div>
    </div>
  );
}

/** l'ingrandimento in forma leggibile: sotto l'1% le percentuali non dicono più niente */
function arrotonda(s: number): string {
  if (s >= 1) return `${Math.round(s * 100)}%`;
  if (s >= 0.1) return `${(s * 100).toFixed(0)}%`;
  return `1:${Math.round(1 / s)}`;
}
