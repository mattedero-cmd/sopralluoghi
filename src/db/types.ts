/**
 * Modello dati dell'applicazione.
 * Ogni entità "figlia" porta il riferimento esplicito al genitore:
 * Cartella → Progetto → (Foto → Annotazione).
 */

export type ID = string;

export type Unita = 'mm' | 'cm' | 'm';

export type StatoProgetto = 'bozza' | 'in_corso' | 'completato';

export interface Cartella {
  id: ID;
  nome: string;
  /** null = radice; le cartelle sono annidabili */
  parentId: ID | null;
  creataIl: number;
  modificataIl: number;
}

export interface Progetto {
  id: ID;
  /** null = radice dell'archivio */
  cartellaId: ID | null;
  nome: string;
  /** nome cliente denormalizzato (mostrato ovunque, anche senza anagrafica) */
  cliente: string;
  /** collegamento all'anagrafica clienti, opzionale */
  clienteId?: ID | null;
  luogo: string;
  stato: StatoProgetto;
  /** Note generali del progetto, riportate nel PDF */
  note: string;
  creatoIl: number;
  modificatoIl: number;
}

// ---------------------------------------------------------------------------
// Anagrafica clienti e preventivi (Fase 3)
// ---------------------------------------------------------------------------

export interface Cliente {
  id: ID;
  nome: string;
  telefono: string;
  email: string;
  indirizzo: string;
  note: string;
  creatoIl: number;
  modificatoIl: number;
}

export type StatoPreventivo = 'bozza' | 'inviato' | 'accettato' | 'rifiutato';

export interface VocePreventivo {
  id: ID;
  descrizione: string;
  quantita: number;
  /** unità libera: m, m², cm, ore, corpo… */
  unita: string;
  prezzoUnitario: number;
}

export interface Preventivo {
  id: ID;
  /** sopralluogo di riferimento; null se il progetto è stato eliminato */
  progettoId: ID | null;
  clienteId: ID | null;
  /** numero documento, modificabile (es. "2026-003") */
  numero: string;
  data: number;
  stato: StatoPreventivo;
  voci: VocePreventivo[];
  scontoPercento: number;
  ivaPercento: number;
  note: string;
  creatoIl: number;
  modificatoIl: number;
}

export interface Geotag {
  lat: number;
  lng: number;
}

export interface Foto {
  id: ID;
  progettoId: ID;
  /**
   * Immagine originale (mai modificata dopo l'acquisizione).
   * Salvata come ArrayBuffer e non come Blob: su iOS/WebKit i Blob
   * archiviati in IndexedDB possono diventare illeggibili dopo il
   * riavvio dell'app (bug noto del browser).
   */
  origine: ArrayBuffer;
  origineTipo: string;
  /** Miniatura per liste veloci */
  miniatura: ArrayBuffer;
  miniaturaTipo: string;
  /**
   * true se il contenuto è stato perso dal browser (bug WebKit con i
   * Blob delle prime versioni) e la foto non è più recuperabile.
   */
  danneggiata?: boolean;
  larghezzaPx: number;
  altezzaPx: number;
  /** Data di scatto (da EXIF se disponibile), modificabile manualmente */
  dataScatto: number;
  /** Geotag opzionale (da EXIF se disponibile), modificabile manualmente */
  geotag: Geotag | null;
  didascalia: string;
  /**
   * "Note dato": testo strutturato della foto, riportato nel PDF
   * come corpo del testo e raccolto nell'indice.
   */
  noteDato: string;
  /** Calibrazione px↔reale (segmento di lunghezza nota), opzionale */
  scala: { px: number; reale: number; unita: Unita } | null;
  /**
   * Piano di riferimento prospettico (Fase 2): 4 punti di un
   * rettangolo di dimensioni reali note. Permette di calcolare le
   * misure su quel piano tramite omografia anche in foto non frontali.
   */
  piano?: PianoProspettiva | null;
  /** Ordine di presentazione nel progetto e nel PDF */
  ordine: number;
  creataIl: number;
  modificataIl: number;
}

