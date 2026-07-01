import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  Annotazione,
  Callout,
  Etichetta,
  Foto,
  Impostazioni,
  PosizioneTesto,
  Punto,
  Quota,
  QuotaAngolare,
  QuotaPoligono,
  QuotaRaggio,
  QuotaRettangolo,
  Rettangolo,
  SegmentoQuota,
  SottotipoQuota,
  StatoMisura,
  TestoFoto,
  TipoForma,
  TipoVincoloPianta,
  Unita,
  VincoloPianta
} from '../db/types';
import {
  COLORE_QUOTA,
  IMPOSTAZIONI_DEFAULT,
  quadrilateroQuotaRett,
  segmentiPoligono,
  segmentoELato
} from '../db/types';
import { aggiornaFoto, aggiungiFoto, eliminaFoto, impostaSfondoPianta, leggiImpostazioni, salvaAnnotazione, salvaAnnotazioniFoto } from '../db/repository';
import { blobOrigine, caricaImmagine, fotoIllegibile, importaFoto } from '../utils/image';
import { caricaDettaglio } from '../utils/immaginiCallout';
import { naviga } from '../router';
import { ConfermaDialog, ImmagineBlob, Modale, StatoApp, type RichiestaConferma } from '../components/comuni';
import { mostraToast } from '../state/toast';
import { StageEditor, type ModalitaVincolo, type Strumento } from './StageEditor';
import { FabbricaAnnotazioni } from './fabbrica';
import { MenuCircolareEtichette } from './MenuCircolareEtichette';
import { AmbienteLegenda } from './AmbienteLegenda';
import { ModificaEtichetta } from './ModificaEtichetta';
import { AmbienteQuotaturaTecnica } from './AmbienteQuotaturaTecnica';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import {
  angoloGradi,
  applicaValoriAuto,
  areaReale,
  arrotondaMisura,
  haCalibrazione,
  misuraSegmento,
  misureRettangolo,
  valoreAutomatico
} from '../geometry/calibrazione';
import { etichettaPoligono, nomeFormaPoligono, simboliPoligono, versiSegmento } from '../geometry/primitive';
import { ricalcolaTecniche } from '../geometry/quotaTecnica';
import { raddrizzaStanza, ricostruisciOrtogonale } from '../geometry/schizzo';
import {
  eliminaLatoRichiudi,
  fondiCollineari,
  risolviParametrico,
  risolviPianta,
  snapAngoliPoligono,
  statoSchizzo
} from '../geometry/parametrico';
import type { AncoraSegmento } from '../db/types';
import {
  codiceCompletoForma,
  codiceLocaleForma,
  famigliaDi,
  numeriProgetto,
  ordinePerNumero,
  percorsoDellaFoto,
  prossimaLetteraLibera,
  vociLegenda
} from '../geometry/nomenclatura';
import { applicaOmografia, omografiaPiano, omografiaPianoInversa } from '../geometry/omografia';
import { lunghezzaPxQuota } from '../geometry/punti';
import { RicercaBordi } from '../geometry/bordi';
import { rilevaQuad4, type EsitoQuad4 } from '../geometry/quad4';
import { distanza } from '../geometry/punti';
import {
  aInputDataOra,
  analizzaMisura,
  daInputDataOra,
  daMillimetri,
  formattaNumero,
  inMillimetri
} from '../utils/format';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { nuovoId } from '../utils/id';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { avviaDettatura, dettaturaDisponibile } from '../utils/dettatura';
import { Icona, type NomeIcona } from '../components/Icona';

const COLORI = [COLORE_QUOTA, '#ff3b30', '#34c759', '#007aff', '#ffffff', '#111111'];

/** Formati standard di riferimento (mm). Niente varianti di orientamento: lato
 *  lungo e corto vengono assegnati automaticamente in base a come appare. */
const FORMATI: Array<{ id: string; nome: string; lungo: number; corto: number }> = [
  { id: 'A4', nome: 'A4', lungo: 297, corto: 210 },
  { id: 'A5', nome: 'A5', lungo: 210, corto: 148 },
  { id: 'A3', nome: 'A3', lungo: 420, corto: 297 },
  { id: 'bancomat', nome: 'Bancomat', lungo: 85.6, corto: 54 }
];

/** assegna lato lungo/corto a larghezza(L, lato alto)/altezza in base
 *  all'orientamento apparente del rettangolo rilevato */
function orientaFormato(
  quad: [Punto, Punto, Punto, Punto],
  f: { lungo: number; corto: number }
): { L: number; A: number } {
  const topPx = distanza(quad[0], quad[1]);
  const leftPx = distanza(quad[0], quad[3]);
  return topPx >= leftPx ? { L: f.lungo, A: f.corto } : { L: f.corto, A: f.lungo };
}

/** Superficie in m² con più decimali per le aree piccole */
function formattaAreaM2(v: number): string {
  const t = v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4);
  return `${t.replace('.', ',')} m²`;
}

/**
 * Pixel per una unità reale (`unita`), per il solver parametrico delle piante.
 * Vale solo con scala LINEARE (niente piano prospettico, che è non lineare).
 * Restituisce null se la pianta non è calibrata linearmente.
 */
function pxPerUnita(foto: Foto, unita: Unita): number | null {
  if (foto.piano || !foto.scala || foto.scala.px <= 0) return null;
  const mmScala = inMillimetri(foto.scala.reale, foto.scala.unita);
  if (mmScala <= 0) return null;
  return (foto.scala.px / mmScala) * inMillimetri(1, unita);
}

/**
 * Strumenti raggruppati: la toolbar mostra pochi pulsanti grandi; toccando
 * un gruppo si apre un pannello temporaneo con le varianti (es. "Forma" →
 * rettangolo / 4 angoli / triangolo / polilinea). Meno pulsanti a schermo,
 * più spazio alla foto.
 */
const GRUPPI_STRUMENTI: Array<{
  id: string;
  icona: NomeIcona;
  testo: string;
  voci: Array<{ s: Strumento; icona: NomeIcona; testo: string }>;
}> = [
  {
    id: 'quote',
    icona: 'quota-orizz',
    testo: 'Quote',
    voci: [
      { s: 'quotaO', icona: 'quota-orizz', testo: 'Orizzontale' },
      { s: 'quotaV', icona: 'quota-vert', testo: 'Verticale' },
      { s: 'quotaA', icona: 'quota-allin', testo: 'Allineata' },
      { s: 'raggio', icona: 'cerchio', testo: 'Raggio' },
      { s: 'cerchio3p', icona: 'cerchio-3p', testo: 'Cerchio 3 punti' },
      { s: 'angolo', icona: 'angolo', testo: 'Angolo' }
    ]
  },
  {
    id: 'forme',
    icona: 'rettangolo',
    testo: 'Elementi',
    voci: [
      { s: 'rettangolo', icona: 'rettangolo', testo: 'Rettangolo' },
      { s: 'quad', icona: 'quad', testo: '4 angoli' },
      { s: 'tri', icona: 'triangolo', testo: 'Triangolo' },
      { s: 'polilinea', icona: 'polilinea', testo: 'Polilinea' },
      { s: 'schizzo', icona: 'disegno', testo: 'Schizzo stanza' }
    ]
  },
  {
    id: 'formeBase',
    icona: 'disegno',
    testo: 'Forme',
    voci: [
      { s: 'forLinea', icona: 'righello', testo: 'Linea' },
      { s: 'forRett', icona: 'rettangolo', testo: 'Rettangolo' },
      { s: 'forCerchio', icona: 'cerchio', testo: 'Cerchio' },
      { s: 'forPoligono', icona: 'polilinea', testo: 'Poligono' },
      { s: 'disegno', icona: 'disegno', testo: 'Mano libera' }
    ]
  },
  {
    id: 'note',
    icona: 'matita',
    testo: 'Note',
    voci: [
      { s: 'etichetta', icona: 'testo', testo: 'Etichette e legenda' },
      { s: 'testo', icona: 'testo', testo: 'Testo' },
      { s: 'freccia', icona: 'freccia', testo: 'Freccia' },
      { s: 'callout', icona: 'dettaglio', testo: 'Dettaglio' }
    ]
  },
  {
    id: 'calibra',
    icona: 'righello',
    testo: 'Scala',
    voci: [
      { s: 'riferimento', icona: 'riferimento', testo: 'Riferimento auto' },
      { s: 'calibra', icona: 'righello', testo: 'Scala (segmento)' }
    ]
  }
];

/**
 * Toolbar della MODALITÀ TECNICA: sostituisce quella base quando si attiva il
 * toggle. Fase 1: gli strumenti aprono l'ambiente dedicato (shell); la posa
 * guidata dei punti arriva nelle fasi successive.
 */
const GRUPPI_STRUMENTI_TECNICA: typeof GRUPPI_STRUMENTI = [
  {
    id: 'tecQuote',
    icona: 'quota-allin',
    testo: 'Quote',
    voci: [
      { s: 'tecSerie', icona: 'quota-orizz', testo: 'In serie' },
      { s: 'tecParallelo', icona: 'quota-vert', testo: 'In parallelo' },
      { s: 'tecProgressiva', icona: 'quota-allin', testo: 'Progressiva' }
    ]
  },
  {
    id: 'tecElementi',
    icona: 'cerchio',
    testo: 'Elementi',
    voci: [
      { s: 'tecForo', icona: 'cerchio', testo: 'Foro ⌀/R' },
      { s: 'tecSmusso', icona: 'angolo', testo: 'Smusso' },
      { s: 'tecFilettatura', icona: 'righello', testo: 'Filettatura' }
    ]
  }
  // Datum/riferimento rimosso dal menu: poco utile finché non è collegabile
  // come origine (resta nel modello e nei renderer, riattivabile in futuro).
];

/** Strumenti tecnici (tutti). */
const STRUMENTI_TECNICI = new Set<Strumento>([
  'tecSerie',
  'tecParallelo',
  'tecProgressiva',
  'tecForo',
  'tecSmusso',
  'tecFilettatura',
  'tecDatum'
]);

/** Strumenti tecnici con posa guidata sulla foto già implementata. */
const STRUMENTI_POSA_TECNICA = new Set<Strumento>(['tecSerie', 'tecParallelo', 'tecProgressiva']);

/**
 * MENU PIANTA (§CAD) — terzo menu, separato da base e tecnico, dedicato alla
 * costruzione PARAMETRICA della pianta. Fase 1: struttura del menu (sezioni
 * Disegno/Quote/Vincoli/Oggetti/Pulizia) con le funzioni già disponibili
 * cablate; le altre aprono un avviso con la fase in cui arriveranno.
 * Ogni voce è uno strumento (`tool`), un comando immediato (`cmd`) o un
 * segnaposto di fase (`fase`).
 */
type ComandoPianta =
  | 'snap30'
  | 'snap45'
  | 'raddrizza90'
  | 'unisci'
  | 'ricostruisci';
interface VocePianta {
  icona: NomeIcona;
  testo: string;
  tool?: Strumento;
  cmd?: ComandoPianta;
  /** funzione in arrivo in una fase successiva (2..5): mostra un avviso */
  fase?: number;
  /** suggerimento operativo mostrato come avviso (funzioni "seleziona-poi-agisci") */
  suggerimento?: string;
}
const GRUPPI_STRUMENTI_PIANTA: Array<{
  id: string;
  icona: NomeIcona;
  testo: string;
  voci: VocePianta[];
}> = [
  {
    id: 'piaDisegno',
    icona: 'disegno',
    testo: 'Disegno',
    voci: [
      { icona: 'disegno', testo: 'Mano libera', tool: 'schizzo' },
      { icona: 'righello', testo: 'Linea', fase: 4 },
      { icona: 'rettangolo', testo: 'Rettangolo', fase: 4 },
      { icona: 'cerchio', testo: 'Cerchio', fase: 4 },
      { icona: 'quota-allin', testo: 'Punto', fase: 4 },
      { icona: 'quota-vert', testo: 'Asse', fase: 4 }
    ]
  },
  {
    id: 'piaQuote',
    icona: 'quota-orizz',
    testo: 'Quote',
    voci: [
      {
        icona: 'quota-allin',
        testo: 'Quota lato (parametrica)',
        suggerimento:
          'Tocca un lato della pianta per quotarlo: la quota comanda il disegno (modificandola la geometria si adatta).'
      },
      {
        icona: 'quota-orizz',
        testo: 'Tra due vertici (diagonale)',
        suggerimento:
          'Nell’editor della pianta usa “◇ Diagonali / ＋ diagonale”, poi modifica la quota: la diagonale comanda la forma.'
      },
      {
        icona: 'angolo',
        testo: 'Angolare',
        suggerimento:
          'Nell’editor della pianta, sezione “Angoli”: vincola un angolo per comandarlo (la forma si adatta).'
      },
      {
        icona: 'quota-allin',
        testo: 'Quota di riferimento',
        suggerimento:
          'Tocca un lato o una diagonale e scegli “Riferimento”: misura soltanto, non comanda il disegno.'
      },
      { icona: 'quota-vert', testo: 'Tra due lati', fase: 3 },
      { icona: 'cerchio', testo: 'Diametro / Raggio', fase: 4 },
      { icona: 'rettangolo', testo: 'Distanza oggetto–lato', fase: 4 }
    ]
  },
  {
    id: 'piaVincoli',
    icona: 'angolo',
    testo: 'Vincoli',
    voci: [
      {
        icona: 'magnete',
        testo: 'Blocca lato / ancora',
        suggerimento:
          'Tocca un lato della pianta: nell’editor del lato puoi bloccarne la lunghezza o ancorare vertice/centro/lato.'
      },
      {
        icona: 'polilinea',
        testo: 'Orizz./Vert./Parallelo/Perp./Uguale',
        suggerimento:
          'Tocca la pianta e apri l’editor: nella sezione “Vincoli geometrici” scegli il vincolo e i lati; la forma si adatta.'
      },
      { icona: 'cerchio', testo: 'Concentrico / Tangente', fase: 4 },
      { icona: 'quad', testo: 'Simmetrico / Punto medio', fase: 4 }
    ]
  },
  {
    id: 'piaOggetti',
    icona: 'rettangolo',
    testo: 'Oggetti',
    voci: [
      { icona: 'rettangolo', testo: 'Inserisci rettangolo', fase: 4 },
      { icona: 'cerchio', testo: 'Inserisci cerchio', fase: 4 },
      { icona: 'matita', testo: 'Modifica oggetto', fase: 4 },
      { icona: 'magnete', testo: 'Ancora oggetto', fase: 4 },
      { icona: 'quota-allin', testo: 'Distanze dai lati', fase: 4 }
    ]
  },
  {
    id: 'piaPulizia',
    icona: 'griglia',
    testo: 'Pulizia',
    voci: [
      { icona: 'griglia', testo: 'Rendi ortogonale (90°)', cmd: 'raddrizza90' },
      { icona: 'angolo', testo: 'Snap 45°', cmd: 'snap45' },
      { icona: 'angolo', testo: 'Snap 30°', cmd: 'snap30' },
      { icona: 'polilinea', testo: 'Unisci lati allineati', cmd: 'unisci' },
      { icona: 'rettangolo', testo: 'Ricostruisci dalle misure', cmd: 'ricostruisci' },
      {
        icona: 'cestino',
        testo: 'Elimina lato e richiudi',
        suggerimento:
          'Tocca un lato della pianta: nell’editor del lato trovi “Elimina lato e richiudi”.'
      }
    ]
  }
];

/** Etichetta della catena tecnica in posa, per la barra guida. */
const ETICHETTA_POSA_TECNICA: Partial<Record<Strumento, string>> = {
  tecSerie: 'Tocca i punti della catena, in sequenza',
  tecParallelo: 'Tocca i punti: il primo è l’origine, gli altri si quotano da lì',
  tecProgressiva: 'Tocca i punti: il primo è lo zero, gli altri sono le ordinate'
};

/** Sequenza del menu circolare: prima le lettere A…Z, poi i numeri 1…10. */
const SEQUENZA_ETICHETTE = [
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 10 }, (_, i) => String(i + 1))
];

type CategoriaLayer = 'quote' | 'note' | 'callout';

function categoriaAnnotazione(a: Annotazione): CategoriaLayer {
  switch (a.tipo) {
    case 'quota':
    case 'quotaAngolo':
    case 'quotaRaggio':
    case 'quotaRett':
    case 'quotaPoligono':
    case 'quotaTecnica':
      return 'quote';
    case 'callout':
      return 'callout';
    default:
      // testo, disegno, freccia, etichetta, legenda, forma
      return 'note';
  }
}

