import { segmentaBobina, strisciaResidua } from './segmenti';

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
  /**
   * Come si sceglie, fra tutti gli spazi liberi, quello dove mettere il pezzo.
   * Nessun criterio vince sempre: vedi `calcolaNestingMigliore`, che li prova
   * tutti. Assente = «area».
   */
  criterio?: Criterio;
}

/**
 * Criterio di scelta dello spazio libero.
 *
 * - «area» (Best-Area-Fit): lo spazio che avanza meno area. Riempie bene le
 *   tasche, ma può lasciare un pezzo isolato lontano dagli altri.
 * - «latoCorto» (Best-Short-Side-Fit): lo spazio che avanza la striscia più
 *   stretta. Tiene i pezzi allineati e fa crescere le file compatte.
 * - «bassoSinistra»: il posto più in alto possibile (e poi il più a sinistra).
 *   Non lascia mai un pezzo indietro se davanti c'è posto: sulla bobina è
 *   quello che accorcia il metraggio.
 */
export type Criterio = 'area' | 'latoCorto' | 'bassoSinistra';

export const CRITERI: Criterio[] = ['area', 'latoCorto', 'bassoSinistra'];

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
  /** id del pezzo in lista: serve a segnalarlo nella riga da cui viene */
  id: string;
  /** identità della singola copia rimasta fuori (`idPezzo#indice`) */
  chiave: string;
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
 * Quanto è buona questa posizione, secondo il criterio scelto: numeri più
 * bassi sono migliori. Il fattore 1e5 tiene separati i due livelli — prima
 * conta la grandezza principale, poi lo spareggio — restando ben dentro la
 * precisione dei numeri interi in virgola mobile.
 */
