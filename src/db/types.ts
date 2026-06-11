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
  cliente: string;
  luogo: string;
  stato: StatoProgetto;
  /** Note generali del progetto, riportate nel PDF */
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
  /** Calibrazione px↔reale opzionale (predisposta per la Fase 2) */
  scala: { px: number; reale: number; unita: Unita } | null;
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

export type TipoAnnotazione =
  | 'quota'
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
  unita: Unita;
  posizioneTesto: PosizioneTesto;
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

export type Annotazione = Quota | TestoFoto | DisegnoLibero | Freccia | Callout;

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
}

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  id: 'app',
  professionista: { nome: '', azienda: '', telefono: '', email: '', indirizzo: '' },
  sogliaSnap: 24,
  unitaDefault: 'cm',
  fattoreDimensione: 1,
  stileDefault: { colore: '#ff3b30', spessore: 3, dimensioneTesto: 28 }
};

/** Colori convenzionali per la distinzione reale/stimata in tutta l'app */
export const COLORE_REALE = '#ff3b30';
export const COLORE_STIMATA = '#ff9500';
