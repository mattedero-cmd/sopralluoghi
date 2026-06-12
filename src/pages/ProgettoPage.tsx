import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Foto, Progetto, StatoProgetto } from '../db/types';
import { aggiungiFoto, aggiornaProgetto, creaPreventivo, eliminaFoto } from '../db/repository';
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
      for (const file of Array.from(files)) {
        try {
          const dati = await importaFoto(file);
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

  const generaPdf = async () => {
    if (foto.length === 0) {
      mostraToast('info', 'Aggiungi almeno una foto per generare il report.');
      return;
    }
    try {
      setPdfInCorso('Preparazione…');
      // import dinamico: il motore PDF (~2 MB) non pesa sull'avvio dell'app
      const { generaReportPdf } = await import('../pdf/report');
      const blob = await generaReportPdf(progetto, (msg) => setPdfInCorso(msg));
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
          <button className="btn" disabled={pdfInCorso !== null} onClick={generaPdf}>
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
