/**
 * DAL SOPRALLUOGO ALLA DISTINTA DI TAGLIO.
 *
 * Le forme quotate sulle foto sono già i pezzi da produrre: qui diventano
 * rettangoli da impaginare, con la MISURA DI TAGLIO — quella reale più le
 * abbondanze inserite sulla foto — riportata in millimetri.
 *
 * Il nesting lavora su rettangoli: di ogni forma si prende l'ingombro, cioè
 * il rettangolo minimo che la contiene. Per un rettangolo è la forma stessa;
 * per un cerchio il quadrato del diametro di taglio; per un poligono il suo
 * ingombro reale, allungato dalle abbondanze dei lati.
 */

import type { Annotazione, Foto, Punto, QuotaPoligono, SegmentoQuota, Unita } from '../db/types';
import { abbondanzaTotale, segmentiPoligono, segmentoELato } from '../db/types';
import { misuraSegmento } from './calibrazione';
import { misureElemento } from './calibrazione';
import { nomeFormaPoligono, simboliPoligono } from './primitive';
import { formaQuadrilatera, latiQuadrilatero, pannelliDellaForma } from './formaQuadrilatera';
import {
  poligonoConvesso,
  poligonoSagoma,
  sagomaSpeculare,
  type FormaPezzo
} from './sagome';
import { codicePannello } from './nomenclatura';
import { inMillimetri } from '../utils/format';

export interface PezzoDaMisura {
  /** nome leggibile: etichetta o nota della forma, altrimenti il tipo */
  nome: string;
  /** misure DI TAGLIO in millimetri (reale + abbondanze): l'INGOMBRO */
  larghezza: number;
  altezza: number;
  quantita: number;
  /** vero se la forma aveva abbondanze inserite */
  conAbbondanze: boolean;
  /**
   * SAGOMA VERA del pezzo, quando le quote la descrivono per intero (mm di
   * taglio). Il nesting la usa per incastrare i pezzi invece di affiancarne
   * gli ingombri; assente = il pezzo è davvero un rettangolo, o le misure
   * non bastano a dire di più (e allora non si inventa niente).
   */
  sagoma?: SagomaTaglio;
}

/** la forma con le sue misure, come la vuole il piano di taglio (mm) */
export interface SagomaTaglio {
  forma: FormaPezzo;
  /** d1: larghezza / Ø / base / diagonale maggiore / base maggiore */
  d1: number;
  /** d2: altezza / diagonale minore / h / altezza sinistra */
  d2: number;
  /** d3: base minore (trapezio isoscele) o altezza destra (trapezio rettangolo) */
  d3?: number;
  /** i vertici, quando la forma è un quadrilatero storto che tre misure non dicono */
  vertici?: Array<[number, number]>;
}

/**
 * IL QUADRILATERO STORTO, ricostruito dai suoi quattro lati.
 *
 * Quattro lati NON bastano a determinare un quadrilatero: tenendoli tutti
 * uguali la figura si deforma come un telaio snodato. Serve un quinto numero,
 * ed è la diagonale.
 *
 * - se una diagonale è quotata, la forma è esatta: due triangoli per tre lati
 *   ciascuno, niente di dedotto;
 * - se non c'è, la si prende dal quadrilatero DISEGNATO sulla foto, riportato
 *   in scala sui lati misurati. I quattro lati restano quelli presi sul posto
 *   — il pezzo tagliato ha le misure giuste — e a essere stimata è solo la
 *   «pendenza» della figura, cioè la stessa cosa che l'app già ricava dal
 *   disegno quando una quota manca. Meglio comunque del rettangolo
 *   d'ingombro, che di lati sbagliati ne ha quattro.
 *
 * Torna i vertici col lato di base in basso (y verso il basso, come l'SVG),
 * o null se i lati non chiudono una figura convessa.
 */
