/**
 * PARSER della lista pezzi incollata a mano.
 *
 * Serve a trasformare una lista libera — anche il riassunto di una
 * conversazione — in righe della tabella del nesting. È euristico per
 * costruzione: l'ANCORA è la misura, e una riga senza una coppia di dimensioni
 * valida viene ignorata (e mostrata come tale nell'anteprima, che è la rete di
 * sicurezza prima di compilare).
 *
 * Riconosce:
 * - misure: `597x720`, `560 × 300`, virgola decimale, `cm` convertiti in mm;
 * - quantità: `x4`, `4 pezzi`, `q.tà 6`, `n. 8`, `quantità 3`, numero iniziale;
 * - rotazione: `ruotabile` / `verso fisso` (di default è consentita).
 */

export interface PezzoTestuale {
  nome: string;
  larghezza: number;
  altezza: number;
  quantita: number;
  ruotabile: boolean;
}

export interface EsitoParser {
  pezzi: PezzoTestuale[];
  /** righe scartate perché senza una misura riconoscibile */
  ignorate: string[];
}

/** coppia di dimensioni: è l'ancora della riga */
const RE_MISURA = /(\d+(?:[.,]\d+)?)\s*[x×X✕✖*]\s*(\d+(?:[.,]\d+)?)/;

export function analizzaTestoPezzi(testo: string): EsitoParser {
  const pezzi: PezzoTestuale[] = [];
  const ignorate: string[] = [];

  for (const grezza of String(testo ?? '').split(/\r?\n/)) {
    const riga = grezza.trim();
    if (!riga) continue;

    // via l'elenco puntato e l'eventuale numerazione ordinale ("1. ", "12) ")
    let s = riga.replace(/^[\s\-*•·–—▪◦»>]+/, '');
    s = s.replace(/^\d{1,3}[.)]\s+/, '');

    const m = RE_MISURA.exec(s);
    if (!m) {
      ignorate.push(riga);
      continue;
    }
    let larghezza = parseFloat(m[1].replace(',', '.'));
    let altezza = parseFloat(m[2].replace(',', '.'));
    if (!(larghezza > 0) || !(altezza > 0)) {
      ignorate.push(riga);
      continue;
    }
    // centimetri → millimetri (solo se non è già indicato mm)
    if (/\bcm\b/i.test(s) && !/\bmm\b/i.test(s)) {
      larghezza *= 10;
      altezza *= 10;
    }

    // la misura viene sostituita da un segnaposto: così non inquina la ricerca
    // della quantità (altrimenti "597x720" sembrerebbe una quantità "x720")
    const resto = s.slice(0, m.index) + ' ¤ ' + s.slice(m.index + m[0].length);

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
      /\b(?:ruotabil\w*|rotabil\w*|girabil\w*|ruota|rotazione\s*libera|verso\s*libero)\b/i.test(s)
    ) {
      ruotabile = true;
    }

    let nome = resto
      .replace('¤', ' ')
      .replace(/(\d+)\s*(?:pz|pezzi|pezzo|pcs|pc|off|volte)\b/gi, ' ')
      .replace(/\bq\.?\s*(?:t[àa]|ty)?\.?\s*[:=]?\s*\d+/gi, ' ')
      .replace(/\b(?:quantit[àa]|nr?|numero|num)\.?\s*[:=]?\s*\d+/gi, ' ')
      .replace(/(?:^|[\s(])[x×]\s*\d+\b/gi, ' ')
      .replace(/\b\d+\s*[x×](?=\s|$)/gi, ' ')
      .replace(/\b(?:mm|cm|millimetri|centimetri)\b/gi, ' ')
      .replace(/\b(?:da|di|dimensioni|misur[ae]|circa|ca|tot|totale|pz)\b/gi, ' ')
      .replace(
        /\b(?:ruotabil\w*|rotabil\w*|girabil\w*|ruotar\w*|ruota|verso\s*liber[oa]|verso\s*fiss[oa]|verso|venatura|non\s*ruot\w*|no\s*ruot\w*|senza\s*rotazione)\b/gi,
        ' '
      )
      .replace(/[():;,.\-–—_/]+/g, ' ')
      .replace(/^\s*\d+\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!nome) nome = 'Pezzo';
    nome = nome.charAt(0).toUpperCase() + nome.slice(1);

    pezzi.push({
      nome,
      larghezza: Math.round(larghezza * 10) / 10,
      altezza: Math.round(altezza * 10) / 10,
      quantita,
      ruotabile
    });
  }

  return { pezzi, ignorate };
}
