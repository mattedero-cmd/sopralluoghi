import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Cartella, DisegnoSvg, LavoroNesting, Progetto } from '../db/types';
import {
  aggiornaCartella,
  contenutoCartella,
  creaCartella,
  creaProgetto,
  duplicaProgetto,
  eliminaCartella,
  eliminaDisegno,
  eliminaNesting,
  eliminaProgetto,
  pdfDaRifare,
  rinominaDisegno,
  rinominaNesting,
  salvaPdfNesting,
  spostaCartella,
  spostaDisegno,
  spostaNesting,
  type Destinazione,
  salvaDisegno,
  spostaProgetto
} from '../db/repository';
import { naviga } from '../router';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { nuovoId } from '../utils/id';
import { eSvg, misureSvg, nomeDaFile } from '../utils/svgDisegno';
import type { OpzioniReport } from '../pdf/report';
import {
  ConfermaDialog,
  MenuContesto,
  Modale,
  StatoApp,
  type RichiestaConferma,
  type VoceMenu
} from '../components/comuni';
import { mostraToast } from '../state/toast';
import { formattaData, formattaNumero } from '../utils/format';
import { Icona } from '../components/Icona';
import { PannelloOpzioniPdf } from '../components/OpzioniPdf';
import { BarraSelezione } from '../components/comuni';
import { condividiSelezione, type Selezionato } from '../utils/condivisione';
import { ModaleAnteprimaPdf } from '../components/ModaleAnteprimaPdf';

