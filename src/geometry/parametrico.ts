import type { Punto, SegmentoQuota, StatoSchizzoPianta, VincoloPianta } from '../db/types';
import { segmentoELato } from '../db/types';
import { risolviGeom, type VincoloGeom } from './solverGeom';

/**
 * PIANTE PARAMETRICHE (§12).
 *
 * Modello a LATI ORIENTATI: la figura è una sequenza di lati, ognuno con una
 * DIREZIONE (letta dalla geometria corrente, eventualmente agganciata a 30/45/90°)
 * e una LUNGHEZZA (la quota). I vertici sono l'OUTPUT: si ottengono percorrendo
 * i lati a partire da un'ancora. Così, modificando una quota, la geometria si
 * aggiorna davvero (i vertici collegati si spostano) e la figura resta chiusa.
 *
 * Il cuore è `risolviChiusura`: fissa le direzioni dei lati e risolve le
 * lunghezze ai minimi quadrati con vincolo di CHIUSURA (Σ Lᵢ·dᵢ = 0) più gli
 * eventuali lati bloccati/ancorati. È la generalizzazione ad angolo qualunque
 * di `ricostruisciOrtogonale` (che gestisce solo orizzontale/verticale).
 */

// ---------------------------------------------------------------------------
// Avvisi e risultato
// ---------------------------------------------------------------------------

export type AvvisoParametrico =
  | 'sovravincolato' // troppi lati bloccati: la figura non può chiudersi
  | 'direzione-degenere' // due lati liberi quasi paralleli: sistema mal condizionato
  | 'lato-corto' // un lato risolto è sotto la soglia minima
  | 'lunghezza-negativa'; // un lato dovrebbe avere lunghezza ≤ 0 con la direzione data

export interface EsitoParametrico {
  /** vertici risultanti (px); in caso di errore sono quelli originali, immutati */
  punti: Punto[];
  /** true = geometria aggiornata; false = modifica non applicata (vedi avvisi) */
  ok: boolean;
  avvisi: AvvisoParametrico[];
}

/** Ancora invariante attorno a cui la figura si riadatta. */
export interface AncoraChiusura {
  /** un vertice resta fermo */
  vertice?: number;
  /** un lato (indice del suo vertice `da`) resta rigido: posizione fissa */
  lato?: number;
  /** il centro di un lato resta fermo (crescita simmetrica) */
  centro?: number;
}

// ---------------------------------------------------------------------------
// Primitive geometriche interne
// ---------------------------------------------------------------------------

interface Versore {
  x: number;
  y: number;
  len: number;
}

function versore(a: Punto, b: Punto): Versore {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 1, y: 0, len: 0 };
  return { x: dx / len, y: dy / len, len };
}

/** Aggancia la direzione (ux,uy) al multiplo di `passoGradi` più vicino. */
function agganciaVersore(ux: number, uy: number, passoGradi: number): { x: number; y: number } {
  const passo = (passoGradi * Math.PI) / 180;
  const ang = Math.round(Math.atan2(uy, ux) / passo) * passo;
  return { x: Math.cos(ang), y: Math.sin(ang) };
}

/** Percorre i lati (direzioni + lunghezze) a partire da un'origine. */
function cammina(origine: Punto, dir: Array<{ x: number; y: number }>, len: number[]): Punto[] {
  const out: Punto[] = [];
  let cx = origine.x;
  let cy = origine.y;
  for (let i = 0; i < dir.length; i++) {
    out.push({ x: cx, y: cy });
    cx += dir[i].x * len[i];
    cy += dir[i].y * len[i];
  }
  return out;
}

function baricentro(punti: Punto[]): Punto {
  let x = 0;
  let y = 0;
  for (const p of punti) {
    x += p.x;
    y += p.y;
  }
  return { x: x / punti.length, y: y / punti.length };
}

/** Intersezione delle rette (a→b) e (c→d); null se parallele. */
function intersezioneRette(a: Punto, b: Punto, c: Punto, d: Punto): Punto | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

