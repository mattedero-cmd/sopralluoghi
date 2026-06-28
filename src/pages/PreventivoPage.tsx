import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Annotazione, Foto, Preventivo, StatoPreventivo, VocePreventivo } from '../db/types';
import { segmentiPoligono, segmentoELato } from '../db/types';
import { areaReale, perimetroReale } from '../geometry/calibrazione';
import { nomeFormaPoligono } from '../geometry/primitive';
import { famigliaDi, numeriProgetto } from '../geometry/nomenclatura';
import { aggiornaPreventivo, eliminaPreventivo } from '../db/repository';
import { calcolaTotali, nomeRegime } from '../fiscale/calcolo';
import type { RegimeFiscale } from '../db/types';
import { nuovoId } from '../utils/id';
import { naviga } from '../router';
import { ConfermaDialog, StatoApp, type RichiestaConferma } from '../components/comuni';
import { SelettoreCliente } from './ClientiPage';
import { mostraToast } from '../state/toast';
import { condividiOScarica, nomeFileSicuro } from '../utils/share';
import { Icona } from '../components/Icona';
import {
  analizzaMisura,
  formattaNumero,
  aInputDataOra,
  daInputDataOra,
  inMillimetri
} from '../utils/format';

const euro = (v: number) =>
  `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATI_PREVENTIVO: { v: StatoPreventivo; testo: string; classe: string }[] = [
  { v: 'bozza', testo: 'Bozza', classe: 'bozza' },
  { v: 'pronto', testo: 'Pronto', classe: 'in_corso' },
  { v: 'inviato', testo: 'Inviato', classe: 'in_corso' },
  { v: 'accettato', testo: 'Accettato', classe: 'completato' },
  { v: 'rifiutato', testo: 'Rifiutato', classe: 'rifiutato' },
  { v: 'annullato', testo: 'Annullato', classe: 'rifiutato' },
  { v: 'lavoro', testo: 'In lavorazione', classe: 'completato' }
];

export function EtichettaStatoPreventivo({ stato }: { stato: StatoPreventivo }) {
  const s = STATI_PREVENTIVO.find((x) => x.v === stato) ?? STATI_PREVENTIVO[0];
  return <span className={`badge ${s.classe}`}>{s.testo}</span>;
}

export function PreventivoPage({ id }: { id: string }) {
  // caricato una sola volta: questa pagina è l'unico editor del preventivo
  const [preventivo, setPreventivo] = useState<Preventivo | null | undefined>(undefined);
  const [conferma, setConferma] = useState<RichiestaConferma | null>(null);
  const [scegliCliente, setScegliCliente] = useState(false);
  const [pdfInCorso, setPdfInCorso] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let attivo = true;
    db.preventivi.get(id).then((p) => attivo && setPreventivo(p ?? null));
    return () => {
      attivo = false;
    };
  }, [id]);

  const cliente = useLiveQuery(
    async () => (preventivo?.clienteId ? await db.clienti.get(preventivo.clienteId) : null),
    [preventivo?.clienteId]
  );
  const progetto = useLiveQuery(
    async () => (preventivo?.progettoId ? await db.progetti.get(preventivo.progettoId) : null),
    [preventivo?.progettoId]
  );

  /** autosave con debounce breve: ogni modifica viene persistita */
  const applica = useCallback(
    (modifiche: Partial<Preventivo>) => {
      setPreventivo((prev) => {
        if (!prev) return prev;
        const nuovo = { ...prev, ...modifiche };
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          void aggiornaPreventivo(prev.id, modifiche);
        }, 350);
        return nuovo;
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  if (preventivo === undefined) return <div className="app" />;
  if (preventivo === null) {
    return (
      <div className="app">
        <header className="barra">
          <button className="btn icona" onClick={() => history.back()}>
            <Icona nome="indietro" />
          </button>
          <h1>Preventivo non trovato</h1>
        </header>
      </div>
    );
  }

  const totali = calcolaTotali(preventivo);
  const regime: RegimeFiscale = preventivo.regime ?? 'forfettario';

  const aggiornaVoce = (voceId: string, modifiche: Partial<VocePreventivo>) => {
    applica({
      voci: preventivo.voci.map((v) => (v.id === voceId ? { ...v, ...modifiche } : v))
    });
  };

  const aggiungiVoce = () => {
    applica({
      voci: [
        ...preventivo.voci,
        { id: nuovoId(), descrizione: '', quantita: 1, unita: 'corpo', prezzoUnitario: 0 }
      ]
    });
  };

  const importaMisure = async () => {
    if (!preventivo.progettoId) return;
    const fotoList = (
      await db.foto.where('progettoId').equals(preventivo.progettoId).toArray()
    ).sort((a, b) => a.ordine - b.ordine);

    // carica tutte le annotazioni del progetto con la loro foto
    const voci: { a: Annotazione; foto: Foto; nomeFoto: string }[] = [];
    for (const [i, f] of fotoList.entries()) {
      const annotazioni = (await db.annotazioni.where('fotoId').equals(f.id).toArray()).sort(
        (x, y) => x.zIndex - y.zIndex
      );
      const nomeFoto = f.didascalia || `Foto ${i + 1}`;
      for (const a of annotazioni) voci.push({ a, foto: f, nomeFoto });
    }

    // quanti elementi per ogni famiglia (originale + copie richiamate)
    const contaFamiglia = new Map<string, number>();
    for (const { a } of voci) {
      if (a.tipo === 'quotaPoligono') {
        contaFamiglia.set(famigliaDi(a), (contaFamiglia.get(famigliaDi(a)) ?? 0) + 1);
      }
    }

    // numerazione del progetto: per dare a ogni voce il codice della misura (A1…)
    const annPerFoto = new Map<string, Annotazione[]>();
    for (const { a, foto } of voci) {
      if (!annPerFoto.has(foto.id)) annPerFoto.set(foto.id, []);
      annPerFoto.get(foto.id)!.push(a);
    }
    const numeri = numeriProgetto(fotoList, (id) => annPerFoto.get(id) ?? []);

    const nuove: VocePreventivo[] = [];
    const arr2 = (x: number) => Math.round(x * 100) / 100;
    for (const { a, foto, nomeFoto } of voci) {
      if (a.tipo === 'quota' && a.valore !== null) {
        nuove.push({
          id: nuovoId(),
          descrizione: `${nomeFoto} — misura ${a.stato === 'stimata' ? '(stimata)' : ''}`.trim(),
          quantita: a.valore,
          unita: a.unita,
          prezzoUnitario: 0
        });
      } else if (a.tipo === 'quotaRaggio' && a.valore !== null) {
        nuove.push({
          id: nuovoId(),
          descrizione: `${nomeFoto} — ${a.modo === 'diametro' ? 'diametro' : 'raggio'}`,
          quantita: a.valore,
          unita: a.unita,
          prezzoUnitario: 0
        });
      } else if (a.tipo === 'quotaPoligono') {
        // elementi/poligoni (rettangoli, vetrine…): si tiene l'ORIGINALE della
        // famiglia (le copie richiamate sono solo etichette, senza geometria).
        // PREZZO A CORPO: quantità = numero di pezzi, prezzo per pezzo; nella
        // descrizione la dimensione e la superficie del SINGOLO elemento.
        if (a.soloEtichetta) continue;
        const n = contaFamiglia.get(famigliaDi(a)) ?? 1;
        const info = numeri.get(a.id);
        const codice = info ? ` ${info.etichettaFoto}${info.numero}` : '';
        const nVert = a.punti.length;
        const dim = segmentiPoligono(a)
          .filter((s) => segmentoELato(s, nVert))
          .map((s) => (s.valore === null ? '?' : formattaNumero(s.valore)))
          .join(' × ');
        const area = areaReale(a, foto);
        const perim = perimetroReale(a);
        const mis = area
          ? `${formattaNumero(area.m2)} m²/cad.`
          : perim !== null
            ? `perim. ${formattaNumero(perim)} ${a.unita}`
            : '';
        const dettaglio = [dim ? `${dim} ${a.unita}` : '', mis].filter(Boolean).join(' · ');
        const descr = `${nomeFoto} —${codice} ${nomeFormaPoligono(a)}${dettaglio ? ` · ${dettaglio}` : ''}`.replace(
          /\s+/g,
          ' '
        );
        nuove.push({ id: nuovoId(), descrizione: descr, quantita: n, unita: 'pz', prezzoUnitario: 0 });
      } else if (a.tipo === 'quotaRett' && a.valoreBase !== null && a.valoreAltezza !== null) {
        const areaMq =
          (inMillimetri(a.valoreBase, a.unita) / 1000) * (inMillimetri(a.valoreAltezza, a.unita) / 1000);
        nuove.push({
          id: nuovoId(),
          descrizione: `${nomeFoto} — elemento ${a.etichetta ?? ''} ${formattaNumero(a.valoreBase)} × ${formattaNumero(a.valoreAltezza)} ${a.unita}`.replace(/\s+/g, ' '),
          quantita: arr2(areaMq),
          unita: 'm²',
          prezzoUnitario: 0
        });
      }
    }
    if (nuove.length === 0) {
      mostraToast(
        'info',
        'Nessuna misura utilizzabile trovata nel sopralluogo collegato. Verifica che le quote abbiano un valore e una calibrazione.'
      );
      return;
    }
    applica({ voci: [...preventivo.voci, ...nuove] });
    mostraToast('successo', `${nuove.length} misure importate dal sopralluogo.`);
  };

  const generaPdf = async () => {
    setPdfInCorso(true);
    try {
      const { generaPdfPreventivo } = await import('../pdf/preventivo');
      const blob = await generaPdfPreventivo(preventivo, cliente ?? null, progetto ?? null);
      await condividiOScarica(
        blob,
        nomeFileSicuro(`preventivo_${preventivo.numero}`, 'pdf'),
        `Preventivo ${preventivo.numero}`
      );
    } catch (e) {
      mostraToast('errore', e instanceof Error ? e.message : 'Generazione PDF non riuscita.');
    } finally {
      setPdfInCorso(false);
    }
  };

  return (
    <div className="app">
      <header className="barra">
        <button
          className="btn icona"
          aria-label="Indietro"
          onClick={() => {
            if (preventivo.progettoId) naviga({ nome: 'progetto', id: preventivo.progettoId });
            else if (preventivo.clienteId) naviga({ nome: 'cliente', id: preventivo.clienteId });
            else naviga({ nome: 'archivio', cartellaId: null });
          }}
        >
          <Icona nome="indietro" />
        </button>
        <h1>Preventivo {preventivo.numero}</h1>
        <StatoApp />
      </header>
      <main className="contenuto">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="campo" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}>
            <label>Numero</label>
            <input value={preventivo.numero} onChange={(e) => applica({ numero: e.target.value })} />
          </div>
          <div className="campo" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            <label>Data</label>
            <input
              type="datetime-local"
              value={aInputDataOra(preventivo.data)}
              onChange={(e) => {
                const t = daInputDataOra(e.target.value);
                if (t !== null) applica({ data: t });
              }}
            />
          </div>
          <div className="campo" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}>
            <label>Stato</label>
            <select
              value={preventivo.stato}
              onChange={(e) => applica({ stato: e.target.value as StatoPreventivo })}
            >
              {STATI_PREVENTIVO.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.testo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="scheda" onClick={() => setScegliCliente(true)}>
          <span className="glifo verde">
            <Icona nome="persona" dimensione={20} />
          </span>
          <span className="corpo">
            <div className="titolo">{cliente ? cliente.nome : 'Nessun cliente collegato'}</div>
            <div className="sotto">Tocca per scegliere dall'anagrafica</div>
          </span>
        </button>
        {progetto && (
          <button className="scheda" onClick={() => naviga({ nome: 'progetto', id: progetto.id })}>
            <span className="glifo">
              <Icona nome="progetto" dimensione={20} />
            </span>
            <span className="corpo">
              <div className="titolo">{progetto.nome}</div>
              <div className="sotto">Sopralluogo di riferimento</div>
            </span>
          </button>
        )}

        <h2>Voci ({preventivo.voci.length})</h2>
        {preventivo.voci.map((v, i) => (
          <div
            key={v.id}
            style={{
              background: 'var(--sfondo-2)',
              border: '1px solid var(--bordo)',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: 'var(--testo-2)', fontWeight: 700 }}>{i + 1}.</span>
              <input
                style={{ flex: 1, minHeight: 44, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--bordo)', background: 'var(--sfondo)' }}
                placeholder="Descrizione"
                value={v.descrizione}
                onChange={(e) => aggiornaVoce(v.id, { descrizione: e.target.value })}
              />
              <button
                className="btn icona"
                aria-label="Elimina voce"
                onClick={() => applica({ voci: preventivo.voci.filter((x) => x.id !== v.id) })}
              >
                <Icona nome="cestino" dimensione={20} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <CampoNumero etichetta="Q.tà" valore={v.quantita} onCambia={(n) => aggiornaVoce(v.id, { quantita: n })} />
              <input
                style={{ width: 80, minHeight: 44, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--bordo)', background: 'var(--sfondo)' }}
                placeholder="U.M."
                aria-label="Unità di misura"
                value={v.unita}
                onChange={(e) => aggiornaVoce(v.id, { unita: e.target.value })}
              />
              <CampoNumero etichetta="€/unità" valore={v.prezzoUnitario} onCambia={(n) => aggiornaVoce(v.id, { prezzoUnitario: n })} />
              <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                {euro(v.quantita * v.prezzoUnitario)}
              </span>
            </div>
          </div>
        ))}

        <div className="riga-pulsanti" style={{ marginBottom: 18 }}>
          <button className="btn" onClick={aggiungiVoce}>
            <Icona nome="piu" dimensione={20} /> Voce
          </button>
          {preventivo.progettoId && (
            <button className="btn" onClick={() => void importaMisure()}>
              <Icona nome="righello" dimensione={19} /> Importa misure
            </button>
          )}
        </div>

        {/* Regime fiscale del documento */}
        <div className="campo">
          <label>Regime fiscale</label>
          <span className="segmenti" role="group">
            {(['forfettario', 'semplificato', 'ordinario'] as const).map((r) => (
              <button key={r} className={regime === r ? 'attivo' : ''} onClick={() => applica({ regime: r })}>
                {nomeRegime(r)}
              </button>
            ))}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <CampoNumero etichetta="Sconto %" valore={preventivo.scontoPercento} onCambia={(n) => applica({ scontoPercento: n })} />
          {totali.conIva && (
            <CampoNumero etichetta="IVA % doc." valore={preventivo.ivaPercento} onCambia={(n) => applica({ ivaPercento: n })} />
          )}
        </div>

        {totali.conIva && (
          <div className="fisc-toggle-riga">
            <ToggleFisc
              testo="Ritenuta d’acconto"
              attiva={!!preventivo.ritenutaAttiva}
              perc={preventivo.ritenutaPercento ?? 20}
              onToggle={() => applica({ ritenutaAttiva: !preventivo.ritenutaAttiva })}
              onPerc={(n) => applica({ ritenutaPercento: n })}
            />
            <ToggleFisc
              testo="Cassa / rivalsa"
              attiva={!!preventivo.cassaAttiva}
              perc={preventivo.cassaPercento ?? 4}
              onToggle={() => applica({ cassaAttiva: !preventivo.cassaAttiva })}
              onPerc={(n) => applica({ cassaPercento: n })}
            />
          </div>
        )}

        <label className="fisc-check">
          <input
            type="checkbox"
            checked={!!preventivo.bolloAttiva}
            onChange={() =>
              applica({ bolloAttiva: !preventivo.bolloAttiva, bolloImporto: preventivo.bolloImporto || 2 })
            }
          />
          Marca da bollo ({euro(preventivo.bolloImporto ?? 2)})
        </label>

        {/* Totali, adattati al regime */}
        <div className="totali-card">
          {totali.sconto > 0 ? (
            <>
              <RigaTot k="Subtotale" v={euro(totali.lordo)} />
              <RigaTot k={`Sconto`} v={`− ${euro(totali.sconto)}`} />
              <RigaTot k="Imponibile" v={euro(totali.imponibile)} />
            </>
          ) : (
            <RigaTot k="Imponibile" v={euro(totali.imponibile)} />
          )}
          {totali.cassa > 0 && (
            <RigaTot k={`Cassa ${formattaNumero(preventivo.cassaPercento ?? 0)}%`} v={euro(totali.cassa)} />
          )}
          {totali.conIva && <RigaTot k={`IVA ${formattaNumero(preventivo.ivaPercento)}%`} v={euro(totali.iva)} />}
          {totali.bollo > 0 && <RigaTot k="Marca da bollo" v={`+ ${euro(totali.bollo)}`} bollo />}
          <RigaTot k="Totale" v={euro(totali.totale)} forte />
          {totali.ritenuta > 0 && (
            <>
              <RigaTot k={`Ritenuta ${formattaNumero(preventivo.ritenutaPercento ?? 0)}%`} v={`− ${euro(totali.ritenuta)}`} />
              <RigaTot k="Netto a incassare" v={euro(totali.netto)} forte />
            </>
          )}
          {!totali.conIva && <div className="fisc-nota">IVA non applicata — regime forfettario</div>}
        </div>

        <div className="campo" style={{ marginTop: 16 }}>
          <label>Note e condizioni (compaiono nel PDF)</label>
          <textarea value={preventivo.note} onChange={(e) => applica({ note: e.target.value })} rows={3} />
        </div>

        <div className="riga-pulsanti">
          <button className="btn primario" disabled={pdfInCorso} onClick={() => void generaPdf()}>
            <Icona nome="documento" dimensione={19} /> PDF preventivo
          </button>
          <button
            className="btn pericolo"
            onClick={() =>
              setConferma({
                titolo: `Eliminare il preventivo ${preventivo.numero}?`,
                messaggio: 'L’operazione NON è annullabile.',
                onConferma: () => {
                  void eliminaPreventivo(preventivo.id).then(() => {
                    if (preventivo.progettoId) naviga({ nome: 'progetto', id: preventivo.progettoId });
                    else naviga({ nome: 'archivio', cartellaId: null });
                  });
                }
              })
            }
          >
            <Icona nome="cestino" dimensione={19} /> Elimina
          </button>
        </div>
      </main>
      {scegliCliente && (
        <SelettoreCliente
          onChiudi={() => setScegliCliente(false)}
          onScegli={(c) => applica({ clienteId: c?.id ?? null })}
        />
      )}
      <ConfermaDialog richiesta={conferma} onChiudi={() => setConferma(null)} />
    </div>
  );
}

/** Input numerico tollerante (virgola o punto), salva solo valori validi */
/** Riga del riepilogo totali (chiave a sx, valore a dx) */
function RigaTot({ k, v, forte, bollo }: { k: string; v: string; forte?: boolean; bollo?: boolean }) {
  return (
    <div className={`riga-tot${forte ? ' forte' : ''}${bollo ? ' bollo' : ''}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** Interruttore fiscale con percentuale (ritenuta, cassa…) */
