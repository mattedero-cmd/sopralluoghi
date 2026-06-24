import type { Punto } from '../db/types';

/**
 * Analisi dell'immagine per snap ai bordi e autoquotatura: luminanza
 * calcolata una sola volta per foto, su una versione ridotta per
 * restare fluidi anche su telefoni.
 */
export class RicercaBordi {
  private lum: Float32Array;
  /** colore RGB (ridotto): 3 byte per pixel, per il riempimento "secchiello" */
  private rgb: Uint8Array;
  private w: number;
  private h: number;
  /** fattore immagine→ridotta */
  private fattore: number;

  constructor(immagine: CanvasImageSource, larghezzaPx: number, altezzaPx: number) {
    const latoMax = 1024;
    this.fattore = Math.min(1, latoMax / Math.max(larghezzaPx, altezzaPx));
    this.w = Math.max(2, Math.round(larghezzaPx * this.fattore));
    this.h = Math.max(2, Math.round(altezzaPx * this.fattore));
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas non disponibile.');
    ctx.drawImage(immagine, 0, 0, this.w, this.h);
    const rgba = ctx.getImageData(0, 0, this.w, this.h).data;
    this.lum = new Float32Array(this.w * this.h);
    this.rgb = new Uint8Array(this.w * this.h * 3);
    for (let i = 0; i < this.lum.length; i++) {
      const j = i * 4;
      this.lum[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
      this.rgb[i * 3] = rgba[j];
      this.rgb[i * 3 + 1] = rgba[j + 1];
      this.rgb[i * 3 + 2] = rgba[j + 2];
    }
  }

  /** Costruzione da dati grezzi (per i test, senza canvas) */
  static daDati(lum: Float32Array, w: number, h: number, fattore = 1, rgb?: Uint8Array): RicercaBordi {
    const r = Object.create(RicercaBordi.prototype) as RicercaBordi;
    r.lum = lum;
    r.w = w;
    r.h = h;
    r.fattore = fattore;
    if (rgb) {
      r.rgb = rgb;
    } else {
      // in assenza di colore si usa la luminanza come grigio
      r.rgb = new Uint8Array(w * h * 3);
      for (let i = 0; i < lum.length; i++) {
        const v = Math.max(0, Math.min(255, Math.round(lum[i])));
        r.rgb[i * 3] = v;
        r.rgb[i * 3 + 1] = v;
        r.rgb[i * 3 + 2] = v;
      }
    }
    return r;
  }

  /**
   * Restituisce il punto (in px immagine) con il gradiente più forte
   * entro `raggioPx` dal punto dato, oppure null se non c'è un bordo netto.
   */
  cerca(p: Punto, raggioPx: number): Punto | null {
    const cx = Math.round(p.x * this.fattore);
    const cy = Math.round(p.y * this.fattore);
    const r = Math.max(2, Math.min(24, Math.round(raggioPx * this.fattore)));
    let migliore = -1;
    let bx = cx;
    let by = cy;
    const x0 = Math.max(1, cx - r);
    const x1 = Math.min(this.w - 2, cx + r);
    const y0 = Math.max(1, cy - r);
    const y1 = Math.min(this.h - 2, cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
        const m = this.sobel(x, y);
        if (m > migliore) {
          migliore = m;
          bx = x;
          by = y;
        }
      }
    }
    // soglia: il bordo deve essere netto, altrimenti niente snap
    if (migliore < 60) return null;
    return { x: bx / this.fattore, y: by / this.fattore };
  }

  private sobel(x: number, y: number): number {
    const l = (xx: number, yy: number) => this.lum[yy * this.w + xx];
    const gx =
      -l(x - 1, y - 1) - 2 * l(x - 1, y) - l(x - 1, y + 1) +
      l(x + 1, y - 1) + 2 * l(x + 1, y) + l(x + 1, y + 1);
    const gy =
      -l(x - 1, y - 1) - 2 * l(x, y - 1) - l(x + 1, y - 1) +
      l(x - 1, y + 1) + 2 * l(x, y + 1) + l(x + 1, y + 1);
    return Math.hypot(gx, gy);
  }
}

