/**
 * IL PIANO PROSPETTICO RICAVATO DALLE FORME GIÀ QUOTATE.
 *
 * Ogni quadrilatero quotato sulla foto È un riferimento: quattro angoli
 * puntati a mano e le misure vere prese sul posto. Finora ne serviva uno solo,
 * scelto apposta, e la precisione del piano era quella di quell'unico
 * riquadro: piccolo o storto, sbagliava dappertutto.
 *
 * Qui si usano TUTTE le forme quotate insieme. Una forma di misure note,
 * appoggiata sul piano, non dice dove sta né come è girata — quello si scopre
 * strada facendo — ma dice esattamente quanto è grande, e questo basta a
 * legare fra loro punti lontani dell'immagine. Il conto è un'alternanza:
 *
 *   1. con l'omografia corrente si guarda dove cade ogni forma sul piano;
 *   2. sopra quei punti si appoggia la sagoma vera, senza stirarla — solo
 *      ruotata e spostata (Procuste rigido): è la posa della forma sul muro;
 *   3. si rifà l'omografia ai minimi quadrati su TUTTI gli angoli insieme;
 *   4. si ricomincia, finché smette di migliorare.
 *
 * La prima forma resta ferma dov'è: fissa l'origine e il verso del piano, che
 * altrimenti scivolerebbero a ogni giro senza cambiare una sola misura.
 *
 * Non si inventa niente: le misure sono quelle scritte a mano nel sopralluogo
 * — i valori calcolati dalla calibrazione sono esclusi, o il piano si darebbe
 * ragione da solo.
 */

import type { Annotazione, PianoProspettiva, Punto, Unita } from '../db/types';
import { segmentiPoligono } from '../db/types';
import { formaQuadrilatera } from './formaQuadrilatera';
import {
  applicaOmografia,
  calcolaOmografia,
  invertiOmografia,
  omografiaAiMinimiQuadrati,
  omografiaPiano,
  type Omografia
} from './omografia';
import { inMillimetri } from '../utils/format';

/** una forma quotata usata come riferimento del piano */
export interface RiferimentoPiano {
  id: string;
  /** i quattro angoli sulla foto (alto-sx, alto-dx, basso-dx, basso-sx) */
  immagine: Punto[];
  /** la sagoma vera in millimetri, negli stessi quattro angoli */
  reale: Punto[];
  /** perimetro sulla foto in pixel: un riferimento grande è puntato meglio */
  peso: number;
}

/** quanto sbaglia un piano su una forma: differenza sui suoi lati, in mm */
export interface ScartoRiferimento {
  id: string;
  /** media degli scarti sui quattro lati (mm) */
  medio: number;
  /** il lato peggiore (mm) */
  massimo: number;
}

export interface EsitoPiano {
  /** foto → piano, in millimetri */
  H: Omografia;
  riferimenti: RiferimentoPiano[];
  /** scarto medio su tutte le forme (mm) */
  erroreMedio: number;
  /** la forma che il piano sbaglia di più */
  peggiore: ScartoRiferimento | null;
}

/**
 * LE FORME UTILIZZABILI COME RIFERIMENTO.
 *
 * Serve un quadrilatero con le misure scritte a mano: il rettangolo quotato,
 * la finestra sotto falda, l'elemento fuori squadro. Restano fuori le forme
 * senza misure, le copie solo-etichetta e — soprattutto — tutto ciò che la
 * calibrazione ha già calcolato da sé.
 */
