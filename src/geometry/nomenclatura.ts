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

/** Prima lettera dell'alfabeto non ancora usata (A, B, … Z, AA…). */
export function prossimaLetteraLibera(usate: Iterable<string>): string {
  const insieme = new Set(usate);
  for (let i = 0; ; i++) {
    const l = letteraDaIndice(i);
    if (!insieme.has(l)) return l;
  }
}

/** Ordina le etichette: prima le lettere (alfabetico), poi i numeri (crescente). */
export function confrontaEtichetta(a: string, b: string): number {
  const num = (s: string) => /^[0-9]+$/.test(s);
  if (num(a) !== num(b)) return num(a) ? 1 : -1; // numeri dopo le lettere
  if (num(a)) return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface VoceLegenda {
  lettera: string;
  descrizione: string;
  /** quante etichette con questa lettera sono presenti sulla foto */
  quantita: number;
}

/**
 * Voci della legenda di una foto, derivate dalle etichette presenti: una riga
 * per lettera distinta (lettera = descrizione = quantità), sempre in ordine
 * alfabetico. Etichette con la stessa lettera condividono la descrizione e ne
 * viene contato il numero (es. 2 × A, 3 × B…).
 */
export function vociLegenda(annotazioni: Annotazione[]): VoceLegenda[] {
  const descrizioni = new Map<string, string>();
  const conteggio = new Map<string, number>();
  for (const a of annotazioni) {
    if (a.tipo !== 'etichetta') continue;
    conteggio.set(a.lettera, (conteggio.get(a.lettera) ?? 0) + 1);
    const esistente = descrizioni.get(a.lettera);
    // preferisci una descrizione non vuota se disponibile
    if (esistente === undefined || (!esistente && a.descrizione)) {
      descrizioni.set(a.lettera, a.descrizione ?? '');
    }
  }
  return [...conteggio.keys()]
    .map((lettera) => ({
      lettera,
      descrizione: descrizioni.get(lettera) ?? '',
      quantita: conteggio.get(lettera) ?? 1
    }))
    .sort((x, y) => confrontaEtichetta(x.lettera, y.lettera));
}

/** Tipi di annotazione che ricevono un codice/etichetta (le "forme") */
export function eFormaEtichettabile(a: Annotazione): boolean {
  return a.tipo === 'quotaPoligono' || a.tipo === 'quotaRett' || a.tipo === 'callout';
}

/**
 * Etichetta della foto: manuale (campo `etichetta`) se presente, altrimenti la
 * lettera automatica ricavata dalla posizione (ordine) fra le foto che
 * CONDIVIDONO LA SEQUENZA.
 *
 * `fotoDelProgetto` sono le foto che la condividono, non per forza tutte
 * quelle del progetto: dentro una sezione etichettata le lettere ripartono da
 * A (vedi `gruppiDiLettere`).
 */
export function etichettaFoto(foto: Foto, fotoDelProgetto: Foto[]): string {
  const manuale = foto.etichetta?.trim();
  if (manuale) return manuale;
  const ordinate = [...fotoDelProgetto].sort((a, b) => a.ordine - b.ordine);
  const idx = ordinate.findIndex((f) => f.id === foto.id);
  return letteraDaIndice(idx < 0 ? 0 : idx);
}

/** quanto può essere lunga l'etichetta di una foto perché il codice resti leggibile */
export const MAX_ETICHETTA_FOTO = 8;

/**
 * L'ETICHETTA RICAVATA DAL NOME DELLA FOTO.
 *
 * In un albergo si misura come si può: la stanza libera adesso, quella
 * occupata domani. Le lettere seguono l'ordine degli scatti, e a lavoro finito
 * la parete A è nella stanza 3 e la C nella stanza 1 — un codice che su un
 * telo, a mesi di distanza, non dice più niente. Il numero della stanza però
 * c'è già: è il nome che si dà alla foto mentre la si scatta.
 *
 * Qui quel nome diventa il codice. Se è già corto si prende così com'è
 * («307», «307b», «bagno»); se è una frase se ne tiene il GRUPPO DI CIFRE più
 * lungo, che è la stanza («Camera 307» → «307»). Se di cifre non ce ne sono e
 * il nome è lungo, non si inventa niente: torna null, e quella foto la si
 * scrive a mano.
 */
export function etichettaDalNome(didascalia: string | undefined): string | null {
  const t = (didascalia ?? '').trim();
  if (!t) return null;
  if (t.length <= MAX_ETICHETTA_FOTO) return t;
  const cifre = t.match(/\d+/g);
  if (!cifre?.length) return null;
  // il gruppo più lungo, e a pari lunghezza l'ultimo: «Piano 1 camera 307»
  // è la stanza 307, non il piano 1
  let scelto = cifre[0];
  for (const c of cifre) if (c.length >= scelto.length) scelto = c;
  return scelto.length <= MAX_ETICHETTA_FOTO ? scelto : null;
}

/**
 * LE LETTERE RIPARTONO DENTRO OGNI SEZIONE ETICHETTATA.
 *
 * Una sezione con la sua etichetta è un capitolo a sé: «Piano 1» si chiama P1
 * e le sue foto sono P1.A, P1.B. Se le lettere continuassero a correre su
 * tutto il progetto, il piano secondo comincerebbe da P2.C — un codice che non
 * dice niente a chi lo legge e che cambia tutto appena si aggiunge una foto al
 * piano di sotto.
 *
 * Chi condivide la sequenza lo dice il PERCORSO: due foto con lo stesso
 * percorso (stesse cartelle, stesso progetto, stessa sezione etichettata) si
 * numerano insieme, due con percorsi diversi ripartono. Le foto delle sezioni
 * SENZA etichetta non fanno capitolo — il loro percorso è quello del progetto
 * — e restano in un'unica sequenza con quelle senza sezione, che è come è
 * sempre stato.
 *
 * Il progetto entra comunque nella chiave: due progetti senza etichetta hanno
 * tutti e due percorso vuoto, e non per questo condividono le lettere.
 */
function gruppiDiLettere(
  foto: Foto[],
  percorsoDi: (fotoId: string) => string[]
): Map<string, string> {
  const gruppi = new Map<string, Foto[]>();
  for (const f of foto) {
    const k = `${f.progettoId ?? ''}\u0000${percorsoDi(f.id).join(' ')}`;
    if (!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k)!.push(f);
  }
  const fuori = new Map<string, string>();
  for (const [, lista] of gruppi) {
    for (const f of lista) fuori.set(f.id, etichettaFoto(f, lista));
  }
  return fuori;
}

/**
 * Le lettere automatiche delle foto di un progetto, sezione per sezione.
 *
 * Per chi non calcola i codici delle forme ma deve comunque chiamare le foto
 * come le chiama l'app — lo ZIP, che le mette in cartelle per sezione.
 */
export function etichetteFotoDelProgetto(
  foto: Foto[],
  progetto: Pick<Progetto, 'cartellaId' | 'etichetta' | 'sezioni'>,
  cartelle: Cartella[] = []
): Map<string, string> {
  const perId = new Map(foto.map((f) => [f.id, f]));
  return gruppiDiLettere(foto, (id) => {
    const f = perId.get(id);
    return f ? percorsoDellaFoto(f, progetto, cartelle) : [];
  });
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
    //
    // Il suffisso del telo (".a", ".b") NON entra in questo elenco, e non è una
    // dimenticanza: un'etichetta come "F1.dx" o "P2.int" ha la stessa forma, e
    // scritta a mano vuol dire quello che dice. I codici dei teli l'app non li
    // scrive mai qui: li calcola quando serve.
    if (/^\d+$/.test(e) || /^[A-Z]$/.test(e) || /^[A-Z]+\d+(\.\d+)?$/.test(e)) return undefined;
    return e;
  }
  return undefined;
}

