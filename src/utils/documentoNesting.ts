/**
 * DOCUMENTO DI NESTING — il lavoro completo, diviso per essenze.
 *
 * Un lavoro reale non è quasi mai di un solo materiale: la stessa distinta
 * contiene legno scuro, bianco e pelle chiara, ognuno con il suo supporto
 * (lastre o bobina) e la sua venatura. Qui c'è il modello del documento, la
 * migrazione dai salvataggi del formato precedente e la traduzione di un
 * materiale nei parametri del motore di calcolo.
 */

import type { ParametriNesting, PezzoNesting } from '../geometry/nesting';

/** supporto: lastre uguali a volontà, oppure un rotolo di lunghezza data */
export type ModoSupporto = 'lastre' | 'bobina';

/** direzione della venatura del materiale (o assenza) */
export type Venatura = 'nessuna' | 'orizzontale' | 'verticale';

export interface MaterialeNesting {
  id: string;
  nome: string;
  modo: ModoSupporto;
  lastra: { larghezza: number; altezza: number };
  /** larghezza del rotolo (mm) e metri disponibili */
  bobina: { larghezza: number; metri: number };
  venatura: Venatura;
  lama: number;
  abbondanza: number;
  margine: number;
  /** versi imposti a mano, per singola copia (chiave `idPezzo#indice`) */
  orientamenti: Record<string, boolean>;
  pezzi: PezzoNesting[];
}

export interface DocumentoNesting {
  versione: 2;
  nome: string;
  materiali: MaterialeNesting[];
  /** id del materiale mostrato a schermo */
  attivo: string;
}

export const LASTRA_PREDEFINITA = { larghezza: 2500, altezza: 1250 };
export const BOBINA_PREDEFINITA = { larghezza: 1000, metri: 50 };

export function materialeNuovo(id: string, nome: string): MaterialeNesting {
  return {
    id,
    nome,
    modo: 'lastre',
    lastra: { ...LASTRA_PREDEFINITA },
    bobina: { ...BOBINA_PREDEFINITA },
    venatura: 'nessuna',
    lama: 3,
    abbondanza: 0,
    margine: 10,
    orientamenti: {},
    pezzi: []
  };
}

/** i parametri del motore per un materiale, secondo il suo supporto */
export function parametriDi(m: MaterialeNesting): ParametriNesting {
  const comuni = {
    lama: m.lama,
    abbondanza: m.abbondanza,
    margine: m.margine,
    orientamenti: m.orientamenti
  };
  if (m.modo !== 'bobina') {
    return { lastra: { ...m.lastra }, ...comuni };
  }
  // il rotolo è UNA striscia continua: si impagina sfruttando tutta la
  // lunghezza, e solo dopo si decide dove spezzarlo (vedi geometry/segmenti)
  return {
    lastra: { larghezza: m.bobina.larghezza, altezza: Math.max(1, m.bobina.metri * 1000) },
    ...comuni,
    massimoLastre: 1
  };
}

/**
 * I pezzi come vanno passati al motore.
 *
 * Senza venatura il verso di un pezzo non ha alcun significato fisico: il
 * programma è libero di girarlo per impacchettare meglio, e la spunta «Ruota»
 * del singolo pezzo non ha più nulla da vincolare. Con una venatura invece
 * comanda la spunta, pezzo per pezzo.
 */
export function pezziDi(m: MaterialeNesting): PezzoNesting[] {
  if (m.venatura !== 'nessuna') return m.pezzi;
  return m.pezzi.map((p) => (p.ruotabile ? p : { ...p, ruotabile: true }));
}

/**
 * Cosa cambia in un materiale quando si sceglie la venatura.
 *
 * Accendendola il verso dei pezzi conta: tutti si bloccano nel verso in cui
 * sono stati inseriti — la fibra deve andare per il suo verso — e i versi
 * girati a mano nell'anteprima decadono, perché erano stati scelti quando il
 * verso era indifferente. Restano liberi solo i pezzi che si spunta a mano.
 *
 * Spegnendola non si tocca nulla: senza venatura ci pensa `pezziDi`, e i
 * valori per pezzo restano lì pronti per quando la si riaccende.
 */
export function cambioVenatura(m: MaterialeNesting, v: Venatura): Partial<MaterialeNesting> {
  if (v === m.venatura) return { venatura: v };
  if (v === 'nessuna' || m.venatura !== 'nessuna') return { venatura: v };
  return {
    venatura: v,
    pezzi: m.pezzi.map((p) => (p.ruotabile ? { ...p, ruotabile: false } : p)),
    orientamenti: {}
  };
}

