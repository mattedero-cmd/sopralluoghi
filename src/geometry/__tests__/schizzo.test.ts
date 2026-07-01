import { describe, expect, it } from 'vitest';
import { semplificaTracciato, raddrizzaStanza, squadra, ricostruisciOrtogonale } from '../schizzo';
import type { Punto } from '../../db/types';

function lunghezzeReali(punti: Punto[], pxPerReale: number): number[] {
  const n = punti.length;
  return punti.map((p, i) => {
    const q = punti[(i + 1) % n];
    return Math.hypot(q.x - p.x, q.y - p.y) / pxPerReale;
  });
}

describe('semplificaTracciato — Douglas-Peucker', () => {
  it('riduce molti punti su una retta ai soli estremi', () => {
    const punti: Punto[] = [];
    for (let x = 0; x <= 100; x += 5) punti.push({ x, y: 0 });
    const s = semplificaTracciato(punti, 1);
    expect(s).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]);
  });

  it('conserva un vertice oltre la tolleranza', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 50, y: 20 }, // sporge di 20 dalla retta 0→100
      { x: 100, y: 0 }
    ];
    expect(semplificaTracciato(punti, 5)).toHaveLength(3);
    expect(semplificaTracciato(punti, 30)).toHaveLength(2); // 20 < 30 → eliminato
  });
});

