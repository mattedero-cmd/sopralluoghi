import { describe, expect, it } from 'vitest';
import { riquadroCensura } from '../volti';

/**
 * Il riquadro restituito dal rilevatore è stretto sul viso: viene allargato
 * (capelli, mento, orecchie) e riportato dentro i bordi dell'immagine.
 * Qui si verifica solo questa geometria, senza caricare il modello.
 */
describe('riquadroCensura — margine di sicurezza attorno al volto', () => {
  const IMG = { w: 1000, h: 800 };

  it('allarga il riquadro attorno al volto', () => {
    const r = riquadroCensura({ x: 400, y: 300, larghezza: 100, altezza: 100 }, IMG.w, IMG.h);
    // più largo e più alto dell'originale, e spostato in alto (capelli)
    expect(r.larghezza).toBeGreaterThan(100);
    expect(r.altezza).toBeGreaterThan(100);
    expect(r.y).toBeLessThan(300);
    // resta centrato orizzontalmente sul volto
    expect(r.x + r.larghezza / 2).toBeCloseTo(450, 0);
  });

  it('copre più sopra che sotto (capelli)', () => {
    const r = riquadroCensura({ x: 400, y: 300, larghezza: 100, altezza: 100 }, IMG.w, IMG.h);
    const sopra = 300 - r.y;
    const sotto = r.y + r.altezza - 400;
    expect(sopra).toBeGreaterThan(sotto);
  });

  it('non esce dai bordi dell’immagine', () => {
    const angolo = riquadroCensura({ x: 0, y: 0, larghezza: 80, altezza: 80 }, IMG.w, IMG.h);
    expect(angolo.x).toBe(0);
    expect(angolo.y).toBe(0);
    const fondo = riquadroCensura(
      { x: IMG.w - 60, y: IMG.h - 60, larghezza: 60, altezza: 60 },
      IMG.w,
      IMG.h
    );
    expect(fondo.x + fondo.larghezza).toBeLessThanOrEqual(IMG.w);
    expect(fondo.y + fondo.altezza).toBeLessThanOrEqual(IMG.h);
  });

  it('un volto interamente fuori immagine dà un riquadro nullo', () => {
    const r = riquadroCensura({ x: 2000, y: 2000, larghezza: 50, altezza: 50 }, IMG.w, IMG.h);
    expect(r.larghezza).toBe(0);
    expect(r.altezza).toBe(0);
  });

  it('restituisce interi (pixel)', () => {
    const r = riquadroCensura({ x: 123.7, y: 88.2, larghezza: 55.5, altezza: 61.3 }, IMG.w, IMG.h);
    for (const v of [r.x, r.y, r.larghezza, r.altezza]) expect(Number.isInteger(v)).toBe(true);
  });
});