function ToggleFisc({
  testo,
  attiva,
  perc,
  onToggle,
  onPerc
}: {
  testo: string;
  attiva: boolean;
  perc: number;
  onToggle: () => void;
  onPerc: (n: number) => void;
}) {
  return (
    <div className={`fisc-toggle${attiva ? ' on' : ''}`}>
      <label>
        <input type="checkbox" checked={attiva} onChange={onToggle} />
        {testo}
      </label>
      {attiva && <CampoNumero etichetta="%" valore={perc} onCambia={onPerc} />}
    </div>
  );
}

function CampoNumero({
  etichetta,
  valore,
  onCambia
}: {
  etichetta: string;
  valore: number;
  onCambia: (n: number) => void;
}) {
  const [testo, setTesto] = useState(String(valore).replace('.', ','));
  const valoreRef = useRef(valore);
  useEffect(() => {
    if (valore !== valoreRef.current) {
      valoreRef.current = valore;
      setTesto(String(valore).replace('.', ','));
    }
  }, [valore]);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--testo-2)', fontSize: 14 }}>
      {etichetta}
      <input
        style={{ width: 90, minHeight: 44, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--bordo)', background: 'var(--sfondo)', fontWeight: 700 }}
        inputMode="decimal"
        value={testo}
        onChange={(e) => {
          setTesto(e.target.value);
          const n = analizzaMisura(e.target.value);
          if (n !== null) {
            valoreRef.current = n;
            onCambia(n);
          }
        }}
      />
    </label>
  );
}
