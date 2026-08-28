import { describe, expect, it } from 'vitest';
import { pianiDalleForme, riferimentiPiano } from '../pianoDaForme';
import { pianiAgganciati, verticiGemelli } from '../pianoModifica';
import { spigoliDellaFoto } from '../spigolo';
import { applicaOmografia, omografiaPiano } from '../omografia';
import type { Annotazione, Punto } from '../../db/types';

type M3 = number[];
const mul = (A: M3, B: M3): M3 => {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    let s = 0; for (let k = 0; k < 3; k++) s += A[r * 3 + k] * B[k * 3 + c];
    C[r * 3 + c] = s;
  }
  return C;
};
const mv = (A: M3, v: number[]) => [
  A[0]*v[0]+A[1]*v[1]+A[2]*v[2], A[3]*v[0]+A[4]*v[1]+A[5]*v[2], A[6]*v[0]+A[7]*v[1]+A[8]*v[2]
];
const rotX = (a: number): M3 => [1,0,0, 0,Math.cos(a),-Math.sin(a), 0,Math.sin(a),Math.cos(a)];
const rotY = (a: number): M3 => [Math.cos(a),0,Math.sin(a), 0,1,0, -Math.sin(a),0,Math.cos(a)];

function scena(W: number, H: number, altezzaB = 600) {
  const F = W * 0.6875;
  const K: M3 = [F, 0, W/2, 0, F, H/2, 0, 0, 1];
  const R = mul(rotX(-0.06), rotY(0.25));
  const muro = (O: number[], asse: number[]): M3 => {
    const KR = mul(K, R);
    const u = mv(KR, asse), v = mv(KR, [0,1,0]), o = mv(KR, O);
    return [u[0],v[0],o[0], u[1],v[1],o[1], u[2],v[2],o[2]];
  };
  const suFoto = (G: M3, a: number, b: number): Punto => {
    const p = mv(G, [a, b, 1]);
    return { x: p[0]/p[2], y: p[1]/p[2] };
  };
  const O = [-4500, -1300, 9000];
  const d0 = [Math.cos(0.6), 0, Math.sin(0.6)];
  const d1 = [Math.cos(-0.3), 0, Math.sin(-0.3)];
  void 0;
  const G0 = muro(O, d0);
  const G1 = muro([O[0] + d0[0]*2600, O[1], O[2] + d0[2]*2600], d1);
  const finestra = (G: M3, id: string, a: number, b: number, w: number, h: number): Annotazione => ({
    id, fotoId: 'f1', zIndex: 0,
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 13 },
    tipo: 'quotaPoligono', unita: 'mm', stato: 'reale',
    punti: [[0,0],[w,0],[w,h],[0,h]].map(([dx,dy]) => suFoto(G, a+dx, b+dy)),
    segmenti: [
      { da: 0, a: 1, valore: w }, { da: 1, a: 2, valore: h },
      { da: 2, a: 3, valore: w }, { da: 3, a: 0, valore: h }
    ]
  } as unknown as Annotazione);
  // muri con estensioni DIVERSE, come nella realtà
  const ann = [
    finestra(G0, 'a1', 350, 500, 700, 1200),
    finestra(G0, 'a2', 1500, 500, 700, 1200),
    finestra(G1, 'b1', 350, 1000, 700, altezzaB),
    finestra(G1, 'b2', 1500, 1000, 700, altezzaB)
  ];
  return { ann, W, H };
}

/**
 * IL VERTICE DI GIUNZIONE SI FORMA SU QUALUNQUE FOTO.
 *
 * Due pareti si uniscono quando i loro riquadri hanno un angolo in comune: la
 * maniglia diventa verde, e tirandola si muovono tutte e due. Perché quel
 * punto ci sia davvero non basta che i due bordi cadano sulla stessa riga —
 * devono anche COPRIRE LO STESSO TRATTO di riga. Due muri con le finestre a
 * quote diverse hanno riquadri di altezza diversa, i loro angoli finiscono a
 * decine di pixel l'uno dall'altro, e le pareti non si uniscono mai.
 *
 * E il difetto peggiora con la foto: la soglia con cui due angoli si
 * considerano lo stesso punto è in pixel dell'immagine, quindi su uno scatto
 * da 4032 px vale un quarto di quello che vale su uno da 1600. Queste prove
 * girano su tre formati apposta.
 */
