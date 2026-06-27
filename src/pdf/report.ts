import { pdfMake } from './engine';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { db } from '../db/db';
import type { Annotazione, Cartella, Foto, Progetto, Punto, Quota, QuotaPoligono, StatoMisura } from '../db/types';
import { abbondanzaTotale, segmentiPoligono, segmentoELato } from '../db/types';
import { nomeFormaPoligono, simboliPoligono, versiSegmento } from '../geometry/primitive';
import {
  codiceCompletoForma,
  codiceLocaleForma,
  eCopiaEtichetta,
  eFormaEtichettabile,
  famigliaDi,
  numeriProgetto,
  percorsoDellaFoto,
  percorsoEtichette,
  type NumeroForma
} from '../geometry/nomenclatura';
import { leggiImpostazioni } from '../db/repository';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { caricaImmagine, fotoIllegibile } from '../utils/image';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import {
  angoliTriangolo,
  areaElemento,
  areaReale,
  misureElemento,
  perimetroReale,
  type AreaReale
} from '../geometry/calibrazione';
import {
  formattaData,
  formattaDataOra,
  formattaMisura,
  formattaNumero,
  inMillimetri
} from '../utils/format';

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
  /** distinta di taglio: elenco dei pezzi da produrre con misure di taglio */
  includiDistinta: boolean;
}

export const OPZIONI_REPORT_DEFAULT: OpzioniReport = {
  fotoIds: null,
  fotoPerPagina: 1,
  includiIndice: true,
  includiRiepilogo: true,
  includiNoteDato: true,
  includiTabellaMisure: true,
  includiDistinta: true
};

/**
 * Contesto di numerazione GLOBALE (tutto l'archivio): serve perché i codici e
 * le misure restino coerenti anche quando una misura originale è richiamata in
 * foto o cartelle diverse. Il report disegna solo le sue foto, ma numera e
 * recupera le misure guardando l'intero progetto/edificio.
 */
interface ContestoGlobale {
  numeri: Map<string, NumeroForma>;
  /** percorso (cartelle + progetto) di ogni foto */
  percorsoFoto: Map<string, string[]>;
  /** originale (misura vera) di ogni famiglia, con la sua foto (per area/scala) */
  originaleFamiglia: Map<string, { forma: Annotazione; foto: Foto }>;
  /** tutti i membri (originale + copie) di ogni famiglia */
  membriFamiglia: Map<string, Annotazione[]>;
}

async function caricaContestoGlobale(): Promise<ContestoGlobale> {
  const [foto, ann, progetti, cartelle] = await Promise.all([
    db.foto.toArray(),
    db.annotazioni.toArray(),
    db.progetti.toArray(),
    db.cartelle.toArray()
  ]);
  const fotoDi = new Map(foto.map((f) => [f.id, f]));
  const annPerFoto = new Map<string, Annotazione[]>();
  for (const a of ann) {
    if (!annPerFoto.has(a.fotoId)) annPerFoto.set(a.fotoId, []);
    annPerFoto.get(a.fotoId)!.push(a);
  }
  const progettoDi = new Map(progetti.map((p) => [p.id, p]));
  const percorsoFoto = new Map<string, string[]>();
  for (const f of foto) {
    const p = progettoDi.get(f.progettoId);
    percorsoFoto.set(f.id, p ? percorsoDellaFoto(f, p, cartelle) : []);
  }

  const numeri = numeriProgetto(
    foto,
    (id) => annPerFoto.get(id) ?? [],
    (id) => percorsoFoto.get(id) ?? []
  );

  const membriFamiglia = new Map<string, Annotazione[]>();
  for (const a of ann) {
    if (!eFormaEtichettabile(a)) continue;
    const k = famigliaDi(a);
    if (!membriFamiglia.has(k)) membriFamiglia.set(k, []);
    membriFamiglia.get(k)!.push(a);
  }
  const originaleFamiglia = new Map<string, { forma: Annotazione; foto: Foto }>();
  for (const [k, membri] of membriFamiglia) {
    const orig = membri.find((m) => !eCopiaEtichetta(m)) ?? membri[0];
    const f = fotoDi.get(orig.fotoId);
    if (f) originaleFamiglia.set(k, { forma: orig, foto: f });
  }
  return { numeri, percorsoFoto, originaleFamiglia, membriFamiglia };
}

/** codice locale (badge sulla foto, es. A1.2) di una forma nel contesto globale */
function codiceLocaleCtx(ctx: ContestoGlobale, a: Annotazione): string {
  return codiceLocaleForma(a, ctx.numeri);
}

