/**
 * PARSER della lista pezzi incollata a mano.
 *
 * Serve a trasformare una lista libera — anche il riassunto di una
 * conversazione — in righe della tabella del nesting. È euristico per
 * costruzione: l'ANCORA è la misura, e una riga senza misure valide viene
 * ignorata (e mostrata come tale nell'anteprima, che è la rete di sicurezza
 * prima di compilare).
 *
 * Riconosce:
 * - misure: `597x720`, `560 × 300`, virgola decimale, `cm` convertiti in mm;
 * - quantità: `x4`, `4 pezzi`, `q.tà 6`, `n. 8`, `quantità 3`, numero iniziale;
 * - rotazione: `ruotabile` / `verso fisso` (di default è consentita);
 * - FORME: `cerchio Ø300`, `triangolo`, `rombo`, `trapezio 500/300×200`
 *   (isoscele B/b×h), `base 1200, h sx 900, h dx 1400` (trapezio rettangolo,
 *   la finestra sotto falda). Una riga con la sola parola della forma
 *   («Trapezi:») vale come sezione per le righe successive;
 * - intestazioni di essenza: una riga corta senza cifre e senza parole di
 *   forma («Legno scuro») apre il materiale per i pezzi sotto.
 */

import type { FormaPezzo } from '../geometry/sagome';

export interface PezzoTestuale {
  nome: string;
  larghezza: number;
  altezza: number;
  /** terza misura, solo trapezi: base minore (isoscele) o altezza destra */
  misura3?: number;
  /** forma del pezzo; assente = rettangolo */
  forma?: FormaPezzo;
  quantita: number;
  ruotabile: boolean;
  /** essenza/materiale sotto cui era elencato il pezzo, se la lista è divisa */
  materiale?: string;
}

export interface EsitoParser {
  pezzi: PezzoTestuale[];
  /** righe scartate perché senza una misura riconoscibile */
  ignorate: string[];
  /** intestazioni di materiale trovate, nell'ordine in cui compaiono */
  materiali: string[];
}

/** coppia di dimensioni: è l'ancora della riga */
const RE_MISURA = /(\d+(?:[.,]\d+)?)\s*[x×X✕✖*]\s*(\d+(?:[.,]\d+)?)/;
/** tre dimensioni: B×b×h, oppure base×h1×h2, oppure L×A×quantità */
const RE_MISURA3 =
  /(\d+(?:[.,]\d+)?)\s*[x×X✕✖*]\s*(\d+(?:[.,]\d+)?)\s*[x×X✕✖*]\s*(\d+(?:[.,]\d+)?)/;
/** «500/300x200»: base maggiore / base minore × altezza (isoscele) */
const RE_BARRA = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*[x×X✕✖*]\s*(\d+(?:[.,]\d+)?)/;
/** «basi 500 e 300, altezza 200» (isoscele, comunque sia scritta la forma) */
const RE_BASI =
  /bas[ei][^0-9\n]*(\d+(?:[.,]\d+)?)\s*(?:e|,|\/|[x×])?\s*(\d+(?:[.,]\d+)?)[^0-9\n]*?(?:altezza|alt\.?|\bh\b)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i;
/** «base 1200, h sx 900, h dx 1400»: il trapezio rettangolo detto a voce */
const RE_ALTEZZE =
  /(?:base|larghezza|\bb\b)\s*[:=]?\s*(\d+(?:[.,]\d+)?)[^0-9\n]*?(?:h|alt\w*)\s*(?:sx|sinistra?|1)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)[^0-9\n]*?(?:h|alt\w*)\s*(?:dx|destra?|2)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i;
