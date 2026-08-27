/**
 * NESTING A SAGOMA REALE.
 *
 * Il motore rettangolare (geometry/nesting.ts) conosce solo ingombri: un
 * trapezio occupa il rettangolo che lo contiene e il triangolo mancante è
 * sprecato. Questo motore rasterizza la SAGOMA VERA di ogni pezzo su una
 * griglia — con inflazione conservativa di (lama+abbondanza)/2 per lato: una
 * cella è occupata se interseca la sagoma gonfiata, mai sotto-copertura,
 * quindi mai sovrapposizioni reali — e la appoggia con scansione bottom-left
 * su una bitmap di occupazione. Le rotazioni provate sono 0/90/180/270 dove
 * consentite: è il 180° che fa incastrare trapezi e triangoli testa-coda.
 *
 * Produce lo stesso EsitoNesting del motore rettangolare: ogni piazzamento
 * mantiene x/y/larghezza/altezza = INGOMBRO del pezzo (abbondanza compresa,
 * lama esclusa, come nell'altro motore), così segmenti, avanzi, PDF e SVG
 * continuano a funzionare senza saperne niente. In più porta i VERTICI della
 * sagoma, relativi al piazzamento: chi disegna li usa, chi sposta il
 * piazzamento lungo il rotolo (trasla, cadono) non deve toccarli.
 *
 * Punti da NON cambiare, pagati con bug veri nella messa a punto:
 * - il criterio di scelta a parità di posizione (`mk.h < best.mask.h`) è
 *   stato scelto confrontando cinque politiche su sei scenari reali: è quello
 *   che riduce le lastre sui giri di trapezi e falde. Politiche apparentemente
 *   più furbe («appoggia il lato pieno al fronte») peggioravano il caso reale
 *   di una lastra intera. Non sostituirlo a intuito.
 * - la normale di ogni lato in `mascheraSagoma` è orientata verso l'esterno
 *   tramite il centroide (i poligoni non hanno winding garantito) e la
 *   rasterizzazione assume poligoni CONVESSI (span unico per riga).
 */

import {
  calcolaNestingMigliore,
  type EsitoNesting,
  type OpzioniRicerca,
  type ParametriNesting,
  type PezzoNesting,
  type Piazzamento
} from './nesting';
import { haSagome } from './sagome';
import {
  areaForma,
  formaDi,
  ingombroForma,
  mascheraSagoma,
  misureComplete,
  poligonoSagoma,
  orientazioniPer,
  rotazioniPer,
  ruotaPunti,
  sagomaDiTaglio,
  type MascheraSagoma
} from './sagome';

/**
 * IL MOTORE GIUSTO PER LA LISTA, in un posto solo.
 *
 * L'anteprima, il PDF e l'SVG per la macchina ricalcolano il nesting ognuno
 * per conto suo: se scegliessero il motore ognuno a modo suo, quello che si
 * guarda a schermo non sarebbe quello che si taglia. Con almeno una sagoma
 * lavora il motore a forme vere; con soli rettangoli il MaxRects, che sui
 * rettangoli rende di più (prova strategie, criteri e versi).
 */
export function calcolaNestingAuto(
  par: ParametriNesting,
  pezzi: PezzoNesting[],
  opzioni?: OpzioniRicerca
): EsitoNesting {
  return haSagome(pezzi) ? calcolaNestingSagome(par, pezzi) : calcolaNestingMigliore(par, pezzi, opzioni);
}

/** oltre questo numero di copie il calcolo si tronca, e lo si dice */
const MASSIME_COPIE = 600;

export interface EsitoSagome extends EsitoNesting {
  /** copie escluse perché il pezzo non ha le misure che la sua forma richiede */
  incompleti: number;
  /** copie oltre il tetto di calcolo, non provate */
  oltreLimite: number;
  /** lato della cella raster usata (mm): la precisione del calcolo */
  cella: number;
}

interface Istanza {
  chiave: string;
  pezzo: PezzoNesting;
  /** ingombro finito del pezzo (per ordinamento e scarti) */
  ingL: number;
  ingA: number;
}

/** la bitmap di occupazione di una lastra: parole Uint32 per riga */
interface Foglio {
  occ: Uint32Array;
  /** dove sta ogni pezzo, in celle; i piazzamenti si costruiscono alla fine */
  posti: Posto[];
  fallite: Record<string, 1>;
  celleLibere: number;
}