function punteggioPosizione(criterio: Criterio, f: Spazio, w: number, h: number): number {
  const restoL = f.w - w;
  const restoA = f.h - h;
  if (criterio === 'latoCorto') {
    return Math.min(restoL, restoA) * 1e5 + Math.max(restoL, restoA);
  }
  if (criterio === 'bassoSinistra') {
    return (f.y + h) * 1e5 + f.x;
  }
  // area: lo spazio che avanza meno; a pari area quello che resta meno sbilenco
  return (f.w * f.h - w * h) * 1e5 + Math.min(restoL, restoA);
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

  /** miglior posizione per un pezzo, o null se non ce n'è */
  cercaPosizione(
    w: number,
    h: number,
    ruotabile: boolean,
    criterio: Criterio = 'area'
  ): Posizione | null {
    let migliore: Posizione | null = null;
    const prova = (f: Spazio, pw: number, ph: number, ruotato: boolean) => {
      if (pw > f.w || ph > f.h) return;
      const punteggio = punteggioPosizione(criterio, f, pw, ph);
      if (!migliore || punteggio < migliore.punteggio) {
        migliore = { x: f.x, y: f.y, w: pw, h: ph, ruotato, punteggio };
      }
    };
    for (const f of this.liberi) {
      prova(f, w, h, false);
      if (ruotabile) prova(f, h, w, true);
    }
    return migliore;
  }

  /** occupa la posizione: gli spazi liberi che la toccano vengono ritagliati */
  occupa(n: Spazio): void {
    const out: Spazio[] = [];
    for (const f of this.liberi) {
      if (!this.taglia(f, n, out)) out.push(f);
    }
    this.liberi = out;
    this.potatura();
  }

  private taglia(f: Spazio, n: Spazio, out: Spazio[]): boolean {
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
    id: string;
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
      // un pezzo che NON può girare non si lascia forzare: con la venatura la
      // fibra comanda, e un verso imposto a mano quando la venatura non c'era
      // non deve sopravviverle
      const imposto = p.ruotabile ? par.orientamenti?.[chiave] : undefined;
      istanze.push({
        chiave,
        id: p.id,
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
      scartati.push({
        id: it.id,
        chiave: it.chiave,
        nome: it.nome,
        larghezzaFinita: it.finitaL,
        altezzaFinita: it.finitaA
      });
      continue;
    }

    let migliore: Posizione | null = null;
    let lastraScelta: Contenitore | null = null;
    for (const c of lastre) {
      const pos = c.cercaPosizione(usaL, usaA, puoGirare, par.criterio);
      if (pos && (!migliore || pos.punteggio < migliore.punteggio)) {
        migliore = pos;
        lastraScelta = c;
      }
    }
    if (!migliore) {
      // con un tetto al numero di lastre (bobina) ciò che non entra resta fuori
      if (par.massimoLastre != null && lastre.length >= par.massimoLastre) {
        scartati.push({
        id: it.id,
        chiave: it.chiave,
        nome: it.nome,
        larghezzaFinita: it.finitaL,
        altezzaFinita: it.finitaA
      });
        continue;
      }
      const nuova = new Contenitore(binL, binA);
      lastre.push(nuova);
      migliore = nuova.cercaPosizione(usaL, usaA, puoGirare, par.criterio);
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
 * RISALITA: i pezzi si stringono verso la testa del rotolo.
 *
 * L'impacchettamento appoggia ogni pezzo in cima allo spazio libero che ha
 * trovato, ma quello spazio può cominciare più in basso di dov'è finito il
 * pezzo accanto: restano buchi, e un buco in mezzo a una colonna tiene i pezzi
 * più in basso di quanto serva. Quando due pezzi stretti incolonnati scendono
 * sotto la fine della fila che hanno di fianco, fanno da ponte fra un blocco e
 * il successivo: la lama non ha più dove passare e il rotolo si stacca tutto
 * intero, nove metri e mezzo che al banco non si maneggiano.
 *
 * Qui i pezzi risalgono uno alla volta partendo dal primo, ciascuno fino a
 * toccare — a distanza di lama — quello che incontra sopra di sé nella sua
 * colonna. È il movimento contrario alla caduta dentro il blocco, e ha la
 * stessa garanzia: nessuno scavalca nessuno, le distanze di taglio non
 * cambiano, il materiale usato non può che diminuire. Una colonna intera si
 * sposta insieme, ed è quello che serve: preso da solo, nessuno dei due pezzi
 * incolonnati avrebbe avuto lo spazio per salire.
 */
export function risalgono(esito: EsitoNesting, lama: number, margine: number): EsitoNesting {
  return {
    scartati: esito.scartati,
    lastre: esito.lastre.map((l) => {
      const messi: Piazzamento[] = [];
      for (const p of [...l.piazzamenti].sort((a, b) => a.y - b.y)) {
        let limite = margine;
        for (const q of messi) {
          const incrociaX = p.x < q.x + q.larghezza - 1e-6 && p.x + p.larghezza > q.x + 1e-6;
          if (incrociaX) limite = Math.max(limite, q.y + q.altezza + lama);
        }
        // solo in su: scendere allungherebbe il rotolo
        messi.push({ ...p, y: Math.min(p.y, limite) });
      }
      return { piazzamenti: messi };
    })
  };
}

/** com'è fatta una copia: misure d'ingombro e libertà di girare */
interface IngombroCopia {
  packL: number;
  packA: number;
  /** libero di girare: nessuna venatura e nessun verso imposto a mano */
  libero: boolean;
}

function ingombriPerCopia(par: ParametriNesting, pezzi: PezzoNesting[]): Map<string, IngombroCopia> {
  const mappa = new Map<string, IngombroCopia>();
  for (const p of pezzi) {
    const q = Math.max(0, Math.round(p.quantita) || 0);
    for (let i = 0; i < q; i++) {
      const chiave = `${p.id}#${i}`;
      const imposto = p.ruotabile ? par.orientamenti?.[chiave] : undefined;
      mappa.set(chiave, {
        packL: p.larghezza + par.abbondanza + par.lama,
        packA: p.altezza + par.abbondanza + par.lama,
        libero: imposto == null && p.ruotabile
      });
    }
  }
  return mappa;
}

/**
 * COMPATTAZIONE: nessun pezzo resta indietro se davanti c'è posto.
 *
 * L'impacchettamento è avido — piazza un pezzo alla volta e non torna mai
 * indietro — così capita che l'ultimo pezzo piccolo finisca da solo in coda,
 * allungando la bobina di mezzo metro, mentre a fianco dei pezzi già messi
 * c'era una tasca dove entrava benissimo.
 *
 * Qui si rimette in discussione un pezzo alla volta, partendo dai più
 * arretrati: si toglie, si guarda dove starebbe meglio nel disegno rimasto —
 * girandolo, se è libero di girare — e lo si sposta solo se finisce più
 * avanti di dov'era. Gli altri pezzi non si muovono, quindi ogni spostamento
 * è un guadagno netto e il procedimento si ferma da solo.
 *
 * Alla fine si riprovano i pezzi rimasti fuori: lo spazio recuperato può
 * bastare a farceli entrare.
 */
function compatta(
  par: ParametriNesting,
  pezzi: PezzoNesting[],
  esito: EsitoNesting,
  giriMassimi = 3
): EsitoNesting {
  const { lama, margine } = par;
  const binL = par.lastra.larghezza - 2 * margine + lama;
  const binA = par.lastra.altezza - 2 * margine + lama;
  const ingombri = ingombriPerCopia(par, pezzi);

  /** contenitore che rispecchia una lastra, meno un pezzo eventualmente escluso */
  const ricostruisci = (piazzamenti: Piazzamento[], escluso?: Piazzamento) => {
    const c = new Contenitore(binL, binA);
    for (const p of piazzamenti) {
      if (p === escluso) continue;
      c.occupa({
        x: p.x - margine,
        y: p.y - margine,
        w: p.larghezza + lama,
        h: p.altezza + lama
      });
    }
    return c;
  };

  // copie proprie dei pezzi: qui si spostano, e la disposizione di partenza
  // deve restare intatta per il confronto finale
  const lastre = esito.lastre.map((l) => ({ piazzamenti: l.piazzamenti.map((p) => ({ ...p })) }));

  for (const lastra of lastre) {
    for (let giro = 0; giro < giriMassimi; giro++) {
      let mosso = false;
      // dai più arretrati ai più avanzati: sono quelli che allungano il lavoro
      const ordine = [...lastra.piazzamenti].sort(
        (a, b) => b.y + b.altezza - (a.y + a.altezza)
      );
      for (const pc of ordine) {
        const ing = ingombri.get(pc.chiave);
        if (!ing) continue;
        const usaL = pc.ruotato ? ing.packA : ing.packL;
        const usaA = pc.ruotato ? ing.packL : ing.packA;
        const pos = ricostruisci(lastra.piazzamenti, pc).cercaPosizione(
          usaL,
          usaA,
          ing.libero,
          'bassoSinistra'
        );
        if (!pos) continue;
        if (pos.y + pos.h >= pc.y - margine + pc.altezza + lama - 1e-6) continue;
        pc.x = pos.x + margine;
        pc.y = pos.y + margine;
        pc.larghezza = pos.w - lama;
        pc.altezza = pos.h - lama;
        // `pos.ruotato` è relativo al verso attuale: girarlo di nuovo lo riporta
        // com'era all'inizio
        if (pos.ruotato) pc.ruotato = !pc.ruotato;
        mosso = true;
      }
      if (!mosso) break;
    }
  }

  // i pezzi rimasti fuori: con lo spazio recuperato qualcuno può rientrare
  const scartati: PezzoScartato[] = [];
  for (const s of esito.scartati) {
    const ing = ingombri.get(s.chiave);
    let entrato = false;
    if (ing) {
      for (const lastra of lastre) {
        const pos = ricostruisci(lastra.piazzamenti).cercaPosizione(
          ing.packL,
          ing.packA,
          ing.libero,
          'bassoSinistra'
        );
        if (!pos) continue;
        lastra.piazzamenti.push({
          x: pos.x + margine,
          y: pos.y + margine,
          larghezza: pos.w - lama,
          altezza: pos.h - lama,
          larghezzaFinita: s.larghezzaFinita,
          altezzaFinita: s.altezzaFinita,
          nome: s.nome,
          tinta: tintaDi(pezzi, s.id),
          ruotato: pos.ruotato,
          chiave: s.chiave
        });
        entrato = true;
        break;
      }
    }
    if (!entrato) scartati.push(s);
  }

  return { lastre, scartati };
}

function tintaDi(pezzi: PezzoNesting[], id: string): number {
  return pezzi.find((p) => p.id === id)?.tinta ?? 0;
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
function qualita(par: ParametriNesting, e: EsitoNesting, opzioni?: OpzioniRicerca): Punteggio {
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
      for (const s of segmentaBobina(
        l,
        opzioni.bloccoMassimo,
        par.margine,
        par.lastra.larghezza,
        par.lama
      )) {
        if (s.oltreMassimo) ingestibili++;
      }
    }
  }
  // i ritagli si contano una volta sola per lastra: sono la parte cara del
  // conto, e questo punteggio si calcola centinaia di volte per ogni ricerca
  let ritaglio = 0;
  let buchi = 0;
  if (opzioni?.sfridoRettangolare) {
    for (const l of e.lastre) {
      ritaglio += ritaglioLastra(par, l);
      buchi += buchiLastra(par, l);
    }
  }
  return [-piazzati, e.lastre.length, ingestibili, -allaTolleranza(par, ritaglio), buchi, occupata];
}

/**
 * IL RITAGLIO BUONO, cioè i pezzi di lastra che tornano in magazzino.
 *
 * Di quello che avanza conta una cosa sola: quanto è grande il RETTANGOLO
 * INTERO che ci si ricava. Un avanzo a gradini, per quanta area abbia, si
 * butta; lo stesso avanzo tutto da una parte è materiale.
 *
 * Conta il ritaglio più grande di ogni lastra. Contare anche i ritagli minori
 * è stato provato e misurato: sul lavoro vero non cambia una disposizione,
 * perché quando il ritaglio grande pareggia decidono già il verso dei pezzi e
 * l'ingombro chiuso — e costava il doppio del tempo di calcolo. Restano
 * comunque contati per essere MOSTRATI: quello che avanza si vede tutto.
 *
 * Da qui la regola che decide dove va un pezzo corto: sotto la colonna PIÙ
 * ALTA, non sotto una più bassa. Sotto la più alta sta nella sua ombra e le
 * altre colonne restano pari, così l'avanzo è un rettangolo solo che le
 * attraversa tutte; sotto una più bassa apre un gradino in mezzo e il
 * rettangolo si dimezza.
 *
 * TOLLERANZA. Due ritagli che differiscono di poco sono lo stesso ritaglio:
 * in laboratorio nessuno sceglie fra 2,74 e 2,77 m². Sotto quella soglia i
 * conti si pareggiano e a decidere passano i criteri dopo — il verso dei
 * pezzi e l'ingombro chiuso.
 */
function allaTolleranza(par: ParametriNesting, area: number): number {
  const passo = par.lastra.larghezza * par.lastra.altezza * TOLLERANZA_RITAGLIO;
  return passo > 0 ? Math.round(area / passo) * passo : area;
}

/**
 * Sotto questa frazione della lastra due ritagli si considerano uguali: è la
 * differenza che al banco non cambia cosa ci si ricava.
 */
const TOLLERANZA_RITAGLIO = 0.03;

/**
 * L'INGOMBRO CHIUSO, cioè quanto i pezzi riempiono il rettangolo che occupano.
 *
 * Serve a spareggiare quando il ritaglio è lo stesso: fra due disposizioni che
 * lasciano lo stesso rettangolo buono, è meglio quella in cui i pezzi stanno
 * stretti in un rettangolo pieno.
 *
 * L'esempio è due colonne alte e un pezzo corto sotto: in piedi l'ingombro si
 * allunga senza allargarsi e resta un buco grande quanto il pezzo; girato di
 * novanta gradi riempie la riga sotto le colonne e l'ingombro torna pieno.
 * Il ritaglio, in quel caso, è praticamente identico nei due modi — decide
 * questo.
 */
/** il ritaglio principale di una lastra, quello che comanda nel punteggio */
function ritaglioLastra(par: ParametriNesting, lastra: LastraNesting): number {
  const r = strisciaResidua(lastra, par.lastra.larghezza, par.lastra.altezza);
  return r ? r.larghezza * r.lunghezza : 0;
}

/** vuoto rimasto dentro l'ingombro dei pezzi di una lastra */
function buchiLastra(par: ParametriNesting, lastra: LastraNesting): number {
  if (lastra.piazzamenti.length === 0) return 0;
  const { lama, margine } = par;
  let dx = 0;
  let dy = 0;
  let area = 0;
  for (const p of lastra.piazzamenti) {
    // l'ingombro comprende la lama: fra due pezzi accostati non c'è vuoto,
    // c'è il taglio, e non va contato come spreco
    dx = Math.max(dx, p.x + p.larghezza + lama);
    dy = Math.max(dy, p.y + p.altezza + lama);
    area += (p.larghezza + lama) * (p.altezza + lama);
  }
  return Math.max(0, (dx - margine) * (dy - margine) - area);
}

export interface OpzioniRicerca {
  /**
   * Solo per la BOBINA: lunghezza del blocco che si riesce a maneggiare.
   * Fra due disposizioni quasi equivalenti si preferisce quella che si lascia
   * spezzare in blocchi di questa misura (vedi geometry/segmenti).
   */
  bloccoMassimo?: number;
  /**
   * Solo per le LASTRE: fra due disposizioni che aprono lo stesso numero di
   * lastre si preferisce quella che lascia l'avanzo più rettangolare, e i
   * pezzi sparsi vengono raccolti dove non mordono il ritaglio buono.
   */
  sfridoRettangolare?: boolean;
}

/** i criteri di `qualita`, in ordine di importanza */
type Punteggio = [number, number, number, number, number, number];

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
  const valuta = (e: EsitoNesting) => qualita(par, e, opzioni);

  let migliore: EsitoNesting | null = null;
  let punteggio: Punteggio | null = null;
  let strategia: Pick<ParametriNesting, 'ordinamento' | 'verso' | 'criterio'> = {};
  for (const ordinamento of ORDINAMENTI) {
    for (const verso of VERSI) {
      for (const criterio of CRITERI) {
        const e = calcolaNesting({ ...par, ordinamento, verso, criterio }, pezzi);
        const q = valuta(e);
        if (!punteggio || confronta(q, punteggio) < 0) {
          migliore = e;
          punteggio = q;
          strategia = { ordinamento, verso, criterio };
        }
      }
    }
  }
  if (!migliore || !punteggio) return { lastre: [], scartati: [] };

  // poi si gira un pezzo alla volta, tenendo solo i giri che migliorano
  const raffinato = affina(par, pezzi, strategia, migliore, punteggio, valuta);
  migliore = raffinato.esito;
  punteggio = raffinato.punteggio;

  // infine si stringe la disposizione: si recuperano i pezzi rimasti indietro
  // e si fanno risalire le colonne. Le due cose si aiutano — un pezzo tirato
  // avanti libera spazio a chi sta sopra — quindi si provano anche insieme e
  // si tiene quella che vale di più.
  for (const stretta of [
    () => compatta(par, pezzi, migliore!),
    () => risalgono(migliore!, par.lama, par.margine),
    () => risalgono(compatta(par, pezzi, migliore!), par.lama, par.margine)
  ]) {
    const e = stretta();
    const q = valuta(e);
    // a pari qualità si tiene la più stretta: costa uguale e si maneggia meglio
    if (confronta(q, punteggio!) <= 0) {
      migliore = e;
      punteggio = q;
    }
  }

  // su lastra, l'ultima parola è alla forma di quello che avanza
  if (opzioni?.sfridoRettangolare) {
    const raccolto = raccogliRimasugli(par, pezzi, migliore, valuta, punteggio);
    if (confronta(raccolto.punteggio, punteggio) < 0) migliore = raccolto.esito;
  }
  return migliore;
}

/** confronto lessicografico dei punteggi: <0 se «a» è meglio di «b» */
function confronta(a: Punteggio, b: Punteggio): number {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] - b[i];
  }
  return 0;
}