function quadDaLati(
  lati: { alto: number; basso: number; sinistro: number; destro: number },
  diagonale: number
): Array<[number, number]> | null {
  const { alto, basso, sinistro, destro } = lati;
  if (!(alto > 0 && basso > 0 && sinistro > 0 && destro > 0 && diagonale > 0)) return null;
  // la diagonale deve chiudere tutti e due i triangoli
  const dentro = (d: number, a: number, b: number) => d > Math.abs(a - b) && d < a + b;
  if (!dentro(diagonale, basso, destro) || !dentro(diagonale, alto, sinistro)) return null;

  // base in basso: A = basso-sx, B = basso-dx; la diagonale va da A a P1
  const A: [number, number] = [0, 0];
  const B: [number, number] = [basso, 0];
  // P1 (alto-dx): a `destro` da B e a `diagonale` da A
  const x1 = (diagonale * diagonale - destro * destro + basso * basso) / (2 * basso);
  const y1q = diagonale * diagonale - x1 * x1;
  if (y1q <= 0) return null;
  const P1: [number, number] = [x1, Math.sqrt(y1q)];
  // P0 (alto-sx): a `sinistro` da A e ad `alto` da P1 — dei due incroci si
  // prende quello dalla parte opposta alla base, se no la figura si ripiega
  const dx = P1[0] - A[0];
  const dy = P1[1] - A[1];
  const t = (sinistro * sinistro - alto * alto + diagonale * diagonale) / (2 * diagonale);
  const hq = sinistro * sinistro - t * t;
  if (hq <= 0) return null;
  const h = Math.sqrt(hq);
  const ux = dx / diagonale;
  const uy = dy / diagonale;
  const P0: [number, number] = [A[0] + ux * t - uy * h, A[1] + uy * t + ux * h];

  // in coordinate SVG (y verso il basso) e col riquadro appoggiato in (0,0)
  const su = [A, B, P1, P0];
  const maxY = Math.max(...su.map((q) => q[1]));
  const minX = Math.min(...su.map((q) => q[0]));
  const punti = su.map((q): [number, number] => [
    Math.round((q[0] - minX) * 1e6) / 1e6,
    Math.round((maxY - q[1]) * 1e6) / 1e6
  ]);
  return poligonoConvesso(punti) ? punti : null;
}

type CalibFoto = Pick<Foto, 'scala' | 'piano'>;

const mm = (v: number, u: Unita) => Math.round(inMillimetri(v, u) * 10) / 10;

/**
 * Ingombro reale di un poligono.
 *
 * Le misure di una forma vivono nelle QUOTE che ci si scrive sopra: una forma
 * può essere quotata benissimo su una foto mai calibrata, ed è il caso più
 * comune. Quindi l'ingombro si ricava dal disegno — che dà le proporzioni —
 * riportato in scala dalle misure scritte sui lati: un lato lungo 200 cm che
 * sul disegno misura 400 px dice che lì un pixel vale mezzo centimetro.
 *
 * La calibrazione della foto resta come ripiego, per le forme senza nemmeno
 * una misura scritta.
 */
function ingombroPoligono(
  punti: Punto[],
  segmenti: Array<{ da: number; a: number; valore: number | null }>,
  foto: CalibFoto,
  unita: Unita
): { larghezza: number; altezza: number } | null {
  if (punti.length < 2) return null;
  const xs = punti.map((p) => p.x);
  const ys = punti.map((p) => p.y);
  const largPx = Math.max(...xs) - Math.min(...xs);
  const altPx = Math.max(...ys) - Math.min(...ys);
  if (largPx <= 0 && altPx <= 0) return null;

  // scala ricavata dalle quote: separata per i lati orizzontali e verticali,
  // così una foto in prospettiva non falsa la direzione meno rappresentata
  const oriz: number[] = [];
  const vert: number[] = [];
  for (const s of segmenti) {
    if (s.valore === null || s.valore <= 0) continue;
    const p1 = punti[s.da];
    const p2 = punti[s.a];
    if (!p1 || !p2) continue;
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const px = Math.hypot(dx, dy);
    if (px < 1e-6) continue;
    (dx >= dy ? oriz : vert).push(s.valore / px);
  }
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const fx = media(oriz) ?? media(vert);
  const fy = media(vert) ?? media(oriz);

  if (fx !== null && fy !== null) {
    const larghezza = largPx * fx;
    const altezza = altPx * fy;
    if (larghezza > 0 && altezza > 0) return { larghezza, altezza };
  }

  // nessuna quota sui lati: si prova con la calibrazione della foto
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const larghezza = misuraSegmento({ x: x0, y: y0 }, { x: x1, y: y0 }, foto, unita);
  const altezza = misuraSegmento({ x: x0, y: y0 }, { x: x0, y: y1 }, foto, unita);
  if (larghezza === null || altezza === null || larghezza <= 0 || altezza <= 0) return null;
  return { larghezza, altezza };
}

/** misura di taglio di un segmento: valore scritto + abbondanze */
function taglioSegmento(s: SegmentoQuota): number | null {
  if (s.valore === null || s.valore <= 0) return null;
  return s.valore + abbondanzaTotale(s);
}

/**
 * INGOMBRO DALLE MISURE SCRITTE, la stessa fonte del report.
 *
 * Un pezzo si taglia b × h: quanto è largo e alto sul disegno non conta, e
 * anzi inganna, perché la forma è tracciata a mano su una foto in prospettiva.
 * Il rettangolo quotato «b 140 · h 220 con +2 e +2 di lato e +10 sotto» è un
 * pezzo da 144 × 230 cm esatti, non 141,4 × 229,8.
 *
 * Si riconosce la forma come nel report e si leggono i lati per quello che
 * dicono. Restituisce null quando le misure non bastano — poligoni irregolari,
 * lati non quotati — e allora l'ingombro si ricava dal disegno.
 */
