import type { Punto } from '../db/types';
import { RicercaBordi, campiRicerca, regioneRiempita, rilevaFigura, type RegioneRiempita } from './bordi';

/**
 * Motore IBRIDO di rilevamento per oggetti a 4 lati (rettangoli e
 * quadrilateri in prospettiva: finestre, porte, pannelli, quadri, targhe).
 *
 * Principio: nessun metodo singolo vince sempre, quindi si generano più
 * candidati con tecniche indipendenti (line-tracking, flood→rettangolo di
 * area minima, 4 estremi, Hough delle rette) e un GIUDICE li valuta con un
 * punteggio dominato dall'"edge-support" (i 4 lati stanno davvero su bordi
 * reali?). Il migliore viene raffinato sub-pixel e, se la confidenza è
 * bassa, si restituisce null (meglio tacere che proporre spazzatura).
 */

export interface EsitoQuad4 {
  /** angoli in coordinate immagine: alto-sx, alto-dx, basso-dx, basso-sx */
  punti: [Punto, Punto, Punto, Punto];
  /** 0–1: qualità del rilevamento (edge-support + contrasto + geometria) */
  confidenza: number;
}

type Quad = [Punto, Punto, Punto, Punto];
type Campi = ReturnType<typeof campiRicerca>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Geometria di base (coordinate ridotte)
// ---------------------------------------------------------------------------

const sub = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Punto, b: Punto): number => a.x * b.y - a.y * b.x;
const len = (a: Punto): number => Math.hypot(a.x, a.y);

/** Ordina 4 punti come alto-sx, alto-dx, basso-dx, basso-sx (orario a schermo) */
export function ordinaQuad(pts: Punto[]): Quad {
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  const s = pts
    .slice(0, 4)
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // l'ordine angolare in coordinate y-verso-il-basso è già orario; si
  // ruota per partire dall'angolo in alto a sinistra (min x+y)
  let k = 0;
  for (let i = 1; i < 4; i++) if (s[i].x + s[i].y < s[k].x + s[k].y) k = i;
  return [s[k % 4], s[(k + 1) % 4], s[(k + 2) % 4], s[(k + 3) % 4]];
}

function convesso(q: Quad): boolean {
  let segno = 0;
  for (let i = 0; i < 4; i++) {
    const a = sub(q[(i + 1) % 4], q[i]);
    const b = sub(q[(i + 2) % 4], q[(i + 1) % 4]);
    const c = cross(a, b);
    if (Math.abs(c) < 1e-6) continue;
    const s = c > 0 ? 1 : -1;
    if (segno === 0) segno = s;
    else if (s !== segno) return false;
  }
  return segno !== 0;
}

