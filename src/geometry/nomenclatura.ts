import type { Annotazione, Cartella, Foto, Progetto } from '../db/types';

/**
 * Nomenclatura strutturata delle forme.
 *
 * Codice di una forma = [etichette delle cartelle e del progetto] · [lettera
 * della foto][numero progressivo della forma].
 * Esempi: "A1", "P1.A2", "E1.P1.S1.A1".
 *
 * - la LETTERA identifica la foto dentro il progetto (per ordine: A, B, C…);
 * - il NUMERO identifica la forma dentro la foto (per zIndex: 1, 2, 3…);
 * - le ETICHETTE di cartelle/progetto, se presenti, precedono il codice.
 * Tutto è calcolato dinamicamente: nessun dato duplicato da tenere allineato.
 */

/** Indice 0→A, 1→B, … 25→Z, 26→AA, 27→AB … */
export function letteraDaIndice(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

/** Tipi di annotazione che ricevono un codice/etichetta (le "forme") */
export function eFormaEtichettabile(a: Annotazione): boolean {
  return a.tipo === 'quotaPoligono' || a.tipo === 'quotaRett' || a.tipo === 'callout';
}

/** Lettera della foto in base alla sua posizione (ordine) nel progetto */
export function letteraFoto(foto: Pick<Foto, 'id' | 'ordine'>, fotoDelProgetto: Foto[]): string {
  const ordinate = [...fotoDelProgetto].sort((a, b) => a.ordine - b.ordine);
  const idx = ordinate.findIndex((f) => f.id === foto.id);
  return letteraDaIndice(idx < 0 ? 0 : idx);
}

/** Numero progressivo (1-based) della forma tra le forme della stessa foto */
export function numeroForma(id: string, annotazioni: Annotazione[]): number {
  const forme = annotazioni
    .filter(eFormaEtichettabile)
    .sort((a, b) => a.zIndex - b.zIndex);
  const i = forme.findIndex((f) => f.id === id);
  return i + 1; // 0 se non è una forma etichettabile
}

/** etichetta manuale eventualmente impostata sulla forma (override) */
function etichettaManuale(a: Annotazione): string | undefined {
  if (a.tipo === 'quotaPoligono' || a.tipo === 'quotaRett' || a.tipo === 'callout') {
    const e = a.etichetta?.trim();
    return e || undefined;
  }
  return undefined;
}

/**
 * Codice LOCALE della forma (quello mostrato sul badge nella foto): l'override
 * manuale se presente, altrimenti letteraFoto + numero progressivo.
 */
export function codiceLocaleForma(
  a: Annotazione,
  lettera: string,
  annotazioni: Annotazione[]
): string {
  const manuale = etichettaManuale(a);
  if (manuale) return manuale;
  const n = numeroForma(a.id, annotazioni);
  return n > 0 ? `${lettera}${n}` : lettera;
}

/**
 * Etichette del percorso dalla radice fino al progetto (cartelle annidate +
 * etichetta del progetto), saltando quelle vuote. Es. ["E1","P1","S1"].
 */
export function percorsoEtichette(
  progetto: Pick<Progetto, 'cartellaId' | 'etichetta'>,
  cartelle: Cartella[]
): string[] {
  const perId = new Map(cartelle.map((c) => [c.id, c]));
  const catena: string[] = [];
  // risali la catena delle cartelle dalla foglia alla radice
  let id = progetto.cartellaId;
  const visti = new Set<string>();
  while (id && !visti.has(id)) {
    visti.add(id);
    const c = perId.get(id);
    if (!c) break;
    const e = c.etichetta?.trim();
    if (e) catena.unshift(e);
    id = c.parentId;
  }
  const eProg = progetto.etichetta?.trim();
  if (eProg) catena.push(eProg);
  return catena;
}

/** Codice COMPLETO (per il PDF): percorso cartelle + codice locale della forma */
export function codiceCompletoForma(percorso: string[], codiceLocale: string): string {
  return percorso.length > 0 ? `${percorso.join('.')}.${codiceLocale}` : codiceLocale;
}