export interface NumeroForma {
  /** etichetta della foto dell'ORIGINALE della famiglia (es. "A") */
  etichettaFoto: string;
  /** numero della FAMIGLIA nella sequenza (es. 1 → A1) */
  numero: number;
  /** indice nella famiglia DENTRO la cartella, se la famiglia ha più copie (A1.2) */
  sub?: number;
  /** quantità di copie della famiglia DENTRO questa cartella (per la distinta) */
  quantita: number;
  /** quantità totale di copie della famiglia in tutto il progetto/edificio */
  quantitaGlobale: number;
}

/** Famiglia di una forma: il gruppo di duplicazione, o la forma stessa */
export function famigliaDi(a: Annotazione): string {
  const g = a.gruppoQuota?.trim();
  return g || a.id;
}

/** true se la forma è una copia "solo etichetta" (non l'originale misurato) */
export function eCopiaEtichetta(a: Annotazione): boolean {
  return a.tipo === 'quotaPoligono' && a.soloEtichetta === true;
}

/**
 * Numerazione di TUTTE le forme passate (una foto, un progetto, una cartella o
 * l'intero edificio). Una FAMIGLIA di elementi ripetuti (stesso `gruppoQuota`)
 * è numerata UNA volta a partire dal suo ORIGINALE (la misura vera): il codice
 * base (A1, B1…) deriva dalla foto e dal progetto dell'originale, perciò resta
 * lo stesso ovunque la misura venga richiamata.
 *
 * Il sotto-indice (A1.1, A1.2…) e la quantità invece RIPARTONO in ogni cartella
 * (percorso): membri della stessa famiglia ma in cartelle diverse contano da .1.
 * Così P1.A1.1/P1.A1.2 e P2.A1.1/P2.A1.2 sono numerazioni autonome.
 *
 * `percorsoDi` dà il percorso (cartelle) di ogni foto; se omesso tutto sta nello
 * stesso gruppo (una sola cartella).
 */
