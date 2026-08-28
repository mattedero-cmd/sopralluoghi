/**
 * LA FORMA QUADRILATERA, COME LA VEDE LA PANNELLIZZAZIONE.
 *
 * Un telo si spezza lungo una retta: ha senso su una finestra o su una parete,
 * non su un pentagono. Qui una forma quotata a quattro angoli — la «quota
 * elemento» o un poligono di quattro vertici — viene letta in un modo solo:
 * i quattro angoli messi in verso (alto-sx, alto-dx, basso-dx, basso-sx), la
 * misura netta e la misura di taglio.
 *
 * È il traduttore fra il disegno sulla foto e il modello dei pannelli, e sta
 * apposta in un file suo: il disegno delle giunzioni, l'ambiente di modifica
 * e la distinta di taglio devono partire tutti dalle stesse quattro misure,
 * altrimenti la giunzione che si vede sulla foto non è quella che si taglia.
 */

import type { Annotazione, Punto, Unita } from '../db/types';
import {
  abbondanzaTotale,
  quadrilateroQuotaRett,
  segmentiPoligono,
  segmentoELato
} from '../db/types';
import { misureElemento } from './calibrazione';
import { ordinaQuad, quadConvesso } from './punti';
import {
  fasciaDiPoligono,
  poligonoConvesso,
  poligonoSagoma,
  type MisureForma,
  type PuntoSagoma
} from './sagome';
import {
  giuntiValidi,
  normalizzaPannellizzazione,
  pannelliDi,
  type AbbondanzeTelo,
  type AssePannelli,
  type Pannellizzazione,
  type Pannello
} from './pannelli';

export interface FormaQuadrilatera {
  /** angoli in ordine: alto-sx, alto-dx, basso-dx, basso-sx (px immagine) */
  quad: [Punto, Punto, Punto, Punto];
  /** misure a vista, senza abbondanze, nell'unità della forma */
  netta: { larghezza: number; altezza: number };
  /** misure DI TAGLIO: quelle che devono stare nella fascia del rotolo */
  taglio: { larghezza: number; altezza: number };
  /**
   * Quanto sborda l'abbondanza su ciascun lato. Non si può assumere
   * simmetrica: due centimetri ai lati e dieci sotto è il caso normale, non
   * l'eccezione, e i teli che ne escono sono di misure diverse.
   */
  abbondanze: { sinistra: number; destra: number; sopra: number; sotto: number };
  /**
   * LA SAGOMA VERA DEL VETRO, nel riquadro della forma: x da 0 a
   * `netta.larghezza`, y da 0 a `netta.altezza`, e i quattro angoli nello
   * stesso verso di `quad`. Su un rettangolo sono i quattro spigoli; su una
   * finestra sotto falda è il trapezio — ed è quello che si divide, perché
   * una giunzione cade sul vetro, non sul suo ingombro.
   */
  verticiNetti: [Punto, Punto, Punto, Punto];
  /** vero quando i vertici sono soltanto i quattro spigoli del riquadro */
  rettangolare: boolean;
  unita: Unita;
}

/** i quattro lati misurati di un quadrilatero, `null` dove non è quotato */
export interface LatiQuad {
  alto: number | null;
  basso: number | null;
  sinistro: number | null;
  destro: number | null;
}

