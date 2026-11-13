/**
 * LE PORTE NEL PIANO DI TAGLIO.
 *
 * Le porte rilevate nel sopralluogo arrivano nel piano di taglio con il numero
 * che danno le etichette sulle foto. Per ogni tipo di porta si decide come si
 * taglia:
 *
 * - **kit**: ogni pezzo alla sua misura esatta. I pezzi vanno in un'essenza
 *   tutta loro («Porte (kit)», su bobina): si impaginano insieme fra loro e
 *   mai con le forme delle pareti, come succede in laboratorio;
 * - **strisce**: i pezzi si tagliano da rotoli della loro larghezza, e i rotoli
 *   si ricavano tagliando le bobine. Il piano delle bobine (larghezze dei
 *   rotoli, scorte, avanzi) lo fa il rilievo porta; qui si tengono le sue scelte
 *   e un riepilogo per il PDF.
 *
 * I pezzi dell'essenza dei kit si rifanno da soli quando cambiano le porte, le
 * etichette o la scelta: non si modificano a mano.
 */

import type { Porta, Venatura } from '../db/types';
import type { PezzoNesting } from '../geometry/nesting';
import type { DocumentoNesting, MaterialeNesting } from './documentoNesting';
import { materialeNuovo } from './documentoNesting';
import { nuovoId } from './id';
import { prossimaTinta } from './tinte';
import { siglaPezzo } from './sigle';

export type ModoPorta = 'kit' | 'strisce';

/** Riepilogo del piano delle strisce, come lo consegna il rilievo porta. */
export interface RiepilogoStrisce {
  /** larghezza della bobina madre (mm) */
  larghezza: number;
  /** metri di un rotolo */
  metriRotolo: number;
  /** bobine madri da tagliare */
  bobine: number;
  rotoli: Array<{
    larghezza: number;
    da: number;
    metri: number;
    rotoli: number;
    pezzi: Array<{ larghezza: number; lunghezza: number; quantita: number; nomi: string[] }>;
    /** rotoli di scorta di questa larghezza */
    scorta?: number;
    /** pezzi previsti, porta per porta */
    dettaglio?: Array<{ sigla?: string; pezzo: string; porta: string; quantita: number; larghezza: number; lunghezza: number }>;
  }>;
  /** come si taglia ogni gruppo di bobine uguali */
  tagli: Array<{
    bobine: number;
    strisce: Array<{ larghezza: number; scorta: boolean; intero: boolean }>;
    daDecidere: boolean;
  }>;
}

export interface PorteNesting {
  /** kit o strisce, per tipo di porta (id della porta); assente = strisce */
  modi: Record<string, ModoPorta>;
  /** essenza dove stanno i pezzi dei kit */
  materialeKit?: string;
  /** scelte del piano delle strisce (formato del rilievo porta) */
  piano?: Record<string, unknown>;
  /** ultimo riepilogo del piano delle strisce */
  riepilogo?: RiepilogoStrisce | null;
  /** porte e quantità da cui è nato il riepilogo: se cambiano, va rifatto */
  firma?: string;
}

/** Porte a strisce e quantità: cambia quando il piano delle bobine va rifatto. */
export function firmaStrisce(porte: Porta[], conto: Map<string, number>): string {
  return porte
    .map((p) => `${p.id}:${conto.get(p.id) ?? 0}:${p.modificatoIl}`)
    .sort()
    .join('|');
}

export const NOME_MATERIALE_KIT = 'Porte (kit)';

export function modoPorta(porte: PorteNesting | undefined, id: string): ModoPorta {
  return porte?.modi[id] ?? 'strisce';
}

/**
 * I pezzi dei kit: per ogni porta in kit, i suoi pezzi per il numero di porte.
 *
 * LA VENATURA VA PER IL LATO LUNGO. Il montante ha la fibra dal basso verso
 * l'alto, il traverso da destra a sinistra, la faccia dell'anta per la sua
 * altezza: in ogni pezzo della porta la fibra segue la LUNGHEZZA. Su un
 * materiale venato il pezzo si mette quindi con la lunghezza nel verso della
 * venatura e non si gira: un traverso con la fibra in piedi si vede subito.
 * Senza venatura il motore è libero di girarli come conviene.
 */
export function pezziKit(
  porte: Porta[],
  conto: Map<string, number>,
  modi: PorteNesting,
  venatura: Venatura = 'nessuna'
): Omit<PezzoNesting, 'tinta'>[] {
  const pezzi: Omit<PezzoNesting, 'tinta'>[] = [];
  for (const p of porte) {
    if (modoPorta(modi, p.id) !== 'kit') continue;
    const qty = conto.get(p.id) ?? 0;
    if (qty <= 0) continue;
    // un pezzo per sigla: sul pezzo tagliato si scrive la sigla (PA-E-MDX-CF)
    p.righe.forEach((r, i) => {
      // orizzontale: fibra lungo la larghezza del supporto → lunghezza in orizzontale
      const sdraiato = venatura === 'orizzontale';
      pezzi.push({
        id: `porta-${p.id}-${i}`,
        nome: siglaPezzo(p, r),
        larghezza: sdraiato ? r.lunghezza : r.larghezza,
        altezza: sdraiato ? r.larghezza : r.lunghezza,
        quantita: qty,
        ruotabile: venatura === 'nessuna'
      });
    });
  }
  return pezzi;
}

