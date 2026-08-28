import { describe, expect, it } from 'vitest';
import { spigoliDellaFoto } from '../spigolo';
import { pianiDalleForme, riferimentiPiano } from '../pianoDaForme';
import { pianoDi } from '../calibrazione';
import type { Annotazione, Punto } from '../../db/types';

/**
 * UNA FACCIATA A SVOLTE, con le sue finestre quotate.
 *
 * Non tutte le pareti stanno su un muro solo: un capannone con i risvolti, un
 * terrazzo con tre lati, una casa ripresa d'angolo. Qui la scena si costruisce
 * come nella realtà — obiettivo, posa, muri che svoltano uno dopo l'altro — e
 * si verifica tutto il percorso: le forme quotate diventano pareti, le pareti
 * si toccano negli spigoli, e ogni misura ritrova il muro suo.
 */

const LARGHEZZA = 1600;
const ALTEZZA = 1000;
const FUOCO = 1100;

type M3 = number[];
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

function muro(R: M3, O: number[], asse: number[]): M3 {
  const KR = mul(K, R);
  const u = mv(KR, asse);
  const v = mv(KR, [0, 1, 0]);
  const o = mv(KR, O);
  return [u[0], v[0], o[0], u[1], v[1], o[1], u[2], v[2], o[2]];
}
const suFoto = (G: M3, a: number, b: number): Punto => {
  const p = mv(G, [a, b, 1]);
  return { x: p[0] / p[2], y: p[1] / p[2] };
};
const nellaFoto = (p: Punto) => p.x >= 0 && p.x <= LARGHEZZA && p.y >= 0 && p.y <= ALTEZZA;

/** una finestra quotata sui quattro lati, con l'errore del dito sugli angoli */
const finestra = (
  G: M3,
  id: string,
  a: number,
  b: number,
  w: number,
  h: number,
  rumore: number
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
 * `n` muri che svoltano a fisarmonica, due finestre per muro. I muri pari e
 * quelli dispari sono paralleli fra loro: è il caso peggiore, perché due
 * pareti parallele non fanno spigolo e due non contigue si incrociano in una
 * retta che spigolo non è.
 */
function facciata(n: number, rumore: number) {
  const R = mul(rotX(-0.06), rotY(0.25));
  let O = [-4500, -1300, 9000];
  const muri: M3[] = [];
  const spigoliVeri: Array<[Punto, Punto]> = [];
  const annotazioni: Annotazione[] = [];
  for (let i = 0; i < n; i++) {
    const ang = 0.15 + (i % 2 === 0 ? 0.45 : -0.45);
    const d = [Math.cos(ang), 0, Math.sin(ang)];
    const G = muro(R, O, d);
    muri.push(G);
    if (i > 0) spigoliVeri.push([suFoto(G, 0, 0), suFoto(G, 0, 2600)]);
    annotazioni.push(finestra(G, `m${i}a`, 350, 700, 700, 900, rumore));
    annotazioni.push(finestra(G, `m${i}b`, 1500, 700, 700, 900, rumore));
    O = [O[0] + d[0] * 2600, O[1], O[2] + d[2] * 2600];
  }
  return { muri, annotazioni, spigoliVeri };
}

/** il percorso completo: finestre quotate → pareti → spigoli */
function rileva(n: number, rumore: number) {
  const f = facciata(n, rumore);
  const pareti = pianiDalleForme(riferimentiPiano(f.annotazioni));
  const piani = pareti.map((p) => p.piano);
  const spigoli = spigoliDellaFoto(piani, LARGHEZZA, ALTEZZA);
  /** l'indice del piano che raccoglie le finestre del muro `i` */
  const pianoDelMuro = (i: number) =>
    pareti.findIndex((q) => q.esito.riferimenti.some((r) => r.id.startsWith(`m${i}`)));
  return { ...f, pareti, piani, spigoli, pianoDelMuro };
}

const daRetta = (s: [Punto, Punto], p: Punto) => {
  const a = s[1].y - s[0].y;
  const b = s[0].x - s[1].x;
  const c = -(a * s[0].x + b * s[0].y);
  return Math.abs(a * p.x + b * p.y + c) / Math.hypot(a, b);
};

describe('facciate con più svolte', () => {
  for (const n of [3, 4, 5]) {
    it(`${n} muri diventano ${n} pareti, ciascuna con le sue finestre`, () => {
      const r = rileva(n, 0.5);
      expect(r.pareti).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        expect(r.pianoDelMuro(i)).toBeGreaterThanOrEqual(0);
        // e ogni parete raccoglie SOLO le finestre del suo muro
        const suo = r.pareti[r.pianoDelMuro(i)];
        expect(suo.esito.riferimenti.every((x) => x.id.startsWith(`m${i}`))).toBe(true);
      }
    });

    it(`${n} muri: uno spigolo per ogni svolta inquadrata, e nessuno inventato`, () => {
      const r = rileva(n, 0.5);
      // le svolte che si vedono nella foto
      const attese = r.spigoliVeri
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => nellaFoto(s[0]) || nellaFoto(s[1]));
      const coppia = (i: number, j: number) =>
        r.spigoli.some(
          (x) =>
            (x.a === r.pianoDelMuro(i) && x.b === r.pianoDelMuro(j)) ||
            (x.b === r.pianoDelMuro(i) && x.a === r.pianoDelMuro(j))
        );
      // ogni svolta inquadrata ha il suo spigolo…
      for (const { i } of attese) expect(coppia(i, i + 1)).toBe(true);
      // …e non ce ne sono altri: due muri non contigui si incrociano sì, ma
      // quella retta non è uno spigolo che si vede
      expect(r.spigoli).toHaveLength(attese.length);
      // ogni spigolo disegnato cade su una svolta vera
      for (const x of r.spigoli) {
        const scarto = Math.min(
          ...r.spigoliVeri.map((v) => Math.max(daRetta(v, x.spigolo.p1), daRetta(v, x.spigolo.p2)))
        );
        expect(scarto).toBeLessThan(30);
      }
    });

    it(`${n} muri: ogni misura ritrova il suo, anche a venti centimetri dalla svolta`, () => {
      const r = rileva(n, 0.5);
      const foto = {
        scala: null,
        piano: r.piani[0],
        piani: r.piani.slice(1),
        larghezzaPx: LARGHEZZA,
        altezzaPx: ALTEZZA
      };
      for (let i = 0; i < n; i++) {
        // in mezzo al muro, e a venti centimetri dalle due svolte
        for (const a of [200, 1300, 2400]) {
          const p = suFoto(r.muri[i], a, 1300);
          if (!nellaFoto(p)) continue;
          expect(pianoDi(foto, p)).toBe(r.piani[r.pianoDelMuro(i)]);
        }
      }
    });
  }

  it('due muri paralleli non fanno spigolo, per quanti siano', () => {
    const r = rileva(5, 0);
    // i muri pari sono paralleli fra loro, e così i dispari: nessuno spigolo
    for (const [i, j] of [
      [0, 2],
      [1, 3],
      [2, 4]
    ]) {
      const trovato = r.spigoli.some(
        (x) =>
          (x.a === r.pianoDelMuro(i) && x.b === r.pianoDelMuro(j)) ||
          (x.b === r.pianoDelMuro(i) && x.a === r.pianoDelMuro(j))
      );
      expect(trovato).toBe(false);
    }
  });
});
