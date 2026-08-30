/**
 * LA PANORAMICA, DALLO SCATTO ALLA FOTO.
 *
 * Tutto in una schermata sola, senza passare per la galleria del telefono:
 * si apre la fotocamera, si scatta quello che serve, si sceglie cosa tenere,
 * l'app cuce, e alla fine si ritaglia. Gli scatti non passano mai
 * dall'archivio: quelli che non si tengono non sono mai esistiti.
 */

import { useEffect, useRef, useState } from 'react';
import { Icona } from './Icona';
import { sovrapposizioneFra, cuciPanoramica, CucituraFallita, raddrizza, riquadroPieno } from '../utils/cucitura';
import type { Punto } from '../db/types';
import {
  maniglieDeiLatiQuad,
  quadConLato,
  quadConVertice,
  type Lato,
  type Quad
} from '../geometry/ritaglio';
import { mostraToast } from '../state/toast';

/** il colore dell'avviso: verde se si sta larghi, rosso se non si aggancia */
function classeDellaPresa(p: { quanta: number | null; attesa: boolean }): string {
  if (p.attesa) return 'attesa';
  if (p.quanta === null) return 'male';
  if (p.quanta < 0.45) return 'male';
  if (p.quanta < 0.6) return 'cosi';
  return 'bene';
}

interface Presa {
  blob: Blob;
  url: string;
  larghezza: number;
  altezza: number;
  tenuta: boolean;
}

type Fase = 'camera' | 'scelta' | 'lavoro' | 'ritaglio';

/**
 * ACCENDE LA FOTOCAMERA, e va chiamata DENTRO il gesto del dito.
 *
 * Su iPhone il permesso si chiede solo mentre l'attivazione dell'utente è
 * ancora valida: partendo da un effetto di React — che gira dopo che la
 * schermata è stata disegnata — il permesso risulta negato senza che nessuno
 * abbia chiesto niente. Per questo la richiesta parte dal `onClick` del
 * pulsante e la promessa viene passata di qua.
 */
export interface Obiettivo {
  deviceId: string;
  /** come si chiama sul telefono */
  etichetta: string;
  /** il numerino da mostrare: 0,5×, 1×, 5×… */
  segno: string;
  /** per metterli in ordine dal più largo al più stretto */
  ordine: number;
  /** true per il teleobiettivo, di cui il fattore non si sa finché non si sa */
  tele?: boolean;
}

/**
 * IL FATTORE DEL TELEOBIETTIVO, quando lo si è saputo.
 *
 * Non si può indovinare: sul 16 Pro è 5×, su altri modelli 2× o 3×, e il
 * sistema non lo dice. Scriverci un numero a caso sarebbe peggio che non
 * scriverne nessuno — chi misura si fida dei numeri che l'app stampa. Lo si
 * chiede una volta a chi il telefono ce l'ha in mano, e non si chiede più.
 */
const CHIAVE_TELE = 'panoramica.fattoreTele.';

export function fattoreTeleSalvato(deviceId: string): number | null {
  try {
    const v = Number(localStorage.getItem(CHIAVE_TELE + deviceId));
    return Number.isFinite(v) && v > 1 ? v : null;
  } catch {
    return null;
  }
}

export function salvaFattoreTele(deviceId: string, fattore: number): void {
  try {
    localStorage.setItem(CHIAVE_TELE + deviceId, String(fattore));
  } catch {
    // niente memoria locale: si richiederà la prossima volta, pazienza
  }
}

/**
 * Il fattore che il SISTEMA dichiara, se lo dichiara.
 *
 * Alcuni telefoni espongono l'ingrandimento fra le capacità della traccia
 * video: quando c'è, è la verità e non c'è niente da chiedere a nessuno.
 */
export function fattoreDichiarato(flusso: MediaStream): number | null {
  const t = flusso.getVideoTracks()[0] as unknown as
    | { getCapabilities?: () => { zoom?: { max?: number } } }
    | undefined;
  const z = t?.getCapabilities?.().zoom;
  const max = z?.max;
  return typeof max === 'number' && max > 1 && max < 100 ? max : null;
}