// ---------------------------------------------------------------------------
// Autoquotatura: rilevamento della figura toccata o evidenziata
// ---------------------------------------------------------------------------

export interface FiguraRilevata {
  /** angoli del quadrilatero rilevato: alto-sx, alto-dx, basso-dx, basso-sx */
  punti: [Punto, Punto, Punto, Punto];
}

/** retta x = a·y + b (lati verticali) oppure y = a·x + b (lati orizzontali) */
interface RettaLato {
  a: number;
  b: number;
}

interface CampiAnalisi {
  lum: Float32Array;
  rgb: Uint8Array;
  w: number;
  h: number;
  fattore: number;
}

const BANDA = 2; // media su 5 righe/colonne: robusto al rumore
const SOGLIA_FORTE = 16; // salto di luminanza (0–255) che definisce un bordo

function estraiCampi(ricerca: RicercaBordi): CampiAnalisi {
  // accesso ai campi privati della classe (stesso modulo)
  return ricerca as unknown as CampiAnalisi;
}

/** profilo di luminanza lungo x alla riga cy, mediato su una banda */
function profiloX(c: CampiAnalisi, cy: number) {
  return (x: number): number => {
    let somma = 0;
    let n = 0;
    for (let dy = -BANDA; dy <= BANDA; dy++) {
      const y = cy + dy;
      if (y >= 0 && y < c.h) {
        somma += c.lum[y * c.w + x];
        n++;
      }
    }
    return somma / n;
  };
}

function profiloY(c: CampiAnalisi, cx: number) {
  return (y: number): number => {
    let somma = 0;
    let n = 0;
    for (let dx = -BANDA; dx <= BANDA; dx++) {
      const x = cx + dx;
      if (x >= 0 && x < c.w) {
        somma += c.lum[y * c.w + x];
        n++;
      }
    }
    return somma / n;
  };
}

/**
 * Soglia di contrasto adattiva da una regione: dal range di luminanza
 * (5°–95° percentile per ignorare gli estremi). Su scene a basso
 * contrasto (bianco su bianco) si abbassa; su scene contrastate si alza
 * per non agganciare la texture. Risultato in unità di gradiente.
 */
function sogliaAdattiva(c: CampiAnalisi, x1: number, x2: number, y1: number, y2: number): number {
  const xa = Math.max(0, Math.floor(x1));
  const xb = Math.min(c.w - 1, Math.ceil(x2));
  const ya = Math.max(0, Math.floor(y1));
  const yb = Math.min(c.h - 1, Math.ceil(y2));
  const valori: number[] = [];
  const passoX = Math.max(1, Math.floor((xb - xa) / 60));
  const passoY = Math.max(1, Math.floor((yb - ya) / 60));
  for (let y = ya; y <= yb; y += passoY) {
    for (let x = xa; x <= xb; x += passoX) valori.push(c.lum[y * c.w + x]);
  }
  if (valori.length < 4) return SOGLIA_FORTE;
  valori.sort((p, q) => p - q);
  const p5 = valori[Math.floor(valori.length * 0.05)];
  const p95 = valori[Math.floor(valori.length * 0.95)];
  const range = p95 - p5;
  // ~12% del range, limitato tra 6 (scene pallide) e 28 (scene contrastate)
  return Math.max(6, Math.min(28, range * 0.12));
}

/**
 * Posizione (assoluta) del primo fronte di contrasto deciso scandendo
 * da `da` nella direzione `verso`. null se non c'è un bordo netto.
 */
function primoFronte(
  profilo: (t: number) => number,
  da: number,
  verso: 1 | -1,
  limite: number,
  soglia: number,
  minDist = 3
): number | null {
  let migliore: number | null = null;
  let miglioreGrad = 0;
  for (let dist = minDist; ; dist++) {
    const t = da + verso * dist;
    if (t < 1 || t > limite - 2) break;
    const grad = Math.abs(profilo(t + 1) - profilo(t - 1)) / 2;
    const tSucc = t + verso;
    const gradSucc =
      tSucc >= 1 && tSucc <= limite - 2 ? Math.abs(profilo(tSucc + 1) - profilo(tSucc - 1)) / 2 : 0;
    if (grad >= soglia && grad >= gradSucc) {
      return t; // primo fronte deciso: è il bordo della figura
    }
    if (grad > miglioreGrad) {
      miglioreGrad = grad;
      migliore = t;
    }
  }
  // nessun fronte deciso: si accetta il massimo se comunque marcato
  return miglioreGrad >= soglia * 0.6 ? migliore : null;
}

