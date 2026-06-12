import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Shape, Circle, Rect, Line } from 'react-konva';
import type Konva from 'konva';
import type { Annotazione, Foto, Punto, Rettangolo, SottotipoQuota } from '../db/types';
import { primitiveAnnotazione } from '../geometry/primitive';
import { geometriaQuota } from '../geometry/primitive';
import { disegnaPrimitiva } from '../render/renderAnnotata';
import { puntiAggancio, snapPunto } from '../geometry/snap';
import { distanza, dot, normale, sottrai, vincolaAngolo, vincolaOrto } from '../geometry/punti';
import type { RicercaBordi } from '../geometry/bordi';
import { traslaAnnotazione } from './fabbrica';

export type Strumento =
  | 'seleziona'
  | 'quotaO'
  | 'quotaV'
  | 'quotaA'
  | 'angolo'
  | 'raggio'
  | 'testo'
  | 'disegno'
  | 'freccia'
  | 'callout'
  | 'calibra'
  | 'piano';

/** Vincolo direzionale: nessuno, orto (H/V) o snap angolare a 15° */
export type ModalitaVincolo = 'off' | 'orto' | 'angolo15';

interface Props {
  foto: Foto;
  immagine: HTMLImageElement;
  annotazioni: Annotazione[];
  selezioneId: string | null;
  strumento: Strumento;
  snapAttivo: boolean;
  vincolo: ModalitaVincolo;
  sogliaSnap: number;
  /** snap ai bordi dell'immagine (rilevamento contorni), se attivo */
  ricercaBordi: RicercaBordi | null;
  /** layer: quali categorie di annotazioni mostrare */
  filtroVisibile: (a: Annotazione) => boolean;
  onSeleziona: (id: string | null) => void;
  onCommit: (annotazioni: Annotazione[]) => void;
  onNuovaQuota: (p1: Punto, p2: Punto, sottotipo: SottotipoQuota) => void;
  onNuovoAngolo: (vertice: Punto, a: Punto, b: Punto) => void;
  onNuovoRaggio: (centro: Punto, bordo: Punto) => void;
  onNuovoTesto: (posizione: Punto) => void;
  onNuovaFreccia: (p1: Punto, p2: Punto) => void;
  onNuovoDisegno: (punti: number[]) => void;
  onNuovoCallout: (sorgente: Rettangolo) => void;
  onCalibra: (p1: Punto, p2: Punto) => void;
  onPiano: (punti: [Punto, Punto, Punto, Punto]) => void;
}

interface Vista {
  scala: number;
  x: number;
  y: number;
}

