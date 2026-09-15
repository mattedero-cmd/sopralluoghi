import type { Piazzamento } from './nesting';

/**
 * DISTANZA FRA DUE SAGOME.
 *
 * Serve a rispondere a una domanda sola: fra questi due pezzi ci passa la
 * lama? Ed è un conto che sembra banale e non lo è — due volte, scrivendolo,
 * mi ha dato risposte comode e sbagliate:
 *
 * - due lati INCROCIATI non hanno nessun estremo vicino all'altro lato: il
 *   minimo fra le quattro distanze punto-segmento torna allegramente dieci
 *   centimetri mentre i pezzi si accavallano;
 * - due lati COLLINEARI e staccati (due pezzi appoggiati alla stessa riga del
 *   margine) hanno tutti i prodotti vettoriali a zero, e un test di
 *   intersezione scritto in fretta li dichiara incidenti — cioè a distanza
 *   zero — quando sono lontanissimi;
 * - un pezzo finito TUTTO DENTRO un altro non ha nessun lato che tagli
 *   niente, eppure di distanza non ce n'è.
 *
 * Una prova che sbaglia questo conto non prova niente, e lo fa in silenzio; un
 * piano di taglio che lo sbaglia manda in macchina due pezzi sovrapposti. Per
 * questo la funzione sta qui, da sola, con le sue prove in
 * `__tests__/distanzaPoligoni.test.ts`.
 *
 * Vale per poligoni CONVESSI, che è quello che il motore a sagome produce.
 */

export type Punto = [number, number];

const croce = (o: Punto, a: Punto, b: Punto) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** q sta sul segmento a-b, sapendo che i tre punti sono allineati? */
const sulSegmento = (a: Punto, b: Punto, q: Punto) =>
  Math.min(a[0], b[0]) - 1e-9 <= q[0] &&
  q[0] <= Math.max(a[0], b[0]) + 1e-9 &&
  Math.min(a[1], b[1]) - 1e-9 <= q[1] &&
  q[1] <= Math.max(a[1], b[1]) + 1e-9;

/** i due segmenti si tagliano (o si sfiorano)? */
export function segmentiIncidenti(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const d1 = croce(a, b, c);
  const d2 = croce(a, b, d);
  const d3 = croce(c, d, a);
  const d4 = croce(c, d, b);
  // taglio netto: ciascun segmento ha gli estremi dell'altro da parti opposte
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;
  // casi allineati: un estremo appoggiato sull'altro segmento — e solo se ci
  // cade davvero sopra, che è il controllo che salva i lati collineari staccati
  if (d1 === 0 && sulSegmento(a, b, c)) return true;
  if (d2 === 0 && sulSegmento(a, b, d)) return true;
  if (d3 === 0 && sulSegmento(c, d, a)) return true;
  if (d4 === 0 && sulSegmento(c, d, b)) return true;
  return false;
}

export function distanzaSegmenti(a: Punto, b: Punto, c: Punto, d: Punto): number {
  if (segmentiIncidenti(a, b, c, d)) return 0;
  const puntoSegmento = (p: Punto, q: Punto, r: Punto) => {
    const vx = r[0] - q[0];
    const vy = r[1] - q[1];
    const l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - q[0]) * vx + (p[1] - q[1]) * vy) / l)) : 0;
    return Math.hypot(p[0] - (q[0] + t * vx), p[1] - (q[1] + t * vy));
  };
  return Math.min(
    puntoSegmento(a, c, d),
    puntoSegmento(b, c, d),
    puntoSegmento(c, a, b),
    puntoSegmento(d, a, b)
  );
}

/** il punto sta dentro il poligono convesso (bordo compreso)? */
export function puntoDentro(q: Punto, P: Punto[]): boolean {
  let positivi = 0;
  let negativi = 0;
  for (let i = 0; i < P.length; i++) {
    const c = croce(P[i], P[(i + 1) % P.length], q);
    if (c > 1e-9) positivi++;
    else if (c < -1e-9) negativi++;
  }
  return positivi === 0 || negativi === 0;
}

/** distanza fra due poligoni convessi: 0 se si toccano o si accavallano */
export function distanzaPoligoni(P: Punto[], Q: Punto[]): number {
  if (puntoDentro(P[0], Q) || puntoDentro(Q[0], P)) return 0;
  let m = Infinity;
  for (let i = 0; i < P.length; i++)
    for (let j = 0; j < Q.length; j++) {
      const d = distanzaSegmenti(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length]);
      if (d < m) m = d;
      if (m === 0) return 0;
    }
  return m;
}