export function EditorFoto({ fotoId }: { fotoId: string }) {
  const foto = useLiveQuery(() => db.foto.get(fotoId), [fotoId]);
  // foto del progetto: servono per l'etichetta identificativa di questa foto
  const fotoProgetto = useLiveQuery(
    () => (foto ? db.foto.where('progettoId').equals(foto.progettoId).toArray() : []),
    [foto?.progettoId]
  );
  // annotazioni di TUTTE le foto del progetto: per la numerazione condivisa
  // (foto con la stessa etichetta condividono la sequenza delle forme)
  const annotazioniProgetto = useLiveQuery(
    () =>
      fotoProgetto && fotoProgetto.length
        ? db.annotazioni.where('fotoId').anyOf(fotoProgetto.map((f) => f.id)).toArray()
        : [],
    [fotoProgetto]
  );
  // progetto corrente: il CONTESTO di lavoro. Numerazione e richiamo delle
  // misure restano DENTRO il progetto aperto (le sue sezioni/foto), mai globali.
  const progetto = useLiveQuery(
    () => (foto ? db.progetti.get(foto.progettoId) : undefined),
    [foto?.progettoId]
  );
  // cartelle: solo per comporre il percorso (prefisso dei codici, es. P1)
  const tutteCartelle = useLiveQuery(() => db.cartelle.toArray(), []);
  const [immagine, setImmagine] = useState<HTMLImageElement | null>(null);
  const [impostazioni, setImpostazioni] = useState<Impostazioni>(IMPOSTAZIONI_DEFAULT);
  const [annotazioni, setAnnotazioni] = useState<Annotazione[] | null>(null);
  const [selezioneId, setSelezioneId] = useState<string | null>(null);
  const [strumento, setStrumento] = useState<Strumento>('seleziona');
  /** menu attivo (sostituisce la toolbar): base · tecnica · pianta */
  const [modalitaMenu, setModalitaMenu] = useState<'base' | 'tecnica' | 'pianta'>('base');
  const modalitaTecnica = modalitaMenu === 'tecnica';
  /** punti posati della quotatura tecnica in serie in corso (catena da generare) */
  const [puntiTecnici, setPuntiTecnici] = useState<Punto[]>([]);
  /** lettera attiva per la posa rapida delle etichette (modalità Note) */
  const [letteraAttiva, setLetteraAttiva] = useState('A');
  /** menu circolare aperto (coord schermo + indice della voce proposta) */
  const [menuEtichetta, setMenuEtichetta] = useState<{ x: number; y: number; indice: number } | null>(
    null
  );
  /** ambiente di lavoro della legenda aperto */
  const [legendaAperta, setLegendaAperta] = useState(false);
  /** id dell'etichetta in modifica (modale lettera + descrizione) */
  const [etichettaInModifica, setEtichettaInModifica] = useState<string | null>(null);
  const [snapAttivo, setSnapAttivo] = useState(true);
  const [vincolo, setVincolo] = useState<ModalitaVincolo>('off');
  const [bordiAttivo, setBordiAttivo] = useState(false);
  const [layerVisibili, setLayerVisibili] = useState<Record<CategoriaLayer, boolean>>({
    quote: true,
    note: true,
    callout: true
  });
  const [schedaNote, setSchedaNote] = useState(false);
  const [schedaOpzioni, setSchedaOpzioni] = useState(false);
  /** gruppo strumenti con il pannello aperto (null = chiuso) */
  const [menuAperto, setMenuAperto] = useState<string | null>(null);
  /** quota aperta nell'ambiente dedicato: una quota lineare, oppure un
   *  singolo segmento (lato/diagonale) di un poligono */
  const [quotaInModifica, setQuotaInModifica] = useState<
    | { tipo: 'quota'; id: string }
    | { tipo: 'poligono'; id: string }
    | { tipo: 'segmento'; id: string; indice: number }
    | { tipo: 'callout'; id: string }
    | { tipo: 'tecnica'; id: string }
    | null
  >(null);
  const [testoInModifica, setTestoInModifica] = useState<string | null>(null);
  const [schedaScala, setSchedaScala] = useState<{ px: number } | null>(null);
  const [schedaPiano, setSchedaPiano] = useState<{ punti: [Punto, Punto, Punto, Punto] } | null>(null);
  /** rettangolo di riferimento rilevato, in correzione (4 angoli trascinabili) */
  const [calibQuad, setCalibQuad] = useState<[Punto, Punto, Punto, Punto] | null>(null);
  /** punto toccato per il riferimento: permette di ri-rilevare al variare della sensibilità */
  const [riferimentoPunto, setRiferimentoPunto] = useState<Punto | null>(null);
  /** formato del riferimento: 'pers' (personalizzato, default) o A4/A5/A3/bancomat */
  const [formatoRif, setFormatoRif] = useState('pers');
  /** dimensioni del formato personalizzato (mm), riusate tra una calibrazione e l'altra */
  const [formatoPers, setFormatoPers] = useState<{ lungo: number; corto: number } | null>(null);
  /** dialog per impostare le misure del formato personalizzato */
  const [schedaFormatoPers, setSchedaFormatoPers] = useState(false);
  /** numero di celle della griglia di calibrazione/verifica (3×3, 5×5…) */
  const [celleGriglia, setCelleGriglia] = useState(3);
  /** SECONDO stadio: griglia proiettata, 4 angoli ESTERNI trascinabili */
  const [calibGriglia, setCalibGriglia] = useState<
    { punti: [Punto, Punto, Punto, Punto]; L: number; A: number; celle: number } | null
  >(null);
  /** area da inquadrare automaticamente (zoom sul riferimento / sulla griglia) */
  const [inquadraCalib, setInquadraCalib] = useState<Rettangolo | null>(null);
  /** menu separato per la scelta del formato */
  const [menuFormato, setMenuFormato] = useState(false);
  /** modalità duplica: la forma "master" da copiare sugli elementi uguali */
  const [duplicaMaster, setDuplicaMaster] = useState<QuotaPoligono | null>(null);
  /** menu "richiama misura": elenco delle misure originali del progetto/edificio */
  const [menuRichiamo, setMenuRichiamo] = useState(false);
  /** griglia di verifica sul piano calibrato (controllo visivo della scala) */
  const [mostraGriglia, setMostraGriglia] = useState(false);
  /** picker della foto di riferimento (sfondo) per una pianta */
  const [pickerSfondo, setPickerSfondo] = useState(false);
  /** passo di snap angolare (gradi) applicato allo schizzo pianta: 0 = libero */
  const [snapSchizzo, setSnapSchizzo] = useState<number>(45);
  /** poligono proposto dall'autoquotatura (base + altezza), da confermare */
  const [proposta, setProposta] = useState<QuotaPoligono | null>(null);
  /** angoli del quadrilatero rilevato (per l'opzione cerchio) */
  const [propostaQuad, setPropostaQuad] = useState<[Punto, Punto, Punto, Punto] | null>(null);
  /** confidenza del rilevamento corrente (0–1) */
  const [confidenza, setConfidenza] = useState(0);
  /** sorgente del rilevamento (tocco o evidenziatura): permette di
   *  ri-rilevare live al variare della sensibilità */
  const [propostaSorgente, setPropostaSorgente] = useState<
    { tipo: 'tocco'; punto: Punto } | { tipo: 'traccia'; punti: Punto[] } | null
  >(null);
  /** sensibilità del motore ai bordi (0–100): più alta = bordi più deboli */
  const [sensibilita, setSensibilita] = useState(50);
  const cacheAnalisi = useRef<{ img: HTMLImageElement; analisi: RicercaBordi } | null>(null);
  const passato = useRef<Annotazione[][]>([]);
  const futuro = useRef<Annotazione[][]>([]);
  const timerSalvataggio = useRef<number | null>(null);
  const daSalvare = useRef<Annotazione[] | null>(null);
  const inputValore = useRef<HTMLInputElement>(null);

  // Caricamento iniziale: immagine, impostazioni, annotazioni
  useEffect(() => {
    let attivo = true;
    leggiImpostazioni().then((i) => attivo && setImpostazioni(i));
    db.annotazioni
      .where('fotoId')
      .equals(fotoId)
      .toArray()
      .then((a) => attivo && setAnnotazioni(a));
    return () => {
      attivo = false;
    };
  }, [fotoId]);

  useEffect(() => {
    if (!foto || fotoIllegibile(foto)) return;
    let attivo = true;
    caricaImmagine(blobOrigine(foto))
      .then((img) => attivo && setImmagine(img))
      .catch((e) => mostraToast('errore', e instanceof Error ? e.message : 'Foto non caricabile.'));
    return () => {
      attivo = false;
    };
    // l'originale non cambia mai: si carica una sola volta per foto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto?.id]);

  // Analisi dell'immagine (bordi + autoquotatura): costruita una volta
  // per foto, alla prima richiesta, e riusata da entrambe le funzioni
  const ottieniAnalisi = useCallback((): RicercaBordi | null => {
    if (!immagine || !foto) return null;
    if (cacheAnalisi.current?.img === immagine) return cacheAnalisi.current.analisi;
    try {
      const analisi = new RicercaBordi(immagine, foto.larghezzaPx, foto.altezzaPx);
      cacheAnalisi.current = { img: immagine, analisi };
      return analisi;
    } catch {
      return null;
    }
  }, [immagine, foto]);

  const ricercaBordi = useMemo(
    () => (bordiAttivo ? ottieniAnalisi() : null),
    [bordiAttivo, ottieniAnalisi]
  );

  // la proposta di autoquotatura decade cambiando strumento
  useEffect(() => {
    if (strumento !== 'auto') {
      setProposta(null);
      setPropostaQuad(null);
      setPropostaSorgente(null);
      setConfidenza(0);
    }
  }, [strumento]);

  // ---------------------------------------------------------------------------
  // Autosave transazionale con debounce breve + flush garantito
  // ---------------------------------------------------------------------------

  const salvaOra = useCallback(() => {
    if (timerSalvataggio.current !== null) {
      clearTimeout(timerSalvataggio.current);
      timerSalvataggio.current = null;
    }
    const dati = daSalvare.current;
    if (dati === null) return;
    daSalvare.current = null;
    void salvaAnnotazioniFoto(fotoId, dati).catch(() => {
      // errore già notificato dal repository; si ritenta al prossimo commit
      daSalvare.current = dati;
    });
  }, [fotoId]);

  const programmaSalvataggio = useCallback(
    (dati: Annotazione[]) => {
      daSalvare.current = dati;
      if (timerSalvataggio.current !== null) clearTimeout(timerSalvataggio.current);
      timerSalvataggio.current = window.setTimeout(salvaOra, 350);
    },
    [salvaOra]
  );

  useEffect(() => {
    const suNascosto = () => {
      if (document.visibilityState === 'hidden') salvaOra();
    };
    document.addEventListener('visibilitychange', suNascosto);
    window.addEventListener('pagehide', salvaOra);
    return () => {
      document.removeEventListener('visibilitychange', suNascosto);
      window.removeEventListener('pagehide', salvaOra);
      salvaOra(); // flush all'uscita dall'editor
    };
  }, [salvaOra]);

  // entrando in modalità Note, parte dalla prima lettera ancora libera
  useEffect(() => {
    if (strumento !== 'etichetta') return;
    const usate = (annotazioni ?? [])
      .filter((a): a is Etichetta => a.tipo === 'etichetta')
      .map((a) => a.lettera);
    setLetteraAttiva(prossimaLetteraLibera(usate));
    // solo all'ingresso nello strumento, non a ogni modifica delle annotazioni
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strumento]);

  // uscendo dalla posa della quotatura tecnica, scarta i punti non confermati
  useEffect(() => {
    if (!STRUMENTI_POSA_TECNICA.has(strumento)) {
      setPuntiTecnici((punti) => (punti.length ? [] : punti));
    }
  }, [strumento]);

  // aprendo una pianta, si entra già nel Menu Pianta; se vuota, con lo Schizzo
  const piantaInit = useRef<string | null>(null);
  useEffect(() => {
    if (!foto || !annotazioni) return;
    if (piantaInit.current === foto.id) return;
    piantaInit.current = foto.id;
    if (foto.ePianta) {
      setModalitaMenu('pianta');
      if (annotazioni.length === 0) setStrumento('schizzo');
    } else {
      // aprendo una foto normale non si resta nel Menu Pianta (che è per le piante)
      setModalitaMenu((m) => (m === 'pianta' ? 'base' : m));
    }
  }, [foto, annotazioni]);


  const commit = useCallback(
    (nuove: Annotazione[]) => {
      setAnnotazioni((correnti) => {
        if (correnti) {
          passato.current.push(correnti);
          if (passato.current.length > 100) passato.current.shift();
          futuro.current = [];
        }
        return nuove;
      });
      programmaSalvataggio(nuove);
    },
    [programmaSalvataggio]
  );

  /** commit dalle modifiche di geometria: i valori auto vengono ricalcolati */
  const commitGeometria = useCallback(
    (nuove: Annotazione[]) => {
      const agg = foto ? ricalcolaTecniche(applicaValoriAuto(nuove, foto), foto) : nuove;
      commit(agg);
    },
    [commit, foto]
  );

  const undo = () => {
    const prec = passato.current.pop();
    if (!prec || !annotazioni) return;
    futuro.current.push(annotazioni);
    setAnnotazioni(prec);
    programmaSalvataggio(prec);
    if (selezioneId && !prec.some((a) => a.id === selezioneId)) setSelezioneId(null);
  };

  const redo = () => {
    const succ = futuro.current.pop();
    if (!succ || !annotazioni) return;
    passato.current.push(annotazioni);
    setAnnotazioni(succ);
    programmaSalvataggio(succ);
  };

  // ---------------------------------------------------------------------------
  // Creazione annotazioni
  // ---------------------------------------------------------------------------

  const fabbrica = useMemo(
    () => (foto ? new FabbricaAnnotazioni(foto, impostazioni) : null),
    [foto, impostazioni]
  );

  const creaQuota = (p1: Punto, p2: Punto, sottotipo: SottotipoQuota) => {
    if (!fabbrica || !annotazioni) return;
    const q = fabbrica.quota(p1, p2, sottotipo, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    // si apre subito l'ambiente di modifica dedicato alla quota
    setQuotaInModifica({ tipo: 'quota', id: q.id });
  };

  /** crea un'annotazione e la seleziona */
  const creaEseleziona = (a: Annotazione) => {
    if (!annotazioni) return;
    commit([...annotazioni, a]);
    setSelezioneId(a.id);
    setStrumento('seleziona');
    // i poligoni si aprono subito nel loro ambiente dedicato
    if (a.tipo === 'quotaPoligono') setQuotaInModifica({ tipo: 'poligono', id: a.id });
  };

  const creaRettangolo = (rect: Rettangolo) => {
    if (!fabbrica || !annotazioni) return;
    // un poligono unico a 4 vertici, quotato con base e altezza (rettangolo)
    const punti: [Punto, Punto, Punto, Punto] = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height }
    ];
    creaEseleziona(fabbrica.quadrilatero(punti, annotazioni));
  };

  /** elemento da 4 angoli toccati → poligono unico con base e altezza */
  const creaQuad = (punti: [Punto, Punto, Punto, Punto]) => {
    if (!fabbrica || !annotazioni) return;
    creaEseleziona(fabbrica.quadrilatero(punti, annotazioni));
  };

  /** poligono (triangolo, pentagono…) → oggetto unico con tutti i lati quotati */
  const creaPoligono = (punti: Punto[]) => {
    if (!fabbrica || !annotazioni) return;
    creaEseleziona(fabbrica.poligonoLati(punti, annotazioni));
  };

  const creaAngolo = (vertice: Punto, a: Punto, b: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const q = fabbrica.quotaAngolare(vertice, a, b, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    setQuotaInModifica({ tipo: 'quota', id: q.id });
  };

  const creaRaggio = (centro: Punto, bordo: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const q = fabbrica.quotaRaggio(centro, bordo, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    setQuotaInModifica({ tipo: 'quota', id: q.id });
  };

  /** cerchio da 3 punti sull'arco: centro già calcolato dal circumcentro */
  const creaCerchio3p = (centro: Punto, bordo: Punto) => {
    if (!fabbrica || !annotazioni) return;
    let q = fabbrica.quotaRaggio(centro, bordo, annotazioni);
    q = { ...q, modo: 'diametro' };
    if (foto && haCalibrazione(foto)) {
      const v = valoreAutomatico(q, foto);
      q = { ...q, valore: v, valoreAuto: true };
    }
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    setQuotaInModifica({ tipo: 'quota', id: q.id });
  };

  // ---------------------------------------------------------------------------
  // Autoquotatura ibrida a 4 lati: tocca un elemento → quota proposta
  // ---------------------------------------------------------------------------

  /** esegue il motore ibrido dalla sorgente con la sensibilità data */
  const rilevaDaSorgente = (
    sorgente: { tipo: 'tocco'; punto: Punto } | { tipo: 'traccia'; punti: Punto[] },
    sens: number
  ): EsitoQuad4 | null => {
    const analisi = ottieniAnalisi();
    if (!analisi) return null;
    return rilevaQuad4(analisi, sorgente, { sensibilita: sens });
  };

  const proponiFigura = (esito: EsitoQuad4 | null) => {
    if (!fabbrica || !annotazioni) return;
    if (!esito) {
      setProposta(null);
      setPropostaQuad(null);
      setConfidenza(0);
      mostraToast(
        'info',
        'Nessun elemento a 4 lati riconosciuto: tocca al centro di una superficie a contrasto, regola la sensibilità, oppure usa lo strumento manuale "4 angoli".'
      );
      return;
    }
    setConfidenza(esito.confidenza);
    setPropostaQuad(esito.punti);
    // anteprima in blu: poligono unico quotato con base e altezza
    const q = fabbrica.quadrilatero(esito.punti, annotazioni);
    setProposta({ ...q, stile: { ...q.stile, colore: '#2f81f7' } });
  };

  const autoTocco = (punto: Punto) => {
    chiudiRiferimento(); // non confondere col flusso del riferimento
    const sorgente = { tipo: 'tocco' as const, punto };
    setPropostaSorgente(sorgente);
    setProposta(null);
    proponiFigura(rilevaDaSorgente(sorgente, sensibilita));
  };

  /**
   * Riferimento automatico: tocco su un oggetto rettangolare di dimensione
   * nota → il motore a 4 lati ne rileva gli angoli e si apre la scheda del
   * piano (con i preset A4/A3/carta di credito…) per calibrare in prospettiva.
   */
  const riferimentoTocco = (punto: Punto) => {
    const esito = rilevaDaSorgente({ tipo: 'tocco', punto }, sensibilita);
    chiudiProposta(); // non confondere col flusso dell'autoquotatura
    // si memorizza il punto: come per l'autoquotatura, si può ri-rilevare
    // live al variare del cursore di sensibilità
    setRiferimentoPunto(punto);
    if (!esito) {
      setCalibQuad(null);
      setConfidenza(0);
      mostraToast(
        'info',
        'Nessun rettangolo riconosciuto: regola la sensibilità col cursore, tocca al centro dell’oggetto, oppure usa "Piano" e tocca i 4 angoli a mano.'
      );
      return;
    }
    // si entra in correzione: l'utente può aggiustare i 4 angoli prima di
    // confermare; zoom automatico sul riferimento per vedere bene gli angoli
    setCalibQuad(esito.punti);
    setConfidenza(esito.confidenza);
    setInquadraCalib(boxDiPunti(esito.punti));
    setStrumento('seleziona');
  };

  /** Bounding box di un insieme di punti, in coordinate immagine */
  const boxDiPunti = (punti: Punto[]): Rettangolo => {
    const xs = punti.map((p) => p.x);
    const ys = punti.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  };

  /** STADIO 1 → 2: "Calibra" genera la griglia proiettata, con i 4 angoli
   *  ESTERNI trascinabili (la regolazione fine non tocca il riferimento) */
  const generaGriglia = () => {
    if (!calibQuad || !calibDims) return;
    const { L, A } = calibDims;
    const celle = celleGriglia;
    const off = Math.floor((celle - 1) / 2);
    const Hinv = omografiaPianoInversa({
      punti: calibQuad,
      larghezzaReale: L,
      altezzaReale: A,
      unita: 'mm'
    });
    const angoliPiano: Punto[] = [
      { x: -off * L, y: -off * A },
      { x: (celle - off) * L, y: -off * A },
      { x: (celle - off) * L, y: (celle - off) * A },
      { x: -off * L, y: (celle - off) * A }
    ];
    const esterni = angoliPiano.map((q) => applicaOmografia(Hinv, q)) as [Punto, Punto, Punto, Punto];
    setCalibGriglia({ punti: esterni, L, A, celle });
    setCalibQuad(null);
    setInquadraCalib(boxDiPunti(esterni)); // zoom out: si vede tutta la griglia
  };

  const confermaGriglia = () => {
    if (!calibGriglia) return;
    const { punti, L, A, celle } = calibGriglia;
    void salvaPiano(punti, celle * L, celle * A, 'mm', celle);
    chiudiRiferimento();
  };

  /** STADIO 2 → 1: torna al riferimento (ri-rileva dal punto toccato) */
  const tornaAlRiferimento = () => {
    setCalibGriglia(null);
    if (!riferimentoPunto) {
      chiudiRiferimento();
      return;
    }
    const esito = rilevaDaSorgente({ tipo: 'tocco', punto: riferimentoPunto }, sensibilita);
    if (esito) {
      setCalibQuad(esito.punti);
      setConfidenza(esito.confidenza);
      setInquadraCalib(boxDiPunti(esito.punti));
    }
  };

  /** ricalcolo del riferimento al variare del cursore di sensibilità */
  const aggiornaSensibilitaRif = (sens: number) => {
    setSensibilita(sens);
    if (!riferimentoPunto) return;
    const esito = rilevaDaSorgente({ tipo: 'tocco', punto: riferimentoPunto }, sens);
    if (esito) {
      setCalibQuad(esito.punti);
      setConfidenza(esito.confidenza);
    }
  };

  const chiudiRiferimento = () => {
    setCalibQuad(null);
    setCalibGriglia(null);
    setRiferimentoPunto(null);
    setConfidenza(0);
    setInquadraCalib(null);
    setMenuFormato(false);
  };

  /** evidenziatore: il motore cerca l'oggetto nella zona tracciata */
  const autoTraccia = (punti: Punto[]) => {
    const sorgente = { tipo: 'traccia' as const, punti };
    setPropostaSorgente(sorgente);
    setProposta(null);
    proponiFigura(rilevaDaSorgente(sorgente, sensibilita));
  };

  /**
   * Ricalcolo live al variare del cursore di sensibilità: ri-esegue il
   * motore dalla stessa sorgente. Più alta = aggancia bordi più deboli.
   */
  const aggiornaSensibilita = (sens: number) => {
    setSensibilita(sens);
    if (!propostaSorgente || !fabbrica || !annotazioni) return;
    const esito = rilevaDaSorgente(propostaSorgente, sens);
    // a valori estremi può non trovare nulla: si mantiene l'ultima
    // anteprima valida, senza toast ripetuti durante il trascinamento
    if (!esito) return;
    setConfidenza(esito.confidenza);
    setPropostaQuad(esito.punti);
    const q = fabbrica.quadrilatero(esito.punti, annotazioni);
    setProposta({ ...q, stile: { ...q.stile, colore: '#2f81f7' } });
  };

  const chiudiProposta = () => {
    setProposta(null);
    setPropostaQuad(null);
    setPropostaSorgente(null);
    setConfidenza(0);
  };

  const accettaProposta = () => {
    if (!proposta || !annotazioni) return;
    // il poligono diventa definitivo col colore unico (uguale a quelli manuali);
    // si stampa l'istante di creazione per la numerazione automatica
    const definitiva: QuotaPoligono = {
      ...proposta,
      creatoIl: proposta.creatoIl ?? Date.now(),
      stile: { ...proposta.stile, colore: COLORE_QUOTA }
    };
    commit([...annotazioni, definitiva]);
    chiudiProposta();
    setSelezioneId(definitiva.id);
    setStrumento('seleziona');
    setQuotaInModifica({ tipo: 'poligono', id: definitiva.id });
  };

  /**
   * Accetta la figura rilevata come CERCHIO: si inscrive una circonferenza
   * nel riquadro del quadrilatero rilevato (centro = centro del bounding box,
   * diametro = media tra larghezza e altezza) e si crea una quota di diametro.
   */
  const accettaCerchio = () => {
    if (!propostaQuad || !annotazioni || !fabbrica || !foto) return;
    let minx = Infinity;
    let miny = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    for (const p of propostaQuad) {
      minx = Math.min(minx, p.x);
      miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x);
      maxy = Math.max(maxy, p.y);
    }
    const centro: Punto = { x: (minx + maxx) / 2, y: (miny + maxy) / 2 };
    const raggio = (maxx - minx + (maxy - miny)) / 4;
    const bordo: Punto = { x: centro.x + raggio, y: centro.y };
    let q = fabbrica.quotaRaggio(centro, bordo, annotazioni);
    q = { ...q, modo: 'diametro' };
    if (haCalibrazione(foto)) {
      const v = valoreAutomatico(q, foto);
      q = { ...q, valore: v, valoreAuto: true };
    }
    commit([...annotazioni, q]);
    chiudiProposta();
    setSelezioneId(q.id);
    setStrumento('seleziona');
    setQuotaInModifica({ tipo: 'quota', id: q.id });
  };

  const creaTesto = (pos: Punto, ancora?: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const base = fabbrica.testo(pos, annotazioni);
    const t = ancora ? { ...base, ancora } : base;
    commit([...annotazioni, t]);
    setSelezioneId(t.id);
    setStrumento('seleziona');
    setTestoInModifica(t.id);
  };

  const creaFreccia = (p1: Punto, p2: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const f = fabbrica.freccia(p1, p2, annotazioni);
    commit([...annotazioni, f]);
    setSelezioneId(f.id);
    setStrumento('seleziona');
  };

  /** Posa rapida di un'etichetta: usa SEMPRE la lettera attiva e la lascia
   *  attiva per i tap successivi (più elementi uguali = stessa lettera). Per
   *  cambiare lettera si usa il menu circolare (tap prolungato). */
  const creaEtichetta = (pos: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const et = fabbrica.etichetta(pos, letteraAttiva, annotazioni);
    let nuove = [...annotazioni, et];
    // una sola legenda per foto: la creo alla prima etichetta
    if (!nuove.some((a) => a.tipo === 'legenda')) {
      nuove = [...nuove, fabbrica.legenda(nuove)];
    }
    commit(nuove);
  };

  /** Apre il menu circolare proponendo la prima lettera libera dopo le usate. */
  const apriMenuEtichetta = (schermo: Punto) => {
    const usate = (annotazioni ?? [])
      .filter((a): a is Etichetta => a.tipo === 'etichetta')
      .map((a) => a.lettera);
    const proposta = prossimaLetteraLibera(usate);
    const idx = SEQUENZA_ETICHETTE.indexOf(proposta);
    setMenuEtichetta({
      x: schermo.x,
      y: schermo.y,
      indice: idx >= 0 ? idx : Math.max(0, SEQUENZA_ETICHETTE.indexOf(letteraAttiva))
    });
  };

  /** Scrive la descrizione di una lettera su TUTTE le etichette con quella lettera. */
  const cambiaDescrizioneLegenda = (lettera: string, descrizione: string) => {
    if (!annotazioni) return;
    commit(
      annotazioni.map((a) =>
        a.tipo === 'etichetta' && a.lettera === lettera ? { ...a, descrizione } : a
      )
    );
  };

  /** Crea una foto di DETTAGLIO collegata a un'etichetta: importa il file,
   *  la salva nello stesso progetto/sezione della foto principale e la marca. */
  const creaFotoDettaglio = async (et: Etichetta, file: File): Promise<string | null> => {
    if (!foto) return null;
    try {
      const { fotoLatoMax } = await leggiImpostazioni();
      const dati = await importaFoto(file, fotoLatoMax);
      const nuova = await aggiungiFoto(foto.progettoId, {
        ...dati,
        // nessuna didascalia automatica: il titolo "Dettaglio X" nel PDF è
        // gestito a parte, così non si duplica ("Dettaglio A · Dettaglio A")
        didascalia: '',
        noteDato: '',
        scala: null,
        sezioneId: foto.sezioneId,
        dettaglioDi: { fotoId: foto.id, etichettaId: et.id, lettera: et.lettera }
      });
      mostraToast('successo', `Foto di dettaglio ${et.lettera} aggiunta.`);
      return nuova.id;
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Foto di dettaglio non aggiunta.');
      return null;
    }
  };

  /** Collega una foto ESISTENTE del progetto a un'etichetta, marcandola come
   *  foto di dettaglio di quell'elemento. */
  const collegaFotoDettaglio = async (et: Etichetta, idDaCollegare: string) => {
    if (!foto) return;
    try {
      await aggiornaFoto(idDaCollegare, {
        dettaglioDi: { fotoId: foto.id, etichettaId: et.id, lettera: et.lettera }
      });
      mostraToast('successo', `Foto collegata all'etichetta ${et.lettera}.`);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Collegamento non riuscito.');
    }
  };

  /** Modifica una singola etichetta: cambia lettera e propaga la descrizione
   *  a tutte le etichette con la nuova lettera (collegamento con la legenda). */
  const modificaEtichetta = (id: string, m: { lettera: string; descrizione: string }) => {
    if (!annotazioni) return;
    const nuovaLettera = m.lettera;
    const vecchiaLettera = annotazioni.find(
      (a): a is Etichetta => a.tipo === 'etichetta' && a.id === id
    )?.lettera;
    const nuove = annotazioni.map((a) => {
      if (a.tipo !== 'etichetta') return a;
      if (a.id === id) return { ...a, lettera: nuovaLettera, descrizione: m.descrizione };
      // mantieni allineate le descrizioni delle etichette con la stessa lettera
      if (a.lettera === nuovaLettera) return { ...a, descrizione: m.descrizione };
      return a;
    });
    commit(nuove);
    // se la VECCHIA lettera non esiste più su questa foto, le foto di dettaglio
    // collegate a quella lettera seguono la nuova (l'elemento è stato rinominato)
    if (foto && vecchiaLettera && vecchiaLettera !== nuovaLettera) {
      const restaVecchia = nuove.some((a) => a.tipo === 'etichetta' && a.lettera === vecchiaLettera);
      if (!restaVecchia) {
        for (const f of fotoProgetto ?? []) {
          if (f.dettaglioDi?.fotoId === foto.id && f.dettaglioDi.lettera === vecchiaLettera) {
            void aggiornaFoto(f.id, {
              dettaglioDi: { ...f.dettaglioDi, lettera: nuovaLettera }
            });
          }
        }
      }
    }
  };

  const creaDisegno = (punti: number[]) => {
    if (!fabbrica || !annotazioni) return;
    const d = fabbrica.disegno(punti, annotazioni);
    commit([...annotazioni, d]);
  };

  /** schizzo a mano libera → raddrizzato nel poligono quotato della stanza */
  const creaSchizzo = (puntiFlat: number[]) => {
    if (!fabbrica || !annotazioni) return;
    const punti: Punto[] = [];
    for (let i = 0; i + 1 < puntiFlat.length; i += 2) {
      punti.push({ x: puntiFlat[i], y: puntiFlat[i + 1] });
    }
    let vertici = raddrizzaStanza(punti);
    if (!vertici) {
      mostraToast('info', 'Schizzo non riconosciuto: traccia il contorno chiuso della stanza.');
      return;
    }
    // snap angolare (30/45/90°): aggancia i lati al passo scelto e richiude,
    // evitando i micro-segmenti storti del tratto a mano libera. La tolleranza
    // passo/2 aggancia ogni lato al multiplo più vicino (l'utente ha scelto il
    // passo apposta; "libero" = nessuno snap)
    if (snapSchizzo > 0) vertici = snapAngoliPoligono(vertici, snapSchizzo, snapSchizzo / 2);
    // resta nello strumento Schizzo: si possono aggiungere elementi consecutivi
    // (stanze, muri interni); si quotano poi selezionandoli
    const s = fabbrica.poligonoLati(vertici, annotazioni);
    commit([...annotazioni, { ...s, snapAngolo: snapSchizzo > 0 ? snapSchizzo : undefined }]);
    setSelezioneId(s.id);
  };

  const creaForma = (forma: TipoForma, punti: Punto[]) => {
    if (!fabbrica || !annotazioni) return;
    const f = fabbrica.forma(forma, punti, annotazioni);
    commit([...annotazioni, f]);
    setSelezioneId(f.id);
    setStrumento('seleziona');
  };

  /** genera la quotatura tecnica (serie/parallelo/progressiva) dai punti posati */
  const creaQuotaTecnica = () => {
    if (!fabbrica || !annotazioni || !foto || puntiTecnici.length < 2) return;
    const opts = { unita: impostazioni.unitaDefault };
    const q =
      strumento === 'tecParallelo'
        ? fabbrica.quotaTecnicaParallelo(puntiTecnici, opts, annotazioni)
        : strumento === 'tecProgressiva'
          ? fabbrica.quotaTecnicaProgressiva(puntiTecnici, opts, annotazioni)
          : fabbrica.quotaTecnicaSerie(puntiTecnici, opts, annotazioni);
    commit([...annotazioni, q]);
    setPuntiTecnici([]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    // si mostra subito la catena generata (selezionata): l'ambiente di
    // modifica si apre col pulsante Modifica, se servono ritocchi
    if (!haCalibrazione(foto)) setQuotaInModifica({ tipo: 'tecnica', id: q.id });
  };

  /** posa un riferimento/datum con lettera automatica; resta nello strumento */
  const creaDatum = (punto: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const usate: string[] = [];
    for (const a of annotazioni) {
      if (a.tipo === 'quotaTecnica' && a.sottotipo === 'datum' && a.etichetta) usate.push(a.etichetta);
    }
    const d = fabbrica.quotaTecnicaDatum(punto, prossimaLetteraLibera(usate), annotazioni);
    commit([...annotazioni, d]);
    setSelezioneId(d.id);
  };

  /** quotatura foro: tre tap sul bordo → centro e ⌀/R; resta nello strumento */
  const creaForo = (p0: Punto, p1: Punto, p2: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const f = fabbrica.quotaTecnicaForo(p0, p1, p2, annotazioni);
    if (!f) {
      mostraToast('errore', 'I 3 punti sono allineati: impossibile trovare il centro del foro. Riprova.');
      return;
    }
    commit([...annotazioni, f]);
    setSelezioneId(f.id);
  };

  /** smusso: due tap sugli estremi del segmento smussato; resta nello strumento */
  const creaSmusso = (a: Punto, b: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const s = fabbrica.quotaTecnicaSmusso(a, b, annotazioni);
    commit([...annotazioni, s]);
    setSelezioneId(s.id);
  };

  /** filettatura: un tap sull'ancora → callout normalizzata; resta nello strumento */
  const creaFilettatura = (ancora: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const f = fabbrica.quotaTecnicaFilettatura(ancora, annotazioni);
    commit([...annotazioni, f]);
    setSelezioneId(f.id);
  };

  /** Avvia la modalità "duplica misura" sulla forma selezionata (stessa foto):
   *  fissa il gruppo della famiglia e poi ogni tocco crea una copia collegata. */
  const avviaDuplica = () => {
    if (!annotazioni || !selezionata || selezionata.tipo !== 'quotaPoligono') return;
    let master = selezionata;
    if (!master.gruppoQuota) {
      // la chiave di famiglia è l'id dell'originale: così è ritrovabile ovunque
      master = { ...master, gruppoQuota: master.id };
      commit(annotazioni.map((a) => (a.id === master.id ? master : a)));
    }
    setDuplicaMaster(master);
  };

  /** Richiama una misura ORIGINALE (anche di un'altra foto/cartella) e avvia la
   *  modalità "tocca per ripetere" nella foto corrente. */
  const richiamaMisura = async (originale: QuotaPoligono) => {
    let master = originale;
    if (!master.gruppoQuota) {
      master = { ...master, gruppoQuota: master.id };
      // l'originale può stare in un'altra foto: lo si aggiorna direttamente nel DB
      if (master.fotoId === fotoId && annotazioni) {
        commit(annotazioni.map((a) => (a.id === master.id ? master : a)));
      } else {
        await salvaAnnotazione(master);
      }
    }
    setMenuRichiamo(false);
    setSelezioneId(null);
    setDuplicaMaster(master);
  };

  /** Crea una copia "solo etichetta" nel punto toccato, collegata alla famiglia
   *  del master (la misura resta quella dell'originale). */
  const duplicaTocco = (punto: Punto) => {
    if (!annotazioni || !duplicaMaster) return;
    const n = duplicaMaster.punti.length || 1;
    const cx = duplicaMaster.punti.reduce((s, p) => s + p.x, 0) / n;
    const cy = duplicaMaster.punti.reduce((s, p) => s + p.y, 0) / n;
    const dx = punto.x - cx;
    const dy = punto.y - cy;
    const zIndex = annotazioni.reduce((m, a) => Math.max(m, a.zIndex), 0) + 1;
    const copia: QuotaPoligono = {
      ...duplicaMaster,
      id: nuovoId(),
      fotoId, // la copia vive nella foto CORRENTE (anche se l'originale è altrove)
      zIndex,
      punti: duplicaMaster.punti.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      segmenti: undefined, // la misura è dell'originale (fonte unica), non copiata
      lati: undefined,
      offsetLati: undefined,
      valoreAuto: false,
      etichetta: '',
      etichettaOffset: undefined,
      // copia "solo etichetta": sulla foto compare unicamente il codice nel
      // punto toccato; la misura resta quella dell'originale della famiglia
      soloEtichetta: true,
      gruppoQuota: famigliaDi(duplicaMaster),
      creatoIl: Date.now(),
      ordine: undefined
    };
    commit([...annotazioni, copia]);
  };

  const creaCallout = (sorgente: Rettangolo) => {
    if (!fabbrica || !annotazioni) return;
    const c = fabbrica.callout(sorgente, annotazioni);
    commit([...annotazioni, c]);
    setSelezioneId(c.id);
    setStrumento('seleziona');
    setQuotaInModifica({ tipo: 'callout', id: c.id });
  };

  const aggiornaSelezionata = (modifiche: Partial<Annotazione>) => {
    if (!annotazioni || !selezioneId) return;
    commit(
      annotazioni.map((a) => (a.id === selezioneId ? ({ ...a, ...modifiche } as Annotazione) : a))
    );
  };

  const eliminaSelezionata = () => {
    if (!annotazioni || !selezioneId) return;
    commit(annotazioni.filter((a) => a.id !== selezioneId));
    setSelezioneId(null);
  };

  /** scala spessore + testo della quota selezionata (pulsanti A−/A＋ flottanti) */
  const scalaStileSelezionata = (f: number) => {
    if (!annotazioni || !selezioneId) return;
    commit(
      annotazioni.map((a) =>
        a.id === selezioneId
          ? ({
              ...a,
              stile: {
                ...a.stile,
                spessore: Math.max(1, Math.round(a.stile.spessore * f)),
                dimensioneTesto: Math.max(8, Math.round(a.stile.dimensioneTesto * f))
              }
            } as Annotazione)
          : a
      )
    );
  };

  // ---------------------------------------------------------------------------
  // Calibrazione: scala lineare e piano prospettico
  // ---------------------------------------------------------------------------

  /** dopo un cambio di calibrazione i valori auto vengono ricalcolati */
  const ricalcolaConCalibrazione = (fotoAggiornata: Pick<Foto, 'scala' | 'piano'>) => {
    if (!annotazioni) return;
    commit(applicaValoriAuto(annotazioni, fotoAggiornata));
  };

  const salvaScala = async (px: number, reale: number, unita: Unita) => {
    if (!foto) return;
    const scala = { px, reale, unita };
    await aggiornaFoto(foto.id, { scala });
    ricalcolaConCalibrazione({ scala, piano: foto.piano });
    mostraToast('successo', 'Scala calibrata: le quote senza valore manuale vengono calcolate.');
    setStrumento('seleziona');
  };

  const salvaPiano = async (
    punti: [Punto, Punto, Punto, Punto],
    larghezzaReale: number,
    altezzaReale: number,
    unita: Unita,
    celle = 1
  ) => {
    if (!foto) return;
    const piano = { punti, larghezzaReale, altezzaReale, unita, celle };
    try {
      omografiaPiano(piano); // verifica che i punti non siano degeneri
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Punti del piano non validi.');
      return;
    }
    await aggiornaFoto(foto.id, { piano });
    ricalcolaConCalibrazione({ scala: foto.scala, piano });
    setMostraGriglia(true); // mostra subito la griglia per verificare la scala
    mostraToast(
      'successo',
      'Piano attivo: la griglia di verifica mostra la scala reale. Le misure su quel piano correggono la prospettiva.'
    );
    setStrumento('seleziona');
  };

  const calibraDaQuota = async (q: Quota) => {
    if (!foto || q.valore === null) return;
    const px = lunghezzaPxQuota(q);
    if (px < 2) return;
    const scala = { px, reale: q.valore, unita: q.unita };
    await aggiornaFoto(foto.id, { scala });
    ricalcolaConCalibrazione({ scala, piano: foto.piano });
    mostraToast('successo', 'Scala ricavata dalla quota selezionata.');
  };

  /** Quotatura guidata delle piante: dal lato di un poligono ricava la scala e
   *  rimette il poligono in automatico, così TUTTI i lati si misurano. */
  const calibraDaLatoPoligono = async (poli: QuotaPoligono, q: Quota) => {
    if (!foto || !annotazioni || q.valore === null) return;
    const px = lunghezzaPxQuota(q);
    if (px < 2) return;
    const scala = { px, reale: q.valore, unita: q.unita };
    await aggiornaFoto(foto.id, { scala });
    // il lato usato come scala diventa una quota MANUALE (fissa): non si
    // ricalcola quando si modificano le altre
    const idx = parseInt(q.id.split(':')[1] ?? '', 10);
    const conAuto = annotazioni.map((a) => {
      if (a.id !== poli.id) return a;
      const p = a as QuotaPoligono;
      const segs = segmentiPoligono(p);
      const segmenti = Number.isFinite(idx)
        ? segs.map((s, i) => (i === idx ? { ...s, manuale: true } : s))
        : segs;
      return { ...p, segmenti, lati: undefined, offsetLati: undefined, valoreAuto: true } as Annotazione;
    });
    commit(applicaValoriAuto(conAuto, { scala, piano: foto.piano }));
    mostraToast('successo', 'Scala ricavata dal lato: gli altri lati sono ora misurati.');
  };

  /** Ricostruzione parametrica della pianta (§12): il poligono viene ridisegnato
   *  ad angoli retti rispettando i lati quotati; i lati senza misura si ricavano
   *  dalla chiusura. La geometria non corrisponde più ai pixel della foto, quindi
   *  si azzera l'eventuale piano prospettico e si imposta una scala lineare. */
  const ricostruisciPianta = async (poli: QuotaPoligono) => {
    if (!foto || !annotazioni) return;
    const segs = segmentiPoligono(poli);
    const nLati = poli.punti.length;
    const reali = poli.punti.map((_, i) => {
      const j = (i + 1) % nLati;
      const seg = segs.find((s) => (s.da === i && s.a === j) || (s.da === j && s.a === i));
      return seg && seg.valore !== null ? seg.valore : null;
    });
    if (reali.every((v) => v === null)) {
      mostraToast('errore', 'Inserisci almeno una misura di un lato prima di ricostruire.');
      return;
    }
    const r = ricostruisciOrtogonale(poli.punti, reali, foto.larghezzaPx, foto.altezzaPx);
    if (!r) {
      mostraToast(
        'errore',
        'Misure insufficienti: serve almeno un lato quotato in orizzontale e uno in verticale.'
      );
      return;
    }
    const scala = { px: r.pxPerReale, reale: 1, unita: poli.unita };
    // la nuova geometria è in coordinate tela, scollegata dalla prospettiva foto
    await aggiornaFoto(foto.id, { scala, piano: undefined });
    const conNuovo = annotazioni.map((a) =>
      a.id === poli.id
        ? ({ ...a, punti: r.punti, lati: undefined, offsetLati: undefined, valoreAuto: true } as Annotazione)
        : a
    );
    // si applicano QUI i valori con la NUOVA scala e si usa commit() diretto:
    // commitGeometria rifarebbe applicaValoriAuto con la `foto` di closure ancora
    // vecchia (scala/piano non ancora propagati da useLiveQuery), sovrascrivendo
    // le misure appena calcolate con quelle della vecchia calibrazione.
    commit(applicaValoriAuto(conNuovo, { scala, piano: undefined }));
    mostraToast('successo', 'Pianta ricostruita in scala dalle misure inserite.');
  };

  /** Poligoni-perimetro presenti nella pianta. */
  const poligoniPianta = (): QuotaPoligono[] =>
    (annotazioni ?? []).filter((a): a is QuotaPoligono => a.tipo === 'quotaPoligono');

  /** Poligono-perimetro bersaglio dei comandi del Menu Pianta: quello
   *  selezionato se è un poligono, altrimenti l'UNICO della pianta. Con più
   *  stanze e nessuna selezione è ambiguo → null (il chiamante avvisa). */
  const poligonoBersaglio = (): QuotaPoligono | null => {
    const sel = (annotazioni ?? []).find(
      (a) => a.id === selezioneId && a.tipo === 'quotaPoligono'
    ) as QuotaPoligono | undefined;
    if (sel) return sel;
    const poligoni = poligoniPianta();
    return poligoni.length === 1 ? poligoni[0] : null;
  };

  /** Esegue un comando del Menu Pianta (Pulizia/Ricostruisci) sul perimetro. */
  const eseguiComandoPianta = (cmd: ComandoPianta) => {
    if (!annotazioni) return;
    const poli = poligonoBersaglio();
    if (!poli) {
      mostraToast(
        'info',
        poligoniPianta().length > 1
          ? 'Seleziona prima la stanza su cui operare.'
          : 'Disegna prima la pianta: Disegno → Mano libera.'
      );
      return;
    }
    const scrivi = (mod: Partial<QuotaPoligono>) => {
      commitGeometria(
        annotazioni.map((a) =>
          a.id === poli.id
            ? ({ ...poli, lati: undefined, offsetLati: undefined, ...mod } as QuotaPoligono)
            : a
        )
      );
      setSelezioneId(poli.id);
      setStrumento('seleziona');
    };
    if (cmd === 'ricostruisci') {
      void ricostruisciPianta(poli);
      return;
    }
    if (cmd === 'unisci') {
      const r = fondiCollineari(poli.punti, segmentiPoligono(poli));
      if (!r) {
        mostraToast('info', 'Nessun lato allineato da unire.');
        return;
      }
      scrivi({ punti: r.punti, segmenti: r.segmenti });
      mostraToast('successo', `Uniti ${r.rimossi} vertici: lati allineati fusi.`);
      return;
    }
    const passo = cmd === 'snap30' ? 30 : cmd === 'snap45' ? 45 : 90;
    let nuoviPunti = snapAngoliPoligono(poli.punti, passo, passo / 2);
    // se la pianta è quotata e calibrata, dopo lo snap si riadattano le
    // LUNGHEZZE alle quote esistenti (come un CAD: lo snap aggiunge il vincolo
    // d'angolo mantenendo le quote), così le etichette restano veritiere
    const px = foto ? pxPerUnita(foto, poli.unita) : null;
    const segs = segmentiPoligono(poli);
    const nLati = poli.punti.length;
    if (px != null && segs.some((s) => segmentoELato(s, nLati) && s.valore != null)) {
      const esito = risolviParametrico(nuoviPunti, segs, { pxPerReale: px });
      if (esito.ok) nuoviPunti = esito.punti;
    }
    scrivi({ punti: nuoviPunti, snapAngolo: passo });
    mostraToast('successo', passo === 90 ? 'Pianta resa ortogonale.' : `Lati agganciati a ${passo}°.`);
  };

  /** Imposta una foto reale come riferimento (sfondo) della pianta, così lo
   *  schizzo si ricalca su una geometria ben proporzionata. Se la pianta ha
   *  già uno schizzo (tracciato su tela vuota, non allineato alla foto) lo si
   *  azzera per ridisegnarlo sulla base reale — l'operazione è annullabile. */
  const applicaSfondo = async (sorgente: Foto) => {
    if (!foto) return;
    setPickerSfondo(false);
    try {
      await impostaSfondoPianta(foto.id, sorgente);
      // ricarica subito lo sfondo (l'effetto che carica l'immagine è ancorato
      // all'id foto e non scatta al cambio di origine)
      cacheAnalisi.current = null;
      const img = await caricaImmagine(blobOrigine(sorgente));
      setImmagine(img);
      if (annotazioni && annotazioni.length > 0) commit([]);
      setSelezioneId(null);
      setStrumento('schizzo');
      mostraToast('successo', 'Foto di riferimento impostata: ricalca lo schizzo sulla foto.');
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Foto di riferimento non impostata.');
    }
  };

  const esporta = async () => {
    if (!foto || !annotazioni) return;
    salvaOra();
    try {
      const blob = await renderFotoAnnotata(
        foto,
        annotazioni,
        'image/jpeg',
        0.92,
        (a) => codiceLocaleForma(a, numeriForme),
        { legenda: true }
      );
      await condividiOScarica(
        blob,
        nomeFileSicuro(foto.didascalia || 'foto_quotata', 'jpg'),
        foto.didascalia || 'Foto quotata'
      );
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Export non riuscito.');
    }
  };

  // Numerazione condivisa delle forme del progetto. DEVE stare prima dei return
  // condizionali sotto: è uno hook (useMemo) e va eseguito a ogni render, anche
  // mentre la foto sta caricando, altrimenti React cambia il numero di hook tra
  // un render e l'altro e l'editor va in crash (schermo nero).
  const numeriForme = useMemo(() => {
    // numerazione DEL SOLO PROGETTO corrente (mai globale): i codici e i richiami
    // restano dentro il progetto aperto. Per la foto in modifica si usano le
    // annotazioni "vive"; per le altre foto del progetto quelle del DB.
    const lista = fotoProgetto && fotoProgetto.length ? fotoProgetto : foto ? [foto] : [];
    const percorsoDi = (fid: string) => {
      const ff = lista.find((f) => f.id === fid);
      return ff && progetto ? percorsoDellaFoto(ff, progetto, tutteCartelle ?? []) : [];
    };
    const annDi = (fid: string) =>
      fid === fotoId ? annotazioni ?? [] : (annotazioniProgetto ?? []).filter((a) => a.fotoId === fid);
    return numeriProgetto(lista, annDi, percorsoDi);
  }, [fotoId, annotazioni, annotazioniProgetto, progetto, tutteCartelle, fotoProgetto, foto]);

  // misure ORIGINALI richiamabili (una per famiglia) del SOLO progetto corrente:
  // il menu mostra solo gli originali (A1, A2, B1…) di questo progetto, non quelli
  // di altri progetti o cartelle (eviterebbero confusione e richiami sbagliati)
  const misureRichiamabili = useMemo(() => {
    const fotoDi = new Map((fotoProgetto ?? []).map((f) => [f.id, f]));
    // annotazioni del progetto, con la foto in modifica "viva"
    const annProg = (annotazioniProgetto ?? []).filter((a) => a.fotoId !== fotoId).concat(annotazioni ?? []);
    // raggruppa per famiglia, scegli l'originale (misura vera, non copia)
    const perFam = new Map<string, QuotaPoligono[]>();
    for (const a of annProg) {
      if (a.tipo !== 'quotaPoligono') continue;
      const k = famigliaDi(a);
      if (!perFam.has(k)) perFam.set(k, []);
      perFam.get(k)!.push(a);
    }
    const voci = [...perFam.entries()].map(([k, membri]) => {
      const orig = membri.find((m) => !m.soloEtichetta) ?? membri[0];
      const info = numeriForme.get(orig.id);
      const f = fotoDi.get(orig.fotoId);
      const perc = f && progetto ? percorsoDellaFoto(f, progetto, tutteCartelle ?? []) : [];
      const base = info ? `${info.etichettaFoto}${info.numero}` : codiceLocaleForma(orig, numeriForme);
      const codice = codiceCompletoForma(perc, base);
      const quante = membri.length;
      return {
        famiglia: k,
        originale: orig,
        codice,
        misura: etichettaPoligono(orig),
        dove: f?.didascalia?.trim() || (perc.length ? perc.join('.') : 'Foto'),
        nellaFoto: orig.fotoId === fotoId,
        quante
      };
    });
    voci.sort((a, b) => a.codice.localeCompare(b.codice, undefined, { numeric: true }));
    return voci;
  }, [annotazioniProgetto, fotoProgetto, progetto, tutteCartelle, numeriForme, annotazioni, fotoId]);

  if (foto && fotoIllegibile(foto)) {
    return <SchermataFotoDanneggiata foto={foto} />;
  }

  if (!foto || !immagine || annotazioni === null) {
    return (
      <div className="app">
        <header className="barra">
          <button className="btn icona" onClick={() => history.back()}>
            ←
          </button>
          <h1>{foto === null ? 'Foto non trovata' : 'Caricamento…'}</h1>
        </header>
      </div>
    );
  }

  const selezionata = annotazioni.find((a) => a.id === selezioneId) ?? null;

  // numerazione condivisa delle forme nel progetto: per la foto corrente usa le
  // annotazioni "vive", per le altre il DB. `numeriForme` (lo useMemo) è
  // dichiarato PRIMA dei return condizionali, qui restano solo funzioni pure.
  const annotazioniDi = (fid: string): Annotazione[] =>
    fid === fotoId ? annotazioni : (annotazioniProgetto ?? []).filter((a) => a.fotoId === fid);
  const codiceForma = (a: Annotazione) => codiceLocaleForma(a, numeriForme);

  // calibrazione da riferimento: dimensioni reali (auto-orientate) e piano
  // provvisorio per la griglia live mentre si aggiustano i 4 angoli
  const formatoSel: { id: string; nome: string; lungo: number; corto: number } | null =
    formatoRif === 'pers'
      ? formatoPers
        ? {
            id: 'pers',
            nome: `Pers. ${formattaNumero(formatoPers.lungo / 10)}×${formattaNumero(formatoPers.corto / 10)} cm`,
            ...formatoPers
          }
        : null
      : (FORMATI.find((f) => f.id === formatoRif) ?? null);
  const calibDims = calibQuad && formatoSel ? orientaFormato(calibQuad, formatoSel) : null;
  const calibPiano =
    calibQuad && calibDims
      ? { punti: calibQuad, larghezzaReale: calibDims.L, altezzaReale: calibDims.A, unita: 'mm' as const }
      : null;
  const calibGrigliaPiano = calibGriglia
    ? {
        punti: calibGriglia.punti,
        larghezzaReale: calibGriglia.celle * calibGriglia.L,
        altezzaReale: calibGriglia.celle * calibGriglia.A,
        unita: 'mm' as const
      }
    : null;

  /** annotazioni che si modificano nell'ambiente dedicato a tutto schermo:
   *  un tocco le apre direttamente, senza pannello in basso */
  const haAmbienteDedicato = (a: Annotazione) =>
    a.tipo === 'quota' ||
    a.tipo === 'quotaRaggio' ||
    a.tipo === 'quotaAngolo' ||
    a.tipo === 'quotaPoligono' ||
    a.tipo === 'testo' ||
    a.tipo === 'callout' ||
    a.tipo === 'quotaTecnica';

  /** un tocco "secco" sulla quota apre subito l'ambiente di modifica */
  const apriModifica = (id: string) => {
    const a = annotazioni.find((x) => x.id === id);
    if (!a) return;
    // una copia "solo etichetta" non ha un editor proprio (la misura è
    // dell'originale): si può solo spostare o eliminare
    if (a.tipo === 'quotaPoligono' && a.soloEtichetta) return;
    if (a.tipo === 'quotaPoligono') setQuotaInModifica({ tipo: 'poligono', id });
    else if (a.tipo === 'callout') setQuotaInModifica({ tipo: 'callout', id });
    else if (a.tipo === 'testo') setTestoInModifica(id);
    else if (a.tipo === 'quotaTecnica') setQuotaInModifica({ tipo: 'tecnica', id });
    else if (haAmbienteDedicato(a)) setQuotaInModifica({ tipo: 'quota', id });
  };

  const testoTarget =
    testoInModifica !== null
      ? annotazioni.find((a) => a.id === testoInModifica && a.tipo === 'testo')
      : null;

  const toggleLayer = (cat: CategoriaLayer) => {
    setLayerVisibili((l) => {
      const nuovi = { ...l, [cat]: !l[cat] };
      if (!nuovi[cat] && selezionata && categoriaAnnotazione(selezionata) === cat) {
        setSelezioneId(null);
      }
      return nuovi;
    });
  };

  return (
    <div className="editor">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => {
            salvaOra();
            naviga({ nome: 'progetto', id: foto.progettoId });
          }}
        >
          <Icona nome="indietro" />
        </button>
        <h1>{foto.didascalia || 'Foto'}</h1>
        {foto.dettaglioDi && (
          <span className="badge-dettaglio" title="Foto di dettaglio collegata a un'etichetta">
            Dettaglio <strong>{foto.dettaglioDi.lettera}</strong>
          </span>
        )}
        <StatoApp />
        <button className="btn icona" aria-label="Annulla" disabled={passato.current.length === 0} onClick={undo}>
          <Icona nome="annulla" />
        </button>
        <button className="btn icona" aria-label="Ripristina" disabled={futuro.current.length === 0} onClick={redo}>
          <Icona nome="ripristina" />
        </button>
        <button className="btn icona" aria-label="Note della foto" onClick={() => setSchedaNote(true)}>
          <Icona nome="documento" />
        </button>
        {foto.piano && (
          <button
            className={`btn icona${mostraGriglia ? ' attivo' : ''}`}
            aria-label="Griglia di verifica del piano"
            title="Griglia di verifica del piano"
            onClick={() => setMostraGriglia((g) => !g)}
          >
            <Icona nome="griglia" />
          </button>
        )}
        {foto.ePianta && (
          <button
            className="btn icona"
            aria-label="Foto di riferimento"
            title="Usa una foto reale come riferimento per lo schizzo"
            onClick={() => setPickerSfondo(true)}
          >
            <Icona nome="fotocamera" />
          </button>
        )}
        {foto.ePianta && (
          <button
            className={`btn icona${foto.sfondoNascosto ? ' attivo' : ''}`}
            aria-label={foto.sfondoNascosto ? 'Mostra la foto di sfondo' : 'Nascondi la foto di sfondo'}
            title={foto.sfondoNascosto ? 'Mostra la foto di sfondo' : 'Nascondi la foto di sfondo'}
            onClick={() => void aggiornaFoto(foto.id, { sfondoNascosto: !foto.sfondoNascosto })}
          >
            <Icona nome="immagine" />
          </button>
        )}
        <button
          className={`btn icona${snapAttivo || vincolo !== 'off' || bordiAttivo ? ' attivo' : ''}`}
          aria-label="Opzioni di disegno"
          onClick={() => {
            setSchedaOpzioni(true);
            setMenuAperto(null);
          }}
        >
          <Icona nome="impostazioni" />
        </button>
        <button className="btn icona" aria-label="Esporta immagine" onClick={() => void esporta()}>
          <Icona nome="condividi" />
        </button>
      </header>

      <StageEditor
        foto={foto}
        immagine={immagine}
        annotazioni={annotazioni}
        codiceForma={codiceForma}
        selezioneId={selezioneId}
        strumento={strumento}
        snapAttivo={snapAttivo}
        vincolo={vincolo}
        sogliaSnap={impostazioni.sogliaSnap}
        ricercaBordi={ricercaBordi}
        filtroVisibile={(a) => layerVisibili[categoriaAnnotazione(a)]}
        proposte={proposta ? [proposta] : []}
        onAutoTocco={autoTocco}
        onRiferimento={riferimentoTocco}
        calibQuad={calibQuad}
        onCalibQuad={setCalibQuad}
        calibPiano={calibPiano}
        calibGrigliaPiano={calibGrigliaPiano}
        onCalibGrigliaCorner={(punti) => setCalibGriglia((g) => (g ? { ...g, punti } : g))}
        mostraGriglia={mostraGriglia}
        celleGriglia={calibGriglia ? calibGriglia.celle : celleGriglia}
        inquadra={inquadraCalib}
        onAutoTraccia={autoTraccia}
        onSeleziona={setSelezioneId}
        onModifica={apriModifica}
        onCommit={commitGeometria}
        onNuovaQuota={creaQuota}
        onNuovoRett={creaRettangolo}
        onNuovoQuad={creaQuad}
        onNuovoPoligono={creaPoligono}
        onNuovoAngolo={creaAngolo}
        onNuovoRaggio={creaRaggio}
        onNuovoCerchio3p={creaCerchio3p}
        onErrore={(msg) => mostraToast('errore', msg)}
        onNuovoTesto={creaTesto}
        onNuovaEtichetta={creaEtichetta}
        onMenuEtichetta={apriMenuEtichetta}
        onNuovaFreccia={creaFreccia}
        onNuovoDisegno={creaDisegno}
        onNuovoSchizzo={creaSchizzo}
        onNuovaForma={creaForma}
        onPuntoTecnico={(pt) => setPuntiTecnici((punti) => [...punti, pt])}
        puntiTecnici={STRUMENTI_POSA_TECNICA.has(strumento) ? puntiTecnici : null}
        onNuovoDatum={creaDatum}
        onNuovoForo={creaForo}
        onNuovoSmusso={creaSmusso}
        onNuovaFilettatura={creaFilettatura}
        onNuovoCallout={creaCallout}
        onCalibra={(p1, p2) => setSchedaScala({ px: distanza(p1, p2) })}
        onPiano={(punti) => setSchedaPiano({ punti })}
        onDuplica={duplicaMaster ? duplicaTocco : null}
      />

      {strumento === 'etichetta' && !menuEtichetta && (
        <div className="barra-etichetta" role="status">
          <span className="lettera">{letteraAttiva}</span>
          <span className="hint">Tap per posare · tieni premuto per cambiare lettera</span>
          <button className="btn primario" onClick={() => setLegendaAperta(true)}>
            <Icona nome="documento" dimensione={18} /> Legenda
          </button>
          <button className="btn" onClick={() => setStrumento('seleziona')}>
            <Icona nome="check" dimensione={18} /> Fine
          </button>
        </div>
      )}

      {strumento === 'schizzo' && (
        <div className="barra-etichetta" role="status">
          <span className="hint">Traccia il contorno chiuso della stanza · snap:</span>
          <span className="segmenti" role="group" aria-label="Snap angolare dello schizzo">
            {(
              [
                [0, 'libero'],
                [30, '30°'],
                [45, '45°'],
                [90, '90°']
              ] as const
            ).map(([v, etichetta]) => (
              <button
                key={v}
                className={snapSchizzo === v ? 'attivo' : ''}
                onClick={() => setSnapSchizzo(v)}
                title={v === 0 ? 'Nessuno snap angolare' : `Aggancia i lati a multipli di ${v}°`}
              >
                {etichetta}
              </button>
            ))}
          </span>
          <button className="btn" onClick={() => setStrumento('seleziona')}>
            <Icona nome="check" dimensione={18} /> Fine
          </button>
        </div>
      )}

      {modalitaMenu === 'pianta' &&
        strumento !== 'schizzo' &&
        (() => {
          const poli = poligonoBersaglio();
          if (!poli)
            return (
              <div className="barra-etichetta" role="status">
                <span className="hint">
                  {poligoniPianta().length > 1
                    ? 'Menu Pianta · seleziona una stanza per operare'
                    : 'Menu Pianta · Disegno → Mano libera per tracciare la stanza'}
                </span>
              </div>
            );
          const stato = statoSchizzo(poli.punti, segmentiPoligono(poli));
          const info: Record<typeof stato, [string, string]> = {
            nonVincolato: ['Non vincolato', '#ff9500'],
            parziale: ['Parzialmente vincolato', '#ffd21e'],
            completo: ['Completamente vincolato', 'var(--ok)'],
            sovravincolato: ['Sovravincolato', '#ff453a']
          };
          return (
            <div className="barra-etichetta" role="status">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden
                  style={{ width: 11, height: 11, borderRadius: 999, background: info[stato][1] }}
                />
                <span className="hint">Pianta: {info[stato][0]}</span>
              </span>
              <span className="hint" style={{ opacity: 0.65 }}>
                Tocca un lato per quotarlo o vincolarlo
              </span>
            </div>
          );
        })()}

      {STRUMENTI_POSA_TECNICA.has(strumento) && (
        <div className="barra-etichetta" role="status">
          <span className="hint">
            {puntiTecnici.length === 0
              ? ETICHETTA_POSA_TECNICA[strumento]
              : `${puntiTecnici.length} ${puntiTecnici.length === 1 ? 'punto' : 'punti'} · tocca per aggiungere`}
          </span>
          {puntiTecnici.length > 0 && (
            <button
              className="btn"
              onClick={() => setPuntiTecnici((punti) => punti.slice(0, -1))}
              aria-label="Annulla ultimo punto"
            >
              <Icona nome="annulla" dimensione={18} /> Indietro
            </button>
          )}
          <button
            className="btn primario"
            disabled={puntiTecnici.length < 2}
            onClick={creaQuotaTecnica}
          >
            <Icona nome="check" dimensione={18} /> Genera
          </button>
          <button
            className="btn"
            onClick={() => {
              setPuntiTecnici([]);
              setStrumento('seleziona');
            }}
          >
            <Icona nome="chiudi" dimensione={18} /> Annulla
          </button>
        </div>
      )}

      {strumento === 'tecDatum' && (
        <div className="barra-etichetta" role="status">
          <span className="hint">Tocca per posare un riferimento (datum); la lettera è automatica</span>
          <button className="btn" onClick={() => setStrumento('seleziona')}>
            <Icona nome="check" dimensione={18} /> Fine
          </button>
        </div>
      )}

      {strumento === 'tecForo' && (
        <div className="barra-etichetta" role="status">
          <span className="hint">Tocca 3 punti sul bordo del foro: centro e ⌀/R automatici</span>
          <button className="btn" onClick={() => setStrumento('seleziona')}>
            <Icona nome="check" dimensione={18} /> Fine
          </button>
        </div>
      )}

      {strumento === 'tecSmusso' && (
        <div className="barra-etichetta" role="status">
          <span className="hint">Tocca i due estremi del segmento smussato</span>
          <button className="btn" onClick={() => setStrumento('seleziona')}>
            <Icona nome="check" dimensione={18} /> Fine
          </button>
        </div>
      )}

      {strumento === 'tecFilettatura' && (
        <div className="barra-etichetta" role="status">
          <span className="hint">Tocca il punto della filettatura; i dati si impostano dopo</span>
          <button className="btn" onClick={() => setStrumento('seleziona')}>
            <Icona nome="check" dimensione={18} /> Fine
          </button>
        </div>
      )}

      {legendaAperta &&
        (() => {
          const conta: Record<string, number> = {};
          for (const f of fotoProgetto ?? []) {
            if (foto && f.dettaglioDi?.fotoId === foto.id) {
              conta[f.dettaglioDi.lettera] = (conta[f.dettaglioDi.lettera] ?? 0) + 1;
            }
          }
          return (
            <AmbienteLegenda
              voci={vociLegenda(annotazioni ?? [])}
              dettagliPerLettera={conta}
              onCambia={cambiaDescrizioneLegenda}
              onGestisciFoto={(lettera) => {
                const rep = (annotazioni ?? []).find(
                  (a): a is Etichetta => a.tipo === 'etichetta' && a.lettera === lettera
                );
                if (!rep) return;
                setLegendaAperta(false);
                setEtichettaInModifica(rep.id);
              }}
              onChiudi={() => setLegendaAperta(false)}
            />
          );
        })()}

      {etichettaInModifica &&
        (() => {
          const et = (annotazioni ?? []).find(
            (a): a is Etichetta => a.tipo === 'etichetta' && a.id === etichettaInModifica
          );
          if (!et) return null;
          const desc =
            vociLegenda(annotazioni ?? []).find((v) => v.lettera === et.lettera)?.descrizione ??
            et.descrizione ??
            '';
          // i dettagli sono collegati per LETTERA (di questa foto), non al
          // singolo badge: così valgono per tutte le etichette uguali
          const dettagli = (fotoProgetto ?? []).filter(
            (f) => f.dettaglioDi?.fotoId === foto.id && f.dettaglioDi?.lettera === et.lettera
          );
          // solo foto NON già usate come dettaglio (niente "furto" silenzioso
          // di un dettaglio da un'altra etichetta/foto) ed esclusa la principale
          const candidati = (fotoProgetto ?? []).filter((f) => f.id !== foto.id && !f.dettaglioDi);
          return (
            <ModificaEtichetta
              lettera={et.lettera}
              descrizione={desc}
              dettagli={dettagli}
              candidati={candidati}
              onApplica={(m) => modificaEtichetta(et.id, m)}
              onAggiungiDettaglio={(file) => void creaFotoDettaglio(et, file)}
              onCollega={(idDett) => void collegaFotoDettaglio(et, idDett)}
              onApriDettaglio={(idDett) => {
                salvaOra();
                setEtichettaInModifica(null);
                naviga({ nome: 'foto', id: idDett });
              }}
              onChiudi={() => setEtichettaInModifica(null)}
            />
          );
        })()}

      {quotaInModifica?.tipo === 'tecnica' &&
        foto &&
        annotazioni &&
        (() => {
          const a0 = annotazioni.find((a) => a.id === quotaInModifica.id);
          if (!a0 || a0.tipo !== 'quotaTecnica') return null;
          return (
            <AmbienteQuotaturaTecnica
              quota={a0}
              foto={foto}
              onModifica={(nuova) =>
                commit(annotazioni.map((a) => (a.id === nuova.id ? nuova : a)))
              }
              onElimina={() => {
                commit(annotazioni.filter((a) => a.id !== a0.id));
                if (selezioneId === a0.id) setSelezioneId(null);
                setQuotaInModifica(null);
              }}
              onChiudi={() => setQuotaInModifica(null)}
            />
          );
        })()}

      {menuEtichetta && (
        <MenuCircolareEtichette
          centro={{ x: menuEtichetta.x, y: menuEtichetta.y }}
          sequenza={SEQUENZA_ETICHETTE}
          indiceIniziale={menuEtichetta.indice}
          onScegli={(l) => {
            setLetteraAttiva(l);
            setMenuEtichetta(null);
          }}
          onChiudi={() => setMenuEtichetta(null)}
        />
      )}

      {proposta ? (
        <div className="pannello-proprieta" role="group" aria-label="Quota proposta">
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icona nome="auto" dimensione={18} /> Elemento rilevato
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color: confidenza >= 0.55 ? 'var(--ok)' : confidenza >= 0.4 ? '#ff9500' : 'var(--testo-2)'
            }}
            title="Confidenza del rilevamento automatico"
          >
            {confidenza >= 0.55 ? '● netto' : confidenza >= 0.4 ? '◐ incerto' : '○ debole'}
          </span>
          <button className="btn primario" onClick={accettaProposta}>
            <Icona nome="check" dimensione={18} /> Quote
          </button>
          <button className="btn" onClick={accettaCerchio} title="Inscrivi una circonferenza nell'elemento rilevato">
            <Icona nome="cerchio" dimensione={18} /> Cerchio
          </button>
          <button className="btn pericolo" onClick={chiudiProposta}>
            <Icona nome="chiudi" dimensione={18} /> Annulla
          </button>
        </div>
      ) : (
        selezionata &&
        !haAmbienteDedicato(selezionata) && (
          <PannelloProprieta
            ann={selezionata}
            annotazioni={annotazioni}
            foto={foto}
            inputValore={inputValore}
            onModifica={aggiornaSelezionata}
            onElimina={eliminaSelezionata}
            onModificaTesto={() => setTestoInModifica(selezionata.id)}
            onModificaLegenda={() => setLegendaAperta(true)}
            onModificaEtichetta={() => setEtichettaInModifica(selezionata.id)}
            onModificaQuota={() => setQuotaInModifica({ tipo: 'quota', id: selezionata.id })}
            onModificaSegmento={(indice) =>
              setQuotaInModifica({ tipo: 'segmento', id: selezionata.id, indice })
            }
            onCalibraDaQuota={(q) => void calibraDaQuota(q)}
          />
        )
      )}

      {/* oggetto selezionato (con ambiente dedicato): subito due pulsanti
          discreti — Modifica ed Elimina — senza dover azzeccare il secondo tap */}
      {!proposta &&
        !duplicaMaster &&
        strumento === 'seleziona' &&
        selezionata &&
        haAmbienteDedicato(selezionata) &&
        quotaInModifica === null &&
        testoInModifica === null && (
          <div className="azioni-flottanti" role="group" aria-label="Azioni elemento">
            {!(selezionata.tipo === 'quotaPoligono' && selezionata.soloEtichetta) && (
              <button
                className="azione-flottante modifica"
                aria-label="Modifica"
                title="Modifica"
                onClick={() => apriModifica(selezionata.id)}
              >
                <Icona nome="matita" dimensione={20} />
              </button>
            )}
            {selezionata.tipo === 'quotaTecnica' && (
              <>
                <button
                  className="azione-flottante dimensione"
                  aria-label="Riduci dimensione"
                  title="Riduci dimensione"
                  onClick={() => scalaStileSelezionata(1 / 1.25)}
                >
                  A−
                </button>
                <button
                  className="azione-flottante dimensione"
                  aria-label="Aumenta dimensione"
                  title="Aumenta dimensione"
                  onClick={() => scalaStileSelezionata(1.25)}
                >
                  A＋
                </button>
              </>
            )}
            {selezionata.tipo === 'quotaPoligono' && (
              <button
                className="azione-flottante duplica"
                aria-label="Duplica misura su elementi uguali"
                title="Duplica su elementi uguali"
                onClick={avviaDuplica}
              >
                <Icona nome="duplica" dimensione={20} />
              </button>
            )}
            <button
              className="azione-flottante elimina"
              aria-label="Elimina"
              title="Elimina"
              onClick={eliminaSelezionata}
            >
              <Icona nome="cestino" dimensione={20} />
            </button>
          </div>
        )}

      {/* MODALITÀ DUPLICA: tocca gli altri elementi uguali per ripetere la misura */}
      {duplicaMaster && (
        <div className="barra-duplica" role="group" aria-label="Duplica misura">
          <span className="titolo">
            <Icona nome="duplica" dimensione={18} /> Tocca gli elementi uguali a{' '}
            <strong>{codiceForma(duplicaMaster)}</strong>
          </span>
          <span className="spazio" />
          <button className="btn primario" onClick={() => setDuplicaMaster(null)}>
            <Icona nome="check" dimensione={18} /> Fine
          </button>
        </div>
      )}

      {/* MENU RICHIAMO: elenco delle misure ORIGINALI richiamabili nel progetto */}
      {menuRichiamo && (
        <Modale titolo="Richiama una misura" onChiudi={() => setMenuRichiamo(false)}>
          <p className="aiuto" style={{ marginTop: 0 }}>
            Scegli una misura già presa: la riporti su questa foto toccando gli elementi
            uguali, senza rimisurarla. Vengono mostrate solo le misure originali.
          </p>
          {misureRichiamabili.length === 0 ? (
            <p className="vuoto">Nessuna misura ancora creata in questo progetto.</p>
          ) : (
            <div className="lista-richiamo" role="menu">
              {misureRichiamabili.map((m) => (
                <button
                  key={m.famiglia}
                  className="voce-richiamo"
                  role="menuitem"
                  onClick={() => void richiamaMisura(m.originale)}
                >
                  <span className="codice">{m.codice}</span>
                  <span className="dettaglio">
                    <span className="misura">{m.misura}</span>
                    <span className="dove">
                      {m.dove}
                      {m.nellaFoto ? ' · questa foto' : ''}
                      {m.quante > 1 ? ` · ${m.quante} elementi` : ''}
                    </span>
                  </span>
                  <span className="freccia">
                    <Icona nome="duplica" dimensione={20} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </Modale>
      )}

      {/* STADIO 1: riferimento rilevato, si aggiustano i 4 angoli (zoomati) */}
      {riferimentoPunto && !calibGriglia && (
        <div className="barra-calibra" role="group" aria-label="Riferimento di calibrazione">
          <span className="titolo">
            <Icona nome="righello" dimensione={18} /> Aggiusta i 4 angoli del riferimento
          </span>
          <span className="spazio" />
          {/* menu separato per il formato */}
          <span className="colore-wrap">
            <button
              className={`btn${formatoRif === 'pers' && !formatoPers ? ' attivo' : ''}`}
              onClick={() =>
                formatoRif === 'pers' && !formatoPers ? setSchedaFormatoPers(true) : setMenuFormato((m) => !m)
              }
            >
              {formatoSel ? formatoSel.nome : 'Personalizzato — imposta misure'} ▾
            </button>
            {menuFormato && (
              <>
                <div className="backdrop-strumenti" onClick={() => setMenuFormato(false)} />
                <div className="popover-formato" role="menu" aria-label="Formato del riferimento">
                  <button
                    className={`btn${formatoRif === 'pers' ? ' attivo' : ''}`}
                    onClick={() => {
                      setFormatoRif('pers');
                      setMenuFormato(false);
                      setSchedaFormatoPers(true);
                    }}
                  >
                    ✎ Personalizzato…
                  </button>
                  {FORMATI.map((f) => (
                    <button
                      key={f.id}
                      className={`btn${formatoRif === f.id ? ' attivo' : ''}`}
                      onClick={() => {
                        setFormatoRif(f.id);
                        setMenuFormato(false);
                      }}
                    >
                      {f.nome}
                    </button>
                  ))}
                </div>
              </>
            )}
          </span>
          <button className="btn" title="Celle della griglia" onClick={() => setCelleGriglia((c) => (c >= 7 ? 3 : c + 2))}>
            ▦ {celleGriglia}×{celleGriglia}
          </button>
          <span
            className="confid"
            style={{ color: confidenza >= 0.55 ? 'var(--ok)' : confidenza >= 0.4 ? '#ff9500' : 'var(--testo-2)' }}
          >
            {confidenza >= 0.55 ? '●' : confidenza >= 0.4 ? '◐' : '○'}
          </span>
          <button className="btn primario" disabled={!calibQuad || !calibDims} onClick={generaGriglia}>
            Calibra →
          </button>
          <button className="btn pericolo" onClick={chiudiRiferimento}>
            ✕
          </button>
        </div>
      )}

      {/* STADIO 2: griglia proiettata, si trascinano i 4 angoli ESTERNI */}
      {calibGriglia && (
        <div className="barra-calibra" role="group" aria-label="Regolazione fine della griglia">
          <span className="titolo">▦ Trascina i 4 angoli esterni sulla scena reale</span>
          <span className="spazio" />
          <button className="btn" onClick={tornaAlRiferimento}>
            ← Riferimento
          </button>
          <button className="btn primario" onClick={confermaGriglia}>
            ✓ Conferma
          </button>
          <button className="btn pericolo" onClick={chiudiRiferimento}>
            ✕
          </button>
        </div>
      )}

      {/* cursore di sensibilità: stesso comportamento dell'autoquotatura, sia
          per la quota proposta sia per il riferimento di calibrazione */}
      {((proposta && propostaSorgente) || (riferimentoPunto && !calibGriglia)) &&
        (() => {
          const cambia = riferimentoPunto ? aggiornaSensibilitaRif : aggiornaSensibilita;
          return (
            <div className="sensibilita-flottante" role="group" aria-label="Sensibilità ai bordi">
              <button
                className="passo"
                aria-label="Più sensibile (bordi deboli)"
                onClick={() => cambia(Math.min(100, sensibilita + 5))}
              >
                ＋
              </button>
              <input
                type="range"
                className="cursore-vert"
                min={0}
                max={100}
                step={5}
                aria-label="Sensibilità ai bordi"
                value={sensibilita}
                onChange={(e) => cambia(Number(e.target.value))}
              />
              <button
                className="passo"
                aria-label="Meno sensibile (solo bordi netti)"
                onClick={() => cambia(Math.max(0, sensibilita - 5))}
              >
                −
              </button>
              <span className="etichetta">bordi</span>
            </div>
          );
        })()}

      <div className="barra-strumenti">
        {menuAperto && (
          <div className="backdrop-strumenti" onClick={() => setMenuAperto(null)} />
        )}
        {menuAperto &&
          modalitaMenu === 'pianta' &&
          (() => {
            const g = GRUPPI_STRUMENTI_PIANTA.find((x) => x.id === menuAperto);
            if (!g) return null;
            return (
              <div className="pannello-strumenti" role="menu" aria-label={g.testo}>
                {g.voci.map((v, i) => (
                  <button
                    key={i}
                    className={`btn-strumento-grande${v.tool && strumento === v.tool ? ' attivo' : ''}`}
                    onClick={() => {
                      setMenuAperto(null);
                      if (v.tool) {
                        setStrumento(v.tool);
                        return;
                      }
                      if (v.cmd) {
                        eseguiComandoPianta(v.cmd);
                        return;
                      }
                      if (v.suggerimento) {
                        mostraToast('info', v.suggerimento);
                        return;
                      }
                      if (v.fase) {
                        mostraToast('info', `“${v.testo}” arriva nella Fase ${v.fase} del Menu Pianta.`);
                      }
                    }}
                  >
                    <span className="ico">
                      <Icona nome={v.icona} dimensione={26} />
                    </span>
                    <span>{v.testo}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        {menuAperto &&
          modalitaMenu !== 'pianta' &&
          (() => {
            const set = modalitaTecnica ? GRUPPI_STRUMENTI_TECNICA : GRUPPI_STRUMENTI;
            const g = set.find((x) => x.id === menuAperto);
            if (!g) return null;
            return (
              <div className="pannello-strumenti" role="menu" aria-label={g.testo}>
                {g.voci.map((v) => (
                  <button
                    key={v.s}
                    className={`btn-strumento-grande${strumento === v.s ? ' attivo' : ''}`}
                    onClick={() => {
                      setMenuAperto(null);
                      if (STRUMENTI_POSA_TECNICA.has(v.s)) {
                        // posa guidata sulla foto (no modale)
                        setPuntiTecnici([]);
                        setStrumento(v.s);
                        return;
                      }
                      if (
                        v.s === 'tecDatum' ||
                        v.s === 'tecForo' ||
                        v.s === 'tecSmusso' ||
                        v.s === 'tecFilettatura'
                      ) {
                        // posa diretta sulla foto (datum/filettatura 1 tap, smusso 2, foro 3)
                        setStrumento(v.s);
                        return;
                      }
                      if (STRUMENTI_TECNICI.has(v.s)) {
                        // sicurezza: strumenti tecnici non ancora implementati
                        setStrumento('seleziona');
                        mostraToast('info', 'Questo strumento tecnico arriva nelle prossime fasi.');
                        return;
                      }
                      setStrumento(v.s);
                    }}
                  >
                    <span className="ico">
                      <Icona nome={v.icona} dimensione={26} />
                    </span>
                    <span>{v.testo}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        <nav className="editor-toolbar" aria-label="Strumenti">
          <BtnStrumento
            attivo={strumento === 'seleziona'}
            onClick={() => {
              setStrumento('seleziona');
              setMenuAperto(null);
            }}
            icona="cursore"
            testo="Seleziona"
          />
          <BtnStrumento
            attivo={strumento === 'auto'}
            onClick={() => {
              setStrumento('auto');
              setMenuAperto(null);
            }}
            icona="auto"
            testo="Auto"
          />
          <BtnStrumento
            attivo={menuRichiamo || !!duplicaMaster}
            onClick={() => {
              setStrumento('seleziona');
              setMenuAperto(null);
              setSelezioneId(null);
              setMenuRichiamo(true);
            }}
            icona="duplica"
            testo="Richiama"
          />
          {modalitaMenu !== 'pianta' &&
            (modalitaTecnica ? GRUPPI_STRUMENTI_TECNICA : GRUPPI_STRUMENTI).map((g) => {
              const voceAtt = g.voci.find((v) => v.s === strumento);
              return (
                <BtnStrumento
                  key={g.id}
                  attivo={!!voceAtt}
                  gruppo
                  onClick={() => setMenuAperto((m) => (m === g.id ? null : g.id))}
                  icona={voceAtt?.icona ?? g.icona}
                  testo={g.testo}
                />
              );
            })}
          {modalitaMenu === 'pianta' &&
            GRUPPI_STRUMENTI_PIANTA.map((g) => {
              const attivo = g.voci.some((v) => v.tool && v.tool === strumento);
              return (
                <BtnStrumento
                  key={g.id}
                  attivo={attivo}
                  gruppo
                  onClick={() => setMenuAperto((m) => (m === g.id ? null : g.id))}
                  icona={g.icona}
                  testo={g.testo}
                />
              );
            })}
          {/* selettore del menu: base · tecnica · pianta (mutuamente esclusivi) */}
          <BtnStrumento
            attivo={modalitaMenu === 'tecnica'}
            onClick={() => {
              setMenuAperto(null);
              setStrumento('seleziona');
              setModalitaMenu((m) => (m === 'tecnica' ? 'base' : 'tecnica'));
            }}
            icona="righello"
            testo="Tecnica"
          />
          {foto.ePianta && (
            <BtnStrumento
              attivo={modalitaMenu === 'pianta'}
              onClick={() => {
                setMenuAperto(null);
                setStrumento('seleziona');
                setModalitaMenu((m) => (m === 'pianta' ? 'base' : 'pianta'));
              }}
              icona="griglia"
              testo="Pianta"
            />
          )}
        </nav>
      </div>

      {schedaOpzioni && (
        <Modale titolo="Opzioni di disegno" onChiudi={() => setSchedaOpzioni(false)}>
          <div className="campo">
            <label>Aggancio (snap)</label>
            <span className="segmenti" role="group">
              <button className={snapAttivo ? 'attivo' : ''} onClick={() => setSnapAttivo(true)}>
                <Icona nome="magnete" dimensione={18} /> Punti quota
              </button>
              <button className={!snapAttivo ? 'attivo' : ''} onClick={() => setSnapAttivo(false)}>
                Libero
              </button>
            </span>
          </div>
          <div className="campo">
            <label>Aggancio ai bordi dell'immagine (contorni)</label>
            <span className="segmenti" role="group">
              <button className={bordiAttivo ? 'attivo' : ''} onClick={() => setBordiAttivo(true)}>
                ◫ Attivo
              </button>
              <button className={!bordiAttivo ? 'attivo' : ''} onClick={() => setBordiAttivo(false)}>
                Spento
              </button>
            </span>
          </div>
          <div className="campo">
            <label>Vincolo di direzione</label>
            <span className="segmenti" role="group">
              <button className={vincolo === 'off' ? 'attivo' : ''} onClick={() => setVincolo('off')}>
                Libero
              </button>
              <button className={vincolo === 'orto' ? 'attivo' : ''} onClick={() => setVincolo('orto')}>
                ∟ Orto
              </button>
              <button className={vincolo === 'angolo15' ? 'attivo' : ''} onClick={() => setVincolo('angolo15')}>
                ∠ 15°
              </button>
            </span>
          </div>
          <div className="campo">
            <label>Livelli visibili</label>
            <span className="segmenti" role="group">
              <button className={layerVisibili.quote ? 'attivo' : ''} onClick={() => toggleLayer('quote')}>
                <Icona nome="righello" dimensione={18} /> Quote
              </button>
              <button className={layerVisibili.note ? 'attivo' : ''} onClick={() => toggleLayer('note')}>
                <Icona nome="documento" dimensione={18} /> Note
              </button>
              <button className={layerVisibili.callout ? 'attivo' : ''} onClick={() => toggleLayer('callout')}>
                <Icona nome="dettaglio" dimensione={18} /> Dettagli
              </button>
            </span>
          </div>
          <div className="riga-pulsanti">
            <button className="btn primario" onClick={() => setSchedaOpzioni(false)}>
              Fatto
            </button>
          </div>
        </Modale>
      )}
      {schedaNote && (
        <SchedaNoteFoto
          foto={foto}
          onRimuoviCalibrazione={ricalcolaConCalibrazione}
          onChiudi={() => setSchedaNote(false)}
        />
      )}
      {pickerSfondo &&
        (() => {
          // niente piante, né la foto stessa, né foto danneggiate (origine vuota):
          // impostarne una svuoterebbe la pianta rendendola illeggibile
          const candidati = (fotoProgetto ?? []).filter(
            (f) => !f.ePianta && f.id !== foto.id && !fotoIllegibile(f)
          );
          const haSchizzo = (annotazioni?.length ?? 0) > 0;
          return (
            <Modale titolo="Foto di riferimento" onChiudi={() => setPickerSfondo(false)}>
              <p style={{ color: 'var(--testo-2)', marginTop: 0 }}>
                Scegli una foto del progetto: diventa lo sfondo della pianta, così ricalchi lo
                schizzo su una geometria già proporzionata. Potrai nasconderla in qualsiasi momento.
              </p>
              {haSchizzo && (
                <p style={{ color: '#ff9500', fontWeight: 700, fontSize: 13 }}>
                  ⚠ La pianta ha già uno schizzo: impostando la foto verrà rimosso per ridisegnarlo
                  sulla foto (puoi annullare con ↶).
                </p>
              )}
              {candidati.length === 0 ? (
                <p style={{ color: 'var(--testo-2)' }}>
                  Nessuna foto disponibile nel progetto. Scatta o importa una foto, poi riprova.
                </p>
              ) : (
                <div
                  className="griglia-foto-scelta"
                  style={{ marginTop: 8, maxHeight: '52vh', overflowY: 'auto' }}
                >
                  {candidati.map((f) => (
                    <button
                      key={f.id}
                      className="cella-foto"
                      title={f.didascalia || 'Foto'}
                      onClick={() => void applicaSfondo(f)}
                    >
                      <ImmagineBlob dati={f.miniatura} tipo={f.miniaturaTipo} alt={f.didascalia || 'Foto'} />
                    </button>
                  ))}
                </div>
              )}
            </Modale>
          );
        })()}
      {schedaScala && (
        <SchedaScala
          px={schedaScala.px}
          unitaDefault={impostazioni.unitaDefault}
          onChiudi={() => setSchedaScala(null)}
          onSalva={(reale, unita) => {
            void salvaScala(schedaScala.px, reale, unita);
            setSchedaScala(null);
          }}
        />
      )}
      {schedaPiano && (
        <SchedaPiano
          unitaDefault={impostazioni.unitaDefault}
          punti={schedaPiano.punti}
          onChiudi={() => setSchedaPiano(null)}
          onSalva={(larghezza, altezza, unita) => {
            void salvaPiano(schedaPiano.punti, larghezza, altezza, unita);
            setSchedaPiano(null);
          }}
        />
      )}
      {schedaFormatoPers && (
        <SchedaFormatoPers
          unitaDefault={impostazioni.unitaDefault}
          iniziale={formatoPers}
          onChiudi={() => setSchedaFormatoPers(false)}
          onSalva={(lungo, corto) => {
            setFormatoPers({ lungo, corto });
            setFormatoRif('pers');
            setSchedaFormatoPers(false);
          }}
        />
      )}
      {testoTarget && testoTarget.tipo === 'testo' && (
        <EditorTesto
          testo={testoTarget}
          immagine={immagine}
          onChiudi={() => {
            // un testo vuoto appena creato non lascia residui
            if (testoTarget.testo.trim() === '') {
              commit(annotazioni.filter((a) => a.id !== testoTarget.id));
              setSelezioneId(null);
            }
            setTestoInModifica(null);
          }}
          onElimina={() => {
            commit(annotazioni.filter((a) => a.id !== testoTarget.id));
            setSelezioneId(null);
            setTestoInModifica(null);
          }}
          onSalva={(nuovo) => {
            if (nuovo.testo.trim() === '') {
              commit(annotazioni.filter((a) => a.id !== nuovo.id));
              setSelezioneId(null);
            } else {
              commit(annotazioni.map((a) => (a.id === nuovo.id ? nuovo : a)));
            }
            setTestoInModifica(null);
          }}
        />
      )}
      {quotaInModifica &&
        quotaInModifica.tipo === 'quota' &&
        (() => {
          const a0 = annotazioni.find((a) => a.id === quotaInModifica.id);
          if (!a0) return null;
          const chiudi = () => setQuotaInModifica(null);
          const elimina = () => {
            commit(annotazioni.filter((a) => a.id !== a0.id));
            setSelezioneId(null);
            setQuotaInModifica(null);
          };
          const salva = (nuova: Annotazione) => {
            commit(annotazioni.map((a) => (a.id === nuova.id ? nuova : a)));
            setQuotaInModifica(null);
          };
          if (a0.tipo === 'quota')
            return (
              <EditorQuota quota={a0} immagine={immagine} onChiudi={chiudi} onElimina={elimina} onSalva={salva} />
            );
          if (a0.tipo === 'quotaRaggio')
            return (
              <EditorCerchio raggio={a0} foto={foto} immagine={immagine} onChiudi={chiudi} onElimina={elimina} onSalva={salva} />
            );
          if (a0.tipo === 'quotaAngolo')
            return (
              <EditorAngolo angolo={a0} foto={foto} immagine={immagine} onChiudi={chiudi} onElimina={elimina} onSalva={salva} />
            );
          return null;
        })()}
      {quotaInModifica &&
        quotaInModifica.tipo === 'poligono' &&
        (() => {
          const rif = quotaInModifica;
          const poli = annotazioni.find((a) => a.id === rif.id && a.tipo === 'quotaPoligono') as
            | QuotaPoligono
            | undefined;
          if (!poli) return null;
          return (
            <EditorPoligono
              poli={poli}
              foto={foto}
              immagine={immagine}
              codice={codiceForma(poli)}
              numero={numeriForme.get(poli.id)?.numero}
              onNumero={(n) => {
                const ord = ordinePerNumero(poli, n, fotoProgetto ?? [foto], annotazioniDi);
                if (ord !== null) {
                  commit(annotazioni.map((a) => (a.id === poli.id ? { ...a, ordine: ord } : a)));
                }
              }}
              onModifica={(mod) =>
                commit(
                  annotazioni.map((a) =>
                    a.id === poli.id
                      ? ({ ...poli, lati: undefined, offsetLati: undefined, ...mod } as QuotaPoligono)
                      : a
                  )
                )
              }
              onModificaSegmento={(indice) => setQuotaInModifica({ tipo: 'segmento', id: poli.id, indice })}
              onSnapAngoli={(passo) =>
                // pulsante esplicito: tolleranza = passo/2 → aggancia TUTTI i lati
                // al multiplo più vicino (non solo quelli già quasi allineati)
                commitGeometria(
                  annotazioni.map((a) =>
                    a.id === poli.id
                      ? ({
                          ...poli,
                          punti: snapAngoliPoligono(poli.punti, passo, passo / 2),
                          snapAngolo: passo,
                          lati: undefined,
                          offsetLati: undefined
                        } as QuotaPoligono)
                      : a
                  )
                )
              }
              onFondiCollineari={() => {
                const r = fondiCollineari(poli.punti, segmentiPoligono(poli));
                if (!r) {
                  mostraToast('info', 'Nessun lato allineato da unire.');
                  return;
                }
                commitGeometria(
                  annotazioni.map((a) =>
                    a.id === poli.id
                      ? ({ ...poli, punti: r.punti, segmenti: r.segmenti, lati: undefined, offsetLati: undefined } as QuotaPoligono)
                      : a
                  )
                );
                mostraToast('successo', `Uniti ${r.rimossi} vertici: lati allineati fusi.`);
              }}
              onQuotaAngolo={
                // solo piante con calibrazione LINEARE (scala): con un piano
                // prospettico la geometria non è lineare e il solver non si applica
                foto.ePianta && pxPerUnita(foto, poli.unita) != null
                  ? (vertice, gradi) => {
                      const senza = (poli.vincoli ?? []).filter(
                        (v) => !(v.tipo === 'angolo' && v.riferimenti[0]?.indice === vertice)
                      );
                      if (gradi == null) {
                        // rimuove il vincolo angolare (nessuna risoluzione)
                        commit(
                          annotazioni.map((a) =>
                            a.id === poli.id
                              ? ({ ...poli, vincoli: senza.length ? senza : undefined } as QuotaPoligono)
                              : a
                          )
                        );
                        return;
                      }
                      const nuovoVinc: VincoloPianta = {
                        id: nuovoId(),
                        tipo: 'angolo',
                        riferimenti: [{ entita: 'vertice', indice: vertice }],
                        valore: gradi
                      };
                      const vincoli = [...senza, nuovoVinc];
                      const px = pxPerUnita(foto, poli.unita);
                      if (px == null) {
                        // pianta non calibrata: memorizza il vincolo senza risolvere
                        commit(
                          annotazioni.map((a) =>
                            a.id === poli.id ? ({ ...poli, vincoli } as QuotaPoligono) : a
                          )
                        );
                        return;
                      }
                      const r = risolviPianta(poli.punti, segmentiPoligono(poli), vincoli, px);
                      if (!r.ok) {
                        mostraToast('errore', 'Angolo in conflitto con gli altri vincoli.');
                        return;
                      }
                      // riquota le sole quote di riferimento dalla nuova geometria
                      const segsFinali = segmentiPoligono(poli).map((s) => {
                        if (!s.riferimento || s.valore == null) return s;
                        const A = r.punti[s.da];
                        const B = r.punti[s.a];
                        if (!A || !B) return s;
                        return { ...s, valore: arrotondaMisura(Math.hypot(B.x - A.x, B.y - A.y) / px) };
                      });
                      commit(
                        annotazioni.map((a) =>
                          a.id === poli.id
                            ? ({
                                ...poli,
                                punti: r.punti,
                                segmenti: segsFinali,
                                vincoli,
                                lati: undefined,
                                offsetLati: undefined
                              } as QuotaPoligono)
                            : a
                        )
                      );
                      mostraToast('successo', 'Angolo vincolato: la forma si è adattata.');
                    }
                  : undefined
              }
              onApplicaVincoli={
                foto.ePianta && pxPerUnita(foto, poli.unita) != null
                  ? (vincoli) => {
                      const px = pxPerUnita(foto, poli.unita);
                      if (px == null) return;
                      const r = risolviPianta(poli.punti, segmentiPoligono(poli), vincoli, px);
                      if (!r.ok) {
                        mostraToast('errore', 'Vincolo in conflitto: modifica non possibile.');
                        return;
                      }
                      const segsFinali = segmentiPoligono(poli).map((s) => {
                        if (s.valore == null) return s;
                        if (s.manuale && !s.riferimento) return s; // manuali intatte
                        const A = r.punti[s.da];
                        const B = r.punti[s.a];
                        if (!A || !B) return s;
                        return { ...s, valore: arrotondaMisura(Math.hypot(B.x - A.x, B.y - A.y) / px) };
                      });
                      commit(
                        annotazioni.map((a) =>
                          a.id === poli.id
                            ? ({
                                ...poli,
                                punti: r.punti,
                                segmenti: segsFinali,
                                vincoli: vincoli.length ? vincoli : undefined,
                                lati: undefined,
                                offsetLati: undefined
                              } as QuotaPoligono)
                            : a
                        )
                      );
                      mostraToast('successo', 'Vincoli aggiornati: la forma si è adattata.');
                    }
                  : undefined
              }
              onRicostruisci={foto.ePianta ? () => void ricostruisciPianta(poli) : undefined}
              onElimina={() => {
                commit(annotazioni.filter((a) => a.id !== poli.id));
                setSelezioneId(null);
                setQuotaInModifica(null);
              }}
              onChiudi={() => setQuotaInModifica(null)}
            />
          );
        })()}
      {quotaInModifica &&
        quotaInModifica.tipo === 'segmento' &&
        (() => {
          const rif = quotaInModifica;
          const poli = annotazioni.find((a) => a.id === rif.id && a.tipo === 'quotaPoligono') as
            | QuotaPoligono
            | undefined;
          if (!poli) return null;
          // alla chiusura del segmento si torna all'ambiente del poligono
          const tornaAlPoligono = () => setQuotaInModifica({ tipo: 'poligono', id: poli.id });
          const segs = segmentiPoligono(poli);
          const seg = segs[rif.indice];
          if (!seg) return null;
          const p1 = poli.punti[seg.da];
          const p2 = poli.punti[seg.a];
          if (!p1 || !p2) return null;
          // quota "virtuale" che rappresenta il segmento dentro l'ambiente dedicato
          const quotaSeg: Quota = {
            id: `${poli.id}:${rif.indice}`,
            fotoId: poli.fotoId,
            tipo: 'quota',
            sottotipo: 'allineata',
            p1,
            p2,
            offset: seg.offset ?? 0,
            valore: seg.valore,
            unita: poli.unita,
            posizioneTesto: seg.posizioneTesto ?? 'sopra',
            nota: seg.nota,
            stato: poli.stato,
            zIndex: poli.zIndex,
            stile: poli.stile
          };
          const scriviPoligono = (mod: Partial<QuotaPoligono>) =>
            commit(
              annotazioni.map((a) =>
                a.id === poli.id
                  ? ({ ...poli, lati: undefined, offsetLati: undefined, ...mod } as QuotaPoligono)
                  : a
              )
            );
          // simbolo automatico (senza override), da mostrare come segnaposto
          const simboloAuto = simboliPoligono({
            ...poli,
            segmenti: segs.map((s) => ({ ...s, simbolo: undefined }))
          })[rif.indice];
          // indice del LATO (spigolo i→i+1) rappresentato dal segmento; null = diagonale
          const nLati = poli.punti.length;
          const edgeIdx =
            (seg.da + 1) % nLati === seg.a ? seg.da : (seg.a + 1) % nLati === seg.da ? seg.a : null;
          const eLato = edgeIdx != null;
          // aggiorna un campo del segmento corrente e committa subito (ancore/blocco)
          const aggiornaSeg = (patch: Partial<SegmentoQuota>) =>
            scriviPoligono({ segmenti: segs.map((s, i) => (i === rif.indice ? { ...s, ...patch } : s)) });
          // elimina il LATO e richiudi la figura (pianta parametrica)
          const eliminaLato = () => {
            if (edgeIdx == null) return;
            const r = eliminaLatoRichiudi(poli.punti, segs, edgeIdx);
            if (!r) {
              // scenderebbe sotto i 3 vertici → si elimina l'intera forma
              commit(annotazioni.filter((a) => a.id !== poli.id));
              setSelezioneId(null);
              setQuotaInModifica(null);
              return;
            }
            commitGeometria(
              annotazioni.map((a) =>
                a.id === poli.id
                  ? ({ ...poli, punti: r.punti, segmenti: r.segmenti, lati: undefined, offsetLati: undefined } as QuotaPoligono)
                  : a
              )
            );
            tornaAlPoligono();
            mostraToast('successo', 'Lato eliminato: figura richiusa.');
          };
          // controlli parametrici (ancore, blocco, elimina lato): solo piante, solo lati
          const extraPianta = foto.ePianta ? (
            <>
              <div className="campo">
                <label>Quota (Menu Pianta)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="segmenti" role="group" aria-label="Tipo di quota">
                    <button
                      className={!seg.riferimento ? 'attivo' : ''}
                      onClick={() => aggiornaSeg({ riferimento: false })}
                      title="Quota parametrica: modificandola cambia la geometria"
                    >
                      ⟿ Parametrica
                    </button>
                    <button
                      className={seg.riferimento ? 'attivo' : ''}
                      onClick={() => aggiornaSeg({ riferimento: true })}
                      title="Quota di riferimento: misura soltanto, non comanda il disegno"
                    >
                      ( ) Riferimento
                    </button>
                  </span>
                </div>
                <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
                  {eLato
                    ? 'Una quota parametrica comanda la forma; quella di riferimento misura soltanto.'
                    : 'Diagonale (tra due vertici): come parametrica comanda la forma della pianta.'}
                </span>
              </div>
              {eLato && (
                <div className="campo">
                  <label>Vincoli del lato</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="segmenti" role="group" aria-label="Ancora del lato">
                      {(
                        [
                          ['none', '—'],
                          ['vertice-da', 'vertice'],
                          ['centro', 'centro'],
                          ['lato', 'lato']
                        ] as const
                      ).map(([v, etichetta]) => (
                        <button
                          key={v}
                          className={(seg.ancora ?? 'none') === v ? 'attivo' : ''}
                          onClick={() =>
                            aggiornaSeg({ ancora: v === 'none' ? undefined : (v as AncoraSegmento) })
                          }
                        >
                          {etichetta}
                        </button>
                      ))}
                    </span>
                    <button
                      className={`btn${seg.bloccato ? ' attivo' : ''}`}
                      onClick={() => aggiornaSeg({ bloccato: !seg.bloccato })}
                      title="Blocca la lunghezza di questo lato: non si adatta quando modifichi altre quote"
                    >
                      {seg.bloccato ? '🔒 Bloccato' : '🔓 Blocca lunghezza'}
                    </button>
                  </div>
                  <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
                    Ancora un punto e la figura si riadatta attorno a quello; blocca un lato per
                    tenerne fissa la misura quando cambi le altre quote.
                  </span>
                </div>
              )}
              {eLato && nLati > 3 && (
                <div className="campo">
                  <button className="btn pericolo" onClick={eliminaLato}>
                    ✂ Elimina lato e richiudi
                  </button>
                </div>
              )}
            </>
          ) : undefined;
          return (
            <EditorQuota
              quota={quotaSeg}
              immagine={immagine}
              nomenclatura={{ simbolo: seg.simbolo ?? '', auto: simboloAuto }}
              extra={extraPianta}
              onCalibraDaQuota={
                // con un piano prospettico i lati sono già misurati
                // dall'omografia: la scala lineare sarebbe ignorata → niente pulsante
                foto.piano
                  ? undefined
                  : (q) => {
                      void calibraDaLatoPoligono(poli, q);
                      tornaAlPoligono();
                    }
              }
              onChiudi={tornaAlPoligono}
              onElimina={() => {
                const nuovi = segs.filter((_, i) => i !== rif.indice);
                if (nuovi.length === 0) {
                  commit(annotazioni.filter((a) => a.id !== poli.id));
                  setSelezioneId(null);
                  setQuotaInModifica(null);
                } else {
                  scriviPoligono({ segmenti: nuovi });
                  tornaAlPoligono();
                }
              }}
              onSalva={(nuova, extra) => {
                const nuovoSeg: typeof seg = {
                  ...seg,
                  valore: nuova.valore,
                  offset: nuova.offset,
                  posizioneTesto: nuova.posizioneTesto,
                  nota: nuova.nota,
                  abbInizio: nuova.abbInizio,
                  abbFine: nuova.abbFine,
                  simbolo: extra?.simbolo,
                  // quota inserita a mano → FISSA (non si modifica da sola quando
                  // si cambiano altre quote); solo i lati auto si adattano
                  manuale: foto.ePianta && nuova.valore != null ? true : undefined
                };
                const nuoviSegs = segs.map((s, i) => (i === rif.indice ? nuovoSeg : s));
                // la pianta ha vincoli NON lineari (angoli o diagonali driving)?
                // in tal caso anche la modifica di un lato passa dal risolutore
                // generale, così quei vincoli non vengono silenziosamente rotti.
                const haVincoliAvanzati =
                  (poli.vincoli ?? []).some(
                    (v) => v.tipo === 'angolo' && !v.riferimento && v.valore != null
                  ) ||
                  nuoviSegs.some((s) => !segmentoELato(s, nLati) && !s.riferimento && s.valore != null);
                // DIAGONALE / vincoli avanzati: comanda la forma via il risolutore
                // geometrico generale (vincoli non lineari).
                if (
                  foto.ePianta &&
                  (!eLato || haVincoliAvanzati) &&
                  !nuovoSeg.riferimento &&
                  nuova.valore != null &&
                  nuova.unita === poli.unita
                ) {
                  const px = pxPerUnita(foto, poli.unita);
                  if (px != null) {
                    const r = risolviPianta(poli.punti, nuoviSegs, poli.vincoli, px);
                    if (r.ok) {
                      // le quote AUTO e di RIFERIMENTO si riquotano dalla nuova
                      // geometria; quelle MANUALI (driving) restano intatte
                      const segsFinali = nuoviSegs.map((s) => {
                        if (s.valore == null) return s;
                        if (s.manuale && !s.riferimento) return s;
                        const A = r.punti[s.da];
                        const B = r.punti[s.a];
                        if (!A || !B) return s;
                        return { ...s, valore: arrotondaMisura(Math.hypot(B.x - A.x, B.y - A.y) / px) };
                      });
                      scriviPoligono({
                        punti: r.punti,
                        segmenti: segsFinali,
                        unita: nuova.unita,
                        stato: nuova.stato,
                        valoreAuto: false,
                        stile: nuova.stile
                      });
                      tornaAlPoligono();
                      return;
                    }
                    mostraToast(
                      'errore',
                      'Modifica non possibile: la quota è in conflitto con altri vincoli.'
                    );
                    tornaAlPoligono();
                    return;
                  }
                }
                // PIANTA PARAMETRICA (lato semplice, senza vincoli avanzati):
                // modello a lati orientati (chiusura), più permissivo del solver.
                if (
                  foto.ePianta &&
                  eLato &&
                  !haVincoliAvanzati &&
                  !nuovoSeg.riferimento &&
                  nuova.valore != null &&
                  nuova.unita === poli.unita
                ) {
                  const px = pxPerUnita(foto, poli.unita);
                  if (px != null) {
                    const esito = risolviParametrico(poli.punti, nuoviSegs, {
                      pxPerReale: px,
                      latoModificato: edgeIdx ?? undefined
                    });
                    if (esito.ok) {
                      // i lati NON bloccati che la chiusura ha dovuto cambiare
                      // vanno riquotati dalla nuova geometria: l'etichetta deve
                      // dire la lunghezza reale, non un valore ormai incoerente.
                      const segsFinali = nuoviSegs.map((s) => {
                        if (s.valore == null) return s;
                        // le quote MANUALI/bloccate/ancorate (non riferimento)
                        // restano intatte; solo le AUTO seguono la geometria
                        const fisso =
                          (s.manuale || s.bloccato || s.ancora === 'lato') && !s.riferimento;
                        if (fisso) return s;
                        const A = esito.punti[s.da];
                        const B = esito.punti[s.a];
                        if (!A || !B) return s;
                        return { ...s, valore: arrotondaMisura(Math.hypot(B.x - A.x, B.y - A.y) / px) };
                      });
                      scriviPoligono({
                        punti: esito.punti,
                        segmenti: segsFinali,
                        unita: nuova.unita,
                        stato: nuova.stato,
                        valoreAuto: false,
                        stile: nuova.stile
                      });
                      tornaAlPoligono();
                      return;
                    }
                    if (esito.avvisi.includes('sovravincolato'))
                      mostraToast(
                        'errore',
                        'Troppi vincoli: la figura non può chiudersi. Sblocca un lato o togli un’ancora.'
                      );
                    else if (esito.avvisi.includes('lunghezza-negativa'))
                      mostraToast(
                        'errore',
                        'Misura non compatibile con la forma: un lato risulterebbe di lunghezza nulla.'
                      );
                    // fallthrough: salva comunque il valore, senza spostare la geometria
                  } else if (!foto.scala && !foto.piano) {
                    // pianta non calibrata: questa quota FISSA la scala e misura
                    // subito gli altri lati dalla geometria (come "Usa come scala")
                    const pxLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    if (pxLen > 1 && nuova.valore > 0) {
                      const scala = { px: pxLen, reale: nuova.valore, unita: nuova.unita };
                      void aggiornaFoto(foto.id, { scala });
                      const conAuto = annotazioni.map((a) =>
                        a.id === poli.id
                          ? ({ ...poli, segmenti: nuoviSegs, unita: nuova.unita, stato: nuova.stato, stile: nuova.stile, valoreAuto: true, lati: undefined, offsetLati: undefined } as Annotazione)
                          : a
                      );
                      commit(applicaValoriAuto(conAuto, { scala, piano: undefined }));
                      mostraToast(
                        'successo',
                        'Scala della pianta impostata da questo lato: ora modificando le quote la geometria si adatta.'
                      );
                      tornaAlPoligono();
                      return;
                    }
                  }
                }
                // valore/offset/posizione/nota → segmento; unità/stato/colore → poligono
                scriviPoligono({
                  segmenti: nuoviSegs,
                  unita: nuova.unita,
                  stato: nuova.stato,
                  valoreAuto: false,
                  stile: nuova.stile
                });
                tornaAlPoligono();
              }}
            />
          );
        })()}
      {quotaInModifica &&
        quotaInModifica.tipo === 'callout' &&
        (() => {
          const c = annotazioni.find((a) => a.id === quotaInModifica.id && a.tipo === 'callout') as
            | Callout
            | undefined;
          if (!c) return null;
          return (
            <EditorCallout
              callout={c}
              immagine={immagine}
              onChiudi={() => setQuotaInModifica(null)}
              onElimina={() => {
                commit(annotazioni.filter((a) => a.id !== c.id));
                setSelezioneId(null);
                setQuotaInModifica(null);
              }}
              onSalva={(nuovo) => {
                commit(annotazioni.map((a) => (a.id === nuovo.id ? nuovo : a)));
                setQuotaInModifica(null);
              }}
            />
          );
        })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambiente di modifica DEDICATO alla singola quota lineare: la foto resta
// sullo sfondo in trasparenza, la linea viene raddrizzata orizzontale e tutte
// le opzioni avanzate stanno qui, lontano dal menu principale.
// ---------------------------------------------------------------------------

function EditorQuota({
  quota,
  immagine,
  nomenclatura,
  extra,
  onSalva,
  onCalibraDaQuota,
  onElimina,
  onChiudi
}: {
  quota: Quota;
  immagine: HTMLImageElement;
  /** presente solo per i lati di un poligono: permette di correggere a mano
   *  il simbolo (b, h, B, D…). `auto` è il simbolo dedotto, mostrato come
   *  segnaposto; `simbolo` è l'eventuale override già impostato. */
  nomenclatura?: { simbolo: string; auto: string };
  /** controlli aggiuntivi (es. vincoli/ancore delle piante parametriche) */
  extra?: ReactNode;
  onSalva: (q: Quota, extra?: { simbolo?: string }) => void;
  /** se presente, mostra "Usa come scala": ricava la calibrazione da questa
   *  misura (utile sulle piante non calibrate) */
  onCalibraDaQuota?: (q: Quota) => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const [simbolo, setSimbolo] = useState(nomenclatura?.simbolo ?? '');
  const [testoVal, setTestoVal] = useState(
    quota.valore === null ? '' : String(quota.valore).replace('.', ',')
  );
  const [unita, setUnita] = useState<Unita>(quota.unita);
  const [posizioneTesto, setPosizioneTesto] = useState<PosizioneTesto>(quota.posizioneTesto);
  const [nota, setNota] = useState(quota.nota ?? '');
  const [colore, setColore] = useState(quota.stile.colore);
  const [stato, setStato] = useState<StatoMisura>(quota.stato);
  const [abbInizio, setAbbInizio] = useState(
    quota.abbInizio === undefined ? '' : String(quota.abbInizio).replace('.', ',')
  );
  const [abbFine, setAbbFine] = useState(
    quota.abbFine === undefined ? '' : String(quota.abbFine).replace('.', ',')
  );
  /** moltiplicatore di dimensione applicato al salvataggio (spessore + testo) */
  const [scalaTesto, setScalaTesto] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);

  const valore = analizzaMisura(testoVal);
  const abbA = analizzaMisura(abbInizio) ?? 0;
  const abbB = analizzaMisura(abbFine) ?? 0;
  const [versoA, versoB] = versiSegmento(quota.p1, quota.p2);
  const tagliata = valore === null ? null : valore + abbA + abbB;
  const testoMisura =
    (stato === 'stimata' ? '≈ ' : '') + (valore === null ? '?' : formattaNumero(valore)) + ' ' + unita;

  useEffect(() => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    const yc = h / 2;
    const x1 = w * 0.12;
    const x2 = w * 0.88;
    const lungPreview = x2 - x1;

    // sfondo: la STRISCIA reale della foto sotto la quota, raddrizzata, ben
    // visibile, così si capisce dove la quota è più leggibile
    const p1 = quota.p1;
    const p2 = quota.p2;
    const L = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const theta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const s = lungPreview / L;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(x1, yc);
    ctx.rotate(-theta);
    ctx.scale(s, s);
    ctx.translate(-p1.x, -p1.y);
    ctx.drawImage(immagine, 0, 0);
    ctx.restore();
    // velo scuro per far risaltare quota e rettangolini
    ctx.fillStyle = 'rgba(5,7,10,0.25)';
    ctx.fillRect(0, 0, w, h);

    // linea di quota orizzontale, con alone scuro
    ctx.lineCap = 'round';
    for (const [col, lw] of [['rgba(0,0,0,0.6)', 9], [colore, 4]] as Array<[string, number]>) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x1, yc);
      ctx.lineTo(x2, yc);
      ctx.stroke();
    }
    const freccia = (x: number, dir: 1 | -1) => {
      const len = 16;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(x, yc);
        ctx.lineTo(x - dir * len, yc - len * 0.42);
        ctx.lineTo(x - dir * len, yc + len * 0.42);
        ctx.closePath();
      };
      path();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = colore;
      ctx.fill();
    };
    freccia(x1, -1);
    freccia(x2, 1);

    // tre rettangolini (sopra / centro / sotto) con dentro la quota scritta
    const boxW = Math.min(lungPreview * 0.72, w * 0.62);
    const boxH = h * 0.2;
    const cx = w / 2;
    const centri: Array<[PosizioneTesto, number]> = [
      ['sopra', yc - boxH * 1.05],
      ['centro', yc],
      ['sotto', yc + boxH * 1.05]
    ];
    const arrotonda = (x: number, y: number, ww: number, hh: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    };
    const righe = nota.trim() ? [testoMisura, nota.trim()] : [testoMisura];
    for (const [pos, cyB] of centri) {
      const sel = posizioneTesto === pos;
      arrotonda(cx - boxW / 2, cyB - boxH / 2, boxW, boxH, 10);
      ctx.fillStyle = sel ? 'rgba(47,129,247,0.28)' : 'rgba(0,0,0,0.4)';
      ctx.fill();
      ctx.strokeStyle = sel ? '#2f81f7' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.stroke();
      const dim = Math.round(boxH * 0.3);
      ctx.font = `bold ${dim}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const altRiga = dim * 1.2;
      const y0 = cyB - ((righe.length - 1) * altRiga) / 2;
      righe.forEach((r, i) => {
        ctx.lineWidth = Math.max(2, dim * 0.22);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(r, cx, y0 + i * altRiga);
        ctx.fillStyle = colore;
        ctx.fillText(r, cx, y0 + i * altRiga);
      });
    }
    ctx.restore();
  }, [immagine, posizioneTesto, nota, colore, testoMisura, quota]);

  const salva = () => {
    const stile =
      scalaTesto === 1
        ? { ...quota.stile, colore }
        : {
            ...quota.stile,
            colore,
            spessore: Math.min(40, Math.max(1, quota.stile.spessore * scalaTesto)),
            dimensioneTesto: Math.min(
              200,
              Math.max(8, Math.round(quota.stile.dimensioneTesto * scalaTesto))
            )
          };
    onSalva(
      {
        ...quota,
        valore,
        unita,
        posizioneTesto,
        nota: nota.trim() || undefined,
        abbInizio: abbA || undefined,
        abbFine: abbB || undefined,
        // un valore inserito a mano qui non viene più sovrascritto dalla calibrazione
        valoreAuto: false,
        stato,
        stile
      },
      nomenclatura ? { simbolo: simbolo.trim() || undefined } : undefined
    );
  };

  return (
    <div className="editor-quota">
      <header className="barra">
        <button className="btn icona" aria-label="Chiudi senza salvare" onClick={onChiudi}>
          ✕
        </button>
        <h1>Modifica quota</h1>
      </header>
      <div ref={contRef} className="eq-anteprima">
        <canvas ref={canvasRef} />
        {/* tocca uno dei tre rettangolini per scegliere la posizione del testo */}
        <button
          className="eq-zona"
          style={{ top: '19%', height: '20%' }}
          aria-label="Testo sopra la linea"
          onClick={() => setPosizioneTesto('sopra')}
        />
        <button
          className="eq-zona"
          style={{ top: '40%', height: '20%' }}
          aria-label="Testo al centro della linea"
          onClick={() => setPosizioneTesto('centro')}
        />
        <button
          className="eq-zona"
          style={{ top: '61%', height: '20%' }}
          aria-label="Testo sotto la linea"
          onClick={() => setPosizioneTesto('sotto')}
        />
      </div>
      <div className="eq-controlli">
        <div className="campo">
          <label>Misura</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              inputMode="decimal"
              value={testoVal}
              onChange={(e) => setTestoVal(e.target.value)}
              placeholder="es. 100"
            />
            <select value={unita} onChange={(e) => setUnita(e.target.value as Unita)} style={{ width: 90 }}>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </div>
        </div>
        {nomenclatura && (
          <div className="campo">
            <label>Nome della quota (simbolo)</label>
            <input
              value={simbolo}
              onChange={(e) => setSimbolo(e.target.value)}
              placeholder={`auto: ${nomenclatura.auto}`}
              maxLength={4}
              style={{ width: 130 }}
            />
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
              Lascia vuoto per il simbolo automatico ({nomenclatura.auto}).
            </span>
          </div>
        )}
        <div className="campo">
          <label>Testo aggiuntivo (facoltativo)</label>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="es. luce netta" maxLength={40} />
        </div>
        <div className="campo">
          <label>Abbondanze (extra per il taglio)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 64, color: 'var(--testo-2)', fontSize: 13, textTransform: 'capitalize' }}>
              {versoA}
            </span>
            <input
              inputMode="decimal"
              value={abbInizio}
              onChange={(e) => setAbbInizio(e.target.value)}
              placeholder="0"
              style={{ flex: 1 }}
            />
            <span style={{ minWidth: 64, color: 'var(--testo-2)', fontSize: 13, textTransform: 'capitalize' }}>
              {versoB}
            </span>
            <input
              inputMode="decimal"
              value={abbFine}
              onChange={(e) => setAbbFine(e.target.value)}
              placeholder="0"
              style={{ flex: 1 }}
            />
          </div>
          {tagliata !== null && (abbA > 0 || abbB > 0) && (
            <span style={{ color: 'var(--ok)', fontSize: 13, fontWeight: 700, marginTop: 6 }}>
              Misura da tagliare: {formattaNumero(tagliata)} {unita}
            </span>
          )}
        </div>
        <div className="campo">
          <label>Stato della misura</label>
          <span className="segmenti" role="group">
            {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
              <button key={s} className={stato === s ? 'attivo' : ''} onClick={() => setStato(s)}>
                {s === 'reale' ? 'Reale' : '≈ Stimata'}
              </button>
            ))}
          </span>
        </div>
        <div className="campo">
          <label>Colore e dimensione</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <BottoneColore colore={colore} onScegli={setColore} />
            <span className="segmenti" role="group" aria-label="Dimensione">
              <button aria-label="Riduci" onClick={() => setScalaTesto((s) => Math.max(0.4, s / 1.25))}>
                A−
              </button>
              <button aria-label="Aumenta" onClick={() => setScalaTesto((s) => Math.min(3, s * 1.25))}>
                A＋
              </button>
            </span>
          </div>
        </div>
        {extra}
      </div>
      <div className="eq-azioni">
        <button className="btn pericolo" onClick={onElimina}>
          <Icona nome="cestino" dimensione={18} /> Elimina
        </button>
        {onCalibraDaQuota && valore !== null && (
          <button
            className="btn"
            onClick={() => onCalibraDaQuota({ ...quota, valore, unita })}
            title="Ricava la scala da questa misura, per calcolare gli altri lati"
          >
            <Icona nome="righello" dimensione={18} /> Usa come scala
          </button>
        )}
        <button className="btn primario" onClick={salva}>
          <Icona nome="check" dimensione={18} /> Salva quota
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambiente di modifica DEDICATO al cerchio: stessa logica della quota lineare
// (foto in trasparenza, misura raddrizzata, opzioni avanzate), adattata al
// raggio/diametro con circonferenza calcolata e abbondanza di taglio.
// ---------------------------------------------------------------------------

function EditorCerchio({
  raggio,
  foto,
  immagine,
  onSalva,
  onElimina,
  onChiudi
}: {
  raggio: QuotaRaggio;
  foto: Foto;
  immagine: HTMLImageElement;
  onSalva: (q: QuotaRaggio) => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const [testoVal, setTestoVal] = useState(
    raggio.valore === null ? '' : String(raggio.valore).replace('.', ',')
  );
  const [unita, setUnita] = useState<Unita>(raggio.unita);
  const [modo, setModo] = useState<QuotaRaggio['modo']>(raggio.modo);
  const [nota, setNota] = useState(raggio.nota ?? '');
  const [margine, setMargine] = useState(
    raggio.margine === undefined ? '' : String(raggio.margine).replace('.', ',')
  );
  const [colore, setColore] = useState(raggio.stile.colore);
  const [stato, setStato] = useState<StatoMisura>(raggio.stato);
  const [scalaTesto, setScalaTesto] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);

  const valore = analizzaMisura(testoVal);
  const margineN = analizzaMisura(margine) ?? 0;
  // diametro e raggio nelle unità correnti, a partire dal valore inserito
  const diametro = valore === null ? null : modo === 'diametro' ? valore : valore * 2;
  const circonf = diametro === null ? null : Math.round(Math.PI * diametro * 10) / 10;
  const diametroTaglio = diametro === null ? null : diametro + 2 * margineN;
  const simbolo = modo === 'diametro' ? '⌀' : 'R';
  const testoMisura =
    (stato === 'stimata' ? '≈ ' : '') + simbolo + ' ' + (valore === null ? '?' : formattaNumero(valore)) + ' ' + unita;

  useEffect(() => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const rPx = Math.hypot(raggio.bordo.x - raggio.centro.x, raggio.bordo.y - raggio.centro.y) || 1;
    const rPreview = Math.min(w, h) * 0.3;
    const s = rPreview / rPx;

    // sfondo: la zona reale della foto attorno al cerchio, centrata
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-raggio.centro.x, -raggio.centro.y);
    ctx.drawImage(immagine, 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(5,7,10,0.25)';
    ctx.fillRect(0, 0, w, h);

    // eventuale abbondanza: cerchio tratteggiato esterno
    if (margineN > 0 && diametro && diametroTaglio) {
      const rTaglio = rPreview * (diametroTaglio / diametro);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(52,199,89,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, rTaglio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // cerchio di quota, con alone scuro
    for (const [col, lw] of [['rgba(0,0,0,0.6)', 9], [colore, 4]] as Array<[string, number]>) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(cx, cy, rPreview, 0, Math.PI * 2);
      ctx.stroke();
    }
    // diametro (o raggio) come linea con freccia
    ctx.lineCap = 'round';
    for (const [col, lw] of [['rgba(0,0,0,0.6)', 7], [colore, 3]] as Array<[string, number]>) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      if (modo === 'diametro') {
        ctx.moveTo(cx - rPreview, cy);
        ctx.lineTo(cx + rPreview, cy);
      } else {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + rPreview, cy);
      }
      ctx.stroke();
    }

    // etichetta centrale con misura (+ circonferenza, + nota)
    const righe = [testoMisura];
    if (circonf !== null) righe.push('C ' + formattaNumero(circonf) + ' ' + unita);
    if (nota.trim()) righe.push(nota.trim());
    const dim = Math.round(Math.min(w, h) * 0.05);
    ctx.font = `bold ${dim}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const altRiga = dim * 1.25;
    const y0 = cy - rPreview - altRiga * righe.length - 6;
    righe.forEach((r, i) => {
      ctx.lineWidth = Math.max(2, dim * 0.22);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(r, cx, y0 + i * altRiga);
      ctx.fillStyle = i === 1 ? '#9fb4cc' : colore;
      ctx.fillText(r, cx, y0 + i * altRiga);
    });
    ctx.restore();
  }, [immagine, modo, nota, colore, testoMisura, circonf, unita, margineN, diametro, diametroTaglio, raggio]);

  const salva = () => {
    const stile =
      scalaTesto === 1
        ? { ...raggio.stile, colore }
        : {
            ...raggio.stile,
            colore,
            spessore: Math.min(40, Math.max(1, raggio.stile.spessore * scalaTesto)),
            dimensioneTesto: Math.min(200, Math.max(8, Math.round(raggio.stile.dimensioneTesto * scalaTesto)))
          };
    onSalva({
      ...raggio,
      valore,
      modo,
      unita,
      nota: nota.trim() || undefined,
      margine: margineN || undefined,
      valoreAuto: false,
      stato,
      stile
    });
  };

  return (
    <div className="editor-quota">
      <header className="barra">
        <button className="btn icona" aria-label="Chiudi senza salvare" onClick={onChiudi}>
          ✕
        </button>
        <h1>Modifica cerchio</h1>
      </header>
      <div ref={contRef} className="eq-anteprima">
        <canvas ref={canvasRef} />
      </div>
      <div className="eq-controlli">
        <div className="campo">
          <label>Misura</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="segmenti" role="group" aria-label="Raggio o diametro">
              {(
                [
                  ['raggio', 'R'],
                  ['diametro', '⌀']
                ] as Array<[QuotaRaggio['modo'], string]>
              ).map(([m, t]) => (
                <button key={m} className={modo === m ? 'attivo' : ''} onClick={() => setModo(m)}>
                  {t}
                </button>
              ))}
            </span>
            <input
              autoFocus
              inputMode="decimal"
              value={testoVal}
              onChange={(e) => setTestoVal(e.target.value)}
              placeholder="es. 50"
              style={{ flex: 1 }}
            />
            <select value={unita} onChange={(e) => setUnita(e.target.value as Unita)} style={{ width: 80 }}>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
            <button
              className="btn"
              onClick={() => {
                const v = valoreAutomatico({ ...raggio, modo, unita }, foto);
                if (v !== null) setTestoVal(String(v).replace('.', ','));
              }}
              title="Ricalcola dalla calibrazione"
            >
              ↻
            </button>
          </div>
          {circonf !== null && (
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 6 }}>
              Circonferenza: {formattaNumero(circonf)} {unita}
            </span>
          )}
        </div>
        <div className="campo">
          <label>Testo aggiuntivo (facoltativo)</label>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="es. foro passante" maxLength={40} />
        </div>
        <div className="campo">
          <label>Abbondanza per il taglio (tutt'intorno)</label>
          <input inputMode="decimal" value={margine} onChange={(e) => setMargine(e.target.value)} placeholder="0" />
          {diametroTaglio !== null && margineN > 0 && (
            <span style={{ color: 'var(--ok)', fontSize: 13, fontWeight: 700, marginTop: 6 }}>
              Diametro da tagliare: {formattaNumero(diametroTaglio)} {unita}
            </span>
          )}
        </div>
        <div className="campo">
          <label>Stato della misura</label>
          <span className="segmenti" role="group">
            {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
              <button key={s} className={stato === s ? 'attivo' : ''} onClick={() => setStato(s)}>
                {s === 'reale' ? 'Reale' : '≈ Stimata'}
              </button>
            ))}
          </span>
        </div>
        <div className="campo">
          <label>Colore e dimensione</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <BottoneColore colore={colore} onScegli={setColore} />
            <span className="segmenti" role="group" aria-label="Dimensione">
              <button aria-label="Riduci" onClick={() => setScalaTesto((s) => Math.max(0.4, s / 1.25))}>
                A−
              </button>
              <button aria-label="Aumenta" onClick={() => setScalaTesto((s) => Math.min(3, s * 1.25))}>
                A＋
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="eq-azioni">
        <button className="btn pericolo" onClick={onElimina}>
          <Icona nome="cestino" dimensione={18} /> Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          <Icona nome="check" dimensione={18} /> Salva cerchio
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambiente di modifica DEDICATO all'angolo: foto in trasparenza, i due lati e
// l'arco di quota disegnati grandi, valore in gradi correggibile.
// ---------------------------------------------------------------------------

function EditorAngolo({
  angolo,
  foto,
  immagine,
  onSalva,
  onElimina,
  onChiudi
}: {
  angolo: QuotaAngolare;
  foto: Foto;
  immagine: HTMLImageElement;
  onSalva: (q: QuotaAngolare) => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const [testoVal, setTestoVal] = useState(
    angolo.valore === null ? '' : String(angolo.valore).replace('.', ',')
  );
  const [nota, setNota] = useState(angolo.nota ?? '');
  const [colore, setColore] = useState(angolo.stile.colore);
  const [stato, setStato] = useState<StatoMisura>(angolo.stato);
  const [scalaTesto, setScalaTesto] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);

  const valore = analizzaMisura(testoVal);
  const testoMisura = (stato === 'stimata' ? '≈ ' : '') + (valore === null ? '?' : formattaNumero(valore)) + '°';

  useEffect(() => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const va = { x: angolo.a.x - angolo.vertice.x, y: angolo.a.y - angolo.vertice.y };
    const vb = { x: angolo.b.x - angolo.vertice.x, y: angolo.b.y - angolo.vertice.y };
    const maxLen = Math.max(Math.hypot(va.x, va.y), Math.hypot(vb.x, vb.y)) || 1;
    const lung = Math.min(w, h) * 0.38;
    const s = lung / maxLen;

    // sfondo: zona reale della foto attorno al vertice
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-angolo.vertice.x, -angolo.vertice.y);
    ctx.drawImage(immagine, 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(5,7,10,0.3)';
    ctx.fillRect(0, 0, w, h);

    const aA = Math.atan2(va.y, va.x);
    const aB = Math.atan2(vb.y, vb.x);
    const pA = { x: cx + Math.cos(aA) * lung, y: cy + Math.sin(aA) * lung };
    const pB = { x: cx + Math.cos(aB) * lung, y: cy + Math.sin(aB) * lung };

    // i due lati, con alone scuro
    ctx.lineCap = 'round';
    for (const [col, lw] of [['rgba(0,0,0,0.6)', 9], [colore, 4]] as Array<[string, number]>) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(cx, cy);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();
    }
    // arco di quota (verso più breve)
    let diff = aB - aA;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    const rArco = lung * 0.42;
    for (const [col, lw] of [['rgba(0,0,0,0.6)', 7], [colore, 3]] as Array<[string, number]>) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(cx, cy, rArco, aA, aA + diff, diff < 0);
      ctx.stroke();
    }

    // etichetta col valore lungo la bisettrice
    const bis = aA + diff / 2;
    const lx = cx + Math.cos(bis) * (rArco + lung * 0.22);
    const ly = cy + Math.sin(bis) * (rArco + lung * 0.22);
    const righe = nota.trim() ? [testoMisura, nota.trim()] : [testoMisura];
    const dim = Math.round(Math.min(w, h) * 0.06);
    ctx.font = `bold ${dim}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const altRiga = dim * 1.2;
    const y0 = ly - ((righe.length - 1) * altRiga) / 2;
    righe.forEach((r, i) => {
      ctx.lineWidth = Math.max(2, dim * 0.22);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(r, lx, y0 + i * altRiga);
      ctx.fillStyle = colore;
      ctx.fillText(r, lx, y0 + i * altRiga);
    });
    ctx.restore();
  }, [immagine, nota, colore, testoMisura, angolo]);

  const salva = () => {
    const stile =
      scalaTesto === 1
        ? { ...angolo.stile, colore }
        : {
            ...angolo.stile,
            colore,
            spessore: Math.min(40, Math.max(1, angolo.stile.spessore * scalaTesto)),
            dimensioneTesto: Math.min(200, Math.max(8, Math.round(angolo.stile.dimensioneTesto * scalaTesto)))
          };
    onSalva({
      ...angolo,
      valore,
      nota: nota.trim() || undefined,
      valoreAuto: false,
      stato,
      stile
    });
  };

  return (
    <div className="editor-quota">
      <header className="barra">
        <button className="btn icona" aria-label="Chiudi senza salvare" onClick={onChiudi}>
          ✕
        </button>
        <h1>Modifica angolo</h1>
      </header>
      <div ref={contRef} className="eq-anteprima">
        <canvas ref={canvasRef} />
      </div>
      <div className="eq-controlli">
        <div className="campo">
          <label>Ampiezza</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              autoFocus
              inputMode="decimal"
              value={testoVal}
              onChange={(e) => setTestoVal(e.target.value)}
              placeholder="es. 90"
              style={{ flex: 1 }}
            />
            <span style={{ fontWeight: 700, fontSize: 18 }}>°</span>
            <button
              className="btn"
              onClick={() => {
                const v = valoreAutomatico(angolo, foto);
                if (v !== null) setTestoVal(String(v).replace('.', ','));
              }}
              title="Ricalcola dalla geometria"
            >
              ↻ auto
            </button>
          </div>
        </div>
        <div className="campo">
          <label>Testo aggiuntivo (facoltativo)</label>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="es. apertura anta" maxLength={40} />
        </div>
        <div className="campo">
          <label>Stato della misura</label>
          <span className="segmenti" role="group">
            {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
              <button key={s} className={stato === s ? 'attivo' : ''} onClick={() => setStato(s)}>
                {s === 'reale' ? 'Reale' : '≈ Stimata'}
              </button>
            ))}
          </span>
        </div>
        <div className="campo">
          <label>Colore e dimensione</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <BottoneColore colore={colore} onScegli={setColore} />
            <span className="segmenti" role="group" aria-label="Dimensione">
              <button aria-label="Riduci" onClick={() => setScalaTesto((s) => Math.max(0.4, s / 1.25))}>
                A−
              </button>
              <button aria-label="Aumenta" onClick={() => setScalaTesto((s) => Math.min(3, s * 1.25))}>
                A＋
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="eq-azioni">
        <button className="btn pericolo" onClick={onElimina}>
          <Icona nome="cestino" dimensione={18} /> Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          <Icona nome="check" dimensione={18} /> Salva angolo
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambiente di modifica DEDICATO al poligono (rettangolo/trapezio/…): resta un
// oggetto unico, con l'anteprima della forma e una quota-lato per volta. Ogni
// lato si apre nel suo ambiente dedicato; qui stanno nomenclatura, diagonali,
// unità, stato, colore. Nessun menu in basso.
// ---------------------------------------------------------------------------

function EditorPoligono({
  poli,
  foto,
  immagine,
  codice,
  numero,
  onNumero,
  onModifica,
  onModificaSegmento,
  onSnapAngoli,
  onFondiCollineari,
  onQuotaAngolo,
  onApplicaVincoli,
  onRicostruisci,
  onElimina,
  onChiudi
}: {
  poli: QuotaPoligono;
  foto: Foto;
  immagine: HTMLImageElement;
  /** codice automatico corrente (es. "P1.A1") */
  codice: string;
  /** numero della forma nella sequenza condivisa (per il riordino manuale) */
  numero?: number;
  onNumero: (n: number) => void;
  onModifica: (m: Partial<QuotaPoligono>) => void;
  onModificaSegmento: (indice: number) => void;
  /** aggancia i lati al passo angolare indicato (90/45/30°) e richiude */
  onSnapAngoli: (passo: number) => void;
  /** fonde i lati consecutivi allineati in uno solo (se ce ne sono) */
  onFondiCollineari: () => void;
  /** imposta/rimuove una quota angolare (driving) al vertice; null = rimuove.
   *  Solo piante: comanda la forma via il risolutore geometrico. */
  onQuotaAngolo?: (vertice: number, gradi: number | null) => void;
  /** applica la nuova lista di vincoli geometrici (Fase 3) risolvendo la
   *  geometria; se in conflitto avvisa e non modifica. Solo piante. */
  onApplicaVincoli?: (vincoli: VincoloPianta[]) => void;
  /** ricostruisce la forma dalle misure inserite (parametrica): solo piante */
  onRicostruisci?: () => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const n = poli.punti.length;
  const segs = segmentiPoligono(poli);
  const simboli = simboliPoligono(poli);
  const calibrata = haCalibrazione(foto);
  const colore = poli.stile.colore;
  const area = areaReale(poli, foto);
  // form dei vincoli geometrici (Fase 3)
  const [tipoVincolo, setTipoVincolo] = useState<TipoVincoloPianta>('orizzontale');
  const [latoVincA, setLatoVincA] = useState(0);
  const [latoVincB, setLatoVincB] = useState(1);

  const scriviSegmenti = (segmenti: SegmentoQuota[], extra: Partial<QuotaPoligono> = {}) =>
    onModifica({ segmenti, lati: undefined, offsetLati: undefined, valoreAuto: false, ...extra });

  const haSegmento = (da: number, a: number) =>
    segs.some((s) => (s.da === da && s.a === a) || (s.da === a && s.a === da));
  const latiMancanti: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (!haSegmento(i, j)) latiMancanti.push([i, j]);
  }
  const diagonaliPresenti = segs.some((s) => !segmentoELato(s, n));

  const valSeg = (s: SegmentoQuota) =>
    s.valore === null ? '?' : `${formattaNumero(s.valore)} ${poli.unita}`;

  const aggiungiSegmento = (da: number, a: number) => {
    const valore = calibrata ? misuraSegmento(poli.punti[da], poli.punti[a], foto, poli.unita) : null;
    scriviSegmenti([...segs, { da, a, valore }]);
  };

  const scalaStile = (fattore: number) =>
    onModifica({
      stile: {
        ...poli.stile,
        spessore: Math.min(40, Math.max(1, poli.stile.spessore * fattore)),
        dimensioneTesto: Math.min(200, Math.max(8, Math.round(poli.stile.dimensioneTesto * fattore)))
      }
    });

  useEffect(() => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    // bounding box dei vertici, con margine, per inquadrare la forma
    const xs = poli.punti.map((p) => p.x);
    const ys = poli.punti.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const s = Math.min((w * 0.8) / bw, (h * 0.78) / bh);
    const cx0 = (minX + maxX) / 2;
    const cy0 = (minY + maxY) / 2;
    const toScreen = (p: Punto) => ({
      x: w / 2 + (p.x - cx0) * s,
      y: h / 2 + (p.y - cy0) * s
    });

    // sfondo: la zona reale della foto, in trasparenza
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-cx0, -cy0);
    ctx.drawImage(immagine, 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(5,7,10,0.28)';
    ctx.fillRect(0, 0, w, h);

    // contorno del poligono, con alone scuro
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [col, lw] of [['rgba(0,0,0,0.6)', 8], [colore, 3.5]] as Array<[string, number]>) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      poli.punti.forEach((p, i) => {
        const q = toScreen(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    // diagonali quotate
    for (const seg of segs) {
      if (segmentoELato(seg, n)) continue;
      const a = toScreen(poli.punti[seg.da]);
      const b = toScreen(poli.punti[seg.a]);
      for (const [col, lw] of [['rgba(0,0,0,0.6)', 6], [colore, 2.5]] as Array<[string, number]>) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.setLineDash(col === colore ? [8, 5] : []);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // etichette: simbolo + valore al centro di ogni segmento quotato
    const dim = Math.round(Math.min(w, h) * 0.045);
    ctx.font = `bold ${dim}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    segs.forEach((seg, i) => {
      const a = toScreen(poli.punti[seg.da]);
      const b = toScreen(poli.punti[seg.a]);
      // scorrimento del testo lungo il lato (come sulla foto)
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const scorr = (seg.scorrTesto ?? 0) * s;
      const mx = (a.x + b.x) / 2 + ux * scorr;
      const my = (a.y + b.y) / 2 + uy * scorr;
      const t = `${simboli[i]} ${seg.valore === null ? '?' : formattaNumero(seg.valore)}`;
      ctx.lineWidth = Math.max(2, dim * 0.22);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t, mx, my);
      ctx.fillStyle = colore;
      ctx.fillText(t, mx, my);
    });
    ctx.restore();
  }, [immagine, poli, segs, simboli, colore, n]);

  return (
    <div className="editor-quota">
      <header className="barra">
        <button className="btn icona" aria-label="Chiudi" onClick={onChiudi}>
          ✕
        </button>
        <h1>Modifica {nomeFormaPoligono(poli).toLowerCase()}</h1>
      </header>
      <div ref={contRef} className="eq-anteprima">
        <canvas ref={canvasRef} />
      </div>
      <div className="eq-controlli">
        <div className="campo">
          <label>Codice e numero</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--testo)' }}>{codice || '—'}</span>
            {numero !== undefined && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--testo-2)' }}>
                n°
                <input
                  type="number"
                  min={1}
                  value={numero}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n >= 1) onNumero(n);
                  }}
                  style={{ width: 64 }}
                />
              </label>
            )}
          </div>
          <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
            Cambiando il n° la forma si sposta nella sequenza; le altre si rinumerano.
          </span>
        </div>
        <div className="campo">
          <label>Nome manuale (override del codice, facoltativo)</label>
          <input
            value={poli.etichetta ?? ''}
            maxLength={6}
            placeholder="es. F1"
            onChange={(e) => onModifica({ etichetta: e.target.value })}
            style={{ width: 120 }}
          />
        </div>
        <div className="campo">
          <label>Quote dei lati — tocca per modificarle</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {segs.map((s, i) => (
              <button
                key={i}
                className="btn"
                style={{ minHeight: 44, padding: '0 12px', whiteSpace: 'nowrap' }}
                onClick={() => onModificaSegmento(i)}
              >
                {simboli[i]} {valSeg(s)} ✎
              </button>
            ))}
            {latiMancanti.length > 0 && (
              <button
                className="btn"
                style={{ minHeight: 44, padding: '0 12px' }}
                onClick={() => aggiungiSegmento(latiMancanti[0][0], latiMancanti[0][1])}
              >
                ＋ lato
              </button>
            )}
            {n === 4 && (
              <button
                className={`btn${diagonaliPresenti ? ' attivo' : ''}`}
                style={{ minHeight: 44, padding: '0 12px' }}
                title="Quota le diagonali (rombo)"
                onClick={() => {
                  if (diagonaliPresenti) {
                    scriviSegmenti(segs.filter((s) => segmentoELato(s, n)));
                  } else {
                    const d: SegmentoQuota[] = [
                      [0, 2],
                      [1, 3]
                    ].map(([da, a]) => ({
                      da,
                      a,
                      valore: calibrata ? misuraSegmento(poli.punti[da], poli.punti[a], foto, poli.unita) : null
                    }));
                    scriviSegmenti([...segs, ...d]);
                  }
                }}
              >
                ◇ Diagonali
              </button>
            )}
            {n > 4 &&
              (() => {
                // aggiunge una diagonale (tra due vertici) al primo paio non
                // adiacente ancora non quotato: come parametrica comanda la forma
                const esiste = (a: number, b: number) =>
                  segs.some((s) => (s.da === a && s.a === b) || (s.da === b && s.a === a));
                let coppia: [number, number] | null = null;
                for (let a = 0; a < n && !coppia; a++) {
                  for (let b = a + 2; b < n; b++) {
                    if (a === 0 && b === n - 1) continue; // adiacente (chiusura)
                    if (!esiste(a, b)) {
                      coppia = [a, b];
                      break;
                    }
                  }
                }
                if (!coppia) return null;
                const [a, b] = coppia;
                return (
                  <button
                    className="btn"
                    style={{ minHeight: 44, padding: '0 12px' }}
                    title="Aggiungi una diagonale (tra due vertici): come parametrica comanda la forma"
                    onClick={() =>
                      scriviSegmenti([
                        ...segs,
                        {
                          da: a,
                          a: b,
                          valore: calibrata ? misuraSegmento(poli.punti[a], poli.punti[b], foto, poli.unita) : null
                        }
                      ])
                    }
                  >
                    ◇ ＋ diagonale
                  </button>
                );
              })()}
          </div>
        </div>
        <div className="campo">
          <label>Unità e stato</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select
              value={poli.unita}
              onChange={(e) => onModifica({ unita: e.target.value as Unita })}
              style={{ width: 90 }}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
            <span className="segmenti" role="group" aria-label="Stato della misura">
              {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
                <button key={s} className={poli.stato === s ? 'attivo' : ''} onClick={() => onModifica({ stato: s })}>
                  {s === 'reale' ? 'Reale' : '≈ Stimata'}
                </button>
              ))}
            </span>
          </div>
        </div>
        {area && (
          <div className="campo">
            <label>Superficie</label>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--testo)' }}>
                {formattaAreaM2(area.m2)}
              </span>
              {area.affidabile ? (
                <span style={{ color: 'var(--ok)', fontSize: 12, fontWeight: 700 }}>● esatta</span>
              ) : (
                <span style={{ color: '#ff9500', fontSize: 12, fontWeight: 700 }}>
                  ◐ stima — calibra un piano per l'area corretta in prospettiva
                </span>
              )}
            </div>
          </div>
        )}
        <div className="campo">
          <label>Forma</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--testo-2)' }}>Raddrizza:</span>
            <span className="segmenti" role="group" aria-label="Snap angolare">
              {[90, 45, 30].map((p) => (
                <button
                  key={p}
                  className={poli.snapAngolo === p ? 'attivo' : ''}
                  title={`Aggancia i lati a multipli di ${p}° e richiudi`}
                  onClick={() => onSnapAngoli(p)}
                >
                  {p}°
                </button>
              ))}
            </span>
            <button
              className="btn"
              onClick={onFondiCollineari}
              title="Unisci in un solo lato i lati consecutivi allineati (rimuove i vertici inutili)"
            >
              ⇥ Unisci lati allineati
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {onRicostruisci && (
              <button
                className="btn"
                onClick={onRicostruisci}
                title="Ridisegna la pianta rispettando le misure inserite; i lati senza misura si ricavano dalla chiusura"
              >
                ⧉ Ricostruisci dalle misure
              </button>
            )}
          </div>
          {onRicostruisci && (
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
              Inserisci le misure dei lati che conosci: la pianta viene ridisegnata in scala e i
              lati mancanti si calcolano automaticamente. Modificando una quota, la geometria si
              adatta mantenendo la figura chiusa.
            </span>
          )}
        </div>
        {onQuotaAngolo && calibrata && (
          <div className="campo">
            <label>Angoli — quota parametrica tra due lati</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 8,
                maxHeight: '30vh',
                overflowY: 'auto'
              }}
            >
              {poli.punti.map((_, i) => {
                const prev = (i - 1 + n) % n;
                const succ = (i + 1) % n;
                const ang = angoloGradi(poli.punti[i], poli.punti[prev], poli.punti[succ]);
                const vinc = (poli.vincoli ?? []).find(
                  (v) => v.tipo === 'angolo' && v.riferimenti[0]?.indice === i && !v.riferimento
                );
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      border: '1px solid var(--bordo)',
                      borderRadius: 8,
                      padding: '4px 8px'
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>∠{i + 1}</span>
                    <span style={{ color: vinc ? 'var(--ok)' : 'var(--testo-2)', flex: 1 }}>
                      {formattaNumero(Math.round(vinc?.valore ?? ang))}°
                    </span>
                    <button
                      className={`btn${vinc ? ' attivo' : ''}`}
                      style={{ minHeight: 34, padding: '0 8px' }}
                      title="Vincola l'angolo: modificandolo la forma si adatta"
                      onClick={() => {
                        const attuale = Math.round(vinc?.valore ?? ang);
                        const risp = window.prompt(`Angolo al vertice ${i + 1} (gradi):`, String(attuale));
                        if (risp == null) return;
                        const g = parseFloat(risp.replace(',', '.'));
                        if (Number.isFinite(g) && g > 0 && g < 180) onQuotaAngolo(i, g);
                      }}
                    >
                      {vinc ? '✎' : 'vincola'}
                    </button>
                    {vinc && (
                      <button
                        className="btn"
                        style={{ minHeight: 34, padding: '0 8px' }}
                        title="Rimuovi il vincolo angolare"
                        onClick={() => onQuotaAngolo(i, null)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
              Vincola un angolo per comandarlo: modificandolo la forma si adatta rispettando gli
              altri vincoli.
            </span>
          </div>
        )}
        {onApplicaVincoli &&
          (() => {
            const DUE: TipoVincoloPianta[] = [
              'parallelo',
              'perpendicolare',
              'ugualeLunghezza',
              'collineare'
            ];
            const OPZIONI: Array<{ t: TipoVincoloPianta; testo: string }> = [
              { t: 'orizzontale', testo: 'Orizzontale' },
              { t: 'verticale', testo: 'Verticale' },
              { t: 'parallelo', testo: 'Parallelo' },
              { t: 'perpendicolare', testo: 'Perpendicolare' },
              { t: 'ugualeLunghezza', testo: 'Uguale lunghezza' },
              { t: 'collineare', testo: 'Collineare' }
            ];
            const simbolo: Partial<Record<TipoVincoloPianta, string>> = {
              orizzontale: '─',
              verticale: '│',
              parallelo: '∥',
              perpendicolare: '⊥',
              ugualeLunghezza: '=',
              collineare: '⋯'
            };
            const due = DUE.includes(tipoVincolo);
            // clamp difensivo: n può calare (eliminazione lato) lasciando indici stantii
            const a = Math.min(latoVincA, n - 1);
            const b = Math.min(latoVincB, n - 1);
            const vinciGeom = (poli.vincoli ?? []).filter((v) => v.tipo !== 'angolo');
            const applica = () => {
              const rif =
                due && a !== b
                  ? [
                      { entita: 'lato' as const, indice: a },
                      { entita: 'lato' as const, indice: b }
                    ]
                  : [{ entita: 'lato' as const, indice: a }];
              const nuovo: VincoloPianta = { id: nuovoId(), tipo: tipoVincolo, riferimenti: rif };
              onApplicaVincoli([...(poli.vincoli ?? []), nuovo]);
            };
            return (
              <div className="campo">
                <label>Vincoli geometrici (Fase 3)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={tipoVincolo}
                    onChange={(e) => setTipoVincolo(e.target.value as TipoVincoloPianta)}
                  >
                    {OPZIONI.map((o) => (
                      <option key={o.t} value={o.t}>
                        {o.testo}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    lato
                    <select value={a} onChange={(e) => setLatoVincA(Number(e.target.value))}>
                      {poli.punti.map((_, i) => (
                        <option key={i} value={i}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  {due && (
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      e lato
                      <select value={b} onChange={(e) => setLatoVincB(Number(e.target.value))}>
                        {poli.punti.map((_, i) => (
                          <option key={i} value={i}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button className="btn" onClick={applica} disabled={due && a === b}>
                    ＋ Applica
                  </button>
                </div>
                {vinciGeom.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {vinciGeom.map((v) => {
                      const li = v.riferimenti.map((r) => (r.indice ?? 0) + 1).join('–');
                      return (
                        <span
                          key={v.id}
                          className="btn"
                          style={{ minHeight: 34, padding: '0 8px', display: 'inline-flex', gap: 6, alignItems: 'center' }}
                        >
                          {simbolo[v.tipo] ?? ''} lato {li}
                          <button
                            aria-label="Rimuovi vincolo"
                            style={{ background: 'none', border: 'none', color: 'var(--testo-2)', cursor: 'pointer' }}
                            onClick={() => onApplicaVincoli((poli.vincoli ?? []).filter((x) => x.id !== v.id))}
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
                  Applica un vincolo tra i lati (numerati come le quote): la forma si adatta
                  rispettando i vincoli. Ripeti per vincolare più lati insieme.
                </span>
              </div>
            );
          })()}
        <div className="campo">
          <label>Colore e dimensione</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <BottoneColore colore={colore} onScegli={(c) => onModifica({ stile: { ...poli.stile, colore: c } })} />
            <span className="segmenti" role="group" aria-label="Dimensione">
              <button aria-label="Riduci" onClick={() => scalaStile(1 / 1.25)}>
                A−
              </button>
              <button aria-label="Aumenta" onClick={() => scalaStile(1.25)}>
                A＋
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="eq-azioni">
        <button className="btn pericolo" onClick={onElimina}>
          <Icona nome="cestino" dimensione={18} /> Elimina
        </button>
        <button className="btn primario" onClick={onChiudi}>
          ✓ Fine
        </button>
      </div>
    </div>
  );
}

function SchermataFotoDanneggiata({ foto }: { foto: Foto }) {
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);
  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => naviga({ nome: 'progetto', id: foto.progettoId })}
        >
          ←
        </button>
        <h1>{foto.didascalia || 'Foto'}</h1>
      </header>
      <main className="contenuto">
        <div className="vuoto">
          <div className="grande">⚠️</div>
          <p>
            Il contenuto di questa foto è stato perso dal browser: un difetto di iOS/Safari nelle
            prime versioni dell'app poteva corrompere le immagini archiviate. Il problema è stato
            risolto per le foto nuove, ma questa non è recuperabile.
          </p>
          <p style={{ marginTop: 16 }}>
            <button
              className="btn pericolo"
              onClick={() =>
                setConferma({
                  titolo: 'Eliminare la foto danneggiata?',
                  messaggio:
                    'Il record e le eventuali annotazioni verranno rimossi definitivamente.',
                  onConferma: () => {
                    void eliminaFoto(foto.id).then(() =>
                      naviga({ nome: 'progetto', id: foto.progettoId })
                    );
                  }
                })
              }
            >
              <Icona nome="cestino" dimensione={18} /> Elimina questa foto
            </button>
          </p>
        </div>
      </main>
      <ConfermaDialog richiesta={conferma} onChiudi={() => setConferma(null)} />
    </div>
  );
}

function BtnStrumento({
  attivo,
  onClick,
  icona,
  testo,
  gruppo
}: {
  attivo: boolean;
  onClick: () => void;
  icona: NomeIcona;
  testo: string;
  /** pulsante-gruppo: mostra la freccetta che indica le opzioni nascoste */
  gruppo?: boolean;
}) {
  return (
    <button className={`btn${attivo ? ' attivo' : ''}`} onClick={onClick}>
      <span className="ico">
        <Icona nome={icona} dimensione={23} />
      </span>
      <span className="testo-strumento">
        {testo}
        {gruppo && <Icona nome="giu" dimensione={13} className="caret" />}
      </span>
    </button>
  );
}

/**
 * Pulsante colore unico: un pallino che mostra il colore attivo; toccandolo
 * si apre il menu con le tinte e la scelta personalizzata. Stessa logica per
 * tutti gli strumenti che usano un colore.
 */
function BottoneColore({ colore, onScegli }: { colore: string; onScegli: (c: string) => void }) {
  const [aperto, setAperto] = useState(false);
  return (
    <span className="colore-wrap">
      <button
        className="btn-colore"
        style={{ background: colore }}
        aria-label="Colore"
        title="Colore"
        onClick={() => setAperto((a) => !a)}
      />
      {aperto && (
        <>
          <div className="backdrop-strumenti" onClick={() => setAperto(false)} />
          <div className="popover-colore" role="menu" aria-label="Scegli colore">
            {COLORI.map((c) => (
              <button
                key={c}
                className={`swatch${colore.toLowerCase() === c.toLowerCase() ? ' attivo' : ''}`}
                style={{ background: c }}
                aria-label={`Colore ${c}`}
                onClick={() => {
                  onScegli(c);
                  setAperto(false);
                }}
              />
            ))}
            <label className="swatch-custom" title="Colore personalizzato">
              <Icona nome="goccia" dimensione={20} />
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(colore) ? colore : '#ffc400'}
                onChange={(e) => onScegli(e.target.value)}
              />
            </label>
          </div>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pannello proprietà dell'annotazione selezionata: ogni dato è correggibile
// ---------------------------------------------------------------------------

function PannelloProprieta({
  ann,
  annotazioni,
  foto,
  inputValore,
  onModifica,
  onElimina,
  onModificaTesto,
  onModificaLegenda,
  onModificaEtichetta,
  onModificaQuota,
  onModificaSegmento,
  onCalibraDaQuota
}: {
  ann: Annotazione;
  annotazioni: Annotazione[];
  foto: Foto;
  inputValore: React.RefObject<HTMLInputElement>;
  onModifica: (m: Partial<Annotazione>) => void;
  onElimina: () => void;
  onModificaTesto: () => void;
  onModificaLegenda: () => void;
  onModificaEtichetta: () => void;
  onModificaQuota: () => void;
  onModificaSegmento: (indice: number) => void;
  onCalibraDaQuota: (q: Quota) => void;
}) {
  // dimensione personalizzabile: scala spessore linee e testo insieme
  const scalaStile = (fattore: number) => {
    onModifica({
      stile: {
        ...ann.stile,
        spessore: Math.min(40, Math.max(1, ann.stile.spessore * fattore)),
        dimensioneTesto: Math.min(200, Math.max(8, Math.round(ann.stile.dimensioneTesto * fattore)))
      }
    });
  };

  return (
    <div className="pannello-proprieta">
      <div className="prop-specifici">
        {ann.tipo === 'quota' && (
          <>
            <button className="btn primario" onClick={onModificaQuota}>
              <Icona nome="matita" dimensione={18} /> Modifica
            </button>
            <ProprietaQuota
              quota={ann}
              annotazioni={annotazioni}
              foto={foto}
              inputValore={inputValore}
              onModifica={onModifica}
              onCalibraDaQuota={onCalibraDaQuota}
            />
          </>
        )}
        {ann.tipo === 'quotaRett' && (
          <ProprietaRettangolo rett={ann} foto={foto} inputValore={inputValore} onModifica={onModifica} />
        )}
        {ann.tipo === 'quotaPoligono' && (
          <ProprietaPoligono poli={ann} foto={foto} onModifica={onModifica} onModificaSegmento={onModificaSegmento} />
        )}
        {ann.tipo === 'quotaAngolo' && (
          <>
            <button className="btn primario" onClick={onModificaQuota}>
              <Icona nome="matita" dimensione={18} /> Modifica
            </button>
            <ProprietaAngolo angolo={ann} foto={foto} onModifica={onModifica} />
          </>
        )}
        {ann.tipo === 'quotaRaggio' && (
          <>
            <button className="btn primario" onClick={onModificaQuota}>
              <Icona nome="matita" dimensione={18} /> Modifica
            </button>
            <ProprietaRaggio raggio={ann} foto={foto} inputValore={inputValore} onModifica={onModifica} />
          </>
        )}
        {ann.tipo === 'testo' && (
          <button className="btn" onClick={onModificaTesto}>
            <Icona nome="matita" dimensione={18} /> Modifica testo
          </button>
        )}
        {ann.tipo === 'etichetta' && (
          <>
            <span className="badge-legenda" aria-label={`Etichetta ${ann.lettera}`}>{ann.lettera}</span>
            <button className="btn primario" onClick={onModificaEtichetta}>
              <Icona nome="matita" dimensione={18} /> Modifica
            </button>
          </>
        )}
        {ann.tipo === 'legenda' && (
          <>
            <button className="btn primario" onClick={onModificaLegenda}>
              <Icona nome="documento" dimensione={18} /> Modifica
            </button>
            <button
              className="btn"
              onClick={() =>
                onModifica({ forma: ann.forma === 'rettangolo' ? 'arrotondato' : 'rettangolo' })
              }
            >
              {ann.forma === 'rettangolo' ? '▭ Squadrato' : '▢ Arrotondato'}
            </button>
          </>
        )}
        {ann.tipo === 'forma' && (
          <>
            {/* riempimento: solo per le forme chiuse, non per la linea */}
            {ann.forma !== 'linea' && (
              <button
                className={`btn${ann.riempimento ? ' attivo' : ''}`}
                onClick={() =>
                  onModifica(
                    ann.riempimento
                      ? { riempimento: undefined }
                      : { riempimento: ann.stile.colore, opacitaRiempimento: ann.opacitaRiempimento ?? 0.3 }
                  )
                }
              >
                {ann.riempimento ? '■ Riempito' : '▢ Vuoto'}
              </button>
            )}
            {ann.forma === 'linea'
              ? (() => {
                  // ciclo: continua → tratteggio → tratto-punto (asse) → continua
                  const sp = ann.stile.spessore;
                  const stile = !ann.tratteggio
                    ? 'continua'
                    : ann.tratteggio.length >= 4
                      ? 'asse'
                      : 'tratteggio';
                  const prossimo =
                    stile === 'continua'
                      ? [sp * 4, sp * 3]
                      : stile === 'tratteggio'
                        ? [sp * 6, sp * 3, sp, sp * 3]
                        : undefined;
                  const etichetta =
                    stile === 'continua'
                      ? '── Continua'
                      : stile === 'tratteggio'
                        ? '┄ Tratteggio'
                        : '─·─ Asse';
                  return (
                    <button className="btn" onClick={() => onModifica({ tratteggio: prossimo })}>
                      {etichetta}
                    </button>
                  );
                })()
              : (
                <button
                  className={`btn${ann.tratteggio ? ' attivo' : ''}`}
                  onClick={() =>
                    onModifica({
                      tratteggio: ann.tratteggio
                        ? undefined
                        : [ann.stile.spessore * 4, ann.stile.spessore * 3]
                    })
                  }
                >
                  {ann.tratteggio ? '┄ Tratteggio' : '── Continuo'}
                </button>
              )}
            <label className="fisc-check" style={{ marginLeft: 4 }}>
              <input
                type="checkbox"
                checked={ann.partePerimetro}
                onChange={(e) => onModifica({ partePerimetro: e.target.checked })}
              />
              Nel PDF
            </label>
          </>
        )}
        {ann.tipo === 'callout' && (
          <>
            <label style={{ color: 'var(--testo-2)', fontSize: 14 }}>Etichetta</label>
            <input
              className="input-misura"
              style={{ width: 70 }}
              value={ann.etichetta}
              maxLength={3}
              onChange={(e) => onModifica({ etichetta: e.target.value.toUpperCase() })}
            />
          </>
        )}
        <span className="segmenti" role="group" aria-label="Dimensione annotazione">
          <button aria-label="Riduci dimensione" onClick={() => scalaStile(1 / 1.25)}>
            A−
          </button>
          <button aria-label="Aumenta dimensione" onClick={() => scalaStile(1.25)}>
            A＋
          </button>
        </span>
      </div>
      {/* colore ed elimina sempre visibili (non scorrono) */}
      <BottoneColore
        colore={ann.stile.colore}
        onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })}
      />
      <button className="btn pericolo prop-elimina" onClick={onElimina} aria-label="Elimina" title="Elimina">
        <Icona nome="cestino" dimensione={20} />
      </button>
    </div>
  );
}

/** Campo misura riutilizzabile con gestione di valoreAuto */
function CampoMisura({
  valore,
  valoreAuto,
  calcolabile,
  inputRef,
  onValore,
  onRiattivaAuto
}: {
  valore: number | null;
  valoreAuto: boolean | undefined;
  calcolabile: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  onValore: (v: number | null) => void;
  onRiattivaAuto: () => void;
}) {
  const [testo, setTesto] = useState(valore === null ? '' : String(valore).replace('.', ','));
  const valoreRef = useRef(valore);
  useEffect(() => {
    // si risincronizza quando il valore cambia dall'esterno (es. ricalcolo auto)
    if (valore !== valoreRef.current) {
      valoreRef.current = valore;
      setTesto(valore === null ? '' : String(valore).replace('.', ','));
    }
  }, [valore]);

  return (
    <>
      <input
        ref={inputRef}
        className="input-misura"
        type="text"
        inputMode="decimal"
        placeholder="misura"
        aria-label="Valore della misura"
        value={testo}
        onChange={(e) => {
          const t = e.target.value;
          setTesto(t);
          const v = analizzaMisura(t);
          if (t.trim() !== '' && v === null) return; // input non valido: non salvare
          valoreRef.current = v;
          onValore(v);
        }}
      />
      {calcolabile &&
        (valoreAuto ? (
          <span style={{ color: 'var(--ok)', fontSize: 13, fontWeight: 700 }} title="Calcolato dalla calibrazione">
            auto
          </span>
        ) : (
          <button className="btn" style={{ minHeight: 44, padding: '0 10px' }} onClick={onRiattivaAuto} title="Ricalcola dalla calibrazione">
            ↻ auto
          </button>
        ))}
    </>
  );
}

function ProprietaQuota({
  quota,
  annotazioni,
  foto,
  inputValore,
  onModifica,
  onCalibraDaQuota
}: {
  quota: Quota;
  annotazioni: Annotazione[];
  foto: Foto;
  inputValore: React.RefObject<HTMLInputElement>;
  onModifica: (m: Partial<Quota>) => void;
  onCalibraDaQuota: (q: Quota) => void;
}) {
  const catena = useMemo(() => {
    return calcolaCatene(annotazioni).find((c) => c.quote.some((q) => q.id === quota.id)) ?? null;
  }, [annotazioni, quota.id]);

  const calibrata = haCalibrazione(foto);

  return (
    <>
      <CampoMisura
        key={quota.id}
        valore={quota.valore}
        valoreAuto={quota.valoreAuto}
        calcolabile={calibrata}
        inputRef={inputValore}
        onValore={(v) => onModifica({ valore: v, valoreAuto: false })}
        onRiattivaAuto={() => {
          const v = valoreAutomatico(quota, foto);
          if (v !== null) onModifica({ valore: v, valoreAuto: true });
        }}
      />
      <select
        aria-label="Unità"
        value={quota.unita}
        onChange={(e) => {
          const unita = e.target.value as Unita;
          if (quota.valoreAuto) {
            const v = valoreAutomatico({ ...quota, unita }, foto);
            onModifica({ unita, valore: v ?? quota.valore });
          } else {
            onModifica({ unita });
          }
        }}
        style={{ minHeight: 44, borderRadius: 10, background: 'var(--sfondo)', border: '1px solid var(--bordo)', padding: '0 8px' }}
      >
        <option value="mm">mm</option>
        <option value="cm">cm</option>
        <option value="m">m</option>
      </select>
      <span className="segmenti" role="group" aria-label="Stato della misura">
        {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
          <button key={s} className={quota.stato === s ? 'attivo' : ''} onClick={() => onModifica({ stato: s })}>
            {s === 'reale' ? 'Reale' : '≈ Stimata'}
          </button>
        ))}
      </span>
      <span className="segmenti" role="group" aria-label="Posizione del testo">
        {(
          [
            ['sopra', 'Sopra'],
            ['centro', 'Centro'],
            ['sotto', 'Sotto']
          ] as Array<[PosizioneTesto, string]>
        ).map(([v, t]) => (
          <button key={v} className={quota.posizioneTesto === v ? 'attivo' : ''} onClick={() => onModifica({ posizioneTesto: v })}>
            {t}
          </button>
        ))}
      </span>
      {quota.valore !== null && !quota.valoreAuto && !calibrata && (
        <button className="btn" onClick={() => onCalibraDaQuota(quota)} title="Usa questa quota come riferimento di scala per calcolare le altre">
          <Icona nome="righello" dimensione={18} /> Usa come scala
        </button>
      )}
      {catena && sommaCatenaInUnita(catena) !== null && (
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          Catena ({catena.quote.length}): {formattaNumero(sommaCatenaInUnita(catena)!)} {catena.unita}
          {catena.completa ? '' : ' (parz.)'}
        </span>
      )}
    </>
  );
}

function ProprietaRettangolo({
  rett,
  foto,
  inputValore,
  onModifica
}: {
  rett: QuotaRettangolo;
  foto: Foto;
  inputValore: React.RefObject<HTMLInputElement>;
  onModifica: (m: Partial<QuotaRettangolo>) => void;
}) {
  const calibrata = haCalibrazione(foto);
  return (
    <>
      <input
        className="input-misura"
        style={{ width: 56 }}
        value={rett.etichetta ?? ''}
        maxLength={4}
        aria-label="Nomenclatura dell'elemento"
        placeholder="n°"
        onChange={(e) => onModifica({ etichetta: e.target.value })}
      />
      <label style={{ color: 'var(--testo-2)', fontSize: 13 }}>B</label>
      <CampoMisura
        key={`${rett.id}-b`}
        valore={rett.valoreBase}
        valoreAuto={rett.valoreAuto}
        calcolabile={false}
        inputRef={inputValore}
        onValore={(v) => onModifica({ valoreBase: v, valoreAuto: false })}
        onRiattivaAuto={() => {}}
      />
      <label style={{ color: 'var(--testo-2)', fontSize: 13 }}>H</label>
      <CampoMisura
        key={`${rett.id}-h`}
        valore={rett.valoreAltezza}
        valoreAuto={rett.valoreAuto}
        calcolabile={calibrata}
        onValore={(v) => onModifica({ valoreAltezza: v, valoreAuto: false })}
        onRiattivaAuto={() => {
          const m = misureRettangolo(quadrilateroQuotaRett(rett), foto, rett.unita);
          if (m) onModifica({ valoreBase: m.base, valoreAltezza: m.altezza, valoreAuto: true });
        }}
      />
      <select
        aria-label="Unità"
        value={rett.unita}
        onChange={(e) => {
          const unita = e.target.value as Unita;
          if (rett.valoreAuto) {
            const m = misureRettangolo(quadrilateroQuotaRett(rett), foto, unita);
            onModifica({ unita, valoreBase: m?.base ?? rett.valoreBase, valoreAltezza: m?.altezza ?? rett.valoreAltezza });
          } else {
            onModifica({ unita });
          }
        }}
        style={{ minHeight: 44, borderRadius: 10, background: 'var(--sfondo)', border: '1px solid var(--bordo)', padding: '0 8px' }}
      >
        <option value="mm">mm</option>
        <option value="cm">cm</option>
        <option value="m">m</option>
      </select>
      <span className="segmenti" role="group" aria-label="Stato della misura">
        {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
          <button key={s} className={rett.stato === s ? 'attivo' : ''} onClick={() => onModifica({ stato: s })}>
            {s === 'reale' ? 'Reale' : '≈ Stimata'}
          </button>
        ))}
      </span>
    </>
  );
}

function ProprietaPoligono({
  poli,
  foto,
  onModifica,
  onModificaSegmento
}: {
  poli: QuotaPoligono;
  foto: Foto;
  onModifica: (m: Partial<QuotaPoligono>) => void;
  onModificaSegmento: (indice: number) => void;
}) {
  const n = poli.punti.length;
  const segs = segmentiPoligono(poli);
  const calibrata = haCalibrazione(foto);
  const scriviSegmenti = (segmenti: SegmentoQuota[], extra: Partial<QuotaPoligono> = {}) =>
    onModifica({ segmenti, lati: undefined, offsetLati: undefined, valoreAuto: false, ...extra });

  // lati non ancora quotati (per "+ lato")
  const haSegmento = (da: number, a: number) =>
    segs.some((s) => (s.da === da && s.a === a) || (s.da === a && s.a === da));
  const latiMancanti: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (!haSegmento(i, j)) latiMancanti.push([i, j]);
  }
  const diagonaliPresenti = segs.some((s) => !segmentoELato(s, n));

  const simboli = simboliPoligono(poli);
  const valSeg = (s: SegmentoQuota) =>
    s.valore === null ? '?' : `${formattaNumero(s.valore)} ${poli.unita}`;

  const aggiungiSegmento = (da: number, a: number) => {
    const valore = calibrata ? misuraSegmento(poli.punti[da], poli.punti[a], foto, poli.unita) : null;
    scriviSegmenti([...segs, { da, a, valore }]);
  };

  return (
    <>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{nomeFormaPoligono(poli)}</span>
      <input
        className="input-misura"
        style={{ width: 50 }}
        value={poli.etichetta ?? ''}
        maxLength={4}
        aria-label="Nomenclatura dell'elemento"
        placeholder="n°"
        onChange={(e) => onModifica({ etichetta: e.target.value })}
      />
      {/* un pulsante per segmento: tocca → ambiente di modifica dedicato */}
      {segs.map((s, i) => (
        <button
          key={i}
          className="btn"
          style={{ minHeight: 44, padding: '0 10px', whiteSpace: 'nowrap' }}
          onClick={() => onModificaSegmento(i)}
          title="Modifica questa quota"
        >
          {simboli[i]} {valSeg(s)} ✎
        </button>
      ))}
      {latiMancanti.length > 0 && (
        <button
          className="btn"
          style={{ minHeight: 44, padding: '0 10px' }}
          title="Aggiungi la quota di un altro lato"
          onClick={() => aggiungiSegmento(latiMancanti[0][0], latiMancanti[0][1])}
        >
          ＋ lato
        </button>
      )}
      {n === 4 && (
        <button
          className={`btn${diagonaliPresenti ? ' attivo' : ''}`}
          style={{ minHeight: 44, padding: '0 10px' }}
          title="Quota le diagonali (rombo)"
          onClick={() => {
            if (diagonaliPresenti) {
              scriviSegmenti(segs.filter((s) => segmentoELato(s, n)));
            } else {
              const d: SegmentoQuota[] = [
                [0, 2],
                [1, 3]
              ].map(([da, a]) => ({
                da,
                a,
                valore: calibrata ? misuraSegmento(poli.punti[da], poli.punti[a], foto, poli.unita) : null
              }));
              scriviSegmenti([...segs, ...d]);
            }
          }}
        >
          ◇ Diagonali
        </button>
      )}
      <select
        aria-label="Unità"
        value={poli.unita}
        onChange={(e) => {
          const unita = e.target.value as Unita;
          onModifica({ unita });
        }}
        style={{ minHeight: 44, borderRadius: 10, background: 'var(--sfondo)', border: '1px solid var(--bordo)', padding: '0 8px' }}
      >
        <option value="mm">mm</option>
        <option value="cm">cm</option>
        <option value="m">m</option>
      </select>
      <span className="segmenti" role="group" aria-label="Stato della misura">
        {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
          <button key={s} className={poli.stato === s ? 'attivo' : ''} onClick={() => onModifica({ stato: s })}>
            {s === 'reale' ? 'Reale' : '≈ Stimata'}
          </button>
        ))}
      </span>
    </>
  );
}

function ProprietaAngolo({
  angolo,
  foto,
  onModifica
}: {
  angolo: QuotaAngolare;
  foto: Foto;
  onModifica: (m: Partial<QuotaAngolare>) => void;
}) {
  return (
    <>
      <CampoMisura
        key={angolo.id}
        valore={angolo.valore}
        valoreAuto={angolo.valoreAuto}
        calcolabile={true}
        onValore={(v) => onModifica({ valore: v, valoreAuto: false })}
        onRiattivaAuto={() => {
          const v = valoreAutomatico(angolo, foto);
          if (v !== null) onModifica({ valore: v, valoreAuto: true });
        }}
      />
      <span style={{ fontWeight: 700 }}>°</span>
      <span className="segmenti" role="group" aria-label="Stato della misura">
        {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
          <button key={s} className={angolo.stato === s ? 'attivo' : ''} onClick={() => onModifica({ stato: s })}>
            {s === 'reale' ? 'Reale' : '≈ Stimata'}
          </button>
        ))}
      </span>
    </>
  );
}

function ProprietaRaggio({
  raggio,
  foto,
  inputValore,
  onModifica
}: {
  raggio: QuotaRaggio;
  foto: Foto;
  inputValore: React.RefObject<HTMLInputElement>;
  onModifica: (m: Partial<QuotaRaggio>) => void;
}) {
  const calibrata = haCalibrazione(foto);
  return (
    <>
      <CampoMisura
        key={raggio.id}
        valore={raggio.valore}
        valoreAuto={raggio.valoreAuto}
        calcolabile={calibrata}
        inputRef={inputValore}
        onValore={(v) => onModifica({ valore: v, valoreAuto: false })}
        onRiattivaAuto={() => {
          const v = valoreAutomatico(raggio, foto);
          if (v !== null) onModifica({ valore: v, valoreAuto: true });
        }}
      />
      <select
        aria-label="Unità"
        value={raggio.unita}
        onChange={(e) => {
          const unita = e.target.value as Unita;
          if (raggio.valoreAuto) {
            const v = valoreAutomatico({ ...raggio, unita }, foto);
            onModifica({ unita, valore: v ?? raggio.valore });
          } else {
            onModifica({ unita });
          }
        }}
        style={{ minHeight: 44, borderRadius: 10, background: 'var(--sfondo)', border: '1px solid var(--bordo)', padding: '0 8px' }}
      >
        <option value="mm">mm</option>
        <option value="cm">cm</option>
        <option value="m">m</option>
      </select>
      <span className="segmenti" role="group" aria-label="Raggio o diametro">
        {(
          [
            ['raggio', 'R'],
            ['diametro', '⌀']
          ] as Array<[QuotaRaggio['modo'], string]>
        ).map(([m, t]) => (
          <button
            key={m}
            className={raggio.modo === m ? 'attivo' : ''}
            onClick={() => {
              if (raggio.valoreAuto) {
                const v = valoreAutomatico({ ...raggio, modo: m }, foto);
                onModifica({ modo: m, valore: v ?? raggio.valore });
              } else {
                onModifica({ modo: m });
              }
            }}
          >
            {t}
          </button>
        ))}
      </span>
      <span className="segmenti" role="group" aria-label="Stato della misura">
        {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
          <button key={s} className={raggio.stato === s ? 'attivo' : ''} onClick={() => onModifica({ stato: s })}>
            {s === 'reale' ? 'Reale' : '≈ Stimata'}
          </button>
        ))}
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Schede: calibrazioni, note della foto e testo
// ---------------------------------------------------------------------------

function SchedaScala({
  px,
  unitaDefault,
  onChiudi,
  onSalva
}: {
  px: number;
  unitaDefault: Unita;
  onChiudi: () => void;
  onSalva: (reale: number, unita: Unita) => void;
}) {
  const [testo, setTesto] = useState('');
  const [unita, setUnita] = useState<Unita>(unitaDefault);
  const valore = analizzaMisura(testo);
  return (
    <Modale titolo="Calibrazione di scala" onChiudi={onChiudi} centro>
      <p style={{ color: 'var(--testo-2)' }}>
        Hai indicato un segmento di {Math.round(px)} px. Inserisci la sua lunghezza reale: l'app
        ricaverà il rapporto px↔reale e calcolerà automaticamente le quote su questo piano.
      </p>
      <div className="campo">
        <label>Lunghezza reale del segmento *</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input autoFocus inputMode="decimal" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="es. 80" />
          <select value={unita} onChange={(e) => setUnita(e.target.value as Unita)} style={{ width: 110 }}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </div>
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button className="btn primario" disabled={valore === null || valore <= 0} onClick={() => onSalva(valore!, unita)}>
          Calibra
        </button>
      </div>
    </Modale>
  );
}

/** Dialog per le misure del formato di riferimento personalizzato */
function SchedaFormatoPers({
  unitaDefault,
  iniziale,
  onChiudi,
  onSalva
}: {
  unitaDefault: Unita;
  iniziale: { lungo: number; corto: number } | null;
  onChiudi: () => void;
  onSalva: (lungoMm: number, cortoMm: number) => void;
}) {
  // mostra i valori iniziali (mm) convertiti nell'unità scelta
  const [unita, setUnita] = useState<Unita>(unitaDefault);
  const conv = (mm: number) => String(daMillimetri(mm, unita)).replace('.', ',');
  const [a, setA] = useState(iniziale ? conv(iniziale.lungo) : '');
  const [b, setB] = useState(iniziale ? conv(iniziale.corto) : '');
  const va = analizzaMisura(a);
  const vb = analizzaMisura(b);
  const valido = va !== null && va > 0 && vb !== null && vb > 0;
  return (
    <Modale titolo="Formato personalizzato" onChiudi={onChiudi} centro>
      <p style={{ color: 'var(--testo-2)' }}>
        Inserisci le due dimensioni reali dell'oggetto di riferimento (es. una piastrella, un
        mattone). L'orientamento viene assegnato automaticamente.
      </p>
      <div className="campo">
        <label>Dimensioni *</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input autoFocus inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} placeholder="lato 1" style={{ flex: 1 }} />
          <span style={{ fontWeight: 700 }}>×</span>
          <input inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} placeholder="lato 2" style={{ flex: 1 }} />
          <select value={unita} onChange={(e) => setUnita(e.target.value as Unita)} style={{ width: 80 }}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </div>
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          disabled={!valido}
          onClick={() => {
            const m1 = inMillimetri(va!, unita);
            const m2 = inMillimetri(vb!, unita);
            onSalva(Math.max(m1, m2), Math.min(m1, m2));
          }}
        >
          Usa questo formato
        </button>
      </div>
    </Modale>
  );
}

function SchedaPiano({
  unitaDefault,
  punti,
  onChiudi,
  onSalva
}: {
  unitaDefault: Unita;
  punti?: [Punto, Punto, Punto, Punto];
  onChiudi: () => void;
  onSalva: (larghezza: number, altezza: number, unita: Unita) => void;
}) {
  // qualità della calibrazione: più grande appare il riferimento (in pixel),
  // più la scala è precisa. Stima grezza dell'errore = 1px sul lato più corto.
  const latoMinPx = punti
    ? Math.min(
        distanza(punti[0], punti[1]),
        distanza(punti[1], punti[2]),
        distanza(punti[2], punti[3]),
        distanza(punti[3], punti[0])
      )
    : 0;
  const qualita =
    latoMinPx <= 0
      ? null
      : latoMinPx > 400
        ? { testo: '● Riferimento ampio: ottima precisione', colore: 'var(--ok)' }
        : latoMinPx > 200
          ? { testo: '◐ Precisione buona', colore: '#ffc400' }
          : { testo: '○ Riferimento piccolo: avvicinati per più precisione', colore: '#ff9500' };
  const [testoL, setTestoL] = useState('');
  const [testoA, setTestoA] = useState('');
  const [unita, setUnita] = useState<Unita>(unitaDefault);
  const larghezza = analizzaMisura(testoL);
  const altezza = analizzaMisura(testoA);
  const valido = larghezza !== null && larghezza > 0 && altezza !== null && altezza > 0;
  // riferimenti standard: ↔ = orizzontale (più largo che alto), ↕ = verticale
  const PRESET: Array<{ nome: string; l: number; a: number }> = [
    { nome: 'A4 ↔', l: 297, a: 210 },
    { nome: 'A4 ↕', l: 210, a: 297 },
    { nome: 'A3 ↔', l: 420, a: 297 },
    { nome: 'A3 ↕', l: 297, a: 420 },
    { nome: 'A5 ↔', l: 210, a: 148 },
    { nome: 'A5 ↕', l: 148, a: 210 },
    { nome: 'Bancomat ↔', l: 85.6, a: 54 },
    { nome: 'Bancomat ↕', l: 54, a: 85.6 }
  ];
  const applicaPreset = (l: number, a: number) => {
    setTestoL(String(l).replace('.', ','));
    setTestoA(String(a).replace('.', ','));
    setUnita('mm');
  };
  return (
    <Modale titolo="Piano di riferimento (prospettiva)" onChiudi={onChiudi} centro>
      <p style={{ color: 'var(--testo-2)' }}>
        Inserisci le dimensioni reali del rettangolo indicato (una porta, una piastrella, un
        infisso) oppure scegli un riferimento standard. Tutte le misure su quel piano vengono
        calcolate correggendo la prospettiva.
      </p>
      <div className="campo">
        <label>Riferimenti rapidi (scegli l'orientamento come appare nella foto)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESET.map((p) => (
            <button
              key={p.nome}
              className={
                larghezza === p.l && altezza === p.a && unita === 'mm' ? 'btn attivo' : 'btn'
              }
              style={{ minHeight: 40, padding: '0 10px' }}
              onClick={() => applicaPreset(p.l, p.a)}
            >
              {p.nome}
            </button>
          ))}
        </div>
      </div>
      <div className="campo">
        <label>Larghezza reale (lato alto) *</label>
        <input autoFocus inputMode="decimal" value={testoL} onChange={(e) => setTestoL(e.target.value)} placeholder="es. 90" />
      </div>
      <div className="campo">
        <label>Altezza reale (lato destro) *</label>
        <input inputMode="decimal" value={testoA} onChange={(e) => setTestoA(e.target.value)} placeholder="es. 210" />
      </div>
      <div className="campo">
        <label>Unità</label>
        <select value={unita} onChange={(e) => setUnita(e.target.value as Unita)}>
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
        </select>
      </div>
      {qualita && (
        <p style={{ color: qualita.colore, fontSize: 13, fontWeight: 700, margin: '4px 0 0' }}>
          {qualita.testo}
        </p>
      )}
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button className="btn primario" disabled={!valido} onClick={() => onSalva(larghezza!, altezza!, unita)}>
          Attiva piano
        </button>
      </div>
    </Modale>
  );
}

function SchedaNoteFoto({
  foto,
  onRimuoviCalibrazione,
  onChiudi
}: {
  foto: Foto;
  onRimuoviCalibrazione: (f: Pick<Foto, 'scala' | 'piano'>) => void;
  onChiudi: () => void;
}) {
  const [didascalia, setDidascalia] = useState(foto.didascalia);
  const [etichetta, setEtichetta] = useState(foto.etichetta ?? '');
  const [noteDato, setNoteDato] = useState(foto.noteDato);
  const [dataScatto, setDataScatto] = useState(aInputDataOra(foto.dataScatto));
  const [lat, setLat] = useState(foto.geotag ? String(foto.geotag.lat) : '');
  const [lng, setLng] = useState(foto.geotag ? String(foto.geotag.lng) : '');
  const [dettaturaAttiva, setDettaturaAttiva] = useState(false);
  const stopDettatura = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => stopDettatura.current?.();
  }, []);

  const toggleDettatura = () => {
    if (dettaturaAttiva) {
      stopDettatura.current?.();
      stopDettatura.current = null;
      setDettaturaAttiva(false);
      return;
    }
    setDettaturaAttiva(true);
    stopDettatura.current = avviaDettatura(
      (frase) => {
        setNoteDato((prev) => (prev.trim() === '' ? frase : `${prev.trimEnd()} ${frase}`));
      },
      (errore) => {
        setDettaturaAttiva(false);
        stopDettatura.current = null;
        if (errore) mostraToast('errore', errore);
      }
    );
  };

  const salva = async () => {
    const nuovaData = daInputDataOra(dataScatto);
    let geotag = foto.geotag;
    const nLat = lat.trim() === '' ? null : Number(lat.replace(',', '.'));
    const nLng = lng.trim() === '' ? null : Number(lng.replace(',', '.'));
    if (nLat === null || nLng === null) geotag = null;
    else if (Number.isFinite(nLat) && Number.isFinite(nLng)) geotag = { lat: nLat, lng: nLng };
    else {
      mostraToast('errore', 'Coordinate GPS non valide.');
      return;
    }
    stopDettatura.current?.();
    await aggiornaFoto(foto.id, {
      didascalia: didascalia.trim(),
      etichetta: etichetta.trim() || undefined,
      noteDato,
      dataScatto: nuovaData ?? foto.dataScatto,
      geotag
    });
    onChiudi();
  };

  return (
    <Modale titolo="Note della foto" onChiudi={() => void salva()}>
      <div className="campo">
        <label>Didascalia (titolo della sezione nel PDF)</label>
        <input value={didascalia} onChange={(e) => setDidascalia(e.target.value)} />
      </div>
      <div className="campo">
        <label>Etichetta della foto (codice delle forme, es. A)</label>
        <input
          value={etichetta}
          maxLength={6}
          placeholder="auto (A, B, C…)"
          onChange={(e) => setEtichetta(e.target.value)}
          style={{ width: 160 }}
        />
        <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 4 }}>
          Due foto con la stessa etichetta condividono la numerazione delle forme.
        </span>
      </div>
      <div className="campo">
        <label>
          Note dato (testo riportato nel PDF e nell'indice)
          {dettaturaDisponibile() && (
            <button
              className={`btn${dettaturaAttiva ? ' attivo' : ''}`}
              style={{ marginLeft: 10, minHeight: 36, padding: '0 12px' }}
              onClick={toggleDettatura}
              type="button"
            >
              <Icona nome="microfono" dimensione={17} />{' '}
              {dettaturaAttiva ? 'In ascolto… (tocca per fermare)' : 'Detta'}
            </button>
          )}
        </label>
        <textarea value={noteDato} onChange={(e) => setNoteDato(e.target.value)} rows={5} />
      </div>
      <div className="campo">
        <label>Data e ora dello scatto</label>
        <input type="datetime-local" value={dataScatto} onChange={(e) => setDataScatto(e.target.value)} />
      </div>
      <div className="campo">
        <label>Geotag (latitudine / longitudine, vuoto = nessuno)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
          <input placeholder="lng" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
        </div>
      </div>
      {(foto.scala || foto.piano) && (
        <div className="campo">
          <label>Calibrazione attiva</label>
          {foto.scala && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ flex: 1 }}>
                Scala: {Math.round(foto.scala.px)} px = {formattaNumero(foto.scala.reale)}{' '}
                {foto.scala.unita}
              </span>
              <button
                className="btn pericolo"
                style={{ minHeight: 40 }}
                onClick={async () => {
                  await aggiornaFoto(foto.id, { scala: null });
                  onRimuoviCalibrazione({ scala: null, piano: foto.piano });
                }}
              >
                Rimuovi
              </button>
            </div>
          )}
          {foto.piano && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>
                Piano: {formattaNumero(foto.piano.larghezzaReale)} ×{' '}
                {formattaNumero(foto.piano.altezzaReale)} {foto.piano.unita}
              </span>
              <button
                className="btn pericolo"
                style={{ minHeight: 40 }}
                onClick={async () => {
                  await aggiornaFoto(foto.id, { piano: null });
                  onRimuoviCalibrazione({ scala: foto.scala, piano: null });
                }}
              >
                Rimuovi
              </button>
            </div>
          )}
        </div>
      )}
      <div className="riga-pulsanti">
        <button className="btn primario" onClick={() => void salva()}>
          Salva
        </button>
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
// Ambiente di modifica DEDICATO al testo / nota con richiamo: foto in
// trasparenza, anteprima del riquadro (ed eventuale freccia), testo su più
// righe, colore, dimensione, freccia opzionale verso un punto della foto.
// ---------------------------------------------------------------------------

function EditorTesto({
  testo,
  immagine,
  onSalva,
  onElimina,
  onChiudi
}: {
  testo: TestoFoto;
  immagine: HTMLImageElement;
  onSalva: (t: TestoFoto) => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const [val, setVal] = useState(testo.testo);
  const [colore, setColore] = useState(testo.stile.colore);
  const [scalaTesto, setScalaTesto] = useState(1);
  const [ancora, setAncora] = useState<Punto | undefined>(testo.ancora);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    // inquadra il riquadro (ed eventuale punto segnalato)
    const punti = ancora ? [testo.posizione, ancora] : [testo.posizione];
    const xs = punti.map((p) => p.x);
    const ys = punti.map((p) => p.y);
    const cx0 = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy0 = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    const s = Math.min(w, h) * 0.55 / (span + testo.stile.dimensioneTesto * 6);
    const toScreen = (p: Punto) => ({ x: w / 2 + (p.x - cx0) * s, y: h / 2 + (p.y - cy0) * s });

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-cx0, -cy0);
    ctx.drawImage(immagine, 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(5,7,10,0.3)';
    ctx.fillRect(0, 0, w, h);

    const pPos = toScreen(testo.posizione);
    // freccia verso il punto segnalato
    if (ancora) {
      const pAnc = toScreen(ancora);
      ctx.lineCap = 'round';
      for (const [col, lw] of [['rgba(0,0,0,0.6)', 7], [colore, 3]] as Array<[string, number]>) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(pPos.x, pPos.y);
        ctx.lineTo(pAnc.x, pAnc.y);
        ctx.stroke();
      }
      const ang = Math.atan2(pAnc.y - pPos.y, pAnc.x - pPos.x);
      const len = 14;
      ctx.beginPath();
      ctx.moveTo(pAnc.x, pAnc.y);
      ctx.lineTo(pAnc.x - len * Math.cos(ang - 0.4), pAnc.y - len * Math.sin(ang - 0.4));
      ctx.lineTo(pAnc.x - len * Math.cos(ang + 0.4), pAnc.y - len * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = colore;
      ctx.fill();
    }

    // riquadro di testo (balloon) centrato su posizione
    const righe = (val || ' ').split('\n');
    const dim = Math.round(Math.min(w, h) * 0.06);
    ctx.font = `bold ${dim}px system-ui, sans-serif`;
    const larg = Math.max(...righe.map((r) => ctx.measureText(r).width));
    const altRiga = dim * 1.3;
    const padX = dim * 0.5;
    const padY = dim * 0.4;
    const boxW = larg + padX * 2;
    const boxH = altRiga * righe.length + padY * 2;
    const bx = pPos.x - boxW / 2;
    const by = pPos.y - boxH / 2;
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r);
    ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r);
    ctx.arcTo(bx, by + boxH, bx, by, r);
    ctx.arcTo(bx, by, bx + boxW, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = colore;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colore;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    righe.forEach((rline, i) => {
      ctx.fillText(rline, pPos.x, by + padY + altRiga * (i + 0.5));
    });
    ctx.restore();
  }, [immagine, val, colore, ancora, testo]);

  const salva = () => {
    const stile =
      scalaTesto === 1
        ? { ...testo.stile, colore }
        : {
            ...testo.stile,
            colore,
            dimensioneTesto: Math.min(200, Math.max(8, Math.round(testo.stile.dimensioneTesto * scalaTesto)))
          };
    onSalva({ ...testo, testo: val, ancora, stile });
  };

  return (
    <div className="editor-quota">
      <header className="barra">
        <button className="btn icona" aria-label="Chiudi" onClick={onChiudi}>
          ✕
        </button>
        <h1>{ancora ? 'Modifica nota' : 'Modifica testo'}</h1>
      </header>
      <div ref={contRef} className="eq-anteprima">
        <canvas ref={canvasRef} />
      </div>
      <div className="eq-controlli">
        <div className="campo">
          <label>Testo</label>
          <textarea
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            rows={3}
            placeholder="Scrivi qui…"
          />
        </div>
        <div className="campo">
          <label>Richiamo (freccia verso un punto)</label>
          <span className="segmenti" role="group">
            <button
              className={ancora ? 'attivo' : ''}
              onClick={() =>
                setAncora(
                  ancora ?? {
                    x: testo.posizione.x,
                    y: testo.posizione.y + testo.stile.dimensioneTesto * 4
                  }
                )
              }
            >
              ➤ Con freccia
            </button>
            <button className={ancora ? '' : 'attivo'} onClick={() => setAncora(undefined)}>
              Senza
            </button>
          </span>
          {ancora && (
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 6 }}>
              Trascina la maniglia sulla foto per puntare il richiamo dove serve.
            </span>
          )}
        </div>
        <div className="campo">
          <label>Colore e dimensione</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <BottoneColore colore={colore} onScegli={setColore} />
            <span className="segmenti" role="group" aria-label="Dimensione">
              <button aria-label="Riduci" onClick={() => setScalaTesto((s) => Math.max(0.4, s / 1.25))}>
                A−
              </button>
              <button aria-label="Aumenta" onClick={() => setScalaTesto((s) => Math.min(3, s * 1.25))}>
                A＋
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="eq-azioni">
        <button className="btn pericolo" onClick={onElimina}>
          <Icona nome="cestino" dimensione={18} /> Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          <Icona nome="check" dimensione={18} /> Salva
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambiente di modifica DEDICATO al dettaglio (foto nella foto): l'inserto può
// mostrare l'ingrandimento del ritaglio OPPURE una foto scattata a parte.
// ---------------------------------------------------------------------------

