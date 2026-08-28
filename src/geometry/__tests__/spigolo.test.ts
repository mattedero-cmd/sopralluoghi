import { describe, expect, it } from 'vitest';
import { latoDelloSpigolo, spigoliDellaFoto, spigoloFraPiani } from '../spigolo';
import { pianiDalleForme, riferimentiPiano } from '../pianoDaForme';
import { pianoDi } from '../calibrazione';
import type { Annotazione, PianoProspettiva, Punto } from '../../db/types';

/**
 * UNA MACCHINA FOTOGRAFICA VERA, E UN BOX DI CANTIERE.
 *
 * Due omografie inventate a caso NON sono due pareti viste da una macchina
 * sola: lo spigolo, in quel caso, non esiste proprio. Qui la scena si
 * costruisce come nella realtà — obiettivo, posa, due muri perpendicolari che
 * si incontrano in uno spigolo verticale — e da lì si ricavano le due
 * prospettive. Così la risposta giusta si conosce al pixel.
 */

const LARGHEZZA = 1200;
const ALTEZZA = 900;
const FUOCO = 900;

type M3 = number[]; // 3×3 per righe

const perMatrice = (A: M3, B: M3): M3 => {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[r * 3 + k] * B[k * 3 + c];
      C[r * 3 + c] = s;
    }
  return C;
};
const perVettore = (A: M3, v: number[]) => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
];

/** obiettivo: fuoco in pixel, centro dell'immagine */
const K: M3 = [FUOCO, 0, LARGHEZZA / 2, 0, FUOCO, ALTEZZA / 2, 0, 0, 1];
/** la macchina inclinata di `rx` radianti (mondo → macchina) */
const rotX = (rx: number): M3 => [
  1,
  0,
  0,
  0,
  Math.cos(rx),
  -Math.sin(rx),
  0,
  Math.sin(rx),
  Math.cos(rx)
];

/**
 * La prospettiva di un muro: dal punto (a,b) sul muro — a lungo il muro,
 * b verso il basso — ai pixel della foto.
 */
function muro(rx: number, origine: number[], asse: number[]): M3 {
  const R = rotX(rx);
  const KR = perMatrice(K, R);
  const u = perVettore(KR, asse);
  const v = perVettore(KR, [0, 1, 0]); // i muri stanno in piedi
  const o = perVettore(KR, origine);
  // colonne [u | v | o]
  return [u[0], v[0], o[0], u[1], v[1], o[1], u[2], v[2], o[2]];
}

const suFoto = (G: M3, a: number, b: number): Punto => {
  const p = perVettore(G, [a, b, 1]);
  return { x: p[0] / p[2], y: p[1] / p[2] };
};

/** il muro scritto come piano salvabile: quattro angoli e due misure */
function piano(G: M3, L: number, A: number): PianoProspettiva {
  return {
    punti: [suFoto(G, 0, 0), suFoto(G, L, 0), suFoto(G, L, A), suFoto(G, 0, A)] as [
      Punto,
      Punto,
      Punto,
      Punto
    ],
    larghezzaReale: L,
    altezzaReale: A,
    unita: 'mm'
  };
}

/**
 * Il box: spigolo verticale a sei metri davanti all'obiettivo, il fronte che
 * va a destra e il fianco a sinistra, perpendicolari fra loro. Le misure sono
 * in millimetri, come nel resto dell'app.
 */
const ANGOLO = 0.42; // il box è girato di ~24° rispetto all'obiettivo
const ORIGINE = [0, -1200, 6000];
const scena = (rx: number) => {
  const G1 = muro(rx, ORIGINE, [Math.cos(ANGOLO), 0, Math.sin(ANGOLO)]);
  const G2 = muro(rx, ORIGINE, [-Math.sin(ANGOLO), 0, Math.cos(ANGOLO)]);
  return {
    fronte: piano(G1, 5000, 2500),
    fianco: piano(G2, 2400, 2500),
    // lo spigolo vero: la verticale per l'origine, dai piedi al tetto
    spigolo: [suFoto(G1, 0, 0), suFoto(G1, 0, 2500)] as [Punto, Punto],
    // dove stanno le forme quotate: in mezzo a ciascun muro
    ancoreFronte: [suFoto(G1, 2500, 1200)],
    ancoreFianco: [suFoto(G2, 1200, 1200)]
  };
};

/** distanza di un punto dalla retta dello spigolo vero */
function daSpigolo(spigolo: [Punto, Punto], p: Punto): number {
  const [s1, s2] = spigolo;
  const a = s2.y - s1.y;
  const b = s1.x - s2.x;
  const c = -(a * s1.x + b * s1.y);
  return Math.abs(a * p.x + b * p.y + c) / Math.hypot(a, b);
}

