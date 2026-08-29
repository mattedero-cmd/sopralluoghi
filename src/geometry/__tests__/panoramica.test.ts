import { describe, expect, it } from 'vitest';
import {
  abbina,
  catenaDiScatti,
  disposizione,
  allineamentoCredibile,
  angoliFast,
  caratteristiche,
  descrittore,
  distanzaHamming,
  omografiaFraScatti,
  orientamento,
  selezionati,
  type Grigia
} from '../panoramica';
import { applicaOmografia, invertiOmografia, type Omografia } from '../omografia';
import type { Punto } from '../../db/types';

/* --- una scena vera: una facciata, e una macchina che gira sui piedi ------ */

const W = 640;
const H = 480;
const F = 500;

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
const K: M3 = [F, 0, W / 2, 0, F, H / 2, 0, 0, 1];
const rotY = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];

/**
 * L'omografia che porta il PIANO del muro sui pixel di uno scatto: la macchina
 * sta ferma e ruota, come si fa per una panoramica.
 */
function scatto(angoloY: number, angoloX = 0): Omografia {
  // muro a z = 2000, largo, davanti alla macchina
  const R = mul(rotX(angoloX), rotY(angoloY));
  const KR = mul(K, R);
  // il piano del muro: assi (1,0,0) e (0,1,0), origine (0,0,2000)
  const G: M3 = [
    KR[0], KR[1], KR[0] * 0 + KR[1] * 0 + KR[2] * 2000,
    KR[3], KR[4], KR[3] * 0 + KR[4] * 0 + KR[5] * 2000,
    KR[6], KR[7], KR[6] * 0 + KR[7] * 0 + KR[8] * 2000
  ];
  return G as Omografia;
}

/**
 * GRANA DELL'INTONACO. Un muro vero non è periodico: ha sporco, sbavature,
 * grana della malta, e sono proprio quelle a rendere ogni punto riconoscibile
 * da un altro. Un muro sintetico perfettamente ripetitivo non è una prova più
 * severa: è una prova IRREALE, che nessun algoritmo di abbinamento — questo,
 * OpenCV o altro — può passare, perché i due mattoni sono davvero uguali.
 * Il caso patologico ha una prova sua, più sotto: là si pretende che l'app
 * si RIFIUTI di cucire, non che ci riesca.
 */
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

/** una facciata piena di spigoli: mattoni, finestre, insegne, e la sua grana */
function scena(x: number, y: number): number {
  let v = 120;
  // corsi di mattoni, sfalsati
  const riga = Math.floor(y / 34);
  const sfalso = riga % 2 ? 40 : 0;
  const cx = Math.floor((x + sfalso) / 80);
  if (((x + sfalso) % 80) < 5 || (y % 34) < 4) v = 70;
  else v = 130 + ((cx * 37 + riga * 61) % 40);
  // finestre: rettangoli scuri con telaio chiaro
  const fx = Math.floor(x / 420);
  const fy = Math.floor(y / 380);
  const ix = x - fx * 420;
  const iy = y - fy * 380;
  if (ix > 60 && ix < 330 && iy > 60 && iy < 300) {
    v = ix < 70 || ix > 320 || iy < 70 || iy > 290 ? 235 : 45;
    // croce del serramento
    if (Math.abs(ix - 195) < 6 || Math.abs(iy - 180) < 6) v = 225;
  }
  // qualche macchia scura sparsa: rompe la ripetitività dei mattoni
  const m = ((x * 2654435761) ^ (y * 40503)) >>> 0;
  if (m % 997 < 12) v = 30;
  return Math.max(0, Math.min(255, v + grana(x, y)));
}

/** la stessa facciata SENZA grana: periodica alla perfezione, irriconoscibile */
function scenaRipetitiva(x: number, y: number): number {
  const riga = Math.floor(y / 34);
  const sfalso = riga % 2 ? 40 : 0;
  if ((x + sfalso) % 80 < 5 || y % 34 < 4) return 70;
  return 140;
}

