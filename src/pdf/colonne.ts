/**
 * IL ROTOLO CHE VA A CAPO.
 *
 * Un segmento di bobina può essere lungo venti metri e largo uno: disegnato
 * intero su un A4 diventa un filo verticale alto venti centimetri e largo
 * uno, dove i pezzi sono striscioline e i nomi non si leggono. Al banco quel
 * foglio non serve a niente.
 *
 * Qui il rotolo si spezza in COLONNE affiancate sulla stessa pagina, come il
 * testo di un giornale: la prima colonna è il primo tratto, la seconda
 * riprende da dove finisce la prima. Tre colonne su un rotolo lungo triplicano
 * la scala del disegno, ed è la differenza fra leggere i nomi e indovinarli.
 *
 * DUE COSE VANNO FATTE BENE, se no il rimedio confonde più del male:
 *
 * 1. Si taglia DOVE NON PASSA NESSUN PEZZO, quando si può. Una colonna che
 *    comincia con mezzo pezzo si legge male, e un pezzo spezzato si conta due
 *    volte. Il punto ideale si sposta fino al primo posto libero vicino.
 *
 * 2. Quando un pezzo va tagliato per forza, la sua parte si disegna in tutte
 *    e due le colonne — altrimenti sparirebbe materiale dal disegno — ma il
 *    NOME si scrive una volta sola, nella colonna dove sta il suo centro.
 *    Due etichette uguali in due colonne vorrebbero dire due pezzi.
 */

import { fasciaDiPoligono, type PuntoSagoma } from '../geometry/sagome';
import type { LastraNesting, Piazzamento } from '../geometry/nesting';

const E = 1e-6;

export interface Colonna {
  /** il tratto di lastra, in mm dall'inizio del foglio */
  da: number;
  a: number;
  /** i pezzi del tratto, con la y riferita all'inizio della colonna */
  lastra: LastraNesting;
  /** le chiavi dei pezzi da ETICHETTARE qui: il nome si scrive una volta sola */
  etichettate: Set<string>;
}

/**
 * Quante colonne convengono.
 *
 * Si sceglie la divisione che fa il disegno PIÙ GRANDE: più colonne vuol dire
 * colonne più strette (peggio) ma tratti più corti (meglio), e l'optimum sta
 * dove le due cose si incrociano. Invece di indovinarlo si provano tutte le
 * divisioni fino a sei e si tiene quella con la scala maggiore.
 */
export function colonneConsigliate(
  misure: { larghezza: number; altezza: number },
  area: { larghezza: number; altezza: number },
  vuoto: number,
  massimo = 6
): number {
  const L = Math.max(1, misure.larghezza);
  const A = Math.max(1, misure.altezza);
  let meglio = 1;
  let scalaMeglio = 0;
  for (let k = 1; k <= Math.max(1, massimo); k++) {
    const largaColonna = (area.larghezza - (k - 1) * vuoto) / k;
    if (largaColonna <= 0) break;
    const scala = Math.min(largaColonna / L, area.altezza / (A / k));
    // a parità si tiene il numero più basso: una colonna sola è più semplice
    if (scala > scalaMeglio + 1e-9) {
      scalaMeglio = scala;
      meglio = k;
    }
  }
  return meglio;
}

/** il pezzo attraversa questa quota? (toccarla non è attraversarla) */
const attraversa = (pc: Piazzamento, y: number) => pc.y < y - E && pc.y + pc.altezza > y + E;

/**
 * Il punto di taglio più vicino a `ideale` dove non passa nessun pezzo.
 *
 * Si guardano gli inizi e le fini dei pezzi dentro la finestra: è lì che il
 * disegno cambia, e quindi lì che può esserci una riga sgombra. Se non ce n'è
 * nessuna si taglia all'ideale e pazienza — meglio un pezzo spezzato che un
 * rotolo illeggibile.
 */
export function tagliaLibero(
  piazzamenti: Piazzamento[],
  ideale: number,
  finestra: number
): number {
  if (!piazzamenti.some((pc) => attraversa(pc, ideale))) return ideale;
  const candidati = new Set<number>();
  for (const pc of piazzamenti) {
    for (const y of [pc.y, pc.y + pc.altezza])
      if (Math.abs(y - ideale) <= finestra) candidati.add(y);
  }
  const buoni = [...candidati]
    .filter((y) => !piazzamenti.some((pc) => attraversa(pc, y)))
    .sort((p, q) => Math.abs(p - ideale) - Math.abs(q - ideale));
  return buoni.length ? buoni[0] : ideale;
}