/**
 * RACCOGLIE I RIMASUGLI (solo su lastra).
 *
 * Il difetto si vede a colpo d'occhio: cinque colonne piene e, sotto, due
 * pezzetti soli. In materiale costano niente, ma fanno dell'ingombro una
 * scala invece che un rettangolo, e l'avanzo smette di essere una L — e quei
 * due pezzetti, spesso, entravano benissimo in una lastra già aperta.
 *
 * Qui si cercano proprio quelli: i pezzi che, tolti, farebbero crescere il
 * ritaglio buono della loro lastra. Si prova a rimetterli altrove — in
 * un'altra lastra o in un altro angolo della stessa — e si tiene lo
 * spostamento solo se il piano nel suo insieme migliora. Nessun pezzo viene
 * mai perso: se non trova posto, resta dov'è.
 */
function raccogliRimasugli(
  par: ParametriNesting,
  pezzi: PezzoNesting[],
  esito: EsitoNesting,
  valuta: (e: EsitoNesting) => Punteggio,
  partenza: Punteggio,
  giriMassimi = 2
): { esito: EsitoNesting; punteggio: Punteggio } {
  const { lama, margine } = par;
  const binL = par.lastra.larghezza - 2 * margine + lama;
  const binA = par.lastra.altezza - 2 * margine + lama;
  const ingombri = ingombriPerCopia(par, pezzi);

  let corrente = esito;
  let punteggio = partenza;

  for (let giro = 0; giro < giriMassimi; giro++) {
    // quanto guadagnerebbe ogni lastra a perdere un suo pezzo: i candidati
    // sono i pezzi che mordono il ritaglio
    const candidati: Array<{ lastra: number; indice: number; guadagno: number }> = [];
    corrente.lastre.forEach((l, iL) => {
      const ora = ritaglioLastra(par, l);
      l.piazzamenti.forEach((_, iP) => {
        const senza = {
          piazzamenti: l.piazzamenti.filter((_, k) => k !== iP)
        };
        const dopo = ritaglioLastra(par, senza);
        if (dopo > ora + 1e-6) candidati.push({ lastra: iL, indice: iP, guadagno: dopo - ora });
      });
    });
    if (candidati.length === 0) break;
    candidati.sort((a, b) => b.guadagno - a.guadagno);

    let mosso = false;
    for (const c of candidati.slice(0, 8)) {
      const partenzaLastra = corrente.lastre[c.lastra];
      const pc = partenzaLastra?.piazzamenti[c.indice];
      if (!pc) continue;
      const ing = ingombri.get(pc.chiave);
      if (!ing) continue;

      let meglio: { esito: EsitoNesting; punteggio: Punteggio } | null = null;
      for (let iL = 0; iL < corrente.lastre.length; iL++) {
        // il contenitore della lastra di destinazione, senza il pezzo in viaggio
        const c2 = new Contenitore(binL, binA);
        for (const q of corrente.lastre[iL].piazzamenti) {
          if (q === pc) continue;
          c2.occupa({
            x: q.x - margine,
            y: q.y - margine,
            w: q.larghezza + lama,
            h: q.altezza + lama
          });
        }
        for (const criterio of CRITERI) {
          const pos = c2.cercaPosizione(ing.packL, ing.packA, ing.libero, criterio);
          if (!pos) continue;
          const prova = trasloca(corrente, c.lastra, c.indice, iL, pos, margine, lama);
          const q = valuta(prova);
          if (confronta(q, punteggio) < 0 && (!meglio || confronta(q, meglio.punteggio) < 0)) {
            meglio = { esito: prova, punteggio: q };
          }
        }
      }
      if (meglio) {
        corrente = meglio.esito;
        punteggio = meglio.punteggio;
        mosso = true;
        break; // le posizioni sono cambiate: si ricomincia dai candidati
      }
    }
    if (!mosso) break;
  }
  return { esito: corrente, punteggio };
}