/**
 * GLI OBIETTIVI POSTERIORI del telefono, con il loro numerino.
 *
 * Le etichette le scrive il sistema, nella lingua del telefono: si riconosce
 * l'ultra-grandangolo e il teleobiettivo dalle parole, e tutto il resto è il
 * grandangolo normale. Se il sistema non dà nomi — capita finché non si è
 * concesso il permesso — non c'è niente da scegliere e non si mostra nulla.
 */
export async function obiettiviPosteriori(): Promise<Obiettivo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const tutti = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return scegliObiettivi(tutti.filter((d) => d.kind === 'videoinput' && d.label));
}

/**
 * UNO PER OBIETTIVO VERO, non uno per voce dell'elenco.
 *
 * Il telefono non elenca le sue tre fotocamere: elenca anche le fotocamere
 * FINTE che le combinano — «posteriore», «posteriore doppia», «posteriore
 * tripla» — e sono tutte grandangolo. Prenderle per buone riempie la fila di
 * 1× identici e inutili (visto: 0,5× 1× 1× 1× 1× 2×). Si raggruppa allora per
 * ruolo, e di ogni ruolo si tiene UNA voce sola, preferendo l'obiettivo
 * fisico a quello composito.
 *
 * E il numerino del teleobiettivo non si inventa: sul 16 Pro è 5×, su altri
 * 2× o 3×, e il sistema non lo dice. Scriverci «2×» sarebbe una bugia
 * comoda — si scrive «Tele».
 */
export function scegliObiettivi(
  dispositivi: Array<{ deviceId: string; label: string }>
): Obiettivo[] {
  const davanti = /front|frontale|anteriore|face|selfie/i;
  const dietro = dispositivi.filter((d) => !davanti.test(d.label));
  const lista = dietro.length > 0 ? dietro : dispositivi;
  /** le fotocamere finte che ne combinano due o tre */
  const composita = /dual|triple|doppia|tripla|dual wide/i;

  const ruoli: Array<{ segno: string; ordine: number; quale: RegExp }> = [
    { segno: '0,5×', ordine: 0, quale: /ultra/i },
    { segno: 'Tele', ordine: 2, quale: /tele/i }
  ];
  const fuori: Obiettivo[] = [];
  const presi = new Set<string>();
  for (const r of ruoli) {
    const candidati = lista.filter((d) => r.quale.test(d.label));
    if (candidati.length === 0) continue;
    const scelto = candidati.find((d) => !composita.test(d.label)) ?? candidati[0];
    presi.add(scelto.deviceId);
    fuori.push({
      deviceId: scelto.deviceId,
      etichetta: scelto.label,
      segno: r.segno,
      ordine: r.ordine,
      tele: r.ordine === 2
    });
  }
  // IL GRANDANGOLO: tutto quello che resta, e qui la scelta conta. La voce
  // generica («Fotocamera posteriore», «Back Camera») è la fotocamera VIRTUALE
  // che cambia obiettivo da sola secondo la luce e la distanza: in una
  // panoramica cambierebbe focale fra uno scatto e l'altro senza dire niente.
  // Si preferisce quindi il grandangolo dichiarato, poi qualunque voce non
  // composita, e solo per ultimo la generica.
  const resto = lista.filter((d) => !presi.has(d.deviceId) && !/ultra|tele/i.test(d.label));
  const voto = (d: { label: string }) => {
    const fisico = /grandangolo|wide/i.test(d.label) && !composita.test(d.label);
    if (fisico) return 0;
    return composita.test(d.label) ? 2 : 1;
  };
  const grande = [...resto].sort((a, b) => voto(a) - voto(b))[0];
  if (grande) {
    fuori.push({ deviceId: grande.deviceId, etichetta: grande.label, segno: '1×', ordine: 1 });
  }
  // un obiettivo solo non è una scelta: non si mostra la fila
  if (fuori.length < 2) return [];
  return fuori
    .map((o) => {
      if (!o.tele) return o;
      const noto = fattoreTeleSalvato(o.deviceId);
      return noto ? { ...o, segno: `${String(noto).replace('.', ',')}×` } : o;
    })
    .sort((a, b) => a.ordine - b.ordine);
}

