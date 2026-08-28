import {
  quadrilateroQuotaRett,
  segmentiPoligono,
  segmentoELato,
  type Annotazione,
  type Foto,
  type PianoProspettiva,
  type Punto,
  type QuotaPoligono,
  type QuotaRettangolo,
  type Unita
} from '../db/types';
import { daMillimetri, inMillimetri } from '../utils/format';
import { applicaOmografia, omografiaPiano, type Omografia } from './omografia';
import { direzioneQuota, distanza, dot, scala as scalaPunto, somma, sottrai } from './punti';

/**
 * Calcolo automatico delle misure dalla calibrazione della foto.
 * Priorità: piano prospettico (omografia) > scala lineare px↔reale.
 * I valori calcolati sono marcati `valoreAuto` e si aggiornano quando
 * la geometria cambia; un valore inserito a mano non viene mai toccato.
 */

type CalibrazioneFoto = Pick<Foto, 'scala' | 'piano' | 'piani'>;

export function haCalibrazione(foto: CalibrazioneFoto): boolean {
  return pianiDi(foto).length > 0 || Boolean(foto.scala);
}

/** tutti i piani della foto, il principale per primo */
export function pianiDi(foto: CalibrazioneFoto): PianoProspettiva[] {
  const tutti = [foto.piano, ...(foto.piani ?? [])];
  return tutti.filter((p): p is PianoProspettiva => !!p);
}

/**
 * IL PIANO CHE VALE IN UN PUNTO DELLA FOTO.
 *
 * Con un piano solo è sempre lui, e non cambia niente. Con più piani — il
 * fianco e il fronte di un box inquadrati insieme — vince quello con
 * l'ancora più vicina: le ancore sono i baricentri delle forme da cui il
 * piano è nato, quindi una misura presa vicino alle finestre del fianco usa
 * il piano del fianco. Senza ancore si guarda il centro del suo riquadro.
 */
export function pianoDi(foto: CalibrazioneFoto, dove?: Punto | Punto[]): PianoProspettiva | null {
  const piani = pianiDi(foto);
  if (piani.length <= 1) return piani[0] ?? null;
  const punti = dove === undefined ? [] : Array.isArray(dove) ? dove : [dove];
  if (punti.length === 0) return piani[0];
  const centro = {
    x: punti.reduce((s, p) => s + p.x, 0) / punti.length,
    y: punti.reduce((s, p) => s + p.y, 0) / punti.length
  };
  let scelto = piani[0];
  let minima = Infinity;
  for (const piano of piani) {
    const ancore = piano.ancore?.length ? piano.ancore : [baricentro(piano.punti)];
    for (const a of ancore) {
      const d = Math.hypot(a.x - centro.x, a.y - centro.y);
      if (d < minima) {
        minima = d;
        scelto = piano;
      }
    }
  }
  return scelto;
}

const baricentro = (punti: Punto[]): Punto => ({
  x: punti.reduce((s, p) => s + p.x, 0) / punti.length,
  y: punti.reduce((s, p) => s + p.y, 0) / punti.length
});

function omografiaDiFoto(
  foto: CalibrazioneFoto,
  dove?: Punto | Punto[]
): { H: Omografia; piano: PianoProspettiva } | null {
  const piano = pianoDi(foto, dove);
  if (!piano) return null;
  try {
    return { H: omografiaPiano(piano), piano };
  } catch {
    return null; // piano degenere: si ignora la calibrazione
  }
}

/** Distanza reale tra due punti immagine, nelle unità della calibrazione */
function distanzaReale(
  foto: CalibrazioneFoto,
  p1: Punto,
  p2: Punto
): { valore: number; unita: Unita } | null {
  const piano = omografiaDiFoto(foto, [p1, p2]);
  if (piano) {
    const a = applicaOmografia(piano.H, p1);
    const b = applicaOmografia(piano.H, p2);
    return { valore: Math.hypot(a.x - b.x, a.y - b.y), unita: piano.piano.unita };
  }
  if (foto.scala && foto.scala.px > 0) {
    return {
      valore: (distanza(p1, p2) * foto.scala.reale) / foto.scala.px,
      unita: foto.scala.unita
    };
  }
  return null;
}

