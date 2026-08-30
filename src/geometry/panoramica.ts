/**
 * PANORAMICHE PER IL SOPRALLUOGO.
 *
 * Una vetrina lunga otto metri non ci sta in uno scatto: o si va lontano — e
 * allora il serramento è quattro pixel e le misure non si prendono più — o si
 * fanno più scatti. Questo modulo li rimette insieme.
 *
 * LA SCELTA CHE CONTA: il cucito è PIANO, non cilindrico.
 *
 * La panoramica del telefono proietta su un cilindro: i muri diventano archi,
 * le righe dritte si incurvano. È bellissima da guardare e inutilizzabile per
 * misurare, perché sull'immagine cilindrica non esiste nessuna omografia che
 * porti il muro sul piano — e tutta la calibrazione dell'app, le quote sulla
 * foto, gli spigoli fra pareti, la pannellizzazione, si reggono su quella.
 *
 * Qui invece ogni scatto viene riproiettato sul PIANO di uno scatto di
 * riferimento, con l'omografia che li lega. Il risultato è ancora l'immagine
 * che avrebbe fatto una sola macchina fotografica, con un sensore più largo:
 * le righe restano dritte, i rapporti incrociati si conservano, e la foto
 * cucita si misura esattamente come una foto normale.
 *
 * IL PREZZO, che va detto: l'omografia lega due scatti solo se quello che si
 * inquadra sta su UN PIANO, oppure se la macchina ha soltanto ruotato sul
 * posto. Sono due casi buoni, non uno — e il primo è quello del sopralluogo.
 * Davanti a una facciata piatta ci si può SPOSTARE camminando, e le omografie
 * restano esatte: è così che si riprende un capannone lungo da un cortile
 * stretto, dove indietro non si può andare e girando sui piedi si finirebbe a
 * inquadrare il muro di sbieco. Se invece nel campo c'è roba vicina e roba
 * lontana insieme, spostandosi scorrono in modo diverso (parallasse) e le
 * giunzioni sdoppiano: là bisogna girare sul posto, e oltre i ~120° di campo
 * totale i bordi si stirano fino a diventare inservibili.
 *
 * L'ALTRO PREZZO, misurato: gli scatti si legano a due a due, e su una fila
 * lunga i piccoli errori si sommano. La cura non è raffinare il conto — è
 * SOVRAPPORSI DI PIÙ. Sul banco, dodici scatti sovrapposti a metà derivano di
 * 41 px all'estremità; gli stessi dodici sovrapposti a due terzi, di 10.
 */

import type { Punto } from '../db/types';
import {
  applicaOmografia,
  calcolaOmografia,
  invertiOmografia,
  omografiaAiMinimiQuadrati,
  prodotto,
  type Omografia
} from './omografia';

/** Immagine in scala di grigi: solo quello che serve per trovare gli angoli. */
export interface Grigia {
  dati: Float32Array;
  w: number;
  h: number;
}

export interface Angolo {
  x: number;
  y: number;
  /** quanto l'angolo è marcato: serve a tenere i migliori */
  forza: number;
  /** orientamento del chiaroscuro attorno, in radianti */
  angolo: number;
}

export interface Caratteristica extends Angolo {
  /** 256 bit di descrittore, impacchettati in 32 byte */
  firma: Uint8Array;
}

export interface Coppia {
  a: Punto;
  b: Punto;
  /** distanza di Hamming fra i due descrittori (0 = identici) */
  distanza: number;
}

// ---------------------------------------------------------------------------
// Grigio
// ---------------------------------------------------------------------------

/** Da RGBA a luminanza percettiva, l'unica cosa che serve agli angoli. */
export function inGrigio(dati: Uint8ClampedArray, w: number, h: number): Grigia {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    g[i] = 0.299 * dati[i * 4] + 0.587 * dati[i * 4 + 1] + 0.114 * dati[i * 4 + 2];
  }
  return { dati: g, w, h };
}

/** Sfocatura leggera (box 3×3, due passate): toglie il rumore del sensore. */
export function ammorbidita(img: Grigia): Grigia {
  let corrente = img;
  for (let passata = 0; passata < 2; passata++) {
    const out = new Float32Array(corrente.w * corrente.h);
    const { dati, w, h } = corrente;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            s += dati[yy * w + xx];
            n++;
          }
        }
        out[y * w + x] = s / n;
      }
    }
    corrente = { dati: out, w, h };
  }
  return corrente;
}

// ---------------------------------------------------------------------------
// Angoli (FAST-9)
// ---------------------------------------------------------------------------

/** i 16 pixel del cerchio di Bresenham di raggio 3, in ordine */
const CERCHIO: Array<[number, number]> = [
  [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3],
  [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]
];

/**
 * ANGOLI FAST: un pixel è un angolo se almeno 9 dei 16 sul cerchio attorno
 * sono TUTTI più chiari, o TUTTI più scuri, di lui di almeno `soglia`.
 *
 * È il rilevatore più veloce che ci sia, ed è quello che serve: su uno scatto
 * da otto megapixel bisogna guardare ogni pixel, e sul telefono.
 */