/**
 * La definizione con cui si APRE la fotocamera. Non è il massimo apposta:
 * chiedere dodici megapixel nell'istante in cui la fotocamera si accende è
 * il momento peggiore per farlo, e su iPhone la scheda si chiude. Il massimo
 * si chiede DOPO, a flusso avviato, con `allaMassimaDefinizione`.
 */
const APERTURA = 1920;
/** e questo è il massimo che si prova a ottenere, a preview già in piedi */
const MASSIMO = 4096;

export function chiediFotocamera(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('senza-fotocamera'));
  }
  const misura = { width: { ideal: APERTURA }, height: { ideal: APERTURA } };
  return navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId }, ...misura }
      : { facingMode: { ideal: 'environment' }, ...misura },
    audio: false
  });
}

/**
 * ALZA LA DEFINIZIONE a flusso già avviato.
 *
 * Una panoramica serve a vedere PIÙ dettaglio, non meno: la definizione piena
 * la vogliamo. Ma chiederla all'accensione fa cadere Safari, quindi si accende
 * piano e si alza dopo, quando la preview è già in piedi. Se il telefono non
 * la dà, si resta con quella d'apertura e si scrive quanto si è ottenuto: è
 * un numero che chi misura ha il diritto di sapere.
 */
export async function allaMassimaDefinizione(flusso: MediaStream): Promise<void> {
  const t = flusso.getVideoTracks()[0];
  if (!t?.applyConstraints) return;
  try {
    await t.applyConstraints({ width: { ideal: MASSIMO }, height: { ideal: MASSIMO } });
  } catch {
    // il telefono non sale più di così: va benissimo lo stesso
  }
}

/** Il perché di un rifiuto, detto in modo che si possa rimediare. */
export function perchéNiente(e: unknown): string {
  const nome = e instanceof DOMException ? e.name : e instanceof Error ? e.message : '';
  if (nome === 'senza-fotocamera') {
    return 'Questo browser non dà accesso alla fotocamera. Serve una connessione sicura (https) e un browser recente.';
  }
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'Permesso della fotocamera negato. Su iPhone: tocca «aA» nella barra dell’indirizzo → Impostazioni sito web → Fotocamera → Consenti. Se hai aggiunto l’app alla schermata Home, il permesso si chiede una volta sola: togli l’icona e riaggiungila.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
    return 'Nessuna fotocamera trovata su questo dispositivo.';
  }
  if (nome === 'NotReadableError' || nome === 'AbortError') {
    return 'La fotocamera è occupata da un’altra app: chiudila e riprova.';
  }
  return 'Fotocamera non disponibile.';
}

