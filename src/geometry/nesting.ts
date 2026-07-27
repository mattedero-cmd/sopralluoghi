import { segmentaBobina } from './segmenti';

/**
 * NESTING RETTANGOLARE (ottimizzazione del taglio).
 *
 * Dispone una lista di rettangoli su lastre identiche di quantità illimitata
 * (se ne apre una nuova solo quando serve), con algoritmo MaxRects e criterio
 * Best-Area-Fit: fra tutti gli spazi liberi si scegle quello che lascia meno
 * area residua. I pezzi si provano dal più grande al più piccolo.
 *
 * Tutte le misure sono in MILLIMETRI.
 *
 * Le tre abbondanze e come entrano nel calcolo:
 * - MARGINE: restringe l'area utile su tutti i lati (`utile = lastra - 2*margine`).
 * - ABBONDANZA del pezzo: sommata a larghezza e altezza prima di impacchettare.
 * - LAMA (kerf): ogni pezzo viene "gonfiato" di `lama` e il contenitore viene
 *   allargato della stessa quantità (`contenitore = utile + lama`). Così fra
 *   due pezzi adiacenti resta esattamente lo spessore della lama, e l'ultima
 *   riga/colonna di taglio cade nell'allargamento virtuale invece di rubare
 *   spazio utile. Il pezzo viene poi restituito alla sua misura di taglio
 *   (`larghezza - lama`), spostato del margine.
 */

/** rettangolo da tagliare, come lo inserisce l'utente */
export interface PezzoNesting {
  id: string;
  nome: string;
  larghezza: number;
  altezza: number;
  quantita: number;
  /** true = si può girare di 90° */
  ruotabile: boolean;
  /** tinta per il disegno (0..359) */
  tinta: number;
}

export interface ParametriNesting {
  lastra: { larghezza: number; altezza: number };
  /** spessore della lama consumato tra due pezzi */
  lama: number;
  /** extra sommato alle misure di ogni pezzo */
  abbondanza: number;
  /** distanza dai bordi della lastra, su tutti i lati */
  margine: number;
  /**
   * Numero massimo di lastre utilizzabili. Serve per la BOBINA: il materiale
   * è uno solo e di lunghezza data, quindi ciò che non entra non "apre un
   * altro pezzo" ma resta fuori. Assente = quantità illimitata.
   */
  massimoLastre?: number;
  /**
   * Orientamento IMPOSTO a mano per singola copia (`chiave` → ruotato sì/no).
   * Vince sul calcolo: si prova solo quel verso, anche se il pezzo sarebbe
   * libero di girare. È così che si corregge un pezzo impaginato controvena.
   */
  orientamenti?: Record<string, boolean>;
  /**
   * Ordine con cui i pezzi vengono provati. Cambia il risultato: nessun
   * ordine è il migliore su tutte le liste, per questo `calcolaNestingMigliore`
   * li prova tutti e tiene il più efficiente. Assente = per area decrescente.
   */
  ordinamento?: Ordinamento;
  /**
   * Verso di partenza dei pezzi liberi di girare.
   *
   * «auto» lascia scegliere allo spazio libero, pezzo per pezzo: è il criterio
   * migliore in media ma è avido, e su liste di pezzi tutti uguali si blocca
   * sulla prima scelta. Forzando tutti diritti o tutti girati si esplorano le
   * disposizioni «a colonne» e «a righe», che spesso sono le più compatte.
   * I versi imposti a mano restano comunque intoccabili.
   */
  verso?: Verso;
}

/** verso di partenza dei pezzi liberi di girare */
export type Verso = 'auto' | 'diritto' | 'girato';

export const VERSI: Verso[] = ['auto', 'diritto', 'girato'];

/** criteri di ordinamento dei pezzi prima dell'impacchettamento */
export type Ordinamento = 'area' | 'latoLungo' | 'altezza' | 'larghezza' | 'perimetro';

export const ORDINAMENTI: Ordinamento[] = [
  'area',
  'latoLungo',
  'altezza',
  'larghezza',
  'perimetro'
];

