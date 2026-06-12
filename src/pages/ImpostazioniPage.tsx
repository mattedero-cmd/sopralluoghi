import { useEffect, useRef, useState } from 'react';
import type { Impostazioni, Unita } from '../db/types';
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
          Sopralluoghi — applicazione offline-first. I dati restano sul dispositivo; il file di
          backup è l'unica copia esterna.
          <br />
          Versione 0.2.0 — build {__BUILD__} (UTC). Se hai appena aggiornato e la data non
          corrisponde, chiudi e riapri l'app con la rete attiva.
        </p>
      </main>
    </div>
  );
}