function ingombroDaQuote(q: QuotaPoligono): { larghezza: number; altezza: number } | null {
  const segs = segmentiPoligono(q);
  const n = q.punti.length;
  const forma = nomeFormaPoligono(q);
  const lati = segs.filter((s) => segmentoELato(s, n));

  // QUADRILATERO: larghezza e altezza si leggono dalla posizione dei lati —
  // sopra/sotto e fianchi — non dal simbolo scritto. Così scambiare a mano i
  // nomi di base e altezza cambia la nomenclatura e non il pezzo da tagliare.
  if (n === 4 && forma !== 'Rombo') {
    const f = formaQuadrilatera(q);
    if (f) return { larghezza: f.taglio.larghezza, altezza: f.taglio.altezza };
  }

  // TRIANGOLO: i tre lati bastano a costruirlo. Si taglia appoggiato sul lato
  // più lungo, quindi l'ingombro è quel lato per l'altezza relativa.
  if (forma === 'Triangolo') {
    const v = lati.map(taglioSegmento);
    if (v.length !== 3 || v.some((x) => x === null)) return null;
    const [a, b, c] = v as number[];
    const sp = (a + b + c) / 2;
    const q2 = sp * (sp - a) * (sp - b) * (sp - c);
    if (q2 <= 0) return null; // lati che non chiudono un triangolo
    const base = Math.max(a, b, c);
    return { larghezza: base, altezza: (2 * Math.sqrt(q2)) / base };
  }

  const simboli = simboliPoligono(q);
  const larghezze: number[] = [];
  const altezze: number[] = [];
  const diagonali: number[] = [];
  segs.forEach((s, i) => {
    const v = taglioSegmento(s);
    if (v === null) return;
    if (!segmentoELato(s, n)) {
      diagonali.push(v);
      return;
    }
    // il simbolo del report dice già a che asse appartiene il lato: b/B in
    // larghezza, h/H in altezza (i pedici del quadrilatero non cambiano nulla)
    const sim = (simboli[i] ?? '').replace(/[₀-₉0-9]/g, '');
    if (sim === 'b' || sim === 'B') larghezze.push(v);
    else if (sim === 'h' || sim === 'H') altezze.push(v);
    else {
      // simbolo scritto a mano: si guarda come il lato è disegnato
      const p1 = q.punti[s.da];
      const p2 = q.punti[s.a];
      if (!p1 || !p2) return;
      (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? larghezze : altezze).push(v);
    }
  });

  // ROMBO: sta dentro il rettangolo delle sue diagonali
  if (forma === 'Rombo' && diagonali.length === 2) {
    return { larghezza: Math.max(...diagonali), altezza: Math.min(...diagonali) };
  }

  // rettangolo, trapezio, quadrilatero: il lato più lungo per ciascun verso
  if (larghezze.length > 0 && altezze.length > 0) {
    return { larghezza: Math.max(...larghezze), altezza: Math.max(...altezze) };
  }
  return null;
}

/** due misure prese sul campo sono «uguali» se differiscono meno di così */
const stessaMisura = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.002 + 0.05;

/**
 * LA SAGOMA VERA di una forma quotata, se le misure la descrivono.
 *
 * Il quadrilatero del sopralluogo ha un segmento quotato PER OGNI lato: le
 * due altezze della finestra sotto falda esistono già nei dati, vanno solo
 * lette prima del collasso a ingombro. Le regole, senza mai inventare:
 * - lati verticali diversi e basi uguali → trapezio rettangolo (base, h sx,
 *   h dx: la falda pende dal suo lato, e il verso si conserva);
 * - basi diverse e lati uguali → trapezio isoscele (B, b, h);
 * - diverse tutte e due le coppie → nessuna sagoma: resta l'ingombro, perché
 *   un quadrilatero qualunque non è fra le forme che il taglio sa trattare;
 * - il triangolo diventa sagoma con i TRE lati misurati, isoscele o storto
 *   che sia: tre lati sono già la forma, non c'è niente da dedurre;
 * - il cerchio è sempre sagoma: il diametro basta.
 * Valori nell'unità della forma; la conversione in mm la fa chi chiama.
 */
