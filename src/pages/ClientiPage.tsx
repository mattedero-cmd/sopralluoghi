import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Cliente } from '../db/types';
import { aggiornaCliente, creaCliente, eliminaCliente } from '../db/repository';
import { naviga } from '../router';
import {
  ConfermaDialog,
  Modale,
  StatoApp,
  type RichiestaConferma
} from '../components/comuni';
import { EtichettaStato } from './Archivio';
import { EtichettaStatoPreventivo } from './PreventivoPage';
import { Icona } from '../components/Icona';
import { formattaData } from '../utils/format';

// ---------------------------------------------------------------------------
// Elenco clienti
// ---------------------------------------------------------------------------

export function ClientiPage() {
  const [ricerca, setRicerca] = useState('');
  const [nuovo, setNuovo] = useState(false);
  const clienti = useLiveQuery(async () => {
    const tutti = await db.clienti.toArray();
    return tutti.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  }, []);

  const filtrati = (clienti ?? []).filter((c) => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return true;
    return [c.nome, c.telefono, c.email, c.indirizzo, c.note].some((t) =>
      t.toLowerCase().includes(q)
    );
  });

  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => naviga({ nome: 'archivio', cartellaId: null })}
        >
          ←
        </button>
        <h1>Clienti</h1>
        <StatoApp />
      </header>
      <main className="contenuto">
        <div className="campo">
          <input
            type="search"
            placeholder="Cerca clienti…"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            aria-label="Ricerca clienti"
          />
        </div>
        <div className="riga-pulsanti" style={{ marginBottom: 16 }}>
          <button className="btn primario" onClick={() => setNuovo(true)}>
            ＋ Nuovo cliente
          </button>
        </div>

        {filtrati.length === 0 ? (
          <div className="vuoto">
            <div className="grande">👥</div>
            <p>{ricerca ? 'Nessun cliente trovato.' : 'Nessun cliente in anagrafica.'}</p>
          </div>
        ) : (
          filtrati.map((c) => (
            <button key={c.id} className="scheda" onClick={() => naviga({ nome: 'cliente', id: c.id })}>
              <span style={{ fontSize: 26 }}>👤</span>
              <span className="corpo">
                <div className="titolo">{c.nome}</div>
                <div className="sotto">
                  {[c.telefono, c.email].filter(Boolean).join(' · ') || c.indirizzo || '—'}
                </div>
              </span>
            </button>
          ))
        )}
      </main>
      {nuovo && (
        <FormCliente
          onChiudi={() => setNuovo(false)}
          onSalva={async (dati) => {
            const c = await creaCliente(dati);
            naviga({ nome: 'cliente', id: c.id });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheda cliente: dati + storico lavori (progetti e preventivi collegati)
// ---------------------------------------------------------------------------

export function ClientePage({ id }: { id: string }) {
  const cliente = useLiveQuery(() => db.clienti.get(id), [id]);
  const progetti = useLiveQuery(async () => {
    const lista = await db.progetti.where('clienteId').equals(id).toArray();
    return lista.sort((a, b) => b.modificatoIl - a.modificatoIl);
  }, [id]);
  const preventivi = useLiveQuery(async () => {
    const lista = await db.preventivi.where('clienteId').equals(id).toArray();
    return lista.sort((a, b) => b.data - a.data);
  }, [id]);
  const [modifica, setModifica] = useState(false);
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);

  if (cliente === undefined) return <div className="app" />;
  if (!cliente) {
    return (
      <div className="app">
        <header className="barra">
          <button className="btn icona" onClick={() => naviga({ nome: 'clienti' })}>
            ←
          </button>
          <h1>Cliente non trovato</h1>
        </header>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="barra">
        <button className="btn icona" aria-label="Indietro" onClick={() => naviga({ nome: 'clienti' })}>
          ←
        </button>
        <h1>{cliente.nome}</h1>
        <StatoApp />
      </header>
      <main className="contenuto">
        <button className="scheda" onClick={() => setModifica(true)}>
          <span className="glifo neutro">
            <Icona nome="persona" dimensione={20} />
          </span>
          <span className="corpo">
            {cliente.indirizzo && <div className="sotto">{cliente.indirizzo}</div>}
            {cliente.telefono && <div className="sotto">{cliente.telefono}</div>}
            {cliente.email && <div className="sotto">{cliente.email}</div>}
            {(cliente.partitaIva || cliente.codiceFiscale) && (
              <div className="sotto">
                {[cliente.partitaIva && `P.IVA ${cliente.partitaIva}`, cliente.codiceFiscale && `CF ${cliente.codiceFiscale}`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
            {(cliente.pec || cliente.sdi) && (
              <div className="sotto">
                {[cliente.pec, cliente.sdi && `SDI ${cliente.sdi}`].filter(Boolean).join(' · ')}
              </div>
            )}
            {cliente.note && <div className="sotto">{cliente.note.slice(0, 140)}</div>}
            {!cliente.telefono && !cliente.email && !cliente.indirizzo && !cliente.partitaIva && !cliente.note && (
              <div className="sotto">Tocca per completare i dati del cliente</div>
            )}
          </span>
          <Icona nome="matita" dimensione={18} className="vai" />
        </button>

        <h2>Sopralluoghi ({progetti?.length ?? 0})</h2>
        {(progetti ?? []).map((p) => (
          <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'progetto', id: p.id })}>
            <span style={{ fontSize: 24 }}>📋</span>
            <span className="corpo">
              <div className="titolo">{p.nome}</div>
              <div className="sotto">
                {p.luogo || '—'} · {formattaData(p.modificatoIl)}
              </div>
            </span>
            <EtichettaStato stato={p.stato} />
          </button>
        ))}
        {progetti?.length === 0 && (
          <p style={{ color: 'var(--testo-2)' }}>
            Nessun sopralluogo collegato. Collega un progetto a questo cliente dai dati del
            progetto.
          </p>
        )}

        <h2>Preventivi ({preventivi?.length ?? 0})</h2>
        {(preventivi ?? []).map((p) => (
          <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'preventivo', id: p.id })}>
            <span style={{ fontSize: 24 }}>💶</span>
            <span className="corpo">
              <div className="titolo">Preventivo {p.numero}</div>
              <div className="sotto">{formattaData(p.data)}</div>
            </span>
            <EtichettaStatoPreventivo stato={p.stato} />
          </button>
        ))}
        {preventivi?.length === 0 && (
          <p style={{ color: 'var(--testo-2)' }}>Nessun preventivo per questo cliente.</p>
        )}

        <div style={{ marginTop: 28 }}>
          <button
            className="btn pericolo"
            onClick={() =>
              setConferma({
                titolo: `Eliminare il cliente "${cliente.nome}"?`,
                messaggio:
                  'I sopralluoghi e i preventivi collegati NON verranno eliminati: resteranno in archivio, scollegati dall’anagrafica.',
                onConferma: () => {
                  void eliminaCliente(cliente.id).then(() => naviga({ nome: 'clienti' }));
                }
              })
            }
          >
            🗑 Elimina cliente
          </button>
        </div>
      </main>
      {modifica && (
        <FormCliente
          iniziale={cliente}
          onChiudi={() => setModifica(false)}
          onSalva={async (dati) => {
            await aggiornaCliente(cliente.id, dati);
          }}
        />
      )}
      <ConfermaDialog richiesta={conferma} onChiudi={() => setConferma(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form cliente (creazione e modifica) — riusato anche dal selettore
// ---------------------------------------------------------------------------

export function FormCliente({
  iniziale,
  onChiudi,
  onSalva
}: {
  iniziale?: Cliente;
  onChiudi: () => void;
  onSalva: (dati: {
    nome: string;
    telefono: string;
    email: string;
    indirizzo: string;
    partitaIva: string;
    codiceFiscale: string;
    pec: string;
    sdi: string;
    note: string;
  }) => Promise<void>;
}) {
  const [nome, setNome] = useState(iniziale?.nome ?? '');
  const [telefono, setTelefono] = useState(iniziale?.telefono ?? '');
  const [email, setEmail] = useState(iniziale?.email ?? '');
  const [indirizzo, setIndirizzo] = useState(iniziale?.indirizzo ?? '');
  const [partitaIva, setPartitaIva] = useState(iniziale?.partitaIva ?? '');
  const [codiceFiscale, setCodiceFiscale] = useState(iniziale?.codiceFiscale ?? '');
  const [pec, setPec] = useState(iniziale?.pec ?? '');
  const [sdi, setSdi] = useState(iniziale?.sdi ?? '');
  const [note, setNote] = useState(iniziale?.note ?? '');

  return (
    <Modale titolo={iniziale ? 'Dati del cliente' : 'Nuovo cliente'} onChiudi={onChiudi}>
      <div className="campo">
        <label>Nome / ragione sociale *</label>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="campo">
        <label>Indirizzo</label>
        <input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="campo" style={{ flex: '1 1 160px' }}>
          <label>Telefono</label>
          <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div className="campo" style={{ flex: '1 1 200px' }}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="campo" style={{ flex: '1 1 160px' }}>
          <label>Partita IVA</label>
          <input inputMode="numeric" value={partitaIva} onChange={(e) => setPartitaIva(e.target.value)} />
        </div>
        <div className="campo" style={{ flex: '1 1 160px' }}>
          <label>Codice fiscale</label>
          <input value={codiceFiscale} onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="campo" style={{ flex: '1 1 200px' }}>
          <label>PEC</label>
          <input type="email" value={pec} onChange={(e) => setPec(e.target.value)} />
        </div>
        <div className="campo" style={{ flex: '1 1 140px' }}>
          <label>Codice SDI</label>
          <input value={sdi} onChange={(e) => setSdi(e.target.value.toUpperCase())} maxLength={7} />
        </div>
      </div>
      <div className="campo">
        <label>Note</label>
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
            await onSalva({
              nome: nome.trim(),
              telefono,
              email,
              indirizzo,
              partitaIva: partitaIva.trim(),
              codiceFiscale: codiceFiscale.trim(),
              pec: pec.trim(),
              sdi: sdi.trim(),
              note
            });
            onChiudi();
          }}
        >
          Salva
        </button>
      </div>
    </Modale>
  );
}

/** Selettore cliente dall'anagrafica, con creazione rapida inline */
export function SelettoreCliente({
  onChiudi,
  onScegli
}: {
  onChiudi: () => void;
  onScegli: (cliente: Cliente | null) => void;
}) {
  const [ricerca, setRicerca] = useState('');
  const [nuovo, setNuovo] = useState(false);
  const clienti = useLiveQuery(async () => {
    const tutti = await db.clienti.toArray();
    return tutti.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  }, []);

  const filtrati = (clienti ?? []).filter(
    (c) => !ricerca.trim() || c.nome.toLowerCase().includes(ricerca.trim().toLowerCase())
  );

  return (
    <>
      <Modale titolo="Collega cliente" onChiudi={onChiudi}>
        <div className="campo">
          <input
            type="search"
            placeholder="Cerca…"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
          />
        </div>
        <div className="riga-pulsanti" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={() => setNuovo(true)}>
            ＋ Nuovo cliente
          </button>
          <button
            className="btn"
            onClick={() => {
              onScegli(null);
              onChiudi();
            }}
          >
            Scollega
          </button>
        </div>
        {filtrati.map((c) => (
          <button
            key={c.id}
            className="scheda"
            onClick={() => {
              onScegli(c);
              onChiudi();
            }}
          >
            <span style={{ fontSize: 22 }}>👤</span>
            <span className="corpo">
              <div className="titolo">{c.nome}</div>
              <div className="sotto">{[c.telefono, c.email].filter(Boolean).join(' · ')}</div>
            </span>
          </button>
        ))}
        {filtrati.length === 0 && (
          <p style={{ color: 'var(--testo-2)' }}>Nessun cliente: creane uno nuovo.</p>
        )}
      </Modale>
      {nuovo && (
        <FormCliente
          onChiudi={() => setNuovo(false)}
          onSalva={async (dati) => {
            const c = await creaCliente(dati);
            onScegli(c);
            onChiudi();
          }}
        />
      )}
    </>
  );
}
