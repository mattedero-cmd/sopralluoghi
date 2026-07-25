import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Shape, Circle, Rect, Line } from 'react-konva';
import type Konva from 'konva';

/** true con mouse/trackpad (puntatore fine): la lente di ingrandimento, utile
 *  col dito che copre il punto, non serve e viene nascosta */
const PUNTATORE_FINE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
import {
  COLORE_QUOTA_TECNICA,
  quadrilateroQuotaRett,
  segmentiPoligono,
  type Annotazione,
  type Foto,
  type PianoProspettiva,
  type Punto,
  type RegioneCensura,
  type Rettangolo,
  type SottotipoQuota,
  type TipoForma
} from '../db/types';
import { primitiveAnnotazione, primitiveCatene, latiQuotaRett } from '../geometry/primitive';
import { geometriaQuota, posizioneEtichettaBase, posizioneEtichettaPoligono } from '../geometry/primitive';
import { geomQuotaDistanza } from '../geometry/parametrico';
import { disegnaPrimitiva } from '../render/renderAnnotata';
import type { ImmagineDisegnabile } from '../utils/image';
import { puntiAggancio, snapPunto } from '../geometry/snap';
import {
  circumcentro,
  distanza,
  dot,
  normale,
  normalizza,
  scala as scalaVett,
  somma,
  sottrai,
  vincolaAngolo,
  vincolaOrto
} from '../geometry/punti';
import type { RicercaBordi } from '../geometry/bordi';
import { traslaAnnotazione } from './fabbrica';
import { immagineDettaglio } from '../utils/immaginiCallout';
import { eFormaEtichettabile, vociLegenda } from '../geometry/nomenclatura';
import { omografiaPianoInversa } from '../geometry/omografia';

export type Strumento =
  | 'seleziona'
  | 'auto'
  | 'quotaO'
  | 'quotaV'
  | 'quotaA'
  | 'rettangolo'
  | 'quad'
  | 'tri'
  | 'polilinea'
  | 'angolo'
  | 'raggio'
  | 'cerchio3p'
  | 'testo'
  | 'disegno'
  | 'schizzo'
  | 'freccia'
  | 'callout'
  | 'calibra'
  | 'piano'
  | 'riferimento'
  | 'etichetta'
  // schizzo parametrico: modalità "applica vincolo" a tocchi (tap-tap)
  | 'vincolo'
  // schizzo parametrico: DISEGNO degli oggetti interni (trascina sul canvas)
  | 'oggRett'
  | 'oggCerchio'
  // privacy: riquadri di oscuramento dei volti (si tracciano come rettangoli)
  | 'censura'
  // forme di disegno generiche (menu generico, Fase 1b)
  | 'forLinea'
  | 'forRett'
  | 'forCerchio'
  | 'forPoligono'
  // quotatura tecnica (menu tecnico, Fasi 2+)
  | 'tecSerie'
  | 'tecParallelo'
  | 'tecProgressiva'
  | 'tecForo'
  | 'tecSmusso'
  | 'tecFilettatura'
  | 'tecDatum';

/**
 * Strumenti a due punti: ciascun punto viene fissato SOLO al rilascio
 * del dito (premi → aggiusta con la lente → rilascia), così il primo
 * punto non va mai corretto a posteriori.
 */
function strumentoDuePunti(s: Strumento): boolean {
  return (
    s === 'quotaO' ||
    s === 'quotaV' ||
    s === 'quotaA' ||
    s === 'rettangolo' ||
    s === 'freccia' ||
    s === 'raggio' ||
    s === 'calibra' ||
    s === 'forLinea' ||
    s === 'forRett' ||
    s === 'forCerchio' ||
    s === 'oggRett' ||
    s === 'oggCerchio' ||
    s === 'censura' ||
    s === 'tecSmusso'
  );
}

/** Vincolo direzionale: nessuno, orto (H/V) o snap angolare a 15° */
export type ModalitaVincolo = 'off' | 'orto' | 'angolo15';

interface Props {
  foto: Foto;
  immagine: ImmagineDisegnabile;
  annotazioni: Annotazione[];
  /** codice locale (es. A1) di una forma, calcolato con la numerazione del progetto */
  codiceForma: (a: Annotazione) => string;
  selezioneId: string | null;
  strumento: Strumento;
  snapAttivo: boolean;
  vincolo: ModalitaVincolo;
  sogliaSnap: number;
  /** snap ai bordi dell'immagine (rilevamento contorni), se attivo */
  ricercaBordi: RicercaBordi | null;
  /** layer: quali categorie di annotazioni mostrare */
  filtroVisibile: (a: Annotazione) => boolean;
  /** quote proposte dall'autoquotatura, in attesa di conferma */
  proposte: Annotazione[];
  onSeleziona: (id: string | null) => void;
  /** tocco "secco" (senza trascinamento) su un'annotazione: apre la modifica */
  onModifica: (id: string) => void;
  /** tocco sull'etichetta di una quota di uno schizzo (perimetro selezionato):
   *  apre la modifica INLINE del valore sul canvas, senza editor dedicato.
   *  `indice` = segmento; `cliente` = posizione in pixel schermo del tocco. */
  onQuotaInline?: (indice: number, cliente: { x: number; y: number }) => void;
  /** tocco sull'etichetta di una quota di DISTANZA oggetto–lato dello schizzo:
   *  apre la modifica inline (id del vincolo + posizione schermo). */
  onDistanzaInline?: (vincoloId: string, cliente: { x: number; y: number }) => void;
  /** tocco in modalità "vincolo" (tap-tap): riporta il punto toccato in
   *  coordinate immagine (per trovare lato/vertice/oggetto più vicino) e in
   *  pixel schermo (per ancorare eventuali campi inline). */
  onPuntoVincolo?: (p: Punto, cliente: { x: number; y: number }) => void;
  /** punti SELEZIONABILI del comando armato (vertici, centri-lato, centri):
   *  disegnati come pallini rossi, discreti ma visibili. */
  puntiSelezionabili?: Punto[] | null;
  /** PRIVACY: regioni oscurate della foto, mostrate e modificabili solo
   *  mentre è attivo lo strumento «censura» */
  censure?: RegioneCensura[];
  /** nuovo riquadro di oscuramento tracciato sulla foto */
  onNuovaCensura?: (p1: Punto, p2: Punto) => void;
  /** tocco su un riquadro esistente: lo toglie */
  onRimuoviCensura?: (id: string) => void;
  /** oggetto dello schizzo DISEGNATO sul canvas (strumenti oggRett/oggCerchio):
   *  rettangolo → i due angoli; cerchio → centro e bordo. */
  onNuovoOggettoPianta?: (tipo: 'rettangolo' | 'cerchio', a: Punto, b: Punto) => void;
  /** oggetto dello schizzo selezionato (oggetti "a sé stanti") */
  oggettoSelezionato?: { annId: string; oggettoId: string } | null;
  /** tocco su un oggetto dello schizzo: lo seleziona come entità autonoma */
  onSelezionaOggetto?: (annId: string, oggettoId: string) => void;
  /** trascinamento di un oggetto dello schizzo: sposta e committa */
  onSpostaOggetto?: (annId: string, oggettoId: string, dx: number, dy: number) => void;
  /** tocco secco sull'oggetto GIÀ selezionato: apre le dimensioni */
  onTapOggettoSelezionato?: (cliente: { x: number; y: number }) => void;
  /** tocco con lo strumento autoquotatura */
  onAutoTocco: (p: Punto) => void;
  /** tocco con lo strumento "riferimento": rileva il rettangolo di un oggetto
   *  di dimensione nota per calibrare il piano automaticamente */
  onRiferimento: (p: Punto) => void;
  /** rettangolo di calibrazione in fase di correzione (4 angoli trascinabili) */
  calibQuad: [Punto, Punto, Punto, Punto] | null;
  onCalibQuad: (punti: [Punto, Punto, Punto, Punto]) => void;
  /** piano provvisorio (calibQuad + formato) per la griglia live in calibrazione */
  calibPiano: PianoProspettiva | null;
  /** SECONDO stadio: griglia proiettata con i 4 angoli ESTERNI trascinabili */
  calibGrigliaPiano: PianoProspettiva | null;
  onCalibGrigliaCorner: (punti: [Punto, Punto, Punto, Punto]) => void;
  /** mostra la griglia di verifica sul piano calibrato */
  mostraGriglia: boolean;
  /** numero di celle della griglia (es. 3 → 3×3 attorno al riferimento) */
  celleGriglia: number;
  /** inquadra automaticamente un'area dell'immagine (zoom sul riferimento) */
  inquadra: Rettangolo | null;
  /** modalità duplica misura: un tocco sulla foto crea una copia in quel punto */
  onDuplica: ((p: Punto) => void) | null;
  /** evidenziatura con lo strumento autoquotatura (oggetto completo) */
  onAutoTraccia: (punti: Punto[]) => void;
  onCommit: (annotazioni: Annotazione[]) => void;
  onNuovaQuota: (p1: Punto, p2: Punto, sottotipo: SottotipoQuota) => void;
  onNuovoRett: (rect: Rettangolo) => void;
  /** elemento da 4 angoli toccati direttamente (prospettiva qualsiasi) */
  onNuovoQuad: (punti: [Punto, Punto, Punto, Punto]) => void;
  /** elemento poligonale (triangolo, pentagono…) da N angoli toccati */
  onNuovoPoligono: (punti: Punto[]) => void;
  onNuovoAngolo: (vertice: Punto, a: Punto, b: Punto) => void;
  onNuovoRaggio: (centro: Punto, bordo: Punto) => void;
  /** cerchio da 3 punti sull'arco: il centro è calcolato dal circumcentro */
  onNuovoCerchio3p: (centro: Punto, bordo: Punto) => void;
  /** posizione del riquadro; se `ancora` è presente è una nota con freccia */
  onNuovoTesto: (posizione: Punto, ancora?: Punto) => void;
  /** nuova etichetta alfabetica posata con un tap (modalità Note) */
  onNuovaEtichetta: (posizione: Punto) => void;
  /** tap prolungato in modalità etichetta: apre il menu circolare (coord schermo) */
  onMenuEtichetta: (schermo: Punto) => void;
  onNuovaFreccia: (p1: Punto, p2: Punto) => void;
  onNuovoDisegno: (punti: number[]) => void;
  /** schizzo a mano libera della pianta: viene raddrizzato in un poligono */
  onNuovoSchizzo: (punti: number[]) => void;
  /** nuova forma di disegno generica (linea/rettangolo/cerchio/poligono) */
  onNuovaForma: (forma: TipoForma, punti: Punto[]) => void;
  /** punto posato in modalità quotatura tecnica (catena in serie) */
  onPuntoTecnico: (p: Punto) => void;
  /** posa di un riferimento/datum con un tap singolo */
  onNuovoDatum: (p: Punto) => void;
  /** quotatura foro: tre tap sul bordo → centro e ⌀/R */
  onNuovoForo: (p0: Punto, p1: Punto, p2: Punto) => void;
  /** smusso: due tap sugli estremi del segmento smussato */
  onNuovoSmusso: (a: Punto, b: Punto) => void;
  /** filettatura: un tap sull'ancora → callout normalizzata */
  onNuovaFilettatura: (ancora: Punto) => void;
  /** punti già posati della quota tecnica in corso (anteprima); null = inattivo */
  puntiTecnici: Punto[] | null;
  onNuovoCallout: (sorgente: Rettangolo) => void;
  onCalibra: (p1: Punto, p2: Punto) => void;
  onPiano: (punti: [Punto, Punto, Punto, Punto]) => void;
  /** segnala un errore geometrico (es. punti collineari nel cerchio a 3p) */
  onErrore?: (msg: string) => void;
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
  | { tipo: 'rett'; p1: Punto; p2: Punto }
  | { tipo: 'disegno'; punti: number[] }
  | { tipo: 'callout'; inizio: Punto; corrente: Punto }
  | { tipo: 'angolo'; punti: Punto[] }
  | { tipo: 'quad'; punti: Punto[] }
  | { tipo: 'poli'; punti: Punto[]; lati: number }
  | { tipo: 'cerchio3p'; punti: Punto[] }
  | { tipo: 'piano'; punti: Punto[] }
  | { tipo: 'forLinea'; p1: Punto; p2: Punto }
  | { tipo: 'forRett'; p1: Punto; p2: Punto }
  | { tipo: 'forCerchio'; centro: Punto; bordo: Punto }
  | { tipo: 'forPoli'; punti: Punto[] }
  | { tipo: 'tecSmusso'; p1: Punto; p2: Punto }
  | null;

/** primo punto già fissato di una bozza a due punti */
function puntoFisso(b: Bozza): Punto | null {
  if (!b) return null;
  switch (b.tipo) {
    case 'quota':
    case 'freccia':
    case 'calibra':
    case 'rett':
    case 'forLinea':
    case 'forRett':
    case 'tecSmusso':
      return b.p1;
    case 'raggio':
    case 'forCerchio':
      return b.centro;
    default:
      return null;
  }
}

/** aggiorna il secondo punto di una bozza a due punti */
function conSecondoPunto(b: NonNullable<Bozza>, punto: Punto): NonNullable<Bozza> {
  switch (b.tipo) {
    case 'quota':
    case 'freccia':
    case 'calibra':
    case 'rett':
    case 'forLinea':
    case 'forRett':
    case 'tecSmusso':
      return { ...b, p2: punto };
    case 'raggio':
    case 'forCerchio':
      return { ...b, bordo: punto };
    default:
      return b;
  }
}

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
  /**
   * Punto sotto il dito durante un gesto: alimenta la lente di
   * ingrandimento per il posizionamento di precisione.
   */
  const [puntoLente, setPuntoLente] = useState<Punto | null>(null);
  /**
   * Punto in attesa per gli strumenti a tocco singolo (angolo, piano,
   * testo): si fissa al rilascio del dito, così si può aggiustare la
   * posizione guardando la lente.
   */
  const [puntoPendente, setPuntoPendente] = useState<Punto | null>(null);
  /** tratto dell'evidenziatore (strumento auto): coordinate piatte */
  const [tracciaAuto, setTracciaAuto] = useState<number[] | null>(null);
  const pinch = useRef<{ dist: number; centro: Punto } | null>(null);
  const disegnoAttivo = useRef(false);
  /** punto iniziale del testo: se si trascina diventa l'ancora della freccia */
  const inizioTesto = useRef<Punto | null>(null);
  /** contatore per ridisegnare quando una foto-dettaglio finisce di caricarsi */
  const [, setVersioneDettagli] = useState(0);
  /** true mentre due o più dita sono sullo schermo (zoom/pan): niente select/drag */
  const gestoMulti = useRef(false);
  /** versione "stato" del gesto a due dita: disattiva il pan a un dito dello
   *  Stage, che altrimenti combatte con lo zoom pinch e fa "scappare" la foto */
  const [zoomInCorso, setZoomInCorso] = useState(false);
  /** tap prolungato in modalità etichetta → apre il menu circolare delle lettere */
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  const pressStart = useRef<Punto | null>(null);
  const annullaLongPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  /** punto attualmente agganciato: dà isteresi allo snap (resta agganciato
   *  finché il dito non si allontana oltre la soglia di rilascio) */
  const snapCorrente = useRef<Punto | null>(null);