/** sposta una copia da una lastra all'altra, senza toccare le altre */
function trasloca(
  esito: EsitoNesting,
  daLastra: number,
  indice: number,
  aLastra: number,
  pos: Posizione,
  margine: number,
  lama: number
): EsitoNesting {
  const pc = esito.lastre[daLastra].piazzamenti[indice];
  const spostato: Piazzamento = {
    ...pc,
    x: pos.x + margine,
    y: pos.y + margine,
    larghezza: pos.w - lama,
    altezza: pos.h - lama,
    ruotato: pos.ruotato
  };
  const lastre = esito.lastre.map((l, i) => {
    let piazzamenti = l.piazzamenti;
    if (i === daLastra) piazzamenti = piazzamenti.filter((_, k) => k !== indice);
    if (i === aLastra) piazzamenti = [...piazzamenti.filter((p) => p !== pc), spostato];
    return { piazzamenti };
  });
  // una lastra svuotata non si tiene aperta
  return { lastre: lastre.filter((l) => l.piazzamenti.length > 0), scartati: esito.scartati };
}

/**
 * RAFFINATURA: si prova a girare un pezzo alla volta.
 *
 * La ricerca per strategie gira i pezzi tutti insieme, e questo non basta:
 * spesso il guadagno sta nel girarne DUE su venti, quelli che sbloccano una
 * fila. È il lavoro che finora toccava fare a mano nell'anteprima, un pezzo
 * dopo l'altro, guardando cosa succedeva.
 *
 * Qui lo fa il programma: prende la disposizione migliore, prova a rovesciare
 * il verso di ogni singola copia libera, rifà i conti e tiene il cambiamento
 * solo se il risultato migliora davvero. Ripete finché c'è da guadagnare (al
 * massimo due giri, perché il grosso si prende al primo).
 *
 * Restano fuori i pezzi bloccati dalla venatura e quelli girati a mano: quelli
 * hanno già il loro verso, deciso da chi lavora.
 */
