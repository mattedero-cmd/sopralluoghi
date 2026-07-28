/**
 * DISEGNI SVG — leggere un file di taglio per quello che dice.
 *
 * Un SVG che arriva da un software di taglio porta con sé le sue misure vere:
 * `width="1220mm"` non è un numero qualunque, è la fascia della bobina. Qui si
 * legge l'intestazione del file — larghezza, altezza, viewBox — e si riportano
 * le misure in millimetri, così il visore può dire «1.220 × 3.000 mm» invece
 * di un conteggio di pixel che non vuol dire niente in laboratorio.
 *
 * Il file conservato NON viene mai toccato: quello che si condivide è identico
 * a quello che è arrivato, byte per byte. Per mostrarlo, invece, se ne fa una
 * copia RIPULITA — vedi `sanificaSvg` — perché un SVG è un documento vivo, può
 * contenere script, e qui dentro ci sono i sopralluoghi di chi lavora.
 */

/** millimetri per unità di misura CSS */
const MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  q: 0.25,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96
};

export interface MisureSvg {
  /** misure reali in millimetri, se il file le dichiara */
  larghezzaMm: number | null;
  altezzaMm: number | null;
  /** misure nelle unità del disegno (viewBox), sempre presenti se c'è un viewBox */
  larghezza: number | null;
  altezza: number | null;
  /** vero se le misure in mm vengono da unità scritte nel file, non dedotte */
  reali: boolean;
}

/** l'attributo `nome` del tag <svg> di apertura, se c'è */
function attributo(intestazione: string, nome: string): string | null {
  const m = intestazione.match(new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3] ?? '').trim() : null;
}

/** il tag <svg …> di apertura, senza il resto del documento */
function intestazioneSvg(testo: string): string | null {
  const inizio = testo.search(/<svg[\s>]/i);
  if (inizio < 0) return null;
  const fine = testo.indexOf('>', inizio);
  if (fine < 0) return null;
  return testo.slice(inizio, fine);
}

/** numero + unità, in millimetri; null se non è una lunghezza */
function lunghezzaMm(v: string | null): { mm: number | null; utente: number | null } {
  if (!v) return { mm: null, utente: null };
  const m = v.match(/^\s*([+-]?[\d.]+(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i);
  if (!m) return { mm: null, utente: null };
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return { mm: null, utente: null };
  const unita = m[2].toLowerCase();
  // senza unità il numero è in unità utente: quanto valga davvero lo dice il
  // viewBox, non si può decidere qui
  if (!unita) return { mm: null, utente: n };
  const fattore = MM[unita];
  return fattore ? { mm: n * fattore, utente: null } : { mm: null, utente: null };
}

/**
 * Le misure dichiarate da un disegno SVG.
 *
 * Tre casi, in ordine di quanto si può credere al file:
 * 1. `width`/`height` con un'unità (`1220mm`): misura reale, presa così com'è;
 * 2. solo il viewBox, o misure senza unità: sono unità utente, e per gli SVG
 *    di taglio valgono un millimetro l'una — è la convenzione con cui li
 *    scrive questa app e la maggior parte dei software di taglio;
 * 3. niente di niente: non si sa quanto è grande, e si dice.
 */
export function misureSvg(testo: string): MisureSvg {
  const testa = intestazioneSvg(testo);
  const vuoto: MisureSvg = {
    larghezzaMm: null,
    altezzaMm: null,
    larghezza: null,
    altezza: null,
    reali: false
  };
  if (!testa) return vuoto;

  const l = lunghezzaMm(attributo(testa, 'width'));
  const a = lunghezzaMm(attributo(testa, 'height'));

  // il viewBox dà le unità del disegno: "minX minY larghezza altezza"
  let vbL: number | null = null;
  let vbA: number | null = null;
  const vb = attributo(testa, 'viewBox');
  if (vb) {
    const n = vb.split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x));
    if (n.length === 4 && n[2] > 0 && n[3] > 0) {
      vbL = n[2];
      vbA = n[3];
    }
  }

  const larghezza = vbL ?? l.utente;
  const altezza = vbA ?? a.utente;

  if (l.mm !== null && a.mm !== null) {
    return { larghezzaMm: l.mm, altezzaMm: a.mm, larghezza, altezza, reali: true };
  }
  // un'unità sola dichiarata: l'altra si ricava dalle proporzioni del viewBox
  if (l.mm !== null && larghezza && altezza) {
    return {
      larghezzaMm: l.mm,
      altezzaMm: (l.mm * altezza) / larghezza,
      larghezza,
      altezza,
      reali: true
    };
  }
  if (a.mm !== null && larghezza && altezza) {
    return {
      larghezzaMm: (a.mm * larghezza) / altezza,
      altezzaMm: a.mm,
      larghezza,
      altezza,
      reali: true
    };
  }
  if (larghezza && altezza) {
    return { larghezzaMm: larghezza, altezzaMm: altezza, larghezza, altezza, reali: false };
  }
  return vuoto;
}

/**
 * È davvero un disegno SVG?
 *
 * Un controllo onesto sul contenuto, non sul nome del file: capita di ricevere
 * un PDF rinominato, o un testo qualunque, e aprirlo darebbe una pagina bianca
 * senza spiegazioni.
 */
