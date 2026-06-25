import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Foto, Progetto, StatoProgetto } from '../db/types';
import {
  aggiungiFoto,
  aggiornaProgetto,
  creaPreventivo,
  eliminaFoto,
  leggiImpostazioni
} from '../db/repository';
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
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputGalleria = useRef<HTMLInputElement>(null);

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
            scala: null
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
              const blob = await renderFotoAnnotata(f, annotazioni);
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
          testo: 'Elimina foto…',
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

  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => naviga({ nome: 'archivio', cartellaId: progetto.cartellaId })}
        >
          ←
        </button>
        <h1>{progetto.nome}</h1>
        <StatoApp />
      </header>
      <main className="contenuto">
        <button className="scheda" onClick={() => setModificaDati(true)}>
          <span className="corpo">
            <div className="titolo">{progetto.cliente || 'Cliente non indicato'}</div>
            <div className="sotto">{progetto.luogo || 'Luogo non indicato'}</div>
            {progetto.note && <div className="sotto">{progetto.note.slice(0, 120)}</div>}
          </span>
          <SelettoreStato progetto={progetto} />
        </button>

        <div className="riga-pulsanti" style={{ margin: '14px 0' }}>
          <button
            className="btn primario"
            disabled={importInCorso}
            onClick={() => inputCamera.current?.click()}
          >
            📷 Scatta
          </button>
          <button
            className="btn"
            disabled={importInCorso}
            onClick={() => inputGalleria.current?.click()}
          >
            🖼️ Galleria
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
            📄 Report PDF
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

        <h2>Foto ({foto.length})</h2>
        {foto.length === 0 ? (
          <div className="vuoto">
            <div className="grande">📷</div>
            <p>Nessuna foto. Scatta la prima foto del sopralluogo.</p>
          </div>
        ) : (
          <div className="griglia-foto">
            {foto.map((f) => (
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
        )}

        <h2>Preventivi ({preventivi?.length ?? 0})</h2>
        {(preventivi ?? []).map((p) => (
          <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'preventivo', id: p.id })}>
            <span style={{ fontSize: 24 }}>💶</span>
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
            ＋ Nuovo preventivo
          </button>
        </div>
      </main>

      {opzioniPdfAperte && (
        <FormOpzioniReport
          foto={foto}
          onChiudi={() => setOpzioniPdfAperte(false)}
          onGenera={(opzioni) => {
            setOpzioniPdfAperte(false);
            void generaPdf(opzioni);
          }}
        />
      )}
      {modificaDati && <FormDatiProgetto progetto={progetto} onChiudi={() => setModificaDati(false)} />}
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

function FormDatiProgetto({ progetto, onChiudi }: { progetto: Progetto; onChiudi: () => void }) {
  const [nome, setNome] = useState(progetto.nome);
  const [cliente, setCliente] = useState(progetto.cliente);
  const [clienteId, setClienteId] = useState<string | null>(progetto.clienteId ?? null);
  const [luogo, setLuogo] = useState(progetto.luogo);
  const [note, setNote] = useState(progetto.note);
  const [scegliCliente, setScegliCliente] = useState(false);

  // Autosave alla chiusura: nessun dato perso anche senza "Salva" esplicito
  const salva = async () => {
    if (!nome.trim()) {
      mostraToast('errore', 'Il nome del progetto non può essere vuoto.');
      return;
    }
    await aggiornaProgetto(progetto.id, { nome: nome.trim(), cliente, clienteId, luogo, note });
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
          <button className="btn" onClick={() => setScegliCliente(true)} type="button">
            👥
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

/**
 * Opzioni del report PDF: quali foto includere, layout e sezioni.
 */
function FormOpzioniReport({
  foto,
  onChiudi,
  onGenera
}: {
  foto: Foto[];
  onChiudi: () => void;
  onGenera: (opzioni: OpzioniReport) => void;
}) {
  const [selezione, setSelezione] = useState<Set<string>>(new Set(foto.map((f) => f.id)));
  const [fotoPerPagina, setFotoPerPagina] = useState<1 | 2>(1);
  const [includiIndice, setIncludiIndice] = useState(true);
  const [includiRiepilogo, setIncludiRiepilogo] = useState(true);
  const [includiNoteDato, setIncludiNoteDato] = useState(true);
  const [includiTabellaMisure, setIncludiTabellaMisure] = useState(true);
  const [includiDistinta, setIncludiDistinta] = useState(true);

  const commuta = (id: string) => {
    setSelezione((prev) => {
      const nuova = new Set(prev);
      if (nuova.has(id)) nuova.delete(id);
      else nuova.add(id);
      return nuova;
    });
  };

  const Interruttore = ({
    attivo,
    onCommuta,
    testo
  }: {
    attivo: boolean;
    onCommuta: () => void;
    testo: string;
  }) => (
    <button
      className={`btn${attivo ? ' attivo' : ''}`}
      style={{ justifyContent: 'flex-start', width: '100%', marginBottom: 8 }}
      onClick={onCommuta}
    >
      {attivo ? '☑' : '☐'} {testo}
    </button>
  );

  return (
    <Modale titolo="Opzioni del report PDF" onChiudi={onChiudi}>
      <div className="campo">
        <label>
          Foto da includere ({selezione.size} di {foto.length})
        </label>
        <div className="griglia-foto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
          {foto.map((f, i) => (
            <button
              key={f.id}
              className="cella-foto"
              style={{
                outline: selezione.has(f.id) ? '3px solid var(--accento)' : 'none',
                opacity: selezione.has(f.id) ? 1 : 0.45
              }}
              onClick={() => commuta(f.id)}
            >
              <ImmagineBlob dati={f.miniatura} tipo={f.miniaturaTipo} alt={f.didascalia || `Foto ${i + 1}`} />
              {selezione.has(f.id) && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    background: 'var(--accento)',
                    color: '#fff',
                    borderRadius: 999,
                    padding: '2px 8px',
                    fontWeight: 700,
                    fontSize: 13
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="riga-pulsanti" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => setSelezione(new Set(foto.map((f) => f.id)))}>
            Tutte
          </button>
          <button className="btn" onClick={() => setSelezione(new Set())}>
            Nessuna
          </button>
        </div>
      </div>
      <div className="campo">
        <label>Layout delle foto</label>
        <span className="segmenti" role="group">
          <button className={fotoPerPagina === 1 ? 'attivo' : ''} onClick={() => setFotoPerPagina(1)}>
            1 per pagina (grande)
          </button>
          <button className={fotoPerPagina === 2 ? 'attivo' : ''} onClick={() => setFotoPerPagina(2)}>
            2 per pagina (compatto)
          </button>
        </span>
      </div>
      <div className="campo">
        <label>Sezioni del documento</label>
        <Interruttore attivo={includiIndice} onCommuta={() => setIncludiIndice(!includiIndice)} testo="Indice con numeri di pagina" />
        <Interruttore attivo={includiNoteDato} onCommuta={() => setIncludiNoteDato(!includiNoteDato)} testo="Note dato delle foto" />
        <Interruttore attivo={includiTabellaMisure} onCommuta={() => setIncludiTabellaMisure(!includiTabellaMisure)} testo="Tabella misure per ogni foto" />
        <Interruttore attivo={includiRiepilogo} onCommuta={() => setIncludiRiepilogo(!includiRiepilogo)} testo="Riepilogo finale delle misure" />
        <Interruttore attivo={includiDistinta} onCommuta={() => setIncludiDistinta(!includiDistinta)} testo="Distinta di taglio (pezzi da produrre)" />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          disabled={selezione.size === 0}
          onClick={() =>
            onGenera({
              fotoIds: selezione.size === foto.length ? null : Array.from(selezione),
              fotoPerPagina,
              includiIndice,
              includiRiepilogo,
              includiNoteDato,
              includiTabellaMisure,
              includiDistinta
            })
          }
        >
          📄 Genera ({selezione.size} foto)
        </button>
      </div>
    </Modale>
  );
}
