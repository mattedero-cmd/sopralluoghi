import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analizzaTestoPezzi } from '../../utils/parserPezzi';
import { calcolaNestingSagome } from '../nestingSagome';
import { calcolaNestingMigliore, type PezzoNesting, type Piazzamento } from '../nesting';
import { coppiaPiuStretta, distanzaSagome, sagomaDi } from '../distanzaPoligoni';

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


/**
 * Di quanto potrebbe ANCORA scorrere il pezzo verso l'origine, sagome vere:
 * è la misura di quanto vuoto resta sul tavolo dopo il riaccostamento. Scansione
 * a passo fine — lenta e stupida apposta: qui non si vuole ricontrollare il
 * conto furbo del motore con lo stesso conto furbo.
 */
function scorreAncora(
  p: Piazzamento,
  altri: Piazzamento[],
  verso: 'x' | 'y',
  lama: number,
  margine: number,
  fino: number
): number {
  const sagome = altri.map((q) => sagomaDi(q));
  const massimo = Math.min(fino, p[verso] - margine);
  for (let d = 0.5; d <= massimo; d += 0.5) {
    const S = verso === 'y' ? sagomaDi(p, 0, -d) : sagomaDi(p, -d, 0);
    for (const q of sagome) if (distanzaSagome(S, q) < lama - 1e-6) return d - 0.5;
  }
  return massimo > 0 ? massimo : 0;
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
    const { minima, chi } = coppiaPiuStretta(e);
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
      const { minima, chi } = coppiaPiuStretta(e);
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

  it('sotto una falda il pezzo arriva a toccarla, non si ferma a mezz’aria', () => {
    // È il difetto che si vedeva nel piano: sotto il lato in pendenza di un
    // trapezio restava un vuoto che nessuno aveva chiesto. Veniva dalla
    // griglia — su una bobina da 25 m la cella arriva a quattro centimetri —
    // e il riaccostamento a rettangoli d'ingombro non lo toglieva: l'ingombro
    // del trapezio arriva già sotto il pezzo accostato, e dichiara «fermo»
    // quando di strada ce n'è ancora.
    //
    // La bobina da 25 METRI non è un dettaglio: è la lunghezza che fa crescere
    // la cella, ed è su quella che il difetto si vedeva. Su 5 m non si vede.
    const par = { lastra: { larghezza: 900, altezza: 25000 }, lama: 3, abbondanza: 0, margine: 10 };
    const e = calcolaNestingSagome(par, [
      { id: 'tz', nome: 'Trapezio', larghezza: 860, altezza: 1610, misura3: 1130, quantita: 5, ruotabile: true, tinta: 0, forma: 'trapezioR' },
      { id: 'r1', nome: 'Verde', larghezza: 600, altezza: 700, quantita: 6, ruotabile: true, tinta: 1 },
      { id: 'r2', nome: 'Piccolo', larghezza: 350, altezza: 300, quantita: 8, ruotabile: true, tinta: 2 }
    ] as unknown as PezzoNesting[]);

    expect(e.cella, 'senza una cella grossa questa prova non prova niente').toBeGreaterThan(20);

    let peggiore = { d: 0, chi: '' };
    for (const l of e.lastre)
      for (const p of l.piazzamenti) {
        const altri = l.piazzamenti.filter((q) => q !== p);
        for (const verso of ['y', 'x'] as const) {
          const d = scorreAncora(p, altri, verso, par.lama, par.margine, 150);
          if (d > peggiore.d) peggiore = { d, chi: `${p.nome} in (${p.x}, ${p.y}) può ancora fare ${d} mm in ${verso}` };
        }
      }
    // un decimo di millimetro è l'arrotondamento del piano, non un vuoto
    expect(peggiore.d, peggiore.chi).toBeLessThanOrEqual(0.5);
  }, 300000);
});
