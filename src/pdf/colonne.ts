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
 * 2. IL PEZZO NON SI TAGLIA DOVE VA A CAPO. Il capoverso è una cosa del
 *    foglio, non del materiale: il pezzo è uno e intero, e chi taglia non
 *    deve mai credere il contrario. Quando il capoverso cade per forza in
 *    mezzo a un pezzo, la sua parte si disegna in tutte e due le colonne —
 *    se no sparirebbe materiale dal disegno — ma:
 *      · il NOME si scrive una volta sola, nella parte più grande (quella
 *        che contiene il centro): due etichette uguali vorrebbero dire due
 *        pezzi;
 *      · il bordo sul capoverso non è un bordo: si segna la GIUNZIONE, che
 *        chi disegna traccia tratteggiata, e tutt'e due le parti portano una
 *        freccia verso la colonna dove il pezzo continua.
 *    Le giunzioni sono i lati del pezzo che cadono sul capoverso: per una
 *    sagoma storta sono il segmento vero, non tutta la larghezza.
 */

import { fasciaDiPoligono, type PuntoSagoma } from '../geometry/sagome';
import type { LastraNesting, Piazzamento } from '../geometry/nesting';

const E = 1e-6;

/**
 * Oltre tre colonne non si va: il foglio deve restare un foglio da banco, e
 * ogni capoverso in più è un pezzo in più che rischia di essere spezzato in
 * due. Due è il caso normale, tre il massimo.
 */
export const COLONNE_MASSIME = 3;

/**
 * Sotto i cinque metri il foglio si legge intero e non si va a capo.
 *
 * È una misura da banco, non un conto: cinque metri di rotolo su un A4 sono
 * ancora un disegno che si guarda tutto insieme, e un capoverso in meno è un
 * pezzo in meno che rischia di essere spezzato in due.
 */
export const LUNGHEZZA_CAPOVERSO = 5000;

/**
 * Un lato di pezzo che cade sul capoverso: lì il pezzo NON finisce, continua
 * nella colonna che `verso` indica. Le coordinate sono in mm, riferite
 * all'inizio della colonna come i pezzi.
 */
export interface Giunzione {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** dove sta il resto del pezzo: nella colonna prima o in quella dopo */
  verso: 'prima' | 'dopo';
  /** quanta parte del pezzo sta da QUESTA parte del capoverso, in mm */
  alto: number;
  /** il pezzo a cui appartiene: la giunzione lo deve dire, non nasconderlo */
  nome: string;
  /** quale parte è questa, e in quante parti il foglio ha spezzato il pezzo */
  parte: number;
  parti: number;
}

export interface Colonna {
  /** il tratto di lastra, in mm dall'inizio del foglio */
  da: number;
  a: number;
  /** i pezzi del tratto, con la y riferita all'inizio della colonna */
  lastra: LastraNesting;
  /** le chiavi dei pezzi da ETICHETTARE qui: il nome si scrive una volta sola */
  etichettate: Set<string>;
  /** i lati che cadono sul capoverso: non sono bordi, sono giunzioni */
  giunzioni: Giunzione[];
}

/**
 * Quante colonne convengono.
 *
 * Oltre i cinque metri — sotto si legge intero — si sceglie la divisione che
 * fa il disegno PIÙ GRANDE: più colonne vuol dire
 * colonne più strette (peggio) ma tratti più corti (meglio), e l'optimum sta
 * dove le due cose si incrociano. Invece di indovinarlo si provano tutte le
 * divisioni ammesse e si tiene quella con la scala maggiore.
 */
