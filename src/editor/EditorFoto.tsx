import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  Annotazione,
  Foto,
  Impostazioni,
  PosizioneTesto,
  Punto,
  Quota,
  Rettangolo,
  SottotipoQuota,
  StatoMisura,
  Unita
} from '../db/types';
import { IMPOSTAZIONI_DEFAULT } from '../db/types';
import { aggiornaFoto, leggiImpostazioni, salvaAnnotazioniFoto } from '../db/repository';
import { blobOrigine, caricaImmagine, fotoIllegibile } from '../utils/image';
import { naviga } from '../router';
import { ConfermaDialog, Modale, StatoApp, type RichiestaConferma } from '../components/comuni';
import { eliminaFoto } from '../db/repository';
import { mostraToast } from '../state/toast';
import { StageEditor, type Strumento } from './StageEditor';
import { FabbricaAnnotazioni } from './fabbrica';
import { calcolaCatene, sommaCatenaInUnita } from '../geometry/catene';
import {
  aInputDataOra,
  analizzaMisura,
  daInputDataOra,
  formattaNumero
} from '../utils/format';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { renderFotoAnnotata } from '../render/renderAnnotata';

const COLORI = ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#ffffff', '#111111'];

export function EditorFoto({ fotoId }: { fotoId: string }) {
  const foto = useLiveQuery(() => db.foto.get(fotoId), [fotoId]);
  const [immagine, setImmagine] = useState<HTMLImageElement | null>(null);
  const [impostazioni, setImpostazioni] = useState<Impostazioni>(IMPOSTAZIONI_DEFAULT);
  const [annotazioni, setAnnotazioni] = useState<Annotazione[] | null>(null);
  const [selezioneId, setSelezioneId] = useState<string | null>(null);
  const [strumento, setStrumento] = useState<Strumento>('seleziona');
  const [snapAttivo, setSnapAttivo] = useState(true);
  const [ortoAttivo, setOrtoAttivo] = useState(false);
  const [schedaNote, setSchedaNote] = useState(false);
  const [testoInModifica, setTestoInModifica] = useState<string | null>(null);
  const passato = useRef<Annotazione[][]>([]);
  const futuro = useRef<Annotazione[][]>([]);
  const timerSalvataggio = useRef<number | null>(null);
  const daSalvare = useRef<Annotazione[] | null>(null);
  const inputValore = useRef<HTMLInputElement>(null);

  // Caricamento iniziale: immagine, impostazioni, annotazioni
  useEffect(() => {
    let attivo = true;
    leggiImpostazioni().then((i) => attivo && setImpostazioni(i));
    db.annotazioni
      .where('fotoId')
      .equals(fotoId)
      .toArray()
      .then((a) => attivo && setAnnotazioni(a));
    return () => {
      attivo = false;
    };
  }, [fotoId]);

  useEffect(() => {
    if (!foto || fotoIllegibile(foto)) return;
    let attivo = true;
    caricaImmagine(blobOrigine(foto))
      .then((img) => attivo && setImmagine(img))
      .catch((e) => mostraToast('errore', e instanceof Error ? e.message : 'Foto non caricabile.'));
    return () => {
      attivo = false;
    };
    // l'originale non cambia mai: si carica una sola volta per foto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto?.id]);

  // ---------------------------------------------------------------------------
  // Autosave transazionale con debounce breve + flush garantito
  // ---------------------------------------------------------------------------

  const salvaOra = useCallback(() => {
    if (timerSalvataggio.current !== null) {
      clearTimeout(timerSalvataggio.current);
      timerSalvataggio.current = null;
    }
    const dati = daSalvare.current;
    if (dati === null) return;
    daSalvare.current = null;
    void salvaAnnotazioniFoto(fotoId, dati).catch(() => {
      // errore già notificato dal repository; si ritenta al prossimo commit
      daSalvare.current = dati;
    });
  }, [fotoId]);

  const programmaSalvataggio = useCallback(
    (dati: Annotazione[]) => {
      daSalvare.current = dati;
      if (timerSalvataggio.current !== null) clearTimeout(timerSalvataggio.current);
      timerSalvataggio.current = window.setTimeout(salvaOra, 350);
    },
    [salvaOra]
  );

  useEffect(() => {
    const suNascosto = () => {
      if (document.visibilityState === 'hidden') salvaOra();
    };
    document.addEventListener('visibilitychange', suNascosto);
    window.addEventListener('pagehide', salvaOra);
    return () => {
      document.removeEventListener('visibilitychange', suNascosto);
      window.removeEventListener('pagehide', salvaOra);
      salvaOra(); // flush all'uscita dall'editor
    };
  }, [salvaOra]);

  const commit = useCallback(
    (nuove: Annotazione[]) => {
      setAnnotazioni((correnti) => {
        if (correnti) {
          passato.current.push(correnti);
          if (passato.current.length > 100) passato.current.shift();
          futuro.current = [];
        }
        return nuove;
      });
      programmaSalvataggio(nuove);
    },
    [programmaSalvataggio]
  );

  const undo = () => {
    const prec = passato.current.pop();
    if (!prec || !annotazioni) return;
    futuro.current.push(annotazioni);
    setAnnotazioni(prec);
    programmaSalvataggio(prec);
    if (selezioneId && !prec.some((a) => a.id === selezioneId)) setSelezioneId(null);
  };

  const redo = () => {
    const succ = futuro.current.pop();
    if (!succ || !annotazioni) return;
    passato.current.push(annotazioni);
    setAnnotazioni(succ);
    programmaSalvataggio(succ);
  };

  // ---------------------------------------------------------------------------
  // Creazione annotazioni
  // ---------------------------------------------------------------------------

  const fabbrica = useMemo(
    () => (foto ? new FabbricaAnnotazioni(foto, impostazioni) : null),
    [foto, impostazioni]
  );

  const creaQuota = (p1: Punto, p2: Punto, sottotipo: SottotipoQuota) => {
    if (!fabbrica || !annotazioni) return;
    const q = fabbrica.quota(p1, p2, sottotipo, annotazioni);
    commit([...annotazioni, q]);
    setSelezioneId(q.id);
    setStrumento('seleziona');
    // focus sul campo misura: l'inserimento del valore è il passo successivo
    setTimeout(() => inputValore.current?.focus(), 60);
  };

  const creaTesto = (pos: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const t = fabbrica.testo(pos, annotazioni);
    commit([...annotazioni, t]);
    setSelezioneId(t.id);
    setStrumento('seleziona');
    setTestoInModifica(t.id);
  };

  const creaFreccia = (p1: Punto, p2: Punto) => {
    if (!fabbrica || !annotazioni) return;
    const f = fabbrica.freccia(p1, p2, annotazioni);
    commit([...annotazioni, f]);
    setSelezioneId(f.id);
    setStrumento('seleziona');
  };

  const creaDisegno = (punti: number[]) => {
    if (!fabbrica || !annotazioni) return;
    const d = fabbrica.disegno(punti, annotazioni);
    commit([...annotazioni, d]);
  };

  const creaCallout = (sorgente: Rettangolo) => {
    if (!fabbrica || !annotazioni) return;
    const c = fabbrica.callout(sorgente, annotazioni);
    commit([...annotazioni, c]);
    setSelezioneId(c.id);
    setStrumento('seleziona');
  };

  const aggiornaSelezionata = (modifiche: Partial<Annotazione>) => {
    if (!annotazioni || !selezioneId) return;
    commit(
      annotazioni.map((a) => (a.id === selezioneId ? ({ ...a, ...modifiche } as Annotazione) : a))
    );
  };

  const eliminaSelezionata = () => {
    if (!annotazioni || !selezioneId) return;
    commit(annotazioni.filter((a) => a.id !== selezioneId));
    setSelezioneId(null);
  };

  const esporta = async () => {
    if (!foto || !annotazioni) return;
    salvaOra();
    try {
      const blob = await renderFotoAnnotata(foto, annotazioni);
      await condividiOScarica(
        blob,
        nomeFileSicuro(foto.didascalia || 'foto_quotata', 'jpg'),
        foto.didascalia || 'Foto quotata'
      );
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Export non riuscito.');
    }
  };

  if (foto && fotoIllegibile(foto)) {
    return <SchermataFotoDanneggiata foto={foto} />;
  }

  if (!foto || !immagine || annotazioni === null) {
    return (
      <div className="app">
        <header className="barra">
          <button className="btn icona" onClick={() => history.back()}>
            ←
          </button>
          <h1>{foto === null ? 'Foto non trovata' : 'Caricamento…'}</h1>
        </header>
      </div>
    );
  }

  const selezionata = annotazioni.find((a) => a.id === selezioneId) ?? null;
  const testoTarget =
    testoInModifica !== null
      ? annotazioni.find((a) => a.id === testoInModifica && a.tipo === 'testo')
      : null;

  return (
    <div className="editor">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => {
            salvaOra();
            naviga({ nome: 'progetto', id: foto.progettoId });
          }}
        >
          ←
        </button>
        <h1>{foto.didascalia || 'Foto'}</h1>
        <StatoApp />
        <button className="btn icona" aria-label="Annulla" disabled={passato.current.length === 0} onClick={undo}>
          ↩
        </button>
        <button className="btn icona" aria-label="Ripristina" disabled={futuro.current.length === 0} onClick={redo}>
          ↪
        </button>
        <button className="btn icona" aria-label="Note della foto" onClick={() => setSchedaNote(true)}>
          🗒️
        </button>
        <button className="btn icona" aria-label="Esporta immagine" onClick={() => void esporta()}>
          ⬆️
        </button>
      </header>

      <StageEditor
        foto={foto}
        immagine={immagine}
        annotazioni={annotazioni}
        selezioneId={selezioneId}
        strumento={strumento}
        snapAttivo={snapAttivo}
        ortoAttivo={ortoAttivo}
        sogliaSnap={impostazioni.sogliaSnap}
        onSeleziona={setSelezioneId}
        onCommit={commit}
        onNuovaQuota={creaQuota}
        onNuovoTesto={creaTesto}
        onNuovaFreccia={creaFreccia}
        onNuovoDisegno={creaDisegno}
        onNuovoCallout={creaCallout}
      />

      {selezionata && (
        <PannelloProprieta
          ann={selezionata}
          annotazioni={annotazioni}
          inputValore={inputValore}
          onModifica={aggiornaSelezionata}
          onElimina={eliminaSelezionata}
          onModificaTesto={() => setTestoInModifica(selezionata.id)}
        />
      )}

      <nav className="editor-toolbar" aria-label="Strumenti">
        <BtnStrumento attivo={strumento === 'seleziona'} onClick={() => setStrumento('seleziona')} icona="☝️" testo="Seleziona" />
        <BtnStrumento attivo={strumento === 'quotaO'} onClick={() => setStrumento('quotaO')} icona="↔" testo="Quota O" />
        <BtnStrumento attivo={strumento === 'quotaV'} onClick={() => setStrumento('quotaV')} icona="↕" testo="Quota V" />
        <BtnStrumento attivo={strumento === 'quotaA'} onClick={() => setStrumento('quotaA')} icona="⤡" testo="Allineata" />
        <BtnStrumento attivo={strumento === 'callout'} onClick={() => setStrumento('callout')} icona="🔍" testo="Dettaglio" />
        <BtnStrumento attivo={strumento === 'testo'} onClick={() => setStrumento('testo')} icona="T" testo="Testo" />
        <BtnStrumento attivo={strumento === 'freccia'} onClick={() => setStrumento('freccia')} icona="➚" testo="Freccia" />
        <BtnStrumento attivo={strumento === 'disegno'} onClick={() => setStrumento('disegno')} icona="✏️" testo="Disegno" />
        <BtnStrumento attivo={snapAttivo} onClick={() => setSnapAttivo(!snapAttivo)} icona="🧲" testo="Snap" />
        <BtnStrumento attivo={ortoAttivo} onClick={() => setOrtoAttivo(!ortoAttivo)} icona="∟" testo="Orto" />
        <BtnStrumento attivo={false} onClick={() => window.dispatchEvent(new CustomEvent('editor:zoom', { detail: 1.3 }))} icona="＋" testo="Zoom" />
        <BtnStrumento attivo={false} onClick={() => window.dispatchEvent(new CustomEvent('editor:zoom', { detail: 1 / 1.3 }))} icona="－" testo="Zoom" />
        <BtnStrumento attivo={false} onClick={() => window.dispatchEvent(new Event('editor:adatta'))} icona="⤢" testo="Adatta" />
      </nav>

      {schedaNote && <SchedaNoteFoto foto={foto} onChiudi={() => setSchedaNote(false)} />}
      {testoTarget && testoTarget.tipo === 'testo' && (
        <SchedaTesto
          iniziale={testoTarget.testo}
          onChiudi={() => setTestoInModifica(null)}
          onSalva={(testo) => {
            if (testo.trim() === '') {
              commit(annotazioni.filter((a) => a.id !== testoTarget.id));
              setSelezioneId(null);
            } else {
              commit(
                annotazioni.map((a) => (a.id === testoTarget.id ? { ...a, testo } : a))
              );
            }
            setTestoInModifica(null);
          }}
        />
      )}
    </div>
  );
}

function SchermataFotoDanneggiata({ foto }: { foto: Foto }) {
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);
  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => naviga({ nome: 'progetto', id: foto.progettoId })}
        >
          ←
        </button>
        <h1>{foto.didascalia || 'Foto'}</h1>
      </header>
      <main className="contenuto">
        <div className="vuoto">
          <div className="grande">⚠️</div>
          <p>
            Il contenuto di questa foto è stato perso dal browser: un difetto di iOS/Safari nelle
            prime versioni dell'app poteva corrompere le immagini archiviate. Il problema è stato
            risolto per le foto nuove, ma questa non è recuperabile.
          </p>
          <p style={{ marginTop: 16 }}>
            <button
              className="btn pericolo"
              onClick={() =>
                setConferma({
                  titolo: 'Eliminare la foto danneggiata?',
                  messaggio:
                    'Il record e le eventuali annotazioni verranno rimossi definitivamente.',
                  onConferma: () => {
                    void eliminaFoto(foto.id).then(() =>
                      naviga({ nome: 'progetto', id: foto.progettoId })
                    );
                  }
                })
              }
            >
              🗑 Elimina questa foto
            </button>
          </p>
        </div>
      </main>
      <ConfermaDialog richiesta={conferma} onChiudi={() => setConferma(null)} />
    </div>
  );
}

