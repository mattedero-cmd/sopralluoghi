import { describe, expect, it } from 'vitest';
import {
  COLONNE_MASSIME,
  LUNGHEZZA_CAPOVERSO,
  colonneConsigliate,
  spezzaInColonne,
  tagliaLibero
} from '../colonne';
import { impaginaLastra } from '../disegnoNesting';
import type { LastraNesting, Piazzamento } from '../../geometry/nesting';
import type { PuntoSagoma } from '../../geometry/sagome';

/**
 * IL ROTOLO CHE VA A CAPO.
 *
 * Un segmento di bobina lungo quindici metri e largo uno, disegnato intero su
 * un A4, è un filo alto venti centimetri e largo uno: i pezzi diventano
 * striscioline e i nomi non ci stanno più dentro, quindi non si scrivono. Il
 * foglio al banco non dice più niente.
 *
 * Spezzandolo in colonne affiancate, come il testo di un giornale, la scala
 * del disegno si moltiplica per il numero di colonne. Qui si verifica che il
 * rimedio non perda e non duplichi materiale: l'area disegnata resta la
 * stessa, ogni pezzo porta il suo nome UNA volta sola, e le colonne vanno
 * tutte alla stessa scala — se no lo stesso pezzo risulterebbe più grande in
 * una colonna che nell'altra.
 */

const P = (nome: string, x: number, y: number, l: number, a: number): Piazzamento =>
  ({
    x,
    y,
    larghezza: l,
    altezza: a,
    larghezzaFinita: l,
    altezzaFinita: a,
    nome,
    tinta: 0,
    ruotato: false,
    chiave: `${nome}#0`
  }) as Piazzamento;

/** un piazzamento con la sagoma vera: i vertici sono relativi a (x, y) */
const S = (
  nome: string,
  x: number,
  y: number,
  l: number,
  a: number,
  punti: PuntoSagoma[],
  forma = 'trapezioR'
): Piazzamento => ({ ...P(nome, x, y, l, a), forma, punti }) as Piazzamento;

