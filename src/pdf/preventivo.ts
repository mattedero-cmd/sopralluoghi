import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { pdfMake, COLORI_PDF } from './engine';
import type { Cliente, Preventivo, Progetto } from '../db/types';
import { leggiImpostazioni, totaliPreventivo } from '../db/repository';
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
  const totali = totaliPreventivo(preventivo);

  const righeVoci: TableCell[][] = preventivo.voci.map((v, i) => [
    { text: String(i + 1), style: 'td' },
    { text: v.descrizione || '—', style: 'td' },
    { text: formattaNumero(v.quantita), style: 'td', alignment: 'right' },
    { text: v.unita, style: 'td' },
    { text: euro(v.prezzoUnitario), style: 'td', alignment: 'right' },
    { text: euro(v.quantita * v.prezzoUnitario), style: 'td', alignment: 'right', bold: true }
  ]);

  const righeTotali: Content[] = [];
  if (preventivo.scontoPercento > 0) {
    righeTotali.push(
      { columns: [{ text: 'Imponibile', style: 'tot' }, { text: euro(totali.imponibile), style: 'tot', alignment: 'right' }] },
      {
        columns: [
          { text: `Sconto ${formattaNumero(preventivo.scontoPercento)}%`, style: 'tot' },
          { text: `− ${euro(totali.sconto)}`, style: 'tot', alignment: 'right' }
        ]
      }
    );
  }
  righeTotali.push(
    { columns: [{ text: 'Imponibile netto', style: 'tot' }, { text: euro(totali.scontato), style: 'tot', alignment: 'right' }] },
    {
      columns: [
        { text: `IVA ${formattaNumero(preventivo.ivaPercento)}%`, style: 'tot' },
        { text: euro(totali.iva), style: 'tot', alignment: 'right' }
      ]
    },
    {
      columns: [
        { text: 'TOTALE', style: 'totGrande' },
        { text: euro(totali.totale), style: 'totGrande', alignment: 'right' }
      ],
      margin: [0, 6, 0, 0]
    }
  );

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
      progetto
        ? {
            text: `Riferimento sopralluogo: ${progetto.nome}${progetto.luogo ? ` — ${progetto.luogo}` : ''}`,
            style: 'riferimento'
          }
        : { text: '' },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'N.', style: 'th' },
              { text: 'Descrizione', style: 'th' },
              { text: 'Q.tà', style: 'th', alignment: 'right' },
              { text: 'U.M.', style: 'th' },
              { text: 'Prezzo unit.', style: 'th', alignment: 'right' },
              { text: 'Importo', style: 'th', alignment: 'right' }
            ],
            ...righeVoci
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 14, 0, 10]
      },
      {
        columns: [{ width: '*', text: '' }, { width: 220, stack: righeTotali }]
      },
      preventivo.note.trim()
        ? { text: `Note e condizioni:\n${preventivo.note.trim()}`, style: 'note', margin: [0, 20, 0, 0] }
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
