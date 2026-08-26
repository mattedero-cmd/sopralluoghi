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

import type { Annotazione, Foto, Punto, QuotaPoligono, SegmentoQuota, Unita } from '../db/types';
import { abbondanzaTotale, segmentiPoligono, segmentoELato } from '../db/types';
import { misuraSegmento } from './calibrazione';
import { misureElemento } from './calibrazione';
import { nomeFormaPoligono, simboliPoligono } from './primitive';
import { pannelliDellaForma } from './formaQuadrilatera';
import { codicePannello } from './nomenclatura';
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

/** misura di taglio di un segmento: valore scritto + abbondanze */
function taglioSegmento(s: SegmentoQuota): number | null {
  if (s.valore === null || s.valore <= 0) return null;
  return s.valore + abbondanzaTotale(s);
}

/**
 * INGOMBRO DALLE MISURE SCRITTE, la stessa fonte del report.
 *
 * Un pezzo si taglia b × h: quanto è largo e alto sul disegno non conta, e
 * anzi inganna, perché la forma è tracciata a mano su una foto in prospettiva.
 * Il rettangolo quotato «b 140 · h 220 con +2 e +2 di lato e +10 sotto» è un
 * pezzo da 144 × 230 cm esatti, non 141,4 × 229,8.
 *
 * Si riconosce la forma come nel report e si leggono i lati per quello che
 * dicono. Restituisce null quando le misure non bastano — poligoni irregolari,
 * lati non quotati — e allora l'ingombro si ricava dal disegno.
 */
function ingombroDaQuote(q: QuotaPoligono): { larghezza: number; altezza: number } | null {
  const segs = segmentiPoligono(q);
  const n = q.punti.length;
  const forma = nomeFormaPoligono(q);
  const lati = segs.filter((s) => segmentoELato(s, n));

  // TRIANGOLO: i tre lati bastano a costruirlo. Si taglia appoggiato sul lato
  // più lungo, quindi l'ingombro è quel lato per l'altezza relativa.
  if (forma === 'Triangolo') {
    const v = lati.map(taglioSegmento);
    if (v.length !== 3 || v.some((x) => x === null)) return null;
    const [a, b, c] = v as number[];
    const sp = (a + b + c) / 2;
    const q2 = sp * (sp - a) * (sp - b) * (sp - c);
    if (q2 <= 0) return null; // lati che non chiudono un triangolo
    const base = Math.max(a, b, c);
    return { larghezza: base, altezza: (2 * Math.sqrt(q2)) / base };
  }

  const simboli = simboliPoligono(q);
  const larghezze: number[] = [];
  const altezze: number[] = [];
  const diagonali: number[] = [];
  segs.forEach((s, i) => {
    const v = taglioSegmento(s);
    if (v === null) return;
    if (!segmentoELato(s, n)) {
      diagonali.push(v);
      return;
    }
    // il simbolo del report dice già a che asse appartiene il lato: b/B in
    // larghezza, h/H in altezza (i pedici del quadrilatero non cambiano nulla)
    const sim = (simboli[i] ?? '').replace(/[₀-₉0-9]/g, '');
    if (sim === 'b' || sim === 'B') larghezze.push(v);
    else if (sim === 'h' || sim === 'H') altezze.push(v);
    else {
      // simbolo scritto a mano: si guarda come il lato è disegnato
      const p1 = q.punti[s.da];
      const p2 = q.punti[s.a];
      if (!p1 || !p2) return;
      (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? larghezze : altezze).push(v);
    }
  });

  // ROMBO: sta dentro il rettangolo delle sue diagonali
  if (forma === 'Rombo' && diagonali.length === 2) {
    return { larghezza: Math.max(...diagonali), altezza: Math.min(...diagonali) };
  }

  // rettangolo, trapezio, quadrilatero: il lato più lungo per ciascun verso
  if (larghezze.length > 0 && altezze.length > 0) {
    return { larghezza: Math.max(...larghezze), altezza: Math.max(...altezze) };
  }
  return null;
}

/**
 * INGOMBRO DI TAGLIO di una forma, in millimetri.
 *
 * È il rettangolo minimo da cui ricavare il pezzo, abbondanze comprese. Vale
 * per i tre tipi di forma chiusa; per tutto il resto (quote lineari, angoli,
 * testi) restituisce null, perché non sono pezzi da tagliare.
 */