/** Arrotondamento adattivo: più cifre per i valori piccoli */
export function arrotondaMisura(v: number): number {
  if (v >= 100) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

/** Angolo in gradi (0–180) tra i lati vertice→a e vertice→b */
export function angoloGradi(vertice: Punto, a: Punto, b: Punto): number {
  const a1 = Math.atan2(a.y - vertice.y, a.x - vertice.x);
  const a2 = Math.atan2(b.y - vertice.y, b.x - vertice.x);
  let diff = Math.abs(a1 - a2);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return (diff * 180) / Math.PI;
}

/**
 * Valore automatico di una quota dalla calibrazione (o dalla geometria,
 * per gli angoli). null se non calcolabile.
 */
export function valoreAutomatico(a: Annotazione, foto: CalibrazioneFoto): number | null {
  switch (a.tipo) {
    case 'quota': {
      // si misura il segmento proiettato sulla direzione della quota
      // (per le H/V conta solo la componente sull'asse)
      const d = direzioneQuota(a.sottotipo, a.p1, a.p2);
      const estremo = somma(a.p1, scalaPunto(d, dot(sottrai(a.p2, a.p1), d)));
      const m = distanzaReale(foto, a.p1, estremo);
      if (!m) return null;
      return arrotondaMisura(daMillimetri(inMillimetri(m.valore, m.unita), a.unita));
    }
    case 'quotaRaggio': {
      const m = distanzaReale(foto, a.centro, a.bordo);
      if (!m) return null;
      const fattore = a.modo === 'diametro' ? 2 : 1;
      return arrotondaMisura(daMillimetri(inMillimetri(m.valore * fattore, m.unita), a.unita));
    }
    case 'quotaAngolo': {
      // con il piano di riferimento l'angolo è misurato sul piano
      // rettificato; senza, direttamente sull'immagine (stima)
      const piano = omografiaDiFoto(foto, [a.vertice, a.a, a.b]);
      const [v, pa, pb] = piano
        ? [
            applicaOmografia(piano.H, a.vertice),
            applicaOmografia(piano.H, a.a),
            applicaOmografia(piano.H, a.b)
          ]
        : [a.vertice, a.a, a.b];
      return Math.round(angoloGradi(v, pa, pb) * 10) / 10;
    }
    default:
      return null;
  }
}

/**
 * Base e altezza reali di un elemento quadrilatero, dalla calibrazione:
 * la base è misurata lungo il lato alto, l'altezza lungo il lato
 * sinistro — i lati REALI della figura, anche inclinati dalla
 * prospettiva. Con il piano prospettico la misura è rettificata.
 */
export function misureRettangolo(
  punti: [Punto, Punto, Punto, Punto],
  foto: CalibrazioneFoto,
  unita: Unita
): { base: number; altezza: number } | null {
  const [altoSx, altoDx, , bassoSx] = punti;
  const b = distanzaReale(foto, altoSx, altoDx);
  const h = distanzaReale(foto, altoSx, bassoSx);
  if (!b || !h) return null;
  return {
    base: arrotondaMisura(daMillimetri(inMillimetri(b.valore, b.unita), unita)),
    altezza: arrotondaMisura(daMillimetri(inMillimetri(h.valore, h.unita), unita))
  };
}

/**
 * Ricalcola i valori automatici dopo una modifica di geometria o di
 * calibrazione. Regola di automaticità: esplicita se presente, altrimenti
 * una quota senza valore è candidata al riempimento automatico.
 */
export function applicaValoriAuto(annotazioni: Annotazione[], foto: CalibrazioneFoto): Annotazione[] {
  return annotazioni.map((a) => {
    if (a.tipo === 'quotaRett') {
      const auto = a.valoreAuto ?? (a.valoreBase === null && a.valoreAltezza === null);
      if (!auto) return a;
      const m = misureRettangolo(quadrilateroQuotaRett(a), foto, a.unita);
      if (!m) return a;
      if (m.base === a.valoreBase && m.altezza === a.valoreAltezza && a.valoreAuto === true) return a;
      return { ...a, valoreBase: m.base, valoreAltezza: m.altezza, valoreAuto: true };
    }
    if (a.tipo === 'quotaPoligono') {
      const segs = segmentiPoligono(a);
      // in una pianta parametrica (con quote MANUALI) i lati AUTO seguono sempre
      // la geometria, anche se valoreAuto è false (regime misto manuale/auto)
      const haManuali = segs.some((s) => s.manuale);
      const auto = a.valoreAuto ?? segs.every((s) => s.valore === null);
      if (!auto && !haManuali) return a;
      if (!haCalibrazione(foto)) return a;
      const nuovi = segs.map((s) => {
        // le quote inserite a mano (manuale, non di riferimento) restano fisse:
        // NON si ricalcolano; le auto e le riferimento seguono la geometria
        if (s.manuale && !s.riferimento) return s;
        const da = a.punti[s.da];
        const ad = a.punti[s.a];
        if (!da || !ad) return s;
        const m = distanzaReale(foto, da, ad);
        if (!m) return s;
        return { ...s, valore: arrotondaMisura(daMillimetri(inMillimetri(m.valore, m.unita), a.unita)) };
      });
      if (nuovi.every((s, i) => s.valore === segs[i].valore)) return a;
      // se ci sono quote manuali il poligono resta in regime misto (valoreAuto invariato)
      return { ...a, segmenti: nuovi, valoreAuto: haManuali ? a.valoreAuto : true };
    }
    if (a.tipo !== 'quota' && a.tipo !== 'quotaAngolo' && a.tipo !== 'quotaRaggio') return a;
    const auto = a.valoreAuto ?? a.valore === null;
    if (!auto) return a;
    const v = valoreAutomatico(a, foto);
    if (v === null) return a;
    if (v === a.valore && a.valoreAuto === true) return a;
    return { ...a, valore: v, valoreAuto: true };
  });
}

// ---------------------------------------------------------------------------
// Classificazione della forma dell'elemento (rettangolo / trapezio / …)
// ---------------------------------------------------------------------------

export type FormaElemento = 'rettangolo' | 'trapezio' | 'quadrilatero';

/**
 * Classifica un quadrilatero dalla geometria nell'immagine:
 * - rettangolo: lati opposti ~uguali a coppie;
 * - trapezio: una sola coppia di lati opposti differisce (es. una parete
 *   sotto un tetto inclinato, o una finestra trapezoidale);
 * - quadrilatero: entrambe le coppie differiscono.
 * Indipendente dalla calibrazione: si basa sui rapporti dei lati.
 */
export function classificaForma(punti: [Punto, Punto, Punto, Punto]): FormaElemento {
  const [aSx, aDx, bDx, bSx] = punti;
  const sup = distanza(aSx, aDx);
  const inf = distanza(bSx, bDx);
  const sx = distanza(aSx, bSx);
  const dx = distanza(aDx, bDx);
  const diffOrizz = Math.abs(sup - inf) / Math.max(sup, inf, 1);
  const diffVert = Math.abs(sx - dx) / Math.max(sx, dx, 1);
  const tol = 0.06; // 6%: tolleranza per imprecisioni di tocco/rilevamento
  if (diffOrizz <= tol && diffVert <= tol) return 'rettangolo';
  if (diffOrizz > tol && diffVert > tol) return 'quadrilatero';
  return 'trapezio';
}

export interface MisureElemento {
  forma: FormaElemento;
  /** lati reali nell'unità della quota (null se non determinabili) */
  baseSup: number | null;
  baseInf: number | null;
  latoSx: number | null;
  latoDx: number | null;
  unita: Unita;
}

/**
 * Misure dei quattro lati dell'elemento. I valori di riferimento sono
 * la base superiore (valoreBase) e il lato sinistro (valoreAltezza);
 * gli altri due lati si ricavano dai rapporti in pixel, così la forma è
 * descritta per intero anche senza calibrazione e i valori manuali
 * restano la fonte.
 */
export function misureElemento(q: QuotaRettangolo): MisureElemento {
  const [aSx, aDx, bDx, bSx] = quadrilateroQuotaRett(q);
  const supPx = distanza(aSx, aDx);
  const infPx = distanza(bSx, bDx);
  const sxPx = distanza(aSx, bSx);
  const dxPx = distanza(aDx, bDx);
  const proporziona = (rif: number | null, pxRif: number, px: number): number | null =>
    rif === null || pxRif < 1e-6 ? null : arrotondaMisura((rif * px) / pxRif);
  return {
    forma: classificaForma([aSx, aDx, bDx, bSx]),
    baseSup: q.valoreBase,
    baseInf: proporziona(q.valoreBase, supPx, infPx),
    latoSx: q.valoreAltezza,
    latoDx: proporziona(q.valoreAltezza, sxPx, dxPx),
    unita: q.unita
  };
}

// ---------------------------------------------------------------------------
// Elemento poligonale (3, 5… lati)
// ---------------------------------------------------------------------------

/** Nome della forma in base al numero di lati (3 = triangolo, 5 = pentagono…) */
export function nomePoligono(nLati: number): string {
  switch (nLati) {
    case 3:
      return 'Triangolo';
    case 4:
      return 'Quadrilatero';
    case 5:
      return 'Pentagono';
    case 6:
      return 'Esagono';
    case 7:
      return 'Ettagono';
    case 8:
      return 'Ottagono';
    default:
      return `Poligono ${nLati} lati`;
  }
}

/**
 * Lunghezza reale di ciascun lato del poligono dalla calibrazione:
 * lati[i] è il segmento da punti[i] a punti[i+1] (l'ultimo chiude su
 * punti[0]). null se la foto non è calibrata.
 */
/** Misura reale di un singolo segmento (due punti immagine); null se non calibrata */
export function misuraSegmento(
  p1: Punto,
  p2: Punto,
  foto: CalibrazioneFoto,
  unita: Unita
): number | null {
  const m = distanzaReale(foto, p1, p2);
  if (!m) return null;
  return arrotondaMisura(daMillimetri(inMillimetri(m.valore, m.unita), unita));
}

export function misurePoligono(
  punti: Punto[],
  foto: CalibrazioneFoto,
  unita: Unita
): (number | null)[] | null {
  if (punti.length < 3) return null;
  if (!haCalibrazione(foto)) return null;
  return punti.map((p, i) => {
    const succ = punti[(i + 1) % punti.length];
    const m = distanzaReale(foto, p, succ);
    return m ? arrotondaMisura(daMillimetri(inMillimetri(m.valore, m.unita), unita)) : null;
  });
}

/**
 * Perimetro REALE del poligono: somma di TUTTI i lati della forma, non solo
 * quelli quotati. I lati senza quota vengono ricavati dalla geometria
 * (rapporto in pixel dal lato quotato più parallelo), così un rettangolo con
 * sole base e altezza dà 2·(b+h) e non b+h. Le diagonali non contano.
 */
export function perimetroReale(q: QuotaPoligono): number | null {
  const n = q.punti.length;
  if (n < 3) return null;
  const segs = segmentiPoligono(q);
  type Lato = { px: number; ang: number; val: number | null };
  const lati: Lato[] = [];
  for (let i = 0; i < n; i++) {
    const a = q.punti[i];
    const b = q.punti[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const s = segs.find(
      (g) =>
        segmentoELato(g, n) &&
        ((g.da === i && g.a === (i + 1) % n) || (g.da === (i + 1) % n && g.a === i))
    );
    lati.push({
      px: Math.hypot(dx, dy),
      ang: ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI,
      val: s ? s.valore : null
    });
  }
  const quotati = lati.filter((l) => l.val !== null);
  if (quotati.length === 0) return null;
  let tot = 0;
  for (const l of lati) {
    if (l.val !== null) {
      tot += l.val;
      continue;
    }
    // lato non quotato: lo si ricava dal lato quotato più parallelo
    let ref = quotati[0];
    let best = Infinity;
    for (const r of quotati) {
      let d = Math.abs(l.ang - r.ang);
      d = Math.min(d, Math.PI - d);
      if (d < best) {
        best = d;
        ref = r;
      }
    }
    tot += ref.px > 0 ? (ref.val as number) * (l.px / ref.px) : (ref.val as number);
  }
  return arrotondaMisura(tot);
}

// ---------------------------------------------------------------------------
// Angoli del triangolo e aree reali (con gestione della prospettiva)
// ---------------------------------------------------------------------------

/** lunghezza reale del lato del poligono che collega i vertici i e j (o null) */
function latoPoligono(q: QuotaPoligono, i: number, j: number): number | null {
  const s = segmentiPoligono(q).find(
    (g) => (g.da === i && g.a === j) || (g.da === j && g.a === i)
  );
  return s && s.valore !== null ? s.valore : null;
}

/**
 * Angoli ai tre vertici di un triangolo, ricavati SOLO dai 3 lati reali
 * (teorema del coseno). Tre lati determinano completamente il triangolo
 * (caso SSS): non servono altri dati. null se non è un triangolo, se mancano
 * lati o se i lati non rispettano la disuguaglianza triangolare.
 * L'ordine è [vertice 0, vertice 1, vertice 2], in gradi.
 */
export function angoliTriangolo(q: QuotaPoligono): [number, number, number] | null {
  if (q.punti.length !== 3) return null;
  const L01 = latoPoligono(q, 0, 1);
  const L12 = latoPoligono(q, 1, 2);
  const L20 = latoPoligono(q, 2, 0);
  if (L01 === null || L12 === null || L20 === null) return null;
  // angolo al vertice fra i due lati adiacenti x e y, opposto al lato `opp`
  const ang = (opp: number, x: number, y: number): number | null => {
    if (x <= 0 || y <= 0) return null;
    const c = (x * x + y * y - opp * opp) / (2 * x * y);
    if (c <= -1 || c >= 1) return null; // disuguaglianza triangolare non rispettata
    return (Math.acos(c) * 180) / Math.PI;
  };
  const a0 = ang(L12, L01, L20); // vertice 0: lati 0-1 e 2-0, opposto 1-2
  const a1 = ang(L20, L12, L01); // vertice 1: lati 1-2 e 0-1, opposto 2-0
  const a2 = ang(L01, L20, L12); // vertice 2: lati 2-0 e 1-2, opposto 0-1
  if (a0 === null || a1 === null || a2 === null) return null;
  const r = (g: number) => Math.round(g * 10) / 10;
  return [r(a0), r(a1), r(a2)];
}

/** Area con segno (shoelace) di un poligono di punti */
function areaShoelace(punti: Punto[]): number {
  let s = 0;
  for (let i = 0; i < punti.length; i++) {
    const a = punti[i];
    const b = punti[(i + 1) % punti.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Converte un'area da (unità lineari)² a metri quadri */
function areaInMetriQuadri(area: number, unita: Unita): number {
  const mmPerUnita = inMillimetri(1, unita);
  return (area * mmPerUnita * mmPerUnita) / 1_000_000;
}

/** Area di un triangolo dai 3 lati reali (formula di Erone), in (q.unita)² */
function areaTriangoloDaLati(q: QuotaPoligono): number | null {
  if (q.punti.length !== 3) return null;
  const a = latoPoligono(q, 0, 1);
  const b = latoPoligono(q, 1, 2);
  const c = latoPoligono(q, 2, 0);
  if (a === null || b === null || c === null) return null;
  const s = (a + b + c) / 2;
  const area2 = s * (s - a) * (s - b) * (s - c);
  return area2 <= 0 ? null : Math.sqrt(area2);
}

/** Area di un rettangolo da base×altezza (2 lati quotati non paralleli) */
function areaRettangoloDaLati(q: QuotaPoligono): number | null {
  const n = q.punti.length;
  if (n !== 4) return null;
  const lati = segmentiPoligono(q).filter((s) => segmentoELato(s, n) && s.valore !== null);
  if (lati.length !== 2) return null;
  const dir = (s: { da: number; a: number }) => {
    const p = q.punti[s.da];
    const r = q.punti[s.a];
    const ang = Math.atan2(r.y - p.y, r.x - p.x);
    return ((ang % Math.PI) + Math.PI) % Math.PI;
  };
  let d = Math.abs(dir(lati[0]) - dir(lati[1]));
  d = Math.min(d, Math.PI - d);
  if (d < Math.PI / 6) return null; // quasi paralleli: non sono base e altezza
  return (lati[0].valore as number) * (lati[1].valore as number);
}

export interface AreaReale {
  /** area in metri quadri */
  m2: number;
  /**
   * true = calcolo esatto: dal piano prospettico (omografia) oppure da una
   * forma rigida (triangolo da 3 lati, rettangolo da base×altezza).
   * false = stima dai pixel: valida solo se l'oggetto è ripreso frontalmente,
   * perché una scala lineare non corregge la prospettiva.
   */
  affidabile: boolean;
  metodo: 'piano' | 'triangolo' | 'rettangolo' | 'stima';
}

/**
 * Area reale di un poligono in m², scegliendo il metodo più affidabile:
 *  1) PIANO prospettico calibrato → vertici rettificati con l'omografia e
 *     shoelace: ESATTO anche in forte prospettiva (è il metodo consigliato).
 *  2) TRIANGOLO con 3 lati → formula di Erone: esatto e indipendente dalla
 *     prospettiva (un triangolo è rigido).
 *  3) RETTANGOLO con base×altezza → prodotto delle misure reali.
 *  4) altrimenti STIMA dai pixel scalati (assume ripresa frontale): segnalata
 *     come non affidabile, perché la prospettiva la falsa.
 */
export function areaReale(q: QuotaPoligono, foto: CalibrazioneFoto): AreaReale | null {
  const piano = omografiaDiFoto(foto, q.punti);
  if (piano) {
    const reali = q.punti.map((p) => applicaOmografia(piano.H, p));
    return {
      m2: areaInMetriQuadri(Math.abs(areaShoelace(reali)), piano.piano.unita),
      affidabile: true,
      metodo: 'piano'
    };
  }
  const tri = areaTriangoloDaLati(q);
  if (tri !== null) {
    return { m2: areaInMetriQuadri(tri, q.unita), affidabile: true, metodo: 'triangolo' };
  }
  const rett = areaRettangoloDaLati(q);
  if (rett !== null) {
    return { m2: areaInMetriQuadri(rett, q.unita), affidabile: true, metodo: 'rettangolo' };
  }
  if (foto.scala && foto.scala.px > 0) {
    const fattore = foto.scala.reale / foto.scala.px; // unità reali per pixel
    const apx = Math.abs(areaShoelace(q.punti));
    return {
      m2: areaInMetriQuadri(apx * fattore * fattore, foto.scala.unita),
      affidabile: false,
      metodo: 'stima'
    };
  }
  return null;
}

/** Area reale (m²) dell'elemento rettangolo legacy, stessa logica del poligono */
export function areaElemento(q: QuotaRettangolo, foto: CalibrazioneFoto): AreaReale | null {
  const punti = quadrilateroQuotaRett(q);
  const piano = omografiaDiFoto(foto, punti);
  if (piano) {
    const reali = punti.map((p) => applicaOmografia(piano.H, p));
    return {
      m2: areaInMetriQuadri(Math.abs(areaShoelace(reali)), piano.piano.unita),
      affidabile: true,
      metodo: 'piano'
    };
  }
  const m = misureElemento(q);
  if (m.baseSup !== null && m.latoSx !== null) {
    return {
      m2: areaInMetriQuadri(m.baseSup * m.latoSx, q.unita),
      affidabile: true,
      metodo: 'rettangolo'
    };
  }
  return null;
}

/** Perimetro reale del poligono (somma dei LATI quotati noti); null se nessuno */
export function perimetroPoligono(q: QuotaPoligono): number | null {
  const n = q.punti.length;
  const noti = segmentiPoligono(q)
    .filter((s) => segmentoELato(s, n) && s.valore !== null)
    .map((s) => s.valore as number);
  if (noti.length === 0) return null;
  return arrotondaMisura(noti.reduce((s, l) => s + l, 0));
}