/** fronte più marcato in un intorno di `centro` (fallback per l'evidenziatore) */
function fronteVicino(
  profilo: (t: number) => number,
  centro: number,
  raggio: number,
  limite: number,
  soglia: number
): number | null {
  let migliore: number | null = null;
  let miglioreGrad = 0;
  for (let t = Math.max(1, centro - raggio); t <= Math.min(limite - 2, centro + raggio); t++) {
    const grad = Math.abs(profilo(t + 1) - profilo(t - 1)) / 2;
    if (grad > miglioreGrad) {
      miglioreGrad = grad;
      migliore = t;
    }
  }
  return miglioreGrad >= soglia * 0.6 ? migliore : null;
}

/**
 * Dai quattro semi (posizioni stimate dei lati) costruisce il
 * quadrilatero: ogni lato viene TRACCIATO seguendo il fronte di
 * contrasto (campioni a finestra mobile + fit ai minimi quadrati) e
 * gli angoli nascono dall'intersezione dei lati — la forma segue i
 * bordi reali anche quando la prospettiva li inclina.
 */
function costruisciQuadrilatero(
  c: CampiAnalisi,
  xL: number,
  xR: number,
  yT: number,
  yB: number,
  fattoreSoglia = 1
): FiguraRilevata | null {
  const { lum, w, h, fattore } = c;
  if (xR - xL < 14 || yB - yT < 14) return null;

  const grad = (x: number, y: number, orizzontale: boolean): number => {
    // gradiente perpendicolare al lato, mediato su 3 righe/colonne
    let somma = 0;
    for (let k = -1; k <= 1; k++) {
      if (orizzontale) {
        const xx = Math.max(1, Math.min(w - 2, x + k));
        somma += Math.abs(lum[y * w + xx + 1] - lum[y * w + xx - 1]);
      } else {
        const yy = Math.max(1, Math.min(h - 2, y + k));
        somma += Math.abs(lum[(yy + 1) * w + x] - lum[(yy - 1) * w + x]);
      }
    }
    return somma / 6;
  };

  /** fit ai minimi quadrati: v = a·t + b sui campioni dati */
  const fitGrezzo = (campioni: Array<{ t: number; v: number }>): RettaLato | null => {
    const n = campioni.length;
    if (n < 3) return null;
    let st = 0;
    let sv = 0;
    let stt = 0;
    let stv = 0;
    for (const q of campioni) {
      st += q.t;
      sv += q.v;
      stt += q.t * q.t;
      stv += q.t * q.v;
    }
    const den = n * stt - st * st;
    if (Math.abs(den) < 1e-9) return null;
    const a = (n * stv - st * sv) / den;
    return { a, b: (sv - a * st) / n };
  };

  /**
   * Fit robusto: dopo un primo fit, scarta i campioni più lontani dalla
   * retta (texture, maniglie, riflessi) e rifà il fit sui buoni. Così un
   * bordo reale non viene deviato da pochi punti rumorosi.
   */
  const fitRetta = (campioni: Array<{ t: number; v: number }>): RettaLato | null => {
    if (campioni.length < 3) return null;
    let retta = fitGrezzo(campioni);
    if (!retta) return null;
    for (let iter = 0; iter < 2 && campioni.length >= 5; iter++) {
      const residui = campioni
        .map((q) => Math.abs(q.v - (retta!.a * q.t + retta!.b)))
        .sort((p, q) => p - q);
      const mediana = residui[Math.floor(residui.length / 2)];
      const soglia = Math.max(2, mediana * 2.5);
      const buoni = campioni.filter((q) => Math.abs(q.v - (retta!.a * q.t + retta!.b)) <= soglia);
      if (buoni.length < 3 || buoni.length === campioni.length) break;
      const nuova = fitGrezzo(buoni);
      if (!nuova) break;
      retta = nuova;
    }
    // pendenza troppo estrema: non plausibile per un lato di elemento
    if (Math.abs(retta.a) > 1.2) return null;
    return retta;
  };

  const tracciaLato = (
    vIniziale: number,
    tMin: number,
    tMax: number,
    verticale: boolean,
    soglia: number
  ): RettaLato => {
    const campioni: Array<{ t: number; v: number }> = [];
    const span = tMax - tMin;
    const passi = 13;
    // finestra proporzionale alla campata: segue i bordi molto inclinati
    // dalla prospettiva, dove il lato si sposta molto da un capo all'altro
    const finestra = Math.max(7, Math.round(span * 0.22));
    let vPrec = vIniziale;
    for (let i = 0; i < passi; i++) {
      const t = Math.round(tMin + (span * i) / (passi - 1));
      let meglioV = -1;
      let meglioG = 0;
      for (let dv = -finestra; dv <= finestra; dv++) {
        const v = Math.round(vPrec) + dv;
        if (v < 1 || v > (verticale ? w : h) - 2) continue;
        const g = verticale ? grad(v, t, true) : grad(t, v, false);
        // privilegia i bordi vicini alla traccia del passo precedente:
        // riduce l'aggancio a texture lontane dal bordo vero
        const penalita = 1 - Math.min(0.4, Math.abs(dv) / (finestra * 3));
        const punteggio = g * penalita;
        if (punteggio > meglioG) {
          meglioG = punteggio;
          meglioV = v;
        }
      }
      if (meglioV >= 0 && meglioG >= soglia) {
        campioni.push({ t, v: meglioV });
        vPrec = meglioV;
      }
    }
    // fallback: lato dritto alla posizione iniziale
    return fitRetta(campioni) ?? { a: 0, b: vIniziale };
  };

  // soglia di contrasto ADATTIVA: dal range di luminanza nell'area della
  // figura. Su scene a basso contrasto (bianco su bianco) si abbassa, su
  // scene contrastate si alza per non agganciare la texture. Il
  // `fattoreSoglia` (cursore "tolleranza") la moltiplica: <1 rileva bordi
  // più deboli, >1 considera solo bordi netti.
  const soglia = sogliaAdattiva(c, xL, xR, yT, yB) * fattoreSoglia;

  // margini dai presunti angoli, per non campionare gli spigoli
  const mY = Math.max(2, Math.round((yB - yT) * 0.18));
  const mX = Math.max(2, Math.round((xR - xL) * 0.18));
  const latoSinistro = tracciaLato(xL, yT + mY, yB - mY, true, soglia); // x = a·y + b
  const latoDestro = tracciaLato(xR, yT + mY, yB - mY, true, soglia);
  const latoAlto = tracciaLato(yT, xL + mX, xR - mX, false, soglia); // y = a·x + b
  const latoBasso = tracciaLato(yB, xL + mX, xR - mX, false, soglia);

  /** intersezione tra un lato verticale (x = a·y+b) e uno orizzontale (y = c·x+d) */
  const interseca = (vert: RettaLato, oriz: RettaLato): Punto | null => {
    const den = 1 - vert.a * oriz.a;
    if (Math.abs(den) < 0.05) return null;
    const x = (vert.a * oriz.b + vert.b) / den;
    const y = oriz.a * x + oriz.b;
    if (x < -w * 0.05 || x > w * 1.05 || y < -h * 0.05 || y > h * 1.05) return null;
    return { x, y };
  };

  const altoSx = interseca(latoSinistro, latoAlto);
  const altoDx = interseca(latoDestro, latoAlto);
  const bassoDx = interseca(latoDestro, latoBasso);
  const bassoSx = interseca(latoSinistro, latoBasso);
  if (!altoSx || !altoDx || !bassoDx || !bassoSx) return null;

  const minLato = 12;
  if (
    Math.hypot(altoDx.x - altoSx.x, altoDx.y - altoSx.y) < minLato ||
    Math.hypot(bassoSx.x - altoSx.x, bassoSx.y - altoSx.y) < minLato
  ) {
    return null;
  }

  const inImmagine = (q: Punto): Punto => ({ x: q.x / fattore, y: q.y / fattore });
  return { punti: [inImmagine(altoSx), inImmagine(altoDx), inImmagine(bassoDx), inImmagine(bassoSx)] };
}