/** elenco dei codici delle copie di una famiglia DENTRO un percorso (cartella) */
function codiciCopie(ctx: ContestoGlobale, famKey: string, percorso: string[]): string[] {
  const chiave = percorso.join(' ');
  return (ctx.membriFamiglia.get(famKey) ?? [])
    .filter((m) => (ctx.percorsoFoto.get(m.fotoId) ?? []).join(' ') === chiave)
    .map((m) => ({ m, sub: ctx.numeri.get(m.id)?.sub ?? 0 }))
    .sort((x, y) => x.sub - y.sub)
    .map(({ m }) => codiceCompletoForma(percorso, codiceLocaleForma(m, ctx.numeri)));
}

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
  // percorso di etichette (cartelle annidate + progetto) per i codici delle forme
  const cartelle = await db.cartelle.toArray();
  const percorso = percorsoEtichette(progetto, cartelle);
  // numerazione/misure coerenti su tutto l'archivio (richiami tra foto e cartelle)
  const ctx = await caricaContestoGlobale();

  const immagini: Record<string, string> = {};
  for (let i = 0; i < fotoList.length; i++) {
    avanzamento?.(`Preparazione immagine ${i + 1} di ${fotoList.length}…`);
    const f = fotoList[i];
    const blob = await renderFotoAnnotata(f, annotazioniPerFoto.get(f.id) ?? [], 'image/jpeg', 0.92, (a) =>
      codiceLocaleCtx(ctx, a)
    );
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
  // raggruppa le foto per SEZIONE del progetto (piani), con un'intestazione
  const sezioni = [...(progetto.sezioni ?? [])].sort((a, b) => a.ordine - b.ordine);
  const rankSez = (f: Foto) => {
    const i = sezioni.findIndex((s) => s.id === f.sezioneId);
    return i < 0 ? 1e9 : i;
  };
  fotoList.sort((a, b) => rankSez(a) - rankSez(b) || a.ordine - b.ordine);
  let sezPrec: string | null | undefined = ' ';
  fotoList.forEach((f, indice) => {
    const annotazioni = annotazioniPerFoto.get(f.id) ?? [];
    const perc = ctx.percorsoFoto.get(f.id) ?? percorso;
    const sid = f.sezioneId && sezioni.some((s) => s.id === f.sezioneId) ? f.sezioneId : null;
    let titoloSez: string | undefined;
    if (sezioni.length > 0 && sid !== sezPrec) {
      const s = sezioni.find((x) => x.id === sid);
      titoloSez = s ? `${s.nome}${s.etichetta ? ` — ${s.etichetta}` : ''}` : 'Senza sezione';
    }
    sezPrec = sid;
    contenuto.push(...sezioneFoto(f, indice, annotazioni, opzioni, impostazioni.pdf, ctx, perc, undefined, titoloSez));
  });

  // ogni foto usa il proprio percorso (cartelle + progetto + sezione)
  const info: InfoFoto = (f) => ({ ctx, percorso: ctx.percorsoFoto.get(f.id) ?? percorso });

  // --- Tabella riassuntiva delle misure ---------------------------------------
  if (opzioni.includiRiepilogo) {
    contenuto.push(...tabellaRiassuntiva(fotoList, annotazioniPerFoto, info));
  }

  // --- Distinta di taglio (pezzi da produrre) ---------------------------------
  if (opzioni.includiDistinta) {
    contenuto.push(...distintaTaglio(fotoList, annotazioniPerFoto, info));
  }

  const pieDiPagina = impostazioni.pdf.pieDiPagina.trim() || prof.azienda || prof.nome || '';
  const def = documentoReport({
    BLU,
    titoloInfo: `Report — ${progetto.nome}`,
    autore: prof.nome || 'Sopralluoghi',
    pieDiPagina,
    contenuto,
    immagini
  });

  avanzamento?.('Generazione PDF…');
  return creaBlobPdf(def);
}