export function angoliFast(img: Grigia, soglia = 18, bordo = 20): Angolo[] {
  const { dati, w, h } = img;
  const fuori: Angolo[] = [];
  const idx = CERCHIO.map(([dx, dy]) => dy * w + dx);
  for (let y = bordo; y < h - bordo; y++) {
    for (let x = bordo; x < w - bordo; x++) {
      const c = dati[y * w + x];
      const p = y * w + x;
      // scarto veloce: dei quattro punti cardinali ne servono almeno tre
      // dalla stessa parte, altrimenti nove di fila non ci saranno mai
      let chiari = 0;
      let scuri = 0;
      for (const k of [0, 4, 8, 12]) {
        const v = dati[p + idx[k]];
        if (v > c + soglia) chiari++;
        else if (v < c - soglia) scuri++;
      }
      if (chiari < 3 && scuri < 3) continue;
      // nove consecutivi sul cerchio (che si richiude: si guarda 16+8)
      let piuLungoChiaro = 0;
      let piuLungoScuro = 0;
      let corsaChiara = 0;
      let corsaScura = 0;
      for (let k = 0; k < 24; k++) {
        const v = dati[p + idx[k % 16]];
        if (v > c + soglia) {
          corsaChiara++;
          corsaScura = 0;
        } else if (v < c - soglia) {
          corsaScura++;
          corsaChiara = 0;
        } else {
          corsaChiara = 0;
          corsaScura = 0;
        }
        if (corsaChiara > piuLungoChiaro) piuLungoChiaro = corsaChiara;
        if (corsaScura > piuLungoScuro) piuLungoScuro = corsaScura;
      }
      if (piuLungoChiaro < 9 && piuLungoScuro < 9) continue;
      // forza: quanto il cerchio si discosta dal centro, in totale
      let forza = 0;
      for (const k of idx) forza += Math.abs(dati[p + k] - c);
      fuori.push({ x, y, forza, angolo: 0 });
    }
  }
  return fuori;
}

/**
 * ANGOLI SPARSI E FORTI. Un rilevatore lasciato libero mette trecento angoli
 * sullo stesso mattone e nessuno sul resto della foto: si divide l'immagine a
 * caselle e da ognuna si prendono i più marcati. Così l'omografia si regge su
 * punti presi da tutta l'inquadratura, non da un angolo solo.
 */
export function selezionati(angoli: Angolo[], w: number, h: number, quanti = 900): Angolo[] {
  if (angoli.length <= quanti) return [...angoli].sort((a, b) => b.forza - a.forza);
  const colonne = 12;
  const righe = 8;
  const perCasella = Math.max(1, Math.ceil(quanti / (colonne * righe)));
  const caselle = new Map<number, Angolo[]>();
  for (const a of angoli) {
    const cx = Math.min(colonne - 1, Math.floor((a.x / w) * colonne));
    const cy = Math.min(righe - 1, Math.floor((a.y / h) * righe));
    const k = cy * colonne + cx;
    if (!caselle.has(k)) caselle.set(k, []);
    caselle.get(k)!.push(a);
  }
  const fuori: Angolo[] = [];
  for (const lista of caselle.values()) {
    lista.sort((a, b) => b.forza - a.forza);
    for (const a of lista.slice(0, perCasella)) fuori.push(a);
  }
  return fuori.sort((a, b) => b.forza - a.forza).slice(0, quanti);
}

/**
 * ORIENTAMENTO dell'angolo: la direzione dal centro del cerchietto al suo
 * baricentro luminoso. Serve a far girare il descrittore insieme alla foto,
 * così due scatti inclinati fra loro si riconoscono lo stesso.
 */
export function orientamento(img: Grigia, x: number, y: number, raggio = 12): number {
  const { dati, w, h } = img;
  let m01 = 0;
  let m10 = 0;
  for (let dy = -raggio; dy <= raggio; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= h) continue;
    const larghezza = Math.floor(Math.sqrt(raggio * raggio - dy * dy));
    for (let dx = -larghezza; dx <= larghezza; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= w) continue;
      const v = dati[yy * w + xx];
      m10 += dx * v;
      m01 += dy * v;
    }
  }
  return Math.atan2(m01, m10);
}

// ---------------------------------------------------------------------------
// Descrittore (BRIEF ruotato)
// ---------------------------------------------------------------------------

