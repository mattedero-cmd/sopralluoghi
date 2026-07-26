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

  // un taglio in y è libero se nessun pezzo lo attraversa
  const libero = (y: number) =>
    !pezzi.some((p) => p.y < y - EPS && p.y + p.altezza > y + EPS);

  // i candidati sono le fini dei pezzi: tagliare altrove sprecherebbe
  // materiale senza guadagnare nulla
  const candidati = [...new Set(pezzi.map((p) => p.y + p.altezza))]
    .filter((y) => y > 0 && y < fineTotale && libero(y))
    .sort((a, b) => a - b);

  const segmenti: SegmentoBobina[] = [];
  let inizio = 0;
  let guardia = 0;

  while (inizio < fineTotale - EPS && guardia++ < 10_000) {
    if (fineTotale - inizio <= massimo + EPS) {
      segmenti.push(blocco(pezzi, inizio, fineTotale, false));
      break;
    }
    // il taglio libero più lontano entro il massimo
    let taglio = 0;
    for (const y of candidati) {
      if (y > inizio + EPS && y <= inizio + massimo + EPS) taglio = y;
    }
    if (taglio > 0) {
      segmenti.push(blocco(pezzi, inizio, taglio, false));
      inizio = taglio;
      continue;
    }
    // nessun taglio libero prima del massimo: si allunga fino al primo
    // possibile, altrimenti si va in fondo
    const oltre = candidati.find((y) => y > inizio + massimo + EPS);
    const fine = oltre ?? fineTotale;
    segmenti.push(blocco(pezzi, inizio, fine, true));
    inizio = fine;
  }

  return segmenti;
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
