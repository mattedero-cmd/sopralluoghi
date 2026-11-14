/**
 * IL PRESET DEL LAVORO, APPLICATO.
 *
 * Il preset è un pugno di numeri nel progetto; qui c'è cosa ne fanno i tre
 * posti che lo leggono — la forma che nasce, la divisione in teli, il piano
 * di taglio — e stanno insieme perché la regola è una: il preset dà il
 * valore QUANDO LA COSA NASCE, e da lì in poi la lascia libera.
 *
 * I numeri del preset sono in MILLIMETRI, sempre. Una forma può essere
 * quotata in mm, cm o metri, e lo stesso preset deve valere per tutte: la
 * conversione si fa qui, nell'unità di chi chiede.
 */

import type {
  Annotazione,
  ID,
  MaterialePreset,
  PresetProgetto,
  QuotaPoligono,
  QuotaRettangolo,
  Unita
} from '../db/types';
import type { AssePannelli, Pannellizzazione, VersoSormonto } from '../geometry/pannelli';
import { giuntiAutomatici } from '../geometry/pannelli';
import { abbondanzeSullAsse, ePannellizzabile, formaDaDividere } from '../geometry/formaQuadrilatera';
import type { Foto } from '../db/types';
import type { AbbondanzeAiLati } from '../geometry/abbondanze';
import { conAbbondanzeAiLati } from '../geometry/abbondanze';
import { daMillimetri, formattaNumero } from './format';

/** il preset di partenza, quando il lavoro non ne ha ancora uno */
export const PRESET_INIZIALE: PresetProgetto &
  Required<Pick<PresetProgetto, 'supporto' | 'teli'>> = {
  abbPerimetroMm: 0,
  supporto: {
    modo: 'bobina',
    lastra: { larghezza: 2500, altezza: 1250 },
    bobina: { larghezza: 1370, metri: 50 },
    venatura: 'nessuna',
    lama: 0,
    margine: 10
  },
  teli: { sormontoMm: 10, verso: 'centro', asse: 'verticale', modo: 'fascia' }
};

/**
 * I MATERIALI DI PARTENZA, fra cui si sceglie nel preset di un lavoro
 * complesso. Sono le pellicole che si posano davvero; altri si aggiungono a
 * mano, col loro nome.
 */
export const MATERIALI_PREDEFINITI = ['Solare', 'Acidato', 'Sicurezza', 'Murales', 'Coverstyle'];

/** i materiali del lavoro, sempre un array (vuoto = il lavoro non li distingue) */
export function materialiDelPreset(preset: PresetProgetto | undefined): MaterialePreset[] {
  return (preset?.materiali ?? []).filter((m) => m.nome.trim());
}

/** il materiale con quell'id, se c'è ancora nel preset */
export function materialeDelPreset(
  preset: PresetProgetto | undefined,
  id: ID | undefined
): MaterialePreset | undefined {
  return id ? materialiDelPreset(preset).find((m) => m.id === id) : undefined;
}

/** il preset predefinito, senza la lista dei materiali */
function predefinito(preset: PresetProgetto | undefined): PresetProgetto | undefined {
  if (!preset) return undefined;
  const { materiali: _m, ...resto } = preset;
  return resto;
}

/**
 * IL PRESET DI UN MATERIALE: il suo, se ce l'ha; altrimenti il predefinito
 * del lavoro.
 *
 * È questo che leggono la forma che nasce (abbondanza), la divisione in teli
 * (fascia, sormonto, verso) e il piano di taglio (supporto). Senza materiale,
 * o con un materiale che non c'è più, è il predefinito. Un materiale salvato
 * con la sola bobina (1.96.0) ha il predefinito con quella bobina sopra.
 */
export function presetDelMateriale(
  preset: PresetProgetto | undefined,
  materialeId: ID | undefined
): PresetProgetto | undefined {
  const base = predefinito(preset);
  const m = materialeDelPreset(preset, materialeId);
  if (m?.preset) return { ...m.preset };
  if (m?.supporto) {
    return {
      ...(base ?? {}),
      supporto: {
        ...(base?.supporto ?? PRESET_INIZIALE.supporto),
        modo: m.supporto.modo,
        lastra: { ...m.supporto.lastra },
        bobina: { ...m.supporto.bobina }
      }
    };
  }
  return base;
}