export function numeriProgetto(
  fotoProgetto: Foto[],
  annotazioniDi: (fotoId: string) => Annotazione[],
  percorsoDi: (fotoId: string) => string[] = () => []
): Map<string, NumeroForma> {
  // 1. etichetta di ogni foto, calcolata fra quelle che condividono la
  //    sequenza: dentro una sezione etichettata le lettere ripartono da A
  const etichettaDi = gruppiDiLettere(fotoProgetto, percorsoDi);

  // 2. raccogli tutte le forme etichettabili con il loro contesto
  interface Voce {
    a: Annotazione;
    chiave: number;
    progettoId: string;
    etichetta: string;
    percorso: string;
  }
  const voci: Voce[] = [];
  fotoProgetto.forEach((f, idxFoto) => {
    const perc = percorsoDi(f.id).join(' ');
    const lbl = etichettaDi.get(f.id) ?? 'A';
    for (const a of annotazioniDi(f.id)) {
      if (!eFormaEtichettabile(a)) continue;
      voci.push({ a, chiave: chiaveOrdine(a, idxFoto), progettoId: f.progettoId ?? '', etichetta: lbl, percorso: perc });
    }
  });

  // 3. raggruppa in FAMIGLIE globali (anche tra foto/cartelle diverse)
  const famiglie = new Map<string, Voce[]>();
  for (const v of voci) {
    const k = famigliaDi(v.a);
    if (!famiglie.has(k)) famiglie.set(k, []);
    famiglie.get(k)!.push(v);
  }

  // 4. per ogni famiglia: l'ORIGINALE (la misura vera, non una copia-etichetta)
  interface Fam {
    key: string;
    membri: Voce[];
    originale: Voce;
  }
  const fams: Fam[] = [];
  for (const [key, membri] of famiglie) {
    membri.sort((x, y) => x.chiave - y.chiave || x.a.id.localeCompare(y.a.id));
    const originale = membri.find((m) => !eCopiaEtichetta(m.a)) ?? membri[0];
    fams.push({ key, membri, originale });
  }

  // 5. codice base (lettera+numero) per (progetto, etichetta-foto) dell'originale
  const perBase = new Map<string, Fam[]>();
  for (const fam of fams) {
    // IL PERCORSO ENTRA NELLA CHIAVE. Con le lettere che ripartono dentro
    // ogni sezione, la A del piano primo e quella del piano secondo sono due
    // lettere diverse: numerarle insieme darebbe P1.A1 e P2.A2, cioè un «2»
    // che non conta niente — il secondo pezzo del piano secondo si
    // chiamerebbe A2 senza che esista nessun A1 lì dentro
    const bk = `${fam.originale.progettoId} ${fam.originale.percorso} ${fam.originale.etichetta}`;
    if (!perBase.has(bk)) perBase.set(bk, []);
    perBase.get(bk)!.push(fam);
  }
  const baseDi = new Map<string, { etichetta: string; numero: number }>();
  for (const [, lista] of perBase) {
    lista.sort((p, r) => p.originale.chiave - r.originale.chiave || p.key.localeCompare(r.key));
    lista.forEach((fam, i) => baseDi.set(fam.key, { etichetta: fam.originale.etichetta, numero: i + 1 }));
  }

  // 6. sotto-indice e quantità, che RIPARTONO per ogni percorso (cartella)
  const out = new Map<string, NumeroForma>();
  for (const fam of fams) {
    const base = baseDi.get(fam.key)!;
    const qtaGlobale = fam.membri.length;
    const perPercorso = new Map<string, Voce[]>();
    for (const m of fam.membri) {
      if (!perPercorso.has(m.percorso)) perPercorso.set(m.percorso, []);
      perPercorso.get(m.percorso)!.push(m);
    }
    for (const [, membriP] of perPercorso) {
      membriP.sort((x, y) => x.chiave - y.chiave || x.a.id.localeCompare(y.a.id));
      const qtaPercorso = membriP.length;
      membriP.forEach((m, j) => {
        out.set(m.a.id, {
          etichettaFoto: base.etichetta,
          numero: base.numero,
          sub: qtaGlobale > 1 ? j + 1 : undefined,
          quantita: qtaPercorso,
          quantitaGlobale: qtaGlobale
        });
      });
    }
  }
  return out;
}

