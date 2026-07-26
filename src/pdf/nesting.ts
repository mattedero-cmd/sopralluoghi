import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { pdfMake } from './engine';
import { impaginaLastra, riassuntoLastra, type AreaPagina } from './disegnoNesting';
import {
  calcolaNesting,
  lunghezzaUsata,
  riepilogaNesting,
  type EsitoNesting,
  type LastraNesting
} from '../geometry/nesting';
import { segmentaBobina } from '../geometry/segmenti';
import { OPZIONI_PDF_PREDEFINITE, type OpzioniPdfNesting } from './opzioni';
import {
  etichettaSupporto,
  parametriDi,
  type DocumentoNesting,
  type MaterialeNesting
} from '../utils/documentoNesting';
import { formattaData, formattaNumero } from '../utils/format';
import { tintaSfondoEsa, tintaBordoEsa } from '../utils/tinte';

/**
 * PDF DEL PIANO DI TAGLIO.
 *
 * Una pagina di riepilogo con la distinta per essenza, poi UNA PAGINA A4 PER
 * OGNI LASTRA O SEGMENTO: è il foglio che si porta al banco.
 *
 * La divisione della bobina in segmenti è un'opzione DI QUESTA esportazione,
 * non un dato del materiale: dove spezzare il rotolo lo trova il programma
 * (vedi geometry/segmenti), perché dipende da come sono impaginati i pezzi.
 */

/** una pagina del PDF: una lastra, oppure un segmento di bobina */
interface Foglio {
  lastra: LastraNesting;
  titolo: string;
  /** misure del supporto disegnato */
  larghezza: number;
  altezza: number;
  /** metri di materiale da staccare (solo bobina) */
  daTagliare: number | null;
  oltreMassimo: boolean;
}

// A4 in punti (in piedi e coricata), meno i margini della pagina
const A4 = { corto: 595.28, lungo: 841.89 };
const MARGINI: [number, number, number, number] = [28, 30, 28, 34];
/** il disegno comincia sotto l'intestazione e lascia spazio alla didascalia */
const Y_DISEGNO = 84;
const SOTTO_DISEGNO = 60;

/**
 * Area del disegno sulla pagina. Una lastra larga si legge molto meglio su
 * una pagina coricata: il verso segue la forma del supporto.
 */
function areaPagina(orizzontale: boolean): AreaPagina {
  const larghezzaPagina = orizzontale ? A4.lungo : A4.corto;
  const altezzaPagina = orizzontale ? A4.corto : A4.lungo;
  return {
    x: MARGINI[0],
    y: Y_DISEGNO,
    larghezza: larghezzaPagina - MARGINI[0] - MARGINI[2],
    altezza: altezzaPagina - Y_DISEGNO - SOTTO_DISEGNO
  };
}

const mm = (v: number) => formattaNumero(Math.round(v * 10) / 10);

/**
 * Fogli da stampare per un materiale: le sue lastre, oppure i segmenti in cui
 * conviene spezzare la bobina.
 */
function fogliDi(
  m: MaterialeNesting,
  esito: EsitoNesting,
  opzioni: OpzioniPdfNesting
): Foglio[] {
  if (m.modo !== 'bobina') {
    return esito.lastre.map((lastra, i) => ({
      lastra,
      titolo: `Lastra ${i + 1} di ${esito.lastre.length}`,
      larghezza: m.lastra.larghezza,
      altezza: m.lastra.altezza,
      daTagliare: null,
      oltreMassimo: false
    }));
  }

  const rotolo = esito.lastre[0];
  if (!rotolo || rotolo.piazzamenti.length === 0) return [];

  if (!opzioni.segmenta || !(opzioni.massimoSegmento > 0)) {
    const usata = Math.max(1, lunghezzaUsata(rotolo, m.margine));
    return [
      {
        lastra: rotolo,
        titolo: 'Bobina',
        larghezza: m.bobina.larghezza,
        altezza: usata,
        daTagliare: usata,
        oltreMassimo: false
      }
    ];
  }

  const segmenti = segmentaBobina(rotolo, opzioni.massimoSegmento, m.margine);
  return segmenti.map((s, i) => ({
    lastra: s.lastra,
    titolo: `Segmento ${i + 1} di ${segmenti.length}`,
    larghezza: m.bobina.larghezza,
    altezza: Math.max(1, s.fine - s.inizio),
    daTagliare: s.fine - s.inizio,
    oltreMassimo: s.oltreMassimo
  }));
}