/** distanza da un punto al poligono convesso: 0 se il punto è dentro */
export function distanzaPuntoPoligono(q: Punto, P: Punto[]): number {
  if (puntoDentro(q, P)) return 0;
  let m = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l)) : 0;
    const d = Math.hypot(q[0] - (a[0] + t * vx), q[1] - (a[1] + t * vy));
    if (d < m) m = d;
  }
  return m;
}

/**
 * La sagoma di un pezzo: un poligono convesso, oppure un cerchio.
 *
 * Il cerchio resta un cerchio e non diventa un poligono fitto, per due
 * motivi che tirano dalla stessa parte. È ESATTO: la distanza da un cerchio è
 * la distanza dal centro meno il raggio, senza approssimazioni da scegliere —
 * e un poligono inscritto farebbe passare la lama dentro il pezzo, uno
 * circoscritto terrebbe lontani gli altri pezzi per niente. Ed è VELOCE: un
 * confronto contro un poligono a sessantaquattro lati costa sessantaquattro
 * volte tanto, e il riaccostamento lo fa migliaia di volte per lastra.
 */
export interface Sagoma {
  punti: Punto[] | null;
  cerchio: { x: number; y: number; r: number } | null;
}

export function sagomaDi(p: Piazzamento, dx = 0, dy = 0): Sagoma {
  if (p.forma === 'cerchio') {
    const r = p.larghezza / 2;
    return { punti: null, cerchio: { x: p.x + r + dx, y: p.y + r + dy, r } };
  }
  if (p.punti && p.punti.length > 2)
    return {
      punti: p.punti.map((q) => [p.x + q[0] + dx, p.y + q[1] + dy] as Punto),
      cerchio: null
    };
  return {
    punti: [
      [p.x + dx, p.y + dy],
      [p.x + p.larghezza + dx, p.y + dy],
      [p.x + p.larghezza + dx, p.y + p.altezza + dy],
      [p.x + dx, p.y + p.altezza + dy]
    ],
    cerchio: null
  };
}

/** distanza fra due sagome: 0 se si toccano o si accavallano */
export function distanzaSagome(A: Sagoma, B: Sagoma): number {
  if (A.cerchio && B.cerchio) {
    const d = Math.hypot(A.cerchio.x - B.cerchio.x, A.cerchio.y - B.cerchio.y);
    return Math.max(0, d - A.cerchio.r - B.cerchio.r);
  }
  if (A.cerchio)
    return Math.max(0, distanzaPuntoPoligono([A.cerchio.x, A.cerchio.y], B.punti!) - A.cerchio.r);
  if (B.cerchio)
    return Math.max(0, distanzaPuntoPoligono([B.cerchio.x, B.cerchio.y], A.punti!) - B.cerchio.r);
  return distanzaPoligoni(A.punti!, B.punti!);
}

/** trasla una sagoma su un asse, riusando il posto: il riaccostamento lo fa migliaia di volte */
export function traslaIn(fuori: Sagoma, base: Sagoma, verso: 'x' | 'y', d: number): Sagoma {
  if (base.cerchio) {
    fuori.cerchio!.x = base.cerchio.x - (verso === 'x' ? d : 0);
    fuori.cerchio!.y = base.cerchio.y - (verso === 'y' ? d : 0);
    return fuori;
  }
  for (let i = 0; i < base.punti!.length; i++) {
    fuori.punti![i][0] = base.punti![i][0] - (verso === 'x' ? d : 0);
    fuori.punti![i][1] = base.punti![i][1] - (verso === 'y' ? d : 0);
  }
  return fuori;
}

/** una copia scrivibile della sagoma, da dare a `traslaIn` */
export function copiaSagoma(s: Sagoma): Sagoma {
  return s.cerchio
    ? { punti: null, cerchio: { ...s.cerchio } }
    : { punti: s.punti!.map((v) => [v[0], v[1]] as Punto), cerchio: null };
}

/** la coppia più stretta di un piano, sagoma contro sagoma */
export function coppiaPiuStretta(esito: { lastre: Array<{ piazzamenti: Piazzamento[] }> }) {
  let minima = Infinity;
  let chi = '';
  esito.lastre.forEach((l, i) => {
    const ps = l.piazzamenti;
    for (let a = 0; a < ps.length; a++)
      for (let b = a + 1; b < ps.length; b++) {
        const d = distanzaSagome(sagomaDi(ps[a]), sagomaDi(ps[b]));
        if (d < minima) {
          minima = d;
          chi = `${ps[a].nome} e ${ps[b].nome} sulla lastra ${i + 1}`;
        }
      }
  });
  return { minima, chi };
}