/** generatore deterministico: il campionamento dev'essere identico ovunque */
function caso(seme: number): () => number {
  let s = seme >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * LE 256 COPPIE DI PIXEL da confrontare attorno all'angolo. Sono scelte una
 * volta per tutte, a caso ma sempre le stesse: il descrittore è la risposta a
 * 256 domande del tipo «questo pixel è più chiaro di quest'altro?», e le
 * domande devono essere le stesse nei due scatti, altrimenti le risposte non
 * si possono confrontare.
 */
function pattern(): Int8Array {
  const r = caso(20260829);
  const p = new Int8Array(256 * 4);
  const sigma = 6.5;
  const gauss = () => {
    // Box-Muller, tagliata al raggio del cerchietto
    const u = Math.max(1e-9, r());
    const v = r();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
    return Math.max(-13, Math.min(13, Math.round(g)));
  };
  for (let i = 0; i < 256; i++) {
    p[i * 4] = gauss();
    p[i * 4 + 1] = gauss();
    p[i * 4 + 2] = gauss();
    p[i * 4 + 3] = gauss();
  }
  return p;
}

const PATTERN = pattern();

/** Il descrittore dell'angolo: 256 confronti, girati col suo orientamento. */
export function descrittore(img: Grigia, x: number, y: number, angolo: number): Uint8Array {
  const { dati, w, h } = img;
  const cos = Math.cos(angolo);
  const sin = Math.sin(angolo);
  const firma = new Uint8Array(32);
  const leggi = (dx: number, dy: number) => {
    const xx = Math.round(x + dx * cos - dy * sin);
    const yy = Math.round(y + dx * sin + dy * cos);
    if (xx < 0 || xx >= w || yy < 0 || yy >= h) return 0;
    return dati[yy * w + xx];
  };
  for (let i = 0; i < 256; i++) {
    const a = leggi(PATTERN[i * 4], PATTERN[i * 4 + 1]);
    const b = leggi(PATTERN[i * 4 + 2], PATTERN[i * 4 + 3]);
    if (a > b) firma[i >> 3] |= 1 << (i & 7);
  }
  return firma;
}

/**
 * QUANTI ANGOLI CERCARE, e con che soglia.
 *
 * Non sono numeri di gusto: sono misurati. Con 900 angoli e soglia 18, due
 * scatti sovrapposti al 51% davano un'omografia sbagliata di 8,8 px e al 39%
 * di 35 px — cioè inservibili. Con 2000 angoli e soglia 10 gli stessi due
 * scatti danno 2,8 px e 4,4 px. Non era la ricerca a essere debole: era che
 * le davo pochi punti su cui lavorare.
 */
const ANGOLI = 2000;
/**
 * QUANTO FOTOGRAMMA deve tenere un legame per fare da controvento.
 *
 * Sotto un terzo non serve: la sua omografia è ricavata da una fascia sottile
 * e fuori di lì non regge. La misura sul banco lo dice chiaro — i legami fra
 * scatti a due posti di distanza coprivano il 17-26% del fotogramma contro il
 * 44-54% dei vicini, e messi nel conto con lo stesso peso peggioravano la
 * panoramica invece di raddrizzarla.
 */
const SOGLIA_CONTROVENTO = 0.33;
const SOGLIA_ANGOLI = 10;

/** Angoli scelti, orientati e descritti: tutto quello che serve per abbinare. */
export function caratteristiche(
  img: Grigia,
  quante = ANGOLI,
  soglia = SOGLIA_ANGOLI
): Caratteristica[] {
  const morbida = ammorbidita(img);
  const angoli = selezionati(angoliFast(morbida, soglia), img.w, img.h, quante);
  return angoli.map((a) => {
    const angolo = orientamento(morbida, a.x, a.y);
    return { ...a, angolo, firma: descrittore(morbida, a.x, a.y, angolo) };
  });
}

/** quanti bit sono diversi fra due descrittori */
export function distanzaHamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < 32; i++) {
    let v = a[i] ^ b[i];
    // conteggio dei bit a 1, senza tabelle
    v = v - ((v >> 1) & 0x55);
    v = (v & 0x33) + ((v >> 2) & 0x33);
    d += (v + (v >> 4)) & 0x0f;
  }
  return d;
}

/**
 * ABBINAMENTI FRA DUE SCATTI.
 *
 * Per ogni angolo del primo si cerca il più somigliante del secondo, e si
 * tiene solo se è NETTAMENTE meglio del secondo classificato (prova del
 * rapporto di Lowe): su un muro di mattoni tutti gli angoli si somigliano, e
 * un abbinamento «per un pelo» è quasi sempre sbagliato. In più si pretende
 * che l'accordo sia reciproco: il migliore di A deve avere come migliore
 * proprio A.
 */
export function abbina(
  A: Caratteristica[],
  B: Caratteristica[],
  rapporto = 0.88,
  distanzaMax = 90
): Coppia[] {
  if (A.length === 0 || B.length === 0) return [];
  // UNA PASSATA SOLA. Confrontare tutti con tutti costa nA×nB, ed è il conto
  // più pesante di tutto il cucito: farlo due volte — una per trovare il
  // migliore di A, una per quello di B — vuol dire pagarlo doppio. Si tiene
  // invece traccia di tutti e due mentre si scorre.
  const primoB = new Int32Array(B.length).fill(999);
  const qualeB = new Int32Array(B.length).fill(-1);
  const coppie: Coppia[] = [];
  const grezze: Array<{ i: number; j: number; d: number }> = [];
  A.forEach((a, i) => {
    let primo = 999;
    let secondo = 999;
    let quale = -1;
    for (let j = 0; j < B.length; j++) {
      const d = distanzaHamming(a.firma, B[j].firma);
      if (d < primo) {
        secondo = primo;
        primo = d;
        quale = j;
      } else if (d < secondo) {
        secondo = d;
      }
      if (d < primoB[j]) {
        primoB[j] = d;
        qualeB[j] = i;
      }
    }
    if (quale < 0 || primo > distanzaMax) return;
    // PROVA DEL RAPPORTO: su un muro di mattoni tutti gli angoli si
    // somigliano, e un abbinamento «per un pelo» è quasi sempre sbagliato
    if (primo > rapporto * secondo) return;
    grezze.push({ i, j: quale, d: primo });
  });
  for (const g of grezze) {
    // e l'accordo dev'essere reciproco: il migliore di A deve avere come
    // migliore proprio A
    if (qualeB[g.j] !== g.i) continue;
    coppie.push({
      a: { x: A[g.i].x, y: A[g.i].y },
      b: { x: B[g.j].x, y: B[g.j].y },
      distanza: g.d
    });
  }
  return coppie;
}

