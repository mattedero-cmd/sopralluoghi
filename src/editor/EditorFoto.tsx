import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  Annotazione,
  Foto,
  Impostazioni,
  PosizioneTesto,
  Punto,
  Quota,
  QuotaAngolare,
  QuotaRaggio,
  QuotaRettangolo,
  Rettangolo,
  SottotipoQuota,
  StatoMisura,
  Unita
} from '../db/types';
import { IMPOSTAZIONI_DEFAULT, quadrilateroQuotaRett } from '../db/types';
import { aggiornaFoto, eliminaFoto, leggiImpostazioni, salvaAnnotazioniFoto } from '../db/repository';
import { blobOrigine, caricaImmagine, fotoIllegibile } from '../utils/image';
import { naviga } from '../router';
import { ConfermaDialog, Modale, StatoApp, type RichiestaConferma } from '../components/comuni';
import { mostraToast } from '../state/toast';
import { StageEditor, type ModalitaVincolo, type Strumento } from './StageEditor';
import { FabbricaAnnotazioni } from './fabbrica';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import {
  applicaValoriAuto,
  haCalibrazione,
  misureRettangolo,
  valoreAutomatico
} from '../geometry/calibrazione';
import { omografiaPiano } from '../geometry/omografia';
import { lunghezzaPxQuota } from '../geometry/punti';
import { RicercaBordi, rilevaFigura, rilevaFiguraEvidenziata } from '../geometry/bordi';
import { distanza } from '../geometry/punti';
import { etichettaRettangolo } from '../geometry/primitive';
import {
  aInputDataOra,
  analizzaMisura,
  daInputDataOra,
  formattaNumero
} from '../utils/format';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { avviaDettatura, dettaturaDisponibile } from '../utils/dettatura';

const COLORI = ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#ffffff', '#111111'];

type CategoriaLayer = 'quote' | 'note' | 'callout';

function categoriaAnnotazione(a: Annotazione): CategoriaLayer {
  switch (a.tipo) {
    case 'quota':
    case 'quotaAngolo':
    case 'quotaRaggio':
    case 'quotaRett':
      return 'quote';
    case 'callout':
      return 'callout';
    default:
      return 'note';
  }
}