/**
 * Rifà l'essenza dei kit secondo porte, etichette e scelte. Se non cambia
 * niente restituisce lo stesso documento (per identità).
 */
export function sincronizzaKit(
  doc: DocumentoNesting,
  porte: Porta[],
  conto: Map<string, number>
): DocumentoNesting {
  const sez = doc.porte;
  if (!sez) return doc;
  const esistente = sez.materialeKit
    ? doc.materiali.find((m) => m.id === sez.materialeKit)
    : undefined;
  const nuovi = pezziKit(porte, conto, sez, esistente?.venatura ?? 'nessuna');

  if (nuovi.length === 0) {
    if (!esistente && !sez.materialeKit) return doc;
    const materiali = doc.materiali.filter((m) => m.id !== sez.materialeKit);
    if (materiali.length === 0) materiali.push(materialeNuovo(nuovoId(), 'Materiale 1'));
    const { materialeKit: _via, ...resto } = sez;
    return {
      ...doc,
      materiali,
      attivo: materiali.some((m) => m.id === doc.attivo) ? doc.attivo : materiali[0].id,
      porte: resto
    };
  }

  const tinte = new Map((esistente?.pezzi ?? []).map((p) => [p.id, p.tinta]));
  const pezzi: PezzoNesting[] = nuovi.map((p, i) => ({ ...p, tinta: tinte.get(p.id) ?? prossimaTinta(i) }));
  const versiLiberi = Object.keys(esistente?.orientamenti ?? {}).length === 0;
  if (esistente && versiLiberi && JSON.stringify(esistente.pezzi) === JSON.stringify(pezzi)) return doc;

  const base: MaterialeNesting = esistente ?? {
    ...materialeNuovo(nuovoId(), NOME_MATERIALE_KIT),
    modo: 'bobina'
  };
  // il verso dei pezzi lo decide la venatura: niente versi girati a mano
  const aggiornato: MaterialeNesting = { ...base, pezzi, orientamenti: {} };
  const materiali = esistente
    ? doc.materiali.map((m) => (m.id === esistente.id ? aggiornato : m))
    : [...doc.materiali, aggiornato];
  return { ...doc, materiali, porte: { ...sez, materialeKit: aggiornato.id } };
}

/** Normalizza la sezione porte di un documento salvato. */
export function normalizzaPorte(g: unknown): PorteNesting | undefined {
  if (!g || typeof g !== 'object') return undefined;
  const s = g as Record<string, unknown>;
  const modi: Record<string, ModoPorta> = {};
  if (s.modi && typeof s.modi === 'object') {
    for (const [k, v] of Object.entries(s.modi as Record<string, unknown>)) {
      if (v === 'kit' || v === 'strisce') modi[k] = v;
    }
  }
  return {
    modi,
    ...(typeof s.materialeKit === 'string' ? { materialeKit: s.materialeKit } : {}),
    ...(s.piano && typeof s.piano === 'object' ? { piano: s.piano as Record<string, unknown> } : {}),
    ...(s.riepilogo && typeof s.riepilogo === 'object'
      ? { riepilogo: s.riepilogo as RiepilogoStrisce }
      : {}),
    ...(typeof s.firma === 'string' ? { firma: s.firma } : {})
  };
}

/** Un gruppo di porte con le stesse istruzioni di montaggio. */
export interface GruppoMontaggio {
  /** 1, 2, 3… nell'ordine delle porte */
  numero: number;
  porte: Porta[];
}

/**
 * STESSE ISTRUZIONI DI MONTAGGIO: porte della stessa famiglia (la porta creata
 * da zero e le sue copie) con la stessa firma costruttiva. Una porta senza
 * firma (salvata prima che esistesse) fa gruppo a sé: mai istruzioni comuni
 * senza la certezza che la costruzione sia la stessa.
 */
export function gruppiMontaggio(porte: Porta[]): GruppoMontaggio[] {
  const gruppi = new Map<string, Porta[]>();
  for (const p of porte) {
    const chiave = `${p.famiglia ?? p.id}|${p.firma ?? p.id}`;
    const g = gruppi.get(chiave);
    if (g) g.push(p);
    else gruppi.set(chiave, [p]);
  }
  return [...gruppi.values()].map((porte, i) => ({ numero: i + 1, porte }));
}

/** «Porta A» o «Porte A, B, C». */
export function nomePorte(porte: Porta[]): string {
  return porte.length === 1
    ? porte[0].nome
    : `Porte ${porte.map((p) => p.lettera).join(', ')}`;
}
