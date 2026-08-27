/**
 * DOCUMENTO DI NESTING — il lavoro completo, diviso per essenze.
 *
 * Un lavoro reale non è quasi mai di un solo materiale: la stessa distinta
 * contiene legno scuro, bianco e pelle chiara, ognuno con il suo supporto
 * (lastre o bobina) e la sua venatura. Qui c'è il modello del documento, la
 * migrazione dai salvataggi del formato precedente e la traduzione di un
 * materiale nei parametri del motore di calcolo.
 */

import type { OpzioniRicerca, ParametriNesting, PezzoNesting } from '../geometry/nesting';
import { FORME, type FormaPezzo } from '../geometry/sagome';
import { BLOCCO_MANEGGEVOLE } from '../geometry/segmenti';
import { nuovoId } from './id';
import { prossimaTinta } from './tinte';

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
  /**
   * Come stampare il piano di taglio. Resta col lavoro perché il PDF viene
   * rifatto da solo a ogni modifica: senza memoria, la lunghezza massima
   * scelta a mano andrebbe persa al primo salvataggio.
   */
  stampa?: { segmenta: boolean; massimoSegmento: number };
}

export const LASTRA_PREDEFINITA = { larghezza: 2500, altezza: 1250 };
/** la bobina più comune in laboratorio: 1220 mm di fascia */
export const BOBINA_PREDEFINITA = { larghezza: 1220, metri: 50 };

/**
 * Le fasce di rotolo che si trovano davvero (mm).
 *
 * Pellicole e controllo solare arrivano in queste misure: tenerle a portata
 * di tocco serve a scalare da una fascia all'altra — quello che non entra
 * nella 915 si prova sulla 1220, poi sulla 1520 — senza ribattere il numero.
 */
export const FASCE_BOBINA = [915, 1220, 1520];

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

/**
 * Un'essenza vuota con lo stesso supporto della sua sorella.
 *
 * Quando un materiale ne genera un altro — una lista incollata che nomina
 * un'essenza nuova, una bobina di fascia diversa — la macchina è la stessa:
 * lama, abbondanze, margine e venatura si portano dietro, si cambia solo
 * quello che serve.
 */
export function essenzaGemella(m: MaterialeNesting, nome: string): MaterialeNesting {
  return {
    ...materialeNuovo(nuovoId(), nome),
    modo: m.modo,
    lastra: { ...m.lastra },
    bobina: { ...m.bobina },
    venatura: m.venatura,
    lama: m.lama,
    abbondanza: m.abbondanza,
    margine: m.margine
  };
}

/** un nome che non è già di un'altra essenza: «Bianco» → «Bianco (2)» */
export function nomeEssenzaLibero(materiali: MaterialeNesting[], base: string): string {
  const usati = new Set(materiali.map((m) => m.nome.trim().toLowerCase()));
  const pulito = base.trim() || 'Materiale';
  if (!usati.has(pulito.toLowerCase())) return pulito;
  for (let n = 2; ; n++) {
    const tentativo = `${pulito} (${n})`;
    if (!usati.has(tentativo.toLowerCase())) return tentativo;
  }
}

/**
 * TRASFERIMENTO DI PEZZI FRA ESSENZE.
 *
 * Le misure di un cantiere si prendono una volta sola e finiscono tutte sotto
 * lo stesso materiale. Poi, per tagliare meglio, capita di dover mandare una
 * parte della lista su un'altra bobina dello stesso materiale: senza questo,
 * l'unica strada sarebbe ribattere a mano nomi, misure e quantità.
 */