export function Archivio({ cartellaId }: { cartellaId: string | null }) {
  const [ricerca, setRicerca] = useState('');
  const [nuovaCartella, setNuovaCartella] = useState(false);
  const [nuovoProgetto, setNuovoProgetto] = useState(false);
  const [rinomina, setRinomina] = useState<Cartella | null>(null);
  const [daSpostare, setDaSpostare] = useState<
    | { tipo: 'cartella'; id: string }
    | { tipo: 'progetto'; id: string }
    | { tipo: 'nesting'; id: string }
    | { tipo: 'disegno'; id: string }
    | null
  >(null);
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);
  const [menu, setMenu] = useState<{
    pos: { x: number; y: number };
    titolo?: string;
    voci: VoceMenu[];
  } | null>(null);
  const [reportCartella, setReportCartella] = useState<Cartella | null>(null);
  const [rinominaLavoro, setRinominaLavoro] = useState<LavoroNesting | null>(null);
  const [rinominaDisegnoScelto, setRinominaDisegnoScelto] = useState<DisegnoSvg | null>(null);
  const fileSvgRef = useRef<HTMLInputElement>(null);
  /**
   * Selezione multipla: si accende toccando «Seleziona» e si spegne da sola
   * quando si annulla. Riguarda i FILE — piani di taglio e disegni — perché
   * sono quelli che si mandano via.
   */
  const [selezione, setSelezione] = useState<Selezionato[] | null>(null);
  const [invioInCorso, setInvioInCorso] = useState<string | null>(null);
  const preso = (tipo: Selezionato['tipo'], id: string) =>
    !!selezione?.some((x) => x.tipo === tipo && x.id === id);
  const cambia = (tipo: Selezionato['tipo'], id: string) =>
    setSelezione((s) =>
      s?.some((x) => x.tipo === tipo && x.id === id)
        ? s.filter((x) => !(x.tipo === tipo && x.id === id))
        : [...(s ?? []), { tipo, id }]
    );

  const condividiScelti = async () => {
    if (!selezione || selezione.length === 0) return;
    setInvioInCorso('Preparazione…');
    try {
      const nome = corrente?.nome ?? 'Archivio';
      const quanti = await condividiSelezione(selezione, nome, __BUILD__, setInvioInCorso);
      if (quanti === 0) mostraToast('info', 'Non c’è niente da mandare.');
      else setSelezione(null);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Condivisione non riuscita.');
    } finally {
      setInvioInCorso(null);
    }
  };
  /** PDF da guardare nell'app prima di mandarlo via */
  const [anteprima, setAnteprima] = useState<{ blob: Blob; titolo: string } | null>(null);
  const [pdfInCorso, setPdfInCorso] = useState<string | null>(null);

  const corrente = useLiveQuery(
    async () => (cartellaId ? await db.cartelle.get(cartellaId) : undefined),
    [cartellaId]
  );
  const cartelle = useLiveQuery(
    async () => {
      const tutte = await db.cartelle.toArray();
      return tutte
        .filter((c) => c.parentId === cartellaId)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    },
    [cartellaId]
  );
  const progetti = useLiveQuery(
    async () => {
      const tutti = await db.progetti.toArray();
      return tutti
        .filter((p) => p.cartellaId === cartellaId)
        .sort((a, b) => b.modificatoIl - a.modificatoIl);
    },
    [cartellaId]
  );
  const lavori = useLiveQuery(
    async () => {
      const tutti = await db.nesting.toArray();
      // quello che sta DENTRO un progetto non è sciolto qui: si trova
      // aprendo il sopralluogo a cui appartiene
      return tutti
        .filter((l) => (l.cartellaId ?? null) === cartellaId && !l.progettoId)
        .sort((a, b) => b.modificatoIl - a.modificatoIl);
    },
    [cartellaId]
  );
  const disegni = useLiveQuery(
    async () => {
      const tutti = await db.disegni.toArray();
      return tutti
        .filter((d) => (d.cartellaId ?? null) === cartellaId && !d.progettoId)
        .sort((a, b) => b.modificatoIl - a.modificatoIl);
    },
    [cartellaId]
  );
  const percorso = useLiveQuery(async () => {
    const lista: Cartella[] = [];
    let id = cartellaId;
    while (id) {
      const c = await db.cartelle.get(id);
      if (!c) break;
      lista.unshift(c);
      id = c.parentId;
    }
    return lista;
  }, [cartellaId]);

  const generaReport = async (cartella: Cartella, opzioni: OpzioniReport) => {
    try {
      setPdfInCorso('Preparazione…');
      const { generaReportCartella } = await import('../pdf/report');
      const blob = await generaReportCartella(cartella.id, (msg) => setPdfInCorso(msg), opzioni);
      setPdfInCorso(null);
      await condividiOScarica(blob, nomeFileSicuro(`report_${cartella.nome}`, 'pdf'), cartella.nome);
    } catch (e) {
      setPdfInCorso(null);
      mostraToast('errore', e instanceof Error ? e.message : 'Generazione PDF non riuscita.');
    }
  };

  const generaZip = async (cartella: Cartella, opzioni: OpzioniReport) => {
    try {
      setPdfInCorso('Preparazione…');
      const { esportaCartellaZip } = await import('../utils/zipExport');
      const blob = await esportaCartellaZip(cartella, (msg) => setPdfInCorso(msg), opzioni);
      setPdfInCorso(null);
      await condividiOScarica(blob, nomeFileSicuro(`pacchetto_${cartella.nome}`, 'zip'), cartella.nome);
    } catch (e) {
      setPdfInCorso(null);
      mostraToast('errore', e instanceof Error ? e.message : 'Esportazione ZIP non riuscita.');
    }
  };

  const apriMenuCartella = (c: Cartella, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      voci: [
        { testo: 'Esporta (PDF / ZIP)', icona: 'condividi', onClick: () => setReportCartella(c) },
        { testo: 'Modifica (nome, etichetta, note)', icona: 'matita', onClick: () => setRinomina(c) },
        { testo: 'Sposta…', icona: 'sposta', onClick: () => setDaSpostare({ tipo: 'cartella', id: c.id }) },
        {
          testo: 'Elimina…',
          icona: 'cestino',
          pericolo: true,
          onClick: async () => {
            const contenuto = await contenutoCartella(c.id);
            setConferma({
              titolo: `Eliminare la cartella "${c.nome}"?`,
              messaggio: `Verranno eliminati definitivamente ${contenuto.progetti} progetti e ${contenuto.foto} foto con tutte le annotazioni.\nL'operazione NON è annullabile.`,
              onConferma: () => void eliminaCartella(c.id)
            });
          }
        }
      ]
    });
  };

  /**
   * Apre il PDF del piano di taglio salvato insieme al lavoro.
   *
   * Se il lavoro è stato modificato dopo l'ultima stampa (l'app chiusa a metà
   * modifica), il PDF viene rifatto adesso: quello che si apre corrisponde
   * sempre al progetto.
   */
  const apriPdfNesting = async (l: LavoroNesting) => {
    setPdfInCorso(l.id);
    try {
      let blob = l.pdf;
      if (pdfDaRifare(l, __BUILD__)) {
        const [{ generaPdfNesting }, { migraDocumento }, { OPZIONI_PDF_PREDEFINITE }] =
          await Promise.all([
            import('../pdf/nesting'),
            import('../utils/documentoNesting'),
            import('../pdf/opzioni')
          ]);
        const documento = migraDocumento(l.documento);
        if (!documento) throw new Error('Il lavoro salvato non è leggibile.');
        blob = await generaPdfNesting(documento, documento.stampa ?? OPZIONI_PDF_PREDEFINITE);
        await salvaPdfNesting(l.id, blob, __BUILD__);
      }
      if (!blob) throw new Error('PDF non disponibile.');
      setAnteprima({ blob, titolo: l.nome });
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'PDF non disponibile.');
    } finally {
      setPdfInCorso(null);
    }
  };

  /**
   * IMPORTA UN DISEGNO SVG dal telefono.
   *
   * Si legge il testo del file e si controlla che sia davvero un SVG: capita
   * di ricevere un PDF rinominato, e aprirlo darebbe una pagina bianca senza
   * spiegazioni. Le misure vere si leggono dall'intestazione, così l'archivio
   * può dire subito quanto è grande il disegno.
   */
  const importaSvg = async (file: File) => {
    try {
      const testo = await file.text();
      if (!eSvg(testo)) {
        mostraToast('errore', `«${file.name}» non è un disegno SVG.`);
        return;
      }
      const m = misureSvg(testo);
      const id = nuovoId();
      await salvaDisegno(id, nomeDaFile(file.name), testo, {
        cartellaId,
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

  const apriMenuDisegno = (d: DisegnoSvg, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      titolo: d.nome,
      voci: [
        {
          testo: 'Condividi il file',
          icona: 'condividi',
          onClick: () =>
            void condividiOScarica(
              new Blob([d.svg], { type: 'image/svg+xml' }),
              nomeFileSicuro(d.nome, 'svg'),
              d.nome
            )
        },
        { testo: 'Rinomina…', icona: 'matita', onClick: () => setRinominaDisegnoScelto(d) },
        {
          testo: 'Sposta…',
          icona: 'sposta',
          onClick: () => setDaSpostare({ tipo: 'disegno', id: d.id })
        },
        {
          testo: 'Elimina…',
          icona: 'cestino',
          pericolo: true,
          onClick: () =>
            setConferma({
              titolo: `Eliminare il disegno "${d.nome}"?`,
              messaggio: 'Il file verrà tolto dall’archivio.\nL’operazione NON è annullabile.',
              onConferma: () => void eliminaDisegno(d.id)
            })
        }
      ]
    });
  };

  const apriMenuNesting = (l: LavoroNesting, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      titolo: l.nome,
      voci: [
        { testo: 'Guarda il PDF', icona: 'documento', onClick: () => void apriPdfNesting(l) },
        { testo: 'Rinomina…', icona: 'matita', onClick: () => setRinominaLavoro(l) },
        {
          testo: 'Sposta…',
          icona: 'sposta',
          onClick: () => setDaSpostare({ tipo: 'nesting', id: l.id })
        },
        {
          testo: 'Elimina…',
          icona: 'cestino',
          pericolo: true,
          onClick: () =>
            setConferma({
              titolo: `Eliminare il piano di taglio "${l.nome}"?`,
              messaggio: 'Verranno persi le essenze, le misure e il PDF.\nL’operazione NON è annullabile.',
              onConferma: () => void eliminaNesting(l.id)
            })
        }
      ]
    });
  };

  const apriMenuProgetto = (p: Progetto, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      voci: [
        { testo: 'Sposta…', icona: 'sposta', onClick: () => setDaSpostare({ tipo: 'progetto', id: p.id }) },
        {
          testo: 'Duplica come modello',
          icona: 'duplica',
          onClick: async () => {
            await duplicaProgetto(p.id);
            mostraToast('successo', 'Progetto duplicato.');
          }
        },
        {
          testo: 'Elimina…',
          icona: 'cestino',
          pericolo: true,
          onClick: async () => {
            const nFoto = await db.foto.where('progettoId').equals(p.id).count();
            setConferma({
              titolo: `Eliminare il progetto "${p.nome}"?`,
              messaggio: `Verranno eliminate definitivamente ${nFoto} foto con tutte le annotazioni.\nL'operazione NON è annullabile.`,
              onConferma: () => void eliminaProgetto(p.id)
            });
          }
        }
      ]
    });
  };

  return (
    <div className={`app${selezione ? ' con-selezione' : ''}`}>
      <header className="barra">
        <h1>{corrente ? corrente.nome : 'Sopralluoghi'}</h1>
        <StatoApp />
        <button className="btn icona" aria-label="Clienti" onClick={() => naviga({ nome: 'clienti' })}>
          <Icona nome="persone" />
        </button>
        <button
          className="btn icona"
          aria-label="Nesting: ottimizzazione del taglio"
          title="Nesting: ottimizzazione del taglio"
          onClick={() => naviga({ nome: 'nesting', dentro: cartellaId ?? undefined })}
        >
          <Icona nome="griglia" />
        </button>
        <button
          className="btn icona"
          aria-label="Impostazioni"
          onClick={() => naviga({ nome: 'impostazioni' })}
        >
          <Icona nome="impostazioni" />
        </button>
      </header>
      <main className="contenuto">
        <div className="campo">
          <input
            type="search"
            placeholder="Cerca progetti, note, didascalie…"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            aria-label="Ricerca"
          />
        </div>

        {ricerca.trim() ? (
          <RisultatiRicerca query={ricerca.trim()} />
        ) : (
          <>
            <nav className="briciole">
              <button onClick={() => naviga({ nome: 'archivio', cartellaId: null })}>Archivio</button>
              {(percorso ?? []).map((c) => (
                <span key={c.id}>
                  {' / '}
                  <button onClick={() => naviga({ nome: 'archivio', cartellaId: c.id })}>
                    {c.nome}
                  </button>
                </span>
              ))}
            </nav>

            <div className="riga-pulsanti" style={{ marginBottom: 16 }}>
              <button className="btn" onClick={() => setNuovaCartella(true)}>
                <Icona nome="cartella-piu" dimensione={20} /> Nuova cartella
              </button>
              <button className="btn primario" onClick={() => setNuovoProgetto(true)}>
                <Icona nome="piu" dimensione={20} /> Nuovo progetto
              </button>
            </div>

            {/* strumenti non legati a un progetto: qui con l'etichetta, perché
                la sola icona nella barra non dice cosa fanno */}
            <div className="riga-pulsanti" style={{ marginBottom: 16 }}>
              <button
                className="btn"
                onClick={() =>
                  naviga({ nome: 'nesting', nuovoIn: cartellaId ?? undefined })
                }
              >
                <Icona nome="griglia" dimensione={20} /> Nuovo piano di taglio
              </button>
              <button className="btn" onClick={() => fileSvgRef.current?.click()}>
                <Icona nome="disegno" dimensione={20} /> Apri un SVG
              </button>
              {((lavori?.length ?? 0) > 0 || (disegni?.length ?? 0) > 0) && !selezione && (
                <button className="btn" onClick={() => setSelezione([])}>
                  <Icona nome="check" dimensione={20} /> Seleziona
                </button>
              )}
              <input
                ref={fileSvgRef}
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

            <div className="lista-griglia">
            {(cartelle ?? []).map((c) => (
              <button
                key={c.id}
                className="scheda"
                onClick={() => naviga({ nome: 'archivio', cartellaId: c.id })}
              >
                <span className="glifo neutro">
                  <Icona nome="cartella" dimensione={22} />
                </span>
                <span className="corpo">
                  <div className="titolo">
                    <span className="nome">{c.nome}</span>
                    {c.etichetta ? <span className="badge-etichetta">{c.etichetta}</span> : null}
                  </div>
                </span>
                <span
                  className="btn icona"
                  role="button"
                  aria-label={`Azioni cartella ${c.nome}`}
                  onClick={(e) => apriMenuCartella(c, e)}
                >
                  <Icona nome="altro" />
                </span>
                <Icona nome="avanti" dimensione={18} className="vai" />
              </button>
            ))}

            {(progetti ?? []).map((p) => (
              <button
                key={p.id}
                className="scheda"
                onClick={() => naviga({ nome: 'progetto', id: p.id })}
              >
                <span className="glifo">
                  <Icona nome="progetto" dimensione={22} />
                </span>
                <span className="corpo">
                  <div className="titolo">
                    <span className="nome">{p.nome}</span>
                    {p.etichetta ? <span className="badge-etichetta">{p.etichetta}</span> : null}
                  </div>
                  <div className="sotto">
                    {[p.cliente, p.luogo].filter(Boolean).join(' — ') || 'Senza cliente'} ·{' '}
                    {formattaData(p.modificatoIl)}
                  </div>
                </span>
                <EtichettaStato stato={p.stato} />
                <span
                  className="btn icona"
                  role="button"
                  aria-label={`Azioni progetto ${p.nome}`}
                  onClick={(e) => apriMenuProgetto(p, e)}
                >
                  <Icona nome="altro" />
                </span>
              </button>
            ))}

            {(lavori ?? []).map((l) => {
              const essenze = Array.isArray((l.documento as { materiali?: unknown[] })?.materiali)
                ? ((l.documento as { materiali: unknown[] }).materiali as unknown[]).length
                : 1;
              return (
                <button
                  key={l.id}
                  className={`scheda${preso('nesting', l.id) ? ' presa' : ''}`}
                  onClick={() =>
                    selezione
                      ? cambia('nesting', l.id)
                      : naviga({ nome: 'nesting', id: l.id })
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
                    <div className="sotto">
                      {essenze} {essenze === 1 ? 'essenza' : 'essenze'} ·{' '}
                      {formattaData(l.modificatoIl)}
                    </div>
                  </span>
                  <span
                    className="btn icona"
                    role="button"
                    aria-label={`Apri il PDF di ${l.nome}`}
                    title="Guarda il PDF del piano di taglio"
                    onClick={(e) => {
                      e.stopPropagation();
                      void apriPdfNesting(l);
                    }}
                  >
                    {pdfInCorso === l.id ? '…' : <Icona nome="documento" />}
                  </span>
                  <span
                    className="btn icona"
                    role="button"
                    aria-label={`Azioni piano di taglio ${l.nome}`}
                    onClick={(e) => apriMenuNesting(l, e)}
                  >
                    <Icona nome="altro" />
                  </span>
                </button>
              );
            })}

            {(disegni ?? []).map((d) => (
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
                      ? `${formattaNumero(Math.round(d.larghezzaMm))} × ${formattaNumero(
                          Math.round(d.altezzaMm)
                        )} mm · `
                      : ''}
                    {formattaData(d.modificatoIl)}
                  </div>
                </span>
                <span
                  className="btn icona"
                  role="button"
                  aria-label={`Azioni disegno ${d.nome}`}
                  onClick={(e) => apriMenuDisegno(d, e)}
                >
                  <Icona nome="altro" />
                </span>
              </button>
            ))}
            </div>

            {cartelle?.length === 0 &&
              progetti?.length === 0 &&
              lavori?.length === 0 &&
              disegni?.length === 0 && (
              <div className="vuoto">
                <div className="grande">
                  <Icona nome="archivio" dimensione={46} />
                </div>
                <p>Nessun contenuto. Crea un progetto per iniziare il sopralluogo.</p>
              </div>
            )}
          </>
        )}
      </main>

      {nuovaCartella && (
        <FormCartella
          titolo="Nuova cartella"
          onChiudi={() => setNuovaCartella(false)}
          onSalva={async (nome, etichetta, note) => {
            const c = await creaCartella(nome, cartellaId);
            if (etichetta.trim() || note.trim()) {
              await aggiornaCartella(c.id, { etichetta, note });
            }
          }}
        />
      )}
      {rinomina && (
        <FormCartella
          titolo="Modifica cartella"
          iniziale={{ nome: rinomina.nome, etichetta: rinomina.etichetta, note: rinomina.note }}
          onChiudi={() => setRinomina(null)}
          onSalva={async (nome, etichetta, note) => {
            await aggiornaCartella(rinomina.id, { nome, etichetta, note });
          }}
        />
      )}
      {nuovoProgetto && (
        <FormProgetto cartellaId={cartellaId} onChiudi={() => setNuovoProgetto(false)} />
      )}
      {reportCartella && (
        <PannelloOpzioniPdf
          titolo={`Report — ${reportCartella.nome}`}
          preparaImmagini={async () => (await import('../pdf/report')).preparaImmaginiCartella(reportCartella.id)}
          generaAnteprima={async (opz, img) =>
            (await import('../pdf/report')).generaReportCartella(reportCartella.id, undefined, opz, img)
          }
          onChiudi={() => setReportCartella(null)}
          onGenera={(opzioni) => {
            const c = reportCartella;
            setReportCartella(null);
            void generaReport(c, opzioni);
          }}
          onGeneraZip={(opzioni) => {
            const c = reportCartella;
            setReportCartella(null);
            void generaZip(c, opzioni);
          }}
        />
      )}
      {pdfInCorso && (
        <Modale titolo="Generazione report" onChiudi={() => {}} centro>
          <p style={{ color: 'var(--testo-2)' }}>{pdfInCorso}</p>
        </Modale>
      )}
      {daSpostare && (
        <SelettoreCartella
          escludiCartellaId={daSpostare.tipo === 'cartella' ? daSpostare.id : undefined}
          soloCartelle={daSpostare.tipo === 'cartella' || daSpostare.tipo === 'progetto'}
          onChiudi={() => setDaSpostare(null)}
          onScegli={async (destinazione) => {
            try {
              if (daSpostare.tipo === 'cartella')
                await spostaCartella(daSpostare.id, destinazione.cartellaId);
              else if (daSpostare.tipo === 'nesting')
                await spostaNesting(daSpostare.id, destinazione);
              else if (daSpostare.tipo === 'disegno')
                await spostaDisegno(daSpostare.id, destinazione);
              else await spostaProgetto(daSpostare.id, destinazione.cartellaId);
              mostraToast('successo', 'Spostato.');
            } catch (e) {
              mostraToast('errore', e instanceof Error ? e.message : 'Spostamento non riuscito.');
            }
          }}
        />
      )}
      {anteprima && (
        <ModaleAnteprimaPdf
          blob={anteprima.blob}
          titolo={anteprima.titolo}
          nomeFile={anteprima.titolo}
          onChiudi={() => setAnteprima(null)}
        />
      )}

      {rinominaLavoro && (
        <FormNome
          titolo="Rinomina il piano di taglio"
          valore={rinominaLavoro.nome}
          onChiudi={() => setRinominaLavoro(null)}
          onSalva={async (nome) => {
            await rinominaNesting(rinominaLavoro.id, nome);
            setRinominaLavoro(null);
          }}
        />
      )}
      {rinominaDisegnoScelto && (
        <FormNome
          titolo="Rinomina il disegno"
          valore={rinominaDisegnoScelto.nome}
          onChiudi={() => setRinominaDisegnoScelto(null)}
          onSalva={async (nome) => {
            await rinominaDisegno(rinominaDisegnoScelto.id, nome);
            setRinominaDisegnoScelto(null);
          }}
        />
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

export function EtichettaStato({ stato }: { stato: Progetto['stato'] }) {
  const testo = stato === 'bozza' ? 'Bozza' : stato === 'in_corso' ? 'In corso' : 'Completato';
  return <span className={`badge ${stato}`}>{testo}</span>;
}

/** Modale minima per un solo campo di testo (rinomina). */
function FormNome({
  titolo,
  valore,
  onChiudi,
  onSalva
}: {
  titolo: string;
  valore: string;
  onChiudi: () => void;
  onSalva: (nome: string) => void | Promise<void>;
}) {
  const [nome, setNome] = useState(valore);
  return (
    <Modale titolo={titolo} onChiudi={onChiudi}>
      <div className="campo">
        <label>Nome</label>
        <input
          type="text"
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && nome.trim()) void onSalva(nome.trim());
          }}
        />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          style={{ flex: 1 }}
          disabled={!nome.trim()}
          onClick={() => void onSalva(nome.trim())}
        >
          Salva
        </button>
      </div>
    </Modale>
  );
}

