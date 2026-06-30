import type { Foto, Punto, QuotaSingolaTecnica, Unita, VersoQuota } from '../db/types';
import { haCalibrazione, misuraSegmento } from './calibrazione';
import { dot, normalizza, sottrai } from './punti';

/**
 * Quotatura tecnica IN SERIE (catena di quote, §5.1 del briefing).
 *
 * La logica è puramente geometrica e isolata dal resto, così è testabile e
 * non tocca la quotatura base: l'utente posa N punti, il primo e l'ultimo
 * definiscono la GUIDA (direzione principale); i punti vengono ordinati lungo
 * la guida e ogni coppia consecutiva diventa una `QuotaSingolaTecnica`
 * allineata, posata su un'unica linea di quota a `offset` costante.
 *
 * Così la catena è SEMPRE perfettamente in linea (niente più catene spezzate
 * dall'inclinazione tra una quota e l'altra): la guida raddrizza tutto.
 */

type CalibFoto = Pick<Foto, 'scala' | 'piano'>;

/** Direzione principale della serie: versore dal primo all'ultimo punto. */
export function direzioneSerie(punti: Punto[]): Punto {
  if (punti.length < 2) return { x: 1, y: 0 };
  return normalizza(sottrai(punti[punti.length - 1], punti[0]));
}

/** Ascissa della proiezione di `p` sulla retta per `origine` con direzione `d`. */
export function ascissaSuGuida(p: Punto, origine: Punto, d: Punto): number {
  return dot(sottrai(p, origine), d);
}

/** Segno dell'offset lungo la normale sinistra n=(-dy,dx), in base al verso. */
export function segnoVerso(verso: VersoQuota): number {
  return verso === 'destra' || verso === 'fineGuida' ? -1 : 1;
}

export interface OpzioniSerie {
  unita: Unita;
  /** distanza (px immagine, sempre positiva) della linea di quota dai punti */
  offset: number;
  /** lato su cui collocare la linea di quota rispetto alla guida */
  verso: VersoQuota;
}

export interface RisultatoSerie {
  lineaGuida: { a: Punto; b: Punto };
  quote: QuotaSingolaTecnica[];
  /** punti riordinati lungo la guida */
  puntiOrdinati: Punto[];
}

/**
 * Genera la catena di quote in serie a partire dai punti posati.
 * Richiede almeno 2 punti; con meno, restituisce una catena vuota.
 */
export function generaSerie(
  puntiOriginali: Punto[],
  foto: CalibFoto,
  opts: OpzioniSerie
): RisultatoSerie {
  const origine = puntiOriginali[0] ?? { x: 0, y: 0 };
  const d = direzioneSerie(puntiOriginali);
  // ordinamento stabile per posizione lungo la guida
  const ordinati = puntiOriginali
    .map((p, i) => ({ p, i, t: ascissaSuGuida(p, origine, d) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((e) => e.p);

  const offsetSegnato = Math.abs(opts.offset) * segnoVerso(opts.verso);
  const calibrata = haCalibrazione(foto);
  const quote: QuotaSingolaTecnica[] = [];
  for (let i = 0; i < ordinati.length - 1; i++) {
    const p1 = ordinati[i];
    const p2 = ordinati[i + 1];
    quote.push({
      p1,
      p2,
      valore: calibrata ? misuraSegmento(p1, p2, foto, opts.unita) : null,
      orientamento: 'allineata',
      offset: offsetSegnato
    });
  }

  const a = ordinati[0] ?? origine;
  const b = ordinati[ordinati.length - 1] ?? origine;
  return { lineaGuida: { a, b }, quote, puntiOrdinati: ordinati };
}

/**
 * Ricalcola SOLO i valori reali delle quote esistenti (es. al cambio di
 * unità), mantenendo punti e offset. Una quota con valore manuale (quando la
 * serie non è più `valoreAuto`) viene comunque ricalcolata dal pixel: il
 * cambio di unità ridefinisce l'espressione di tutte le misure.
 */
export function ricalcolaValoriSerie(
  quote: QuotaSingolaTecnica[],
  foto: CalibFoto,
  unita: Unita
): QuotaSingolaTecnica[] {
  if (!haCalibrazione(foto)) return quote;
  return quote.map((q) => ({ ...q, valore: misuraSegmento(q.p1, q.p2, foto, unita) }));
}

/** Riassegna l'offset (magnitudine + verso) a tutte le quote della serie. */
export function applicaOffsetSerie(
  quote: QuotaSingolaTecnica[],
  offset: number,
  verso: VersoQuota
): QuotaSingolaTecnica[] {
  const segnato = Math.abs(offset) * segnoVerso(verso);
  return quote.map((q) => ({ ...q, offset: segnato }));
}
