import { describe, expect, it } from 'vitest';
import { primitiveAbbondanze, primitiveAnnotazione } from '../primitive';
import { offsetPoligono } from '../punti';
import { COLORE_PANNELLO } from '../../db/types';
import type { Annotazione } from '../../db/types';

/**
 * LE ABBONDANZE A VISTA SULLA FOTO.
 *
 * L'abbondanza è scritta nei lati e non si vede da nessuna parte: acceso
 * l'interruttore deve comparire il contorno del pezzo che esce dalla macchina.
 * Le foto di prova sono frontali e in scala 1 cm = 1 px, così i numeri si
 * leggono a mente.
 */

const stile = { colore: '#ffd166', spessore: 4, dimensioneTesto: 18 };
const base = { id: 'a1', fotoId: 'f1', zIndex: 0, stile, unita: 'cm', stato: 'reale' };

const poligono = (
  punti: Array<[number, number]>,
  segmenti: Array<{ da: number; a: number; valore: number; abbInizio?: number; abbFine?: number }>
): Annotazione =>
  ({
    ...base,
    tipo: 'quotaPoligono',
    punti: punti.map(([x, y]) => ({ x, y })),
    segmenti
  }) as unknown as Annotazione;

const linee = (p: ReturnType<typeof primitiveAbbondanze>) =>
  p.filter((x): x is Extract<typeof x, { kind: 'polilinea' }> => x.kind === 'polilinea');