function FormCartella({
  titolo = 'Cartella',
  iniziale,
  onChiudi,
  onSalva
}: {
  titolo?: string;
  iniziale?: { nome?: string; etichetta?: string; note?: string };
  onChiudi: () => void;
  onSalva: (nome: string, etichetta: string, note: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(iniziale?.nome ?? '');
  const [etichetta, setEtichetta] = useState(iniziale?.etichetta ?? '');
  const [note, setNote] = useState(iniziale?.note ?? '');
  return (
    <Modale titolo={titolo} onChiudi={onChiudi} centro>
      <div className="campo">
        <label>Nome (titolo del capitolo nel PDF)</label>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="campo">
        <label>Etichetta (codice nelle forme, es. P1)</label>
        <input
          value={etichetta}
          maxLength={6}
          placeholder="facoltativa — es. P1, E1…"
          onChange={(e) => setEtichetta(e.target.value)}
          style={{ width: 180 }}
        />
        <p className="aiuto" style={{ marginTop: 4 }}>
          Compare davanti ai codici delle misure (es. <strong>P1</strong>.A1.1) e numera in
          autonomia i duplicati di questa cartella.
        </p>
      </div>
      <div className="campo">
        <label>Note (descrizione del capitolo nel PDF)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          disabled={!nome.trim()}
          onClick={async () => {
            await onSalva(nome, etichetta, note);
            onChiudi();
          }}
        >
          Salva
        </button>
      </div>
    </Modale>
  );
}

function FormProgetto({ cartellaId, onChiudi }: { cartellaId: string | null; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [cliente, setCliente] = useState('');
  const [luogo, setLuogo] = useState('');
  return (
    <Modale titolo="Nuovo progetto" onChiudi={onChiudi}>
      <div className="campo">
        <label>Nome del progetto *</label>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="campo">
        <label>Cliente</label>
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
      </div>
      <div className="campo">
        <label>Luogo / indirizzo</label>
        <input value={luogo} onChange={(e) => setLuogo(e.target.value)} />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          disabled={!nome.trim()}
          onClick={async () => {
            const p = await creaProgetto({ nome, cliente, luogo }, cartellaId);
            onChiudi();
            naviga({ nome: 'progetto', id: p.id });
          }}
        >
          Crea
        </button>
      </div>
    </Modale>
  );
}

/** Albero cartelle per scegliere una destinazione di spostamento */
export function SelettoreCartella({
  escludiCartellaId,
  soloCartelle,
  onChiudi,
  onScegli
}: {
  escludiCartellaId?: string;
  /** vero quando la cosa da spostare è una cartella o un progetto: quelli
   *  stanno solo dentro cartelle, non dentro un altro progetto */
  soloCartelle?: boolean;
  onChiudi: () => void;
  onScegli: (dove: Destinazione) => Promise<void> | void;
}) {
  const cartelle = useLiveQuery(() => db.cartelle.toArray(), []);
  const progetti = useLiveQuery(
    async () => (soloCartelle ? [] : await db.progetti.toArray()),
    [soloCartelle]
  );
  const albero = useMemo(() => {
    if (!cartelle) return [];
    const escluse = new Set<string>();
    if (escludiCartellaId) {
      // escludi la cartella stessa e tutte le discendenti (evita cicli)
      escluse.add(escludiCartellaId);
      let aggiunte = true;
      while (aggiunte) {
        aggiunte = false;
        for (const c of cartelle) {
          if (c.parentId && escluse.has(c.parentId) && !escluse.has(c.id)) {
            escluse.add(c.id);
            aggiunte = true;
          }
        }
      }
    }
    type Riga =
      | { tipo: 'cartella'; c: Cartella; livello: number }
      | { tipo: 'progetto'; p: Progetto; livello: number };
    const righe: Riga[] = [];
    const progettiDi = (cartellaId: string | null) =>
      (progetti ?? [])
        .filter((p) => (p.cartellaId ?? null) === cartellaId)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const aggiungi = (parentId: string | null, livello: number) => {
      cartelle
        .filter((c) => c.parentId === parentId && !escluse.has(c.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
        .forEach((c) => {
          righe.push({ tipo: 'cartella', c, livello });
          aggiungi(c.id, livello + 1);
          for (const p of progettiDi(c.id)) righe.push({ tipo: 'progetto', p, livello: livello + 1 });
        });
    };
    aggiungi(null, 0);
    for (const p of progettiDi(null)) righe.push({ tipo: 'progetto', p, livello: 0 });
    return righe;
  }, [cartelle, progetti, escludiCartellaId]);

  const scegli = async (dove: Destinazione) => {
    await onScegli(dove);
    onChiudi();
  };

  return (
    <Modale titolo="Sposta in…" onChiudi={onChiudi}>
      <button className="scheda" onClick={() => scegli({ cartellaId: null, progettoId: null })}>
        <span className="glifo neutro">
          <Icona nome="archivio" dimensione={20} />
        </span>
        <span className="corpo">
          <div className="titolo">Archivio (radice)</div>
        </span>
      </button>
      {albero.map((r) =>
        r.tipo === 'cartella' ? (
          <button
            key={r.c.id}
            className="scheda"
            style={{ marginLeft: r.livello * 18 }}
            onClick={() => scegli({ cartellaId: r.c.id, progettoId: null })}
          >
            <span className="glifo neutro">
              <Icona nome="cartella" dimensione={20} />
            </span>
            <span className="corpo">
              <div className="titolo"><span className="nome">{r.c.nome}</span></div>
            </span>
          </button>
        ) : (
          <button
            key={r.p.id}
            className="scheda"
            style={{ marginLeft: r.livello * 18 }}
            onClick={() => scegli({ cartellaId: r.p.cartellaId ?? null, progettoId: r.p.id })}
          >
            <span className="glifo verde">
              <Icona nome="progetto" dimensione={20} />
            </span>
            <span className="corpo">
              <div className="titolo"><span className="nome">{r.p.nome}</span></div>
              <div className="sotto">dentro il sopralluogo</div>
            </span>
          </button>
        )
      )}
    </Modale>
  );
}

function RisultatiRicerca({ query }: { query: string }) {
  const risultati = useLiveQuery(async () => {
    const q = query.toLowerCase();
    const [progetti, foto, clienti, preventivi] = await Promise.all([
      db.progetti.toArray(),
      db.foto.toArray(),
      db.clienti.toArray(),
      db.preventivi.toArray()
    ]);
    const progettiTrovati = progetti.filter((p) =>
      [p.nome, p.cliente, p.luogo, p.note].some((t) => t.toLowerCase().includes(q))
    );
    const fotoTrovate = foto.filter((f) =>
      [f.didascalia, f.noteDato].some((t) => t.toLowerCase().includes(q))
    );
    const clientiTrovati = clienti.filter((c) =>
      [c.nome, c.telefono, c.email, c.indirizzo, c.note].some((t) => t.toLowerCase().includes(q))
    );
    const preventiviTrovati = preventivi.filter(
      (p) =>
        p.numero.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q) ||
        p.voci.some((v) => v.descrizione.toLowerCase().includes(q))
    );
    const nomiProgetto = new Map(progetti.map((p) => [p.id, p.nome]));
    return { progettiTrovati, fotoTrovate, clientiTrovati, preventiviTrovati, nomiProgetto };
  }, [query]);

  if (!risultati) return null;
  const { progettiTrovati, fotoTrovate, clientiTrovati, preventiviTrovati, nomiProgetto } =
    risultati;

  return (
    <>
      {progettiTrovati.length === 0 &&
        fotoTrovate.length === 0 &&
        clientiTrovati.length === 0 &&
        preventiviTrovati.length === 0 && (
          <div className="vuoto">Nessun risultato per “{query}”.</div>
        )}
      {clientiTrovati.map((c) => (
        <button key={c.id} className="scheda" onClick={() => naviga({ nome: 'cliente', id: c.id })}>
          <span className="glifo verde">
            <Icona nome="persona" dimensione={22} />
          </span>
          <span className="corpo">
            <div className="titolo"><span className="nome">{c.nome}</span></div>
            <div className="sotto">{[c.telefono, c.email].filter(Boolean).join(' · ')}</div>
          </span>
        </button>
      ))}
      {preventiviTrovati.map((p) => (
        <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'preventivo', id: p.id })}>
          <span className="glifo ambra">
            <Icona nome="documento" dimensione={22} />
          </span>
          <span className="corpo">
            <div className="titolo"><span className="nome">Preventivo {p.numero}</span></div>
            <div className="sotto">{formattaData(p.data)} · {p.voci.length} voci</div>
          </span>
        </button>
      ))}
      {progettiTrovati.map((p) => (
        <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'progetto', id: p.id })}>
          <span className="glifo">
            <Icona nome="progetto" dimensione={22} />
          </span>
          <span className="corpo">
            <div className="titolo"><span className="nome">{p.nome}</span></div>
            <div className="sotto">{[p.cliente, p.luogo].filter(Boolean).join(' — ')}</div>
          </span>
          <EtichettaStato stato={p.stato} />
        </button>
      ))}
      {fotoTrovate.map((f) => (
        <button key={f.id} className="scheda" onClick={() => naviga({ nome: 'foto', id: f.id })}>
          <span className="glifo viola">
            <Icona nome="immagine" dimensione={22} />
          </span>
          <span className="corpo">
            <div className="titolo">
              <span className="nome">{f.didascalia || 'Foto senza didascalia'}</span>
            </div>
            <div className="sotto">
              {nomiProgetto.get(f.progettoId) ?? 'Progetto'} ·{' '}
              {f.noteDato ? f.noteDato.slice(0, 80) : formattaData(f.dataScatto)}
            </div>
          </span>
        </button>
      ))}
    </>
  );
}
