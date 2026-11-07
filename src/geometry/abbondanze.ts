/**
 * L'ABBONDANZA, IN UN POSTO SOLO.
 *
 * Attorno al pezzo finito si lascia del materiale in più: serve a rifilare in
 * posa, a entrare sotto un fermavetro, a recuperare un muro che non è dritto.
 * Dove quel materiale va, e quanto, lo dicono tre numeri diversi, e la regola
 * che li mette d'accordo sta qui — perché la usano tutti e tre quelli che
 * devono dire la stessa cosa: il contorno tratteggiato sulla foto, la sagoma
 * di taglio della distinta e l'ambiente dei teli. Scritta tre volte, prima o
 * poi le tre figure si allontanano, e quello che si vede non è quello che
 * esce dalla macchina.
 *
 * I TRE NUMERI.
 *
 * 1. `abbInizio`/`abbFine` — l'abbondanza SULLA MISURA, ai due capi di una
 *    quota. È come si ragiona su un rettangolo: «la base è 120, dammene 2 di
 *    qua e 2 di là». Non allarga il lato che la porta: allarga i due lati di
 *    fianco, perché è il pavimento a scendere, non il montante ad allungarsi.
 *
 * 2. `abbLato` — l'abbondanza DEL LATO, perpendicolare a sé stesso. È come si
 *    ragiona su una polilinea: «questo lato da 24 deve sbordare di 2». Il
 *    lato resta da 24 e si sposta in fuori di 2; sono i vicini ad allungarsi
 *    per andarlo a prendere.
 *
 * 3. `abbPerimetro` — la stessa cosa, detta una volta per tutti i lati. Su
 *    una parete a sette lati è la differenza fra scrivere un numero e aprire
 *    sette lati uno per uno, dimenticandone uno.
 *
 * COME SI SOMMANO: non si sommano, VINCE IL PIÙ GRANDE. Un lato sborda di
 * quanto basta a soddisfare tutte le abbondanze che lo riguardano — le sue e
 * quelle dei vicini — e sommarle darebbe materiale che nessuno ha chiesto.
 */

import type { QuotaPoligono, SegmentoQuota } from '../db/types';
import { segmentiPoligono, segmentoELato } from '../db/types';
import { offsetPoligono } from './punti';

/** l'abbondanza scritta sul lato `s` al vertice `v`, nell'unità della quota */
export function abbondanzaAlVertice(s: SegmentoQuota, v: number): number {
  if (s.valore === null || !(s.valore > 0)) return 0;
  if (s.da === v) return s.abbInizio ?? 0;
  if (s.a === v) return s.abbFine ?? 0;
  return 0;
}

/**
 * L'ABBONDANZA DEL LATO: la sua, se ce l'ha scritta; se no quella perimetrale
 * della forma. Uno zero scritto a mano è una scelta e vale — il lato che va a
 * filo contro un muro non vuole abbondanza nemmeno se tutti gli altri ne
 * hanno.
 *
 * Vale anche su un lato non quotato: spostare un lato in fuori non chiede di
 * sapere quanto è lungo.
 */
export function abbondanzaDelLato(
  q: Pick<QuotaPoligono, 'abbPerimetro'>,
  s: SegmentoQuota | undefined
): number {
  const v = s?.abbLato ?? q.abbPerimetro ?? 0;
  return v > 0 ? v : 0;
}

/**
 * DI QUANTO SBORDA OGNI LATO di un poligono, per via delle abbondanze.
 *
 * Il lato i sborda del più grande fra:
 * - quello che gli chiedono i VICINI con le loro abbondanze sulla misura, ai
 *   due vertici che condivide con loro;
 * - quello che ha scritto LUI (`abbLato`, o l'abbondanza perimetrale).
 *
 * `quanto(s, v)` dice quanto vale l'abbondanza del lato `s` al vertice `v`,
 * nell'unità che serve a chi chiama: millimetri per il taglio, pixel per il
 * disegno sulla foto. `scalaLato(i)` fa lo stesso lavoro per l'abbondanza del
 * lato: quante unità di chi chiama vale un'unità della forma, sul lato i.
 */
export function sbordiLati(
  q: QuotaPoligono,
  quanto: (s: SegmentoQuota, v: number) => number,
  scalaLato: (i: number) => number = () => 1
): number[] {
  const n = q.punti.length;
  const segs = segmentiPoligono(q).filter((s) => segmentoELato(s, n));
  const lato = (i: number) =>
    segs.find((s) => (s.da === i && s.a === (i + 1) % n) || (s.a === i && s.da === (i + 1) % n));
  const al = (s: SegmentoQuota | undefined, v: number) => (s ? quanto(s, v) : 0);
  return q.punti.map((_, i) => {
    const daiVicini = Math.max(al(lato((i + n - 1) % n), i), al(lato((i + 1) % n), (i + 1) % n));
    const suo = abbondanzaDelLato(q, lato(i));
    return Math.max(daiVicini, suo > 0 ? suo * scalaLato(i) : 0);
  });
}

