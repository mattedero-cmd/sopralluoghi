/**
 * FILE SVG DA MANDARE ALLA MACCHINA DA TAGLIO.
 *
 * Un file per foglio: il contorno del supporto e i contorni dei pezzi, in
 * scala 1:1 e con i livelli che i software di taglio si aspettano (vedi
 * geometry/svgTaglio). Le lastre sono per forza un file ciascuna — sono
 * pezzi di materiale separati — mentre della bobina si può scegliere: tutto
 * il rotolo in un file solo, oppure un file per segmento, gli stessi
 * segmenti del PDF.
 */

import { calcolaNestingMigliore, lunghezzaUsata } from '../geometry/nesting';
import { BLOCCO_MANEGGEVOLE, segmentaBobina } from '../geometry/segmenti';
import { nomeFoglioSvg, svgTaglio } from '../geometry/svgTaglio';
import { parametriDi, pezziDi, type DocumentoNesting } from './documentoNesting';

export interface FileTaglio {
  /** nome senza estensione */
  nome: string;
  contenuto: string;
  /** a che essenza e a che foglio appartiene, per l'elenco a schermo */
  materiale: string;
  foglio: string;
}

export interface OpzioniSvgTaglio {
  /** bobine divise nei segmenti del PDF, invece che in un file unico */
  perSegmento: boolean;
  /** lunghezza massima del segmento (mm), la stessa del PDF */
  massimoSegmento: number;
  /** scrivere anche i nomi dei pezzi (fuori dal livello di taglio) */
  etichette: boolean;
}

export function fileSvgTaglio(
  doc: DocumentoNesting,
  opzioni: OpzioniSvgTaglio
): FileTaglio[] {
  const file: FileTaglio[] = [];

  for (const m of doc.materiali) {
    const par = parametriDi(m);
    const esito = calcolaNestingMigliore(par, pezziDi(m), {
      bloccoMassimo: m.modo === 'bobina' ? BLOCCO_MANEGGEVOLE : undefined
    });

    const aggiungi = (
      lastra: Parameters<typeof svgTaglio>[0],
      misure: { larghezza: number; altezza: number },
      foglio: string
    ) => {
      if (lastra.piazzamenti.length === 0) return;
      file.push({
        nome: nomeFoglioSvg(doc.nome, m.nome, foglio),
        contenuto: svgTaglio(lastra, misure, {
          titolo: `${doc.nome} — ${m.nome} — ${foglio}`,
          etichette: opzioni.etichette
        }),
        materiale: m.nome,
        foglio
      });
    };

    if (m.modo !== 'bobina') {
      esito.lastre.forEach((lastra, i) => {
        aggiungi(lastra, { ...m.lastra }, `Lastra ${i + 1}`);
      });
      continue;
    }

    const rotolo = esito.lastre[0];
    if (!rotolo || rotolo.piazzamenti.length === 0) continue;

    if (!opzioni.perSegmento || !(opzioni.massimoSegmento > 0)) {
      // tutto il rotolo in un file: lungo quanto il tratto davvero occupato
      aggiungi(
        rotolo,
        { larghezza: m.bobina.larghezza, altezza: Math.max(1, lunghezzaUsata(rotolo, m.margine)) },
        'Bobina'
      );
      continue;
    }

    const segmenti = segmentaBobina(
      rotolo,
      opzioni.massimoSegmento,
      m.margine,
      m.bobina.larghezza,
      m.lama
    );
    segmenti.forEach((sg, i) => {
      aggiungi(
        sg.lastra,
        { larghezza: m.bobina.larghezza, altezza: Math.max(1, sg.fine - sg.inizio) },
        `Segmento ${i + 1} di ${segmenti.length}`
      );
    });
  }

  return file;
}