/** com'è fatto il supporto, in una riga (intestazioni, PDF, elenchi) */
export function etichettaSupporto(m: MaterialeNesting): string {
  if (m.modo === 'bobina') {
    return `bobina ${m.bobina.larghezza} mm × ${m.bobina.metri} m`;
  }
  return `lastre ${m.lastra.larghezza} × ${m.lastra.altezza} mm`;
}

/** quante copie di pezzi chiede il materiale */
export function pezziRichiesti(m: MaterialeNesting): number {
  return m.pezzi.reduce((n, p) => n + Math.max(0, Math.round(p.quantita) || 0), 0);
}

const numero = (v: unknown, difetto: number, minimo = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= minimo ? v : difetto;

function normalizzaPezzo(g: Record<string, unknown>, indice: number): PezzoNesting | null {
  const larghezza = numero(g.larghezza, 0, 0.001);
  const altezza = numero(g.altezza, 0, 0.001);
  if (!(larghezza > 0) || !(altezza > 0)) return null;
  return {
    id: typeof g.id === 'string' && g.id ? g.id : `p${indice + 1}`,
    nome: typeof g.nome === 'string' ? g.nome : '',
    larghezza,
    altezza,
    quantita: Math.max(0, Math.round(numero(g.quantita, 1))),
    ruotabile: g.ruotabile !== false,
    tinta: numero(g.tinta, 0)
  };
}

function normalizzaMateriale(
  g: Record<string, unknown>,
  indice: number
): MaterialeNesting {
  const base = materialeNuovo(
    typeof g.id === 'string' && g.id ? g.id : `m${indice + 1}`,
    typeof g.nome === 'string' && g.nome.trim() ? g.nome.trim() : `Materiale ${indice + 1}`
  );
  const lastra = (g.lastra ?? {}) as Record<string, unknown>;
  const bobina = (g.bobina ?? {}) as Record<string, unknown>;
  const pezzi = Array.isArray(g.pezzi) ? g.pezzi : [];
  return {
    ...base,
    modo: g.modo === 'bobina' ? 'bobina' : 'lastre',
    lastra: {
      larghezza: numero(lastra.larghezza, LASTRA_PREDEFINITA.larghezza, 1),
      altezza: numero(lastra.altezza, LASTRA_PREDEFINITA.altezza, 1)
    },
    bobina: {
      larghezza: numero(bobina.larghezza, BOBINA_PREDEFINITA.larghezza, 1),
      metri: numero(bobina.metri, BOBINA_PREDEFINITA.metri, 0.001)
    },
    venatura:
      g.venatura === 'orizzontale' || g.venatura === 'verticale' ? g.venatura : 'nessuna',
    lama: numero(g.lama, base.lama),
    abbondanza: numero(g.abbondanza, base.abbondanza),
    margine: numero(g.margine, base.margine),
    orientamenti:
      g.orientamenti && typeof g.orientamenti === 'object'
        ? { ...(g.orientamenti as Record<string, boolean>) }
        : {},
    pezzi: pezzi
      .map((p, i) => normalizzaPezzo((p ?? {}) as Record<string, unknown>, i))
      .filter((p): p is PezzoNesting => p !== null)
  };
}

/**
 * Legge un salvataggio di qualunque formato e ne ricava un documento valido.
 *
 * Il formato precedente (un solo materiale, campi in radice) viene avvolto in
 * un materiale unico: nessun lavoro salvato va perso passando alla versione
 * con più essenze.
 */
export function migraDocumento(grezzo: unknown): DocumentoNesting | null {
  if (!grezzo || typeof grezzo !== 'object') return null;
  const g = grezzo as Record<string, unknown>;

  const nome = typeof g.nome === 'string' && g.nome.trim() ? g.nome.trim() : 'Lavoro senza nome';

  if (Array.isArray(g.materiali)) {
    const materiali = g.materiali.map((m, i) =>
      normalizzaMateriale((m ?? {}) as Record<string, unknown>, i)
    );
    if (materiali.length === 0) materiali.push(materialeNuovo('m1', 'Materiale 1'));
    const attivo =
      typeof g.attivo === 'string' && materiali.some((m) => m.id === g.attivo)
        ? g.attivo
        : materiali[0].id;
    return { versione: 2, nome, materiali, attivo };
  }

  // formato v1: un unico materiale con i campi in radice
  if (!Array.isArray(g.pezzi)) return null;
  const unico = normalizzaMateriale({ ...g, nome: g.nomeMateriale ?? 'Materiale 1' }, 0);
  return { versione: 2, nome, materiali: [unico], attivo: unico.id };
}
