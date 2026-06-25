import JSZip from 'jszip';
import { db } from '../db/db';
import type { Cartella, Foto, Progetto } from '../db/types';
import { fotoIllegibile } from './image';
import { letteraFoto } from '../geometry/nomenclatura';
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
 * toccati dall'editor — quindi senza alcuna sovrapposizione.
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

/** Aggiunge le foto pulite di un progetto in una directory dello ZIP */
function aggiungiFotoProgetto(zip: JSZip, prefisso: string, foto: Foto[]): void {
  foto.forEach((f) => {
    const lettera = letteraFoto(f, foto);
    const nome = nomeFileSicuro(`${lettera} - ${f.didascalia || 'foto'}`, 'jpg');
    // origine = JPEG originale, senza quote/disegni/annotazioni
    zip.file(`${prefisso}${nome}`, f.origine);
  });
}

/**
 * ZIP di un singolo progetto: PDF + cartella "Foto" con i JPG originali.
 */
export async function esportaProgettoZip(
  progetto: Progetto,
  avanzamento?: (msg: string) => void,
  opzioni: OpzioniReport = OPZIONI_REPORT_DEFAULT
): Promise<Blob> {
  const zip = new JSZip();
  avanzamento?.('Report PDF…');
  const pdf = await generaReportPdf(progetto, avanzamento, opzioni);
  zip.file(nomeFileSicuro(`report_${progetto.nome}`, 'pdf'), pdf);

  avanzamento?.('Foto originali…');
  const foto = await fotoDiProgetto(progetto.id);
  aggiungiFotoProgetto(zip, 'Foto/', foto);

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
      aggiungiFotoProgetto(zip, `${prefisso}${nome}/`, foto);
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