/**
 * Risolve un sistema lineare M·x = b (Gauss-Jordan con pivot parziale).
 * Restituisce null se la matrice è singolare (vincoli in conflitto/ridondanti).
 */
function risolviSistema(M: number[][], b: number[]): number[] | null {
  const m = M.length;
  const A = M.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const pivVal = A[col][col];
    for (let c = col; c <= m; c++) A[col][c] /= pivVal;
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let c = col; c <= m; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((r) => r[m]);
}

// ---------------------------------------------------------------------------
// (4)(5)(6) Solver di chiusura ai minimi quadrati
// ---------------------------------------------------------------------------

const PESO_LIBERO = 0.05; // i lati senza quota assorbono di più la correzione
const LATO_MINIMO_PX = 0.5;

/**
 * Risolve le lunghezze dei lati mantenendo le direzioni correnti e la CHIUSURA.
 * - `bersagli[i]`: lunghezza obiettivo (px) del lato i, o null = libero;
 * - `bloccati[i]`: true = lunghezza rigida (vincolo forte);
 * - `ancora`: punto invariante attorno a cui la figura si riadatta.
 * Minimizza Σ wᵢ(Lᵢ − tᵢ)² con vincoli di chiusura + lati bloccati (KKT).
 */
export function risolviChiusura(
  punti: Punto[],
  bersagli: Array<number | null>,
  bloccati: boolean[],
  ancora?: AncoraChiusura
): EsitoParametrico {
  const n = punti.length;
  const avvisi: AvvisoParametrico[] = [];
  if (n < 3 || bersagli.length !== n || bloccati.length !== n) {
    return { punti: punti.slice(), ok: false, avvisi: ['sovravincolato'] };
  }

  // direzioni fisse + lunghezze correnti
  const dir: Array<{ x: number; y: number }> = [];
  const L0: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = versore(punti[i], punti[(i + 1) % n]);
    if (v.len < 1e-9) avvisi.push('direzione-degenere');
    dir.push({ x: v.x, y: v.y });
    L0.push(v.len);
  }

  // obiettivi e pesi
  const t = bersagli.map((b, i) => (b != null ? b : L0[i]));
  const w = bersagli.map((b) => (b != null ? 1 : PESO_LIBERO));
  const hard: number[] = [];
  for (let i = 0; i < n; i++) if (bloccati[i]) hard.push(i);

  // vincoli A·L = b:  2 righe di chiusura (x,y) + una per ogni lato bloccato
  const A: number[][] = [];
  const rhs: number[] = [];
  A.push(dir.map((d) => d.x));
  rhs.push(0);
  A.push(dir.map((d) => d.y));
  rhs.push(0);
  for (const h of hard) {
    const row = new Array<number>(n).fill(0);
    row[h] = 1;
    A.push(row);
    rhs.push(t[h]);
  }

  // KKT:  M λ = (b − A t),  L = t + Winv Aᵀ λ
  const m = A.length;
  const winv = w.map((x) => 1 / x);
  const M: number[][] = [];
  for (let r = 0; r < m; r++) {
    const row = new Array<number>(m).fill(0);
    for (let c = 0; c < m; c++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[r][k] * winv[k] * A[c][k];
      row[c] = s;
    }
    M.push(row);
  }
  // regolarizzazione (ridge) minima: rende M invertibile quando i vincoli sono
  // RIDONDANTI ma CONSISTENTI (es. due lati opposti bloccati alla stessa misura,
  // dove una riga di chiusura è combinazione lineare dei blocchi). Sposta la
  // soluzione in modo impercettibile; l'incoerenza VERA viene comunque
  // intercettata dalla validazione a valle (chiusura + blocchi rispettati).
  for (let r = 0; r < m; r++) M[r][r] += 1e-6;
  const At = new Array<number>(m); // A·t per riga
  for (let r = 0; r < m; r++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += A[r][k] * t[k];
    At[r] = s;
  }
  const rhsKkt = rhs.map((b, r) => b - At[r]);
  const lambda = risolviSistema(M, rhsKkt);
  if (!lambda) {
    avvisi.push('sovravincolato');
    return { punti: punti.slice(), ok: false, avvisi };
  }
  const L = t.slice();
  for (let k = 0; k < n; k++) {
    let corr = 0;
    for (let r = 0; r < m; r++) corr += A[r][k] * lambda[r];
    L[k] = t[k] + winv[k] * corr;
  }

  // validazioni: lunghezze positive e chiusura effettiva
  for (let i = 0; i < n; i++) {
    if (L[i] <= 1e-6) {
      avvisi.push('lunghezza-negativa');
      return { punti: punti.slice(), ok: false, avvisi };
    }
    if (L[i] < LATO_MINIMO_PX) avvisi.push('lato-corto');
  }
  // i lati bloccati devono rispettare la misura richiesta: se la
  // regolarizzazione ha dovuto "spalmare" un'incoerenza, qui si scopre
  for (const h of hard) {
    if (Math.abs(L[h] - t[h]) > 0.5) {
      avvisi.push('sovravincolato');
      return { punti: punti.slice(), ok: false, avvisi };
    }
  }
  let rx = 0;
  let ry = 0;
  for (let i = 0; i < n; i++) {
    rx += dir[i].x * L[i];
    ry += dir[i].y * L[i];
  }
  if (Math.hypot(rx, ry) > 0.5) {
    avvisi.push('sovravincolato');
    return { punti: punti.slice(), ok: false, avvisi };
  }

  // ricostruisce i vertici e li trasla per rispettare l'ancora
  const raw = cammina({ x: 0, y: 0 }, dir, L);
  let tx = 0;
  let ty = 0;
  if (ancora?.lato != null) {
    const i = ancora.lato % n;
    tx = punti[i].x - raw[i].x;
    ty = punti[i].y - raw[i].y;
  } else if (ancora?.vertice != null) {
    const i = ((ancora.vertice % n) + n) % n;
    tx = punti[i].x - raw[i].x;
    ty = punti[i].y - raw[i].y;
  } else if (ancora?.centro != null) {
    const i = ancora.centro % n;
    const j = (i + 1) % n;
    const origMid = { x: (punti[i].x + punti[j].x) / 2, y: (punti[i].y + punti[j].y) / 2 };
    const rawMid = { x: (raw[i].x + raw[j].x) / 2, y: (raw[i].y + raw[j].y) / 2 };
    tx = origMid.x - rawMid.x;
    ty = origMid.y - rawMid.y;
  } else {
    const bo = baricentro(punti);
    const br = baricentro(raw);
    tx = bo.x - br.x;
    ty = bo.y - br.y;
  }
  const nuovi = raw.map((p) => ({ x: p.x + tx, y: p.y + ty }));
  return { punti: nuovi, ok: true, avvisi };
}