describe('spigoloFraPiani', () => {
  it('con la macchina inclinata trova lo spigolo, al pixel', () => {
    const s = scena(-0.09);
    const trovato = spigoloFraPiani(
      s.fronte,
      s.fianco,
      LARGHEZZA,
      ALTEZZA,
      s.ancoreFronte,
      s.ancoreFianco
    )!;
    expect(trovato).toBeTruthy();
    expect(daSpigolo(s.spigolo, trovato.p1)).toBeLessThan(1);
    expect(daSpigolo(s.spigolo, trovato.p2)).toBeLessThan(1);
  });

  it('con la macchina in bolla — verticali che non convergono — lo trova lo stesso', () => {
    const s = scena(0);
    const trovato = spigoloFraPiani(
      s.fronte,
      s.fianco,
      LARGHEZZA,
      ALTEZZA,
      s.ancoreFronte,
      s.ancoreFianco
    )!;
    expect(trovato).toBeTruthy();
    expect(daSpigolo(s.spigolo, trovato.p1)).toBeLessThan(1);
    expect(daSpigolo(s.spigolo, trovato.p2)).toBeLessThan(1);
  });

  it('dice da che parte sta un punto: di qua il fronte, di là il fianco', () => {
    const s = scena(-0.09);
    const trovato = spigoloFraPiani(
      s.fronte,
      s.fianco,
      LARGHEZZA,
      ALTEZZA,
      s.ancoreFronte,
      s.ancoreFianco
    )!;
    expect(latoDelloSpigolo(trovato, s.ancoreFronte[0])).toBe(trovato.segnoPrimo);
    expect(latoDelloSpigolo(trovato, s.ancoreFianco[0])).toBe(-trovato.segnoPrimo);
  });

  it('non dipende dall’ordine dei due piani', () => {
    const s = scena(-0.09);
    const a = spigoloFraPiani(s.fronte, s.fianco, LARGHEZZA, ALTEZZA, s.ancoreFronte, s.ancoreFianco)!;
    const b = spigoloFraPiani(s.fianco, s.fronte, LARGHEZZA, ALTEZZA, s.ancoreFianco, s.ancoreFronte)!;
    expect(daSpigolo(s.spigolo, b.p1)).toBeLessThan(1);
    // stessa retta, a meno del verso
    expect(Math.abs(a.retta.a * b.retta.b - a.retta.b * b.retta.a)).toBeLessThan(1e-3);
  });

  it('regge il rumore del dito sugli angoli', () => {
    // gli angoli delle forme si puntano a mano: i piani arrivano un po' storti
    const s = scena(-0.09);
    const scosta = (p: PianoProspettiva, q: number): PianoProspettiva => ({
      ...p,
      punti: p.punti.map((v, i) => ({
        x: v.x + q * Math.sin(i * 2.3 + 1),
        y: v.y + q * Math.cos(i * 1.7)
      })) as [Punto, Punto, Punto, Punto]
    });
    const trovato = spigoloFraPiani(
      scosta(s.fronte, 1),
      scosta(s.fianco, 1),
      LARGHEZZA,
      ALTEZZA,
      s.ancoreFronte,
      s.ancoreFianco
    );
    expect(trovato).toBeTruthy();
    // un pixel di errore per angolo sposta lo spigolo di qualche pixel, non di più
    expect(daSpigolo(s.spigolo, trovato!.p1)).toBeLessThan(30);
    expect(daSpigolo(s.spigolo, trovato!.p2)).toBeLessThan(30);
  });

  it('due pareti parallele non fanno spigolo', () => {
    const s = scena(-0.09);
    // stesso muro, spostato più in là: stessa giacitura, nessuno spigolo
    const G = muro(-0.09, [3000, -1200, 6000], [Math.cos(ANGOLO), 0, Math.sin(ANGOLO)]);
    expect(spigoloFraPiani(s.fronte, piano(G, 3000, 2500), LARGHEZZA, ALTEZZA)).toBeNull();
  });

  it('con lo stesso piano ripetuto non si inventa niente', () => {
    const s = scena(-0.09);
    expect(spigoloFraPiani(s.fronte, s.fronte, LARGHEZZA, ALTEZZA)).toBeNull();
  });

  it('un piano degenere non manda in errore', () => {
    const s = scena(-0.09);
    const rotto: PianoProspettiva = {
      punti: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ],
      larghezzaReale: 100,
      altezzaReale: 100,
      unita: 'mm'
    };
    expect(spigoloFraPiani(s.fronte, rotto, LARGHEZZA, ALTEZZA)).toBeNull();
  });
});

/* --- dal sopralluogo allo spigolo, tutto il percorso ------------------- */

