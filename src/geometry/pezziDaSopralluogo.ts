/**
 * DAL SOPRALLUOGO ALLA DISTINTA DI TAGLIO.
 *
 * Le forme quotate sulle foto sono già i pezzi da produrre: qui diventano
 * rettangoli da impaginare, con la MISURA DI TAGLIO — quella reale più le
 * abbondanze inserite sulla foto — riportata in millimetri.
 *
 * Il nesting lavora su rettangoli: di ogni forma si prende l'ingombro, cioè
 * il rettangolo minimo che la contiene. Per un rettangolo è la forma stessa;
 * per un cerchio il quadrato del diametro di taglio; per un poligono il suo
 * ingombro reale, allungato dalle abbondanze dei lati.
 */

import type { Annotazione, Foto, Punto, Unita } from '../db/types';
import { abbondanzaTotale, segmentiPoligono, segmentoELato } from '../db/types';
import { misuraSegmento } from './calibrazione';
import { misureElemento } from './calibrazione';
import { inMillimetri } from '../utils/format';

export interface PezzoDaMisura {
  /** nome leggibile: etichetta o nota della forma, altrimenti il tipo */
  nome: string;
  /** misure DI TAGLIO in millimetri (reale + abbondanze) */
  larghezza: number;
  altezza: number;
  quantita: number;
  /** vero se la forma aveva abbondanze inserite */
  conAbbondanze: boolean;
}

type CalibFoto = Pick<Foto, 'scala' | 'piano'>;

const mm = (v: number, u: Unita) => Math.round(inMillimetri(v, u) * 10) / 10;

/**
 * Ingombro reale di un poligono.
 *
 * Le misure di una forma vivono nelle QUOTE che ci si scrive sopra: una forma
 * può essere quotata benissimo su una foto mai calibrata, ed è il caso più
 * comune. Quindi l'ingombro si ricava dal disegno — che dà le proporzioni —
 * riportato in scala dalle misure scritte sui lati: un lato lungo 200 cm che
 * sul disegno misura 400 px dice che lì un pixel vale mezzo centimetro.
 *
 * La calibrazione della foto resta come ripiego, per le forme senza nemmeno
 * una misura scritta.
 */
function ingombroPoligono(
  punti: Punto[],
  segmenti: Array<{ da: number; a: number; valore: number | null }>,
  foto: CalibFoto,
  unita: Unita
): { larghezza: number; altezza: number } | null {
  if (punti.length < 2) return null;
  const xs = punti.map((p) => p.x);
  const ys = punti.map((p) => p.y);
  const largPx = Math.max(...xs) - Math.min(...xs);
  const altPx = Math.max(...ys) - Math.min(...ys);
  if (largPx <= 0 && altPx <= 0) return null;

  // scala ricavata dalle quote: separata per i lati orizzontali e verticali,
  // così una foto in prospettiva non falsa la direzione meno rappresentata
  const oriz: number[] = [];
  const vert: number[] = [];
  for (const s of segmenti) {
    if (s.valore === null || s.valore <= 0) continue;
    const p1 = punti[s.da];
    const p2 = punti[s.a];
    if (!p1 || !p2) continue;
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const px = Math.hypot(dx, dy);
    if (px < 1e-6) continue;
    (dx >= dy ? oriz : vert).push(s.valore / px);
  }
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const fx = media(oriz) ?? media(vert);
  const fy = media(vert) ?? media(oriz);

  if (fx !== null && fy !== null) {
    const larghezza = largPx * fx;
    const altezza = altPx * fy;
    if (larghezza > 0 && altezza > 0) return { larghezza, altezza };
  }

  // nessuna quota sui lati: si prova con la calibrazione della foto
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const larghezza = misuraSegmento({ x: x0, y: y0 }, { x: x1, y: y0 }, foto, unita);
  const altezza = misuraSegmento({ x: x0, y: y0 }, { x: x0, y: y1 }, foto, unita);
  if (larghezza === null || altezza === null || larghezza <= 0 || altezza <= 0) return null;
  return { larghezza, altezza };
}

/**
 * I pezzi ricavati dalle annotazioni di una foto.
 *
 * Le quote lineari, gli angoli e i testi non sono pezzi e vengono ignorati:
 * si tiene solo ciò che ha una superficie da tagliare.
 */