/** vero se da qualche parte su questa forma c'è un'abbondanza */
export function haAbbondanze(q: QuotaPoligono): boolean {
  if ((q.abbPerimetro ?? 0) > 0) return true;
  const n = q.punti.length;
  return segmentiPoligono(q).some(
    (s) =>
      (s.abbLato ?? 0) > 0 ||
      (segmentoELato(s, n) && s.valore !== null && s.valore > 0 && (s.abbInizio ?? 0) + (s.abbFine ?? 0) > 0)
  );
}

/**
 * I TRE LATI DI TAGLIO DI UN TRIANGOLO.
 *
 * Tre lati sono già la forma, e questo rende il triangolo l'unico posto dove
 * l'abbondanza si può dire tutta in numeri: si costruisce il triangolo netto,
 * si spostano i tre lati in fuori e si rileggono le tre misure nuove. Un
 * timpano con due centimetri attorno resta un timpano con gli stessi angoli,
 * solo più grande — e sono quei tre numeri che vanno al taglio.
 *
 * `null` se i lati non sono tre, non sono quotati, o non chiudono.
 */
export function latiTriangoloTaglio(q: QuotaPoligono): [number, number, number] | null {
  if (q.punti.length !== 3) return null;
  const segs = segmentiPoligono(q).filter((s) => segmentoELato(s, 3));
  const lato = (i: number) =>
    segs.find((s) => (s.da === i && s.a === (i + 1) % 3) || (s.a === i && s.da === (i + 1) % 3));
  const l: number[] = [];
  const sbordi: number[] = [];
  for (let i = 0; i < 3; i++) {
    const s = lato(i);
    if (!s || s.valore === null || !(s.valore > 0)) return null;
    // l'abbondanza SULLA MISURA allunga il lato, come ha sempre fatto
    l.push(s.valore + (s.abbInizio ?? 0) + (s.abbFine ?? 0));
    sbordi.push(abbondanzaDelLato(q, s));
  }
  const [a, b, c] = l;
  if (!(a + b > c && a + c > b && b + c > a)) return null;
  if (!sbordi.some((v) => v > 0)) return [a, b, c];

  // il triangolo netto appoggiato sul lato 0, e poi i lati in fuori
  const x = (a * a + c * c - b * b) / (2 * a);
  const h2 = c * c - x * x;
  if (!(h2 > 0)) return [a, b, c];
  const V = [
    { x: 0, y: 0 },
    { x: a, y: 0 },
    { x, y: Math.sqrt(h2) }
  ];
  const T = offsetPoligono(V, sbordi);
  if (T.length !== 3) return [a, b, c];
  const dist = (p: { x: number; y: number }, r: { x: number; y: number }) =>
    Math.hypot(r.x - p.x, r.y - p.y);
  const fuori: [number, number, number] = [
    dist(T[0], T[1]),
    dist(T[1], T[2]),
    dist(T[2], T[0])
  ];
  return fuori.every((v) => v > 0) ? fuori : [a, b, c];
}

/**
 * LE DUE DIAGONALI DI TAGLIO DI UN ROMBO.
 *
 * Di un rombo si quotano le diagonali, non i lati: l'abbondanza perimetrale
 * non ha un lato su cui scriversi, e allora la si applica dove va a finire —
 * un rombo gonfiato di due centimetri su ogni lato è lo stesso rombo
 * ingrandito attorno al centro, e di quanto lo dice il raggio del cerchio
 * inscritto. Niente angoli nuovi, niente forme che cambiano nome.
 */
export function diagonaliRomboTaglio(
  q: QuotaPoligono,
  diagonali: number[]
): number[] {
  if (diagonali.length !== 2) return diagonali;
  const n = q.punti.length;
  const segs = segmentiPoligono(q).filter((s) => segmentoELato(s, n));
  const lato = (i: number) =>
    segs.find((s) => (s.da === i && s.a === (i + 1) % n) || (s.a === i && s.da === (i + 1) % n));
  let t = 0;
  for (let i = 0; i < n; i++) t = Math.max(t, abbondanzaDelLato(q, lato(i)));
  if (!(t > 0)) return diagonali;
  const [D1, D2] = diagonali;
  if (!(D1 > 0 && D2 > 0)) return diagonali;
  const lung = Math.hypot(D1 / 2, D2 / 2);
  const raggio = (D1 * D2) / (4 * lung); // area / semiperimetro
  if (!(raggio > 0)) return diagonali;
  const k = (raggio + t) / raggio;
  return [D1 * k, D2 * k];
}