/**
 * Riadatta la geometria della pianta a partire dalle quote dei lati.
 * Legge da `segmenti` le lunghezze reali (× `pxPerReale`), i lati bloccati e le
 * ancore; `latoModificato` (indice del lato appena editato) viene bloccato.
 * Restituisce i nuovi vertici o, se i vincoli impediscono la chiusura, `ok:false`.
 */
export function risolviParametrico(
  punti: Punto[],
  segmenti: SegmentoQuota[],
  opts: { pxPerReale: number; latoModificato?: number }
): EsitoParametrico {
  const n = punti.length;
  const scala = opts.pxPerReale > 0 ? opts.pxPerReale : 0;
  const bersagli: Array<number | null> = [];
  const bloccati: boolean[] = [];
  let ancora: AncoraChiusura | undefined;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const seg = segmenti.find(
      (s) => segmentoELato(s, n) && ((s.da === i && s.a === j) || (s.da === j && s.a === i))
    );
    const val = seg && seg.valore != null && scala > 0 ? seg.valore * scala : null;
    bersagli.push(val);
    const hard = (seg && (seg.bloccato || seg.ancora === 'lato')) || i === opts.latoModificato;
    bloccati.push(Boolean(hard));
    if (seg && seg.ancora && !ancora) {
      if (seg.ancora === 'lato') ancora = { lato: i };
      else if (seg.ancora === 'vertice-da') ancora = { vertice: seg.da };
      else if (seg.ancora === 'vertice-a') ancora = { vertice: seg.a };
      else if (seg.ancora === 'centro') ancora = { centro: i };
    }
  }
  return risolviChiusura(punti, bersagli, bloccati, ancora);
}