describe('lo spigolo del sopralluogo vero', () => {
  /** una finestra quotata sul muro: quattro angoli sulla foto e due misure */
  const finestra = (
    G: M3,
    id: string,
    a: number,
    b: number,
    w: number,
    h: number,
    rumore: number
  ): Annotazione => {
    const scosta = (i: number, k: number) =>
      rumore * Math.sin(id.charCodeAt(id.length - 1) * 5.1 + i * 2.9 + k * 1.3);
    const punti = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h]
    ].map(([dx, dy], i) => {
      const p = suFoto(G, a + dx, b + dy);
      return { x: p.x + scosta(i, 0), y: p.y + scosta(i, 1) };
    });
    return {
      id,
      fotoId: 'f1',
      zIndex: 0,
      stile: { colore: '#fff', spessore: 2, dimensioneTesto: 14 },
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

  /** il percorso completo: finestre quotate → pareti → spigolo */
  const spigoloDaSopralluogo = (rumore: number) => {
    const rx = -0.09;
    const G1 = muro(rx, ORIGINE, [Math.cos(ANGOLO), 0, Math.sin(ANGOLO)]);
    const G2 = muro(rx, ORIGINE, [-Math.sin(ANGOLO), 0, Math.cos(ANGOLO)]);
    const annotazioni = [
      finestra(G1, 'a1', 700, 600, 850, 900, rumore),
      finestra(G1, 'a2', 2100, 600, 850, 900, rumore),
      finestra(G1, 'a3', 3500, 600, 800, 1150, rumore),
      finestra(G2, 'a4', 300, 650, 920, 830, rumore),
      finestra(G2, 'a5', 1400, 650, 860, 770, rumore)
    ];
    const pareti = pianiDalleForme(riferimentiPiano(annotazioni));
    const spigoli = spigoliDellaFoto(
      pareti.map((p) => p.piano),
      LARGHEZZA,
      ALTEZZA
    );
    return {
      pareti,
      spigoli,
      vero: [suFoto(G1, 0, 0), suFoto(G1, 0, 2500)] as [Punto, Punto]
    };
  };

  it('cinque finestre su due muri: due pareti e uno spigolo, dove deve stare', () => {
    const { pareti, spigoli, vero } = spigoloDaSopralluogo(0);
    expect(pareti).toHaveLength(2);
    expect(spigoli).toHaveLength(1);
    expect(daSpigolo(vero, spigoli[0].spigolo.p1)).toBeLessThan(2);
    expect(daSpigolo(vero, spigoli[0].spigolo.p2)).toBeLessThan(2);
  });

  it('col dito che sbaglia mezzo pixel per angolo lo spigolo tiene', () => {
    const { spigoli, vero } = spigoloDaSopralluogo(0.5);
    expect(spigoli).toHaveLength(1);
    // su un'immagine da 1200 px lo spigolo balla di una trentina di pixel:
    // è il 2%, e si vede al posto giusto. Non è un errore del conto, è
    // quello che mezzo pixel per angolo comporta
    expect(daSpigolo(vero, spigoli[0].spigolo.p1)).toBeLessThan(30);
    expect(daSpigolo(vero, spigoli[0].spigolo.p2)).toBeLessThan(30);
  });
});

describe('vicino all’angolo comanda lo spigolo, non la forma più vicina', () => {
  const rx = -0.09;
  const G1 = muro(rx, ORIGINE, [Math.cos(ANGOLO), 0, Math.sin(ANGOLO)]);
  const G2 = muro(rx, ORIGINE, [-Math.sin(ANGOLO), 0, Math.cos(ANGOLO)]);
  const fronte = piano(G1, 5000, 2500);
  const fianco = piano(G2, 2400, 2500);
  // le forme del fronte sono lontane dall'angolo, quelle del fianco vicine:
  // è il caso che inganna la regola «la parete con la forma più vicina»
  fronte.ancore = [suFoto(G1, 3800, 1200)];
  fianco.ancore = [suFoto(G2, 500, 1200)];
  const foto = {
    scala: null,
    piano: fronte,
    piani: [fianco],
    larghezzaPx: LARGHEZZA,
    altezzaPx: ALTEZZA
  };

  it('un punto sul fronte a due dita dall’angolo è del fronte', () => {
    const p = suFoto(G1, 250, 1200); // 25 cm oltre lo spigolo, sul fronte
    expect(pianoDi(foto, p)).toBe(fronte);
  });

  it('e uno sul fianco, altrettanto vicino, è del fianco', () => {
    const p = suFoto(G2, 250, 1200);
    expect(pianoDi(foto, p)).toBe(fianco);
  });

  it('è proprio il caso che la forma più vicina sbaglia', () => {
    // senza le misure della foto lo spigolo non si può calcolare e si torna
    // alla regola di ripiego: quel punto sul FRONTE finirebbe al fianco,
    // perché la finestra del fianco è più vicina
    const senza = { scala: null, piano: fronte, piani: [fianco] };
    expect(pianoDi(senza, suFoto(G1, 250, 1200))).toBe(fianco);
  });
});
