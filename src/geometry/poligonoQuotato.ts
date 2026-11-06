/**
 * LA SAGOMA VERA DI UNA POLILINEA QUOTATA, a qualunque numero di lati.
 *
 * Una parete sotto falda non è sempre un quadrilatero: quella dell'hotel ha
 * cinque lati — montante, un pezzo di soffitto piano, la falda, il montante
 * corto, il pavimento — e si disegna con la polilinea, si quota dove si può
 * misurare e si lascia il resto al piano di riferimento. Fin qui, nel piano
 * di taglio ne arrivava il RETTANGOLO D'INGOMBRO: si buttava tutto il
 * triangolo sotto la falda, e i teli uscivano squadrati dove invece vanno
 * tagliati in diagonale.
 *
 * LA REGOLA È QUELLA CHE L'APP USA GIÀ PER IL QUADRILATERO, generalizzata:
 * le misure scritte comandano, il disegno dà la forma. Un poligono di n lati
 * è determinato da 2n−3 numeri: gli n lati e n−3 diagonali. Quelli che sono
 * stati misurati si usano così come sono; quelli che mancano si prendono dal
 * DISEGNO — dal piano di riferimento se c'è, che toglie la prospettiva, se no
 * dai pixel — riportati in scala sulle misure vere. Così il pezzo tagliato ha
 * i lati che l'artigiano ha preso, e a essere dedotta è solo la pendenza
 * della figura.
 *
 * Se le misure non chiudono una figura convessa non si inventa niente: torna
 * null, e chi chiama ripiega sull'ingombro come prima.
 */

import type { Foto, Punto, QuotaPoligono, Unita } from '../db/types';
import { abbondanzaTotale, segmentiPoligono } from '../db/types';
import { distanzaReale } from './calibrazione';
import { daMillimetri, inMillimetri } from '../utils/format';

/** quel poco della foto che serve a misurare: la scala e il piano */
type CalibFoto = Pick<Foto, 'scala' | 'piano' | 'piani'>;
import { poligonoConvesso, type MisureForma, type PuntoSagoma } from './sagome';

/**
 * IL POLIGONO RICOSTRUITO, triangolo per triangolo.
 *
 * Si parte dal lato 0 appoggiato sull'asse e si gira a ventaglio dal primo
 * vertice: ogni vertice nuovo sta a distanza nota dal vertice 0 (la
 * diagonale) e dal vertice precedente (il lato). Due cerchi, due incroci, e
 * si tiene quello che fa girare la figura sempre nello stesso verso — l'altro
 * la ripiegherebbe su sé stessa.
 *
 * `lati[i]` va dal vertice i al vertice i+1 (l'ultimo chiude sul vertice 0);
 * `diagonali[k]` va dal vertice 0 al vertice k+2.
 */
export function poligonoDaLati(lati: number[], diagonali: number[]): PuntoSagoma[] | null {
  const n = lati.length;
  if (n < 3 || diagonali.length !== n - 3) return null;
  if (lati.some((v) => !(v > 0)) || diagonali.some((v) => !(v > 0))) return null;

  /** la distanza dal vertice 0 al vertice k */
  const raggio = (k: number) => (k === 1 ? lati[0] : k === n - 1 ? lati[n - 1] : diagonali[k - 2]);

  const V: Array<[number, number]> = [
    [0, 0],
    [lati[0], 0]
  ];
  for (let k = 2; k < n; k++) {
    const r0 = raggio(k);
    const r1 = lati[k - 1];
    const prec = V[k - 1];
    const d = Math.hypot(prec[0], prec[1]);
    // i due cerchi si devono incontrare: se no i numeri non chiudono
    if (!(d > 0) || r0 + r1 <= d || Math.abs(r0 - r1) >= d) return null;
    const dPrec = raggio(k - 1);
    const a = (d * d + r0 * r0 - r1 * r1) / (2 * d);
    const hq = r0 * r0 - a * a;
    if (hq <= 0) return null;
    const h = Math.sqrt(hq);
    const ux = prec[0] / d;
    const uy = prec[1] / d;
    // dei due incroci si tiene quello che tiene il giro antiorario
    const scelte: Array<[number, number]> = [
      [a * ux - h * uy, a * uy + h * ux],
      [a * ux + h * uy, a * uy - h * ux]
    ];
    const giusto = scelte.find((q) => prec[0] * q[1] - prec[1] * q[0] > 1e-9);
    if (!giusto) return null;
    void dPrec;
    V.push(giusto);
  }

  // in coordinate del disegno: y verso il basso e riquadro appoggiato in (0,0)
  const maxY = Math.max(...V.map((q) => q[1]));
  const minX = Math.min(...V.map((q) => q[0]));
  const punti = V.map((q): PuntoSagoma => [
    Math.round((q[0] - minX) * 1e6) / 1e6,
    Math.round((maxY - q[1]) * 1e6) / 1e6
  ]);
  return poligonoConvesso(punti) ? punti : null;
}