// ---------------------------------------------------------------------------
// Menu Pianta (Fase 2): quote/vincoli che comandano il disegno via il
// risolutore geometrico generale (diagonali, angoli e in genere vincoli non
// lineari che il modello a lati orientati non gestisce).
// ---------------------------------------------------------------------------

/**
 * Costruisce l'insieme di vincoli geometrici (px) di una pianta dai suoi
 * segmenti quotati (lati e diagonali, escluse le quote di RIFERIMENTO), dalle
 * ancore e dagli eventuali vincoli angolari. `pxPerReale` converte le quote
 * reali in pixel.
 */
export function costruisciVincoliPianta(
  punti: Punto[],
  segmenti: SegmentoQuota[],
  vincoliPianta: VincoloPianta[] | undefined,
  pxPerReale: number
): VincoloGeom[] {
  const n = punti.length;
  const out: VincoloGeom[] = [];
  const latoQuotato = new Set<number>(); // indice del lato (i→i+1) con lunghezza HARD
  for (const s of segmenti) {
    if (s.riferimento || s.valore == null) continue;
    if (s.da < 0 || s.a < 0 || s.da >= n || s.a >= n || s.da === s.a) continue;
    out.push({ tipo: 'lunghezza', a: s.da, b: s.a, valore: s.valore * pxPerReale });
    const e = (s.da + 1) % n === s.a ? s.da : (s.a + 1) % n === s.da ? s.a : null;
    if (e != null) latoQuotato.add(e);
  }
  // preservazione DEBOLE della lunghezza dei lati non quotati: così le quote non
  // lineari (diagonali/angoli) comandano la forma per ROTAZIONE/spostamento senza
  // stravolgere la lunghezza dei muri (peso basso = cede al vincolo forte)
  for (let i = 0; i < n; i++) {
    if (latoQuotato.has(i)) continue;
    const j = (i + 1) % n;
    const len = Math.hypot(punti[j].x - punti[i].x, punti[j].y - punti[i].y);
    if (len > 1e-6) out.push({ tipo: 'lunghezza', a: i, b: j, valore: len, peso: 0.02 });
  }
  // ancore → vertici fissi
  for (const s of segmenti) {
    if (s.da < 0 || s.a < 0 || s.da >= n || s.a >= n) continue;
    if (s.ancora === 'lato') {
      out.push({ tipo: 'fisso', a: s.da, x: punti[s.da].x, y: punti[s.da].y });
      out.push({ tipo: 'fisso', a: s.a, x: punti[s.a].x, y: punti[s.a].y });
    } else if (s.ancora === 'vertice-da') {
      out.push({ tipo: 'fisso', a: s.da, x: punti[s.da].x, y: punti[s.da].y });
    } else if (s.ancora === 'vertice-a') {
      out.push({ tipo: 'fisso', a: s.a, x: punti[s.a].x, y: punti[s.a].y });
    }
  }
  // vincoli angolari (Fase 2): angolo al vertice tra i due lati adiacenti
  for (const v of vincoliPianta ?? []) {
    if (v.tipo !== 'angolo' || v.riferimento || v.valore == null) continue;
    const vert = v.riferimenti[0]?.indice;
    if (vert == null || vert < 0 || vert >= n) continue;
    out.push({ tipo: 'angolo', a: (vert - 1 + n) % n, v: vert, b: (vert + 1) % n, gradi: v.valore });
  }
  return out;
}