/** il supporto di un materiale: quello del suo preset */
export function supportoDelMateriale(
  preset: PresetProgetto | undefined,
  materialeId: ID | undefined
): PresetProgetto['supporto'] {
  return presetDelMateriale(preset, materialeId)?.supporto;
}

/**
 * IL MATERIALE CHE UNA COSA NUOVA PRENDE NASCENDO.
 *
 * Quello scelto per ultimo, se è ancora nel preset: si lavora a stanze, e le
 * finestre di fila sono quasi sempre della stessa pellicola. Altrimenti il
 * primo. Senza materiali nel preset, nessuno.
 */
export function materialeDiNascita(
  preset: PresetProgetto | undefined,
  ultimo?: ID | null
): ID | undefined {
  const tutti = materialiDelPreset(preset);
  if (tutti.length === 0) return undefined;
  return tutti.find((m) => m.id === ultimo)?.id ?? tutti[0].id;
}

/** le forme che diventano pezzi: sono loro a portare un materiale */
export function portaMateriale(a: Annotazione): boolean {
  if (a.tipo === 'quotaPoligono') return !a.soloEtichetta;
  return a.tipo === 'quotaRett' || a.tipo === 'quotaRaggio';
}

/** i millesimi di millimetro sono il residuo di una divisione, non una misura */
const pulito = (v: number) => Math.round(v * 1e4) / 1e4;

/** la parte del preset che riguarda l'abbondanza, sola */
export type AbbondanzaPreset = Pick<
  PresetProgetto,
  | 'abbPerimetroMm'
  | 'abbSinistraMm'
  | 'abbDestraMm'
  | 'abbSopraMm'
  | 'abbSottoMm'
  | 'abbBaseMm'
  | 'abbAltezzaMm'
>;

/**
 * I QUATTRO NUMERI, quando l'abbondanza è detta lato per lato (in mm).
 *
 * `null` quando sono tutti a zero: allora comanda quella perimetrale, e il
 * preset è quello di prima.
 *
 * I due campi vecchi — base e altezza, da quando i numeri erano due — si
 * leggono ancora: la base era sinistra e destra insieme, l'altezza sopra e
 * sotto. Un preset salvato allora continua a valere senza che nessuno lo
 * riapra.
 */
export function abbAiLati(abb: AbbondanzaPreset | undefined): AbbondanzeAiLati | null {
  const n = (v: number | undefined, vecchio?: number) => Math.max(0, v ?? vecchio ?? 0);
  const lati: AbbondanzeAiLati = {
    sinistra: n(abb?.abbSinistraMm, abb?.abbBaseMm),
    destra: n(abb?.abbDestraMm, abb?.abbBaseMm),
    sopra: n(abb?.abbSopraMm, abb?.abbAltezzaMm),
    sotto: n(abb?.abbSottoMm, abb?.abbAltezzaMm)
  };
  return Object.values(lati).some((v) => v > 0) ? lati : null;
}

/** le abbondanze che una forma porta addosso, per vedere se qualcosa cambia */
function impronta(a: Annotazione): string {
  if (a.tipo !== 'quotaPoligono' && a.tipo !== 'quotaRett') return '';
  const segs =
    a.tipo === 'quotaPoligono'
      ? (a.segmenti ?? []).map((s) => [s.abbLato, s.abbInizio, s.abbFine])
      : [];
  return JSON.stringify([a.abbPerimetro, segs]);
}

/** vero se la forma porta già un'abbondanza sua, in uno qualunque dei tre modi */
function haGiaLaSua(a: Annotazione): boolean {
  if (a.tipo !== 'quotaPoligono' && a.tipo !== 'quotaRett') return false;
  if (a.abbPerimetro !== undefined) return true;
  if (a.tipo !== 'quotaPoligono') return false;
  return (a.segmenti ?? []).some(
    (s) => s.abbLato !== undefined || s.abbInizio !== undefined || s.abbFine !== undefined
  );
}