describe('raddrizzaStanza — schizzo a mano libera → poligono', () => {
  function quadratoSchizzato(): Punto[] {
    const p: Punto[] = [];
    for (let x = 0; x <= 100; x += 10) p.push({ x, y: 0 });
    for (let y = 10; y <= 100; y += 10) p.push({ x: 100, y });
    for (let x = 90; x >= 0; x -= 10) p.push({ x, y: 100 });
    for (let y = 90; y >= 10; y -= 10) p.push({ x: 0, y });
    p.push({ x: 0, y: 3 }); // il dito torna quasi all'origine
    return p;
  }

  it('un quadrato tracciato a mano libera diventa 4 vertici', () => {
    const v = raddrizzaStanza(quadratoSchizzato());
    expect(v).not.toBeNull();
    expect(v).toHaveLength(4);
    // i 4 angoli ~ (0,0),(100,0),(100,100),(0,100) in qualche ordine
    const ang = new Set(v!.map((p) => `${Math.round(p.x / 10) * 10},${Math.round(p.y / 10) * 10}`));
    expect(ang.has('0,0')).toBe(true);
    expect(ang.has('100,0')).toBe(true);
    expect(ang.has('100,100')).toBe(true);
    expect(ang.has('0,100')).toBe(true);
  });

  it('un tracciato troppo corto non produce un poligono', () => {
    expect(raddrizzaStanza([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });

  it('una stanza molto allungata (corridoio) conserva i 4 spigoli', () => {
    // corridoio 1000×40 (aspetto 25:1), tracciato partendo da un angolo
    const p: Punto[] = [];
    for (let x = 0; x <= 1000; x += 20) p.push({ x, y: 0 });
    for (let y = 5; y <= 40; y += 5) p.push({ x: 1000, y });
    for (let x = 980; x >= 0; x -= 20) p.push({ x, y: 40 });
    for (let y = 35; y >= 5; y -= 5) p.push({ x: 0, y });
    p.push({ x: 0, y: 2 }); // chiusura vicino all'origine
    const v = raddrizzaStanza(p);
    expect(v).not.toBeNull();
    expect(v).toHaveLength(4); // niente collasso a triangolo
    const xs = v!.map((q) => q.x);
    const ys = v!.map((q) => q.y);
    expect(Math.min(...xs)).toBeLessThan(20);
    expect(Math.max(...xs)).toBeGreaterThan(980);
    expect(Math.min(...ys)).toBeLessThan(20);
    expect(Math.max(...ys)).toBeGreaterThan(20);
  });
});

describe('squadra — ortogonalizzazione a squadro', () => {
  it('porta i lati di un quasi-rettangolo a orizzontale/verticale', () => {
    const quasi: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 3 },
      { x: 98, y: 60 },
      { x: 2, y: 58 }
    ];
    const q = squadra(quasi);
    // lato 0→1 orizzontale: stessa y
    expect(q[0].y).toBeCloseTo(q[1].y);
    // lato 1→2 verticale: stessa x
    expect(q[1].x).toBeCloseTo(q[2].x);
    // lato 2→3 orizzontale
    expect(q[2].y).toBeCloseTo(q[3].y);
    // lato 3→0 verticale
    expect(q[3].x).toBeCloseTo(q[0].x);
  });
});

describe('ricostruisciOrtogonale — ricostruzione parametrica dalle misure', () => {
  // stanza a L disegnata a mano (proporzioni imprecise), in senso orario
  const grezzo: Punto[] = [
    { x: 100, y: 100 }, // v0
    { x: 600, y: 110 }, // v1 top → destra
    { x: 605, y: 180 }, // v2 giù
    { x: 680, y: 175 }, // v3 rientro → destra
    { x: 675, y: 500 }, // v4 giù
    { x: 90, y: 510 } // v5 basso → sinistra (poi risale a v0)
  ];

  it('deriva i lati ignoti dalla chiusura (L-shape)', () => {
    // note: top 503, destra-alta 20, basso 553, sinistra 235; i due lati del
    // rientro (indici 2 e 3) sono ignoti e vanno derivati
    const reali = [503, 20, null, null, 553, 235];
    const r = ricostruisciOrtogonale(grezzo, reali, 2000, 1500);
    expect(r).not.toBeNull();
    const lung = lunghezzeReali(r!.punti, r!.pxPerReale);
    expect(lung[0]).toBeCloseTo(503, 1);
    expect(lung[1]).toBeCloseTo(20, 1);
    expect(lung[2]).toBeCloseTo(50, 1); // rientro orizzontale: 553 − 503
    expect(lung[3]).toBeCloseTo(215, 1); // rientro verticale: 235 − 20
    expect(lung[4]).toBeCloseTo(553, 1);
    expect(lung[5]).toBeCloseTo(235, 1);
  });

  it('il poligono ricostruito è chiuso (i lati tornano al punto di partenza)', () => {
    const reali = [503, 20, null, null, 553, 235];
    const r = ricostruisciOrtogonale(grezzo, reali, 2000, 1500)!;
    // somma degli spostamenti reali H e V ≈ 0 (chiusura)
    const lung = lunghezzeReali(r.punti, r.pxPerReale);
    // H: +503 +50 −553 = 0 ; V: +20 +215 −235 = 0
    expect(lung[0] + lung[2] - lung[4]).toBeCloseTo(0, 1);
    expect(lung[1] + lung[3] - lung[5]).toBeCloseTo(0, 1);
  });

  it('rifiuta la ricostruzione se un intero asse è privo di misure (poligono piatto)', () => {
    const rett: Punto[] = [
      { x: 0, y: 0 },
      { x: 400, y: 5 },
      { x: 405, y: 300 },
      { x: 5, y: 295 }
    ];
    // entrambi i lati orizzontali senza misura → larghezza indeterminata
    expect(ricostruisciOrtogonale(rett, [null, 300, null, 300], 2000, 1500)).toBeNull();
  });

  it('un rettangolo con tutti i lati noti mantiene le misure', () => {
    const rett: Punto[] = [
      { x: 0, y: 0 },
      { x: 400, y: 5 },
      { x: 405, y: 300 },
      { x: 5, y: 295 }
    ];
    const r = ricostruisciOrtogonale(rett, [500, 300, 500, 300], 2000, 1500)!;
    const lung = lunghezzeReali(r.punti, r.pxPerReale);
    expect(lung[0]).toBeCloseTo(500, 1);
    expect(lung[1]).toBeCloseTo(300, 1);
    expect(lung[2]).toBeCloseTo(500, 1);
    expect(lung[3]).toBeCloseTo(300, 1);
  });
});