/** Stili e impalcatura comuni a tutti i report (singolo progetto o cartella) */
function documentoReport(args: {
  BLU: string;
  titoloInfo: string;
  autore: string;
  pieDiPagina: string;
  contenuto: Content[];
  immagini: Record<string, string>;
}): TDocumentDefinitions {
  const { BLU } = args;
  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    info: { title: args.titoloInfo, author: args.autore },
    footer: (pagina, totale) => ({
      columns: [
        { text: args.pieDiPagina, style: 'pie' },
        { text: `Pagina ${pagina} di ${totale}`, style: 'pie', alignment: 'right' }
      ],
      margin: [40, 16, 40, 0]
    }),
    content: args.contenuto,
    images: args.immagini,
    styles: {
      copertinaTipo: { fontSize: 13, color: GRIGIO, alignment: 'center', characterSpacing: 2 },
      copertinaTitolo: { fontSize: 30, bold: true, alignment: 'center', color: BLU },
      copertinaDati: { fontSize: 14, alignment: 'center', color: '#222222' },
      copertinaNote: { fontSize: 11, alignment: 'center', color: GRIGIO, italics: true },
      copertinaProf: { fontSize: 10, color: GRIGIO },
      h1: { fontSize: 20, bold: true, color: BLU, margin: [0, 0, 0, 12] },
      h2: { fontSize: 15, bold: true, color: BLU, margin: [0, 0, 0, 6] },
      h3: { fontSize: 12.5, bold: true, color: '#33424f', margin: [0, 0, 0, 4] },
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
}

function creaBlobPdf(def: TDocumentDefinitions): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(def).getBlob((blob) => resolve(blob));
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Errore nella generazione del PDF.'));
    }
  });
}

/**
 * Report di una CARTELLA: struttura a capitoli che rispecchia l'albero delle
 * cartelle. La cartella scelta è il documento; le sue sottocartelle sono i
 * capitoli (1, 2…), le loro sottocartelle i sottocapitoli (1.1, 1.2…). Per
 * ogni cartella: nome = titolo, note = descrizione, foto dei progetti =
 * contenuto, misure = distinta inline. In coda riepilogo e distinta globali.
 */
