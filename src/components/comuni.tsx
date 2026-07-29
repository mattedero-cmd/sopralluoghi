import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { toastStore, chiudiToast } from '../state/toast';
import { saveStatusStore } from '../state/saveStatus';
import { Icona, type NomeIcona } from './Icona';

// ---------------------------------------------------------------------------
// Toast (nessun fallimento silenzioso: gli errori sono sempre visibili)
// ---------------------------------------------------------------------------

export function Toasts() {
  const toasts = useStore(toastStore);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tipo}`} onClick={() => chiudiToast(t.id)}>
          <Icona nome={t.tipo === 'errore' ? 'avviso' : t.tipo === 'successo' ? 'check' : 'info'} dimensione={20} />
          <span>{t.messaggio}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicatori: online/offline + stato salvataggio, sempre visibili
// ---------------------------------------------------------------------------

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const su = () => setOnline(true);
    const giu = () => setOnline(false);
    window.addEventListener('online', su);
    window.addEventListener('offline', giu);
    return () => {
      window.removeEventListener('online', su);
      window.removeEventListener('offline', giu);
    };
  }, []);
  return online;
}

export function StatoApp() {
  const online = useOnline();
  const salvataggio = useStore(saveStatusStore);
  const testoSalva =
    salvataggio === 'salvato' ? 'Salvato' : salvataggio === 'salvataggio' ? 'Salvataggio…' : 'ERRORE';
  return (
    <span className="stato-app">
      <span title={testoSalva}>
        <span className={`pallino ${salvataggio === 'salvato' ? 'online' : salvataggio}`} />
        <span className="etichetta-stato"> {testoSalva}</span>
      </span>
      <span title={online ? 'Online' : 'Offline'}>
        <span className={`pallino ${online ? 'online' : 'offline'}`} />
        <span className="etichetta-stato"> {online ? 'Online' : 'Offline'}</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modale generica + conferma per azioni distruttive
// ---------------------------------------------------------------------------

export function Modale({
  titolo,
  onChiudi,
  children,
  centro
}: {
  titolo: string;
  onChiudi: () => void;
  children: ReactNode;
  centro?: boolean;
}) {
  return (
    <div
      className={`velo${centro ? ' centro' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onChiudi();
      }}
    >
      <div className="modale" role="dialog" aria-label={titolo}>
        <h2>{titolo}</h2>
        {children}
      </div>
    </div>
  );
}

export interface RichiestaConferma {
  titolo: string;
  messaggio: string;
  testoConferma?: string;
  onConferma: () => void;
}

export function ConfermaDialog({
  richiesta,
  onChiudi
}: {
  richiesta: RichiestaConferma | null;
  onChiudi: () => void;
}) {
  if (!richiesta) return null;
  return (
    <Modale titolo={richiesta.titolo} onChiudi={onChiudi} centro>
      <p style={{ whiteSpace: 'pre-line' }}>{richiesta.messaggio}</p>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn pericolo"
          onClick={() => {
            richiesta.onConferma();
            onChiudi();
          }}
        >
          {richiesta.testoConferma ?? 'Elimina'}
        </button>
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
// Menu contestuale (azioni su cartelle/progetti/foto)
// ---------------------------------------------------------------------------

export interface VoceMenu {
  testo: string;
  icona?: NomeIcona;
  pericolo?: boolean;
  onClick: () => void;
}

export function MenuContesto({
  posizione,
  titolo,
  voci,
  onChiudi
}: {
  posizione: { x: number; y: number };
  /**
   * Nome dell'elemento, per intero. Nelle liste il nome lungo va a capo e poi
   * si tronca: qui si legge tutto, senza dover aprire il file.
   */
  titolo?: string;
  voci: VoceMenu[];
  onChiudi: () => void;
}) {
  const stile: React.CSSProperties = {
    top: Math.min(posizione.y, window.innerHeight - voci.length * 52 - (titolo ? 80 : 20)),
    left: Math.min(posizione.x, window.innerWidth - 240)
  };
  return (
    <div className="velo" style={{ background: 'rgba(0,0,0,0.25)' }} onClick={onChiudi}>
      <div className="menu-contesto" style={stile} onClick={(e) => e.stopPropagation()}>
        {titolo && <div className="titolo-menu">{titolo}</div>}
        {voci.map((v) => (
          <button
            key={v.testo}
            className={v.pericolo ? 'pericolo' : ''}
            onClick={() => {
              onChiudi();
              v.onClick();
            }}
          >
            {v.icona && <Icona nome={v.icona} dimensione={19} />}
            <span>{v.testo}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selezione multipla: la barra che compare in fondo con quello che si è scelto
// ---------------------------------------------------------------------------

/**
 * Barra della selezione. Sta in fondo allo schermo, sopra tutto, e dice
 * quante cose sono state scelte e cosa ci si può fare. Sparisce da sola
 * quando non c'è più niente di selezionato.
 */
export function BarraSelezione({
  quante,
  inCorso,
  onCondividi,
  onAnnulla
}: {
  quante: number;
  /** messaggio di lavoro in corso: mentre si prepara, non si tocca niente */
  inCorso?: string | null;
  onCondividi: () => void;
  onAnnulla: () => void;
}) {
  return (
    <div className="barra-selezione" role="region" aria-label="Selezione">
      <span className="conto">
        {inCorso ? inCorso : `${quante} ${quante === 1 ? 'selezionato' : 'selezionati'}`}
      </span>
      <button className="btn" onClick={onAnnulla} disabled={!!inCorso}>
        Annulla
      </button>
      <button
        className="btn primario"
        onClick={onCondividi}
        disabled={quante === 0 || !!inCorso}
      >
        <Icona nome="condividi" dimensione={18} /> Condividi
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Miniatura dai dati archiviati, con gestione dell'URL oggetto
// ---------------------------------------------------------------------------

export function ImmagineBlob({ dati, tipo, alt }: { dati: ArrayBuffer | Blob; tipo: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const vuota = dati instanceof ArrayBuffer && dati.byteLength === 0;
  useEffect(() => {
    if (vuota) return;
    const blob = dati instanceof Blob ? dati : new Blob([dati], { type: tipo || 'image/jpeg' });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [dati, tipo, vuota]);
  if (vuota) {
    return (
      <span
        role="img"
        aria-label="Foto danneggiata"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          color: 'var(--avviso)'
        }}
      >
        <Icona nome="avviso" dimensione={34} />
      </span>
    );
  }
  if (!url) return null;
  return <img src={url} alt={alt} loading="lazy" />;
}