/** una forma quotata: le due che un'abbondanza la possono portare */
export type FormaQuotata = QuotaPoligono | QuotaRettangolo;

/** la forma ripulita da ogni abbondanza: da lì riparte chi riscrive tutto */
function senzaAbbondanze(a: FormaQuotata): FormaQuotata {
  if (a.tipo === 'quotaRett') {
    const { abbPerimetro: _giro, ...resto } = a;
    return resto;
  }
  const { abbPerimetro: _giro, ...resto } = a;
  const segmenti = a.segmenti?.map((s) => {
    const { abbLato: _l, abbInizio: _i, abbFine: _f, ...netto } = s;
    return netto;
  });
  return segmenti ? { ...resto, segmenti } : resto;
}

/**
 * L'ABBONDANZA DEL PRESET, SCRITTA SU UNA FORMA.
 *
 * Due numeri per base e altezza vanno sulle due quote della forma — è la
 * lingua del rettangolo, e tutto il resto dell'app la legge già. Un numero
 * solo va tutt'attorno, come ha sempre fatto. Su una polilinea, dove una
 * base non c'è, due numeri diventano il più grande dei due: meglio un
 * centimetro di pellicola in più da rifilare che un pezzo che non arriva.
 *
 * `forza` è il comando esplicito «applica a tutte»: cancella quello che
 * c'era e riscrive. Senza, la forma che porta già una sua abbondanza — in
 * uno qualunque dei tre modi — non si tocca.
 *
 * Torna `null` quando non c'è niente da cambiare.
 */
export function conAbbondanzaDelPreset(
  a: FormaQuotata,
  abb: AbbondanzaPreset | undefined,
  forza?: boolean
): FormaQuotata | null;
export function conAbbondanzaDelPreset(
  a: Annotazione,
  abb: AbbondanzaPreset | undefined,
  forza?: boolean
): Annotazione | null;
export function conAbbondanzaDelPreset(
  a: Annotazione,
  abb: AbbondanzaPreset | undefined,
  forza = false
): Annotazione | null {
  if (a.tipo !== 'quotaPoligono' && a.tipo !== 'quotaRett') return null;
  // una copia «solo etichetta» non ha lati suoi: la misura, e con lei
  // l'abbondanza, stanno sull'originale della famiglia
  if (a.tipo === 'quotaPoligono' && a.soloEtichetta) return null;
  if (!forza && haGiaLaSua(a)) return null;
  const lati = abbAiLati(abb);
  const giroMm = Math.max(0, abb?.abbPerimetroMm ?? 0);
  if (!lati && !(giroMm > 0) && !forza) return null;

  const nel = (mm: number) => pulito(daMillimetri(mm, a.unita));
  const nuda: FormaQuotata = forza ? senzaAbbondanze(a) : a;
  const cambiata = (f: Annotazione) => (impronta(a) === impronta(f) ? null : f);

  // lato per lato, dove un sopra e un sotto vogliono dire qualcosa: sulle quote
  if (lati && nuda.tipo === 'quotaPoligono') {
    const q: QuotaPoligono = nuda;
    const fatta = conAbbondanzeAiLati(q, {
      sinistra: nel(lati.sinistra),
      destra: nel(lati.destra),
      sopra: nel(lati.sopra),
      sotto: nel(lati.sotto)
    });
    if (fatta) return cambiata(fatta);
  }

  // altrimenti un numero solo, tutt'attorno
  const giro = lati ? Math.max(...Object.values(lati)) : giroMm;
  if (!(giro > 0)) return cambiata(nuda);
  return cambiata({ ...nuda, abbPerimetro: nel(giro) });
}

/**
 * LA FORMA APPENA NATA prende l'abbondanza del preset.
 *
 * Solo se non ne ha già una: una forma richiamata o duplicata porta la sua,
 * e il preset non è lì per cancellare quello che qualcuno ha deciso.
 */