/** diametro del cerchio: Ø 300, diam. 300 */
const RE_DIAMETRO = /(?:[Øø⌀]|\bdiam\w*\.?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i;

const P = (v: string) => parseFloat(v.replace(',', '.'));

/** la forma nominata nella riga, se c'è */
function rilevaForma(s: string): FormaPezzo | null {
  if (/cerchi|tond[oi]|disc[ohi]|circolar/i.test(s)) return 'cerchio';
  if (/triangol/i.test(s)) return 'triangolo';
  if (/romb/i.test(s)) return 'rombo';
  if (/quadrilater/i.test(s)) return 'trapezioR';
  // il trapezio nudo è quello rettangolo: è la finestra sotto falda, ed è
  // come la quota il sopralluogo (base + due altezze)
  if (/trapez/i.test(s)) return (/isoscel/i.test(s) ? 'trapezio' : 'trapezioR');
  if (/rettangol|quadrat/i.test(s)) return 'rett';
  return null;
}

/**
 * La forma tradita dalla sola notazione, quando la parola manca:
 * «Oblò Ø 300» è un cerchio anche senza scriverci "cerchio", e
 * «base 1200, h sx 900, h dx 1400» è la finestra sotto falda.
 */
function formaDaNotazione(s: string): FormaPezzo | null {
  if (RE_DIAMETRO.test(s)) return 'cerchio';
  if (RE_ALTEZZE.test(s)) return 'trapezioR';
  if (RE_BARRA.test(s) || RE_BASI.test(s)) return 'trapezio';
  return null;
}

/**
 * Una riga senza misure può essere l'intestazione di un'essenza
 * ("Legno scuro", "Bianco", "Materiale chiaro (pelle chiara)", "Rovere:").
 *
 * Si accettano solo righe corte e senza cifre: una frase di commento o una
 * nota non deve diventare un materiale. Vale come intestazione solo se poi
 * arriva almeno un pezzo, altrimenti resta fra le righe ignorate.
 */
function possibileMateriale(riga: string): string | null {
  let s = riga
    .replace(/^[#*_\s]+|[#*_\s]+$/g, '')
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
    .replace(/[:：]\s*$/, '')
    .trim();
  // un trattino che separa due parti è da titolo di documento
  // ("Progetto cucina — lista tagli"), non da essenza
  if (/\s[-–—]\s/.test(s)) return null;
  // "Materiale: rovere" → "Rovere"
  s = s.replace(/^(?:materiale|essenza|finitura|supporto|pannello)\s*[:\-–—]\s*/i, '').trim();
  if (s.length < 2 || s.length > 40) return null;
  if (/\d/.test(s)) return null;
  if (s.split(/\s+/).length > 5) return null;
  // appunti e promemoria: non sono essenze
  if (
    /^(?:nota|note|attenzione|avviso|ps|todo|da|ricorda\w*|verificar\w*|controllar\w*|misur\w*|totale|totali|riepilogo|progetto|lista|elenco|distinta|commessa|cliente|preventivo|tagli)\b/i.test(
      s
    )
  ) {
    return null;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** le misure lette da una riga, secondo la forma, più gli indizi di quantità */
function misureRiga(
  s: string,
  forma: FormaPezzo,
  cmScale: number
):
  | {
      forma: FormaPezzo;
      d1: number;
      d2: number;
      d3?: number;
      qtyHint: number | null;
      resto: string;
    }
  | null {
  const segna = (m: RegExpExecArray) =>
    s.slice(0, m.index) + ' ¤ ' + s.slice(m.index + m[0].length);
  let m: RegExpExecArray | null;

  if (forma === 'cerchio') {
    let d1: number | null = null;
    let qtyHint: number | null = null;
    let resto: string | null = null;
    if ((m = RE_DIAMETRO.exec(s))) {
      d1 = P(m[1]);
      resto = segna(m);
    } else if ((m = RE_MISURA.exec(s))) {
      // «3 x 300» o «300 x 3»: il numero piccolo è quasi certamente la quantità
      const a = P(m[1]);
      const b = P(m[2]);
      if (b > 99 && a <= 99) {
        d1 = b;
        qtyHint = Math.round(a);
      } else {
        d1 = a;
        if (b !== a && b <= 99) qtyHint = Math.round(b);
      }
      resto = segna(m);
    } else {
      const nums = s.match(/\d+(?:[.,]\d+)?/g) ?? [];
      if (nums.length === 0) return null;
      const vals = nums.map(P);
      if (vals.length >= 2 && vals[0] <= 99 && vals[1] > 99) {
        qtyHint = Math.round(vals[0]);
        d1 = vals[1];
      } else {
        d1 = Math.max(...vals);
      }
      resto = s.replace(nums[vals.indexOf(d1)], ' ¤ ');
    }
    d1 *= cmScale;
    if (!(d1 > 0)) return null;
    return { forma: 'cerchio', d1, d2: d1, qtyHint, resto };
  }

  if (forma === 'trapezio' || forma === 'trapezioR') {
    // le notazioni ESPLICITAMENTE isosceli hanno la precedenza sulla parola
    let isoscele = forma === 'trapezio';
    let d1: number;
    let d2: number;
    let d3: number;
    let qtyHint: number | null = null;
    if ((m = RE_BASI.exec(s))) {
      isoscele = true;
      d1 = P(m[1]);
      d2 = P(m[2]);
      d3 = P(m[3]);
    } else if ((m = RE_BARRA.exec(s))) {
      isoscele = true;
      d1 = P(m[1]);
      d2 = P(m[2]);
      d3 = P(m[3]);
    } else if ((m = RE_ALTEZZE.exec(s))) {
      isoscele = false;
      d1 = P(m[1]);
      d2 = P(m[2]);
      d3 = P(m[3]);
    } else if ((m = RE_MISURA3.exec(s))) {
      const t3 = P(m[3]);
      if (t3 * cmScale >= 30) {
        d1 = P(m[1]);
        d2 = P(m[2]);
        d3 = t3;
      } else {
        // terzo numero piccolo: probabile quantità, non una misura
        if (t3 >= 1) qtyHint = Math.round(t3);
        if (isoscele) {
          d1 = P(m[1]);
          d3 = P(m[2]);
          d2 = Math.round(d1 * 0.6);
        } else {
          d1 = P(m[1]);
          d2 = P(m[2]);
          d3 = d2; // base × altezza unica
        }
      }
    } else if ((m = RE_MISURA.exec(s))) {
      if (isoscele) {
        d1 = P(m[1]);
        d3 = P(m[2]);
        d2 = Math.round(d1 * 0.6);
      } else {
        d1 = P(m[1]);
        d2 = P(m[2]);
        d3 = d2; // due sole quote = lati uguali
      }
    } else {
      return null;
    }
    const resto = segna(m);
    d1 *= cmScale;
    d2 *= cmScale;
    d3 *= cmScale;
    if (!(d1 > 0 && d2 > 0 && d3 > 0)) return null;
    if (isoscele) {
      // B/b×h: la base minore mai più larga della maggiore
      if (d2 > d1) [d1, d2] = [d2, d1];
      return { forma: 'trapezio', d1, d2: d3, d3: d2, qtyHint, resto };
    }
    // altezze uguali ⇒ è un rettangolo detto male
    if (d2 === d3) return { forma: 'rett', d1, d2, qtyHint, resto };
    return { forma: 'trapezioR', d1, d2, d3, qtyHint, resto };
  }

  // rettangolo, triangolo, rombo: coppia di misure, terzo numero = quantità
  if ((m = RE_MISURA3.exec(s))) {
    const d1 = P(m[1]) * cmScale;
    const d2 = P(m[2]) * cmScale;
    const t3 = P(m[3]);
    if (!(d1 > 0 && d2 > 0)) return null;
    return {
      forma,
      d1,
      d2,
      qtyHint: t3 >= 1 && t3 <= 99 ? Math.round(t3) : null,
      resto: segna(m)
    };
  }
  if ((m = RE_MISURA.exec(s))) {
    const d1 = P(m[1]) * cmScale;
    const d2 = P(m[2]) * cmScale;
    if (!(d1 > 0 && d2 > 0)) return null;
    return { forma, d1, d2, qtyHint: null, resto: segna(m) };
  }
  return null;
}

export function analizzaTestoPezzi(testo: string): EsitoParser {
  const pezzi: PezzoTestuale[] = [];
  const ignorate: string[] = [];
  const materiali: string[] = [];
  /** intestazione vista ma non ancora confermata da un pezzo */
  let sospesa: { titolo: string; riga: string } | null = null;
  let materialeCorrente: string | undefined;
  /** «Trapezi:» su una riga da sola: la forma vale per le righe dopo */
  let formaCorrente: FormaPezzo | null = null;

  for (const grezza of String(testo ?? '').split(/\r?\n/)) {
    const riga = grezza.trim();
    if (!riga) continue;

    // via l'elenco puntato e l'eventuale numerazione ordinale ("1. ", "12) ")
    let s = riga.replace(/^[\s\-*•·–—▪◦»>]+/, '');
    s = s.replace(/^\d{1,3}[.)]\s+/, '');

    const esplicita = rilevaForma(s);
    if (esplicita && !/\d/.test(s)) {
      // riga-intestazione di forma («Cerchi:», «Trapezi»)
      formaCorrente = esplicita;
      continue;
    }
    const forma = esplicita ?? formaDaNotazione(s) ?? formaCorrente ?? 'rett';
    const cmScale = /\bcm\b/i.test(s) && !/\bmm\b/i.test(s) ? 10 : 1;

    const letto = misureRiga(s, forma, cmScale);
    if (!letto) {
      const titolo = possibileMateriale(s);
      if (titolo) {
        // due intestazioni di fila: la prima non aveva pezzi sotto
        if (sospesa) ignorate.push(sospesa.riga);
        sospesa = { titolo, riga };
      } else {
        ignorate.push(riga);
      }
      continue;
    }

    // la riga è un pezzo: l'intestazione in attesa diventa il materiale in corso
    if (sospesa) {
      materialeCorrente = sospesa.titolo;
      materiali.push(sospesa.titolo);
      sospesa = null;
    }

    const resto = letto.resto;
    let quantita = 1;
    let q: RegExpExecArray | null;
    if ((q = /(\d+)\s*(?:pz|pezzi|pezzo|pcs|pc|off|volte)\b/i.exec(resto))) {
      quantita = parseInt(q[1], 10);
    } else if ((q = /\bq\.?\s*(?:t[àa]|ty)?\.?\s*[:=]?\s*(\d+)/i.exec(resto))) {
      quantita = parseInt(q[1], 10);
      // ATTENZIONE: nessun `\b` dopo `quantit[àa]`. In JavaScript `à` non è un
      // "word character", quindi `\b` lì NON combacia mai e la forma
      // "quantità 3" andrebbe persa. Non reintrodurlo.
    } else if ((q = /\b(?:quantit[àa]|nr?|numero|num)\.?\s*[:=]?\s*(\d+)/i.exec(resto))) {
      quantita = parseInt(q[1], 10);
    } else if ((q = /(?:^|[\s(¤])[x×]\s*(\d+)\b/i.exec(resto))) {
      quantita = parseInt(q[1], 10);
    } else if ((q = /\b(\d+)\s*[x×](?=\s|$|¤)/i.exec(resto))) {
      quantita = parseInt(q[1], 10);
    } else if ((q = /^\s*(\d+)\s+\D/.exec(resto))) {
      quantita = parseInt(q[1], 10);
    } else if (letto.qtyHint != null) {
      quantita = letto.qtyHint;
    }
    if (!(quantita >= 1)) quantita = 1;

    // rotazione: consentita salvo indicazione contraria; un "ruotabile"
    // esplicito ha la meglio su un generico "verso"
    let ruotabile = true;
    if (
      /\b(?:verso|venatura|fiss[oa]|non\s*ruot\w*|no\s*ruot\w*|senza\s*rotazione|no\s*rot)\b/i.test(s)
    ) {
      ruotabile = false;
    }
    if (
      /\b(?:ruotabil\w*|rotabil\w*|girabil\w*|ruota\b|rotazione\s*libera|verso\s*libero)\b/i.test(s)
    ) {
      ruotabile = true;
    }

    let nome = resto
      .replace(/¤/g, ' ')
      .replace(/(\d+)\s*(?:pz|pezzi|pezzo|pcs|pc|off|volte)\b/gi, ' ')
      .replace(/\bq\.?\s*(?:t[àa]|ty)?\.?\s*[:=]?\s*\d+/gi, ' ')
      .replace(/\b(?:quantit[àa]|nr?|numero|num)\.?\s*[:=]?\s*\d+/gi, ' ')
      .replace(/(?:^|[\s(])[x×]\s*\d+\b/gi, ' ')
      .replace(/\b\d+\s*[x×](?=\s|$)/gi, ' ')
      .replace(/[Øø⌀]\s*\d*(?:[.,]\d+)?/g, ' ')
      .replace(/\bdiam\w*\.?/gi, ' ')
      .replace(
        /\b(?:cerchi[oi]?|tond[oi]|disc[ohi]|circolar\w*|triangol\w*|romb[oi]|trapez\w*|rettangol\w*|quadrat[oi]|quadrilater\w*|isoscel\w*)\b/gi,
        ' '
      )
      .replace(/\b(?:h|alt\w*)\s*(?:sx|dx|sinistra?|destra?|1|2)\s*[:=]?\s*\d*(?:[.,]\d+)?/gi, ' ')
      .replace(/\b(?:altezze|due\s*altezze)\b/gi, ' ')
      .replace(/\b(?:mm|cm|millimetri|centimetri)\b/gi, ' ')
      .replace(/\b(?:da|di|dimensioni|misur[ae]|circa|ca|tot|totale|pz|bas[ei]|altezza|diagonal[ei])\b/gi, ' ')
      .replace(
        /\b(?:ruotabil\w*|rotabil\w*|girabil\w*|ruotar\w*|ruota|verso\s*liber[oa]|verso\s*fiss[oa]|verso|venatura|non\s*ruot\w*|no\s*ruot\w*|senza\s*rotazione)\b/gi,
        ' '
      )
      .replace(/[():;,.\-–—_/]+/g, ' ')
      .replace(/^\s*\d+\s+/, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!nome) {
      // il ripiego copre TUTTE le forme: la mancanza di una voce faceva
      // andare in eccezione il parser
      nome =
        {
          rett: 'Pezzo',
          cerchio: 'Cerchio',
          triangolo: 'Triangolo',
          rombo: 'Rombo',
          trapezio: 'Trapezio',
          trapezioR: 'Quadrilatero'
        }[letto.forma] || 'Pezzo';
    }
    nome = nome.charAt(0).toUpperCase() + nome.slice(1);

    pezzi.push({
      nome,
      forma: letto.forma === 'rett' ? undefined : letto.forma,
      larghezza: Math.round(letto.d1 * 10) / 10,
      altezza: Math.round(letto.d2 * 10) / 10,
      misura3: letto.d3 === undefined ? undefined : Math.round(letto.d3 * 10) / 10,
      quantita,
      ruotabile,
      materiale: materialeCorrente
    });
  }

  // un'intestazione finale senza pezzi sotto non è un materiale
  if (sospesa) ignorate.push(sospesa.riga);

  return { pezzi, ignorate, materiali };
}
