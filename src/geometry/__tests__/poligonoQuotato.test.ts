import { describe, expect, it } from 'vitest';
import { poligonoDaLati, sagomaPoligonoQuotato } from '../poligonoQuotato';
import { areaForma, poligonoSagoma } from '../sagome';
import type { QuotaPoligono } from '../../db/types';

/**
 * LA PARETE SOTTO FALDA CHE NON È UN QUADRILATERO.
 *
 * Camera 307 dell'hotel: montante sinistro 345, un pezzo di soffitto piano
 * 70, la falda che scende, montante destro 224, pavimento 400. Cinque lati,
 * disegnati con la polilinea e quotati dove si poteva misurare — la falda no,
 * quella sta in alto e si ricava.
 *
 * Nel piano di taglio ne arrivava il RETTANGOLO D'INGOMBRO, 400×345: il
 * triangolo sotto la falda — un metro quadro e mezzo su dodici — veniva
 * tagliato e buttato, e i teli uscivano squadrati dove vanno in diagonale.
 */

/** la foto calibrata uno a uno: i punti del disegno sono già centimetri */
const FOTO = { scala: { px: 1, reale: 1, unita: 'cm' as const }, piano: null };

/** il pentagono della camera, coi lati nell'ordine in cui è stato disegnato */
function parete(
  segmenti: Array<{ da: number; a: number; valore: number }>,
  punti: Array<[number, number]> = [
    [0, 0],
    [70, 0],
    [400, 121],
    [400, 345],
    [0, 345]
  ]
): QuotaPoligono {
  return {
    id: 'g1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 0,
    punti: punti.map(([x, y]) => ({ x, y })),
    segmenti,
    unita: 'cm',
    stato: 'reale',
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
  } as unknown as QuotaPoligono;
}

/** i quattro lati misurati davvero: la falda resta senza quota */
const QUOTE = [
  { da: 0, a: 1, valore: 70 },
  { da: 2, a: 3, valore: 224 },
  { da: 3, a: 4, valore: 400 },
  { da: 4, a: 0, valore: 345 }
];

/** la lunghezza di un lato della sagoma ricostruita */
const lato = (v: Array<[number, number]>, i: number) => {
  const a = v[i];
  const b = v[(i + 1) % v.length];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};

describe('il pentagono della camera 307', () => {
  const s = sagomaPoligonoQuotato(parete(QUOTE), FOTO, false);

  it('arriva con la sua forma vera, cinque vertici', () => {
    expect(s).not.toBeNull();
    expect(s!.forma).toBe('quad');
    expect(s!.vertici).toHaveLength(5);
  });

  it('il riquadro è quello giusto: 400 × 345', () => {
    expect(s!.larghezza).toBeCloseTo(400, 1);
    expect(s!.altezza).toBeCloseTo(345, 1);
  });

  it('i lati misurati sono esattamente quelli misurati', () => {
    const v = s!.vertici as Array<[number, number]>;
    const lunghezze = v.map((_, i) => lato(v, i)).sort((a, b) => a - b);
    for (const atteso of [70, 224, 345, 400]) {
      const vicino = lunghezze.find((l) => Math.abs(l - atteso) < 0.5);
      expect(vicino, `manca il lato da ${atteso}`).toBeDefined();
    }
  });

  it('e la falda, che nessuno ha misurato, esce dal disegno', () => {
    const v = s!.vertici as Array<[number, number]>;
    const lunghezze = v.map((_, i) => lato(v, i));
    // da (70,0) a (400,121): il montante destro è 224, la parete alta 345
    const falda = Math.hypot(330, 121);
    expect(lunghezze.some((l) => Math.abs(l - falda) < 1)).toBe(true);
  });

  it('il pezzo è più piccolo del suo ingombro: è tutto il senso della cosa', () => {
    const area = areaForma(s!);
    const ingombro = 400 * 345;
    // il triangolo sotto la falda: 330 × 121 / 2
    expect(area).toBeCloseTo(ingombro - (330 * 121) / 2, 0);
    expect(area / ingombro).toBeLessThan(0.87);
  });

  it('la sagoma si disegna: il motore sa farne un poligono', () => {
    const poly = poligonoSagoma(s!);
    expect(poly).not.toBeNull();
    expect(poly).toHaveLength(5);
  });
});


