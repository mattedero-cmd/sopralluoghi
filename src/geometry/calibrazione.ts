import {
  quadrilateroQuotaRett,
  segmentiPoligono,
  segmentoELato,
  type Annotazione,
  type Foto,
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

type CalibrazioneFoto = Pick<Foto, 'scala' | 'piano'>;

export function haCalibrazione(foto: CalibrazioneFoto): boolean {
  return Boolean(foto.piano) || Boolean(foto.scala);
}

function omografiaDiFoto(foto: CalibrazioneFoto): Omografia | null {
  if (!foto.piano) return null;
  try {
    return omografiaPiano(foto.piano);
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
  const H = omografiaDiFoto(foto);
  if (H && foto.piano) {
    const a = applicaOmografia(H, p1);
    const b = applicaOmografia(H, p2);
    return { valore: Math.hypot(a.x - b.x, a.y - b.y), unita: foto.piano.unita };
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
      const H = omografiaDiFoto(foto);
      const [v, pa, pb] = H
        ? [applicaOmografia(H, a.vertice), applicaOmografia(H, a.a), applicaOmografia(H, a.b)]
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
      const auto = a.valoreAuto ?? segs.every((s) => s.valore === null);
      if (!auto) return a;
      if (!haCalibrazione(foto)) return a;
      const nuovi = segs.map((s) => {
        const da = a.punti[s.da];
        const ad = a.punti[s.a];
        if (!da || !ad) return s;
        const m = distanzaReale(foto, da, ad);
        if (!m) return s;
        return { ...s, valore: arrotondaMisura(daMillimetri(inMillimetri(m.valore, m.unita), a.unita)) };
      });
      if (a.valoreAuto === true && nuovi.every((s, i) => s.valore === segs[i].valore)) return a;
      return { ...a, segmenti: nuovi, valoreAuto: true };
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

/** Perimetro reale del poligono (somma dei LATI quotati noti); null se nessuno */
export function perimetroPoligono(q: QuotaPoligono): number | null {
  const n = q.punti.length;
  const noti = segmentiPoligono(q)
    .filter((s) => segmentoELato(s, n) && s.valore !== null)
    .map((s) => s.valore as number);
  if (noti.length === 0) return null;
  return arrotondaMisura(noti.reduce((s, l) => s + l, 0));
}
