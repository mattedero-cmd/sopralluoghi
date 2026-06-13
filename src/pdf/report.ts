import { pdfMake } from './engine';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { db } from '../db/db';
import type { Annotazione, Foto, Progetto, Quota, StatoMisura } from '../db/types';
import { leggiImpostazioni } from '../db/repository';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { caricaImmagine, fotoIllegibile } from '../utils/image';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import { misureElemento, nomePoligono, perimetroPoligono } from '../geometry/calibrazione';
import { formattaData, formattaDataOra, formattaMisura, formattaNumero } from '../utils/format';

const GRIGIO = '#555555';
const ROSSO_REALE = '#c0392b';
const ARANCIO_STIMATA = '#b9770e';

/** Lato massimo delle immagini incorporate nel PDF (peso file contenuto) */
const LATO_MAX_PDF = 1600;

/** Opzioni di esportazione, scelte al momento della generazione */
export interface OpzioniReport {
  /** id delle foto da includere; null = tutte */
  fotoIds: string[] | null;
  /** 1 = foto grande per pagina; 2 = compatto, due foto per pagina */
  fotoPerPagina: 1 | 2;
  includiIndice: boolean;
  includiRiepilogo: boolean;
  includiNoteDato: boolean;
  includiTabellaMisure: boolean;
}

export const OPZIONI_REPORT_DEFAULT: OpzioniReport = {
  fotoIds: null,
  fotoPerPagina: 1,
  includiIndice: true,
  includiRiepilogo: true,
  includiNoteDato: true,
  includiTabellaMisure: true
};