interface Posto {
  it: Istanza;
  cx: number;
  cy: number;
  rot: number;
  mask: MascheraSagoma;
}

function entraAt(
  occ: Uint32Array,
  wpr: number,
  mask: MascheraSagoma,
  cx: number,
  cy: number
): boolean {
  for (let j = 0; j < mask.rows.length; j++) {
    const sp = mask.rows[j];
    if (!sp) continue;
    const x0 = cx + sp[0];
    const x1 = cx + sp[1];
    const base = (cy + j) * wpr;
    const w0 = x0 >> 5;
    const w1 = x1 >> 5;
    if (w0 === w1) {
      if (occ[base + w0] & ((0xffffffff >>> (31 - (x1 - x0))) << (x0 & 31))) return false;
    } else {
      if (occ[base + w0] & (0xffffffff << (x0 & 31))) return false;
      for (let wi = w0 + 1; wi < w1; wi++) if (occ[base + wi]) return false;
      if (occ[base + w1] & (0xffffffff >>> (31 - (x1 & 31)))) return false;
    }
  }
  return true;
}

function segnaAt(
  occ: Uint32Array,
  wpr: number,
  mask: MascheraSagoma,
  cx: number,
  cy: number
): void {
  for (let j = 0; j < mask.rows.length; j++) {
    const sp = mask.rows[j];
    if (!sp) continue;
    const x0 = cx + sp[0];
    const x1 = cx + sp[1];
    const base = (cy + j) * wpr;
    const w0 = x0 >> 5;
    const w1 = x1 >> 5;
    if (w0 === w1) {
      occ[base + w0] |= (0xffffffff >>> (31 - (x1 - x0))) << (x0 & 31);
    } else {
      occ[base + w0] |= 0xffffffff << (x0 & 31);
      for (let wi = w0 + 1; wi < w1; wi++) occ[base + wi] = 0xffffffff;
      occ[base + w1] |= 0xffffffff >>> (31 - (x1 & 31));
    }
  }
}

/** bottom-left: prima posizione libera scandendo per righe (y, poi x) */
function cercaPosto(
  occ: Uint32Array,
  wpr: number,
  gridW: number,
  gridH: number,
  mask: MascheraSagoma,
  limiteY: number
): { cx: number; cy: number } | null {
  const maxCy = Math.min(gridH - mask.h, limiteY);
  const maxCx = gridW - mask.w;
  if (maxCx < 0 || maxCy < 0) return null;
  for (let cy = 0; cy <= maxCy; cy++) {
    for (let cx = 0; cx <= maxCx; cx++) {
      if (entraAt(occ, wpr, mask, cx, cy)) return { cx, cy };
    }
  }
  return null;
}

/**
 * Lato della cella raster.
 *
 * Sulle lastre è la formula originale del motore (griglia ≤ ~640 celle per
 * lato, ~220k in totale). La BOBINA di quest'app però è una striscia che può
 * essere lunga cinquanta metri: con quei tetti la cella verrebbe di otto
 * centimetri e lo spazio fra i pezzi diventerebbe sfrido. Sul rotolo i tetti
 * si allargano (la scansione parte comunque dal fondo già pieno, il costo
 * resta gestibile) — è un adattamento a questa app, non una miglioria del
 * criterio originale.
 */
function latoCella(bW: number, bH: number, bobina: boolean): number {
  const budgetDim = bobina ? 1600 : 640;
  const budgetArea = bobina ? 500_000 : 220_000;
  return Math.max(
    1,
    Math.ceil(Math.max(Math.max(bW, bH) / budgetDim, Math.sqrt((bW * bH) / budgetArea)) * 2) / 2
  );
}