  // I drafting multi-tocco (angolo, piano) si azzerano al cambio strumento
  useEffect(() => {
    setBozza(null);
    setPuntoPendente(null);
    setPuntoLente(null);
    setTracciaAuto(null);
    disegnoAttivo.current = false;
    annullaLongPress();
    pressFired.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // zoom automatico su un'area (riferimento di calibrazione, griglia…)
  const inquadrato = useRef<Rettangolo | null>(null);
  useEffect(() => {
    const box = p.inquadra;
    if (!box || dimensioni.w === 0 || inquadrato.current === box) return;
    inquadrato.current = box;
    const pad = 1.7; // margine attorno all'area
    const scala = Math.min(
      SCALA_MAX,
      Math.max(SCALA_MIN, Math.min(dimensioni.w / (box.width * pad), dimensioni.h / (box.height * pad)))
    );
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    setVista({ scala, x: dimensioni.w / 2 - cx * scala, y: dimensioni.h / 2 - cy * scala });
  }, [p.inquadra, dimensioni]);

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
        snapCorrente.current = esito.punto;
        setIndicatoreSnap(esito.punto);
        return esito.punto;
      }
      // ISTERESI: una volta agganciato, resta sul punto finché il dito non si
      // allontana oltre una soglia di RILASCIO più ampia. Evita il tremolio
      // "prende/lascia a ogni pixel" sul bordo della soglia o quando il punto
      // agganciato viene escluso dai candidati perché coincide col dito.
      if (snapCorrente.current && distanza(punto, snapCorrente.current) <= soglia * 1.8) {
        setIndicatoreSnap(snapCorrente.current);
        return snapCorrente.current;
      }
    }
    if (p.ricercaBordi) {
      const bordo = p.ricercaBordi.cerca(punto, soglia);
      if (bordo) {
        snapCorrente.current = bordo;
        setIndicatoreSnap(bordo);
        return bordo;
      }
    }
    snapCorrente.current = null;
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
    // pinch del trackpad / ctrl(⌘)+rotella = ZOOM; rotella o scroll a due dita = PAN.
    // Su Mac lo scroll a due dita è il gesto naturale per spostarsi.
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const pos = stage.getPointerPosition();
      const fattore = Math.exp(-e.evt.deltaY * 0.01);
      zoomVerso(pos ?? { x: dimensioni.w / 2, y: dimensioni.h / 2 }, fattore);
    } else {
      setVista((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
    }
  };

  const suTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    // appena un secondo dito tocca lo schermo si entra in "gesto a due dita":
    // da qui in poi nessuna annotazione va selezionata o spostata, solo zoom/pan
    if (e.evt.touches.length >= 2) {
      gestoMulti.current = true;
      setZoomInCorso(true);
      // ferma SUBITO l'eventuale pan a un dito dello Stage già iniziato
      stageRef.current?.stopDrag();
      if (bozza) setBozza(null);
      setPuntoPendente(null);
      setPuntoLente(null);
      setTracciaAuto(null);
      disegnoAttivo.current = false;
      annullaLongPress();
    }
  };

  const suTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    // due dita: pinch zoom + pan; qualunque bozza viene annullata
    gestoMulti.current = true;
    if (bozza) setBozza(null);
    setPuntoPendente(null);
    setPuntoLente(null);
    setTracciaAuto(null);
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

  const suTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    pinch.current = null;
    // si esce dal gesto solo quando TUTTE le dita sono state sollevate, così
    // togliendo un dito alla volta non parte uno spostamento involontario
    if (e.evt.touches.length === 0) {
      gestoMulti.current = false;
      setZoomInCorso(false);
    }
  };

  // -------------------------------------------------------------------------
  // Creazione annotazioni (bozze)
  // -------------------------------------------------------------------------

  /** punto elaborato per gli strumenti a due punti (snap + vincolo) */
  const elaboraPuntoDue = (pos: Punto): Punto => {
    const fisso = puntoFisso(bozza);
    let punto =
      p.strumento === 'freccia' ? pos : applicaSnap(pos, fisso ? [fisso] : undefined);
    if (fisso && (p.strumento === 'quotaA' || p.strumento === 'freccia')) {
      punto = applicaVincolo(fisso, punto);
    }
    return punto;
  };

  const suPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (e.evt instanceof PointerEvent && e.evt.isPrimary === false) return;
    // nuovo gesto: azzera l'isteresi dello snap (incluso l'inizio del trascinamento
    // di una maniglia, così il secondo punto di una bozza non resta agganciato al primo)
    snapCorrente.current = null;
    const pos = posImmagine();
    if (!pos) return;

    if (p.strumento === 'seleziona') {
      if (e.target === stage || e.target.name() === 'sfondo-foto') {
        // in modalità duplica il tocco sul vuoto NON deseleziona (la copia
        // viene creata sull'onClick/onTap, che non scatta dopo un trascinamento)
        if (!p.onDuplica) p.onSeleziona(null);
      }
      return;
    }

    // PRIVACY: con lo strumento «censura» un tocco DENTRO un riquadro
    // esistente lo toglie. Va gestito qui, prima degli strumenti a due punti:
    // il pointerdown arriva sullo Stage prima del click sulla forma, e senza
    // questo controllo il tocco avvierebbe il tracciamento di un rettangolo
    // nuovo invece di rimuovere quello toccato.
    // Se un rettangolo è già in tracciamento, il tocco lo chiude (non rimuove).
    if (p.strumento === 'censura' && !puntoFisso(bozza)) {
      const sopra = [...(p.censure ?? [])]
        .reverse()
        .find(
          (c) =>
            pos.x >= c.x &&
            pos.x <= c.x + c.larghezza &&
            pos.y >= c.y &&
            pos.y <= c.y + c.altezza
        );
      if (sopra) {
        p.onRimuoviCensura?.(sopra.id);
        return;
      }
    }

    // strumenti a due punti: ogni punto si fissa al rilascio
    if (strumentoDuePunti(p.strumento)) {
      const punto = elaboraPuntoDue(pos);
      setPuntoPendente(punto);
      setPuntoLente(punto);
      if (bozza && puntoFisso(bozza)) setBozza(conSecondoPunto(bozza, punto));
      disegnoAttivo.current = true;
      return;
    }

    switch (p.strumento) {
      case 'disegno':
      case 'schizzo': {
        setBozza({ tipo: 'disegno', punti: [pos.x, pos.y] });
        setPuntoLente(pos);
        disegnoAttivo.current = true;
        break;
      }
      case 'callout': {
        setBozza({ tipo: 'callout', inizio: pos, corrente: pos });
        setPuntoLente(pos);
        disegnoAttivo.current = true;
        break;
      }
      // strumenti a punto singolo: premi → aggiusta con la lente → rilascia
      case 'testo': {
        inizioTesto.current = pos;
        setPuntoPendente(pos);
        setPuntoLente(pos);
        disegnoAttivo.current = true;
        break;
      }
      // auto: tocco singolo oppure evidenziatura dell'oggetto completo
      case 'auto': {
        setPuntoPendente(pos);
        setPuntoLente(pos);
        setTracciaAuto([pos.x, pos.y]);
        disegnoAttivo.current = true;
        break;
      }
      // riferimento: tocco singolo sull'oggetto di dimensione nota
      case 'riferimento': {
        setPuntoPendente(pos);
        setPuntoLente(pos);
        disegnoAttivo.current = true;
        break;
      }
      // datum/filettatura tecnici: tocco singolo (con snap) per posare l'ancora
      case 'tecDatum':
      case 'tecFilettatura': {
        setPuntoPendente(applicaSnap(pos));
        setPuntoLente(pos);
        disegnoAttivo.current = true;
        break;
      }
      // vincolo (schizzo): tocco singolo grezzo, il lato più vicino lo trova
      // il chiamante — niente snap ai vertici (sarebbe ambiguo tra due lati)
      case 'vincolo': {
        setPuntoPendente(pos);
        setPuntoLente(pos);
        disegnoAttivo.current = true;
        break;
      }
      // etichetta: tocco singolo → posa la lettera attiva; tap prolungato →
      // apre il menu circolare delle lettere SENZA posare nulla
      case 'etichetta': {
        setPuntoPendente(pos);
        setPuntoLente(pos);
        disegnoAttivo.current = true;
        pressFired.current = false;
        pressStart.current = pos;
        const cx = e.evt.clientX;
        const cy = e.evt.clientY;
        annullaLongPress();
        pressTimer.current = setTimeout(() => {
          pressTimer.current = null;
          pressFired.current = true;
          disegnoAttivo.current = false;
          setPuntoPendente(null);
          setPuntoLente(null);
          p.onMenuEtichetta({ x: cx, y: cy });
        }, 450);
        break;
      }
      case 'angolo':
      case 'quad':
      case 'tri':
      case 'polilinea':
      case 'cerchio3p':
      case 'piano':
      case 'forPoligono':
      case 'tecSerie':
      case 'tecParallelo':
      case 'tecProgressiva':
      case 'tecForo': {
        const punto = applicaSnap(pos);
        setPuntoPendente(punto);
        setPuntoLente(punto);
        disegnoAttivo.current = true;
        break;
      }
    }
  };

  /** conferma del punto pendente al rilascio */
  const confermaPuntoPendente = (punto: Punto) => {
    if (p.strumento === 'vincolo') {
      // posizione schermo del punto (per ancorare i campi inline): dal punto
      // IMMAGINE via la vista, così vale anche se il dito si è già alzato
      const rect = stageRef.current?.container().getBoundingClientRect();
      const cliente = rect
        ? {
            x: rect.left + vista.x + punto.x * vista.scala,
            y: rect.top + vista.y + punto.y * vista.scala
          }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      p.onPuntoVincolo?.(punto, cliente);
      return;
    }
    if (p.strumento === 'testo') {
      const inizio = inizioTesto.current;
      inizioTesto.current = null;
      // trascinamento netto → nota con freccia: ancora = primo tocco,
      // riquadro = punto di rilascio. Tocco singolo → testo semplice.
      if (inizio && distanza(inizio, punto) > 18 / vista.scala) {
        p.onNuovoTesto(punto, inizio);
      } else {
        p.onNuovoTesto(punto);
      }
      return;
    }
    if (p.strumento === 'auto') {
      // se il dito ha tracciato un segno esteso → evidenziatura
      // dell'oggetto completo; altrimenti tocco singolo
      const traccia = tracciaAuto;
      setTracciaAuto(null);
      if (traccia && traccia.length >= 4) {
        let x1 = Infinity;
        let x2 = -Infinity;
        let y1 = Infinity;
        let y2 = -Infinity;
        for (let i = 0; i < traccia.length; i += 2) {
          x1 = Math.min(x1, traccia[i]);
          x2 = Math.max(x2, traccia[i]);
          y1 = Math.min(y1, traccia[i + 1]);
          y2 = Math.max(y2, traccia[i + 1]);
        }
        const estensione = Math.hypot(x2 - x1, y2 - y1);
        if (estensione > 24 / vista.scala) {
          const punti: Punto[] = [];
          for (let i = 0; i < traccia.length; i += 2) {
            punti.push({ x: traccia[i], y: traccia[i + 1] });
          }
          p.onAutoTraccia(punti);
          return;
        }
      }
      p.onAutoTocco(punto);
      return;
    }
    if (p.strumento === 'riferimento') {
      p.onRiferimento(punto);
      return;
    }
    if (p.strumento === 'tecDatum') {
      p.onNuovoDatum(punto);
      return;
    }
    if (p.strumento === 'tecFilettatura') {
      p.onNuovaFilettatura(punto);
      return;
    }
    if (p.strumento === 'etichetta') {
      p.onNuovaEtichetta(punto);
      return;
    }
    if (strumentoDuePunti(p.strumento)) {
      const fisso = puntoFisso(bozza);
      if (!fisso) {
        // primo punto fissato: si attende il secondo
        switch (p.strumento) {
          case 'quotaO':
          case 'quotaV':
          case 'quotaA': {
            const sottotipo: SottotipoQuota =
              p.strumento === 'quotaO'
                ? 'orizzontale'
                : p.strumento === 'quotaV'
                  ? 'verticale'
                  : 'allineata';
            setBozza({ tipo: 'quota', sottotipo, p1: punto, p2: punto });
            break;
          }
          case 'freccia':
            setBozza({ tipo: 'freccia', p1: punto, p2: punto });
            break;
          case 'raggio':
            setBozza({ tipo: 'raggio', centro: punto, bordo: punto });
            break;
          case 'calibra':
            setBozza({ tipo: 'calibra', p1: punto, p2: punto });
            break;
          case 'rettangolo':
            setBozza({ tipo: 'rett', p1: punto, p2: punto });
            break;
          case 'forLinea':
            setBozza({ tipo: 'forLinea', p1: punto, p2: punto });
            break;
          case 'forRett':
          case 'oggRett':
          case 'censura':
            setBozza({ tipo: 'forRett', p1: punto, p2: punto });
            break;
          case 'forCerchio':
          case 'oggCerchio':
            setBozza({ tipo: 'forCerchio', centro: punto, bordo: punto });
            break;
          case 'tecSmusso':
            setBozza({ tipo: 'tecSmusso', p1: punto, p2: punto });
            break;
        }
        return;
      }
      // secondo punto: troppo vicino al primo → si resta in attesa
      const minimo = 8 / vista.scala;
      if (distanza(fisso, punto) < minimo) return;
      const b = conSecondoPunto(bozza!, punto);
      setBozza(null);
      switch (b.tipo) {
        case 'quota':
          p.onNuovaQuota(b.p1, b.p2, b.sottotipo);
          break;
        case 'freccia':
          p.onNuovaFreccia(b.p1, b.p2);
          break;
        case 'raggio':
          p.onNuovoRaggio(b.centro, b.bordo);
          break;
        case 'calibra':
          if (distanza(b.p1, b.p2) >= minimo * 2) p.onCalibra(b.p1, b.p2);
          break;
        case 'rett':
          p.onNuovoRett(normalizzaRect(b.p1, b.p2));
          break;
        case 'forLinea':
          p.onNuovaForma('linea', [b.p1, b.p2]);
          break;
        case 'forRett':
          // lo stesso trascinamento disegna una forma libera, un OGGETTO
          // dello schizzo o un riquadro di oscuramento, secondo lo strumento
          if (p.strumento === 'oggRett') p.onNuovoOggettoPianta?.('rettangolo', b.p1, b.p2);
          else if (p.strumento === 'censura') p.onNuovaCensura?.(b.p1, b.p2);
          else p.onNuovaForma('rettangolo', [b.p1, b.p2]);
          break;
        case 'forCerchio':
          if (p.strumento === 'oggCerchio') p.onNuovoOggettoPianta?.('cerchio', b.centro, b.bordo);
          else p.onNuovaForma('cerchio', [b.centro, b.bordo]);
          break;
        case 'tecSmusso':
          p.onNuovoSmusso(b.p1, b.p2);
          break;
      }
      return;
    }
    if (p.strumento === 'forPoligono') {
      const correnti = bozza?.tipo === 'forPoli' ? bozza.punti : [];
      if (correnti.length >= 3) {
        const sogliaChiusura = Math.max(p.sogliaSnap, 18 / vista.scala);
        if (distanza(punto, correnti[0]) <= sogliaChiusura) {
          setBozza(null);
          p.onNuovaForma('poligono', correnti);
          return;
        }
      }
      setBozza({ tipo: 'forPoli', punti: [...correnti, punto] });
      return;
    }
    if (
      p.strumento === 'tecSerie' ||
      p.strumento === 'tecParallelo' ||
      p.strumento === 'tecProgressiva'
    ) {
      // i punti sono gestiti dal genitore (anteprima + "Genera")
      p.onPuntoTecnico(punto);
      return;
    }
    if (p.strumento === 'angolo') {
      const punti = bozza?.tipo === 'angolo' ? [...bozza.punti, punto] : [punto];
      if (punti.length === 3) {
        setBozza(null);
        p.onNuovoAngolo(punti[0], punti[1], punti[2]);
      } else {
        setBozza({ tipo: 'angolo', punti });
      }
      return;
    }
    if (p.strumento === 'quad') {
      const punti = bozza?.tipo === 'quad' ? [...bozza.punti, punto] : [punto];
      if (punti.length === 4) {
        setBozza(null);
        p.onNuovoQuad(punti as [Punto, Punto, Punto, Punto]);
      } else {
        setBozza({ tipo: 'quad', punti });
      }
      return;
    }
    if (p.strumento === 'tri') {
      const punti = bozza?.tipo === 'poli' ? [...bozza.punti, punto] : [punto];
      if (punti.length === 3) {
        setBozza(null);
        p.onNuovoPoligono(punti);
      } else {
        setBozza({ tipo: 'poli', punti, lati: 3 });
      }
      return;
    }
    if (p.strumento === 'polilinea') {
      const correnti = bozza?.tipo === 'poli' ? bozza.punti : [];
      // chiusura: tocco vicino al PRIMO vertice (servono almeno 3 punti)
      if (correnti.length >= 3) {
        const sogliaChiusura = Math.max(p.sogliaSnap, 18 / vista.scala);
        if (distanza(punto, correnti[0]) <= sogliaChiusura) {
          setBozza(null);
          p.onNuovoPoligono(correnti);
          return;
        }
      }
      setBozza({ tipo: 'poli', punti: [...correnti, punto], lati: 0 });
      return;
    }
    if (p.strumento === 'cerchio3p') {
      const punti = bozza?.tipo === 'cerchio3p' ? [...bozza.punti, punto] : [punto];
      if (punti.length === 3) {
        setBozza(null);
        const centro = circumcentro(punti[0], punti[1], punti[2]);
        if (centro) {
          p.onNuovoCerchio3p(centro, punti[0]);
        } else {
          p.onErrore?.('I 3 punti sono allineati: impossibile trovare il centro del cerchio. Riprova.');
        }
      } else {
        setBozza({ tipo: 'cerchio3p', punti });
      }
      return;
    }
    if (p.strumento === 'tecForo') {
      const punti = bozza?.tipo === 'cerchio3p' ? [...bozza.punti, punto] : [punto];
      if (punti.length === 3) {
        setBozza(null);
        p.onNuovoForo(punti[0], punti[1], punti[2]);
      } else {
        setBozza({ tipo: 'cerchio3p', punti });
      }
      return;
    }
    if (p.strumento === 'piano') {
      const punti = bozza?.tipo === 'piano' ? [...bozza.punti, punto] : [punto];
      if (punti.length === 4) {
        setBozza(null);
        p.onPiano(punti as [Punto, Punto, Punto, Punto]);
      } else {
        setBozza({ tipo: 'piano', punti });
      }
    }
  };

  const suPointerMove = () => {
    if (!disegnoAttivo.current) return;
    const pos = posImmagine();
    if (!pos) return;

    // un movimento netto annulla il tap prolungato (è un trascinamento)
    if (pressTimer.current && pressStart.current && distanza(pos, pressStart.current) * vista.scala > 10) {
      annullaLongPress();
    }

    // punto pendente: segue il dito finché non viene rilasciato
    if (puntoPendente !== null) {
      let punto: Punto;
      if (strumentoDuePunti(p.strumento)) {
        punto = elaboraPuntoDue(pos);
        // il secondo punto aggiorna l'anteprima in tempo reale
        if (bozza && puntoFisso(bozza)) setBozza(conSecondoPunto(bozza, punto));
      } else {
        const senzaSnap =
          p.strumento === 'testo' || p.strumento === 'auto' || p.strumento === 'riferimento';
        punto = senzaSnap ? pos : applicaSnap(pos);
        if (p.strumento === 'auto') {
          setTracciaAuto((t) => (t ? [...t, pos.x, pos.y] : t));
        }
      }
      setPuntoPendente(punto);
      setPuntoLente(punto);
      return;
    }

    if (!bozza) return;
    setBozza((b) => {
      if (!b) return b;
      switch (b.tipo) {
        case 'disegno':
          setPuntoLente(pos);
          return { ...b, punti: [...b.punti, pos.x, pos.y] };
        case 'callout':
          setPuntoLente(pos);
          return { ...b, corrente: pos };
        default:
          return b;
      }
    });
  };

  const suPointerUp = () => {
    // il menu circolare si è già aperto sul tap prolungato: non posare nulla
    const longPressScattato = pressFired.current;
    pressFired.current = false;
    annullaLongPress();
    if (longPressScattato) {
      setPuntoLente(null);
      disegnoAttivo.current = false;
      return;
    }
    setPuntoLente(null);
    if (!disegnoAttivo.current) return;
    disegnoAttivo.current = false;

    // conferma del punto pendente (angolo, piano, testo)
    if (puntoPendente !== null) {
      const punto = puntoPendente;
      setPuntoPendente(null);
      setIndicatoreSnap(null);
      confermaPuntoPendente(punto);
      return;
    }

    if (!bozza) return;
    // bozze multi-rilascio: restano in attesa del punto successivo
    if (bozza.tipo !== 'disegno' && bozza.tipo !== 'callout') return;
    setIndicatoreSnap(null);
    const b = bozza;
    setBozza(null);
    const minimo = 8 / vista.scala;
    switch (b.tipo) {
      case 'disegno':
        // lo stesso tracciato a mano libera alimenta disegno o schizzo
        if (b.punti.length >= 6) {
          if (p.strumento === 'schizzo') p.onNuovoSchizzo(b.punti);
          else p.onNuovoDisegno(b.punti);
        }
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

  // voci della legenda (lettera = descrizione), derivate dalle etichette: la
  // legenda le mostra nel riquadro. Includono l'eventuale modifica live.
  const vociLeg = useMemo(() => vociLegenda(annotazioniVisibili), [annotazioniVisibili]);

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
    // in attesa del secondo punto i due punti coincidono: nessuna anteprima
    const fisso = puntoFisso(bozza);
    const secondo =
      bozza.tipo === 'quota' ||
      bozza.tipo === 'freccia' ||
      bozza.tipo === 'calibra' ||
      bozza.tipo === 'rett' ||
      bozza.tipo === 'forLinea' ||
      bozza.tipo === 'forRett' ||
      bozza.tipo === 'tecSmusso'
        ? bozza.p2
        : bozza.tipo === 'raggio' || bozza.tipo === 'forCerchio'
          ? bozza.bordo
          : null;
    if (fisso && secondo && distanza(fisso, secondo) < 2) return null;
    switch (bozza.tipo) {
      case 'quota':
        return {
          ...base,
          tipo: 'quota',
          sottotipo: bozza.sottotipo,
          p1: bozza.p1,
          p2: bozza.p2,
          offset: 0, // anteprima coerente: linea sui punti, senza linee guida
          valore: null,
          unita: 'cm',
          posizioneTesto: 'sopra',
          stato: 'reale'
        };
      case 'rett': {
        const r = normalizzaRect(bozza.p1, bozza.p2);
        return {
          ...base,
          tipo: 'quotaRett',
          punti: [
            { x: r.x, y: r.y },
            { x: r.x + r.width, y: r.y },
            { x: r.x + r.width, y: r.y + r.height },
            { x: r.x, y: r.y + r.height }
          ],
          valoreBase: null,
          valoreAltezza: null,
          unita: 'cm',
          stato: 'reale'
        };
      }
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
      case 'tecSmusso':
      case 'forLinea':
        return { ...base, tipo: 'forma', forma: 'linea', punti: [bozza.p1, bozza.p2], chiusa: false, partePerimetro: false };
      case 'forRett':
        return { ...base, tipo: 'forma', forma: 'rettangolo', punti: [bozza.p1, bozza.p2], chiusa: true, partePerimetro: false };
      case 'forCerchio':
        return { ...base, tipo: 'forma', forma: 'cerchio', punti: [bozza.centro, bozza.bordo], chiusa: true, partePerimetro: false };
      case 'forPoli':
        return { ...base, tipo: 'forma', forma: 'poligono', punti: bozza.punti, chiusa: false, partePerimetro: false };
      case 'callout': {
        // anteprima della regione da ritagliare: un semplice rettangolo
        const r = normalizzaRect(bozza.inizio, bozza.corrente);
        return { ...base, tipo: 'disegno', punti: rettangoloInPunti(r) };
      }
      default:
        return null;
    }
  }, [bozza, p.foto, stileBozza]);

  /** marker del primo punto fissato (in attesa del secondo) */
  const primoFissato = puntoFisso(bozza);

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
        draggable={p.strumento === 'seleziona' && !annLive && !zoomInCorso}
        onDragEnd={(e) => {
          // durante lo zoom a due dita il pan dello Stage non viene registrato
          if (e.target === stageRef.current && !gestoMulti.current) {
            setVista((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        onWheel={suRotella}
        onTouchStart={suTouchStart}
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
            onClick={() => {
              const pos = posImmagine();
              if (p.onDuplica && pos) p.onDuplica(pos);
            }}
            onTap={() => {
              const pos = posImmagine();
              if (p.onDuplica && pos) p.onDuplica(pos);
            }}
          />
          {p.foto.sfondoNascosto && (
            // pianta su foto con sfondo nascosto: copre la foto col bianco,
            // resta solo lo schizzo (la foto-sfondo è ancora cliccabile sotto)
            <Rect
              x={0}
              y={0}
              width={p.foto.larghezzaPx}
              height={p.foto.altezzaPx}
              fill="#ffffff"
              listening={false}
            />
          )}
          {annotazioniVisibili.map((a) => (
            <AnnotazioneShape
              key={a.id}
              ann={a}
              immagine={p.immagine}
              immagineDettaglio={
                a.tipo === 'callout' && a.fotoDettaglio
                  ? immagineDettaglio(a.fotoDettaglio, () => setVersioneDettagli((v) => v + 1))
                  : null
              }
              etichetta={eFormaEtichettabile(a) ? p.codiceForma(a) : undefined}
              voci={a.tipo === 'legenda' ? vociLeg : undefined}
              selezionata={a.id === p.selezioneId}
              interattiva={p.strumento === 'seleziona'}
              hitWidth={Math.max(28 / vista.scala, 12)}
              scala={vista.scala}
              gestoMulti={() => gestoMulti.current}
              onSeleziona={() => p.onSeleziona(a.id)}
              onModifica={() => p.onModifica(a.id)}
              onTrascinata={(dx, dy) => {
                p.onCommit(
                  p.annotazioni.map((x) => (x.id === a.id ? traslaAnnotazione(x, dx, dy) : x))
                );
              }}
            />
          ))}
          {/* OGGETTI dello schizzo come entità A SÉ STANTI: ogni oggetto ha il
              suo bersaglio sopra il poligono — tocco = selezione, tocco su
              oggetto selezionato = dimensioni, trascinamento = spostamento
              (bloccato se il centro è ancorato). */}
          {p.strumento === 'seleziona' &&
            p.onSelezionaOggetto &&
            annotazioniVisibili.map((a) => {
              if (a.tipo !== 'quotaPoligono' || !a.oggetti?.length) return null;
              return a.oggetti.map((o) => {
                const selez =
                  p.oggettoSelezionato?.annId === a.id &&
                  p.oggettoSelezionato?.oggettoId === o.id;
                const fill = selez ? 'rgba(88,166,255,0.18)' : 'rgba(88,166,255,0.01)';
                const stroke = selez ? '#58a6ff' : 'rgba(88,166,255,0.001)';
                const base =
                  o.tipo === 'rettangolo'
                    ? { x: o.x, y: o.y - (o.altezza ?? 0) }
                    : { x: o.x, y: o.y };
                const suTap = (evt: Konva.KonvaEventObject<Event>) => {
                  evt.cancelBubble = true;
                  if (selez && p.onTapOggettoSelezionato) {
                    const stage = evt.target.getStage();
                    const rect = stage?.container().getBoundingClientRect();
                    const pp = stage?.getPointerPosition();
                    if (rect && pp)
                      p.onTapOggettoSelezionato({ x: rect.left + pp.x, y: rect.top + pp.y });
                    return;
                  }
                  p.onSelezionaOggetto?.(a.id, o.id);
                };
                const comuni = {
                  fill,
                  stroke,
                  strokeWidth: 2.5 / vista.scala,
                  draggable: !o.centroAncorato,
                  onClick: suTap,
                  onTap: suTap,
                  onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
                    if (gestoMulti.current) {
                      e.target.stopDrag();
                      e.target.position(base);
                      return;
                    }
                    if (!selez) p.onSelezionaOggetto?.(a.id, o.id);
                  },
                  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
                    if (gestoMulti.current) e.target.position(base);
                  },
                  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
                    const dx = e.target.x() - base.x;
                    const dy = e.target.y() - base.y;
                    // sotto ~5px schermo è un tocco, non uno spostamento
                    if (Math.hypot(dx, dy) * vista.scala < 5) {
                      e.target.position(base);
                      return;
                    }
                    p.onSpostaOggetto?.(a.id, o.id, dx, dy);
                  }
                };
                return o.tipo === 'rettangolo' ? (
                  <Rect
                    key={`${a.id}-ogg-${o.id}`}
                    {...comuni}
                    x={base.x}
                    y={base.y}
                    width={o.larghezza ?? 0}
                    height={o.altezza ?? 0}
                  />
                ) : (
                  <Circle
                    key={`${a.id}-ogg-${o.id}`}
                    {...comuni}
                    x={base.x}
                    y={base.y}
                    radius={o.raggioPx ?? 0}
                  />
                );
              });
            })}
          {/* PRIVACY: riquadri di oscuramento. I pixel sono già oscurati
              nell'immagine mostrata; qui si disegna solo il contorno, mentre
              è attivo lo strumento «censura», per poterli togliere con un
              tocco o aggiungerne di nuovi trascinando. */}
          {p.strumento === 'censura' &&
            (p.censure ?? []).map((c) => (
              <Rect
                key={`cens-${c.id}`}
                x={c.x}
                y={c.y}
                width={c.larghezza}
                height={c.altezza}
                stroke={c.auto ? '#00A896' : '#e5534b'}
                strokeWidth={2.5 / vista.scala}
                dash={[8 / vista.scala, 6 / vista.scala]}
                fill="rgba(229,83,75,0.10)"
                // la rimozione è gestita dal pointerdown dello Stage (che
                // arriva prima del click): qui il contorno è solo visivo
                listening={false}
              />
            ))}
          {/* punti SELEZIONABILI del comando armato: pallini rossi, discreti
              ma ben visibili (vertici, centri-lato, centri oggetto) */}
          {p.puntiSelezionabili?.map((pt, i) => (
            <Circle
              key={`sel-${i}`}
              x={pt.x}
              y={pt.y}
              radius={Math.max(3.5 / vista.scala, 2)}
              fill="#e5534b"
              stroke="#ffffff"
              strokeWidth={1.2 / vista.scala}
              listening={false}
            />
          ))}
          {/* evidenziazione delle misure concatenate, sopra le quote */}
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
              for (const prim of primitiveCatene(annotazioniVisibili)) {
                disegnaPrimitiva(c, prim, p.immagine);
              }
            }}
          />
          {bozzaAnnotazione && (
            <AnnotazioneShape
              ann={bozzaAnnotazione}
              immagine={p.immagine}
              selezionata={false}
              interattiva={false}
              hitWidth={1}
              scala={vista.scala}
              onSeleziona={() => {}}
              onModifica={() => {}}
              onTrascinata={() => {}}
            />
          )}
          {p.proposte.map((a) => (
            <AnnotazioneShape
              key={a.id}
              ann={a}
              immagine={p.immagine}
              selezionata={false}
              interattiva={false}
              hitWidth={1}
              scala={vista.scala}
              onSeleziona={() => {}}
              onModifica={() => {}}
              onTrascinata={() => {}}
            />
          ))}
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
          {/* Griglia di verifica sul piano calibrato */}
          {p.mostraGriglia &&
            p.foto.piano &&
            (() => {
              try {
                const piano = p.foto.piano;
                // se il piano è stato calibrato con la griglia (celle>1) si
                // suddivide il quadrilatero; altrimenti griglia attorno al riferimento
                const linee =
                  piano.celle && piano.celle > 1
                    ? grigliaSuddivisa(piano, piano.celle)
                    : griglia(piano, p.foto.larghezzaPx, p.foto.altezzaPx, p.celleGriglia);
                return (
                  <>
                    {linee.map((pt, i) => (
                      <Line
                        key={i}
                        points={pt}
                        stroke="rgba(52,199,89,0.55)"
                        strokeWidth={1.2 / vista.scala}
                        listening={false}
                      />
                    ))}
                    <Line
                      points={p.foto.piano.punti.flatMap((pt) => [pt.x, pt.y])}
                      closed
                      stroke="#34c759"
                      strokeWidth={2.5 / vista.scala}
                      listening={false}
                    />
                  </>
                );
              } catch {
                return null;
              }
            })()}
          {/* Griglia LIVE durante la calibrazione: aiuta a rifinire la proporzione */}
          {p.calibPiano &&
            (() => {
              try {
                const linee = griglia(p.calibPiano, p.foto.larghezzaPx, p.foto.altezzaPx, p.celleGriglia);
                return linee.map((pt, i) => (
                  <Line
                    key={i}
                    points={pt}
                    stroke="rgba(47,129,247,0.5)"
                    strokeWidth={1.2 / vista.scala}
                    listening={false}
                  />
                ));
              } catch {
                return null;
              }
            })()}
          {/* Rettangolo di calibrazione in correzione: 4 angoli trascinabili */}
          {p.calibQuad && (
            <>
              <Line
                points={p.calibQuad.flatMap((pt) => [pt.x, pt.y])}
                closed
                stroke="#2f81f7"
                strokeWidth={2.5 / vista.scala}
                dash={[8 / vista.scala, 5 / vista.scala]}
                listening={false}
              />
              {p.calibQuad.map((pt, i) => (
                <Circle
                  key={i}
                  x={pt.x}
                  y={pt.y}
                  radius={raggioManiglia}
                  fill="rgba(47,129,247,0.4)"
                  stroke="#58a6ff"
                  strokeWidth={2.5 / vista.scala}
                  draggable
                  onDragMove={(e) => {
                    const nuovo = { x: e.target.x(), y: e.target.y() };
                    const nuovi = p.calibQuad!.map((q, j) => (j === i ? nuovo : q)) as [
                      Punto,
                      Punto,
                      Punto,
                      Punto
                    ];
                    setPuntoLente(nuovo); // lente di ingrandimento come per le quote
                    p.onCalibQuad(nuovi);
                  }}
                  onDragEnd={() => setPuntoLente(null)}
                />
              ))}
            </>
          )}
          {/* SECONDO stadio: griglia proiettata con i 4 angoli ESTERNI
              trascinabili per la regolazione fine della prospettiva */}
          {p.calibGrigliaPiano &&
            (() => {
              let linee: number[][] = [];
              try {
                linee = grigliaSuddivisa(p.calibGrigliaPiano, p.celleGriglia);
              } catch {
                linee = [];
              }
              const angoli = p.calibGrigliaPiano.punti;
              return (
                <>
                  {linee.map((pt, i) => (
                    <Line
                      key={i}
                      points={pt}
                      stroke="rgba(47,129,247,0.55)"
                      strokeWidth={1.3 / vista.scala}
                      listening={false}
                    />
                  ))}
                  {angoli.map((pt, i) => (
                    <Circle
                      key={i}
                      x={pt.x}
                      y={pt.y}
                      radius={raggioManiglia * 1.15}
                      fill="rgba(255,196,0,0.45)"
                      stroke="#ffc400"
                      strokeWidth={3 / vista.scala}
                      draggable
                      onDragMove={(e) => {
                        const nuovo = { x: e.target.x(), y: e.target.y() };
                        const nuovi = angoli.map((q, j) => (j === i ? nuovo : q)) as [
                          Punto,
                          Punto,
                          Punto,
                          Punto
                        ];
                        setPuntoLente(nuovo);
                        p.onCalibGrigliaCorner(nuovi);
                      }}
                      onDragEnd={() => setPuntoLente(null)}
                    />
                  ))}
                </>
              );
            })()}
          {(bozza?.tipo === 'angolo' ||
            bozza?.tipo === 'piano' ||
            bozza?.tipo === 'quad' ||
            bozza?.tipo === 'poli' ||
            bozza?.tipo === 'cerchio3p') && (
            <>
              {bozza.punti.map((pt, i) => {
                // nella polilinea il PRIMO vertice è il bersaglio di chiusura:
                // più grande e cerchiato quando si può già chiudere (≥3 punti)
                const chiusura =
                  p.strumento === 'polilinea' && i === 0 && bozza.punti.length >= 3;
                return (
                  <Circle
                    key={i}
                    x={pt.x}
                    y={pt.y}
                    radius={raggioManiglia * (chiusura ? 1.1 : 0.6)}
                    fill={chiusura ? 'rgba(52,199,89,0.35)' : '#2f81f7'}
                    stroke={chiusura ? '#34c759' : undefined}
                    strokeWidth={chiusura ? 3 / vista.scala : 0}
                    listening={false}
                  />
                );
              })}
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
          {p.puntiTecnici && p.puntiTecnici.length > 0 && (
            <>
              {p.puntiTecnici.length > 1 && (
                <Line
                  points={p.puntiTecnici.flatMap((pt) => [pt.x, pt.y])}
                  stroke={COLORE_QUOTA_TECNICA}
                  strokeWidth={2 / vista.scala}
                  dash={[8 / vista.scala, 6 / vista.scala]}
                  listening={false}
                />
              )}
              {p.puntiTecnici.map((pt, i) => (
                <Circle
                  key={i}
                  x={pt.x}
                  y={pt.y}
                  radius={raggioManiglia * 0.55}
                  fill={COLORE_QUOTA_TECNICA}
                  stroke="#ffffff"
                  strokeWidth={1.5 / vista.scala}
                  listening={false}
                />
              ))}
            </>
          )}
          {tracciaAuto && tracciaAuto.length >= 4 && (
            <Line
              points={tracciaAuto}
              stroke="rgba(255, 214, 10, 0.45)"
              strokeWidth={26 / vista.scala}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}
          {primoFissato && (
            <Circle
              x={primoFissato.x}
              y={primoFissato.y}
              radius={raggioManiglia * 0.55}
              fill="#2f81f7"
              stroke="#ffffff"
              strokeWidth={2 / vista.scala}
              listening={false}
            />
          )}
          {puntoPendente && (
            <>
              {/* mirino del punto in attesa di conferma */}
              <Line
                points={[puntoPendente.x - raggioManiglia * 1.4, puntoPendente.y, puntoPendente.x + raggioManiglia * 1.4, puntoPendente.y]}
                stroke="#2f81f7"
                strokeWidth={2 / vista.scala}
                listening={false}
              />
              <Line
                points={[puntoPendente.x, puntoPendente.y - raggioManiglia * 1.4, puntoPendente.x, puntoPendente.y + raggioManiglia * 1.4]}
                stroke="#2f81f7"
                strokeWidth={2 / vista.scala}
                listening={false}
              />
              <Circle
                x={puntoPendente.x}
                y={puntoPendente.y}
                radius={raggioManiglia * 0.7}
                stroke="#2f81f7"
                strokeWidth={2.5 / vista.scala}
                listening={false}
              />
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
          {/* anteprima della nota con freccia mentre si trascina il testo */}
          {p.strumento === 'testo' &&
            inizioTesto.current &&
            puntoPendente &&
            distanza(inizioTesto.current, puntoPendente) > 18 / vista.scala && (
              <>
                <Line
                  points={[
                    puntoPendente.x,
                    puntoPendente.y,
                    inizioTesto.current.x,
                    inizioTesto.current.y
                  ]}
                  stroke="#2f81f7"
                  strokeWidth={2.5 / vista.scala}
                  dash={[8 / vista.scala, 6 / vista.scala]}
                  listening={false}
                />
                <Circle
                  x={inizioTesto.current.x}
                  y={inizioTesto.current.y}
                  radius={raggioManiglia * 0.5}
                  fill="#2f81f7"
                  listening={false}
                />
              </>
            )}
          {selezionata && p.strumento === 'seleziona' && (
            <ManiglieAnnotazione
              ann={selezionata}
              raggio={raggioManiglia}
              scala={vista.scala}
              onLive={setAnnLive}
              onFine={committaLive}
              onPuntoAttivo={setPuntoLente}
              applicaSnap={applicaSnap}
              vincolo={p.vincolo}
              gestoMulti={() => gestoMulti.current}
              onQuotaInline={p.onQuotaInline}
              onDistanzaInline={p.onDistanzaInline}
            />
          )}
        </Layer>
      </Stage>
      {puntoLente && !PUNTATORE_FINE && (
        <Lente
          immagine={p.immagine}
          annotazioni={annotazioniVisibili}
          bozza={bozzaAnnotazione}
          punto={puntoLente}
          agganciato={indicatoreSnap !== null}
          vista={vista}
          contenitore={dimensioni}
        />
      )}
      {/* zoom: con le dita (pinch) su touch; +/− e "adatta" col puntatore */}
      <div className="zoom-flottante">
        <button
          className="solo-puntatore"
          aria-label="Ingrandisci"
          onClick={() => window.dispatchEvent(new CustomEvent('editor:zoom', { detail: 1.2 }))}
        >
          +
        </button>
        <button
          className="solo-puntatore"
          aria-label="Riduci"
          onClick={() => window.dispatchEvent(new CustomEvent('editor:zoom', { detail: 1 / 1.2 }))}
        >
          −
        </button>
        <button aria-label="Adatta alla vista" onClick={() => adatta(dimensioni.w, dimensioni.h)}>
          ⤢
        </button>
      </div>
      {suggerimento && <div className="suggerimento-stage">{suggerimento}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lente di ingrandimento: zoom in tempo reale con mirino a croce, mostrata
// nell'angolo opposto al dito per il posizionamento di precisione.
// ---------------------------------------------------------------------------

const LATO_LENTE = 150;

function Lente({
  immagine,
  annotazioni,
  bozza,
  punto,
  agganciato,
  vista,
  contenitore
}: {
  immagine: ImmagineDisegnabile;
  annotazioni: Annotazione[];
  bozza: Annotazione | null;
  punto: Punto;
  agganciato: boolean;
  vista: Vista;
  contenitore: { w: number; h: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ingrandimento: sempre più stretto della vista corrente, mai sgranato oltre 6x
  const zoom = Math.min(6, Math.max(1.4, vista.scala * 3));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== LATO_LENTE * dpr) {
      canvas.width = LATO_LENTE * dpr;
      canvas.height = LATO_LENTE * dpr;
    }
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, LATO_LENTE, LATO_LENTE);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, LATO_LENTE, LATO_LENTE);

    // foto + annotazioni centrate sul punto, ingrandite
    ctx.save();
    ctx.translate(LATO_LENTE / 2, LATO_LENTE / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-punto.x, -punto.y);
    ctx.drawImage(immagine, 0, 0);
    const vociLente = vociLegenda(annotazioni);
    for (const a of annotazioni) {
      for (const prim of primitiveAnnotazione(a, undefined, undefined, () => vociLente)) {
        disegnaPrimitiva(ctx, prim, immagine);
      }
    }
    if (bozza) {
      for (const prim of primitiveAnnotazione(bozza)) disegnaPrimitiva(ctx, prim, immagine);
    }
    ctx.restore();

    // mirino a croce con alone scuro per leggibilità su qualsiasi sfondo
    const c = LATO_LENTE / 2;
    const gap = 7;
    for (const [colore, sp] of [
      ['rgba(0,0,0,0.85)', 3.5],
      [agganciato ? '#32d74b' : '#ffffff', 1.5]
    ] as const) {
      ctx.strokeStyle = colore;
      ctx.lineWidth = sp;
      ctx.beginPath();
      ctx.moveTo(4, c);
      ctx.lineTo(c - gap, c);
      ctx.moveTo(c + gap, c);
      ctx.lineTo(LATO_LENTE - 4, c);
      ctx.moveTo(c, 4);
      ctx.lineTo(c, c - gap);
      ctx.moveTo(c, c + gap);
      ctx.lineTo(c, LATO_LENTE - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, gap, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }, [immagine, annotazioni, bozza, punto, agganciato, zoom]);

  // posizione: angolo orizzontalmente opposto al dito; in alto, oppure in
  // basso quando il dito lavora nella parte alta dello schermo
  const schermo = { x: punto.x * vista.scala + vista.x, y: punto.y * vista.scala + vista.y };
  const margine = 10;
  const sinistra = schermo.x > contenitore.w / 2;
  const sopra = schermo.y > contenitore.h * 0.4;
  const stile: React.CSSProperties = {
    left: sinistra ? margine : contenitore.w - LATO_LENTE - margine,
    top: sopra ? margine : contenitore.h - LATO_LENTE - margine
  };

  return (
    <div className={`lente${agganciato ? ' agganciata' : ''}`} style={stile}>
      <canvas ref={canvasRef} style={{ width: LATO_LENTE, height: LATO_LENTE }} />
    </div>
  );
}

function testoSuggerimento(strumento: Strumento, bozza: Bozza): string | null {
  if (strumento === 'auto') {
    return 'Tocca una figura netta; evidenzia una zona di disturbo (riflessi, intarsi) per escluderla e quotare il contorno esterno';
  }
  if (strumento === 'riferimento') {
    return 'Tocca un oggetto rettangolare di misura nota (foglio A4, carta di credito…): l’app lo rileva e calibra il piano';
  }
  if (strumentoDuePunti(strumento)) {
    return puntoFisso(bozza)
      ? 'Secondo punto: premi, aggiusta con la lente, rilascia per fissare'
      : 'Primo punto: premi, aggiusta con la lente, rilascia per fissare';
  }
  if (strumento === 'quad') {
    const n = bozza?.tipo === 'quad' ? bozza.punti.length : 0;
    return `Elemento a 4 angoli (${n}/4): tocca alto-sx, alto-dx, basso-dx, basso-sx`;
  }
  if (strumento === 'tri') {
    const n = bozza?.tipo === 'poli' ? bozza.punti.length : 0;
    return `Triangolo a 3 lati (${n}/3): tocca i vertici in ordine`;
  }
  if (strumento === 'polilinea') {
    const n = bozza?.tipo === 'poli' ? bozza.punti.length : 0;
    if (n === 0) return 'Polilinea: tocca il primo vertice';
    if (n < 3) return `Polilinea (${n} vertici): continua a toccare i vertici`;
    return `Polilinea (${n} vertici): tocca ancora, o tocca il PRIMO vertice per chiudere`;
  }
  if (strumento === 'cerchio3p') {
    const n = bozza?.tipo === 'cerchio3p' ? bozza.punti.length : 0;
    return [
      "Cerchio 3 punti (1/3): tocca un punto sull'arco",
      "Cerchio 3 punti (2/3): tocca un secondo punto sull'arco",
      "Cerchio 3 punti (3/3): tocca un terzo punto sull'arco per trovare il centro"
    ][n];
  }
  if (strumento === 'angolo') {
    const n = bozza?.tipo === 'angolo' ? bozza.punti.length : 0;
    return ["Tocca il vertice dell'angolo", 'Tocca il primo lato', 'Tocca il secondo lato'][n];
  }
  if (strumento === 'piano') {
    const n = bozza?.tipo === 'piano' ? bozza.punti.length : 0;
    return `Piano di riferimento: tocca i 4 angoli di un rettangolo reale (${n}/4) — alto-sx, alto-dx, basso-dx, basso-sx`;
  }
  if (strumento === 'calibra') return 'Trascina tra due punti a distanza nota';
  if (strumento === 'raggio') return 'Trascina dal centro al bordo';
  if (strumento === 'schizzo')
    return 'Disegna a mano libera il contorno chiuso della stanza: l’app lo raddrizza in un poligono quotabile';
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
  immagineDettaglio,
  etichetta,
  voci,
  selezionata,
  interattiva,
  hitWidth,
  scala,
  gestoMulti,
  onSeleziona,
  onModifica,
  onTrascinata
}: {
  ann: Annotazione;
  immagine: ImmagineDisegnabile;
  /** foto-dettaglio già caricata (solo per i callout con foto scattata) */
  immagineDettaglio?: CanvasImageSource | null;
  /** codice/etichetta calcolato della forma (nomenclatura strutturata) */
  etichetta?: string;
  /** voci della legenda (solo per l'annotazione legenda) */
  voci?: Array<{ lettera: string; descrizione: string; quantita?: number }>;
  selezionata: boolean;
  interattiva: boolean;
  hitWidth: number;
  /** scala della vista: per distinguere un tocco da un trascinamento reale */
  scala: number;
  /** true mentre è in corso un gesto a due dita (zoom): blocca select/drag */
  gestoMulti?: () => boolean;
  onSeleziona: () => void;
  onModifica: () => void;
  onTrascinata: (dx: number, dy: number) => void;
}) {
  const prims = useMemo(
    () => primitiveAnnotazione(ann, () => immagineDettaglio ?? null, () => etichetta, () => voci ?? []),
    [ann, immagineDettaglio, etichetta, voci]
  );
  // ricorda se l'oggetto era già selezionato all'inizio del tocco: un tocco
  // "secco" su un oggetto già selezionato apre la modifica (secondo tap)
  const eraSelezionata = useRef(false);

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
            // un riquadro pieno (es. legenda) è selezionabile su tutta l'area
            if (prim.riempimento) c.fillRect(prim.rect.x, prim.rect.y, prim.rect.width, prim.rect.height);
            else c.strokeRect(prim.rect.x, prim.rect.y, prim.rect.width, prim.rect.height);
          } else if (prim.kind === 'ritaglio' || prim.kind === 'immagine') {
            // l'inserto del callout è selezionabile/trascinabile in tutta l'area
            c.fillRect(
              prim.destinazione.x,
              prim.destinazione.y,
              prim.destinazione.width,
              prim.destinazione.height
            );
          } else if (prim.kind === 'cerchio') {
            c.beginPath();
            c.arc(prim.centro.x, prim.centro.y, prim.raggio, 0, Math.PI * 2);
            // un badge pieno (etichetta) è selezionabile su tutta l'area
            if (prim.riempimento) c.fill();
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
      onClick={() => {
        // tocco "pulito" (mouse o tap senza jitter): primo tap seleziona,
        // secondo tap (oggetto già selezionato) apre la modifica
        if (gestoMulti?.()) return;
        selezionata ? onModifica() : onSeleziona();
      }}
      onTap={() => {
        if (gestoMulti?.()) return;
        selezionata ? onModifica() : onSeleziona();
      }}
      onDragStart={(e) => {
        // durante un gesto a due dita (zoom) non si seleziona né si trascina
        if (gestoMulti?.()) {
          e.target.stopDrag();
          e.target.position({ x: 0, y: 0 });
          return;
        }
        eraSelezionata.current = selezionata;
        if (!selezionata) onSeleziona();
      }}
      onDragEnd={(e) => {
        const dx = e.target.x();
        const dy = e.target.y();
        e.target.position({ x: 0, y: 0 });
        if (gestoMulti?.()) return; // gesto multi-tocco: nessuno spostamento
        // il dito trema sempre un po': sotto i ~6px sullo schermo è un TOCCO,
        // non un trascinamento. Un tocco su oggetto già selezionato → modifica
        const spostamentoSchermo = Math.hypot(dx, dy) * scala;
        if (spostamentoSchermo > 6) {
          onTrascinata(dx, dy);
        } else if (eraSelezionata.current) {
          onModifica();
        }
      }}
    />
  );
}

/** passo "tondo" (1, 2, 5 ×10^n) vicino al valore grezzo */
/**
 * Linee di una griglia `celle×celle` di celle grandi quanto il riferimento
 * (L×A), centrata sul riferimento, in coordinate immagine. Serve a rifinire la
 * proporzione/prospettiva: se i quadri combaciano con elementi reali (es. le
 * piastrelle), la calibrazione è corretta. Scarta i punti degeneri (orizzonte).
 */
function griglia(piano: PianoProspettiva, w: number, h: number, celle = 3): number[][] {
  const Hinv = omografiaPianoInversa(piano);
  const L = piano.larghezzaReale;
  const A = piano.altezzaReale;
  const off = Math.floor((celle - 1) / 2); // il riferimento è la cella centrale
  const mappa = (x: number, y: number): Punto | null => {
    const wd = Hinv[6] * x + Hinv[7] * y + Hinv[8];
    if (Math.abs(wd) < 1e-9) return null;
    return { x: (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / wd, y: (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / wd };
  };
  const dentro = (p: Punto) => p.x > -1.5 * w && p.x < 2.5 * w && p.y > -1.5 * h && p.y < 2.5 * h;
  const linee: number[][] = [];
  const y0 = -off * A;
  const y1 = (celle - off) * A;
  const x0 = -off * L;
  const x1 = (celle - off) * L;
  for (let i = 0; i <= celle; i++) {
    const x = (i - off) * L;
    const a = mappa(x, y0);
    const b = mappa(x, y1);
    if (a && b && (dentro(a) || dentro(b))) linee.push([a.x, a.y, b.x, b.y]);
  }
  for (let j = 0; j <= celle; j++) {
    const y = (j - off) * A;
    const a = mappa(x0, y);
    const b = mappa(x1, y);
    if (a && b && (dentro(a) || dentro(b))) linee.push([a.x, a.y, b.x, b.y]);
  }
  return linee;
}

/**
 * Griglia che SUDDIVIDE il quadrilatero del piano in celle×celle (riempie
 * esattamente la proiezione). Usata nello stadio di regolazione fine: i 4
 * angoli esterni sono il quadrilatero stesso. Niente scarti: il quad è limitato.
 */
function grigliaSuddivisa(piano: PianoProspettiva, celle: number): number[][] {
  const Hinv = omografiaPianoInversa(piano);
  const W = piano.larghezzaReale;
  const A = piano.altezzaReale;
  const mappa = (x: number, y: number): Punto | null => {
    const wd = Hinv[6] * x + Hinv[7] * y + Hinv[8];
    if (Math.abs(wd) < 1e-9) return null;
    return { x: (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / wd, y: (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / wd };
  };
  const linee: number[][] = [];
  for (let i = 0; i <= celle; i++) {
    const a = mappa((i * W) / celle, 0);
    const b = mappa((i * W) / celle, A);
    if (a && b) linee.push([a.x, a.y, b.x, b.y]);
  }
  for (let j = 0; j <= celle; j++) {
    const a = mappa(0, (j * A) / celle);
    const b = mappa(W, (j * A) / celle);
    if (a && b) linee.push([a.x, a.y, b.x, b.y]);
  }
  return linee;
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
    case 'quotaRett': {
      const margine = Math.max(24, a.stile.dimensioneTesto * 1.1) + a.stile.dimensioneTesto;
      for (const q of quadrilateroQuotaRett(a)) {
        punti.push({ x: q.x - margine, y: q.y - margine }, { x: q.x + margine, y: q.y + margine });
      }
      break;
    }
    case 'quotaPoligono': {
      const margine = Math.max(24, a.stile.dimensioneTesto * 1.1) + a.stile.dimensioneTesto;
      // copia "solo etichetta": il riquadro di selezione cinge solo il badge
      if (a.soloEtichetta) {
        const pos = posizioneEtichettaPoligono(a);
        const m = a.stile.dimensioneTesto;
        punti.push({ x: pos.x - m * 1.6, y: pos.y - m }, { x: pos.x + m * 1.6, y: pos.y + m });
        break;
      }
      for (const q of a.punti) {
        punti.push({ x: q.x - margine, y: q.y - margine }, { x: q.x + margine, y: q.y + margine });
      }
      break;
    }
    case 'freccia':
      punti.push(a.p1, a.p2);
      break;
    case 'testo':
      punti.push(a.posizione);
      if (a.ancora) punti.push(a.ancora);
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
    case 'etichetta': {
      const r = a.stile.dimensioneTesto * 1.2;
      punti.push(
        { x: a.posizione.x - r, y: a.posizione.y - r },
        { x: a.posizione.x + r, y: a.posizione.y + r }
      );
      break;
    }
    case 'legenda':
      punti.push(a.posizione, {
        x: a.posizione.x + a.larghezza,
        y: a.posizione.y + a.altezza
      });
      break;
    case 'forma':
      if (a.forma === 'cerchio' && a.punti.length >= 2) {
        const r = distanza(a.punti[0], a.punti[1]);
        punti.push(
          { x: a.punti[0].x - r, y: a.punti[0].y - r },
          { x: a.punti[0].x + r, y: a.punti[0].y + r }
        );
      } else {
        punti.push(...a.punti);
      }
      break;
    case 'quotaTecnica':
      punti.push(...a.puntiOriginali);
      for (const q of a.quote) punti.push(q.p1, q.p2);
      if (a.foro) punti.push(a.foro.centro);
      if (a.smusso) punti.push(a.smusso.a, a.smusso.b);
      if (a.filettatura) punti.push(a.filettatura.ancora);
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
  onPuntoAttivo,
  applicaSnap,
  vincolo,
  gestoMulti,
  onQuotaInline,
  onDistanzaInline
}: {
  ann: Annotazione;
  raggio: number;
  scala: number;
  onLive: (a: Annotazione | null) => void;
  onFine: () => void;
  /** alimenta la lente di ingrandimento durante il trascinamento */
  onPuntoAttivo: (p: Punto | null) => void;
  applicaSnap: (p: Punto, escludi?: Punto[]) => Punto;
  vincolo: ModalitaVincolo;
  /** true durante un gesto a due dita (zoom): le maniglie non si muovono */
  gestoMulti?: () => boolean;
  /** tocco secco sull'etichetta di una quota: modifica inline del valore */
  onQuotaInline?: (indice: number, cliente: { x: number; y: number }) => void;
  /** tocco secco sull'etichetta di una quota di distanza oggetto–lato */
  onDistanzaInline?: (vincoloId: string, cliente: { x: number; y: number }) => void;
}) {
  // distingue il tocco "secco" dal trascinamento: dopo un drag il click non
  // deve aprire la modifica inline (Konva può emetterlo comunque)
  const trascinato = useRef(false);
  const maniglia = (
    chiave: string,
    pos: Punto,
    aggiorna: (nuova: Punto) => Annotazione,
    opzioni?: { snap?: boolean; escludi?: Punto[]; onTap?: (cliente: { x: number; y: number }) => void }
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
      onDragStart={(e) => {
        trascinato.current = false;
        if (gestoMulti?.()) {
          e.target.stopDrag();
          e.target.position(pos);
        }
      }}
      onDragMove={(e) => {
        if (gestoMulti?.()) {
          e.target.position(pos); // gesto a due dita: la maniglia resta ferma
          return;
        }
        trascinato.current = true;
        let nuovo: Punto = { x: e.target.x(), y: e.target.y() };
        if (opzioni?.snap) nuovo = applicaSnap(nuovo, opzioni.escludi);
        e.target.position(nuovo);
        onPuntoAttivo(nuovo);
        onLive(aggiorna(nuovo));
      }}
      onDragEnd={(e) => {
        if (gestoMulti?.()) {
          e.target.position(pos);
          onPuntoAttivo(null);
          return;
        }
        onPuntoAttivo(null);
        onFine();
      }}
      onClick={opzioni?.onTap ? (e) => onTapManiglia(e, opzioni.onTap!) : undefined}
      onTap={opzioni?.onTap ? (e) => onTapManiglia(e, opzioni.onTap!) : undefined}
    />
  );

  /** tocco "secco" su una maniglia: calcola la posizione schermo e delega */
  const onTapManiglia = (
    e: Konva.KonvaEventObject<Event>,
    cb: (cliente: { x: number; y: number }) => void
  ) => {
    if (trascinato.current) {
      // era un trascinamento (riposiziona l'etichetta), non un tocco: ignora
      trascinato.current = false;
      return;
    }
    const stage = e.target.getStage();
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const pp = stage.getPointerPosition();
    if (!pp) return;
    cb({ x: rect.left + pp.x, y: rect.top + pp.y });
  };

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
          {maniglia('offset', somma(g.centro, scalaVett(g.d, ann.scorrTesto ?? 0)), (n) => {
            const offset = dot(sottrai(n, ann.p1), normale(g.d));
            const meta = g.lunghezzaPx / 2;
            const scorr = Math.max(-meta, Math.min(meta, dot(sottrai(n, g.centro), g.d)));
            return { ...ann, offset, scorrTesto: scorr };
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
    case 'quotaRett': {
      // ogni angolo è libero: il quadrilatero può seguire la prospettiva.
      // Le maniglie centrali dei lati proiettano la singola quota (offset).
      const punti = quadrilateroQuotaRett(ann);
      const lati = latiQuotaRett(ann);
      return (
        <>
          {punti.map((pos, i) =>
            maniglia(
              `angolo-${i}`,
              pos,
              (n) => {
                const nuovi = punti.map((q, j) => (j === i ? n : q)) as [Punto, Punto, Punto, Punto];
                const { rect: _r, ...resto } = ann;
                return { ...resto, punti: nuovi };
              },
              { snap: true, escludi: [pos] }
            )
          )}
          {lati.map((lato) => {
            const g = geometriaQuota({
              sottotipo: 'allineata',
              p1: lato.p1,
              p2: lato.p2,
              offset: lato.offset
            });
            return maniglia(`proj-${lato.idx}`, g.centro, (n) => {
              const nrm = normale(normalizza(sottrai(lato.p2, lato.p1)));
              const offset = dot(sottrai(n, lato.p1), nrm);
              const off = [...(ann.offsetLati ?? [0, 0, 0, 0])];
              off[lato.idx] = offset;
              const { rect: _r, ...resto } = ann;
              return { ...resto, offsetLati: off };
            });
          })}
        </>
      );
    }
    case 'quotaPoligono': {
      const punti = ann.punti;
      // maniglia del badge: SEMPRE presente (il codice è calcolato, non salvato
      // in `etichetta`), trascinabile anche fuori dalla figura piccola
      const manigliaEtichetta = (() => {
        const base = posizioneEtichettaBase(ann);
        return maniglia('etichetta', posizioneEtichettaPoligono(ann), (n) => ({
          ...ann,
          etichettaOffset: { x: n.x - base.x, y: n.y - base.y }
        }));
      })();
      // copia "solo etichetta": niente vertici/quote, solo lo spostamento del badge
      if (ann.soloEtichetta) return <>{manigliaEtichetta}</>;
      const segs = segmentiPoligono(ann);
      return (
        <>
          {punti.map((pos, i) =>
            maniglia(
              `vertice-${i}`,
              pos,
              (n) => ({
                ...ann,
                lati: undefined,
                offsetLati: undefined,
                segmenti: segs,
                punti: punti.map((q, j) => (j === i ? n : q))
              }),
              { snap: true, escludi: [pos] }
            )
          )}
          {/* maniglia del testo di ogni segmento: trascinala perpendicolare
              per proiettare la quota, lungo la linea per spostare il numero
              (utile per le diagonali che si accavallano al centro) */}
          {segs.map((seg, i) => {
            const a = punti[seg.da];
            const b = punti[seg.a];
            if (!a || !b) return null;
            const g = geometriaQuota({ sottotipo: 'allineata', p1: a, p2: b, offset: seg.offset ?? 0 });
            const ancora = somma(g.centro, scalaVett(g.d, seg.scorrTesto ?? 0));
            return maniglia(
              `proj-${i}`,
              ancora,
              (n) => {
                const offset = dot(sottrai(n, a), normale(g.d));
                const meta = g.lunghezzaPx / 2;
                const scorr = Math.max(-meta, Math.min(meta, dot(sottrai(n, g.centro), g.d)));
                const nuovi = segs.map((s, j) => (j === i ? { ...s, offset, scorrTesto: scorr } : s));
                return { ...ann, lati: undefined, offsetLati: undefined, segmenti: nuovi };
              },
              // tocco secco sull'etichetta: modifica INLINE del valore sul canvas
              onQuotaInline ? { onTap: (cliente) => onQuotaInline(i, cliente) } : undefined
            );
          })}
          {/* glifi delle ancore/vincoli (piante parametriche): marcatori non
              trascinabili, visibili solo mentre l'elemento è selezionato */}
          {segs.map((seg, i) => {
            if (!seg.ancora) return null;
            const a = punti[seg.da];
            const b = punti[seg.a];
            if (!a || !b) return null;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const p = seg.ancora === 'vertice-da' ? a : seg.ancora === 'vertice-a' ? b : mid;
            const gr = raggio * 0.7;
            const colA = ann.stile.colore || '#00A896';
            const key = `anc-${i}`;
            if (seg.ancora === 'centro') {
              return (
                <Line
                  key={key}
                  points={[p.x, p.y - gr, p.x + gr, p.y, p.x, p.y + gr, p.x - gr, p.y]}
                  closed
                  fill="#ffffff"
                  stroke={colA}
                  strokeWidth={2.5 / scala}
                  listening={false}
                />
              );
            }
            if (seg.ancora === 'lato') {
              return (
                <Rect
                  key={key}
                  x={p.x - gr}
                  y={p.y - gr}
                  width={gr * 2}
                  height={gr * 2}
                  fill="#ffffff"
                  stroke={colA}
                  strokeWidth={2.5 / scala}
                  listening={false}
                />
              );
            }
            return (
              <Circle
                key={key}
                x={p.x}
                y={p.y}
                radius={gr}
                fill="#ffffff"
                stroke={colA}
                strokeWidth={2.5 / scala}
                listening={false}
              />
            );
          })}
          {/* etichette delle quote di DISTANZA oggetto–lato: tocco secco →
              modifica inline del valore (il cerchio è solo un bersaglio) */}
          {onDistanzaInline &&
            (ann.vincoli ?? []).map((v) => {
              if (v.tipo !== 'distanza') return null;
              const g = geomQuotaDistanza(ann.punti, ann.oggetti, v);
              if (!g) return null;
              return (
                <Circle
                  key={`dist-${v.id}`}
                  x={g.mid.x}
                  y={g.mid.y}
                  radius={raggio}
                  fill="rgba(47,129,247,0.35)"
                  stroke="#58a6ff"
                  strokeWidth={2.5 / scala}
                  onClick={(e) => onTapManiglia(e, (cliente) => onDistanzaInline(v.id, cliente))}
                  onTap={(e) => onTapManiglia(e, (cliente) => onDistanzaInline(v.id, cliente))}
                />
              );
            })}
          {/* maniglia del badge: spostabile liberamente, anche fuori figura */}
          {manigliaEtichetta}
        </>
      );
    }
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
    case 'testo':
      // se è una nota con freccia, la maniglia ri-orienta il punto segnalato
      return ann.ancora ? (
        maniglia('ancora', ann.ancora, (n) => ({ ...ann, ancora: n }), { snap: true, escludi: [ann.ancora] })
      ) : null;
    case 'legenda': {
      // riquadro spostabile (trascinando) e ridimensionabile dall'angolo in
      // basso a destra; il contenuto rifluisce da sé a una o più colonne
      const min = ann.stile.dimensioneTesto * 4;
      return (
        <>
          <Rect
            x={ann.posizione.x}
            y={ann.posizione.y}
            width={ann.larghezza}
            height={ann.altezza}
            stroke="#58a6ff"
            strokeWidth={2 / scala}
            dash={[8 / scala, 6 / scala]}
            listening={false}
          />
          {maniglia(
            'legenda-dim',
            { x: ann.posizione.x + ann.larghezza, y: ann.posizione.y + ann.altezza },
            (n) => ({
              ...ann,
              larghezza: Math.max(min, n.x - ann.posizione.x),
              altezza: Math.max(min, n.y - ann.posizione.y)
            })
          )}
        </>
      );
    }
    case 'forma': {
      if (ann.forma === 'cerchio' && ann.punti.length >= 2) {
        return (
          <>
            {maniglia('centro', ann.punti[0], (n) => ({ ...ann, punti: [n, ann.punti[1]] }))}
            {maniglia('raggio', ann.punti[1], (n) => ({ ...ann, punti: [ann.punti[0], n] }))}
          </>
        );
      }
      // linea / rettangolo / poligono / mano libera: una maniglia per vertice
      return (
        <>
          {ann.punti.map((pt, i) =>
            maniglia(
              `v-${i}`,
              pt,
              (n) => ({ ...ann, punti: ann.punti.map((q, j) => (j === i ? n : q)) }),
              { snap: true, escludi: [pt] }
            )
          )}
        </>
      );
    }
    case 'quotaTecnica': {
      // confronto ESATTO: gli estremi delle quote condividono le coordinate
      // dei punti originali (derivati dagli stessi oggetti), così trascinando
      // un punto non si trascina per sbaglio un altro punto quasi coincidente.
      const uguale = (x: Punto, y: Punto) => x.x === y.x && x.y === y.y;

      // datum: una maniglia sul punto di riferimento
      if (ann.sottotipo === 'datum') {
        const p = ann.riferimento?.punti[0] ?? ann.puntiOriginali[0];
        if (!p) return null;
        return maniglia(
          'datum',
          p,
          (n) => ({
            ...ann,
            puntiOriginali: [n],
            riferimento: ann.riferimento ? { ...ann.riferimento, punti: [n] } : ann.riferimento
          }),
          { snap: true, escludi: [p] }
        );
      }

      // foro: tre maniglie sui tap → ricostruiscono centro e raggio
      if (ann.sottotipo === 'foro' && ann.foro) {
        const foro = ann.foro;
        return (
          <>
            {ann.puntiOriginali.map((pos, i) =>
              maniglia(
                `foro-${i}`,
                pos,
                (n) => {
                  const nuovi = ann.puntiOriginali.map((q, j) => (j === i ? n : q));
                  const centro =
                    nuovi.length >= 3
                      ? circumcentro(nuovi[0], nuovi[1], nuovi[2]) ?? foro.centro
                      : foro.centro;
                  return {
                    ...ann,
                    puntiOriginali: nuovi,
                    foro: { ...foro, centro, raggioPx: distanza(centro, nuovi[0]) }
                  };
                },
                { snap: true, escludi: [pos] }
              )
            )}
          </>
        );
      }

      // smusso: maniglie sugli estremi del segmento + sulla callout (leader)
      if (ann.sottotipo === 'smusso' && ann.smusso) {
        const s = ann.smusso;
        // la callout (leader) resta ancorata al punto medio del segmento
        const ancoraLeader = (a: Punto, b: Punto) =>
          s.leader ? { da: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, a: s.leader.a } : s.leader;
        return (
          <>
            {maniglia(
              'sm-a',
              s.a,
              (n) => ({
                ...ann,
                puntiOriginali: ann.puntiOriginali.map((pt) => (uguale(pt, s.a) ? n : pt)),
                smusso: { ...s, a: n, leader: ancoraLeader(n, s.b) }
              }),
              { snap: true, escludi: [s.a] }
            )}
            {maniglia(
              'sm-b',
              s.b,
              (n) => ({
                ...ann,
                puntiOriginali: ann.puntiOriginali.map((pt) => (uguale(pt, s.b) ? n : pt)),
                smusso: { ...s, b: n, leader: ancoraLeader(s.a, n) }
              }),
              { snap: true, escludi: [s.b] }
            )}
            {s.leader &&
              maniglia('sm-leader', s.leader.a, (n) => ({
                ...ann,
                smusso: { ...s, leader: { da: s.leader!.da, a: n } }
              }))}
          </>
        );
      }

      // filettatura: maniglia sull'ancora + sulla callout (leader)
      if (ann.sottotipo === 'filettatura' && ann.filettatura) {
        const f = ann.filettatura;
        return (
          <>
            {maniglia(
              'fil-ancora',
              f.ancora,
              (n) => ({
                ...ann,
                puntiOriginali: [n],
                filettatura: { ...f, ancora: n, leader: f.leader ? { ...f.leader, da: n } : f.leader }
              }),
              { snap: true, escludi: [f.ancora] }
            )}
            {f.leader &&
              maniglia('fil-leader', f.leader.a, (n) => ({
                ...ann,
                filettatura: { ...f, leader: { da: f.leader!.da, a: n } }
              }))}
          </>
        );
      }

      // serie / parallelo / progressiva: una maniglia per ogni punto reale
      return (
        <>
          {ann.puntiOriginali.map((pos, i) =>
            maniglia(
              `pt-${i}`,
              pos,
              (n) => {
                const muovi = (pt: Punto) => (uguale(pt, pos) ? n : pt);
                return {
                  ...ann,
                  puntiOriginali: ann.puntiOriginali.map((pt, j) => (j === i ? n : pt)),
                  lineaGuida: ann.lineaGuida
                    ? { a: muovi(ann.lineaGuida.a), b: muovi(ann.lineaGuida.b) }
                    : ann.lineaGuida,
                  quote: ann.quote.map((qq) => ({ ...qq, p1: muovi(qq.p1), p2: muovi(qq.p2) }))
                };
              },
              { snap: true, escludi: [pos] }
            )
          )}
        </>
      );
    }
    default:
      return null;
  }
}
