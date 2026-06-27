import type { Annotazione, Cartella, Foto, Progetto } from '../db/types';

/**
 * Nomenclatura strutturata delle forme.
 *
 * Codice di una forma = [etichette cartelle/progetto] · [etichetta foto][numero].
 * Esempi: "A1", "P1.A2", "E1.P1.S1.A1".
 *
 * - l'ETICHETTA della foto la identifica nel progetto: manuale (campo della
 *   foto) oppure automatica per ordine (A, B, C…);
 * - il NUMERO segue l'ordine REALE di creazione delle forme (campo `creatoIl`),
 *   modificabile a mano (`ordine`);
 * - foto con la STESSA etichetta nello stesso progetto CONDIVIDONO la sequenza
 *   numerica: le forme si numerano progressivamente tra tutte quelle foto;
 * - le etichette di cartelle/progetto, se presenti, precedono il codice.
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

/**
 * Etichetta della foto: manuale (campo `etichetta`) se presente, altrimenti la
 * lettera automatica ricavata dalla posizione (ordine) nel progetto.
 */
export function etichettaFoto(foto: Foto, fotoDelProgetto: Foto[]): string {
  const manuale = foto.etichetta?.trim();
  if (manuale) return manuale;
  const ordinate = [...fotoDelProgetto].sort((a, b) => a.ordine - b.ordine);
  const idx = ordinate.findIndex((f) => f.id === foto.id);
  return letteraDaIndice(idx < 0 ? 0 : idx);
}

/** chiave d'ordine di una forma: `ordine`, poi `creatoIl`, poi (legacy) zIndex */
function chiaveOrdine(a: Annotazione, idxFoto: number): number {
  if (typeof a.ordine === 'number') return a.ordine;
  if (typeof a.creatoIl === 'number') return a.creatoIl;
  // forme già caricate (senza timestamp): ordine stabile per (foto, zIndex),
  // con valori PICCOLI così restano prima delle forme nuove (con creatoIl reale)
  return idxFoto * 1e6 + a.zIndex;
}

/** etichetta manuale eventualmente impostata sulla forma (override del codice) */
function etichettaManuale(a: Annotazione): string | undefined {
  if (a.tipo === 'quotaPoligono' || a.tipo === 'quotaRett' || a.tipo === 'callout') {
    const e = a.etichetta?.trim();
    if (!e) return undefined;
    // i valori che COINCIDONO con un codice automatico non sono override: una
    // singola lettera ("A"), sole cifre ("3") oppure un codice intero generato
    // dall'app ("A3", "A1.2", "AA12"). Così, eliminando una forma, le altre si
    // rinumerano davvero invece di restare "congelate" sul vecchio codice.
    if (/^\d+$/.test(e) || /^[A-Z]$/.test(e) || /^[A-Z]+\d+(\.\d+)?$/.test(e)) return undefined;
    return e;
  }
  return undefined;
}

export interface NumeroForma {
  /** etichetta della foto a cui appartiene la forma (es. "A") */
  etichettaFoto: string;
  /** numero della FAMIGLIA nella sequenza (es. 1 → A1) */
  numero: number;
  /** indice nella famiglia, presente solo se la famiglia ha più copie (A1.2) */
  sub?: number;
  /** quantità: numero di elementi uguali (copie) della famiglia */
  quantita: number;
}

/** Famiglia di una forma: il gruppo di duplicazione, o la forma stessa */
export function famigliaDi(a: Annotazione): string {
  const g = a.gruppoQuota?.trim();
  return g || a.id;
}

/**
 * Numerazione di TUTTE le forme di un progetto: raggruppa per etichetta-foto
 * (foto con la stessa etichetta condividono la sequenza), poi per FAMIGLIA
 * (elementi ripetuti). Ogni famiglia ha un numero (A1, A2…); se ha più copie i
 * membri diventano A1.1, A1.2… L'ordine segue la creazione delle forme.
 */