export async function generaReportCartella(
  cartellaId: string,
  avanzamento?: (msg: string) => void,
  opzioni: OpzioniReport = OPZIONI_REPORT_DEFAULT
): Promise<Blob> {
  avanzamento?.('Lettura dati…');
  const impostazioni = await leggiImpostazioni();
  const BLU = impostazioni.pdf.colore || '#1a4f8b';
  const prof = impostazioni.professionista;

  const tutteCartelle = await db.cartelle.toArray();
  const tuttiProgetti = await db.progetti.toArray();
  const radice = tutteCartelle.find((c) => c.id === cartellaId);
  if (!radice) throw new Error('Cartella non trovata.');

  const figlie = (id: string) =>
    tutteCartelle.filter((c) => c.parentId === id).sort((a, b) => a.nome.localeCompare(b.nome));
  const progettiIn = (id: string) =>
    tuttiProgetti.filter((p) => p.cartellaId === id).sort((a, b) => a.nome.localeCompare(b.nome));

  // numerazione/misure coerenti su tutto l'archivio (richiami tra cartelle)
  const ctx = await caricaContestoGlobale();

  const fotoPerProgetto = new Map<string, Foto[]>();
  const annotPerFoto = new Map<string, Annotazione[]>();
  const tutteFoto: Foto[] = [];

  const caricaProgetto = async (p: Progetto) => {
    const lista = (await db.foto.where('progettoId').equals(p.id).toArray())
      .filter((f) => !fotoIllegibile(f))
      .sort((a, b) => a.ordine - b.ordine);
    fotoPerProgetto.set(p.id, lista);
    for (const f of lista) {
      annotPerFoto.set(f.id, await db.annotazioni.where('fotoId').equals(f.id).toArray());
      tutteFoto.push(f);
    }
  };
  const raccogli = async (id: string) => {
    for (const p of progettiIn(id)) await caricaProgetto(p);
    for (const c of figlie(id)) await raccogli(c.id);
  };
  await raccogli(radice.id);

  if (tutteFoto.length === 0) {
    throw new Error('La cartella non contiene foto da inserire nel report.');
  }

  const immagini: Record<string, string> = {};
  for (let i = 0; i < tutteFoto.length; i++) {
    avanzamento?.(`Preparazione immagine ${i + 1} di ${tutteFoto.length}…`);
    const f = tutteFoto[i];
    const blob = await renderFotoAnnotata(f, annotPerFoto.get(f.id) ?? [], 'image/jpeg', 0.92, (a) =>
      codiceLocaleCtx(ctx, a)
    );
    immagini[`foto_${f.id}`] = await blobInDataUrlRidotto(blob, LATO_MAX_PDF);
  }

  avanzamento?.('Composizione del documento…');
  let indiceFoto = 0;

  // foto di tutti i progetti DIRETTI di una cartella (contenuto della sezione)
  const fotoDiretteDi = (folder: Cartella): Content[] => {
    const out: Content[] = [];
    for (const p of progettiIn(folder.id)) {
      const lista = fotoPerProgetto.get(p.id) ?? [];
      if (lista.length === 0) continue;
      out.push({ text: p.nome, style: 'h3', margin: [0, 8, 0, 4] });
      if (p.note.trim()) out.push({ text: p.note.trim(), style: 'corpo', italics: true });
      // foto raggruppate per sezione del progetto, con una riga d'intestazione
      const sezioni = [...(p.sezioni ?? [])].sort((a, b) => a.ordine - b.ordine);
      const rankSez = (f: Foto) => {
        const i = sezioni.findIndex((s) => s.id === f.sezioneId);
        return i < 0 ? 1e9 : i;
      };
      const ordinata = [...lista].sort((a, b) => rankSez(a) - rankSez(b) || a.ordine - b.ordine);
      let sezPrec: string | null | undefined = ' ';
      for (const f of ordinata) {
        const sid = f.sezioneId && sezioni.some((s) => s.id === f.sezioneId) ? f.sezioneId : null;
        if (sezioni.length > 0 && sid !== sezPrec) {
          const s = sezioni.find((x) => x.id === sid);
          out.push({
            text: s ? `${s.nome}${s.etichetta ? ` — ${s.etichetta}` : ''}` : 'Senza sezione',
            style: 'corpo',
            bold: true,
            margin: [0, 6, 0, 2]
          });
        }
        sezPrec = sid;
        out.push(
          ...sezioneFoto(f, indiceFoto++, annotPerFoto.get(f.id) ?? [], opzioni, impostazioni.pdf, ctx, ctx.percorsoFoto.get(f.id) ?? [], {
            style: 'h3',
            toc: false,
            etichetta: ''
          })
        );
      }
    }
    return out;
  };

  // capitolo ricorsivo: depth 0 = capitolo (h1), 1 = sottocapitolo (h2), ≥2 = h3
  const sezioneCartella = (folder: Cartella, numero: string, depth: number): Content[] => {
    const stile = depth === 0 ? 'h1' : depth === 1 ? 'h2' : 'h3';
    const prefisso = depth === 0 ? `Capitolo ${numero} — ` : `${numero} — `;
    const out: Content[] = [
      {
        text: `${prefisso}${folder.nome}`,
        style: stile,
        tocItem: depth <= 1,
        ...(depth === 0 ? { pageBreak: 'before' } : { margin: [0, 14, 0, 4] })
      } as Content
    ];
    if (folder.note?.trim()) out.push({ text: folder.note.trim(), style: 'corpo', italics: true });
    out.push(...fotoDiretteDi(folder));
    figlie(folder.id).forEach((c, i) => out.push(...sezioneCartella(c, `${numero}.${i + 1}`, depth + 1)));
    return out;
  };

  const contenuto: Content[] = [];
  const righeProf = [prof.nome, prof.azienda, prof.indirizzo, prof.telefono, prof.email].filter(Boolean);
  contenuto.push(
    { text: 'RELAZIONE DI SOPRALLUOGO', style: 'copertinaTipo', margin: [0, 120, 0, 8] },
    { text: radice.nome, style: 'copertinaTitolo' },
    { text: `Data: ${formattaData(Date.now())}`, style: 'copertinaDati', margin: [0, 18, 0, 0] },
    radice.note?.trim()
      ? { text: radice.note.trim(), style: 'copertinaNote', margin: [0, 24, 0, 0] }
      : { text: '' },
    righeProf.length > 0
      ? { text: righeProf.join('\n'), style: 'copertinaProf', absolutePosition: { x: 40, y: 700 } }
      : { text: '' }
  );
  if (opzioni.includiIndice) {
    contenuto.push({ toc: { title: { text: 'Indice', style: 'h1' } }, pageBreak: 'before' } as Content);
  }

  // i progetti direttamente nella cartella radice fanno da introduzione;
  // le sottocartelle diventano i capitoli numerati
  const introRadice = fotoDiretteDi(radice);
  if (introRadice.length > 0) {
    contenuto.push({ text: radice.nome, style: 'h1', tocItem: true, pageBreak: 'before' } as Content);
    if (radice.note?.trim()) contenuto.push({ text: radice.note.trim(), style: 'corpo', italics: true });
    contenuto.push(...introRadice);
  }
  figlie(radice.id).forEach((c, i) => contenuto.push(...sezioneCartella(c, String(i + 1), 0)));

  const info: InfoFoto = (f) => ({ ctx, percorso: ctx.percorsoFoto.get(f.id) ?? [] });
  if (opzioni.includiRiepilogo) {
    contenuto.push(...tabellaRiassuntiva(tutteFoto, annotPerFoto, info));
  }
  if (opzioni.includiDistinta) {
    contenuto.push(...distintaTaglio(tutteFoto, annotPerFoto, info));
  }

  const pieDiPagina = impostazioni.pdf.pieDiPagina.trim() || prof.azienda || prof.nome || '';
  const def = documentoReport({
    BLU,
    titoloInfo: `Report — ${radice.nome}`,
    autore: prof.nome || 'Sopralluoghi',
    pieDiPagina,
    contenuto,
    immagini
  });
  avanzamento?.('Generazione PDF…');
  return creaBlobPdf(def);
}