function EditorCallout({
  callout,
  immagine,
  onSalva,
  onElimina,
  onChiudi
}: {
  callout: Callout;
  immagine: HTMLImageElement;
  onSalva: (c: Callout) => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const [etichetta, setEtichetta] = useState(callout.etichetta);
  const [colore, setColore] = useState(callout.stile.colore);
  const [scalaStile, setScalaStile] = useState(1);
  const [fotoDettaglio, setFotoDettaglio] = useState<ArrayBuffer | undefined>(callout.fotoDettaglio);
  const [inserto, setInserto] = useState<Rettangolo>(callout.inserto);
  const [imgDett, setImgDett] = useState<HTMLImageElement | null>(null);
  const [caricando, setCaricando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);

  // carica la foto-dettaglio corrente per l'anteprima
  useEffect(() => {
    let vivo = true;
    if (fotoDettaglio) {
      caricaDettaglio(fotoDettaglio)
        .then((img) => {
          if (vivo) setImgDett(img);
        })
        .catch(() => {
          if (vivo) setImgDett(null);
        });
    } else {
      setImgDett(null);
    }
    return () => {
      vivo = false;
    };
  }, [fotoDettaglio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    // riquadro dell'inserto, con l'aspetto scelto
    const ar = inserto.width / Math.max(1, inserto.height);
    let bw = w * 0.74;
    let bh = bw / ar;
    if (bh > h * 0.66) {
      bh = h * 0.66;
      bw = bh * ar;
    }
    const bx = (w - bw) / 2;
    const by = (h - bh) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bw, bh);
    if (fotoDettaglio && imgDett) {
      ctx.drawImage(imgDett, bx, by, bw, bh);
    } else if (!fotoDettaglio) {
      const s = callout.sorgente;
      ctx.drawImage(immagine, s.x, s.y, s.width, s.height, bx, by, bw, bh);
    } else {
      // foto in caricamento
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.round(bh * 0.3)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷', w / 2, h / 2);
    }
    ctx.restore();

    ctx.strokeStyle = colore;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh);

    // badge etichetta nell'angolo
    if (etichetta) {
      const dim = Math.round(Math.min(w, h) * 0.06);
      ctx.fillStyle = colore;
      ctx.fillRect(bx, by, dim * 1.5, dim * 1.4);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${dim}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(etichetta, bx + dim * 0.75, by + dim * 0.7);
    }
    ctx.restore();
  }, [immagine, imgDett, fotoDettaglio, inserto, colore, etichetta, callout]);

  const scegliFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCaricando(true);
    try {
      const imp = await importaFoto(file, 1280);
      setFotoDettaglio(imp.origine);
      // l'inserto prende l'aspetto della foto, mantenendo la larghezza
      setInserto((ins) => ({
        ...ins,
        height: Math.max(30, Math.round((ins.width * imp.altezzaPx) / imp.larghezzaPx))
      }));
    } catch (err) {
      mostraToast('errore', err instanceof Error ? err.message : 'Foto non importata.');
    } finally {
      setCaricando(false);
    }
  };

  const rimuoviFoto = () => {
    setFotoDettaglio(undefined);
    const s = callout.sorgente;
    setInserto((ins) => ({ ...ins, height: Math.max(30, Math.round((ins.width * s.height) / s.width)) }));
  };

  const zoom = (f: number) =>
    setInserto((ins) => {
      const nw = Math.max(40, ins.width * f);
      const nh = Math.max(30, ins.height * f);
      return { x: ins.x + (ins.width - nw) / 2, y: ins.y + (ins.height - nh) / 2, width: nw, height: nh };
    });

  const salva = () => {
    const stile =
      scalaStile === 1
        ? { ...callout.stile, colore }
        : {
            ...callout.stile,
            colore,
            spessore: Math.min(40, Math.max(1, callout.stile.spessore * scalaStile)),
            dimensioneTesto: Math.min(200, Math.max(8, Math.round(callout.stile.dimensioneTesto * scalaStile)))
          };
    onSalva({ ...callout, etichetta: etichetta || callout.etichetta, fotoDettaglio, inserto, stile });
  };

  return (
    <div className="editor-quota">
      <header className="barra">
        <button className="btn icona" aria-label="Chiudi" onClick={onChiudi}>
          ✕
        </button>
        <h1>Modifica dettaglio</h1>
      </header>
      <div ref={contRef} className="eq-anteprima">
        <canvas ref={canvasRef} />
      </div>
      <div className="eq-controlli">
        <div className="campo">
          <label>Contenuto dell'inserto</label>
          <span className="segmenti" role="group">
            <button className={fotoDettaglio ? '' : 'attivo'} onClick={rimuoviFoto}>
              <Icona nome="dettaglio" dimensione={17} /> Ingrandimento
            </button>
            <button
              className={fotoDettaglio ? 'attivo' : ''}
              onClick={() => fileRef.current?.click()}
            >
              <Icona nome="fotocamera" dimensione={17} /> Foto scattata
            </button>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={scegliFoto}
            style={{ display: 'none' }}
          />
          <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 6 }}>
            {caricando
              ? 'Importazione foto…'
              : fotoDettaglio
                ? 'Mostra la foto scattata. Tocca “Foto scattata” per sostituirla.'
                : 'Mostra la zona segnalata ingrandita. Tocca “Foto scattata” per scattare una foto.'}
          </span>
        </div>
        <div className="campo">
          <label>Etichetta e ingrandimento</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              value={etichetta}
              maxLength={3}
              onChange={(e) => setEtichetta(e.target.value.toUpperCase())}
              placeholder="A"
              style={{ width: 70 }}
            />
            <span className="segmenti" role="group" aria-label="Dimensione inserto">
              <button aria-label="Inserto più piccolo" onClick={() => zoom(1 / 1.2)}>
                −
              </button>
              <button aria-label="Inserto più grande" onClick={() => zoom(1.2)}>
                ＋
              </button>
            </span>
          </div>
        </div>
        <div className="campo">
          <label>Colore e dimensione</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <BottoneColore colore={colore} onScegli={setColore} />
            <span className="segmenti" role="group" aria-label="Dimensione">
              <button aria-label="Riduci" onClick={() => setScalaStile((s) => Math.max(0.4, s / 1.25))}>
                A−
              </button>
              <button aria-label="Aumenta" onClick={() => setScalaStile((s) => Math.min(3, s * 1.25))}>
                A＋
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="eq-azioni">
        <button className="btn pericolo" onClick={onElimina}>
          <Icona nome="cestino" dimensione={18} /> Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          <Icona nome="check" dimensione={18} /> Salva
        </button>
      </div>
    </div>
  );
}