describe('il vertice di giunzione si forma a qualunque dimensione di foto', () => {
  const FORMATI: Array<[number, number]> = [
    [1600, 1000],
    [3024, 2016],
    [4032, 3024]
  ];

  const impianto = (W: number, H: number) => {
    const s = scena(W, H);
    const piani = pianiDalleForme(riferimentiPiano(s.ann)).map((p) => p.piano);
    return { piani, attaccati: pianiAgganciati(piani, W, H) };
  };

  for (const [W, H] of FORMATI) {
    it(`${W}×${H}: le due pareti si toccano in due angoli, non a decine di pixel`, () => {
      const { attaccati } = impianto(W, H);
      const distanze: number[] = [];
      attaccati[0].punti.forEach((p) =>
        attaccati[1].punti.forEach((q) => distanze.push(Math.hypot(p.x - q.x, p.y - q.y)))
      );
      distanze.sort((a, b) => a - b);
      // i due angoli dello spigolo cadono nello stesso posto
      expect(distanze[0]).toBeLessThan(2);
      expect(distanze[1]).toBeLessThan(2);
    });

    it(`${W}×${H}: e l’app li riconosce come vertici di giunzione`, () => {
      const { attaccati } = impianto(W, H);
      let quanti = 0;
      attaccati[0].punti.forEach((_, k) => {
        if (verticiGemelli(attaccati, 0, k).length > 0) quanti++;
      });
      expect(quanti).toBe(2);
    });
  }

  it('il muro più corto si allunga fino allo stesso filo dell’altro', () => {
    const { piani, attaccati } = impianto(1600, 1000);
    const corto = piani[0].altezzaReale < piani[1].altezzaReale ? 0 : 1;
    expect(attaccati[corto].altezzaReale).toBeGreaterThan(piani[corto].altezzaReale * 1.5);
    // e la prospettiva non si tocca: è solo estensione
    const misura = (piano: (typeof piani)[number], a: Punto, b: Punto) => {
      const H = omografiaPiano(piano);
      const p = applicaOmografia(H, a);
      const q = applicaOmografia(H, b);
      return Math.hypot(q.x - p.x, q.y - p.y);
    };
    const a = piani[corto].punti[0];
    const b = piani[corto].punti[2];
    expect(misura(attaccati[corto], a, b)).toBeCloseTo(misura(piani[corto], a, b), 3);
  });

  it('si uniscono anche con riquadri di altezza molto diversa', () => {
    // finestre alte 1200 → i due riquadri sono uguali; alte 250 → uno è
    // quasi cinque volte l'altro. È il caso della realtà: le finestre delle
    // due pareti non stanno quasi mai alla stessa quota.
    for (const hb of [1200, 600, 400, 250]) {
      const sc = scena(2400, 1600, hb);
      const piani = pianiDalleForme(riferimentiPiano(sc.ann)).map((p) => p.piano);
      const sp = spigoliDellaFoto(piani, 2400, 1600);
      // un incrocio a T non si aggancia: quello è un altro discorso
      if (!sp[0]?.separante) continue;
      const att = pianiAgganciati(piani, 2400, 1600);
      const d: number[] = [];
      att[0].punti.forEach((p) =>
        att[1].punti.forEach((q) => d.push(Math.hypot(p.x - q.x, p.y - q.y)))
      );
      d.sort((a, b) => a - b);
      expect(d[0], `finestre alte ${hb}`).toBeLessThan(2);
      expect(d[1], `finestre alte ${hb}`).toBeLessThan(2);
    }
  });

  it('lo spigolo resta uno solo, e separante', () => {
    const { attaccati } = impianto(3024, 2016);
    const sp = spigoliDellaFoto(attaccati, 3024, 2016);
    expect(sp).toHaveLength(1);
    expect(sp[0].separante).toBe(true);
  });
});
