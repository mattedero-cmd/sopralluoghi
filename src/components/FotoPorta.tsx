import { useMemo, useRef, useState } from 'react';
import { Icona } from './Icona';
import {
  MAX_DETTAGLI,
  QUARTI,
  apriScatto,
  contaScatti,
  type ImmagineScatto,
  type RuoloScatto,
  type ScattiPorta
} from '../utils/collagePorta';
import { mostraToast } from '../state/toast';

/**
 * LE FOTO DELLA PORTA: la prima parte del rilievo.
 *
 * Il foglio A4 si vede già com'è: quattro quarti, nell'ordine in cui si
 * scattano. Il pulsante grande scatta la prossima foto che manca; un quarto
 * pieno si tocca per rifarla. L'ultimo quarto prende fino a quattro dettagli.
 */

const anteprime = new WeakMap<object, string>();
function anteprima(img: ImmagineScatto): string {
  const nota = anteprime.get(img);
  if (nota) return nota;
  let url = '';
  if (img instanceof HTMLCanvasElement) url = img.toDataURL('image/jpeg', 0.7);
  else if (img instanceof HTMLImageElement) url = img.src;
  anteprime.set(img, url);
  return url;
}

/** cosa si sta scattando: un ruolo fisso, o un dettaglio (nuovo o da rifare) */
type Bersaglio = { ruolo: Exclude<RuoloScatto, 'dettaglio'> } | { ruolo: 'dettaglio'; indice: number };