interface RigaMisura {
  /** codice strutturato della forma (es. "P1.A1"); assente per le quote lineari */
  codice?: string;
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
  /** angoli ai vertici (solo triangolo): es. "α 60° · β 60° · γ 60°" */
  angoli?: string;
  /** superficie in m² */
  area?: string;
  /** true se l'area è un calcolo esatto; false se è una stima dai pixel */
  areaAffidabile?: boolean;
  /** superficie numerica in m² (per i totali della distinta di taglio) */
  areaM2?: number;
  /** true se è un PEZZO da produrre (poligono, elemento, cerchio): entra
   *  nella distinta di taglio. Le quote lineari e gli angoli no. */
  pezzo?: boolean;
  /** elementi RIPETUTI: quantità totale di copie uguali (>1) della famiglia */
  quantita?: number;
  /** codici delle copie collegate (es. ["A1.1","A1.2",…]) */
  collegati?: string[];
  /** copia richiamata: codice della misura ORIGINALE da cui deriva (es. "A1") */
  derivaDa?: string;
  stato: StatoMisura;
}

/** Converte un'area da (unità lineari)² a m² */
function areaLineareInM2(area: number, unita: Quota['unita']): number {
  const mmPerUnita = inMillimetri(1, unita);
  return (area * mmPerUnita * mmPerUnita) / 1_000_000;
}

/** Testo della superficie in m² (più decimali per le aree piccole) */
function formattaArea(a: AreaReale): string {
  const v = a.m2;
  const txt = v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4);
  return `${txt.replace('.', ',')} m²`;
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

/** Misure (lati, taglio, perimetro, angoli, area) di un poligono, dalla forma
 *  ORIGINALE: condivise da tutte le istanze della famiglia (fonte unica). */
function dettaglioPoligono(formaMis: QuotaPoligono, fotoMis: Foto): Partial<RigaMisura> {
  const n = (v: number | null) => (v === null ? '?' : formattaNumero(v));
  const simboli = simboliPoligono(formaMis);
  const segs = segmentiPoligono(formaMis);
  const out: Partial<RigaMisura> = {
    forma: nomeFormaPoligono(formaMis),
    reale: `${segs.map((s, i) => `${simboli[i]} ${n(s.valore)}`).join(' · ')} ${formaMis.unita}`
  };
  // il taglio riguarda solo i LATI: le diagonali non si tagliano
  const nVert = formaMis.punti.length;
  const lati = segs.map((s, i) => ({ s, i })).filter(({ s }) => segmentoELato(s, nVert));
  const abbTot = lati.reduce((acc, { s }) => acc + abbondanzaTotale(s), 0);
  if (abbTot > 0) {
    out.taglio = `${lati
      .map(({ s, i }) => `${simboli[i]} ${s.valore === null ? '?' : formattaNumero(s.valore + abbondanzaTotale(s))}`)
      .join(' · ')} ${formaMis.unita}`;
    out.abbondanze = lati
      .map(({ s, i }) => dettaglioAbb(simboli[i], s.abbInizio, s.abbFine, formaMis.punti[s.da], formaMis.punti[s.a]))
      .filter(Boolean)
      .join('   ');
  }
  const perimetro = perimetroReale(formaMis);
  if (perimetro !== null) out.perimetro = `perim. ${formattaNumero(perimetro)} ${formaMis.unita}`;
  const angoli = angoliTriangolo(formaMis);
  if (angoli) {
    const lett = ['α', 'β', 'γ'];
    out.angoli = angoli.map((g, i) => `${lett[i]} ${formattaNumero(g)}°`).join(' · ');
  }
  const area = areaReale(formaMis, fotoMis);
  if (area) {
    out.area = formattaArea(area);
    out.areaAffidabile = area.affidabile;
    out.areaM2 = area.m2;
  }
  return out;
}

/**
 * Tutte le misure di una foto in forma STRUTTURATA.
 * - `modo` 'perFoto': una riga per OGNI istanza presente nella foto (le copie
 *   richiamate compaiono sotto la foto dove sono state usate, con il rimando
 *   alla misura originale);
 * - `modo` 'aggregato' (default): la famiglia compare UNA volta per cartella,
 *   con quantità e sotto-elenco — per riepilogo generale e distinta di taglio.
 */
