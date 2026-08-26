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
import { quadrilateroQuotaRett, segmentiPoligono } from '../db/types';
import { misureElemento } from './calibrazione';
import { ordinaQuad } from './punti';
import {
  giuntiValidi,
  normalizzaPannellizzazione,
  pannelliDi,
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
   * Quanto sborda l'abbondanza PRIMA del bordo di riferimento — a sinistra per
   * la larghezza, in alto per l'altezza. Non si può assumere simmetrica: chi
   * lascia dieci centimetri sotto e niente sopra sposterebbe tutte le
   * giunzioni disegnate sulla foto.
   */
  scostamento: { larghezza: number; altezza: number };
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
      scostamento: { larghezza: 0, altezza: 0 },
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

  // la larghezza cresce con le abbondanze agli angoli di sinistra e di destra;
  // l'altezza con quelle agli angoli di sopra e di sotto
  const sinistraL = Math.max(abbondanzaAl(alto, 0), abbondanzaAl(basso, 3));
  const destraL = Math.max(abbondanzaAl(alto, 1), abbondanzaAl(basso, 2));
  const sopraA = Math.max(abbondanzaAl(sinistro, 0), abbondanzaAl(destro, 1));
  const sottoA = Math.max(abbondanzaAl(sinistro, 3), abbondanzaAl(destro, 2));

  return {
    quad,
    netta: { larghezza, altezza },
    taglio: {
      larghezza: larghezza + sinistraL + destraL,
      altezza: altezza + sopraA + sottoA
    },
    scostamento: { larghezza: sinistraL, altezza: sopraA },
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
  /** misura lungo l'asse di divisione, di taglio */
  totale: number;
  /** l'altra misura, di taglio */
  trasversale: number;
  /**
   * Abbondanza che sta PRIMA del bordo di riferimento, lungo l'asse di
   * divisione. Le giunzioni si contano sulla misura di taglio; per disegnarle
   * sulla foto — che mostra la forma netta — bisogna toglierla.
   */
  scostamento: number;
  /** la stessa cosa, di traverso: serve a fermare le linee sul bordo a vista */
  scostamentoTrasversale: number;
}

/** i teli di una forma pannellizzata, misure di taglio comprese */
export function pannelliDellaForma(a: Annotazione): PannelliForma | null {
  const salvata = pannellizzazioneDi(a);
  if (!salvata) return null;
  const forma = formaQuadrilatera(a);
  if (!forma) return null;
  const verticale = salvata.asse === 'verticale';
  const totale = verticale ? forma.taglio.larghezza : forma.taglio.altezza;
  // un salvataggio vecchio o arrivato da un altro dispositivo può contenere di
  // tutto: si risana qui, una volta, e da qui in poi tutti vedono la stessa cosa
  const pann = normalizzaPannellizzazione(salvata, totale);
  if (!pann) return null;
  const trasversale = verticale ? forma.taglio.altezza : forma.taglio.larghezza;
  const pannelli = pannelliDi(totale, trasversale, pann);
  if (pannelli.length <= 1) return null;
  return {
    forma,
    pann,
    giunti: giuntiValidi(pann.giunti, totale),
    pannelli,
    totale,
    trasversale,
    scostamento: verticale ? forma.scostamento.larghezza : forma.scostamento.altezza,
    scostamentoTrasversale: verticale ? forma.scostamento.altezza : forma.scostamento.larghezza
  };
}

function massimo(a: number | null, b: number | null): number | null {
  const valori = [a, b].filter((v): v is number => v !== null && v > 0);
  return valori.length ? Math.max(...valori) : null;
}