// ---------------------------------------------------------------------------
// L'omografia fra due scatti
// ---------------------------------------------------------------------------

export interface Allineamento {
  /** porta i punti dello scatto B su quelli dello scatto A */
  H: Omografia;
  /** le coppie che l'omografia spiega */
  buone: Coppia[];
  /** quante coppie erano state proposte in tutto */
  proposte: number;
  /** errore medio di riproiezione sulle coppie buone, in pixel */
  errore: number;
}

/**
 * UNA SIMILITUDINE DA DUE SOLE COPPIE: spostamento, rotazione e ingrandimento.
 *
 * Non è la trasformazione giusta fra due scatti — quella è un'omografia, che
 * di gradi di libertà ne ha otto — ma è quella che serve per COMINCIARE, e il
 * perché è aritmetica. RANSAC pesca a caso e spera che il campione sia tutto
 * buono: se una coppia su otto è giusta, pescarne quattro giuste capita una
 * volta su diecimila, e in duemila tentativi non capita mai. Pescarne DUE
 * giuste capita una volta su settanta: in duemila tentativi capita trenta
 * volte. Ecco perché sotto il 50% di sovrapposizione non trovava più niente.
 *
 * Trovato il primo accordo con due punti, i superstiti sono abbastanza per
 * risolvere l'omografia vera.
 */
function similitudine(a: Coppia, b: Coppia): Omografia | null {
  const dx = b.b.x - a.b.x;
  const dy = b.b.y - a.b.y;
  const Dx = b.a.x - a.a.x;
  const Dy = b.a.y - a.a.y;
  const den = dx * dx + dy * dy;
  if (!(den > 1e-9)) return null;
  // il numero complesso che porta il segmento sull'altro segmento
  const c = (Dx * dx + Dy * dy) / den;
  const s = (Dy * dx - Dx * dy) / den;
  if (!Number.isFinite(c) || !Number.isFinite(s)) return null;
  const scala = Math.hypot(c, s);
  // un ingrandimento assurdo vuol dire che il campione era sbagliato
  if (!(scala > 0.2) || !(scala < 5)) return null;
  return [
    c, -s, a.a.x - (c * a.b.x - s * a.b.y),
    s, c, a.a.y - (s * a.b.x + c * a.b.y),
    0, 0, 1
  ];
}

/**
 * L'OMOGRAFIA CHE LEGA DUE SCATTI, cercata a tentativi (RANSAC).
 *
 * Fra gli abbinamenti ce n'è sempre una parte sbagliata — due finestre uguali,
 * due mattoni uguali — e basta una coppia falsa a rovinare una stima ai minimi
 * quadrati. Si estraggono allora quattro coppie a caso, si calcola l'omografia
 * che le soddisfa esattamente e si conta quante ALTRE coppie ci finiscono
 * sopra; si ripete, si tiene il gruppo più numeroso, e solo alla fine si
 * raffina sui soli superstiti.
 */
export function omografiaFraScatti(
  coppie: Coppia[],
  soglia = 3,
  tentativi = 2000
): Allineamento | null {
  if (coppie.length < 12) return null;
  const dentro = (H: Omografia, c: Coppia) => {
    const p = applicaOmografia(H, c.b);
    return Math.hypot(p.x - c.a.x, p.y - c.a.y) <= soglia;
  };
  let migliori: Coppia[] = [];
  const r = caso(7919);
  const pesca = (quante: number): Coppia[] => {
    const scelte: Coppia[] = [];
    let guardia = 0;
    while (scelte.length < quante && guardia++ < 60) {
      const c = coppie[Math.floor(r() * coppie.length)];
      if (!scelte.includes(c)) scelte.push(c);
    }
    return scelte;
  };

  // PRIMO GIRO, con la similitudine a due punti e la soglia larga: qui non si
  // cerca la trasformazione giusta, si cerca QUALI COPPIE sono buone
  const largo = soglia * 3;
  // due punti bastano a beccare un campione buono molto prima di quattro: un
  // terzo dei tentativi è già abbondante
  for (let t = 0; t < tentativi / 3; t++) {
    const scelte = pesca(2);
    if (scelte.length < 2) continue;
    const S = similitudine(scelte[0], scelte[1]);
    if (!S) continue;
    const buone = coppie.filter((c) => {
      const p = applicaOmografia(S, c.b);
      return Math.hypot(p.x - c.a.x, p.y - c.a.y) <= largo;
    });
    if (buone.length > migliori.length) migliori = buone;
  }

  // SECONDO GIRO, con l'omografia a quattro punti: se i due scatti sono in
  // buona sovrapposizione trova di più e meglio della similitudine
  for (let t = 0; t < tentativi; t++) {
    const scelte = pesca(4);
    if (scelte.length < 4) continue;
    let H: Omografia;
    try {
      H = calcolaOmografia(
        scelte.map((c) => c.b),
        scelte.map((c) => c.a)
      );
    } catch {
      continue;
    }
    if (!H.every(Number.isFinite)) continue;
    const buone = coppie.filter((c) => dentro(H, c));
    if (buone.length > migliori.length) {
      migliori = buone;
      // già spiegata quasi tutta: non serve insistere
      if (migliori.length > coppie.length * 0.85) break;
    }
  }
  if (migliori.length < 8) return null;

  // raffinamento su tutti i superstiti, e una seconda passata con la soglia
  // stretta: la prima omografia ne recupera altri che stavano appena fuori
  let H = omografiaAiMinimiQuadrati(
    migliori.map((c) => c.b),
    migliori.map((c) => c.a)
  );
  if (!H) return null;
  for (let giro = 0; giro < 4; giro++) {
    const dentroOra = coppie.filter((c) => dentro(H!, c));
    if (dentroOra.length < 8) break;
    const rifatta = omografiaAiMinimiQuadrati(
      dentroOra.map((c) => c.b),
      dentroOra.map((c) => c.a)
    );
    if (!rifatta) break;
    H = rifatta;
    migliori = dentroOra;
  }

  const errore =
    migliori.reduce((s, c) => {
      const p = applicaOmografia(H!, c.b);
      return s + Math.hypot(p.x - c.a.x, p.y - c.a.y);
    }, 0) / migliori.length;

  return { H, buone: migliori, proposte: coppie.length, errore };
}