function angoloCorner(prev: Punto, cur: Punto, next: Punto): number {
  const a = sub(prev, cur);
  const b = sub(next, cur);
  const d = (a.x * b.x + a.y * b.y) / (len(a) * len(b) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

function puntoInPoligono(q: Quad, p: Punto): boolean {
  let dentro = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = q[i];
    const b = q[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      dentro = !dentro;
    }
  }
  return dentro;
}

function areaQuad(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// ---------------------------------------------------------------------------
// Gradiente (Scharr): magnitudo + orientamento
// ---------------------------------------------------------------------------

function gradiente(c: Campi, x: number, y: number): { gx: number; gy: number; mag: number } {
  const { lum, w, h } = c;
  if (x < 1 || y < 1 || x > w - 2 || y > h - 2) return { gx: 0, gy: 0, mag: 0 };
  const L = (xx: number, yy: number) => lum[yy * w + xx];
  const gx =
    3 * L(x - 1, y - 1) + 10 * L(x - 1, y) + 3 * L(x - 1, y + 1) -
    (3 * L(x + 1, y - 1) + 10 * L(x + 1, y) + 3 * L(x + 1, y + 1));
  const gy =
    3 * L(x - 1, y - 1) + 10 * L(x, y - 1) + 3 * L(x + 1, y - 1) -
    (3 * L(x - 1, y + 1) + 10 * L(x, y + 1) + 3 * L(x + 1, y + 1));
  return { gx, gy, mag: Math.hypot(gx, gy) };
}

interface Roi {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Soglia di magnitudo adattiva: mediana dei gradienti campionati nella ROI */
function magnitudoBase(c: Campi, roi: Roi): number {
  const mags: number[] = [];
  const passoX = Math.max(1, Math.floor((roi.x2 - roi.x1) / 50));
  const passoY = Math.max(1, Math.floor((roi.y2 - roi.y1) / 50));
  for (let y = roi.y1; y <= roi.y2; y += passoY) {
    for (let x = roi.x1; x <= roi.x2; x += passoX) mags.push(gradiente(c, x, y).mag);
  }
  if (mags.length < 4) return 8;
  mags.sort((a, b) => a - b);
  return mags[Math.floor(mags.length * 0.5)] * 1.5;
}

// ---------------------------------------------------------------------------
// Il GIUDICE: punteggio di un candidato (0 = scartato, 1 = perfetto)
// ---------------------------------------------------------------------------

export function punteggioQuad(c: Campi, quad: Quad, seme: Punto, magSoglia: number): number {
  // --- gate di validità geometrica ---
  if (!convesso(quad)) return 0;
  let latoMin = Infinity;
  for (let i = 0; i < 4; i++) latoMin = Math.min(latoMin, len(sub(quad[(i + 1) % 4], quad[i])));
  if (latoMin < 10) return 0;
  for (let i = 0; i < 4; i++) {
    const ang = angoloCorner(quad[(i + 3) % 4], quad[i], quad[(i + 1) % 4]);
    if (ang < 15 || ang > 165) return 0; // angolo degenere
  }
  const area = areaQuad(quad);
  if (area < 200) return 0;

  // --- edge-support: i lati cadono su bordi col gradiente perpendicolare? ---
  const K = 16;
  let supporto = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const dir = sub(b, a);
    const dl = len(dir) || 1;
    const nx = -dir.y / dl; // normale al lato
    const ny = dir.x / dl;
    for (let k = 0; k < K; k++) {
      const t = (k + 0.5) / K;
      const x = Math.round(a.x + dir.x * t);
      const y = Math.round(a.y + dir.y * t);
      const g = gradiente(c, x, y);
      if (g.mag < magSoglia) continue;
      // allineamento: il gradiente deve puntare lungo la normale del lato
      const all = Math.abs((g.gx * nx + g.gy * ny) / (g.mag || 1));
      if (all > 0.7) supporto++;
    }
  }
  const edgeSupport = supporto / (4 * K);

  // --- contrasto attraverso il bordo: dentro vs fuori ---
  let contrasto = 0;
  const off = 3;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const dir = sub(b, a);
    const dl = len(dir) || 1;
    // normale verso l'interno (verso il centro del quad)
    let nx = -dir.y / dl;
    let ny = dir.x / dl;
    const cxq = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
    const cyq = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((cxq - mid.x) * nx + (cyq - mid.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    let somma = 0;
    let n = 0;
    for (let k = 1; k < K - 1; k += 2) {
      const t = (k + 0.5) / K;
      const px = a.x + dir.x * t;
      const py = a.y + dir.y * t;
      const lin = campione(c, px + nx * off, py + ny * off);
      const lout = campione(c, px - nx * off, py - ny * off);
      if (lin >= 0 && lout >= 0) {
        somma += Math.abs(lin - lout);
        n++;
      }
    }
    if (n > 0) contrasto += somma / n;
  }
  contrasto = Math.min(1, contrasto / 4 / 60); // ~60 livelli = contrasto pieno

  // --- plausibilità degli angoli (vicini a 90°, ma prospettiva ammessa) ---
  let angScore = 0;
  for (let i = 0; i < 4; i++) {
    const ang = angoloCorner(quad[(i + 3) % 4], quad[i], quad[(i + 1) % 4]);
    // 1 in [50,130], scende a 0 verso [15,165]
    const t = ang < 50 ? (ang - 15) / 35 : ang > 130 ? (165 - ang) / 35 : 1;
    angScore += Math.max(0, Math.min(1, t));
  }
  angScore /= 4;

  let score = 0.6 * edgeSupport + 0.2 * contrasto + 0.2 * angScore;
  // il quad deve contenere il punto toccato (altrimenti è un'altra figura)
  if (!puntoInPoligono(quad, seme)) score *= 0.6;
  return score;
}

function campione(c: Campi, x: number, y: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= c.w || yi >= c.h) return -1;
  return c.lum[yi * c.w + xi];
}

// ---------------------------------------------------------------------------
// Generatore: convex hull + rettangolo di area minima (rotating calipers)
// ---------------------------------------------------------------------------

function convexHull(punti: Array<[number, number]>): Array<[number, number]> {
  const pts = punti.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const croce = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const basso: Array<[number, number]> = [];
  for (const p of pts) {
    while (basso.length >= 2 && croce(basso[basso.length - 2], basso[basso.length - 1], p) <= 0)
      basso.pop();
    basso.push(p);
  }
  const alto: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (alto.length >= 2 && croce(alto[alto.length - 2], alto[alto.length - 1], p) <= 0)
      alto.pop();
    alto.push(p);
  }
  basso.pop();
  alto.pop();
  return basso.concat(alto);
}

export function rettangoloAreaMinima(contorno: Array<[number, number]>): Quad | null {
  const hull = convexHull(contorno);
  if (hull.length < 3) return null;
  let migliore: Quad | null = null;
  let areaMin = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cos = Math.cos(-ang);
    const sin = Math.sin(-ang);
    let minx = Infinity;
    let maxx = -Infinity;
    let miny = Infinity;
    let maxy = -Infinity;
    for (const [px, py] of hull) {
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      minx = Math.min(minx, rx);
      maxx = Math.max(maxx, rx);
      miny = Math.min(miny, ry);
      maxy = Math.max(maxy, ry);
    }
    const area = (maxx - minx) * (maxy - miny);
    if (area < areaMin) {
      areaMin = area;
      const c2 = Math.cos(ang);
      const s2 = Math.sin(ang);
      const rb = (rx: number, ry: number): Punto => ({
        x: rx * c2 - ry * s2,
        y: rx * s2 + ry * c2
      });
      migliore = [
        rb(minx, miny),
        rb(maxx, miny),
        rb(maxx, maxy),
        rb(minx, maxy)
      ];
    }
  }
  return migliore;
}