export function EditorFoto({ fotoId }: { fotoId: string }) {
  const foto = useLiveQuery(() => db.foto.get(fotoId), [fotoId]);
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
  const [testoInModifica, setTestoInModifica] = useState<string | null>(null);
  const [schedaScala, setSchedaScala] = useState<{ px: number } | null>(null);
  const [schedaPiano, setSchedaPiano] = useState<{ punti: [Punto, Punto, Punto, Punto] } | null>(null);
  /** quota rettangolo proposta dall'autoquotatura, in attesa di conferma */
  const [proposta, setProposta] = useState<QuotaRettangolo | null>(null);
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
    if (strumento !== 'auto') setProposta(null);
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
    // focus sul campo misura: l'inserimento del valore è il passo successivo
    if (q.valore === null) setTimeout(() => inputValore.current?.focus(), 60);
  };

  const creaRettangolo = (rect: Rettangolo) => {
    if (!fabbrica || !annotazioni) return;
    // lo strumento manuale parte ortogonale: gli angoli si adattano
    // poi alla prospettiva trascinandoli singolarmente
    const punti: [Punto, Punto, Punto, Punto] = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height }
    ];
    const q = fabbrica.quotaRettangolo(punti, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    if (q.valoreBase === null) setTimeout(() => inputValore.current?.focus(), 60);
  };

  /** elemento da 4 angoli toccati: affidabile per prospettiva qualsiasi */
  const creaQuad = (punti: [Punto, Punto, Punto, Punto]) => {
    if (!fabbrica || !annotazioni) return;
    const q = fabbrica.quotaRettangolo(punti, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    if (q.valoreBase === null) setTimeout(() => inputValore.current?.focus(), 60);
  };

  const creaAngolo = (vertice: Punto, a: Punto, b: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const q = fabbrica.quotaAngolare(vertice, a, b, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
  };

  const creaRaggio = (centro: Punto, bordo: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const q = fabbrica.quotaRaggio(centro, bordo, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    if (q.valore === null) setTimeout(() => inputValore.current?.focus(), 60);
  };

  // ---------------------------------------------------------------------------
  // Autoquotatura: tocca una figura netta → quote proposte da accettare
  // ---------------------------------------------------------------------------

  const proponiFigura = (figura: ReturnType<typeof rilevaFigura>) => {
    if (!fabbrica || !annotazioni) return;
    if (!figura) {
      setProposta(null);
      mostraToast(
        'info',
        'Nessuna figura netta rilevata: tocca al centro di un elemento a contrasto, oppure evidenzialo con un tratto.'
      );
      return;
    }
    // un solo oggetto base × altezza che segue i bordi reali della
    // figura, mostrato in blu finché non accettato
    const q = fabbrica.quotaRettangolo(figura.punti, annotazioni);
    setProposta({ ...q, stile: { ...q.stile, colore: '#2f81f7' } });
  };

  const autoTocco = (punto: Punto) => {
    const analisi = ottieniAnalisi();
    proponiFigura(analisi ? rilevaFigura(analisi, punto) : null);
  };

  /** evidenziatore: i bordi vengono cercati fuori dalla zona tracciata */
  const autoTraccia = (punti: Punto[]) => {
    const analisi = ottieniAnalisi();
    proponiFigura(analisi ? rilevaFiguraEvidenziata(analisi, punti) : null);
  };

  const accettaProposta = () => {
    if (!proposta || !annotazioni) return;
    // si ripristina il colore predefinito: il blu è solo per l'anteprima
    const definitiva = {
      ...proposta,
      stile: { ...proposta.stile, colore: impostazioni.stileDefault.colore }
    };
    commit([...annotazioni, definitiva]);
    setSelezioneId(definitiva.id);
    setProposta(null);
    // senza calibrazione i valori vanno inseriti a mano: focus sul campo
    if (definitiva.valoreBase === null) setTimeout(() => inputValore.current?.focus(), 60);
  };

  const creaTesto = (pos: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const t = fabbrica.testo(pos, annotazioni);
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
        <button className="btn icona" aria-label="Esporta immagine" onClick={() => void esporta()}>
          ⬆️
        </button>
      </header>

      <StageEditor
        foto={foto}
        immagine={immagine}
        annotazioni={annotazioni}
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
        onCommit={commitGeometria}
        onNuovaQuota={creaQuota}
        onNuovoRett={creaRettangolo}
        onNuovoQuad={creaQuad}
        onNuovoAngolo={creaAngolo}
        onNuovoRaggio={creaRaggio}
        onNuovoTesto={creaTesto}
        onNuovaFreccia={creaFreccia}
        onNuovoDisegno={creaDisegno}
        onNuovoCallout={creaCallout}
        onCalibra={(p1, p2) => setSchedaScala({ px: distanza(p1, p2) })}
        onPiano={(punti) => setSchedaPiano({ punti })}
      />

      {proposta ? (
        <div className="pannello-proprieta" role="group" aria-label="Quota proposta">
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            ✨ Figura rilevata: {etichettaRettangolo(proposta)}
          </span>
          <button className="btn primario" onClick={accettaProposta}>
            ✓ Accetta
          </button>
          <button className="btn pericolo" onClick={() => setProposta(null)}>
            ✕ Annulla
          </button>
        </div>
      ) : (
        selezionata && (
          <PannelloProprieta
            ann={selezionata}
            annotazioni={annotazioni}
            foto={foto}
            inputValore={inputValore}
            onModifica={aggiornaSelezionata}
            onElimina={eliminaSelezionata}
            onModificaTesto={() => setTestoInModifica(selezionata.id)}
            onCalibraDaQuota={(q) => void calibraDaQuota(q)}
          />
        )
      )}

      <nav className="editor-toolbar" aria-label="Strumenti">
        <span className="gruppo-strumenti">
          <BtnStrumento attivo={strumento === 'seleziona'} onClick={() => setStrumento('seleziona')} icona="☝️" testo="Seleziona" />
          <BtnStrumento attivo={strumento === 'auto'} onClick={() => setStrumento('auto')} icona="✨" testo="Auto" />
        </span>
        <span className="gruppo-strumenti">
          <BtnStrumento attivo={strumento === 'quotaO'} onClick={() => setStrumento('quotaO')} icona="↔" testo="Quota O" />
          <BtnStrumento attivo={strumento === 'quotaV'} onClick={() => setStrumento('quotaV')} icona="↕" testo="Quota V" />
          <BtnStrumento attivo={strumento === 'quotaA'} onClick={() => setStrumento('quotaA')} icona="⤡" testo="Allineata" />
          <BtnStrumento attivo={strumento === 'rettangolo'} onClick={() => setStrumento('rettangolo')} icona="▭" testo="Rett." />
          <BtnStrumento attivo={strumento === 'quad'} onClick={() => setStrumento('quad')} icona="◇" testo="4 angoli" />
          <BtnStrumento attivo={strumento === 'angolo'} onClick={() => setStrumento('angolo')} icona="∠" testo="Angolo" />
          <BtnStrumento attivo={strumento === 'raggio'} onClick={() => setStrumento('raggio')} icona="◔" testo="Raggio" />
        </span>
        <span className="gruppo-strumenti">
          <BtnStrumento attivo={strumento === 'callout'} onClick={() => setStrumento('callout')} icona="🔍" testo="Dettaglio" />
          <BtnStrumento attivo={strumento === 'testo'} onClick={() => setStrumento('testo')} icona="T" testo="Testo" />
          <BtnStrumento attivo={strumento === 'freccia'} onClick={() => setStrumento('freccia')} icona="➚" testo="Freccia" />
          <BtnStrumento attivo={strumento === 'disegno'} onClick={() => setStrumento('disegno')} icona="✏️" testo="Disegno" />
        </span>
        <span className="gruppo-strumenti">
          <BtnStrumento attivo={strumento === 'calibra'} onClick={() => setStrumento('calibra')} icona="📐" testo="Scala" />
          <BtnStrumento attivo={strumento === 'piano'} onClick={() => setStrumento('piano')} icona="▱" testo="Piano" />
        </span>
        <span className="gruppo-strumenti">
          <BtnStrumento
            attivo={snapAttivo || vincolo !== 'off' || bordiAttivo}
            onClick={() => setSchedaOpzioni(true)}
            icona="⚙"
            testo="Opzioni"
          />
        </span>
      </nav>

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
        <SchedaTesto
          iniziale={testoTarget.testo}
          onChiudi={() => setTestoInModifica(null)}
          onSalva={(testo) => {
            if (testo.trim() === '') {
              commit(annotazioni.filter((a) => a.id !== testoTarget.id));
              setSelezioneId(null);
            } else {
              commit(
                annotazioni.map((a) => (a.id === testoTarget.id ? { ...a, testo } : a))
              );
            }
            setTestoInModifica(null);
          }}
        />
      )}
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
  testo
}: {
  attivo: boolean;
  onClick: () => void;
  icona: string;
  testo: string;
}) {
  return (
    <button className={`btn${attivo ? ' attivo' : ''}`} onClick={onClick}>
      <span className="ico">{icona}</span>
      {testo}
    </button>
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
  onCalibraDaQuota
}: {
  ann: Annotazione;
  annotazioni: Annotazione[];
  foto: Foto;
  inputValore: React.RefObject<HTMLInputElement>;
  onModifica: (m: Partial<Annotazione>) => void;
  onElimina: () => void;
  onModificaTesto: () => void;
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
      {ann.tipo === 'quota' && (
        <ProprietaQuota
          quota={ann}
          annotazioni={annotazioni}
          foto={foto}
          inputValore={inputValore}
          onModifica={onModifica}
          onCalibraDaQuota={onCalibraDaQuota}
        />
      )}
      {ann.tipo === 'quotaRett' && (
        <ProprietaRettangolo rett={ann} foto={foto} inputValore={inputValore} onModifica={onModifica} />
      )}
      {ann.tipo === 'quotaAngolo' && (
        <ProprietaAngolo angolo={ann} foto={foto} onModifica={onModifica} />
      )}
      {ann.tipo === 'quotaRaggio' && (
        <ProprietaRaggio raggio={ann} foto={foto} inputValore={inputValore} onModifica={onModifica} />
      )}
      <span className="segmenti" role="group" aria-label="Dimensione annotazione">
        <button aria-label="Riduci dimensione" onClick={() => scalaStile(1 / 1.25)}>
          A−
        </button>
        <button aria-label="Aumenta dimensione" onClick={() => scalaStile(1.25)}>
          A＋
        </button>
      </span>
      {(ann.tipo === 'quota' ||
        ann.tipo === 'quotaAngolo' ||
        ann.tipo === 'quotaRaggio' ||
        ann.tipo === 'quotaRett') && (
        <PaletteColori
          colore={ann.stile.colore}
          onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })}
        />
      )}
      {ann.tipo === 'testo' && (
        <>
          <button className="btn" onClick={onModificaTesto}>
            ✏️ Modifica testo
          </button>
          <PaletteColori colore={ann.stile.colore} onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })} />
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
          <PaletteColori colore={ann.stile.colore} onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })} />
        </>
      )}
      {(ann.tipo === 'freccia' || ann.tipo === 'disegno') && (
        <PaletteColori colore={ann.stile.colore} onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })} />
      )}
      <button className="btn pericolo" onClick={onElimina}>
        🗑 Elimina
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

function PaletteColori({ colore, onScegli }: { colore: string; onScegli: (c: string) => void }) {
  return (
    <span className="palette" role="group" aria-label="Colore">
      {COLORI.map((c) => (
        <button
          key={c}
          className={colore === c ? 'attivo' : ''}
          style={{ background: c }}
          aria-label={`Colore ${c}`}
          onClick={() => onScegli(c)}
        />
      ))}
    </span>
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

function SchedaTesto({
  iniziale,
  onChiudi,
  onSalva
}: {
  iniziale: string;
  onChiudi: () => void;
  onSalva: (testo: string) => void;
}) {
  const [testo, setTesto] = useState(iniziale);
  return (
    <Modale titolo="Testo sulla foto" onChiudi={onChiudi}>
      <div className="campo">
        <textarea autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} rows={3} />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button className="btn primario" onClick={() => onSalva(testo)}>
          OK
        </button>
      </div>
    </Modale>
  );
}
