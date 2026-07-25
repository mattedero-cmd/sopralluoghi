import JSZip from 'jszip';
import { db } from '../db/db';
import type { Cartella, Foto, Progetto } from '../db/types';
import { blobOrigine, canvasInBlob, caricaImmagine, fotoIllegibile } from './image';
import { haCensure, immagineCensurata } from './censura';
import { etichettaFoto } from '../geometry/nomenclatura';
import {
  generaReportCartella,
  generaReportPdf,
  OPZIONI_REPORT_DEFAULT,
  type OpzioniReport
} from '../pdf/report';
import { nomeFileSicuro } from './share';

/**
 * Esportazione ZIP: PDF di riepilogo + foto ORIGINALI (pulite, senza quote né
 * annotazioni) in JPG, organizzate nella stessa struttura di cartelle del
 * progetto. Le foto pulite sono gli originali archiviati (`foto.origine`), mai
 * toccati dall'editor — quindi senza alcuna sovrapposizione. Unica eccezione:
 * i VOLTI oscurati, che restano tali anche qui (lo ZIP si consegna).
 */

/** Nome di file/cartella sicuro per i percorsi dello ZIP (no slash, accenti…) */
function segmentoSicuro(nome: string, fallback: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return base || fallback;
}

/** Foto leggibili di un progetto, in ordine */
async function fotoDiProgetto(progettoId: string): Promise<Foto[]> {
  return (await db.foto.where('progettoId').equals(progettoId).toArray())
    .filter((f) => !fotoIllegibile(f))
    .sort((a, b) => a.ordine - b.ordine);
}

/**
 * Byte della foto "pulita" da mettere nello ZIP: l'originale senza quote né
 * disegni, ma con i VOLTI OSCURATI se la foto ha regioni di censura.
 *
 * In caso di errore NON si ripiega sull'originale: lo ZIP è un file che si
 * consegna, e consegnare un volto scoperto per un errore tecnico sarebbe il
 * modo peggiore di fallire. Meglio interrompere con un messaggio chiaro.
 */
async function bytesFotoPulita(f: Foto): Promise<ArrayBuffer | Blob> {
  if (!haCensure(f)) return f.origine;
  const etichetta = f.didascalia || 'senza didascalia';
  let tela: HTMLCanvasElement;
  try {
    const img = await caricaImmagine(blobOrigine(f));
    const censurata = immagineCensurata(img, f.larghezzaPx, f.altezzaPx, f.censure);
    if (!(censurata instanceof HTMLCanvasElement)) {
      throw new Error('copia non generata');
    }
    tela = censurata;
  } catch {
    throw new Error(
      `Impossibile oscurare i volti della foto «${etichetta}»: esportazione interrotta per sicurezza.`
    );
  }
  return canvasInBlob(tela, 'image/jpeg', 0.9);
}

/** Aggiunge le foto pulite (una lista) in una directory dello ZIP */
async function aggiungiFoto(
  zip: JSZip,
  prefisso: string,
  foto: Foto[],
  letteraDi: (f: Foto) => string
): Promise<void> {
  for (const f of foto) {
    const nome = nomeFileSicuro(`${letteraDi(f)} - ${f.didascalia || 'foto'}`, 'jpg');
    zip.file(`${prefisso}${nome}`, await bytesFotoPulita(f));
  }
}

/**
 * Aggiunge le foto di un progetto, raggruppate nelle sottocartelle delle sue
 * SEZIONI (Piano 1, Piano 2…). Senza sezioni, le foto vanno tutte nel prefisso.
 * La lettera della foto è quella dell'INTERO progetto (coerente col PDF).
 */
