import type { Foto, Punto, QuotaSingolaTecnica, QuotaTecnica, Unita, VersoQuota } from '../db/types';
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

/** Ordina i punti lungo la guida (primo→ultimo). */
function ordinaLungoGuida(punti: Punto[]): { ordinati: Punto[]; d: Punto } {
  const origine = punti[0] ?? { x: 0, y: 0 };
  const d = direzioneSerie(punti);
  const ordinati = punti
    .map((p, i) => ({ p, i, t: ascissaSuGuida(p, origine, d) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((e) => e.p);
  return { ordinati, d };
}

export interface OpzioniParallelo {
  unita: Unita;
  /** distacco della prima linea di quota (px immagine) */
  offset: number;
  /** incremento di distacco per ogni linea successiva (px immagine) */
  passo: number;
  verso: VersoQuota;
  /** estremo della guida usato come origine */
  origineEstremo: 'inizio' | 'fine';
}

/**
 * Quotatura IN PARALLELO (§5.2): ogni punto è quotato DALL'ORIGINE (un estremo
 * della guida); le linee di quota sono parallele alla guida e impilate a
 * `offset = base + i·passo`, così non si sovrappongono.
 */
export function generaParallelo(
  puntiOriginali: Punto[],
  foto: CalibFoto,
  opts: OpzioniParallelo
): RisultatoSerie {
  const { ordinati, d } = ordinaLungoGuida(puntiOriginali);
  const inizio = ordinati[0] ?? { x: 0, y: 0 };
  const fine = ordinati[ordinati.length - 1] ?? inizio;
  const origine = opts.origineEstremo === 'fine' ? fine : inizio;
  // gli altri punti, ordinati per distanza crescente dall'origine
  const altri = ordinati
    .filter((p) => p !== origine)
    .map((p) => ({ p, dist: Math.abs(ascissaSuGuida(p, origine, d)) }))
    .sort((a, b) => a.dist - b.dist)
    .map((e) => e.p);
  const segno = segnoVerso(opts.verso);
  const base = Math.abs(opts.offset);
  const passo = Math.abs(opts.passo);
  const calibrata = haCalibrazione(foto);
  const quote: QuotaSingolaTecnica[] = altri.map((p, i) => ({
    p1: origine,
    p2: p,
    valore: calibrata ? misuraSegmento(origine, p, foto, opts.unita) : null,
    orientamento: 'allineata',
    offset: segno * (base + i * passo)
  }));
  return { lineaGuida: { a: inizio, b: fine }, quote, puntiOrdinati: ordinati };
}

export interface OpzioniProgressiva {
  unita: Unita;
  offset: number;
  verso: VersoQuota;
  /** estremo della guida usato come zero */
  origineEstremo: 'inizio' | 'fine';
}

/**
 * Quotatura PROGRESSIVA (§5.3, ordinate da punto zero): ogni punto riporta la
 * distanza CON SEGNO dallo zero lungo la guida, su un'unica linea di
 * riferimento. Lo zero non genera una quota (è il marcatore d'origine).
 */
export function generaProgressiva(
  puntiOriginali: Punto[],
  foto: CalibFoto,
  opts: OpzioniProgressiva
): RisultatoSerie {
  const { ordinati, d } = ordinaLungoGuida(puntiOriginali);
  const inizio = ordinati[0] ?? { x: 0, y: 0 };
  const fine = ordinati[ordinati.length - 1] ?? inizio;
  const zero = opts.origineEstremo === 'fine' ? fine : inizio;
  const segno = segnoVerso(opts.verso);
  const offset = segno * Math.abs(opts.offset);
  const calibrata = haCalibrazione(foto);
  const quote: QuotaSingolaTecnica[] = ordinati
    .filter((p) => p !== zero)
    .map((p) => {
      const t = ascissaSuGuida(p, zero, d);
      const mag = calibrata ? misuraSegmento(zero, p, foto, opts.unita) : null;
      return {
        p1: zero,
        p2: p,
        valore: mag === null ? null : t < 0 ? -mag : mag,
        orientamento: 'allineata' as const,
        offset
      };
    });
  return { lineaGuida: { a: inizio, b: fine }, quote, puntiOrdinati: ordinati };
}

/**
 * Ricalcola i valori (es. al cambio di unità) tenendo conto del sottotipo:
 * la progressiva conserva il segno (ordinata dallo zero lungo la guida).
 */
export function ricalcolaValori(
  quota: Pick<QuotaTecnica, 'sottotipo' | 'quote' | 'lineaGuida'>,
  foto: CalibFoto,
  unita: Unita
): QuotaSingolaTecnica[] {
  if (!haCalibrazione(foto)) return quota.quote;
  const g = quota.lineaGuida;
  const d = g ? normalizza(sottrai(g.b, g.a)) : { x: 1, y: 0 };
  return quota.quote.map((q) => {
    const mag = misuraSegmento(q.p1, q.p2, foto, unita);
    if (mag === null) return { ...q, valore: null };
    if (quota.sottotipo === 'progressiva') {
      const t = ascissaSuGuida(q.p2, q.p1, d);
      return { ...q, valore: t < 0 ? -mag : mag };
    }
    return { ...q, valore: mag };
  });
}

/**
 * Riassegna l'offset di tutte le quote secondo il sottotipo: la serie e la
 * progressiva condividono un'unica linea (offset costante); il parallelo
 * impila le linee a `base + i·passo`.
 */
export function applicaGeometria(
  quota: Pick<QuotaTecnica, 'sottotipo' | 'quote'>,
  opts: { offset: number; passo: number; verso: VersoQuota }
): QuotaSingolaTecnica[] {
  const segno = segnoVerso(opts.verso);
  const base = Math.abs(opts.offset);
  const passo = Math.abs(opts.passo);
  return quota.quote.map((q, i) => ({
    ...q,
    offset: quota.sottotipo === 'parallelo' ? segno * (base + i * passo) : segno * base
  }));
}
