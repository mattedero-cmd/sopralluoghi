/**
 * Impaginazione del disegno di una lastra (o di un segmento di bobina)
 * dentro un'area di pagina, in punti tipografici.
 *
 * È volutamente separata da pdfmake: qui c'è solo geometria, quindi si può
 * verificare che nessun pezzo esca dalla cornice e che le etichette restino
 * dentro il proprio rettangolo, senza generare un PDF.
 */

import type { LastraNesting } from '../geometry/nesting';
import { pianoEtichetta, righeEtichetta } from '../utils/etichettaNesting';
import { ancoraEtichetta, misureForma } from '../geometry/sagome';
import { tintaBordoEsa, tintaSfondoEsa } from '../utils/tinte';

export interface AreaPagina {
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}

export interface RiquadroPdf {
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
  riempimento?: string;
  bordo: string;
  spessore: number;
  tratteggio?: boolean;
  /** vertici della SAGOMA vera in punti pagina; assenti = rettangolo */
  poligono?: Array<{ x: number; y: number }>;
  /** raggio del cerchio in punti pagina (centro del riquadro) */
  raggio?: number;
}

export interface TestoPdf {
  /** angolo alto-sinistro della cassa di testo (il testo è centrato dentro) */
  x: number;
  y: number;
  larghezza: number;
  testo: string;
  corpo: number;
  grassetto: boolean;
  colore: string;
}

