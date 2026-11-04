/**
 * Impaginazione del disegno di una lastra (o di un segmento di bobina)
 * dentro un'area di pagina, in punti tipografici.
 *
 * È volutamente separata da pdfmake: qui c'è solo geometria, quindi si può
 * verificare che nessun pezzo esca dalla cornice e che le etichette restino
 * dentro il proprio rettangolo, senza generare un PDF.
 */

import type { LastraNesting, Piazzamento } from '../geometry/nesting';
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
 * UN LATO CHE NON È UN LATO: dove il rotolo va a capo, il pezzo tagliato in
 * due mostra un bordo che il materiale non ha. Chi disegna lo segna
 * tratteggiato e ci scrive accanto da che parte il pezzo continua, perché
 * quel bordo non è una linea di taglio: il pezzo è uno e intero.
 */
export interface GiunzionePdf extends LineaPdf {
  /** dove sta il resto del pezzo: nella colonna prima o in quella dopo */
  verso: 'prima' | 'dopo';
  /** quanto è alta la parte di pezzo che sta da questa parte, in punti */
  spessore: number;
  /** di che pezzo è, e quale delle sue parti sta da questa parte */
  nome: string;
  parte: number;
  parti: number;
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
  /** i lati che cadono sul capoverso: lì il pezzo continua, non finisce */
  giunzioni: GiunzionePdf[];
  /** punti per unità di disegno (mm) */
  scala: number;
}

/** corpi in punti: sulla carta si legge anche il 5, sotto no */
const CORPI_PDF = { massimo: 9, comodo: 6.5, dueRighe: 6, minimo: 4.2 };

export function impaginaLastra(
  lastra: LastraNesting,
  misure: { larghezza: number; altezza: number },
  area: AreaPagina,
  opzioni?: {
    margine?: number;
    venatura?: 'nessuna' | 'orizzontale' | 'verticale';
    /**
     * Quali pezzi portano il nome scritto. Serve al rotolo spezzato in
     * colonne: un pezzo tagliato in due si disegna in tutte e due, ma il nome
     * si scrive una volta sola — due etichette uguali vorrebbero dire due
     * pezzi.
     */
    conEtichetta?: (pc: Piazzamento) => boolean;
    /**
     * Punti per mm imposti da fuori. Serve al rotolo spezzato in colonne:
     * i tratti non sono lunghi uguali, e se ognuno si scalasse da sé lo
     * stesso pezzo risulterebbe disegnato più grande in una colonna che
     * nell'altra. Senza, la scala è quella che fa stare il foglio nell'area.
     */
    scala?: number;
    /**
     * Il bordo del margine si disegna in cima e in fondo? Su un rotolo
     * spezzato in colonne il margine del materiale c'è solo all'inizio e
     * alla fine del rotolo VERO: in mezzo, dove una colonna finisce e
     * ricomincia l'altra, non c'è nessun bordo, e disegnarcelo farebbe
     * sembrare ogni colonna un foglio a sé.
     */
    margineCima?: boolean;
    margineFondo?: boolean;
    /**
     * I lati dei pezzi che cadono sul capoverso, nelle stesse unità dei
     * piazzamenti. Tornano indietro in punti pagina, da segnare come
     * giunzioni e non come bordi.
     */
    giunzioni?: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      verso: 'prima' | 'dopo';
      /** quanta parte del pezzo sta da questa parte del capoverso */
      alto: number;
      nome: string;
      parte: number;
      parti: number;
    }>;
  }
): DisegnoLastra {
  const L = Math.max(1, misure.larghezza);
  const A = Math.max(1, misure.altezza);
  const scala = opzioni?.scala ?? Math.min(area.larghezza / L, area.altezza / A);
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
  // dove non c'è bordo il tratteggio va a coincidere con la cornice, e lì si
  // confonde con essa: è il modo di non disegnare una riga che non esiste
  const cima = opzioni?.margineCima === false ? 0 : mg;
  const fondo = opzioni?.margineFondo === false ? 0 : mg;
  const margine =
    mg > 0 && L - 2 * mg > 0 && A - cima - fondo > 0
      ? {
          x: x0 + mg * scala,
          y: y0 + cima * scala,
          larghezza: (L - 2 * mg) * scala,
          altezza: (A - cima - fondo) * scala,
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

    if (opzioni?.conEtichetta && !opzioni.conEtichetta(pc)) continue;

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

  // le giunzioni, in punti pagina
  const giunzioni: GiunzionePdf[] = (opzioni?.giunzioni ?? []).map((g) => ({
    x1: x0 + g.x1 * scala,
    y1: y0 + g.y1 * scala,
    x2: x0 + g.x2 * scala,
    y2: y0 + g.y2 * scala,
    verso: g.verso,
    spessore: g.alto * scala,
    nome: g.nome,
    parte: g.parte,
    parti: g.parti
  }));

  return { cornice, margine, pezzi, venatura, testi, ruotate, giunzioni, scala };
}
