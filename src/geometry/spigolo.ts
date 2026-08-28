/**
 * LO SPIGOLO FRA DUE PIANI.
 *
 * Due pareti inquadrate nella stessa foto si incontrano in una retta — lo
 * spigolo del box, l'angolo della stanza — e quella retta si può ricavare
 * dalle due prospettive, senza sapere niente della macchina fotografica.
 *
 * IL RAGIONAMENTO. Un punto dello spigolo appartiene a tutte e due le pareti:
 * misurato con l'una o con l'altra dà lo stesso risultato. Lungo una retta
 * qualunque della foto, invece, i due piani leggono lunghezze diverse. Quindi
 * lo spigolo è LA retta dove le due misure coincidono, e si trova in due
 * mosse:
 *
 * 1. IL PUNTO DI FUGA. Prendendo due punti su una retta, il rapporto fra la
 *    misura del primo piano e quella del secondo dipende, in generale, da
 *    dove si prendono. Resta costante — e allora la retta è candidata — solo
 *    se la retta passa per il punto in cui si incontrano i due ORIZZONTI dei
 *    piani (la riga `w = 0` di ciascuna omografia). Quel punto è la fuga
 *    della direzione dello spigolo, e lo spigolo passa di lì.
 * 2. IL RAPPORTO UNO. Fra tutte le rette di quel fascio, lo spigolo è quella
 *    dove il rapporto vale esattamente uno: le due pareti misurano uguale.
 *    Si scandisce il fascio, si cercano i cambi di segno e si affina per
 *    bisezione.
 *
 * Fra i candidati si tiene quello che passa DAVVERO in mezzo alle due pareti
 * — le forme dell'una da un lato, quelle dell'altra dall'altro — che è anche
 * il modo per non farsi ingannare da una soluzione degenere.
 *
 * Serve a due cose: vedere lo spigolo disegnato sulla foto, e sapere da che
 * parte sta un punto, perché una misura presa oltre lo spigolo appartiene
 * all'altra parete anche se le forme quotate sono più vicine di qua.
 */

import type { PianoProspettiva, Punto, Unita } from '../db/types';
import { applicaOmografia, omografiaPiano, type Omografia } from './omografia';
import { inMillimetri } from '../utils/format';

export interface Spigolo {
  /** i due estremi del segmento, tagliato al riquadro dell'immagine */
  p1: Punto;
  p2: Punto;
  /** la retta in forma implicita a·x + b·y + c = 0 (a,b normalizzati) */
  retta: { a: number; b: number; c: number };
  /**
   * Il segno che la retta assume dalla parte del PRIMO piano: serve a dire, di
   * un punto qualunque, a quale delle due pareti appartiene.
   */
  segnoPrimo: 1 | -1;
}

/** da che parte della retta sta un punto: +1, -1 (0 = sopra la retta) */
export function latoDelloSpigolo(s: Spigolo, p: Punto): number {
  const v = s.retta.a * p.x + s.retta.b * p.y + s.retta.c;
  return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : -1;
}

/** l'omografia del piano riportata in MILLIMETRI: i due piani vanno confrontati */
function omografiaMm(piano: PianoProspettiva): Omografia | null {
  try {
    return omografiaPiano({
      ...piano,
      larghezzaReale: inMillimetri(piano.larghezzaReale, piano.unita),
      altezzaReale: inMillimetri(piano.altezzaReale, piano.unita),
      unita: 'mm' as Unita
    });
  } catch {
    return null;
  }
}

