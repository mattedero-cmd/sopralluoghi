import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { Foto } from '../db/types';
import type { OpzioniReport } from '../pdf/report';
import { Modale, ImmagineBlob } from './comuni';
import { Icona } from './Icona';

// pdf.js è pesante: si carica solo quando serve l'anteprima
const AnteprimaPdf = lazy(() => import('./AnteprimaPdf'));

/**
 * Pannello UNICO e ordinato per le opzioni di esportazione PDF/ZIP, con
 * un'anteprima dell'IMPAGINAZIONE che si aggiorna mentre si scelgono le opzioni
 * (mostra com'è disposta la pagina: 1/2/4/6 foto, verticale/orizzontale,
 * con o senza tabella misure). Condiviso da progetto e cartella.
 */
export function PannelloOpzioniPdf({
  titolo,
  foto,
  preparaImmagini,
  generaAnteprima,
  onChiudi,
  onGenera,
  onGeneraZip
}: {
  titolo: string;
  /** foto del progetto da poter selezionare; assente nel report di cartella */
  foto?: Foto[];
  /** rende una volta le immagini annotate (riusate per l'anteprima dal vivo) */
  preparaImmagini?: () => Promise<Record<string, string>>;
  /** compone il PDF vero usando le immagini già pronte (veloce) */
  generaAnteprima?: (opzioni: OpzioniReport, immagini: Record<string, string>) => Promise<Blob>;
  onChiudi: () => void;
  onGenera: (opzioni: OpzioniReport) => void;
  onGeneraZip: (opzioni: OpzioniReport) => void;
}) {
  const [fotoPerPagina, setFotoPerPagina] = useState<1 | 2 | 4 | 6>(1);
  const [orizzontale, setOrizzontale] = useState(false);
  const [includiIndice, setIncludiIndice] = useState(true);
  const [includiRiepilogo, setIncludiRiepilogo] = useState(true);
  const [includiNoteDato, setIncludiNoteDato] = useState(true);
  const [includiTabellaMisure, setIncludiTabellaMisure] = useState(true);
  const [includiDistinta, setIncludiDistinta] = useState(true);
  const [avanzate, setAvanzate] = useState(false);
  const [scegliFoto, setScegliFoto] = useState(false);
  const [selezione, setSelezione] = useState<Set<string>>(new Set((foto ?? []).map((f) => f.id)));

  const griglia = fotoPerPagina >= 4;

  const commuta = (id: string) =>
    setSelezione((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const opzioni = (): OpzioniReport => ({
    fotoIds: foto && selezione.size !== foto.length ? Array.from(selezione) : null,
    fotoPerPagina,
    orizzontale,
    includiIndice,
    includiRiepilogo,
    includiNoteDato: griglia ? false : includiNoteDato,
    includiTabellaMisure: griglia ? false : includiTabellaMisure,
    includiDistinta
  });

  const nFoto = foto ? selezione.size : null;
  const vuotoSelezione = foto ? selezione.size === 0 : false;

  // --- Anteprima del PDF VERO: immagini renderizzate una volta, documento
  //     ricomposto (veloce) a ogni cambio di opzione, con debounce ----------
  const live = !!(preparaImmagini && generaAnteprima);
  const [immagini, setImmagini] = useState<Record<string, string> | null>(null);
  const [blobPdf, setBlobPdf] = useState<Blob | null>(null);
  const [urlPdf, setUrlPdf] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [erroreAnteprima, setErroreAnteprima] = useState(false);
  const urlRef = useRef<string | null>(null);

  // prepara le immagini una sola volta all'apertura
  useEffect(() => {
    if (!preparaImmagini) return;
    let vivo = true;
    preparaImmagini()
      .then((im) => vivo && setImmagini(im))
      .catch(() => vivo && setErroreAnteprima(true));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chiaveOpzioni = `${fotoPerPagina}|${orizzontale}|${includiIndice}|${includiRiepilogo}|${includiNoteDato}|${includiTabellaMisure}|${includiDistinta}|${Array.from(selezione).sort().join(',')}`;

  // ricompone il PDF quando cambiano le opzioni (debounce)
  useEffect(() => {
    if (!generaAnteprima || !immagini) return;
    let vivo = true;
    setGenerando(true);
    const t = setTimeout(() => {
      generaAnteprima(opzioni(), immagini)
        .then((blob) => {
          if (!vivo) return;
          const u = URL.createObjectURL(blob);
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = u;
          setUrlPdf(u);
          setBlobPdf(blob);
          setGenerando(false);
        })
        .catch(() => {
          if (!vivo) return;
          setErroreAnteprima(true);
          setGenerando(false);
        });
    }, 450);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveOpzioni, immagini]);

  // libera l'ultimo blob alla chiusura
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  return (
    <Modale titolo={titolo} onChiudi={onChiudi}>
      {/* Anteprima: il PDF vero se disponibile, altrimenti il mock dell'impaginazione */}
      {live && !erroreAnteprima ? (
        <div className="anteprima-pdf">
          {blobPdf ? (
            <Suspense
              fallback={
                <AnteprimaPagina
                  fotoPerPagina={fotoPerPagina}
                  orizzontale={orizzontale}
                  conTabella={!griglia && includiTabellaMisure}
                  conNote={!griglia && includiNoteDato}
                />
              }
            >
              <AnteprimaPdf blob={blobPdf} generando={generando} />
            </Suspense>
          ) : (
            <div className="anteprima-pdf-frame-wrap">
              <AnteprimaPagina
                fotoPerPagina={fotoPerPagina}
                orizzontale={orizzontale}
                conTabella={!griglia && includiTabellaMisure}
                conNote={!griglia && includiNoteDato}
              />
              <div className="anteprima-pdf-stato">{immagini ? 'Aggiorno anteprima…' : 'Preparazione anteprima…'}</div>
            </div>
          )}
          {urlPdf && (
            <a className="link" href={urlPdf} target="_blank" rel="noreferrer" style={{ marginTop: 6, textAlign: 'center', display: 'block' }}>
              Apri a schermo intero
            </a>
          )}
        </div>
      ) : (
        <AnteprimaPagina
          fotoPerPagina={fotoPerPagina}
          orizzontale={orizzontale}
          conTabella={!griglia && includiTabellaMisure}
          conNote={!griglia && includiNoteDato}
        />
      )}

      {/* Foto per pagina */}
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
          {griglia ? 'Report fotografico a griglia (solo foto e didascalie).' : 'Foto con tabella misure sotto.'}
        </p>
      </div>

      {/* Orientamento */}
      <div className="campo">
        <label>Orientamento</label>
        <span className="segmenti" role="group">
          <button className={!orizzontale ? 'attivo' : ''} onClick={() => setOrizzontale(false)}>
            Verticale
          </button>
          <button className={orizzontale ? 'attivo' : ''} onClick={() => setOrizzontale(true)}>
            Orizzontale
          </button>
        </span>
      </div>

      {/* Foto da includere (solo progetto): compatto, si apre a richiesta */}
      {foto && (
        <div className="campo">
          <button className="riga-espandi" onClick={() => setScegliFoto((v) => !v)}>
            <span>
              Foto da includere <strong>({selezione.size} di {foto.length})</strong>
            </span>
            <Icona nome={scegliFoto ? 'giu' : 'avanti'} dimensione={18} />
          </button>
          {scegliFoto && (
            <>
              <div
                className="griglia-foto-scelta"
                style={{ marginTop: 8 }}
              >
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
                          width: 20,
                          height: 20,
                          display: 'grid',
                          placeItems: 'center'
                        }}
                      >
                        <Icona nome="check" dimensione={13} strokeWidth={2.6} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="riga-pulsanti" style={{ marginTop: 8 }}>
                <button className="btn piccolo" onClick={() => setSelezione(new Set(foto.map((f) => f.id)))}>
                  Tutte
                </button>
                <button className="btn piccolo" onClick={() => setSelezione(new Set())}>
                  Nessuna
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Contenuti del documento: nascosti per default (meno tasti a vista) */}
      <div className="campo">
        <button className="riga-espandi" onClick={() => setAvanzate((v) => !v)}>
          <span>Contenuti del documento</span>
          <Icona nome={avanzate ? 'giu' : 'avanti'} dimensione={18} />
        </button>
        {avanzate && (
          <div style={{ marginTop: 6 }}>
            <Interruttore attivo={includiIndice} onCommuta={() => setIncludiIndice((v) => !v)} testo="Indice con numeri di pagina" />
            {!griglia && (
              <>
                <Interruttore attivo={includiNoteDato} onCommuta={() => setIncludiNoteDato((v) => !v)} testo="Note delle foto" />
                <Interruttore
                  attivo={includiTabellaMisure}
                  onCommuta={() => setIncludiTabellaMisure((v) => !v)}
                  testo="Tabella misure sotto ogni foto"
                />
              </>
            )}
            <Interruttore attivo={includiRiepilogo} onCommuta={() => setIncludiRiepilogo((v) => !v)} testo="Riepilogo finale delle misure" />
            <Interruttore attivo={includiDistinta} onCommuta={() => setIncludiDistinta((v) => !v)} testo="Distinta di taglio" />
          </div>
        )}
      </div>

      {/* Azioni */}
      <div className="riga-pulsanti">
        <button className="btn" onClick={onChiudi}>
          Annulla
        </button>
        <button
          className="btn"
          disabled={vuotoSelezione}
          title="PDF + foto originali (JPG)"
          onClick={() => onGeneraZip(opzioni())}
        >
          <Icona nome="archivio" dimensione={19} /> ZIP
        </button>
        <button className="btn primario" disabled={vuotoSelezione} onClick={() => onGenera(opzioni())}>
          <Icona nome="documento" dimensione={19} /> Genera PDF{nFoto !== null ? ` (${nFoto})` : ''}
        </button>
      </div>
    </Modale>
  );
}

function Interruttore({ attivo, onCommuta, testo }: { attivo: boolean; onCommuta: () => void; testo: string }) {
  return (
    <button
      className={`btn interruttore${attivo ? ' attivo' : ''}`}
      style={{ justifyContent: 'flex-start', width: '100%', marginBottom: 8 }}
      onClick={onCommuta}
    >
      <span className={`check-box${attivo ? ' on' : ''}`}>
        {attivo && <Icona nome="check" dimensione={15} strokeWidth={2.4} />}
      </span>
      {testo}
    </button>
  );
}

/** Mock visivo della pagina: aggiorna istantaneamente con le opzioni scelte */
function AnteprimaPagina({
  fotoPerPagina,
  orizzontale,
  conTabella,
  conNote
}: {
  fotoPerPagina: 1 | 2 | 4 | 6;
  orizzontale: boolean;
  conTabella: boolean;
  conNote: boolean;
}) {
  const griglia = fotoPerPagina >= 4;
  const cols = griglia ? (orizzontale ? (fotoPerPagina === 6 ? 3 : 2) : 2) : 1;
  const celle = griglia ? fotoPerPagina : fotoPerPagina; // 1 o 2 impilate

  return (
    <div className="anteprima-pdf">
      <div className={`mock-pagina${orizzontale ? ' orizz' : ''}`}>
        <div className="mock-titolo" />
        <div className="mock-corpo" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: celle }).map((_, i) => (
            <div className="mock-cella" key={i}>
              {conNote && !griglia && <div className="mock-nota" />}
              <div className="mock-foto" />
              {conTabella && !griglia && (
                <div className="mock-tabella">
                  <div />
                  <div />
                  <div />
                </div>
              )}
              {griglia && <div className="mock-didascalia" />}
            </div>
          ))}
        </div>
      </div>
      <p className="aiuto" style={{ textAlign: 'center', marginTop: 6 }}>
        Anteprima impaginazione
      </p>
    </div>
  );
}