function affina(
  par: ParametriNesting,
  pezzi: PezzoNesting[],
  strategia: Pick<ParametriNesting, 'ordinamento' | 'verso' | 'criterio'>,
  esito: EsitoNesting,
  punteggio: Punteggio,
  valuta: (e: EsitoNesting) => Punteggio,
  giriMassimi = 2
): { esito: EsitoNesting; punteggio: Punteggio } {
  const candidate: string[] = [];
  for (const p of pezzi) {
    if (!p.ruotabile) continue;
    const q = Math.max(0, Math.round(p.quantita) || 0);
    for (let i = 0; i < q; i++) {
      const chiave = `${p.id}#${i}`;
      if (par.orientamenti?.[chiave] == null) candidate.push(chiave);
    }
  }
  if (candidate.length === 0) return { esito, punteggio };

  let forzati: Record<string, boolean> = { ...(par.orientamenti ?? {}) };
  let corrente = esito;
  let q = punteggio;
  // tetto al lavoro: su liste lunghissime la raffinatura si ferma prima invece
  // di far aspettare chi sta scrivendo le misure
  let rifatti = 0;
  const massimoRifatti = 160;

  for (let giro = 0; giro < giriMassimi; giro++) {
    let migliorato = false;
    for (const chiave of candidate) {
      if (rifatti >= massimoRifatti) break;
      rifatti++;
      // il verso che il pezzo ha adesso: rovesciarlo è la mossa da provare
      const attuale = corrente.lastre
        .flatMap((l) => l.piazzamenti)
        .find((pc) => pc.chiave === chiave)?.ruotato;
      if (attuale == null) continue;
      const prova = { ...forzati, [chiave]: !attuale };
      const e = calcolaNesting({ ...par, ...strategia, orientamenti: prova }, pezzi);
      const nq = valuta(e);
      if (confronta(nq, q) < 0) {
        forzati = prova;
        corrente = e;
        q = nq;
        migliorato = true;
      }
    }
    if (!migliorato) break;
  }
  return { esito: corrente, punteggio: q };
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
