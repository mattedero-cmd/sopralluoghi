/**
 * IL RIQUADRO DI RITAGLIO, e i due modi di modificarlo.
 *
 * Il ritaglio di una panoramica è un quadrilatero: portando i quattro angoli
 * sugli spigoli del muro, quel muro viene poi visto di fronte. Ma una volta
 * messa la prospettiva giusta non la si vuole più toccare — si vuole solo
 * allargare o stringere l'inquadratura. Sono due gesti diversi:
 *
 * - tirare un ANGOLO cambia la prospettiva: è lì che si dice «questo è lo
 *   spigolo del muro»;
 * - tirare un LATO non la tocca: sposta soltanto dove finisce il ritaglio.
 *
 * Il secondo non è «trascina i due vertici del lato». Il quadrilatero è
 * l'immagine di un rettangolo: si legge il dito NELLE COORDINATE di quel
 * rettangolo, si sposta là il bordo, e si torna indietro. Così il lato
 * scivola seguendo la fuga — resta parallelo in prospettiva, non sullo
 * schermo — e gli altri tre restano esattamente sulle rette di prima.
 */

import type { Punto } from '../db/types';
import { applicaOmografia, calcolaOmografia, type Omografia } from './omografia';

export type Quad = [Punto, Punto, Punto, Punto];
/** 0 = alto, 1 = destro, 2 = basso, 3 = sinistro */
export type Lato = 0 | 1 | 2 | 3;

/** il quadrato unitario: il rettangolo di cui il quadrilatero è l'immagine */
const UNITARIO: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 }
];

/** quanto deve restare del ritaglio, in frazione: sotto non si scende */
const MINIMO = 0.05;

/** le due omografie fra il quadrilatero e il quadrato unitario */
function versoIlQuadrato(quad: Quad): { avanti: Omografia; indietro: Omografia } | null {
  try {
    return {
      avanti: calcolaOmografia(quad, UNITARIO),
      indietro: calcolaOmografia(UNITARIO, quad)
    };
  } catch {
    return null;
  }
}

/** il quadrilatero che ha per angoli il rettangolo [x0,x1]×[y0,y1] del quadrato */
function daRettangolo(indietro: Omografia, x0: number, y0: number, x1: number, y1: number): Quad {
  return [
    applicaOmografia(indietro, { x: x0, y: y0 }),
    applicaOmografia(indietro, { x: x1, y: y0 }),
    applicaOmografia(indietro, { x: x1, y: y1 }),
    applicaOmografia(indietro, { x: x0, y: y1 })
  ];
}

/**
 * IL LATO SPOSTATO, senza toccare la prospettiva.
 *
 * Restituisce null se il quadrilatero è degenere o se il lato finirebbe
 * addosso a quello opposto.
 */
export function quadConLato(quad: Quad, lato: Lato, punto: Punto): Quad | null {
  const m = versoIlQuadrato(quad);
  if (!m) return null;
  const p = applicaOmografia(m.avanti, punto);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  let [x0, y0, x1, y1] = [0, 0, 1, 1];
  if (lato === 0) y0 = Math.min(Math.max(p.y, -2), y1 - MINIMO);
  else if (lato === 2) y1 = Math.max(Math.min(p.y, 3), y0 + MINIMO);
  else if (lato === 3) x0 = Math.min(Math.max(p.x, -2), x1 - MINIMO);
  else x1 = Math.max(Math.min(p.x, 3), x0 + MINIMO);
  const nuovo = daRettangolo(m.indietro, x0, y0, x1, y1);
  if (nuovo.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) return null;
  return nuovo;
}

/**
 * DOVE STANNO LE MANIGLIE DEI LATI: il punto di mezzo di ogni lato letto
 * nelle coordinate del rettangolo, non sullo schermo. In prospettiva la metà
 * di un lato non è a metà strada fra i suoi due angoli, e una maniglia messa
 * lì si vedrebbe scivolare.
 */
export function maniglieDeiLatiQuad(quad: Quad): [Punto, Punto, Punto, Punto] | null {
  const m = versoIlQuadrato(quad);
  if (!m) return null;
  const mezzo = (x: number, y: number) => applicaOmografia(m.indietro, { x, y });
  const fuori: [Punto, Punto, Punto, Punto] = [
    mezzo(0.5, 0),
    mezzo(1, 0.5),
    mezzo(0.5, 1),
    mezzo(0, 0.5)
  ];
  return fuori.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? fuori : null;
}

/** Un angolo spostato: qui la prospettiva cambia, ed è quello che si vuole. */
export function quadConVertice(quad: Quad, vertice: number, punto: Punto): Quad {
  return quad.map((p, i) => (i === vertice ? punto : p)) as Quad;
}

/**
 * LE RETTE DEI QUATTRO LATI, per verificare che spostandone uno gli altri non
 * si muovano: è la promessa che il gesto fa a chi lo usa.
 */
export function retteDeiLati(quad: Quad): Array<{ a: number; b: number; c: number }> {
  return quad.map((p, i) => {
    const q = quad[(i + 1) % 4];
    const a = q.y - p.y;
    const b = p.x - q.x;
    const n = Math.hypot(a, b) || 1;
    return { a: a / n, b: b / n, c: -(a * p.x + b * p.y) / n };
  });
}
