import { useEffect, useRef, useState } from 'react';
import type { ConfigCloud, Fiscale, Impostazioni, Unita } from '../db/types';
import { nomeRegime } from '../fiscale/calcolo';
import {
  accediCloud,
  backupSuCloud,
  disconnettiCloud,
  elencaBackupCloud,
  ripristinaDaCloud,
  type FileCloud
} from '../cloud/supabaseBackup';
import { avviaPianificatoreSync, sincronizzaGiornaliera } from '../cloud/sincronizzazione';
import { formattaDataOra } from '../utils/format';
import {
  leggiImpostazioni,
  salvaImpostazioni,
  statoStorage,
  type StatoStorage
} from '../db/repository';
import { esportaBackup, importaBackup } from '../db/backup';
import { naviga } from '../router';
import { StatoApp } from '../components/comuni';
import { mostraToast } from '../state/toast';
import { formattaByte } from '../utils/format';
import { scaricaBlob } from '../utils/share';

export function ImpostazioniPage() {
  const [imp, setImp] = useState<Impostazioni | null>(null);
  const [storage, setStorage] = useState<StatoStorage | null>(null);
  const [operazione, setOperazione] = useState<string | null>(null);
  const inputRestore = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void leggiImpostazioni().then(setImp);
    void statoStorage().then(setStorage);
  }, []);

  if (!imp) return <div className="app" />;

  const aggiorna = (modifiche: Partial<Impostazioni>) => {
    const nuove = { ...imp, ...modifiche };
    setImp(nuove);
    void salvaImpostazioni(nuove);
  };

  const aggiornaProf = (campo: keyof Impostazioni['professionista'], valore: string) => {
    aggiorna({ professionista: { ...imp.professionista, [campo]: valore } });
  };

  const backup = async () => {
    setOperazione('Preparazione backup…');
    try {
      const blob = await esportaBackup(setOperazione);
      const data = new Date().toISOString().slice(0, 10);
      scaricaBlob(blob, `sopralluoghi_backup_${data}.zip`);
      mostraToast('successo', 'Backup esportato. Conservalo in un luogo sicuro.');
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Backup non riuscito.');
    } finally {
      setOperazione(null);
    }
  };

  const ripristina = async (file: File | undefined) => {
    if (!file) return;
    if (
      !window.confirm(
        'Il ripristino unisce il contenuto del backup all’archivio attuale (gli elementi con lo stesso id vengono sovrascritti). Continuare?'
      )
    ) {
      return;
    }
    setOperazione('Ripristino in corso…');
    try {
      const esito = await importaBackup(file, setOperazione);
      mostraToast(
        'successo',
        `Ripristino completato: ${esito.progetti} progetti, ${esito.foto} foto, ${esito.annotazioni} annotazioni.`
      );
      void statoStorage().then(setStorage);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Ripristino non riuscito.');
    } finally {
      setOperazione(null);
      if (inputRestore.current) inputRestore.current.value = '';
    }
  };

  return (
    <div className="app">
      <header className="barra">
        <button className="btn icona" aria-label="Indietro" onClick={() => naviga({ nome: 'archivio', cartellaId: null })}>
          ←
        </button>
        <h1>Impostazioni</h1>
        <StatoApp />
      </header>
      <main className="contenuto">
        <h2>Dati professionali (copertina del PDF)</h2>
        <div className="campo">
          <label>Nome e cognome</label>
          <input value={imp.professionista.nome} onChange={(e) => aggiornaProf('nome', e.target.value)} />
        </div>
        <div className="campo">
          <label>Azienda</label>
          <input value={imp.professionista.azienda} onChange={(e) => aggiornaProf('azienda', e.target.value)} />
        </div>
        <div className="campo">
          <label>Telefono</label>
          <input value={imp.professionista.telefono} onChange={(e) => aggiornaProf('telefono', e.target.value)} />
        </div>
        <div className="campo">
          <label>Email</label>
          <input value={imp.professionista.email} onChange={(e) => aggiornaProf('email', e.target.value)} />
        </div>
        <div className="campo">
          <label>Indirizzo</label>
          <input value={imp.professionista.indirizzo} onChange={(e) => aggiornaProf('indirizzo', e.target.value)} />
        </div>

        <h2>Quotatura</h2>
        <div className="campo">
          <label>Soglia di auto-aggancio / snap (pixel immagine)</label>
          <input
            type="number"
            min={4}
            max={100}
            value={imp.sogliaSnap}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 4 && v <= 100) aggiorna({ sogliaSnap: v });
            }}
          />
        </div>
        <div className="campo">
          <label>Dimensione di quote e testi sulle nuove annotazioni</label>
          <select
            value={String(imp.fattoreDimensione)}
            onChange={(e) => aggiorna({ fattoreDimensione: Number(e.target.value) })}
          >
            <option value="0.7">Piccola</option>
            <option value="1">Media</option>
            <option value="1.4">Grande</option>
            <option value="1.8">Molto grande</option>
          </select>
        </div>
        <div className="campo">
          <label>Unità predefinita</label>
          <select value={imp.unitaDefault} onChange={(e) => aggiorna({ unitaDefault: e.target.value as Unita })}>
            <option value="mm">millimetri</option>
            <option value="cm">centimetri</option>
            <option value="m">metri</option>
          </select>
        </div>
        <div className="campo">
          <label>Colore predefinito delle annotazioni</label>
          <input
            type="color"
            value={imp.stileDefault.colore}
            onChange={(e) => aggiorna({ stileDefault: { ...imp.stileDefault, colore: e.target.value } })}
            style={{ height: 48, padding: 4 }}
          />
        </div>

        <h2>Foto</h2>
        <div className="campo">
          <label>Risoluzione delle foto archiviate (lato massimo)</label>
          <select
            value={String(imp.fotoLatoMax)}
            onChange={(e) => aggiorna({ fotoLatoMax: Number(e.target.value) })}
          >
            <option value="1600">1600 px — leggera (più foto in meno spazio)</option>
            <option value="2560">2560 px — consigliata</option>
            <option value="3200">3200 px — massima (occupa più spazio)</option>
          </select>
        </div>

        <h2>Report PDF</h2>
        <div className="campo">
          <label>Colore di titoli e intestazioni</label>
          <input
            type="color"
            value={imp.pdf.colore}
            onChange={(e) => aggiorna({ pdf: { ...imp.pdf, colore: e.target.value } })}
            style={{ height: 48, padding: 4 }}
          />
        </div>
        <div className="campo">
          <label>Piè di pagina personalizzato (vuoto = nome azienda)</label>
          <input
            value={imp.pdf.pieDiPagina}
            onChange={(e) => aggiorna({ pdf: { ...imp.pdf, pieDiPagina: e.target.value } })}
            placeholder="es. P.IVA 01234567890 — www.esempio.it"
          />
        </div>
        <div className="campo">
          <label>Dati sotto ogni foto</label>
          <span className="segmenti" role="group">
            <button
              className={imp.pdf.mostraDataScatto ? 'attivo' : ''}
              onClick={() => aggiorna({ pdf: { ...imp.pdf, mostraDataScatto: !imp.pdf.mostraDataScatto } })}
            >
              📅 Data scatto
            </button>
            <button
              className={imp.pdf.mostraGeotag ? 'attivo' : ''}
              onClick={() => aggiorna({ pdf: { ...imp.pdf, mostraGeotag: !imp.pdf.mostraGeotag } })}
            >
              📍 Geotag
            </button>
          </span>
        </div>

        <h2>Regime fiscale e preventivi</h2>
        <SezioneFiscale imp={imp} aggiorna={aggiorna} />

        <h2>Backup e sicurezza dei dati</h2>
        <p style={{ color: 'var(--testo-2)' }}>
          Il backup locale contiene tutto l'archivio (progetti, foto originali e annotazioni) in un
          unico file. Esegui backup regolari e conservali fuori dal dispositivo.
        </p>
        <div className="riga-pulsanti">
          <button className="btn primario" disabled={operazione !== null} onClick={() => void backup()}>
            ⬇️ Esporta backup
          </button>
          <button className="btn" disabled={operazione !== null} onClick={() => inputRestore.current?.click()}>
            ⬆️ Ripristina da file
          </button>
        </div>
        <input
          ref={inputRestore}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => void ripristina(e.target.files?.[0])}
        />
        {operazione && <p style={{ color: 'var(--testo-2)', marginTop: 10 }}>{operazione}</p>}

        <h2>Backup cloud (Supabase)</h2>
        <SezioneCloud imp={imp} aggiorna={aggiorna} ricaricaImpostazioni={() => void leggiImpostazioni().then(setImp)} />

        <h2>Spazio di archiviazione</h2>
        {storage ? (
          <p style={{ color: storage.percentuale > 80 ? 'var(--pericolo)' : 'var(--testo-2)' }}>
            In uso: {formattaByte(storage.usatoByte)} di {formattaByte(storage.quotaByte)} (
            {storage.percentuale.toFixed(1)}%).{' '}
            {storage.persistente
              ? 'Archiviazione persistente attiva: il browser non eliminerà i dati automaticamente.'
              : 'Archiviazione persistente NON garantita dal browser: esegui backup frequenti.'}
          </p>
        ) : (
          <p style={{ color: 'var(--testo-2)' }}>Informazioni sullo spazio non disponibili.</p>
        )}

        <p style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 30 }}>
          Sopralluoghi — applicazione offline-first. I dati restano sul dispositivo; il backup su
          file e il backup cloud sono le copie di sicurezza esterne.
          <br />
          Versione 0.21.2 — build {__BUILD__} (UTC). Se hai appena aggiornato e la data non
          corrisponde, chiudi e riapri l'app con la rete attiva.
        </p>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backup cloud: stato sempre visibile, accesso, backup e ripristino.
