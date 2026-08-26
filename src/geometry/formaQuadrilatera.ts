/**
 * LA FORMA QUADRILATERA, COME LA VEDE LA PANNELLIZZAZIONE.
 *
 * Un telo si spezza lungo una retta: ha senso su una finestra o su una parete,
 * non su un pentagono. Qui una forma quotata a quattro angoli — la «quota
 * elemento» o un poligono di quattro vertici — viene letta in un modo solo:
 * i quattro angoli messi in verso (alto-sx, alto-dx, basso-dx, basso-sx), la
 * misura netta e la misura di taglio.
 *
 * È il traduttore fra il disegno sulla foto e il modello dei pannelli, e sta
 * apposta in un file suo: il disegno delle giunzioni, l'ambiente di modifica
 * e la distinta di taglio devono partire tutti dalle stesse quattro misure,
 * altrimenti la giunzione che si vede sulla foto non è quella che si taglia.
 */

import type { Annotazione, Punto, Unita } from '../db/types';
import { abbondanzaTotale, quadrilateroQuotaRett, segmentiPoligono } from '../db/types';
import { misureElemento } from './calibrazione';
import { ordinaQuad } from './punti';
import {
  giuntiValidi,
  normalizzaPannellizzazione,
  pannelliDi,
  type AbbondanzeTelo,
  type Pannellizzazione,
  type Pannello
} from './pannelli';

export interface FormaQuadrilatera {
  /** angoli in ordine: alto-sx, alto-dx, basso-dx, basso-sx (px immagine) */
  quad: [Punto, Punto, Punto, Punto];
  /** misure a vista, senza abbondanze, nell'unità della forma */
  netta: { larghezza: number; altezza: number };
  /** misure DI TAGLIO: quelle che devono stare nella fascia del rotolo */
  taglio: { larghezza: number; altezza: number };
  /**
   * Quanto sborda l'abbondanza su ciascun lato. Non si può assumere
   * simmetrica: due centimetri ai lati e dieci sotto è il caso normale, non
   * l'eccezione, e i teli che ne escono sono di misure diverse.
   */
  abbondanze: { sinistra: number; destra: number; sopra: number; sotto: number };
  unita: Unita;
}

/** true se su questa forma la pannellizzazione ha un senso */
export function ePannellizzabile(a: Annotazione): boolean {
  if (a.tipo === 'quotaRett') return true;
  return a.tipo === 'quotaPoligono' && a.punti.length === 4 && !a.soloEtichetta;
}

/**
 * Le quattro misure della forma, o null se non è un quadrilatero misurato.
 *
 * Senza le misure scritte non si pannellizza: dividere in teli vuol dire
 * decidere dei centimetri, e i centimetri stanno nelle quote, non nel disegno.
 */
export function formaQuadrilatera(a: Annotazione): FormaQuadrilatera | null {
  if (a.tipo === 'quotaRett') {
    const m = misureElemento(a);
    const larghezza = massimo(m.baseSup, m.baseInf);
    const altezza = massimo(m.latoSx, m.latoDx);
    if (larghezza === null || altezza === null) return null;
    const misure = { larghezza, altezza };
    return {
      quad: quadrilateroQuotaRett(a),
      netta: misure,
      // la quota elemento non porta abbondanze: taglio e netto coincidono
      taglio: { ...misure },
      abbondanze: { sinistra: 0, destra: 0, sopra: 0, sotto: 0 },
      unita: a.unita
    };
  }

  if (a.tipo !== 'quotaPoligono' || a.punti.length !== 4 || a.soloEtichetta) return null;

  const quad = ordinaQuad(a.punti);
  // dalla posizione nel verso (0 alto-sx … 3 basso-sx) all'indice del vertice
  // com'è scritto nell'annotazione: i segmenti quotati parlano quella lingua
  const indice = quad.map((p) => a.punti.indexOf(p));
  if (indice.some((i) => i < 0)) return null;

  const segmenti = segmentiPoligono(a);
  const lato = (da: number, aVertice: number) =>
    segmenti.find(
      (s) =>
        (s.da === indice[da] && s.a === indice[aVertice]) ||
        (s.da === indice[aVertice] && s.a === indice[da])
    ) ?? null;

  const alto = lato(0, 1);
  const destro = lato(1, 2);
  const basso = lato(2, 3);
  const sinistro = lato(3, 0);

  const valore = (s: typeof alto) => (s && s.valore !== null && s.valore > 0 ? s.valore : null);

  /**
   * L'abbondanza di un lato AL VERTICE indicato.
   *
   * Su un segmento le due abbondanze stanno ai suoi estremi, e quale sia
   * «inizio» dipende da come il lato è stato tracciato: si guarda a quale
   * vertice corrisponde, non all'ordine in cui è scritto.
   */
  const abbondanzaAl = (s: typeof alto, verticeOrdinato: number): number => {
    if (!s) return 0;
    if (s.da === indice[verticeOrdinato]) return s.abbInizio ?? 0;
    if (s.a === indice[verticeOrdinato]) return s.abbFine ?? 0;
    return 0;
  };

  const larghezza = massimo(valore(alto), valore(basso));
  const altezza = massimo(valore(sinistro), valore(destro));
  if (larghezza === null || altezza === null) return null;

  /**
   * L'ingombro di taglio lungo un asse, e da che parte sborda.
   *
   * Comanda il LATO PIÙ LUNGO con le sue abbondanze, non la somma di tutte:
   * in un trapezio la base corta abbondata di cinque per parte può restare
   * dentro l'ingombro della base lunga, e sommarle darebbe un pezzo più
   * grande di quello che si taglia davvero. È la stessa regola della distinta
   * (`ingombroTaglio`): le due misure devono coincidere sempre.
   */
  const asse = (
    netto: number,
    lati: Array<{ s: typeof alto; primo: number; secondo: number }>
  ): { taglio: number; prima: number; dopo: number } => {
    let taglioMax = netto;
    for (const l of lati) {
      const v = valore(l.s);
      if (v === null) continue;
      taglioMax = Math.max(taglioMax, v + abbondanzaTotale(l.s!));
    }
    // di quanto si sborda ai due capi: lo dice il lato che determina
    // l'ingombro, non uno qualunque
    let prima = 0;
    let dopo = 0;
    for (const l of lati) {
      const v = valore(l.s);
      if (v === null || v + abbondanzaTotale(l.s!) < taglioMax) continue;
      prima = Math.max(prima, abbondanzaAl(l.s, l.primo));
      dopo = Math.max(dopo, abbondanzaAl(l.s, l.secondo));
    }
    // l'ingombro comanda: se il lato che lo determina è più corto del netto,
    // le sue abbondanze non allargano oltre. Si riportano in proporzione, così
    // netto + prima + dopo fa sempre l'ingombro
    const extra = taglioMax - netto;
    const somma = prima + dopo;
    if (somma <= 0) return { taglio: taglioMax, prima: 0, dopo: 0 };
    const scala = extra / somma;
    return { taglio: taglioMax, prima: prima * scala, dopo: dopo * scala };
  };

  // in larghezza i capi sono sinistra (vertici 0 e 3) e destra (1 e 2);
  // in altezza sono sopra (0 e 1) e sotto (3 e 2)
  const orizzontale = asse(larghezza, [
    { s: alto, primo: 0, secondo: 1 },
    { s: basso, primo: 3, secondo: 2 }
  ]);
  const verticale = asse(altezza, [
    { s: sinistro, primo: 0, secondo: 3 },
    { s: destro, primo: 1, secondo: 2 }
  ]);

  return {
    quad,
    netta: { larghezza, altezza },
    taglio: { larghezza: orizzontale.taglio, altezza: verticale.taglio },
    abbondanze: {
      sinistra: orizzontale.prima,
      destra: orizzontale.dopo,
      sopra: verticale.prima,
      sotto: verticale.dopo
    },
    unita: a.unita
  };
}