export interface Trasferimento {
  /** essenza di partenza */
  da: string;
  /** essenza di arrivo; `null` ne crea una gemella di quella di partenza */
  a: string | null;
  /** id dei pezzi da portare */
  pezzi: string[];
  /**
   * Quante copie portare, pezzo per pezzo. Senza indicazione va la riga
   * intera; portandone una parte, all'essenza di partenza restano le copie
   * che avanzano — dieci ante, sei sulla bobina larga e quattro sulla
   * stretta, senza riscrivere due volte la stessa misura.
   */
  quantita?: Record<string, number>;
  /** vero per lasciare gli originali dov'erano */
  copia?: boolean;
  /** nome della nuova essenza, quando se ne crea una */
  nome?: string;
  /**
   * Il supporto della nuova essenza, quando se ne crea una. È il gesto vero
   * del lavoro: i pezzi rimasti fuori si portano su un rotolo di un'altra
   * fascia, e la fascia si sceglie mentre li si sposta.
   */
  supporto?: { modo: ModoSupporto; lastra: MaterialeNesting['lastra']; bobina: MaterialeNesting['bobina'] };
}

/**
 * Porta dei pezzi da un'essenza a un'altra e si posiziona sull'arrivo.
 *
 * Se non c'è niente da portare il documento torna com'era, per identità: chi
 * chiama può accorgersene senza confrontare nulla.
 */
export function trasferisciPezzi(doc: DocumentoNesting, t: Trasferimento): DocumentoNesting {
  if (t.a === t.da) return doc;
  const origine = doc.materiali.find((m) => m.id === t.da);
  if (!origine) return doc;

  const scelti = new Set(t.pezzi);
  const quante = (p: PezzoNesting) => {
    const totale = Math.max(0, Math.round(p.quantita) || 0);
    const chiesta = t.quantita?.[p.id];
    if (chiesta === undefined || !Number.isFinite(chiesta)) return totale;
    return Math.max(0, Math.min(totale, Math.round(chiesta)));
  };
  const daPortare = origine.pezzi.filter((p) => scelti.has(p.id) && quante(p) > 0);
  if (daPortare.length === 0) return doc;

  let materiali = doc.materiali;
  let destinazione = t.a === null ? null : (materiali.find((m) => m.id === t.a) ?? null);
  // un'essenza di arrivo indicata ma sparita: meglio non spostare niente
  if (t.a !== null && !destinazione) return doc;
  if (!destinazione) {
    destinazione = essenzaGemella(origine, nomeEssenzaLibero(materiali, t.nome ?? origine.nome));
    if (t.supporto) {
      destinazione = {
        ...destinazione,
        modo: t.supporto.modo,
        lastra: { ...t.supporto.lastra },
        bobina: { ...t.supporto.bobina }
      };
    }
    materiali = [...materiali, destinazione];
  }
  const arrivo = destinazione;

  // passando da un materiale senza venatura a uno venato il verso comincia a
  // contare: i pezzi arrivano bloccati come li avrebbe messi `cambioVenatura`
  const siBlocca = arrivo.venatura !== 'nessuna' && origine.venatura === 'nessuna';
  const arrivati = daPortare.map((p, i) => ({
    ...p,
    // identità nuova: nell'essenza di arrivo il pezzo è un'altra riga, e i
    // versi imposti a mano nell'anteprima di partenza non lo seguono
    id: nuovoId(),
    quantita: quante(p),
    ruotabile: siBlocca ? false : p.ruotabile,
    tinta: prossimaTinta(arrivo.pezzi.length + i)
  }));

  /** i pezzi che alla partenza cambiano: spariscono o restano in meno */
  const partiti = new Set(daPortare.map((p) => p.id));

  materiali = materiali.map((m) => {
    if (m.id === arrivo.id) return { ...m, pezzi: [...m.pezzi, ...arrivati] };
    if (m.id === origine.id && !t.copia) {
      return {
        ...m,
        pezzi: m.pezzi
          .map((p) => {
            if (!partiti.has(p.id)) return p;
            const restano = Math.max(0, Math.round(p.quantita) || 0) - quante(p);
            return restano > 0 ? { ...p, quantita: restano } : null;
          })
          .filter((p): p is PezzoNesting => p !== null),
        // i versi imposti valgono per una copia precisa: cambiato il numero
        // di copie non vogliono più dire niente, e si lasciano ricalcolare
        orientamenti: senzaOrientamenti(m.orientamenti, partiti)
      };
    }
    return m;
  });

  return { ...doc, materiali, attivo: arrivo.id };
}