/**
 * Rilevamento dal TOCCO: dal punto si scandisce nelle quattro direzioni
 * fino al primo fronte di contrasto — la figura più interna che
 * contiene il punto.
 */
export function rilevaFigura(
  ricerca: RicercaBordi,
  p: Punto,
  fattoreSoglia = 1
): FiguraRilevata | null {
  const c = estraiCampi(ricerca);
  const cx = Math.round(p.x * c.fattore);
  const cy = Math.round(p.y * c.fattore);
  if (cx < 2 || cy < 2 || cx > c.w - 3 || cy > c.h - 3) return null;

  // soglia di partenza dal contrasto locale attorno al punto toccato,
  // scalata dal fattore di tolleranza (cursore)
  const r = Math.round(Math.min(c.w, c.h) * 0.25);
  const soglia = sogliaAdattiva(c, cx - r, cx + r, cy - r, cy + r) * fattoreSoglia;
  const lungoX = profiloX(c, cy);
  const lungoY = profiloY(c, cx);
  const xL = primoFronte(lungoX, cx, -1, c.w, soglia);
  const xR = primoFronte(lungoX, cx, 1, c.w, soglia);
  const yT = primoFronte(lungoY, cy, -1, c.h, soglia);
  const yB = primoFronte(lungoY, cy, 1, c.h, soglia);
  if (xL === null || xR === null || yT === null || yB === null) return null;

  return costruisciQuadrilatero(c, xL, xR, yT, yB, fattoreSoglia);
}

