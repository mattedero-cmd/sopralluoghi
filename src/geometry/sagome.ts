/**
 * SAGOME — la geometria dei pezzi non rettangolari.
 *
 * Un trapezio nestato per ingombro spreca il triangolo che gli manca; due
 * trapezi girati testa-coda si INCASTRANO. Qui vive tutto quello che serve a
 * trattare un pezzo per la sua forma vera: i poligoni canonici, l'area,
 * le rotazioni sensate e la rasterizzazione conservativa usata dal motore
 * (vedi geometry/nestingSagome.ts).
 *
 * Le forme coprono i pezzi che escono davvero da un sopralluogo:
 * - `trapezioR` è il caso critico — la finestra sotto falda, quotata con
 *   base + altezza sinistra + altezza destra;
 * - `trapezio` è l'isoscele (B, b, h);
 * - `triangoloL` è il triangolo dei TRE LATI, quello che si misura davvero
 *   in cantiere: tre lati misurati bastano a costruirlo (SSS), non serve che
 *   sia isoscele e non si inventa niente;
 * - cerchio, triangolo isoscele, rombo completano la serie.
 *
 * Tutti i poligoni generati sono CONVESSI: la rasterizzazione sfrutta lo
 * span unico per riga, e cambiare una forma qui senza rispettare la
 * convessità romperebbe il motore in silenzio.
 */

import type { PezzoNesting } from './nesting';

/** le forme che il taglio sa trattare; assente = rettangolo */
export type FormaPezzo =
  | 'rett'
  | 'cerchio'
  | 'triangolo'
  | 'triangoloL'
  | 'rombo'
  | 'trapezio'
  | 'trapezioR'
  | 'quad';

export const FORME: Array<{ id: FormaPezzo; nome: string }> = [
  { id: 'rett', nome: 'Rettangolo' },
  { id: 'cerchio', nome: 'Cerchio' },
  { id: 'triangolo', nome: 'Triangolo isoscele' },
  { id: 'triangoloL', nome: 'Triangolo (3 lati)' },
  { id: 'rombo', nome: 'Rombo' },
  { id: 'trapezio', nome: 'Trapezio isoscele' },
  { id: 'trapezioR', nome: 'Trapezio rettangolo' },
  { id: 'quad', nome: 'Quadrilatero (dal rilievo)' }
];

/** i campi di un pezzo che descrivono la sua forma */
export interface MisureForma {
  forma?: FormaPezzo;
  /** d1: larghezza / Ø / base / lato maggiore / diagonale 1 / base B / base */
  larghezza: number;
  /** d2: altezza / — / altezza / 2° lato / diagonale 2 / altezza h / altezza sx */
  altezza: number;
  /** d3: 3° lato del triangolo, base minore b (isoscele) o altezza destra */
  misura3?: number;
  /**
   * I VERTICI del pezzo, in millimetri, per le forme che tre misure non
   * bastano a descrivere. Un quadrilatero storto — la finestra fuori squadro
   * di una casa vecchia — ha bisogno di cinque numeri, non di tre: qui arriva
   * già costruito dal sopralluogo, col lato di base in basso, e il motore lo
   * tratta come qualunque altra sagoma.
   */
  vertici?: PuntoSagoma[];
}