function sagomaDaQuote(
  a: Annotazione
): { forma: FormaPezzo; d1: number; d2: number; d3?: number; vertici?: Array<[number, number]> } | null {
  if (a.tipo === 'quotaRaggio') {
    const diametro = a.modo === 'diametro' ? a.valore : a.valore === null ? null : a.valore * 2;
    if (diametro === null || diametro <= 0) return null;
    const lato = diametro + 2 * (a.margine ?? 0);
    return { forma: 'cerchio', d1: lato, d2: lato };
  }
  if (a.tipo !== 'quotaPoligono') return null;
  const segs = segmentiPoligono(a);
  const n = a.punti.length;
  const forma = nomeFormaPoligono(a);

  if (forma === 'Rombo') {
    const diagonali = segs
      .filter((s) => !segmentoELato(s, n))
      .map((s) => (s.valore !== null && s.valore > 0 ? s.valore + abbondanzaTotale(s) : null));
    if (diagonali.length === 2 && diagonali.every((d): d is number => d !== null)) {
      return { forma: 'rombo', d1: Math.max(...diagonali), d2: Math.min(...diagonali) };
    }
    return null;
  }

  if (forma === 'Triangolo') {
    const v = segs
      .filter((s) => segmentoELato(s, n))
      .map((s) => (s.valore !== null && s.valore > 0 ? s.valore + abbondanzaTotale(s) : null));
    if (v.length !== 3 || v.some((x) => x === null)) return null;
    const [a, b, c] = (v as number[]).slice().sort((x, y) => y - x);
    // tre lati misurati BASTANO a costruire il triangolo, storto o no: non
    // c'è niente da inventare. Prima si chiedeva l'isoscele e un triangolo
    // qualunque finiva nel piano di taglio come rettangolo d'ingombro,
    // buttando via metà del materiale sotto la sua ipotenusa.
    if (!(a + b > c && a + c > b && b + c > a)) return null;
    return { forma: 'triangoloL', d1: a, d2: b, d3: c };
  }

  if (n === 4) {
    const lati = latiQuadrilatero(a);
    if (!lati) return null;
    const { alto, basso, sinistro, destro } = lati;
    // la falda vuole TUTTE E DUE le altezze misurate: non si inventa niente
    if (sinistro !== null && destro !== null && !stessaMisura(sinistro, destro)) {
      const base = alto ?? basso;
      const altraBase = basso ?? alto;
      // basi uguali (o una sola quotata): è la finestra sotto falda. Se anche
      // le basi sono diverse non è un trapezio — si prova il quadrilatero
      if (base !== null && (altraBase === null || stessaMisura(base, altraBase))) {
        return {
          forma: 'trapezioR',
          d1: Math.max(base, altraBase ?? base),
          d2: sinistro,
          d3: destro
        };
      }
    } else if (alto !== null && basso !== null && !stessaMisura(alto, basso)) {
      const h = sinistro ?? destro;
      if (h !== null) {
        return {
          forma: 'trapezio',
          d1: Math.max(alto, basso),
          d2: h,
          d3: Math.min(alto, basso)
        };
      }
    }

    /**
     * IL QUADRILATERO STORTO — la finestra fuori squadro.
     *
     * Non è né un trapezio né un rettangolo: nessuna coppia di lati uguali,
     * quattro misure tutte diverse. Finora finiva nel piano di taglio come
     * rettangolo d'ingombro, e di quel rettangolo NESSUNO dei quattro lati
     * era giusto. Se i quattro lati sono quotati la forma si ricostruisce:
     * serve la diagonale, quotata se c'è, altrimenti presa dal disegno.
     */
    if (alto !== null && basso !== null && sinistro !== null && destro !== null) {
      // Lati opposti uguali a due a due: è un parallelogramma, e senza una
      // diagonale non c'è modo di sapere se è storto o dritto. Un elemento
      // quotato su tutti e quattro i lati è quasi sempre un rettangolo
      // misurato per bene, non un parallelogramma: si lascia rettangolo, che
      // è anche quello che l'app ha sempre fatto. Con la diagonale quotata
      // invece la forma è determinata e si può seguire.
      const paralleloDritto = stessaMisura(alto, basso) && stessaMisura(sinistro, destro);
      const forma = formaQuadrilatera(a);
      const ordinati = forma?.quad;
      if (!ordinati) return null;
      // la diagonale basso-sx → alto-dx: prima si cerca quotata
      const perVertice = ordinati.map((p) => a.punti.indexOf(p));
      const quotata = segs.find(
        (sg) =>
          !segmentoELato(sg, n) &&
          sg.valore !== null &&
          sg.valore > 0 &&
          ((sg.da === perVertice[3] && sg.a === perVertice[1]) ||
            (sg.da === perVertice[1] && sg.a === perVertice[3]))
      );
      let diagonale: number;
      if (quotata) {
        diagonale = quotata.valore! + abbondanzaTotale(quotata);
      } else if (paralleloDritto) {
        return null;
      } else {
        // dal disegno: la diagonale disegnata, riportata in scala sui lati
        // misurati (media dei quattro rapporti, così un lato storto pesa poco)
        const dis = (i: number, j: number) =>
          Math.hypot(ordinati[i].x - ordinati[j].x, ordinati[i].y - ordinati[j].y);
        const coppie: Array<[number, number]> = [
          [dis(0, 1), alto],
          [dis(1, 2), destro],
          [dis(2, 3), basso],
          [dis(3, 0), sinistro]
        ];
        const scale = coppie.filter(([d]) => d > 0).map(([d, m]) => m / d);
        if (scale.length === 0) return null;
        diagonale = dis(3, 1) * (scale.reduce((x, y) => x + y, 0) / scale.length);
      }
      const vertici = quadDaLati({ alto, basso, sinistro, destro }, diagonale);
      if (vertici) return { forma: 'quad', d1: 0, d2: 0, vertici };
    }
  }
  return null;
}