function BtnStrumento({
  attivo,
  onClick,
  icona,
  testo
}: {
  attivo: boolean;
  onClick: () => void;
  icona: string;
  testo: string;
}) {
  return (
    <button className={`btn${attivo ? ' attivo' : ''}`} onClick={onClick}>
      <span className="ico">{icona}</span>
      {testo}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pannello proprietà dell'annotazione selezionata: ogni dato è correggibile
// ---------------------------------------------------------------------------

function PannelloProprieta({
  ann,
  annotazioni,
  inputValore,
  onModifica,
  onElimina,
  onModificaTesto
}: {
  ann: Annotazione;
  annotazioni: Annotazione[];
  inputValore: React.RefObject<HTMLInputElement>;
  onModifica: (m: Partial<Annotazione>) => void;
  onElimina: () => void;
  onModificaTesto: () => void;
}) {
  // dimensione personalizzabile: scala spessore linee e testo insieme
  const scalaStile = (fattore: number) => {
    onModifica({
      stile: {
        ...ann.stile,
        spessore: Math.min(40, Math.max(1, ann.stile.spessore * fattore)),
        dimensioneTesto: Math.min(200, Math.max(8, Math.round(ann.stile.dimensioneTesto * fattore)))
      }
    });
  };

  return (
    <div className="pannello-proprieta">
      {ann.tipo === 'quota' && (
        <ProprietaQuota
          quota={ann}
          annotazioni={annotazioni}
          inputValore={inputValore}
          onModifica={onModifica}
        />
      )}
      <span className="segmenti" role="group" aria-label="Dimensione annotazione">
        <button aria-label="Riduci dimensione" onClick={() => scalaStile(1 / 1.25)}>
          A−
        </button>
        <button aria-label="Aumenta dimensione" onClick={() => scalaStile(1.25)}>
          A＋
        </button>
      </span>
      {ann.tipo === 'quota' && (
        <PaletteColori
          colore={ann.stile.colore}
          onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })}
        />
      )}
      {ann.tipo === 'testo' && (
        <>
          <button className="btn" onClick={onModificaTesto}>
            ✏️ Modifica testo
          </button>
          <PaletteColori colore={ann.stile.colore} onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })} />
        </>
      )}
      {ann.tipo === 'callout' && (
        <>
          <label style={{ color: 'var(--testo-2)', fontSize: 14 }}>Etichetta</label>
          <input
            className="input-misura"
            style={{ width: 70 }}
            value={ann.etichetta}
            maxLength={3}
            onChange={(e) => onModifica({ etichetta: e.target.value.toUpperCase() })}
          />
          <PaletteColori colore={ann.stile.colore} onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })} />
        </>
      )}
      {(ann.tipo === 'freccia' || ann.tipo === 'disegno') && (
        <PaletteColori colore={ann.stile.colore} onScegli={(c) => onModifica({ stile: { ...ann.stile, colore: c } })} />
      )}
      <button className="btn pericolo" onClick={onElimina}>
        🗑 Elimina
      </button>
    </div>
  );
}