const area = (punti: PuntoSagoma[]) => {
  let s = 0;
  for (let i = 0; i < punti.length; i++) {
    const p = punti[i];
    const q = punti[(i + 1) % punti.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
};

/** area disegnata di un piazzamento: la sagoma se c'è, se no l'ingombro */
const areaPezzo = (pc: Piazzamento) =>
  pc.punti ? area(pc.punti) : pc.forma === 'cerchio' ? Math.PI * (pc.larghezza / 2) ** 2 : pc.larghezza * pc.altezza;

const areaLastra = (l: LastraNesting) => l.piazzamenti.reduce((s, pc) => s + areaPezzo(pc), 0);

/** il rotolo del cantiere: quindici metri di pezzi su una bobina da 1520 */
const ROTOLO: LastraNesting = {
  piazzamenti: Array.from({ length: 20 }, (_, i) =>
    P(`A${i + 1}`, i % 2 === 0 ? 0 : 760, Math.floor(i / 2) * 1500, 740, 1400)
  )
};
const LUNGO = { larghezza: 1520, altezza: 15000 };
/** l'area utile su un A4 in piedi, col disegno sotto l'intestazione */
const A4_PIEDI = { larghezza: 515.28, altezza: 673.89 };

describe('quante colonne convengono', () => {
  it('un rotolo lungo e stretto va a capo, e la scala ci guadagna', () => {
    const k = colonneConsigliate(LUNGO, A4_PIEDI, 12);
    expect(k).toBeGreaterThan(1);
    const scala = (q: number) =>
      Math.min(
        (A4_PIEDI.larghezza - (q - 1) * 12) / q / LUNGO.larghezza,
        A4_PIEDI.altezza / (LUNGO.altezza / q)
      );
    // la scala cresce davvero: è tutto il motivo per cui si spezza
    expect(scala(k)).toBeGreaterThan(scala(1) * 1.5);
  });

  it('sceglie la divisione che fa il disegno più grande', () => {
    const scala = (q: number) =>
      Math.min(
        (A4_PIEDI.larghezza - (q - 1) * 12) / q / LUNGO.larghezza,
        A4_PIEDI.altezza / (LUNGO.altezza / q)
      );
    const k = colonneConsigliate(LUNGO, A4_PIEDI, 12);
    for (let q = 1; q <= 6; q++) expect(scala(k) + 1e-9).toBeGreaterThanOrEqual(scala(q));
  });

  it('sotto i cinque metri il foglio si legge intero', () => {
    expect(LUNGHEZZA_CAPOVERSO).toBe(5000);
    for (const corto of [1200, 3000, 4200, 4900, 5000]) {
      const k = colonneConsigliate({ larghezza: 1250, altezza: corto }, A4_PIEDI, 12);
      expect(k, `${corto} mm`).toBe(1);
    }
  });

  it('oltre i cinque metri va a capo', () => {
    for (const lungo of [5200, 6000, 8000, 12000]) {
      const k = colonneConsigliate({ larghezza: 1250, altezza: lungo }, A4_PIEDI, 12);
      expect(k, `${lungo} mm`).toBeGreaterThan(1);
    }
  });

  it('non va mai oltre tre sezioni, per lungo che sia il rotolo', () => {
    expect(COLONNE_MASSIME).toBe(3);
    for (const lungo of [8000, 15000, 30000, 100000]) {
      const k = colonneConsigliate({ larghezza: 1520, altezza: lungo }, A4_PIEDI, 12);
      expect(k, `${lungo} mm`).toBeLessThanOrEqual(3);
      expect(k, `${lungo} mm`).toBeGreaterThanOrEqual(1);
    }
  });

  it('una lastra normale resta tutta intera', () => {
    // 3210×1220 su A4 coricato: la larghezza è il vincolo, spezzare peggiora
    const coricato = { larghezza: 761.89, altezza: 427.28 };
    expect(colonneConsigliate({ larghezza: 3210, altezza: 1220 }, coricato, 12)).toBe(1);
  });

  it('un foglio quadrato resta tutto intero', () => {
    expect(colonneConsigliate({ larghezza: 1000, altezza: 1000 }, A4_PIEDI, 12)).toBe(1);
  });
});

describe('dove si taglia', () => {
  const pezzi = [P('a', 0, 0, 500, 900), P('b', 0, 1000, 500, 900), P('c', 0, 2000, 500, 900)];

  it('se nessuno attraversa la quota, si taglia lì', () => {
    expect(tagliaLibero(pezzi, 950, 200)).toBe(950);
  });

  it('si sposta alla riga sgombra più vicina', () => {
    // 1500 cade in mezzo al pezzo «b»: si va a 1900, la sua fine
    expect(tagliaLibero(pezzi, 1500, 500)).toBe(1900);
  });

  it('toccare un pezzo non è attraversarlo', () => {
    expect(tagliaLibero(pezzi, 1000, 200)).toBe(1000);
    expect(tagliaLibero(pezzi, 900, 200)).toBe(900);
  });

  it("se non c'è nessuna riga sgombra vicino, si taglia all'ideale", () => {
    const pieno = [P('unico', 0, 0, 500, 5000)];
    expect(tagliaLibero(pieno, 2500, 300)).toBe(2500);
  });
});

describe('il rotolo spezzato in colonne', () => {
  it('con una colonna sola non cambia niente', () => {
    const c = spezzaInColonne(ROTOLO, LUNGO, 1);
    expect(c).toHaveLength(1);
    expect(c[0].lastra.piazzamenti).toEqual(ROTOLO.piazzamenti);
    expect(c[0].etichettate.size).toBe(ROTOLO.piazzamenti.length);
  });

  it('le colonne coprono il rotolo da capo a fondo, in fila', () => {
    const c = spezzaInColonne(ROTOLO, LUNGO, 3);
    expect(c).toHaveLength(3);
    expect(c[0].da).toBe(0);
    expect(c[2].a).toBe(LUNGO.altezza);
    for (let i = 1; i < c.length; i++) expect(c[i].da).toBe(c[i - 1].a);
  });

  it('non perde e non duplica materiale', () => {
    for (const k of [2, 3, 4]) {
      const c = spezzaInColonne(ROTOLO, LUNGO, k);
      const somma = c.reduce((s, x) => s + areaLastra(x.lastra), 0);
      expect(somma, `con ${k} colonne`).toBeCloseTo(areaLastra(ROTOLO), 3);
    }
  });

  it('ogni pezzo porta il suo nome una volta sola', () => {
    for (const k of [2, 3, 4, 6]) {
      const c = spezzaInColonne(ROTOLO, LUNGO, k);
      for (const pc of ROTOLO.piazzamenti) {
        const quante = c.filter((x) => x.etichettate.has(pc.chiave)).length;
        expect(quante, `${pc.nome} con ${k} colonne`).toBe(1);
      }
      // e nessuna etichetta avanza su un pezzo che in quella colonna non c'è
      for (const x of c) {
        const presenti = new Set(x.lastra.piazzamenti.map((pc) => pc.chiave));
        for (const ch of x.etichettate) expect(presenti.has(ch)).toBe(true);
      }
    }
  });

  it('nessun pezzo sporge dalla sua colonna', () => {
    for (const k of [2, 3, 5]) {
      const c = spezzaInColonne(ROTOLO, LUNGO, k);
      for (const x of c) {
        for (const pc of x.lastra.piazzamenti) {
          expect(pc.y, `${pc.nome} sopra il bordo`).toBeGreaterThanOrEqual(-1e-6);
          expect(pc.y + pc.altezza, `${pc.nome} sotto il bordo`).toBeLessThanOrEqual(
            x.a - x.da + 1e-6
          );
        }
      }
    }
  });

  it('un pezzo che sta tutto dentro resta identico, solo spostato', () => {
    const c = spezzaInColonne(ROTOLO, LUNGO, 3);
    const dentro = c[1].lastra.piazzamenti.find((pc) => pc.nome === 'A13');
    const vero = ROTOLO.piazzamenti.find((pc) => pc.nome === 'A13')!;
    expect(dentro).toBeDefined();
    expect(dentro!.larghezza).toBe(vero.larghezza);
    expect(dentro!.altezza).toBe(vero.altezza);
    expect(dentro!.y).toBeCloseTo(vero.y - c[1].da, 6);
  });
});

describe('un pezzo tagliato in due dal capoverso', () => {
  /** il trapezio a cavallo del taglio: niente riga sgombra, si deve spezzare */
  const TRAPEZIO = S('T', 0, 400, 600, 400, [
    [0, 0],
    [600, 0],
    [600, 400],
    [0, 200]
  ]);
  const UNICO: LastraNesting = { piazzamenti: [TRAPEZIO] };
  const MISURE = { larghezza: 600, altezza: 1200 };

  it('le due metà sommano al pezzo intero', () => {
    const c = spezzaInColonne(UNICO, MISURE, 2, 0);
    const parti = c.flatMap((x) => x.lastra.piazzamenti);
    expect(parti).toHaveLength(2);
    expect(parti.reduce((s, pc) => s + areaPezzo(pc), 0)).toBeCloseTo(area(TRAPEZIO.punti!), 3);
  });

  it('il nome si scrive dove sta il suo centro', () => {
    const c = spezzaInColonne(UNICO, MISURE, 2, 0);
    // il centro del trapezio è a 600 mm, cioè nella seconda colonna
    expect(c[0].etichettate.has('T#0')).toBe(false);
    expect(c[1].etichettate.has('T#0')).toBe(true);
  });

  it('il cerchio tagliato diventa il suo poligono', () => {
    const cerchio = { ...P('O', 0, 400, 600, 600), forma: 'cerchio' } as Piazzamento;
    const c = spezzaInColonne({ piazzamenti: [cerchio] }, { larghezza: 600, altezza: 1200 }, 2, 0);
    const parti = c.flatMap((x) => x.lastra.piazzamenti);
    expect(parti).toHaveLength(2);
    for (const pc of parti) {
      // un mezzo cerchio disegnato come cerchio sarebbe un cerchio intero:
      // da qui in poi è una sagoma
      expect(pc.forma).not.toBe('cerchio');
      expect(pc.punti).toBeDefined();
    }
    const somma = parti.reduce((s, pc) => s + area(pc.punti!), 0);
    // il poligono a 48 lati vale il 99,7% del cerchio: si confronta con quello
    const intero = area(
      Array.from({ length: 48 }, (_, k): PuntoSagoma => [
        300 + 300 * Math.cos((2 * Math.PI * k) / 48),
        300 + 300 * Math.sin((2 * Math.PI * k) / 48)
      ])
    );
    expect(somma).toBeCloseTo(intero, 3);
  });

  it('un pezzo che comincia prima della prima colonna il nome lo prende comunque', () => {
    // il taglio di un segmento di bobina può cadere in mezzo a un pezzo: la
    // sua coda apre il foglio e non deve restare muta
    const coda = S('C', 0, -500, 600, 1000, [
      [0, 0],
      [600, 0],
      [600, 1000],
      [0, 1000]
    ]);
    const c = spezzaInColonne({ piazzamenti: [coda] }, { larghezza: 600, altezza: 1000 }, 2, 0);
    expect(c[0].etichettate.has('C#0')).toBe(true);
    expect(c[1].etichettate.has('C#0')).toBe(false);
  });
});

describe('tutte le colonne alla stessa scala', () => {
  it("la scala imposta vince su quella che starebbe nell'area", () => {
    const d = impaginaLastra(
      { piazzamenti: [P('a', 0, 0, 500, 500)] },
      { larghezza: 1000, altezza: 1000 },
      { x: 0, y: 0, larghezza: 400, altezza: 400 },
      { scala: 0.1 }
    );
    expect(d.scala).toBe(0.1);
    expect(d.cornice.larghezza).toBeCloseTo(100, 6);
    expect(d.pezzi[0].larghezza).toBeCloseTo(50, 6);
  });

  it('senza imporla, resta quella di sempre', () => {
    const d = impaginaLastra(
      { piazzamenti: [P('a', 0, 0, 500, 500)] },
      { larghezza: 1000, altezza: 1000 },
      { x: 0, y: 0, larghezza: 400, altezza: 400 }
    );
    expect(d.scala).toBeCloseTo(0.4, 6);
  });

  it('le colonne di un rotolo vero vengono tutte uguali', () => {
    // i tagli si spostano per non spezzare i pezzi, quindi i tratti NON sono
    // lunghi uguali: la scala la deve dettare il più lungo, una volta per tutti
    const c = spezzaInColonne(ROTOLO, LUNGO, 3);
    const lunghezze = c.map((x) => x.a - x.da);
    const piuLunga = Math.max(...lunghezze);
    const larga = (A4_PIEDI.larghezza - 2 * 12) / 3;
    const scala = Math.min(larga / LUNGO.larghezza, A4_PIEDI.altezza / piuLunga);
    const disegni = c.map((x, i) =>
      impaginaLastra(
        x.lastra,
        { larghezza: LUNGO.larghezza, altezza: x.a - x.da },
        { x: i * (larga + 12), y: 0, larghezza: larga, altezza: A4_PIEDI.altezza },
        { scala }
      )
    );
    for (const d of disegni) expect(d.scala).toBeCloseTo(scala, 9);
    // e nessuna cornice sfonda l'area: la più lunga ci sta per costruzione
    for (const d of disegni)
      expect(d.cornice.altezza).toBeLessThanOrEqual(A4_PIEDI.altezza + 1e-6);
  });
});

describe('il pezzo indivisibile tagliato dal capoverso', () => {
  /** una vetrata da sette metri: qualunque capoverso le passa in mezzo */
  const VETRATA = P('VETRATA SUD', 0, 0, 1150, 7200);
  const CODA = P('SOPRALUCE', 0, 7200, 1150, 900);
  const ROTOLO2: LastraNesting = { piazzamenti: [VETRATA, CODA] };
  const MISURE2 = { larghezza: 1250, altezza: 8100 };

  it('il pezzo c’è in tutt’e due le colonne e l’area torna', () => {
    const c = spezzaInColonne(ROTOLO2, MISURE2, 2);
    const parti = c.flatMap((x) => x.lastra.piazzamenti).filter((pc) => pc.nome === 'VETRATA SUD');
    expect(parti.length).toBe(2);
    expect(parti.reduce((s, pc) => s + pc.larghezza * pc.altezza, 0)).toBeCloseTo(1150 * 7200, 3);
  });

  it('il capoverso è segnato come giunzione, da una parte e dall’altra', () => {
    const c = spezzaInColonne(ROTOLO2, MISURE2, 2);
    const taglio = c[0].a;
    expect(c[0].giunzioni.length).toBe(1);
    expect(c[1].giunzioni.length).toBe(1);
    // nella prima colonna il resto del pezzo sta DOPO, nella seconda PRIMA
    expect(c[0].giunzioni[0].verso).toBe('dopo');
    expect(c[1].giunzioni[0].verso).toBe('prima');
    // e la riga sta sul capoverso, larga quanto il pezzo
    expect(c[0].giunzioni[0].y1).toBeCloseTo(taglio - c[0].da, 6);
    expect(c[1].giunzioni[0].y1).toBeCloseTo(0, 6);
    for (const col of c) {
      const g = col.giunzioni[0];
      expect(Math.abs(g.x2 - g.x1)).toBeCloseTo(1150, 6);
      expect(g.y1).toBeCloseTo(g.y2, 6);
      expect(g.alto).toBeGreaterThan(0);
    }
  });

  it('il nome resta uno solo, nella parte più grande', () => {
    const c = spezzaInColonne(ROTOLO2, MISURE2, 2);
    const dove = c.filter((x) => x.etichettate.has(VETRATA.chiave));
    expect(dove.length).toBe(1);
    // la parte col nome è la più alta delle due
    const parti = c.map(
      (x) => x.lastra.piazzamenti.find((pc) => pc.nome === 'VETRATA SUD')?.altezza ?? 0
    );
    const conNome = c.indexOf(dove[0]);
    expect(parti[conNome]).toBe(Math.max(...parti));
  });

  it('dove il rotolo finisce davvero non c’è nessuna giunzione', () => {
    const c = spezzaInColonne(ROTOLO, LUNGO, 3);
    expect(c[0].giunzioni.some((g) => g.verso === 'prima')).toBe(false);
    expect(c[2].giunzioni.some((g) => g.verso === 'dopo')).toBe(false);
  });

  it('un pezzo che sta tutto dentro non ha giunzioni', () => {
    const c = spezzaInColonne({ piazzamenti: [CODA] }, { larghezza: 1250, altezza: 9000 }, 3);
    expect(c.flatMap((x) => x.giunzioni)).toHaveLength(0);
  });

  it('su una sagoma storta la giunzione è il lato vero, non tutta la larghezza', () => {
    // un trapezio che si stringe: sul capoverso il pezzo è più stretto del
    // suo ingombro, e segnare tutta la larghezza direbbe una bugia
    const tz = S('FALDA', 0, 0, 1000, 4000, [
      [0, 0],
      [1000, 0],
      [700, 4000],
      [300, 4000]
    ]);
    const c = spezzaInColonne({ piazzamenti: [tz] }, { larghezza: 1000, altezza: 4000 }, 2, 0);
    const g = c[0].giunzioni[0];
    expect(g).toBeDefined();
    // a metà altezza il trapezio si è già stretto da 1000 a 700: segnare la
    // giunzione larga quanto l'ingombro direbbe una bugia
    expect(Math.abs(g.x2 - g.x1)).toBeCloseTo(700, 6);
  });
});
