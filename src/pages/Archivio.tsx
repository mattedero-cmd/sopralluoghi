import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Cartella, Progetto } from '../db/types';
import {
  aggiornaCartella,
  contenutoCartella,
  creaCartella,
  creaProgetto,
  duplicaProgetto,
  eliminaCartella,
  eliminaProgetto,
  spostaCartella,
  spostaProgetto
} from '../db/repository';
import { naviga } from '../router';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
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
import { formattaData } from '../utils/format';
import { Icona } from '../components/Icona';

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
  const [reportCartella, setReportCartella] = useState<Cartella | null>(null);
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
    <div className="app">
      <header className="barra">
        <h1>{corrente ? corrente.nome : 'Sopralluoghi'}</h1>
        <StatoApp />
        <button className="btn icona" aria-label="Clienti" onClick={() => naviga({ nome: 'clienti' })}>
          <Icona nome="persone" />
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
                    {c.nome}
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
                    {p.nome}
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

            {cartelle?.length === 0 && progetti?.length === 0 && (
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
        <FormOpzioniCartella
          cartella={reportCartella}
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

function FormOpzioniCartella({
  cartella,
  onChiudi,
  onGenera,
  onGeneraZip
}: {
  cartella: Cartella;
  onChiudi: () => void;
  onGenera: (opzioni: OpzioniReport) => void;
  onGeneraZip: (opzioni: OpzioniReport) => void;
}) {
  const [fotoPerPagina, setFotoPerPagina] = useState<1 | 2 | 4 | 6>(1);
  const [orizzontale, setOrizzontale] = useState(false);
  const [includiIndice, setIncludiIndice] = useState(true);
  const [includiNoteDato, setIncludiNoteDato] = useState(true);
  const [includiTabellaMisure, setIncludiTabellaMisure] = useState(true);
  const [includiRiepilogo, setIncludiRiepilogo] = useState(true);
  const [includiDistinta, setIncludiDistinta] = useState(true);

  const Riga = ({ attivo, onCommuta, testo }: { attivo: boolean; onCommuta: () => void; testo: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={attivo} onChange={onCommuta} />
      <span>{testo}</span>
    </label>
  );

  return (
    <Modale titolo={`Report — ${cartella.nome}`} onChiudi={onChiudi}>
      <p style={{ color: 'var(--testo-2)', fontSize: 14 }}>
        Il PDF segue la struttura delle cartelle: ogni sottocartella è un capitolo, con nome, note e
        foto della sezione.
      </p>
      <div className="campo">
        <label>Foto per pagina</label>
        <span className="segmenti" role="group">
          {([1, 2, 4, 6] as const).map((n) => (
            <button key={n} className={fotoPerPagina === n ? 'attivo' : ''} onClick={() => setFotoPerPagina(n)}>
              {n}
            </button>
          ))}
        </span>
        <p className="aiuto" style={{ marginTop: 4 }}>
          {fotoPerPagina >= 4
            ? 'Report fotografico a griglia: solo foto e didascalie.'
            : 'Con tabella misure sotto ogni foto.'}
        </p>
      </div>
      <div className="campo">
        <label>Orientamento pagina</label>
        <span className="segmenti" role="group">
          <button className={!orizzontale ? 'attivo' : ''} onClick={() => setOrizzontale(false)}>
            Verticale
          </button>
          <button className={orizzontale ? 'attivo' : ''} onClick={() => setOrizzontale(true)}>
            Orizzontale
          </button>
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Riga attivo={includiIndice} onCommuta={() => setIncludiIndice(!includiIndice)} testo="Indice con numeri di pagina" />
        <Riga attivo={includiNoteDato} onCommuta={() => setIncludiNoteDato(!includiNoteDato)} testo="Note dato delle foto" />
        <Riga attivo={includiTabellaMisure} onCommuta={() => setIncludiTabellaMisure(!includiTabellaMisure)} testo="Tabella misure per ogni foto" />
        <Riga attivo={includiRiepilogo} onCommuta={() => setIncludiRiepilogo(!includiRiepilogo)} testo="Riepilogo finale delle misure" />
        <Riga attivo={includiDistinta} onCommuta={() => setIncludiDistinta(!includiDistinta)} testo="Distinta di taglio (pezzi da produrre)" />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn"
          onClick={() =>
            onGeneraZip({
              fotoIds: null,
              fotoPerPagina,
              orizzontale,
              includiIndice,
              includiRiepilogo,
              includiNoteDato,
              includiTabellaMisure,
              includiDistinta
            })
          }
          title="PDF + foto originali (JPG) nella struttura delle cartelle"
        >
          <Icona nome="archivio" dimensione={19} /> ZIP
        </button>
        <button
          className="btn primario"
          onClick={() =>
            onGenera({
              fotoIds: null,
              fotoPerPagina,
              orizzontale,
              includiIndice,
              includiRiepilogo,
              includiNoteDato,
              includiTabellaMisure,
              includiDistinta
            })
          }
        >
          Genera PDF
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
        <span className="glifo neutro">
          <Icona nome="archivio" dimensione={20} />
        </span>
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
          <span className="glifo neutro">
            <Icona nome="cartella" dimensione={20} />
          </span>
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
          <span className="glifo verde">
            <Icona nome="persona" dimensione={22} />
          </span>
          <span className="corpo">
            <div className="titolo">{c.nome}</div>
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
            <div className="titolo">Preventivo {p.numero}</div>
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
            <div className="titolo">{p.nome}</div>
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