export function colonneConsigliate(
  misure: { larghezza: number; altezza: number },
  area: { larghezza: number; altezza: number },
  vuoto: number,
  massimo = COLONNE_MASSIME
): number {
  const L = Math.max(1, misure.larghezza);
  const A = Math.max(1, misure.altezza);
  // sotto i cinque metri si legge intero: non si va a capo
  if (A <= LUNGHEZZA_CAPOVERSO) return 1;
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
 * disegno cambia, e quindi lì che può esserci una riga sgombra.
 *
 * Se una riga sgombra non c'è — e su un pezzo lungo quanto mezza colonna non
 * c'è davvero — si sceglie il punto che ne attraversa IL MENO POSSIBILE, e a
 * parità il più vicino all'ideale: un capoverso in mezzo a un pezzo si
 * capisce, tre capoversi in mezzo a tre pezzi no.
 */
export function tagliaLibero(
  piazzamenti: Piazzamento[],
  ideale: number,
  finestra: number
): number {
  const quanti = (y: number) => piazzamenti.reduce((n, pc) => n + (attraversa(pc, y) ? 1 : 0), 0);
  if (quanti(ideale) === 0) return ideale;
  const candidati = new Set<number>([ideale]);
  for (const pc of piazzamenti) {
    for (const y of [pc.y, pc.y + pc.altezza])
      if (Math.abs(y - ideale) <= finestra) candidati.add(y);
  }
  return [...candidati].sort((p, q) => {
    const d = quanti(p) - quanti(q);
    return d !== 0 ? d : Math.abs(p - ideale) - Math.abs(q - ideale);
  })[0];
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

/** i lati del pezzo tagliato che stanno sul capoverso, non sul suo contorno */
function giunzioniDi(
  fetta: PuntoSagoma[],
  da: number,
  a: number,
  alto: number,
  quale: { nome: string; parte: number; parti: number }
): Giunzione[] {
  const fuori: Giunzione[] = [];
  for (let i = 0; i < fetta.length; i++) {
    const p = fetta[i];
    const q = fetta[(i + 1) % fetta.length];
    if (Math.abs(p[0] - q[0]) < E) continue;
    for (const [quota, verso] of [
      [da, 'prima'],
      [a, 'dopo']
    ] as Array<[number, 'prima' | 'dopo']>) {
      if (Math.abs(p[1] - quota) < 1e-4 && Math.abs(q[1] - quota) < 1e-4) {
        fuori.push({ x1: p[0], y1: p[1] - da, x2: q[0], y2: q[1] - da, verso, alto, ...quale });
      }
    }
  }
  return fuori;
}

/** il pezzo ritagliato alla fascia [da, a], con le y riferite a `da` */
function ritaglia(
  pc: Piazzamento,
  da: number,
  a: number,
  quale: { nome: string; parte: number; parti: number }
): { pezzo: Piazzamento; giunzioni: Giunzione[] } | null {
  const cima = pc.y;
  const fondo = pc.y + pc.altezza;
  if (fondo <= da + E || cima >= a - E) return null;
  // tutto dentro: basta spostarlo, e non c'è nessuna giunzione
  if (cima >= da - E && fondo <= a + E) return { pezzo: { ...pc, y: pc.y - da }, giunzioni: [] };

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
    const giunzioni: Giunzione[] = [];
    if (y2 > cima + E)
      giunzioni.push({
        x1: pc.x,
        y1: 0,
        x2: pc.x + pc.larghezza,
        y2: 0,
        verso: 'prima',
        alto: f2 - y2,
        ...quale
      });
    if (f2 < fondo - E)
      giunzioni.push({
        x1: pc.x,
        y1: f2 - da,
        x2: pc.x + pc.larghezza,
        y2: f2 - da,
        verso: 'dopo',
        alto: f2 - y2,
        ...quale
      });
    return { pezzo: { ...pc, y: y2 - da, altezza: f2 - y2 }, giunzioni };
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
    pezzo: {
      ...pc,
      // il cerchio tagliato non è più un cerchio: da qui in poi è il suo poligono
      forma: pc.forma === 'cerchio' ? undefined : pc.forma,
      x: x0,
      y: y0 - da,
      larghezza,
      altezza,
      punti: fetta.map((q): PuntoSagoma => [q[0] - x0, q[1] - y0])
    },
    giunzioni: giunzioniDi(fetta, da, a, altezza, quale)
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
  finestra = 0.22
): Colonna[] {
  const A = Math.max(1, misure.altezza);
  const k = Math.max(1, Math.round(quante));
  if (k === 1) {
    return [
      {
        da: 0,
        a: A,
        lastra,
        etichettate: new Set(lastra.piazzamenti.map((pc) => pc.chiave)),
        giunzioni: []
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

  // IN QUANTE PARTI IL FOGLIO SPEZZA OGNI PEZZO. Si conta prima, perché la
  // scritta sulla giunzione lo deve dire: «parte 1 di 2» è il modo più corto
  // di far capire che quel pezzo è uno solo e che lì il disegno l'ha tagliato.
  const quanteParti = new Map<string, number>();
  for (const pc of lastra.piazzamenti) {
    let n = 0;
    for (let i = 0; i < k; i++) {
      if (pc.y < tagli[i + 1] - E && pc.y + pc.altezza > tagli[i] + E) n++;
    }
    quanteParti.set(pc.chiave, Math.max(1, n));
  }
  const fatte = new Map<string, number>();

  return Array.from({ length: k }, (_, i) => {
    const da = tagli[i];
    const a = tagli[i + 1];
    const pezzi: Piazzamento[] = [];
    const etichettate = new Set<string>();
    const giunzioni: Giunzione[] = [];
    for (const pc of lastra.piazzamenti) {
      const parti = quanteParti.get(pc.chiave) ?? 1;
      const parte = (fatte.get(pc.chiave) ?? 0) + 1;
      const tagliato = ritaglia(pc, da, a, { nome: pc.nome, parte, parti });
      if (!tagliato) continue;
      fatte.set(pc.chiave, parte);
      pezzi.push(tagliato.pezzo);
      // una giunzione verso la colonna prima della prima, o dopo l'ultima, non
      // esiste: lì il pezzo finisce davvero, è il foglio che comincia dopo
      for (const g of tagliato.giunzioni) {
        if (g.verso === 'prima' && i === 0) continue;
        if (g.verso === 'dopo' && i === k - 1) continue;
        giunzioni.push(g);
      }
      // il nome va nella parte più grande, che è quella dove cade il centro;
      // un pezzo che comincia prima della prima colonna o finisce dopo
      // l'ultima il nome lo prende comunque, se no resta muto
      const c = centro(pc);
      const primo = i === 0;
      const ultimo = i === k - 1;
      if ((c >= da - E || primo) && (c < a - E || ultimo)) etichettate.add(pc.chiave);
    }
    return { da, a, lastra: { piazzamenti: pezzi }, etichettate, giunzioni };
  });
}
