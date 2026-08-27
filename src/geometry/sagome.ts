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
  | 'trapezioR';

export const FORME: Array<{ id: FormaPezzo; nome: string }> = [
  { id: 'rett', nome: 'Rettangolo' },
  { id: 'cerchio', nome: 'Cerchio' },
  { id: 'triangolo', nome: 'Triangolo isoscele' },
  { id: 'triangoloL', nome: 'Triangolo (3 lati)' },
  { id: 'rombo', nome: 'Rombo' },
  { id: 'trapezio', nome: 'Trapezio isoscele' },
  { id: 'trapezioR', nome: 'Trapezio rettangolo' }
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
