import type { Grigia } from '../panoramica';
import { applicaOmografia, invertiOmografia, type Omografia } from '../omografia';

/**
 * LA DERIVA DI UNA PANORAMICA LUNGA.
 *
 * Otto scatti erano il tetto. Per una facciata lunga — un capannone, una
 * palazzina su un cortile stretto dove non ci si può allontanare — non
 * bastano, e alzare il numero da solo non serve: gli scatti si incatenano a
 * due a due, e l'errore di ogni anello si moltiplica per quelli dopo. Qui
 * quell'errore si MISURA, prima di mettere mano.
 *
 * E si cammina, non si gira sui piedi: davanti a un muro PIATTO lo
 * spostamento laterale è legittimo — la prospettiva di un piano si rimette
 * sempre d'accordo con quella di un altro punto di vista, esattamente. È
 * girando sul posto che una panoramica lunga non si può fare, perché oltre
 * un centinaio di gradi la tela piana esplode.
 */

export const W = 640;
export const H = 480;
export const F = 500;
export const Z = 2000;

export type M3 = number[];
export const mul = (A: M3, B: M3): M3 => {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[r * 3 + k] * B[k * 3 + c];
      C[r * 3 + c] = s;
    }
  return C;
};
export const K: M3 = [F, 0, W / 2, 0, F, H / 2, 0, 0, 1];
export const rotY = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
export const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];

/** la macchina cammina lungo la facciata: centro in (t,0,0), muro a z = Z */
function scatto(t: number, girata = 0, alzata = 0): Omografia {
  const R = mul(rotX(alzata), rotY(girata));
  const M: M3 = [1, 0, -t, 0, 1, 0, 0, 0, Z];
  return mul(K, mul(R, M)) as Omografia;
}

function grana(x: number, y: number): number {
  const passo = 5;
  const gx = Math.floor(x / passo);
  const gy = Math.floor(y / passo);
  const tx = (x - gx * passo) / passo;
  const ty = (y - gy * passo) / passo;
  const val = (i: number, j: number) => {
    let n = ((i * 374761393) ^ (j * 668265263)) >>> 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return (((n ^ (n >>> 16)) >>> 0) % 1000) / 1000 - 0.5;
  };
  const morbido = (t: number) => t * t * (3 - 2 * t);
  const u = morbido(tx);
  const v = morbido(ty);
  const a = val(gx, gy) * (1 - u) + val(gx + 1, gy) * u;
  const b = val(gx, gy + 1) * (1 - u) + val(gx + 1, gy + 1) * u;
  return (a * (1 - v) + b * v) * 55;
}

function scena(x: number, y: number): number {
  let v = 120;
  const riga = Math.floor(y / 34);
  const sfalso = riga % 2 ? 40 : 0;
  const cx = Math.floor((x + sfalso) / 80);
  if ((x + sfalso) % 80 < 5 || y % 34 < 4) v = 70;
  else v = 130 + (((cx * 37 + riga * 61) % 40) + 40) % 40;
  const fx = Math.floor(x / 420);
  const fy = Math.floor(y / 380);
  const ix = x - fx * 420;
  const iy = y - fy * 380;
  if (ix > 60 && ix < 330 && iy > 60 && iy < 300) {
    v = ix < 70 || ix > 320 || iy < 70 || iy > 290 ? 235 : 45;
    if (Math.abs(ix - 195) < 6 || Math.abs(iy - 180) < 6) v = 225;
  }
  const m = ((x * 2654435761) ^ (y * 40503)) >>> 0;
  if (m % 997 < 12) v = 30;
  return Math.max(0, Math.min(255, v + grana(x, y)));
}

function rendi(G: Omografia): Grigia {
  const inv = invertiOmografia(G)!;
  const dati = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const p = applicaOmografia(inv, { x: px + 0.5, y: py + 0.5 });
      dati[py * W + px] = scena(Math.round(p.x), Math.round(p.y));
    }
  }
  return { dati, w: W, h: H };
}

/** una passeggiata davanti alla facciata: n scatti, ~55% di sovrapposizione */
const fatte = new Map<string, { veri: Omografia[]; immagini: Grigia[] }>();

/** la stessa passeggiata si chiede più volte: si rende una volta sola */
export function passeggiata(n: number, passo = 1150) {
  const chiave = `${n}/${passo}`;
  const gia = fatte.get(chiave);
  if (gia) return gia;
  const fatto = rendiPasseggiata(n, passo);
  fatte.set(chiave, fatto);
  return fatto;
}

function rendiPasseggiata(n: number, passo: number) {
  // il fotogramma copre 2560 unità di muro sul piano
  const veri: Omografia[] = [];
  for (let i = 0; i < n; i++) {
    // la mano non è un binario: un po' di girata e di alzata a ogni scatto
    const g = 0.035 * Math.sin(i * 1.7);
    const a = 0.02 * Math.sin(i * 2.3 + 1);
    veri.push(scatto(i * passo, g, a));
  }
  return { veri, immagini: veri.map(rendi) };
}