function righeMisureFoto(
  annotazioni: Annotazione[],
  foto: Foto,
  ctx: ContestoGlobale,
  percorso: string[] = [],
  modo: 'perFoto' | 'aggregato' = 'aggregato'
): RigaMisura[] {
  const numeri = ctx.numeri;
  // codice strutturato completo di una forma (percorso cartelle + etich.+numero)
  const codiceForma = (a: Annotazione): string =>
    codiceCompletoForma(percorso, codiceLocaleForma(a, numeri));
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
      // area del cerchio = π r² dalla misura reale
      riga.pezzo = true;
      if (ragg !== null) {
        const m2 = areaLineareInM2(Math.PI * ragg * ragg, a.unita);
        riga.area = formattaArea({ m2, affidabile: true, metodo: 'rettangolo' });
        riga.areaAffidabile = true;
        riga.areaM2 = m2;
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
      const rigaR: RigaMisura = { codice: codiceForma(a), forma: nome, reale, stato: a.stato, pezzo: true };
      const areaR = areaElemento(a, foto);
      if (areaR) {
        rigaR.area = formattaArea(areaR);
        rigaR.areaAffidabile = areaR.affidabile;
        rigaR.areaM2 = areaR.m2;
      }
      righe.push(rigaR);
    } else if (a.tipo === 'quotaPoligono') {
      const infoFam = numeri.get(a.id);
      // la MISURA è sempre quella dell'ORIGINALE della famiglia (fonte unica)
      const famKey = famigliaDi(a);
      const orig = ctx.originaleFamiglia.get(famKey);
      const formaMis = orig && orig.forma.tipo === 'quotaPoligono' ? orig.forma : a;
      const fotoMis = orig?.foto ?? foto;
      const base = `${infoFam?.etichettaFoto ?? ''}${infoFam?.numero ?? ''}`;
      const det = dettaglioPoligono(formaMis, fotoMis);
      if (modo === 'perFoto') {
        // una riga per OGNI istanza presente in QUESTA foto, nella sua posizione
        // reale. Le copie richiamate indicano la misura originale da cui derivano.
        const riga: RigaMisura = {
          ...det,
          forma: det.forma ?? '',
          reale: det.reale ?? '',
          codice: codiceForma(a),
          stato: formaMis.stato,
          pezzo: true
        };
        if (eCopiaEtichetta(a) && infoFam) riga.derivaDa = codiceCompletoForma(percorso, base);
        righe.push(riga);
      } else {
        // aggregato: la famiglia compare UNA sola volta per cartella (rappresentante
        // sub 1, o forma singola); le copie successive vengono saltate.
        if (infoFam && infoFam.sub && infoFam.sub > 1) continue;
        const riga: RigaMisura = {
          ...det,
          forma: det.forma ?? '',
          reale: det.reale ?? '',
          codice: codiceForma(a),
          stato: formaMis.stato,
          pezzo: true
        };
        if (infoFam && infoFam.quantitaGlobale > 1) {
          riga.quantita = infoFam.quantita; // copie in questa cartella
          riga.codice = codiceCompletoForma(percorso, base); // "A1" senza sotto-indice
          riga.collegati = codiciCopie(ctx, famKey, percorso);
        }
        righe.push(riga);
      }
    }
  }
  return righe;
}

/**
 * Cella "codice": la misura originale come riferimento principale e, sotto, il
 * sotto-elenco dei codici delle copie collegate (A1 → A1.1, A1.2, A1.3…).
 */
function cellaCodice(m: RigaMisura, fallback: string): Content {
  const base = m.codice ?? fallback;
  if (!m.collegati || m.collegati.length <= 1) {
    return { text: base, style: m.codice ? 'tdForma' : 'tdNum' };
  }
  return {
    stack: [
      { text: base, style: 'tdForma' },
      ...m.collegati.map(
        (c) =>
          ({
            text: `• ${c}`,
            fontSize: 8.5,
            color: GRIGIO,
            margin: [6, 1, 0, 0]
          }) as Content
      )
    ]
  };
}