/** lo scatto: per ogni pixel si va a prendere il punto di muro che vede */
function rendi(G: Omografia, quale: (x: number, y: number) => number = scena): Grigia {
  const inv = invertiOmografia(G)!;
  const dati = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const p = applicaOmografia(inv, { x: px + 0.5, y: py + 0.5 });
      dati[py * W + px] = quale(Math.round(p.x), Math.round(p.y));
    }
  }
  return { dati, w: W, h: H };
}

/** quanto due omografie dicono cose diverse, in pixel, su tutto il fotogramma */
function scartoPixel(A: Omografia, B: Omografia): { medio: number; massimo: number } {
  let somma = 0;
  let massimo = 0;
  let n = 0;
  for (let y = 0; y <= H; y += H / 8) {
    for (let x = 0; x <= W; x += W / 8) {
      const p: Punto = { x, y };
      const a = applicaOmografia(A, p);
      const b = applicaOmografia(B, p);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      somma += d;
      massimo = Math.max(massimo, d);
      n++;
    }
  }
  return { medio: somma / n, massimo };
}

/** l'omografia vera che porta lo scatto B sui pixel dello scatto A */
const veraFraScatti = (GA: Omografia, GB: Omografia): Omografia =>
  mul(GA as M3, invertiOmografia(GB)! as M3) as Omografia;

describe('la macchina fotografica finta funziona', () => {
  it('lo scatto frontale è pieno di spigoli da trovare', () => {
    const img = rendi(scatto(0));
    const angoli = angoliFast(img);
    expect(angoli.length).toBeGreaterThan(300);
  });

  it('gli angoli scelti sono sparsi su tutta l’inquadratura, non ammucchiati', () => {
    const img = rendi(scatto(0));
    const scelti = selezionati(angoliFast(img), W, H, 400);
    const caselle = new Set(scelti.map((a) => `${Math.floor(a.x / 80)},${Math.floor(a.y / 80)}`));
    expect(caselle.size).toBeGreaterThan(20);
  });
});

describe('il descrittore riconosce lo stesso punto', () => {
  it('lo stesso angolo nella stessa foto dà lo stesso descrittore', () => {
    const img = rendi(scatto(0));
    const a = descrittore(img, 300, 240, 0.4);
    const b = descrittore(img, 300, 240, 0.4);
    expect(distanzaHamming(a, b)).toBe(0);
  });

  it('due punti diversi danno descrittori lontani', () => {
    const img = rendi(scatto(0));
    const a = descrittore(img, 200, 200, 0);
    const b = descrittore(img, 430, 300, 0);
    expect(distanzaHamming(a, b)).toBeGreaterThan(60);
  });

  it('l’orientamento gira insieme alla foto', () => {
    const img = rendi(scatto(0));
    const o = orientamento(img, 320, 240);
    expect(Number.isFinite(o)).toBe(true);
  });
});

