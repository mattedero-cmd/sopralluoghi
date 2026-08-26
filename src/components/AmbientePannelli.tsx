import { useEffect, useMemo, useRef, useState } from 'react';
import type { Punto } from '../db/types';
import { Icona } from './Icona';
import { CampoNumero } from './CampoNumero';
import { applicaOmografia, calcolaOmografia } from '../geometry/omografia';
import {
  giuntiAutomatici,
  numeroMinimo,
  pannelliDi,
  sbordo,
  sormontoTotale,
  spostaGiunto,
  type AbbondanzeTelo,
  type AssePannelli,
  type Pannellizzazione,
  type VersoSormonto
} from '../geometry/pannelli';
import { formattaNumero } from '../utils/format';

/**
 * AMBIENTE DI PANNELLIZZAZIONE.
 *
 * Un telo più largo del rotolo si divide in più pezzi che in opera si
 * sormontano. Qui si decide tutto quello che conta — dove cade la giunzione,
 * quanto si sormonta e quale lembo sta sopra — e lo si VEDE: sulla foto del
 * sopralluogo la divisione si disegna in omografia, quindi anche su un
 * quadrilatero deformato dalla prospettiva le giunzioni cadono dove cadranno
 * davvero sul muro.
 *
 * L'ambiente è lo stesso per il sopralluogo e per il piano di taglio: cambia
 * solo se c'è una foto sotto. Le misure sono nell'unità di chi chiama, e non
 * vengono mai convertite qui.
 */

/** che cosa si sta dividendo */
export interface FormaDaPannellizzare {
  nome: string;
  /** misure DEL VETRO, senza abbondanze: è quello che si divide */
  larghezza: number;
  altezza: number;
  /**
   * Le abbondanze attorno al vetro. Stanno fuori dalla divisione — la
   * giunzione al centro cade al centro del vetro — ma entrano nella misura dei
   * teli di bordo, e quando sono asimmetriche i teli risultano diversi.
   */
  abbondanze?: { sinistra: number; destra: number; sopra: number; sotto: number };
  /** etichetta dell'unità, per i testi (mm, cm, m) */
  unita: string;
  /**
   * Larghezza utile del supporto: nessun pannello può superarla. Quando si
   * conosce è lei a decidere quanti teli servono.
   */
  massimo?: number | null;
  /** da dove viene il massimo, per dirlo in chiaro (es. «bobina 137 cm») */
  fonteMassimo?: string;
  /**
   * Il quadrilatero sulla foto e la foto stessa: l'anteprima li usa per
   * mostrare la divisione in prospettiva. Senza, si disegna il rettangolo.
   */
  prospettiva?: { punti: Punto[]; immagine: CanvasImageSource } | null;
}

const MODI = [
  { id: 'fascia' as const, nome: 'Sfrutta la fascia' },
  { id: 'uguali' as const, nome: 'Parti uguali' }
];

/** quanto vicino al giunto bisogna toccare per prenderlo, in pixel di schermo */
const PRESA = 26;

/** lo stesso verde delle giunzioni sulla foto, per il contorno dei teli */
const VERDE_ABBONDANZA = '#34c759';