describe('primitiveAbbondanze', () => {
  it('un rettangolo abbondato mostra il contorno del pezzo, lato per lato', () => {
    // 300 × 200 cm, 10 di abbondanza a sinistra e a destra, 20 sopra e sotto
    const rett = poligono(
      [
        [0, 0],
        [300, 0],
        [300, 200],
        [0, 200]
      ],
      [
        { da: 0, a: 1, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 1, a: 2, valore: 200, abbInizio: 20, abbFine: 20 },
        { da: 2, a: 3, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 3, a: 0, valore: 200, abbInizio: 20, abbFine: 20 }
      ]
    );
    const [contorno] = linee(primitiveAbbondanze(rett));
    expect(contorno).toBeTruthy();
    expect(contorno.colore).toBe(COLORE_PANNELLO);
    expect(contorno.tratteggio).toBeTruthy();
    // chiuso: cinque punti, l'ultimo uguale al primo
    expect(contorno.punti).toHaveLength(10);
    const xs = contorno.punti.filter((_, i) => i % 2 === 0);
    const ys = contorno.punti.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeCloseTo(-10, 6);
    expect(Math.max(...xs)).toBeCloseTo(310, 6);
    expect(Math.min(...ys)).toBeCloseTo(-20, 6);
    expect(Math.max(...ys)).toBeCloseTo(220, 6);
  });

  it('su una falda l’abbondanza segue l’obliquo, non il riquadro', () => {
    // base 300, altezza sx 200, dx 400, 10 di abbondanza sui tre lati quotati
    const falda = poligono(
      [
        [0, 200],
        [300, 0],
        [300, 400],
        [0, 400]
      ],
      [
        { da: 3, a: 2, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 0, a: 3, valore: 200, abbInizio: 10, abbFine: 10 },
        { da: 1, a: 2, valore: 400, abbInizio: 10, abbFine: 10 }
      ]
    );
    const [contorno] = linee(primitiveAbbondanze(falda));
    expect(contorno).toBeTruthy();
    const p: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 8; i += 2) p.push({ x: contorno.punti[i], y: contorno.punti[i + 1] });
    // il lato obliquo resta parallelo a sé stesso: la pendenza non cambia
    const pend = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      (b.y - a.y) / (b.x - a.x);
    expect(pend(p[0], p[1])).toBeCloseTo(-200 / 300, 6);
    // e il pezzo cresce di 10 per lato, non di più
    const xs = p.map((q) => q.x);
    expect(Math.min(...xs)).toBeCloseTo(-10, 6);
    expect(Math.max(...xs)).toBeCloseTo(310, 6);
    expect(Math.max(...p.map((q) => q.y))).toBeCloseTo(410, 6);
  });

  it('un triangolo non ha sagoma nota: si sposta ogni lato in pixel', () => {
    const tri = poligono(
      [
        [0, 0],
        [400, 0],
        [0, 300]
      ],
      [
        { da: 0, a: 1, valore: 400, abbInizio: 20, abbFine: 20 },
        { da: 1, a: 2, valore: 500 },
        { da: 2, a: 0, valore: 300, abbInizio: 20, abbFine: 20 }
      ]
    );
    const [contorno] = linee(primitiveAbbondanze(tri));
    expect(contorno).toBeTruthy();
    const p: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 6; i += 2) p.push({ x: contorno.punti[i], y: contorno.punti[i + 1] });
    // ogni lato si è spostato in fuori di 20 px, cioè dei suoi 20 cm: gli
    // spigoli vanno più in là, ed è giusto — è lì che si incontrano i lati
    const distanzaDaRetta = (
      q: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number }
    ) =>
      Math.abs((b.y - a.y) * q.x - (b.x - a.x) * q.y + b.x * a.y - b.y * a.x) /
      Math.hypot(b.x - a.x, b.y - a.y);
    const v = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 300 }
    ];
    for (let i = 0; i < 3; i++) {
      // il vertice i del contorno sta sul lato i spostato, e su quello prima
      expect(distanzaDaRetta(p[i], v[i], v[(i + 1) % 3])).toBeCloseTo(20, 6);
      expect(distanzaDaRetta(p[i], v[(i + 2) % 3], v[i])).toBeCloseTo(20, 6);
    }
  });

  it('il cerchio col margine diventa un cerchio più grande', () => {
    const cerchio = {
      ...base,
      tipo: 'quotaRaggio',
      centro: { x: 100, y: 100 },
      bordo: { x: 200, y: 100 },
      modo: 'diametro',
      valore: 200,
      margine: 10
    } as unknown as Annotazione;
    const prim = primitiveAbbondanze(cerchio);
    expect(prim).toHaveLength(1);
    const c = prim[0] as Extract<(typeof prim)[0], { kind: 'cerchio' }>;
    expect(c.kind).toBe('cerchio');
    // raggio reale 100 cm = 100 px, più 10 di margine
    expect(c.raggio).toBeCloseTo(110, 6);
  });

  it('senza abbondanze non si disegna niente', () => {
    const rett = poligono(
      [
        [0, 0],
        [300, 0],
        [300, 200],
        [0, 200]
      ],
      [
        { da: 0, a: 1, valore: 300 },
        { da: 1, a: 2, valore: 200 },
        { da: 2, a: 3, valore: 300 },
        { da: 3, a: 0, valore: 200 }
      ]
    );
    expect(primitiveAbbondanze(rett)).toEqual([]);
  });

  it('l’interruttore comanda: spento non compare nulla in più', () => {
    const rett = poligono(
      [
        [0, 0],
        [300, 0],
        [300, 200],
        [0, 200]
      ],
      [
        { da: 0, a: 1, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 1, a: 2, valore: 200, abbInizio: 10, abbFine: 10 },
        { da: 2, a: 3, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 3, a: 0, valore: 200, abbInizio: 10, abbFine: 10 }
      ]
    );
    const spento = primitiveAnnotazione(rett);
    const acceso = primitiveAnnotazione(rett, undefined, undefined, undefined, {
      abbondanze: true
    });
    expect(acceso.length).toBe(spento.length + 1);
    const ultima = acceso[acceso.length - 1];
    expect(ultima.kind).toBe('polilinea');
    expect(ultima.kind === 'polilinea' && ultima.colore).toBe(COLORE_PANNELLO);
  });
});

describe('offsetPoligono', () => {
  it('non conta come è stato disegnato il poligono: orario o antiorario è uguale', () => {
    const orario = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 }
    ];
    const antiorario = [...orario].reverse();
    const a = offsetPoligono(orario, [5, 5, 5, 5]);
    const b = offsetPoligono(antiorario, [5, 5, 5, 5]);
    const box = (p: typeof a) => [
      Math.min(...p.map((q) => q.x)),
      Math.min(...p.map((q) => q.y)),
      Math.max(...p.map((q) => q.x)),
      Math.max(...p.map((q) => q.y))
    ];
    expect(box(a)).toEqual([-5, -5, 105, 55]);
    expect(box(b)).toEqual([-5, -5, 105, 55]);
  });
});