/** due misure prese sul campo sono «uguali» se differiscono meno di così */
export const stessaMisura = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(a, b) * 0.002 + 0.05;

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
export function quadDaLati(
  lati: { alto: number; basso: number; sinistro: number; destro: number },
  diagonale: number
): PuntoSagoma[] | null {
  const { alto, basso, sinistro, destro } = lati;
  if (!(alto > 0 && basso > 0 && sinistro > 0 && destro > 0 && diagonale > 0)) return null;
  // la diagonale deve chiudere tutti e due i triangoli
  const dentro = (d: number, a: number, b: number) => d > Math.abs(a - b) && d < a + b;
  if (!dentro(diagonale, basso, destro) || !dentro(diagonale, alto, sinistro)) return null;

  // base in basso: A = basso-sx, B = basso-dx; la diagonale va da A a P1
  const A: PuntoSagoma = [0, 0];
  const B: PuntoSagoma = [basso, 0];
  // P1 (alto-dx): a `destro` da B e a `diagonale` da A
  const x1 = (diagonale * diagonale - destro * destro + basso * basso) / (2 * basso);
  const y1q = diagonale * diagonale - x1 * x1;
  if (y1q <= 0) return null;
  const P1: PuntoSagoma = [x1, Math.sqrt(y1q)];
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
  const P0: PuntoSagoma = [A[0] + ux * t - uy * h, A[1] + uy * t + ux * h];

  // in coordinate SVG (y verso il basso) e col riquadro appoggiato in (0,0)
  const su = [A, B, P1, P0];
  const maxY = Math.max(...su.map((q) => q[1]));
  const minX = Math.min(...su.map((q) => q[0]));
  const punti = su.map((q): PuntoSagoma => [
    Math.round((q[0] - minX) * 1e6) / 1e6,
    Math.round((maxY - q[1]) * 1e6) / 1e6
  ]);
  return poligonoConvesso(punti) ? punti : null;
}

/**
 * LA SAGOMA DI UN QUADRILATERO, LETTA DAI SUOI QUATTRO LATI.
 *
 * Il quadrilatero del sopralluogo ha un segmento quotato PER OGNI lato: le
 * due altezze della finestra sotto falda esistono già nei dati, vanno solo
 * lette prima del collasso a ingombro. Le regole, senza mai inventare:
 * - lati verticali diversi e basi uguali → trapezio rettangolo (base, h sx,
 *   h dx: la falda pende dal suo lato, e il verso si conserva);
 * - basi diverse e lati uguali → trapezio isoscele (B, b, h);
 * - quattro lati tutti quotati e nessuna coppia uguale → quadrilatero storto,
 *   ricostruito con la diagonale;
 * - in tutti gli altri casi `null`: è un rettangolo, o le misure non bastano.
 *
 * È l'unico posto dove si decide che forma ha un quadrilatero: la distinta di
 * taglio e l'ambiente di pannellizzazione leggono di qui, o disegnerebbero un
 * pezzo diverso da quello che si taglia.
 */
export function sagomaDaLati(
  lati: LatiQuad,
  diagonale: number | null,
  diagonaleQuotata: boolean
): MisureForma | null {
  const { alto, basso, sinistro, destro } = lati;

  if (sinistro !== null && destro !== null && !stessaMisura(sinistro, destro)) {
    const base = alto ?? basso;
    const altraBase = basso ?? alto;
    // basi uguali (o una sola quotata): è la finestra sotto falda. Se anche
    // le basi sono diverse non è un trapezio — si prova il quadrilatero
    if (base !== null && (altraBase === null || stessaMisura(base, altraBase))) {
      return {
        forma: 'trapezioR',
        larghezza: Math.max(base, altraBase ?? base),
        altezza: sinistro,
        misura3: destro
      };
    }
  } else if (alto !== null && basso !== null && !stessaMisura(alto, basso)) {
    const h = sinistro ?? destro;
    if (h !== null) {
      return {
        forma: 'trapezio',
        larghezza: Math.max(alto, basso),
        altezza: h,
        misura3: Math.min(alto, basso)
      };
    }
  }

  if (alto !== null && basso !== null && sinistro !== null && destro !== null) {
    // Lati opposti uguali a due a due: è un parallelogramma, e senza una
    // diagonale non c'è modo di sapere se è storto o dritto. Un elemento
    // quotato su tutti e quattro i lati è quasi sempre un rettangolo misurato
    // per bene, non un parallelogramma: si lascia rettangolo. Con la
    // diagonale quotata invece la forma è determinata e si può seguire.
    const paralleloDritto = stessaMisura(alto, basso) && stessaMisura(sinistro, destro);
    if (paralleloDritto && !diagonaleQuotata) return null;
    if (diagonale === null || !(diagonale > 0)) return null;
    const vertici = quadDaLati({ alto, basso, sinistro, destro }, diagonale);
    if (vertici) return { forma: 'quad', larghezza: 0, altezza: 0, vertici };
  }
  return null;
}

