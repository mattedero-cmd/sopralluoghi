import { useEffect, useState } from 'react';
import { naviga } from '../router';
import { Icona } from '../components/Icona';
import { StatoApp } from '../components/comuni';
import { VisoreSvg } from '../components/VisoreSvg';
import { leggiDisegno, rinominaDisegno } from '../db/repository';
import type { DisegnoSvg } from '../db/types';
import { livelliSvg, misureSvg, pesoTesto } from '../utils/svgDisegno';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { mostraToast } from '../state/toast';
import { formattaData, formattaNumero } from '../utils/format';

/**
 * VISORE DI UN DISEGNO SVG in archivio.
 *
 * Serve a guardare un file di taglio dove si lavora: quanto è grande davvero,
 * che livelli porta, e com'è fatto. Da qui si rinomina e si rimanda a chi
 * deve tagliarlo, senza passare da un computer.
 */
export function DisegnoPage({ id }: { id: string }) {
  const [disegno, setDisegno] = useState<DisegnoSvg | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [rinomina, setRinomina] = useState(false);
  const [nome, setNome] = useState('');

  useEffect(() => {
    let vivo = true;
    leggiDisegno(id)
      .then((d) => {
        if (!vivo) return;
        setDisegno(d ?? null);
        setNome(d?.nome ?? '');
        setCaricamento(false);
      })
      .catch(() => vivo && setCaricamento(false));
    return () => {
      vivo = false;
    };
  }, [id]);

  const condividi = async () => {
    if (!disegno) return;
    const blob = new Blob([disegno.svg], { type: 'image/svg+xml' });
    await condividiOScarica(blob, nomeFileSicuro(disegno.nome, 'svg'), disegno.nome);
  };

  const salvaNome = async () => {
    if (!disegno || !nome.trim()) return;
    await rinominaDisegno(disegno.id, nome.trim());
    setDisegno({ ...disegno, nome: nome.trim() });
    setRinomina(false);
    mostraToast('successo', 'Disegno rinominato.');
  };

  const misure = disegno ? misureSvg(disegno.svg) : null;
  const livelli = disegno ? livelliSvg(disegno.svg) : [];

  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() =>
            naviga(
              disegno?.progettoId
                ? { nome: 'progetto', id: disegno.progettoId }
                : { nome: 'archivio', cartellaId: disegno?.cartellaId ?? null }
            )
          }
        >
          <Icona nome="indietro" />
        </button>
        <h1>{disegno?.nome || 'Disegno'}</h1>
        <StatoApp />
        <button
          className="btn icona"
          aria-label="Rinomina"
          title="Rinomina"
          disabled={!disegno}
          onClick={() => setRinomina(true)}
        >
          <Icona nome="matita" />
        </button>
        <button
          className="btn icona"
          aria-label="Condividi"
          title="Condividi il file SVG"
          disabled={!disegno}
          onClick={() => void condividi()}
        >
          <Icona nome="condividi" />
        </button>
      </header>

      <main>
        {caricamento && <p style={{ color: 'var(--testo-2)' }}>Apertura…</p>}

        {!caricamento && !disegno && (
          <div className="vuoto">
            <div className="grande">
              <Icona nome="disegno" dimensione={46} />
            </div>
            <p>Questo disegno non è più in archivio.</p>
          </div>
        )}

        {disegno && (
          <>
            {rinomina && (
              <div className="campo">
                <label>Nome del disegno</label>
                <input
                  type="text"
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void salvaNome();
                    if (e.key === 'Escape') setRinomina(false);
                  }}
                />
                <div className="riga-pulsanti" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => setRinomina(false)}>
                    Annulla
                  </button>
                  <button className="btn primario" disabled={!nome.trim()} onClick={() => void salvaNome()}>
                    Salva
                  </button>
                </div>
              </div>
            )}

            <VisoreSvg svg={disegno.svg} />

            <dl className="svg-dati">
              <div>
                <dt>Misure</dt>
                <dd>
                  {misure?.larghezzaMm && misure.altezzaMm
                    ? `${formattaNumero(Math.round(misure.larghezzaMm * 10) / 10)} × ${formattaNumero(
                        Math.round(misure.altezzaMm * 10) / 10
                      )} mm`
                    : 'non dichiarate nel file'}
                  {misure && !misure.reali && misure.larghezzaMm ? (
                    <small> · dedotte dal disegno, il file non scrive l’unità</small>
                  ) : null}
                </dd>
              </div>
              {livelli.length > 0 && (
                <div>
                  <dt>Livelli</dt>
                  <dd>{livelli.join(' · ')}</dd>
                </div>
              )}
              <div>
                <dt>File</dt>
                <dd>
                  {pesoTesto(disegno.svg)}
                  {disegno.origine === 'taglio' ? ' · esportato da un piano di taglio' : ''}
                </dd>
              </div>
              <div>
                <dt>Modificato</dt>
                <dd>{formattaData(disegno.modificatoIl)}</dd>
              </div>
            </dl>

            <p className="nest-nota">
              Il disegno si sposta col dito e si ingrandisce con due dita o con la rotella; due
              tocchi lo riportano intero. Il file resta com’è arrivato: quello che si condivide è
              identico a quello che si vede, byte per byte.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
