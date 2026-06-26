import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  Annotazione,
  Callout,
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
  Unita
} from '../db/types';
import {
  COLORE_QUOTA,
  IMPOSTAZIONI_DEFAULT,
  quadrilateroQuotaRett,
  segmentiPoligono,
  segmentoELato
} from '../db/types';
import { aggiornaFoto, eliminaFoto, leggiImpostazioni, salvaAnnotazioniFoto } from '../db/repository';
import { blobOrigine, caricaImmagine, fotoIllegibile, importaFoto } from '../utils/image';
import { caricaDettaglio } from '../utils/immaginiCallout';
import { naviga } from '../router';
import { ConfermaDialog, Modale, StatoApp, type RichiestaConferma } from '../components/comuni';
import { mostraToast } from '../state/toast';
import { StageEditor, type ModalitaVincolo, type Strumento } from './StageEditor';
import { FabbricaAnnotazioni } from './fabbrica';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import {
  applicaValoriAuto,
  areaReale,
  haCalibrazione,
  misuraSegmento,
  misureRettangolo,
  valoreAutomatico
} from '../geometry/calibrazione';
import { nomeFormaPoligono, simboliPoligono, versiSegmento } from '../geometry/primitive';
import { codiceLocaleForma, numeriProgetto, ordinePerNumero } from '../geometry/nomenclatura';
import { omografiaPiano } from '../geometry/omografia';
import { lunghezzaPxQuota } from '../geometry/punti';
import { RicercaBordi } from '../geometry/bordi';
import { rilevaQuad4, type EsitoQuad4 } from '../geometry/quad4';
import { distanza } from '../geometry/punti';
import {
  aInputDataOra,
  analizzaMisura,
  daInputDataOra,
  formattaNumero
} from '../utils/format';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { avviaDettatura, dettaturaDisponibile } from '../utils/dettatura';

const COLORI = [COLORE_QUOTA, '#ff3b30', '#34c759', '#007aff', '#ffffff', '#111111'];

/** Superficie in m² con più decimali per le aree piccole */
function formattaAreaM2(v: number): string {
  const t = v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4);
  return `${t.replace('.', ',')} m²`;
}

/**
 * Strumenti raggruppati: la toolbar mostra pochi pulsanti grandi; toccando
 * un gruppo si apre un pannello temporaneo con le varianti (es. "Forma" →
 * rettangolo / 4 angoli / triangolo / polilinea). Meno pulsanti a schermo,
 * più spazio alla foto.
 */
const GRUPPI_STRUMENTI: Array<{
  id: string;
  icona: string;
  testo: string;
  voci: Array<{ s: Strumento; icona: string; testo: string }>;
}> = [
  {
    id: 'quote',
    icona: '↔',
    testo: 'Quota',
    voci: [
      { s: 'quotaO', icona: '↔', testo: 'Orizzontale' },
      { s: 'quotaV', icona: '↕', testo: 'Verticale' },
      { s: 'quotaA', icona: '⤡', testo: 'Allineata' }
    ]
  },
  {
    id: 'forme',
    icona: '▭',
    testo: 'Forma',
    voci: [
      { s: 'rettangolo', icona: '▭', testo: 'Rettangolo' },
      { s: 'quad', icona: '◇', testo: '4 angoli' },
      { s: 'tri', icona: '△', testo: 'Triangolo' },
      { s: 'polilinea', icona: '⬡', testo: 'Polilinea' }
    ]
  },
  {
    id: 'curve',
    icona: '◔',
    testo: 'Cerchi',
    voci: [
      { s: 'raggio', icona: '◔', testo: 'Raggio' },
      { s: 'cerchio3p', icona: '○', testo: 'Cerchio 3 punti' },
      { s: 'angolo', icona: '∠', testo: 'Angolo' }
    ]
  },
  {
    id: 'note',
    icona: '✎',
    testo: 'Note',
    voci: [
      { s: 'testo', icona: 'T', testo: 'Testo' },
      { s: 'freccia', icona: '➚', testo: 'Freccia' },
      { s: 'disegno', icona: '✏️', testo: 'Disegno' },
      { s: 'callout', icona: '🔍', testo: 'Dettaglio' }
    ]
  },
  {
    id: 'calibra',
    icona: '📐',
    testo: 'Scala',
    voci: [
      { s: 'calibra', icona: '📐', testo: 'Scala (segmento)' },
      { s: 'piano', icona: '▱', testo: 'Piano prospettico' }
    ]
  }
];

