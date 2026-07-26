/**
 * Opzioni dell'esportazione PDF del piano di taglio.
 *
 * Stanno in un modulo a sé perché la pagina le usa per la sua modale senza
 * dover caricare pdfmake: il generatore vero arriva solo quando si esporta.
 */

export interface OpzioniPdfNesting {
  /** spezzare le bobine in blocchi maneggevoli */
  segmenta: boolean;
  /** lunghezza desiderata massima del blocco (mm) */
  massimoSegmento: number;
}

export const OPZIONI_PDF_PREDEFINITE: OpzioniPdfNesting = {
  segmenta: true,
  massimoSegmento: 3000
};