/** la pannellizzazione applicata a una forma, se c'è e se regge */
export function pannellizzazioneDi(a: Annotazione): Pannellizzazione | null {
  if (a.tipo === 'quotaRett' || a.tipo === 'quotaPoligono') return a.pannelli ?? null;
  return null;
}

export interface PannelliForma {
  forma: FormaQuadrilatera;
  /** la pannellizzazione RISANATA: è questa che comanda, non quella salvata */
  pann: Pannellizzazione;
  /**
   * Le giunzioni che contano davvero, dentro il pezzo e in ordine. Chi disegna
   * deve usare queste: una giunzione salvata e poi finita fuori — perché la
   * misura è cambiata — non ha un telo suo, e disegnarla lascerebbe una riga
   * verde che non corrisponde a niente.
   */
  giunti: number[];
  pannelli: Pannello[];
  /** misura DEL VETRO lungo l'asse di divisione: è lei che si divide */
  totale: number;
  /** l'altra misura del vetro */
  trasversale: number;
  /** le abbondanze attorno al vetro, viste dall'asse */
  abbondanze: AbbondanzeTelo;
}

/** i teli di una forma pannellizzata, misure di taglio comprese */
export function pannelliDellaForma(a: Annotazione): PannelliForma | null {
  const salvata = pannellizzazioneDi(a);
  if (!salvata) return null;
  const forma = formaQuadrilatera(a);
  if (!forma) return null;
  // un salvataggio vecchio o arrivato da un altro dispositivo può contenere di
  // tutto: si risana PRIMA di leggere l'asse, o si sceglierebbe la misura da
  // dividere con una regola e l'asse con un'altra
  const asse = salvata.asse === 'orizzontale' ? 'orizzontale' : 'verticale';
  const verticale = asse === 'verticale';
  // SI DIVIDE IL VETRO: le giunzioni sono posizioni sull'elemento finito
  const totale = verticale ? forma.netta.larghezza : forma.netta.altezza;
  const pann = normalizzaPannellizzazione(salvata, totale);
  if (!pann) return null;
  const trasversale = verticale ? forma.netta.altezza : forma.netta.larghezza;
  const abbondanze = abbondanzeSullAsse(forma, asse);
  const pannelli = pannelliDi(totale, trasversale, pann, abbondanze);
  if (pannelli.length <= 1) return null;
  return {
    forma,
    pann,
    giunti: giuntiValidi(pann.giunti, totale),
    pannelli,
    totale,
    trasversale,
    abbondanze
  };
}

/** le abbondanze della forma, girate nel verso dell'asse di divisione */
export function abbondanzeSullAsse(
  forma: FormaQuadrilatera,
  asse: Pannellizzazione['asse']
): AbbondanzeTelo {
  const a = forma.abbondanze;
  return asse === 'verticale'
    ? { inizio: a.sinistra, fine: a.destra, trasversaleInizio: a.sopra, trasversaleFine: a.sotto }
    : { inizio: a.sopra, fine: a.sotto, trasversaleInizio: a.sinistra, trasversaleFine: a.destra };
}

function massimo(a: number | null, b: number | null): number | null {
  const valori = [a, b].filter((v): v is number => v !== null && v > 0);
  return valori.length ? Math.max(...valori) : null;
}
