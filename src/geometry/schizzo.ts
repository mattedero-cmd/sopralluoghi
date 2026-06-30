import type { Punto } from '../db/types';
import { distanza } from './punti';

/**
 * Raddrizzamento di uno schizzo a mano libera in una pianta a linee dritte
 * (§12). Lo schizzo grezzo (tanti punti ravvicinati del dito) viene
 * semplificato con Ramer–Douglas–Peucker nei soli vertici significativi e
 * chiuso in un poligono. L'ortogonalizzazione "a squadro" è un passo separato
 * e opzionale.
 */

/** Distanza perpendicolare del punto `p` dal segmento `a`–`b`. */
function distanzaPuntoSegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return distanza(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return distanza(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Semplificazione Ramer–Douglas–Peucker: conserva solo i vertici che si
 * discostano dalla retta più di `epsilon`. Iterativa (niente ricorsione, così
 * non esplode su tracciati lunghissimi).
 */
export function semplificaTracciato(punti: Punto[], epsilon: number): Punto[] {
  const n = punti.length;
  if (n < 3) return punti.slice();
  const tieni = new Array<boolean>(n).fill(false);
  tieni[0] = true;
  tieni[n - 1] = true;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [inizio, fine] = stack.pop()!;
    let dmax = 0;
    let idx = -1;
    for (let i = inizio + 1; i < fine; i++) {
      const d = distanzaPuntoSegmento(punti[i], punti[inizio], punti[fine]);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (dmax > epsilon && idx !== -1) {
      tieni[idx] = true;
      stack.push([inizio, idx], [idx, fine]);
    }
  }
  return punti.filter((_, i) => tieni[i]);
}

export interface OpzioniRaddrizza {
  /** tolleranza di semplificazione (px immagine); se assente, derivata dal tracciato */
  epsilon?: number;
  /** distanza (px) entro cui inizio e fine si considerano lo stesso punto */
  sogliaChiusura?: number;
}

/** Estensione diagonale del bounding box del tracciato. */
function diagonale(punti: Punto[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of punti) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/**
 * Converte uno schizzo a mano libera nel poligono CHIUSO della stanza:
 * unisce inizio/fine se vicini, semplifica nei vertici e scarta i vertici
 * quasi-collineari residui. Restituisce null se non si ottiene un poligono
 * valido (almeno 3 vertici).
 */
export function raddrizzaStanza(grezzo: Punto[], opts: OpzioniRaddrizza = {}): Punto[] | null {
  if (grezzo.length < 3) return null;
  const diag = diagonale(grezzo);
  const epsilon = opts.epsilon ?? Math.max(4, diag * 0.035);
  const sogliaChiusura = opts.sogliaChiusura ?? Math.max(8, diag * 0.08);

  // se il dito è tornato vicino al punto di partenza, è un anello: si toglie
  // il punto finale ridondante prima di semplificare
  const punti = grezzo.slice();
  if (punti.length > 3 && distanza(punti[0], punti[punti.length - 1]) <= sogliaChiusura) {
    punti.pop();
  }

  let vertici = semplificaTracciato(punti, epsilon);
  // la semplificazione lascia start/end: su un anello vanno trattati come
  // consecutivi, quindi si rimuove un eventuale doppione di chiusura
  if (vertici.length >= 2 && distanza(vertici[0], vertici[vertici.length - 1]) <= epsilon) {
    vertici = vertici.slice(0, -1);
  }
  // scarta i vertici quasi-collineari (angolo ~180°) rimasti
  vertici = rimuoviCollineari(vertici, epsilon);

  return vertici.length >= 3 ? vertici : null;
}

/** Rimuove dal poligono chiuso i vertici troppo "dritti" (lati quasi allineati). */
function rimuoviCollineari(vertici: Punto[], epsilon: number): Punto[] {
  if (vertici.length < 4) return vertici;
  const out: Punto[] = [];
  const n = vertici.length;
  for (let i = 0; i < n; i++) {
    const prev = vertici[(i - 1 + n) % n];
    const cur = vertici[i];
    const next = vertici[(i + 1) % n];
    if (distanzaPuntoSegmento(cur, prev, next) > epsilon) out.push(cur);
  }
  return out.length >= 3 ? out : vertici;
}

/**
 * Ortogonalizzazione "a squadro": porta ogni lato all'orizzontale o alla
 * verticale più vicina, mantenendo il poligono chiuso. Utile per le stanze
 * rettangolari; opzionale.
 */
export function squadra(vertici: Punto[]): Punto[] {
  const n = vertici.length;
  if (n < 3) return vertici;
  const out = vertici.map((p) => ({ ...p }));
  for (let i = 0; i < n; i++) {
    const a = out[i];
    const b = out[(i + 1) % n];
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      // lato prevalentemente orizzontale → stessa y (media)
      const y = (a.y + b.y) / 2;
      a.y = y;
      b.y = y;
    } else {
      // lato prevalentemente verticale → stessa x (media)
      const x = (a.x + b.x) / 2;
      a.x = x;
      b.x = x;
    }
  }
  return out;
}