async function aggiungiFotoProgetto(
  zip: JSZip,
  prefisso: string,
  progetto: Progetto,
  foto: Foto[]
): Promise<void> {
  const letteraDi = (f: Foto) => etichettaFoto(f, foto);
  const sezioni = [...(progetto.sezioni ?? [])].sort((a, b) => a.ordine - b.ordine);
  if (sezioni.length === 0) {
    await aggiungiFoto(zip, prefisso, foto, letteraDi);
    return;
  }
  const ids = new Set(sezioni.map((s) => s.id));
  const usati = new Set<string>();
  for (const s of sezioni) {
    const lista = foto.filter((f) => f.sezioneId === s.id);
    if (lista.length === 0) continue;
    let nome = segmentoSicuro(s.etichetta ? `${s.etichetta} ${s.nome}` : s.nome, 'Sezione');
    while (usati.has(nome)) nome = `${nome}_`;
    usati.add(nome);
    await aggiungiFoto(zip, `${prefisso}${nome}/`, lista, letteraDi);
  }
  const senza = foto.filter((f) => !f.sezioneId || !ids.has(f.sezioneId));
  if (senza.length > 0) await aggiungiFoto(zip, `${prefisso}Senza_sezione/`, senza, letteraDi);
}

/**
 * ZIP di un singolo progetto: un'unica cartella col NOME DEL PROGETTO che
 * contiene, subito dentro, il PDF di riepilogo e le sottocartelle delle sezioni
 * (Piano 1, Piano 2…) con i JPG originali.
 */
export async function esportaProgettoZip(
  progetto: Progetto,
  avanzamento?: (msg: string) => void,
  opzioni: OpzioniReport = OPZIONI_REPORT_DEFAULT
): Promise<Blob> {
  const zip = new JSZip();
  const radice = `${segmentoSicuro(progetto.nome, 'Progetto')}/`;
  avanzamento?.('Report PDF…');
  const pdf = await generaReportPdf(progetto, avanzamento, opzioni);
  zip.file(`${radice}${nomeFileSicuro(`report_${progetto.nome}`, 'pdf')}`, pdf);

  avanzamento?.('Foto originali…');
  const foto = await fotoDiProgetto(progetto.id);
  await aggiungiFotoProgetto(zip, radice, progetto, foto);

  avanzamento?.('Compressione…');
  return zip.generateAsync(
    { type: 'blob', compression: 'STORE' }, // i JPEG sono già compressi
    (meta) => avanzamento?.(`Compressione… ${meta.percent.toFixed(0)}%`)
  );
}

/**
 * ZIP di una cartella: PDF a capitoli + albero di cartelle/sottocartelle con,
 * dentro ogni progetto, i JPG originali. Rispecchia la struttura del progetto.
 */
export async function esportaCartellaZip(
  cartella: Cartella,
  avanzamento?: (msg: string) => void,
  opzioni: OpzioniReport = OPZIONI_REPORT_DEFAULT
): Promise<Blob> {
  const zip = new JSZip();
  avanzamento?.('Report PDF…');
  const pdf = await generaReportCartella(cartella.id, avanzamento, opzioni);
  zip.file(nomeFileSicuro(`report_${cartella.nome}`, 'pdf'), pdf);

  const tutteCartelle = await db.cartelle.toArray();
  const tuttiProgetti = await db.progetti.toArray();
  const figlie = (id: string) =>
    tutteCartelle.filter((c) => c.parentId === id).sort((a, b) => a.nome.localeCompare(b.nome));
  const progettiIn = (id: string) =>
    tuttiProgetti.filter((p) => p.cartellaId === id).sort((a, b) => a.nome.localeCompare(b.nome));

  avanzamento?.('Foto originali…');
  // nomi-cartella duplicati nello stesso livello: si distinguono con un suffisso
  const aggiungi = async (folder: Cartella, prefisso: string): Promise<void> => {
    const usati = new Set<string>();
    for (const p of progettiIn(folder.id)) {
      const foto = await fotoDiProgetto(p.id);
      if (foto.length === 0) continue;
      let nome = segmentoSicuro(p.nome, 'Progetto');
      while (usati.has(nome)) nome = `${nome}_`;
      usati.add(nome);
      await aggiungiFotoProgetto(zip, `${prefisso}${nome}/`, p, foto);
    }
    for (const c of figlie(folder.id)) {
      let nome = segmentoSicuro(c.nome, 'Cartella');
      while (usati.has(nome)) nome = `${nome}_`;
      usati.add(nome);
      await aggiungi(c, `${prefisso}${nome}/`);
    }
  };
  await aggiungi(cartella, `${segmentoSicuro(cartella.nome, 'Cartella')}/`);

  avanzamento?.('Compressione…');
  return zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => avanzamento?.(`Compressione… ${meta.percent.toFixed(0)}%`)
  );
}