/**
 * DUE SCATTI STANNO INSIEME? Non basta trovare un'omografia: bisogna che sia
 * credibile. Si guarda quante coppie regge, quanto sbaglia, e soprattutto che
 * il riquadro dello scatto B, portato su A, resti un quadrilatero sensato —
 * non ribaltato, non schiacciato a spillo. Un'omografia malata cuce due foto
 * che non c'entrano niente e lo fa senza dire nulla.
 */
export function allineamentoCredibile(
  a: Allineamento,
  larghezzaB: number,
  altezzaB: number
): boolean {
  // il numero ASSOLUTO di coppie che l'omografia spiega, non la loro
  // percentuale: con un filtro largo passano molti abbinamenti sbagliati, ed
  // è giusto così — RANSAC è fatto per buttarli. Venti punti che cadono tutti
  // al posto giusto non capitano per caso, nemmeno fra due foto a caso.
  if (a.buone.length < 20) return false;
  if (a.buone.length < a.proposte * 0.12) return false;
  if (!(a.errore < 4)) return false;
  // E DEVONO ESSERE SPARSI. Venti punti tutti in un angolo si spiegano con
  // mille omografie diverse: quella che si sceglie è giusta là e sbagliata
  // dappertutto altrove, e l'errore di riproiezione — misurato su quei venti
  // punti — resta piccolo e non lo dice.
  const cx = a.buone.reduce((s, c) => s + c.b.x, 0) / a.buone.length;
  const cy = a.buone.reduce((s, c) => s + c.b.y, 0) / a.buone.length;
  const sparsi = Math.sqrt(
    a.buone.reduce((s, c) => s + (c.b.x - cx) ** 2 + (c.b.y - cy) ** 2, 0) / a.buone.length
  );
  if (sparsi < 0.08 * Math.hypot(larghezzaB, altezzaB)) return false;
  const riquadro = [
    { x: 0, y: 0 },
    { x: larghezzaB, y: 0 },
    { x: larghezzaB, y: altezzaB },
    { x: 0, y: altezzaB }
  ];
  const angoli = riquadro.map((p) => applicaOmografia(a.H, p));
  if (angoli.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  // CONVESSO: i quattro prodotti vettoriali consecutivi hanno tutti lo stesso
  // segno. Un'omografia malata piega il riquadro a farfalla, e la foto cucita
  // si ripiega su se stessa
  let segno = 0;
  for (let i = 0; i < 4; i++) {
    const p = angoli[i];
    const q = angoli[(i + 1) % 4];
    const r = angoli[(i + 2) % 4];
    const croce = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
    const s = Math.sign(croce);
    if (s === 0) return false;
    if (segno === 0) segno = s;
    else if (s !== segno) return false;
  }
  const areaSegnata = (punti: Punto[]) =>
    punti.reduce((s, p, i) => {
      const q = punti[(i + 1) % punti.length];
      return s + (p.x * q.y - q.x * p.y);
    }, 0) / 2;
  const dopo = areaSegnata(angoli);
  const prima = areaSegnata(riquadro);
  // NON RIBALTATO: se il verso si inverte lo scatto è specchiato, e quello che
  // si sta per cucire non è la stessa scena
  if (Math.sign(dopo) !== Math.sign(prima)) return false;
  // e con un'area che non sia esplosa né sparita
  return Math.abs(dopo) > Math.abs(prima) * 0.25 && Math.abs(dopo) < Math.abs(prima) * 4;
}

// ---------------------------------------------------------------------------
// Più scatti in fila
// ---------------------------------------------------------------------------

export interface Scatto {
  larghezza: number;
  altezza: number;
}

export interface Disposizione {
  /** per ogni scatto, l'omografia che lo porta sulla tela finale */
  verso: Omografia[];
  larghezza: number;
  altezza: number;
  /** di quanto si è dovuto rimpicciolire per stare nel limite di tela */
  riduzione: number;
}

/** incatena due omografie: prima `dopo`, poi `prima` (come le matrici) */
export function componiOmografie(prima: Omografia, dopo: Omografia): Omografia {
  return prodotto(prima, dopo) as Omografia;
}

const IDENTITA: Omografia = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * DOVE FINISCE OGNI SCATTO SULLA TELA.
 *
 * `legami[i]` porta lo scatto i+1 su quello i: è quello che sa fare
 * l'allineamento, che guarda due scatti per volta. Qui si incatenano fino a
 * uno scatto di RIFERIMENTO — quello di mezzo, non il primo: la deformazione
 * cresce allontanandosi dal riferimento, e partire dal centro la dimezza.
 *
 * Poi si misura dove va a finire tutto, si trasla perché la tela cominci a
 * zero, e se il risultato è più grande del limite si riduce tutto insieme.
 */
export function disposizione(
  scatti: Scatto[],
  legami: Omografia[],
  latoMax = 8000
): Disposizione | null {
  const n = scatti.length;
  if (n === 0 || legami.length !== n - 1) return null;
  const rif = Math.floor((n - 1) / 2);

  const verso: Omografia[] = new Array(n).fill(IDENTITA);
  verso[rif] = IDENTITA;
  for (let i = rif - 1; i >= 0; i--) {
    // punto in i → i+1 con l'inversa del legame, poi da i+1 al riferimento
    const avanti = invertiOmografia(legami[i]);
    if (!avanti) return null;
    verso[i] = componiOmografie(verso[i + 1], avanti);
  }
  for (let i = rif + 1; i < n; i++) {
    verso[i] = componiOmografie(verso[i - 1], legami[i - 1]);
  }
  return telaDaVerso(scatti, verso, latoMax);
}

/**
 * LA TELA CHE TIENE TUTTI GLI SCATTI, date le loro omografie.
 *
 * Si misura dove vanno a finire i quattro angoli di ognuno, si trasla perché
 * la tela cominci da zero, e se il risultato sfora il limite si riduce tutto
 * insieme. Da qui passano sia la catena che la rete: il modo di trovare le
 * omografie cambia, il modo di posarle sulla tela no.
 */
export function telaDaVerso(
  scatti: Scatto[],
  verso: Omografia[],
  latoMax = 8000
): Disposizione | null {
  const n = scatti.length;
  if (n === 0 || verso.length !== n) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const { larghezza: w, altezza: h } = scatti[i];
    for (const p of [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h }
    ]) {
      const q = applicaOmografia(verso[i], p);
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return null;
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
  }
  const largo = maxX - minX;
  const alto = maxY - minY;
  if (!(largo > 1) || !(alto > 1)) return null;
  // una tela sterminata vuol dire che un'omografia ha mandato uno scatto
  // all'infinito: meglio fermarsi che macinare per niente
  const somma = scatti.reduce((s, x) => s + x.larghezza * x.altezza, 0);
  if (largo * alto > somma * 12) return null;

  const riduzione = Math.min(1, latoMax / Math.max(largo, alto));
  const T: Omografia = [riduzione, 0, -minX * riduzione, 0, riduzione, -minY * riduzione, 0, 0, 1];
  return {
    verso: verso.map((h) => componiOmografie(T, h)),
    larghezza: Math.round(largo * riduzione),
    altezza: Math.round(alto * riduzione),
    riduzione
  };
}

