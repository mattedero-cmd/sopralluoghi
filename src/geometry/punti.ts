import type { Punto, Quota, SottotipoQuota } from '../db/types';

export const somma = (a: Punto, b: Punto): Punto => ({ x: a.x + b.x, y: a.y + b.y });
export const sottrai = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y });
export const scala = (p: Punto, k: number): Punto => ({ x: p.x * k, y: p.y * k });
export const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;
export const lunghezza = (p: Punto): number => Math.hypot(p.x, p.y);
export const distanza = (a: Punto, b: Punto): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalizza(p: Punto): Punto {
  const l = lunghezza(p);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: p.x / l, y: p.y / l };
}

/** Normale sinistra (perpendicolare) di un versore */
export const normale = (d: Punto): Punto => ({ x: -d.y, y: d.x });

/** Versore della direzione di misura di una quota */
export function direzioneQuota(sottotipo: SottotipoQuota, p1: Punto, p2: Punto): Punto {
  switch (sottotipo) {
    case 'orizzontale':
      return { x: 1, y: 0 };
    case 'verticale':
      return { x: 0, y: 1 };
    case 'allineata':
      return normalizza(sottrai(p2, p1));
  }
}

/** Lunghezza misurata in px immagine (proiezione sulla direzione di misura) */
export function lunghezzaPxQuota(q: Pick<Quota, 'sottotipo' | 'p1' | 'p2'>): number {
  const d = direzioneQuota(q.sottotipo, q.p1, q.p2);
  return Math.abs(dot(sottrai(q.p2, q.p1), d));
}

/** Vincolo "orto": forza il secondo punto sull'asse orizzontale o verticale più vicino */
export function vincolaOrto(p1: Punto, p2: Punto): Punto {
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  return dx >= dy ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y };
}

/** Snap angolare: vincola la direzione p1→p2 al multiplo di `passoGradi` più vicino */
export function vincolaAngolo(p1: Punto, p2: Punto, passoGradi = 15): Punto {
  const d = sottrai(p2, p1);
  const r = Math.hypot(d.x, d.y);
  if (r < 1e-9) return p2;
  const passo = (passoGradi * Math.PI) / 180;
  const angolo = Math.round(Math.atan2(d.y, d.x) / passo) * passo;
  return { x: p1.x + r * Math.cos(angolo), y: p1.y + r * Math.sin(angolo) };
}

/**
 * Circumcentro di un triangolo (= centro del cerchio passante per 3 punti).
 * Restituisce null se i punti sono collineari (cerchio impossibile).
 */
export function circumcentro(a: Punto, b: Punto, c: Punto): Punto | null {
  const mAB: Punto = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const mBC: Punto = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  // direzione perpendicolare al lato (ruota di 90°)
  const dAB: Punto = { x: -(b.y - a.y), y: b.x - a.x };
  const dBC: Punto = { x: -(c.y - b.y), y: c.x - b.x };
  const det = dAB.x * dBC.y - dAB.y * dBC.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((mBC.x - mAB.x) * dBC.y - (mBC.y - mAB.y) * dBC.x) / det;
  return { x: mAB.x + t * dAB.x, y: mAB.y + t * dAB.y };
}

/**
 * Ordina 4 punti come alto-sx, alto-dx, basso-dx, basso-sx (orario a schermo).
 *
 * Sta qui perché serve a chiunque debba dare un VERSO a un quadrilatero
 * disegnato a mano: il rilevatore automatico, la pannellizzazione, il
 * disegno in prospettiva. «Sinistra» e «alto» devono voler dire la stessa
 * cosa dappertutto.
 */
export function ordinaQuad(pts: Punto[]): [Punto, Punto, Punto, Punto] {
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

/**
 * Vero se i quattro angoli formano un quadrilatero CONVESSO.
 *
 * Serve prima di costruire un'omografia sui quattro angoli: su una forma
 * rientrante la mappa proiettiva esiste ancora, ma ribalta l'interno
 * all'esterno e le linee derivate — giunzioni, sormonti, griglie — schizzano
 * fuori dall'immagine. Meglio accorgersene e non disegnare.
 */
export function quadConvesso(punti: Punto[]): boolean {
  if (punti.length !== 4) return false;
  let segno = 0;
  for (let i = 0; i < 4; i++) {
    const a = punti[i];
    const b = punti[(i + 1) % 4];
    const c = punti[(i + 2) % 4];
    const croce = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(croce) < 1e-9) continue; // tre punti allineati: non decide
    const s = croce > 0 ? 1 : -1;
    if (segno === 0) segno = s;
    else if (s !== segno) return false;
  }
  return segno !== 0;
}

/**
 * IL POLIGONO GONFIATO, lato per lato.
 *
 * Ogni lato si sposta in fuori del suo `sbordo` e i lati si reincontrano dove
 * si incrociano: su un rettangolo tornano i quattro spigoli allargati, su una
 * falda l'obliquo resta obliquo. È il contorno del pezzo da tagliare, e vale
 * sia in millimetri reali sia in pixel dell'immagine — a chi chiama decidere
 * in che unità sono gli sbordi.
 *
 * `sbordi[i]` è quello del lato che va da `punti[i]` a `punti[i+1]`. Il verso
 * «fuori» si decide col baricentro, quindi non conta come è stato disegnato il
 * poligono. Vale per i poligoni convessi: su uno rientrante i lati si
 * incrocerebbero dalla parte sbagliata, e si torna il poligono com'era.
 */
export function offsetPoligono(punti: Punto[], sbordi: number[]): Punto[] {
  const n = punti.length;
  if (n < 3) return punti.map((p) => ({ ...p }));
  let cx = 0;
  let cy = 0;
  for (const p of punti) {
    cx += p.x / n;
    cy += p.y / n;
  }
  // una retta per lato, già spostata in fuori: normale uscente + distanza
  const rette = punti.map((p, i) => {
    const q = punti[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    let nx = dy / len;
    let ny = -dx / len;
    // la normale guarda dalla parte opposta al baricentro
    if (nx * ((p.x + q.x) / 2 - cx) + ny * ((p.y + q.y) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { nx, ny, c: nx * p.x + ny * p.y + (sbordi[i] ?? 0) };
  });
  // il vertice i è l'incrocio fra la retta del lato prima e quella del suo
  const pulito = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  return punti.map((p, i) => {
    const r1 = rette[(i + n - 1) % n];
    const r2 = rette[i];
    if (!r1 || !r2) return { ...p };
    const det = r1.nx * r2.ny - r1.ny * r2.nx;
    if (Math.abs(det) < 1e-9) return { ...p }; // lati allineati: niente spigolo
    return {
      x: pulito((r1.c * r2.ny - r2.c * r1.ny) / det),
      y: pulito((r1.nx * r2.c - r2.nx * r1.c) / det)
    };
  });
}