type Bozza =
  | { tipo: 'quota'; sottotipo: SottotipoQuota; p1: Punto; p2: Punto }
  | { tipo: 'freccia'; p1: Punto; p2: Punto }
  | { tipo: 'raggio'; centro: Punto; bordo: Punto }
  | { tipo: 'calibra'; p1: Punto; p2: Punto }
  | { tipo: 'disegno'; punti: number[] }
  | { tipo: 'callout'; inizio: Punto; corrente: Punto }
  | { tipo: 'angolo'; punti: Punto[] }
  | { tipo: 'piano'; punti: Punto[] }
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

  // I drafting multi-tocco (angolo, piano) si azzerano al cambio strumento
  useEffect(() => {
    setBozza(null);
    disegnoAttivo.current = false;
  }, [p.strumento]);

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
    // a zoom ridotto la soglia cresce in px immagine: la precisione del dito è costante sullo schermo
    const soglia = Math.max(p.sogliaSnap, p.sogliaSnap / vista.scala);
    if (p.snapAttivo) {
      const candidati = escludi
        ? candidatiSnap.filter((c) => !escludi.some((e) => distanza(e, c) < 0.01))
        : candidatiSnap;
      const esito = snapPunto(punto, candidati, soglia);
      if (esito.agganciato) {
        setIndicatoreSnap(esito.punto);
        return esito.punto;
      }
    }
    if (p.ricercaBordi) {
      const bordo = p.ricercaBordi.cerca(punto, soglia);
      if (bordo) {
        setIndicatoreSnap(bordo);
        return bordo;
      }
    }
    setIndicatoreSnap(null);
    return punto;
  };

  /** vincolo direzionale per gli strumenti a due punti */
  const applicaVincolo = (p1: Punto, p2: Punto): Punto => {
    if (p.vincolo === 'orto') return vincolaOrto(p1, p2);
    if (p.vincolo === 'angolo15') return vincolaAngolo(p1, p2, 15);
    return p2;
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
      case 'raggio': {
        const centro = applicaSnap(pos);
        setBozza({ tipo: 'raggio', centro, bordo: centro });
        disegnoAttivo.current = true;
        break;
      }
      case 'calibra': {
        const p1 = applicaSnap(pos);
        setBozza({ tipo: 'calibra', p1, p2: p1 });
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
      case 'angolo': {
        // tre tocchi: vertice, primo lato, secondo lato
        const punto = applicaSnap(pos);
        const punti = bozza?.tipo === 'angolo' ? [...bozza.punti, punto] : [punto];
        if (punti.length === 3) {
          setBozza(null);
          setIndicatoreSnap(null);
          p.onNuovoAngolo(punti[0], punti[1], punti[2]);
        } else {
          setBozza({ tipo: 'angolo', punti });
        }
        break;
      }
      case 'piano': {
        // quattro tocchi: gli angoli del rettangolo di riferimento
        const punto = applicaSnap(pos);
        const punti = bozza?.tipo === 'piano' ? [...bozza.punti, punto] : [punto];
        if (punti.length === 4) {
          setBozza(null);
          setIndicatoreSnap(null);
          p.onPiano(punti as [Punto, Punto, Punto, Punto]);
        } else {
          setBozza({ tipo: 'piano', punti });
        }
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
          if (b.sottotipo === 'allineata') p2 = applicaVincolo(b.p1, p2);
          return { ...b, p2 };
        }
        case 'freccia':
          return { ...b, p2: applicaVincolo(b.p1, pos) };
        case 'raggio':
          return { ...b, bordo: applicaSnap(pos, [b.centro]) };
        case 'calibra':
          return { ...b, p2: applicaSnap(pos, [b.p1]) };
        case 'disegno':
          return { ...b, punti: [...b.punti, pos.x, pos.y] };
        case 'callout':
          return { ...b, corrente: pos };
        default:
          return b;
      }
    });
  };

  const suPointerUp = () => {
    if (!disegnoAttivo.current || !bozza) {
      disegnoAttivo.current = false;
      return;
    }
    disegnoAttivo.current = false;
    if (bozza.tipo === 'angolo' || bozza.tipo === 'piano') return; // multi-tocco
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
      case 'raggio':
        if (distanza(b.centro, b.bordo) >= minimo) p.onNuovoRaggio(b.centro, b.bordo);
        break;
      case 'calibra':
        if (distanza(b.p1, b.p2) >= minimo * 2) p.onCalibra(b.p1, b.p2);
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
    return lista.filter(p.filtroVisibile).sort((a, b) => a.zIndex - b.zIndex);
  }, [p.annotazioni, annLive, p.filtroVisibile]);

  const stileBozza = useMemo(
    () => ({
      colore: '#2f81f7',
      spessore: Math.max(2, Math.round(Math.max(p.foto.larghezzaPx, p.foto.altezzaPx) / 600)),
      dimensioneTesto: Math.max(18, Math.round(Math.max(p.foto.larghezzaPx, p.foto.altezzaPx) / 50))
    }),
    [p.foto.larghezzaPx, p.foto.altezzaPx]
  );

  const bozzaAnnotazione = useMemo((): Annotazione | null => {
    if (!bozza) return null;
    const base = { id: '__bozza__', fotoId: p.foto.id, zIndex: 9999, stile: stileBozza };
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
      case 'calibra':
        // anteprima del segmento di calibrazione
        return { ...base, tipo: 'disegno', punti: [bozza.p1.x, bozza.p1.y, bozza.p2.x, bozza.p2.y] };
      case 'raggio':
        return {
          ...base,
          tipo: 'quotaRaggio',
          centro: bozza.centro,
          bordo: bozza.bordo,
          modo: 'raggio',
          valore: null,
          unita: 'cm',
          stato: 'stimata'
        };
      case 'disegno':
        return { ...base, tipo: 'disegno', punti: bozza.punti };
      case 'callout': {
        // anteprima della regione da ritagliare: un semplice rettangolo
        const r = normalizzaRect(bozza.inizio, bozza.corrente);
        return { ...base, tipo: 'disegno', punti: rettangoloInPunti(r) };
      }
      default:
        return null;
    }
  }, [bozza, p.foto, stileBozza]);

  const selezionata = annotazioniVisibili.find((a) => a.id === p.selezioneId) ?? null;
  const raggioManiglia = 15 / vista.scala;

  const committaLive = () => {
    if (!annLive) return;
    const live = annLive;
    setAnnLive(null);
    p.onCommit(p.annotazioni.map((a) => (a.id === live.id ? live : a)));
  };

  const suggerimento = testoSuggerimento(p.strumento, bozza);

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

        {/* Riferimenti di calibrazione + maniglie ampie pensate per il tocco */}
        <Layer>
          {p.foto.piano && p.strumento === 'piano' && (
            <Line
              points={p.foto.piano.punti.flatMap((pt) => [pt.x, pt.y])}
              closed
              stroke="#34c759"
              strokeWidth={2 / vista.scala}
              dash={[10 / vista.scala, 6 / vista.scala]}
              listening={false}
            />
          )}
          {(bozza?.tipo === 'angolo' || bozza?.tipo === 'piano') && (
            <>
              {bozza.punti.map((pt, i) => (
                <Circle
                  key={i}
                  x={pt.x}
                  y={pt.y}
                  radius={raggioManiglia * 0.6}
                  fill="#2f81f7"
                  listening={false}
                />
              ))}
              {bozza.punti.length > 1 && (
                <Line
                  points={bozza.punti.flatMap((pt) => [pt.x, pt.y])}
                  stroke="#2f81f7"
                  strokeWidth={2 / vista.scala}
                  dash={[8 / vista.scala, 6 / vista.scala]}
                  listening={false}
                />
              )}
            </>
          )}
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
              vincolo={p.vincolo}
            />
          )}
        </Layer>
      </Stage>
      {suggerimento && <div className="suggerimento-stage">{suggerimento}</div>}
    </div>
  );
}