/** disegno di un foglio come contenuti pdfmake, posizionati sulla pagina */
function paginaFoglio(m: MaterialeNesting, foglio: Foglio): Content[] {
  const lastra = foglio.lastra;
  const disegnate = { larghezza: foglio.larghezza, altezza: foglio.altezza };

  const titolo = foglio.titolo;
  const sottotitolo =
    foglio.daTagliare !== null
      ? `${mm(foglio.larghezza)} × ${mm(foglio.altezza)} mm · da staccare ${formattaNumero(
          Math.round(foglio.daTagliare) / 1000
        )} m${foglio.oltreMassimo ? ' · nessun taglio libero prima' : ''}`
      : `${mm(foglio.larghezza)} × ${mm(foglio.altezza)} mm`;

  const orizzontale = disegnate.larghezza >= disegnate.altezza;
  const area = areaPagina(orizzontale);
  const d = impaginaLastra(lastra, disegnate, area, {
    margine: m.margine,
    venatura: m.venatura
  });

  const disegno: Content = {
    absolutePosition: { x: 0, y: 0 },
    canvas: [
      {
        type: 'rect',
        x: d.cornice.x,
        y: d.cornice.y,
        w: d.cornice.larghezza,
        h: d.cornice.altezza,
        color: d.cornice.riempimento,
        lineColor: d.cornice.bordo,
        lineWidth: d.cornice.spessore
      },
      ...(d.margine
        ? [
            {
              type: 'rect' as const,
              x: d.margine.x,
              y: d.margine.y,
              w: d.margine.larghezza,
              h: d.margine.altezza,
              lineColor: d.margine.bordo,
              lineWidth: d.margine.spessore,
              dash: { length: 3, space: 2 }
            }
          ]
        : []),
      ...d.pezzi.map((p) => ({
        type: 'rect' as const,
        x: p.x,
        y: p.y,
        w: p.larghezza,
        h: p.altezza,
        color: p.riempimento,
        lineColor: p.bordo,
        lineWidth: p.spessore
      })),
      ...d.venatura.map((l) => ({
        type: 'line' as const,
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        lineColor: '#7d6a54',
        lineWidth: 0.25
      }))
    ]
  };

  // il testo va centrato nella larghezza del PEZZO, non della pagina: solo una
  // colonna di larghezza fissa dà quel controllo a pdfmake
  const etichette: Content[] = d.testi.map((t) => ({
    absolutePosition: { x: t.x, y: t.y },
    columns: [
      {
        width: t.larghezza,
        text: t.testo,
        fontSize: t.corpo,
        bold: t.grassetto,
        color: t.colore,
        alignment: 'center'
      }
    ]
  }));

  return [
    {
      pageBreak: 'before',
      pageOrientation: orizzontale ? 'landscape' : 'portrait',
      columns: [
        { text: m.nome, style: 'titoloPagina' },
        { text: titolo, style: 'titoloPagina', alignment: 'right' }
      ]
    },
    {
      columns: [
        { text: sottotitolo, style: 'sottotitolo' },
        {
          text: `${lastra.piazzamenti.length} pezzi`,
          style: 'sottotitolo',
          alignment: 'right'
        }
      ],
      margin: [0, 2, 0, 0]
    },
    disegno,
    ...etichette,
    {
      // la didascalia sta subito sotto il disegno, non a un'altezza fissa:
      // una lastra bassa e larga non deve lasciare mezza pagina bianca
      absolutePosition: { x: MARGINI[0], y: area.y + d.cornice.altezza + 14 },
      columns: [
        {
          width: area.larghezza,
          text: riassuntoLastra(lastra),
          fontSize: 8,
          color: '#3a424c'
        }
      ]
    }
  ];
}

/** distinta di taglio di un materiale */
function distinta(m: MaterialeNesting, esito: EsitoNesting): Content {
  const righe: TableCell[][] = [
    [
      { text: '', style: 'th' },
      { text: 'Pezzo', style: 'th' },
      { text: 'Misura (mm)', style: 'th', alignment: 'right' },
      { text: 'Qtà', style: 'th', alignment: 'right' },
      { text: 'Verso', style: 'th' }
    ]
  ];
  for (const p of m.pezzi) {
    const q = Math.max(0, Math.round(p.quantita) || 0);
    if (q === 0) continue;
    righe.push([
      {
        // pastiglia del colore, per ritrovare il pezzo nel disegno
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 1,
            w: 8,
            h: 8,
            r: 1,
            color: tintaSfondoEsa(p.tinta),
            lineColor: tintaBordoEsa(p.tinta),
            lineWidth: 0.6
          }
        ]
      },
      { text: p.nome || '—', style: 'td' },
      { text: `${mm(p.larghezza)} × ${mm(p.altezza)}`, style: 'td', alignment: 'right' },
      { text: String(q), style: 'td', alignment: 'right', bold: true },
      { text: p.ruotabile ? 'libero' : 'fisso', style: 'td' }
    ]);
  }
  if (esito.scartati.length > 0) {
    righe.push([
      { text: '', style: 'td' },
      {
        text: `${esito.scartati.length} pezzi NON entrano nel supporto`,
        style: 'td',
        color: '#b3261e',
        colSpan: 4,
        bold: true
      },
      {},
      {},
      {}
    ]);
  }
  return {
    table: { headerRows: 1, widths: [12, '*', 90, 32, 40], body: righe },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 0]
  };
}