function ProprietaQuota({
  quota,
  annotazioni,
  inputValore,
  onModifica
}: {
  quota: Quota;
  annotazioni: Annotazione[];
  inputValore: React.RefObject<HTMLInputElement>;
  onModifica: (m: Partial<Quota>) => void;
}) {
  const [testoValore, setTestoValore] = useState(
    quota.valore === null ? '' : String(quota.valore).replace('.', ',')
  );
  useEffect(() => {
    setTestoValore(quota.valore === null ? '' : String(quota.valore).replace('.', ','));
    // si risincronizza solo al cambio di quota selezionata
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quota.id]);

  const catena = useMemo(() => {
    return calcolaCatene(annotazioni).find((c) => c.quote.some((q) => q.id === quota.id)) ?? null;
  }, [annotazioni, quota.id]);

  const applicaValore = (testo: string) => {
    setTestoValore(testo);
    const v = analizzaMisura(testo);
    if (testo.trim() !== '' && v === null) return; // input non valido: non salvare
    onModifica({ valore: v });
  };

  return (
    <>
      <input
        ref={inputValore}
        className="input-misura"
        type="text"
        inputMode="decimal"
        placeholder="misura"
        aria-label="Valore della misura"
        value={testoValore}
        onChange={(e) => applicaValore(e.target.value)}
      />
      <select
        aria-label="Unità"
        value={quota.unita}
        onChange={(e) => onModifica({ unita: e.target.value as Unita })}
        style={{ minHeight: 44, borderRadius: 10, background: 'var(--sfondo)', border: '1px solid var(--bordo)', padding: '0 8px' }}
      >
        <option value="mm">mm</option>
        <option value="cm">cm</option>
        <option value="m">m</option>
      </select>
      <span className="segmenti" role="group" aria-label="Stato della misura">
        {(['reale', 'stimata'] as StatoMisura[]).map((s) => (
          <button key={s} className={quota.stato === s ? 'attivo' : ''} onClick={() => onModifica({ stato: s })}>
            {s === 'reale' ? 'Reale' : '≈ Stimata'}
          </button>
        ))}
      </span>
      <span className="segmenti" role="group" aria-label="Posizione del testo">
        {(
          [
            ['sopra', 'Sopra'],
            ['centro', 'Centro'],
            ['sotto', 'Sotto']
          ] as Array<[PosizioneTesto, string]>
        ).map(([v, t]) => (
          <button key={v} className={quota.posizioneTesto === v ? 'attivo' : ''} onClick={() => onModifica({ posizioneTesto: v })}>
            {t}
          </button>
        ))}
      </span>
      {catena && sommaCatenaInUnita(catena) !== null && (
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          Catena ({catena.quote.length}): {formattaNumero(sommaCatenaInUnita(catena)!)} {catena.unita}
          {catena.completa ? '' : ' (parz.)'}
        </span>
      )}
    </>
  );
}