/** il segmento di una retta dentro il riquadro dell'immagine, o null */
function tagliaAlRiquadro(
  retta: { a: number; b: number; c: number },
  larghezza: number,
  altezza: number
): [Punto, Punto] | null {
  const { a, b, c } = retta;
  const dentro = (p: Punto) =>
    p.x >= -1e-6 && p.x <= larghezza + 1e-6 && p.y >= -1e-6 && p.y <= altezza + 1e-6;
  const punti: Punto[] = [];
  if (Math.abs(b) > 1e-12) {
    for (const x of [0, larghezza]) {
      const p = { x, y: -(a * x + c) / b };
      if (dentro(p)) punti.push(p);
    }
  }
  if (Math.abs(a) > 1e-12) {
    for (const y of [0, altezza]) {
      const p = { x: -(b * y + c) / a, y };
      if (dentro(p)) punti.push(p);
    }
  }
  if (punti.length < 2) return null;
  // i due più lontani fra loro: gli altri sono lo stesso vertice ripetuto
  let migliore: [Punto, Punto] | null = null;
  let massima = 0;
  for (let i = 0; i < punti.length; i++) {
    for (let j = i + 1; j < punti.length; j++) {
      const d = Math.hypot(punti[i].x - punti[j].x, punti[i].y - punti[j].y);
      if (d > massima) {
        massima = d;
        migliore = [punti[i], punti[j]];
      }
    }
  }
  return massima > 1 ? migliore : null;
}


/**
 * QUANTO DUE PIANI SONO IN DISACCORDO SU UNA RETTA.
 *
 * Si prendono cinque punti lungo il pezzo di retta che sta dentro la foto e
 * si confrontano, tratto per tratto, le lunghezze che leggono i due piani.
 * Sullo spigolo coincidono tutte — è la stessa riga di muro, misurata due
 * volte — e il disaccordo è zero. Altrove no, e per due motivi: le due misure
 * sono diverse, e per giunta il loro rapporto CAMBIA lungo la retta. Il conto
 * li vede tutti e due.
 *
 * Si misura solo dentro l'immagine, dove le prospettive sono state ricavate e
 * valgono qualcosa: puntare all'orizzonte — che su una parete quasi frontale
 * cade a centomila pixel — vorrebbe dire moltiplicare per mille l'errore di
 * un dito. `null` se la retta non attraversa abbastanza foto, o se sfiora un
 * orizzonte, dove le misure schizzano.
 */