/**
 * INGOMBRO DI TAGLIO di una forma, in millimetri.
 *
 * È il rettangolo minimo da cui ricavare il pezzo, abbondanze comprese. Vale
 * per i tre tipi di forma chiusa; per tutto il resto (quote lineari, angoli,
 * testi) restituisce null, perché non sono pezzi da tagliare.
 */
export function ingombroTaglio(
  a: Annotazione,
  foto: CalibFoto
): { larghezza: number; altezza: number; conAbbondanze: boolean; sagoma?: SagomaTaglio } | null {
  if (a.tipo === 'quotaRett') {
    const m = misureElemento(a);
    // di un trapezio o di un quadrilatero si prende l'ingombro: il lato
    // più lungo in orizzontale e quello più lungo in verticale
    const larg = Math.max(m.baseSup ?? 0, m.baseInf ?? 0);
    const alt = Math.max(m.latoSx ?? 0, m.latoDx ?? 0);
    if (larg <= 0 || alt <= 0) return null;
    return { larghezza: mm(larg, a.unita), altezza: mm(alt, a.unita), conAbbondanze: false };
  }

  if (a.tipo === 'quotaRaggio') {
    const diametro = a.modo === 'diametro' ? a.valore : a.valore === null ? null : a.valore * 2;
    if (diametro === null || diametro <= 0) return null;
    const margine = a.margine ?? 0;
    // l'ingombro resta il quadrato; la sagoma dice che dentro c'è un cerchio
    const lato = diametro + 2 * margine;
    return {
      larghezza: mm(lato, a.unita),
      altezza: mm(lato, a.unita),
      conAbbondanze: margine > 0,
      sagoma: { forma: 'cerchio', d1: mm(lato, a.unita), d2: mm(lato, a.unita) }
    };
  }

  if (a.tipo === 'quotaPoligono') {
    const segs = segmentiPoligono(a);
    const conAbb = segs.some((s) => segmentoELato(s, a.punti.length) && abbondanzaTotale(s) > 0);

    // prima le misure scritte: sono quelle che finiscono sul report e che
    // l'artigiano ha davvero preso
    const daQuote = ingombroDaQuote(a);
    if (daQuote) {
      const s = sagomaDaQuote(a);
      return {
        larghezza: mm(daQuote.larghezza, a.unita),
        altezza: mm(daQuote.altezza, a.unita),
        conAbbondanze: conAbb,
        sagoma: s
          ? {
              forma: s.forma,
              d1: mm(s.d1, a.unita),
              d2: mm(s.d2, a.unita),
              d3: s.d3 === undefined ? undefined : mm(s.d3, a.unita),
              vertici: s.vertici?.map(
                (q): [number, number] => [mm(q[0], a.unita), mm(q[1], a.unita)]
              )
            }
          : undefined
      };
    }

    const ing = ingombroPoligono(a.punti, segs, foto, a.unita);
    if (!ing) return null;
    // le abbondanze allungano i lati: quelle dei lati orizzontali entrano
    // nella larghezza, quelle dei lati verticali nell'altezza
    let extraL = 0;
    let extraA = 0;
    for (const s of segs) {
      const tot = abbondanzaTotale(s);
      if (tot <= 0 || !segmentoELato(s, a.punti.length)) continue;
      const p1 = a.punti[s.da];
      const p2 = a.punti[s.a];
      if (!p1 || !p2) continue;
      const orizzontale = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
      if (orizzontale) extraL = Math.max(extraL, tot);
      else extraA = Math.max(extraA, tot);
    }
    return {
      larghezza: mm(ing.larghezza + extraL, a.unita),
      altezza: mm(ing.altezza + extraA, a.unita),
      conAbbondanze: extraL > 0 || extraA > 0
    };
  }

  return null;
}