/**
 * Sdoppia un'essenza: stessa lista di pezzi, supporto da cambiare.
 *
 * È la scorciatoia del caso più frequente — lo stesso materiale su bobine di
 * fascia diversa — e vale come punto di partenza: si duplica, si cambia la
 * misura del rotolo e poi si spostano i pezzi che convengono di là.
 */
export function duplicaEssenza(doc: DocumentoNesting, id: string): DocumentoNesting {
  const m = doc.materiali.find((x) => x.id === id);
  if (!m) return doc;
  if (m.pezzi.length === 0) {
    const gemella = essenzaGemella(m, nomeEssenzaLibero(doc.materiali, m.nome));
    return { ...doc, materiali: [...doc.materiali, gemella], attivo: gemella.id };
  }
  return trasferisciPezzi(doc, {
    da: id,
    a: null,
    pezzi: m.pezzi.map((p) => p.id),
    copia: true
  });
}

/** i versi imposti che restano, tolti i pezzi andati via (chiave `id#indice`) */
function senzaOrientamenti(
  orientamenti: Record<string, boolean>,
  andati: Set<string>
): Record<string, boolean> {
  const rimasti: Record<string, boolean> = {};
  for (const [chiave, valore] of Object.entries(orientamenti)) {
    if (!andati.has(chiave.slice(0, chiave.lastIndexOf('#')))) rimasti[chiave] = valore;
  }
  return rimasti;
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
 * Cosa cerca il motore, secondo il supporto.
 *
 * Sta qui, in un posto solo, perché l'anteprima, il PDF e l'SVG devono
 * chiedere esattamente la stessa cosa: se divergessero, il disegno che si
 * guarda a schermo non sarebbe quello che si porta in laboratorio.
 */
export function opzioniRicerca(m: MaterialeNesting): OpzioniRicerca {
  return m.modo === 'bobina'
    ? { bloccoMassimo: BLOCCO_MANEGGEVOLE }
    : { sfridoRettangolare: true };
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
  // il cerchio ha una misura sola: l'altezza si riallinea al diametro
  const forma = FORME.some((f) => f.id === g.forma) ? (g.forma as FormaPezzo) : undefined;
  const altezza = forma === 'cerchio' ? larghezza : numero(g.altezza, 0, 0.001);
  if (!(larghezza > 0) || !(altezza > 0)) return null;
  const misura3 = numero(g.misura3, 0, 0.001);
  return {
    id: typeof g.id === 'string' && g.id ? g.id : `p${indice + 1}`,
    nome: typeof g.nome === 'string' ? g.nome : '',
    larghezza,
    altezza,
    // la terza misura e la forma sopravvivono al salvataggio: perderle qui
    // ritrasformerebbe le falde in rettangoli al primo riapri
    misura3: misura3 > 0 ? misura3 : undefined,
    forma: forma === 'rett' ? undefined : forma,
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
    return { versione: 2, nome, materiali, attivo, stampa: normalizzaStampa(g.stampa) };
  }

  // formato v1: un unico materiale con i campi in radice
  if (!Array.isArray(g.pezzi)) return null;
  const unico = normalizzaMateriale({ ...g, nome: g.nomeMateriale ?? 'Materiale 1' }, 0);
  return { versione: 2, nome, materiali: [unico], attivo: unico.id };
}

function normalizzaStampa(
  g: unknown
): { segmenta: boolean; massimoSegmento: number } | undefined {
  if (!g || typeof g !== 'object') return undefined;
  const s = g as Record<string, unknown>;
  const massimo = numero(s.massimoSegmento, 0, 1);
  if (!(massimo > 0)) return undefined;
  return { segmenta: s.segmenta !== false, massimoSegmento: massimo };
}
