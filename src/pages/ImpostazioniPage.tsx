import { useEffect, useRef, useState } from 'react';
import type { ConfigCloud, Fiscale, Impostazioni, Unita } from '../db/types';
import { nomeRegime } from '../fiscale/calcolo';
import { accediCloud, disconnettiCloud } from '../cloud/supabaseBackup';
import { sincronizza } from '../cloud/sincronizzazione';
import { formattaDataOra } from '../utils/format';
import {
  leggiImpostazioni,
  salvaImpostazioni,
  statoStorage,
  type StatoStorage
} from '../db/repository';
import { esportaBackup, importaBackup, type Avanzamento } from '../db/backup';
import { naviga } from '../router';
import { StatoApp } from '../components/comuni';
import { mostraToast } from '../state/toast';
import { formattaByte } from '../utils/format';
import { scaricaBlob } from '../utils/share';
import { aggiornaApp } from '../utils/aggiornaApp';

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
        <label className="fisc-check campo">
          <input
            type="checkbox"
            checked={imp.censuraVoltiAuto !== false}
            onChange={(e) => aggiorna({ censuraVoltiAuto: e.target.checked })}
          />
          Oscura automaticamente i volti nelle foto (privacy)
        </label>
        <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: -4 }}>
          I volti vengono cercati sul dispositivo (nessun invio a servizi esterni) e oscurati
          nell’editor, nelle miniature, nel PDF e nelle immagini condivise. La foto originale non
          viene modificata: puoi togliere o aggiungere riquadri dall’editor, con «Volti». Nessun
          rilevamento è infallibile: controlla sempre le foto prima di consegnare un report.
        </span>
        {imp.censuraVoltiAuto !== false && (
          <>
            <label className="fisc-check campo" style={{ marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={imp.censuraVoltiPermanente === true}
                onChange={(e) => aggiorna({ censuraVoltiPermanente: e.target.checked })}
              />
              Oscuramento definitivo già all’importazione
            </label>
            <span style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: -4, marginLeft: 16 }}>
              Più severo: i volti vengono cancellati dai pixel archiviati, quindi non restano sul
              dispositivo e non finiscono in backup o sincronizzazione.{' '}
              <strong>Non è reversibile</strong> e non lascia riquadri da rivedere: se il
              rilevamento sbaglia, quella parte di foto è persa. Con l’interruttore spento puoi
              comunque rendere definitivo l’oscuramento foto per foto, dall’editor, dopo averlo
              verificato.
            </span>
          </>
        )}

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

        <h2>Versione dell’app</h2>
        <p style={{ color: 'var(--testo-2)' }}>
          Build <strong>{__BUILD__}</strong> (UTC). È la data della versione che sta girando su
          questo dispositivo: se non corrisponde all’ultima pubblicata, l’app installata sta
          ancora servendo la copia che ha in cache.
        </p>
        <div className="riga-pulsanti">
          <button
            className="btn primario"
            disabled={operazione !== null}
            onClick={() => {
              setOperazione('Aggiornamento in corso…');
              void aggiornaApp();
            }}
          >
            🔄 Aggiorna all’ultima versione
          </button>
        </div>
        <p style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 8 }}>
          Butta la copia in cache e ricarica dalla rete. <strong>I lavori non si toccano</strong>:
          progetti, foto e piani di taglio stanno nel database del dispositivo, non nella cache.
          Serve la rete attiva.
        </p>

        <p style={{ color: 'var(--testo-2)', fontSize: 13, marginTop: 30 }}>
          Sopralluoghi — applicazione offline-first. I dati restano sul dispositivo; il backup su
          file e il backup cloud sono le copie di sicurezza esterne.
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
  const [progresso, setProgresso] = useState<number | null>(null);

  const connesso = Boolean(cloud?.refreshToken);

  // aggiorna testo e barra di avanzamento delle operazioni cloud
  const riporta: Avanzamento = (msg, fr) => {
    setOperazione(msg);
    setProgresso(fr ?? null);
  };

  const salvaConfig = () => {
    const nuova: ConfigCloud = {
      url: url.trim(),
      anonKey: anonKey.trim(),
      email: email.trim(),
      refreshToken: cloud?.refreshToken ?? null,
      userId: cloud?.userId ?? null,
      ultimoBackup: cloud?.ultimoBackup ?? null,
      ultimaSync: cloud?.ultimaSync ?? null
    };
    aggiorna({ cloud: nuova });
  };

  const sincronizzaOra = async () => {
    setOperazione('Sincronizzazione in corso…');
    setProgresso(0);
    try {
      const r = await sincronizza(riporta);
      mostraToast(
        'successo',
        `Sincronizzazione completata. Scaricate ${r.scaricate} foto, caricate ${r.caricate}. ` +
          `In archivio: ${r.progetti} progetti, ${r.fotoCloud} foto sul cloud.`
      );
      ricaricaImpostazioni();
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Sincronizzazione non riuscita.');
    } finally {
      setOperazione(null);
      setProgresso(null);
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

  return (
    <>
      <p style={{ color: 'var(--testo-2)' }}>
        Sincronizzazione tra i tuoi dispositivi su un progetto Supabase gratuito. Setup una tantum:
        crea il progetto su supabase.com, un utente (Authentication), un bucket privato chiamato
        «backup» con le policy per gli utenti autenticati, poi incolla qui URL e chiave anon. Usa lo
        stesso account su ogni dispositivo per sincronizzare.
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
              {cloud?.ultimaSync
                ? `Ultima sincronizzazione: ${formattaDataOra(cloud.ultimaSync)}.`
                : 'Mai sincronizzato.'}
            </span>
          </p>
          <p className="sotto" style={{ color: 'var(--testo-2)', marginTop: -4 }}>
            La sincronizzazione è incrementale: carica solo le foto nuove e scarica quelle che
            mancano su questo dispositivo. Si avvia con «Sincronizza adesso» e dal promemoria di
            fine sessione; usa lo stesso account su tutti i dispositivi.
          </p>
          <div className="riga-pulsanti">
            <button className="btn primario" disabled={operazione !== null} onClick={() => void sincronizzaOra()}>
              🔄 Sincronizza adesso
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
        </>
      )}
      {operazione && (
        <div style={{ marginTop: 10 }}>
          <p style={{ color: 'var(--testo-2)', margin: '0 0 6px' }}>
            {operazione}
            {progresso != null ? ` ${Math.round(progresso * 100)}%` : ''}
          </p>
          {progresso != null && (
            <div className="barra-avanzamento">
              <div className="riempimento" style={{ width: `${Math.round(progresso * 100)}%` }} />
            </div>
          )}
        </div>
      )}
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