/**
 * Risolve la geometria della pianta rispettando le quote/vincoli (comandano il
 * disegno) tramite il risolutore geometrico. Restituisce i nuovi vertici o
 * `ok:false` se i vincoli sono incompatibili (il chiamante avvisa).
 */
export function risolviPianta(
  punti: Punto[],
  segmenti: SegmentoQuota[],
  vincoliPianta: VincoloPianta[] | undefined,
  pxPerReale: number
): { punti: Punto[]; ok: boolean } {
  const vincoli = costruisciVincoliPianta(punti, segmenti, vincoliPianta, pxPerReale);
  if (vincoli.length === 0) return { punti: punti.slice(), ok: true };
  const r = risolviGeom(punti, vincoli);
  return { punti: r.punti, ok: r.ok };
}

// ---------------------------------------------------------------------------
// (9) Stato di vincolatura dello schizzo (indicatore visivo del Menu Pianta)
// ---------------------------------------------------------------------------

/**
 * Stima lo stato di vincolatura del perimetro di una pianta (§9). Euristica
 * sui gradi di libertà del modello a lati orientati (le direzioni sono fissate
 * dalla geometria corrente, le lunghezze sono le incognite): la chiusura ricava
 * fino a 2 lati, quindi la forma è DETERMINATA quando i lati non quotati sono
 * ≤ 2. L'over-constrained reale (vincoli in conflitto) viene rilevato al
 * momento della modifica dal solver e segnalato lì, non da questa stima.
 */
export function statoSchizzo(punti: Punto[], segmenti: SegmentoQuota[]): StatoSchizzoPianta {
  const n = punti.length;
  if (n < 3) return 'nonVincolato';
  let quotati = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const seg = segmenti.find(
      (s) => segmentoELato(s, n) && ((s.da === i && s.a === j) || (s.da === j && s.a === i))
    );
    if (seg && seg.valore != null) quotati++;
  }
  if (quotati === 0) return 'nonVincolato';
  return n - quotati <= 2 ? 'completo' : 'parziale';
}

// ---------------------------------------------------------------------------
// (1) Snap angolare dello schizzo
// ---------------------------------------------------------------------------

/**
 * Aggancia le direzioni dei lati al passo angolare (30/45/90°) e richiude la
 * figura risolvendo le lunghezze. I lati la cui direzione è entro
 * `tolleranzaGradi` da un valore valido vengono agganciati; gli altri restano.
 * Evita micro-segmenti storti mantenendo la figura chiusa.
 */
export function snapAngoliPoligono(punti: Punto[], passoGradi: number, tolleranzaGradi = 8): Punto[] {
  const n = punti.length;
  if (n < 3 || !(passoGradi > 0)) return punti.slice();
  const dir: Array<{ x: number; y: number }> = [];
  const len: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = versore(punti[i], punti[(i + 1) % n]);
    len.push(v.len);
    if (v.len < 1e-9) {
      dir.push({ x: 1, y: 0 });
      continue;
    }
    const agg = agganciaVersore(v.x, v.y, passoGradi);
    const cos = Math.max(-1, Math.min(1, v.x * agg.x + v.y * agg.y));
    const diff = (Math.acos(cos) * 180) / Math.PI;
    dir.push(diff <= tolleranzaGradi ? agg : { x: v.x, y: v.y });
  }
  const puntiSnap = cammina(punti[0], dir, len);
  const chiuso = risolviChiusura(
    puntiSnap,
    len.map(() => null),
    len.map(() => false)
  );
  // se la richiusura fallisce, `puntiSnap` sarebbe un anello NON chiuso/degenere
  // (l'ultimo lato resta implicito e può auto-intersecare): meglio restituire la
  // figura originale, comunque valida e chiusa, piuttosto che una forma sbagliata
  return chiuso.ok ? chiuso.punti : punti.slice();
}