export function calcolaNestingSagome(
  par: ParametriNesting,
  pezzi: PezzoNesting[]
): EsitoSagome {
  const { lama, abbondanza, margine } = par;
  const utileL = par.lastra.larghezza - 2 * margine;
  const utileA = par.lastra.altezza - 2 * margine;
  const esito: EsitoSagome = { lastre: [], scartati: [], incompleti: 0, oltreLimite: 0, cella: 0 };

  // le copie, con l'identità stabile `idPezzo#indice` (come l'altro motore:
  // gli avvisi per riga e gli scarti la usano per risalire al pezzo)
  const istanze: Istanza[] = [];
  for (const p of pezzi) {
    const q = Math.max(0, Math.round(p.quantita) || 0);
    if (!misureComplete(p)) {
      // misure che non bastano per la forma: fuori dal calcolo, MAI in silenzio
      esito.incompleti += q;
      continue;
    }
    const ing = ingombroForma(p);
    for (let i = 0; i < q; i++) {
      istanze.push({ chiave: `${p.id}#${i}`, pezzo: p, ingL: ing.larghezza, ingA: ing.altezza });
    }
  }
  if (utileL <= 0 || utileA <= 0) {
    esito.scartati = istanze.map((it) => scarto(it));
    return esito;
  }

  const pad = (lama + abbondanza) / 2;
  const bW = utileL + lama;
  const bobina = par.massimoLastre === 1;

  // Sul rotolo non si rasterizzano cinquanta metri: si lavora su una finestra
  // stimata dal materiale che serve, e la si allarga (fino al rotolo intero)
  // solo se qualcosa resta fuori. La stima abbondante costa poco; una griglia
  // da milioni di celle costerebbe a ogni battuta di tastiera.
  let bH = utileA + lama;
  if (bobina) {
    let areaPack = 0;
    let piuAlto = 0;
    for (const it of istanze) {
      areaPack += (it.ingL + 2 * pad) * (it.ingA + 2 * pad);
      piuAlto = Math.max(piuAlto, Math.max(it.ingL, it.ingA) + 2 * pad);
    }
    const stima = (areaPack / Math.max(1, bW)) * 1.6 + piuAlto + 2 * margine;
    bH = Math.min(bH, Math.max(stima, piuAlto * 2));
  }

  /**
   * L'ORDINE IN CUI SI APPOGGIANO I PEZZI: prima il LATO PIÙ LUNGO, poi
   * l'area d'ingombro gonfiata.
   *
   * Con una scansione bottom-left chi entra per primo si prende il fondo, e
   * un pezzo lungo arrivato tardi non trova più una fascia libera dove
   * stendersi. Misurato contro l'ordine per sola area su undici liste di
   * cantiere: non perde mai, e sulla lista che ha fatto venire fuori il
   * problema dei triangoli accorcia il rotolo di sedici centimetri. Costa
   * uguale — è solo un confronto diverso.
   *
   * Le soglie di resa di quelle liste stanno in __tests__/resaNesting.test.ts:
   * se una modifica qui spreca materiale, lì si vede.
   */
  const perArea = (a: Istanza, b: Istanza) =>
    (b.ingL + 2 * pad) * (b.ingA + 2 * pad) - (a.ingL + 2 * pad) * (a.ingA + 2 * pad);
  istanze.sort((a, b) => Math.max(b.ingL, b.ingA) - Math.max(a.ingL, a.ingA) || perArea(a, b));
  let daProvare = istanze;
  if (daProvare.length > MASSIME_COPIE) {
    esito.oltreLimite = daProvare.length - MASSIME_COPIE;
    daProvare = daProvare.slice(0, MASSIME_COPIE);
  }

  const limiteMassimo = utileA + lama;
  /**
   * IL GIRO DI PARTENZA.
   *
   * La scansione bottom-left appoggia il primo pezzo con la prima rotazione
   * che entra, e da lì in poi il pacco è deciso. Due triangoli storti uguali
   * si incastrano lungo il fianco obliquo SOLO se il primo è già girato di
   * mezzo giro — e il primo non può saperlo. Si rifà quindi il pacco partendo
   * da 180° e si tiene il migliore: è una ricerca ATTORNO al motore, non un
   * cambio del criterio di scelta interno, che è tarato (vedi in testa).
   * Si prova solo se c'è almeno un pezzo con quattro rotazioni: sui
   * rettangoli non cambierebbe niente e costerebbe il doppio.
   */
  const conGiro = daProvare.some((it) => rotazioniPer(it.pezzo).length === 4);
  /**
   * GLI ANGOLI OBLIQUI.
   *
   * I quarti di giro sono un'ipotesi da rettangoli: un rombo o un triangolo
   * storto, girati a mano, si mettono con UN LATO per terra, ed è così che
   * due pezzi combaciano lungo il fianco. Quegli angoli però non si possono
   * dare in pasto alla scansione insieme agli altri: provati tutti insieme
   * peggiorano il pacco di tre punti, perché il primo pezzo si affeziona a
   * un verso storto e il resto si arrangia. Si fa quindi un pacco INTERO a
   * quarti e uno INTERO ad angoli obliqui, e si tiene il migliore.
   */
  const conAngoli = daProvare.some((it) => {
    const f = formaDi(it.pezzo);
    return rotazioniPer(it.pezzo).length > 1 && f !== 'rett' && f !== 'cerchio';
  });

  // Si tiene il tentativo MIGLIORE, non l'ultimo. Allargare la finestra
  // ingrossa la cella, e basta un pezzo impossibile — più largo del rotolo, o
  // col verso bloccato — per far ritentare fino in fondo: alla cella grossa
  // finirebbero fuori anche pezzi che al primo giro entravano.
  const strategie: Array<{ seme: number; angoli: boolean }> = [{ seme: 0, angoli: false }];
  if (conGiro) strategie.push({ seme: 1, angoli: false });
  if (conAngoli) strategie.push({ seme: 0, angoli: true });
  let migliore: Giro | null = null;
  for (const { seme, angoli } of strategie) {
    let finestra = bH;
    for (let tentativo = 0; ; tentativo++) {
      const e = unGiro(par, daProvare, pad, bW, finestra, bobina, seme, angoli);
      if (!migliore || meglioDi(e, migliore)) migliore = e;
      // sul rotolo, se la finestra stimata non è bastata, si allarga e si
      // rifà: quello che non entra dev'essere un fatto del materiale, non
      // della stima
      if (bobina && e.scartati.length > 0 && finestra < limiteMassimo - 1e-6 && tentativo < 4) {
        finestra = Math.min(limiteMassimo, finestra * 2);
        continue;
      }
      break;
    }
  }
  esito.lastre = migliore!.lastre;
  esito.scartati = migliore!.scartati;
  esito.cella = migliore!.cella;
  return esito;
}