// ---------------------------------------------------------------------------
// Annotazioni vettoriali (non distruttive, sempre rieditabili)
// ---------------------------------------------------------------------------

export interface Punto {
  x: number;
  y: number;
}

export interface Rettangolo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Stile {
  colore: string;
  /** Spessore linea in px immagine */
  spessore: number;
  /** Dimensione testo in px immagine */
  dimensioneTesto: number;
}

export interface PianoProspettiva {
  /** angoli del rettangolo di riferimento nell'immagine, in ordine:
   *  alto-sx, alto-dx, basso-dx, basso-sx */
  punti: [Punto, Punto, Punto, Punto];
  /** dimensioni reali del rettangolo */
  larghezzaReale: number;
  altezzaReale: number;
  unita: Unita;
}

export type TipoAnnotazione =
  | 'quota'
  | 'quotaAngolo'
  | 'quotaRaggio'
  | 'quotaRett'
  | 'quotaPoligono'
  | 'testo'
  | 'disegno'
  | 'freccia'
  | 'callout';

interface AnnotazioneBase {
  id: ID;
  fotoId: ID;
  tipo: TipoAnnotazione;
  zIndex: number;
  stile: Stile;
}

export type SottotipoQuota = 'orizzontale' | 'verticale' | 'allineata';
export type PosizioneTesto = 'sopra' | 'centro' | 'sotto';
export type StatoMisura = 'reale' | 'stimata';

export interface Quota extends AnnotazioneBase {
  tipo: 'quota';
  sottotipo: SottotipoQuota;
  /** Punti misurati sull'immagine (origine delle linee di estensione) */
  p1: Punto;
  p2: Punto;
  /**
   * Distanza (con segno) della linea di quota dai punti misurati,
   * lungo la normale alla direzione della quota.
   */
  offset: number;
  /** Valore numerico della misura (inserito/corretto manualmente) */
  valore: number | null;
  /**
   * true: il valore è calcolato automaticamente dalla calibrazione
   * (scala o piano) e viene ricalcolato quando la geometria cambia.
   * false: valore inserito a mano, mai sovrascritto.
   */
  valoreAuto?: boolean;
  unita: Unita;
  posizioneTesto: PosizioneTesto;
  /** Testo aggiuntivo opzionale, mostrato sotto la misura (es. "luce netta") */
  nota?: string;
  stato: StatoMisura;
}

/** Quota angolare: vertice + due lati, arco di quota, valore in gradi */
export interface QuotaAngolare extends AnnotazioneBase {
  tipo: 'quotaAngolo';
  vertice: Punto;
  a: Punto;
  b: Punto;
  /** raggio dell'arco di quota in px immagine */
  raggioArco: number;
  /** gradi; calcolato dalla geometria, correggibile a mano */
  valore: number | null;
  valoreAuto?: boolean;
  stato: StatoMisura;
}

/**
 * Quota elemento: un solo oggetto che misura base × altezza di un
 * elemento (finestra, porta, pannello). La forma è un QUADRILATERO
 * libero — segue i bordi reali dell'elemento anche quando la
 * prospettiva li inclina — e le linee di quota sono allineate ai lati.
 * Nel report compare come voce unica "Elemento — B × H".
 */
export interface QuotaRettangolo extends AnnotazioneBase {
  tipo: 'quotaRett';
  /** angoli in ordine: alto-sx, alto-dx, basso-dx, basso-sx */
  punti: [Punto, Punto, Punto, Punto];
  /** solo per i record salvati dalla versione 0.4.0 (rettangolo ortogonale) */
  rect?: Rettangolo;
  /**
   * Nomenclatura dell'elemento (es. "1", "2", "A"…): numerata
   * automaticamente, visibile sulla foto e nel report per distinguere
   * le forme quotate l'una dall'altra.
   */
  etichetta?: string;
  valoreBase: number | null;
  valoreAltezza: number | null;
  valoreAuto?: boolean;
  /**
   * Proiezione (offset con segno) della linea di quota di ciascun lato
   * rispetto al lato reale: 0 = la quota giace sul bordo (frecce sui punti
   * di misura, nessuna linea di estensione). Indici: 0=base, 1=lato sx,
   * 2=base inf, 3=lato dx. Si imposta trascinando la maniglia del lato.
   */
  offsetLati?: number[];
  unita: Unita;
  stato: StatoMisura;
}

