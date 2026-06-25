import { pdfMake } from './engine';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { db } from '../db/db';
import type { Annotazione, Foto, Progetto, Punto, Quota, StatoMisura } from '../db/types';
import { abbondanzaTotale, segmentiPoligono, segmentoELato } from '../db/types';
import { nomeFormaPoligono, simboliPoligono, versiSegmento } from '../geometry/primitive';
import { leggiImpostazioni } from '../db/repository';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { caricaImmagine, fotoIllegibile } from '../utils/image';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import { misureElemento, perimetroReale } from '../geometry/calibrazione';
import { formattaData, formattaDataOra, formattaMisura, formattaNumero } from '../utils/format';

const GRIGIO = '#555555';
const GRIGIO_CHIARO = '#888888';
const ROSSO_REALE = '#c0392b';
const ARANCIO_STIMATA = '#b9770e';
const VERDE_TAGLIO = '#1e7d4f';
const BLU_FORMA = '#1a4f8b';

/** Lato massimo delle immagini incorporate nel PDF (peso file contenuto) */
const LATO_MAX_PDF = 1600;

/** Layout tabella riepilogo: righe spaziate, zebra leggera, niente bordi verticali */
const righeRiepilogo = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i <= 1 ? '#c9d4e3' : '#e6e6e6'),
  paddingTop: () => 7,
  paddingBottom: () => 7,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  fillColor: (rowIndex: number) => (rowIndex === 0 ? null : rowIndex % 2 === 0 ? '#f6f8fb' : null)
};

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
      tdNum: { fontSize: 11, bold: true, color: GRIGIO_CHIARO, alignment: 'center' },
      tdForma: { fontSize: 11, bold: true, color: BLU_FORMA },
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
  /** nome della forma/quota (es. "Rettangolo 1", "Cerchio", "Lineare orizz.") */
  forma: string;
  /** misure reali rilevate (es. "b 200 · h 100 cm") */
  reale: string;
  /** misure per il taglio (con abbondanze), se presenti */
  taglio?: string;
  /** dettaglio abbondanze: dove e quanto (es. "h: +2 sopra, +1 sotto") */
  abbondanze?: string;
  /** perimetro reale (ed eventualmente abbondato) */
  perimetro?: string;
  stato: StatoMisura;
}

/** descrizione "dove e quanto" delle abbondanze ai due estremi di un segmento */
function dettaglioAbb(
  simbolo: string,
  abbInizio: number | undefined,
  abbFine: number | undefined,
  p1: Punto,
  p2: Punto
): string {
  const [vA, vB] = versiSegmento(p1, p2);
  const parti = [
    abbInizio ? `+${formattaNumero(abbInizio)} ${vA}` : '',
    abbFine ? `+${formattaNumero(abbFine)} ${vB}` : ''
  ].filter(Boolean);
  return parti.length ? `${simbolo}: ${parti.join(', ')}` : '';
}

/** Tutte le misure di una foto in forma STRUTTURATA per il riepilogo */
function righeMisureFoto(annotazioni: Annotazione[]): RigaMisura[] {
  const righe: RigaMisura[] = [];
  for (const a of [...annotazioni].sort((x, y) => x.zIndex - y.zIndex)) {
    if (a.tipo === 'quota') {
      const abb = abbondanzaTotale(a);
      const reale = formattaMisura(a.valore, a.unita);
      const riga: RigaMisura = { forma: descrizioneSottotipo(a.sottotipo), reale, stato: a.stato };
      if (abb > 0 && a.valore !== null) {
        riga.taglio = formattaMisura(a.valore + abb, a.unita);
        riga.abbondanze = dettaglioAbb('misura', a.abbInizio, a.abbFine, a.p1, a.p2);
      }
      righe.push(riga);
    } else if (a.tipo === 'quotaAngolo') {
      righe.push({
        forma: a.nota ? `Angolo (${a.nota})` : 'Angolo',
        reale: a.valore === null ? '—' : `${formattaNumero(a.valore)}°`,
        stato: a.stato
      });
    } else if (a.tipo === 'quotaRaggio') {
      const diam = a.modo === 'diametro' ? a.valore : a.valore === null ? null : a.valore * 2;
      const ragg = a.modo === 'diametro' ? (a.valore === null ? null : a.valore / 2) : a.valore;
      const f = (v: number | null) => (v === null ? '?' : formattaNumero(v));
      const circ = diam === null ? null : Math.round(Math.PI * diam * 10) / 10;
      const margine = a.margine ?? 0;
      const riga: RigaMisura = {
        forma: a.nota ? `Cerchio (${a.nota})` : 'Cerchio',
        reale: `D ${f(diam)} · r ${f(ragg)} ${a.unita}`,
        perimetro: circ === null ? undefined : `circonf. ${formattaNumero(circ)} ${a.unita}`,
        stato: a.stato
      };
      if (margine > 0 && diam !== null) {
        riga.taglio = `D ${formattaNumero(diam + 2 * margine)} ${a.unita}`;
        riga.abbondanze = `+${formattaNumero(margine)} tutt'intorno`;
      }
      righe.push(riga);
    } else if (a.tipo === 'quotaRett') {
      const m = misureElemento(a);
      const n = (v: number | null) => (v === null ? '?' : formattaNumero(v));
      const nome =
        m.forma === 'rettangolo' ? 'Rettangolo' : m.forma === 'trapezio' ? 'Trapezio' : 'Quadrilatero';
      let reale: string;
      if (m.forma === 'rettangolo') reale = `b ${n(m.baseSup)} · h ${n(m.latoSx)} ${a.unita}`;
      else if (m.forma === 'trapezio')
        reale = `B ${n(m.baseSup)} · b ${n(m.baseInf)} · h ${n(m.latoSx)} ${a.unita}`;
      else reale = `${n(m.baseSup)} · ${n(m.latoDx)} · ${n(m.baseInf)} · ${n(m.latoSx)} ${a.unita}`;
      righe.push({ forma: a.etichetta ? `${nome} ${a.etichetta}` : nome, reale, stato: a.stato });
    } else if (a.tipo === 'quotaPoligono') {
      const nome = nomeFormaPoligono(a);
      const n = (v: number | null) => (v === null ? '?' : formattaNumero(v));
      const simboli = simboliPoligono(a);
      const segs = segmentiPoligono(a);
      const reale = `${segs.map((s, i) => `${simboli[i]} ${n(s.valore)}`).join(' · ')} ${a.unita}`;
      // il taglio riguarda solo i LATI: le diagonali non si tagliano
      const nVert = a.punti.length;
      const lati = segs
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => segmentoELato(s, nVert));
      const abbTot = lati.reduce((acc, { s }) => acc + abbondanzaTotale(s), 0);
      const riga: RigaMisura = { forma: a.etichetta ? `${nome} ${a.etichetta}` : nome, reale, stato: a.stato };
      if (abbTot > 0) {
        riga.taglio = `${lati
          .map(({ s, i }) => `${simboli[i]} ${s.valore === null ? '?' : formattaNumero(s.valore + abbondanzaTotale(s))}`)
          .join(' · ')} ${a.unita}`;
        riga.abbondanze = lati
          .map(({ s, i }) => dettaglioAbb(simboli[i], s.abbInizio, s.abbFine, a.punti[s.da], a.punti[s.a]))
          .filter(Boolean)
          .join('   ');
      }
      // perimetro: solo quello reale
      const perimetro = perimetroReale(a);
      if (perimetro !== null) {
        riga.perimetro = `perim. ${formattaNumero(perimetro)} ${a.unita}`;
      }
      righe.push(riga);
    }
  }
  return righe;
}