/** 4 punti più "esterni" del contorno (estremi di x±y): quad rapido */
function quattroEstremi(contorno: Array<[number, number]>): Quad | null {
  if (contorno.length < 4) return null;
  let tl = contorno[0];
  let br = contorno[0];
  let tr = contorno[0];
  let bl = contorno[0];
  for (const p of contorno) {
    if (p[0] + p[1] < tl[0] + tl[1]) tl = p;
    if (p[0] + p[1] > br[0] + br[1]) br = p;
    if (p[0] - p[1] > tr[0] - tr[1]) tr = p;
    if (p[0] - p[1] < bl[0] - bl[1]) bl = p;
  }
  const q: Punto[] = [tl, tr, br, bl].map(([x, y]) => ({ x, y }));
  return ordinaQuad(q);
}

// ---------------------------------------------------------------------------
// Generatore: Hough delle rette (immune a texture/riflessi interni)
// ---------------------------------------------------------------------------

function intersecaThetaRho(t1: number, r1: number, t2: number, r2: number): Punto | null {
  const c1 = Math.cos(t1);
  const s1 = Math.sin(t1);
  const c2 = Math.cos(t2);
  const s2 = Math.sin(t2);
  const det = c1 * s2 - c2 * s1;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (r1 * s2 - r2 * s1) / det, y: (c1 * r2 - c2 * r1) / det };
}

