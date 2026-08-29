import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { DisegnoSvg, Foto, LavoroNesting, Progetto, StatoProgetto } from '../db/types';
import {
  aggiungiFoto,
  aggiornaProgetto,
  aggiornaSezione,
  assegnaFotoSezione,
  creaPianta,
  creaPiantaDaFoto,
  creaSezione,
  eliminaFoto,
  eliminaSezione,
  eliminaDisegno,
  eliminaNesting,
  leggiImpostazioni,
  rinominaDisegno,
  rinominaNesting,
  salvaDisegno,
  salvaNesting
} from '../db/repository';
import { nuovoId } from '../utils/id';
import type { Sezione } from '../db/types';
import type { OpzioniReport } from '../pdf/report';
import { SelettoreCliente } from './ClientiPage';
import { fotoIllegibile, importaFoto } from '../utils/image';
import { chiediFotocamera, Panoramica } from '../components/Panoramica';
import { naviga } from '../router';
import {
  ConfermaDialog,
  ImmagineBlob,
  MenuContesto,
  Modale,
  StatoApp,
  type RichiestaConferma,
  type VoceMenu
} from '../components/comuni';
import { mostraToast } from '../state/toast';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { renderFotoAnnotata } from '../render/renderAnnotata';
import { codiceLocaleForma, numeriProgetto } from '../geometry/nomenclatura';
import { Icona } from '../components/Icona';
import { BarraSelezione } from '../components/comuni';
import { condividiSelezione, type Selezionato } from '../utils/condivisione';
import { formattaData } from '../utils/format';
import { PannelloOpzioniPdf } from '../components/OpzioniPdf';

/**
 * Il segno che l'ambiente della panoramica era aperto quando la pagina è
 * ripartita. Sta in `sessionStorage` e non nel database apposta: vale per
 * questa sessione e basta, e non deve sopravvivere alla chiusura dell'app.
 */
const SEGNO_PANORAMICA = 'panoramica-aperta-su';

