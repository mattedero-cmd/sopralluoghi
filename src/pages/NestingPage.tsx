import { useEffect, useMemo, useRef, useState } from 'react';
import { naviga } from '../router';
import { Modale, StatoApp } from '../components/comuni';
import { Icona } from '../components/Icona';
import { nuovoId } from '../utils/id';
import {
  calcolaNestingMigliore,
  lunghezzaUsata,
  passoGriglia,
  riepilogaNesting,
  type LastraNesting,
  type PezzoNesting
} from '../geometry/nesting';
import {
  frasiRitagli,
  ritagliUtili,
  segmentaBobina,
  type Ritaglio
} from '../geometry/segmenti';
import { analizzaTestoPezzi, type PezzoTestuale } from '../utils/parserPezzi';
import { formattaData, formattaNumero } from '../utils/format';
import { pianoEtichetta } from '../utils/etichettaNesting';
import { prossimaTinta, tintaBordo, tintaSfondo } from '../utils/tinte';
import {
  cambioVenatura,
  materialeNuovo,
  migraDocumento,
  opzioniRicerca,
  parametriDi,
  pezziDi,
  pezziRichiesti,
  type DocumentoNesting,
  type MaterialeNesting,
  type Venatura
} from '../utils/documentoNesting';
import {
  elencaNesting,
  eliminaNesting,
  leggiNesting,
  salvaNesting,
  salvaPdfNesting
} from '../db/repository';
import type { LavoroNesting } from '../db/types';
import { mostraToast } from '../state/toast';
import { ModaleAnteprimaPdf } from '../components/ModaleAnteprimaPdf';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import type { OpzioniSvgTaglio } from '../utils/esportaTaglio';
import { OPZIONI_PDF_PREDEFINITE, type OpzioniPdfNesting } from '../pdf/opzioni';

/**
 * NESTING — ottimizzazione del taglio.
 *
 * Un lavoro contiene più ESSENZE (legno scuro, bianco, pelle…): ognuna ha il
 * suo supporto, la sua venatura e la sua lista di pezzi, e viene ottimizzata
 * per conto suo con l'algoritmo MaxRects (vedi geometry/nesting.ts).
 *
 * La bobina si impagina come una striscia unica. Spezzarla in blocchi
 * maneggevoli è un'opzione dell'esportazione PDF, non un dato del materiale:
 * dove cadano i tagli lo trova il programma, perché dipende da come sono
 * impaginati i pezzi (vedi geometry/segmenti).
 *
 * Misure in millimetri.
 */

const CHIAVE_BOZZA = 'nesting.v2';
/** salvataggio del formato precedente: si legge, si migra e si dimentica */
const CHIAVE_VECCHIA = 'nesting.v1';

/**
 * Campo numerico che si lascia MODIFICARE davvero.
 *
 * Un campo controllato che rinormalizza a ogni battuta impedisce di cancellare
 * l'ultima cifra: svuotandolo il valore tornerebbe subito al minimo. Qui il
 * testo digitato vive per conto suo, il valore esce solo quando è valido e la
 * normalizzazione avviene all'uscita dal campo.
 */
function CampoNumero({
  valore,
  onCambia,
  min = 0,
  intero,
  etichetta,
  classe
}: {
  valore: number;
  onCambia: (v: number) => void;
  min?: number;
  intero?: boolean;
  etichetta?: string;
  classe?: string;
}) {
  const [testo, setTesto] = useState(() => String(valore));
  const [inModifica, setInModifica] = useState(false);

  // se il valore cambia da fuori (esempio, incolla, svuota) e non si sta
  // scrivendo, il campo si riallinea
  useEffect(() => {
    if (!inModifica) setTesto(String(valore));
  }, [valore, inModifica]);

  return (
    <input
      type="text"
      inputMode={intero ? 'numeric' : 'decimal'}
      aria-label={etichetta}
      className={classe}
      value={testo}
      onFocus={(e) => {
        setInModifica(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const t = e.target.value;
        setTesto(t); // si può svuotare: nessuna correzione mentre si scrive
        const n = parseFloat(t.replace(',', '.'));
        if (Number.isFinite(n) && n >= min) onCambia(intero ? Math.round(n) : n);
      }}
      onBlur={() => {
        setInModifica(false);
        const n = parseFloat(testo.replace(',', '.'));
        const v = Number.isFinite(n) ? Math.max(min, intero ? Math.round(n) : n) : min;
        onCambia(v);
        setTesto(String(v));
      }}
    />
  );
}

/** larghezza in pixel di un elemento, per dimensionare i testi dell'SVG */
function useLarghezza() {
  const ref = useRef<HTMLDivElement>(null);
  const [larghezza, setLarghezza] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLarghezza(el.getBoundingClientRect().width);
    const osservatore = new ResizeObserver((voci) => {
      setLarghezza(voci[0].contentRect.width);
    });
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, []);
  return [ref, larghezza] as const;
}

/** lavoro nuovo e vuoto: un'essenza sola, pronta da riempire */
function documentoVuoto(): DocumentoNesting {
  const m = materialeNuovo('m1', 'Materiale 1');
  return { versione: 2, nome: 'Lavoro senza nome', attivo: m.id, materiali: [m] };
}

function documentoEsempio(): DocumentoNesting {
  const m = materialeNuovo('m1', 'Legno scuro');
  return {
    versione: 2,
    nome: 'Lavoro senza nome',
    attivo: m.id,
    materiali: [
      {
        ...m,
        pezzi: [
          { id: 'e1', nome: 'Ripiano', larghezza: 560, altezza: 300, quantita: 6, ruotabile: true, tinta: prossimaTinta(0) },
          { id: 'e2', nome: 'Anta', larghezza: 597, altezza: 720, quantita: 4, ruotabile: false, tinta: prossimaTinta(1) },
          { id: 'e3', nome: 'Fianco', larghezza: 300, altezza: 800, quantita: 4, ruotabile: true, tinta: prossimaTinta(2) },
          { id: 'e4', nome: 'Fondo', larghezza: 1160, altezza: 560, quantita: 2, ruotabile: true, tinta: prossimaTinta(3) },
          { id: 'e5', nome: 'Cassetto', larghezza: 400, altezza: 140, quantita: 8, ruotabile: true, tinta: prossimaTinta(4) }
        ]
      }
    ]
  };
}

/**
 * Righe della venatura dentro un pezzo. Il "filo" appartiene al MATERIALE:
 * resta parallelo alla lastra e non gira insieme al pezzo — è proprio per
 * questo che si vede a colpo d'occhio se un pezzo è impaginato controvena.
 */
function righeVenatura(
  pc: { x: number; y: number; larghezza: number; altezza: number },
  venatura: Venatura,
  passo: number
): number[][] {
  const righe: number[][] = [];
  if (passo <= 0) return righe;
  if (venatura === 'orizzontale') {
    for (let y = pc.y + passo; y < pc.y + pc.altezza; y += passo) {
      righe.push([pc.x, y, pc.x + pc.larghezza, y]);
    }
  } else if (venatura === 'verticale') {
    for (let x = pc.x + passo; x < pc.x + pc.larghezza; x += passo) {
      righe.push([x, pc.y, x, pc.y + pc.altezza]);
    }
  }
  return righe;
}

interface Bozza {
  documento: DocumentoNesting;
  /** id del lavoro in archivio, se questo documento ne viene */
  idArchivio: string | null;
}

function leggiBozza(): Bozza | null {
  try {
    const grezzo =
      localStorage.getItem(CHIAVE_BOZZA) ?? localStorage.getItem(CHIAVE_VECCHIA);
    if (!grezzo) return null;
    const s = JSON.parse(grezzo) as Record<string, unknown>;
    // formato nuovo: { documento, idArchivio }; formato vecchio: il documento stesso
    const documento = migraDocumento(s.documento ?? s);
    if (!documento) return null;
    return {
      documento,
      idArchivio: typeof s.idArchivio === 'string' ? s.idArchivio : null
    };
  } catch {
    return null;
  }
}