function generaHough(c: Campi, roi: Roi, seme: Punto, magSoglia: number): Quad | null {
  const punti: Array<{ x: number; y: number; theta: number; mag: number }> = [];
  const passo = Math.max(1, Math.floor(Math.min(roi.x2 - roi.x1, roi.y2 - roi.y1) / 220));
  for (let y = roi.y1; y <= roi.y2; y += passo) {
    for (let x = roi.x1; x <= roi.x2; x += passo) {
      const g = gradiente(c, x, y);
      if (g.mag < magSoglia) continue;
      let theta = Math.atan2(g.gy, g.gx);
      if (theta < 0) theta += Math.PI; // orientamento [0,π)
      punti.push({ x, y, theta, mag: g.mag });
    }
  }
  if (punti.length < 24) return null;

  // istogramma degli orientamenti (bin di 5°)
  const NB = 36;
  const hist = new Float64Array(NB);
  for (const p of punti) hist[Math.min(NB - 1, Math.floor((p.theta / Math.PI) * NB))] += p.mag;
  let binA = 0;
  for (let i = 1; i < NB; i++) if (hist[i] > hist[binA]) binA = i;
  const binB = (binA + NB / 2) % NB; // famiglia perpendicolare
  const thetaA = ((binA + 0.5) / NB) * Math.PI;
  const thetaB = ((binB + 0.5) / NB) * Math.PI;

  // le due rette di una famiglia: i due picchi di rho ai lati del seme
  const dueRette = (thetaC: number): [number, number] | null => {
    const cos = Math.cos(thetaC);
    const sin = Math.sin(thetaC);
    const tol = (12 / 180) * Math.PI; // ±12° dalla famiglia
    const rhoSeme = seme.x * cos + seme.y * sin;
    let negR = 0;
    let negW = 0;
    let posR = 0;
    let posW = 0;
    for (const p of punti) {
      let d = Math.abs(p.theta - thetaC);
      d = Math.min(d, Math.PI - d);
      if (d > tol) continue;
      const rho = p.x * cos + p.y * sin;
      if (rho < rhoSeme - 6) {
        negR += rho * p.mag;
        negW += p.mag;
      } else if (rho > rhoSeme + 6) {
        posR += rho * p.mag;
        posW += p.mag;
      }
    }
    if (negW === 0 || posW === 0) return null;
    return [negR / negW, posR / posW];
  };

  const ra = dueRette(thetaA);
  const rb = dueRette(thetaB);
  if (!ra || !rb) return null;

  const angoli: Punto[] = [];
  for (const rA of ra) {
    for (const rB of rb) {
      const p = intersecaThetaRho(thetaA, rA, thetaB, rB);
      if (!p) return null;
      angoli.push(p);
    }
  }
  return ordinaQuad(angoli);
}

// ---------------------------------------------------------------------------
// Raffinamento: snap di ogni lato sul picco del gradiente (fit ai minimi q.)
// ---------------------------------------------------------------------------

function fitRetta(campioni: Punto[]): { a: number; b: number; c: number } | null {
  // retta a·x + b·y + c = 0 via PCA (robusta anche per lati verticali)
  const n = campioni.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of campioni) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of campioni) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  // direzione principale = autovettore maggiore; normale = (a,b)
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = -Math.sin(theta);
  const b = Math.cos(theta);
  return { a, b, c: -(a * mx + b * my) };
}

function intersecaRette(
  l1: { a: number; b: number; c: number },
  l2: { a: number; b: number; c: number }
): Punto | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (l1.b * l2.c - l2.b * l1.c) / det, y: (l2.a * l1.c - l1.a * l2.c) / det };
}

