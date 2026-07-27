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
 *
 * CONTA ANCHE COME RESTA LO SFRIDO. Di fianco ai pezzi rimane quasi sempre una
 * striscia di rotolo libera: se è larga uguale per un buon tratto, quella
 * striscia è materiale ancora buono e va tenuta INTERA. Tagliare il segmento
 * nel mezzo la spezzerebbe in due ritagli più corti, buoni per meno cose. Fra
 * i punti dove la lama può passare si preferisce quindi quello dove la
 * striscia cambia larghezza da sola.
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
 * Sotto questa larghezza (mm) la striscia di fianco ai pezzi è scarto e non
 * materiale: spezzarla non toglie niente a nessuno.
 */
const STRISCIA_UTILE = 100;

/**
 * Divide il tratto di bobina occupato in blocchi tagliabili.
 *
 * @param lastra     il nesting dell'intero rotolo
 * @param massimo    lunghezza desiderata massima del blocco (mm)
 * @param margine    margine del materiale: entra nel primo e nell'ultimo blocco
 * @param larghezza  larghezza del rotolo: serve a valutare la striscia di
 *                   sfrido che resta di fianco ai pezzi. Se manca, la
 *                   divisione guarda solo dove può passare la lama.
 */
export function segmentaBobina(
  lastra: LastraNesting | undefined,
  massimo: number,
  margine = 0,
  larghezza = 0
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

  /** bordo destro dei pezzi appena SOPRA `y` (0 se lì non c'è niente) */
  const bordoSopra = (y: number) =>
    pezzi.reduce(
      (b, p) =>
        p.y <= y + EPS && p.y + p.altezza > y + EPS ? Math.max(b, p.x + p.larghezza) : b,
      0
    );
  /** bordo destro dei pezzi appena SOTTO `y` */
  const bordoSotto = (y: number) =>
    pezzi.reduce(
      (b, p) =>
        p.y < y - EPS && p.y + p.altezza >= y - EPS ? Math.max(b, p.x + p.larghezza) : b,
      0
    );

  /**
   * Tagliare in `y` spezzerebbe in due una striscia di sfrido larga uguale?
   * Succede quando sopra e sotto il taglio i pezzi arrivano allo stesso punto:
   * la striscia che resta di fianco è una sola e prosegue oltre il taglio.
   */
  const spezzaStriscia = (y: number) => {
    if (larghezza <= 0) return false;
    const sotto = bordoSotto(y);
    const sopra = bordoSopra(y);
    if (sopra === 0 || sotto === 0) return false; // niente sopra o sotto: nulla da spezzare
    if (Math.abs(sopra - sotto) > EPS) return false; // la striscia cambia da sola
    return larghezza - sopra >= STRISCIA_UTILE;
  };

  /** i punti in cui il disegno cambia: solo lì la striscia può cambiare */
  const cambi = [...new Set(pezzi.flatMap((p) => [p.y, p.y + p.altezza]))].sort(
    (a, b) => a - b
  );

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
    const estremo = sopra ? sopra.a : limite;
    if (estremo > inizio + EPS) {
      // fra i punti buoni si preferisce il più lontano che NON spezzi la
      // striscia di sfrido; se spezzano tutti, si torna al più lontano
      let taglio = estremo;
      if (spezzaStriscia(estremo)) {
        const buono = cambi
          .filter((y) => y > inizio + EPS && y < estremo - EPS && !attraversa(y))
          .filter((y) => !spezzaStriscia(y))
          .pop();
        if (buono != null) taglio = buono;
      }
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

/**
 * IL RITAGLIO BUONO che avanza dal blocco.
 *
 * Di fianco ai pezzi resta materiale libero, ma a gradini: quello che si può
 * davvero mettere da parte e riusare è il RETTANGOLO INTERO più grande che ci
 * sta dentro. Si calcola come il rettangolo massimo in un istogramma, dove
 * ogni fascia alta quanto un pezzo vale quanto rotolo le resta libero a
 * destra. Restituisce null se il meglio che avanza è troppo stretto per
 * essere considerato materiale.
 */
export function strisciaResidua(
  lastra: LastraNesting | undefined,
  larghezza: number,
  lunghezza: number
): { larghezza: number; lunghezza: number; inizio: number } | null {
  const pezzi = lastra?.piazzamenti ?? [];
  if (!(larghezza > 0) || !(lunghezza > 0) || pezzi.length === 0) return null;

  // fasce orizzontali: cambiano dove comincia o finisce un pezzo
  const tagli = [
    0,
    lunghezza,
    ...pezzi.flatMap((p) => [p.y, p.y + p.altezza])
  ]
    .filter((y) => y >= -EPS && y <= lunghezza + EPS)
    .sort((a, b) => a - b);

  const fasce: Array<{ y: number; alta: number; libero: number }> = [];
  for (let i = 0; i < tagli.length - 1; i++) {
    const a = tagli[i];
    const b = tagli[i + 1];
    if (b - a <= EPS) continue;
    const meta = (a + b) / 2;
    const bordo = pezzi.reduce(
      (v, p) => (p.y < meta && p.y + p.altezza > meta ? Math.max(v, p.x + p.larghezza) : v),
      0
    );
    fasce.push({ y: a, alta: b - a, libero: larghezza - bordo });
  }
  if (fasce.length === 0) return null;

  // rettangolo massimo nell'istogramma (algoritmo classico con la pila: ogni
  // fascia viene "allungata" all'indietro finché trova materiale almeno largo
  // quanto lei)
  let migliore = { larghezza: 0, lunghezza: 0, inizio: 0 };
  /**
   * Fra due ritagli vince quello con più area, ma a parità sostanziale (entro
   * il 5%) vince il più largo: un ritaglio largo si riusa per più cose di una
   * bandella lunga e sottile della stessa superficie.
   */
  const valuta = (libero: number, lungo: number, inizio: number) => {
    if (lungo <= EPS || libero <= 0) return;
    const area = libero * lungo;
    const areaMigliore = migliore.larghezza * migliore.lunghezza;
    const vicine = Math.abs(area - areaMigliore) <= areaMigliore * 0.05;
    if (area > areaMigliore && !vicine) {
      migliore = { larghezza: libero, lunghezza: lungo, inizio };
    } else if (vicine && libero > migliore.larghezza) {
      migliore = { larghezza: libero, lunghezza: lungo, inizio };
    }
  };
  const pila: Array<{ y: number; libero: number }> = [];
  for (const f of fasce) {
    let inizio = f.y;
    while (pila.length && pila[pila.length - 1].libero >= f.libero - EPS) {
      const t = pila.pop()!;
      valuta(t.libero, f.y - t.y, t.y);
      inizio = t.y;
    }
    pila.push({ y: inizio, libero: f.libero });
  }
  const fine = fasce[fasce.length - 1].y + fasce[fasce.length - 1].alta;
  while (pila.length) {
    const t = pila.pop()!;
    valuta(t.libero, fine - t.y, t.y);
  }

  return migliore.larghezza >= STRISCIA_UTILE && migliore.lunghezza > 0 ? migliore : null;
}

/** riporta i pezzi all'origine del segmento: il disegno parte sempre da 0 */
function trasla(pezzi: Piazzamento[], inizio: number): LastraNesting {
  return { piazzamenti: pezzi.map((p) => ({ ...p, y: p.y - inizio })) };
}
