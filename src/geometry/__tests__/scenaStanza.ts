import { pianiDalleForme, riferimentiPiano } from '../pianoDaForme';
import type { Annotazione, Punto } from '../../db/types';

/**
 * UNA STANZA INTERA: tre pareti, il pavimento e il soffitto.
 *
 * Un bagno, un corridoio, un ripostiglio: si sta dentro, si inquadra l'angolo,
 * e nella stessa foto ci sono cinque piani. Non sono cinque muri in fila —
 * quelli l'app li reggeva già — sono piani che si incontrano in tutti i modi:
 * due pareti in uno spigolo VERTICALE, una parete e il pavimento in uno
 * spigolo ORIZZONTALE, e due pareti opposte che non si toccano affatto.
 *
 * La scena si costruisce come nella realtà: un obiettivo, una posa, e cinque
 * piani nello spazio. Non si inventano omografie — due omografie inventate non
 * sono due piani visti da una macchina fotografica sola, e le prove che ne
 * nascono non dicono niente.
 */

export const LARGHEZZA = 1600;
export const ALTEZZA = 1200;
export const FUOCO = 900;

export type M3 = number[];
const mul = (A: M3, B: M3): M3 => {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[r * 3 + k] * B[k * 3 + c];
      C[r * 3 + c] = s;
    }
  return C;
};
const mv = (A: M3, v: number[]) => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
];
const K: M3 = [FUOCO, 0, LARGHEZZA / 2, 0, FUOCO, ALTEZZA / 2, 0, 0, 1];
const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];

/** un piano nello spazio: origine O, e i due assi u e v che lo percorrono */
function piano(R: M3, O: number[], u: number[], v: number[]): M3 {
  const KR = mul(K, R);
  const a = mv(KR, u);
  const b = mv(KR, v);
  const o = mv(KR, O);
  return [a[0], b[0], o[0], a[1], b[1], o[1], a[2], b[2], o[2]];
}
export const suFoto = (G: M3, a: number, b: number): Punto => {
  const p = mv(G, [a, b, 1]);
  return { x: p[0] / p[2], y: p[1] / p[2] };
};
export const nellaFoto = (p: Punto) =>
  p.x >= 0 && p.x <= LARGHEZZA && p.y >= 0 && p.y <= ALTEZZA;

/** un elemento quotato sui quattro lati, con l'errore del dito sugli angoli */
const forma = (
  G: M3,
  id: string,
  a: number,
  b: number,
  w: number,
  h: number,
  rumore = 0.5
): Annotazione => {
  const sc = (i: number, k: number) =>
    rumore * Math.sin(id.charCodeAt(id.length - 1) * 5.1 + i * 2.9 + k * 1.3);
  const punti = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h]
  ].map(([dx, dy], i) => {
    const p = suFoto(G, a + dx, b + dy);
    return { x: p.x + sc(i, 0), y: p.y + sc(i, 1) };
  });
  return {
    id,
    fotoId: 'f1',
    zIndex: 0,
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 13 },
    tipo: 'quotaPoligono',
    unita: 'mm',
    stato: 'reale',
    punti,
    segmenti: [
      { da: 0, a: 1, valore: w },
      { da: 1, a: 2, valore: h },
      { da: 2, a: 3, valore: w },
      { da: 3, a: 0, valore: h }
    ]
  } as unknown as Annotazione;
};

/**
 * LA STANZA. La macchina sta dentro, guarda l'angolo di fondo e un po' in
 * basso: si vedono la parete di fondo, le due laterali, il pavimento e il
 * soffitto. Misure in millimetri, stanza 2400 × 2400 × 2500 (h).
 */
const L = 2400; // lato della stanza
const Hst = 2500; // altezza
export function stanza() {
  const R = mul(rotX(0.12), rotY(0.1));
  // la macchina è a (0, 0, 0), la stanza davanti: fondo a z = 3000
  const zFondo = 3000;
  const zVicino = zFondo - L;
  const yAlto = -Hst / 2;
  const yBasso = Hst / 2;
  const xSin = -L / 2;
  const xDes = L / 2;
  return {
    fondo: piano(R, [xSin, yAlto, zFondo], [1, 0, 0], [0, 1, 0]),
    sinistra: piano(R, [xSin, yAlto, zVicino], [0, 0, 1], [0, 1, 0]),
    destra: piano(R, [xDes, yAlto, zFondo], [0, 0, -1], [0, 1, 0]),
    pavimento: piano(R, [xSin, yBasso, zFondo], [1, 0, 0], [0, 0, -1]),
    soffitto: piano(R, [xSin, yAlto, zVicino], [1, 0, 0], [0, 0, 1])
  };
}

/** due elementi quotati per piano, sparsi */
export function annotazioni(s: ReturnType<typeof stanza>): Annotazione[] {
  const a: Annotazione[] = [];
  a.push(forma(s.fondo, 'fo1', 300, 500, 500, 600));
  a.push(forma(s.fondo, 'fo2', 1400, 700, 600, 500));
  a.push(forma(s.sinistra, 'si1', 400, 500, 500, 700));
  a.push(forma(s.sinistra, 'si2', 1300, 900, 500, 500));
  a.push(forma(s.destra, 'de1', 400, 600, 500, 600));
  a.push(forma(s.destra, 'de2', 1300, 800, 500, 500));
  a.push(forma(s.pavimento, 'pa1', 400, 400, 600, 500));
  a.push(forma(s.pavimento, 'pa2', 1300, 1200, 600, 600));
  a.push(forma(s.soffitto, 'so1', 400, 400, 600, 500));
  a.push(forma(s.soffitto, 'so2', 1300, 1100, 600, 600));
  return a;
}

export function rileva(senza: string[] = []) {
  const s = stanza();
  const ann = annotazioni(s).filter((a) => !senza.some((p) => a.id.startsWith(p)));
  const gruppi = pianiDalleForme(riferimentiPiano(ann));
  const piani = gruppi.map((g) => g.piano);
  const quale = (prefisso: string) =>
    gruppi.findIndex((g) => g.esito.riferimenti.some((r) => r.id.startsWith(prefisso)));
  return { s, ann, gruppi, piani, quale };
}