export function conPresetApplicato(
  a: Annotazione,
  preset: PresetProgetto | undefined,
  /** il materiale scelto in questo momento (l'ultimo usato); assente = il primo */
  materiale?: ID | null
): Annotazione {
  // prima il materiale — solo se non ne porta già uno suo (una copia ha
  // quello dell'originale) e se il lavoro ne distingue — poi l'abbondanza,
  // che è quella del preset DI QUEL materiale
  let conMat = a;
  if (portaMateriale(a) && !materialeDelPreset(preset, a.materialeId)) {
    const id = materialeDiNascita(preset, materiale);
    if (id) conMat = { ...a, materialeId: id };
  }
  return conAbbondanzaDelPreset(conMat, presetDelMateriale(preset, conMat.materialeId), false) ?? conMat;
}

/**
 * IL MATERIALE DI UNA FORMA, CAMBIATO.
 *
 * Con il materiale cambia il preset, e l'abbondanza lo segue — ma solo se
 * era ancora quella del preset di prima: un'abbondanza scritta a mano sulla
 * forma resta sua, come sempre. La divisione in teli non si tocca: le
 * giunzioni spostate col dito non le rifà nessuno.
 */
export function conMaterialeCambiato(
  a: Annotazione,
  preset: PresetProgetto | undefined,
  materialeId: ID
): Annotazione {
  const conMat = { ...a, materialeId } as Annotazione;
  // `null` = la forma è già esattamente come la vorrebbe il preset di prima
  const toccataAMano = conAbbondanzaDelPreset(a, presetDelMateriale(preset, a.materialeId), true) !== null;
  if (toccataAMano) return conMat;
  return conAbbondanzaDelPreset(conMat, presetDelMateriale(preset, materialeId), true) ?? conMat;
}

/**
 * LA FASCIA UTILE DEL SUPPORTO, nell'unità della forma.
 *
 * È la larghezza che un telo non può superare: il supporto meno i due
 * margini. Serve alla divisione in teli FATTA SULLA FOTO — dalla pagina del
 * taglio la fascia si sapeva già, dalla foto no, e i teli nascevano «due
 * uguali», che quasi mai è la divisione vera.
 */
export function fasciaDelPreset(
  preset: PresetProgetto | undefined,
  unita: Unita,
  /** il materiale della forma: la fascia è quella della SUA bobina */
  materialeId?: ID
): { massimo?: number; fonteMassimo?: string } {
  const sup = supportoDelMateriale(preset, materialeId);
  if (!sup) return {};
  const m = materialeDelPreset(preset, materialeId);
  const nomeMat = m && (m.preset || m.supporto) ? m.nome : undefined;
  const pieno =
    sup.modo === 'bobina'
      ? sup.bobina.larghezza
      : Math.max(sup.lastra.larghezza, sup.lastra.altezza);
  const utile = pieno - 2 * (sup.margine ?? 0);
  if (!(utile > 0)) return {};
  return {
    massimo: pulito(daMillimetri(utile, unita)),
    fonteMassimo:
      (sup.modo === 'bobina' ? 'Bobina ' : 'Lastra ') +
      `${formattaNumero(pieno)} mm ${nomeMat ? `del ${nomeMat}` : 'del preset'}, meno i margini`
  };
}

/** da dove parte una divisione NUOVA: una già fatta comanda sempre lei */
export function predefinitiTeli(
  preset: PresetProgetto | undefined,
  unita: Unita,
  /** il materiale della forma: i teli sono quelli del SUO preset */
  materialeId?: ID
):
  | { sormonto: number; verso: VersoSormonto; asse: AssePannelli; modo: 'fascia' | 'uguali' }
  | undefined {
  const t = presetDelMateriale(preset, materialeId)?.teli;
  if (!t) return undefined;
  return {
    sormonto: pulito(daMillimetri(t.sormontoMm, unita)),
    verso: t.verso,
    asse: t.asse,
    modo: t.modo
  };
}

