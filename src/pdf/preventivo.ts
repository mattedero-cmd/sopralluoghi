import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { pdfMake, COLORI_PDF } from './engine';
import type { Cliente, Preventivo, Progetto } from '../db/types';
import { leggiImpostazioni } from '../db/repository';
import { calcolaTotali, importoVoce, nomeRegime } from '../fiscale/calcolo';
import { formattaData, formattaNumero } from '../utils/format';

const euro = (v: number) =>
  `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function generaPdfPreventivo(
  preventivo: Preventivo,
  cliente: Cliente | null,
  progetto: Progetto | null
): Promise<Blob> {
  const imp = await leggiImpostazioni();
  const prof = imp.professionista;
  const totali = calcolaTotali(preventivo);
  const conIva = totali.conIva;
  const regime = preventivo.regime ?? 'forfettario';

  // colonne voci: l'IVA per voce compare solo nei regimi con IVA
  const righeVoci: TableCell[][] = preventivo.voci.map((v, i) => [
    { text: String(i + 1), style: 'td' },
    { text: v.descrizione || '—', style: 'td' },
    { text: formattaNumero(v.quantita), style: 'td', alignment: 'right' },
    { text: v.unita, style: 'td' },
    { text: euro(v.prezzoUnitario), style: 'td', alignment: 'right' },
    ...(conIva
      ? [{ text: `${formattaNumero(v.aliquotaIva ?? preventivo.ivaPercento)}%`, style: 'td', alignment: 'right' } as TableCell]
      : []),
    { text: euro(importoVoce(v)), style: 'td', alignment: 'right', bold: true }
  ]);

  const righeTotali: Content[] = [];
  const rigaTot = (k: string, v: string, grande = false) =>
    righeTotali.push({
      columns: [
        { text: k, style: grande ? 'totGrande' : 'tot' },
        { text: v, style: grande ? 'totGrande' : 'tot', alignment: 'right' }
      ],
      margin: grande ? [0, 6, 0, 0] : undefined
    } as Content);

  rigaTot('Imponibile', euro(totali.imponibile));
  if (totali.sconto > 0) rigaTot('Sconto', `− ${euro(totali.sconto)}`);
  if (totali.cassa > 0) rigaTot(`Cassa ${formattaNumero(preventivo.cassaPercento ?? 0)}%`, euro(totali.cassa));
  if (conIva) rigaTot(`IVA ${formattaNumero(preventivo.ivaPercento)}%`, euro(totali.iva));
  if (totali.bollo > 0) rigaTot('Marca da bollo', euro(totali.bollo));
  rigaTot('TOTALE', euro(totali.totale), true);
  if (totali.ritenuta > 0) {
    rigaTot(`Ritenuta ${formattaNumero(preventivo.ritenutaPercento ?? 0)}%`, `− ${euro(totali.ritenuta)}`);
    rigaTot('Netto a incassare', euro(totali.netto), true);
  }

  const def: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    info: { title: `Preventivo ${preventivo.numero}`, author: prof.nome || 'Sopralluoghi' },
    footer: (pagina, totale) => ({
      columns: [
        { text: prof.azienda || prof.nome || '', style: 'pie' },
        { text: `Pagina ${pagina} di ${totale}`, style: 'pie', alignment: 'right' }
      ],
      margin: [40, 16, 40, 0]
    }),
    content: [
      {
        columns: [
          {
            width: '*',
            text: [prof.azienda, prof.nome, prof.indirizzo, prof.telefono, prof.email]
              .filter(Boolean)
              .join('\n'),
            style: 'intestazione'
          },
          {
            width: 'auto',
            text: cliente
              ? `Spett.le\n${cliente.nome}\n${[cliente.indirizzo, cliente.telefono, cliente.email]
                  .filter(Boolean)
                  .join('\n')}`
              : 'Spett.le cliente',
            style: 'intestazione',
            alignment: 'right'
          }
        ],
        margin: [0, 0, 0, 24]
      },
      {
        text: `PREVENTIVO N. ${preventivo.numero} del ${formattaData(preventivo.data)}`,
        style: 'titolo'
      },
      { text: `Regime fiscale: ${nomeRegime(regime)}`, style: 'riferimento' },
      progetto
        ? {
            text: `Riferimento sopralluogo: ${progetto.nome}${progetto.luogo ? ` — ${progetto.luogo}` : ''}`,
            style: 'riferimento'
          }
        : { text: '' },
      {
        table: {
          headerRows: 1,
          widths: conIva
            ? ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto']
            : ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'N.', style: 'th' },
              { text: 'Descrizione', style: 'th' },
              { text: 'Q.tà', style: 'th', alignment: 'right' },
              { text: 'U.M.', style: 'th' },
              { text: 'Prezzo unit.', style: 'th', alignment: 'right' },
              ...(conIva ? [{ text: 'IVA', style: 'th', alignment: 'right' } as TableCell] : []),
              { text: 'Importo', style: 'th', alignment: 'right' }
            ],
            ...righeVoci
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 14, 0, 10]
      },
      {
        columns: [{ width: '*', text: '' }, { width: 230, stack: righeTotali }]
      },
      preventivo.note.trim()
        ? { text: `Note e condizioni:\n${preventivo.note.trim()}`, style: 'note', margin: [0, 20, 0, 0] }
        : { text: '' },
      preventivo.dicituraFiscale?.trim()
        ? { text: preventivo.dicituraFiscale.trim(), style: 'dicitura', margin: [0, 18, 0, 0] }
        : { text: '' }
    ],
    styles: {
      intestazione: { fontSize: 10, color: COLORI_PDF.grigio, lineHeight: 1.3 },
      titolo: { fontSize: 17, bold: true, color: COLORI_PDF.blu, margin: [0, 0, 0, 4] },
      riferimento: { fontSize: 10, italics: true, color: COLORI_PDF.grigio },
      th: { fontSize: 9, bold: true, color: '#ffffff', fillColor: COLORI_PDF.blu },
      td: { fontSize: 10 },
      tot: { fontSize: 10 },
      totGrande: { fontSize: 13, bold: true, color: COLORI_PDF.blu },
      note: { fontSize: 10, lineHeight: 1.25, color: '#222222' },
      dicitura: { fontSize: 8.5, italics: true, color: COLORI_PDF.grigio, lineHeight: 1.2 },
      pie: { fontSize: 9, color: COLORI_PDF.grigio }
    },
    defaultStyle: { fontSize: 11 }
  };

  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(def).getBlob((blob) => resolve(blob));
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Errore nella generazione del PDF.'));
    }
  });
}