// ---------------------------------------------------------------------------
// (2) Fusione dei lati collineari consecutivi
// ---------------------------------------------------------------------------

/** Angolo di "svolta" al vertice b (0 = perfettamente allineato). */
function svoltaGradi(a: Punto, b: Punto, c: Punto): number {
  const u = versore(a, b);
  const v = versore(b, c);
  if (u.len < 1e-9 || v.len < 1e-9) return 0;
  const cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Indice del lato in avanti (i→(i+1)%n) rappresentato da un segmento lato. */
function indiceLatoAvanti(seg: SegmentoQuota, n: number): number | null {
  if ((seg.da + 1) % n === seg.a) return seg.da;
  if ((seg.a + 1) % n === seg.da) return seg.a;
  return null;
}

/**
 * Fonde i vertici in cui due lati consecutivi sono (quasi) collineari: rimuove
 * il vertice intermedio e unisce i due lati in uno solo, sommandone le quote.
 * Aggiorna gli indici di TUTTI i segmenti (lati e diagonali). Restituisce null
 * se non c'è nulla da fondere o si scenderebbe sotto i 3 vertici.
 */
export function fondiCollineari(
  punti: Punto[],
  segmenti: SegmentoQuota[],
  tolleranzaGradi = 4
): { punti: Punto[]; segmenti: SegmentoQuota[]; rimossi: number } | null {
  const n = punti.length;
  if (n < 4) return null;
  // indici originali sopravvissuti, in ordine
  let idx = punti.map((_, i) => i);
  let cambiato = true;
  while (cambiato && idx.length > 3) {
    cambiato = false;
    for (let k = 0; k < idx.length; k++) {
      const m = idx.length;
      const a = punti[idx[(k - 1 + m) % m]];
      const b = punti[idx[k]];
      const c = punti[idx[(k + 1) % m]];
      if (svoltaGradi(a, b, c) <= tolleranzaGradi) {
        idx.splice(k, 1);
        cambiato = true;
        break;
      }
    }
  }
  const rimossi = n - idx.length;
  if (rimossi === 0) return null;

  const nuoviPunti = idx.map((i) => punti[i]);
  const m = nuoviPunti.length;
  // mappa vertice originale → nuovo (o -1 se rimosso)
  const mappa = new Array<number>(n).fill(-1);
  idx.forEach((orig, nuovo) => (mappa[orig] = nuovo));

  // valori dei lati originali per indice-avanti
  const segLato = new Map<number, SegmentoQuota>();
  for (const seg of segmenti) {
    if (!segmentoELato(seg, n)) continue;
    const e = indiceLatoAvanti(seg, n);
    if (e != null) segLato.set(e, seg);
  }

  const nuoviSeg: SegmentoQuota[] = [];
  // nuovi lati: ogni lato nuovo assorbe gli originali del suo tratto
  for (let k = 0; k < m; k++) {
    const from = idx[k];
    const to = idx[(k + 1) % m];
    let somma = 0;
    let qualcuno = false;
    let esiste = false;
    let primo: SegmentoQuota | undefined;
    let e = from;
    // percorre gli spigoli originali da `from` fino a `to`
    // (protezione anti-loop: al più n passi)
    for (let passi = 0; passi < n; passi++) {
      const seg = segLato.get(e);
      if (seg) {
        esiste = true;
        if (!primo) primo = seg;
        if (seg.valore != null) {
          somma += seg.valore;
          qualcuno = true;
        }
      }
      e = (e + 1) % n;
      if (e === to) break;
    }
    if (esiste) {
      nuoviSeg.push({
        ...(primo ?? {}),
        da: k,
        a: (k + 1) % m,
        valore: qualcuno ? somma : null,
        // un lato fuso perde il simbolo esplicito (verrà ridedotto)
        simbolo: primo?.simbolo
      });
    }
  }
  // diagonali: sopravvivono se entrambi gli estremi restano e non duplicano
  // un segmento già prodotto (una diagonale i cui estremi diventano adiacenti
  // coinciderebbe con un lato fuso)
  const giaPresente = (nd: number, na: number) =>
    nuoviSeg.some((x) => (x.da === nd && x.a === na) || (x.da === na && x.a === nd));
  for (const seg of segmenti) {
    if (segmentoELato(seg, n)) continue;
    const nd = mappa[seg.da];
    const na = mappa[seg.a];
    if (nd >= 0 && na >= 0 && nd !== na && !giaPresente(nd, na))
      nuoviSeg.push({ ...seg, da: nd, a: na });
  }
  return { punti: nuoviPunti, segmenti: nuoviSeg, rimossi };
}

// ---------------------------------------------------------------------------
// (3) Eliminazione di un lato con richiusura
// ---------------------------------------------------------------------------

function isLatoTra(seg: SegmentoQuota, i: number, j: number): boolean {
  return (seg.da === i && seg.a === j) || (seg.da === j && seg.a === i);
}

/**
 * Elimina il lato in avanti `indiceLato` (i→(i+1)%n) richiudendo la figura:
 * i due vertici del lato collassano in uno (intersezione dei lati adiacenti, o
 * punto medio se paralleli) e gli indici dei segmenti vengono aggiornati.
 * Restituisce null se si scenderebbe sotto i 3 vertici.
 */
export function eliminaLatoRichiudi(
  punti: Punto[],
  segmenti: SegmentoQuota[],
  indiceLato: number
): { punti: Punto[]; segmenti: SegmentoQuota[] } | null {
  const n = punti.length;
  if (n < 4) return null;
  const i = ((indiceLato % n) + n) % n;
  const j = (i + 1) % n;
  const prev = (i - 1 + n) % n;
  const next = (j + 1) % n;

  const medio = { x: (punti[i].x + punti[j].x) / 2, y: (punti[i].y + punti[j].y) / 2 };
  let vstar = intersezioneRette(punti[prev], punti[i], punti[j], punti[next]) ?? medio;
  // intersezione troppo lontana (lati quasi paralleli) → punto medio
  const scalaLato = Math.max(
    Math.hypot(punti[i].x - punti[prev].x, punti[i].y - punti[prev].y),
    Math.hypot(punti[next].x - punti[j].x, punti[next].y - punti[j].y),
    1
  );
  if (Math.hypot(vstar.x - medio.x, vstar.y - medio.y) > 3 * scalaLato) vstar = medio;

  // nuovi vertici: si rimuove j, si riposiziona i su vstar
  const nuoviPunti: Punto[] = [];
  const mappa = new Array<number>(n).fill(-1);
  for (let k = 0; k < n; k++) {
    if (k === j) continue;
    mappa[k] = nuoviPunti.length;
    nuoviPunti.push(k === i ? vstar : punti[k]);
  }

  const nuoviSeg: SegmentoQuota[] = [];
  const giaPresente = (nd: number, na: number) =>
    nuoviSeg.some((x) => (x.da === nd && x.a === na) || (x.da === na && x.a === nd));
  for (const seg of segmenti) {
    if (isLatoTra(seg, i, j)) continue; // il lato eliminato sparisce
    const da = seg.da === j ? i : seg.da;
    const a = seg.a === j ? i : seg.a;
    const nd = mappa[da];
    const na = mappa[a];
    // scarta segmenti degeneri (nd===na) o che, dopo il collasso, duplicano
    // un segmento già presente (es. una diagonale ricondotta su un lato)
    if (nd < 0 || na < 0 || nd === na || giaPresente(nd, na)) continue;
    nuoviSeg.push({ ...seg, da: nd, a: na });
  }
  return { punti: nuoviPunti, segmenti: nuoviSeg };
}
