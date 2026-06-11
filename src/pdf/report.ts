import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { db } from '../db/db';
import type { Annotazione, Foto, Progetto, Quota } from '../db/types';
import { leggiImpostazioni } from '../db/repository';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { caricaImmagine } from '../utils/image';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import { formattaData, formattaDataOra, formattaMisura, formattaNumero } from '../utils/format';

// vfs_fonts esporta direttamente la mappa dei font; alcune versioni
// la annidano in pdfMake.vfs: si gestiscono entrambe le forme.
const vfs = (pdfFonts as unknown as { pdfMake?: { vfs?: Record<string, string> } }).pdfMake?.vfs ??
  (pdfFonts as unknown as Record<string, string>);
pdfMake.vfs = vfs;

const GRIGIO = '#555555';
const BLU = '#1a4f8b';
const ROSSO_REALE = '#c0392b';
const ARANCIO_STIMATA = '#b9770e';

/** Lato massimo delle immagini incorporate nel PDF (peso file contenuto) */
const LATO_MAX_PDF = 1600;

export async function generaReportPdf(
  progetto: Progetto,
  avanzamento?: (msg: string) => void
): Promise<Blob> {
  avanzamento?.('Lettura dati…');
  const impostazioni = await leggiImpostazioni();
  const fotoList = (await db.foto.where('progettoId').equals(progetto.id).toArray()).sort(
    (a, b) => a.ordine - b.ordine
  );
  const annotazioniPerFoto = new Map<string, Annotazione[]>();
  for (const f of fotoList) {
    annotazioniPerFoto.set(f.id, await db.annotazioni.where('fotoId').equals(f.id).toArray());
  }

  const immagini: Record<string, string> = {};
  for (let i = 0; i < fotoList.length; i++) {
    avanzamento?.(`Preparazione immagine ${i + 1} di ${fotoList.length}…`);
    const f = fotoList[i];
    const blob = await renderFotoAnnotata(f, annotazioniPerFoto.get(f.id) ?? []);
    immagini[`foto_${f.id}`] = await blobInDataUrlRidotto(blob, LATO_MAX_PDF);
  }

  avanzamento?.('Composizione del documento…');
  const prof = impostazioni.professionista;
  const righeProf = [prof.nome, prof.azienda, prof.indirizzo, prof.telefono, prof.email].filter(
    Boolean
  );

  const contenuto: Content[] = [];

  // --- Copertina ------------------------------------------------------------
  contenuto.push(
    { text: 'RELAZIONE DI SOPRALLUOGO', style: 'copertinaTipo', margin: [0, 120, 0, 8] },
    { text: progetto.nome, style: 'copertinaTitolo' },
    {
      text: [progetto.cliente && `Cliente: ${progetto.cliente}`, progetto.luogo && `Luogo: ${progetto.luogo}`]
        .filter(Boolean)
        .join('\n'),
      style: 'copertinaDati',
      margin: [0, 18, 0, 0]
    },
    { text: `Data: ${formattaData(Date.now())}`, style: 'copertinaDati', margin: [0, 6, 0, 0] },
    progetto.note
      ? { text: progetto.note, style: 'copertinaNote', margin: [0, 24, 0, 0] }
      : { text: '' },
    righeProf.length > 0
      ? {
          text: righeProf.join('\n'),
          style: 'copertinaProf',
          absolutePosition: { x: 40, y: 700 }
        }
      : { text: '' }
  );

  // --- Indice ---------------------------------------------------------------
  contenuto.push({
    toc: { title: { text: 'Indice', style: 'h1' } },
    pageBreak: 'before'
  } as Content);

  // --- Una sezione per foto ---------------------------------------------------
  fotoList.forEach((f, indice) => {
    const annotazioni = annotazioniPerFoto.get(f.id) ?? [];
    contenuto.push(...sezioneFoto(f, indice, annotazioni));
  });

  // --- Tabella riassuntiva delle misure ---------------------------------------
  contenuto.push(...tabellaRiassuntiva(fotoList, annotazioniPerFoto));

  const def: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    info: { title: `Report — ${progetto.nome}`, author: prof.nome || 'Sopralluoghi' },
    footer: (pagina, totale) => ({
      columns: [
        { text: prof.azienda || prof.nome || '', style: 'pie' },
        { text: `Pagina ${pagina} di ${totale}`, style: 'pie', alignment: 'right' }
      ],
      margin: [40, 16, 40, 0]
    }),
    content: contenuto,
    images: immagini,
    styles: {
      copertinaTipo: { fontSize: 13, color: GRIGIO, alignment: 'center', characterSpacing: 2 },
      copertinaTitolo: { fontSize: 30, bold: true, alignment: 'center', color: BLU },
      copertinaDati: { fontSize: 14, alignment: 'center', color: '#222222' },
      copertinaNote: { fontSize: 11, alignment: 'center', color: GRIGIO, italics: true },
      copertinaProf: { fontSize: 10, color: GRIGIO },
      h1: { fontSize: 20, bold: true, color: BLU, margin: [0, 0, 0, 12] },
      h2: { fontSize: 15, bold: true, color: BLU, margin: [0, 0, 0, 6] },
      didascalia: { fontSize: 10, color: GRIGIO, italics: true, margin: [0, 4, 0, 10] },
      corpo: { fontSize: 11, lineHeight: 1.25, margin: [0, 4, 0, 10] },
      th: { fontSize: 9, bold: true, color: '#ffffff', fillColor: BLU },
      td: { fontSize: 10 },
      pie: { fontSize: 9, color: GRIGIO }
    },
    defaultStyle: { fontSize: 11 }
  };

  avanzamento?.('Generazione PDF…');
  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(def).getBlob((blob) => resolve(blob));
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Errore nella generazione del PDF.'));
    }
  });
}