/**
 * DA QUALUNQUE SPIGOLO SI COMINCI A DISEGNARE, LA PARETE È QUELLA.
 *
 * Il costruttore appoggia il primo lato sull'asse: la forma che esce è giusta,
 * il verso era quello che càpita. La stessa camera, disegnata partendo dallo
 * spigolo accanto, usciva girata di un quarto; partendo dalla falda usciva
 * INCLINATA, e il riquadro passava da 400×345 a 494×348 — un pezzo fuori
 * misura dal supporto, con le giunzioni dei teli in diagonale sul muro e i
 * trapezi che non si riconoscevano più come trapezi.
 */
describe('il verso della parete non dipende da come è stata disegnata', () => {
  /** la parete disegnata partendo dal vertice `da`, nel verso `verso` */
  const disegnata = (da: number, verso: 1 | -1) => {
    const idx: number[] = [];
    for (let k = 0; k < 5; k++) idx.push((((da + verso * k) % 5) + 5) % 5);
    const quote: Record<string, number> = { '0-1': 70, '2-3': 224, '3-4': 400, '4-0': 345 };
    const punti = idx.map((i) => BASE[i]);
    const segmenti: Array<{ da: number; a: number; valore: number }> = [];
    for (let k = 0; k < 5; k++) {
      const v =
        quote[`${idx[k]}-${idx[(k + 1) % 5]}`] ?? quote[`${idx[(k + 1) % 5]}-${idx[k]}`];
      if (v !== undefined) segmenti.push({ da: k, a: (k + 1) % 5, valore: v });
    }
    return parete(segmenti, punti);
  };

  const BASE: Array<[number, number]> = [
    [0, 0],
    [70, 0],
    [400, 121],
    [400, 345],
    [0, 345]
  ];

  /** i vertici messi in fila, per confrontare due figure senza badare all'ordine */
  const inFila = (v: Array<[number, number]>) =>
    v
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .sort()
      .join(' · ');

  const ordini: Array<[number, 1 | -1]> = [];
  for (let da = 0; da < 5; da++) for (const verso of [1, -1] as const) ordini.push([da, verso]);

  it('tutti i dieci modi di disegnarla danno lo stesso riquadro: 400 × 345', () => {
    for (const [da, verso] of ordini) {
      const s = sagomaPoligonoQuotato(disegnata(da, verso), FOTO, false);
      expect(s, `dal vertice ${da} verso ${verso}`).not.toBeNull();
      expect(s!.larghezza, `larghezza dal vertice ${da} verso ${verso}`).toBeCloseTo(400, 0);
      expect(s!.altezza, `altezza dal vertice ${da} verso ${verso}`).toBeCloseTo(345, 0);
    }
  });

  it('e la stessa figura, vertice per vertice', () => {
    const atteso = inFila(
      sagomaPoligonoQuotato(disegnata(0, 1), FOTO, false)!.vertici as Array<[number, number]>
    );
    for (const [da, verso] of ordini) {
      const v = sagomaPoligonoQuotato(disegnata(da, verso), FOTO, false)!.vertici as Array<
        [number, number]
      >;
      expect(inFila(v), `dal vertice ${da} verso ${verso}`).toBe(atteso);
    }
  });

  it('i montanti restano in piedi: la parete non esce inclinata', () => {
    for (const [da, verso] of ordini) {
      const v = sagomaPoligonoQuotato(disegnata(da, verso), FOTO, false)!.vertici as Array<
        [number, number]
      >;
      // il pavimento è lungo 400 e deve essere ORIZZONTALE: due vertici alla
      // stessa altezza, distanti 400
      const basso = Math.max(...v.map((p) => p[1]));
      const piedi = v.filter((p) => Math.abs(p[1] - basso) < 0.5);
      expect(piedi.length, `dal vertice ${da} verso ${verso}`).toBe(2);
      expect(Math.abs(piedi[0][0] - piedi[1][0])).toBeCloseTo(400, 0);
    }
  });

  it('e i teli tornano a essere trapezi, non sagome qualunque', async () => {
    const { teliDelPezzo } = await import('../pannelli');
    for (const [da, verso] of ordini) {
      const s = sagomaPoligonoQuotato(disegnata(da, verso), FOTO, false)!;
      const pezzo = {
        forma: s.forma,
        larghezza: s.larghezza * 10,
        altezza: s.altezza * 10,
        vertici: (s.vertici ?? []).map(([x, y]): [number, number] => [x * 10, y * 10])
      };
      const teli = teliDelPezzo(pezzo, {
        asse: 'verticale',
        sormonto: 0,
        verso: 'centro',
        giunti: [1350, 2700]
      });
      expect(teli, `dal vertice ${da} verso ${verso}`).toHaveLength(3);
      // sotto la falda diritta due teli su tre sono trapezi rettangoli
      const trapezi = teli.filter((t) => t.forma === 'trapezioR').length;
      expect(trapezi, `dal vertice ${da} verso ${verso}`).toBe(2);
    }
  });
});

