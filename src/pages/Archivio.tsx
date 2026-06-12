import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Cartella, Progetto } from '../db/types';
import {
  contenutoCartella,
  creaCartella,
  creaProgetto,
  duplicaProgetto,
  eliminaCartella,
  eliminaProgetto,
  rinominaCartella,
  spostaCartella,
  spostaProgetto
} from '../db/repository';
import { naviga } from '../router';
import {
  ConfermaDialog,
  MenuContesto,
  Modale,
  StatoApp,
  type RichiestaConferma,
  type VoceMenu
} from '../components/comuni';
import { mostraToast } from '../state/toast';
import { formattaData } from '../utils/format';

export function Archivio({ cartellaId }: { cartellaId: string | null }) {
  const [ricerca, setRicerca] = useState('');
  const [nuovaCartella, setNuovaCartella] = useState(false);
  const [nuovoProgetto, setNuovoProgetto] = useState(false);
  const [rinomina, setRinomina] = useState<Cartella | null>(null);
  const [daSpostare, setDaSpostare] = useState<
    { tipo: 'cartella'; id: string } | { tipo: 'progetto'; id: string } | null
  >(null);
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);
  const [menu, setMenu] = useState<{ pos: { x: number; y: number }; voci: VoceMenu[] } | null>(null);

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

  const apriMenuCartella = (c: Cartella, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      voci: [
        { testo: 'Rinomina', onClick: () => setRinomina(c) },
        { testo: 'Sposta…', onClick: () => setDaSpostare({ tipo: 'cartella', id: c.id }) },
        {
          testo: 'Elimina…',
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

  const apriMenuProgetto = (p: Progetto, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({
      pos: { x: e.clientX, y: e.clientY },
      voci: [
        { testo: 'Sposta…', onClick: () => setDaSpostare({ tipo: 'progetto', id: p.id }) },
        {
          testo: 'Duplica come modello',
          onClick: async () => {
            await duplicaProgetto(p.id);
            mostraToast('successo', 'Progetto duplicato.');
          }
        },
        {
          testo: 'Elimina…',
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
    <div className="app">
      <header className="barra">
        <h1>{corrente ? corrente.nome : 'Sopralluoghi'}</h1>
        <StatoApp />
        <button className="btn icona" aria-label="Clienti" onClick={() => naviga({ nome: 'clienti' })}>
          👥
        </button>
        <button
          className="btn icona"
          aria-label="Impostazioni"
          onClick={() => naviga({ nome: 'impostazioni' })}
        >
          ⚙️
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
                📁 Nuova cartella
              </button>
              <button className="btn primario" onClick={() => setNuovoProgetto(true)}>
                ＋ Nuovo progetto
              </button>
            </div>

            {(cartelle ?? []).map((c) => (
              <button
                key={c.id}
                className="scheda"
                onClick={() => naviga({ nome: 'archivio', cartellaId: c.id })}
              >
                <span style={{ fontSize: 26 }}>📁</span>
                <span className="corpo">
                  <div className="titolo">{c.nome}</div>
                </span>
                <span
                  className="btn icona"
                  role="button"
                  aria-label={`Azioni cartella ${c.nome}`}
                  onClick={(e) => apriMenuCartella(c, e)}
                >
                  ⋮
                </span>
              </button>
            ))}

            {(progetti ?? []).map((p) => (
              <button
                key={p.id}
                className="scheda"
                onClick={() => naviga({ nome: 'progetto', id: p.id })}
              >
                <span style={{ fontSize: 26 }}>📋</span>
                <span className="corpo">
                  <div className="titolo">{p.nome}</div>
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
                  ⋮
                </span>
              </button>
            ))}

            {cartelle?.length === 0 && progetti?.length === 0 && (
              <div className="vuoto">
                <div className="grande">🗂️</div>
                <p>Nessun contenuto. Crea un progetto per iniziare il sopralluogo.</p>
              </div>
            )}
          </>
        )}
      </main>

      {nuovaCartella && (
        <FormNome
          titolo="Nuova cartella"
          onChiudi={() => setNuovaCartella(false)}
          onSalva={async (nome) => {
            await creaCartella(nome, cartellaId);
          }}
        />
      )}
      {rinomina && (
        <FormNome
          titolo="Rinomina cartella"
          iniziale={rinomina.nome}
          onChiudi={() => setRinomina(null)}
          onSalva={async (nome) => {
            await rinominaCartella(rinomina.id, nome);
          }}
        />
      )}
      {nuovoProgetto && (
        <FormProgetto cartellaId={cartellaId} onChiudi={() => setNuovoProgetto(false)} />
      )}
      {daSpostare && (
        <SelettoreCartella
          escludiCartellaId={daSpostare.tipo === 'cartella' ? daSpostare.id : undefined}
          onChiudi={() => setDaSpostare(null)}
          onScegli={async (destinazione) => {
            try {
              if (daSpostare.tipo === 'cartella') await spostaCartella(daSpostare.id, destinazione);
              else await spostaProgetto(daSpostare.id, destinazione);
              mostraToast('successo', 'Spostato.');
            } catch (e) {
              mostraToast('errore', e instanceof Error ? e.message : 'Spostamento non riuscito.');
            }
          }}
        />
      )}
      <ConfermaDialog richiesta={conferma} onChiudi={() => setConferma(null)} />
      {menu && <MenuContesto posizione={menu.pos} voci={menu.voci} onChiudi={() => setMenu(null)} />}
    </div>
  );
}

export function EtichettaStato({ stato }: { stato: Progetto['stato'] }) {
  const testo = stato === 'bozza' ? 'Bozza' : stato === 'in_corso' ? 'In corso' : 'Completato';
  return <span className={`badge ${stato}`}>{testo}</span>;
}

function FormNome({
  titolo,
  iniziale,
  onChiudi,
  onSalva
}: {
  titolo: string;
  iniziale?: string;
  onChiudi: () => void;
  onSalva: (nome: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(iniziale ?? '');
  return (
    <Modale titolo={titolo} onChiudi={onChiudi} centro>
      <div className="campo">
        <label>Nome</label>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn primario"
          disabled={!nome.trim()}
          onClick={async () => {
            await onSalva(nome);
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
  onChiudi,
  onScegli
}: {
  escludiCartellaId?: string;
  onChiudi: () => void;
  onScegli: (cartellaId: string | null) => Promise<void> | void;
}) {
  const cartelle = useLiveQuery(() => db.cartelle.toArray(), []);
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
    const righe: Array<{ c: Cartella; livello: number }> = [];
    const aggiungi = (parentId: string | null, livello: number) => {
      cartelle
        .filter((c) => c.parentId === parentId && !escluse.has(c.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
        .forEach((c) => {
          righe.push({ c, livello });
          aggiungi(c.id, livello + 1);
        });
    };
    aggiungi(null, 0);
    return righe;
  }, [cartelle, escludiCartellaId]);

  const scegli = async (id: string | null) => {
    await onScegli(id);
    onChiudi();
  };

  return (
    <Modale titolo="Sposta in…" onChiudi={onChiudi}>
      <button className="scheda" onClick={() => scegli(null)}>
        <span style={{ fontSize: 22 }}>🗂️</span>
        <span className="corpo">
          <div className="titolo">Archivio (radice)</div>
        </span>
      </button>
      {albero.map(({ c, livello }) => (
        <button
          key={c.id}
          className="scheda"
          style={{ marginLeft: livello * 18 }}
          onClick={() => scegli(c.id)}
        >
          <span style={{ fontSize: 22 }}>📁</span>
          <span className="corpo">
            <div className="titolo">{c.nome}</div>
          </span>
        </button>
      ))}
    </Modale>
  );
}

/** Ricerca testuale su progetti, foto, clienti e preventivi */
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
          <span style={{ fontSize: 26 }}>👤</span>
          <span className="corpo">
            <div className="titolo">{c.nome}</div>
            <div className="sotto">{[c.telefono, c.email].filter(Boolean).join(' · ')}</div>
          </span>
        </button>
      ))}
      {preventiviTrovati.map((p) => (
        <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'preventivo', id: p.id })}>
          <span style={{ fontSize: 26 }}>💶</span>
          <span className="corpo">
            <div className="titolo">Preventivo {p.numero}</div>
            <div className="sotto">{formattaData(p.data)} · {p.voci.length} voci</div>
          </span>
        </button>
      ))}
      {progettiTrovati.map((p) => (
        <button key={p.id} className="scheda" onClick={() => naviga({ nome: 'progetto', id: p.id })}>
          <span style={{ fontSize: 26 }}>📋</span>
          <span className="corpo">
            <div className="titolo">{p.nome}</div>
            <div className="sotto">{[p.cliente, p.luogo].filter(Boolean).join(' — ')}</div>
          </span>
          <EtichettaStato stato={p.stato} />
        </button>
      ))}
      {fotoTrovate.map((f) => (
        <button key={f.id} className="scheda" onClick={() => naviga({ nome: 'foto', id: f.id })}>
          <span style={{ fontSize: 26 }}>🖼️</span>
          <span className="corpo">
            <div className="titolo">{f.didascalia || 'Foto senza didascalia'}</div>
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