function scarto(it: Istanza) {
  return {
    id: it.pezzo.id,
    chiave: it.chiave,
    nome: it.pezzo.nome,
    larghezzaFinita: it.ingL,
    altezzaFinita: it.ingA
  };
}

type Giro = { lastre: EsitoNesting['lastre']; scartati: EsitoNesting['scartati']; cella: number };

/** quanto materiale occupa in lungo il risultato, sommando le lastre */
function estensione(e: Giro): number {
  let totale = 0;
  for (const l of e.lastre) {
    let piuGiu = 0;
    for (const pc of l.piazzamenti) piuGiu = Math.max(piuGiu, pc.y + pc.altezza);
    totale += piuGiu;
  }
  return totale;
}

/** a è meglio di b? meno scarti, poi meno lastre, poi più corto, poi più fine */
function meglioDi(a: Giro, b: Giro): boolean {
  if (a.scartati.length !== b.scartati.length) return a.scartati.length < b.scartati.length;
  if (a.lastre.length !== b.lastre.length) return a.lastre.length < b.lastre.length;
  const ea = estensione(a);
  const eb = estensione(b);
  if (Math.abs(ea - eb) > 1e-6) return ea < eb;
  return a.cella < b.cella;
}

function unGiro(
  par: ParametriNesting,
  istanze: Istanza[],
  pad: number,
  bW: number,
  bH: number,
  bobina: boolean,
  seme: number,
  /** vero = si provano anche gli angoli che appoggiano un lato per terra */
  angoli: boolean
): Giro {
  const { lama, abbondanza, margine } = par;
  const cs = latoCella(bW, bH, bobina);
  // La griglia copre anche l'ULTIMA cella, quella parziale: con Math.floor la
  // coda (bW mod cs) spariva, e un pezzo largo esattamente quanto l'utile —
  // una fascia a tutta bobina — veniva scartato ogni volta che la cella non
  // divideva la larghezza, cioè quasi sempre. Il vincolo vero non è a celle
  // ma in millimetri, ed è applicato pezzo per pezzo qui sotto (limX/limY).
  const gridW = Math.ceil(bW / cs - 1e-9);
  const gridH = Math.ceil(bH / cs - 1e-9);
  if (gridW < 1 || gridH < 1) {
    return { lastre: [], scartati: istanze.map((it) => scarto(it)), cella: cs };
  }
  const wpr = (gridW + 31) >> 5;
  const massimoFogli = par.massimoLastre ?? Infinity;

  const cache = new Map<string, MascheraSagoma>();
  const maschera = (p: PezzoNesting, rot: number): { chiave: string; m: MascheraSagoma } => {
    const chiave = `${formaDi(p)}|${p.larghezza}|${p.altezza}|${p.misura3 ?? 0}|${rot}`;
    let m = cache.get(chiave);
    if (!m) {
      m = mascheraSagoma(p, rot, pad, cs);
      cache.set(chiave, m);
    }
    return { chiave, m };
  };

  // origine della griglia sulla lastra: il contenitore è allargato di una
  // lama, come nell'altro motore, così l'ultimo taglio non ruba area utile
  const gx0 = margine - lama / 2;
  const gy0 = margine - lama / 2;

  const fogli: Foglio[] = [];
  const scartati: EsitoNesting['scartati'] = [];

  type Maschere = Array<[number, { chiave: string; m: MascheraSagoma }, number, number]>;
  const cacheMaschere = new Map<string, Maschere>();
  /** le maschere di un pezzo, con fin dove può arrivare la cella d'appoggio */
  const maschereDi = (it: Istanza): Maschere => {
    const p = it.pezzo;
    const aMano = p.ruotabile ? par.orientamenti?.[it.chiave] : undefined;
    const forzato =
      typeof aMano === 'number' ? aMano : aMano === true ? 90 : aMano === false ? 0 : null;
    const chiaveP = `${formaDi(p)}|${p.larghezza}|${p.altezza}|${p.misura3 ?? 0}|${p.ruotabile}|${angoli}|${forzato ?? ''}`;
    const gia = cacheMaschere.get(chiaveP);
    if (gia) return gia;
    const fuori: Maschere = [];
    // i quarti di giro rispettano già venatura e cerchi: se il pezzo è
    // bloccato su un verso solo, non lo si sblocca allargando gli angoli
    const quarti = rotazioniPer(p);
    const forma = formaDi(p);
    // il verso messo a mano vince sul calcolo: si prova SOLO quello (con la
    // venatura non si lascia forzare, la fibra comanda — come nell'altro
    // motore)
    const versi =
      forzato !== null
        ? [forzato]
        : angoli && quarti.length > 1 && forma !== 'rett' && forma !== 'cerchio'
          ? orientazioniPer(p)
          : quarti;
    for (const r of versi) {
      const mk = maschera(p, r);
      // Fin dove può arrivare la cella d'appoggio. Il vincolo che conta è in
      // millimetri — il pezzo gonfiato deve stare dentro bW×bH — quello a
      // celle serve solo a non scrivere fuori dalla riga del bitmap: si
      // prende il più stretto dei due.
      const girato = r === 90 || r === 270;
      const rw = (girato ? it.ingA : it.ingL) + 2 * pad;
      const rh = (girato ? it.ingL : it.ingA) + 2 * pad;
      const limX = Math.min(gridW - mk.m.w, Math.floor((bW - rw) / cs + 1e-9));
      const limY = Math.min(gridH - mk.m.h, Math.floor((bH - rh) / cs + 1e-9));
      fuori.push([r, mk, limX, limY]);
    }
    cacheMaschere.set(chiaveP, fuori);
    return fuori;
  };

  for (const it of istanze) {
    const tutte = maschereDi(it);
    // il giro di partenza: con quattro rotazioni si può cominciare da mezzo
    // giro, e a parità di posizione cambia quale verso viene appoggiato per
    // primo — è lì che nasce (o non nasce) l'incastro testa-coda
    const mezzo = seme > 0 ? Math.floor(tutte.length / 2) : 0;
    const maschere =
      mezzo > 0 ? [...tutte.slice(mezzo), ...tutte.slice(0, mezzo)] : tutte;
    const entraDaSolo = maschere.some(([, , limX, limY]) => limX >= 0 && limY >= 0);
    if (!entraDaSolo) {
      scartati.push(scarto(it));
      continue;
    }

    let piazzato = false;
    const nAperti = fogli.length;
    for (let si = 0; si <= nAperti && !piazzato; si++) {
      let foglio: Foglio;
      if (si === nAperti) {
        if (nAperti >= massimoFogli) break;
        foglio = {
          occ: new Uint32Array(wpr * gridH),
          posti: [],
          fallite: {},
          celleLibere: gridW * gridH
        };
        fogli.push(foglio);
      } else {
        foglio = fogli[si];
      }

      let best: { cx: number; cy: number; rot: number; mask: MascheraSagoma } | null = null;
      for (const [rot, mk, limX, limY] of maschere) {
        if (limX < 0 || limY < 0) continue;
        if (foglio.fallite[mk.chiave]) continue;
        if (mk.m.cells > foglio.celleLibere) {
          foglio.fallite[mk.chiave] = 1;
          continue;
        }
        const limitato = best !== null;
        const pos = cercaPosto(
          foglio.occ,
          wpr,
          limX + mk.m.w,
          limY + mk.m.h,
          mk.m,
          limitato ? best!.cy : gridH
        );
        if (pos) {
          // A parità di posizione si preferisce l'orientamento che avanza meno
          // sul fronte di scansione: il pacco resta compatto e lo spazio libero
          // più utilizzabile. Criterio scelto confrontando più politiche su
          // scenari reali (giri di trapezi e falde): non sostituirlo a intuito.
          if (
            !best ||
            pos.cy < best.cy ||
            (pos.cy === best.cy && pos.cx < best.cx) ||
            (pos.cy === best.cy && pos.cx === best.cx && mk.m.h < best.mask.h)
          ) {
            best = { cx: pos.cx, cy: pos.cy, rot, mask: mk.m };
          }
        } else if (!limitato) {
          foglio.fallite[mk.chiave] = 1;
        }
      }

      if (best) {
        segnaAt(foglio.occ, wpr, best.mask, best.cx, best.cy);
        foglio.celleLibere -= best.mask.cells;
        foglio.posti.push({ it, cx: best.cx, cy: best.cy, rot: best.rot, mask: best.mask });
        piazzato = true;
      }
    }
    if (!piazzato) scartati.push(scarto(it));
  }

  const lastre = fogli.map((f) => ({
    piazzamenti: f.posti.map((posto) =>
      piazzamentoDi(
        posto.it.pezzo,
        posto.it.chiave,
        posto.rot,
        // posizione della sagoma FINITA sulla lastra (margine compreso)
        gx0 + posto.cx * cs + pad,
        gy0 + posto.cy * cs + pad,
        abbondanza
      )
    )
  }));
  return { lastre, scartati, cella: cs };
}