function testoSuggerimento(strumento: Strumento, bozza: Bozza): string | null {
  if (strumento === 'angolo') {
    const n = bozza?.tipo === 'angolo' ? bozza.punti.length : 0;
    return ['Tocca il vertice dell’angolo', 'Tocca il primo lato', 'Tocca il secondo lato'][n];
  }
  if (strumento === 'piano') {
    const n = bozza?.tipo === 'piano' ? bozza.punti.length : 0;
    return `Piano di riferimento: tocca i 4 angoli di un rettangolo reale (${n}/4) — alto-sx, alto-dx, basso-dx, basso-sx`;
  }
  if (strumento === 'calibra') return 'Trascina tra due punti a distanza nota';
  if (strumento === 'raggio') return 'Trascina dal centro al bordo';
  return null;
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
          } else if (prim.kind === 'cerchio') {
            c.beginPath();
            c.arc(prim.centro.x, prim.centro.y, prim.raggio, 0, Math.PI * 2);
            c.stroke();
          } else if (prim.kind === 'arco') {
            c.beginPath();
            c.arc(prim.centro.x, prim.centro.y, prim.raggio, prim.inizio, prim.fine, prim.antiorario);
            c.stroke();
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
    case 'quotaAngolo':
      punti.push(
        a.vertice,
        a.a,
        a.b,
        { x: a.vertice.x - a.raggioArco, y: a.vertice.y - a.raggioArco },
        { x: a.vertice.x + a.raggioArco, y: a.vertice.y + a.raggioArco }
      );
      break;
    case 'quotaRaggio': {
      const r = Math.hypot(a.bordo.x - a.centro.x, a.bordo.y - a.centro.y);
      punti.push(
        { x: a.centro.x - r, y: a.centro.y - r },
        { x: a.centro.x + r, y: a.centro.y + r }
      );
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
  vincolo
}: {
  ann: Annotazione;
  raggio: number;
  scala: number;
  onLive: (a: Annotazione | null) => void;
  onFine: () => void;
  applicaSnap: (p: Punto, escludi?: Punto[]) => Punto;
  vincolo: ModalitaVincolo;
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

  const applicaVincolo = (origine: Punto, punto: Punto): Punto => {
    if (vincolo === 'orto') return vincolaOrto(origine, punto);
    if (vincolo === 'angolo15') return vincolaAngolo(origine, punto, 15);
    return punto;
  };

  switch (ann.tipo) {
    case 'quota': {
      const g = geometriaQuota(ann);
      return (
        <>
          {maniglia(
            'p1',
            ann.p1,
            (n) => {
              const p1 = ann.sottotipo === 'allineata' ? applicaVincolo(ann.p2, n) : n;
              return { ...ann, p1 };
            },
            { snap: true, escludi: [ann.p1] }
          )}
          {maniglia(
            'p2',
            ann.p2,
            (n) => {
              const p2 = ann.sottotipo === 'allineata' ? applicaVincolo(ann.p1, n) : n;
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
    case 'quotaAngolo': {
      const angoloMedio = (() => {
        const a1 = Math.atan2(ann.a.y - ann.vertice.y, ann.a.x - ann.vertice.x);
        const a2 = Math.atan2(ann.b.y - ann.vertice.y, ann.b.x - ann.vertice.x);
        let delta = a2 - a1;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        return a1 + delta / 2;
      })();
      return (
        <>
          {maniglia('vertice', ann.vertice, (n) => ({ ...ann, vertice: n }), { snap: true, escludi: [ann.vertice] })}
          {maniglia('a', ann.a, (n) => ({ ...ann, a: n }), { snap: true, escludi: [ann.a] })}
          {maniglia('b', ann.b, (n) => ({ ...ann, b: n }), { snap: true, escludi: [ann.b] })}
          {maniglia(
            'arco',
            {
              x: ann.vertice.x + ann.raggioArco * Math.cos(angoloMedio),
              y: ann.vertice.y + ann.raggioArco * Math.sin(angoloMedio)
            },
            (n) => ({
              ...ann,
              raggioArco: Math.max(20, Math.hypot(n.x - ann.vertice.x, n.y - ann.vertice.y))
            })
          )}
        </>
      );
    }
    case 'quotaRaggio':
      return (
        <>
          {maniglia('centro', ann.centro, (n) => ({ ...ann, centro: n }), { snap: true, escludi: [ann.centro] })}
          {maniglia('bordo', ann.bordo, (n) => ({ ...ann, bordo: n }), { snap: true, escludi: [ann.bordo] })}
        </>
      );
    case 'freccia':
      return (
        <>
          {maniglia('p1', ann.p1, (n) => ({ ...ann, p1: n }))}
          {maniglia('p2', ann.p2, (n) => ({ ...ann, p2: applicaVincolo(ann.p1, n) }))}
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