export function riferimentiPiano(annotazioni: Annotazione[]): RiferimentoPiano[] {
  const rif: RiferimentoPiano[] = [];
  for (const a of annotazioni) {
    if (a.tipo !== 'quotaPoligono' && a.tipo !== 'quotaRett') continue;
    if (misureCalcolate(a)) continue;
    const forma = formaQuadrilatera(a);
    if (!forma) continue;
    const u = forma.unita;
    const reale = forma.verticiNetti.map((p) => ({
      x: inMillimetri(p.x, u),
      y: inMillimetri(p.y, u)
    }));
    // una forma sbilenca o sfilata non è un riferimento: darebbe un piano peggio
    const lati = forma.quad.map((p, i) => {
      const q = forma.quad[(i + 1) % 4];
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    const peso = lati.reduce((s, v) => s + v, 0);
    if (!(peso > 0) || lati.some((v) => v < 8)) continue;
    if (reale.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    rif.push({ id: a.id, immagine: forma.quad.map((p) => ({ ...p })), reale, peso });
  }
  return rif;
}

/**
 * true se le misure della forma le ha scritte la calibrazione, non l'uomo.
 *
 * Una forma quotata dal piano non può poi correggere il piano: si darebbe
 * ragione da sola. Nel regime misto delle piante — quote a mano e quote
 * calcolate insieme — vale solo se OGNI lato quotato è stato messo a mano e
 * non è una quota «di riferimento», che segue la geometria.
 */
function misureCalcolate(a: Annotazione): boolean {
  if (a.tipo === 'quotaRett') return a.valoreAuto === true;
  if (a.tipo !== 'quotaPoligono') return false;
  if (a.soloEtichetta) return true;
  if (a.valoreAuto !== true) return false;
  return segmentiPoligono(a).some((s) => s.valore !== null && !(s.manuale && !s.riferimento));
}

/**
 * LO SCARTO DI UN PIANO su una forma: quanto sbaglia sui suoi lati.
 *
 * È la verifica che si può mostrare in chiaro — «questo lato lo hai misurato
 * 1000 e il piano ne legge 1004» — e non dipende da dove il piano ha messo
 * l'origine: guarda solo le lunghezze, che sono quelle che si tagliano.
 */
export function scartoDelPiano(H: Omografia, r: RiferimentoPiano): ScartoRiferimento {
  let somma = 0;
  let massimo = 0;
  for (let i = 0; i < 4; i++) {
    const a = applicaOmografia(H, r.immagine[i]);
    const b = applicaOmografia(H, r.immagine[(i + 1) % 4]);
    const letto = Math.hypot(b.x - a.x, b.y - a.y);
    const vero = Math.hypot(
      r.reale[(i + 1) % 4].x - r.reale[i].x,
      r.reale[(i + 1) % 4].y - r.reale[i].y
    );
    const scarto = Math.abs(letto - vero);
    somma += scarto;
    massimo = Math.max(massimo, scarto);
  }
  return { id: r.id, medio: somma / 4, massimo };
}

/** lo scarto medio di un piano su tutte le forme, e la peggiore */
export function verificaPiano(
  H: Omografia,
  rif: RiferimentoPiano[]
): { medio: number; peggiore: ScartoRiferimento | null } {
  if (rif.length === 0) return { medio: 0, peggiore: null };
  const scarti = rif.map((r) => scartoDelPiano(H, r));
  const medio = scarti.reduce((s, v) => s + v.medio, 0) / scarti.length;
  const peggiore = scarti.reduce((a, b) => (b.medio > a.medio ? b : a));
  return { medio, peggiore };
}

/** la posa di una sagoma sul piano: ruotata e spostata, mai stirata */
function posaRigida(sagoma: Punto[], osservati: Punto[]): Punto[] {
  const n = sagoma.length;
  const media = (p: Punto[]) => ({
    x: p.reduce((s, q) => s + q.x, 0) / n,
    y: p.reduce((s, q) => s + q.y, 0) / n
  });
  const cs = media(sagoma);
  const co = media(osservati);
  let sin = 0;
  let cos = 0;
  for (let i = 0; i < n; i++) {
    const a = { x: sagoma[i].x - cs.x, y: sagoma[i].y - cs.y };
    const b = { x: osservati[i].x - co.x, y: osservati[i].y - co.y };
    sin += a.x * b.y - a.y * b.x;
    cos += a.x * b.x + a.y * b.y;
  }
  const ang = Math.atan2(sin, cos);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return sagoma.map((p) => {
    const x = p.x - cs.x;
    const y = p.y - cs.y;
    return { x: co.x + x * c - y * s, y: co.y + x * s + y * c };
  });
}

/**
 * IL PIANO CHE METTE D'ACCORDO TUTTE LE FORME.
 *
 * Con una forma sola il risultato è esatto e non c'è niente da mediare: è la
 * calibrazione di sempre, presa dalla forma invece che da un riquadro
 * disegnato apposta. Con due o più comincia il lavoro vero.
 */
export function adattaPiano(riferimenti: RiferimentoPiano[]): EsitoPiano | null {
  const rif = [...riferimenti].sort((a, b) => b.peso - a.peso);
  if (rif.length === 0) return null;

  let H: Omografia;
  try {
    H = calcolaOmografia(rif[0].immagine, rif[0].reale);
  } catch {
    return null;
  }
  if (rif.length === 1) {
    const v = verificaPiano(H, rif);
    return { H, riferimenti: rif, erroreMedio: v.medio, peggiore: v.peggiore };
  }

  // la prima forma resta ferma: è lei a fissare origine e verso del piano
  let pose: Punto[][] = rif.map((r) => r.reale);
  let migliore = { H, errore: verificaPiano(H, rif).medio };
  for (let giro = 0; giro < 24; giro++) {
    pose = rif.map((r, i) => {
      if (i === 0) return r.reale;
      const osservati = r.immagine.map((p) => applicaOmografia(H, p));
      return posaRigida(r.reale, osservati);
    });
    const immagine: Punto[] = [];
    const piano: Punto[] = [];
    const pesi: number[] = [];
    rif.forEach((r, i) => {
      for (let k = 0; k < 4; k++) {
        immagine.push(r.immagine[k]);
        piano.push(pose[i][k]);
        pesi.push(r.peso);
      }
    });
    const nuova = omografiaAiMinimiQuadrati(immagine, piano, pesi);
    if (!nuova) break;
    H = nuova;
    const errore = verificaPiano(H, rif).medio;
    // si tiene il migliore: l'alternanza scende quasi sempre, ma se un giro
    // peggiora non si porta a casa un piano peggiore di quello che si aveva
    if (errore < migliore.errore - 1e-9) {
      migliore = { H, errore };
    } else {
      break;
    }
  }

  const v = verificaPiano(migliore.H, rif);
  return { H: migliore.H, riferimenti: rif, erroreMedio: v.medio, peggiore: v.peggiore };
}

/**
 * L'OMOGRAFIA SCRITTA COME PIANO DI RIFERIMENTO.
 *
 * Il piano salvato sulla foto è sempre quattro angoli più due misure reali:
 * qualunque omografia si può dire così. Si prende un rettangolo sul piano che
 * copre le forme quotate (con un po' di margine attorno, per avere la griglia
 * di verifica anche fuori) e lo si riporta sull'immagine.
 *
 * Se il rettangolo, riportato indietro, cade oltre l'orizzonte — succede sulle
 * foto molto inclinate — si stringe finché torna un quadrilatero sano.
 */
export function pianoDaOmografia(
  H: Omografia,
  riferimenti: RiferimentoPiano[],
  celle = 4
): PianoProspettiva | null {
  const Hinv = invertiOmografia(H);
  if (!Hinv) return null;
  const punti = riferimenti.flatMap((r) => r.immagine.map((p) => applicaOmografia(H, p)));
  if (punti.length === 0) return null;
  const minX = Math.min(...punti.map((p) => p.x));
  const maxX = Math.max(...punti.map((p) => p.x));
  const minY = Math.min(...punti.map((p) => p.y));
  const maxY = Math.max(...punti.map((p) => p.y));
  const L0 = Math.max(1, maxX - minX);
  const A0 = Math.max(1, maxY - minY);

  for (const margine of [0.25, 0.1, 0]) {
    const L = L0 * (1 + 2 * margine);
    const A = A0 * (1 + 2 * margine);
    const x0 = minX - L0 * margine;
    const y0 = minY - A0 * margine;
    const angoli = [
      { x: x0, y: y0 },
      { x: x0 + L, y: y0 },
      { x: x0 + L, y: y0 + A },
      { x: x0, y: y0 + A }
    ].map((q) => {
      const w = Hinv[6] * q.x + Hinv[7] * q.y + Hinv[8];
      if (!(Math.abs(w) > 1e-9)) return null;
      return {
        x: (Hinv[0] * q.x + Hinv[1] * q.y + Hinv[2]) / w,
        y: (Hinv[3] * q.x + Hinv[4] * q.y + Hinv[5]) / w
      };
    });
    if (angoli.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    const piano: PianoProspettiva = {
      punti: angoli as [Punto, Punto, Punto, Punto],
      larghezzaReale: L,
      altezzaReale: A,
      unita: 'mm' as Unita,
      celle
    };
    // prova del nove: il piano scritto così deve rileggere le stesse misure
    try {
      const riletta = omografiaPiano(piano);
      const uguali = riferimenti.every((r) => {
        const a = scartoDelPiano(H, r);
        const b = scartoDelPiano(riletta, r);
        return Math.abs(a.medio - b.medio) < 0.5 && Math.abs(a.massimo - b.massimo) < 0.5;
      });
      if (uguali) return piano;
    } catch {
      // quattro angoli degeneri: si prova con un rettangolo più stretto
    }
  }
  return null;
}