function disaccordoSuRetta(
  HA: Omografia,
  HB: Omografia,
  retta: { a: number; b: number; c: number },
  larghezza: number,
  altezza: number
): number | null {
  const seg = tagliaAlRiquadro(retta, larghezza, altezza);
  if (!seg) return null;
  const lungo = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
  // una retta che taglia appena un angolo della foto non dice niente
  if (lungo < 0.25 * Math.hypot(larghezza, altezza)) return null;

  const CAMPIONI = 5;
  const punti: Punto[] = [];
  for (let i = 0; i < CAMPIONI; i++) {
    const t = 0.1 + (0.8 * i) / (CAMPIONI - 1);
    punti.push({
      x: seg[0].x + (seg[1].x - seg[0].x) * t,
      y: seg[0].y + (seg[1].y - seg[0].y) * t
    });
  }
  for (const H of [HA, HB]) {
    for (const r of punti) {
      const w = H[6] * r.x + H[7] * r.y + H[8];
      if (Math.abs(w) < 1e-6) return null; // sull'orizzonte: misura senza senso
    }
  }
  const dist = (H: Omografia, p: Punto, q: Punto) => {
    const a = applicaOmografia(H, p);
    const b = applicaOmografia(H, q);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  let somma = 0;
  for (let i = 0; i < punti.length - 1; i++) {
    const dA = dist(HA, punti[i], punti[i + 1]);
    const dB = dist(HB, punti[i], punti[i + 1]);
    if (!(dA > 1e-9) || !(dB > 1e-9) || !Number.isFinite(dA) || !Number.isFinite(dB)) return null;
    const scarto = Math.log(dA / dB);
    somma += scarto * scarto;
  }
  return somma / (punti.length - 1);
}

/**
 * LO SPIGOLO fra due piani della stessa foto, o null se non c'è.
 *
 * Si cerca la retta che mette d'accordo le due prospettive, e la si cerca
 * dove le prospettive valgono: dentro l'immagine. Prima una scansione grossa
 * su tutte le rette che la attraversano — direzione e scostamento dal centro
 * — poi si affina attorno alla migliore, dimezzando il passo finché non si
 * guadagna più niente.
 *
 * `ancoreA`/`ancoreB` sono i punti dove stanno le forme dei due piani: lo
 * spigolo deve passare IN MEZZO, e questo scarta le soluzioni fuori posto.
 * Alla fine si controlla che il disaccordo sia davvero sceso a zero: due
 * pareti parallele — che spigolo non ne fanno — darebbero comunque un minimo,
 * ma un minimo che non arriva mai a zero.
 */
export function spigoloFraPiani(
  A: PianoProspettiva,
  B: PianoProspettiva,
  larghezza: number,
  altezza: number,
  ancoreA?: Punto[],
  ancoreB?: Punto[]
): Spigolo | null {
  const HA = omografiaMm(A);
  const HB = omografiaMm(B);
  if (!HA || !HB || !(larghezza > 0) || !(altezza > 0)) return null;

  const centro = { x: larghezza / 2, y: altezza / 2 };
  const diagonale = Math.hypot(larghezza, altezza);

  /** la retta con direzione `t` (radianti) e scostamento `d` dal centro */
  const retta = (t: number, d: number) => {
    const a = Math.cos(t);
    const b = Math.sin(t);
    // normale (a,b), passante a distanza d dal centro dell'immagine
    return { a, b, c: -(a * centro.x + b * centro.y) - d };
  };
  const costo = (t: number, d: number) =>
    disaccordoSuRetta(HA, HB, retta(t, d), larghezza, altezza);

  const media = (punti?: Punto[]) =>
    punti && punti.length > 0
      ? {
          x: punti.reduce((s, p) => s + p.x, 0) / punti.length,
          y: punti.reduce((s, p) => s + p.y, 0) / punti.length
        }
      : null;
  const cA = media(ancoreA);
  const cB = media(ancoreB);
  /** la retta passa fra le due pareti? senza ancore non si può dire, e va bene */
  const inMezzo = (t: number, d: number) => {
    if (!cA || !cB) return true;
    const r = retta(t, d);
    const vA = r.a * cA.x + r.b * cA.y + r.c;
    const vB = r.a * cB.x + r.b * cB.y + r.c;
    return vA * vB < 0;
  };

  // DUE PIANI UGUALI non fanno spigolo: se vanno d'accordo su rette molto
  // diverse fra loro, non c'è nessuna riga in cui «si incontrano» — sono la
  // stessa parete, e ogni retta andrebbe bene
  const prove = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]
    .map((t) => costo(t, 0))
    .filter((v): v is number => v !== null);
  if (prove.length >= 3 && prove.every((v) => v < 1e-6)) return null;

  // 1. scansione grossa: 1° di direzione, un centesimo di diagonale di scostamento
  const PASSI_T = 180;
  const PASSI_D = 240;
  let miglioreT = 0;
  let miglioreD = 0;
  let migliore = Infinity;
  for (let i = 0; i < PASSI_T; i++) {
    const t = (i / PASSI_T) * Math.PI;
    for (let k = 0; k <= PASSI_D; k++) {
      const d = (k / PASSI_D - 0.5) * diagonale;
      if (!inMezzo(t, d)) continue;
      const c = costo(t, d);
      if (c !== null && c < migliore) {
        migliore = c;
        miglioreT = t;
        miglioreD = d;
      }
    }
  }
  if (!Number.isFinite(migliore)) return null;

  // 2. affinamento locale: si dimezza il passo finché non si guadagna più
  let passoT = Math.PI / PASSI_T;
  let passoD = diagonale / PASSI_D;
  for (let giro = 0; giro < 40; giro++) {
    let mosso = false;
    for (const [dt, dd] of [
      [passoT, 0],
      [-passoT, 0],
      [0, passoD],
      [0, -passoD],
      [passoT, passoD],
      [passoT, -passoD],
      [-passoT, passoD],
      [-passoT, -passoD]
    ]) {
      const t = miglioreT + dt;
      const d = miglioreD + dd;
      if (!inMezzo(t, d)) continue;
      const c = costo(t, d);
      if (c !== null && c < migliore) {
        migliore = c;
        miglioreT = t;
        miglioreD = d;
        mosso = true;
      }
    }
    if (!mosso) {
      passoT /= 2;
      passoD /= 2;
      if (passoD < 1e-4) break;
    }
  }

  // 3. LO SPIGOLO C'È DAVVERO? Due pareti parallele non si incontrano, e il
  // minimo resta lontano da zero: sotto questa soglia il disaccordo vale
  // meno di un millimetro sul metro, cioè è rumore
  if (!(migliore < 1e-6)) return null;

  const r = retta(miglioreT, miglioreD);
  const seg = tagliaAlRiquadro(r, larghezza, altezza);
  if (!seg) return null;
  const valore = (p: Punto) => r.a * p.x + r.b * p.y + r.c;
  return {
    p1: seg[0],
    p2: seg[1],
    retta: r,
    segnoPrimo: cA && valore(cA) < 0 ? -1 : 1
  };
}

