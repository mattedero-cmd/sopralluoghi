import { db } from '../db/db';
import { pdfDaRifare, salvaPdfNesting } from '../db/repository';
import { condividiOScarica, nomeFileSicuro } from './share';

/**
 * CONDIVIDERE PIÙ COSE INSIEME.
 *
 * Al cliente si manda «il taglio», non un file per volta: un piano di taglio,
 * i suoi SVG per la macchina, magari il piano di un'altra essenza. Qui si
 * raccoglie quello che è stato selezionato e si manda via in un colpo solo —
 * un file se è uno, uno zip se sono tanti, perché la condivisione di sistema
 * accetta un file per volta.
 *
 * Del piano di taglio si manda il PDF, del disegno il file SVG com'è.
 */

export interface Selezionato {
  tipo: 'nesting' | 'disegno';
  id: string;
}

/** un file pronto da mandare via */
interface FilePronto {
  nome: string;
  dati: Blob;
}

/**
 * Prepara i file degli elementi scelti.
 *
 * Il PDF di un piano di taglio viene rifatto se manca o se è vecchio — un
 * piano stampato da una versione precedente dell'app non è quello che si vede
 * adesso — e riscritto in archivio, così la volta dopo è già pronto.
 */
async function preparaFile(
  elementi: Selezionato[],
  build: string,
  avanzamento?: (msg: string) => void
): Promise<FilePronto[]> {
  const file: FilePronto[] = [];
  for (const e of elementi) {
    if (e.tipo === 'disegno') {
      const d = await db.disegni.get(e.id);
      if (!d) continue;
      file.push({
        nome: nomeFileSicuro(d.nome, 'svg'),
        dati: new Blob([d.svg], { type: 'image/svg+xml' })
      });
      continue;
    }
    const l = await db.nesting.get(e.id);
    if (!l) continue;
    let pdf = l.pdf;
    if (pdfDaRifare(l, build)) {
      avanzamento?.(`PDF di ${l.nome}…`);
      const [{ generaPdfNesting }, { migraDocumento }, { OPZIONI_PDF_PREDEFINITE }] =
        await Promise.all([
          import('../pdf/nesting'),
          import('./documentoNesting'),
          import('../pdf/opzioni')
        ]);
      const documento = migraDocumento(l.documento);
      if (!documento) continue;
      pdf = await generaPdfNesting(documento, documento.stampa ?? OPZIONI_PDF_PREDEFINITE);
      await salvaPdfNesting(l.id, pdf, build);
    }
    if (pdf) file.push({ nome: nomeFileSicuro(l.nome, 'pdf'), dati: pdf });
  }
  return file;
}

/**
 * Manda via quello che è stato scelto. Restituisce quanti file sono partiti:
 * zero vuol dire che non c'era niente da mandare, e chi chiama lo dice.
 */
export async function condividiSelezione(
  elementi: Selezionato[],
  nomeInsieme: string,
  build: string,
  avanzamento?: (msg: string) => void
): Promise<number> {
  const file = await preparaFile(elementi, build, avanzamento);
  if (file.length === 0) return 0;

  if (file.length === 1) {
    await condividiOScarica(file[0].dati, file[0].nome, nomeInsieme);
    return 1;
  }

  avanzamento?.('Preparazione dello zip…');
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const nomi = nomiUnici(file.map((f) => f.nome));
  file.forEach((f, i) => zip.file(nomi[i], f.dati));
  const pacchetto = await zip.generateAsync({ type: 'blob' });
  await condividiOScarica(pacchetto, nomeFileSicuro(nomeInsieme, 'zip'), nomeInsieme);
  return file.length;
}

/**
 * Nomi tutti diversi dentro lo zip.
 *
 * Due lavori possono chiamarsi uguale — capita, e non è un errore — ma dentro
 * un archivio compresso il secondo cancellerebbe il primo senza dire niente.
 * Al doppione si aggiunge il numero, prima dell'estensione: «Taglio (2).svg».
 */
export function nomiUnici(nomi: string[]): string[] {
  const visti = new Map<string, number>();
  return nomi.map((n) => {
    const quante = visti.get(n) ?? 0;
    visti.set(n, quante + 1);
    return quante === 0 ? n : n.replace(/(\.[^.]+)$/, ` (${quante + 1})$1`);
  });
}
