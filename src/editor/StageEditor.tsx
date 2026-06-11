import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Shape, Circle, Rect } from 'react-konva';
import type Konva from 'konva';
import type { Annotazione, Foto, Punto, Rettangolo, SottotipoQuota } from '../db/types';
import { primitiveAnnotazione } from '../geometry/primitive';
import { geometriaQuota } from '../geometry/primitive';
import { disegnaPrimitiva } from '../render/renderAnnotata';
import { puntiAggancio, snapPunto } from '../geometry/snap';
import { distanza, dot, normale, sottrai, vincolaOrto } from '../geometry/punti';
import { traslaAnnotazione } from './fabbrica';

export type Strumento =
  | 'seleziona'
  | 'quotaO'
  | 'quotaV'
  | 'quotaA'
  | 'testo'
  | 'disegno'
  | 'freccia'
  | 'callout';

interface Props {
  foto: Foto;
  immagine: HTMLImageElement;
  annotazioni: Annotazione[];
  selezioneId: string | null;
  strumento: Strumento;
  snapAttivo: boolean;
  ortoAttivo: boolean;
  sogliaSnap: number;
  onSeleziona: (id: string | null) => void;
  onCommit: (annotazioni: Annotazione[]) => void;
  onNuovaQuota: (p1: Punto, p2: Punto, sottotipo: SottotipoQuota) => void;
  onNuovoTesto: (posizione: Punto) => void;
  onNuovaFreccia: (p1: Punto, p2: Punto) => void;
  onNuovoDisegno: (punti: number[]) => void;
  onNuovoCallout: (sorgente: Rettangolo) => void;
}

interface Vista {
  scala: number;
  x: number;
  y: number;
}

type Bozza =
  | { tipo: 'quota'; sottotipo: SottotipoQuota; p1: Punto; p2: Punto }
  | { tipo: 'freccia'; p1: Punto; p2: Punto }
  | { tipo: 'disegno'; punti: number[] }
  | { tipo: 'callout'; inizio: Punto; corrente: Punto }
  | null;

const SCALA_MIN = 0.05;
const SCALA_MAX = 12;