/**
 * TUTTI GLI SPIGOLI di una foto: uno per ogni coppia di pareti che si
 * incontrano. Con due piani è uno solo; con tre — il fronte, il fianco e il
 * soffitto — sono fino a tre.
 *
 * Il conto è pesante abbastanza da non volerlo rifare a ogni ridisegno, e le
 * pareti cambiano solo quando si ricalibra: si tiene quindi in memoria
 * l'ultimo risultato, con la firma dei piani da cui è nato.
 */
export interface SpigoloFraDue {
  /** indici dei due piani nell'elenco ricevuto */
  a: number;
  b: number;
  spigolo: Spigolo;
  /**
   * SEPARA DAVVERO le due pareti?
   *
   * Su un angolo di fabbricato sì: le forme dell'una stanno tutte di qua e
   * quelle dell'altra tutte di là. Su un incrocio a T no — il tramezzo tocca
   * il muro nel mezzo, e il muro CONTINUA dall'altra parte della riga. Lì lo
   * spigolo si vede (è un angolo vero) ma non è un confine: tagliarci il
   * riquadro, o agganciarcelo, vorrebbe dire buttare via mezza parete.
   */
  separante: boolean;
}

let memoria: { firma: string; spigoli: SpigoloFraDue[] } | null = null;

/**
 * Lo spigolo lascia le forme dell'una parete tutte da un lato e quelle
 * dell'altra tutte dall'altro? Solo allora è un confine.
 */
function separa(s: Spigolo, A: PianoProspettiva, B: PianoProspettiva): boolean {
  const ancoreA = A.ancore ?? [];
  const ancoreB = B.ancore ?? [];
  if (ancoreA.length === 0 || ancoreB.length === 0) return true; // non si può dire
  const tutte = (punti: Punto[], verso: number) =>
    punti.every((p) => latoDelloSpigolo(s, p) * verso >= 0);
  return tutte(ancoreA, s.segnoPrimo) && tutte(ancoreB, -s.segnoPrimo);
}

/** il baricentro delle forme di un piano, o del suo riquadro se non le ha */
function dovePosa(piano: PianoProspettiva): Punto {
  const punti = piano.ancore?.length ? piano.ancore : piano.punti;
  return {
    x: punti.reduce((s, p) => s + p.x, 0) / punti.length,
    y: punti.reduce((s, p) => s + p.y, 0) / punti.length
  };
}

/**
 * DUE PARETI SONO CONTIGUE, o c'è un altro muro in mezzo?
 *
 * Due piani non paralleli si incontrano SEMPRE in una retta, anche il primo e
 * l'ultimo muro di una facciata a zig-zag: quella retta esiste in geometria ma
 * non è uno spigolo che si vede, e disegnarla sarebbe una riga in mezzo alla
 * foto che non corrisponde a niente. Si guarda quindi se fra le forme dell'una
 * e quelle dell'altra ne cade in mezzo un'altra parete: allora non si toccano,
 * e il loro incrocio non si disegna.
 */
function contigue(A: PianoProspettiva, B: PianoProspettiva, altri: PianoProspettiva[]): boolean {
  const a = dovePosa(A);
  const b = dovePosa(B);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lung = Math.hypot(dx, dy);
  if (!(lung > 1e-6)) return true;
  for (const C of altri) {
    const c = dovePosa(C);
    // dove cade C lungo il segmento fra le due pareti, e quanto se ne discosta
    const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (lung * lung);
    if (t <= 0.08 || t >= 0.92) continue; // sta al di là di una delle due
    const fuori = Math.abs((c.x - a.x) * dy - (c.y - a.y) * dx) / lung;
    if (fuori < 0.4 * lung) return false; // c'è un muro in mezzo
  }
  return true;
}