/**
 * Codice LOCALE della forma (badge sulla foto): l'override manuale se presente,
 * altrimenti etichetta-foto + numero famiglia (+ eventuale sotto-indice A1.2).
 */
/**
 * Segno della copia speculare: il codice della copia più `%`.
 *
 * Serve a distinguerla a colpo d'occhio sulla foto e nella distinta: B1.2 è
 * la finestra come l'originale, B1.2% è la sua gemella ribaltata. Sono due
 * pezzi diversi da tagliare, non due copie dello stesso.
 */
export const SEGNO_SPECULARE = '%';

/** questa forma è una copia speculare? */
export function eSpeculare(a: Annotazione): boolean {
  return a.tipo === 'quotaPoligono' && a.speculare === true;
}

/**
 * IL CODICE DI UNA FORMA: l'etichetta della sua foto, poi il numero.
 *
 * Con una LETTERA si attaccano, come è sempre stato: «A» e 1 fanno «A1».
 * Con un NUMERO no. Chi fa un albergo chiama le foto col numero della
 * stanza — è l'unica cosa che, letta sul telo a mesi di distanza, dice
 * ancora dove va quel pezzo — e «307» attaccato a 1 farebbe «3071», che non
 * è né la stanza né il pezzo. Lì ci va il punto: «307.1».
 *
 * La regola: il punto ci va appena nell'etichetta compare una CIFRA. Non solo
 * in fondo — «302b» e 1 farebbero «302b1», che si legge anche «302» più «b1»
 * — ma dovunque sia. Le etichette di sole lettere (A, B, AA) restano attaccate
 * al numero come sono sempre state, e i lavori già fatti non cambiano.
 */
