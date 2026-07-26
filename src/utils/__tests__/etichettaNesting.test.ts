import { describe, expect, it } from 'vitest';
import { pianoEtichetta } from '../etichettaNesting';

// corpi tipici (in mm di disegno) su una lastra da 2500 mm larga ~390 px:
// 1 px di schermo ≈ 6,4 mm
const CORPI = { massimo: 77, minimo: 32, dueRighe: 51 };

/** il testo scritto sta davvero dentro il pezzo? */
function dentro(l: number, a: number, p: ReturnType<typeof pianoEtichetta>) {
  if (!p) return true;
  const lungo = p.ruotata ? a : l;
  const alto = p.ruotata ? l : a;
  const righe: Array<[string, number]> = [];
  if (p.nome) righe.push([p.nome, p.corpoNome]);
  if (p.misura) righe.push([p.misura, p.corpoMisura]);
  const piuLargo = Math.max(...righe.map(([t, c]) => c * 0.58 * t.length));
  const altezzaTesto = righe.reduce((s, [, c]) => s + c * 1.15, 0);
  return piuLargo <= lungo && altezzaTesto <= alto;
}

describe('pianoEtichetta', () => {
  it('su un pezzo grande scrive nome e misura su due righe', () => {
    const p = pianoEtichetta(600, 400, 'Anta', '600×400', CORPI);
    expect(p).toMatchObject({ nome: 'Anta', misura: '600×400', ampia: true, ruotata: false });
    expect(dentro(600, 400, p)).toBe(true);
  });

  it('non supera mai il corpo massimo, anche su pezzi enormi', () => {
    const p = pianoEtichetta(2000, 1200, 'Anta', '2000×1200', CORPI);
    expect(p?.corpoNome).toBe(CORPI.massimo);
  });

  it('quando le due righe rimpicciolirebbero troppo tiene solo il nome', () => {
    const p = pianoEtichetta(500, 60, 'Zoccolo', '500×60', CORPI);
    expect(p?.nome).toBe('Zoccolo');
    expect(p?.misura).toBeUndefined();
    expect(p?.ampia).toBe(false);
    expect(dentro(500, 60, p)).toBe(true);
  });

  it('rimpicciolisce il corpo pur di far stare il nome per intero', () => {
    const p = pianoEtichetta(600, 40, 'Montante', '600×40', CORPI);
    expect(p?.nome).toBe('Montante');
    expect(p?.corpoNome).toBeLessThan(CORPI.massimo);
    expect(dentro(600, 40, p)).toBe(true);
  });

  it('gira il testo sui pezzi alti e stretti', () => {
    const p = pianoEtichetta(40, 600, 'Montante', '40×600', CORPI);
    expect(p?.ruotata).toBe(true);
    expect(p?.nome).toBe('Montante');
    expect(dentro(40, 600, p)).toBe(true);
  });

  it('tronca il nome invece di lasciare il pezzo muto', () => {
    const p = pianoEtichetta(180, 60, 'Traversa superiore lunga', '180×60', CORPI);
    expect(p?.nome).toMatch(/…$/);
    expect(p?.nome?.length).toBeGreaterThan(2);
    expect(p?.misura).toBeUndefined();
    expect(dentro(180, 60, p)).toBe(true);
  });

  it('sotto il corpo minimo il pezzo resta muto: illeggibile è peggio di vuoto', () => {
    expect(pianoEtichetta(30, 30, 'Tassello', '30×30', CORPI)).toBeNull();
  });

  it('sul pezzo senza nome ripiega sulla misura', () => {
    const p = pianoEtichetta(300, 200, '', '300×200', CORPI);
    expect(p).toMatchObject({ misura: '300×200', ampia: false });
    expect(p?.nome).toBeUndefined();
    expect(dentro(300, 200, p)).toBe(true);
  });

  it('senza misure valide non impagina nulla', () => {
    expect(pianoEtichetta(600, 400, 'Anta', '600×400', { ...CORPI, minimo: 0 })).toBeNull();
    expect(pianoEtichetta(0, 400, 'Anta', '600×400', CORPI)).toBeNull();
    expect(pianoEtichetta(600, 0, 'Anta', '600×400', CORPI)).toBeNull();
  });

  it('il testo non deborda mai dal pezzo, in nessuna delle combinazioni', () => {
    const nomi = ['Anta', 'Zoccolo', 'Montante', 'Traversa superiore lunga', 'R', ''];
    for (const nome of nomi) {
      for (let l = 20; l <= 1200; l += 37) {
        for (let a = 20; a <= 1200; a += 53) {
          const p = pianoEtichetta(l, a, nome, `${l}×${a}`, CORPI);
          expect(dentro(l, a, p), `${nome} su ${l}×${a}`).toBe(true);
          if (p) expect(Math.min(p.corpoNome || Infinity, p.corpoMisura || Infinity))
            .toBeGreaterThanOrEqual(CORPI.minimo * 0.92);
        }
      }
    }
  });
});