export function spigoliDellaFoto(
  piani: PianoProspettiva[],
  larghezza: number,
  altezza: number
): SpigoloFraDue[] {
  if (piani.length < 2) return [];
  const firma = JSON.stringify([larghezza, altezza, piani]);
  if (memoria && memoria.firma === firma) return memoria.spigoli;
  const spigoli: SpigoloFraDue[] = [];
  for (let i = 0; i < piani.length; i++) {
    for (let j = i + 1; j < piani.length; j++) {
      // solo le pareti che si toccano davvero: l'incrocio del primo muro con
      // l'ultimo di una facciata a svolte non è uno spigolo che si vede
      if (!contigue(piani[i], piani[j], piani.filter((_, k) => k !== i && k !== j))) continue;
      const s = spigoloFraPiani(
        piani[i],
        piani[j],
        larghezza,
        altezza,
        piani[i].ancore,
        piani[j].ancore
      );
      if (s) spigoli.push({ a: i, b: j, spigolo: s, separante: separa(s, piani[i], piani[j]) });
    }
  }
  memoria = { firma, spigoli };
  return spigoli;
}

/** una retta orientata: si tiene quello che sta dove il valore è ≥ 0 */
export type Vincolo = { a: number; b: number; c: number };

/**
 * I CONFINI DI UNA PARETE: gli spigoli che la riguardano, orientati verso
 * casa sua.
 *
 * Servono a non disegnare due pareti una sopra l'altra. Il riquadro di un
 * piano è grande quanto serve a coprire le sue forme, e oltre lo spigolo
 * continua su un muro che non è il suo: là la sua griglia non vuol dire
 * niente, e va tagliata.
 */
export function vincoliDelPiano(spigoli: SpigoloFraDue[], indice: number): Vincolo[] {
  const vincoli: Vincolo[] = [];
  for (const s of spigoli) {
    if (s.a !== indice && s.b !== indice) continue;
    // un incrocio a T non taglia niente: la parete continua di là
    if (!s.separante) continue;
    // il segno che la retta assume dalla parte di questo piano
    const verso = s.a === indice ? s.spigolo.segnoPrimo : -s.spigolo.segnoPrimo;
    vincoli.push({
      a: s.spigolo.retta.a * verso,
      b: s.spigolo.retta.b * verso,
      c: s.spigolo.retta.c * verso
    });
  }
  return vincoli;
}

const valoreVincolo = (v: Vincolo, p: Punto) => v.a * p.x + v.b * p.y + v.c;

/** il pezzo di poligono che sta dalla parte buona di tutti i vincoli */
export function ritagliaPoligono(poligono: Punto[], vincoli: Vincolo[]): Punto[] {
  let dentro = poligono.map((p) => ({ ...p }));
  for (const v of vincoli) {
    if (dentro.length === 0) return [];
    const fuori: Punto[] = [];
    for (let i = 0; i < dentro.length; i++) {
      const p1 = dentro[i];
      const p2 = dentro[(i + 1) % dentro.length];
      const d1 = valoreVincolo(v, p1);
      const d2 = valoreVincolo(v, p2);
      if (d1 >= 0) fuori.push(p1);
      if (d1 >= 0 !== d2 >= 0) {
        const t = d1 / (d1 - d2);
        fuori.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
      }
    }
    dentro = fuori;
  }
  return dentro;
}

/** il pezzo di segmento che sta dalla parte buona di tutti i vincoli */
export function ritagliaSegmento(
  a: Punto,
  b: Punto,
  vincoli: Vincolo[]
): [Punto, Punto] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const v of vincoli) {
    const den = v.a * dx + v.b * dy;
    const val = valoreVincolo(v, a);
    if (Math.abs(den) < 1e-12) {
      if (val < 0) return null; // tutto il segmento sta dalla parte sbagliata
      continue;
    }
    const t = -val / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 }
  ];
}
