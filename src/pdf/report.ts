import { pdfMake } from './engine';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { db } from '../db/db';
import type { Annotazione, Cartella, Foto, Progetto, Punto, Quota, QuotaPoligono, StatoMisura } from '../db/types';
import { abbondanzaTotale, segmentiPoligono, segmentoELato } from '../db/types';
import { nomeFormaPoligono, simboliPoligono, versiSegmento } from '../geometry/primitive';
import {
  codiceCompletoForma,
  codiceLocaleForma,
  confrontaEtichetta,
  eCopiaEtichetta,
  eFormaEtichettabile,
  famigliaDi,
  numeriProgetto,
  percorsoDellaFoto,
  percorsoEtichette,
  vociLegenda,
  type NumeroForma
} from '../geometry/nomenclatura';
import { leggiImpostazioni } from '../db/repository';
import { rigaMisuraTecnica } from './righeTecniche';
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
  /**
   * Foto per pagina: 1 = grande con tabella misure; 2 = compatto con tabella;
   * 4 / 6 = "report fotografico" a griglia (provino), senza tabella sotto ogni
   * foto (le misure restano nel riepilogo finale).
   */
  fotoPerPagina: 1 | 2 | 4 | 6;
  /** pagina in orizzontale (utile per i report fotografici a griglia) */
  orizzontale?: boolean;
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

/**
 * Immagini annotate (data URL) di tutte le foto di un progetto, pronte per il
 * PDF. Si calcolano una volta e si riusano per l'ANTEPRIMA: cambiando le opzioni
 * di impaginazione basta ricomporre il documento (veloce), senza ri-renderizzare.
 */
/** Lato delle immagini per la sola ANTEPRIMA: più piccolo = preparazione più
 *  veloce (la qualità piena resta nel PDF finale, che non usa questa cache). */
const LATO_ANTEPRIMA = 900;

export async function preparaImmaginiProgetto(progettoId: string): Promise<Record<string, string>> {
  const fotoList = (await db.foto.where('progettoId').equals(progettoId).toArray()).filter(
    (f) => !fotoIllegibile(f)
  );
  const ctx = await caricaContestoGlobale();
  const out: Record<string, string> = {};
  for (const f of fotoList) {
    const ann = await db.annotazioni.where('fotoId').equals(f.id).toArray();
    const blob = await renderFotoAnnotata(f, ann, 'image/jpeg', 0.85, (a) => codiceLocaleCtx(ctx, a));
    out[`foto_${f.id}`] = await blobInDataUrlRidotto(blob, LATO_ANTEPRIMA);
  }
  return out;
}

/** Come sopra, ma per tutte le foto dell'albero di una cartella (per l'anteprima) */
export async function preparaImmaginiCartella(cartellaId: string): Promise<Record<string, string>> {
  const [tutteCartelle, tuttiProgetti] = await Promise.all([db.cartelle.toArray(), db.progetti.toArray()]);
  const ctx = await caricaContestoGlobale();
  const out: Record<string, string> = {};
  const visita = async (id: string) => {
    for (const p of tuttiProgetti.filter((x) => x.cartellaId === id)) {
      const lista = (await db.foto.where('progettoId').equals(p.id).toArray()).filter((f) => !fotoIllegibile(f));
      for (const f of lista) {
        const ann = await db.annotazioni.where('fotoId').equals(f.id).toArray();
        const blob = await renderFotoAnnotata(f, ann, 'image/jpeg', 0.85, (a) => codiceLocaleCtx(ctx, a));
        out[`foto_${f.id}`] = await blobInDataUrlRidotto(blob, LATO_ANTEPRIMA);
      }
    }
    for (const c of tutteCartelle.filter((x) => x.parentId === id)) await visita(c.id);
  };
  await visita(cartellaId);
  return out;
}

