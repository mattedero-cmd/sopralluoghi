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
  /**
   * Etichetta breve per la nomenclatura strutturata delle forme (es. "E1",
   * "P1", "S1"). Concatenata col percorso nel codice di ogni forma del PDF.
   */
  etichetta?: string;
  /** Note/descrizione della cartella: nel PDF diventano il sottotitolo del capitolo */
  note?: string;
  creataIl: number;
  modificataIl: number;
}

/**
 * Sezione interna a un progetto (es. "Piano 1", "Piano 2"): raggruppa le foto
 * dentro lo stesso progetto. La sua `etichetta` (es. P1) entra nella
 * nomenclatura come una cartella e fa RIPARTIRE la numerazione dei duplicati.
 */
export interface Sezione {
  id: ID;
  nome: string;
  /** etichetta breve per la nomenclatura (es. P1), come per cartelle/progetto */
  etichetta?: string;
  ordine: number;
}

export interface Progetto {
  id: ID;
  /** null = radice dell'archivio */
  cartellaId: ID | null;
  /** Etichetta breve per la nomenclatura strutturata (come per le cartelle) */
  etichetta?: string;
  /** Sezioni interne (piani/aree): raggruppano le foto del progetto */
  sezioni?: Sezione[];
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
  /** dati fiscali, utili per preventivi/fatture */
  partitaIva?: string;
  codiceFiscale?: string;
  /** PEC o codice destinatario (SDI) per la fatturazione elettronica */
  pec?: string;
  sdi?: string;
  note: string;
  creatoIl: number;
  modificatoIl: number;
}

export type StatoPreventivo =
  | 'bozza'
  | 'pronto'
  | 'inviato'
  | 'accettato'
  | 'rifiutato'
  | 'annullato'
  | 'lavoro';

/** Regime fiscale dell'utente: determina la struttura del preventivo e del PDF */
export type RegimeFiscale = 'forfettario' | 'semplificato' | 'ordinario';

export interface VocePreventivo {
  id: ID;
  descrizione: string;
  quantita: number;
  /** unità libera: pz, m, m², ora, giornata, corpo, forfait… */
  unita: string;
  prezzoUnitario: number;
  /** aliquota IVA della voce (%) — solo regimi con IVA; assente = aliquota documento */
  aliquotaIva?: number;
  /** sconto sulla singola voce (%) */
  scontoPercento?: number;
  /** categoria di lavoro (es. "Pellicole", "Pulizie") */
  categoria?: string;
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
  /** regime fiscale del documento (istantanea dalle impostazioni alla creazione) */
  regime?: RegimeFiscale;
  voci: VocePreventivo[];
  /** sconto generale sul documento (%) */
  scontoPercento: number;
  /** aliquota IVA predefinita del documento (%) — regimi con IVA */
  ivaPercento: number;
  /** cassa/contributo previdenziale o rivalsa (%) e attivazione */
  cassaAttiva?: boolean;
  cassaPercento?: number;
  /** ritenuta d'acconto (%) e attivazione */
  ritenutaAttiva?: boolean;
  ritenutaPercento?: number;
  /** marca da bollo: attivazione e importo (€) */
  bolloAttiva?: boolean;
  bolloImporto?: number;
  /** coefficiente di redditività (%) — solo forfettario, uso interno/indicativo */
  coefficiente?: number;
  /** dicitura fiscale stampata nel PDF (es. testo forfettario) */
  dicituraFiscale?: string;
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
  /** Sezione del progetto a cui appartiene la foto (es. Piano 1); assente = nessuna */
  sezioneId?: ID;
  /**
   * Etichetta della foto per la nomenclatura (es. "A"): se assente si usa la
   * lettera automatica ricavata dall'ordine. Due foto con la stessa etichetta
   * nello stesso progetto CONDIVIDONO la sequenza numerica delle forme.
   */
  etichetta?: string;
  /**
   * Se valorizzato, questa foto è un DETTAGLIO collegato a un'etichetta di
   * un'altra foto del progetto (la foto principale). Resta una foto autonoma,
   * modificabile come tutte le altre, ma nasce marcata e nel PDF compare subito
   * dopo la foto principale, raggruppata sotto la sua etichetta.
   */
  dettaglioDi?: DettaglioEtichetta;
  /**
   * true se questa "foto" è in realtà una PIANTA stanza (§12): tela su cui si
   * disegna lo schizzo della stanza. Riusa interamente l'editor, le quote,
   * l'area e l'export PDF; cambia solo l'elenco e (di default) lo sfondo.
   */
  ePianta?: boolean;
  /**
   * Pianta tracciata su una foto reale: se true lo sfondo (la foto) è
   * nascosto e si vede solo lo schizzo su bianco. Si può mostrare/nascondere
   * a piacere dopo aver tracciato la geometria.
   */
  sfondoNascosto?: boolean;
  /**
   * PRIVACY (§volti): regioni della foto da oscurare (volti rilevati
   * automaticamente all'importazione e riquadri aggiunti a mano). Le
   * coordinate sono in PIXEL DELL'ORIGINALE, come le annotazioni.
   * L'originale non viene mai alterato: la censura si applica al momento
   * del disegno (editor, miniatura, PDF, immagine condivisa, export foto).
   */
  censure?: RegioneCensura[];
  /** true quando il rilevamento automatico dei volti è già stato eseguito */
  voltiCercati?: boolean;
  creataIl: number;
  modificataIl: number;
}