export function Panoramica({
  richiesta,
  onFatta,
  onChiudi
}: {
  /** la fotocamera già chiesta nel gesto del dito, se si è potuto */
  richiesta: Promise<MediaStream> | null;
  /** la panoramica finita: si salva fuori di qui */
  onFatta: (blob: Blob, scatti: number, larghezza: number, altezza: number) => Promise<void>;
  onChiudi: () => void;
}) {
  const [fase, setFase] = useState<Fase>('camera');
  const [prese, setPrese] = useState<Presa[]>([]);
  const [lavoro, setLavoro] = useState({ quota: 0, cosa: '' });
  const [cucita, setCucita] = useState<{
    url: string;
    w: number;
    h: number;
    scatti: number;
    copertura: { dati: Uint8ClampedArray; larghezza: number; altezza: number } | null;
  } | null>(null);
  const preseRef = useRef<Presa[]>([]);
  preseRef.current = prese;

  // gli oggetti URL vanno liberati, o restano in memoria per tutta la sessione
  useEffect(
    () => () => {
      for (const p of preseRef.current) URL.revokeObjectURL(p.url);
    },
    []
  );

  const scelte = prese.filter((p) => p.tenuta);

  const cuci = async () => {
    if (scelte.length < 2) {
      mostraToast('info', 'Servono almeno due scatti per una panoramica.');
      return;
    }
    setFase('lavoro');
    try {
      const esito = await cuciPanoramica(
        scelte.map((s) => s.blob),
        { avanzamento: (quota, cosa) => setLavoro({ quota, cosa }) }
      );
      setCucita({
        url: URL.createObjectURL(esito.blob),
        w: esito.larghezza,
        h: esito.altezza,
        scatti: esito.scatti,
        copertura: esito.copertura
      });
      mostraToast(
        'successo',
        `Cucita: ${esito.larghezza}×${esito.altezza} px, giunzioni entro ` +
          `${Math.max(...esito.errori).toFixed(1)} px.`
      );
      setFase('ritaglio');
    } catch (e) {
      mostraToast(
        'errore',
        e instanceof CucituraFallita || e instanceof Error ? e.message : 'Panoramica non riuscita.'
      );
      setFase('scelta');
    }
  };

  return (
    <div className="pano-schermo">
      {fase === 'camera' && (
        <Fotocamera
          richiesta={richiesta}
          prese={prese}
          onScatto={(p) => setPrese((v) => [...v, p])}
          onFine={() => setFase(prese.length >= 2 ? 'scelta' : 'camera')}
          onAnnulla={onChiudi}
        />
      )}

      {fase === 'scelta' && (
        <Scelta
          prese={prese}
          onCambia={(i) =>
            setPrese((v) => v.map((p, k) => (k === i ? { ...p, tenuta: !p.tenuta } : p)))
          }
          onAncora={() => setFase('camera')}
          onCuci={() => void cuci()}
          onAnnulla={onChiudi}
        />
      )}

      {fase === 'lavoro' && (
        <div className="pano-lavoro">
          <h2>Cucio la panoramica</h2>
          <p className="aiuto">{lavoro.cosa}…</p>
          <div className="barra-avanzamento">
            <div className="riempimento" style={{ width: `${Math.round(lavoro.quota * 100)}%` }} />
          </div>
        </div>
      )}

      {fase === 'ritaglio' && cucita && (
        <Ritaglio
          url={cucita.url}
          larghezza={cucita.w}
          altezza={cucita.h}
          copertura={cucita.copertura}
          onFatto={async (blob, w, h) => {
            await onFatta(blob, cucita.scatti, w, h);
            onChiudi();
          }}
          onAnnulla={onChiudi}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. La fotocamera
// ---------------------------------------------------------------------------

function Fotocamera({
  richiesta,
  prese,
  onScatto,
  onFine,
  onAnnulla
}: {
  richiesta: Promise<MediaStream> | null;
  prese: Presa[];
  onScatto: (p: Presa) => void;
  onFine: () => void;
  onAnnulla: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flusso = useRef<MediaStream | null>(null);
  const [pronta, setPronta] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [misura, setMisura] = useState<string>('');
  const [scattando, setScattando] = useState(false);
  const [obiettivi, setObiettivi] = useState<Obiettivo[]>([]);
  const [attivo, setAttivo] = useState<string | null>(null);
  /** il teleobiettivo di cui non si sa ancora l'ingrandimento */
  const [chiediTele, setChiediTele] = useState<string | null>(null);
  const galleria = useRef<HTMLInputElement>(null);
  /** quanto l'ultimo scatto si sovrappone al precedente: si guarda subito */
  const [presa, setPresa] = useState<{ quanta: number | null; attesa: boolean } | null>(null);

  const mostraMisura = (s: MediaStream) => {
    const g = s.getVideoTracks()[0]?.getSettings();
    if (g?.width && g?.height) setMisura(`${g.width}×${g.height}`);
    if (g?.deviceId) setAttivo(g.deviceId);
  };

  const attacca = async (s: MediaStream) => {
    for (const t of flusso.current?.getTracks() ?? []) t.stop();
    flusso.current = s;
    if (video.current) {
      video.current.srcObject = s;
      await video.current.play().catch(() => {});
    }
    mostraMisura(s);
    setErrore(null);
    setPronta(true);
    // i nomi degli obiettivi il sistema li dà solo dopo il permesso
    setObiettivi(await obiettiviPosteriori());
    // e solo adesso, con la preview già in piedi, si chiede la definizione
    // piena: chiederla all'accensione fa cadere la scheda su iPhone
    await allaMassimaDefinizione(s);
    if (flusso.current !== s) return;
    mostraMisura(s);
    // IL FATTORE DEL TELEOBIETTIVO: prima si guarda se il sistema lo dichiara,
    // e allora è verità; se non lo dichiara e non lo si è già saputo, lo si
    // chiede una volta a chi il telefono ce l'ha in mano
    const id = s.getVideoTracks()[0]?.getSettings().deviceId;
    const suo = obiettivi.find((o) => o.deviceId === id) ?? (await obiettiviPosteriori()).find((o) => o.deviceId === id);
    if (id && suo?.tele && !fattoreTeleSalvato(id)) {
      const dichiarato = fattoreDichiarato(s);
      if (dichiarato) {
        salvaFattoreTele(id, Math.round(dichiarato * 10) / 10);
        setObiettivi(await obiettiviPosteriori());
      } else {
        setChiediTele(id);
      }
    }
  };

  /**
   * CAMBIA OBIETTIVO. Si può solo PRIMA del primo scatto: mescolare un
   * ultra-grandangolo e un teleobiettivo nella stessa panoramica si può
   * cucire — le due viste restano legate da un'omografia — ma un pezzo
   * verrebbe da un decimo dei pixel dell'altro, e in quel pezzo le misure
   * varrebbero un decimo. Meglio impedirlo che spiegarlo dopo.
   */
  const cambiaObiettivo = async (deviceId: string) => {
    if (prese.length > 0 || deviceId === attivo) return;
    setPronta(false);
    try {
      await attacca(await chiediFotocamera(deviceId));
    } catch (e) {
      setErrore(perchéNiente(e));
    }
  };

  useEffect(() => {
    let vivo = true;
    if (!richiesta) {
      setErrore(perchéNiente(new Error('senza-fotocamera')));
      return;
    }
    richiesta
      .then((s) => {
        if (!vivo) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        void attacca(s);
      })
      .catch((e) => {
        if (vivo) setErrore(perchéNiente(e));
      });
    return () => {
      vivo = false;
      for (const t of flusso.current?.getTracks() ?? []) t.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richiesta]);

  /** RIPROVA, questa volta con il dito ancora sul vetro: è ciò che iOS vuole */
  const riprova = async () => {
    try {
      await attacca(await chiediFotocamera());
    } catch (e) {
      setErrore(perchéNiente(e));
    }
  };

  const scatta = async () => {
    const v = video.current;
    if (!v || !v.videoWidth || scattando) return;
    setScattando(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.94));
      if (!blob) return;
      const prima = prese[prese.length - 1];
      onScatto({
        blob,
        url: URL.createObjectURL(blob),
        larghezza: canvas.width,
        altezza: canvas.height,
        tenuta: true
      });
      // SI GUARDA SUBITO se questo scatto si aggancia al precedente, e quanto.
      // Dopo, a casa, non si può più rimediare: qui basta rifarlo mezzo passo
      // indietro. Il conto gira per conto suo e non blocca l'otturatore.
      if (prima) {
        setPresa({ quanta: null, attesa: true });
        void sovrapposizioneFra(prima.blob, blob)
          .then((q) => setPresa({ quanta: q, attesa: false }))
          .catch(() => setPresa(null));
      }
    } finally {
      setTimeout(() => setScattando(false), 250);
    }
  };

  /** DALLA GALLERIA: se la fotocamera non si apre, la panoramica si fa lo
   *  stesso con gli scatti fatti dall'app fotocamera del telefono. */
  const daGalleria = async (files: File[]) => {
    for (const f of files) {
      const bitmap = await createImageBitmap(f).catch(() => null);
      onScatto({
        blob: f,
        url: URL.createObjectURL(f),
        larghezza: bitmap?.width ?? 0,
        altezza: bitmap?.height ?? 0,
        tenuta: true
      });
      bitmap?.close?.();
    }
  };

  return (
    <>
      <div className="pano-mirino">
        <video ref={video} playsInline muted autoPlay />
        {errore && (
          <div className="pano-errore">
            <p>{errore}</p>
            <div className="riga-pulsanti" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="btn primario" onClick={() => void riprova()}>
                <Icona nome="fotocamera" dimensione={18} /> Riprova
              </button>
              <button className="btn" onClick={() => galleria.current?.click()}>
                <Icona nome="immagine" dimensione={18} /> Dalla galleria
              </button>
            </div>
          </div>
        )}
        {!errore && !pronta && <div className="pano-errore">Accendo la fotocamera…</div>}
        {scattando && <div className="pano-lampo" />}
        {obiettivi.length > 1 && !errore && (
          <div className="pano-obiettivi">
            {obiettivi.map((o) => (
              <button
                key={o.deviceId}
                className={`pano-obiettivo${o.deviceId === attivo ? ' attivo' : ''}`}
                title={o.etichetta}
                disabled={prese.length > 0}
                onClick={() => void cambiaObiettivo(o.deviceId)}
              >
                {o.segno}
              </button>
            ))}
          </div>
        )}
        {chiediTele && (
          <div className="pano-chiedi">
            <p>Quanto ingrandisce questo obiettivo?</p>
            <div className="pano-chiedi-scelte">
              {[2, 2.5, 3, 5, 10].map((k) => (
                <button
                  key={k}
                  onClick={async () => {
                    salvaFattoreTele(chiediTele, k);
                    setChiediTele(null);
                    setObiettivi(await obiettiviPosteriori());
                  }}
                >
                  {String(k).replace('.', ',')}×
                </button>
              ))}
            </div>
            <button className="pano-chiedi-salta" onClick={() => setChiediTele(null)}>
              Non lo so
            </button>
          </div>
        )}
        {obiettivi.length > 1 && prese.length > 0 && (
          <div className="pano-obiettivi-bloccati">
            L’obiettivo si sceglie prima del primo scatto
          </div>
        )}
        {presa && (
          <div className={`pano-presa ${classeDellaPresa(presa)}`}>
            {presa.attesa
              ? 'Controllo la sovrapposizione…'
              : presa.quanta === null
                ? 'Questo scatto NON si aggancia al precedente: rifallo più vicino.'
                : presa.quanta < 0.45
                  ? `Poca sovrapposizione (${Math.round(presa.quanta * 100)}%): torna indietro di mezzo passo.`
                  : presa.quanta < 0.6
                    ? `Sovrapposizione ${Math.round(presa.quanta * 100)}%: stringi il passo, su una fila lunga si vede.`
                    : `Buona sovrapposizione (${Math.round(presa.quanta * 100)}%).`}
          </div>
        )}
      </div>

      <input
        ref={galleria}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          // i file si copiano PRIMA di azzerare il campo: svuotarlo svuota
          // anche la FileList, e la funzione asincrona non troverebbe niente
          const scelti = Array.from(e.target.files ?? []);
          e.target.value = '';
          void daGalleria(scelti);
        }}
      />

      <div className="pano-striscia">
        {prese.length === 0 ? (
          <span className="aiuto">
            Sovrapponi almeno DUE TERZI fra uno scatto e il successivo: è quello che tiene
            dritta una fila lunga. Davanti a una facciata piatta puoi camminare di lato; se
            invece inquadri roba vicina e roba lontana insieme, gira sui piedi senza spostarti.
          </span>
        ) : (
          prese.map((p, i) => (
            <img key={p.url} src={p.url} alt={`Scatto ${i + 1}`} className="pano-mini" />
          ))
        )}
      </div>

      <div className="pano-comandi">
        <button className="btn" onClick={onAnnulla}>
          Annulla
        </button>
        <button
          className="pano-otturatore"
          onClick={() => void scatta()}
          disabled={!pronta || !!errore}
          aria-label="Scatta"
        >
          <span />
        </button>
        <button className="btn primario" onClick={onFine} disabled={prese.length < 2}>
          Fine ({prese.length})
        </button>
      </div>
      {misura && <div className="pano-misura">Scatti da {misura} px</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. La scelta
// ---------------------------------------------------------------------------

function Scelta({
  prese,
  onCambia,
  onAncora,
  onCuci,
  onAnnulla
}: {
  prese: Presa[];
  onCambia: (i: number) => void;
  onAncora: () => void;
  onCuci: () => void;
  onAnnulla: () => void;
}) {
  const tenuti = prese.filter((p) => p.tenuta).length;
  return (
    <>
      <div className="pano-testa">
        <h2>Quali scatti tengo</h2>
        <p className="aiuto">
          Tocca uno scatto per escluderlo. Quelli esclusi vengono buttati: non entrano
          nell’archivio. Devono restare in fila, da un capo all’altro.
        </p>
      </div>
      <div className="pano-griglia">
        {prese.map((p, i) => (
          <button
            key={p.url}
            className={`pano-scelta${p.tenuta ? ' tenuta' : ''}`}
            onClick={() => onCambia(i)}
          >
            <img src={p.url} alt={`Scatto ${i + 1}`} />
            <span className="pano-numero">{i + 1}</span>
            {p.tenuta && (
              <span className="pano-spunta">
                <Icona nome="check" dimensione={18} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="pano-comandi">
        <button className="btn" onClick={onAnnulla}>
          Annulla
        </button>
        <button className="btn" onClick={onAncora}>
          <Icona nome="fotocamera" dimensione={18} /> Ancora
        </button>
        <button className="btn primario" onClick={onCuci} disabled={tenuti < 2}>
          Cuci ({tenuti})
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Il ritaglio
// ---------------------------------------------------------------------------

function Ritaglio({
  url,
  larghezza,
  altezza,
  copertura,
  onFatto,
  onAnnulla
}: {
  url: string;
  larghezza: number;
  altezza: number;
  copertura: { dati: Uint8ClampedArray; larghezza: number; altezza: number } | null;
  onFatto: (blob: Blob, w: number, h: number) => Promise<void>;
  onAnnulla: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const immagine = useRef<HTMLImageElement | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  /** cosa si sta trascinando: un angolo o un lato */
  const [preso, setPreso] = useState<{ cosa: 'angolo' | 'lato'; i: number } | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [vista, setVista] = useState({ scala: 1, x: 0, y: 0 });

  // il punto di partenza: il rettangolo più grande dentro la parte coperta
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      immagine.current = img;
      if (!copertura) {
        setQuad([
          { x: 0, y: 0 },
          { x: larghezza, y: 0 },
          { x: larghezza, y: altezza },
          { x: 0, y: altezza }
        ]);
        return;
      }
      const r = riquadroPieno(copertura.dati, copertura.larghezza, copertura.altezza);
      // la maschera è più piccola della foto: si riporta alla scala vera
      const kx = larghezza / copertura.larghezza;
      const ky = altezza / copertura.altezza;
      setQuad([
        { x: r.x * kx, y: r.y * ky },
        { x: (r.x + r.larghezza) * kx, y: r.y * ky },
        { x: (r.x + r.larghezza) * kx, y: (r.y + r.altezza) * ky },
        { x: r.x * kx, y: (r.y + r.altezza) * ky }
      ]);
    };
    img.src = url;
  }, [url, larghezza, altezza, copertura]);

  // come l'immagine sta nel riquadro: serve a convertire dito → pixel foto
  useEffect(() => {
    const misura = () => {
      const b = box.current?.getBoundingClientRect();
      if (!b) return;
      // un margine attorno: le maniglie dei quattro angoli devono restare
      // afferrabili anche quando il ritaglio arriva al bordo della foto
      const margine = 30;
      const scala = Math.min(
        (b.width - margine * 2) / larghezza,
        (b.height - margine * 2) / altezza
      );
      setVista({
        scala,
        x: (b.width - larghezza * scala) / 2,
        y: (b.height - altezza * scala) / 2
      });
    };
    misura();
    window.addEventListener('resize', misura);
    return () => window.removeEventListener('resize', misura);
  }, [larghezza, altezza]);

  const daSchermo = (e: React.PointerEvent): Punto => {
    const b = box.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(larghezza, (e.clientX - b.left - vista.x) / vista.scala)),
      y: Math.max(0, Math.min(altezza, (e.clientY - b.top - vista.y) / vista.scala))
    };
  };

  const applica = async (tuttoIntero: boolean) => {
    if (!immagine.current || !quad) return;
    setInCorso(true);
    try {
      const scelto: Quad = tuttoIntero
        ? [
            { x: 0, y: 0 },
            { x: larghezza, y: 0 },
            { x: larghezza, y: altezza },
            { x: 0, y: altezza }
          ]
        : quad;
      const r = await raddrizza(immagine.current, larghezza, altezza, scelto);
      await onFatto(r.blob, r.larghezza, r.altezza);
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Ritaglio non riuscito.');
      setInCorso(false);
    }
  };

  return (
    <>
      <div className="pano-testa">
        <h2>Ritaglia e raddrizza</h2>
        <p className="aiuto">
          <strong>Gli angoli</strong> mettono la prospettiva: portali sugli spigoli del muro e
          quel muro lo vedrai di fronte. <strong>I lati</strong> invece non la toccano: allargano
          o stringono l’inquadratura seguendo la fuga. Le misure restano valide comunque.
        </p>
      </div>
      <div
        className="pano-tela"
        ref={box}
        onPointerMove={(e) => {
          if (!preso || !quad) return;
          const p = daSchermo(e);
          if (preso.cosa === 'angolo') setQuad(quadConVertice(quad, preso.i, p));
          else {
            // il lato scivola seguendo la fuga: la prospettiva non si tocca
            const nuovo = quadConLato(quad, preso.i as Lato, p);
            if (nuovo) setQuad(nuovo);
          }
        }}
        onPointerUp={() => setPreso(null)}
        onPointerCancel={() => setPreso(null)}
      >
        <img
          src={url}
          alt="Panoramica"
          style={{
            position: 'absolute',
            left: vista.x,
            top: vista.y,
            width: larghezza * vista.scala,
            height: altezza * vista.scala
          }}
        />
        {quad && (
          <>
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              pointerEvents="none"
            >
              <polygon
                points={quad
                  .map((p) => `${p.x * vista.scala + vista.x},${p.y * vista.scala + vista.y}`)
                  .join(' ')}
                fill="rgba(47,129,247,0.12)"
                stroke="#2f81f7"
                strokeWidth={2}
              />
            </svg>
            {quad.map((p, i) => (
              <div
                key={`a${i}`}
                className={`pano-maniglia${
                  preso?.cosa === 'angolo' && preso.i === i ? ' presa' : ''
                }`}
                style={{
                  left: p.x * vista.scala + vista.x,
                  top: p.y * vista.scala + vista.y
                }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setPreso({ cosa: 'angolo', i });
                }}
              />
            ))}
            {(maniglieDeiLatiQuad(quad) ?? []).map((p, i) => (
              <div
                key={`l${i}`}
                className={`pano-maniglia lato${i % 2 === 0 ? ' orizzontale' : ' verticale'}${
                  preso?.cosa === 'lato' && preso.i === i ? ' presa' : ''
                }`}
                style={{
                  left: p.x * vista.scala + vista.x,
                  top: p.y * vista.scala + vista.y
                }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setPreso({ cosa: 'lato', i });
                }}
              />
            ))}
          </>
        )}
      </div>
      <div className="pano-comandi">
        <button className="btn" onClick={onAnnulla} disabled={inCorso}>
          Annulla
        </button>
        <button className="btn" onClick={() => void applica(true)} disabled={inCorso}>
          Tieni tutta
        </button>
        <button
          className="btn primario"
          onClick={() => void applica(false)}
          disabled={inCorso || !quad}
        >
          <Icona nome="check" dimensione={18} /> {inCorso ? 'Salvo…' : 'Salva'}
        </button>
      </div>
    </>
  );
}
