/**
 * Impaginazione del disegno di una lastra (o di un segmento di bobina)
 * dentro un'area di pagina, in punti tipografici.
 *
 * È volutamente separata da pdfmake: qui c'è solo geometria, quindi si può
 * verificare che nessun pezzo esca dalla cornice e che le etichette restino
 * dentro il proprio rettangolo, senza generare un PDF.
 */

import type { LastraNesting } from '../geometry/nesting';
import { pianoEtichetta } from '../utils/etichettaNesting';
import { tintaBordoEsa, tintaSfondoEsa } from '../utils/tinte';
import { formattaNumero } from '../utils/format';

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
      spessore: 0.7
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

    const misura = `${formattaNumero(pc.larghezzaFinita)}×${formattaNumero(pc.altezzaFinita)}`;
    const piano = pianoEtichetta(rw, rh, pc.nome || '', misura, CORPI_PDF);
    if (!piano) continue;

    // pezzo stretto e alto: il nome ci sta solo scritto per lungo, come si
    // scrive a matita sui listelli. Il foglio si gira, ma si legge tutto.
    if (piano.ruotata) {
      const righe = piano.ampia
        ? [
            {
              testo: piano.nome ?? '',
              corpo: piano.corpoNome,
              grassetto: true,
              colore: '#1d2229',
              scarto: -piano.corpoNome * 0.15
            },
            {
              testo: piano.misura ?? '',
              corpo: piano.corpoMisura,
              grassetto: false,
              colore: '#3a424c',
              scarto: piano.corpoMisura * 1.05
            }
          ]
        : [
            {
              testo: (piano.nome || piano.misura) ?? '',
              corpo: piano.nome ? piano.corpoNome : piano.corpoMisura,
              grassetto: !!piano.nome,
              colore: '#1d2229',
              scarto: (piano.nome ? piano.corpoNome : piano.corpoMisura) * 0.36
            }
          ];
      ruotate.push({ x: rx, y: ry, larghezza: rw, altezza: rh, righe });
      continue;
    }

    const cy = ry + rh / 2;
    if (piano.ampia) {
      testi.push({
        x: rx,
        y: cy - piano.corpoNome * 1.15,
        larghezza: rw,
        testo: piano.nome ?? '',
        corpo: piano.corpoNome,
        grassetto: true,
        colore: '#1d2229'
      });
      testi.push({
        x: rx,
        y: cy + piano.corpoMisura * 0.05,
        larghezza: rw,
        testo: piano.misura ?? '',
        corpo: piano.corpoMisura,
        grassetto: false,
        colore: '#3a424c'
      });
    } else {
      const corpo = piano.nome ? piano.corpoNome : piano.corpoMisura;
      testi.push({
        x: rx,
        y: cy - corpo * 0.62,
        larghezza: rw,
        testo: (piano.nome || piano.misura) ?? '',
        corpo,
        grassetto: !!piano.nome,
        colore: '#1d2229'
      });
    }
  }

  return { cornice, margine, pezzi, venatura, testi, ruotate, scala };
}

/** i pezzi di una lastra raccolti per nome e misura, per la didascalia */
export function riassuntoLastra(lastra: LastraNesting): string {
  const mappa = new Map<string, { testo: string; n: number }>();
  for (const pc of lastra.piazzamenti) {
    const misura = `${formattaNumero(pc.larghezzaFinita)}×${formattaNumero(pc.altezzaFinita)}`;
    const chiave = `${pc.nome}|${misura}`;
    const v = mappa.get(chiave) ?? { testo: `${pc.nome || 'pezzo'} ${misura}`, n: 0 };
    v.n++;
    mappa.set(chiave, v);
  }
  return [...mappa.values()].map((v) => `${v.n}× ${v.testo}`).join('   ·   ');
}