/**
 * Regione oscurata di una foto (volto o area sensibile). In pixel
 * dell'immagine originale, come le annotazioni.
 */
export interface RegioneCensura {
  id: ID;
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
  /** true = trovata dal rilevamento automatico dei volti */
  auto?: boolean;
}

/** Collegamento di una foto di dettaglio all'etichetta di origine. */
export interface DettaglioEtichetta {
  /** foto principale che contiene l'etichetta */
  fotoId: ID;
  /** id dell'etichetta di origine */
  etichettaId: ID;
  /** lettera/numero dell'etichetta, per il badge e il PDF */
  lettera: string;
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
  /** suddivisioni della griglia di verifica (1 = solo il riferimento) */
  celle?: number;
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
  | 'callout'
  | 'etichetta'
  | 'legenda'
  | 'forma'
  | 'quotaTecnica';

interface AnnotazioneBase {
  id: ID;
  fotoId: ID;
  tipo: TipoAnnotazione;
  zIndex: number;
  /**
   * Istante di creazione (ms). Dà l'ordine REALE di creazione degli elementi,
   * anche tra foto diverse: serve alla numerazione automatica delle forme.
   */
  creatoIl?: number;
  /**
   * Chiave d'ordine per la numerazione automatica, modificabile a mano:
   * cambiando il numero di una forma la si sposta nella sequenza e le altre
   * si rinumerano da sole. Se assente vale `creatoIl`.
   */
  ordine?: number;
  /**
   * Elementi RIPETUTI: le forme con lo stesso `gruppoQuota` sono copie della
   * stessa misura (es. cinque vetrine uguali). Nel codice diventano A1.1, A1.2…
   * e nel report/distinta contano come un solo elemento con quantità.
   */
  gruppoQuota?: string;
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
  /**
   * Scorrimento del testo LUNGO la linea di quota, in px immagine con segno
   * (0 = al centro). Si imposta trascinando la maniglia della quota.
   */
  scorrTesto?: number;
  /** Testo aggiuntivo opzionale, mostrato sotto la misura (es. "luce netta") */
  nota?: string;
  /**
   * Abbondanze (extra da aggiungere per il taglio/produzione), applicate ai
   * due estremi della quota: `abbInizio` al punto p1, `abbFine` al punto p2.
   * La misura da tagliare = valore + abbInizio + abbFine.
   */
  abbInizio?: number;
  abbFine?: number;
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
  /** Testo aggiuntivo opzionale, mostrato accanto alla misura */
  nota?: string;
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
  /**
   * Nome geometrico della quota (es. "B" base maggiore, "b" base minore,
   * "H"/"h" altezza, "C"/"c" cateto, "ip" ipotenusa, "D" diagonale…). Se
   * assente viene dedotto automaticamente dalla forma.
   */
  simbolo?: string;
  /** proiezione (offset) della linea di quota; 0 = sul segmento */
  offset?: number;
  /** posizione del testo rispetto alla linea */
  posizioneTesto?: PosizioneTesto;
  /**
   * Scorrimento del testo LUNGO la linea di quota, in px immagine con segno
   * (0 = al centro). Utile per le diagonali, che altrimenti si accavallano
   * tutte nel punto d'incrocio.
   */
  scorrTesto?: number;
  /** testo aggiuntivo opzionale */
  nota?: string;
  /** abbondanze ai due estremi (al vertice `da` e al vertice `a`) */
  abbInizio?: number;
  abbFine?: number;
  /**
   * PIANTE PARAMETRICHE (§12): blocca la lunghezza reale di questo lato nel
   * solver di chiusura. Quando si modifica un'altra quota, un lato bloccato
   * non si adatta: l'aggiustamento ricade sui lati liberi. Assente = libero.
   */
  bloccato?: boolean;
  /**
   * PIANTE PARAMETRICHE (§12): ancoraggio del lato/estremi nel solver. Fissa
   * un punto invariante attorno a cui la figura si riadatta:
   * - 'vertice-da'/'vertice-a': il vertice indicato non si muove;
   * - 'centro': il centro del lato resta fermo (crescita simmetrica);
   * - 'lato': l'intero lato resta rigido (posizione + lunghezza).
   */
  ancora?: AncoraSegmento;
  /**
   * MENU SCHIZZO (Fase 2, §13): quota di RIFERIMENTO. Se true la quota misura
   * soltanto (valore aggiornato dalla geometria) e NON comanda il disegno: il
   * solver la ignora. false/assente = quota parametrica (driving).
   */
  riferimento?: boolean;
  /**
   * MENU SCHIZZO (Fase 3): quota inserita a mano (driving FISSA). Una volta
   * impostata non si modifica da sola quando si cambiano altre quote: solo i
   * lati AUTO (derivati) si adattano. Assente/false = valore derivato.
   */
  manuale?: boolean;
}

/** Tipo di ancoraggio di un lato nel solver parametrico delle piante (§12). */
export type AncoraSegmento = 'vertice-da' | 'vertice-a' | 'centro' | 'lato';

/** Abbondanza totale di un segmento/quota (somma dei due estremi) */
export function abbondanzaTotale(s: { abbInizio?: number; abbFine?: number }): number {
  return (s.abbInizio ?? 0) + (s.abbFine ?? 0);
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
  /** spostamento della nomenclatura (badge) rispetto al baricentro, in px */
  etichettaOffset?: Punto;
  /**
   * Copia "solo etichetta" di un elemento ripetuto: sulla foto mostra unicamente
   * il codice (A1.2, A1.3…) nel punto toccato, senza ridisegnare il contorno né
   * le quote. La misura resta quella dell'originale della famiglia.
   */
  soloEtichetta?: boolean;
  /** LEGACY (≤0.16): valore per lato; usato solo se `segmenti` è assente */
  lati?: (number | null)[];
  /** LEGACY (≤0.16): proiezione per lato */
  offsetLati?: number[];
  valoreAuto?: boolean;
  unita: Unita;
  stato: StatoMisura;
  /**
   * PIANTE (§12): passo di snap angolare (gradi, es. 30/45/90) usato quando si
   * raddrizza lo schizzo di questa pianta. Assente = nessuno snap angolare.
   */
  snapAngolo?: number;
  /** MENU SCHIZZO (Fase 3): vincoli geometrici dello schizzo parametrico */
  vincoli?: VincoloPianta[];
  /** MENU SCHIZZO (Fase 4): oggetti dello schizzo */
  oggetti?: OggettoPianta[];
  /**
   * MENU SCHIZZO (Fase 4): indice del vertice ORIGINE (datum). È il punto
   * fisso — tipicamente in basso a sinistra — da cui si propagano le misure:
   * resta fermo durante le modifiche e le distanze degli oggetti vi si
   * riferiscono. Assente = nessuna origine impostata.
   */
  origine?: number;
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

// ---------------------------------------------------------------------------
// MENU SCHIZZO — schizzo parametrico (§CAD). Struttura dati additiva e
// retro-compatibile (nessun bump del DB): il perimetro resta un QuotaPoligono
// (punti = vertici, segmenti = lati/quote, ancora/bloccato = vincoli sui lati,
// snapAngolo = angoli agganciati). Qui si dichiarano le estensioni per i
// VINCOLI geometrici generali (Fase 3) e gli OGGETTI interni (Fase 4).
// ---------------------------------------------------------------------------

/** Tipo di entità selezionabile in uno schizzo. */
export type EntitaPianta =
  | 'vertice'
  | 'lato'
  | 'centroLato'
  | 'oggetto'
  | 'centroOggetto'
  | 'bordoOggetto'
  | 'asseOrizzOggetto'
  | 'asseVertOggetto';

/** Riferimento a un elemento dello schizzo (perimetro o oggetto interno). */
export interface RiferimentoPianta {
  entita: EntitaPianta;
  /** id dell'oggetto interno; assente = elemento del perimetro */
  oggettoId?: string;
  /** indice del vertice o del lato (nel perimetro o nell'oggetto) */
  indice?: number;
}

/** Vincoli geometrici dello schizzo parametrico (Fase 3). */
export type TipoVincoloPianta =
  | 'orizzontale'
  | 'verticale'
  | 'parallelo'
  | 'perpendicolare'
  | 'collineare'
  | 'coincidente'
  | 'puntoMedio'
  | 'simmetrico'
  | 'ugualeLunghezza'
  | 'ugualeRaggio'
  | 'tangente'
  | 'concentrico'
  | 'fisso'
  | 'distanza'
  | 'angolo';

export interface VincoloPianta {
  id: string;
  tipo: TipoVincoloPianta;
  /** elementi coinvolti (2+ per i vincoli multi-elemento) */
  riferimenti: RiferimentoPianta[];
  /** valore per i vincoli dimensionali (distanza/angolo) */
  valore?: number;
  /** true = quota di riferimento (misura soltanto, non comanda la geometria) */
  riferimento?: boolean;
}

/** Oggetto interno alla pianta (Fase 4): rettangolo o cerchio, in coordinate px. */
export interface OggettoPianta {
  id: string;
  tipo: 'rettangolo' | 'cerchio';
  /** riferimento in PX: angolo in BASSO-SINISTRA del rettangolo, o CENTRO del cerchio */
  x: number;
  y: number;
  /** rettangolo: larghezza e altezza in PX */
  larghezza?: number;
  altezza?: number;
  /** cerchio: raggio in PX */
  raggioPx?: number;
  etichetta?: string;
  /** ANCORE dell'oggetto (schizzo parametrico): governano che cosa si muove
   *  quando si modifica una quota di distanza oggetto–lato. */
  /** il centro è ancorato: non si sposta (si muove la circonferenza o il lato) */
  centroAncorato?: boolean;
  /** la dimensione è bloccata (raggio/diametro o larghezza×altezza) */
  dimensioneBloccata?: boolean;
}

/** Stato di vincolatura dello schizzo (§9): usato per l'indicatore visivo. */
export type StatoSchizzoPianta =
  | 'nonVincolato'
  | 'parziale'
  | 'completo'
  | 'sovravincolato';

/** Quota radiale o di diametro: centro + punto sul bordo */
export interface QuotaRaggio extends AnnotazioneBase {
  tipo: 'quotaRaggio';
  centro: Punto;
  bordo: Punto;
  modo: 'raggio' | 'diametro';
  valore: number | null;
  valoreAuto?: boolean;
  unita: Unita;
  /** Testo aggiuntivo opzionale, mostrato sotto la misura */
  nota?: string;
  /**
   * Abbondanza (extra per il taglio) applicata tutt'intorno: si somma al
   * raggio, quindi il diametro da tagliare = diametro + 2·margine.
   */
  margine?: number;
  stato: StatoMisura;
}

export interface TestoFoto extends AnnotazioneBase {
  tipo: 'testo';
  /** posizione del riquadro di testo (centro) */
  posizione: Punto;
  testo: string;
  /**
   * Punto segnalato sulla foto: se presente, dal riquadro parte una freccia
   * che punta qui (nota con richiamo / balloon). Assente = testo semplice.
   */
  ancora?: Punto;
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
  /**
   * Foto scattata a parte da mostrare nell'inserto al posto dell'ingrandimento
   * del ritaglio. Se assente, l'inserto mostra la regione `sorgente` ingrandita.
   * Bytes JPEG (ArrayBuffer, come per le foto, per evitare il bug Blob di iOS).
   */
  fotoDettaglio?: ArrayBuffer;
}

/**
 * Etichetta alfabetica (A, B, C…) posata con un tap nella modalità Note.
 * La descrizione associata è mostrata nella legenda della foto. Le lettere
 * sono uniche all'interno della singola foto.
 */
export interface Etichetta extends AnnotazioneBase {
  tipo: 'etichetta';
  posizione: Punto;
  /** lettera (o, in futuro, numero) mostrata nel badge */
  lettera: string;
  /** descrizione associata, compilata nell'ambiente della legenda */
  descrizione?: string;
}

/**
 * Legenda della foto: ne esiste UNA SOLA per foto. Le righe (lettera =
 * descrizione) sono DERIVATE dalle etichette presenti, sempre in ordine
 * alfabetico, così aggiungere/togliere etichette aggiorna la legenda da sé.
 * È un riquadro spostabile/ridimensionabile con riflusso del contenuto a una
 * o più colonne; nel PDF non viene disegnata sulla foto ma trascritta come
 * elenco separato.
 */
export interface Legenda extends AnnotazioneBase {
  tipo: 'legenda';
  /** angolo alto-sinistro del riquadro, in px immagine */
  posizione: Punto;
  larghezza: number;
  altezza: number;
  /** moltiplicatore globale di testo e badge interni (dimensione testo globale) */
  scalaTesto?: number;
  /** forma del riquadro */
  forma?: 'rettangolo' | 'arrotondato';
}

// ---------------------------------------------------------------------------
// Quotatura TECNICA (modalità professionale, additiva). Modello: ogni quotatura
// tecnica è UNA sola annotazione contenitore (resta fuori da catene/snap/
// numerazione base, che filtrano su tipo==='quota'). Forme = disegno generico.
// ---------------------------------------------------------------------------

/** Forma di disegno/annotazione libera (menu generico). */
export type TipoForma = 'linea' | 'rettangolo' | 'cerchio' | 'poligono' | 'manoLibera';

export interface Forma extends AnnotazioneBase {
  tipo: 'forma';
  forma: TipoForma;
  /** linea/poligono/manoLibera: vertici; rettangolo: 2 angoli opposti;
   *  cerchio: [centro, puntoSulRaggio] */
  punti: Punto[];
  chiusa: boolean;
  /** riempimento (assente = nessuno) e sua opacità */
  riempimento?: string;
  opacitaRiempimento?: number;
  /** pattern tratteggio (assente = tratto continuo) */
  tratteggio?: number[];
  etichetta?: string;
  /** true ⇒ misura strutturata → entra nel riepilogo PDF */
  partePerimetro: boolean;
}

export type SottotipoQuotaTecnica =
  | 'serie'
  | 'parallelo'
  | 'progressiva'
  | 'foro'
  | 'smusso'
  | 'filettatura'
  | 'datum';

export type VersoQuota = 'sinistra' | 'destra' | 'inizioGuida' | 'fineGuida';

export type RiferimentoTipo =
  | 'bordoSinistro'
  | 'bordoDestro'
  | 'baseInferiore'
  | 'bordoSuperiore'
  | 'asseCentrale'
  | 'puntoZero'
  | 'lineaGuida'
  | 'riferimentoPrecedente';

export interface RiferimentoTecnico {
  riferimentoTipo: RiferimentoTipo;
  /** puntoZero: 1 punto; assi/linee: 2 punti */
  punti: Punto[];
}

export interface LineaEstensione {
  daPunto: Punto; // punto reale sulla foto
  aPunto: Punto; // arrivo sulla linea di quota
  gapOggetto: number; // distacco dall'oggetto (px)
  sporgenza: number; // sporgenza oltre la linea di quota (px)
  visibile: boolean;
}

export interface QuotaSingolaTecnica {
  p1: Punto;
  p2: Punto;
  /** valore REALE via omografia; null finché non calcolabile */
  valore: number | null;
  orientamento: 'allineata' | 'orizzontale' | 'verticale';
  /** distanza della linea di quota dalla guida (px, segno = lato) */
  offset: number;
  etichetta?: string;
  estensioni?: LineaEstensione[];
}

export interface ForoTecnico {
  centro: Punto;
  raggioPx: number;
  raggioReale: number | null;
  diametroReale: number | null;
  modo: 'diametro' | 'raggio';
  etichetta?: string;
}

export interface SmussoTecnico {
  a: Punto;
  b: Punto;
  catetoReale: number | null;
  angoloGradi: number | null;
  modo: 'C' | 'lunghezzaAngolo';
  designazione: string; // es. "C2" oppure "3 × 30°"
  leader?: { da: Punto; a: Punto };
}

export interface FilettaturaTecnica {
  filettatura: 'interna' | 'esterna';
  ancora: Punto;
  diametroNominale: number;
  passo?: number;
  classeTolleranza?: string;
  lunghezza?: number;
  designazione: string; // es. "M8 × 1.25 - 6H"
  leader?: { da: Punto; a: Punto };
}

/**
 * Quotatura tecnica: un solo tipo con discriminante `sottotipo`. Contiene al
 * suo interno guida, riferimento, punti e le quote generate.
 */
export interface QuotaTecnica extends AnnotazioneBase {
  tipo: 'quotaTecnica';
  sottotipo: SottotipoQuotaTecnica;
  lineaGuida?: { a: Punto; b: Punto };
  riferimento?: RiferimentoTecnico;
  verso: VersoQuota;
  /** unità delle misure di tutte le quote del gruppo */
  unita: Unita;
  /** valori derivati dalla calibrazione (false = qualche valore è manuale) */
  valoreAuto?: boolean;
  /** passo di impilamento delle linee di quota (parallelo), in px immagine */
  passo?: number;
  /** estremo della guida usato come origine/zero (parallelo/progressiva) */
  origineEstremo?: 'inizio' | 'fine';
  /** etichetta/lettera (es. datum "A", o nota della catena) */
  etichetta?: string;
  /** terminatore della linea di quota: freccia (default) o tacca obliqua */
  terminatore?: 'freccia' | 'tacca';
  /** serie: mostra il TOTALE della catena sul disegno e nel riepilogo PDF */
  mostraTotale?: boolean;
  /** linee di estensione visibili (default true) */
  estensioniVisibili?: boolean;
  /** distacco delle estensioni dall'oggetto (px); assente = default dallo spessore */
  gapEstensione?: number;
  /** sporgenza delle estensioni oltre la linea di quota (px); assente = default */
  sporgenzaEstensione?: number;
  /** tap dell'utente (punti reali) */
  puntiOriginali: Punto[];
  /** quote generate (rieditabili) — serie/parallelo/progressiva */
  quote: QuotaSingolaTecnica[];
  foro?: ForoTecnico; // sottotipo 'foro'
  smusso?: SmussoTecnico; // sottotipo 'smusso'
  filettatura?: FilettaturaTecnica; // sottotipo 'filettatura'
  /** true ⇒ misura strutturata → entra nel riepilogo PDF */
  partePerimetro: boolean;
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
  | Callout
  | Etichetta
  | Legenda
  | Forma
  | QuotaTecnica;

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
  /**
   * PRIVACY: cerca automaticamente i volti nelle foto importate e li oscura
   * (nell'editor, nelle miniature, nel PDF e nelle immagini condivise).
   * L'originale archiviato resta intatto: le regioni si possono sempre
   * togliere o aggiungere a mano.
   */
  censuraVoltiAuto: boolean;
  /**
   * PRIVACY (più severa): oscura i volti DIRETTAMENTE nei pixel archiviati,
   * già all'importazione. Il volto non resta sul dispositivo e non finisce
   * in backup o sincronizzazione, ma l'operazione è irreversibile e non
   * lascia nulla da rivedere. Con l'interruttore spento (predefinito) la
   * foto originale è conservata e l'oscuramento resta correggibile.
   */
  censuraVoltiPermanente?: boolean;
  /** IVA predefinita per i nuovi preventivi (LEGACY; vedi `fiscale.ivaDefault`) */
  ivaDefault: number;
  /** Impostazioni fiscali per i preventivi (regime, IVA, ritenuta, cassa, bollo) */
  fiscale: Fiscale;
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
  /**
   * Quando le impostazioni (esclusa la sessione cloud) sono state modificate
   * dall'utente l'ultima volta. Serve alla sincronizzazione per applicare le
   * impostazioni remote solo se più recenti, senza sovrascrivere modifiche
   * locali non ancora sincronizzate.
   */
  modificatoIl?: number;
}

/** Configurazione fiscale dell'utente, usata per costruire i preventivi */
export interface Fiscale {
  regime: RegimeFiscale;
  /** aliquota IVA predefinita (%) per semplificato/ordinario */
  ivaDefault: number;
  /** ritenuta d'acconto: valore (%) e se attiva di default sui nuovi documenti */
  ritenutaPercento: number;
  ritenutaAttiva: boolean;
  /** cassa previdenziale / rivalsa: valore (%) e attivazione di default */
  cassaPercento: number;
  cassaAttiva: boolean;
  /** se la cassa concorre alla base imponibile IVA (di norma sì) */
  cassaInImponibileIva: boolean;
  /** marca da bollo: importo (€) e soglia (€) oltre cui va applicata */
  bolloImporto: number;
  bolloSoglia: number;
  /** coefficiente di redditività (%) per il forfettario (uso indicativo) */
  coefficienteForfettario: number;
  /** dicitura fiscale stampata nel PDF forfettario (modificabile) */
  dicituraForfettario: string;
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
  /** ultima sincronizzazione riuscita (timestamp) */
  ultimaSync?: number | null;
}

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  id: 'app',
  professionista: { nome: '', azienda: '', telefono: '', email: '', indirizzo: '' },
  sogliaSnap: 24,
  unitaDefault: 'cm',
  fattoreDimensione: 1,
  stileDefault: { colore: '#ff3b30', spessore: 3, dimensioneTesto: 28 },
  fotoLatoMax: 2560,
  censuraVoltiAuto: true,
  ivaDefault: 22,
  fiscale: {
    regime: 'forfettario',
    ivaDefault: 22,
    ritenutaPercento: 20,
    ritenutaAttiva: false,
    cassaPercento: 4,
    cassaAttiva: false,
    cassaInImponibileIva: true,
    bolloImporto: 2,
    bolloSoglia: 77.47,
    coefficienteForfettario: 67,
    dicituraForfettario:
      'Operazione effettuata ai sensi dell’art. 1, commi 54-89, L. 190/2014 - regime forfettario. Importo non soggetto a ritenuta d’acconto.'
  },
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

/** Colore dedicato alla QUOTATURA TECNICA, distinto dal giallo delle quote base. */
export const COLORE_QUOTA_TECNICA = '#00A896';

/**
 * Lavoro di nesting salvato in archivio.
 *
 * Il documento (materiali, pezzi, parametri) viaggia come struttura opaca:
 * la sua forma e le migrazioni stanno in utils/documentoNesting.ts, così il
 * database non deve sapere nulla dell'ottimizzazione del taglio.
 */
export interface LavoroNesting {
  id: ID;
  nome: string;
  /** cartella dell'archivio in cui vive il lavoro (null = radice) */
  cartellaId: ID | null;
  creatoIl: number;
  modificatoIl: number;
  /** DocumentoNesting serializzabile */
  documento: unknown;
  /**
   * PDF del piano di taglio salvato insieme al lavoro: si apre con un tocco
   * dall'archivio, senza rigenerarlo. Viene riscritto a ogni modifica; se
   * l'app si chiude prima, `pdfIl` resta indietro rispetto a `modificatoIl` e
   * il PDF viene rifatto la prima volta che serve.
   */
  pdf?: Blob;
  pdfIl?: number;
}
