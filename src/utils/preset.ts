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

import type { Annotazione, PresetProgetto, Unita } from '../db/types';
import type { AssePannelli, VersoSormonto } from '../geometry/pannelli';
import { daMillimetri, formattaNumero } from './format';

/** il preset di partenza, quando il lavoro non ne ha ancora uno */
export const PRESET_INIZIALE: Required<PresetProgetto> = {
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

/** i millesimi di millimetro sono il residuo di una divisione, non una misura */
const pulito = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * LA FORMA APPENA NATA prende l'abbondanza del preset.
 *
 * Solo se non ne ha già una: una forma richiamata o duplicata porta la sua,
 * e il preset non è lì per cancellare quello che qualcuno ha deciso.
 */
export function conPresetApplicato(a: Annotazione, preset: PresetProgetto | undefined): Annotazione {
  const mm = preset?.abbPerimetroMm ?? 0;
  if (!(mm > 0)) return a;
  if (a.tipo !== 'quotaPoligono' && a.tipo !== 'quotaRett') return a;
  if (a.abbPerimetro !== undefined) return a;
  return { ...a, abbPerimetro: pulito(daMillimetri(mm, a.unita)) };
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
  unita: Unita
): { massimo?: number; fonteMassimo?: string } {
  const sup = preset?.supporto;
  if (!sup) return {};
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
      `${formattaNumero(pieno)} mm del preset, meno i margini`
  };
}

/** da dove parte una divisione NUOVA: una già fatta comanda sempre lei */
export function predefinitiTeli(
  preset: PresetProgetto | undefined,
  unita: Unita
):
  | { sormonto: number; verso: VersoSormonto; asse: AssePannelli; modo: 'fascia' | 'uguali' }
  | undefined {
  const t = preset?.teli;
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
  if (preset.abbPerimetroMm) voci.push(`${formattaNumero(preset.abbPerimetroMm / 10)} cm attorno`);
  if (preset.supporto) {
    voci.push(
      preset.supporto.modo === 'bobina'
        ? `bobina ${formattaNumero(preset.supporto.bobina.larghezza)}`
        : `lastre ${formattaNumero(preset.supporto.lastra.larghezza)}×${formattaNumero(preset.supporto.lastra.altezza)}`
    );
  }
  if (preset.teli) {
    voci.push(
      `teli ${preset.teli.asse === 'verticale' ? 'verticali' : 'orizzontali'}, sormonto ${formattaNumero(preset.teli.sormontoMm)} mm`
    );
  }
  return voci.length ? voci.join(' · ') : null;
}