/**
 * L'ALLINEAMENTO DI UNA FILA DI SCATTI, coppia per coppia.
 *
 * Restituisce anche il punto in cui la catena si è rotta, se si è rotta: due
 * scatti che non si sovrappongono abbastanza non si legano, e dirlo — «il
 * terzo e il quarto non si agganciano» — è più utile che restituire una
 * panoramica sbagliata.
 */
export interface EsitoCatena {
  legami: Omografia[];
  allineamenti: Allineamento[];
  /** indice del primo scatto che non si è agganciato al precedente */
  rotturaA: number | null;
}


export function catenaDiScatti(
  immagini: Grigia[],
  quante = ANGOLI,
  soglia = SOGLIA_ANGOLI
): EsitoCatena {
  const legami: Omografia[] = [];
  const allineamenti: Allineamento[] = [];
  const firme = immagini.map((img) => caratteristiche(img, quante, soglia));
  for (let i = 0; i + 1 < immagini.length; i++) {
    const all = omografiaFraScatti(abbina(firme[i], firme[i + 1]));
    if (!all || !allineamentoCredibile(all, immagini[i + 1].w, immagini[i + 1].h)) {
      return { legami, allineamenti, rotturaA: i + 1 };
    }
    legami.push(all.H);
    allineamenti.push(all);
  }
  return { legami, allineamenti, rotturaA: null };
}

/* ------------------------------------------------------------------ *
 *  LA RETE DEGLI SCATTI, E L'AGGIUSTAMENTO D'INSIEME
 * ------------------------------------------------------------------ */