function raffina(c: Campi, quad: Quad, magSoglia: number): Quad {
  const rette: Array<{ a: number; b: number; c: number }> = [];
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const dir = sub(b, a);
    const dl = len(dir) || 1;
    const nx = -dir.y / dl;
    const ny = dir.x / dl;
    const campioni: Punto[] = [];
    const K = 18;
    const ricerca = 4;
    for (let k = 0; k < K; k++) {
      const t = (k + 0.5) / K;
      const bx = a.x + dir.x * t;
      const by = a.y + dir.y * t;
      let migliorMag = magSoglia;
      let migliore: Punto | null = null;
      for (let d = -ricerca; d <= ricerca; d++) {
        const x = Math.round(bx + nx * d);
        const y = Math.round(by + ny * d);
        const g = gradiente(c, x, y);
        if (g.mag > migliorMag) {
          migliorMag = g.mag;
          migliore = { x, y };
        }
      }
      if (migliore) campioni.push(migliore);
    }
    const retta = campioni.length >= 4 ? fitRetta(campioni) : null;
    // se il lato non ha supporto sufficiente, si conserva l'originale
    rette.push(retta ?? rettaDaSegmento(a, b));
  }
  const angoli: Punto[] = [];
  for (let i = 0; i < 4; i++) {
    const p = intersecaRette(rette[(i + 3) % 4], rette[i]);
    if (!p) return quad; // raffinamento fallito: si torna all'originale
    angoli.push(p);
  }
  return ordinaQuad(angoli);
}

function rettaDaSegmento(a: Punto, b: Punto): { a: number; b: number; c: number } {
  const dir = sub(b, a);
  const dl = len(dir) || 1;
  const na = -dir.y / dl;
  const nb = dir.x / dl;
  return { a: na, b: nb, c: -(na * a.x + nb * a.y) };
}

// ---------------------------------------------------------------------------
// Orchestratore
// ---------------------------------------------------------------------------

export type SorgenteQuad =
  | { tipo: 'tocco'; punto: Punto }
  | { tipo: 'traccia'; punti: Punto[] };

