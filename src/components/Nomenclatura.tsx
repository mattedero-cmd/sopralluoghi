/**
 * LA NOMENCLATURA DEL SOPRALLUOGO, tutta su una schermata.
 *
 * Le lettere delle foto (A, B, C…) le dà l'ORDINE in cui sono state scattate,
 * e in un albergo l'ordine degli scatti è l'ordine in cui le stanze erano
 * libere. A lavoro finito la parete A sta nella stanza 3 e la C nella stanza
 * 1: per sapere dove va un telo serve il progetto cartaceo in mano.
 *
 * Il guaio non era la regola — l'ordine è l'unica cosa che l'app può sapere da
 * sola — ma che le lettere non si vedevano e non si toccavano: stavano dentro
 * una foto per volta, in fondo alle sue note. Qui ci sono tutte, con la
 * miniatura e il nome accanto, e si correggono guardandole.
 *
 * Due comandi fanno il lavoro grosso:
 * - «prendi i nomi»: il nome di ogni foto diventa il suo codice, e visto che
 *   il nome è il numero della stanza le misure diventano 307.1, 307.2;
 * - «rimetti le lettere»: si torna ad A, B, C, in un colpo.
 *
 * E con le frecce si riordinano: chi preferisce le lettere corte le mette in
 * fila giusta, e nel PDF le pagine escono in quell'ordine.
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { riordinaFoto, scriviEtichetteFoto } from '../db/repository';
import { ImmagineBlob, Modale } from './comuni';
import { Icona } from './Icona';
import { mostraToast } from '../state/toast';
import {
  MAX_ETICHETTA_FOTO,
  codiceBase,
  codiceCompletoForma,
  eFormaEtichettabile,
  etichettaDalNome,
  etichetteFotoDelProgetto,
  percorsoDellaFoto
} from '../geometry/nomenclatura';
import type { Foto, Progetto } from '../db/types';

export function Nomenclatura({
  progetto,
  onChiudi
}: {
  progetto: Progetto;
  onChiudi: () => void;
}) {
  const foto = useLiveQuery(
    async () =>
      (await db.foto.where('progettoId').equals(progetto.id).toArray())
        .filter((f) => !f.ePianta)
        .sort((a, b) => a.ordine - b.ordine),
    [progetto.id]
  );
  const cartelle = useLiveQuery(() => db.cartelle.toArray(), []);
  /** quante forme quotate porta ogni foto: sono quelle che prendono il codice */
  const misure = useLiveQuery(async () => {
    const lista = await db.foto.where('progettoId').equals(progetto.id).toArray();
    const conto = new Map<string, number>();
    for (const f of lista) {
      const ann = await db.annotazioni.where('fotoId').equals(f.id).toArray();
      conto.set(f.id, ann.filter(eFormaEtichettabile).length);
    }
    return conto;
  }, [progetto.id]);

  /** il testo che si sta battendo, foto per foto: il salvataggio è all'uscita */
  const [bozza, setBozza] = useState<Record<string, string>>({});
  const [inCorso, setInCorso] = useState(false);

  if (!foto) return null;

  // la lettera che tornerebbe lasciando il campo vuoto: la si mostra come
  // segnaposto, così si sa sempre cosa si sta sostituendo
  const automatiche = etichetteFotoDelProgetto(
    foto.map((f) => ({ ...f, etichetta: undefined })),
    progetto,
    cartelle ?? []
  );

  const valore = (f: Foto) => bozza[f.id] ?? f.etichetta ?? '';
  const scrivi = (f: Foto, t: string) => setBozza((b) => ({ ...b, [f.id]: t }));
  const salva = (f: Foto) => {
    const t = (bozza[f.id] ?? '').trim();
    if (bozza[f.id] === undefined || t === (f.etichetta ?? '')) return;
    void scriviEtichetteFoto([{ id: f.id, etichetta: t || undefined }]);
  };

  /** «2 misure · prima: 307.1», oppure che di misure non ce ne sono */
  const quanteMisure = (f: Foto) => {
    const n = misure?.get(f.id) ?? 0;
    if (n === 0) return 'nessuna misura';
    return `${n} ${n === 1 ? 'misura' : 'misure'} · prima: ${esempio(f)}`;
  };

  /** il codice che prenderebbe la prima misura di questa foto */
  const esempio = (f: Foto) => {
    const et = (bozza[f.id] ?? f.etichetta ?? '').trim() || automatiche.get(f.id) || 'A';
    return codiceCompletoForma(
      percorsoDellaFoto(f, progetto, cartelle ?? []),
      codiceBase(et, 1)
    );
  };

  const prendiINomi = async () => {
    const modifiche: Array<{ id: string; etichetta: string | undefined }> = [];
    let saltate = 0;
    for (const f of foto) {
      const et = etichettaDalNome(f.didascalia);
      if (et === null) {
        saltate++;
        continue;
      }
      if (et !== (f.etichetta ?? '')) modifiche.push({ id: f.id, etichetta: et });
    }
    if (modifiche.length === 0 && saltate === 0) {
      mostraToast('info', 'I codici sono già i nomi delle foto.');
      return;
    }
    setInCorso(true);
    try {
      await scriviEtichetteFoto(modifiche);
      setBozza({});
      mostraToast(
        saltate > 0 ? 'info' : 'successo',
        `${modifiche.length} ${modifiche.length === 1 ? 'foto presa' : 'foto prese'} dal nome` +
          (saltate > 0
            ? `; ${saltate} saltate perché il nome non è un codice corto: scrivile qui.`
            : '.')
      );
    } finally {
      setInCorso(false);
    }
  };

  const rimettiLeLettere = async () => {
    const modifiche = foto
      .filter((f) => f.etichetta !== undefined)
      .map((f) => ({ id: f.id, etichetta: undefined }));
    if (modifiche.length === 0) {
      mostraToast('info', 'Le lettere sono già quelle automatiche.');
      return;
    }
    setInCorso(true);
    try {
      await scriviEtichetteFoto(modifiche);
      setBozza({});
      mostraToast('successo', `Tornate le lettere automatiche su ${modifiche.length} foto.`);
    } finally {
      setInCorso(false);
    }
  };

  /**
   * I GRUPPI IN CUI LE LETTERE RIPARTONO: una sezione etichettata è un
   * capitolo a sé, e spostare una foto da un capitolo all'altro non si fa da
   * qui. Le frecce muovono dentro il gruppo, che è l'unico posto dove
   * l'ordine conta per le lettere.
   */
  const sezioni = [...(progetto.sezioni ?? [])].sort((a, b) => a.ordine - b.ordine);
  const gruppi: Array<{ titolo: string | null; etichetta?: string; lista: Foto[] }> = [
    ...sezioni.map((s) => ({
      titolo: s.nome,
      etichetta: s.etichetta,
      lista: foto.filter((f) => f.sezioneId === s.id)
    })),
    { titolo: null, lista: foto.filter((f) => !sezioni.some((s) => s.id === f.sezioneId)) }
  ].filter((g) => g.lista.length > 0);

  const sposta = async (gruppo: Foto[], i: number, verso: -1 | 1) => {
    const j = i + verso;
    if (j < 0 || j >= gruppo.length) return;
    const nuovo = [...gruppo];
    [nuovo[i], nuovo[j]] = [nuovo[j], nuovo[i]];
    // si riscrive l'ordine di TUTTO il progetto: i gruppi restano dove sono,
    // dentro il suo le foto seguono le frecce
    const idsGruppo = new Set(gruppo.map((f) => f.id));
    let k = 0;
    const tutte = foto.map((f) => (idsGruppo.has(f.id) ? nuovo[k++] : f));
    await riordinaFoto(tutte.map((f) => f.id));
  };

  const quante = foto.length;
  const conEtichetta = foto.filter((f) => f.etichetta).length;

  return (
    <Modale titolo="Nomenclatura del sopralluogo" onChiudi={onChiudi}>
      <p className="aiuto" style={{ marginTop: 0 }}>
        Il codice di una misura comincia con quello della sua foto: <b>A1</b>, <b>A2</b>… Col
        numero della stanza al posto della lettera diventa <b>307.1</b>, e sul telo si legge dove
        va. Due foto con lo stesso codice numerano insieme: le pareti di una stanza sola.
      </p>
      <div className="riga-pulsanti" style={{ margin: '12px 0' }}>
        <button className="btn primario" disabled={inCorso} onClick={() => void prendiINomi()}>
          <Icona nome="matita" dimensione={18} /> Prendi i nomi
        </button>
        <button className="btn" disabled={inCorso || conEtichetta === 0} onClick={() => void rimettiLeLettere()}>
          <Icona nome="indietro" dimensione={18} /> Rimetti le lettere
        </button>
      </div>

      {quante === 0 && <p className="aiuto">Nessuna foto in questo sopralluogo.</p>}

      {gruppi.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 14 }}>
          {g.titolo && (
            <h3 style={{ fontSize: 15, margin: '10px 0 6px', display: 'flex', gap: 8, alignItems: 'center' }}>
              {g.titolo}
              {g.etichetta && <span className="badge-etichetta">{g.etichetta}</span>}
            </h3>
          )}
          {g.lista.map((f, i) => (
            <div key={f.id} className="riga-nome">
              <span className="frecce">
                <button
                  className="btn icona"
                  aria-label={`Sposta su ${f.didascalia || 'foto'}`}
                  disabled={i === 0}
                  onClick={() => void sposta(g.lista, i, -1)}
                >
                  ↑
                </button>
                <button
                  className="btn icona"
                  aria-label={`Sposta giù ${f.didascalia || 'foto'}`}
                  disabled={i === g.lista.length - 1}
                  onClick={() => void sposta(g.lista, i, 1)}
                >
                  ↓
                </button>
              </span>
              <span className="mini">
                <ImmagineBlob
                  dati={f.miniatura}
                  tipo={f.miniaturaTipo}
                  alt={f.didascalia || 'Foto'}
                />
              </span>
              <span className="chi">
                <span className="nome">
                  {f.didascalia || <span style={{ color: 'var(--testo-2)' }}>senza nome</span>}
                </span>
                <span className="sotto">{quanteMisure(f)}</span>
              </span>
              <input
                className="input-misura"
                value={valore(f)}
                maxLength={MAX_ETICHETTA_FOTO}
                placeholder={automatiche.get(f.id) ?? 'A'}
                aria-label={`Codice della foto ${f.didascalia || ''}`}
                onChange={(e) => scrivi(f, e.target.value)}
                onBlur={() => salva(f)}
              />
            </div>
          ))}
        </div>
      ))}

      <p className="aiuto" style={{ marginTop: 12 }}>
        Campo vuoto = lettera automatica, dall'ordine delle foto (le frecce lo cambiano, e il PDF
        segue). Il codice entra nel report, nella distinta, sui teli e nei nomi dei file dello ZIP:
        non è scritto da nessuna parte, si ricalcola, quindi puoi cambiarlo quando vuoi.
      </p>
      <div className="azioni">
        <button className="btn primario" onClick={onChiudi}>
          Fine
        </button>
      </div>
    </Modale>
  );
}