/** il poligono è convesso? la rasterizzazione conta su questo (span unico) */
export function poligonoConvesso(punti: PuntoSagoma[]): boolean {
  if (punti.length < 3) return false;
  let segno = 0;
  for (let i = 0; i < punti.length; i++) {
    const a = punti[i];
    const b = punti[(i + 1) % punti.length];
    const c = punti[(i + 2) % punti.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (segno === 0) segno = s;
    else if (s !== segno) return false;
  }
  return segno !== 0;
}

/** vertici riportati col riquadro in (0,0), come tutti i poligoni canonici */
function verticiNormalizzati(punti: PuntoSagoma[]): PuntoSagoma[] {
  const mx = Math.min(...punti.map((q) => q[0]));
  const my = Math.min(...punti.map((q) => q[1]));
  return punti.map((q): PuntoSagoma => [
    Math.round((q[0] - mx) * 1e6) / 1e6,
    Math.round((q[1] - my) * 1e6) / 1e6
  ]);
}

export const formaDi = (p: Pick<MisureForma, 'forma'>): FormaPezzo => p.forma ?? 'rett';

/** la forma richiede la terza misura? */
export const servemisura3 = (f: FormaPezzo): boolean =>
  f === 'trapezio' || f === 'trapezioR' || f === 'triangoloL';

/**
 * I tre lati chiudono un triangolo? Serve la disuguaglianza triangolare: tre
 * numeri qualunque non fanno una forma, e un pezzo impossibile va contato
 * fra gli incompleti, non rasterizzato a NaN.
 */
function latiChiudono(a: number, b: number, c: number): boolean {
  return a > 0 && b > 0 && c > 0 && a + b > c && a + c > b && b + c > a;
}

/** altezza relativa al lato più lungo, per i tre lati (formula di Erone) */
function altezzaSuLatoMaggiore(a: number, b: number, c: number): number {
  const sp = (a + b + c) / 2;
  const area = Math.sqrt(Math.max(0, sp * (sp - a) * (sp - b) * (sp - c)));
  return (2 * area) / Math.max(a, b, c);
}

/**
 * Le misure bastano per questa forma? Un pezzo incompleto non si scarta in
 * silenzio: chi chiama lo conta e lo dice (la sparizione muta è già stata un
 * bug, altrove in quest'app).
 */
export function misureComplete(p: MisureForma): boolean {
  const f = formaDi(p);
  if (!(p.larghezza > 0)) return false;
  if (f !== 'cerchio' && !(p.altezza > 0)) return false;
  if (servemisura3(f) && !((p.misura3 ?? 0) > 0)) return false;
  // tre lati che non chiudono un triangolo non sono una forma
  if (f === 'triangoloL' && !latiChiudono(p.larghezza, p.altezza, p.misura3 ?? 0)) return false;
  // il poligono deve esserci ed essere convesso: la rasterizzazione conta
  // sullo span unico per riga, e un pezzo concavo la romperebbe in silenzio
  if (f === 'quad' && !(p.vertici && p.vertici.length >= 3 && poligonoConvesso(p.vertici))) {
    return false;
  }
  return true;
}

/** etichette dei campi misura, per i moduli: cosa scrivere sopra L / A / 3ª */
export function etichetteMisure(f: FormaPezzo): { l: string; a: string | null; m3: string | null } {
  switch (f) {
    case 'cerchio':
      return { l: 'Ø', a: null, m3: null };
    case 'triangolo':
      return { l: 'Base', a: 'H', m3: null };
    case 'triangoloL':
      return { l: 'Lato A', a: 'Lato B', m3: 'Lato C' };
    case 'rombo':
      return { l: 'Diag. 1', a: 'Diag. 2', m3: null };
    case 'trapezio':
      return { l: 'B magg.', a: 'H', m3: 'b min.' };
    case 'trapezioR':
      return { l: 'Base', a: 'H sx', m3: 'H dx' };
    case 'quad':
      // le sue misure sono i quattro lati, non due: la riga mostra l'ingombro
      return { l: 'Ingombro', a: '×', m3: null };
    default:
      return { l: 'L', a: 'A', m3: null };
  }
}

/**
 * INGOMBRO di un pezzo, qualunque sia la sua forma.
 *
 * È il rettangolo che il pezzo occupa comunque lo si guardi: per il trapezio
 * rettangolo l'altezza è la MAGGIORE delle due, non il campo `altezza` — che
 * tiene la sinistra per non perdere da che parte pende la falda.
 */
export function ingombroForma(p: MisureForma): { larghezza: number; altezza: number } {
  const f = formaDi(p);
  if (f === 'cerchio') return { larghezza: p.larghezza, altezza: p.larghezza };
  if (f === 'trapezioR') {
    return { larghezza: p.larghezza, altezza: Math.max(p.altezza, p.misura3 ?? 0) };
  }
  if (f === 'quad' && p.vertici && p.vertici.length >= 3) {
    const xs = p.vertici.map((q) => q[0]);
    const ys = p.vertici.map((q) => q[1]);
    return {
      larghezza: Math.max(...xs) - Math.min(...xs),
      altezza: Math.max(...ys) - Math.min(...ys)
    };
  }
  if (f === 'triangoloL') {
    // si taglia appoggiato sul lato più lungo: l'ingombro è quel lato per
    // l'altezza relativa (col lato maggiore in basso la punta cade DENTRO
    // la base, quindi la larghezza dell'ingombro è esattamente il lato)
    const d3 = p.misura3 ?? 0;
    if (!latiChiudono(p.larghezza, p.altezza, d3)) {
      return { larghezza: p.larghezza, altezza: p.altezza };
    }
    return {
      larghezza: Math.max(p.larghezza, p.altezza, d3),
      altezza: altezzaSuLatoMaggiore(p.larghezza, p.altezza, d3)
    };
  }
  return { larghezza: p.larghezza, altezza: p.altezza };
}

/** area GEOMETRICA vera del pezzo (un cerchio conta πr², non il suo quadrato) */
export function areaForma(p: MisureForma): number {
  const f = formaDi(p);
  const d1 = p.larghezza;
  const d2 = p.altezza;
  const d3 = p.misura3 ?? 0;
  if (f === 'cerchio') return (Math.PI * d1 * d1) / 4;
  if (f === 'triangolo') return (d1 * d2) / 2;
  if (f === 'triangoloL') {
    if (!latiChiudono(d1, d2, d3)) return 0;
    const sp = (d1 + d2 + d3) / 2;
    return Math.sqrt(Math.max(0, sp * (sp - d1) * (sp - d2) * (sp - d3)));
  }
  if (f === 'quad' && p.vertici && p.vertici.length >= 3) {
    let doppia = 0;
    for (let i = 0; i < p.vertici.length; i++) {
      const a = p.vertici[i];
      const b = p.vertici[(i + 1) % p.vertici.length];
      doppia += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(doppia) / 2;
  }
  if (f === 'rombo') return (d1 * d2) / 2;
  if (f === 'trapezio') return ((d1 + Math.min(d3, d1)) / 2) * d2;
  if (f === 'trapezioR') return (d1 * (d2 + d3)) / 2;
  return d1 * d2;
}

/** le misure scritte come si dicono: 600×400, Ø300, 500/300×200, 600×400|800 */
export function misureForma(p: MisureForma): string {
  const f = formaDi(p);
  const n = (v: number) => String(Math.round(v * 10) / 10);
  if (f === 'cerchio') return `Ø${n(p.larghezza)}`;
  if (f === 'quad' && p.vertici && p.vertici.length >= 3) {
    // i quattro lati, in giro: sono le misure che si sono prese sul posto
    return p.vertici
      .map((a, i) => {
        const b = p.vertici![(i + 1) % p.vertici!.length];
        return n(Math.hypot(b[0] - a[0], b[1] - a[1]));
      })
      .join('/');
  }
  if (f === 'triangoloL') {
    return `${n(p.larghezza)}/${n(p.altezza)}/${n(p.misura3 ?? 0)}`;
  }
  if (f === 'trapezio') return `${n(p.larghezza)}/${n(p.misura3 ?? 0)}×${n(p.altezza)}`;
  if (f === 'trapezioR') return `${n(p.larghezza)}×${n(p.altezza)}|${n(p.misura3 ?? 0)}`;
  return `${n(p.larghezza)}×${n(p.altezza)}`;
}

export type PuntoSagoma = [number, number];

/**
 * Poligono canonico della forma: bbox (0,0)–(w,h), y verso il basso (SVG).
 * Il cerchio non ha poligono (torna null) e viene rasterizzato per conto suo.
 */
export function poligonoSagoma(p: MisureForma): PuntoSagoma[] | null {
  const f = formaDi(p);
  const d1 = p.larghezza;
  const d2 = p.altezza;
  const d3 = p.misura3 ?? 0;
  if (f === 'rett') {
    return [
      [0, 0],
      [d1, 0],
      [d1, d2],
      [0, d2]
    ];
  }
  if (f === 'triangolo') {
    return [
      [d1 / 2, 0],
      [d1, d2],
      [0, d2]
    ];
  }
  if (f === 'quad') {
    return p.vertici && p.vertici.length >= 3 && poligonoConvesso(p.vertici)
      ? verticiNormalizzati(p.vertici)
      : null;
  }
  if (f === 'triangoloL') {
    // TRE LATI, nessuna ipotesi: il lato più lungo va in basso e la punta si
    // trova per intersezione dei due cerchi (SSS). Con la base più lunga il
    // piede dell'altezza cade dentro la base, quindi il poligono riempie
    // esattamente il suo ingombro e resta convesso.
    if (!latiChiudono(d1, d2, d3)) return null;
    const lati = [d1, d2, d3].sort((x, y) => y - x);
    const base = lati[0];
    // b è il lato che parte dal vertice sinistro, c quello dal destro
    const b = lati[1];
    const c = lati[2];
    const px = (base * base + b * b - c * c) / (2 * base);
    const h = Math.sqrt(Math.max(0, b * b - px * px));
    return [
      [Math.round(px * 1e6) / 1e6, 0],
      [base, h],
      [0, h]
    ];
  }
  if (f === 'rombo') {
    return [
      [d1 / 2, 0],
      [d1, d2 / 2],
      [d1 / 2, d2],
      [0, d2 / 2]
    ];
  }
  if (f === 'trapezio') {
    // base minore mai più larga della maggiore: dati storti non devono
    // produrre un poligono concavo
    const b = Math.min(d3, d1);
    return [
      [(d1 - b) / 2, 0],
      [(d1 + b) / 2, 0],
      [d1, d2],
      [0, d2]
    ];
  }
  if (f === 'trapezioR') {
    // base in basso, lati verticali di altezza d2 (sx) e d3 (dx),
    // sommità inclinata: la finestra sotto falda
    const H = Math.max(d2, d3);
    return [
      [0, H],
      [d1, H],
      [d1, H - d3],
      [0, H - d2]
    ];
  }
  return null; // cerchio
}

/**
 * RITAGLIA un poligono convesso con una fascia sull'asse dato.
 *
 * È il taglio di un telo: la sagoma intera entra, esce il pezzo compreso fra
 * due giunzioni. Coordinate assolute sull'asse (0 = x, 1 = y).
 */
export function fasciaDiPoligono(
  poly: PuntoSagoma[],
  asse: 0 | 1,
  da: number,
  a: number
): PuntoSagoma[] {
  let dentro = poly;
  const taglia = (tieni: (q: PuntoSagoma) => boolean, dove: number) => {
    const fuori: PuntoSagoma[] = [];
    for (let i = 0; i < dentro.length; i++) {
      const p1 = dentro[i];
      const p2 = dentro[(i + 1) % dentro.length];
      if (tieni(p1)) fuori.push(p1);
      if (tieni(p1) !== tieni(p2)) {
        const d = p2[asse] - p1[asse];
        const t = Math.abs(d) < 1e-9 ? 0 : (dove - p1[asse]) / d;
        const q: PuntoSagoma = [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
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
  const puliti: PuntoSagoma[] = [];
  for (const q of dentro) {
    const ultimo = puliti[puliti.length - 1];
    if (!ultimo || Math.hypot(q[0] - ultimo[0], q[1] - ultimo[1]) > 1e-6) puliti.push(q);
  }
  if (
    puliti.length > 1 &&
    Math.hypot(
      puliti[0][0] - puliti[puliti.length - 1][0],
      puliti[0][1] - puliti[puliti.length - 1][1]
    ) <= 1e-6
  ) {
    puliti.pop();
  }
  return puliti;
}

/**
 * Ruota i punti e ritrasla il bbox in (0,0). L'arrotondamento a 1e-6 tiene
 * stabili le chiavi di cache fra rotazioni equivalenti.
 */
export function ruotaPunti(pts: PuntoSagoma[], gradi: number): PuntoSagoma[] {
  if (gradi === 0) return pts.map((p) => [p[0], p[1]]);
  const rad = (gradi * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const out: PuntoSagoma[] = pts.map((p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]);
  let mx = Infinity;
  let my = Infinity;
  for (const p of out) {
    if (p[0] < mx) mx = p[0];
    if (p[1] < my) my = p[1];
  }
  return out.map((p) => [
    Math.round((p[0] - mx) * 1e6) / 1e6,
    Math.round((p[1] - my) * 1e6) / 1e6
  ]);
}

/**
 * La sagoma DI TAGLIO: il poligono finito gonfiato di metà abbondanza per
 * lato e riportato dentro l'ingombro del piazzamento. È la linea che la
 * macchina taglia: l'abbondanza sta DENTRO il pezzo tagliato, come nel
 * rettangolo di sempre (misura finita + abbondanza), altrimenti il pezzo
 * uscirebbe esatto e in posa non ci sarebbe niente da rifilare.
 *
 * Il gonfiaggio sposta ogni lato lungo la sua normale esterna (orientata col
 * centroide, come la maschera raster) e riinterseca i lati adiacenti. Gli
 * spigoli acuti — la punta di un triangolo — allungherebbero l'aumento oltre
 * l'ingombro: il ritaglio finale al rettangolo [0,L]×[0,A] li tosa, così il
 * contratto larghezza/altezza del piazzamento regge sempre. La maschera
 * raster gonfia con gli stessi semipiani più la mezza lama, quindi fra due
 * sagome di taglio resta comunque ALMENO la lama.
 *
 * `punti` sono i vertici finiti già ruotati, col bbox in (0,0).
 */
export function sagomaDiTaglio(
  punti: PuntoSagoma[],
  mezzaAbb: number,
  larghezza: number,
  altezza: number
): PuntoSagoma[] {
  const spostati: PuntoSagoma[] = punti.map((q) => [q[0] + mezzaAbb, q[1] + mezzaAbb]);
  if (!(mezzaAbb > 0)) return spostati;
  const n = spostati.length;
  let cx = 0;
  let cy = 0;
  for (const q of spostati) {
    cx += q[0] / n;
    cy += q[1] / n;
  }
  // una retta offset per lato: passa per (px,py) con direzione (dx,dy)
  const rette = spostati.map((a, i) => {
    const b = spostati[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lun = Math.hypot(dx, dy) || 1;
    let nx = dy / lun;
    let ny = -dx / lun;
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { px: a[0] + nx * mezzaAbb, py: a[1] + ny * mezzaAbb, dx, dy };
  });
  // il vertice i è l'incrocio fra la retta del lato prima e quella del suo
  let poli: PuntoSagoma[] = spostati.map((_, i) => {
    const r1 = rette[(i + n - 1) % n];
    const r2 = rette[i];
    const den = r1.dx * r2.dy - r1.dy * r2.dx;
    // lati collineari (non capita sulle forme canoniche): si resta sull'offset
    if (Math.abs(den) < 1e-9) return [r2.px, r2.py];
    const t = ((r2.px - r1.px) * r2.dy - (r2.py - r1.py) * r2.dx) / den;
    return [r1.px + r1.dx * t, r1.py + r1.dy * t];
  });
  // ritaglio all'ingombro (Sutherland–Hodgman, un semipiano alla volta)
  const clip = (
    dentro: (q: PuntoSagoma) => boolean,
    taglia: (a: PuntoSagoma, b: PuntoSagoma) => PuntoSagoma
  ) => {
    const fuori: PuntoSagoma[] = [];
    for (let i = 0; i < poli.length; i++) {
      const a = poli[i];
      const b = poli[(i + 1) % poli.length];
      if (dentro(a)) fuori.push(a);
      if (dentro(a) !== dentro(b)) fuori.push(taglia(a, b));
    }
    poli = fuori;
  };
  const suX = (v: number) => (a: PuntoSagoma, b: PuntoSagoma): PuntoSagoma => [
    v,
    a[1] + ((b[1] - a[1]) * (v - a[0])) / (b[0] - a[0])
  ];
  const suY = (v: number) => (a: PuntoSagoma, b: PuntoSagoma): PuntoSagoma => [
    a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]),
    v
  ];
  clip((q) => q[0] >= 0, suX(0));
  clip((q) => q[0] <= larghezza, suX(larghezza));
  clip((q) => q[1] >= 0, suY(0));
  clip((q) => q[1] <= altezza, suY(altezza));
  return poli.map((q) => [Math.round(q[0] * 1e6) / 1e6, Math.round(q[1] * 1e6) / 1e6]);
}

/**
 * LE ORIENTAZIONI SENSATE di una sagoma: «appoggia un lato per terra».
 *
 * I quarti di giro sono un'ipotesi da rettangoli. Un rombo o un triangolo
 * storto, girati a mano, si mettono quasi sempre con UN LATO orizzontale —
 * è così che due pezzi si combaciano lungo il fianco e che un pezzo si
 * stende contro il bordo del rotolo. Qui si calcolano proprio quegli angoli:
 * per ogni lato del poligono, la rotazione che lo porta orizzontale, più i
 * suoi tre quarti di giro (lato in basso, in alto, sui due fianchi).
 *
 * I quattro quarti canonici ci sono sempre: quello che si trovava prima non
 * si perde mai. L'elenco è ordinato e senza doppioni, così le chiavi di cache
 * restano stabili fra un calcolo e l'altro.
 */
export function orientazioniPer(p: MisureForma): number[] {
  const poly = poligonoSagoma(p);
  const viste = new Set<number>();
  const fuori: number[] = [];
  const aggiungi = (g: number) => {
    // 0,01° di risoluzione: due lati quasi paralleli non fanno due voci
    const n = Math.round((((g % 360) + 360) % 360) * 100) / 100;
    if (viste.has(n)) return;
    viste.add(n);
    fuori.push(n);
  };
  for (const q of [0, 90, 180, 270]) aggiungi(q);
  if (!poly) return [0]; // cerchio: non ha versi
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    // la rotazione che porta questo lato orizzontale, e i suoi quarti
    const g = -(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    for (const q of [0, 90, 180, 270]) aggiungi(g + q);
  }
  // Due angoli diversi possono dare lo STESSO pezzo appoggiato: un rombo è
  // simmetrico rispetto al centro, quindi metà dei suoi angoli sono doppioni,
  // e un quadrato ha un verso solo. Si confrontano i poligoni davvero
  // ruotati: chi arriva secondo non serve né a chi gira a mano (tocchi in
  // più a vuoto) né al motore (maschere in più da provare).
  const impronte = new Set<string>();
  return fuori.filter((g) => {
    const imp = ruotaPunti(poly, g)
      .map((q) => `${Math.round(q[0] * 100) / 100},${Math.round(q[1] * 100) / 100}`)
      .sort()
      .join(' ');
    if (impronte.has(imp)) return false;
    impronte.add(imp);
    return true;
  });
}

/**
 * DOVE SCRIVERE SOPRA UNA SAGOMA.
 *
 * Al centro del riquadro d'ingombro il nome di un triangolo finisce nella
 * metà vuota, sopra il pezzo accanto: due etichette accavallate e nessuna
 * delle due leggibile. Il baricentro di un poligono convesso invece sta
 * sempre dentro, e la larghezza utile è quanto è largo il pezzo proprio a
 * quell'altezza — non quanto è largo il riquadro.
 */
export function ancoraEtichetta(punti: PuntoSagoma[]): {
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
} {
  let doppiaArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < punti.length; i++) {
    const a = punti[i];
    const b = punti[(i + 1) % punti.length];
    const f = a[0] * b[1] - b[0] * a[1];
    doppiaArea += f;
    cx += (a[0] + b[0]) * f;
    cy += (a[1] + b[1]) * f;
  }
  const xs = punti.map((q) => q[0]);
  const ys = punti.map((q) => q[1]);
  if (Math.abs(doppiaArea) < 1e-9) {
    // poligono degenere: si ripiega sul centro del riquadro
    const l = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return {
      x: Math.min(...xs) + l / 2,
      y: Math.min(...ys) + h / 2,
      larghezza: l,
      altezza: h
    };
  }
  cx /= 3 * doppiaArea;
  cy /= 3 * doppiaArea;

  /**
   * IL RIQUADRO PIÙ GRANDE CHE STA DENTRO, centrato sul baricentro.
   *
   * Non basta misurare quanto è largo il pezzo all'altezza del baricentro: la
   * scritta occupa una fascia, e su un pezzo sbieco i suoi angoli escono anche
   * se il centro è comodo. È il motivo per cui il nome del quadrilatero
   * usciva dal pezzo mentre quello del rettangolo no.
   *
   * Per un poligono convesso ogni lato è un semipiano `n·x ≤ c`, e un
   * rettangolo largo w e alto h centrato in C ci sta tutto se il suo angolo
   * peggiore ci sta: |nx|·w/2 + |ny|·h/2 ≤ c − n·C. Fissata un'altezza, la
   * larghezza massima è quindi il minimo su tutti i lati; si prova una scala
   * di altezze e si tiene il riquadro di area maggiore. Chi impagina riceve
   * così una misura di cui può fidarsi nei due versi: il testo dritto e
   * quello girato stanno entrambi dentro lo stesso riquadro.
   */
  const semipiani: Array<{ a: number; b: number; k: number }> = [];
  for (let i = 0; i < punti.length; i++) {
    const p1 = punti[i];
    const p2 = punti[(i + 1) % punti.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const lun = Math.hypot(dx, dy);
    if (lun < 1e-9) continue;
    let nx = dy / lun;
    let ny = -dx / lun;
    // normale verso l'esterno: il baricentro deve restare dalla parte dentro
    if (nx * (cx - p1[0]) + ny * (cy - p1[1]) > 0) {
      nx = -nx;
      ny = -ny;
    }
    const k = nx * (p1[0] - cx) + ny * (p1[1] - cy);
    if (k <= 0) continue; // baricentro sul bordo: niente spazio da quel lato
    semipiani.push({ a: Math.abs(nx) / 2, b: Math.abs(ny) / 2, k });
  }
  const altezzaMax = Math.max(...ys) - Math.min(...ys);
  const larghezzaMax = Math.max(...xs) - Math.min(...xs);
  const larghezzaCon = (h: number): number => {
    let w = larghezzaMax;
    for (const { a, b, k } of semipiani) {
      // il riquadro può TOCCARE il bordo: `resto` a zero è ancora buono, ed è
      // il caso del rettangolo, dove il riquadro è il pezzo intero
      const resto = k - b * h;
      if (resto < -1e-9) return 0;
      if (a > 1e-9) w = Math.min(w, Math.max(0, resto) / a);
    }
    return Math.max(0, w);
  };
  let larghezza = 0;
  let altezza = 0;
  let miglioreArea = -1;
  const passi = 240;
  for (let i = 1; i <= passi; i++) {
    const h = (altezzaMax * i) / passi;
    const w = larghezzaCon(h);
    if (w * h > miglioreArea) {
      miglioreArea = w * h;
      larghezza = w;
      altezza = h;
    }
  }
  return { x: cx, y: cy, larghezza, altezza };
}

/**
 * IL VERSO CHE STRINGE DI PIÙ, più il suo mezzo giro.
 *
 * Un rombo appoggiato su un lato è un parallelogramma: affiancato a sé stesso
 * tassella senza buchi, mentre in piedi sulla punta lascia vuota metà del suo
 * riquadro (50% contro 81%). Ma tassella solo se le copie restano PARALLELE:
 * basta che la scansione ne giri una di novanta gradi e l'incastro salta. Qui
 * si sceglie quindi un appoggio solo — quello col riquadro più stretto — e si
 * lascia il mezzo giro, che serve ai trapezi per accoppiarsi testa-coda.
 */
export function versiParalleli(p: MisureForma): number[] {
  const poly = poligonoSagoma(p);
  if (!poly) return [0];
  let migliore = 0;
  let piuStretto = Infinity;
  for (const g of orientazioniPer(p)) {
    const r = ruotaPunti(poly, g);
    const l = Math.max(...r.map((q) => q[0]));
    const a = Math.max(...r.map((q) => q[1]));
    // a parità di riquadro vince il più basso: sul rotolo è quello che
    // fa avanzare meno il fronte di scansione
    if (l * a < piuStretto - 1e-6 || (Math.abs(l * a - piuStretto) < 1e-6 && a < Math.max(...ruotaPunti(poly, migliore).map((q) => q[1])))) {
      piuStretto = l * a;
      migliore = g;
    }
  }
  const impronta = (g: number) =>
    ruotaPunti(poly, g)
      .map((q) => `${Math.round(q[0] * 100) / 100},${Math.round(q[1] * 100) / 100}`)
      .sort()
      .join(' ');
  const mezzo = Math.round((((migliore + 180) % 360) + 360) % 360 * 100) / 100;
  return impronta(mezzo) === impronta(migliore) ? [migliore] : [migliore, mezzo];
}

/**
 * GLI APPOGGI PIÙ STRETTI, quelli che pareggiano col migliore.
 *
 * `versiParalleli` ne sceglie uno solo, ma spesso pareggiano: un rombo ha
 * QUATTRO appoggi con lo stesso identico riquadro, e quale dei quattro
 * impacchetti meglio non si sa guardando il pezzo — dipende da cosa gli sta
 * intorno. Su una lista vera fra il primo e il migliore ballava il 3,7% di
 * bobina, cioè quasi mezzo metro, deciso da un pareggio rotto a caso. Qui si
 * tornano tutti, e chi impacchetta li prova.
 */
export function versiStretti(p: MisureForma): number[] {
  const poly = poligonoSagoma(p);
  if (!poly) return [0];
  const conRiquadro = orientazioniPer(p).map((g) => {
    const r = ruotaPunti(poly, g);
    return { g, area: Math.max(...r.map((q) => q[0])) * Math.max(...r.map((q) => q[1])) };
  });
  const minimo = Math.min(...conRiquadro.map((x) => x.area));
  // il 2% di tolleranza: due appoggi che differiscono di un'inezia sono
  // entrambi candidati, uno che spreca il 10% in più no
  return conRiquadro.filter((x) => x.area <= minimo * 1.02).map((x) => x.g).slice(0, 4);
}

/**
 * LA SAGOMA RIBALTATA, come la finestra gemella dall'altra parte del colmo.
 *
 * Ribaltare non è girare: un trapezio rettangolo girato di mezzo giro ha la
 * falda che scende dallo stesso lato, ribaltato no. Per le forme simmetriche
 * — rettangolo, cerchio, rombo, trapezio isoscele — non cambia niente e si
 * torna la stessa sagoma; per la falda si scambiano le due altezze, e per un
 * poligono si specchiano i vertici attorno all'asse verticale.
 */
export function sagomaSpeculare<T extends MisureForma>(p: T): T {
  const f = formaDi(p);
  if (f === 'trapezioR') {
    return { ...p, altezza: p.misura3 ?? p.altezza, misura3: p.altezza };
  }
  if (f === 'triangoloL' || f === 'quad') {
    const poly = poligonoSagoma(p);
    if (!poly) return p;
    const W = Math.max(...poly.map((q) => q[0]));
    // specchiato attorno all'asse verticale, e il giro dei vertici si inverte
    // per non rovesciare il verso del poligono
    const vertici = poly
      .map((q): PuntoSagoma => [Math.round((W - q[0]) * 1e6) / 1e6, q[1]])
      .reverse();
    if (f === 'quad') return { ...p, vertici };
    // il triangolo dei tre lati è già descritto dai suoi lati: ribaltarlo
    // scambia quali sono il secondo e il terzo, e il poligono viene di
    // conseguenza. Si passa comunque per i vertici, che dicono tutto.
    return { ...p, forma: 'quad' as FormaPezzo, vertici };
  }
  return p;
}

/**
 * I versi fra cui far scorrere un pezzo quando lo si gira A MANO, in ordine.
 *
 * Sono gli stessi che il motore sa provare: un rettangolo ha il mezzo giro,
 * una sagoma i suoi appoggi di lato. Il cerchio non si gira.
 */
export function versiAMano(p: MisureForma): number[] {
  const f = formaDi(p);
  if (f === 'cerchio') return [0];
  if (f === 'rett') return p.larghezza === p.altezza ? [0] : [0, 90];
  if (f === 'quad' && !poligonoSagoma(p)) return [0];
  return orientazioniPer(p);
}

/**
 * Le rotazioni da provare per un pezzo.
 *
 * Per triangoli e trapezi si provano tutti e quattro i quarti: è il 180° che
 * fa incastrare due pezzi testa-coda, ed è il motivo per cui questo motore
 * esiste. Il cerchio non ha verso; il rettangolo e il rombo a 180° sono
 * identici a sé stessi, quindi basta il 90°.
 */
export function rotazioniPer(p: MisureForma & { ruotabile: boolean }): number[] {
  const f = formaDi(p);
  if (!p.ruotabile || f === 'cerchio') return [0];
  if (f === 'rett' || f === 'rombo') return p.larghezza === p.altezza ? [0] : [0, 90];
  if (f === 'quad') return poligonoSagoma(p) ? [0, 90, 180, 270] : [0];
  return [0, 90, 180, 270];
}

/**
 * Maschera raster di una sagoma: per ogni riga lo span [x0,x1] di celle
 * occupate (inclusive), o null se la riga è vuota.
 *
 * La sagoma finita è gonfiata di `pad` per lato — (lama+abbondanza)/2 — e una
 * cella è occupata se INTERSECA la sagoma gonfiata: mai sotto-copertura,
 * quindi mai sovrapposizioni reali fra pezzi piazzati. È il contratto su cui
 * si regge tutto il motore.
 */
export interface MascheraSagoma {
  w: number;
  h: number;
  rows: Array<[number, number] | null>;
  cells: number;
}

export function mascheraSagoma(
  p: MisureForma,
  rot: number,
  pad: number,
  cs: number
): MascheraSagoma {
  const rows: Array<[number, number] | null> = [];
  let cells = 0;

  if (formaDi(p) === 'cerchio') {
    const D = p.larghezza + 2 * pad;
    const R = D / 2;
    const c = D / 2;
    const n = Math.max(1, Math.ceil(D / cs - 1e-9));
    for (let j = 0; j < n; j++) {
      const yc = (j + 0.5) * cs;
      const dy = Math.max(Math.abs(yc - c) - cs / 2, 0);
      if (dy > R) {
        rows.push(null);
        continue;
      }
      const t = cs / 2 + Math.sqrt(Math.max(R * R - dy * dy, 0));
      const i0 = Math.max(0, Math.ceil((c - t) / cs - 0.5));
      const i1 = Math.min(n - 1, Math.floor((c + t) / cs - 0.5));
      if (i0 > i1) {
        rows.push(null);
        continue;
      }
      rows.push([i0, i1]);
      cells += i1 - i0 + 1;
    }
    return { w: n, h: n, rows, cells };
  }

  const pts = ruotaPunti(poligonoSagoma(p)!, rot);
  let w = 0;
  let h = 0;
  for (const q of pts) {
    if (q[0] > w) w = q[0];
    if (q[1] > h) h = q[1];
  }
  const mw = Math.max(1, Math.ceil((w + 2 * pad) / cs - 1e-9));
  const mh = Math.max(1, Math.ceil((h + 2 * pad) / cs - 1e-9));
  const tp: PuntoSagoma[] = pts.map((q) => [q[0] + pad, q[1] + pad]);
  let cx0 = 0;
  let cy0 = 0;
  for (const q of tp) {
    cx0 += q[0];
    cy0 += q[1];
  }
  cx0 /= tp.length;
  cy0 /= tp.length;

  // la normale di ogni lato è orientata verso l'ESTERNO tramite il centroide:
  // i poligoni non hanno winding garantito, e senza questo una forma tracciata
  // al contrario verrebbe rasterizzata vuota
  const lati: Array<{ ax: number; ay: number; nx: number; ny: number; off: number }> = [];
  for (let i = 0; i < tp.length; i++) {
    const a = tp[i];
    const b = tp[(i + 1) % tp.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const L = Math.sqrt(ex * ex + ey * ey);
    if (L < 1e-9) continue;
    let nx = ey / L;
    let ny = -ex / L;
    if (nx * (cx0 - a[0]) + ny * (cy0 - a[1]) > 0) {
      nx = -nx;
      ny = -ny;
    }
    // l'inflazione di `pad` sta QUI, nell'offset del semipiano: una cella è
    // dentro se dista dal lato meno di pad più la sua semi-estensione
    lati.push({ ax: a[0], ay: a[1], nx, ny, off: pad + ((Math.abs(nx) + Math.abs(ny)) * cs) / 2 });
  }

  for (let j = 0; j < mh; j++) {
    const ycc = (j + 0.5) * cs;
    let x0 = -1;
    let x1 = -1;
    for (let i = 0; i < mw; i++) {
      const xcc = (i + 0.5) * cs;
      let ok = true;
      for (const ed of lati) {
        if (ed.nx * (xcc - ed.ax) + ed.ny * (ycc - ed.ay) > ed.off) {
          ok = false;
          break;
        }
      }
      if (ok) {
        if (x0 < 0) x0 = i;
        x1 = i;
      } else if (x0 >= 0) {
        // regione convessa: lo span è unico, oltre non c'è più niente
        break;
      }
    }
    if (x0 < 0) rows.push(null);
    else {
      rows.push([x0, x1]);
      cells += x1 - x0 + 1;
    }
  }
  return { w: mw, h: mh, rows, cells };
}

/** un materiale contiene almeno un pezzo con la sagoma? */
export function haSagome(pezzi: Array<Pick<PezzoNesting, 'forma'>>): boolean {
  return pezzi.some((p) => (p.forma ?? 'rett') !== 'rett');
}