type CategoriaLayer = 'quote' | 'note' | 'callout';

function categoriaAnnotazione(a: Annotazione): CategoriaLayer {
  switch (a.tipo) {
    case 'quota':
    case 'quotaAngolo':
    case 'quotaRaggio':
    case 'quotaRett':
    case 'quotaPoligono':
      return 'quote';
    case 'callout':
      return 'callout';
    default:
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
  const [immagine, setImmagine] = useState<HTMLImageElement | null>(null);
  const [impostazioni, setImpostazioni] = useState<Impostazioni>(IMPOSTAZIONI_DEFAULT);
  const [annotazioni, setAnnotazioni] = useState<Annotazione[] | null>(null);
  const [selezioneId, setSelezioneId] = useState<string | null>(null);
  const [strumento, setStrumento] = useState<Strumento>('seleziona');
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
    | null
  >(null);
  const [testoInModifica, setTestoInModifica] = useState<string | null>(null);
  const [schedaScala, setSchedaScala] = useState<{ px: number } | null>(null);
  const [schedaPiano, setSchedaPiano] = useState<{ punti: [Punto, Punto, Punto, Punto] } | null>(null);
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
      commit(foto ? applicaValoriAuto(nuove, foto) : nuove);
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
    const sorgente = { tipo: 'tocco' as const, punto };
    setPropostaSorgente(sorgente);
    setProposta(null);
    proponiFigura(rilevaDaSorgente(sorgente, sensibilita));
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

  const creaDisegno = (punti: number[]) => {
    if (!fabbrica || !annotazioni) return;
    const d = fabbrica.disegno(punti, annotazioni);
    commit([...annotazioni, d]);
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
    unita: Unita
  ) => {
    if (!foto) return;
    const piano = { punti, larghezzaReale, altezzaReale, unita };
    try {
      omografiaPiano(piano); // verifica che i punti non siano degeneri
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Punti del piano non validi.');
      return;
    }
    await aggiornaFoto(foto.id, { piano });
    ricalcolaConCalibrazione({ scala: foto.scala, piano });
    mostraToast(
      'successo',
      'Piano di riferimento attivo: le misure su quel piano vengono calcolate in prospettiva.'
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

  const esporta = async () => {
    if (!foto || !annotazioni) return;
    salvaOra();
    try {
      const blob = await renderFotoAnnotata(foto, annotazioni);
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
    const lista = fotoProgetto && fotoProgetto.length ? fotoProgetto : foto ? [foto] : [];
    return numeriProgetto(lista, (fid) =>
      fid === fotoId ? annotazioni ?? [] : (annotazioniProgetto ?? []).filter((a) => a.fotoId === fid)
    );
  }, [fotoId, annotazioni, annotazioniProgetto, fotoProgetto, foto]);

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

  /** annotazioni che si modificano nell'ambiente dedicato a tutto schermo:
   *  un tocco le apre direttamente, senza pannello in basso */
  const haAmbienteDedicato = (a: Annotazione) =>
    a.tipo === 'quota' ||
    a.tipo === 'quotaRaggio' ||
    a.tipo === 'quotaAngolo' ||
    a.tipo === 'quotaPoligono' ||
    a.tipo === 'testo' ||
    a.tipo === 'callout';

  /** un tocco "secco" sulla quota apre subito l'ambiente di modifica */
  const apriModifica = (id: string) => {
    const a = annotazioni.find((x) => x.id === id);
    if (!a) return;
    if (a.tipo === 'quotaPoligono') setQuotaInModifica({ tipo: 'poligono', id });
    else if (a.tipo === 'callout') setQuotaInModifica({ tipo: 'callout', id });
    else if (a.tipo === 'testo') setTestoInModifica(id);
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
          ←
        </button>
        <h1>{foto.didascalia || 'Foto'}</h1>
        <StatoApp />
        <button className="btn icona" aria-label="Annulla" disabled={passato.current.length === 0} onClick={undo}>
          ↩
        </button>
        <button className="btn icona" aria-label="Ripristina" disabled={futuro.current.length === 0} onClick={redo}>
          ↪
        </button>
        <button className="btn icona" aria-label="Note della foto" onClick={() => setSchedaNote(true)}>
          🗒️
        </button>
        <button
          className={`btn icona${snapAttivo || vincolo !== 'off' || bordiAttivo ? ' attivo' : ''}`}
          aria-label="Opzioni di disegno"
          onClick={() => {
            setSchedaOpzioni(true);
            setMenuAperto(null);
          }}
        >
          ⚙
        </button>
        <button className="btn icona" aria-label="Esporta immagine" onClick={() => void esporta()}>
          ⬆️
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
        onNuovaFreccia={creaFreccia}
        onNuovoDisegno={creaDisegno}
        onNuovoCallout={creaCallout}
        onCalibra={(p1, p2) => setSchedaScala({ px: distanza(p1, p2) })}
        onPiano={(punti) => setSchedaPiano({ punti })}
      />

      {proposta ? (
        <div className="pannello-proprieta" role="group" aria-label="Quota proposta">
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>✨ Elemento rilevato</span>
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
            ✓ Quote
          </button>
          <button className="btn" onClick={accettaCerchio} title="Inscrivi una circonferenza nell'elemento rilevato">
            ◯ Cerchio
          </button>
          <button className="btn pericolo" onClick={chiudiProposta}>
            ✕ Annulla
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
        selezionata &&
        haAmbienteDedicato(selezionata) &&
        quotaInModifica === null &&
        testoInModifica === null && (
          <div className="azioni-flottanti" role="group" aria-label="Azioni elemento">
            <button
              className="azione-flottante modifica"
              aria-label="Modifica"
              title="Modifica"
              onClick={() => apriModifica(selezionata.id)}
            >
              ✎
            </button>
            <button
              className="azione-flottante elimina"
              aria-label="Elimina"
              title="Elimina"
              onClick={eliminaSelezionata}
            >
              🗑
            </button>
          </div>
        )}

      {proposta && propostaSorgente && (
        <div className="sensibilita-flottante" role="group" aria-label="Sensibilità ai bordi">
          <button
            className="passo"
            aria-label="Più sensibile (bordi deboli)"
            onClick={() => aggiornaSensibilita(Math.min(100, sensibilita + 5))}
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
            onChange={(e) => aggiornaSensibilita(Number(e.target.value))}
          />
          <button
            className="passo"
            aria-label="Meno sensibile (solo bordi netti)"
            onClick={() => aggiornaSensibilita(Math.max(0, sensibilita - 5))}
          >
            −
          </button>
          <span className="etichetta">bordi</span>
        </div>
      )}

      <div className="barra-strumenti">
        {menuAperto && (
          <div className="backdrop-strumenti" onClick={() => setMenuAperto(null)} />
        )}
        {menuAperto &&
          (() => {
            const g = GRUPPI_STRUMENTI.find((x) => x.id === menuAperto);
            if (!g) return null;
            return (
              <div className="pannello-strumenti" role="menu" aria-label={g.testo}>
                {g.voci.map((v) => (
                  <button
                    key={v.s}
                    className={`btn-strumento-grande${strumento === v.s ? ' attivo' : ''}`}
                    onClick={() => {
                      setStrumento(v.s);
                      setMenuAperto(null);
                    }}
                  >
                    <span className="ico">{v.icona}</span>
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
            icona="☝️"
            testo="Seleziona"
          />
          <BtnStrumento
            attivo={strumento === 'auto'}
            onClick={() => {
              setStrumento('auto');
              setMenuAperto(null);
            }}
            icona="✨"
            testo="Auto"
          />
          {GRUPPI_STRUMENTI.map((g) => {
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
        </nav>
      </div>

      {schedaOpzioni && (
        <Modale titolo="Opzioni di disegno" onChiudi={() => setSchedaOpzioni(false)}>
          <div className="campo">
            <label>Aggancio (snap)</label>
            <span className="segmenti" role="group">
              <button className={snapAttivo ? 'attivo' : ''} onClick={() => setSnapAttivo(true)}>
                🧲 Punti quota
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
                📏 Quote
              </button>
              <button className={layerVisibili.note ? 'attivo' : ''} onClick={() => toggleLayer('note')}>
                🗒 Note
              </button>
              <button className={layerVisibili.callout ? 'attivo' : ''} onClick={() => toggleLayer('callout')}>
                🔍 Dettagli
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
          onChiudi={() => setSchedaPiano(null)}
          onSalva={(larghezza, altezza, unita) => {
            void salvaPiano(schedaPiano.punti, larghezza, altezza, unita);
            setSchedaPiano(null);
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
          return (
            <EditorQuota
              quota={quotaSeg}
              immagine={immagine}
              nomenclatura={{ simbolo: seg.simbolo ?? '', auto: simboloAuto }}
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
                  simbolo: extra?.simbolo
                };
                const nuoviSegs = segs.map((s, i) => (i === rif.indice ? nuovoSeg : s));
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
  onSalva,
  onElimina,
  onChiudi
}: {
  quota: Quota;
  immagine: HTMLImageElement;
  /** presente solo per i lati di un poligono: permette di correggere a mano
   *  il simbolo (b, h, B, D…). `auto` è il simbolo dedotto, mostrato come
   *  segnaposto; `simbolo` è l'eventuale override già impostato. */
  nomenclatura?: { simbolo: string; auto: string };
  onSalva: (q: Quota, extra?: { simbolo?: string }) => void;
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
      </div>
      <div className="eq-azioni">
        <button className="btn pericolo" onClick={onElimina}>
          🗑 Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          ✓ Salva quota
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
          🗑 Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          ✓ Salva cerchio
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
          🗑 Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          ✓ Salva angolo
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
          🗑 Elimina
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
              🗑 Elimina questa foto
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
  icona: string;
  testo: string;
  /** pulsante-gruppo: mostra la freccetta che indica le opzioni nascoste */
  gruppo?: boolean;
}) {
  return (
    <button className={`btn${attivo ? ' attivo' : ''}`} onClick={onClick}>
      <span className="ico">{icona}</span>
      <span className="testo-strumento">
        {testo}
        {gruppo && <span className="caret">▾</span>}
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
              🎨
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
              ✎ Modifica
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
              ✎ Modifica
            </button>
            <ProprietaAngolo angolo={ann} foto={foto} onModifica={onModifica} />
          </>
        )}
        {ann.tipo === 'quotaRaggio' && (
          <>
            <button className="btn primario" onClick={onModificaQuota}>
              ✎ Modifica
            </button>
            <ProprietaRaggio raggio={ann} foto={foto} inputValore={inputValore} onModifica={onModifica} />
          </>
        )}
        {ann.tipo === 'testo' && (
          <button className="btn" onClick={onModificaTesto}>
            ✏️ Modifica testo
          </button>
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
        🗑
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
          📐 Usa come scala
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

function SchedaPiano({
  unitaDefault,
  onChiudi,
  onSalva
}: {
  unitaDefault: Unita;
  onChiudi: () => void;
  onSalva: (larghezza: number, altezza: number, unita: Unita) => void;
}) {
  const [testoL, setTestoL] = useState('');
  const [testoA, setTestoA] = useState('');
  const [unita, setUnita] = useState<Unita>(unitaDefault);
  const larghezza = analizzaMisura(testoL);
  const altezza = analizzaMisura(testoA);
  const valido = larghezza !== null && larghezza > 0 && altezza !== null && altezza > 0;
  return (
    <Modale titolo="Piano di riferimento (prospettiva)" onChiudi={onChiudi} centro>
      <p style={{ color: 'var(--testo-2)' }}>
        Inserisci le dimensioni reali del rettangolo indicato (es. una porta, una piastrella, un
        infisso). Tutte le misure prese su quel piano verranno calcolate correggendo la
        prospettiva.
      </p>
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
              {dettaturaAttiva ? '🎤 In ascolto… (tocca per fermare)' : '🎤 Detta'}
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
          🗑 Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          ✓ Salva
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
              🔍 Ingrandimento
            </button>
            <button
              className={fotoDettaglio ? 'attivo' : ''}
              onClick={() => fileRef.current?.click()}
            >
              📷 Foto scattata
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
          🗑 Elimina
        </button>
        <button className="btn primario" onClick={salva}>
          ✓ Salva
        </button>
      </div>
    </div>
  );
}