/** un telo di una forma pannellizzata, in millimetri di taglio */
export interface PannelloTaglio {
  /** progressivo dal lato di riferimento, da 1 */
  indice: number;
  larghezza: number;
  altezza: number;
  /** la forma vera del telo, quando l'elemento non è un rettangolo */
  sagoma?: SagomaTaglio;
}

/** ritaglia un poligono convesso con una fascia sull'asse dato */
function fasciaDiPoligono(
  poly: Array<[number, number]>,
  asse: 0 | 1,
  da: number,
  a: number
): Array<[number, number]> {
  let dentro = poly;
  const taglia = (tieni: (q: [number, number]) => boolean, dove: number) => {
    const fuori: Array<[number, number]> = [];
    for (let i = 0; i < dentro.length; i++) {
      const p1 = dentro[i];
      const p2 = dentro[(i + 1) % dentro.length];
      if (tieni(p1)) fuori.push(p1);
      if (tieni(p1) !== tieni(p2)) {
        const d = p2[asse] - p1[asse];
        const t = Math.abs(d) < 1e-9 ? 0 : (dove - p1[asse]) / d;
        const q: [number, number] = [
          p1[0] + (p2[0] - p1[0]) * t,
          p1[1] + (p2[1] - p1[1]) * t
        ];
        q[asse] = dove;
        fuori.push(q);
      }
    }
    dentro = fuori;
  };
  taglia((q) => q[asse] >= da - 1e-9, da);
  if (dentro.length === 0) return [];
  taglia((q) => q[asse] <= a + 1e-9, a);
  // via i vertici doppi che nascono quando il taglio passa per uno spigolo
  const puliti: Array<[number, number]> = [];
  for (const q of dentro) {
    const ultimo = puliti[puliti.length - 1];
    if (!ultimo || Math.hypot(q[0] - ultimo[0], q[1] - ultimo[1]) > 1e-6) puliti.push(q);
  }
  if (
    puliti.length > 1 &&
    Math.hypot(puliti[0][0] - puliti[puliti.length - 1][0], puliti[0][1] - puliti[puliti.length - 1][1]) <= 1e-6
  ) {
    puliti.pop();
  }
  return puliti;
}

/**
 * Il telo ritagliato, detto nella lingua più semplice che lo descrive.
 *
 * Tagliando un trapezio rettangolo con una fascia verticale escono altri
 * trapezi rettangoli — base in basso, due lati verticali, sopra la falda — e
 * conviene dirlo così: l'etichetta diventa «base × h sx | h dx», che è come
 * si scrive sul telo prima di posarlo. Negli altri casi (fascia orizzontale,
 * elemento fuori squadro) il telo è un quadrilatero qualunque e viaggia coi
 * suoi vertici.
 */
