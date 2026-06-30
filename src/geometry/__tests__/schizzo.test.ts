import { describe, expect, it } from 'vitest';
import { semplificaTracciato, raddrizzaStanza, squadra } from '../schizzo';
import type { Punto } from '../../db/types';

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