export function pezziDaAnnotazioni(
  annotazioni: Annotazione[],
  foto: CalibFoto
): PezzoDaMisura[] {
  const pezzi: PezzoDaMisura[] = [];

  for (const a of annotazioni) {
    if (a.tipo === 'quotaRett') {
      const m = misureElemento(a);
      // di un trapezio o di un quadrilatero si prende l'ingombro: il lato
      // più lungo in orizzontale e quello più lungo in verticale
      const larg = Math.max(m.baseSup ?? 0, m.baseInf ?? 0);
      const alt = Math.max(m.latoSx ?? 0, m.latoDx ?? 0);
      if (larg <= 0 || alt <= 0) continue;
      pezzi.push({
        nome: nomeDi(a.etichetta, undefined, nomeForma(m.forma)),
        larghezza: mm(larg, a.unita),
        altezza: mm(alt, a.unita),
        quantita: 1,
        conAbbondanze: false
      });
    } else if (a.tipo === 'quotaRaggio') {
      const diametro = a.modo === 'diametro' ? a.valore : a.valore === null ? null : a.valore * 2;
      if (diametro === null || diametro <= 0) continue;
      const margine = a.margine ?? 0;
      // il cerchio si taglia da un quadrato: il suo ingombro
      const lato = diametro + 2 * margine;
      pezzi.push({
        nome: nomeDi(undefined, a.nota, 'Cerchio'),
        larghezza: mm(lato, a.unita),
        altezza: mm(lato, a.unita),
        quantita: 1,
        conAbbondanze: margine > 0
      });
    } else if (a.tipo === 'quotaPoligono') {
      const segs = segmentiPoligono(a);
      const ing = ingombroPoligono(a.punti, segs, foto, a.unita);
      if (!ing) continue;
      // le abbondanze allungano i lati: quelle dei lati orizzontali entrano
      // nella larghezza, quelle dei lati verticali nell'altezza
      let extraL = 0;
      let extraA = 0;
      for (const s of segs) {
        const tot = abbondanzaTotale(s);
        if (tot <= 0 || !segmentoELato(s, a.punti.length)) continue;
        const p1 = a.punti[s.da];
        const p2 = a.punti[s.a];
        if (!p1 || !p2) continue;
        const orizzontale = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
        if (orizzontale) extraL = Math.max(extraL, tot);
        else extraA = Math.max(extraA, tot);
      }
      pezzi.push({
        nome: nomeDi(a.etichetta, undefined, `Poligono ${a.punti.length} lati`),
        larghezza: mm(ing.larghezza + extraL, a.unita),
        altezza: mm(ing.altezza + extraA, a.unita),
        quantita: 1,
        conAbbondanze: extraL > 0 || extraA > 0
      });
    }
  }

  return pezzi;
}

/**
 * Perché da questo sopralluogo non è uscito nessun pezzo.
 *
 * Serve a dare una risposta invece di un vicolo cieco: una foto piena di
 * quote lineari è «tutta quotata» per chi l'ha fatta, ma non contiene forme
 * chiuse, e sono quelle a diventare pezzi.
 */
export interface DiagnosiPezzi {
  /** rettangoli, poligoni e cerchi trovati */
  formeChiuse: number;
  /** di quelle, quante non hanno misure utilizzabili */
  senzaMisura: number;
  /** quote lineari semplici: misurano, ma non delimitano un pezzo */
  quoteLineari: number;
  /** quote tecniche, angoli, testi, disegni… */
  altre: number;
}

export function diagnosiPezzi(annotazioni: Annotazione[], foto: CalibFoto): DiagnosiPezzi {
  const d: DiagnosiPezzi = { formeChiuse: 0, senzaMisura: 0, quoteLineari: 0, altre: 0 };
  for (const a of annotazioni) {
    if (a.tipo === 'quotaRett' || a.tipo === 'quotaPoligono' || a.tipo === 'quotaRaggio') {
      d.formeChiuse++;
      if (pezziDaAnnotazioni([a], foto).length === 0) d.senzaMisura++;
    } else if (a.tipo === 'quota') {
      d.quoteLineari++;
    } else {
      d.altre++;
    }
  }
  return d;
}

/** pezzi uguali per nome e misura raccolti in una riga sola */
export function raggruppaPezzi(pezzi: PezzoDaMisura[]): PezzoDaMisura[] {
  const mappa = new Map<string, PezzoDaMisura>();
  for (const p of pezzi) {
    const chiave = `${p.nome}|${p.larghezza}×${p.altezza}`;
    const gia = mappa.get(chiave);
    if (gia) {
      gia.quantita += p.quantita;
      gia.conAbbondanze = gia.conAbbondanze || p.conAbbondanze;
    } else {
      mappa.set(chiave, { ...p });
    }
  }
  return [...mappa.values()];
}

function nomeDi(etichetta: string | undefined, nota: string | undefined, difetto: string): string {
  const e = etichetta?.trim();
  const n = nota?.trim();
  if (e && n) return `${difetto} ${e} — ${n}`;
  if (e) return `${difetto} ${e}`;
  if (n) return n;
  return difetto;
}

function nomeForma(f: string): string {
  if (f === 'rettangolo') return 'Rettangolo';
  if (f === 'trapezio') return 'Trapezio';
  return 'Quadrilatero';
}