/** pezzo piazzato su una lastra, in coordinate della lastra */
export interface Piazzamento {
  x: number;
  y: number;
  /** misure di TAGLIO (comprendono l'abbondanza, non la lama) */
  larghezza: number;
  altezza: number;
  /** misure FINITE richieste dall'utente */
  larghezzaFinita: number;
  altezzaFinita: number;
  nome: string;
  tinta: number;
  /** true = piazzato girato di 90° */
  ruotato: boolean;
  /**
   * Identità stabile della singola copia del pezzo (`idPezzo#indice`). Serve
   * per imporre a mano l'orientamento di UN pezzo dall'anteprima: il
   * riferimento sopravvive al ricalcolo, che rimescola le posizioni.
   */
  chiave: string;
}

export interface LastraNesting {
  piazzamenti: Piazzamento[];
}

/** pezzo che non entra nella lastra nemmeno da solo */
export interface PezzoScartato {
  nome: string;
  larghezzaFinita: number;
  altezzaFinita: number;
}

export interface EsitoNesting {
  lastre: LastraNesting[];
  scartati: PezzoScartato[];
}

interface Spazio {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Posizione {
  x: number;
  y: number;
  w: number;
  h: number;
  ruotato: boolean;
  punteggio: number;
}

/**
 * Contenitore MaxRects: tiene l'elenco degli spazi liberi (rettangoli massimali,
 * anche sovrapposti) e li ritaglia a ogni pezzo piazzato.
 */
class Contenitore {
  liberi: Spazio[];
  piazzamenti: Piazzamento[] = [];

  constructor(larghezza: number, altezza: number) {
    this.liberi = [{ x: 0, y: 0, w: larghezza, h: altezza }];
  }

  /** miglior posizione per un pezzo, o null se non ce n'è (Best-Area-Fit) */
  cercaPosizione(w: number, h: number, ruotabile: boolean): Posizione | null {
    let migliore: Posizione | null = null;
    for (const f of this.liberi) {
      if (w <= f.w && h <= f.h) {
        // a pari area residua vince lo spazio che resta meno "sbilenco"
        const resto = Math.min(f.w - w, f.h - h);
        const punteggio = (f.w * f.h - w * h) * 1e5 + resto;
        if (!migliore || punteggio < migliore.punteggio) {
          migliore = { x: f.x, y: f.y, w, h, ruotato: false, punteggio };
        }
      }
      if (ruotabile && h <= f.w && w <= f.h) {
        const resto = Math.min(f.w - h, f.h - w);
        const punteggio = (f.w * f.h - w * h) * 1e5 + resto;
        if (!migliore || punteggio < migliore.punteggio) {
          migliore = { x: f.x, y: f.y, w: h, h: w, ruotato: true, punteggio };
        }
      }
    }
    return migliore;
  }

  /** occupa la posizione: gli spazi liberi che la toccano vengono ritagliati */
  occupa(n: Posizione): void {
    const out: Spazio[] = [];
    for (const f of this.liberi) {
      if (!this.taglia(f, n, out)) out.push(f);
    }
    this.liberi = out;
    this.potatura();
  }

  private taglia(f: Spazio, n: Posizione, out: Spazio[]): boolean {
    if (n.x >= f.x + f.w || n.x + n.w <= f.x || n.y >= f.y + f.h || n.y + n.h <= f.y) return false;
    if (n.x > f.x && n.x < f.x + f.w) out.push({ x: f.x, y: f.y, w: n.x - f.x, h: f.h });
    if (n.x + n.w < f.x + f.w)
      out.push({ x: n.x + n.w, y: f.y, w: f.x + f.w - (n.x + n.w), h: f.h });
    if (n.y > f.y && n.y < f.y + f.h) out.push({ x: f.x, y: f.y, w: f.w, h: n.y - f.y });
    if (n.y + n.h < f.y + f.h)
      out.push({ x: f.x, y: n.y + n.h, w: f.w, h: f.y + f.h - (n.y + n.h) });
    return true;
  }