/**
 * Rilevamento dall'EVIDENZIATORE: l'utente traccia un segno sopra
 * l'oggetto completo; i bordi vengono cercati ALL'ESTERNO della zona
 * evidenziata, ignorando cornici e dettagli interni (es. il riquadro
 * ornamentale di una porta).
 */
export function rilevaFiguraEvidenziata(
  ricerca: RicercaBordi,
  traccia: Punto[],
  fattoreSoglia = 1
): FiguraRilevata | null {
  const c = estraiCampi(ricerca);
  if (traccia.length < 2) return null;

  let x1 = Infinity;
  let x2 = -Infinity;
  let y1 = Infinity;
  let y2 = -Infinity;
  for (const p of traccia) {
    const x = p.x * c.fattore;
    const y = p.y * c.fattore;
    x1 = Math.min(x1, x);
    x2 = Math.max(x2, x);
    y1 = Math.min(y1, y);
    y2 = Math.max(y2, y);
  }
  x1 = Math.max(2, Math.round(x1));
  x2 = Math.min(c.w - 3, Math.round(x2));
  y1 = Math.max(2, Math.round(y1));
  y2 = Math.min(c.h - 3, Math.round(y2));
  if (x2 - x1 < 8 || y2 - y1 < 8) return null;

  const cx = Math.round((x1 + x2) / 2);
  const cy = Math.round((y1 + y2) / 2);
  const lungoX = profiloX(c, cy);
  const lungoY = profiloY(c, cx);
  // soglia adattiva su un'area un po' più larga della traccia
  const margine = Math.round(Math.max(x2 - x1, y2 - y1) * 0.2);
  const soglia =
    sogliaAdattiva(c, x1 - margine, x2 + margine, y1 - margine, y2 + margine) * fattoreSoglia;

  // si parte poco dentro il bordo dell'evidenziatura e si cerca il primo
  // fronte verso l'esterno; se l'evidenziatura ha leggermente superato il
  // bordo, fallback sul fronte più marcato vicino al bordo della traccia
  const inset = 4;
  const cerca = (
    profilo: (t: number) => number,
    daBordo: number,
    verso: 1 | -1,
    limite: number,
    raggioFallback: number
  ): number | null =>
    primoFronte(profilo, daBordo - verso * inset, verso, limite, soglia, 1) ??
    fronteVicino(profilo, daBordo, raggioFallback, limite, soglia);

  const xL = cerca(lungoX, x1, -1, c.w, Math.max(4, Math.round((x2 - x1) * 0.15)));
  const xR = cerca(lungoX, x2, 1, c.w, Math.max(4, Math.round((x2 - x1) * 0.15)));
  const yT = cerca(lungoY, y1, -1, c.h, Math.max(4, Math.round((y2 - y1) * 0.15)));
  const yB = cerca(lungoY, y2, 1, c.h, Math.max(4, Math.round((y2 - y1) * 0.15)));
  if (xL === null || xR === null || yT === null || yB === null) return null;

  return costruisciQuadrilatero(c, xL, xR, yT, yB, fattoreSoglia);
}