export function eSvg(testo: string): boolean {
  return /<svg[\s>]/i.test(testo) && /<\/svg\s*>/i.test(testo);
}

/** i livelli con un nome, nell'ordine in cui compaiono (sheet, CutContour…) */
export function livelliSvg(testo: string): string[] {
  const nomi: string[] = [];
  const re = /<g\b[^>]*\bid\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo)) !== null) {
    const nome = (m[2] ?? m[3] ?? '').trim();
    if (nome && !nomi.includes(nome)) nomi.push(nome);
  }
  return nomi;
}

/** nome leggibile a partire dal nome del file: via il percorso e l'estensione */
export function nomeDaFile(nomeFile: string): string {
  const solo = nomeFile.split(/[\\/]/).pop() ?? nomeFile;
  return solo.replace(/\.svgz?$/i, '').trim() || 'Disegno';
}

/** peso del file in una riga (il testo SVG è già il file) */
export function pesoTesto(testo: string): string {
  const byte = new TextEncoder().encode(testo).length;
  if (byte < 1024) return `${byte} byte`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1).replace('.', ',')} kB`;
  return `${(byte / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}


/* --- SANIFICAZIONE --------------------------------------------------- */

/**
 * PERCHÉ RIPULIRE.
 *
 * Un SVG non è una fotografia: è un documento che il browser esegue. Può
 * portarsi dentro script, rimandi a indirizzi esterni, animazioni che
 * cambiano gli attributi da sole. Messo nella pagina così com'è, un file
 * ricevuto da fuori avrebbe accesso a tutto l'archivio.
 *
 * Quindi si tiene solo ciò che serve a disegnare: un elenco chiuso di tag e,
 * di quelli, gli attributi che non possono portare da nessuna parte. Tutto il
 * resto viene tolto. Regola dell'elenco chiuso: quello che non è previsto non
 * passa, così un tag nuovo o sconosciuto non entra per distrazione.
 */
const ELEMENTI_AMMESSI = new Set([
  'svg',
  'g',
  'a',
  'defs',
  'symbol',
  'use',
  'title',
  'desc',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'marker',
  'clippath',
  'mask',
  'pattern',
  'lineargradient',
  'radialgradient',
  'stop'
]);

/** un tag che si può disegnare senza pensieri */
export function elementoAmmesso(nome: string): boolean {
  return ELEMENTI_AMMESSI.has(nome.toLowerCase());
}

/**
 * Un attributo che non può portare da nessuna parte.
 *
 * Fuori restano: i gestori di eventi (`onload`, `onclick`…), i rimandi che
 * escono dal documento (un `href` che non sia un'ancora interna), e qualunque
 * valore che nasconda un indirizzo — `javascript:` o un `url()` dentro lo
 * stile, che il browser andrebbe a caricare.
 */
export function attributoAmmesso(nome: string, valore: string): boolean {
  const n = nome.toLowerCase();
  const v = valore.toLowerCase();
  if (n.startsWith('on')) return false;
  if (n === 'href' || n === 'xlink:href' || n.endsWith(':href')) return valore.trim().startsWith('#');
  // i due punti dentro un valore sono quasi sempre uno schema: si guarda meglio
  if (/(^|[\s"'`])(javascript|data|vbscript)\s*:/i.test(v)) return false;
  if (n === 'style' && /url\s*\(|expression\s*\(|@import/i.test(v)) return false;
  return true;
}

/**
 * Copia ripulita del disegno, pronta da mettere nella pagina.
 *
 * Restituisce null se il file non si lascia leggere: meglio dire «non si apre»
 * che mostrare mezza figura. L'originale resta intatto: questa è solo la
 * versione da guardare.
 */
export function sanificaSvg(testo: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(testo, 'image/svg+xml');
  } catch {
    return null;
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const radice = doc.documentElement;
  if (!radice || radice.tagName.toLowerCase() !== 'svg') return null;

  const ripulisci = (nodo: Element): void => {
    for (const attr of [...nodo.attributes]) {
      if (!attributoAmmesso(attr.name, attr.value)) nodo.removeAttribute(attr.name);
    }
    for (const figlio of [...nodo.children]) {
      if (!elementoAmmesso(figlio.tagName)) figlio.remove();
      else ripulisci(figlio);
    }
  };
  ripulisci(radice);

  // il disegno si dimensiona da fuori: dentro resta il solo sistema di
  // coordinate, cioè il viewBox
  radice.removeAttribute('width');
  radice.removeAttribute('height');
  return new XMLSerializer().serializeToString(radice);
}

/**
 * Quanto disegnare grande il file a schermo, in pixel.
 *
 * Le unità del disegno diventano pixel: un piano di taglio da 1220 unità
 * (millimetri) nasce grande 1220 px e da lì si ingrandisce. È l'unica scelta
 * che tiene le proporzioni giuste senza dover interpretare il file.
 */
export function dimensioniDisegno(m: MisureSvg): { larghezza: number; altezza: number } {
  if (m.larghezza && m.altezza) return { larghezza: m.larghezza, altezza: m.altezza };
  if (m.larghezzaMm && m.altezzaMm) return { larghezza: m.larghezzaMm, altezza: m.altezzaMm };
  return { larghezza: 800, altezza: 600 };
}