function sezioneFoto(f: Foto, indice: number, annotazioni: Annotazione[]): Content[] {
  const titolo = `${indice + 1}. ${f.didascalia || `Foto ${indice + 1}`}`;
  const quote = annotazioni
    .filter((a): a is Quota => a.tipo === 'quota')
    .sort((a, b) => a.zIndex - b.zIndex);
  const callouts = annotazioni.filter((a) => a.tipo === 'callout');
  const catene = calcolaCatene(annotazioni);

  const out: Content[] = [
    {
      text: titolo,
      style: 'h2',
      tocItem: true,
      pageBreak: 'before'
    } as Content,
    {
      text: `Scattata il ${formattaDataOra(f.dataScatto)}${
        f.geotag ? ` — GPS ${f.geotag.lat.toFixed(5)}, ${f.geotag.lng.toFixed(5)}` : ''
      }`,
      style: 'didascalia'
    },
    { image: `foto_${f.id}`, fit: [515, 540], alignment: 'center' }
  ];

  if (f.noteDato.trim()) {
    out.push({ text: f.noteDato.trim(), style: 'corpo', margin: [0, 10, 0, 6] });
  }

  if (quote.length > 0) {
    const corpoTabella = quote.map((q, i) => [
      { text: String(i + 1), style: 'td' },
      { text: descrizioneSottotipo(q.sottotipo), style: 'td' },
      { text: formattaMisura(q.valore, q.unita), style: 'td', bold: true },
      {
        text: q.stato === 'reale' ? 'Reale' : 'Stimata',
        style: 'td',
        color: q.stato === 'reale' ? ROSSO_REALE : ARANCIO_STIMATA,
        bold: true
      }
    ]);
    out.push({
      table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto', 'auto'],
        body: [
          [
            { text: 'N.', style: 'th' },
            { text: 'Tipo di quota', style: 'th' },
            { text: 'Misura', style: 'th' },
            { text: 'Stato', style: 'th' }
          ],
          ...corpoTabella
        ]
      },
      layout: 'lightHorizontalLines',
      margin: [0, 10, 0, 4]
    });
  }

  for (const c of catene) {
    const sommaU = sommaCatenaInUnita(c);
    if (sommaU !== null) {
      out.push({
        text: `Catena di ${c.quote.length} quote — totale: ${formattaNumero(sommaU)} ${c.unita}${
          c.completa ? '' : ' (parziale: alcune quote sono senza valore)'
        }`,
        style: 'corpo',
        bold: true
      });
    }
  }

  if (callouts.length > 0) {
    out.push({
      text: `Dettagli ingranditi: ${callouts
        .map((c) => (c.tipo === 'callout' ? c.etichetta : ''))
        .filter(Boolean)
        .join(', ')}`,
      style: 'didascalia'
    });
  }

  return out;
}

function tabellaRiassuntiva(
  fotoList: Foto[],
  annotazioniPerFoto: Map<string, Annotazione[]>
): Content[] {
  const righe: unknown[][] = [];
  fotoList.forEach((f, indice) => {
    const quote = (annotazioniPerFoto.get(f.id) ?? []).filter(
      (a): a is Quota => a.tipo === 'quota'
    );
    quote.forEach((q, i) => {
      righe.push([
        { text: `${indice + 1}.${i + 1}`, style: 'td' },
        { text: f.didascalia || `Foto ${indice + 1}`, style: 'td' },
        { text: descrizioneSottotipo(q.sottotipo), style: 'td' },
        { text: formattaMisura(q.valore, q.unita), style: 'td', bold: true },
        {
          text: q.stato === 'reale' ? 'Reale' : 'Stimata',
          style: 'td',
          color: q.stato === 'reale' ? ROSSO_REALE : ARANCIO_STIMATA,
          bold: true
        }
      ]);
    });
    for (const c of calcolaCatene(annotazioniPerFoto.get(f.id) ?? [])) {
      const sommaU = sommaCatenaInUnita(c);
      if (sommaU !== null) {
        righe.push([
          { text: '', style: 'td' },
          { text: f.didascalia || `Foto ${indice + 1}`, style: 'td' },
          { text: `Totale catena (${c.quote.length} quote)`, style: 'td', italics: true },
          { text: `${formattaNumero(sommaU)} ${c.unita}`, style: 'td', bold: true },
          { text: c.completa ? '' : 'parziale', style: 'td' }
        ]);
      }
    }
  });

  if (righe.length === 0) return [];
  return [
    {
      text: 'Riepilogo delle misure',
      style: 'h1',
      tocItem: true,
      pageBreak: 'before'
    } as Content,
    {
      table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto', 'auto', 'auto'],
        body: [
          [
            { text: 'Rif.', style: 'th' },
            { text: 'Foto', style: 'th' },
            { text: 'Tipo', style: 'th' },
            { text: 'Misura', style: 'th' },
            { text: 'Stato', style: 'th' }
          ],
          ...(righe as never[])
        ]
      },
      layout: 'lightHorizontalLines'
    }
  ];
}

function descrizioneSottotipo(s: Quota['sottotipo']): string {
  switch (s) {
    case 'orizzontale':
      return 'Lineare orizzontale';
    case 'verticale':
      return 'Lineare verticale';
    case 'allineata':
      return 'Lineare allineata';
  }
}

/** Converte il blob in dataURL JPEG ridimensionato per contenere il peso del PDF */
async function blobInDataUrlRidotto(blob: Blob, latoMax: number): Promise<string> {
  const img = await caricaImmagine(blob);
  const fattore = Math.min(1, latoMax / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * fattore));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * fattore));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