/** il cerchio come poligono, per poterlo tagliare a fette */
function cerchioPoligono(pc: Piazzamento): PuntoSagoma[] {
  const r = pc.larghezza / 2;
  const n = 48;
  return Array.from({ length: n }, (_, k): PuntoSagoma => {
    const t = (2 * Math.PI * k) / n;
    return [r + r * Math.cos(t), r + r * Math.sin(t)];
  });
}

/** il pezzo ritagliato alla fascia [da, a], con le y riferite a `da` */
function ritaglia(pc: Piazzamento, da: number, a: number): Piazzamento | null {
  const cima = pc.y;
  const fondo = pc.y + pc.altezza;
  if (fondo <= da + E || cima >= a - E) return null;
  // tutto dentro: basta spostarlo
  if (cima >= da - E && fondo <= a + E) return { ...pc, y: pc.y - da };

  const poly: PuntoSagoma[] | null = pc.punti
    ? pc.punti.map((q): PuntoSagoma => [pc.x + q[0], pc.y + q[1]])
    : pc.forma === 'cerchio'
      ? cerchioPoligono(pc).map((q): PuntoSagoma => [pc.x + q[0], pc.y + q[1]])
      : null;

  if (!poly) {
    // rettangolo: si accorcia e basta
    const y2 = Math.max(cima, da);
    const f2 = Math.min(fondo, a);
    if (f2 - y2 <= E) return null;
    return { ...pc, y: y2 - da, altezza: f2 - y2 };
  }

  const fetta = fasciaDiPoligono(poly, 1, da, a);
  if (fetta.length < 3) return null;
  const xs = fetta.map((q) => q[0]);
  const ys = fetta.map((q) => q[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const larghezza = Math.max(...xs) - x0;
  const altezza = Math.max(...ys) - y0;
  if (larghezza <= E || altezza <= E) return null;
  return {
    ...pc,
    // il cerchio tagliato non è più un cerchio: da qui in poi è il suo poligono
    forma: pc.forma === 'cerchio' ? undefined : pc.forma,
    x: x0,
    y: y0 - da,
    larghezza,
    altezza,
    punti: fetta.map((q): PuntoSagoma => [q[0] - x0, q[1] - y0])
  };
}

/** dove sta il centro del pezzo lungo il rotolo: lì ci va il suo nome */
const centro = (pc: Piazzamento) => pc.y + pc.altezza / 2;

/**
 * Spezza la lastra in `quante` colonne consecutive.
 *
 * `finestra` è quanto ci si può spostare dal punto ideale per trovare una
 * riga sgombra: in frazione della lunghezza di una colonna.
 */
export function spezzaInColonne(
  lastra: LastraNesting,
  misure: { larghezza: number; altezza: number },
  quante: number,
  finestra = 0.18
): Colonna[] {
  const A = Math.max(1, misure.altezza);
  const k = Math.max(1, Math.round(quante));
  if (k === 1) {
    return [
      {
        da: 0,
        a: A,
        lastra,
        etichettate: new Set(lastra.piazzamenti.map((pc) => pc.chiave))
      }
    ];
  }

  const passo = A / k;
  const tagli: number[] = [0];
  for (let i = 1; i < k; i++) {
    const ideale = passo * i;
    const y = tagliaLibero(lastra.piazzamenti, ideale, passo * finestra);
    // i tagli restano in ordine e non si accavallano
    tagli.push(Math.min(Math.max(y, tagli[i - 1] + 1), A - 1));
  }
  tagli.push(A);

  return Array.from({ length: k }, (_, i) => {
    const da = tagli[i];
    const a = tagli[i + 1];
    const pezzi: Piazzamento[] = [];
    const etichettate = new Set<string>();
    for (const pc of lastra.piazzamenti) {
      const tagliato = ritaglia(pc, da, a);
      if (!tagliato) continue;
      pezzi.push(tagliato);
      // il nome va dove sta il centro del pezzo intero; un pezzo che comincia
      // prima della prima colonna o finisce dopo l'ultima il nome lo prende
      // comunque, se no resta muto
      const c = centro(pc);
      const primo = i === 0;
      const ultimo = i === k - 1;
      if ((c >= da - E || primo) && (c < a - E || ultimo)) etichettate.add(pc.chiave);
    }
    return { da, a, lastra: { piazzamenti: pezzi }, etichettate };
  });
}