/** Angoli del quadrilatero, con conversione dei record legacy (rect) */
export function quadrilateroQuotaRett(
  q: Pick<QuotaRettangolo, 'punti' | 'rect'>
): [Punto, Punto, Punto, Punto] {
  if (q.punti) return q.punti;
  const r = q.rect ?? { x: 0, y: 0, width: 1, height: 1 };
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height }
  ];
}

/**
 * Quota elemento poligonale: una figura a N lati (3 = triangolo,
 * 5 = pentagono, ecc.). Generalizza la quota rettangolo ai poligoni
 * con un numero qualsiasi di vertici; ogni lato porta la propria
 * misura. Nel report compare come voce unica con il nome della forma.
 */
/**
 * Un segmento quotato di un poligono: un LATO (vertici adiacenti) oppure una
 * DIAGONALE (vertici non adiacenti, per i rombi). Ogni segmento è
 * modificabile singolarmente, pur restando parte dello stesso poligono.
 */
export interface SegmentoQuota {
  /** indici dei due vertici del poligono che il segmento collega */
  da: number;
  a: number;
  /** valore reale della misura; null = ancora da definire (mostra "?") */
  valore: number | null;
  /** proiezione (offset) della linea di quota; 0 = sul segmento */
  offset?: number;
  /** posizione del testo rispetto alla linea */
  posizioneTesto?: PosizioneTesto;
  /** testo aggiuntivo opzionale */
  nota?: string;
}

/**
 * Quota elemento poligonale: una figura a N vertici, OGGETTO UNICO. I lati
 * (ed eventuali diagonali) quotati sono `segmenti`, ciascuno modificabile da
 * solo. Quanti segmenti sono quotati determina la forma nel report:
 * 4 vertici con 2 quote = rettangolo, con 3 = trapezio, con diagonali = rombo.
 */
export interface QuotaPoligono extends AnnotazioneBase {
  tipo: 'quotaPoligono';
  /** vertici in ordine (almeno 3) */
  punti: Punto[];
  /** segmenti quotati (lati e/o diagonali) */
  segmenti?: SegmentoQuota[];
  /**
   * Nomenclatura dell'elemento (es. "1", "2", "A"…), come per la quota
   * rettangolo: visibile sulla foto e nel report.
   */
  etichetta?: string;
  /** LEGACY (≤0.16): valore per lato; usato solo se `segmenti` è assente */
  lati?: (number | null)[];
  /** LEGACY (≤0.16): proiezione per lato */
  offsetLati?: number[];
  valoreAuto?: boolean;
  unita: Unita;
  stato: StatoMisura;
}

/** Segmenti quotati del poligono, con conversione dei record legacy (lati[]) */
export function segmentiPoligono(q: QuotaPoligono): SegmentoQuota[] {
  if (q.segmenti) return q.segmenti;
  const n = q.punti.length;
  // legacy: un segmento per ciascun lato
  return q.punti.map((_, i) => ({
    da: i,
    a: (i + 1) % n,
    valore: q.lati?.[i] ?? null,
    offset: q.offsetLati?.[i] ?? 0
  }));
}

/** true se il segmento è un lato (vertici adiacenti), false se diagonale */
export function segmentoELato(seg: SegmentoQuota, nVertici: number): boolean {
  const d = Math.abs(seg.da - seg.a);
  return d === 1 || d === nVertici - 1;
}

/** Quota radiale o di diametro: centro + punto sul bordo */
export interface QuotaRaggio extends AnnotazioneBase {
  tipo: 'quotaRaggio';
  centro: Punto;
  bordo: Punto;
  modo: 'raggio' | 'diametro';
  valore: number | null;
  valoreAuto?: boolean;
  unita: Unita;
  stato: StatoMisura;
}