export function FotoPorta({
  scatti,
  onCambia,
  onAvanti,
  testoAvanti = 'Avanti: il rilievo'
}: {
  scatti: ScattiPorta;
  onCambia: (s: ScattiPorta) => void;
  onAvanti: () => void;
  testoAvanti?: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const galleria = useRef<HTMLInputElement>(null);
  const bersaglio = useRef<Bersaglio | null>(null);
  const [occupato, setOccupato] = useState(false);

  /** la prossima foto che manca, nell'ordine del foglio */
  const prossima = useMemo<Bersaglio | null>(() => {
    for (const q of QUARTI) {
      if (q.ruolo === 'dettaglio') break;
      if (!scatti[q.ruolo]) return { ruolo: q.ruolo };
    }
    return scatti.dettagli.length < MAX_DETTAGLI ? { ruolo: 'dettaglio', indice: scatti.dettagli.length } : null;
  }, [scatti]);
  const fisseFatte = !!(scatti.esterno && scatti.interno && scatti.stipite);

  const scatta = (b: Bersaglio, daGalleria = false) => {
    bersaglio.current = b;
    const input = daGalleria ? galleria.current : camera.current;
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const ricevi = async (file: File | undefined) => {
    const b = bersaglio.current;
    if (!file || !b) return;
    setOccupato(true);
    try {
      const img = await apriScatto(file);
      if (b.ruolo === 'dettaglio') {
        const dettagli = [...scatti.dettagli];
        dettagli[Math.min(b.indice, dettagli.length)] = img;
        onCambia({ ...scatti, dettagli: dettagli.slice(0, MAX_DETTAGLI) });
      } else {
        onCambia({ ...scatti, [b.ruolo]: img });
      }
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Foto non leggibile.');
    } finally {
      setOccupato(false);
    }
  };

  const togli = (b: Bersaglio) => {
    if (b.ruolo === 'dettaglio') onCambia({ ...scatti, dettagli: scatti.dettagli.filter((_, i) => i !== b.indice) });
    else onCambia({ ...scatti, [b.ruolo]: null });
  };

  const titoloDi = (b: Bersaglio) => {
    const i = QUARTI.findIndex((q) => q.ruolo === b.ruolo);
    return b.ruolo === 'dettaglio'
      ? `${i + 1} · Dettaglio ${b.indice + 1} di ${MAX_DETTAGLI}`
      : `${i + 1} · ${QUARTI[i].titolo}`;
  };
  const istruzione = prossima
    ? QUARTI.find((q) => q.ruolo === prossima.ruolo)!.istruzione
    : 'Il foglio è completo. Tocca una foto per rifarla.';

  const strumenti = (b: Bersaglio) => (
    <span className="foto-porta-strumenti">
      <button type="button" className="btn icona" onClick={() => scatta(b)} aria-label={`Rifai: ${titoloDi(b)}`}>
        <Icona nome="fotocamera" dimensione={18} />
      </button>
      <button type="button" className="btn icona" onClick={() => togli(b)} aria-label={`Togli: ${titoloDi(b)}`}>
        <Icona nome="cestino" dimensione={18} />
      </button>
    </span>
  );

  return (
    <div className="foto-porta">
      <p className="foto-porta-intro">
        Prima di misurare, le foto della porta: finiscono insieme in un foglio A4 che resta nel progetto e nei PDF.
      </p>
      <div className="foto-porta-foglio" aria-label="Foglio A4 delle foto della porta">
        {QUARTI.map((q, i) => {
          if (q.ruolo === 'dettaglio') {
            const n = scatti.dettagli.length;
            return (
              <div key={q.ruolo} className={`foto-porta-quarto dettagli n${n}`}>
                {scatti.dettagli.map((img, j) => (
                  <div key={j} className="foto-porta-dettaglio">
                    <img src={anteprima(img)} alt={`Dettaglio ${j + 1}`} />
                    {strumenti({ ruolo: 'dettaglio', indice: j })}
                  </div>
                ))}
                {n === 0 && (
                  <button
                    type="button"
                    className="foto-porta-vuoto"
                    onClick={() => scatta({ ruolo: 'dettaglio', indice: 0 })}
                  >
                    <strong>{i + 1}</strong>
                    <span>{q.titolo}</span>
                    <small>fino a {MAX_DETTAGLI}, facoltativi</small>
                  </button>
                )}
                {n > 0 && n < MAX_DETTAGLI && (
                  <button
                    type="button"
                    className="btn icona foto-porta-piu"
                    onClick={() => scatta({ ruolo: 'dettaglio', indice: n })}
                    aria-label="Aggiungi un dettaglio"
                  >
                    <Icona nome="piu" dimensione={20} />
                  </button>
                )}
              </div>
            );
          }
          const img = scatti[q.ruolo];
          const b: Bersaglio = { ruolo: q.ruolo };
          const tocca = prossima?.ruolo === q.ruolo;
          return (
            <div key={q.ruolo} className={`foto-porta-quarto${tocca ? ' prossimo' : ''}`}>
              {img ? (
                <>
                  <img src={anteprima(img)} alt={q.titolo} />
                  <span className="foto-porta-titolo">
                    {i + 1} · {q.titolo}
                  </span>
                  {strumenti(b)}
                </>
              ) : (
                <button type="button" className="foto-porta-vuoto" onClick={() => scatta(b)}>
                  <strong>{i + 1}</strong>
                  <span>{q.titolo}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="foto-porta-istruzione">{istruzione}</p>
      <div className="foto-porta-azioni">
        {prossima && (
          <div className="foto-porta-scatta">
            <button
              type="button"
              className={`btn ${fisseFatte ? '' : 'primario'}`}
              disabled={occupato}
              onClick={() => scatta(prossima)}
            >
              <Icona nome="fotocamera" dimensione={20} />{' '}
              {occupato ? 'Preparo la foto…' : prossima.ruolo === 'dettaglio' ? 'Aggiungi un dettaglio' : `Scatta: ${titoloDi(prossima)}`}
            </button>
            <button type="button" className="btn" disabled={occupato} onClick={() => scatta(prossima, true)}>
              Dalla galleria
            </button>
          </div>
        )}
        <button type="button" className={`btn ${fisseFatte ? 'primario' : ''}`} onClick={onAvanti} disabled={occupato}>
          {contaScatti(scatti) === 0 ? 'Salta le foto' : testoAvanti}
        </button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void ricevi(e.target.files?.[0])}
      />
      <input ref={galleria} type="file" accept="image/*" hidden onChange={(e) => void ricevi(e.target.files?.[0])} />
    </div>
  );
}
