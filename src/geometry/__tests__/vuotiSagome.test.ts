import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analizzaTestoPezzi } from '../../utils/parserPezzi';
import { calcolaNestingSagome } from '../nestingSagome';
import { calcolaNestingMigliore, type PezzoNesting, type Piazzamento } from '../nesting';

/**
 * I VUOTI CHE NESSUNO HA IMPOSTATO.
 *
 * Basta un pezzo non rettangolare nell'elenco perché tutto il materiale passi
 * dal motore a rettangoli a quello a sagoma reale, che appoggia i pezzi su una
 * griglia di qualche millimetro. La griglia si vedeva: fra due pezzi restava
 * un vuoto di otto-dieci millimetri — non la lama, l'arrotondamento — e in
 * cantiere quel vuoto è una cosa che non si è chiesta e non si spiega.
 *
 * Queste prove tengono ferme due cose insieme, e sono in tensione:
 *
 *  1. i vuoti devono essere la LAMA e nient'altro, come nel motore a
 *     rettangoli — è quello che si vede;
 *  2. nessuna coppia di pezzi deve mai finire più vicina della lama, e qui si
 *     misura la distanza fra le SAGOME VERE, non fra gli ingombri: due
 *     ingombri accavallati sono la ragione per cui questo motore esiste, ma
 *     due sagome a meno di una lama sono due pezzi che la macchina taglia uno
 *     dentro l'altro.
 *
 * Chi stringe i pezzi senza rispettare la seconda rompe del materiale vero.
 */

type Pt = [number, number];

/** la sagoma vera del piazzamento, in coordinate di lastra */
function sagoma(p: Piazzamento): Pt[] {
  if (p.punti && p.punti.length > 2) return p.punti.map((q) => [p.x + q[0], p.y + q[1]] as Pt);
  if (p.forma === 'cerchio') {
    // il cerchio non porta poligono: qui basta approssimarlo fitto, e per
    // difetto — un poligono inscritto non fa mai sembrare una coppia più
    // larga di quanto sia
    const r = p.larghezza / 2;
    const cx = p.x + r;
    const cy = p.y + r;
    const n = 360;
    return Array.from({ length: n }, (_, k): Pt => {
      const a = (2 * Math.PI * k) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
  }
  return [
    [p.x, p.y],
    [p.x + p.larghezza, p.y],
    [p.x + p.larghezza, p.y + p.altezza],
    [p.x, p.y + p.altezza]
  ];
}

function distanzaSegmenti(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const puntoSegmento = (p: Pt, q: Pt, r: Pt) => {
    const vx = r[0] - q[0];
    const vy = r[1] - q[1];
    const l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - q[0]) * vx + (p[1] - q[1]) * vy) / l)) : 0;
    return Math.hypot(p[0] - (q[0] + t * vx), p[1] - (q[1] + t * vy));
  };
  return Math.min(
    puntoSegmento(a, c, d),
    puntoSegmento(b, c, d),
    puntoSegmento(c, a, b),
    puntoSegmento(d, a, b)
  );
}

/** distanza fra due poligoni convessi (0 se si toccano o si accavallano) */
function distanzaSagome(P: Pt[], Q: Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < P.length; i++)
    for (let j = 0; j < Q.length; j++)
      m = Math.min(m, distanzaSegmenti(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length]));
  return m;
}

/** la coppia più stretta di tutto il piano, sagoma contro sagoma */
function piuStretta(esito: { lastre: Array<{ piazzamenti: Piazzamento[] }> }) {
  let minima = Infinity;
  let chi = '';
  esito.lastre.forEach((l, i) => {
    const ps = l.piazzamenti;
    for (let a = 0; a < ps.length; a++)
      for (let b = a + 1; b < ps.length; b++) {
        const d = distanzaSagome(sagoma(ps[a]), sagoma(ps[b]));
        if (d < minima) {
          minima = d;
          chi = `${ps[a].nome} e ${ps[b].nome} sulla lastra ${i + 1}`;
        }
      }
  });
  return { minima, chi };
}

/** i vuoti verticali fra pezzi incolonnati: è il filo che si vede nel piano */
function vuotiIncolonnati(esito: { lastre: Array<{ piazzamenti: Piazzamento[] }> }) {
  const g: number[] = [];
  for (const l of esito.lastre)
    for (const A of l.piazzamenti)
      for (const B of l.piazzamenti) {
        if (A === B) continue;
        if (!(A.x < B.x + B.larghezza - 1e-6 && B.x < A.x + A.larghezza - 1e-6)) continue;
        const d = B.y - (A.y + A.altezza);
        if (d >= -1e-6 && d < 200) g.push(d);
      }
  g.sort((a, b) => a - b);
  return g;
}

const mediana = (g: number[]) => g[Math.floor(g.length / 2)];