export interface LineaPdf {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Etichetta scritta per lungo su un pezzo stretto e alto.
 *
 * Sta a parte dalle altre perché il testo dritto e quello girato si disegnano
 * in due modi diversi: il primo è testo normale, il secondo deve passare da
 * un frammento SVG, l'unico posto dove pdfmake sa ruotare le lettere.
 */
export interface EtichettaRuotata {
  /** riquadro del pezzo, in punti pagina */
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
  righe: Array<{
    testo: string;
    corpo: number;
    grassetto: boolean;
    colore: string;
    /** scostamento della linea di base dal centro, prima della rotazione */
    scarto: number;
  }>;
}

export interface DisegnoLastra {
  cornice: RiquadroPdf;
  /** area utile dentro i margini, tratteggiata */
  margine: RiquadroPdf | null;
  pezzi: RiquadroPdf[];
  /** venatura del materiale, già ritagliata dentro i pezzi */
  venatura: LineaPdf[];
  testi: TestoPdf[];
  /** etichette scritte per lungo sui pezzi stretti */
  ruotate: EtichettaRuotata[];
  /** punti per unità di disegno (mm) */
  scala: number;
}

/** corpi in punti: sulla carta si legge anche il 5, sotto no */
const CORPI_PDF = { massimo: 9, comodo: 6.5, dueRighe: 6, minimo: 4.2 };

export function impaginaLastra(
  lastra: LastraNesting,
  misure: { larghezza: number; altezza: number },
  area: AreaPagina,
  opzioni?: { margine?: number; venatura?: 'nessuna' | 'orizzontale' | 'verticale' }
): DisegnoLastra {
  const L = Math.max(1, misure.larghezza);
  const A = Math.max(1, misure.altezza);
  const scala = Math.min(area.larghezza / L, area.altezza / A);
  // il foglio sta al centro dell'area, in alto
  const x0 = area.x + (area.larghezza - L * scala) / 2;
  const y0 = area.y;

  const cornice: RiquadroPdf = {
    x: x0,
    y: y0,
    larghezza: L * scala,
    altezza: A * scala,
    riempimento: '#f5f6f7',
    bordo: '#9aa3ad',
    spessore: 0.8
  };

  const mg = Math.max(0, opzioni?.margine ?? 0);
  const margine =
    mg > 0 && L - 2 * mg > 0 && A - 2 * mg > 0
      ? {
          x: x0 + mg * scala,
          y: y0 + mg * scala,
          larghezza: (L - 2 * mg) * scala,
          altezza: (A - 2 * mg) * scala,
          bordo: '#b9c0c8',
          spessore: 0.5,
          tratteggio: true
        }
      : null;

  const pezzi: RiquadroPdf[] = [];
  const testi: TestoPdf[] = [];
  const ruotate: EtichettaRuotata[] = [];
  const venatura: LineaPdf[] = [];
  // il filo del materiale è parallelo alla lastra e NON gira col pezzo: è
  // così che si vede a colpo d'occhio un pezzo impaginato controvena
  const vena = opzioni?.venatura ?? 'nessuna';
  const passo = 8;

  for (const pc of lastra.piazzamenti) {
    const rx = x0 + pc.x * scala;
    const ry = y0 + pc.y * scala;
    const rw = pc.larghezza * scala;
    const rh = pc.altezza * scala;
    pezzi.push({
      x: rx,
      y: ry,
      larghezza: rw,
      altezza: rh,
      riempimento: tintaSfondoEsa(pc.tinta),
      bordo: tintaBordoEsa(pc.tinta),
      spessore: 0.7,
      // la sagoma vera, scalata in punti pagina: il PDF mostra quello che si
      // taglia, non il rettangolo che lo contiene
      poligono: pc.punti
        ? pc.punti.map((q) => ({ x: rx + q[0] * scala, y: ry + q[1] * scala }))
        : undefined,
      // il taglio comprende l'abbondanza: il Ø dell'ingombro, non il finito
      raggio: pc.forma === 'cerchio' ? rw / 2 : undefined
    });

    if (vena === 'verticale') {
      for (let x = rx + passo; x < rx + rw; x += passo) {
        venatura.push({ x1: x, y1: ry, x2: x, y2: ry + rh });
      }
    } else if (vena === 'orizzontale') {
      for (let y = ry + passo; y < ry + rh; y += passo) {
        venatura.push({ x1: rx, y1: y, x2: rx + rw, y2: y });
      }
    }

    const misura = misureForma({
      forma: pc.forma,
      larghezza: pc.larghezzaFinita,
      altezza: pc.altezzaFinita,
      misura3: pc.misura3Finita,
      vertici: pc.verticiFiniti
    });
    // come in pagina: il testo nel baricentro della sagoma, non del riquadro
    const ancora = pc.punti ? ancoraEtichetta(pc.punti) : null;
    const tx = rx + (ancora ? ancora.x * scala : rw / 2);
    const ty = ry + (ancora ? ancora.y * scala : rh / 2);
    const piano = pianoEtichetta(
      ancora ? ancora.larghezza * scala : rw,
      ancora ? ancora.altezza * scala : rh,
      pc.nome || '',
      misura,
      CORPI_PDF
    );
    if (!piano) continue;

    // le righe arrivano già collocate dal motore: il nome può essere andato
    // a capo, e schermo, PDF e file di taglio le impaginano allo stesso modo
    const disposte = righeEtichetta(piano);
    if (disposte.length === 0) continue;

    // pezzo stretto e alto: il nome ci sta solo scritto per lungo, come si
    // scrive a matita sui listelli. Il foglio si gira, ma si legge tutto.
    if (piano.ruotata) {
      ruotate.push({
        x: rx,
        y: ry,
        larghezza: rw,
        altezza: rh,
        righe: disposte.map((r) => ({
          testo: r.testo,
          corpo: r.corpo,
          grassetto: r.forte,
          colore: r.forte ? '#1d2229' : '#3a424c',
          // pdfmake posa il testo dall'ALTO della riga, il motore ne dà il
          // centro: si scende di mezza riga
          scarto: r.dy - r.corpo * 0.5
        }))
      });
      continue;
    }

    // la cassa di testo è centrata sull'ancora, larga quanto il pezzo è largo lì
    const larga = ancora ? ancora.larghezza * scala : rw;
    const tsx = tx - larga / 2;
    for (const r of disposte) {
      testi.push({
        x: tsx,
        y: ty + r.dy - r.corpo * 0.62,
        larghezza: larga,
        testo: r.testo,
        corpo: r.corpo,
        grassetto: r.forte,
        colore: r.forte ? '#1d2229' : '#3a424c'
      });
    }
  }

  return { cornice, margine, pezzi, venatura, testi, ruotate, scala };
}

/** i pezzi di una lastra raccolti per nome e misura, per la didascalia */
/**
 * QUANTO È LARGO UN CARATTERE, a corpo 1, su Roboto.
 *
 * Serve per sapere quanto testo ci sta prima di scriverlo, e una media sola
 * non basta: su Roboto si va da 0,20 del punto a 0,89 della W. Tarato sulla
 * media si tronca giusto sui nomi normali e si sfonda su «PARETE WWW», tarato
 * sulla W si tronca a metà di tutto. Quindi si pesa carattere per carattere,
 * con i numeri misurati sul font vero, e si arrotonda ogni classe PER ECCESSO:
 * stimare largo fa perdere una voce, stimare stretto fa finire l'elenco sulla
 * pagina dopo, sopra l'intestazione della lastra successiva.
 */
const PESO_CARATTERE: Array<[RegExp, number]> = [
  [/[MW]/, 0.89],
  [/[mw]/, 0.88],
  [/[I]/, 0.28],
  [/[A-Z\u00C0-\u00DE]/, 0.76],
  [/[0-9]/, 0.57],
  [/[fijlrt]/, 0.35],
  [/[a-z\u00E0-\u00FE]/, 0.57],
  [/[ .,·]/, 0.27],
  [/[×]/, 0.54]
];
/** tutto il resto: la più larga delle classi note, per non sbagliare in meno */
const PESO_IGNOTO = 0.89;

/** larghezza stimata del testo, a corpo 1 */
export function larghezzaStimata(testo: string): number {
  let somma = 0;
  for (const c of testo) {
    const p = PESO_CARATTERE.find(([re]) => re.test(c));
    somma += p ? p[1] : PESO_IGNOTO;
  }
  return somma;
}

/**
 * Una riga non si riempie mai fino in fondo: l'ultima parola che non ci sta va
 * a capo e lascia un buco. Questo è il margine che si tiene per quel buco.
 */
const RESA_DI_RIGA = 0.9;

/**
 * I pezzi di una lastra, in una riga di testo.
 *
 * Con `dentro` la riga si TRONCA per starci: la didascalia è appoggiata a una
 * posizione assoluta sotto il disegno, e pdfmake, quando un blocco assoluto
 * non ci sta, non lo taglia — lo fa continuare sulla pagina dopo, dove va a
 * finire sopra l'intestazione della lastra successiva. Misurato su un foglio
 * da diciotto pannelli: la didascalia è 550 caratteri, lo spazio sotto il
 * disegno ne regge una riga, e il PDF usciva con l'elenco di una lastra
 * stampato sopra il titolo di quella dopo.
 *
 * Troncare non perde niente di essenziale: ogni pezzo porta il suo nome
 * scritto dentro, nel disegno qui sopra, e la distinta completa sta in testa
 * al documento.
 */
export function riassuntoLastra(
  lastra: LastraNesting,
  dentro?: { larghezza: number; righe: number; corpo: number }
): string {
  const mappa = new Map<string, { testo: string; n: number }>();
  for (const pc of lastra.piazzamenti) {
    // le misure della FORMA, come nella distinta e come nel disegno: su un
    // trapezio «larghezzaFinita × altezzaFinita» scrive la base per l'altezza
    // sinistra, che può essere la più corta, e due gemelle speculari si
    // leggerebbero con numeri diversi
    const misura = misureForma({
      forma: pc.forma,
      larghezza: pc.larghezzaFinita,
      altezza: pc.altezzaFinita,
      misura3: pc.misura3Finita,
      vertici: pc.verticiFiniti
    });
    const chiave = `${pc.nome}|${misura}`;
    const v = mappa.get(chiave) ?? { testo: `${pc.nome || 'pezzo'} ${misura}`, n: 0 };
    v.n++;
    mappa.set(chiave, v);
  }
  const voci = [...mappa.values()].map((v) => `${v.n}× ${v.testo}`);
  const SEP = '   ·   ';
  if (!dentro || voci.length === 0) return voci.join(SEP);

  const spazio =
    (Math.max(0, dentro.larghezza) * Math.max(1, dentro.righe) * RESA_DI_RIGA) /
    Math.max(1e-6, dentro.corpo);
  const sep = larghezzaStimata(SEP);

  let usati = 0;
  let quante = 0;
  for (const v of voci) {
    const costo = (quante === 0 ? 0 : sep) + larghezzaStimata(v);
    // la coda «…e altri N» deve starci anche lei, se serve
    const coda =
      quante + 1 < voci.length ? sep + larghezzaStimata(`…e altri ${voci.length - quante - 1}`) : 0;
    if (usati + costo + coda > spazio) break;
    usati += costo;
    quante++;
  }
  // almeno un pezzo si nomina sempre: una didascalia vuota non dice niente,
  // e una riga sola ci sta per costruzione
  if (quante === 0) quante = 1;
  if (quante >= voci.length) return voci.join(SEP);
  const restano = voci.length - quante;
  return `${voci.slice(0, quante).join(SEP)}${SEP}…e altri ${restano}`;
}
