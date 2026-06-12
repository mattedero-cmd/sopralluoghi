import { quadrilateroQuotaRett, type Annotazione, type Foto, type Punto, type Unita } from '../db/types';
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
    if (a.tipo !== 'quota' && a.tipo !== 'quotaAngolo' && a.tipo !== 'quotaRaggio') return a;
    const auto = a.valoreAuto ?? a.valore === null;
    if (!auto) return a;
    const v = valoreAutomatico(a, foto);
    if (v === null) return a;
    if (v === a.valore && a.valoreAuto === true) return a;
    return { ...a, valore: v, valoreAuto: true };
  });
}