// Offline-first: il cloud è solo una copia di sicurezza, mai un requisito.
// ---------------------------------------------------------------------------

function SezioneCloud({
  imp,
  aggiorna,
  ricaricaImpostazioni
}: {
  imp: Impostazioni;
  aggiorna: (m: Partial<Impostazioni>) => void;
  ricaricaImpostazioni: () => void;
}) {
  const cloud = imp.cloud ?? null;
  const [url, setUrl] = useState(cloud?.url ?? '');
  const [anonKey, setAnonKey] = useState(cloud?.anonKey ?? '');
  const [email, setEmail] = useState(cloud?.email ?? '');
  const [password, setPassword] = useState('');
  const [operazione, setOperazione] = useState<string | null>(null);
  const [lista, setLista] = useState<FileCloud[] | null>(null);

  const connesso = Boolean(cloud?.refreshToken);

  const salvaConfig = () => {
    const nuova: ConfigCloud = {
      url: url.trim(),
      anonKey: anonKey.trim(),
      email: email.trim(),
      refreshToken: cloud?.refreshToken ?? null,
      userId: cloud?.userId ?? null,
      ultimoBackup: cloud?.ultimoBackup ?? null,
      sincronizzaAuto: cloud?.sincronizzaAuto ?? false,
      oraSync: cloud?.oraSync ?? 2,
      ultimaSync: cloud?.ultimaSync ?? null
    };
    aggiorna({ cloud: nuova });
  };

  /** Aggiorna i campi della sync notturna e riprogramma il pianificatore. */
  const impostaSync = async (modifica: Partial<ConfigCloud>) => {
    if (!cloud) return;
    await salvaImpostazioni({ ...imp, cloud: { ...cloud, ...modifica } });
    ricaricaImpostazioni();
    avviaPianificatoreSync();
  };

  const sincronizzaOra = async () => {
    setOperazione('Sincronizzazione in corso…');
    try {
      const r = await sincronizzaGiornaliera(setOperazione);
      const dett = r.importato
        ? `Unite dal cloud ${r.importato.progetti} progetti e ${r.importato.foto} foto (${r.filesCloud} backup presenti).`
        : `Nessun backup remoto da unire: caricato il primo (${r.filesCloud} presenti).`;
      mostraToast('successo', `Sincronizzazione completata. ${dett}`);
      ricaricaImpostazioni();
      setLista(null);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Sincronizzazione non riuscita.');
    } finally {
      setOperazione(null);
    }
  };

  const accedi = async () => {
    salvaConfig();
    setOperazione('Accesso al cloud…');
    try {
      await accediCloud(email.trim(), password);
      setPassword('');
      mostraToast('successo', 'Accesso al cloud riuscito.');
      ricaricaImpostazioni();
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Accesso non riuscito.');
    } finally {
      setOperazione(null);
    }
  };

  const backupCloud = async () => {
    setOperazione('Backup sul cloud…');
    try {
      const nome = await backupSuCloud(setOperazione);
      mostraToast('successo', `Backup caricato sul cloud: ${nome}`);
      ricaricaImpostazioni();
      setLista(null);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Backup cloud non riuscito.');
    } finally {
      setOperazione(null);
    }
  };

  const mostraElenco = async () => {
    setOperazione('Lettura elenco backup…');
    try {
      setLista(await elencaBackupCloud());
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Elenco non disponibile.');
    } finally {
      setOperazione(null);
    }
  };

  const ripristina = async (nome: string) => {
    if (
      !window.confirm(
        `Ripristinare "${nome}" dal cloud? Il contenuto verrà unito all'archivio attuale (gli elementi con lo stesso id vengono sovrascritti).`
      )
    ) {
      return;
    }
    setOperazione('Ripristino dal cloud…');
    try {
      const esito = await ripristinaDaCloud(nome, setOperazione);
      mostraToast(
        'successo',
        `Ripristino completato: ${esito.progetti} progetti, ${esito.foto} foto.`
      );
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Ripristino non riuscito.');
    } finally {
      setOperazione(null);
    }
  };

  return (
    <>
      <p style={{ color: 'var(--testo-2)' }}>
        Backup e sincronizzazione tra i tuoi dispositivi su un progetto Supabase gratuito. Setup
        una tantum: crea il progetto su supabase.com, un utente (Authentication), un bucket privato
        chiamato «backup» con le policy per gli utenti autenticati, poi incolla qui URL e chiave
        anon. Usa lo stesso account su ogni dispositivo per sincronizzare.
      </p>
      <div className="campo">
        <label>URL del progetto (https://xxx.supabase.co)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={salvaConfig} inputMode="url" />
      </div>
      <div className="campo">
        <label>Chiave anon (public)</label>
        <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} onBlur={salvaConfig} />
      </div>
      {!connesso ? (
        <>
          <div className="campo">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="campo">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="riga-pulsanti">
            <button
              className="btn primario"
              disabled={operazione !== null || !url.trim() || !anonKey.trim() || !email.trim() || !password}
              onClick={() => void accedi()}
            >
              🔐 Accedi al cloud
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontWeight: 700 }}>
            ✅ Connesso come {cloud?.email}.{' '}
            <span style={{ color: 'var(--testo-2)', fontWeight: 400 }}>
              {cloud?.ultimoBackup
                ? `Ultimo backup cloud: ${formattaDataOra(cloud.ultimoBackup)}.`
                : 'Nessun backup cloud ancora eseguito.'}
            </span>
          </p>
          <div className="riga-pulsanti">
            <button className="btn primario" disabled={operazione !== null} onClick={() => void backupCloud()}>
              ☁️ Backup adesso
            </button>
            <button className="btn" disabled={operazione !== null} onClick={() => void mostraElenco()}>
              📋 Elenco backup
            </button>
            <button
              className="btn"
              disabled={operazione !== null}
              onClick={() => {
                void disconnettiCloud().then(ricaricaImpostazioni);
              }}
            >
              Disconnetti
            </button>
          </div>

          <div className="scheda" style={{ cursor: 'default', alignItems: 'flex-start', marginTop: 12 }}>
            <span className="corpo">
              <div className="titolo" style={{ fontSize: 16 }}>Sincronizzazione tra dispositivi</div>
              <div className="sotto" style={{ marginBottom: 10 }}>
                Una volta al giorno l'app scarica e unisce lo stato del cloud, poi ripubblica
                l'archivio aggiornato: i dispositivi convergono sugli stessi dati. La sync parte
                all'ora prevista se l'app è aperta, altrimenti alla prima apertura successiva
                (su iPhone un'app chiusa non può girare di notte).
              </div>
              <label className="fisc-check">
                <input
                  type="checkbox"
                  checked={!!cloud?.sincronizzaAuto}
                  disabled={operazione !== null}
                  onChange={(e) => void impostaSync({ sincronizzaAuto: e.target.checked })}
                />
                Sincronizza automaticamente ogni notte
              </label>
              {cloud?.sincronizzaAuto && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <label htmlFor="ora-sync" style={{ color: 'var(--testo-2)' }}>Ora:</label>
                  <select
                    id="ora-sync"
                    value={cloud?.oraSync ?? 2}
                    disabled={operazione !== null}
                    onChange={(e) => void impostaSync({ oraSync: Number(e.target.value) })}
                    style={{ width: 'auto', minWidth: 90 }}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sotto" style={{ marginTop: 8 }}>
                {cloud?.ultimaSync
                  ? `Ultima sincronizzazione: ${formattaDataOra(cloud.ultimaSync)}.`
                  : 'Mai sincronizzato.'}
              </div>
              <div className="riga-pulsanti" style={{ marginTop: 10 }}>
                <button className="btn" disabled={operazione !== null} onClick={() => void sincronizzaOra()}>
                  🔄 Sincronizza adesso
                </button>
              </div>
            </span>
          </div>
          {lista && (
            <div style={{ marginTop: 12 }}>
              {lista.length === 0 && <p style={{ color: 'var(--testo-2)' }}>Nessun backup sul cloud.</p>}
              {lista.map((f) => (
                <div key={f.name} className="scheda" style={{ cursor: 'default' }}>
                  <span className="corpo">
                    <div className="titolo" style={{ fontSize: 15 }}>{f.name}</div>
                    <div className="sotto">
                      {f.size !== null ? formattaByte(f.size) : ''}{' '}
                      {f.updatedAt ? `· ${formattaDataOra(new Date(f.updatedAt).getTime())}` : ''}
                    </div>
                  </span>
                  <button className="btn" disabled={operazione !== null} onClick={() => void ripristina(f.name)}>
                    Ripristina
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {operazione && <p style={{ color: 'var(--testo-2)' }}>{operazione}</p>}
    </>
  );
}

function SezioneFiscale({ imp, aggiorna }: { imp: Impostazioni; aggiorna: (m: Partial<Impostazioni>) => void }) {
  const f = imp.fiscale;
  const set = (m: Partial<Fiscale>) => aggiorna({ fiscale: { ...f, ...m }, ivaDefault: m.ivaDefault ?? imp.ivaDefault });
  const num = (v: string, fallback: number) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };
  const conIva = f.regime !== 'forfettario';
  return (
    <>
      <div className="campo">
        <label>Regime fiscale</label>
        <span className="segmenti" role="group">
          {(['forfettario', 'semplificato', 'ordinario'] as const).map((r) => (
            <button key={r} className={f.regime === r ? 'attivo' : ''} onClick={() => set({ regime: r })}>
              {nomeRegime(r)}
            </button>
          ))}
        </span>
        <p className="aiuto">Determina la struttura del preventivo e del PDF (con o senza IVA, ritenuta, ecc.).</p>
      </div>

      {conIva && (
        <>
          <div className="campo">
            <label>IVA predefinita (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={f.ivaDefault}
              onChange={(e) => set({ ivaDefault: num(e.target.value, f.ivaDefault) })}
            />
          </div>
          <div className="campo">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={f.ritenutaAttiva}
                onChange={() => set({ ritenutaAttiva: !f.ritenutaAttiva })}
              />
              Ritenuta d’acconto attiva di default
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={f.ritenutaPercento}
              onChange={(e) => set({ ritenutaPercento: num(e.target.value, f.ritenutaPercento) })}
              style={{ width: 120 }}
            />
            <span className="aiuto">Percentuale ritenuta (es. 20%).</span>
          </div>
          <div className="campo">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={f.cassaAttiva} onChange={() => set({ cassaAttiva: !f.cassaAttiva })} />
              Cassa previdenziale / rivalsa attiva di default
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={f.cassaPercento}
              onChange={(e) => set({ cassaPercento: num(e.target.value, f.cassaPercento) })}
              style={{ width: 120 }}
            />
            <span className="aiuto">Percentuale cassa/contributo (es. 4%); di norma concorre alla base IVA.</span>
          </div>
        </>
      )}

      <div className="campo">
        <label>Marca da bollo</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            min={0}
            step="0.01"
            value={f.bolloImporto}
            onChange={(e) => set({ bolloImporto: num(e.target.value, f.bolloImporto) })}
            style={{ width: 110 }}
            aria-label="Importo bollo in euro"
          />
          <span className="aiuto">€ importo</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={f.bolloSoglia}
            onChange={(e) => set({ bolloSoglia: num(e.target.value, f.bolloSoglia) })}
            style={{ width: 120 }}
            aria-label="Soglia bollo in euro"
          />
          <span className="aiuto">€ soglia</span>
        </div>
        <p className="aiuto">Suggerita oltre la soglia sui documenti senza IVA (di norma € 77,47 → € 2,00).</p>
      </div>

      {f.regime === 'forfettario' && (
        <>
          <div className="campo">
            <label>Coefficiente di redditività (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={f.coefficienteForfettario}
              onChange={(e) => set({ coefficienteForfettario: num(e.target.value, f.coefficienteForfettario) })}
              style={{ width: 120 }}
            />
            <p className="aiuto">Collegato al codice ATECO/attività; uso indicativo nel preventivo.</p>
          </div>
          <div className="campo">
            <label>Dicitura fiscale forfettario (stampata nel PDF)</label>
            <textarea
              value={f.dicituraForfettario}
              rows={3}
              onChange={(e) => set({ dicituraForfettario: e.target.value })}
            />
          </div>
        </>
      )}
    </>
  );
}