export async function generaPdfNesting(
  doc: DocumentoNesting,
  opzioni: OpzioniPdfNesting = OPZIONI_PDF_PREDEFINITE
): Promise<Blob> {
  const contenuto: Content[] = [
    { text: doc.nome || 'Piano di taglio', style: 'titolo' },
    {
      text: `Piano di taglio · ${formattaData(Date.now())}`,
      style: 'sottotitolo',
      margin: [0, 0, 0, 10]
    }
  ];

  const pagine: Content[] = [];

  for (const m of doc.materiali) {
    const par = parametriDi(m);
    const esito = calcolaNesting(par, m.pezzi);
    const riep = riepilogaNesting(par, m.pezzi, esito);
    const fogli = fogliDi(m, esito, opzioni);
    const usataTotale = esito.lastre.reduce((s, l) => s + lunghezzaUsata(l, m.margine), 0);

    const dati: string[] = [
      etichettaSupporto(m),
      `lama ${mm(m.lama)} mm · abbondanza ${mm(m.abbondanza)} mm · margine ${mm(m.margine)} mm`,
      m.venatura === 'nessuna' ? 'venatura: nessuna' : `venatura ${m.venatura}`
    ];
    if (m.modo === 'bobina') {
      dati.push(
        `materiale usato ${formattaNumero(Math.round(usataTotale) / 1000)} m su ${formattaNumero(
          m.bobina.metri
        )} m`
      );
      if (opzioni.segmenta && fogli.length > 0) {
        const lunghezze = fogli
          .map((f) => `${formattaNumero(Math.round(f.daTagliare ?? 0) / 1000)} m`)
          .join(' + ');
        dati.push(
          `${fogli.length} ${fogli.length === 1 ? 'segmento' : 'segmenti'} da staccare: ${lunghezze}`
        );
        const forzati = fogli.filter((f) => f.oltreMassimo).length;
        if (forzati > 0) {
          dati.push(
            `${forzati} ${
              forzati === 1 ? 'segmento supera' : 'segmenti superano'
            } i ${formattaNumero(opzioni.massimoSegmento / 1000)} m: i pezzi impaginati non lasciano un taglio libero prima`
          );
        }
      }
    } else {
      dati.push(`${riep.lastreUsate} lastre · resa ${formattaNumero(Math.round(riep.resa * 10) / 10)}%`);
    }
    dati.push(
      esito.scartati.length > 0
        ? `${riep.pezziPiazzati} pezzi piazzati su ${riep.pezziRichiesti}`
        : `${riep.pezziPiazzati} pezzi piazzati`
    );

    contenuto.push({ text: m.nome, style: 'sezione' });
    contenuto.push({ text: dati.join('\n'), style: 'dati' });
    contenuto.push(distinta(m, esito));

    for (const foglio of fogli) {
      pagine.push(...paginaFoglio(m, foglio));
    }
  }

  const def: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: MARGINI,
    info: { title: doc.nome || 'Piano di taglio' },
    content: [...contenuto, ...pagine],
    defaultStyle: { fontSize: 9, color: '#20252b' },
    styles: {
      titolo: { fontSize: 18, bold: true },
      sezione: { fontSize: 13, bold: true, margin: [0, 12, 0, 2] },
      sottotitolo: { fontSize: 9, color: '#5b636c' },
      titoloPagina: { fontSize: 13, bold: true },
      dati: { fontSize: 9, color: '#5b636c', lineHeight: 1.25 },
      th: { fontSize: 8, bold: true, color: '#5b636c' },
      td: { fontSize: 9 }
    },
    footer: (pagina, totale) => ({
      text: `${pagina} / ${totale}`,
      alignment: 'center',
      fontSize: 8,
      color: '#8a9199',
      margin: [0, 8, 0, 0]
    })
  };

  return new Promise<Blob>((resolve) => {
    pdfMake.createPdf(def).getBlob((blob) => resolve(blob));
  });
}
