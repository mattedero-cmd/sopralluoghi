import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// vfs_fonts esporta direttamente la mappa dei font; alcune versioni
// la annidano in pdfMake.vfs: si gestiscono entrambe le forme.
const vfs =
  (pdfFonts as unknown as { pdfMake?: { vfs?: Record<string, string> } }).pdfMake?.vfs ??
  (pdfFonts as unknown as Record<string, string>);
pdfMake.vfs = vfs;

export { pdfMake };

export const COLORI_PDF = {
  grigio: '#555555',
  blu: '#1a4f8b',
  rossoReale: '#c0392b',
  arancioStimata: '#b9770e'
};