export interface TestoFoto extends AnnotazioneBase {
  tipo: 'testo';
  posizione: Punto;
  testo: string;
}

export interface DisegnoLibero extends AnnotazioneBase {
  tipo: 'disegno';
  /** Coordinate appiattite [x0, y0, x1, y1, ...] */
  punti: number[];
}

export interface Freccia extends AnnotazioneBase {
  tipo: 'freccia';
  p1: Punto;
  p2: Punto;
}

export interface Callout extends AnnotazioneBase {
  tipo: 'callout';
  /** Regione sorgente ritagliata dall'originale */
  sorgente: Rettangolo;
  /** Posizione e dimensione del riquadro-inserto sull'immagine */
  inserto: Rettangolo;
  /** Etichetta (es. "A"); la numerazione è assegnata automaticamente */
  etichetta: string;
}

export type Annotazione =
  | Quota
  | QuotaAngolare
  | QuotaRaggio
  | QuotaRettangolo
  | QuotaPoligono
  | TestoFoto
  | DisegnoLibero
  | Freccia
  | Callout;

// ---------------------------------------------------------------------------
// Impostazioni utente (dati professionali per il PDF + preferenze editor)
// ---------------------------------------------------------------------------

export interface Impostazioni {
  /** chiave fissa: 'app' */
  id: string;
  professionista: {
    nome: string;
    azienda: string;
    telefono: string;
    email: string;
    indirizzo: string;
  };
  /** Soglia di auto-aggancio catene/snapping, in px immagine */
  sogliaSnap: number;
  /** Unità di misura predefinita per le nuove quote */
  unitaDefault: Unita;
  /** Moltiplicatore della dimensione di quote e testi (leggibilità) */
  fattoreDimensione: number;
  stileDefault: Stile;
  /** Lato massimo delle foto archiviate, in px (qualità vs spazio) */
  fotoLatoMax: number;
  /** IVA predefinita per i nuovi preventivi */
  ivaDefault: number;
  /** Personalizzazione del report PDF */
  pdf: {
    /** colore di intestazioni e titoli */
    colore: string;
    /** testo personalizzato del piè di pagina (vuoto = nome azienda) */
    pieDiPagina: string;
    mostraGeotag: boolean;
    mostraDataScatto: boolean;
  };
  /** Configurazione del backup cloud (Supabase), opzionale */
  cloud?: ConfigCloud | null;
}

export interface ConfigCloud {
  /** URL del progetto Supabase, es. https://xyz.supabase.co */
  url: string;
  /** chiave anon (public) del progetto */
  anonKey: string;
  email: string;
  /** token di sessione persistito dopo l'accesso */
  refreshToken: string | null;
  userId: string | null;
  /** ultimo backup riuscito (timestamp), per lo stato sempre visibile */
  ultimoBackup: number | null;
}

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  id: 'app',
  professionista: { nome: '', azienda: '', telefono: '', email: '', indirizzo: '' },
  sogliaSnap: 24,
  unitaDefault: 'cm',
  fattoreDimensione: 1,
  stileDefault: { colore: '#ff3b30', spessore: 3, dimensioneTesto: 28 },
  fotoLatoMax: 2560,
  ivaDefault: 22,
  pdf: { colore: '#1a4f8b', pieDiPagina: '', mostraGeotag: true, mostraDataScatto: true }
};

/** Colori convenzionali per la distinzione reale/stimata in tutta l'app */
export const COLORE_REALE = '#ff3b30';
export const COLORE_STIMATA = '#ff9500';

/**
 * Colore grafico UNICO delle quote (stile tecnico professionale, giallo
 * ad alta visibilità). Tutte le quote — manuali o automatiche — usano
 * questo stile: l'aspetto non dipende dal modo di creazione.
 */
export const COLORE_QUOTA = '#ffc400';