  /** togli gli spazi contenuti in altri: senza questo la lista degenera */
  private potatura(): void {
    const dentro = (a: Spazio, b: Spazio) =>
      b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
    for (let i = 0; i < this.liberi.length; i++) {
      for (let j = i + 1; j < this.liberi.length; j++) {
        if (dentro(this.liberi[j], this.liberi[i])) {
          this.liberi.splice(i, 1);
          i--;
          break;
        }
        if (dentro(this.liberi[i], this.liberi[j])) {
          this.liberi.splice(j, 1);
          j--;
        }
      }
    }
  }
}

/** Calcola la disposizione dei pezzi sulle lastre. */
export function calcolaNesting(par: ParametriNesting, pezzi: PezzoNesting[]): EsitoNesting {
  const { lama, abbondanza, margine } = par;
  const utileL = par.lastra.larghezza - 2 * margine;
  const utileA = par.lastra.altezza - 2 * margine;
  // il contenitore è allargato di una lama: l'ultima riga/colonna di taglio
  // cade qui e non consuma area utile
  const binL = utileL + lama;
  const binA = utileA + lama;

  interface Istanza {
    chiave: string;
    nome: string;
    tinta: number;
    ruotabile: boolean;
    /** verso imposto a mano: true ruotato, false diritto, undefined libero */
    imposto?: boolean;
    /** il pezzo è davvero libero di girare (nessun verso imposto) */
    libero: boolean;
    finitaL: number;
    finitaA: number;
    packL: number;
    packA: number;
  }
  const istanze: Istanza[] = [];
  for (const p of pezzi) {
    const q = Math.max(0, Math.round(p.quantita) || 0);
    for (let i = 0; i < q; i++) {
      const chiave = `${p.id}#${i}`;
      const imposto = par.orientamenti?.[chiave];
      istanze.push({
        chiave,
        nome: p.nome,
        tinta: p.tinta,
        // con un verso imposto il pezzo non è più libero di girare
        ruotabile: imposto == null ? p.ruotabile : false,
        imposto: imposto ?? undefined,
        libero: imposto == null && p.ruotabile,
        finitaL: p.larghezza,
        finitaA: p.altezza,
        packL: p.larghezza + abbondanza + lama,
        packA: p.altezza + abbondanza + lama
      });
    }
  }
  // dal più grande al più piccolo: i grandi trovano posto finché c'è spazio.
  // «grande» però si può misurare in più modi, e il migliore dipende dalla
  // lista: vedi calcolaNestingMigliore.
  const peso = (i: Istanza): number => {
    switch (par.ordinamento) {
      case 'latoLungo':
        return Math.max(i.packL, i.packA);
      case 'altezza':
        return i.packA;
      case 'larghezza':
        return i.packL;
      case 'perimetro':
        return i.packL + i.packA;
      default:
        return i.packL * i.packA;
    }
  };
  // a pari peso decide l'area, poi il lato lungo: l'ordine resta deterministico
  istanze.sort(
    (a, b) =>
      peso(b) - peso(a) ||
      b.packL * b.packA - a.packL * a.packA ||
      Math.max(b.packL, b.packA) - Math.max(a.packL, a.packA)
  );

  const lastre: Contenitore[] = [];
  const scartati: PezzoScartato[] = [];

  const verso = par.verso ?? 'auto';

  for (const it of istanze) {
    // il verso può essere imposto a mano (vince su tutto) oppure forzato dalla
    // strategia in prova; altrimenti lo sceglie lo spazio libero
    const fissato: boolean | undefined =
      it.imposto ?? (it.libero && verso !== 'auto' ? verso === 'girato' : undefined);
    // con un verso fissato si prova SOLO quello: le misure d'ingombro sono
    // già scambiate e la rotazione automatica è disattivata
    const usaL = fissato ? it.packA : it.packL;
    const usaA = fissato ? it.packL : it.packA;
    const puoGirare = fissato == null && it.ruotabile;
    const entra = usaL <= binL && usaA <= binA;
    const entraGirato = puoGirare && usaA <= binL && usaL <= binA;
    if (!entra && !entraGirato) {
      scartati.push({ nome: it.nome, larghezzaFinita: it.finitaL, altezzaFinita: it.finitaA });
      continue;
    }

    let migliore: Posizione | null = null;
    let lastraScelta: Contenitore | null = null;
    for (const c of lastre) {
      const pos = c.cercaPosizione(usaL, usaA, puoGirare);
      if (pos && (!migliore || pos.punteggio < migliore.punteggio)) {
        migliore = pos;
        lastraScelta = c;
      }
    }
    if (!migliore) {
      // con un tetto al numero di lastre (bobina) ciò che non entra resta fuori
      if (par.massimoLastre != null && lastre.length >= par.massimoLastre) {
        scartati.push({ nome: it.nome, larghezzaFinita: it.finitaL, altezzaFinita: it.finitaA });
        continue;
      }
      const nuova = new Contenitore(binL, binA);
      lastre.push(nuova);
      migliore = nuova.cercaPosizione(usaL, usaA, puoGirare);
      lastraScelta = nuova;
    }
    if (!migliore || !lastraScelta) continue;

    lastraScelta.occupa(migliore);
    lastraScelta.piazzamenti.push({
      x: migliore.x + margine,
      y: migliore.y + margine,
      larghezza: migliore.w - lama,
      altezza: migliore.h - lama,
      larghezzaFinita: it.finitaL,
      altezzaFinita: it.finitaA,
      nome: it.nome,
      tinta: it.tinta,
      // con un verso fissato è quello a dire se il pezzo è girato
      ruotato: fissato ?? migliore.ruotato,
      chiave: it.chiave
    });
  }

  return { lastre: lastre.map((c) => ({ piazzamenti: c.piazzamenti })), scartati };
}

/**
 * Quanto è buono un risultato, in ordine di importanza:
 * 1. pezzi piazzati (più ce ne stanno, meglio è);
 * 2. lastre usate (meno materiale aperto);
 * 3. lunghezza occupata (su bobina è il metraggio, su lastra è lo spazio
 *    che resta libero in fondo all'ultima: un ritaglio intero vale più di
 *    tanti sfridi sparsi).
 *
 * Numeri più bassi sono migliori.
 */
function qualita(
  e: EsitoNesting,
  opzioni?: OpzioniRicerca,
  margine = 0
): [number, number, number, number] {
  let piazzati = 0;
  let occupata = 0;
  for (const l of e.lastre) {
    piazzati += l.piazzamenti.length;
    let fine = 0;
    for (const pc of l.piazzamenti) fine = Math.max(fine, pc.y + pc.altezza);
    occupata += fine;
  }
  // su bobina conta anche poter STACCARE il rotolo a blocchi maneggevoli:
  // un blocco da 4,5 m che non si può spezzare è peggio di 16 cm di materiale
  // in più, perché al banco non si maneggia
  let ingestibili = 0;
  if (opzioni?.bloccoMassimo && opzioni.bloccoMassimo > 0) {
    for (const l of e.lastre) {
      for (const s of segmentaBobina(l, opzioni.bloccoMassimo, margine)) {
        if (s.oltreMassimo) ingestibili++;
      }
    }
  }
  return [-piazzati, e.lastre.length, ingestibili, occupata];
}

export interface OpzioniRicerca {
  /**
   * Solo per la BOBINA: lunghezza del blocco che si riesce a maneggiare.
   * Fra due disposizioni quasi equivalenti si preferisce quella che si lascia
   * spezzare in blocchi di questa misura (vedi geometry/segmenti).
   */
  bloccoMassimo?: number;
}

/**
 * IMPACCHETTAMENTO MIGLIORE.
 *
 * Nessuna strategia è la migliore su tutte le liste: lo stesso insieme di
 * pezzi può occupare una lastra in meno solo perché si è partiti dai più alti
 * invece che dai più grandi, o perché li si è messi tutti in piedi invece che
 * tutti coricati. Qui si provano tutte le combinazioni di ordine e verso e si
 * tiene il risultato migliore — il programma cerca da sé, senza chiedere nulla.
 *
 * Il verso è la leva decisiva quando i pezzi sono tutti uguali: lì cambiare
 * l'ordine non cambia niente, mentre girarli tutti può far entrare una fila
 * in più (tre pezzi da 400 su un rotolo da 1220 invece di due da 610).
 *
 * Con `bloccoMassimo` la ricerca tiene conto anche di quanto la bobina si
 * lascia spezzare: fra due disposizioni si preferisce quella tagliabile in
 * blocchi maneggevoli, perché serve a poco risparmiare tre centimetri di
 * rotolo se poi il pezzo che ne esce non si riesce a girare al banco.
 *
 * A parità di qualità vince il primo ordine provato, così il risultato è
 * sempre lo stesso a parità di dati.
 */
export function calcolaNestingMigliore(
  par: ParametriNesting,
  pezzi: PezzoNesting[],
  opzioni?: OpzioniRicerca
): EsitoNesting {
  type Punteggio = [number, number, number, number];
  /** confronto lessicografico: <0 se «a» è meglio di «b» */
  const confronta = (a: Punteggio, b: Punteggio) =>
    a[0] - b[0] ||
    a[1] - b[1] ||
    a[2] - b[2] ||
    (Math.abs(a[3] - b[3]) < 1e-9 ? 0 : a[3] - b[3]);

  let migliore: EsitoNesting | null = null;
  let punteggio: Punteggio | null = null;
  for (const ordinamento of ORDINAMENTI) {
    for (const verso of VERSI) {
      const e = calcolaNesting({ ...par, ordinamento, verso }, pezzi);
      const q = qualita(e, opzioni, par.margine);
      if (!punteggio || confronta(q, punteggio) < 0) {
        migliore = e;
        punteggio = q;
      }
    }
  }
  return migliore ?? { lastre: [], scartati: [] };
}

/** Riepilogo per le statistiche mostrate accanto al disegno. */
export interface RiepilogoNesting {
  lastreUsate: number;
  pezziPiazzati: number;
  pezziRichiesti: number;
  /** area dei pezzi finiti / area delle lastre usate, in % */
  resa: number;
  /** 100 - resa: comprende lama, abbondanze e margini */
  sfrido: number;
}

export function riepilogaNesting(
  par: ParametriNesting,
  pezzi: PezzoNesting[],
  esito: EsitoNesting
): RiepilogoNesting {
  const areaLastra = par.lastra.larghezza * par.lastra.altezza;
  const areaTotale = esito.lastre.length * areaLastra;
  let piazzati = 0;
  let areaFinita = 0;
  for (const l of esito.lastre) {
    for (const pc of l.piazzamenti) {
      piazzati++;
      areaFinita += pc.larghezzaFinita * pc.altezzaFinita;
    }
  }
  const richiesti = pezzi.reduce((a, p) => a + (Math.max(0, Math.round(p.quantita)) || 0), 0);
  const resa = areaTotale > 0 ? (areaFinita / areaTotale) * 100 : 0;
  return {
    lastreUsate: esito.lastre.length,
    pezziPiazzati: piazzati,
    pezziRichiesti: richiesti,
    resa,
    sfrido: areaTotale > 0 ? 100 - resa : 0
  };
}

/**
 * BOBINA — quanto materiale viene davvero consumato.
 *
 * Su un rotolo la larghezza è fissa e ciò che conta è quanta LUNGHEZZA si
 * usa: è il punto in cui si taglia, cioè la fine del pezzo più lontano, più
 * il margine da lasciare in coda. Restituisce millimetri; 0 se non è stato
 * piazzato nulla.
 */
export function lunghezzaUsata(lastra: LastraNesting | undefined, margine: number): number {
  if (!lastra || lastra.piazzamenti.length === 0) return 0;
  let fine = 0;
  for (const pc of lastra.piazzamenti) fine = Math.max(fine, pc.y + pc.altezza);
  return fine + margine;
}

/** passo "tondo" (1, 2, 5 ×10^n) per la griglia di riferimento del disegno */
export function passoGriglia(target: number): number {
  if (!(target > 0)) return 1;
  const pot = Math.pow(10, Math.floor(Math.log10(target)));
  const n = target / pot;
  const passo = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return passo * pot;
}