export function NestingPage({
  id,
  nuovoIn,
  dentro
}: {
  id?: string;
  nuovoIn?: string;
  /** cartella da cui si è aperto lo strumento: casa di una bozza mai archiviata */
  dentro?: string;
}) {
  // un lavoro nuovo dentro una cartella parte pulito, non dalla bozza
  const iniziale = useMemo(() => (id || nuovoIn ? null : leggiBozza()), [id, nuovoIn]);
  const [doc, setDoc] = useState<DocumentoNesting>(
    () => iniziale?.documento ?? (nuovoIn ? documentoVuoto() : documentoEsempio())
  );
  const [idArchivio, setIdArchivio] = useState<string | null>(
    id ?? iniziale?.idArchivio ?? null
  );
  /**
   * Cartella dell'archivio in cui vive il lavoro.
   *
   * `undefined` vuol dire «non lo so ancora»: il salvataggio automatico allora
   * NON tocca la cartella del record, che resta dov'è. È la differenza fra
   * «metti questo lavoro nella radice» e «lascialo dov'è»: senza, riprendendo
   * una bozza il piano di taglio uscirebbe dalla cartella del progetto da cui
   * è nato.
   *
   * Una bozza MAI archiviata invece una casa non ce l'ha, e la prende dalla
   * cartella da cui si è aperto lo strumento: chi comincia un piano di taglio
   * stando dentro «Rossi — Cucina» se lo aspetta lì, non nella radice.
   */
  /** progetto in cui è archiviato il lavoro, se ci sta dentro */
  const [progettoId, setProgettoId] = useState<string | null>(null);
  const [cartellaId, setCartellaId] = useState<string | null | undefined>(() => {
    if (nuovoIn) return nuovoIn;
    if (!id && !iniziale?.idArchivio && dentro) return dentro;
    return undefined;
  });
  const [caricamento, setCaricamento] = useState(!!id);
  const [incolla, setIncolla] = useState(false);
  const [apri, setApri] = useState(false);
  const [chiediNome, setChiediNome] = useState(false);
  const [esporta, setEsporta] = useState(false);
  const [pdfInCorso, setPdfInCorso] = useState(false);
  /** PDF appena generato, mostrato in anteprima prima di mandarlo via */
  const [anteprima, setAnteprima] = useState<Blob | null>(null);

  // apertura di un lavoro dell'archivio: il documento arriva dal database
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    leggiNesting(id)
      .then((l) => {
        if (!vivo) return;
        const documento = l && migraDocumento(l.documento);
        if (documento) {
          setDoc({ ...documento, nome: l!.nome });
          setCartellaId(l!.cartellaId ?? null);
          setProgettoId(l!.progettoId ?? null);
        } else {
          mostraToast('errore', 'Il lavoro non è stato trovato in archivio.');
        }
        setCaricamento(false);
      })
      .catch(() => vivo && setCaricamento(false));
    return () => {
      vivo = false;
    };
  }, [id]);

  // BOZZA RIPRESA di un lavoro già in archivio: il documento arriva da lì —
  // può contenere modifiche non ancora scritte — ma la cartella la sa solo il
  // database, e va ritrovata prima che il salvataggio automatico scriva
  useEffect(() => {
    if (id || !idArchivio || cartellaId !== undefined) return;
    let vivo = true;
    void leggiNesting(idArchivio).then((l) => {
      if (!vivo || !l) return;
      setCartellaId(l.cartellaId ?? null);
      setProgettoId(l.progettoId ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [id, idArchivio, cartellaId]);

  // il lavoro resta fra una navigazione e l'altra (e fra le sessioni)
  useEffect(() => {
    if (caricamento) return;
    try {
      localStorage.setItem(CHIAVE_BOZZA, JSON.stringify({ documento: doc, idArchivio }));
      localStorage.removeItem(CHIAVE_VECCHIA);
    } catch {
      // spazio esaurito o modalità privata: si continua senza salvare
    }
  }, [doc, idArchivio, caricamento]);

  const mat = doc.materiali.find((m) => m.id === doc.attivo) ?? doc.materiali[0];

  const aggiornaMat = (modifiche: Partial<MaterialeNesting>) =>
    setDoc((d) => ({
      ...d,
      materiali: d.materiali.map((m) => (m.id === d.attivo ? { ...m, ...modifiche } : m))
    }));

  const aggiungiMateriale = () =>
    setDoc((d) => {
      const nuovo = {
        // il nuovo materiale eredita il supporto di quello corrente: di solito
        // si lavora con la stessa macchina e le stesse abbondanze
        ...materialeNuovo(nuovoId(), `Materiale ${d.materiali.length + 1}`),
        modo: mat.modo,
        lastra: { ...mat.lastra },
        bobina: { ...mat.bobina },
        lama: mat.lama,
        abbondanza: mat.abbondanza,
        margine: mat.margine
      };
      return { ...d, materiali: [...d.materiali, nuovo], attivo: nuovo.id };
    });

  const eliminaMateriale = (id: string) =>
    setDoc((d) => {
      if (d.materiali.length <= 1) return d;
      const materiali = d.materiali.filter((m) => m.id !== id);
      return { ...d, materiali, attivo: materiali[0].id };
    });

  /** gira di 90° una singola copia già impaginata e ricalcola */
  const giraPezzo = (chiave: string, eraRuotato: boolean) =>
    setDoc((d) => ({
      ...d,
      materiali: d.materiali.map((m) => {
        if (m.id !== d.attivo) return m;
        const nuovi = { ...m.orientamenti };
        const richiesto = !eraRuotato;
        // tornare al verso che il calcolo sceglierebbe da solo = togliere il vincolo
        if (nuovi[chiave] === richiesto) delete nuovi[chiave];
        else nuovi[chiave] = richiesto;
        return { ...m, orientamenti: nuovi };
      })
    }));

  /** opzioni di stampa del lavoro: comandano i blocchi a schermo e nel PDF */
  const stampa = doc.stampa ?? OPZIONI_PDF_PREDEFINITE;

  const parametri = useMemo(() => parametriDi(mat), [mat]);
  // senza venatura i pezzi si girano liberamente: è il motore a scegliere il
  // verso, provando più ordini di inserimento e tenendo il migliore
  const pezziCalcolo = useMemo(() => pezziDi(mat), [mat]);
  const esito = useMemo(
    () =>
      // sulla bobina si cercano blocchi maneggevoli, su lastra un avanzo
      // rettangolare: le opzioni stanno in un posto solo, così l'anteprima,
      // il PDF e l'SVG mostrano sempre la stessa disposizione
      calcolaNestingMigliore(parametri, pezziCalcolo, opzioniRicerca(mat)),
    [parametri, pezziCalcolo, mat.modo]
  );
  const riepilogo = useMemo(
    () => riepilogaNesting(parametri, pezziCalcolo, esito),
    [parametri, pezziCalcolo, esito]
  );
  // i versi imposti che contano davvero: quelli su pezzi liberi di girare.
  // Con la venatura comanda la fibra, e un verso scelto prima non vale più.
  const impostiAttivi = useMemo(() => {
    const liberi = new Set(pezziCalcolo.filter((p) => p.ruotabile).map((p) => p.id));
    return Object.keys(mat.orientamenti).filter((c) =>
      liberi.has(c.slice(0, c.lastIndexOf('#')))
    );
  }, [mat.orientamenti, pezziCalcolo]);

  /** consumo del rotolo: quanto materiale serve davvero */
  const consumo = useMemo(() => {
    if (mat.modo !== 'bobina') return null;
    const usatiMm = esito.lastre.reduce((s, l) => s + lunghezzaUsata(l, mat.margine), 0);
    const usatiM = usatiMm / 1000;
    const areaConsumata = mat.bobina.larghezza * usatiMm;
    let areaPezzi = 0;
    for (const l of esito.lastre) {
      for (const pc of l.piazzamenti) areaPezzi += pc.larghezzaFinita * pc.altezzaFinita;
    }
    return {
      usatiM,
      rimanentiM: Math.max(0, mat.bobina.metri - usatiM),
      // resa sul materiale EFFETTIVAMENTE consumato, non sull'intero rotolo
      resa: areaConsumata > 0 ? (areaPezzi / areaConsumata) * 100 : 0,
      segmenti: esito.lastre.length
    };
  }, [mat.modo, mat.margine, mat.bobina.larghezza, mat.bobina.metri, esito]);

  const aggiornaPezzo = (id: string, modifiche: Partial<PezzoNesting>) =>
    aggiornaMat({ pezzi: mat.pezzi.map((p) => (p.id === id ? { ...p, ...modifiche } : p)) });

  const cambiaVenatura = (v: Venatura) => aggiornaMat(cambioVenatura(mat, v));

  const aggiungiPezzo = () =>
    aggiornaMat({
      pezzi: [
        ...mat.pezzi,
        {
          id: nuovoId(),
          nome: `Pezzo ${mat.pezzi.length + 1}`,
          larghezza: 400,
          altezza: 300,
          quantita: 1,
          // con la venatura attiva il verso conta: il pezzo nasce vincolato
          ruotabile: mat.venatura === 'nessuna',
          tinta: prossimaTinta(mat.pezzi.length)
        }
      ]
    });

  /** quante copie di ogni pezzo sono rimaste fuori: si segnala nella sua riga */
  const fuoriPerPezzo = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of esito.scartati) m.set(s.id, (m.get(s.id) ?? 0) + 1);
    return m;
  }, [esito]);

  const scartatiRaggruppati = useMemo(() => {
    const mappa = new Map<string, { nome: string; l: number; a: number; n: number }>();
    for (const s of esito.scartati) {
      const chiave = `${s.nome}|${s.larghezzaFinita}x${s.altezzaFinita}`;
      const v = mappa.get(chiave) ?? {
        nome: s.nome,
        l: s.larghezzaFinita,
        a: s.altezzaFinita,
        n: 0
      };
      v.n++;
      mappa.set(chiave, v);
    }
    return [...mappa.values()];
  }, [esito]);

  const senzaPezzi = riepilogo.pezziRichiesti === 0;

  /* --- archivio ---------------------------------------------------- */

  const salva = async (nome?: string) => {
    const titolo = (nome ?? doc.nome).trim() || 'Lavoro senza nome';
    const id = idArchivio ?? nuovoId();
    const documento = { ...doc, nome: titolo };
    try {
      await salvaNesting(id, titolo, documento, { cartellaId });
      setDoc(documento);
      setIdArchivio(id);
      // il PDF nasce insieme al lavoro: nell'archivio si apre con un tocco
      await rigeneraPdf(id, documento);
      mostraToast('successo', `Lavoro «${titolo}» salvato in archivio.`);
      // da qui in poi l'indirizzo è quello del lavoro in archivio: ricaricando
      // la pagina si riapre lo stesso, non se ne crea un altro
      if (!idArchivio) naviga({ nome: 'nesting', id });
    } catch {
      // il repository ha già mostrato l'errore
    }
  };

  /**
   * Rifà il PDF del lavoro e lo mette accanto al documento.
   *
   * Il PDF segue il progetto: chi lo apre dall'archivio trova sempre il piano
   * di taglio dell'ultima versione, senza doverlo esportare a mano.
   */
  const rigeneraPdf = async (idLavoro: string, documento: DocumentoNesting) => {
    try {
      const { generaPdfNesting } = await import('../pdf/nesting');
      // le stesse opzioni scelte a mano nell'esportazione: il PDF salvato non
      // può essere diverso da quello che si è visto in anteprima
      const blob = await generaPdfNesting(documento, documento.stampa ?? OPZIONI_PDF_PREDEFINITE);
      await salvaPdfNesting(idLavoro, blob, __BUILD__);
    } catch {
      // un PDF non riuscito non deve far perdere il lavoro: resta il
      // precedente, e `pdfIl` più vecchio dirà che va rifatto
    }
  };

  /**
   * SALVATAGGIO AUTOMATICO.
   *
   * Una volta che il lavoro è in archivio non si deve più pensare a salvarlo:
   * ogni modifica viene scritta da sola poco dopo, e il PDF rifatto subito
   * dopo di lei. Le due attese sono diverse perché il documento costa poco e
   * il PDF costa: mentre si digita una misura non ha senso rigenerarlo.
   */
  const primoGiro = useRef(true);
  useEffect(() => {
    if (!idArchivio || caricamento) return;
    // al primo render dopo l'apertura non c'è niente di nuovo da scrivere
    if (primoGiro.current) {
      primoGiro.current = false;
      return;
    }
    const scrittura = setTimeout(() => {
      void salvaNesting(idArchivio, doc.nome.trim() || 'Lavoro senza nome', doc, {
        cartellaId
      });
    }, 700);
    const stampa = setTimeout(() => {
      void rigeneraPdf(idArchivio, doc);
    }, 2500);
    return () => {
      clearTimeout(scrittura);
      clearTimeout(stampa);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, idArchivio, cartellaId, caricamento]);

  const esportaPdf = async (opzioni: OpzioniPdfNesting) => {
    setEsporta(false);
    setPdfInCorso(true);
    // la scelta resta nel lavoro: da qui in poi anche il PDF rifatto da solo
    // userà questa lunghezza massima
    setDoc((d) => ({ ...d, stampa: opzioni }));
    try {
      const { generaPdfNesting } = await import('../pdf/nesting');
      const blob = await generaPdfNesting({ ...doc, stampa: opzioni }, opzioni);
      // prima si guarda, poi semmai si manda: l'anteprima è nell'app
      setAnteprima(blob);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Generazione PDF non riuscita.');
    } finally {
      setPdfInCorso(false);
    }
  };

  /**
   * Esporta i file SVG per la macchina da taglio.
   *
   * Uno solo si manda com'è; più d'uno finiscono in uno zip, perché la
   * condivisione di sistema accetta un file per volta.
   */
  /**
   * SALVA GLI SVG DI TAGLIO IN ARCHIVIO.
   *
   * Gli stessi file dell'esportazione, ma tenuti nella cartella del lavoro:
   * si riaprono nel visore quando servono, senza cercarli fra i download del
   * telefono, e si rimandano da lì a chi deve tagliarli.
   */
  const archiviaSvg = async (opzioni: OpzioniSvgTaglio) => {
    setEsporta(false);
    setPdfInCorso(true);
    try {
      const [{ fileSvgTaglio }, { salvaDisegno }, { misureSvg }] = await Promise.all([
        import('../utils/esportaTaglio'),
        import('../db/repository'),
        import('../utils/svgDisegno')
      ]);
      const file = fileSvgTaglio(doc, opzioni);
      if (file.length === 0) {
        mostraToast('info', 'Non c’è niente da tagliare: aggiungi dei pezzi.');
        return;
      }
      let primo = '';
      for (const f of file) {
        const id = nuovoId();
        if (!primo) primo = id;
        const m = misureSvg(f.contenuto);
        await salvaDisegno(id, f.nome, f.contenuto, {
          // il disegno si archivia dove sta il piano di taglio: se il piano è
          // dentro un sopralluogo, il disegno ci va dentro anche lui
          cartellaId: cartellaId ?? null,
          progettoId,
          larghezzaMm: m.larghezzaMm,
          altezzaMm: m.altezzaMm,
          misureReali: m.reali,
          origine: 'taglio',
          nestingId: idArchivio
        });
      }
      mostraToast(
        'successo',
        file.length === 1
          ? 'Disegno salvato in archivio.'
          : `${file.length} disegni salvati in archivio.`
      );
      naviga({ nome: 'disegno', id: primo });
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Salvataggio non riuscito.');
    } finally {
      setPdfInCorso(false);
    }
  };

  const esportaSvg = async (opzioni: OpzioniSvgTaglio) => {
    setEsporta(false);
    setPdfInCorso(true);
    try {
      const { fileSvgTaglio } = await import('../utils/esportaTaglio');
      const file = fileSvgTaglio(doc, opzioni);
      if (file.length === 0) {
        mostraToast('info', 'Non c’è niente da tagliare: aggiungi dei pezzi.');
        return;
      }
      const nome = doc.nome || 'piano-di-taglio';
      if (file.length === 1) {
        const blob = new Blob([file[0].contenuto], { type: 'image/svg+xml' });
        await condividiOScarica(blob, `${file[0].nome}.svg`, nome);
      } else {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const f of file) zip.file(`${f.nome}.svg`, f.contenuto);
        const blob = await zip.generateAsync({ type: 'blob' });
        await condividiOScarica(blob, nomeFileSicuro(nome, 'zip'), nome);
      }
      mostraToast(
        'successo',
        file.length === 1 ? 'SVG di taglio esportato.' : `${file.length} SVG di taglio esportati.`
      );
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Esportazione SVG non riuscita.');
    } finally {
      setPdfInCorso(false);
    }
  };

  /* --- incolla ------------------------------------------------------ */

  /**
   * Distribuisce i pezzi incollati fra le essenze.
   *
   * Se la lista era divisa per materiale ("Legno scuro", "Bianco"…), ogni
   * gruppo finisce nell'essenza con quel nome: esistente se c'è già,
   * altrimenti creata al volo con lo stesso supporto di quella corrente.
   */
  const compilaDaTesto = (letti: PezzoTestuale[], sostituisci: boolean) => {
    setDoc((d) => {
      let materiali = d.materiali.map((m) => ({ ...m, pezzi: [...m.pezzi] }));
      const svuotati = new Set<string>();
      /** essenze in cui è finito almeno un pezzo di questo incolla */
      const toccati = new Set<string>();
      const conIntestazioni = letti.some((p) => p.materiale);
      let attivo = d.attivo;

      const trova = (nome: string | undefined): MaterialeNesting => {
        if (!nome) {
          return materiali.find((m) => m.id === d.attivo) ?? materiali[0];
        }
        const cercato = nome.trim().toLowerCase();
        const esistente = materiali.find((m) => m.nome.trim().toLowerCase() === cercato);
        if (esistente) return esistente;
        const modello = materiali.find((m) => m.id === d.attivo) ?? materiali[0];
        // un'essenza vuota e mai toccata prende il nome del primo gruppo,
        // invece di restare lì come "Materiale 1" senza pezzi
        if (modello.pezzi.length === 0 && !svuotati.has(modello.id)) {
          modello.nome = nome;
          return modello;
        }
        const nuovo: MaterialeNesting = {
          ...materialeNuovo(nuovoId(), nome),
          modo: modello.modo,
          lastra: { ...modello.lastra },
          bobina: { ...modello.bobina },
          venatura: modello.venatura,
          lama: modello.lama,
          abbondanza: modello.abbondanza,
          margine: modello.margine
        };
        materiali.push(nuovo);
        return nuovo;
      };

      for (const p of letti) {
        const bersaglio = trova(p.materiale);
        if (sostituisci && !svuotati.has(bersaglio.id)) {
          bersaglio.pezzi = [];
          bersaglio.orientamenti = {};
          svuotati.add(bersaglio.id);
        }
        bersaglio.pezzi.push({
          id: nuovoId(),
          nome: p.nome,
          larghezza: p.larghezza,
          altezza: p.altezza,
          quantita: p.quantita,
          // in un'essenza con venatura il pezzo nasce vincolato al suo verso
          ruotabile: p.ruotabile && bersaglio.venatura === 'nessuna',
          tinta: prossimaTinta(bersaglio.pezzi.length)
        });
        toccati.add(bersaglio.id);
      }

      // «sostituisci» su una lista già divisa per essenza rimpiazza l'intero
      // elenco: restano solo le essenze nominate nel testo incollato
      if (sostituisci && conIntestazioni) {
        const rimasti = materiali.filter((m) => toccati.has(m.id));
        if (rimasti.length > 0) materiali = rimasti;
      }

      // se la lista aveva più essenze, ci si posiziona sulla prima toccata
      const primo = letti[0]?.materiale;
      if (primo) {
        const trovato = materiali.find(
          (m) => m.nome.trim().toLowerCase() === primo.trim().toLowerCase()
        );
        if (trovato) attivo = trovato.id;
      }
      // l'essenza attiva potrebbe essere stata rimpiazzata
      if (!materiali.some((m) => m.id === attivo)) attivo = materiali[0].id;

      return { ...d, materiali, attivo };
    });
    setIncolla(false);
  };

  /* --- disegno ------------------------------------------------------ */

  /**
   * I FOGLI MOSTRATI A SCHERMO SONO QUELLI DEL PDF.
   *
   * Sulle lastre è una per foglio. Sulla bobina il rotolo viene spezzato negli
   * stessi segmenti che finiranno sulla carta, con i pezzi già giustificati in
   * fondo: quello che si vede qui è quello che si taglia, senza sorprese
   * all'apertura del PDF.
   */
  const fogli = useMemo(() => {
    if (mat.modo !== 'bobina') {
      return esito.lastre.map((lastra, i) => ({
        lastra,
        titolo: `Lastra ${i + 1}`,
        misure: { ...mat.lastra },
        striscia: ritagliUtili(lastra, mat.lastra.larghezza, mat.lastra.altezza)
      }));
    }
    const rotolo = esito.lastre[0];
    if (!rotolo || rotolo.piazzamenti.length === 0) return [];
    const opzioni = stampa;
    if (!opzioni.segmenta || !(opzioni.massimoSegmento > 0)) {
      const usata = Math.max(1, lunghezzaUsata(rotolo, mat.margine));
      const misure = { larghezza: mat.bobina.larghezza, altezza: usata };
      return [
        {
          lastra: rotolo,
          titolo: 'Bobina',
          misure,
          striscia: ritagliUtili(rotolo, misure.larghezza, misure.altezza)
        }
      ];
    }
    const segmenti = segmentaBobina(
      rotolo,
      opzioni.massimoSegmento,
      mat.margine,
      mat.bobina.larghezza,
      mat.lama
    );
    return segmenti.map((sg, i) => {
      const misure = {
        larghezza: mat.bobina.larghezza,
        altezza: Math.max(1, sg.fine - sg.inizio)
      };
      return {
        lastra: sg.lastra,
        titolo: `Segmento ${i + 1} di ${segmenti.length}`,
        misure,
        striscia: ritagliUtili(sg.lastra, misure.larghezza, misure.altezza)
      };
    });
  }, [esito, mat.modo, mat.lastra, mat.bobina.larghezza, mat.margine, mat.lama, stampa]);

  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() =>
            naviga(
              progettoId
                ? { nome: 'progetto', id: progettoId }
                : { nome: 'archivio', cartellaId: cartellaId ?? null }
            )
          }
        >
          <Icona nome="indietro" />
        </button>
        <h1>Nesting</h1>
        <StatoApp />
        <button
          className="btn icona"
          aria-label="Lavori salvati"
          title="Lavori salvati"
          onClick={() => setApri(true)}
        >
          <Icona nome="archivio" />
        </button>
        <button
          className="btn icona"
          aria-label={idArchivio ? 'Salva ora' : 'Salva il lavoro in archivio'}
          title={idArchivio ? 'Salva ora' : 'Salva il lavoro in archivio'}
          onClick={() => (idArchivio ? void salva() : setChiediNome(true))}
        >
          <Icona nome="check" />
        </button>
        <button
          className="btn icona"
          aria-label="Esporta il PDF del piano di taglio"
          title="Esporta il PDF del piano di taglio"
          disabled={pdfInCorso}
          onClick={() => setEsporta(true)}
        >
          <Icona nome="condividi" />
        </button>
      </header>

      <main className="contenuto nest">
        <label className="campo nest-nome">
          <span>Nome del lavoro</span>
          <input
            type="text"
            value={doc.nome}
            placeholder="Es. Camera Rossi"
            onChange={(e) => setDoc((d) => ({ ...d, nome: e.target.value }))}
          />
          <small>
            {idArchivio
              ? 'In archivio: ogni modifica viene salvata da sola e il PDF del piano di taglio si aggiorna insieme.'
              : 'Bozza. Con ✓ finisce in archivio, con il suo PDF sempre aggiornato.'}
          </small>
        </label>

        {/* --- Essenze --------------------------------------------------- */}
        <h2 className="nest-titolo">Essenze</h2>
        <div className="nest-essenze" role="tablist" aria-label="Materiali del lavoro">
          {doc.materiali.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === mat.id}
              className={m.id === mat.id ? 'attivo' : ''}
              onClick={() => setDoc((d) => ({ ...d, attivo: m.id }))}
            >
              {m.nome || 'senza nome'}
              <small>{pezziRichiesti(m)}</small>
            </button>
          ))}
          <button className="agg" aria-label="Aggiungi un’essenza" onClick={aggiungiMateriale}>
            ＋
          </button>
        </div>
        <div className="nest-riga-essenza">
          <input
            type="text"
            aria-label="Nome dell’essenza"
            value={mat.nome}
            onChange={(e) => aggiornaMat({ nome: e.target.value })}
          />
          <button
            className="btn icona piccolo"
            aria-label={`Elimina l’essenza ${mat.nome}`}
            disabled={doc.materiali.length <= 1}
            onClick={() => eliminaMateriale(mat.id)}
          >
            <Icona nome="cestino" dimensione={16} />
          </button>
        </div>

        {/* --- Supporto ------------------------------------------------- */}
        <h2 className="nest-titolo">Supporto da tagliare</h2>
        <div className="segmenti" role="group" aria-label="Tipo di supporto">
          <button
            className={mat.modo === 'lastre' ? 'attivo' : ''}
            onClick={() => aggiornaMat({ modo: 'lastre' })}
          >
            Lastre
          </button>
          <button
            className={mat.modo === 'bobina' ? 'attivo' : ''}
            onClick={() => aggiornaMat({ modo: 'bobina' })}
          >
            Bobina
          </button>
        </div>
        {mat.modo === 'lastre' ? (
          <div className="nest-campi">
            <label className="campo">
              <span>Larghezza (mm)</span>
              <CampoNumero
                valore={mat.lastra.larghezza}
                min={1}
                onCambia={(v) => aggiornaMat({ lastra: { ...mat.lastra, larghezza: v } })}
              />
            </label>
            <label className="campo">
              <span>Altezza (mm)</span>
              <CampoNumero
                valore={mat.lastra.altezza}
                min={1}
                onCambia={(v) => aggiornaMat({ lastra: { ...mat.lastra, altezza: v } })}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="nest-campi">
              <label className="campo">
                <span>Larghezza bobina (mm)</span>
                <CampoNumero
                  valore={mat.bobina.larghezza}
                  min={1}
                  onCambia={(v) => aggiornaMat({ bobina: { ...mat.bobina, larghezza: v } })}
                />
              </label>
              <label className="campo">
                <span>Metri disponibili</span>
                <CampoNumero
                  valore={mat.bobina.metri}
                  min={0.1}
                  onCambia={(v) => aggiornaMat({ bobina: { ...mat.bobina, metri: v } })}
                />
                <small>Lunghezza totale sul rotolo</small>
              </label>
            </div>
            <p className="nest-sub">
              Il rotolo si impagina come una striscia unica. Dove spezzarlo in blocchi
              maneggevoli lo decide l’esportazione del PDF, seguendo i pezzi impaginati.
            </p>
          </>
        )}

        <div className="nest-venatura">
          <span className="et">Venatura del materiale</span>
          <div className="segmenti" role="group" aria-label="Venatura del materiale">
            <button
              className={mat.venatura === 'nessuna' ? 'attivo' : ''}
              onClick={() => cambiaVenatura('nessuna')}
            >
              Nessuna
            </button>
            <button
              className={mat.venatura === 'orizzontale' ? 'attivo' : ''}
              onClick={() => cambiaVenatura('orizzontale')}
            >
              ↔ Orizzontale
            </button>
            <button
              className={mat.venatura === 'verticale' ? 'attivo' : ''}
              onClick={() => cambiaVenatura('verticale')}
            >
              ↕ Verticale
            </button>
          </div>
          <small>
            {mat.venatura === 'nessuna'
              ? 'Senza venatura il verso non conta: il programma gira i pezzi da solo e sceglie l’impacchettamento più efficiente.'
              : 'Con la venatura i pezzi restano nel verso in cui li hai inseriti. Spunta «Ruota» solo su quelli che possono girare lo stesso; nell’anteprima puoi girarne uno toccandolo.'}
          </small>
        </div>

        {/* --- Abbondanze ----------------------------------------------- */}
        <h2 className="nest-titolo">Abbondanze</h2>
        <div className="nest-campi tre">
          <label className="campo">
            <span>Lama (mm)</span>
            <CampoNumero valore={mat.lama} onCambia={(v) => aggiornaMat({ lama: v })} />
            <small>Taglio consumato tra i pezzi</small>
          </label>
          <label className="campo">
            <span>Abbondanza (mm)</span>
            <CampoNumero
              valore={mat.abbondanza}
              onCambia={(v) => aggiornaMat({ abbondanza: v })}
            />
            <small>Extra sommato alle misure</small>
          </label>
          <label className="campo">
            <span>Margine (mm)</span>
            <CampoNumero valore={mat.margine} onCambia={(v) => aggiornaMat({ margine: v })} />
            <small>{mat.modo === 'bobina' ? 'Dai bordi del rotolo' : 'Su tutti i lati'}</small>
          </label>
        </div>

        {/* --- Rettangoli ----------------------------------------------- */}
        <h2 className="nest-titolo">Rettangoli — {mat.nome || 'essenza senza nome'}</h2>
        {mat.pezzi.length > 0 && (
          <div className="nest-tabella">
            <div className="nest-intestazione">
              <span />
              <span>Nome</span>
              <span className="nest-misure">
                <span className="c">L</span>
                <span className="c">A</span>
                <span className="c">Qtà</span>
                <span className="c">Ruota</span>
              </span>
              <span />
            </div>
            {mat.pezzi.map((p) => {
              const fuori = fuoriPerPezzo.get(p.id) ?? 0;
              const totale = Math.max(0, Math.round(p.quantita) || 0);
              return (
              <div className={fuori > 0 ? 'nest-riga fuori' : 'nest-riga'} key={p.id}>
                <span
                  className="nest-tinta"
                  style={{ background: tintaSfondo(p.tinta), borderColor: tintaBordo(p.tinta) }}
                />
                <input
                  type="text"
                  aria-label="Nome del pezzo"
                  value={p.nome}
                  onChange={(e) => aggiornaPezzo(p.id, { nome: e.target.value })}
                />
                <span className="nest-misure">
                  <CampoNumero
                    etichetta="Larghezza"
                    classe="c"
                    min={1}
                    valore={p.larghezza}
                    onCambia={(v) => aggiornaPezzo(p.id, { larghezza: v })}
                  />
                  <CampoNumero
                    etichetta="Altezza"
                    classe="c"
                    min={1}
                    valore={p.altezza}
                    onCambia={(v) => aggiornaPezzo(p.id, { altezza: v })}
                  />
                  <CampoNumero
                    etichetta="Quantità"
                    classe="c"
                    min={1}
                    intero
                    valore={p.quantita}
                    onCambia={(v) => aggiornaPezzo(p.id, { quantita: v })}
                  />
                  {/* senza venatura la rotazione è sempre libera: la spunta
                      non avrebbe nulla da vincolare */}
                  <span className="nest-ruota">
                    <input
                      type="checkbox"
                      aria-label="Rotazione di 90° consentita"
                      checked={mat.venatura === 'nessuna' ? true : p.ruotabile}
                      disabled={mat.venatura === 'nessuna'}
                      title={
                        mat.venatura === 'nessuna'
                          ? 'Senza venatura i pezzi si girano sempre'
                          : 'Rotazione di 90° consentita'
                      }
                      onChange={(e) => aggiornaPezzo(p.id, { ruotabile: e.target.checked })}
                    />
                  </span>
                </span>
                <button
                  className="btn icona piccolo"
                  aria-label={`Rimuovi ${p.nome}`}
                  onClick={() =>
                    aggiornaMat({ pezzi: mat.pezzi.filter((x) => x.id !== p.id) })
                  }
                >
                  <Icona nome="chiudi" dimensione={16} />
                </button>
                {fuori > 0 && (
                  <span className="nest-fuori">
                    <Icona nome="avviso" dimensione={14} />
                    {fuori === totale
                      ? 'non entra nel supporto'
                      : `${fuori} ${fuori === 1 ? 'copia' : 'copie'} su ${totale} non ${
                          fuori === 1 ? 'entra' : 'entrano'
                        }`}
                  </span>
                )}
              </div>
              );
            })}
          </div>
        )}
        <div className="riga-pulsanti">
          <button className="btn primario" onClick={aggiungiPezzo}>
            ＋ Aggiungi
          </button>
          <button className="btn" onClick={() => setIncolla(true)}>
            <Icona nome="documento" dimensione={18} /> Incolla da testo
          </button>
          {mat.pezzi.length > 0 && (
            <button
              className="btn icona"
              aria-label="Svuota la lista dell’essenza"
              title="Svuota la lista"
              onClick={() => aggiornaMat({ pezzi: [], orientamenti: {} })}
            >
              <Icona nome="cestino" dimensione={18} />
            </button>
          )}
        </div>

        {/* --- Risultato ------------------------------------------------ */}
        {senzaPezzi ? (
          <div className="vuoto">
            <div className="grande">▦</div>
            <p>Aggiungi almeno un rettangolo per calcolare il nesting.</p>
          </div>
        ) : (
          <>
            <div className="nest-statistiche">
              {consumo ? (
                <>
                  <Statistica
                    etichetta="Metri usati"
                    valore={formattaNumero(Math.round(consumo.usatiM * 100) / 100)}
                    unita="m"
                    barra={{
                      valore: mat.bobina.metri > 0 ? (consumo.usatiM / mat.bobina.metri) * 100 : 0,
                      buona: true
                    }}
                  />
                  <Statistica
                    etichetta="Metri rimanenti"
                    valore={formattaNumero(Math.round(consumo.rimanentiM * 100) / 100)}
                    unita="m"
                  />
                  <Statistica
                    etichetta="Resa sul consumato"
                    valore={formattaNumero(Math.round(consumo.resa * 10) / 10)}
                    unita="%"
                    barra={{ valore: consumo.resa, buona: true }}
                  />
                </>
              ) : (
                <>
                  <Statistica etichetta="Lastre usate" valore={String(riepilogo.lastreUsate)} />
                  <Statistica
                    etichetta="Resa"
                    valore={formattaNumero(Math.round(riepilogo.resa * 10) / 10)}
                    unita="%"
                    barra={{ valore: riepilogo.resa, buona: true }}
                  />
                  <Statistica
                    etichetta="Sfrido"
                    valore={formattaNumero(Math.round(riepilogo.sfrido * 10) / 10)}
                    unita="%"
                    barra={{ valore: riepilogo.sfrido, buona: false }}
                  />
                </>
              )}
              <Statistica
                etichetta="Pezzi piazzati"
                valore={
                  esito.scartati.length
                    ? `${riepilogo.pezziPiazzati} / ${riepilogo.pezziRichiesti}`
                    : String(riepilogo.pezziPiazzati)
                }
              />
            </div>

            {impostiAttivi.length > 0 && (
              <div className="riga-pulsanti" style={{ marginBottom: 12 }}>
                <button className="btn" onClick={() => aggiornaMat({ orientamenti: {} })}>
                  ↺ Togli i {impostiAttivi.length} versi imposti a mano
                </button>
              </div>
            )}

            {scartatiRaggruppati.length > 0 && (
              <div className="nest-avviso">
                <strong>
                  {esito.scartati.length}{' '}
                  {esito.scartati.length === 1 ? 'pezzo non entra' : 'pezzi non entrano'}
                </strong>{' '}
                {mat.modo === 'bobina'
                  ? 'nella bobina: o sono più larghi del rotolo, o i metri disponibili non bastano.'
                  : 'nella lastra nemmeno da soli, con abbondanze e margini. Riduci le misure o ingrandisci il supporto.'}
                <ul>
                  {scartatiRaggruppati.map((s, i) => (
                    <li key={i}>
                      {s.n}× {s.nome || 'pezzo'} ({formattaNumero(s.l)}×{formattaNumero(s.a)} mm)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mat.modo === 'bobina' && (
              <div className="nest-blocchi">
                <label className="fisc-check">
                  <input
                    type="checkbox"
                    checked={stampa.segmenta}
                    onChange={(e) =>
                      setDoc((d) => ({
                        ...d,
                        stampa: { ...stampa, segmenta: e.target.checked }
                      }))
                    }
                  />
                  Dividi il rotolo in blocchi
                </label>
                {stampa.segmenta && (
                  <label className="campo">
                    <span>Lunghezza massima (mm)</span>
                    <CampoNumero
                      valore={stampa.massimoSegmento}
                      min={100}
                      onCambia={(v) =>
                        setDoc((d) => ({ ...d, stampa: { ...stampa, massimoSegmento: v } }))
                      }
                    />
                  </label>
                )}
                <small>
                  Dove cadono i tagli lo decide il programma: solo dove non passa nessun pezzo, e
                  senza spezzare le strisce di sfrido. Vale anche per il PDF.
                </small>
              </div>
            )}

            {fogli.map((f, i) => (
              <Lastra
                key={i}
                indice={i}
                lastra={f.lastra}
                misure={f.misure}
                margine={mat.margine}
                titolo={f.titolo}
                striscia={f.striscia}
                // gli stessi pezzi visti dal motore: senza venatura girano
                // tutti, e la legenda deve dire la verità
                pezzi={pezziCalcolo}
                venatura={mat.venatura}
                imposti={mat.orientamenti}
                onGira={giraPezzo}
                legenda={i === 0}
              />
            ))}
          </>
        )}

        <p className="nest-nota">
          Nesting <strong>libero</strong> (MaxRects), calcolato per ogni essenza separatamente:
          si provano tutti gli ordini di inserimento, i versi e i criteri di riempimento, poi si
          gira un pezzo alla volta finché il lavoro si accorcia. Senza venatura i pezzi girano da
          soli; con la venatura restano nel loro verso. La <em>resa</em> è l’area dei pezzi finiti sull’area del materiale usato;
          lo <em>sfrido</em> comprende lama, abbondanze e margini. Il rotolo viene
          impaginato come una striscia unica e poi spezzato in blocchi maneggevoli, tagliando
          solo dove non passa nessun pezzo: quello che vedi qui è quello che trovi nel PDF.
          Misure in millimetri.
        </p>
      </main>

      {incolla && <ModaleIncolla onChiudi={() => setIncolla(false)} onCompila={compilaDaTesto} />}

      {chiediNome && (
        <ModaleNome
          nome={doc.nome}
          onChiudi={() => setChiediNome(false)}
          onConferma={(nome) => {
            setChiediNome(false);
            void salva(nome);
          }}
        />
      )}

      {anteprima && (
        <ModaleAnteprimaPdf
          blob={anteprima}
          titolo={doc.nome || 'Piano di taglio'}
          nomeFile={doc.nome || 'piano-di-taglio'}
          onChiudi={() => setAnteprima(null)}
        />
      )}

      {esporta && (
        <ModaleEsporta
          conBobine={doc.materiali.some((m) => m.modo === 'bobina')}
          iniziali={doc.stampa ?? OPZIONI_PDF_PREDEFINITE}
          onChiudi={() => setEsporta(false)}
          onEsporta={esportaPdf}
          onEsportaSvg={esportaSvg}
          onArchiviaSvg={archiviaSvg}
        />
      )}

      {apri && (
        <ModaleArchivio
          idCorrente={idArchivio}
          onChiudi={() => setApri(false)}
          onApri={(lavoro) => {
            setApri(false);
            naviga({ nome: 'nesting', id: lavoro.id });
          }}
          onNuovo={() => {
            setDoc(documentoVuoto());
            setIdArchivio(null);
            setApri(false);
          }}
          onEsempio={() => {
            setDoc(documentoEsempio());
            setIdArchivio(null);
            setApri(false);
          }}
        />
      )}
    </div>
  );
}

function Statistica({
  etichetta,
  valore,
  unita,
  barra
}: {
  etichetta: string;
  valore: string;
  unita?: string;
  barra?: { valore: number; buona: boolean };
}) {
  return (
    <div className="nest-stat">
      <div className="k">{etichetta}</div>
      <div className="v">
        {valore}
        {unita && <small>{unita}</small>}
      </div>
      {barra && (
        <div className="misuratore">
          <i
            style={{
              width: `${Math.max(0, Math.min(100, barra.valore))}%`,
              background: barra.buona ? 'var(--ok)' : 'var(--pericolo)'
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Disegno in scala di una lastra: SVG con viewBox in millimetri. */
function Lastra({
  indice,
  lastra,
  misure,
  margine,
  titolo,
  striscia,
  pezzi,
  venatura,
  imposti,
  onGira,
  legenda
}: {
  indice: number;
  lastra: LastraNesting;
  misure: { larghezza: number; altezza: number };
  margine: number;
  titolo: string;
  /** il ritaglio buono che avanza, se ce n'è uno */
  /** i pezzi interi che avanzano dal foglio, dal più grande */
  striscia?: Ritaglio[];
  pezzi: PezzoNesting[];
  venatura: Venatura;
  imposti: Record<string, boolean>;
  onGira: (chiave: string, eraRuotato: boolean) => void;
  legenda: boolean;
}) {
  const L = misure.larghezza;
  const A = Math.max(1, misure.altezza);
  const mg = margine;
  const consumata = lunghezzaUsata(lastra, mg);
  const latoMax = Math.max(L, A);
  const areaLastra = L * A;
  const usata = lastra.piazzamenti.reduce(
    (a, pc) => a + pc.larghezzaFinita * pc.altezzaFinita,
    0
  );
  const resa = areaLastra > 0 ? (usata / areaLastra) * 100 : 0;
  const passo = passoGriglia(latoMax / 9);

  // I testi vanno dimensionati in PIXEL DI SCHERMO: l'SVG ha il viewBox in
  // millimetri, quindi una misura espressa in mm su una lastra da 2,5 m
  // diventerebbe illeggibile sul telefono. Si misura la larghezza resa e si
  // converte la dimensione desiderata da px a unità del disegno.
  const [rifSvg, larghezzaResa] = useLarghezza();
  const mmPerPx = larghezzaResa > 0 ? (L + 8) / larghezzaResa : 0;
  const inUnita = (px: number) => px * mmPerPx;

  const linee: number[][] = [];
  for (let x = passo; x < L; x += passo) linee.push([x, 0, x, A]);
  for (let y = passo; y < A; y += passo) linee.push([0, y, L, y]);

  // con la venatura il verso non è una scelta: i pezzi bloccati non si girano
  // né a mano né in automatico, e toccarli non deve promettere il contrario
  const bloccati = new Set(
    venatura === 'nessuna' ? [] : pezzi.filter((p) => !p.ruotabile).map((p) => p.id)
  );
  const siGira = (chiave: string) => !bloccati.has(chiave.slice(0, chiave.lastIndexOf('#')));

  return (
    <section className="nest-lastra">
      <div className="testa">
        <div className="titolo">
          {titolo}
          <span>
            {`${formattaNumero(L)}×${formattaNumero(Math.round(A))} mm · ${formattaNumero(
              Math.round(consumata) / 1000
            )} m occupati`}
          </span>
        </div>
        <div className="misure">
          {lastra.piazzamenti.length} pezzi · resa{' '}
          <strong>{formattaNumero(Math.round(resa * 10) / 10)}%</strong>
          {striscia && striscia.length > 0 && (
            <>
              <br />
              {frasiRitagli(striscia)}
            </>
          )}
        </div>
      </div>
      <div ref={rifSvg}>
        <svg
          className="nest-svg"
          viewBox={`-4 -4 ${L + 8} ${A + 8}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Disposizione: ${titolo}`}
        >
          <rect
            x={0}
            y={0}
            width={L}
            height={A}
            rx={2}
            fill="var(--sfondo-3)"
            stroke="var(--bordo)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <g stroke="var(--bordo)" strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke">
            {linee.map((l, i) => (
              <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />
            ))}
          </g>
          {mg > 0 && L - 2 * mg > 0 && A - 2 * mg > 0 && (
            <rect
              x={mg}
              y={mg}
              width={L - 2 * mg}
              height={A - 2 * mg}
              fill="none"
              stroke="var(--testo-2)"
              strokeWidth={1}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {lastra.piazzamenti.map((pc, i) => {
            const cx = pc.x + pc.larghezza / 2;
            const cy = pc.y + pc.altezza / 2;
            const misura = `${formattaNumero(pc.larghezzaFinita)}×${formattaNumero(pc.altezzaFinita)}`;
            // dimensioni pensate in px di schermo, poi convertite nelle unità
            // del disegno: così restano leggibili a qualsiasi scala
            const dim = inUnita(12);
            const piano =
              mmPerPx > 0
                ? pianoEtichetta(pc.larghezza, pc.altezza, pc.nome || '', misura, {
                    massimo: dim,
                    comodo: inUnita(9),
                    dueRighe: inUnita(8),
                    minimo: inUnita(5)
                  })
                : null;
            const girabile = siGira(pc.chiave);
            return (
              <g
                key={i}
                role={girabile ? 'button' : undefined}
                tabIndex={girabile ? 0 : undefined}
                aria-label={
                  girabile ? `${pc.nome || 'pezzo'} ${misura}: gira di 90°` : undefined
                }
                style={girabile ? { cursor: 'pointer' } : undefined}
                onClick={girabile ? () => onGira(pc.chiave, pc.ruotato) : undefined}
                onKeyDown={
                  girabile
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onGira(pc.chiave, pc.ruotato);
                        }
                      }
                    : undefined
                }
              >
                <title>
                  {girabile
                    ? `${pc.nome || 'Pezzo'} ${misura} — tocca per girare di 90°`
                    : `${pc.nome || 'Pezzo'} ${misura} — bloccato dalla venatura`}
                </title>
                <rect
                  x={pc.x}
                  y={pc.y}
                  width={pc.larghezza}
                  height={pc.altezza}
                  rx={1.5}
                  fill={tintaSfondo(pc.tinta)}
                  stroke={tintaBordo(pc.tinta)}
                  strokeWidth={girabile && imposti[pc.chiave] != null ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {/* venatura: righe parallele nel verso del materiale, ritagliate
                    dentro il pezzo. Sono i "fili" del legno, quindi seguono la
                    lastra e NON girano col pezzo. */}
                {venatura !== 'nessuna' && (
                  <g clipPath={`url(#taglio-${indice}-${i})`} opacity={0.28}>
                    <clipPath id={`taglio-${indice}-${i}`}>
                      <rect x={pc.x} y={pc.y} width={pc.larghezza} height={pc.altezza} rx={1.5} />
                    </clipPath>
                    {righeVenatura(pc, venatura, Math.max(inUnita(7), 12)).map((l, k) => (
                      <line
                        key={k}
                        x1={l[0]}
                        y1={l[1]}
                        x2={l[2]}
                        y2={l[3]}
                        stroke="#3a2a18"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </g>
                )}
                {/* testo scuro fisso: i riempimenti sono pastello chiari in
                    entrambi i temi, quindi non segue le variabili del tema */}
                {piano && (
                  <g transform={piano.ruotata ? `rotate(-90 ${cx} ${cy})` : undefined}>
                    {piano.ampia ? (
                      <>
                        <text
                          x={cx}
                          y={cy - piano.corpoNome * 0.15}
                          textAnchor="middle"
                          fontSize={piano.corpoNome}
                          fontWeight={600}
                          fill="#20252b"
                        >
                          {piano.nome}
                        </text>
                        <text
                          x={cx}
                          y={cy + piano.corpoMisura * 1.05}
                          textAnchor="middle"
                          fontSize={piano.corpoMisura}
                          fill="#3a424c"
                        >
                          {piano.misura}
                        </text>
                      </>
                    ) : (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={piano.nome ? piano.corpoNome : piano.corpoMisura}
                        fontWeight={piano.nome ? 600 : 400}
                        fill={piano.nome ? '#20252b' : '#2a3138'}
                      >
                        {piano.nome || piano.misura}
                      </text>
                    )}
                  </g>
                )}
                {/* il segno «girato» sta nell'angolo, in coordinate lastra:
                    non segue la rotazione del testo */}
                {pc.ruotato && piano?.ampia && (
                  <text
                    x={pc.x + pc.larghezza - dim * 0.3}
                    y={pc.y + dim * 1.1}
                    textAnchor="end"
                    fontSize={dim * 0.9}
                    fill={tintaBordo(pc.tinta)}
                  >
                    ↻
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {legenda && (
        <div className="nest-legenda">
          {pezzi
            .filter((p) => (Math.max(0, Math.round(p.quantita)) || 0) > 0)
            .map((p) => (
              <span className="voce" key={p.id}>
                <span
                  className="nest-tinta"
                  style={{ background: tintaSfondo(p.tinta), borderColor: tintaBordo(p.tinta) }}
                />
                <strong>{p.nome || '—'}</strong>
                <span className="q">
                  {formattaNumero(p.larghezza)}×{formattaNumero(p.altezza)} ·{' '}
                  {Math.max(0, Math.round(p.quantita)) || 0}×{p.ruotabile ? ' ↻' : ''}
                </span>
              </span>
            ))}
        </div>
      )}
    </section>
  );
}

/**
 * Opzioni dell'esportazione PDF.
 *
 * Il taglio in segmenti si decide QUI, al momento di stampare: è una scelta
 * di come portare il lavoro al banco, non una proprietà del materiale. Dove
 * cadano i tagli lo trova il programma, guardando i pezzi impaginati.
 */
function ModaleEsporta({
  conBobine,
  iniziali,
  onChiudi,
  onEsporta,
  onEsportaSvg,
  onArchiviaSvg
}: {
  conBobine: boolean;
  iniziali: OpzioniPdfNesting;
  onChiudi: () => void;
  onEsporta: (opzioni: OpzioniPdfNesting) => void;
  onEsportaSvg: (opzioni: OpzioniSvgTaglio) => void;
  onArchiviaSvg: (opzioni: OpzioniSvgTaglio) => void;
}) {
  const [segmenta, setSegmenta] = useState(iniziali.segmenta);
  const [massimo, setMassimo] = useState(iniziali.massimoSegmento);
  // l'SVG può seguire la stessa divisione del PDF o restare un file unico
  const [svgUnico, setSvgUnico] = useState(false);
  const [svgEtichette, setSvgEtichette] = useState(false);

  return (
    <Modale titolo="Esporta il piano di taglio" onChiudi={onChiudi}>
      <p className="nest-sub">
        Una pagina di riepilogo con la distinta per essenza, poi una pagina A4 per ogni lastra.
      </p>
      {conBobine ? (
        <>
          <label className="fisc-check">
            <input
              type="checkbox"
              checked={segmenta}
              onChange={(e) => setSegmenta(e.target.checked)}
            />
            Dividi le bobine in segmenti
          </label>
          {segmenta && (
            <div className="nest-campi" style={{ marginTop: 10 }}>
              <label className="campo">
                <span>Lunghezza massima (mm)</span>
                <CampoNumero valore={massimo} min={100} onCambia={setMassimo} />
                <small>
                  I tagli cadono solo dove non passa nessun pezzo: il programma sceglie il più
                  lontano possibile entro questa misura. Se i pezzi non lasciano un taglio libero
                  prima, il segmento risulta più lungo e viene segnalato.
                </small>
              </label>
            </div>
          )}
        </>
      ) : (
        <p className="nest-sub">
          Nessuna bobina in questo lavoro: la divisione in segmenti riguarda solo i rotoli.
        </p>
      )}
      <div className="riga-pulsanti" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          style={{ flex: 1 }}
          onClick={() => onEsporta({ segmenta, massimoSegmento: massimo })}
        >
          Esporta PDF
        </button>
      </div>

      <h3 className="nest-titolo" style={{ marginTop: 22 }}>
        SVG per il taglio a macchina
      </h3>
      <p className="nest-sub">
        Un file per foglio, in scala 1:1: il contorno del supporto nel livello{' '}
        <code>sheet</code> in nero, i contorni dei pezzi nel livello{' '}
        <code>CutContour</code> in magenta 100% — i nomi che i software di taglio cercano.
      </p>
      {conBobine && (
        <div className="segmenti" role="group" aria-label="Come dividere i file SVG">
          <button className={svgUnico ? 'attivo' : ''} onClick={() => setSvgUnico(true)}>
            Un file per essenza
          </button>
          <button className={svgUnico ? '' : 'attivo'} onClick={() => setSvgUnico(false)}>
            Come il PDF, sezionato
          </button>
        </div>
      )}
      <label className="fisc-check" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={svgEtichette}
          onChange={(e) => setSvgEtichette(e.target.checked)}
        />
        Scrivi anche i nomi dei pezzi (fuori dal livello di taglio)
      </label>
      <div className="riga-pulsanti" style={{ marginTop: 12 }}>
        <button
          className="btn"
          style={{ flex: 1 }}
          onClick={() =>
            onEsportaSvg({
              perSegmento: conBobine ? !svgUnico : true,
              massimoSegmento: massimo,
              etichette: svgEtichette
            })
          }
        >
          <Icona nome="condividi" dimensione={18} /> Esporta SVG
        </button>
        <button
          className="btn"
          style={{ flex: 1 }}
          onClick={() =>
            onArchiviaSvg({
              perSegmento: conBobine ? !svgUnico : true,
              massimoSegmento: massimo,
              etichette: svgEtichette
            })
          }
        >
          <Icona nome="disegno" dimensione={18} /> Salva in archivio
        </button>
      </div>
    </Modale>
  );
}

/** Chiede il nome con cui archiviare il lavoro. */
function ModaleNome({
  nome,
  onChiudi,
  onConferma
}: {
  nome: string;
  onChiudi: () => void;
  onConferma: (nome: string) => void;
}) {
  const [testo, setTesto] = useState(nome === 'Lavoro senza nome' ? '' : nome);
  return (
    <Modale titolo="Salva il lavoro" onChiudi={onChiudi}>
      <label className="campo">
        <span>Nome</span>
        <input
          type="text"
          autoFocus
          value={testo}
          placeholder="Es. Camera Rossi"
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && testo.trim()) onConferma(testo.trim());
          }}
        />
      </label>
      <div className="riga-pulsanti" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          style={{ flex: 1 }}
          disabled={!testo.trim()}
          onClick={() => onConferma(testo.trim())}
        >
          Salva
        </button>
      </div>
    </Modale>
  );
}

/** Elenco dei lavori archiviati. */
function ModaleArchivio({
  idCorrente,
  onChiudi,
  onApri,
  onNuovo,
  onEsempio
}: {
  idCorrente: string | null;
  onChiudi: () => void;
  onApri: (lavoro: LavoroNesting) => void;
  onNuovo: () => void;
  onEsempio: () => void;
}) {
  const [lavori, setLavori] = useState<LavoroNesting[] | null>(null);

  useEffect(() => {
    let vivo = true;
    elencaNesting()
      .then((l) => vivo && setLavori(l))
      .catch(() => vivo && setLavori([]));
    return () => {
      vivo = false;
    };
  }, []);

  const elimina = async (id: string) => {
    await eliminaNesting(id);
    setLavori((l) => (l ?? []).filter((x) => x.id !== id));
  };

  return (
    <Modale titolo="Lavori di nesting" onChiudi={onChiudi}>
      <div className="riga-pulsanti" style={{ marginBottom: 10 }}>
        <button className="btn primario" style={{ flex: 1 }} onClick={onNuovo}>
          ＋ Nuovo lavoro
        </button>
        <button className="btn" onClick={onEsempio}>
          Esempio
        </button>
      </div>
      {lavori === null ? (
        <p className="nest-sub">Lettura dell’archivio…</p>
      ) : lavori.length === 0 ? (
        <p className="nest-sub">
          Nessun lavoro salvato. Con <strong>Salva</strong> il lavoro corrente finisce qui e resta
          anche nel backup dell’app.
        </p>
      ) : (
        <div className="nest-lavori">
          {lavori.map((l) => {
            const materiali = Array.isArray(
              (l.documento as { materiali?: unknown[] })?.materiali
            )
              ? ((l.documento as { materiali: unknown[] }).materiali as unknown[]).length
              : 1;
            return (
              <div className={`voce${l.id === idCorrente ? ' corrente' : ''}`} key={l.id}>
                <button className="apri" onClick={() => onApri(l)}>
                  <strong>{l.nome}</strong>
                  <small>
                    {formattaData(l.modificatoIl)} · {materiali}{' '}
                    {materiali === 1 ? 'essenza' : 'essenze'}
                  </small>
                </button>
                <button
                  className="btn icona piccolo"
                  aria-label={`Elimina ${l.nome}`}
                  onClick={() => void elimina(l.id)}
                >
                  <Icona nome="cestino" dimensione={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modale>
  );
}

/** Modale "Incolla da testo": anteprima di verifica prima di compilare. */
function ModaleIncolla({
  onChiudi,
  onCompila
}: {
  onChiudi: () => void;
  onCompila: (pezzi: PezzoTestuale[], sostituisci: boolean) => void;
}) {
  const [testo, setTesto] = useState('');
  const [sostituisci, setSostituisci] = useState(false);
  const esito = useMemo(() => analizzaTestoPezzi(testo), [testo]);
  const totale = esito.pezzi.reduce((a, p) => a + p.quantita, 0);

  // i pezzi nell'ordine, ma con l'intestazione di essenza dove cambia
  const gruppi = useMemo(() => {
    const fuori: PezzoTestuale[] = [];
    const perMateriale = new Map<string, PezzoTestuale[]>();
    for (const p of esito.pezzi) {
      if (!p.materiale) fuori.push(p);
      else {
        const l = perMateriale.get(p.materiale) ?? [];
        l.push(p);
        perMateriale.set(p.materiale, l);
      }
    }
    return { fuori, perMateriale: [...perMateriale.entries()] };
  }, [esito]);

  const voce = (p: PezzoTestuale, i: number) => (
    <div className="pv-voce" key={i}>
      <span className="n">{p.nome}</span>
      <span className="d">
        {formattaNumero(p.larghezza)}×{formattaNumero(p.altezza)} mm
      </span>
      <span className="q">×{p.quantita}</span>
      <span className={p.ruotabile ? 'r' : 'r spento'}>{p.ruotabile ? '↻' : '·'}</span>
    </div>
  );

  return (
    <Modale titolo="Incolla da testo" onChiudi={onChiudi}>
      <p className="nest-sub">
        Incolla la lista, anche il riassunto di una discussione. Riconosco misure (
        <code>597x720</code>, <code>560 × 300</code>), quantità (<code>x4</code>,{' '}
        <code>4 pezzi</code>, <code>q.tà 6</code>), la rotazione (<code>ruotabile</code> /{' '}
        <code>verso fisso</code>) e le <strong>intestazioni di essenza</strong> (una riga corta
        senza misure, es. <code>Legno scuro</code>): i pezzi sotto ognuna finiscono nella loro
        essenza. Controlla l’anteprima prima di compilare.
      </p>
      <div className="campo">
        <textarea
          rows={6}
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          aria-label="Testo da interpretare"
          placeholder={
            'Es.\nLegno scuro\n- Ante armadio — 3 pz — 220 × 61 cm\n- Fianchi comodino — 8 pz — 50 × 50 cm\n\nBianco\n- Fianchi porta valigie — 3 pz — 61 × 40 cm'
          }
        />
      </div>

      {testo.trim() !== '' && (
        <div className="nest-anteprima">
          {esito.pezzi.length > 0 ? (
            <>
              <div className="pv-testa">
                {esito.pezzi.length} pezzi riconosciuti · {totale} totali
                {esito.materiali.length > 0 && ` · ${esito.materiali.length} essenze`}
              </div>
              <div className="pv-lista">
                {gruppi.fuori.map(voce)}
                {gruppi.perMateriale.map(([nome, lista]) => (
                  <div key={nome}>
                    <div className="pv-materiale">{nome}</div>
                    {lista.map(voce)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="pv-testa avviso">
              Nessun pezzo riconosciuto — serve una misura tipo 600x400
            </div>
          )}
          {esito.ignorate.length > 0 && (
            <div className="pv-ignorate">
              <strong>Righe ignorate ({esito.ignorate.length}):</strong>{' '}
              {esito.ignorate.join(' · ')}
            </div>
          )}
        </div>
      )}

      <label className="fisc-check" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={sostituisci}
          onChange={(e) => setSostituisci(e.target.checked)}
        />
        Sostituisci le liste esistenti
      </label>

      <div className="riga-pulsanti" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          style={{ flex: 1 }}
          disabled={esito.pezzi.length === 0}
          onClick={() => onCompila(esito.pezzi, sostituisci)}
        >
          Compila lista
        </button>
      </div>
    </Modale>
  );
}