/** Cella "dettaglio" del riepilogo: misure su righe separate, con gerarchia */
function cellaDettaglio(m: RigaMisura): Content {
  const linee: Content[] = [{ text: m.reale, bold: true, fontSize: 10.5, color: '#1a1a1a' }];
  if (m.derivaDa) {
    // copia richiamata: rimando chiaro alla misura originale
    linee.push({
      text: [
        { text: '↳ ', color: BLU_FORMA, fontSize: 9 },
        { text: 'copia di ', color: GRIGIO_CHIARO, fontSize: 8 },
        { text: m.derivaDa, color: BLU_FORMA, bold: true, fontSize: 9 }
      ],
      margin: [0, 2, 0, 0]
    });
  }
  if (m.quantita && m.quantita > 1) {
    // quantità in evidenza (il sotto-elenco dei codici è nella colonna "Cod.")
    linee.push({
      text: [
        { text: '▣ ', color: BLU_FORMA, fontSize: 10 },
        { text: `${m.quantita} elementi uguali`, color: BLU_FORMA, bold: true, fontSize: 10 }
      ],
      margin: [0, 2, 0, 1]
    });
  }
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
  if (m.angoli) {
    linee.push({
      text: [
        { text: 'Angoli  ', color: GRIGIO_CHIARO, fontSize: 8 },
        { text: m.angoli, color: GRIGIO, fontSize: 8.5 }
      ]
    });
  }
  if (m.perimetro) {
    linee.push({ text: m.perimetro, color: GRIGIO, fontSize: 8.5, italics: true });
  }
  if (m.area) {
    // area in evidenza; se è una stima (prospettiva non corretta) lo si dice
    linee.push({
      text: [
        { text: 'Area  ', color: GRIGIO_CHIARO, fontSize: 8 },
        { text: m.area, color: BLU_FORMA, bold: true, fontSize: 9.5 },
        ...(m.areaAffidabile === false
          ? [{ text: '  (stima — calibra un piano)', color: ARANCIO_STIMATA, fontSize: 7.5, italics: true }]
          : [])
      ],
      margin: [0, 1, 0, 0]
    });
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
  pdfImp: { mostraGeotag: boolean; mostraDataScatto: boolean },
  ctx: ContestoGlobale,
  percorso: string[],
  /** stile del titolo della foto e voce indice: nel report di cartella le foto
   *  sono "contenuto" dei capitoli, quindi titolo più piccolo e fuori indice */
  titoloFoto: { style: string; toc: boolean; etichetta: string } = {
    style: 'h2',
    toc: true,
    etichetta: `${indice + 1}. `
  },
  /** intestazione di sezione (es. "Piano 1 — P1") da mostrare sopra questa foto:
   *  presente solo sulla PRIMA foto di ogni sezione del progetto */
  sezioneTitolo?: string
): Content[] {
  const titolo = `${titoloFoto.etichetta}${f.didascalia || `Foto ${indice + 1}`}`;
  // sotto la foto: SOLO gli elementi realmente presenti in questa foto (le copie
  // richiamate compaiono qui, non sotto la foto della misura originale)
  const misure = righeMisureFoto(annotazioni, f, ctx, percorso, 'perFoto');
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

  const out: Content[] = [];
  // intestazione di sezione: porta lei l'interruzione di pagina, così resta
  // attaccata alla sua prima foto (niente titolo orfano in fondo alla pagina)
  if (sezioneTitolo) {
    out.push({
      text: sezioneTitolo,
      style: 'h2',
      tocItem: true,
      ...(interrompi ? { pageBreak: 'before' } : { margin: [0, 16, 0, 2] })
    } as Content);
  }
  out.push({
    text: titolo,
    style: titoloFoto.style,
    tocItem: titoloFoto.toc,
    ...(interrompi && !sezioneTitolo ? { pageBreak: 'before' } : { margin: [0, sezioneTitolo ? 4 : 18, 0, 6] })
  } as Content);
  if (sottotitolo) {
    out.push({ text: sottotitolo, style: 'didascalia' });
  }
  out.push({ image: `foto_${f.id}`, fit: [515, altezzaFoto], alignment: 'center' });

  if (opzioni.includiNoteDato && f.noteDato.trim()) {
    out.push({ text: f.noteDato.trim(), style: 'corpo', margin: [0, 10, 0, 6] });
  }

  if (opzioni.includiTabellaMisure && misure.length > 0) {
    const corpoTabella = misure.map((m, i) => [
      cellaCodice(m, String(i + 1)),
      { text: m.forma, style: 'tdForma' },
      cellaDettaglio(m),
      cellaStato(m.stato)
    ]);
    out.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [40, 'auto', '*', 'auto'],
        body: [
          [
            { text: 'Cod.', style: 'th' },
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

/** per ogni foto: il contesto di numerazione e il percorso di etichette */
type InfoFoto = (f: Foto) => { ctx: ContestoGlobale; percorso: string[] };

function tabellaRiassuntiva(
  fotoList: Foto[],
  annotazioniPerFoto: Map<string, Annotazione[]>,
  info: InfoFoto
): Content[] {
  const righe: Content[][] = [];
  fotoList.forEach((f, indice) => {
    const { ctx, percorso } = info(f);
    const misure = righeMisureFoto(annotazioniPerFoto.get(f.id) ?? [], f, ctx, percorso);
    misure.forEach((m, i) => {
      righe.push([
        cellaCodice(m, `${indice + 1}.${i + 1}`),
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
        widths: [42, 'auto', 'auto', '*', 'auto'],
        body: [
          [
            { text: 'Cod.', style: 'th' },
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

/**
 * Distinta di taglio: elenco di TUTTI i pezzi da produrre (poligoni, elementi,
 * cerchi) con la misura reale, la misura DI TAGLIO (reale + abbondanze) e la
 * superficie. In coda i totali: numero pezzi e superficie complessiva.
 */
function distintaTaglio(
  fotoList: Foto[],
  annotazioniPerFoto: Map<string, Annotazione[]>,
  info: InfoFoto
): Content[] {
  const righe: Content[][] = [];
  let nPezzi = 0;
  let areaTot = 0;
  let areaCompleta = true; // false se a qualche pezzo manca l'area

  fotoList.forEach((f) => {
    const { ctx, percorso } = info(f);
    const misure = righeMisureFoto(annotazioniPerFoto.get(f.id) ?? [], f, ctx, percorso).filter(
      (m) => m.pezzo
    );
    misure.forEach((m) => {
      const qta = m.quantita && m.quantita > 1 ? m.quantita : 1;
      nPezzi += qta;
      if (m.areaM2 !== undefined) areaTot += m.areaM2 * qta;
      else areaCompleta = false;
      righe.push([
        cellaCodice(m, ''),
        {
          stack: [
            { text: m.forma, style: 'tdForma' },
            ...(qta > 1
              ? [{ text: `${qta} elementi uguali`, fontSize: 8.5, color: BLU_FORMA, bold: true } as Content]
              : [])
          ]
        },
        { text: m.reale, fontSize: 9.5, color: '#1a1a1a' },
        {
          // misura di taglio: con abbondanze se presenti, altrimenti = reale
          text: m.taglio ?? m.reale,
          bold: true,
          fontSize: 10,
          color: m.taglio ? VERDE_TAGLIO : '#1a1a1a'
        },
        { text: m.abbondanze ?? '—', fontSize: 8.5, color: GRIGIO },
        {
          text: !m.area
            ? '—'
            : qta > 1 && m.areaM2 !== undefined
              ? `${m.area} ×${qta} = ${formattaArea({ m2: m.areaM2 * qta, affidabile: m.areaAffidabile !== false, metodo: 'piano' })}${m.areaAffidabile === false ? ' (stima)' : ''}`
              : m.areaAffidabile === false
                ? `${m.area} (stima)`
                : m.area,
          fontSize: 9,
          color: m.areaAffidabile === false ? ARANCIO_STIMATA : BLU_FORMA,
          alignment: 'right'
        }
      ]);
    });
  });

  if (righe.length === 0) return [];

  // riga totali
  righe.push([
    { text: '', style: 'tdNum' },
    { text: `${nPezzi} pezzi`, bold: true, fontSize: 10, color: BLU_FORMA },
    { text: '', style: 'td' },
    { text: '', style: 'td' },
    { text: 'Superficie totale', fontSize: 9, color: GRIGIO, alignment: 'right' },
    {
      text: areaTot > 0 ? `${formattaArea({ m2: areaTot, affidabile: true, metodo: 'piano' })}${areaCompleta ? '' : ' +'}` : '—',
      bold: true,
      fontSize: 10.5,
      color: BLU_FORMA,
      alignment: 'right'
    }
  ]);

  return [
    {
      text: 'Distinta di taglio',
      style: 'h1',
      tocItem: true,
      pageBreak: 'before'
    } as Content,
    {
      text: 'Pezzi da produrre con la misura di taglio (misura reale + abbondanze). Le superfici "stima" non correggono la prospettiva: calibra un piano per averle esatte.',
      style: 'corpo',
      color: GRIGIO
    },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [44, 'auto', '*', '*', 'auto', 'auto'],
        body: [
          [
            { text: 'Codice', style: 'th' },
            { text: 'Pezzo', style: 'th' },
            { text: 'Misura reale', style: 'th' },
            { text: 'Misura di taglio', style: 'th' },
            { text: 'Abbondanze', style: 'th' },
            { text: 'Superficie', style: 'th' }
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