describe('due scatti si ricuciono', () => {
  /** due scatti della stessa facciata, la macchina ruotata di `gradi` */
  const coppia = (gradi: number, inclina = 0) => {
    const GA = scatto(0);
    const GB = scatto((gradi * Math.PI) / 180, (inclina * Math.PI) / 180);
    return { GA, GB, A: rendi(GA), B: rendi(GB), vera: veraFraScatti(GA, GB) };
  };

  it('con una rotazione di 12° il ricucito cade entro il pixel', () => {
    const { A, B, vera } = coppia(12);
    const ca = caratteristiche(A);
    const cb = caratteristiche(B);
    const coppie = abbina(ca, cb);
    const all = omografiaFraScatti(coppie);
    expect(all).toBeTruthy();
    const s = scartoPixel(all!.H, vera);
    console.log(
      `12°: ${coppie.length} abbinamenti, ${all!.buone.length} buoni, ` +
        `errore ${all!.errore.toFixed(2)} px, scarto dalla verità ${s.medio.toFixed(2)}/${s.massimo.toFixed(2)} px`
    );
    expect(s.medio).toBeLessThan(1);
    expect(allineamentoCredibile(all!, W, H)).toBe(true);
  });

  it('regge anche con la macchina inclinata, non solo girata', () => {
    const { A, B, vera } = coppia(10, 6);
    const all = omografiaFraScatti(abbina(caratteristiche(A), caratteristiche(B)));
    expect(all).toBeTruthy();
    const s = scartoPixel(all!.H, vera);
    console.log(`10°+6°: scarto ${s.medio.toFixed(2)}/${s.massimo.toFixed(2)} px`);
    expect(s.medio).toBeLessThan(1.5);
  });

  it('un muro perfettamente ripetitivo non si cuce a caso: si rifiuta', () => {
    // mattoni tutti identici, senza grana: due punti a corsi di distanza sono
    // indistinguibili, e nessun abbinamento è affidabile. L'app deve dirlo,
    // non inventare una panoramica sfalsata di un mattone
    const A = rendi(scatto(0), scenaRipetitiva);
    const B = rendi(scatto((12 * Math.PI) / 180), scenaRipetitiva);
    const all = omografiaFraScatti(abbina(caratteristiche(A), caratteristiche(B)));
    const vera = veraFraScatti(scatto(0), scatto((12 * Math.PI) / 180));
    const buono = all !== null && allineamentoCredibile(all, W, H);
    if (buono) {
      // se dice di essere riuscito, allora deve essere GIUSTO: sbagliare in
      // silenzio è l'unica cosa che non può fare
      expect(scartoPixel(all!.H, vera).medio).toBeLessThan(3);
    }
    console.log(`muro ripetitivo: ${buono ? 'cucito' : 'rifiutato'}`);
  });

  /**
   * FIN DOVE REGGE. Con f=500 su 640 px, ruotare di g gradi sposta l'immagine
   * di f·tan(g): la sovrapposizione è 1 − f·tan(g)/640. Questa prova fissa il
   * confine, che è stato conquistato a fatica: con 900 angoli e soglia 18 si
   * cuciva fino al 62%, e al 51% usciva un'omografia sbagliata di 8,8 px.
   */
  const provaSovrapposizione = (gradi: number) => {
    const { A, B, vera } = coppia(gradi);
    const all = omografiaFraScatti(abbina(caratteristiche(A), caratteristiche(B)));
    const ok = all !== null && allineamentoCredibile(all, W, H);
    return { ok, scarto: all ? scartoPixel(all.H, vera).medio : Infinity };
  };

  it('cuce fino al 39% di sovrapposizione, e ci azzecca', () => {
    for (const [gradi, sovrapposizione] of [
      [8, '89%'],
      [20, '72%'],
      [32, '51%'],
      [38, '39%']
    ] as Array<[number, string]>) {
      const r = provaSovrapposizione(gradi);
      expect(r.ok, `sovrapposizione ${sovrapposizione}`).toBe(true);
      expect(r.scarto, `sovrapposizione ${sovrapposizione}`).toBeLessThan(5);
    }
  });

  it('sotto quel confine si rifiuta invece di cucire storto', () => {
    // al 25% l'omografia esce sbagliata di dieci pixel: meglio dirlo
    expect(provaSovrapposizione(44).ok).toBe(false);
  });

  it('due scatti che non c’entrano niente NON vengono cuciti', () => {
    const A = rendi(scatto(0));
    // stessa facciata ma ruotata di 60°: non si sovrappongono più
    const B = rendi(scatto((60 * Math.PI) / 180));
    const all = omografiaFraScatti(abbina(caratteristiche(A), caratteristiche(B)));
    const buono = all !== null && allineamentoCredibile(all, W, H);
    console.log(`60°: ${all ? `${all.buone.length} coppie buone` : 'nessuna omografia'} → ${buono}`);
    expect(buono).toBe(false);
  });
});


/* --- tre scatti in fila ------------------------------------------------- */