export function ProgettoPage({ id }: { id: string }) {
  const progetto = useLiveQuery(() => db.progetti.get(id), [id]);
  const foto = useLiveQuery(
    async () => {
      const lista = await db.foto.where('progettoId').equals(id).toArray();
      return lista.sort((a, b) => a.ordine - b.ordine);
    },
    [id]
  );
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);
  const [menu, setMenu] = useState<{
    pos: { x: number; y: number };
    titolo?: string;
    voci: VoceMenu[];
  } | null>(null);
  const inputSvg = useRef<HTMLInputElement>(null);
  /** selezione multipla dei file del progetto, per mandarli via insieme */
  const [selezione, setSelezione] = useState<Selezionato[] | null>(null);
  const [invioInCorso, setInvioInCorso] = useState<string | null>(null);
  const preso = (tipo: Selezionato['tipo'], idEl: string) =>
    !!selezione?.some((x) => x.tipo === tipo && x.id === idEl);
  const cambia = (tipo: Selezionato['tipo'], idEl: string) =>
    setSelezione((sel) =>
      sel?.some((x) => x.tipo === tipo && x.id === idEl)
        ? sel.filter((x) => !(x.tipo === tipo && x.id === idEl))
        : [...(sel ?? []), { tipo, id: idEl }]
    );
  const condividiScelti = async () => {
    if (!selezione || selezione.length === 0) return;
    setInvioInCorso('Preparazione…');
    try {
      const quanti = await condividiSelezione(
        selezione,
        progetto?.nome ?? 'Sopralluogo',
        __BUILD__,
        setInvioInCorso
      );
      if (quanti === 0) mostraToast('info', 'Non c’è niente da mandare.');
      else setSelezione(null);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Condivisione non riuscita.');
    } finally {
      setInvioInCorso(null);
    }
  };
  const [rinominaAllegato, setRinominaAllegato] = useState<
    { tipo: 'nesting' | 'disegno'; id: string; nome: string } | null
  >(null);

  // quello che è archiviato DENTRO questo progetto: piani di taglio e disegni
  const pianiDiTaglio = useLiveQuery(
    async () =>
      (await db.nesting.toArray())
        .filter((l) => l.progettoId === id)
        .sort((a, b) => b.modificatoIl - a.modificatoIl),
    [id]
  );
  const disegni = useLiveQuery(
    async () =>
      (await db.disegni.toArray())
        .filter((d) => d.progettoId === id)
        .sort((a, b) => b.modificatoIl - a.modificatoIl),
    [id]
  );
  const [modificaDati, setModificaDati] = useState(false);
  const [importInCorso, setImportInCorso] = useState(false);
  const [pdfInCorso, setPdfInCorso] = useState<string | null>(null);
  const [opzioniPdfAperte, setOpzioniPdfAperte] = useState(false);
  /** sezione in creazione/modifica: {} = nuova, una Sezione = modifica */
  const [sezioneInModifica, setSezioneInModifica] = useState<Sezione | 'nuova' | null>(null);
  /** foto da assegnare a una sezione (apre il selettore) */
  const [assegnaFoto, setAssegnaFoto] = useState<Foto | null>(null);
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputGalleria = useRef<HTMLInputElement>(null);
  /** avanzamento del cucito: null = nessuna panoramica in corso */
  /**
   * L'ambiente della panoramica, con la fotocamera GIÀ CHIESTA.
   *
   * La richiesta parte da qui, dentro il tocco sul pulsante: su iPhone il
   * permesso si concede solo finché l'attivazione dell'utente è viva, e
   * chiederlo da un effetto di React — dopo che la schermata è comparsa —
   * lo fa risultare negato senza che nessuno abbia chiesto niente.
   */
  const [panoramicaAperta, setPanoramicaAperta] = useState<{
    richiesta: Promise<MediaStream> | null;
  } | null>(null);
  /** sezione di destinazione delle prossime foto importate (null = nessuna) */
  const sezioneTarget = useRef<string | null>(null);

  /** ripartiti dopo un ricaricamento: si riapre da soli, una volta sola */
  useEffect(() => {
    let segno: string | null = null;
    try {
      segno = sessionStorage.getItem(SEGNO_PANORAMICA);
      // si toglie subito: se anche la riapertura facesse ricaricare, la
      // seconda volta non si riprova e non si entra in un ciclo
      if (segno) sessionStorage.removeItem(SEGNO_PANORAMICA);
    } catch {
      segno = null;
    }
    if (segno === id) {
      const richiesta = chiediFotocamera();
      richiesta.catch(() => {});
      setPanoramicaAperta({ richiesta });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);


  if (progetto === undefined || foto === undefined) {
    return <div className="app" />;
  }
  if (progetto === null || !progetto) {
    return (
      <div className={`app${selezione ? ' con-selezione' : ''}`}>
        <header className="barra">
          <button className="btn icona" onClick={() => naviga({ nome: 'archivio', cartellaId: null })}>
            ←
          </button>
          <h1>Progetto non trovato</h1>
        </header>
      </div>
    );
  }

  /**
   * PANORAMICA: la foto finita arriva dal suo ambiente — fotocamera, scelta
   * degli scatti, cucito, ritaglio — e qui non resta che salvarla. Gli scatti
   * scartati non passano mai da questa pagina: non entrano nell'archivio.
   */
  /**
   * APRE L'AMBIENTE DELLA PANORAMICA, e lascia detto che era aperto.
   *
   * La prima volta che si concede il permesso della fotocamera, iOS può
   * ricaricare la pagina: in un'app aggiunta alla schermata Home sembra che
   * sia andata in crash, e ci si ritrova sull'elenco delle foto. Non si può
   * impedire, ma si può fare in modo che non costi niente: si lascia un
   * segno, e alla ripartenza l'ambiente si riapre da solo. Una volta sola —
   * se si ripartisse in continuazione sarebbe un ciclo, e sarebbe peggio.
   */
  const apriPanoramica = () => {
    try {
      sessionStorage.setItem(SEGNO_PANORAMICA, id);
    } catch {
      // niente sessionStorage (navigazione privata): pazienza, si va avanti
    }
    const richiesta = chiediFotocamera();
    // il rifiuto lo racconta l'ambiente: qui si evita solo che diventi un
    // errore non gestito
    richiesta.catch(() => {});
    setPanoramicaAperta({ richiesta });
  };

  const chiudiPanoramica = () => {
    try {
      sessionStorage.removeItem(SEGNO_PANORAMICA);
    } catch {
      /* vedi sopra */
    }
    setPanoramicaAperta(null);
  };

  const salvaPanoramica = async (blob: Blob, scatti: number) => {
    const { fotoLatoMax, censuraVoltiAuto, censuraVoltiPermanente } = await leggiImpostazioni();
    const dati = await importaFoto(blob, Math.min(6000, fotoLatoMax * 2), {
      censuraVolti: censuraVoltiAuto !== false,
      incorporaCensure: censuraVoltiAuto !== false && censuraVoltiPermanente === true
    });
    await aggiungiFoto(id, {
      ...dati,
      didascalia: `Panoramica di ${scatti} scatti`,
      noteDato: '',
      scala: null,
      sezioneId: sezioneTarget.current ?? undefined
    });
    mostraToast('successo', 'Panoramica salvata nel progetto.');
  };

  const acquisisci = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportInCorso(true);
    let importate = 0;
    // foto entrate SENZA che il rilevamento dei volti sia riuscito: vanno
    // segnalate, altrimenti si crederebbe che siano già a posto
    let senzaRilevamento = 0;
    try {
      const { fotoLatoMax, censuraVoltiAuto, censuraVoltiPermanente } = await leggiImpostazioni();
      for (const file of Array.from(files)) {
        try {
          const dati = await importaFoto(file, fotoLatoMax, {
            censuraVolti: censuraVoltiAuto !== false,
            incorporaCensure: censuraVoltiAuto !== false && censuraVoltiPermanente === true
          });
          await aggiungiFoto(id, {
            ...dati,
            didascalia: '',
            noteDato: '',
            scala: null,
            sezioneId: sezioneTarget.current ?? undefined
          });
          importate++;
          if (censuraVoltiAuto !== false && !dati.voltiCercati) senzaRilevamento++;
        } catch (e) {
          mostraToast(
            'errore',
            e instanceof Error ? e.message : 'Foto non importata: file non leggibile.'
          );
        }
      }
      if (importate > 0) {
        mostraToast('successo', importate === 1 ? 'Foto salvata.' : `${importate} foto salvate.`);
      }
      if (senzaRilevamento > 0) {
        mostraToast(
          'errore',
          senzaRilevamento === 1
            ? 'Attenzione: il rilevamento dei volti non è riuscito su questa foto. Controllala con «Volti» nell’editor.'
            : `Attenzione: il rilevamento dei volti non è riuscito su ${senzaRilevamento} foto. Controllale con «Volti» nell’editor.`
        );
      }
    } finally {
      setImportInCorso(false);
      if (inputCamera.current) inputCamera.current.value = '';
      if (inputGalleria.current) inputGalleria.current.value = '';
    }
  };

  const apriMenuFoto = (f: Foto, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      voci: [
        {
          testo: 'Condividi con le quote',
          icona: 'righello',
          onClick: async () => {
            if (fotoIllegibile(f)) {
              mostraToast(
                'errore',
                'Questa foto è stata danneggiata dal browser in una versione precedente e non è recuperabile.'
              );
              return;
            }
            try {
              const annotazioni = await db.annotazioni.where('fotoId').equals(f.id).toArray();
              // numerazione del progetto, così la foto esportata mostra i codici
              // aggiornati (A1, A1.1…) e non le vecchie etichette numeriche
              const fotoProgetto = await db.foto.where('progettoId').equals(f.progettoId).toArray();
              const annProgetto = await db.annotazioni
                .where('fotoId')
                .anyOf(fotoProgetto.map((x) => x.id))
                .toArray();
              const numeri = numeriProgetto(fotoProgetto, (fid) =>
                annProgetto.filter((a) => a.fotoId === fid)
              );
              const blob = await renderFotoAnnotata(
                f,
                annotazioni,
                'image/jpeg',
                0.92,
                (a) => codiceLocaleForma(a, numeri),
                { legenda: true }
              );
              await condividiOScarica(
                blob,
                nomeFileSicuro(f.didascalia || progetto.nome, 'jpg'),
                f.didascalia || progetto.nome
              );
            } catch (e) {
              mostraToast('errore', e instanceof Error ? e.message : 'Export non riuscito.');
            }
          }
        },
        {
          // la fotografia e basta: per chi del rilievo non sa che farsene.
          // Vale anche su una foto già quotata — le quote restano in archivio
          testo: 'Condividi solo la foto',
          icona: 'immagine',
          onClick: async () => {
            if (fotoIllegibile(f)) {
              mostraToast('errore', 'Questa foto non è leggibile: impossibile condividerla.');
              return;
            }
            try {
              const { renderFotoPulita } = await import('../render/renderAnnotata');
              const blob = await renderFotoPulita(f);
              await condividiOScarica(
                blob,
                nomeFileSicuro(f.didascalia || progetto.nome, 'jpg'),
                f.didascalia || progetto.nome
              );
            } catch (e) {
              mostraToast('errore', e instanceof Error ? e.message : 'Condivisione non riuscita.');
            }
          }
        },
        ...(f.ePianta
          ? []
          : [
              {
                testo: 'Crea pianta da questa foto',
                icona: 'rettangolo' as const,
                onClick: async () => {
                  if (fotoIllegibile(f)) {
                    mostraToast('errore', 'Questa foto non è leggibile: impossibile usarla come base.');
                    return;
                  }
                  try {
                    const p = await creaPiantaDaFoto(f.progettoId, f);
                    naviga({ nome: 'foto', id: p.id });
                  } catch (e) {
                    mostraToast('errore', e instanceof Error ? e.message : 'Pianta non creata.');
                  }
                }
              }
            ]),
        { testo: 'Sposta in sezione…', icona: 'sposta', onClick: () => setAssegnaFoto(f) },
        {
          testo: 'Elimina foto…',
          icona: 'cestino',
          pericolo: true,
          onClick: () =>
            setConferma({
              titolo: 'Eliminare questa foto?',
              messaggio:
                'La foto e tutte le sue annotazioni verranno eliminate definitivamente.\nL’operazione NON è annullabile.',
              onConferma: () => void eliminaFoto(f.id)
            })
        }
      ]
    });
  };

  /**
   * Porta le misure del sopralluogo nel nesting.
   *
   * Le forme quotate sulle foto sono già i pezzi da produrre: diventano
   * rettangoli con la misura DI TAGLIO — reale più le abbondanze inserite —
   * dentro un piano di taglio nuovo, nella stessa cartella del sopralluogo.
   */
  /** importa un disegno SVG e lo archivia DENTRO questo progetto */
  const importaSvg = async (file: File) => {
    try {
      const [testo, { eSvg, misureSvg, nomeDaFile }] = await Promise.all([
        file.text(),
        import('../utils/svgDisegno')
      ]);
      if (!eSvg(testo)) {
        mostraToast('errore', `«${file.name}» non è un disegno SVG.`);
        return;
      }
      const m = misureSvg(testo);
      const id = nuovoId();
      await salvaDisegno(id, nomeDaFile(file.name), testo, {
        cartellaId: progetto.cartellaId,
        progettoId: progetto.id,
        larghezzaMm: m.larghezzaMm,
        altezzaMm: m.altezzaMm,
        misureReali: m.reali,
        origine: 'file'
      });
      naviga({ nome: 'disegno', id });
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Importazione non riuscita.');
    }
  };

  const menuAllegato = (
    tipo: 'nesting' | 'disegno',
    voce: { id: string; nome: string },
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const parola = tipo === 'nesting' ? 'piano di taglio' : 'disegno';
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      titolo: voce.nome,
      voci: [
        {
          testo: 'Rinomina…',
          icona: 'matita',
          onClick: () => setRinominaAllegato({ tipo, id: voce.id, nome: voce.nome })
        },
        {
          testo: 'Togli dal progetto',
          icona: 'sposta',
          onClick: async () => {
            const { spostaNesting, spostaDisegno } = await import('../db/repository');
            const dove = { cartellaId: progetto.cartellaId, progettoId: null };
            if (tipo === 'nesting') await spostaNesting(voce.id, dove);
            else await spostaDisegno(voce.id, dove);
            mostraToast('successo', `Spostato nella cartella del progetto.`);
          }
        },
        {
          testo: 'Elimina…',
          icona: 'cestino',
          pericolo: true,
          onClick: () =>
            setConferma({
              titolo: `Eliminare il ${parola} "${voce.nome}"?`,
              messaggio: 'L’operazione NON è annullabile.',
              onConferma: () =>
                void (tipo === 'nesting' ? eliminaNesting(voce.id) : eliminaDisegno(voce.id))
            })
        }
      ]
    });
  };

  const creaPianoDiTaglio = async () => {
    try {
      const [
        { pezziDaProgetto },
        { raggruppaPezzi, diagnosiPezzi },
        { materialeNuovo },
        { prossimaTinta }
      ] = await Promise.all([
        import('../pdf/report'),
        import('../geometry/pezziDaSopralluogo'),
        import('../utils/documentoNesting'),
        import('../utils/tinte')
      ]);

      // stesso motore della distinta di taglio del PDF: forme riconosciute,
      // codici, famiglie di copie e misure con le abbondanze
      const pezzi = raggruppaPezzi(await pezziDaProgetto(progetto.id));

      const conto = { formeChiuse: 0, senzaMisura: 0, quoteLineari: 0, altre: 0 };
      if (pezzi.length === 0) {
        for (const f of foto) {
          const ann = await db.annotazioni.where('fotoId').equals(f.id).toArray();
          const d = diagnosiPezzi(ann, f);
          conto.formeChiuse += d.formeChiuse;
          conto.senzaMisura += d.senzaMisura;
          conto.quoteLineari += d.quoteLineari;
          conto.altre += d.altre;
        }
      }
      if (pezzi.length === 0) {
        // meglio dire che cosa si è trovato che lasciare un vicolo cieco
        mostraToast(
          'info',
          conto.formeChiuse === 0
            ? conto.quoteLineari > 0
              ? `Ci sono ${conto.quoteLineari} quote lineari ma nessuna forma chiusa: i pezzi nascono da rettangoli, poligoni e cerchi quotati.`
              : 'In questo sopralluogo non ci sono forme quotate: disegna un rettangolo, un poligono o un cerchio e quotalo.'
            : `${conto.formeChiuse} forme trovate, ma senza misure utilizzabili: scrivi le misure sui lati (o calibra la foto).`
        );
        return;
      }

      const materiale = {
        ...materialeNuovo(nuovoId(), 'Materiale 1'),
        pezzi: pezzi.map((p, i) => ({
          id: nuovoId(),
          nome: p.nome,
          // con la sagoma il pezzo porta le SUE misure (base, altezze…);
          // senza, l'ingombro: il nesting incastra le forme vere
          // il quadrilatero storto porta i vertici, non tre misure: per lui
          // larghezza e altezza restano l'ingombro, che serve alla riga
          larghezza: p.sagoma?.vertici ? p.larghezza : (p.sagoma?.d1 ?? p.larghezza),
          altezza: p.sagoma?.vertici ? p.altezza : (p.sagoma?.d2 ?? p.altezza),
          misura3: p.sagoma?.d3,
          vertici: p.sagoma?.vertici,
          forma: p.sagoma?.forma,
          quantita: p.quantita,
          ruotabile: true,
          tinta: prossimaTinta(i)
        }))
      };
      const id = nuovoId();
      const nome = `Taglio — ${progetto.nome}`;
      await salvaNesting(
        id,
        nome,
        {
          versione: 2,
          nome,
          attivo: materiale.id,
          materiali: [materiale]
        },
        { cartellaId: progetto.cartellaId, progettoId: progetto.id }
      );
      const conAbb = pezzi.filter((p) => p.conAbbondanze).length;
      mostraToast(
        'successo',
        `${pezzi.length} pezzi portati nel piano di taglio${
          conAbb > 0 ? `, di cui ${conAbb} con le abbondanze` : ''
        }.`
      );
      naviga({ nome: 'nesting', id });
    } catch (e) {
      mostraToast(
        'errore',
        e instanceof Error ? e.message : 'Non è stato possibile creare il piano di taglio.'
      );
    }
  };

  const generaPdf = async (opzioni: OpzioniReport) => {
    try {
      setPdfInCorso('Preparazione…');
      // import dinamico: il motore PDF (~2 MB) non pesa sull'avvio dell'app
      const { generaReportPdf, documentoTaglioProgetto } = await import('../pdf/report');
      const blob = await generaReportPdf(progetto, (msg) => setPdfInCorso(msg), opzioni);

      // piano di taglio a parte: due PDF dentro un unico zip, perché la
      // condivisione di sistema accetta un file per volta
      if (opzioni.pianoDiTaglio === 'separato') {
        setPdfInCorso('Piano di taglio…');
        const taglio = await documentoTaglioProgetto(progetto);
        if (taglio) {
          const [{ generaPdfNesting }, JSZip] = await Promise.all([
            import('../pdf/nesting'),
            import('jszip').then((m) => m.default)
          ]);
          const pdfTaglio = await generaPdfNesting(taglio);
          const zip = new JSZip();
          zip.file(nomeFileSicuro(`report_${progetto.nome}`, 'pdf'), blob);
          zip.file(nomeFileSicuro(`taglio_${progetto.nome}`, 'pdf'), pdfTaglio);
          const pacchetto = await zip.generateAsync({ type: 'blob' });
          setPdfInCorso(null);
          await condividiOScarica(
            pacchetto,
            nomeFileSicuro(`${progetto.nome}_report_e_taglio`, 'zip'),
            progetto.nome
          );
          return;
        }
        mostraToast('info', 'Nessun pezzo da tagliare: esportato il solo report.');
      }

      setPdfInCorso(null);
      await condividiOScarica(blob, nomeFileSicuro(`report_${progetto.nome}`, 'pdf'), progetto.nome);
    } catch (e) {
      setPdfInCorso(null);
      mostraToast('errore', e instanceof Error ? e.message : 'Generazione PDF non riuscita.');
    }
  };

  const generaZip = async (opzioni: OpzioniReport) => {
    try {
      setPdfInCorso('Preparazione…');
      const { esportaProgettoZip } = await import('../utils/zipExport');
      const blob = await esportaProgettoZip(progetto, (msg) => setPdfInCorso(msg), opzioni);
      setPdfInCorso(null);
      await condividiOScarica(blob, nomeFileSicuro(`pacchetto_${progetto.nome}`, 'zip'), progetto.nome);
    } catch (e) {
      setPdfInCorso(null);
      mostraToast('errore', e instanceof Error ? e.message : 'Esportazione ZIP non riuscita.');
    }
  };

  const sezioni = [...(progetto.sezioni ?? [])].sort((a, b) => a.ordine - b.ordine);
  const idsSezioni = new Set(sezioni.map((s) => s.id));
  // le piante (tele bianche) sono elencate a parte, non tra le foto
  const piante = foto.filter((f) => f.ePianta);
  const fotoReali = foto.filter((f) => !f.ePianta);
  const fotoDi = (sid: string | null) =>
    foto.filter(
      (f) =>
        !f.ePianta &&
        (sid === null ? !f.sezioneId || !idsSezioni.has(f.sezioneId) : f.sezioneId === sid)
    );

  const nuovaPianta = async () => {
    const p = await creaPianta(progetto.id);
    naviga({ nome: 'foto', id: p.id });
  };

  /** importa foto direttamente in una sezione (null = nessuna sezione) */
  const aggiungiA = (sid: string | null, fonte: 'camera' | 'galleria') => {
    sezioneTarget.current = sid;
    (fonte === 'camera' ? inputCamera : inputGalleria).current?.click();
  };

  const apriMenuSezione = (s: Sezione, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      voci: [
        { testo: 'Modifica (nome, etichetta)', icona: 'matita', onClick: () => setSezioneInModifica(s) },
        { testo: 'Scatta foto qui', icona: 'fotocamera', onClick: () => aggiungiA(s.id, 'camera') },
        { testo: 'Galleria / file qui', icona: 'immagine', onClick: () => aggiungiA(s.id, 'galleria') },
        {
          testo: 'Elimina sezione…',
          icona: 'cestino',
          pericolo: true,
          onClick: () =>
            setConferma({
              titolo: `Eliminare la sezione "${s.nome}"?`,
              messaggio: 'Le foto NON vengono eliminate: tornano “senza sezione”.',
              onConferma: () => void eliminaSezione(progetto.id, s.id)
            })
        }
      ]
    });
  };

  const barraAggiungi = (sid: string | null) => (
    <div className="riga-aggiungi-sezione">
      <button className="btn piccolo" disabled={importInCorso} onClick={() => aggiungiA(sid, 'camera')}>
        <Icona nome="fotocamera" dimensione={18} /> Scatta
      </button>
      <button className="btn piccolo" disabled={importInCorso} onClick={() => aggiungiA(sid, 'galleria')}>
        <Icona nome="immagine" dimensione={18} /> Galleria / file
      </button>
    </div>
  );

  const grigliaFoto = (lista: Foto[]) => (
    <div className="griglia-foto">
      {lista.map((f) => (
        <button
          key={f.id}
          className="cella-foto"
          onClick={() => naviga({ nome: 'foto', id: f.id })}
          onContextMenu={(e) => {
            e.preventDefault();
            apriMenuFoto(f, e);
          }}
        >
          <ImmagineBlob dati={f.miniatura} tipo={f.miniaturaTipo} alt={f.didascalia || 'Foto'} />
          <span
            className="btn icona"
            role="button"
            aria-label="Azioni foto"
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)' }}
            onClick={(e) => apriMenuFoto(f, e)}
          >
            ⋮
          </span>
          {f.didascalia && <span className="didascalia">{f.didascalia}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => naviga({ nome: 'archivio', cartellaId: progetto.cartellaId })}
        >
          <Icona nome="indietro" />
        </button>
        <h1>{progetto.nome}</h1>
        <StatoApp />
      </header>
      <main className="contenuto">
        <button className="scheda" onClick={() => setModificaDati(true)}>
          <span className="glifo neutro">
            <Icona nome="matita" dimensione={20} />
          </span>
          <span className="corpo">
            <div className="titolo">
              {progetto.cliente || 'Cliente non indicato'}
              {progetto.etichetta ? <span className="badge-etichetta">{progetto.etichetta}</span> : null}
            </div>
            <div className="sotto">{progetto.luogo || 'Luogo non indicato'}</div>
            <div className="sotto" style={{ color: 'var(--accento-2)' }}>
              Tocca per modificare dati ed etichetta (codice nelle misure)
            </div>
            {progetto.note && <div className="sotto">{progetto.note.slice(0, 120)}</div>}
          </span>
          <SelettoreStato progetto={progetto} />
        </button>

        <div className="riga-pulsanti" style={{ margin: '14px 0' }}>
          <button
            className="btn primario"
            disabled={importInCorso}
            onClick={() => aggiungiA(null, 'camera')}
          >
            <Icona nome="fotocamera" dimensione={20} /> Scatta
          </button>
          <button className="btn" disabled={importInCorso} onClick={() => aggiungiA(null, 'galleria')}>
            <Icona nome="immagine" dimensione={20} /> Galleria
          </button>
          <button
            className="btn"
            disabled={importInCorso}
            onClick={() => {
              sezioneTarget.current = null;
              apriPanoramica();
            }}
          >
            <Icona nome="immagine" dimensione={20} /> Panoramica
          </button>
          <button className="btn" onClick={() => setSezioneInModifica('nuova')}>
            <Icona nome="cartella-piu" dimensione={20} /> Nuova sezione
          </button>
          <button className="btn" onClick={() => void nuovaPianta()}>
            <Icona nome="rettangolo" dimensione={20} /> Nuova pianta
          </button>
          <button
            className="btn"
            disabled={pdfInCorso !== null}
            onClick={() => {
              if (foto.length === 0) {
                mostraToast('info', 'Aggiungi almeno una foto per generare il report.');
                return;
              }
              setOpzioniPdfAperte(true);
            }}
          >
            <Icona nome="condividi" dimensione={20} /> Esporta (PDF / ZIP)
          </button>
          <button className="btn" onClick={() => void creaPianoDiTaglio()}>
            <Icona nome="griglia" dimensione={20} /> Piano di taglio
          </button>
          <button className="btn" onClick={() => inputSvg.current?.click()}>
            <Icona nome="disegno" dimensione={20} /> Apri un SVG
          </button>
          <input
            ref={inputSvg}
            type="file"
            accept=".svg,image/svg+xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importaSvg(f);
            }}
          />
        </div>

        <input
          ref={inputCamera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void acquisisci(e.target.files)}
        />
        <input
          ref={inputGalleria}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void acquisisci(e.target.files)}
        />
        {panoramicaAperta && (
          <Panoramica
            richiesta={panoramicaAperta.richiesta}
            onFatta={async (blob, scatti) => {
              await salvaPanoramica(blob, scatti);
            }}
            onChiudi={chiudiPanoramica}
          />
        )}

        <h2>Foto ({fotoReali.length})</h2>
        {fotoReali.length === 0 && sezioni.length === 0 ? (
          <div className="vuoto">
            <div className="grande">
              <Icona nome="fotocamera" dimensione={46} />
            </div>
            <p>Nessuna foto. Scatta la prima foto del sopralluogo.</p>
            <p style={{ fontSize: 13, color: 'var(--testo-2)' }}>
              Suggerimento: crea delle sezioni (es. Piano 1, Piano 2) per organizzare le foto;
              l’etichetta della sezione (P1, P2) entra nei codici delle misure.
            </p>
          </div>
        ) : (
          <>
            {sezioni.map((s) => (
              <section key={s.id} className="gruppo-sezione">
                <div className="intestazione-sezione">
                  <h3>
                    {s.nome}
                    {s.etichetta ? <span className="badge-etichetta">{s.etichetta}</span> : null}
                    <span className="conta-sezione">{fotoDi(s.id).length}</span>
                  </h3>
                  <button
                    className="btn icona"
                    aria-label={`Azioni sezione ${s.nome}`}
                    onClick={(e) => apriMenuSezione(s, e)}
                  >
                    ⋮
                  </button>
                </div>
                {fotoDi(s.id).length > 0 ? (
                  grigliaFoto(fotoDi(s.id))
                ) : (
                  <p className="sezione-vuota">Sezione vuota: aggiungi le foto qui sotto.</p>
                )}
                {barraAggiungi(s.id)}
              </section>
            ))}
            {(fotoDi(null).length > 0 || sezioni.length > 0) && (
              <section className="gruppo-sezione">
                <div className="intestazione-sezione">
                  <h3>
                    {sezioni.length > 0 ? 'Senza sezione' : 'Tutte le foto'}
                    <span className="conta-sezione">{fotoDi(null).length}</span>
                  </h3>
                </div>
                {fotoDi(null).length > 0 && grigliaFoto(fotoDi(null))}
                {barraAggiungi(null)}
              </section>
            )}
          </>
        )}

        {piante.length > 0 && (
          <section className="gruppo-sezione">
            <div className="intestazione-sezione">
              <h3>
                Piante stanza
                <span className="conta-sezione">{piante.length}</span>
              </h3>
            </div>
            {grigliaFoto(piante)}
          </section>
        )}

        {/* quello che è archiviato dentro il progetto: sta qui, non sciolto
            nella cartella, e si apre con un tocco */}
        {((pianiDiTaglio?.length ?? 0) > 0 || (disegni?.length ?? 0) > 0) && (
          <>
            <div className="sez-testa">
              <h2 className="sez-titolo">Piani di taglio e disegni</h2>
              {!selezione && (
                <button className="btn piccolo" onClick={() => setSelezione([])}>
                  <Icona nome="check" dimensione={17} /> Seleziona
                </button>
              )}
            </div>
            <div className="lista-griglia">
              {(pianiDiTaglio ?? []).map((l: LavoroNesting) => (
                <button
                  key={l.id}
                  className={`scheda${preso('nesting', l.id) ? ' presa' : ''}`}
                  onClick={() =>
                    selezione ? cambia('nesting', l.id) : naviga({ nome: 'nesting', id: l.id })
                  }
                >
                  {selezione ? (
                    <span className={`spunta${preso('nesting', l.id) ? ' presa' : ''}`}>
                      {preso('nesting', l.id) && <Icona nome="check" dimensione={16} />}
                    </span>
                  ) : (
                    <span className="glifo taglio">
                      <Icona nome="griglia" dimensione={22} />
                    </span>
                  )}
                  <span className="corpo">
                    <div className="titolo">
                      <span className="nome">{l.nome}</span>
                      <span className="badge-etichetta">Taglio</span>
                    </div>
                    <div className="sotto">{formattaData(l.modificatoIl)}</div>
                  </span>
                  <span
                    className="btn icona"
                    role="button"
                    aria-label={`Azioni piano di taglio ${l.nome}`}
                    onClick={(e) => menuAllegato('nesting', l, e)}
                  >
                    <Icona nome="altro" />
                  </span>
                </button>
              ))}
              {(disegni ?? []).map((d: DisegnoSvg) => (
                <button
                  key={d.id}
                  className={`scheda${preso('disegno', d.id) ? ' presa' : ''}`}
                  onClick={() =>
                    selezione ? cambia('disegno', d.id) : naviga({ nome: 'disegno', id: d.id })
                  }
                >
                  {selezione ? (
                    <span className={`spunta${preso('disegno', d.id) ? ' presa' : ''}`}>
                      {preso('disegno', d.id) && <Icona nome="check" dimensione={16} />}
                    </span>
                  ) : (
                    <span className="glifo disegno">
                      <Icona nome="disegno" dimensione={22} />
                    </span>
                  )}
                  <span className="corpo">
                    <div className="titolo">
                      <span className="nome">{d.nome}</span>
                      <span className="badge-etichetta">SVG</span>
                    </div>
                    <div className="sotto">
                      {d.larghezzaMm && d.altezzaMm
                        ? `${Math.round(d.larghezzaMm)} × ${Math.round(d.altezzaMm)} mm · `
                        : ''}
                      {formattaData(d.modificatoIl)}
                    </div>
                  </span>
                  <span
                    className="btn icona"
                    role="button"
                    aria-label={`Azioni disegno ${d.nome}`}
                    onClick={(e) => menuAllegato('disegno', d, e)}
                  >
                    <Icona nome="altro" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {importInCorso && <p style={{ color: 'var(--testo-2)' }}>Importazione foto in corso…</p>}
        {pdfInCorso && <p style={{ color: 'var(--testo-2)' }}>{pdfInCorso}</p>}
      </main>

      {opzioniPdfAperte && (
        <PannelloOpzioniPdf
          titolo="Esporta PDF o pacchetto ZIP"
          foto={foto}
          preparaImmagini={async () => (await import('../pdf/report')).preparaImmaginiProgetto(progetto.id)}
          generaAnteprima={async (opz, img) =>
            (await import('../pdf/report')).generaReportPdf(progetto, undefined, opz, img)
          }
          onChiudi={() => setOpzioniPdfAperte(false)}
          onGenera={(opzioni) => {
            setOpzioniPdfAperte(false);
            void generaPdf(opzioni);
          }}
          onGeneraZip={(opzioni) => {
            setOpzioniPdfAperte(false);
            void generaZip(opzioni);
          }}
          conPianoDiTaglio
        />
      )}
      {modificaDati && <FormDatiProgetto progetto={progetto} onChiudi={() => setModificaDati(false)} />}
      {sezioneInModifica && (
        <FormSezione
          sezione={sezioneInModifica === 'nuova' ? null : sezioneInModifica}
          onChiudi={() => setSezioneInModifica(null)}
          onSalva={async (nome, etichetta) => {
            if (sezioneInModifica === 'nuova') await creaSezione(progetto.id, nome, etichetta);
            else await aggiornaSezione(progetto.id, sezioneInModifica.id, { nome, etichetta });
          }}
        />
      )}
      {assegnaFoto && (
        <SelettoreSezione
          sezioni={sezioni}
          attuale={assegnaFoto.sezioneId ?? null}
          onChiudi={() => setAssegnaFoto(null)}
          onScegli={async (sid) => {
            await assegnaFotoSezione(assegnaFoto.id, sid);
            setAssegnaFoto(null);
          }}
        />
      )}
      {rinominaAllegato && (
        <Modale titolo="Rinomina" onChiudi={() => setRinominaAllegato(null)}>
          <div className="campo">
            <label>Nome</label>
            <input
              type="text"
              autoFocus
              defaultValue={rinominaAllegato.nome}
              onChange={(e) =>
                setRinominaAllegato({ ...rinominaAllegato, nome: e.target.value })
              }
            />
          </div>
          <div className="riga-pulsanti">
            <button className="btn" onClick={() => setRinominaAllegato(null)}>
              Annulla
            </button>
            <button
              className="btn primario"
              disabled={!rinominaAllegato.nome.trim()}
              onClick={async () => {
                const { tipo, id: idAll, nome } = rinominaAllegato;
                setRinominaAllegato(null);
                if (tipo === 'nesting') await rinominaNesting(idAll, nome.trim());
                else await rinominaDisegno(idAll, nome.trim());
              }}
            >
              Salva
            </button>
          </div>
        </Modale>
      )}
      <ConfermaDialog richiesta={conferma} onChiudi={() => setConferma(null)} />
      {menu && (
        <MenuContesto
          posizione={menu.pos}
          titolo={menu.titolo}
          voci={menu.voci}
          onChiudi={() => setMenu(null)}
        />
      )}
      {selezione && (
        <BarraSelezione
          quante={selezione.length}
          inCorso={invioInCorso}
          onCondividi={() => void condividiScelti()}
          onAnnulla={() => setSelezione(null)}
        />
      )}
    </div>
  );
}

function SelettoreStato({ progetto }: { progetto: Progetto }) {
  return (
    <select
      aria-label="Stato del progetto"
      value={progetto.stato}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void aggiornaProgetto(progetto.id, { stato: e.target.value as StatoProgetto })}
      style={{
        background: 'var(--sfondo-3)',
        border: '1px solid var(--bordo)',
        borderRadius: 10,
        padding: '10px',
        minHeight: 44
      }}
    >
      <option value="bozza">Bozza</option>
      <option value="in_corso">In corso</option>
      <option value="completato">Completato</option>
    </select>
  );
}

function FormSezione({
  sezione,
  onChiudi,
  onSalva
}: {
  sezione: Sezione | null;
  onChiudi: () => void;
  onSalva: (nome: string, etichetta: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(sezione?.nome ?? '');
  const [etichetta, setEtichetta] = useState(sezione?.etichetta ?? '');
  return (
    <Modale titolo={sezione ? 'Modifica sezione' : 'Nuova sezione'} onChiudi={onChiudi} centro>
      <div className="campo">
        <label>Nome (es. Piano 1)</label>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="campo">
        <label>Etichetta (codice nelle misure, es. P1)</label>
        <input
          value={etichetta}
          maxLength={6}
          placeholder="facoltativa — es. P1"
          onChange={(e) => setEtichetta(e.target.value)}
          style={{ width: 180 }}
        />
        <p className="aiuto" style={{ marginTop: 4 }}>
          Compare davanti ai codici delle misure (es. <strong>P1</strong>.A1.1) e fa ripartire da
          .1 la numerazione dei duplicati di questa sezione.
        </p>
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          disabled={!nome.trim()}
          onClick={async () => {
            await onSalva(nome, etichetta);
            onChiudi();
          }}
        >
          Salva
        </button>
      </div>
    </Modale>
  );
}

function SelettoreSezione({
  sezioni,
  attuale,
  onChiudi,
  onScegli
}: {
  sezioni: Sezione[];
  attuale: string | null;
  onChiudi: () => void;
  onScegli: (sezioneId: string | null) => void | Promise<void>;
}) {
  return (
    <Modale titolo="Sposta in sezione" onChiudi={onChiudi} centro>
      <button className="scheda" onClick={() => void onScegli(null)}>
        <span className="corpo">
          <div className="titolo">Senza sezione</div>
        </span>
        {attuale === null ? <Icona nome="check" className="vai" /> : null}
      </button>
      {sezioni.map((s) => (
        <button key={s.id} className="scheda" onClick={() => void onScegli(s.id)}>
          <span className="glifo neutro">
            <Icona nome="piano" dimensione={20} />
          </span>
          <span className="corpo">
            <div className="titolo">
              {s.nome}
              {s.etichetta ? <span className="badge-etichetta">{s.etichetta}</span> : null}
            </div>
          </span>
          {attuale === s.id ? <Icona nome="check" className="vai" /> : null}
        </button>
      ))}
      {sezioni.length === 0 && (
        <p className="aiuto">Nessuna sezione: creane una con “Nuova sezione”.</p>
      )}
    </Modale>
  );
}

function FormDatiProgetto({ progetto, onChiudi }: { progetto: Progetto; onChiudi: () => void }) {
  const [nome, setNome] = useState(progetto.nome);
  const [cliente, setCliente] = useState(progetto.cliente);
  const [clienteId, setClienteId] = useState<string | null>(progetto.clienteId ?? null);
  const [luogo, setLuogo] = useState(progetto.luogo);
  const [note, setNote] = useState(progetto.note);
  const [etichetta, setEtichetta] = useState(progetto.etichetta ?? '');
  const [scegliCliente, setScegliCliente] = useState(false);

  // Autosave alla chiusura: nessun dato perso anche senza "Salva" esplicito
  const salva = async () => {
    if (!nome.trim()) {
      mostraToast('errore', 'Il nome del progetto non può essere vuoto.');
      return;
    }
    await aggiornaProgetto(progetto.id, {
      nome: nome.trim(),
      cliente,
      clienteId,
      luogo,
      note,
      etichetta: etichetta.trim() || undefined
    });
    onChiudi();
  };

  return (
    <Modale titolo="Dati del progetto" onChiudi={() => void salva()}>
      <div className="campo">
        <label>Nome del progetto *</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="campo">
        <label>Cliente {clienteId ? '(collegato all’anagrafica)' : ''}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} style={{ flex: 1 }} />
          <button className="btn icona" onClick={() => setScegliCliente(true)} type="button" aria-label="Scegli cliente">
            <Icona nome="persone" />
          </button>
        </div>
      </div>
      {scegliCliente && (
        <SelettoreCliente
          onChiudi={() => setScegliCliente(false)}
          onScegli={(c) => {
            setClienteId(c?.id ?? null);
            if (c) setCliente(c.nome);
          }}
        />
      )}
      <div className="campo">
        <label>Luogo / indirizzo</label>
        <input value={luogo} onChange={(e) => setLuogo(e.target.value)} />
      </div>
      <div className="campo">
        <label>Etichetta (codice nelle forme, es. P1)</label>
        <input
          value={etichetta}
          maxLength={6}
          placeholder="facoltativa"
          onChange={(e) => setEtichetta(e.target.value)}
          style={{ width: 140 }}
        />
      </div>
      <div className="campo">
        <label>Note generali (compaiono nel PDF)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="riga-pulsanti">
        <button className="btn primario" onClick={() => void salva()}>
          Salva
        </button>
      </div>
    </Modale>
  );
}

/** Hook usato anche dall'editor: elenco foto del progetto per la navigazione */
export function useFotoProgetto(progettoId: string | undefined) {
  const [lista, setLista] = useState<Foto[]>([]);
  useEffect(() => {
    if (!progettoId) return;
    let attivo = true;
    db.foto
      .where('progettoId')
      .equals(progettoId)
      .toArray()
      .then((f) => {
        if (attivo) setLista(f.sort((a, b) => a.ordine - b.ordine));
      });
    return () => {
      attivo = false;
    };
  }, [progettoId]);
  return lista;
}