export function ingombroTaglio(
  a: Annotazione,
  foto: CalibFoto
): { larghezza: number; altezza: number; conAbbondanze: boolean } | null {
  if (a.tipo === 'quotaRett') {
    const m = misureElemento(a);
    // di un trapezio o di un quadrilatero si prende l'ingombro: il lato
    // più lungo in orizzontale e quello più lungo in verticale
    const larg = Math.max(m.baseSup ?? 0, m.baseInf ?? 0);
    const alt = Math.max(m.latoSx ?? 0, m.latoDx ?? 0);
    if (larg <= 0 || alt <= 0) return null;
    return { larghezza: mm(larg, a.unita), altezza: mm(alt, a.unita), conAbbondanze: false };
  }

  if (a.tipo === 'quotaRaggio') {
    const diametro = a.modo === 'diametro' ? a.valore : a.valore === null ? null : a.valore * 2;
    if (diametro === null || diametro <= 0) return null;
    const margine = a.margine ?? 0;
    // il cerchio si taglia da un quadrato: il suo ingombro
    const lato = diametro + 2 * margine;
    return {
      larghezza: mm(lato, a.unita),
      altezza: mm(lato, a.unita),
      conAbbondanze: margine > 0
    };
  }

  if (a.tipo === 'quotaPoligono') {
    const segs = segmentiPoligono(a);
    const conAbb = segs.some((s) => segmentoELato(s, a.punti.length) && abbondanzaTotale(s) > 0);

    // prima le misure scritte: sono quelle che finiscono sul report e che
    // l'artigiano ha davvero preso
    const daQuote = ingombroDaQuote(a);
    if (daQuote) {
      return {
        larghezza: mm(daQuote.larghezza, a.unita),
        altezza: mm(daQuote.altezza, a.unita),
        conAbbondanze: conAbb
      };
    }

    const ing = ingombroPoligono(a.punti, segs, foto, a.unita);
    if (!ing) return null;
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
    return {
      larghezza: mm(ing.larghezza + extraL, a.unita),
      altezza: mm(ing.altezza + extraA, a.unita),
      conAbbondanze: extraL > 0 || extraA > 0
    };
  }

  return null;
}

/** un telo di una forma pannellizzata, in millimetri di taglio */
export interface PannelloTaglio {
  /** progressivo dal lato di riferimento, da 1 */
  indice: number;
  larghezza: number;
  altezza: number;
}

/**
 * I TELI DI UNA FORMA PANNELLIZZATA, PRONTI PER IL TAGLIO.
 *
 * Nel piano di taglio deve arrivare quello che si taglia davvero: se la
 * parete è divisa in quattro teli, quattro righe con le loro misure — non una
 * parete intera che nessuna bobina potrebbe contenere. Le misure comprendono
 * i sormonti, perché quelli si tagliano insieme al telo.
 */
export function pannelliTaglio(a: Annotazione): PannelloTaglio[] | null {
  const dati = pannelliDellaForma(a);
  if (!dati) return null;
  const u = dati.forma.unita;
  const verticale = dati.pann.asse === 'verticale';
  return dati.pannelli.map((p) => ({
    indice: p.indice,
    // `larghezza` del pannello è sempre lungo l'asse di divisione: sull'asse
    // orizzontale è l'altezza del pezzo, non la sua base
    larghezza: mm(verticale ? p.larghezza : p.altezza, u),
    altezza: mm(verticale ? p.altezza : p.larghezza, u)
  }));
}

/**
 * I pezzi ricavati dalle annotazioni di una foto, per via diretta.
 *
 * Nomi elementari e una riga per forma: il percorso completo — con i codici,
 * le forme riconosciute e le famiglie di copie — passa da `pezziDaProgetto`,
 * che usa il motore del report.
 */
export function pezziDaAnnotazioni(
  annotazioni: Annotazione[],
  foto: CalibFoto
): PezzoDaMisura[] {
  const pezzi: PezzoDaMisura[] = [];
  for (const a of annotazioni) {
    const ing = ingombroTaglio(a, foto);
    if (!ing) continue;
    let nome: string;
    if (a.tipo === 'quotaRaggio') nome = nomeDi(undefined, a.nota, 'Cerchio');
    else if (a.tipo === 'quotaPoligono')
      nome = nomeDi(a.etichetta, undefined, `Poligono ${a.punti.length} lati`);
    else if (a.tipo === 'quotaRett')
      nome = nomeDi(a.etichetta, undefined, nomeForma(misureElemento(a).forma));
    else continue;
    // una forma divisa in teli entra nella distinta come i suoi teli
    const teli = pannelliTaglio(a);
    if (teli) {
      for (const t of teli) {
        pezzi.push({
          nome: codicePannello(nome, t.indice - 1),
          larghezza: t.larghezza,
          altezza: t.altezza,
          quantita: 1,
          conAbbondanze: ing.conAbbondanze
        });
      }
      continue;
    }
    pezzi.push({
      nome,
      larghezza: ing.larghezza,
      altezza: ing.altezza,
      quantita: 1,
      conAbbondanze: ing.conAbbondanze
    });
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