/**
 * LA DIAGONALE basso-sx → alto-dx del quadrilatero: quotata se c'è, altrimenti
 * ricavata dal disegno e riportata in scala sui lati misurati.
 *
 * `conAbbondanze` dice se si sta lavorando sulle misure di taglio (e allora
 * anche la diagonale porta le sue) o su quelle nette.
 */
export function diagonaleQuadrilatero(
  a: Annotazione,
  quad: [Punto, Punto, Punto, Punto],
  lati: LatiQuad,
  conAbbondanze: boolean
): { valore: number; quotata: boolean } | null {
  if (a.tipo !== 'quotaPoligono' || a.punti.length !== 4) return null;
  const { alto, basso, sinistro, destro } = lati;
  if (alto === null || basso === null || sinistro === null || destro === null) return null;
  const perVertice = quad.map((p) => a.punti.indexOf(p));
  if (perVertice.some((i) => i < 0)) return null;
  const quotata = segmentiPoligono(a).find(
    (sg) =>
      !segmentoELato(sg, 4) &&
      sg.valore !== null &&
      sg.valore > 0 &&
      ((sg.da === perVertice[3] && sg.a === perVertice[1]) ||
        (sg.da === perVertice[1] && sg.a === perVertice[3]))
  );
  if (quotata) {
    return {
      valore: quotata.valore! + (conAbbondanze ? abbondanzaTotale(quotata) : 0),
      quotata: true
    };
  }
  // dal disegno: la diagonale disegnata, riportata in scala sui lati misurati
  // (media dei quattro rapporti, così un lato storto pesa poco)
  const dis = (i: number, j: number) => Math.hypot(quad[i].x - quad[j].x, quad[i].y - quad[j].y);
  const coppie: Array<[number, number]> = [
    [dis(0, 1), alto],
    [dis(1, 2), destro],
    [dis(2, 3), basso],
    [dis(3, 0), sinistro]
  ];
  const scale = coppie.filter(([d]) => d > 0).map(([d, m]) => m / d);
  if (scale.length === 0) return null;
  return {
    valore: dis(3, 1) * (scale.reduce((x, y) => x + y, 0) / scale.length),
    quotata: false
  };
}

/** i quattro spigoli del riquadro, la sagoma di ripiego */
function riquadro(L: number, A: number): [Punto, Punto, Punto, Punto] {
  return [
    { x: 0, y: 0 },
    { x: L, y: 0 },
    { x: L, y: A },
    { x: 0, y: A }
  ];
}

/**
 * I QUATTRO ANGOLI VERI, riportati nel riquadro del vetro.
 *
 * Le giunzioni sono misurate sulla misura DICHIARATA dell'elemento, la sagoma
 * sul suo ingombro: quasi sempre coincidono, ma se l'elemento è quotato anche
 * sul lato obliquo la misura dichiarata è più lunga dell'ingombro. Si riporta
 * quindi la sagoma nel riquadro L × A, che è anche quello che si vede: nel
 * disegno la giunzione sta a quella frazione del pezzo.
 */