export function codiceBase(etichettaFoto: string, numero: number | string): string {
  return `${etichettaFoto}${/\d/.test(etichettaFoto) ? '.' : ''}${numero}`;
}

export function codiceLocaleForma(a: Annotazione, numeri: Map<string, NumeroForma>): string {
  const segno = eSpeculare(a) ? SEGNO_SPECULARE : '';
  const manuale = etichettaManuale(a);
  if (manuale) return manuale + segno;
  const info = numeri.get(a.id);
  if (!info) return '';
  const base = codiceBase(info.etichettaFoto, info.numero);
  return (info.sub ? `${base}.${info.sub}` : base) + segno;
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
  annotazioniDi: (fotoId: string) => Annotazione[],
  /**
   * Il percorso di ogni foto (cartelle, progetto, sezione etichettata). Va
   * passato lo STESSO che usa `numeriProgetto`: le lettere ripartono dentro
   * ogni sezione, e senza il percorso due foto che si chiamano tutte e due «A»
   * — una per piano — finirebbero in un gruppo solo, e spostare una forma al
   * numero 2 la metterebbe in mezzo a quelle di un altro piano.
   */
  percorsoDi: (fotoId: string) => string[] = () => []
): number | null {
  if (!eFormaEtichettabile(a)) return null;
  const ordinate = [...fotoProgetto].sort((x, y) => x.ordine - y.ordine);
  const mia = ordinate.find((f) => f.id === a.fotoId);
  if (!mia) return null;
  const etichette = gruppiDiLettere(fotoProgetto, percorsoDi);
  const chiaveGruppo = (f: Foto) =>
    `${f.progettoId ?? ''}\u0000${percorsoDi(f.id).join(' ')}\u0000${etichette.get(f.id) ?? ''}`;
  const lbl = chiaveGruppo(mia);
  // tutte le forme del gruppo (stesso percorso e stessa etichetta foto),
  // escludendo `a`
  const gruppo: { a: Annotazione; chiave: number }[] = [];
  ordinate.forEach((f, idxFoto) => {
    if (chiaveGruppo(f) !== lbl) return;
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

/**
 * Percorso completo di UNA foto: cartelle + progetto + l'eventuale SEZIONE del
 * progetto (es. Piano 1 → P1) a cui la foto appartiene. La sezione fa ripartire
 * la numerazione dei duplicati, come una cartella.
 */
export function percorsoDellaFoto(
  foto: Pick<Foto, 'sezioneId'>,
  progetto: Pick<Progetto, 'cartellaId' | 'etichetta' | 'sezioni'>,
  cartelle: Cartella[]
): string[] {
  const base = percorsoEtichette(progetto, cartelle);
  const sez = progetto.sezioni?.find((s) => s.id === foto.sezioneId);
  const e = sez?.etichetta?.trim();
  return e ? [...base, e] : base;
}

/** Codice COMPLETO (per il PDF): percorso cartelle + codice locale della forma */
export function codiceCompletoForma(percorso: string[], codiceLocale: string): string {
  return percorso.length > 0 ? `${percorso.join('.')}.${codiceLocale}` : codiceLocale;
}

/**
 * Il codice di un TELO di una forma pannellizzata: «A1.a», «A1.2.b».
 *
 * Minuscola apposta: il sotto-indice numerico distingue le COPIE della stessa
 * forma (A1.2 è la seconda finestra uguale), la lettera minuscola distingue i
 * TELI di quella forma. Chi legge il codice sul telo sa subito qual è, e
 * riconosce a colpo d'occhio le due cose diverse.
 */
export function codicePannello(codiceForma: string, indice: number): string {
  return `${codiceForma}.${letteraDaIndice(indice).toLowerCase()}`;
}