// ---------------------------------------------------------------------------
// Riempimento "secchiello": dal punto toccato si espande la regione di
// colore simile (come la bacchetta magica di un editor), se ne traccia il
// contorno e lo si semplifica in un poligono — qualunque forma, non solo
// quadrilateri. La `tolleranza` è la distanza di colore ammessa (0–255).
// ---------------------------------------------------------------------------

/** Distanza di Chebyshev tra un pixel RGB e un colore di riferimento */
function distanzaColore(rgb: Uint8Array, i: number, r0: number, g0: number, b0: number): number {
  const j = i * 3;
  return Math.max(
    Math.abs(rgb[j] - r0),
    Math.abs(rgb[j + 1] - g0),
    Math.abs(rgb[j + 2] - b0)
  );
}

/** Semplificazione di Douglas–Peucker su una polilinea (coordinate ridotte) */
function douglasPeucker(punti: Array<[number, number]>, eps: number): Array<[number, number]> {
  if (punti.length < 3) return punti;
  const [ax, ay] = punti[0];
  const [bx, by] = punti[punti.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let dMax = 0;
  let idx = 0;
  for (let i = 1; i < punti.length - 1; i++) {
    const [px, py] = punti[i];
    const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
    if (d > dMax) {
      dMax = d;
      idx = i;
    }
  }
  if (dMax > eps) {
    const sin = douglasPeucker(punti.slice(0, idx + 1), eps);
    const des = douglasPeucker(punti.slice(idx), eps);
    return sin.slice(0, -1).concat(des);
  }
  return [punti[0], punti[punti.length - 1]];
}

/**
 * Semplifica un contorno CHIUSO: lo spezza al vertice più lontano dal
 * punto iniziale (i due estremi naturali della forma) e applica
 * Douglas–Peucker alle due metà. Necessario perché DP su una polilinea
 * con estremi coincidenti collasserebbe a un solo punto.
 */
function semplificaChiuso(contorno: Array<[number, number]>, eps: number): Array<[number, number]> {
  if (contorno.length < 4) return contorno;
  const [ax, ay] = contorno[0];
  let far = 0;
  let fd = -1;
  for (let i = 1; i < contorno.length; i++) {
    const d = (contorno[i][0] - ax) ** 2 + (contorno[i][1] - ay) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = douglasPeucker(contorno.slice(0, far + 1), eps);
  const b = douglasPeucker(contorno.slice(far), eps);
  // a e b condividono i due estremi (start e far): si scartano i duplicati
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/** Tracciamento del contorno (Moore-neighbor) di una maschera booleana */
function tracciaContorno(mask: Uint8Array, bw: number, bh: number): Array<[number, number]> {
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < bh && sy < 0; y++) {
    for (let x = 0; x < bw; x++) {
      if (mask[y * bw + x]) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];
  const dentro = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < bw && y < bh && mask[y * bw + x] === 1;
  const contorno: Array<[number, number]> = [[sx, sy]];
  let cx = sx;
  let cy = sy;
  let dir = 0;
  const maxPassi = bw * bh * 8;
  for (let passo = 0; passo < maxPassi; passo++) {
    let trovato = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + k) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (dentro(nx, ny)) {
        cx = nx;
        cy = ny;
        contorno.push([cx, cy]);
        dir = (((d + 4) % 8) + 1) % 8;
        trovato = true;
        break;
      }
    }
    if (!trovato) break;
    if (cx === sx && cy === sy) break;
  }
  return contorno;
}

/**
 * Riempimento dal tocco: espande la regione di colore connesso attorno al
 * seme (media di un intorno 3×3) entro la `tolleranza`, ne traccia il
 * contorno e lo riduce a un poligono. `clip` opzionale limita la ricerca
 * (usato dall'evidenziatore). null se la regione è troppo piccola o invade
 * tutta l'area (il colore è quello dello sfondo).
 */
export function rilevaRiempimento(
  ricerca: RicercaBordi,
  seme: Punto,
  tolleranza: number,
  clip?: { x1: number; y1: number; x2: number; y2: number }
): Punto[] | null {
  const c = estraiCampi(ricerca);
  const { w, h, rgb, fattore } = c;
  const sx = Math.round(seme.x * fattore);
  const sy = Math.round(seme.y * fattore);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;

  let r0 = 0;
  let g0 = 0;
  let b0 = 0;
  let np = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) {
        const j = (y * w + x) * 3;
        r0 += rgb[j];
        g0 += rgb[j + 1];
        b0 += rgb[j + 2];
        np++;
      }
    }
  }
  r0 /= np;
  g0 /= np;
  b0 /= np;

  const cx1 = clip ? Math.max(0, Math.round(clip.x1 * fattore)) : 0;
  const cy1 = clip ? Math.max(0, Math.round(clip.y1 * fattore)) : 0;
  const cx2 = clip ? Math.min(w - 1, Math.round(clip.x2 * fattore)) : w - 1;
  const cy2 = clip ? Math.min(h - 1, Math.round(clip.y2 * fattore)) : h - 1;

  const visit = new Uint8Array(w * h);
  const stack: number[] = [sy * w + sx];
  visit[sy * w + sx] = 1;
  let count = 0;
  const maxCount = Math.min(w * h, 400000);
  let minx = sx;
  let maxx = sx;
  let miny = sy;
  let maxy = sy;

  while (stack.length) {
    const idx = stack.pop()!;
    count++;
    if (count > maxCount) return null;
    const px = idx % w;
    const py = (idx / w) | 0;
    if (px < minx) minx = px;
    if (px > maxx) maxx = px;
    if (py < miny) miny = py;
    if (py > maxy) maxy = py;
    const vicini = [idx - 1, idx + 1, idx - w, idx + w];
    const xs = [px - 1, px + 1, px, px];
    const ys = [py, py, py - 1, py + 1];
    for (let k = 0; k < 4; k++) {
      const nx = xs[k];
      const ny = ys[k];
      if (nx < cx1 || nx > cx2 || ny < cy1 || ny > cy2) continue;
      const ni = vicini[k];
      if (visit[ni]) continue;
      if (distanzaColore(rgb, ni, r0, g0, b0) <= tolleranza) {
        visit[ni] = 1;
        stack.push(ni);
      }
    }
  }

  if (count < 16) return null;
  const clipArea = (cx2 - cx1 + 1) * (cy2 - cy1 + 1);
  if (count > clipArea * 0.92) return null;

  const areaW = maxx - minx + 1;
  const areaH = maxy - miny + 1;
  const bw = areaW + 2;
  const bh = areaH + 2;
  const mask = new Uint8Array(bw * bh);
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      if (visit[y * w + x]) mask[(y - miny + 1) * bw + (x - minx + 1)] = 1;
    }
  }

  let contorno = tracciaContorno(mask, bw, bh);
  if (contorno.length < 3) return null;
  if (contorno.length > 600) {
    const passo = Math.ceil(contorno.length / 600);
    contorno = contorno.filter((_, i) => i % passo === 0);
  }

  // l'autoquotatura tratta solo forme elementari: si forza un poligono
  // semplice di al massimo 4 lati (triangolo o quadrilatero). Per i
  // contorni più complessi epsilon cresce gradualmente finché i vertici
  // scendono a 4 — crescita dolce per non scavalcare 3/4 da un colpo.
  let eps = Math.max(2, (areaW + areaH) * 0.015);
  let poly = semplificaChiuso(contorno, eps);
  for (let iter = 0; iter < 24 && poly.length > 4; iter++) {
    eps *= 1.3;
    poly = semplificaChiuso(contorno, eps);
  }
  if (poly.length < 3) return null;

  return poly.map(([x, y]) => ({
    x: (x - 1 + minx) / fattore,
    y: (y - 1 + miny) / fattore
  }));
}
