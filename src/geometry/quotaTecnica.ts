import type {
  Annotazione,
  FilettaturaTecnica,
  Foto,
  ForoTecnico,
  Punto,
  QuotaSingolaTecnica,
  QuotaTecnica,
  SmussoTecnico,
  Unita,
  VersoQuota
} from '../db/types';
import { arrotondaMisura, haCalibrazione, misuraSegmento } from './calibrazione';
import { circumcentro, distanza, dot, normale, normalizza, scala, somma, sottrai } from './punti';
import { formattaNumero } from '../utils/format';

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

/**
 * Quotatura FORO (§5.4): da TRE tap sulla circonferenza calcola il centro
 * (circumcentro) e il raggio, convertendo ⌀/R in unità reali.
 * Restituisce null se i tre punti sono allineati (cerchio impossibile).
 */
export function generaForo(
  p0: Punto,
  p1: Punto,
  p2: Punto,
  foto: CalibFoto,
  opts: { unita: Unita; modo: 'diametro' | 'raggio' }
): { foro: ForoTecnico } | null {
  const centro = circumcentro(p0, p1, p2);
  if (!centro) return null;
  const raggioPx = distanza(centro, p0);
  const raggioReale = haCalibrazione(foto) ? misuraSegmento(centro, p0, foto, opts.unita) : null;
  const diametroReale = raggioReale === null ? null : arrotondaMisura(raggioReale * 2);
  return {
    foro: { centro, raggioPx, raggioReale, diametroReale, modo: opts.modo, etichetta: '' }
  };
}

/** Ricalcola ⌀/R reali del foro (es. al cambio unità) dal primo punto toccato. */
export function ricalcolaForo(q: QuotaTecnica, foto: CalibFoto, unita: Unita): ForoTecnico | null {
  if (!q.foro) return null;
  if (!haCalibrazione(foto)) return { ...q.foro };
  const bordo = q.puntiOriginali[0] ?? { x: q.foro.centro.x + q.foro.raggioPx, y: q.foro.centro.y };
  const raggioReale = misuraSegmento(q.foro.centro, bordo, foto, unita);
  const diametroReale = raggioReale === null ? null : arrotondaMisura(raggioReale * 2);
  return { ...q.foro, raggioReale, diametroReale };
}

// ---------------------------------------------------------------------------
// Smusso (chamfer) e filettatura (§5.7, §5.8) — callout normalizzate
// ---------------------------------------------------------------------------

/** Callout dello smusso: `C{x}` (≈45°) oppure `{lunghezza} × {angolo}°` (ISO 3040). */
export function designazioneSmusso(
  s: Pick<SmussoTecnico, 'modo' | 'catetoReale' | 'angoloGradi'>
): string {
  const len = s.catetoReale === null ? '?' : formattaNumero(s.catetoReale);
  if (s.modo === 'C') return `C${len}`;
  const ang = s.angoloGradi === null ? '45' : formattaNumero(s.angoloGradi);
  return `${len} × ${ang}°`;
}

/** Callout della filettatura: `M{Ø} × {passo} - {classe}` (+ lunghezza se presente). */
export function designazioneFilettatura(
  f: Pick<FilettaturaTecnica, 'diametroNominale' | 'passo' | 'classeTolleranza' | 'lunghezza'>
): string {
  let s = `M${formattaNumero(f.diametroNominale)}`;
  if (f.passo) s += ` × ${formattaNumero(f.passo)}`;
  if (f.classeTolleranza) s += ` - ${f.classeTolleranza}`;
  if (f.lunghezza) s += `, L${formattaNumero(f.lunghezza)}`;
  return s;
}

/** Leader di default a partire dal punto `da`, lungo `dir`, di lunghezza `len`. */
function leaderDefault(da: Punto, dir: Punto, len: number): { da: Punto; a: Punto } {
  return { da, a: somma(da, scala(normalizza(dir), len)) };
}

/**
 * Smusso (§5.7): due tap sugli estremi del segmento smussato → lunghezza reale
 * e callout. L'angolo rispetto a una faccia di riferimento è rinviato (Fase 6):
 * qui l'angolo è impostabile a mano (default 45° → modo C).
 */
export function generaSmusso(
  a: Punto,
  b: Punto,
  foto: CalibFoto,
  opts: { unita: Unita; modo: 'C' | 'lunghezzaAngolo'; angoloGradi: number }
): { smusso: SmussoTecnico } {
  const catetoReale = haCalibrazione(foto) ? misuraSegmento(a, b, foto, opts.unita) : null;
  const medio = scala(somma(a, b), 0.5);
  const off = Math.max(40, distanza(a, b) * 0.8);
  const leader = leaderDefault(medio, normale(normalizza(sottrai(b, a))), off);
  const smusso: SmussoTecnico = {
    a,
    b,
    catetoReale,
    angoloGradi: opts.angoloGradi,
    modo: opts.modo,
    designazione: designazioneSmusso({ modo: opts.modo, catetoReale, angoloGradi: opts.angoloGradi }),
    leader
  };
  return { smusso };
}

/** Ricalcola lunghezza e callout dello smusso (es. al cambio unità). */
export function ricalcolaSmusso(q: QuotaTecnica, foto: CalibFoto, unita: Unita): SmussoTecnico | null {
  if (!q.smusso) return null;
  const catetoReale = haCalibrazione(foto)
    ? misuraSegmento(q.smusso.a, q.smusso.b, foto, unita)
    : q.smusso.catetoReale;
  const s = { ...q.smusso, catetoReale };
  return { ...s, designazione: designazioneSmusso(s) };
}

/** Leader di default per un'ancora di filettatura (in alto a destra). */
export function leaderFilettatura(ancora: Punto, len: number): { da: Punto; a: Punto } {
  return leaderDefault(ancora, { x: 1, y: -1 }, len);
}

// ---------------------------------------------------------------------------
// Ricalcolo dei valori dopo uno spostamento dei punti (§7 — editing avanzato)
// ---------------------------------------------------------------------------

/**
 * Ricalcola i valori reali delle quote tecniche quando la geometria cambia
 * (es. trascinamento di una maniglia). Salta quelle a valore manuale
 * (`valoreAuto === false`) e quelle senza calibrazione. Datum e filettatura non
 * hanno una misura derivata e restano invariati.
 */
export function ricalcolaTecniche(annotazioni: Annotazione[], foto: CalibFoto): Annotazione[] {
  if (!haCalibrazione(foto)) return annotazioni;
  return annotazioni.map((a) => {
    if (a.tipo !== 'quotaTecnica' || a.valoreAuto === false) return a;
    switch (a.sottotipo) {
      case 'serie':
      case 'parallelo':
      case 'progressiva':
        return { ...a, quote: ricalcolaValori(a, foto, a.unita) };
      case 'foro':
        return a.foro ? { ...a, foro: ricalcolaForo(a, foto, a.unita) ?? a.foro } : a;
      case 'smusso':
        return a.smusso ? { ...a, smusso: ricalcolaSmusso(a, foto, a.unita) ?? a.smusso } : a;
      default:
        return a; // datum / filettatura
    }
  });
}