export function numeriProgetto(
  fotoProgetto: Foto[],
  annotazioniDi: (fotoId: string) => Annotazione[]
): Map<string, NumeroForma> {
  const ordinate = [...fotoProgetto].sort((a, b) => a.ordine - b.ordine);
  const perEtichetta = new Map<string, { a: Annotazione; chiave: number }[]>();
  ordinate.forEach((f, idxFoto) => {
    const lbl = etichettaFoto(f, fotoProgetto);
    for (const a of annotazioniDi(f.id)) {
      if (!eFormaEtichettabile(a)) continue;
      if (!perEtichetta.has(lbl)) perEtichetta.set(lbl, []);
      perEtichetta.get(lbl)!.push({ a, chiave: chiaveOrdine(a, idxFoto) });
    }
  });
  const out = new Map<string, NumeroForma>();
  for (const [lbl, lista] of perEtichetta) {
    // raggruppa in famiglie (elementi ripetuti)
    const famiglie = new Map<string, { a: Annotazione; chiave: number }[]>();
    for (const it of lista) {
      const k = famigliaDi(it.a);
      if (!famiglie.has(k)) famiglie.set(k, []);
      famiglie.get(k)!.push(it);
    }
    // ordina i membri di ogni famiglia e le famiglie per chiave minima (1ª creata)
    const fams = [...famiglie.values()].map((membri) => {
      membri.sort((x, y) => x.chiave - y.chiave || x.a.id.localeCompare(y.a.id));
      return { membri, min: membri[0].chiave };
    });
    fams.sort((p, r) => p.min - r.min);
    fams.forEach((fam, i) => {
      const quantita = fam.membri.length;
      fam.membri.forEach((it, j) => {
        out.set(it.a.id, {
          etichettaFoto: lbl,
          numero: i + 1,
          sub: quantita > 1 ? j + 1 : undefined,
          quantita
        });
      });
    });
  }
  return out;
}

/**
 * Codice LOCALE della forma (badge sulla foto): l'override manuale se presente,
 * altrimenti etichetta-foto + numero famiglia (+ eventuale sotto-indice A1.2).
 */
export function codiceLocaleForma(a: Annotazione, numeri: Map<string, NumeroForma>): string {
  const manuale = etichettaManuale(a);
  if (manuale) return manuale;
  const info = numeri.get(a.id);
  if (!info) return '';
  const base = `${info.etichettaFoto}${info.numero}`;
  return info.sub ? `${base}.${info.sub}` : base;
}

/**
 * Nuovo valore di `ordine` per portare la forma `a` al numero desiderato nella
 * sua sequenza (le altre forme si rinumerano da sole, perché il numero è
 * derivato dall'ordine). Restituisce null se la forma non è numerabile.
 */
export function ordinePerNumero(
  a: Annotazione,
  numeroDesiderato: number,
  fotoProgetto: Foto[],
  annotazioniDi: (fotoId: string) => Annotazione[]
): number | null {
  if (!eFormaEtichettabile(a)) return null;
  const ordinate = [...fotoProgetto].sort((x, y) => x.ordine - y.ordine);
  const mia = ordinate.find((f) => f.id === a.fotoId);
  if (!mia) return null;
  const lbl = etichettaFoto(mia, fotoProgetto);
  // tutte le forme del gruppo (stessa etichetta foto), escludendo `a`
  const gruppo: { a: Annotazione; chiave: number }[] = [];
  ordinate.forEach((f, idxFoto) => {
    if (etichettaFoto(f, fotoProgetto) !== lbl) return;
    for (const x of annotazioniDi(f.id)) {
      if (!eFormaEtichettabile(x) || x.id === a.id) continue;
      gruppo.push({ a: x, chiave: chiaveOrdine(x, idxFoto) });
    }
  });
  gruppo.sort((x, y) => x.chiave - y.chiave || x.a.id.localeCompare(y.a.id));
  const n = Math.max(1, Math.min(numeroDesiderato, gruppo.length + 1));
  const sin = n >= 2 ? gruppo[n - 2].chiave : null; // vicino a sinistra (n-1)
  const des = n - 1 < gruppo.length ? gruppo[n - 1].chiave : null; // vicino a destra (n)
  if (sin === null && des === null) return Date.now();
  if (sin === null) return des! - 1;
  if (des === null) return sin + 1;
  return (sin + des) / 2;
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