function sagomaDelTelo(poly: Array<[number, number]>): SagomaTaglio | null {
  if (poly.length < 3) return null;
  const xs = poly.map((q) => q[0]);
  const ys = poly.map((q) => q[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const vertici = poly.map((q): [number, number] => [
    Math.round((q[0] - minX) * 1e6) / 1e6,
    Math.round((q[1] - minY) * 1e6) / 1e6
  ]);
  const W = Math.max(...vertici.map((q) => q[0]));
  const H = Math.max(...vertici.map((q) => q[1]));
  if (!(W > 0 && H > 0)) return null;
  if (vertici.length === 4) {
    const vicino = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    const sinistri = vertici.filter((q) => vicino(q[0], 0));
    const destri = vertici.filter((q) => vicino(q[0], W));
    if (sinistri.length === 2 && destri.length === 2) {
      const bassoSx = sinistri.find((q) => vicino(q[1], H));
      const bassoDx = destri.find((q) => vicino(q[1], H));
      const altoSx = sinistri.find((q) => !vicino(q[1], H));
      const altoDx = destri.find((q) => !vicino(q[1], H));
      if (bassoSx && bassoDx && altoSx && altoDx) {
        return { forma: 'trapezioR', d1: W, d2: H - altoSx[1], d3: H - altoDx[1] };
      }
    }
  }
  return poligonoConvesso(vertici) ? { forma: 'quad', d1: W, d2: H, vertici } : null;
}

/**
 * I TELI DI UNA FORMA PANNELLIZZATA, PRONTI PER IL TAGLIO.
 *
 * Nel piano di taglio deve arrivare quello che si taglia davvero: se la
 * parete è divisa in quattro teli, quattro righe con le loro misure — non una
 * parete intera che nessuna bobina potrebbe contenere. Le misure comprendono
 * i sormonti, perché quelli si tagliano insieme al telo.
 */
export function pannelliTaglio(a: Annotazione): PannelloTaglio[] | null {
  const dati = pannelliDellaForma(a);
  if (!dati) return null;
  const u = dati.forma.unita;
  const verticale = dati.pann.asse === 'verticale';

  /**
   * LA PANNELLIZZAZIONE DI UN ELEMENTO NON RETTANGOLARE.
   *
   * Le giunzioni restano quello che sono: posizioni lungo un asse, decise
   * sul vetro. Ma un telo di una finestra sotto falda NON è un rettangolo —
   * è il pezzo di trapezio compreso fra le sue due giunzioni, e tagliarlo
   * rettangolare vuol dire buttare il triangolo che avanza e ritrovarsi in
   * posa un telo che non copre.
   *
   * Si prende quindi la sagoma intera già gonfiata delle abbondanze e la si
   * RITAGLIA fascia per fascia. Le coordinate combaciano: la sagoma ha il
   * riquadro a partire dal bordo del materiale, e i pannelli sono misurati
   * sul vetro, quindi basta traslare dell'abbondanza iniziale.
   */
  const s = sagomaDaQuote(a);
  const poly = s && s.forma !== 'rett' ? poligonoSagoma(sagomaComeMisure(s)) : null;
  const asse: 0 | 1 = verticale ? 0 : 1;
  // Le giunzioni sono misurate sulla misura DICHIARATA dell'elemento, la
  // sagoma sul suo ingombro: quasi sempre coincidono, ma se l'elemento è
  // quotato anche sul lato obliquo la misura dichiarata è più lunga
  // dell'ingombro. Si passa quindi per la frazione, che è anche quello che
  // si vede: nell'editor la giunzione sta a quella frazione del pezzo.
  const estensione = dati.totale + dati.abbondanze.inizio + dati.abbondanze.fine;
  const largo = poly
    ? Math.max(...poly.map((q) => q[asse])) - Math.min(...poly.map((q) => q[asse]))
    : 0;
  const dove = (u: number) =>
    estensione > 0 ? ((u + dati.abbondanze.inizio) / estensione) * largo : 0;

  return dati.pannelli.map((p) => {
    const ritagliato = poly ? fasciaDiPoligono(poly, asse, dove(p.inizio), dove(p.fine)) : [];
    const sagoma = ritagliato.length >= 3 ? sagomaDelTelo(ritagliato) : null;
    if (sagoma) {
      const xs = ritagliato.map((q) => q[0]);
      const ys = ritagliato.map((q) => q[1]);
      return {
        indice: p.indice,
        // l'ingombro del telo è quello della sua sagoma, comunque sia girata
        larghezza: mm(Math.max(...xs) - Math.min(...xs), u),
        altezza: mm(Math.max(...ys) - Math.min(...ys), u),
        sagoma: {
          forma: sagoma.forma,
          d1: mm(sagoma.d1, u),
          d2: mm(sagoma.d2, u),
          d3: sagoma.d3 === undefined ? undefined : mm(sagoma.d3, u),
          vertici: sagoma.vertici?.map((q): [number, number] => [mm(q[0], u), mm(q[1], u)])
        }
      };
    }
    return {
      indice: p.indice,
      // `larghezza` del pannello è sempre lungo l'asse di divisione: sull'asse
      // orizzontale è l'altezza del pezzo, non la sua base
      larghezza: mm(verticale ? p.larghezza : p.altezza, u),
      altezza: mm(verticale ? p.altezza : p.larghezza, u)
    };
  });
}

/**
 * La sagoma di taglio RIBALTATA: la gemella dall'altra parte del colmo.
 *
 * Ribaltare non è girare — un trapezio rettangolo girato ha la falda sempre
 * dallo stesso lato — quindi il pezzo speculare è un pezzo diverso da
 * tagliare, non una seconda copia dello stesso.
 */
export function speculaSagomaTaglio(s: SagomaTaglio): SagomaTaglio {
  const m = sagomaSpeculare(sagomaComeMisure(s));
  return {
    forma: m.forma ?? s.forma,
    d1: m.larghezza,
    d2: m.altezza,
    d3: m.misura3,
    vertici: m.vertici?.map((q): [number, number] => [q[0], q[1]])
  };
}

/** la sagoma di taglio letta come misure di forma, per farne il poligono */
function sagomaComeMisure(s: SagomaTaglio) {
  return { forma: s.forma, larghezza: s.d1, altezza: s.d2, misura3: s.d3, vertici: s.vertici };
}

/**
 * I pezzi ricavati dalle annotazioni di una foto, per via diretta.
 *
 * Nomi elementari e una riga per forma: il percorso completo — con i codici,
 * le forme riconosciute e le famiglie di copie — passa da `pezziDaProgetto`,
 * che usa il motore del report.
 */
export function pezziDaAnnotazioni(
  annotazioni: Annotazione[],
  foto: CalibFoto
): PezzoDaMisura[] {
  const pezzi: PezzoDaMisura[] = [];
  for (const a of annotazioni) {
    const ing = ingombroTaglio(a, foto);
    if (!ing) continue;
    let nome: string;
    if (a.tipo === 'quotaRaggio') nome = nomeDi(undefined, a.nota, 'Cerchio');
    else if (a.tipo === 'quotaPoligono')
      nome = nomeDi(a.etichetta, undefined, `Poligono ${a.punti.length} lati`);
    else if (a.tipo === 'quotaRett')
      nome = nomeDi(a.etichetta, undefined, nomeForma(misureElemento(a).forma));
    else continue;
    // una forma divisa in teli entra nella distinta come i suoi teli
    const teli = pannelliTaglio(a);
    if (teli) {
      for (const t of teli) {
        pezzi.push({
          nome: codicePannello(nome, t.indice - 1),
          larghezza: t.larghezza,
          altezza: t.altezza,
          quantita: 1,
          conAbbondanze: ing.conAbbondanze,
          sagoma: t.sagoma
        });
      }
      continue;
    }
    pezzi.push({
      nome,
      larghezza: ing.larghezza,
      altezza: ing.altezza,
      quantita: 1,
      conAbbondanze: ing.conAbbondanze,
      sagoma: ing.sagoma
    });
  }
  return pezzi;
}

/**
 * Perché da questo sopralluogo non è uscito nessun pezzo.
 *
 * Serve a dare una risposta invece di un vicolo cieco: una foto piena di
 * quote lineari è «tutta quotata» per chi l'ha fatta, ma non contiene forme
 * chiuse, e sono quelle a diventare pezzi.
 */
export interface DiagnosiPezzi {
  /** rettangoli, poligoni e cerchi trovati */
  formeChiuse: number;
  /** di quelle, quante non hanno misure utilizzabili */
  senzaMisura: number;
  /** quote lineari semplici: misurano, ma non delimitano un pezzo */
  quoteLineari: number;
  /** quote tecniche, angoli, testi, disegni… */
  altre: number;
}

export function diagnosiPezzi(annotazioni: Annotazione[], foto: CalibFoto): DiagnosiPezzi {
  const d: DiagnosiPezzi = { formeChiuse: 0, senzaMisura: 0, quoteLineari: 0, altre: 0 };
  for (const a of annotazioni) {
    if (a.tipo === 'quotaRett' || a.tipo === 'quotaPoligono' || a.tipo === 'quotaRaggio') {
      d.formeChiuse++;
      if (pezziDaAnnotazioni([a], foto).length === 0) d.senzaMisura++;
    } else if (a.tipo === 'quota') {
      d.quoteLineari++;
    } else {
      d.altre++;
    }
  }
  return d;
}

/** pezzi uguali per nome e misura raccolti in una riga sola */
export function raggruppaPezzi(pezzi: PezzoDaMisura[]): PezzoDaMisura[] {
  const mappa = new Map<string, PezzoDaMisura>();
  for (const p of pezzi) {
    // due pezzi con lo stesso ingombro ma forma diversa NON sono lo stesso
    // pezzo: un trapezio e il suo rettangolo si tagliano in modi diversi
    const sagoma = p.sagoma ? `|${p.sagoma.forma}:${p.sagoma.d1}×${p.sagoma.d2}×${p.sagoma.d3 ?? ''}` : '';
    const chiave = `${p.nome}|${p.larghezza}×${p.altezza}${sagoma}${
      p.sagoma?.vertici ? '|' + p.sagoma.vertici.map((q) => q.join(',')).join(' ') : ''
    }`;
    const gia = mappa.get(chiave);
    if (gia) {
      gia.quantita += p.quantita;
      gia.conAbbondanze = gia.conAbbondanze || p.conAbbondanze;
    } else {
      mappa.set(chiave, { ...p });
    }
  }
  return [...mappa.values()];
}

function nomeDi(etichetta: string | undefined, nota: string | undefined, difetto: string): string {
  const e = etichetta?.trim();
  const n = nota?.trim();
  if (e && n) return `${difetto} ${e} — ${n}`;
  if (e) return `${difetto} ${e}`;
  if (n) return n;
  return difetto;
}

function nomeForma(f: string): string {
  if (f === 'rettangolo') return 'Rettangolo';
  if (f === 'trapezio') return 'Trapezio';
  return 'Quadrilatero';
}