function verticiDellaSagoma(
  sagoma: MisureForma | null,
  L: number,
  A: number
): [Punto, Punto, Punto, Punto] | null {
  const poly = sagoma ? poligonoSagoma(sagoma) : null;
  if (!poly || poly.length !== 4 || !(L > 0 && A > 0)) return null;
  const xs = poly.map((q) => q[0]);
  const ys = poly.map((q) => q[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  if (!(w > 1e-9 && h > 1e-9)) return null;
  const punti = poly.map((q) => ({ x: ((q[0] - minX) / w) * L, y: ((q[1] - minY) / h) * A }));
  // stesso verso del quadrilatero disegnato, o l'omografia si attorciglia
  return quadConvesso(punti) ? ordinaQuad(punti) : null;
}

/**
 * LA SAGOMA DI TAGLIO: la sagoma del vetro gonfiata delle abbondanze.
 *
 * Ogni lato si sposta in fuori del suo sbordo e i lati si reincontrano dove si
 * incrociano: su un rettangolo tornano i quattro spigoli allargati, su una
 * falda l'obliquo resta obliquo — che è poi il pezzo che esce dalla macchina.
 */
export function sagomaDiTaglioQuad(
  vertici: Punto[],
  abbondanze: { sinistra: number; destra: number; sopra: number; sotto: number }
): Punto[] {
  if (vertici.length !== 4) return vertici.map((p) => ({ ...p }));
  // lato i = da vertici[i] a vertici[i+1]: alto, destro, basso, sinistro
  const sbordi = [abbondanze.sopra, abbondanze.destra, abbondanze.sotto, abbondanze.sinistra];
  const rette = vertici.map((p, i) => {
    const q = vertici[(i + 1) % 4];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    // normale uscente: coi vertici in verso orario e la y verso il basso è (dy, -dx)
    const n = { x: dy / len, y: -dx / len };
    return { n, c: n.x * p.x + n.y * p.y + sbordi[i] };
  });
  // lo zero negativo dell'aritmetica in virgola mobile non è un vertice
  // diverso da zero: si arrotonda al micron, come le altre sagome
  const pulito = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  return vertici.map((p, i) => {
    const r1 = rette[(i + 3) % 4];
    const r2 = rette[i];
    if (!r1 || !r2) return { ...p };
    const det = r1.n.x * r2.n.y - r1.n.y * r2.n.x;
    if (Math.abs(det) < 1e-9) return { ...p };
    return {
      x: pulito((r1.c * r2.n.y - r2.c * r1.n.y) / det),
      y: pulito((r1.n.x * r2.c - r2.n.x * r1.c) / det)
    };
  });
}

/** la coordinata che corre lungo l'asse di divisione: x se verticale, y se no */
const asseDi = (a: AssePannelli): 0 | 1 => (a === 'verticale' ? 0 : 1);

/** un poligono reale ritagliato fra due quote dell'asse di divisione */
export function fasciaSagoma(poly: Punto[], asse: AssePannelli, da: number, a: number): Punto[] {
  return fasciaDiPoligono(
    poly.map((p): [number, number] => [p.x, p.y]),
    asseDi(asse),
    da,
    a
  ).map(([x, y]) => ({ x, y }));
}

/**
 * I DUE BORDI della sagoma alla quota `u` dell'asse: da dove a dove c'è
 * materiale.
 *
 * Su un rettangolo sono sempre 0 e l'altezza, e infatti nessuno se n'è mai
 * accorto. Su una finestra sotto falda no: la giunzione va dal davanzale
 * all'obliquo, e disegnarla tutta intera la farebbe uscire dal vetro.
 */
export function bordiSagoma(poly: Punto[], asse: AssePannelli, u: number): { da: number; a: number } | null {
  const i = asseDi(asse);
  const co = (p: Punto) => (i === 0 ? p.x : p.y);
  const tr = (p: Punto) => (i === 0 ? p.y : p.x);
  const valori: number[] = [];
  for (let k = 0; k < poly.length; k++) {
    const p1 = poly[k];
    const p2 = poly[(k + 1) % poly.length];
    const c1 = co(p1);
    const c2 = co(p2);
    if (Math.abs(c1 - c2) < 1e-9) {
      // lato parallelo al taglio: conta solo se è proprio lui
      if (Math.abs(c1 - u) < 1e-6) valori.push(tr(p1), tr(p2));
      continue;
    }
    const t = (u - c1) / (c2 - c1);
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    valori.push(tr(p1) + (tr(p2) - tr(p1)) * t);
  }
  if (valori.length < 2) return null;
  return { da: Math.min(...valori), a: Math.max(...valori) };
}

/** true se su questa forma la pannellizzazione ha un senso */
export function ePannellizzabile(a: Annotazione): boolean {
  if (a.tipo === 'quotaRett') return true;
  return a.tipo === 'quotaPoligono' && a.punti.length === 4 && !a.soloEtichetta;
}

/**
 * Le quattro misure della forma, o null se non è un quadrilatero misurato.
 *
 * Senza le misure scritte non si pannellizza: dividere in teli vuol dire
 * decidere dei centimetri, e i centimetri stanno nelle quote, non nel disegno.
 */
export function formaQuadrilatera(a: Annotazione): FormaQuadrilatera | null {
  if (a.tipo === 'quotaRett') {
    const m = misureElemento(a);
    const larghezza = massimo(m.baseSup, m.baseInf);
    const altezza = massimo(m.latoSx, m.latoDx);
    if (larghezza === null || altezza === null) return null;
    const misure = { larghezza, altezza };
    return {
      quad: quadrilateroQuotaRett(a),
      netta: misure,
      // la quota elemento non porta abbondanze: taglio e netto coincidono
      taglio: { ...misure },
      abbondanze: { sinistra: 0, destra: 0, sopra: 0, sotto: 0 },
      // la quota elemento resta un rettangolo in tutta l'app — distinta di
      // taglio compresa — e qui non può dire il contrario
      verticiNetti: riquadro(larghezza, altezza),
      rettangolare: true,
      unita: a.unita
    };
  }

  if (a.tipo !== 'quotaPoligono' || a.punti.length !== 4 || a.soloEtichetta) return null;

  const quad = ordinaQuad(a.punti);
  // dalla posizione nel verso (0 alto-sx … 3 basso-sx) all'indice del vertice
  // com'è scritto nell'annotazione: i segmenti quotati parlano quella lingua
  const indice = quad.map((p) => a.punti.indexOf(p));
  if (indice.some((i) => i < 0)) return null;

  const segmenti = segmentiPoligono(a);
  const lato = (da: number, aVertice: number) =>
    segmenti.find(
      (s) =>
        (s.da === indice[da] && s.a === indice[aVertice]) ||
        (s.da === indice[aVertice] && s.a === indice[da])
    ) ?? null;

  const alto = lato(0, 1);
  const destro = lato(1, 2);
  const basso = lato(2, 3);
  const sinistro = lato(3, 0);

  const valore = (s: typeof alto) => (s && s.valore !== null && s.valore > 0 ? s.valore : null);

  /**
   * L'abbondanza di un lato AL VERTICE indicato.
   *
   * Su un segmento le due abbondanze stanno ai suoi estremi, e quale sia
   * «inizio» dipende da come il lato è stato tracciato: si guarda a quale
   * vertice corrisponde, non all'ordine in cui è scritto.
   */
  const abbondanzaAl = (s: typeof alto, verticeOrdinato: number): number => {
    if (!s) return 0;
    if (s.da === indice[verticeOrdinato]) return s.abbInizio ?? 0;
    if (s.a === indice[verticeOrdinato]) return s.abbFine ?? 0;
    return 0;
  };

  const larghezza = massimo(valore(alto), valore(basso));
  const altezza = massimo(valore(sinistro), valore(destro));
  if (larghezza === null || altezza === null) return null;

  /**
   * L'ingombro di taglio lungo un asse, e da che parte sborda.
   *
   * Comanda il LATO PIÙ LUNGO con le sue abbondanze, non la somma di tutte:
   * in un trapezio la base corta abbondata di cinque per parte può restare
   * dentro l'ingombro della base lunga, e sommarle darebbe un pezzo più
   * grande di quello che si taglia davvero. È la stessa regola della distinta
   * (`ingombroTaglio`): le due misure devono coincidere sempre.
   */
  const asse = (
    netto: number,
    lati: Array<{ s: typeof alto; primo: number; secondo: number }>
  ): { taglio: number; prima: number; dopo: number } => {
    let taglioMax = netto;
    for (const l of lati) {
      const v = valore(l.s);
      if (v === null) continue;
      taglioMax = Math.max(taglioMax, v + abbondanzaTotale(l.s!));
    }
    // di quanto si sborda ai due capi: lo dice il lato che determina
    // l'ingombro, non uno qualunque
    let prima = 0;
    let dopo = 0;
    for (const l of lati) {
      const v = valore(l.s);
      if (v === null || v + abbondanzaTotale(l.s!) < taglioMax) continue;
      prima = Math.max(prima, abbondanzaAl(l.s, l.primo));
      dopo = Math.max(dopo, abbondanzaAl(l.s, l.secondo));
    }
    // l'ingombro comanda: se il lato che lo determina è più corto del netto,
    // le sue abbondanze non allargano oltre. Si riportano in proporzione, così
    // netto + prima + dopo fa sempre l'ingombro
    const extra = taglioMax - netto;
    const somma = prima + dopo;
    if (somma <= 0) return { taglio: taglioMax, prima: 0, dopo: 0 };
    const scala = extra / somma;
    return { taglio: taglioMax, prima: prima * scala, dopo: dopo * scala };
  };

  // in larghezza i capi sono sinistra (vertici 0 e 3) e destra (1 e 2);
  // in altezza sono sopra (0 e 1) e sotto (3 e 2)
  const orizzontale = asse(larghezza, [
    { s: alto, primo: 0, secondo: 1 },
    { s: basso, primo: 3, secondo: 2 }
  ]);
  const verticale = asse(altezza, [
    { s: sinistro, primo: 0, secondo: 3 },
    { s: destro, primo: 1, secondo: 2 }
  ]);

  // LA SAGOMA VERA, dalle stesse quattro misure nette: due altezze diverse
  // sono una falda, due basi diverse un trapezio, quattro lati tutti diversi
  // un quadrilatero storto. Il ripiego è il riquadro, cioè il rettangolo.
  const latiNetti: LatiQuad = {
    alto: valore(alto),
    basso: valore(basso),
    sinistro: valore(sinistro),
    destro: valore(destro)
  };
  const diagonale = diagonaleQuadrilatero(a, quad, latiNetti, false);
  const netti = verticiDellaSagoma(
    sagomaDaLati(latiNetti, diagonale?.valore ?? null, diagonale?.quotata ?? false),
    larghezza,
    altezza
  );

  return {
    quad,
    netta: { larghezza, altezza },
    taglio: { larghezza: orizzontale.taglio, altezza: verticale.taglio },
    abbondanze: {
      sinistra: orizzontale.prima,
      destra: orizzontale.dopo,
      sopra: verticale.prima,
      sotto: verticale.dopo
    },
    verticiNetti: netti ?? riquadro(larghezza, altezza),
    rettangolare: netti === null,
    unita: a.unita
  };
}

/**
 * I QUATTRO LATI DI TAGLIO di un quadrilatero, ciascuno per conto suo.
 *
 * È la risposta alla domanda «questa finestra è sotto falda?»: il sopralluogo
 * quota OGNI lato con la sua misura (un SegmentoQuota per lato), quindi
 * l'altezza sinistra e la destra esistono separate nei dati — vanno solo
 * lette prima che il collasso a ingombro (Math.max) le fonda. I valori sono
 * DI TAGLIO: misura scritta più le abbondanze del lato, nell'unità della
 * forma. `null` dove il lato non è quotato.
 */
export function latiQuadrilatero(
  a: Annotazione
): { alto: number | null; basso: number | null; sinistro: number | null; destro: number | null } | null {
  if (a.tipo !== 'quotaPoligono' || a.punti.length !== 4 || a.soloEtichetta) return null;
  const quad = ordinaQuad(a.punti);
  const indice = quad.map((p) => a.punti.indexOf(p));
  if (indice.some((i) => i < 0)) return null;
  const segmenti = segmentiPoligono(a);
  const lato = (da: number, av: number) =>
    segmenti.find(
      (s) =>
        (s.da === indice[da] && s.a === indice[av]) || (s.da === indice[av] && s.a === indice[da])
    ) ?? null;
  const taglio = (s: ReturnType<typeof lato>) =>
    s && s.valore !== null && s.valore > 0 ? s.valore + abbondanzaTotale(s) : null;
  return {
    alto: taglio(lato(0, 1)),
    basso: taglio(lato(3, 2)),
    sinistro: taglio(lato(0, 3)),
    destro: taglio(lato(1, 2))
  };
}

/** la pannellizzazione applicata a una forma, se c'è e se regge */
export function pannellizzazioneDi(a: Annotazione): Pannellizzazione | null {
  if (a.tipo === 'quotaRett' || a.tipo === 'quotaPoligono') return a.pannelli ?? null;
  return null;
}

export interface PannelliForma {
  forma: FormaQuadrilatera;
  /** la pannellizzazione RISANATA: è questa che comanda, non quella salvata */
  pann: Pannellizzazione;
  /**
   * Le giunzioni che contano davvero, dentro il pezzo e in ordine. Chi disegna
   * deve usare queste: una giunzione salvata e poi finita fuori — perché la
   * misura è cambiata — non ha un telo suo, e disegnarla lascerebbe una riga
   * verde che non corrisponde a niente.
   */
  giunti: number[];
  pannelli: Pannello[];
  /** misura DEL VETRO lungo l'asse di divisione: è lei che si divide */
  totale: number;
  /** l'altra misura del vetro */
  trasversale: number;
  /** le abbondanze attorno al vetro, viste dall'asse */
  abbondanze: AbbondanzeTelo;
}

/** i teli di una forma pannellizzata, misure di taglio comprese */
export function pannelliDellaForma(a: Annotazione): PannelliForma | null {
  const salvata = pannellizzazioneDi(a);
  if (!salvata) return null;
  const forma = formaQuadrilatera(a);
  if (!forma) return null;
  // un salvataggio vecchio o arrivato da un altro dispositivo può contenere di
  // tutto: si risana PRIMA di leggere l'asse, o si sceglierebbe la misura da
  // dividere con una regola e l'asse con un'altra
  const asse = salvata.asse === 'orizzontale' ? 'orizzontale' : 'verticale';
  const verticale = asse === 'verticale';
  // SI DIVIDE IL VETRO: le giunzioni sono posizioni sull'elemento finito
  const totale = verticale ? forma.netta.larghezza : forma.netta.altezza;
  const pann = normalizzaPannellizzazione(salvata, totale);
  if (!pann) return null;
  const trasversale = verticale ? forma.netta.altezza : forma.netta.larghezza;
  const abbondanze = abbondanzeSullAsse(forma, asse);
  const pannelli = pannelliDi(totale, trasversale, pann, abbondanze);
  if (pannelli.length <= 1) return null;
  return {
    forma,
    pann,
    giunti: giuntiValidi(pann.giunti, totale),
    pannelli,
    totale,
    trasversale,
    abbondanze
  };
}

/** le abbondanze della forma, girate nel verso dell'asse di divisione */
export function abbondanzeSullAsse(
  forma: FormaQuadrilatera,
  asse: Pannellizzazione['asse']
): AbbondanzeTelo {
  const a = forma.abbondanze;
  return asse === 'verticale'
    ? { inizio: a.sinistra, fine: a.destra, trasversaleInizio: a.sopra, trasversaleFine: a.sotto }
    : { inizio: a.sopra, fine: a.sotto, trasversaleInizio: a.sinistra, trasversaleFine: a.destra };
}

function massimo(a: number | null, b: number | null): number | null {
  const valori = [a, b].filter((v): v is number => v !== null && v > 0);
  return valori.length ? Math.max(...valori) : null;
}