/** un legame trovato fra due scatti, con le coppie che lo reggono */
export interface LegameScatti {
  /** scatto di destinazione */
  a: number;
  /** scatto di origine: `H` porta i punti di b su quelli di a */
  b: number;
  H: Omografia;
  coppie: Coppia[];
  /** errore medio di riproiezione sulle coppie buone, in pixel */
  errore: number;
  /** quanta parte del fotogramma coprono le coppie buone (0..1) */
  estensione: number;
}

export interface Rete {
  legami: LegameScatti[];
  /** il primo scatto che non si aggancia a nessuno di quelli prima */
  rotturaA: number | null;
}

/**
 * TUTTI I LEGAMI CHE SI RIESCE A TROVARE, non solo quelli fra vicini.
 *
 * Incatenare gli scatti a due a due va benissimo finché sono pochi. Su una
 * fila lunga no, e il motivo non è che gli anelli siano deboli — nella prova
 * ognuno sbaglia meno di mezzo pixel — ma che una catena non ha RIDONDANZA:
 * ogni anello si fida solo del precedente, e il piccolo errore di rotazione
 * del primo fa da leva su tutti quelli dopo. Nella misura, dodici scatti in
 * fila arrivavano a 41 px di deriva all'estremità, con anelli da 0,4 px.
 *
 * La cura è dare alla fila dei controventi: se lo scatto 1 e lo scatto 3 si
 * vedono ancora un po', quel legame chiude un triangolo, e un triangolo non
 * si può deformare senza che qualcuno protesti. Per questo si prova ad
 * agganciare anche gli scatti distanti fino a `salto` posti — quando non si
 * sovrappongono abbastanza il legame semplicemente non si trova, e non costa
 * altro che il tentativo.
 *
 * Lo scatto che non si aggancia a NESSUNO di quelli prima rompe la fila: è
 * l'unico caso in cui non si può andare avanti, e va detto invece di cucire
 * a caso.
 */
/**
 * QUANTA PARTE DEL FOTOGRAMMA TENGONO le coppie di un legame.
 *
 * È la misura che conta per sapere quanto ci si può fidare di un'omografia, e
 * non va confusa con l'errore di riproiezione. Un legame fra scatti lontani ha
 * le sue coppie schiacciate in una striscia stretta: là dentro l'omografia le
 * spiega benissimo — l'errore è anzi più BASSO di quello dei legami vicini,
 * perché ha meno punti e più sparsi da accontentare — ma fuori dalla striscia
 * non la regge nessuno, e otto gradi di libertà ricavati da una fascia larga
 * un quinto di fotogramma sbandano appena si esce.
 */
export function estensioneCoppie(coppie: Coppia[], w: number, h: number): number {
  if (coppie.length < 4) return 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of coppie) {
    x0 = Math.min(x0, c.a.x);
    x1 = Math.max(x1, c.a.x);
    y0 = Math.min(y0, c.a.y);
    y1 = Math.max(y1, c.a.y);
  }
  return Math.max(0, Math.min(1, ((x1 - x0) / w) * ((y1 - y0) / h)));
}

export function reteDiScatti(
  immagini: Grigia[],
  salto = 2,
  quante = ANGOLI,
  soglia = SOGLIA_ANGOLI
): Rete {
  const legami: LegameScatti[] = [];
  const firme = immagini.map((img) => caratteristiche(img, quante, soglia));
  const prova = (i: number, j: number): LegameScatti | null => {
    const all = omografiaFraScatti(abbina(firme[i], firme[j]));
    if (!all || !allineamentoCredibile(all, immagini[j].w, immagini[j].h)) return null;
    return {
      a: i,
      b: j,
      H: all.H,
      coppie: all.buone,
      errore: all.errore,
      estensione: estensioneCoppie(all.buone, immagini[i].w, immagini[i].h)
    };
  };
  for (let j = 1; j < immagini.length; j++) {
    const vicino = prova(j - 1, j);
    if (vicino) legami.push(vicino);
    // IL CONTROVENTO SI TENTA SOLO SE PUÒ ESISTERE. Abbinare due scatti è il
    // conto più caro di tutto il cucito — ogni angolo del primo contro ogni
    // angolo del secondo — e pagarlo per un legame che non c'è raddoppia il
    // tempo per niente. Se lo scatto di prima copre già poco fotogramma vuol
    // dire che ci si è spostati parecchio, e allora quello di due posti
    // indietro non si sovrappone di sicuro: non si prova nemmeno.
    let lontano: LegameScatti | null = null;
    if (salto >= 2 && j >= 2 && (!vicino || vicino.estensione >= SOGLIA_CONTROVENTO)) {
      lontano = prova(j - 2, j);
      // e si tiene solo se ha una presa larga: un'omografia ricavata da una
      // striscia sottile ha l'errore basso e la parola lunga, ed è la
      // combinazione peggiore
      if (lontano && lontano.estensione < SOGLIA_CONTROVENTO) lontano = null;
      if (lontano) legami.push(lontano);
    }
    if (!vicino && !lontano) return { legami, rotturaA: j };
  }
  return { legami, rotturaA: null };
}