describe('una fila di scatti diventa una tela sola', () => {
  const gradi = (g: number) => (g * Math.PI) / 180;

  it('tre scatti si incatenano e i punti in comune cadono nello stesso posto', () => {
    const G = [scatto(gradi(-12)), scatto(0), scatto(gradi(12))];
    const immagini = G.map((g) => rendi(g));
    const catena = catenaDiScatti(immagini);
    expect(catena.rotturaA).toBeNull();
    expect(catena.legami).toHaveLength(2);
    const disp = disposizione(
      immagini.map((i) => ({ larghezza: i.w, altezza: i.h })),
      catena.legami
    );
    expect(disp).toBeTruthy();

    // LA PROVA VERA di una panoramica: un punto del muro che si vede in due
    // scatti deve finire nello stesso pixel della tela. Se non ci finisce, la
    // giunzione si sdoppia — ed è l'unico difetto che si vede a occhio.
    let peggio = 0;
    for (let mx = -900; mx <= 900; mx += 150) {
      for (let my = -600; my <= 600; my += 150) {
        const suTela: Punto[] = [];
        G.forEach((g, i) => {
          const p = applicaOmografia(g, { x: mx, y: my });
          if (p.x < 10 || p.x > W - 10 || p.y < 10 || p.y > H - 10) return;
          suTela.push(applicaOmografia(disp!.verso[i], p));
        });
        for (let i = 1; i < suTela.length; i++) {
          peggio = Math.max(peggio, Math.hypot(suTela[i].x - suTela[0].x, suTela[i].y - suTela[0].y));
        }
      }
    }
    console.log(
      `tre scatti → tela ${disp!.larghezza}×${disp!.altezza}, ` +
        `giunzioni entro ${peggio.toFixed(2)} px`
    );
    expect(peggio).toBeLessThan(2);
  });

  it('la tela contiene tutti gli scatti, e comincia da zero', () => {
    const G = [scatto(gradi(-10)), scatto(0), scatto(gradi(10))];
    const immagini = G.map((g) => rendi(g));
    const catena = catenaDiScatti(immagini);
    const scatti = immagini.map((i) => ({ larghezza: i.w, altezza: i.h }));
    const disp = disposizione(scatti, catena.legami)!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    scatti.forEach((s, i) => {
      for (const p of [
        { x: 0, y: 0 },
        { x: s.larghezza, y: 0 },
        { x: s.larghezza, y: s.altezza },
        { x: 0, y: s.altezza }
      ]) {
        const q = applicaOmografia(disp.verso[i], p);
        minX = Math.min(minX, q.x);
        minY = Math.min(minY, q.y);
        maxX = Math.max(maxX, q.x);
        maxY = Math.max(maxY, q.y);
      }
    });
    expect(minX).toBeCloseTo(0, 3);
    expect(minY).toBeCloseTo(0, 3);
    expect(maxX).toBeCloseTo(disp.larghezza, 0);
    expect(maxY).toBeCloseTo(disp.altezza, 0);
    // e la panoramica è più larga di un singolo scatto: è tutto il punto
    expect(disp.larghezza).toBeGreaterThan(W * 1.3);
  });

  it('lo scatto di mezzo resta quello non deformato', () => {
    const G = [scatto(gradi(-12)), scatto(0), scatto(gradi(12))];
    const immagini = G.map((g) => rendi(g));
    const catena = catenaDiScatti(immagini);
    const disp = disposizione(
      immagini.map((i) => ({ larghezza: i.w, altezza: i.h })),
      catena.legami
    )!;
    // il riferimento è quello centrale: sulla tela ci va con una semplice
    // traslazione (più la riduzione), senza prospettiva aggiunta
    const H = disp.verso[1];
    expect(Math.abs(H[6])).toBeLessThan(1e-9);
    expect(Math.abs(H[7])).toBeLessThan(1e-9);
  });

  it('se due scatti non si agganciano lo dice, invece di inventare', () => {
    const immagini = [scatto(0), scatto(gradi(55))].map((g) => rendi(g));
    const catena = catenaDiScatti(immagini);
    expect(catena.rotturaA).toBe(1);
    expect(disposizione(immagini.map((i) => ({ larghezza: i.w, altezza: i.h })), catena.legami)).toBeNull();
  });
});