describe('quando le misure non bastano o non chiudono', () => {
  it('senza nessuna quota non si inventa niente', () => {
    expect(sagomaPoligonoQuotato(parete([]), FOTO, false)).toBeNull();
  });

  it('con una quota sola la figura si scala comunque sul disegno', () => {
    // un solo lato misurato dà la scala: il resto è proporzione del disegno
    const s = sagomaPoligonoQuotato(parete([{ da: 3, a: 4, valore: 800 }]), FOTO, false);
    expect(s).not.toBeNull();
    expect(s!.larghezza).toBeCloseTo(800, 0);
  });

  it('tre e quattro lati restano alle regole loro', () => {
    const quad = parete(QUOTE.slice(0, 3), [
      [0, 0],
      [100, 0],
      [100, 80],
      [0, 80]
    ]);
    expect(sagomaPoligonoQuotato(quad, FOTO, false)).toBeNull();
  });

  it('una figura rientrante non si ricostruisce', () => {
    const concavo = parete(QUOTE, [
      [0, 0],
      [70, 0],
      [200, 200],
      [400, 345],
      [0, 345]
    ]);
    const s = sagomaPoligonoQuotato(concavo, FOTO, false);
    // o esce convessa (il disegno rientrante si raddrizza sulle misure) o
    // non esce: quello che non deve succedere è una sagoma rientrante, che
    // il motore di piazzamento non sa trattare
    if (s?.vertici) expect(poligonoSagoma(s)).not.toBeNull();
  });
});

describe('il costruttore, da solo', () => {
  it('un quadrato dai suoi lati e dalla diagonale', () => {
    const v = poligonoDaLati([10, 10, 10, 10], [Math.SQRT2 * 10]);
    expect(v).not.toBeNull();
    expect(Math.max(...v!.map((p) => p[0]))).toBeCloseTo(10, 6);
    expect(Math.max(...v!.map((p) => p[1]))).toBeCloseTo(10, 6);
  });

  it('lati che non chiudono non danno niente', () => {
    expect(poligonoDaLati([10, 10, 100, 10], [14])).toBeNull();
    expect(poligonoDaLati([10, 10, 10], [])).not.toBeNull();
    expect(poligonoDaLati([10, 10, 10, 10], [])).toBeNull(); // manca la diagonale
  });
});

describe('dal sopralluogo al piano di taglio', () => {
  it('il pentagono arriva come pezzo con la sua sagoma, non come rettangolo', async () => {
    const { pezziDaAnnotazioni } = await import('../pezziDaSopralluogo');
    const pezzi = pezziDaAnnotazioni([parete(QUOTE) as never], FOTO);
    expect(pezzi).toHaveLength(1);
    const p = pezzi[0];
    // misure in MILLIMETRI nel piano di taglio
    expect(p.larghezza).toBeCloseTo(4000, 0);
    expect(p.altezza).toBeCloseTo(3450, 0);
    expect(p.sagoma?.forma).toBe('quad');
    expect(p.sagoma?.vertici).toHaveLength(5);
  });

  it('e si divide in teli seguendo la falda, non squadrati', async () => {
    const { pezziDaAnnotazioni } = await import('../pezziDaSopralluogo');
    const { teliDelPezzo } = await import('../pannelli');
    const p = pezziDaAnnotazioni([parete(QUOTE) as never], FOTO)[0];
    const pezzo = {
      forma: p.sagoma!.forma,
      larghezza: p.sagoma!.d1,
      altezza: p.sagoma!.d2,
      vertici: p.sagoma!.vertici
    };
    const teli = teliDelPezzo(pezzo, {
      asse: 'verticale',
      sormonto: 0,
      verso: 'centro',
      giunti: [1350, 2700]
    });
    expect(teli).toHaveLength(3);
    // i tre teli rifanno il pezzo intero, falda compresa
    const somma = teli.reduce((s, t) => s + areaForma(t), 0);
    expect(somma).toBeCloseTo(areaForma(pezzo), 0);
    // e almeno uno non è un rettangolo: la falda passa di lì
    expect(teli.some((t) => t.forma !== 'rett')).toBe(true);
  });
});