/** una riga sola che dice cosa c'è nel preset, per il tasto che lo apre */
export function riassuntoPreset(preset: PresetProgetto | undefined): string | null {
  if (!preset) return null;
  const voci: string[] = [];
  const lati = abbAiLati(preset);
  if (lati) {
    const cm = (v: number) => formattaNumero(v / 10);
    const tutti = new Set(Object.values(lati));
    if (tutti.size === 1) voci.push(`${cm(lati.sinistra)} cm attorno`);
    else if (lati.sinistra === lati.destra && lati.sopra === lati.sotto) {
      // le coppie a zero non si dicono: «0 sopra e sotto» è rumore
      const pezzi: string[] = [];
      if (lati.sinistra > 0) pezzi.push(`${cm(lati.sinistra)} cm di lato`);
      if (lati.sopra > 0) {
        pezzi.push(`${cm(lati.sopra)}${lati.sinistra > 0 ? '' : ' cm'} sopra e sotto`);
      }
      voci.push(pezzi.join(', '));
    } else {
      // quattro numeri diversi: senza dire quale è quale non vogliono dire niente
      voci.push(
        `sx ${cm(lati.sinistra)}, dx ${cm(lati.destra)}, sopra ${cm(lati.sopra)}, sotto ${cm(lati.sotto)} cm`
      );
    }
  } else if (preset.abbPerimetroMm) {
    voci.push(`${formattaNumero(preset.abbPerimetroMm / 10)} cm attorno`);
  }
  if (preset.supporto) {
    voci.push(
      preset.supporto.modo === 'bobina'
        ? `bobina ${formattaNumero(preset.supporto.bobina.larghezza)}`
        : `lastre ${formattaNumero(preset.supporto.lastra.larghezza)}×${formattaNumero(preset.supporto.lastra.altezza)}`
    );
  }
  const mat = materialiDelPreset(preset);
  if (mat.length) {
    // quelli col preset suo si segnano: il riassunto sopra è il predefinito
    voci.push(mat.map((m) => (m.preset || m.supporto ? `${m.nome} (preset suo)` : m.nome)).join(', '));
  }
  if (preset.teli) {
    voci.push(
      `teli ${preset.teli.asse === 'verticale' ? 'verticali' : 'orizzontali'}, sormonto ${formattaNumero(preset.teli.sormontoMm)} mm`
    );
  }
  return voci.length ? voci.join(' · ') : null;
}


/**
 * LA DIVISIONE IN TELI CHE IL PRESET CHIEDE, per una forma già disegnata.
 *
 * È lo stesso conto che fa l'ambiente dei teli quando lo si apre su una
 * forma mai divisa — stessa fascia, stesso sormonto, stesso verso, stesse
 * abbondanze ai capi — ma senza aprirlo. Serve al comando «applica tutto il
 * preset»: su un albergo da cinquanta stanze aprire ogni parete e rifare la
 * stessa divisione a mano è il lavoro che il preset doveva togliere.
 *
 * Il NUMERO dei teli qui lo decide la fascia, non il «due» di partenza del
 * dialogo: una finestra che entra nel rotolo non va divisa affatto, e una
 * parete da quattro metri va divisa in quanti ne servono. Senza un supporto
 * nel preset non c'è niente che dica quanti: torna `null`.
 *
 * `null` anche quando la forma non si divide — non è chiusa, non è quotata —
 * o quando ci sta in un telo solo. Chi scrive toglie allora la divisione che
 * c'era: «tutto come dice il preset» vuol dire anche questo.
 */
export function teliDelPreset(
  a: Annotazione,
  foto: Pick<Foto, 'scala' | 'piano' | 'piani'> | null,
  preset: PresetProgetto | undefined
): Pannellizzazione | null {
  const t = presetDelMateriale(preset, a.materialeId)?.teli;
  if (!t || !ePannellizzabile(a)) return null;
  const forma = formaDaDividere(a, foto);
  if (!forma) return null;
  const { massimo } = fasciaDelPreset(preset, forma.unita, a.materialeId);
  if (!massimo) return null;
  const sormonto = pulito(daMillimetri(t.sormontoMm, forma.unita));
  const totale = t.asse === 'verticale' ? forma.netta.larghezza : forma.netta.altezza;
  const giunti = giuntiAutomatici(totale, {
    massimo,
    numero: null,
    modo: t.modo,
    sormonto,
    verso: t.verso,
    abbondanze: abbondanzeSullAsse(forma, t.asse)
  });
  return giunti.length ? { asse: t.asse, sormonto, verso: t.verso, giunti } : null;
}