export async function generaReportPdf(
  progetto: Progetto,
  avanzamento?: (msg: string) => void,
  opzioni: OpzioniReport = OPZIONI_REPORT_DEFAULT
): Promise<Blob> {
  avanzamento?.('Lettura dati…');
  const impostazioni = await leggiImpostazioni();
  const BLU = impostazioni.pdf.colore || '#1a4f8b';
  // le foto danneggiate (contenuto perso dal browser) non possono
  // comparire nel report: vengono saltate, il resto del PDF si genera
  const fotoList = (await db.foto.where('progettoId').equals(progetto.id).toArray())
    .filter((f) => !fotoIllegibile(f))
    .filter((f) => opzioni.fotoIds === null || opzioni.fotoIds.includes(f.id))
    .sort((a, b) => a.ordine - b.ordine);
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
  if (opzioni.includiIndice) {
    contenuto.push({
      toc: { title: { text: 'Indice', style: 'h1' } },
      pageBreak: 'before'
    } as Content);
  }

  // --- Una sezione per foto ---------------------------------------------------
  fotoList.forEach((f, indice) => {
    const annotazioni = annotazioniPerFoto.get(f.id) ?? [];
    contenuto.push(...sezioneFoto(f, indice, annotazioni, opzioni, impostazioni.pdf));
  });

  // --- Tabella riassuntiva delle misure ---------------------------------------
  if (opzioni.includiRiepilogo) {
    contenuto.push(...tabellaRiassuntiva(fotoList, annotazioniPerFoto));
  }

  const pieDiPagina = impostazioni.pdf.pieDiPagina.trim() || prof.azienda || prof.nome || '';
  const def: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    info: { title: `Report — ${progetto.nome}`, author: prof.nome || 'Sopralluoghi' },
    footer: (pagina, totale) => ({
      columns: [
        { text: pieDiPagina, style: 'pie' },
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

interface RigaMisura {
  tipo: string;
  misura: string;
  stato: StatoMisura;
}

/** Tutte le misure di una foto (lineari, angolari, raggi) per le tabelle */
function righeMisureFoto(annotazioni: Annotazione[]): RigaMisura[] {
  const righe: RigaMisura[] = [];
  for (const a of [...annotazioni].sort((x, y) => x.zIndex - y.zIndex)) {
    if (a.tipo === 'quota') {
      righe.push({
        tipo: descrizioneSottotipo(a.sottotipo),
        misura: formattaMisura(a.valore, a.unita),
        stato: a.stato
      });
    } else if (a.tipo === 'quotaAngolo') {
      righe.push({
        tipo: 'Angolare',
        misura: a.valore === null ? '—' : `${formattaNumero(a.valore)}°`,
        stato: a.stato
      });
    } else if (a.tipo === 'quotaRaggio') {
      const prefisso = a.modo === 'diametro' ? '⌀ ' : 'R ';
      righe.push({
        tipo: a.modo === 'diametro' ? 'Diametro' : 'Raggio',
        misura: a.valore === null ? '—' : `${prefisso}${formattaMisura(a.valore, a.unita)}`,
        stato: a.stato
      });
    } else if (a.tipo === 'quotaRett') {
      // un elemento unico, classificato per forma (rettangolo/trapezio/
      // quadrilatero) e nomenclaturato: una sola voce, mai misure scollegate
      const m = misureElemento(a);
      const n = (v: number | null) => (v === null ? '?' : formattaNumero(v));
      const nome =
        m.forma === 'rettangolo' ? 'Rettangolo' : m.forma === 'trapezio' ? 'Trapezio' : 'Quadrilatero';
      const prefisso = a.etichetta ? `${nome} ${a.etichetta}` : nome;
      let misura: string;
      if (m.forma === 'rettangolo') {
        misura = `${n(m.baseSup)} × ${n(m.latoSx)} ${a.unita}`;
      } else if (m.forma === 'trapezio') {
        // riporta le due basi (lati paralleli) e l'altezza del lato che differisce
        const basiOrizz = n(m.baseSup) !== n(m.baseInf);
        misura = basiOrizz
          ? `basi ${n(m.baseSup)} / ${n(m.baseInf)}, h ${n(m.latoSx)} ${a.unita}`
          : `base ${n(m.baseSup)}, lati ${n(m.latoSx)} / ${n(m.latoDx)} ${a.unita}`;
      } else {
        // quadrilatero generico: tutti e quattro i lati (sup, dx, inf, sx)
        misura = `lati ${n(m.baseSup)} / ${n(m.latoDx)} / ${n(m.baseInf)} / ${n(m.latoSx)} ${a.unita}`;
      }
      righe.push({ tipo: prefisso, misura, stato: a.stato });
    } else if (a.tipo === 'quotaPoligono') {
      // elemento poligonale (triangolo, pentagono…): una sola voce con
      // il nome della forma, i lati e il perimetro quando determinabile
      const nome = nomePoligono(a.punti.length);
      const prefisso = a.etichetta ? `${nome} ${a.etichetta}` : nome;
      const n = (v: number | null) => (v === null ? '?' : formattaNumero(v));
      const lati = `lati ${a.lati.map(n).join(' / ')} ${a.unita}`;
      const perimetro = perimetroPoligono(a);
      const misura =
        perimetro !== null ? `${lati} (perim. ${formattaNumero(perimetro)} ${a.unita})` : lati;
      righe.push({ tipo: prefisso, misura, stato: a.stato });
    }
  }
  return righe;
}

function sezioneFoto(
  f: Foto,
  indice: number,
  annotazioni: Annotazione[],
  opzioni: OpzioniReport,
  pdfImp: { mostraGeotag: boolean; mostraDataScatto: boolean }
): Content[] {
  const titolo = `${indice + 1}. ${f.didascalia || `Foto ${indice + 1}`}`;
  const misure = righeMisureFoto(annotazioni);
  const callouts = annotazioni.filter((a) => a.tipo === 'callout');
  const catene = calcolaCatene(annotazioni);
  // layout compatto: due foto per pagina, immagine più bassa
  const altezzaFoto = opzioni.fotoPerPagina === 2 ? 290 : 540;
  const interrompi = opzioni.fotoPerPagina === 2 ? indice % 2 === 0 : true;

  const sottotitolo = [
    pdfImp.mostraDataScatto ? `Scattata il ${formattaDataOra(f.dataScatto)}` : '',
    pdfImp.mostraGeotag && f.geotag
      ? `GPS ${f.geotag.lat.toFixed(5)}, ${f.geotag.lng.toFixed(5)}`
      : ''
  ]
    .filter(Boolean)
    .join(' — ');

  const out: Content[] = [
    {
      text: titolo,
      style: 'h2',
      tocItem: true,
      ...(interrompi ? { pageBreak: 'before' } : { margin: [0, 18, 0, 6] })
    } as Content
  ];
  if (sottotitolo) {
    out.push({ text: sottotitolo, style: 'didascalia' });
  }
  out.push({ image: `foto_${f.id}`, fit: [515, altezzaFoto], alignment: 'center' });

  if (opzioni.includiNoteDato && f.noteDato.trim()) {
    out.push({ text: f.noteDato.trim(), style: 'corpo', margin: [0, 10, 0, 6] });
  }

  if (opzioni.includiTabellaMisure && misure.length > 0) {
    const corpoTabella = misure.map((m, i) => [
      { text: String(i + 1), style: 'td' },
      { text: m.tipo, style: 'td' },
      { text: m.misura, style: 'td', bold: true },
      {
        text: m.stato === 'reale' ? 'Reale' : 'Stimata',
        style: 'td',
        color: m.stato === 'reale' ? ROSSO_REALE : ARANCIO_STIMATA,
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

  if (opzioni.includiTabellaMisure) {
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
    const misure = righeMisureFoto(annotazioniPerFoto.get(f.id) ?? []);
    misure.forEach((m, i) => {
      righe.push([
        { text: `${indice + 1}.${i + 1}`, style: 'td' },
        { text: f.didascalia || `Foto ${indice + 1}`, style: 'td' },
        { text: m.tipo, style: 'td' },
        { text: m.misura, style: 'td', bold: true },
        {
          text: m.stato === 'reale' ? 'Reale' : 'Stimata',
          style: 'td',
          color: m.stato === 'reale' ? ROSSO_REALE : ARANCIO_STIMATA,
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