/** l'albero dei legami più saldi: il punto di partenza da cui rifinire */
function versoIniziale(n: number, legami: LegameScatti[], rif: number): Omografia[] | null {
  const verso: Omografia[] = new Array(n).fill(IDENTITA);
  const messo = new Array(n).fill(false);
  messo[rif] = true;
  verso[rif] = IDENTITA;
  // si cresce dal riferimento verso fuori, prendendo ogni volta il legame
  // che sbaglia meno: un anello buono all'inizio vale per tutti quelli dopo
  for (let passo = 1; passo < n; passo++) {
    let scelto: { legame: LegameScatti; nuovo: number } | null = null;
    for (const l of legami) {
      const versoB = messo[l.a] && !messo[l.b];
      const versoA = messo[l.b] && !messo[l.a];
      if (!versoB && !versoA) continue;
      // si sceglie il legame che copre PIÙ fotogramma, non quello con
      // l'errore più basso: è la larghezza della presa a reggere l'albero
      if (!scelto || l.estensione > scelto.legame.estensione) {
        scelto = { legame: l, nuovo: versoB ? l.b : l.a };
      }
    }
    if (!scelto) return null;
    const { legame: l, nuovo } = scelto;
    if (nuovo === l.b) {
      // H porta b su a, e a è già sulla tela
      verso[l.b] = componiOmografie(verso[l.a], l.H);
    } else {
      const indietro = invertiOmografia(l.H);
      if (!indietro) return null;
      verso[l.a] = componiOmografie(verso[l.b], indietro);
    }
    messo[nuovo] = true;
  }
  return messo.every(Boolean) ? verso : null;
}

/**
 * L'AGGIUSTAMENTO D'INSIEME: ogni scatto si rimette d'accordo con TUTTI.
 *
 * Partendo dall'albero, si gira e rigira sugli scatti: per ognuno si guarda
 * dove i suoi vicini dicono che debbano cadere i punti in comune, e si rifà
 * la sua omografia ai minimi quadrati su tutte quelle richieste insieme.
 * Chi ha un vicino solo non si muove — non ha niente da mediare — chi ne ha
 * due si mette in mezzo, e l'errore invece di accumularsi si distribuisce.
 *
 * Lo scatto di riferimento resta fermo: senza un punto fisso l'intera tela
 * potrebbe scivolare e girare a piacere senza che nessuna misura cambi, e il
 * conto non finirebbe mai.
 */
export function aggiustaVerso(
  verso: Omografia[],
  legami: LegameScatti[],
  rif: number,
  giri = 12
): Omografia[] {
  const n = verso.length;
  const vicini: LegameScatti[][] = Array.from({ length: n }, () => []);
  for (const l of legami) {
    vicini[l.a].push(l);
    vicini[l.b].push(l);
  }
  const corrente = verso.map((h) => [...h] as Omografia);
  for (let giro = 0; giro < giri; giro++) {
    let mosso = 0;
    // si alterna il senso della passata: partendo sempre dallo stesso capo
    // l'informazione viaggerebbe solo in una direzione
    const ordine = Array.from({ length: n }, (_, i) => (giro % 2 ? n - 1 - i : i));
    for (const i of ordine) {
      if (i === rif || vicini[i].length < 2) continue;
      const sorgente: Punto[] = [];
      const bersaglio: Punto[] = [];
      const pesi: number[] = [];
      for (const l of vicini[i]) {
        const altro = l.a === i ? l.b : l.a;
        // …e pesa per quanto fotogramma tiene, non per l'errore che dichiara
        const peso = l.estensione / (0.5 + l.errore);
        for (const c of l.coppie) {
          const mio = l.a === i ? c.a : c.b;
          const suo = l.a === i ? c.b : c.a;
          const dove = applicaOmografia(corrente[altro], suo);
          if (!Number.isFinite(dove.x) || !Number.isFinite(dove.y)) continue;
          sorgente.push(mio);
          bersaglio.push(dove);
          pesi.push(peso);
        }
      }
      if (sorgente.length < 8) continue;
      const nuova = omografiaAiMinimiQuadrati(sorgente, bersaglio, pesi);
      if (!nuova) continue;
      if (nuova.some((v) => !Number.isFinite(v))) continue;
      corrente[i] = nuova;
      mosso++;
    }
    if (mosso === 0) break;
  }
  return corrente;
}

/**
 * DOVE FINISCE OGNI SCATTO, partendo dalla rete invece che dalla catena.
 *
 * Stessa tela di `disposizione` — stesso riquadro, stessa riduzione — ma le
 * omografie vengono dall'albero rifinito su tutti i legami.
 */
export function versoDallaRete(n: number, rete: Rete): Omografia[] | null {
  if (n === 0 || rete.rotturaA !== null) return null;
  const rif = Math.floor((n - 1) / 2);
  const primo = versoIniziale(n, rete.legami, rif);
  if (!primo) return null;
  return aggiustaVerso(primo, rete.legami, rif);
}

export function disposizioneDallaRete(
  scatti: Scatto[],
  rete: Rete,
  latoMax = 8000
): Disposizione | null {
  const verso = versoDallaRete(scatti.length, rete);
  if (!verso) return null;
  return telaDaVerso(scatti, verso, latoMax);
}