function PaletteColori({ colore, onScegli }: { colore: string; onScegli: (c: string) => void }) {
  return (
    <span className="palette" role="group" aria-label="Colore">
      {COLORI.map((c) => (
        <button
          key={c}
          className={colore === c ? 'attivo' : ''}
          style={{ background: c }}
          aria-label={`Colore ${c}`}
          onClick={() => onScegli(c)}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Schede: note della foto (didascalia, note dato, data, geotag) e testo
// ---------------------------------------------------------------------------

function SchedaNoteFoto({ foto, onChiudi }: { foto: Foto; onChiudi: () => void }) {
  const [didascalia, setDidascalia] = useState(foto.didascalia);
  const [noteDato, setNoteDato] = useState(foto.noteDato);
  const [dataScatto, setDataScatto] = useState(aInputDataOra(foto.dataScatto));
  const [lat, setLat] = useState(foto.geotag ? String(foto.geotag.lat) : '');
  const [lng, setLng] = useState(foto.geotag ? String(foto.geotag.lng) : '');

  const salva = async () => {
    const nuovaData = daInputDataOra(dataScatto);
    let geotag = foto.geotag;
    const nLat = lat.trim() === '' ? null : Number(lat.replace(',', '.'));
    const nLng = lng.trim() === '' ? null : Number(lng.replace(',', '.'));
    if (nLat === null || nLng === null) geotag = null;
    else if (Number.isFinite(nLat) && Number.isFinite(nLng)) geotag = { lat: nLat, lng: nLng };
    else {
      mostraToast('errore', 'Coordinate GPS non valide.');
      return;
    }
    await aggiornaFoto(foto.id, {
      didascalia: didascalia.trim(),
      noteDato,
      dataScatto: nuovaData ?? foto.dataScatto,
      geotag
    });
    onChiudi();
  };

  return (
    <Modale titolo="Note della foto" onChiudi={() => void salva()}>
      <div className="campo">
        <label>Didascalia (titolo della sezione nel PDF)</label>
        <input value={didascalia} onChange={(e) => setDidascalia(e.target.value)} />
      </div>
      <div className="campo">
        <label>Note dato (testo riportato nel PDF e nell'indice)</label>
        <textarea value={noteDato} onChange={(e) => setNoteDato(e.target.value)} rows={5} />
      </div>
      <div className="campo">
        <label>Data e ora dello scatto</label>
        <input type="datetime-local" value={dataScatto} onChange={(e) => setDataScatto(e.target.value)} />
      </div>
      <div className="campo">
        <label>Geotag (latitudine / longitudine, vuoto = nessuno)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
          <input placeholder="lng" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
        </div>
      </div>
      <div className="riga-pulsanti">
        <button className="btn primario" onClick={() => void salva()}>
          Salva
        </button>
      </div>
    </Modale>
  );
}

function SchedaTesto({
  iniziale,
  onChiudi,
  onSalva
}: {
  iniziale: string;
  onChiudi: () => void;
  onSalva: (testo: string) => void;
}) {
  const [testo, setTesto] = useState(iniziale);
  return (
    <Modale titolo="Testo sulla foto" onChiudi={onChiudi}>
      <div className="campo">
        <textarea autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} rows={3} />
      </div>
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button className="btn primario" onClick={() => onSalva(testo)}>
          OK
        </button>
      </div>
    </Modale>
  );
}
