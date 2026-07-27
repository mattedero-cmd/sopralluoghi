/**
 * SEGMENTI DELLA BOBINA — dove si può spezzare il rotolo.
 *
 * Al banco un rotolo lungo non si maneggia: si stacca un blocco, si tagliano
 * i pezzi che ci sono dentro, si passa al blocco dopo. Dove spezzare non è
 * una misura fissa: dipende da come sono impaginati i pezzi, perché un taglio
 * può cadere SOLO dove non passa attraverso nessun pezzo.
 *
 * Qui si cercano quelle linee libere e si raggruppano i pezzi in blocchi il
 * più lunghi possibile, senza superare il massimo desiderato. Se prima del
 * massimo non esiste nessuna linea libera, il blocco viene più lungo: è un
 * fatto del materiale impaginato, non una scelta, e viene segnalato.
 */

import type { LastraNesting, Piazzamento } from './nesting';

/**
 * Lunghezza di riferimento di un blocco maneggevole al banco (mm).
 * Non è un limite rigido — se i pezzi non lasciano passare la lama il blocco
 * viene più lungo — ma è la misura attorno a cui conviene impaginare.
 */
export const BLOCCO_MANEGGEVOLE = 3000;

export interface SegmentoBobina {
  /** estremi lungo il rotolo, in mm dall'inizio */
  inizio: number;
  fine: number;
  /** pezzi contenuti, con la y già riferita all'inizio del segmento */
  lastra: LastraNesting;
  /** vero se è stato necessario superare la lunghezza massima */
  oltreMassimo: boolean;
}

/** tolleranza di confronto: le coordinate arrivano da somme di float */
const EPS = 1e-6;

/**
 * Divide il tratto di bobina occupato in blocchi tagliabili.
 *
 * @param lastra   il nesting dell'intero rotolo
 * @param massimo  lunghezza desiderata massima del blocco (mm)
 * @param margine  margine del materiale: entra nel primo e nell'ultimo blocco
 */
export function segmentaBobina(
  lastra: LastraNesting | undefined,
  massimo: number,
  margine = 0
): SegmentoBobina[] {
  const pezzi = lastra?.piazzamenti ?? [];
  if (pezzi.length === 0) return [];

  const fineTotale = pezzi.reduce((f, p) => Math.max(f, p.y + p.altezza), 0) + margine;
  if (!(massimo > 0) || fineTotale <= massimo) {
    return [
      { inizio: 0, fine: fineTotale, lastra: trasla(pezzi, 0), oltreMassimo: false }
    ];
  }

  // Le fasce di rotolo davvero occupate, unite fra loro. Fuori da queste il
  // rotolo è libero per tutta la larghezza: lì la lama può passare. Guardare
  // solo le "fini dei pezzi" non basta — una fine può essere attraversata da
  // un pezzo accanto, e viceversa una linea libera può cadere in mezzo al
  // vuoto fra due file.
  const coperte: Array<{ a: number; b: number }> = [];
  for (const p of [...pezzi].sort((x, y) => x.y - y.y)) {
    const a = p.y;
    const b = p.y + p.altezza;
    const ultima = coperte[coperte.length - 1];
    // si uniscono solo le fasce che si SOVRAPPONGONO: due pezzi che si
    // toccano lasciano comunque passare la lama sulla linea di contatto
    if (ultima && a < ultima.b - EPS) ultima.b = Math.max(ultima.b, b);
    else coperte.push({ a, b });
  }

  /** la fascia occupata che attraversa `y`, se c'è */
  const attraversa = (y: number) => coperte.find((c) => c.a < y - EPS && c.b > y + EPS);

  const blocchi: Array<{ inizio: number; fine: number; oltre: boolean }> = [];
  let inizio = 0;
  let guardia = 0;

  while (inizio < fineTotale - EPS && guardia++ < 10_000) {
    if (fineTotale - inizio <= massimo + EPS) {
      blocchi.push({ inizio, fine: fineTotale, oltre: false });
      break;
    }
    // il punto libero più lontano entro il massimo: il limite stesso se lì il
    // rotolo è sgombro, altrimenti l'inizio della fascia che lo attraversa
    const limite = inizio + massimo;
    const sopra = attraversa(limite);
    const taglio = sopra ? sopra.a : limite;
    if (taglio > inizio + EPS) {
      blocchi.push({ inizio, fine: taglio, oltre: false });
      inizio = taglio;
      continue;
    }
    // la fascia occupata comincia prima del blocco e finisce dopo il massimo:
    // non c'è nessun punto dove passare, il blocco va allungato
    const fine = sopra ? Math.min(sopra.b, fineTotale) : fineTotale;
    blocchi.push({ inizio, fine, oltre: true });
    inizio = fine;
  }

  // I margini di testa e di coda sono rotolo senza pezzi dentro: da soli non
  // sono un segmento da staccare, appartengono al blocco che hanno accanto.
  const quanti = (a: number, b: number) =>
    pezzi.filter((p) => p.y >= a - EPS && p.y + p.altezza <= b + EPS).length;
  for (let i = blocchi.length - 1; i >= 0 && blocchi.length > 1; i--) {
    if (quanti(blocchi[i].inizio, blocchi[i].fine) > 0) continue;
    if (i > 0) {
      blocchi[i - 1].fine = blocchi[i].fine;
      blocchi[i - 1].oltre = blocchi[i - 1].oltre || blocchi[i].oltre;
    } else {
      blocchi[1].inizio = blocchi[0].inizio;
      blocchi[1].oltre = blocchi[1].oltre || blocchi[0].oltre;
    }
    blocchi.splice(i, 1);
  }

  return blocchi.map((b) => blocco(pezzi, b.inizio, b.fine, b.oltre));
}

function blocco(
  pezzi: Piazzamento[],
  inizio: number,
  fine: number,
  oltreMassimo: boolean
): SegmentoBobina {
  const dentro = pezzi.filter((p) => p.y >= inizio - EPS && p.y + p.altezza <= fine + EPS);
  return { inizio, fine, lastra: trasla(dentro, inizio), oltreMassimo };
}

/** riporta i pezzi all'origine del segmento: il disegno parte sempre da 0 */
function trasla(pezzi: Piazzamento[], inizio: number): LastraNesting {
  return { piazzamenti: pezzi.map((p) => ({ ...p, y: p.y - inizio })) };
}
