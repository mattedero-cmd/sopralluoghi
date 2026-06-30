import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Foto, Progetto, StatoProgetto } from '../db/types';
import {
  aggiungiFoto,
  aggiornaProgetto,
  aggiornaSezione,
  assegnaFotoSezione,
  creaPianta,
  creaPreventivo,
  creaSezione,
  eliminaFoto,
  eliminaSezione,
  leggiImpostazioni
} from '../db/repository';
import type { Sezione } from '../db/types';
import type { OpzioniReport } from '../pdf/report';
import { SelettoreCliente } from './ClientiPage';
import { EtichettaStatoPreventivo } from './PreventivoPage';
import { fotoIllegibile, importaFoto } from '../utils/image';
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
import { PannelloOpzioniPdf } from '../components/OpzioniPdf';

export function ProgettoPage({ id }: { id: string }) {
  const progetto = useLiveQuery(() => db.progetti.get(id), [id]);
  const foto = useLiveQuery(
    async () => {
      const lista = await db.foto.where('progettoId').equals(id).toArray();
      return lista.sort((a, b) => a.ordine - b.ordine);
    },
    [id]
  );
  const preventivi = useLiveQuery(
    async () => {
      const lista = await db.preventivi.where('progettoId').equals(id).toArray();
      return lista.sort((a, b) => b.data - a.data);
    },
    [id]
  );
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);
  const [menu, setMenu] = useState<{ pos: { x: number; y: number }; voci: VoceMenu[] } | null>(null);
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
  /** sezione di destinazione delle prossime foto importate (null = nessuna) */
  const sezioneTarget = useRef<string | null>(null);

  if (progetto === undefined || foto === undefined) {
    return <div className="app" />;
  }
  if (progetto === null || !progetto) {
    return (
      <div className="app">
        <header className="barra">
          <button className="btn icona" onClick={() => naviga({ nome: 'archivio', cartellaId: null })}>
            ←
          </button>
          <h1>Progetto non trovato</h1>
        </header>
      </div>
    );
  }

  const acquisisci = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportInCorso(true);
    let importate = 0;
    try {
      const { fotoLatoMax } = await leggiImpostazioni();
      for (const file of Array.from(files)) {
        try {
          const dati = await importaFoto(file, fotoLatoMax);
          await aggiungiFoto(id, {
            ...dati,
            didascalia: '',
            noteDato: '',
            scala: null,
            sezioneId: sezioneTarget.current ?? undefined
          });
          importate++;
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
          testo: 'Condividi / salva immagine quotata',
          icona: 'condividi',
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

  const generaPdf = async (opzioni: OpzioniReport) => {
    try {
      setPdfInCorso('Preparazione…');
      // import dinamico: il motore PDF (~2 MB) non pesa sull'avvio dell'app
      const { generaReportPdf } = await import('../pdf/report');
      const blob = await generaReportPdf(progetto, (msg) => setPdfInCorso(msg), opzioni);
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
        </div>
        {importInCorso && <p style={{ color: 'var(--testo-2)' }}>Importazione foto in corso…</p>}
        {pdfInCorso && <p style={{ color: 'var(--testo-2)' }}>{pdfInCorso}</p>}

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

        <h2>Preventivi ({preventivi?.length ?? 0})</h2>
        {(preventivi ?? []).map((p) => (
          <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'preventivo', id: p.id })}>
            <span className="glifo ambra">
              <Icona nome="documento" dimensione={20} />
            </span>
            <span className="corpo">
              <div className="titolo">Preventivo {p.numero}</div>
              <div className="sotto">{p.voci.length} voci</div>
            </span>
            <EtichettaStatoPreventivo stato={p.stato} />
          </button>
        ))}
        <div className="riga-pulsanti">
          <button
            className="btn"
            onClick={async () => {
              const p = await creaPreventivo(progetto.id, progetto.clienteId ?? null);
              naviga({ nome: 'preventivo', id: p.id });
            }}
          >
            <Icona nome="piu" dimensione={20} /> Nuovo preventivo
          </button>
        </div>
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
      <ConfermaDialog richiesta={conferma} onChiudi={() => setConferma(null)} />
      {menu && <MenuContesto posizione={menu.pos} voci={menu.voci} onChiudi={() => setMenu(null)} />}
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