export async function generaReportPdf(
  progetto: Progetto,
  avanzamento?: (msg: string) => void,
  opzioni: OpzioniReport = OPZIONI_REPORT_DEFAULT,
  immaginiCache?: Record<string, string>
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
    const f = fotoList[i];
    const key = `foto_${f.id}`;
    if (immaginiCache && immaginiCache[key]) {
      immagini[key] = immaginiCache[key];
      continue;
    }
    avanzamento?.(`Preparazione immagine ${i + 1} di ${fotoList.length}…`);
    const blob = await renderFotoAnnotata(f, annotazioniPerFoto.get(f.id) ?? [], 'image/jpeg', 0.92, (a) =>
      codiceLocaleCtx(ctx, a)
    );
    immagini[key] = await blobInDataUrlRidotto(blob, LATO_MAX_PDF);
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
  if (opzioni.fotoPerPagina >= 4) {
    // report fotografico a griglia (provino): niente tabella sotto le foto
    const gruppi = raggruppaPerSezione(fotoList, sezioni);
    gruppi.forEach((g, gi) => {
      if (g.titolo) contenuto.push({ text: g.titolo, style: 'h2', tocItem: true, pageBreak: 'before' } as Content);
      else if (gi === 0) contenuto.push({ text: 'Foto', style: 'h1', tocItem: true, pageBreak: 'before' } as Content);
      contenuto.push(...grigliaContatti(g.foto, opzioni, impostazioni.pdf));
    });
  } else {
  const rankSez = (f: Foto) => {
    const i = sezioni.findIndex((s) => s.id === f.sezioneId);
    return i < 0 ? 1e9 : i;
  };
  const dettagliDi = new Map<string, Foto[]>();
  for (const ph of fotoList) {
    if (ph.dettaglioDi) {
      const arr = dettagliDi.get(ph.dettaglioDi.fotoId) ?? [];
      arr.push(ph);
      dettagliDi.set(ph.dettaglioDi.fotoId, arr);
    }
  }
  for (const arr of dettagliDi.values()) {
    arr.sort(
      (a, b) =>
        confrontaEtichetta(a.dettaglioDi!.lettera, b.dettaglioDi!.lettera) || a.ordine - b.ordine
    );
  }
  const principali = fotoList.filter((ph) => !ph.dettaglioDi);
  principali.sort((a, b) => rankSez(a) - rankSez(b) || a.ordine - b.ordine);
  let sezPrec: string | null | undefined = ' ';
  let indice = 0;
  // blocco di una foto di dettaglio: titolo "Dettaglio X" in cima a una pagina
  const bloccoDettaglio = (dett: Foto) => {
    const annD = annotazioniPerFoto.get(dett.id) ?? [];
    const percD = ctx.percorsoFoto.get(dett.id) ?? percorso;
    const lettera = dett.dettaglioDi?.lettera ?? '';
    const nome =
      dett.didascalia && dett.didascalia !== `Dettaglio ${lettera}` ? ` · ${dett.didascalia}` : '';
    contenuto.push(
      ...sezioneFoto(dett, indice, annD, opzioni, impostazioni.pdf, ctx, percD, {
        style: 'h3',
        toc: false,
        etichetta: '',
        titolo: `Dettaglio ${lettera}${nome}`,
        nuovaPagina: true
      })
    );
  };
  principali.forEach((f) => {
    const annotazioni = annotazioniPerFoto.get(f.id) ?? [];
    const perc = ctx.percorsoFoto.get(f.id) ?? percorso;
    const sid = f.sezioneId && sezioni.some((s) => s.id === f.sezioneId) ? f.sezioneId : null;
    let titoloSez: string | undefined;
    if (sezioni.length > 0 && sid !== sezPrec) {
      const s = sezioni.find((x) => x.id === sid);
      titoloSez = s ? `${s.nome}${s.etichetta ? ` — ${s.etichetta}` : ''}` : 'Senza sezione';
    }
    sezPrec = sid;
    contenuto.push(
      ...sezioneFoto(f, indice, annotazioni, opzioni, impostazioni.pdf, ctx, perc, undefined, titoloSez)
    );
    indice++; // numerazione progressiva SOLO delle foto principali
    // foto di dettaglio collegate alle etichette di questa foto, subito dopo
    for (const dett of dettagliDi.get(f.id) ?? []) bloccoDettaglio(dett);
    });
    // dettagli ORFANI (foto principale assente dal report perché esclusa
    // dall'export selettivo, eliminata o non presente): stampati comunque in
    // coda, così nessuna foto di dettaglio sparisce silenziosamente
    const idPrincipali = new Set(principali.map((p) => p.id));
    for (const [mainId, lista] of dettagliDi) {
      if (idPrincipali.has(mainId)) continue;
      for (const dett of lista) bloccoDettaglio(dett);
    }
  }

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
    immagini,
    orizzontale: opzioni.orizzontale
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
  orizzontale?: boolean;
}): TDocumentDefinitions {
  const { BLU } = args;
  return {
    pageSize: 'A4',
    pageOrientation: args.orizzontale ? 'landscape' : 'portrait',
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
  opzioni: OpzioniReport = OPZIONI_REPORT_DEFAULT,
  immaginiCache?: Record<string, string>
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
    const f = tutteFoto[i];
    const key = `foto_${f.id}`;
    if (immaginiCache && immaginiCache[key]) {
      immagini[key] = immaginiCache[key];
      continue;
    }
    avanzamento?.(`Preparazione immagine ${i + 1} di ${tutteFoto.length}…`);
    const blob = await renderFotoAnnotata(f, annotPerFoto.get(f.id) ?? [], 'image/jpeg', 0.92, (a) =>
      codiceLocaleCtx(ctx, a)
    );
    immagini[key] = await blobInDataUrlRidotto(blob, LATO_MAX_PDF);
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
      if (opzioni.fotoPerPagina >= 4) {
        // report fotografico a griglia: niente tabella sotto le foto
        for (const g of raggruppaPerSezione(lista, sezioni)) {
          if (g.titolo) out.push({ text: g.titolo, style: 'corpo', bold: true, margin: [0, 6, 0, 2] } as Content);
          out.push(...grigliaContatti(g.foto, opzioni, impostazioni.pdf));
        }
        continue;
      }
      const rankSez = (f: Foto) => {
        const i = sezioni.findIndex((s) => s.id === f.sezioneId);
        return i < 0 ? 1e9 : i;
      };
      // foto di dettaglio raggruppate per principale (come nel report di progetto)
      const dettagliDi = new Map<string, Foto[]>();
      for (const ph of lista) {
        if (ph.dettaglioDi) {
          const arr = dettagliDi.get(ph.dettaglioDi.fotoId) ?? [];
          arr.push(ph);
          dettagliDi.set(ph.dettaglioDi.fotoId, arr);
        }
      }
      for (const arr of dettagliDi.values()) {
        arr.sort(
          (a, b) =>
            confrontaEtichetta(a.dettaglioDi!.lettera, b.dettaglioDi!.lettera) || a.ordine - b.ordine
        );
      }
      const bloccoDett = (dett: Foto) => {
        const lettera = dett.dettaglioDi?.lettera ?? '';
        const nome =
          dett.didascalia && dett.didascalia !== `Dettaglio ${lettera}`
            ? ` · ${dett.didascalia}`
            : '';
        out.push(
          ...sezioneFoto(
            dett,
            indiceFoto,
            annotPerFoto.get(dett.id) ?? [],
            opzioni,
            impostazioni.pdf,
            ctx,
            ctx.percorsoFoto.get(dett.id) ?? [],
            { style: 'h3', toc: false, etichetta: '', titolo: `Dettaglio ${lettera}${nome}`, nuovaPagina: true }
          )
        );
      };
      const principali = lista.filter((ph) => !ph.dettaglioDi);
      const ordinata = [...principali].sort((a, b) => rankSez(a) - rankSez(b) || a.ordine - b.ordine);
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
        for (const dett of dettagliDi.get(f.id) ?? []) bloccoDett(dett);
      }
      // dettagli orfani (principale non presente): stampati comunque in coda
      const idPr = new Set(principali.map((p) => p.id));
      for (const [mid, l] of dettagliDi) {
        if (idPr.has(mid)) continue;
        for (const dett of l) bloccoDett(dett);
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
    immagini,
    orizzontale: opzioni.orizzontale
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
    // Le misure lineari semplici (quota) restano disegnate sulla foto ma non
    // vengono mai trascritte nel PDF come voci separate (scelta di progetto).
    if (a.tipo === 'quota') continue;
    if (a.tipo === 'quotaAngolo') {
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
    } else if (a.tipo === 'quotaTecnica') {
      // entrano nel riepilogo solo le quote tecniche strutturate
      // (partePerimetro=true); le altre restano disegnate sulla foto
      const r = rigaMisuraTecnica(a);
      if (r) righe.push({ forma: r.forma, reale: r.reale, stato: r.stato });
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
  // `noWrap` impedisce che il codice vada a capo (es. "P2.A5.1"): la colonna
  // "Cod." è a larghezza automatica, quindi si allarga quanto basta.
  if (!m.collegati || m.collegati.length <= 1) {
    return { text: base, style: m.codice ? 'tdForma' : 'tdNum', noWrap: true };
  }
  return {
    stack: [
      { text: base, style: 'tdForma', noWrap: true },
      ...m.collegati.map(
        (c) =>
          ({
            text: `• ${c}`,
            fontSize: 8.5,
            color: GRIGIO,
            noWrap: true,
            margin: [6, 1, 0, 0]
          }) as Content
      )
    ]
  };
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

// --- Celle della tabella per-foto (dati distribuiti su più colonne) ---------

/** Colonna "Elemento": nome + eventuale rimando alla misura originale */
function cellaElemento(m: RigaMisura): Content {
  const linee: Content[] = [{ text: m.forma, style: 'tdForma' }];
  if (m.derivaDa) {
    linee.push({
      text: [
        { text: 'copia di ', color: GRIGIO_CHIARO, fontSize: 8 },
        { text: m.derivaDa, color: BLU_FORMA, bold: true, fontSize: 8.5 }
      ],
      margin: [0, 1, 0, 0]
    });
  }
  if (m.quantita && m.quantita > 1) {
    linee.push({ text: `${m.quantita} elementi uguali`, color: BLU_FORMA, bold: true, fontSize: 8.5, margin: [0, 1, 0, 0] });
  }
  return { stack: linee };
}

/** Colonna "Misure": misura reale + perimetro + angoli */
function cellaReale(m: RigaMisura): Content {
  const linee: Content[] = [{ text: m.reale, bold: true, fontSize: 10, color: '#1a1a1a' }];
  if (m.angoli) linee.push({ text: m.angoli, color: GRIGIO, fontSize: 8.5, margin: [0, 1, 0, 0] });
  if (m.perimetro) linee.push({ text: m.perimetro, color: GRIGIO, fontSize: 8.5, italics: true });
  return { stack: linee };
}

/** Colonna "Taglio": misura di taglio + dettaglio abbondanze */
function cellaTaglio(m: RigaMisura): Content {
  if (!m.taglio && !m.abbondanze) return { text: '—', color: GRIGIO_CHIARO, fontSize: 9 };
  const linee: Content[] = [];
  if (m.taglio) linee.push({ text: m.taglio, color: VERDE_TAGLIO, bold: true, fontSize: 9.5 });
  if (m.abbondanze) linee.push({ text: m.abbondanze, color: GRIGIO, fontSize: 8, margin: [0, 1, 0, 0] });
  return { stack: linee };
}

/** Colonna "Superficie": area in m² (con nota "stima" se prospettiva non corretta) */
function cellaSuperficie(m: RigaMisura): Content {
  if (!m.area) return { text: '—', color: GRIGIO_CHIARO, fontSize: 9, alignment: 'right' };
  const stima = m.areaAffidabile === false;
  const linee: Content[] = [
    { text: m.area, color: stima ? ARANCIO_STIMATA : BLU_FORMA, bold: true, fontSize: 9.5, alignment: 'right' }
  ];
  if (stima) linee.push({ text: 'stima', color: ARANCIO_STIMATA, fontSize: 7.5, italics: true, alignment: 'right' });
  return { stack: linee };
}

/** Raggruppa le foto per SEZIONE del progetto, in ordine, con il titolo pronto */
function raggruppaPerSezione(
  fotoList: Foto[],
  sezioni: { id: string; nome: string; etichetta?: string; ordine: number }[]
): { titolo?: string; foto: Foto[] }[] {
  const ordinate = [...sezioni].sort((a, b) => a.ordine - b.ordine);
  const rank = (f: Foto) => {
    const i = ordinate.findIndex((s) => s.id === f.sezioneId);
    return i < 0 ? 1e9 : i;
  };
  const ordinata = [...fotoList].sort((a, b) => rank(a) - rank(b) || a.ordine - b.ordine);
  const gruppi: { sid: string | null; titolo?: string; foto: Foto[] }[] = [];
  for (const f of ordinata) {
    const sid = f.sezioneId && ordinate.some((s) => s.id === f.sezioneId) ? f.sezioneId : null;
    let cur = gruppi[gruppi.length - 1];
    if (!cur || cur.sid !== sid) {
      const s = ordinate.find((x) => x.id === sid);
      cur = {
        sid,
        titolo:
          ordinate.length > 0 ? (s ? `${s.nome}${s.etichetta ? ` — ${s.etichetta}` : ''}` : 'Senza sezione') : undefined,
        foto: []
      };
      gruppi.push(cur);
    }
    cur.foto.push(f);
  }
  return gruppi.map(({ titolo, foto }) => ({ titolo, foto }));
}

/**
 * "Report fotografico" a griglia (provino): più foto per pagina (4 o 6),
 * eventualmente in orizzontale, con piccola didascalia. Niente tabella misure
 * sotto le foto (le misure restano nel riepilogo/distinta finali).
 */
function grigliaContatti(
  fotoSezione: Foto[],
  opzioni: OpzioniReport,
  pdfImp: { mostraDataScatto: boolean }
): Content[] {
  const orizz = !!opzioni.orizzontale;
  const cols = orizz ? (opzioni.fotoPerPagina >= 6 ? 3 : 2) : 2;
  const rows = Math.max(1, Math.ceil(opzioni.fotoPerPagina / cols));
  // spazio utile della pagina (A4 meno margini, intestazioni e piè di pagina)
  const usableW = orizz ? 752 : 515;
  const usableH = orizz ? 455 : 690;
  const captionH = pdfImp.mostraDataScatto ? 26 : 14;
  const cellW = usableW / cols;
  // altezza dell'immagine così che `rows` righe stiano in una pagina
  const imgH = Math.max(64, Math.floor(usableH / rows) - captionH - 10);

  // griglia come TABELLA senza bordi: pdfmake dispone le righe e va a capo
  // pagina da solo → una vera griglia (non una sola riga)
  const body: Content[][] = [];
  for (let i = 0; i < fotoSezione.length; i += cols) {
    const gruppo = fotoSezione.slice(i, i + cols);
    const celle: Content[] = gruppo.map((f) => ({
      stack: [
        { image: `foto_${f.id}`, fit: [cellW - 12, imgH], alignment: 'center' },
        { text: f.didascalia || ' ', style: 'didascalia', alignment: 'center', margin: [0, 3, 0, 0] },
        ...(pdfImp.mostraDataScatto
          ? [{ text: formattaData(f.dataScatto), fontSize: 8, color: GRIGIO, alignment: 'center' } as Content]
          : [])
      ],
      margin: [2, 4, 2, 6]
    }));
    while (celle.length < cols) celle.push({ text: '' });
    body.push(celle);
  }
  if (body.length === 0) return [];
  return [
    {
      table: { widths: Array(cols).fill('*'), dontBreakRows: true, body },
      layout: 'noBorders',
      margin: [0, 6, 0, 0]
    } as Content
  ];
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
  titoloFoto: {
    style: string;
    toc: boolean;
    etichetta: string;
    /** titolo completo, se va costruito a parte (es. foto di dettaglio) */
    titolo?: string;
    /** forza l'inizio del blocco in cima a una nuova pagina */
    nuovaPagina?: boolean;
  } = {
    style: 'h2',
    toc: true,
    etichetta: `${indice + 1}. `
  },
  /** intestazione di sezione (es. "Piano 1 — P1") da mostrare sopra questa foto:
   *  presente solo sulla PRIMA foto di ogni sezione del progetto */
  sezioneTitolo?: string
): Content[] {
  const titolo = titoloFoto.titolo ?? `${titoloFoto.etichetta}${f.didascalia || `Foto ${indice + 1}`}`;
  // sotto la foto: SOLO gli elementi realmente presenti in questa foto (le copie
  // richiamate compaiono qui, non sotto la foto della misura originale)
  const misure = righeMisureFoto(annotazioni, f, ctx, percorso, 'perFoto');
  const callouts = annotazioni.filter((a) => a.tipo === 'callout');
  const catene = calcolaCatene(annotazioni);
  // layout compatto: due foto per pagina, immagine più bassa
  const altezzaFoto = opzioni.fotoPerPagina === 2 ? 290 : 540;
  const interrompi = opzioni.fotoPerPagina === 2 ? indice % 2 === 0 : true;

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

  // BLOCCO INDIVISIBILE: titolo + note + foto + dati restano sulla stessa pagina.
  // - le NOTE della foto stanno sotto il titolo (sopra l'immagine);
  // - i DATI (data di scatto) stanno sotto la foto, allineati a destra (no GPS).
  const blocco: Content[] = [
    {
      text: titolo,
      style: titoloFoto.style,
      tocItem: titoloFoto.toc,
      margin: [0, sezioneTitolo ? 2 : 4, 0, 4]
    } as Content
  ];
  if (opzioni.includiNoteDato && f.noteDato.trim()) {
    blocco.push({ text: f.noteDato.trim(), style: 'corpo', margin: [0, 0, 0, 8] });
  }
  blocco.push({ image: `foto_${f.id}`, fit: [515, altezzaFoto], alignment: 'center' });
  if (pdfImp.mostraDataScatto) {
    blocco.push({
      text: `Scattata il ${formattaDataOra(f.dataScatto)}`,
      style: 'didascalia',
      alignment: 'right',
      margin: [0, 4, 0, 0]
    });
  }
  out.push({
    stack: blocco,
    unbreakable: true,
    ...((titoloFoto.nuovaPagina || interrompi) && !sezioneTitolo ? { pageBreak: 'before' } : {})
  } as Content);

  // Legenda: trascritta come elenco separato (lettera = descrizione), PRIMA
  // delle forme. Sulla foto restano disegnate solo le etichette.
  const legenda = vociLegenda(annotazioni);
  if (legenda.length > 0) {
    out.push({ text: 'Legenda', style: 'th', margin: [0, 10, 0, 3] } as Content);
    out.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['auto', '*', 'auto'],
        body: [
          [
            { text: 'Cod.', style: 'th' },
            { text: 'Descrizione', style: 'th' },
            { text: 'Q.tà', style: 'th', alignment: 'center' }
          ],
          ...legenda.map((v) => [
            { text: v.lettera, style: 'td', bold: true, alignment: 'center', noWrap: true },
            { text: v.descrizione || '—', style: 'td' },
            { text: String(v.quantita), style: 'td', alignment: 'center', noWrap: true }
          ])
        ]
      },
      layout: righeRiepilogo,
      margin: [0, 0, 0, 4]
    } as Content);
  }

  if (opzioni.includiTabellaMisure && misure.length > 0) {
    const corpoTabella = misure.map((m, i) => [
      cellaCodice(m, String(i + 1)),
      cellaElemento(m),
      cellaReale(m),
      cellaTaglio(m),
      cellaSuperficie(m),
      cellaStato(m.stato)
    ]);
    out.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto'],
        body: [
          [
            { text: 'Cod.', style: 'th' },
            { text: 'Elemento', style: 'th' },
            { text: 'Misure', style: 'th' },
            { text: 'Taglio', style: 'th' },
            { text: 'Superficie', style: 'th' },
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
        cellaElemento(m),
        cellaReale(m),
        cellaTaglio(m),
        cellaSuperficie(m),
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
            fontSize: 10
          },
          { text: '' },
          { text: '' },
          { text: '' }
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
        widths: ['auto', 'auto', 'auto', '*', 'auto', 'auto', 'auto'],
        body: [
          [
            { text: 'Cod.', style: 'th' },
            { text: 'Foto', style: 'th' },
            { text: 'Elemento', style: 'th' },
            { text: 'Misure', style: 'th' },
            { text: 'Taglio', style: 'th' },
            { text: 'Superficie', style: 'th' },
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
        widths: ['auto', 'auto', '*', '*', 'auto', 'auto'],
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