const treno = readFileSync(new URL('./treno.test.ts', import.meta.url), 'utf8');
const LISTA = treno.slice(
  treno.indexOf('const LISTA = `') + 15,
  treno.indexOf('`;', treno.indexOf('const LISTA = `'))
);
const PEZZI: PezzoNesting[] = analizzaTestoPezzi(LISTA).pezzi.map(
  (p, i) =>
    ({
      id: `p${i}`,
      nome: p.nome,
      larghezza: p.larghezza,
      altezza: p.altezza,
      quantita: p.quantita,
      ruotabile: p.ruotabile,
      tinta: 0
    }) as PezzoNesting
);
const BOBINA = { lastra: { larghezza: 1220, altezza: 5000 }, lama: 3, abbondanza: 0, margine: 10 };
const OBLO = {
  id: 'ob',
  nome: 'OBLO',
  larghezza: 300,
  altezza: 300,
  quantita: 1,
  ruotabile: true,
  tinta: 0,
  forma: 'cerchio'
} as unknown as PezzoNesting;

describe('i vuoti fra i pezzi quando c’è una sagoma', () => {
  it('un solo pezzo tondo non allarga i vuoti di tutto il lavoro', () => {
    // il lavoro del treno, tutto rettangoli: è il metro di paragone
    const rett = calcolaNestingMigliore(BOBINA, PEZZI, { sfridoRettangolare: true });
    const conSagoma = calcolaNestingSagome(BOBINA, [...PEZZI, OBLO]);

    const a = vuotiIncolonnati(rett);
    const b = vuotiIncolonnati(conSagoma);
    expect(a.length, 'il confronto non misura niente').toBeGreaterThan(50);
    expect(b.length).toBeGreaterThan(50);

    // il motore a rettangoli lascia la lama e basta: è quello che si vede oggi
    expect(mediana(a)).toBe(BOBINA.lama);
    // e con la sagoma dev'essere la stessa cosa, non la cella della griglia
    expect(mediana(b)).toBe(BOBINA.lama);
    expect(b[Math.floor(b.length * 0.9)]).toBeLessThanOrEqual(BOBINA.lama);
  }, 180000);

  it('nessuna sagoma finisce più vicina della lama a un’altra', () => {
    const e = calcolaNestingSagome(BOBINA, [
      ...PEZZI,
      OBLO,
      {
        id: 'tr',
        nome: 'VELA',
        larghezza: 800,
        altezza: 700,
        quantita: 4,
        ruotabile: true,
        tinta: 0,
        forma: 'triangolo'
      },
      {
        id: 'tz',
        nome: 'FRONTONE',
        larghezza: 500,
        altezza: 300,
        misura3: 300,
        quantita: 4,
        ruotabile: true,
        tinta: 0,
        forma: 'trapezio'
      }
    ] as unknown as PezzoNesting[]);
    const { minima, chi } = piuStretta(e);
    expect(minima, chi).toBeGreaterThanOrEqual(BOBINA.lama - 0.01);
  }, 180000);

  it('su trenta lavori a caso la lama passa sempre, e quasi sempre appena', () => {
    // lame, abbondanze, lastre e bobine diverse: quello che cambia il passo
    // della griglia. La prova non è «ci stanno»: è che fra due sagome ci sia
    // SEMPRE la lama, e che il vuoto non sia molto di più.
    let seme = 12345;
    const caso = () => ((seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const forme = [undefined, 'cerchio', 'triangolo', 'rombo', 'trapezio', 'trapezioR'];
    let strette = 0;
    let coppie = 0;

    for (let giro = 0; giro < 30; giro++) {
      const bobina = caso() < 0.4;
      const par = {
        lastra: bobina ? { larghezza: 1220, altezza: 5000 } : { larghezza: 2500, altezza: 1250 },
        lama: [2, 3, 5][Math.floor(caso() * 3)],
        abbondanza: caso() < 0.3 ? 10 : 0,
        margine: 10
      };
      const lista = Array.from({ length: 4 + Math.floor(caso() * 6) }, (_, i) => {
        const f = forme[Math.floor(caso() * forme.length)];
        const l = 150 + Math.floor(caso() * 700);
        const a = 150 + Math.floor(caso() * 600);
        return {
          id: `p${i}`,
          nome: `P${i}`,
          larghezza: l,
          altezza: a,
          quantita: 1 + Math.floor(caso() * 4),
          ruotabile: caso() < 0.9,
          tinta: 0,
          ...(f
            ? { forma: f, ...(f.startsWith('trapezio') ? { misura3: Math.max(20, Math.floor(l * 0.6)) } : {}) }
            : {})
        } as unknown as PezzoNesting;
      });
      // senza una sagoma questo motore non si userebbe nemmeno
      if (!lista.some((p) => (p as { forma?: string }).forma)) {
        (lista[0] as unknown as { forma: string }).forma = 'cerchio';
      }

      const e = calcolaNestingSagome(par, lista);
      const { minima, chi } = piuStretta(e);
      if (Number.isFinite(minima)) {
        expect(minima, `giro ${giro}: ${chi}`).toBeGreaterThanOrEqual(par.lama - 0.01);
        coppie++;
        if (minima <= par.lama + 0.01) strette++;
      }
    }
    // e non basta che la lama passi: se i pezzi restassero lontani sarebbe il
    // difetto di prima. Nella grande maggioranza dei lavori c'è almeno una
    // coppia che si tocca esattamente a lama.
    expect(coppie).toBeGreaterThan(20);
    expect(strette / coppie).toBeGreaterThan(0.8);
  }, 300000);
});