/** la misura scritta su un segmento, abbondanze comprese */
function quotato(
  q: QuotaPoligono,
  da: number,
  a: number,
  conAbbondanze: boolean
): number | null {
  for (const s of segmentiPoligono(q)) {
    if ((s.da !== da || s.a !== a) && (s.da !== a || s.a !== da)) continue;
    if (s.valore === null || !(s.valore > 0)) continue;
    return s.valore + (conAbbondanze ? abbondanzaTotale(s) : 0);
  }
  return null;
}

/**
 * LA SAGOMA DI UNA POLILINEA DI CINQUE LATI O PIÙ.
 *
 * Per tre e quattro lati ci sono già le regole loro — il triangolo dai tre
 * lati, la falda e il quadrilatero storto — che sanno anche dare un nome alla
 * forma. Qui si prende tutto il resto, dove un nome non c'è e il pezzo va
 * descritto per vertici.
 */
export function sagomaPoligonoQuotato(
  q: QuotaPoligono,
  foto: CalibFoto | null,
  conAbbondanze: boolean
): MisureForma | null {
  const n = q.punti.length;
  if (n < 5) return null;

  /** quanto è lungo, sul DISEGNO, il segmento fra due vertici */
  const disegnato = (i: number, j: number): number | null => {
    const p1 = q.punti[i];
    const p2 = q.punti[j];
    if (!p1 || !p2) return null;
    // col piano di riferimento la distanza è quella VERA sul muro: la
    // prospettiva è già tolta, e la stima parte da lì invece che dai pixel.
    // Non arrotondata: qui le distanze si sommano in una figura, e gli
    // arrotondamenti si sommerebbero con loro
    const m = foto ? distanzaReale(foto, p1, p2) : null;
    if (m && m.valore > 0) {
      return daMillimetri(inMillimetri(m.valore, m.unita), q.unita);
    }
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return d > 0 ? d : null;
  };

  const lati: Array<number | null> = [];
  const disLati: Array<number | null> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    lati.push(quotato(q, i, j, conAbbondanze));
    disLati.push(disegnato(i, j));
  }

  /**
   * DA DISEGNO A REALE: il rapporto medio fra quello che è stato misurato e
   * quello che si vede. Con il piano di riferimento vale quasi uno — la
   * distanza sul piano è già in misure vere — e serve solo a non far litigare
   * le quote scritte con la scala del piano.
   */
  const rapporti: number[] = [];
  for (let i = 0; i < n; i++) {
    const l = lati[i];
    const d = disLati[i];
    if (l !== null && d !== null && d > 0) rapporti.push(l / d);
  }
  if (rapporti.length === 0) return null;
  const scala = rapporti.reduce((s, r) => s + r, 0) / rapporti.length;

  const stimato = (i: number, j: number): number | null => {
    const d = disegnato(i, j);
    return d === null ? null : d * scala;
  };

  const latiVeri: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = lati[i] ?? stimato(i, (i + 1) % n);
    if (v === null || !(v > 0)) return null;
    latiVeri.push(v);
  }
  const diagonali: number[] = [];
  for (let k = 2; k <= n - 2; k++) {
    const v = quotato(q, 0, k, conAbbondanze) ?? stimato(0, k);
    if (v === null || !(v > 0)) return null;
    diagonali.push(v);
  }

  const vertici = poligonoDaLati(latiVeri, diagonali);
  if (!vertici) return null;
  const larghezza = Math.max(...vertici.map((p) => p[0]));
  const altezza = Math.max(...vertici.map((p) => p[1]));
  if (!(larghezza > 0 && altezza > 0)) return null;
  return { forma: 'quad', larghezza, altezza, vertici };
}

/** i vertici reali di una polilinea, nell'unità della quota: per chi disegna */
export function verticiPoligono(
  q: QuotaPoligono,
  foto: CalibFoto | null,
  conAbbondanze = true
): { vertici: PuntoSagoma[]; larghezza: number; altezza: number; unita: Unita } | null {
  const s = sagomaPoligonoQuotato(q, foto, conAbbondanze);
  if (!s || !s.vertici) return null;
  return { vertici: s.vertici, larghezza: s.larghezza, altezza: s.altezza, unita: q.unita };
}

/** il punto come lo vuole la calibrazione, per chi ha solo una coppia */
export const comePunto = (p: PuntoSagoma): Punto => ({ x: p[0], y: p[1] });