export function AmbientePannelli({
  forma,
  iniziale,
  onConferma,
  onChiudi
}: {
  forma: FormaDaPannellizzare;
  iniziale?: Pannellizzazione | null;
  /** null = niente pannellizzazione, la forma resta intera */
  onConferma: (p: Pannellizzazione | null) => void;
  onChiudi: () => void;
}) {
  const { larghezza: L, altezza: A } = forma;
  const abb = forma.abbondanze ?? { sinistra: 0, destra: 0, sopra: 0, sotto: 0 };
  const conAbbondanze = abb.sinistra > 0 || abb.destra > 0 || abb.sopra > 0 || abb.sotto > 0;

  /** modo di distribuzione: con una fascia nota si parte da lei */
  const [modo, setModo] = useState<'fascia' | 'uguali'>(forma.massimo ? 'fascia' : 'uguali');
  const [massimo, setMassimo] = useState<number>(forma.massimo ?? 0);
  const [pann, setPann] = useState<Pannellizzazione>(
    () =>
      iniziale ?? {
        asse: 'verticale',
        sormonto: sormontoIniziale(forma.unita),
        verso: 'centro',
        giunti: giuntiAutomatici(L, {
          massimo: forma.massimo ?? null,
          modo: forma.massimo ? 'fascia' : 'uguali',
          numero: forma.massimo ? null : 2,
          sormonto: sormontoIniziale(forma.unita),
          verso: 'centro',
          abbondanze: {
            inizio: forma.abbondanze?.sinistra ?? 0,
            fine: forma.abbondanze?.destra ?? 0,
            trasversaleInizio: forma.abbondanze?.sopra ?? 0,
            trasversaleFine: forma.abbondanze?.sotto ?? 0
          }
        })
      }
  );
  /** solo disegno: i comandi si tolgono di mezzo per posizionare col dito */
  const [soloDisegno, setSoloDisegno] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Punto>({ x: 0, y: 0 });
  /** giunto in mano, mentre lo si trascina */
  const [preso, setPreso] = useState<number | null>(null);

  const totale = sceltaTotale(pann.asse, L, A);
  const trasversale = pann.asse === 'verticale' ? A : L;
  /** le abbondanze girate nel verso dell'asse di divisione */
  const abbondanze: AbbondanzeTelo =
    pann.asse === 'verticale'
      ? { inizio: abb.sinistra, fine: abb.destra, trasversaleInizio: abb.sopra, trasversaleFine: abb.sotto }
      : { inizio: abb.sopra, fine: abb.sotto, trasversaleInizio: abb.sinistra, trasversaleFine: abb.destra };
  const pannelli = useMemo(
    () => pannelliDi(totale, trasversale, pann, abbondanze),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totale, trasversale, pann, abb.sinistra, abb.destra, abb.sopra, abb.sotto]
  );
  const numero = pannelli.length;
  const troppoLarghi = massimo > 0 ? pannelli.filter((p) => p.larghezza > massimo + 1e-6) : [];

  /* --- ridistribuzione automatica ---------------------------------- */

  const ridistribuisci = (
    modifiche: Partial<{
      asse: AssePannelli;
      sormonto: number;
      verso: VersoSormonto;
      numero: number | null;
      modo: 'fascia' | 'uguali';
      massimo: number;
    }> = {}
  ) => {
    const asse = modifiche.asse ?? pann.asse;
    const sormonto = modifiche.sormonto ?? pann.sormonto;
    const verso = modifiche.verso ?? pann.verso;
    const m = modifiche.modo ?? modo;
    const max = modifiche.massimo ?? massimo;
    // quanti teli: se non lo dice chi chiama, lo decide la fascia — ma solo
    // quando una fascia c'è. Senza, si tengono quelli che ci sono già:
    // cambiare l'asse o il sormonto non deve far sparire la divisione.
    const quanti =
      modifiche.numero ?? (m === 'fascia' && max > 0 ? null : Math.max(1, numero));
    const t = sceltaTotale(asse, L, A);
    setPann({
      asse,
      sormonto,
      verso,
      giunti: giuntiAutomatici(t, {
        massimo: max > 0 ? max : null,
        modo: m,
        numero: quanti,
        sormonto,
        verso,
        abbondanze: abbondanzeDi(asse)
      })
    });
  };

  /** le abbondanze viste da un asse qualunque, anche diverso da quello attivo */
  function abbondanzeDi(asse: AssePannelli): AbbondanzeTelo {
    return asse === 'verticale'
      ? { inizio: abb.sinistra, fine: abb.destra, trasversaleInizio: abb.sopra, trasversaleFine: abb.sotto }
      : { inizio: abb.sopra, fine: abb.sotto, trasversaleInizio: abb.sinistra, trasversaleFine: abb.destra };
  }

  /**
   * Cambia il numero di teli.
   *
   * Deciderlo a mano vuol dire dividere in parti uguali: «sfrutta la fascia»
   * il numero se lo calcola da sé, e lasciarlo acceso direbbe una cosa e ne
   * farebbe un'altra.
   */
  const cambiaNumero = (n: number) => {
    if (n < 1) return;
    const m =
      n === numeroMinimo(totale, massimo > 0 ? massimo : null, pann.sormonto, abbondanze)
        ? modo
        : 'uguali';
    setModo(m);
    ridistribuisci({ numero: n, modo: m });
  };

  /* --- disegno ------------------------------------------------------ */

  const contRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensioni, setDimensioni] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const misura = () =>
      setDimensioni({ w: el.clientWidth, h: el.clientHeight });
    misura();
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, []);

  /** i 4 angoli nello spazio del disegno: la foto, o il rettangolo puro */
  const quad = useMemo<Punto[]>(() => {
    const p = forma.prospettiva?.punti;
    if (p && p.length === 4) return p;
    return [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: A },
      { x: 0, y: A }
    ];
  }, [forma.prospettiva, L, A]);

  /** reale → disegno e ritorno: le due strade devono restare coerenti */
  const omografie = useMemo(() => {
    const reali = [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: A },
      { x: 0, y: A }
    ];
    try {
      return {
        versoDisegno: calcolaOmografia(reali, quad),
        versoReale: calcolaOmografia(quad, reali)
      };
    } catch {
      return null;
    }
  }, [quad, L, A]);

  /**
   * Il contorno da inquadrare: il vetro più le abbondanze. Se si inquadrasse
   * solo il vetro, il filetto verde dei teli finirebbe fuori dallo schermo
   * proprio dal lato dove c'è più abbondanza — cioè dove serve guardarlo.
   */
  const contorno = useMemo<Punto[]>(() => {
    if (!omografie) return quad;
    const angoli = [
      { x: -abb.sinistra, y: -abb.sopra },
      { x: L + abb.destra, y: -abb.sopra },
      { x: L + abb.destra, y: A + abb.sotto },
      { x: -abb.sinistra, y: A + abb.sotto }
    ];
    return angoli.map((p) => applicaOmografia(omografie.versoDisegno, p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [omografie, quad, L, A, abb.sinistra, abb.destra, abb.sopra, abb.sotto]);

  /** inquadratura di base: il quadrilatero riempie l'area disponibile */
  const vista = useMemo(() => {
    const { w, h } = dimensioni;
    if (w === 0 || h === 0) return null;
    const xs = contorno.map((p) => p.x);
    const ys = contorno.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const base = Math.min((w * 0.84) / bw, (h * 0.8) / bh);
    return { w, h, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, base };
  }, [dimensioni, contorno]);

  const aSchermo = (p: Punto): Punto => {
    if (!vista) return { x: 0, y: 0 };
    const s = vista.base * zoom;
    return {
      x: vista.w / 2 + (p.x - vista.cx) * s + pan.x,
      y: vista.h / 2 + (p.y - vista.cy) * s + pan.y
    };
  };

  const aDisegno = (p: Punto): Punto => {
    if (!vista) return { x: 0, y: 0 };
    const s = vista.base * zoom;
    return {
      x: (p.x - pan.x - vista.w / 2) / s + vista.cx,
      y: (p.y - pan.y - vista.h / 2) / s + vista.cy
    };
  };

  /** punto SUL VETRO (u lungo l'asse di divisione, v di traverso) → schermo */
  const puntoSchermo = (u: number, v: number): Punto => {
    if (!omografie) return { x: 0, y: 0 };
    const reale = pann.asse === 'verticale' ? { x: u, y: v } : { x: v, y: u };
    return aSchermo(applicaOmografia(omografie.versoDisegno, reale));
  };

  /** schermo → posizione sul vetro lungo l'asse di divisione */
  const posizioneDa = (p: Punto): number | null => {
    if (!omografie) return null;
    const reale = applicaOmografia(omografie.versoReale, aDisegno(p));
    return pann.asse === 'verticale' ? reale.x : reale.y;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !vista || !omografie) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = vista;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    // la foto sotto, in trasparenza: serve a riconoscere il muro, non a
    // rubare l'occhio alle giunzioni
    const foto = forma.prospettiva?.immagine;
    if (foto) {
      const s = vista.base * zoom;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.translate(w / 2 + pan.x, h / 2 + pan.y);
      ctx.scale(s, s);
      ctx.translate(-vista.cx, -vista.cy);
      ctx.drawImage(foto, 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(5,7,10,0.3)';
      ctx.fillRect(0, 0, w, h);
    }

    const percorso = (punti: Punto[]) => {
      ctx.beginPath();
      punti.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    };

    // fasce di sormonto: il doppio strato di materiale, dove si sovrappone
    const sb = sbordo(pann);
    for (const g of pann.giunti) {
      const a = Math.max(0, g - sb.inizio);
      const b = Math.min(totale, g + sb.fine);
      if (b - a <= 0) continue;
      percorso([
        puntoSchermo(a, 0),
        puntoSchermo(b, 0),
        puntoSchermo(b, trasversale),
        puntoSchermo(a, trasversale)
      ]);
      ctx.fillStyle = 'rgba(255,196,0,0.28)';
      ctx.fill();
    }

    // contorno dell'elemento
    percorso(quad.map(aSchermo));
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#4da3ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // IL CONTORNO DI OGNI TELO, abbondanze comprese: filetto verde sottile.
    // È il pezzo che esce dalla macchina: messo sopra il vetro fa vedere a
    // colpo d'occhio se la divisione tiene, e come si distribuiscono le
    // abbondanze quando non sono uguali su tutti i lati.
    if (conAbbondanze) {
      const v0 = -abbondanze.trasversaleInizio;
      const v1 = trasversale + abbondanze.trasversaleFine;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = VERDE_ABBONDANZA;
      ctx.lineWidth = 1.25;
      for (const telo of pannelli) {
        percorso([
          puntoSchermo(telo.inizio, v0),
          puntoSchermo(telo.fine, v0),
          puntoSchermo(telo.fine, v1),
          puntoSchermo(telo.inizio, v1)
        ]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // linee di giunzione: quelle che si vedranno sul muro
    pann.giunti.forEach((g, i) => {
      const a = puntoSchermo(g, 0);
      const b = puntoSchermo(g, trasversale);
      for (const [col, lw] of [
        ['rgba(0,0,0,0.7)', 8],
        [preso === i ? '#ffffff' : '#ffc400', 3.5]
      ] as Array<[string, number]>) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // maniglia al centro della giunzione: è lì che si prende col dito
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.beginPath();
      ctx.arc(m.x, m.y, preso === i ? 15 : 12, 0, Math.PI * 2);
      ctx.fillStyle = preso === i ? '#ffffff' : 'rgba(255,196,0,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // numero e misura di ogni pannello, al centro del suo campo
    const dim = Math.round(Math.min(w, h) * 0.042);
    ctx.font = `bold ${dim}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    pannelli.forEach((p) => {
      // i teli stretti finirebbero uno sopra l'altro: le scritte si alternano
      // in alto e in basso, così restano leggibili anche su una striscia
      const altezzaTesto = p.indice % 2 === 0 ? 0.62 : 0.38;
      const c = puntoSchermo((p.vistaInizio + p.vistaFine) / 2, trasversale * altezzaTesto);
      const testo = `${p.indice}  ·  ${formattaNumero(arrotonda(p.larghezza))} ${forma.unita}`;
      ctx.lineWidth = Math.max(2, dim * 0.24);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(testo, c.x, c.y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(testo, c.x, c.y);
    });

    ctx.restore();
    // il disegno dipende da tutto quello che si vede: se cambia, si rifà
  }, [vista, omografie, pann, pannelli, zoom, pan, preso, forma.prospettiva, totale, trasversale, conAbbondanze]);

  /* --- dito e mouse -------------------------------------------------- */

  const puntatori = useRef(new Map<number, Punto>());
  const pinch = useRef<{ distanza: number; zoom: number } | null>(null);

  const localePuntatore = (e: React.PointerEvent): Punto => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** il giunto più vicino al tocco, se abbastanza vicino da essere quello */
  const giuntoVicino = (p: Punto): number | null => {
    let scelto: number | null = null;
    let minima = PRESA;
    pann.giunti.forEach((g, i) => {
      const a = puntoSchermo(g, 0);
      const b = puntoSchermo(g, trasversale);
      const d = distanzaDaSegmento(p, a, b);
      if (d < minima) {
        minima = d;
        scelto = i;
      }
    });
    return scelto;
  };

  const giuPuntatore = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localePuntatore(e);
    puntatori.current.set(e.pointerId, p);
    if (puntatori.current.size >= 2) {
      // più di un dito vuol dire inquadratura, mai trascinamento: qualunque
      // giunzione in mano si lascia andare, o al terzo dito salterebbe
      const [a, b] = [...puntatori.current.values()];
      pinch.current = { distanza: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
      setPreso(null);
      return;
    }
    setPreso(giuntoVicino(p));
  };

  const muoviPuntatore = (e: React.PointerEvent) => {
    if (!puntatori.current.has(e.pointerId)) return;
    const p = localePuntatore(e);
    const prima = puntatori.current.get(e.pointerId)!;
    puntatori.current.set(e.pointerId, p);

    if (puntatori.current.size >= 2 && pinch.current) {
      const [a, b] = [...puntatori.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setZoom(Math.min(12, Math.max(0.5, (pinch.current.zoom * d) / pinch.current.distanza)));
      return;
    }

    if (preso !== null) {
      const posizione = posizioneDa(p);
      if (posizione !== null) {
        setPann((v) => spostaGiunto(v, preso, posizione, totale));
      }
      return;
    }
    // niente in mano: si sposta l'inquadratura
    setPan((v) => ({ x: v.x + (p.x - prima.x), y: v.y + (p.y - prima.y) }));
  };

  const suPuntatore = (e: React.PointerEvent) => {
    puntatori.current.delete(e.pointerId);
    if (puntatori.current.size < 2) pinch.current = null;
    if (puntatori.current.size === 0) setPreso(null);
  };

  const adatta = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  /* --- schermo ------------------------------------------------------- */

  const unita = forma.unita;
  const sb = sbordo(pann);
  const materialeInPiu = sormontoTotale(pann, totale);
  const versi: Array<{ id: VersoSormonto; nome: string }> =
    pann.asse === 'verticale'
      ? [
          { id: 'indietro', nome: 'Sinistro sopra' },
          { id: 'centro', nome: 'Metà e metà' },
          { id: 'avanti', nome: 'Destro sopra' }
        ]
      : [
          { id: 'indietro', nome: 'Alto sopra' },
          { id: 'centro', nome: 'Metà e metà' },
          { id: 'avanti', nome: 'Basso sopra' }
        ];

  return (
    <div className="ambiente-pannelli">
      <header className="barra">
        <button className="btn icona" aria-label="Chiudi senza applicare" onClick={onChiudi}>
          ✕
        </button>
        <h1>Pannellizza — {forma.nome}</h1>
        <button
          className="btn icona"
          aria-label={soloDisegno ? 'Mostra i comandi' : 'Solo disegno, a tutto schermo'}
          title={soloDisegno ? 'Mostra i comandi' : 'Solo disegno'}
          onClick={() => setSoloDisegno((v) => !v)}
        >
          <Icona nome={soloDisegno ? 'impostazioni' : 'mirino'} />
        </button>
      </header>

      <div
        ref={contRef}
        className={soloDisegno ? 'ap-disegno pieno' : 'ap-disegno'}
        onPointerDown={giuPuntatore}
        onPointerMove={muoviPuntatore}
        onPointerUp={suPuntatore}
        onPointerCancel={suPuntatore}
      >
        <canvas ref={canvasRef} />
        <div className="ap-zoom">
          <button className="btn icona" aria-label="Ingrandisci" onClick={() => setZoom((z) => Math.min(12, z * 1.4))}>
            ＋
          </button>
          <button className="btn icona" aria-label="Rimpicciolisci" onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))}>
            −
          </button>
          <button className="btn icona" aria-label="Adatta allo schermo" onClick={adatta}>
            <Icona nome="mirino" dimensione={18} />
          </button>
        </div>
        <div className="ap-legenda">
          {numero === 1
            ? 'Un pezzo solo: aggiungi un pannello per creare una giunzione.'
            : conAbbondanze
              ? 'Trascina la pallina gialla per spostare la giunzione. Il tratteggio verde è il pezzo da tagliare, abbondanze comprese.'
              : 'Trascina una pallina gialla per spostare la giunzione. Due dita per zoomare.'}
        </div>
      </div>

      {!soloDisegno && (
        <div className="ap-comandi">
          <div className="ap-riepilogo">
            <span>
              <strong>{numero}</strong> {numero === 1 ? 'pannello' : 'pannelli'}
            </span>
            <span>
              vetro {formattaNumero(arrotonda(L))} × {formattaNumero(arrotonda(A))} {unita}
            </span>
            {conAbbondanze && (
              <span>
                abbondanze {formattaNumero(arrotonda(abb.sinistra))} sx ·{' '}
                {formattaNumero(arrotonda(abb.destra))} dx · {formattaNumero(arrotonda(abb.sopra))}{' '}
                sopra · {formattaNumero(arrotonda(abb.sotto))} sotto
              </span>
            )}
            {materialeInPiu > 0 && (
              <span>
                +{formattaNumero(arrotonda(materialeInPiu))} {unita} di sormonto
              </span>
            )}
          </div>

          {troppoLarghi.length > 0 && (
            <div className="ap-avviso">
              {troppoLarghi.length === 1 ? 'Un pannello supera' : `${troppoLarghi.length} pannelli superano`}{' '}
              la larghezza utile ({formattaNumero(arrotonda(massimo))} {unita}): non entrerebbero nel
              supporto.
            </div>
          )}

          <span className="et">Come si divide</span>
          <div className="segmenti" role="group" aria-label="Verso delle giunzioni">
            <button
              className={pann.asse === 'verticale' ? 'attivo' : ''}
              onClick={() => ridistribuisci({ asse: 'verticale' })}
            >
              ↕ Giunzioni verticali
            </button>
            <button
              className={pann.asse === 'orizzontale' ? 'attivo' : ''}
              onClick={() => ridistribuisci({ asse: 'orizzontale' })}
            >
              ↔ Giunzioni orizzontali
            </button>
          </div>

          <div className="ap-numero">
            <span className="et">Quanti pannelli</span>
            <div className="ap-contatore">
              <button
                className="btn icona"
                aria-label="Un pannello in meno"
                disabled={numero <= 1}
                onClick={() => cambiaNumero(numero - 1)}
              >
                −
              </button>
              <strong>{numero}</strong>
              <button
                className="btn icona"
                aria-label="Un pannello in più"
                onClick={() => cambiaNumero(numero + 1)}
              >
                ＋
              </button>
            </div>
          </div>

          <div className="segmenti" role="group" aria-label="Come distribuire i pannelli">
            {MODI.map((m) => (
              <button
                key={m.id}
                className={modo === m.id ? 'attivo' : ''}
                onClick={() => {
                  setModo(m.id);
                  ridistribuisci({ modo: m.id, numero: m.id === 'fascia' ? null : numero });
                }}
              >
                {m.nome}
              </button>
            ))}
          </div>

          <div className="nest-campi">
            <label className="campo">
              <span>Larghezza utile ({unita})</span>
              <CampoNumero
                valore={massimo}
                min={0}
                onCambia={(v) => {
                  // riscrivere lo stesso numero non è una modifica: le
                  // giunzioni spostate a mano restano dove sono
                  if (v === massimo) return;
                  setMassimo(v);
                  // scrivere una fascia vuol dire «falli stare qui dentro»:
                  // altrimenti il campo non produrrebbe niente di visibile
                  if (v > 0) {
                    setModo('fascia');
                    ridistribuisci({ massimo: v, modo: 'fascia' });
                  }
                }}
              />
              <small>
                {massimo > 0
                  ? (forma.fonteMassimo ?? 'Nessun telo può superarla')
                  : '0 = nessun limite: comanda il numero di teli'}
              </small>
            </label>
            <label className="campo">
              <span>Sormonto ({unita})</span>
              <CampoNumero
                valore={pann.sormonto}
                min={0}
                onCambia={(v) => {
                  if (v === pann.sormonto) return;
                  // a «fascia» il sormonto entra nel conto della larghezza:
                  // cambiarlo senza ridistribuire farebbe sforare i teli
                  if (modo === 'fascia' && massimo > 0) ridistribuisci({ sormonto: v });
                  else setPann((p) => ({ ...p, sormonto: v }));
                }}
              />
              <small>Sovrapposizione fra due teli</small>
            </label>
          </div>

          <span className="et">Quale lembo sta sopra</span>
          <div className="segmenti" role="group" aria-label="Verso del sormonto">
            {versi.map((v) => (
              <button
                key={v.id}
                className={pann.verso === v.id ? 'attivo' : ''}
                onClick={() => setPann((p) => ({ ...p, verso: v.id }))}
              >
                {v.nome}
              </button>
            ))}
          </div>

          {pann.giunti.length > 0 && (
            <>
              <span className="et">
                Giunzioni — distanza dal {pann.asse === 'verticale' ? 'lato sinistro' : 'bordo alto'}
              </span>
              <div className="ap-giunti">
                {pann.giunti.map((g, i) => (
                  <label className="ap-giunto" key={i}>
                    <span>{i + 1}ª</span>
                    <CampoNumero
                      valore={arrotonda(g)}
                      min={0}
                      etichetta={`Posizione della giunzione ${i + 1}`}
                      onCambia={(v) => setPann((p) => spostaGiunto(p, i, v, totale))}
                    />
                    <small>{unita}</small>
                  </label>
                ))}
              </div>
            </>
          )}

          <span className="et">Pezzi da tagliare</span>
          <div className="ap-elenco">
            {pannelli.map((p) => (
              <div className="ap-pezzo" key={p.indice}>
                <span className="n">
                  {forma.nome} {p.indice}/{numero}
                </span>
                <span className="d">
                  {formattaNumero(arrotonda(pann.asse === 'verticale' ? p.larghezza : p.altezza))} ×{' '}
                  {formattaNumero(arrotonda(pann.asse === 'verticale' ? p.altezza : p.larghezza))}{' '}
                  {unita}
                </span>
              </div>
            ))}
          </div>
          <p className="nest-sub">
            Si divide il <strong>vetro</strong>: la giunzione cade dove la vedi cadere. Le misure
            dei pezzi comprendono il sormonto — {formattaNumero(arrotonda(sb.inizio))} +{' '}
            {formattaNumero(arrotonda(sb.fine))} {unita} attorno a ogni giunzione — e, sui teli di
            bordo, l’abbondanza di quel lato.{' '}
            {conAbbondanze
              ? 'Il filetto verde tratteggiato è il contorno di ogni pezzo, abbondanze comprese.'
              : ''}
          </p>
        </div>
      )}

      <div className="eq-azioni">
        {iniziale && (
          <button className="btn" onClick={() => onConferma(null)}>
            Togli
          </button>
        )}
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          onClick={() => onConferma(numero <= 1 ? null : pann)}
        >
          {numero <= 1 ? 'Lascia intero' : `Applica ${numero} pannelli`}
        </button>
      </div>
    </div>
  );
}

/** la misura lungo l'asse di divisione */
function sceltaTotale(asse: AssePannelli, larghezza: number, altezza: number): number {
  return asse === 'verticale' ? larghezza : altezza;
}

/** 1 cm, nell'unità di chi chiama */
function sormontoIniziale(unita: string): number {
  if (unita === 'mm') return 10;
  if (unita === 'm') return 0.01;
  return 1;
}

const arrotonda = (v: number) => Math.round(v * 100) / 100;

/** distanza di un punto da un segmento, in pixel di schermo */
function distanzaDaSegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lunghezza = dx * dx + dy * dy;
  if (lunghezza < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lunghezza;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