export function StageEditor(p: Props) {
  const contenitore = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensioni, setDimensioni] = useState({ w: 0, h: 0 });
  const [vista, setVista] = useState<Vista>({ scala: 0.2, x: 0, y: 0 });
  const [bozza, setBozza] = useState<Bozza>(null);
  const [indicatoreSnap, setIndicatoreSnap] = useState<Punto | null>(null);
  /** modifica live tramite maniglie, non ancora committata */
  const [annLive, setAnnLive] = useState<Annotazione | null>(null);
  const pinch = useRef<{ dist: number; centro: Punto } | null>(null);
  const disegnoAttivo = useRef(false);

  // Adatta la vista al contenitore (e al cambio orientamento del telefono)
  useEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const osserva = new ResizeObserver(() => {
      setDimensioni({ w: el.clientWidth, h: el.clientHeight });
    });
    osserva.observe(el);
    setDimensioni({ w: el.clientWidth, h: el.clientHeight });
    return () => osserva.disconnect();
  }, []);

  const adatta = useMemo(() => {
    return (w: number, h: number) => {
      if (w === 0 || h === 0) return;
      const scala = Math.min(w / p.foto.larghezzaPx, h / p.foto.altezzaPx) * 0.97;
      setVista({
        scala,
        x: (w - p.foto.larghezzaPx * scala) / 2,
        y: (h - p.foto.altezzaPx * scala) / 2
      });
    };
  }, [p.foto.larghezzaPx, p.foto.altezzaPx]);

  const adattato = useRef(false);
  useEffect(() => {
    if (!adattato.current && dimensioni.w > 0) {
      adatta(dimensioni.w, dimensioni.h);
      adattato.current = true;
    }
  }, [dimensioni, adatta]);

  // Espone "adatta vista" tramite evento custom (pulsante nella barra)
  useEffect(() => {
    const handler = () => adatta(dimensioni.w, dimensioni.h);
    window.addEventListener('editor:adatta', handler);
    return () => window.removeEventListener('editor:adatta', handler);
  }, [adatta, dimensioni]);

  const posImmagine = (): Punto | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getRelativePointerPosition();
    return pos ? { x: pos.x, y: pos.y } : null;
  };

  const candidatiSnap = useMemo(
    () => puntiAggancio(p.annotazioni, p.selezioneId ?? undefined),
    [p.annotazioni, p.selezioneId]
  );

  const applicaSnap = (punto: Punto, escludi?: Punto[]): Punto => {
    if (!p.snapAttivo) {
      setIndicatoreSnap(null);
      return punto;
    }
    // a zoom ridotto la soglia cresce in px immagine: la precisione del dito è costante sullo schermo
    const soglia = Math.max(p.sogliaSnap, p.sogliaSnap / vista.scala);
    const candidati = escludi
      ? candidatiSnap.filter((c) => !escludi.some((e) => distanza(e, c) < 0.01))
      : candidatiSnap;
    const esito = snapPunto(punto, candidati, soglia);
    setIndicatoreSnap(esito.agganciato ? esito.punto : null);
    return esito.punto;
  };

  // -------------------------------------------------------------------------
  // Zoom: rotella, pinch a due dita, pulsanti
  // -------------------------------------------------------------------------

  const zoomVerso = (puntoSchermo: Punto, fattore: number) => {
    setVista((v) => {
      const scala = Math.min(SCALA_MAX, Math.max(SCALA_MIN, v.scala * fattore));
      const reale = scala / v.scala;
      return {
        scala,
        x: puntoSchermo.x - (puntoSchermo.x - v.x) * reale,
        y: puntoSchermo.y - (puntoSchermo.y - v.y) * reale
      };
    });
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const fattore = (e as CustomEvent<number>).detail;
      zoomVerso({ x: dimensioni.w / 2, y: dimensioni.h / 2 }, fattore);
    };
    window.addEventListener('editor:zoom', handler);
    return () => window.removeEventListener('editor:zoom', handler);
  }, [dimensioni]);

  const suRotella = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    zoomVerso(pos, e.evt.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const suTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    // due dita: pinch zoom + pan; qualunque bozza viene annullata
    if (bozza) setBozza(null);
    disegnoAttivo.current = false;
    const rect = contenitore.current?.getBoundingClientRect();
    if (!rect) return;
    const p1 = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
    const p2 = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
    const centro = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.max(10, distanza(p1, p2));
    const prec = pinch.current;
    pinch.current = { dist, centro };
    if (!prec) return;
    const fattore = dist / prec.dist;
    setVista((v) => {
      const scala = Math.min(SCALA_MAX, Math.max(SCALA_MIN, v.scala * fattore));
      const reale = scala / v.scala;
      return {
        scala,
        x: centro.x - (prec.centro.x - v.x) * reale,
        y: centro.y - (prec.centro.y - v.y) * reale
      };
    });
  };

  const suTouchEnd = () => {
    pinch.current = null;
  };

  // -------------------------------------------------------------------------
  // Creazione annotazioni (bozze)
  // -------------------------------------------------------------------------

  const suPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (e.evt instanceof PointerEvent && e.evt.isPrimary === false) return;
    const pos = posImmagine();
    if (!pos) return;

    if (p.strumento === 'seleziona') {
      if (e.target === stage || e.target.name() === 'sfondo-foto') {
        p.onSeleziona(null);
      }
      return;
    }

    switch (p.strumento) {
      case 'quotaO':
      case 'quotaV':
      case 'quotaA': {
        const p1 = applicaSnap(pos);
        const sottotipo: SottotipoQuota =
          p.strumento === 'quotaO' ? 'orizzontale' : p.strumento === 'quotaV' ? 'verticale' : 'allineata';
        setBozza({ tipo: 'quota', sottotipo, p1, p2: p1 });
        disegnoAttivo.current = true;
        break;
      }
      case 'freccia': {
        setBozza({ tipo: 'freccia', p1: pos, p2: pos });
        disegnoAttivo.current = true;
        break;
      }
      case 'disegno': {
        setBozza({ tipo: 'disegno', punti: [pos.x, pos.y] });
        disegnoAttivo.current = true;
        break;
      }
      case 'callout': {
        setBozza({ tipo: 'callout', inizio: pos, corrente: pos });
        disegnoAttivo.current = true;
        break;
      }
      case 'testo': {
        p.onNuovoTesto(pos);
        break;
      }
    }
  };

  const suPointerMove = () => {
    if (!disegnoAttivo.current || !bozza) return;
    const pos = posImmagine();
    if (!pos) return;
    setBozza((b) => {
      if (!b) return b;
      switch (b.tipo) {
        case 'quota': {
          let p2 = applicaSnap(pos, [b.p1]);
          if (p.ortoAttivo && b.sottotipo === 'allineata') p2 = vincolaOrto(b.p1, p2);
          return { ...b, p2 };
        }
        case 'freccia': {
          let p2 = pos;
          if (p.ortoAttivo) p2 = vincolaOrto(b.p1, p2);
          return { ...b, p2 };
        }
        case 'disegno':
          return { ...b, punti: [...b.punti, pos.x, pos.y] };
        case 'callout':
          return { ...b, corrente: pos };
      }
    });
  };

  const suPointerUp = () => {
    if (!disegnoAttivo.current || !bozza) {
      disegnoAttivo.current = false;
      return;
    }
    disegnoAttivo.current = false;
    setIndicatoreSnap(null);
    const b = bozza;
    setBozza(null);
    const minimo = 8 / vista.scala;
    switch (b.tipo) {
      case 'quota':
        if (distanza(b.p1, b.p2) >= minimo) p.onNuovaQuota(b.p1, b.p2, b.sottotipo);
        break;
      case 'freccia':
        if (distanza(b.p1, b.p2) >= minimo) p.onNuovaFreccia(b.p1, b.p2);
        break;
      case 'disegno':
        if (b.punti.length >= 6) p.onNuovoDisegno(b.punti);
        break;
      case 'callout': {
        const r = normalizzaRect(b.inizio, b.corrente);
        if (r.width >= minimo * 2 && r.height >= minimo * 2) p.onNuovoCallout(r);
        break;
      }
    }
  };

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  const annotazioniVisibili = useMemo(() => {
    const lista = annLive
      ? p.annotazioni.map((a) => (a.id === annLive.id ? annLive : a))
      : p.annotazioni;
    return [...lista].sort((a, b) => a.zIndex - b.zIndex);
  }, [p.annotazioni, annLive]);

  const bozzaAnnotazione = useMemo((): Annotazione | null => {
    if (!bozza) return null;
    const stile = {
      colore: '#2f81f7',
      spessore: Math.max(2, Math.round(Math.max(p.foto.larghezzaPx, p.foto.altezzaPx) / 600)),
      dimensioneTesto: Math.max(18, Math.round(Math.max(p.foto.larghezzaPx, p.foto.altezzaPx) / 50))
    };
    const base = { id: '__bozza__', fotoId: p.foto.id, zIndex: 9999, stile };
    switch (bozza.tipo) {
      case 'quota':
        return {
          ...base,
          tipo: 'quota',
          sottotipo: bozza.sottotipo,
          p1: bozza.p1,
          p2: bozza.p2,
          offset: Math.max(28, Math.round(Math.max(p.foto.larghezzaPx, p.foto.altezzaPx) * 0.035)),
          valore: null,
          unita: 'cm',
          posizioneTesto: 'sopra',
          stato: 'reale'
        };
      case 'freccia':
        return { ...base, tipo: 'freccia', p1: bozza.p1, p2: bozza.p2 };
      case 'disegno':
        return { ...base, tipo: 'disegno', punti: bozza.punti };
      case 'callout': {
        // anteprima della regione da ritagliare: un semplice rettangolo
        const r = normalizzaRect(bozza.inizio, bozza.corrente);
        return { ...base, tipo: 'disegno', punti: rettangoloInPunti(r) };
      }
    }
  }, [bozza, p.foto]);

  const selezionata = annotazioniVisibili.find((a) => a.id === p.selezioneId) ?? null;
  const raggioManiglia = 15 / vista.scala;

  const committaLive = () => {
    if (!annLive) return;
    const live = annLive;
    setAnnLive(null);
    p.onCommit(p.annotazioni.map((a) => (a.id === live.id ? live : a)));
  };

  return (
    <div ref={contenitore} className="editor-stage">
      <Stage
        ref={stageRef}
        width={dimensioni.w}
        height={dimensioni.h}
        scaleX={vista.scala}
        scaleY={vista.scala}
        x={vista.x}
        y={vista.y}
        draggable={p.strumento === 'seleziona' && !annLive}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setVista((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        onWheel={suRotella}
        onTouchMove={suTouchMove}
        onTouchEnd={suTouchEnd}
        onPointerDown={suPointerDown}
        onPointerMove={suPointerMove}
        onPointerUp={suPointerUp}
      >
        <Layer listening={p.strumento === 'seleziona'}>
          <KonvaImage
            name="sfondo-foto"
            image={p.immagine}
            width={p.foto.larghezzaPx}
            height={p.foto.altezzaPx}
            listening={true}
          />
          {annotazioniVisibili.map((a) => (
            <AnnotazioneShape
              key={a.id}
              ann={a}
              immagine={p.immagine}
              selezionata={a.id === p.selezioneId}
              interattiva={p.strumento === 'seleziona'}
              hitWidth={Math.max(28 / vista.scala, 12)}
              onSeleziona={() => p.onSeleziona(a.id)}
              onTrascinata={(dx, dy) => {
                p.onCommit(
                  p.annotazioni.map((x) => (x.id === a.id ? traslaAnnotazione(x, dx, dy) : x))
                );
              }}
            />
          ))}
          {bozzaAnnotazione && (
            <AnnotazioneShape
              ann={bozzaAnnotazione}
              immagine={p.immagine}
              selezionata={false}
              interattiva={false}
              hitWidth={1}
              onSeleziona={() => {}}
              onTrascinata={() => {}}
            />
          )}
        </Layer>

        {/* Maniglie di modifica: ampie, pensate per il tocco */}
        <Layer>
          {indicatoreSnap && (
            <Circle
              x={indicatoreSnap.x}
              y={indicatoreSnap.y}
              radius={raggioManiglia * 0.8}
              stroke="#32d74b"
              strokeWidth={3 / vista.scala}
              listening={false}
            />
          )}
          {selezionata && p.strumento === 'seleziona' && (
            <ManiglieAnnotazione
              ann={selezionata}
              raggio={raggioManiglia}
              scala={vista.scala}
              onLive={setAnnLive}
              onFine={committaLive}
              applicaSnap={applicaSnap}
              ortoAttivo={p.ortoAttivo}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}

function normalizzaRect(a: Punto, b: Punto): Rettangolo {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  };
}

function rettangoloInPunti(r: Rettangolo): number[] {
  return [r.x, r.y, r.x + r.width, r.y, r.x + r.width, r.y + r.height, r.x, r.y + r.height, r.x, r.y];
}

// ---------------------------------------------------------------------------
// Shape Konva per una annotazione: il disegno usa le stesse primitive
// dell'export, garantendo che ciò che si vede sia ciò che si esporta.
// ---------------------------------------------------------------------------

function AnnotazioneShape({
  ann,
  immagine,
  selezionata,
  interattiva,
  hitWidth,
  onSeleziona,
  onTrascinata
}: {
  ann: Annotazione;
  immagine: HTMLImageElement;
  selezionata: boolean;
  interattiva: boolean;
  hitWidth: number;
  onSeleziona: () => void;
  onTrascinata: (dx: number, dy: number) => void;
}) {
  const prims = useMemo(() => primitiveAnnotazione(ann), [ann]);

  return (
    <Shape
      listening={interattiva}
      draggable={interattiva}
      sceneFunc={(ctx) => {
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        for (const prim of prims) disegnaPrimitiva(c, prim, immagine);
        if (selezionata) {
          // alone di selezione attorno ai punti chiave
          c.save();
          c.strokeStyle = 'rgba(47,129,247,0.9)';
          c.setLineDash([6, 6]);
          c.lineWidth = 2;
          const b = boxAnnotazione(ann);
          c.strokeRect(b.x - 6, b.y - 6, b.width + 12, b.height + 12);
          c.restore();
        }
      }}
      hitFunc={(ctx, shape) => {
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        c.save();
        c.strokeStyle = shape.colorKey;
        c.fillStyle = shape.colorKey;
        c.lineWidth = hitWidth;
        c.lineCap = 'round';
        for (const prim of prims) {
          if (prim.kind === 'linea' || prim.kind === 'polilinea') {
            c.beginPath();
            c.moveTo(prim.punti[0], prim.punti[1]);
            for (let i = 2; i < prim.punti.length; i += 2) c.lineTo(prim.punti[i], prim.punti[i + 1]);
            c.stroke();
          } else if (prim.kind === 'rettangolo') {
            c.strokeRect(prim.rect.x, prim.rect.y, prim.rect.width, prim.rect.height);
          } else if (prim.kind === 'testo') {
            const w = Math.max(60, prim.testo.length * prim.dimensione * 0.6);
            c.fillRect(prim.posizione.x - w / 2, prim.posizione.y - prim.dimensione, w, prim.dimensione * 2);
          }
        }
        c.restore();
      }}
      onClick={onSeleziona}
      onTap={onSeleziona}
      onDragStart={onSeleziona}
      onDragEnd={(e) => {
        const dx = e.target.x();
        const dy = e.target.y();
        e.target.position({ x: 0, y: 0 });
        if (dx !== 0 || dy !== 0) onTrascinata(dx, dy);
      }}
    />
  );
}

function boxAnnotazione(a: Annotazione): Rettangolo {
  const punti: Punto[] = [];
  switch (a.tipo) {
    case 'quota': {
      const g = geometriaQuota(a);
      punti.push(a.p1, a.p2, g.q1, g.q2);
      break;
    }
    case 'freccia':
      punti.push(a.p1, a.p2);
      break;
    case 'testo':
      punti.push(a.posizione);
      break;
    case 'disegno':
      for (let i = 0; i < a.punti.length; i += 2) punti.push({ x: a.punti[i], y: a.punti[i + 1] });
      break;
    case 'callout':
      punti.push(
        { x: a.inserto.x, y: a.inserto.y },
        { x: a.inserto.x + a.inserto.width, y: a.inserto.y + a.inserto.height }
      );
      break;
  }
  const xs = punti.map((p) => p.x);
  const ys = punti.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// ---------------------------------------------------------------------------
// Maniglie di modifica per l'annotazione selezionata
// ---------------------------------------------------------------------------

function ManiglieAnnotazione({
  ann,
  raggio,
  scala,
  onLive,
  onFine,
  applicaSnap,
  ortoAttivo
}: {
  ann: Annotazione;
  raggio: number;
  scala: number;
  onLive: (a: Annotazione | null) => void;
  onFine: () => void;
  applicaSnap: (p: Punto, escludi?: Punto[]) => Punto;
  ortoAttivo: boolean;
}) {
  const maniglia = (
    chiave: string,
    pos: Punto,
    aggiorna: (nuova: Punto) => Annotazione,
    opzioni?: { snap?: boolean; escludi?: Punto[] }
  ) => (
    <Circle
      key={chiave}
      x={pos.x}
      y={pos.y}
      radius={raggio}
      fill="rgba(47,129,247,0.35)"
      stroke="#58a6ff"
      strokeWidth={2.5 / scala}
      draggable
      onDragMove={(e) => {
        let nuovo: Punto = { x: e.target.x(), y: e.target.y() };
        if (opzioni?.snap) nuovo = applicaSnap(nuovo, opzioni.escludi);
        e.target.position(nuovo);
        onLive(aggiorna(nuovo));
      }}
      onDragEnd={() => onFine()}
    />
  );

  switch (ann.tipo) {
    case 'quota': {
      const g = geometriaQuota(ann);
      return (
        <>
          {maniglia(
            'p1',
            ann.p1,
            (n) => {
              let p1 = n;
              if (ortoAttivo && ann.sottotipo === 'allineata') p1 = vincolaOrto(ann.p2, n);
              return { ...ann, p1 };
            },
            { snap: true, escludi: [ann.p1] }
          )}
          {maniglia(
            'p2',
            ann.p2,
            (n) => {
              let p2 = n;
              if (ortoAttivo && ann.sottotipo === 'allineata') p2 = vincolaOrto(ann.p1, n);
              return { ...ann, p2 };
            },
            { snap: true, escludi: [ann.p2] }
          )}
          {maniglia('offset', g.centro, (n) => {
            const offset = dot(sottrai(n, ann.p1), normale(g.d));
            return { ...ann, offset };
          })}
        </>
      );
    }
    case 'freccia':
      return (
        <>
          {maniglia('p1', ann.p1, (n) => ({ ...ann, p1: n }))}
          {maniglia('p2', ann.p2, (n) => ({ ...ann, p2: n }))}
        </>
      );
    case 'callout': {
      const s = ann.sorgente;
      const i = ann.inserto;
      return (
        <>
          {/* sposta la regione sorgente */}
          {maniglia('sorgente', { x: s.x + s.width / 2, y: s.y + s.height / 2 }, (n) => ({
            ...ann,
            sorgente: { ...s, x: n.x - s.width / 2, y: n.y - s.height / 2 }
          }))}
          {/* ridimensiona la regione sorgente */}
          {maniglia('sorgente-dim', { x: s.x + s.width, y: s.y + s.height }, (n) => ({
            ...ann,
            sorgente: {
              ...s,
              width: Math.max(20, n.x - s.x),
              height: Math.max(20, n.y - s.y)
            }
          }))}
          {/* ridimensiona l'inserto (proporzioni della sorgente) */}
          {maniglia('inserto-dim', { x: i.x + i.width, y: i.y + i.height }, (n) => {
            const width = Math.max(40, n.x - i.x);
            const height = Math.max(30, (width * s.height) / Math.max(1, s.width));
            return { ...ann, inserto: { ...i, width, height } };
          })}
          <Rect
            x={i.x}
            y={i.y}
            width={i.width}
            height={i.height}
            stroke="#58a6ff"
            strokeWidth={2 / scala}
            dash={[8 / scala, 6 / scala]}
            listening={false}
          />
        </>
      );
    }
    default:
      return null;
  }
}