export function rilevaQuad4(
  ricerca: RicercaBordi,
  sorgente: SorgenteQuad,
  opzioni?: { sensibilita?: number }
): EsitoQuad4 | null {
  const c = campiRicerca(ricerca);
  const { w, h, fattore } = c;
  const sens = opzioni?.sensibilita ?? 50;
  const floodTol = Math.round(lerp(16, 110, sens / 100));
  const sogliaScala = lerp(1.6, 0.5, sens / 100);

  // --- semi candidati e riquadro indicato dall'evidenziatore ---
  // Per il TOCCO: un solo seme. Per l'EVIDENZIATORE: il punto mediano del
  // tratto + il centro del suo riquadro (robusto se il mediano cade sullo
  // sfondo). NIENTE clip soffocante: il flood cresce libero e si ferma sui
  // bordi reali — un tratto sottile non deve intrappolarlo in una striscia.
  let semi: Punto[];
  let bboxTraccia: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (sorgente.tipo === 'tocco') {
    semi = [sorgente.punto];
  } else {
    const pts = sorgente.punti;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const p of pts) {
      x1 = Math.min(x1, p.x);
      y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x);
      y2 = Math.max(y2, p.y);
    }
    bboxTraccia = { x1, y1, x2, y2 };
    semi = [pts[Math.floor(pts.length / 2)], { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }];
  }

  // flood dal seme che produce la regione valida più ampia
  let semeImg = semi[0];
  let reg: RegioneRiempita | null = null;
  for (const s of semi) {
    const sx = s.x * fattore;
    const sy = s.y * fattore;
    if (sx < 1 || sy < 1 || sx > w - 2 || sy > h - 2) continue;
    const r = regioneRiempita(ricerca, s, floodTol);
    if (r) {
      const area = (r.maxx - r.minx) * (r.maxy - r.miny);
      const areaBest = reg ? (reg.maxx - reg.minx) * (reg.maxy - reg.miny) : -1;
      if (area > areaBest) {
        reg = r;
        semeImg = s;
      }
    }
  }
  const seme: Punto = { x: semeImg.x * fattore, y: semeImg.y * fattore };
  if (seme.x < 1 || seme.y < 1 || seme.x > w - 2 || seme.y > h - 2) return null;

  // --- generazione candidati (coordinate ridotte) ---
  const candidati: Quad[] = [];

  const lt = rilevaFigura(ricerca, semeImg, sogliaScala);
  if (lt) candidati.push(ordinaQuad(lt.punti.map((p) => ({ x: p.x * fattore, y: p.y * fattore }))));

  if (reg && reg.contorno.length >= 4) {
    const rar = rettangoloAreaMinima(reg.contorno);
    if (rar) candidati.push(ordinaQuad(rar));
    const ext = quattroEstremi(reg.contorno);
    if (ext) candidati.push(ext);
  }

  // ROI per Hough: unione del riquadro della regione e del tratto
  // evidenziato (così Hough vede l'intero oggetto indicato), allargata;
  // in mancanza, una finestra attorno al seme
  let roi: Roi;
  const boxes: Array<[number, number, number, number]> = [];
  if (reg) boxes.push([reg.minx, reg.miny, reg.maxx, reg.maxy]);
  if (bboxTraccia) {
    boxes.push([
      bboxTraccia.x1 * fattore,
      bboxTraccia.y1 * fattore,
      bboxTraccia.x2 * fattore,
      bboxTraccia.y2 * fattore
    ]);
  }
  if (boxes.length) {
    const minx = Math.min(...boxes.map((b) => b[0]));
    const miny = Math.min(...boxes.map((b) => b[1]));
    const maxx = Math.max(...boxes.map((b) => b[2]));
    const maxy = Math.max(...boxes.map((b) => b[3]));
    const dx = (maxx - minx) * 0.25;
    const dy = (maxy - miny) * 0.25;
    roi = {
      x1: Math.max(1, Math.floor(minx - dx)),
      y1: Math.max(1, Math.floor(miny - dy)),
      x2: Math.min(w - 2, Math.ceil(maxx + dx)),
      y2: Math.min(h - 2, Math.ceil(maxy + dy))
    };
  } else {
    const r = Math.round(Math.min(w, h) * 0.4);
    roi = {
      x1: Math.max(1, Math.round(seme.x - r)),
      y1: Math.max(1, Math.round(seme.y - r)),
      x2: Math.min(w - 2, Math.round(seme.x + r)),
      y2: Math.min(h - 2, Math.round(seme.y + r))
    };
  }
  const magSoglia = Math.max(8, magnitudoBase(c, roi) * sogliaScala);

  const hq = generaHough(c, roi, seme, magSoglia);
  if (hq) candidati.push(hq);

  if (candidati.length === 0) return null;

  // --- il giudice sceglie il migliore ---
  let migliore: Quad | null = null;
  let miglioreScore = 0;
  for (const q of candidati) {
    const s = punteggioQuad(c, q, seme, magSoglia);
    if (s > miglioreScore) {
      miglioreScore = s;
      migliore = q;
    }
  }
  if (!migliore || miglioreScore < 0.33) return null;

  // --- consenso: media con i candidati molto simili e altrettanto buoni ---
  const latoRif = Math.sqrt(areaQuad(migliore));
  const vicini: Quad[] = [migliore];
  for (const q of candidati) {
    if (q === migliore) continue;
    if (punteggioQuad(c, q, seme, magSoglia) < miglioreScore * 0.9) continue;
    let max = 0;
    for (let i = 0; i < 4; i++) max = Math.max(max, len(sub(q[i], migliore[i])));
    if (max < latoRif * 0.15) vicini.push(q);
  }
  let fuso: Quad = migliore;
  if (vicini.length > 1) {
    fuso = [0, 1, 2, 3].map((i) => ({
      x: vicini.reduce((s, q) => s + q[i].x, 0) / vicini.length,
      y: vicini.reduce((s, q) => s + q[i].y, 0) / vicini.length
    })) as Quad;
  }

  // --- raffinamento sub-pixel; si tiene solo se non peggiora ---
  const raff = raffina(c, fuso, magSoglia);
  const sFuso = punteggioQuad(c, fuso, seme, magSoglia);
  const sRaff = punteggioQuad(c, raff, seme, magSoglia);
  const finale = sRaff >= sFuso * 0.97 ? raff : fuso;
  const confidenza = Math.max(miglioreScore, sFuso, sRaff);

  return {
    punti: finale.map((p) => ({ x: p.x / fattore, y: p.y / fattore })) as [
      Punto,
      Punto,
      Punto,
      Punto
    ],
    confidenza
  };
}