/**
 * Il piazzamento nel formato dell'altro motore: x/y/larghezza/altezza sono
 * l'INGOMBRO con l'abbondanza (lama esclusa) — è il contratto su cui contano
 * segmenti, avanzi e statistiche — e i vertici della sagoma finita viaggiano
 * RELATIVI al piazzamento, così spostarlo lungo il rotolo non li rompe.
 */
function piazzamentoDi(
  p: PezzoNesting,
  chiave: string,
  rot: number,
  fx: number,
  fy: number,
  abbondanza: number
): Piazzamento {
  const mezzaAbb = abbondanza / 2;
  const base: Piazzamento = {
    x: fx - mezzaAbb,
    y: fy - mezzaAbb,
    larghezza: 0,
    altezza: 0,
    larghezzaFinita: p.larghezza,
    altezzaFinita: p.altezza,
    nome: p.nome,
    tinta: p.tinta,
    ruotato: rot === 90 || rot === 270,
    chiave,
    forma: formaDi(p),
    misura3Finita: p.misura3,
    rotazione: rot,
    areaVera: areaForma(p)
  };
  if (formaDi(p) === 'cerchio') {
    base.larghezza = p.larghezza + abbondanza;
    base.altezza = p.larghezza + abbondanza;
    base.altezzaFinita = p.larghezza;
    return base;
  }
  const punti = ruotaPunti(poligonoSagoma(p)!, rot);
  let rw = 0;
  let rh = 0;
  for (const q of punti) {
    if (q[0] > rw) rw = q[0];
    if (q[1] > rh) rh = q[1];
  }
  base.larghezza = rw + abbondanza;
  base.altezza = rh + abbondanza;
  // i vertici relativi al piazzamento sono la sagoma DI TAGLIO: la finita
  // gonfiata di mezza abbondanza per lato, come il rettangolo di sempre
  base.punti = sagomaDiTaglio(punti, mezzaAbb, base.larghezza, base.altezza);
  return base;
}
