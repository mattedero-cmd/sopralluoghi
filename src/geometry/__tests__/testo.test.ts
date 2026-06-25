import { describe, expect, it } from 'vitest';
import type { TestoFoto } from '../../db/types';
import { primitiveTesto } from '../primitive';

const base: TestoFoto = {
  id: 't1',
  fotoId: 'f1',
  tipo: 'testo',
  posizione: { x: 100, y: 100 },
  testo: 'Nota',
  zIndex: 0,
  stile: { colore: '#ffffff', spessore: 3, dimensioneTesto: 24 }
};

describe('primitive del testo', () => {
  it('testo semplice → solo il riquadro di testo, nessuna freccia', () => {
    const prim = primitiveTesto(base);
    expect(prim.filter((p) => p.kind === 'testo')).toHaveLength(1);
    expect(prim.some((p) => p.kind === 'linea' || p.kind === 'poligono')).toBe(false);
  });

  it('nota con ancora → linea + freccia verso il punto segnalato', () => {
    const prim = primitiveTesto({ ...base, ancora: { x: 300, y: 250 } });
    const linea = prim.find((p) => p.kind === 'linea');
    const freccia = prim.find((p) => p.kind === 'poligono');
    expect(linea).toBeTruthy();
    expect(freccia).toBeTruthy();
    // la linea va dal riquadro (100,100) al punto segnalato (300,250)
    if (linea && linea.kind === 'linea') {
      expect(linea.punti.slice(0, 2)).toEqual([100, 100]);
      expect(linea.punti.slice(2, 4)).toEqual([300, 250]);
    }
  });
});