/** Cella "dettaglio" del riepilogo: misure su righe separate, con gerarchia */
function cellaDettaglio(m: RigaMisura): Content {
  const linee: Content[] = [{ text: m.reale, bold: true, fontSize: 10.5, color: '#1a1a1a' }];
  if (m.taglio) {
    linee.push({
      text: [
        { text: 'Taglio  ', color: GRIGIO_CHIARO, fontSize: 8 },
        { text: m.taglio, color: VERDE_TAGLIO, bold: true, fontSize: 9.5 }
      ],
      margin: [0, 1, 0, 0]
    });
  }
  if (m.abbondanze) {
    linee.push({
      text: [
        { text: 'Abbondanze  ', color: GRIGIO_CHIARO, fontSize: 8 },
        { text: m.abbondanze, color: GRIGIO, fontSize: 8.5 }
      ]
    });
  }
  if (m.perimetro) {
    linee.push({ text: m.perimetro, color: GRIGIO, fontSize: 8.5, italics: true });
  }
  return { stack: linee };
}

/** Cella "stato" del riepilogo: pallino colorato + etichetta */
function cellaStato(stato: StatoMisura): Content {
  const reale = stato === 'reale';
  return {
    text: reale ? '● Reale' : '◐ Stimata',
    color: reale ? ROSSO_REALE : ARANCIO_STIMATA,
    bold: true,
    fontSize: 9
  };
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
      { text: String(i + 1), style: 'tdNum' },
      { text: m.forma, style: 'tdForma' },
      cellaDettaglio(m),
      cellaStato(m.stato)
    ]);
    out.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [22, 'auto', '*', 'auto'],
        body: [
          [
            { text: 'N.', style: 'th' },
            { text: 'Elemento', style: 'th' },
            { text: 'Misure', style: 'th' },
            { text: 'Stato', style: 'th' }
          ],
          ...corpoTabella
        ]
      },
      layout: righeRiepilogo,
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
  const righe: Content[][] = [];
  fotoList.forEach((f, indice) => {
    const misure = righeMisureFoto(annotazioniPerFoto.get(f.id) ?? []);
    misure.forEach((m, i) => {
      righe.push([
        { text: `${indice + 1}.${i + 1}`, style: 'tdNum' },
        { text: f.didascalia || `Foto ${indice + 1}`, fontSize: 8.5, color: GRIGIO_CHIARO },
        { text: m.forma, style: 'tdForma' },
        cellaDettaglio(m),
        cellaStato(m.stato)
      ]);
    });
    for (const c of calcolaCatene(annotazioniPerFoto.get(f.id) ?? [])) {
      const sommaU = sommaCatenaInUnita(c);
      if (sommaU !== null) {
        righe.push([
          { text: '', style: 'tdNum' },
          { text: f.didascalia || `Foto ${indice + 1}`, fontSize: 8.5, color: GRIGIO_CHIARO },
          { text: `Catena (${c.quote.length})`, style: 'tdForma', italics: true },
          {
            text: `${formattaNumero(sommaU)} ${c.unita}${c.completa ? '' : ' (parziale)'}`,
            bold: true,
            fontSize: 10.5
          },
          { text: '', style: 'td' }
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
        dontBreakRows: true,
        widths: [28, 'auto', 'auto', '*', 'auto'],
        body: [
          [
            { text: 'Rif.', style: 'th' },
            { text: 'Foto', style: 'th' },
            { text: 'Elemento', style: 'th' },
            { text: 'Misure', style: 'th' },
            { text: 'Stato', style: 'th' }
          ],
          ...righe
        ]
      },
      layout: righeRiepilogo
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
