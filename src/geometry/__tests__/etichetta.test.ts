import { describe, expect, it } from 'vitest';
import { coloreContrasto } from '../primitive';

describe('coloreContrasto', () => {
  it('usa testo nero su sfondi chiari e bianco su sfondi scuri', () => {
    expect(coloreContrasto('#ffc400')).toBe('#111111'); // giallo → nero
    expect(coloreContrasto('#ffffff')).toBe('#111111'); // bianco → nero
    expect(coloreContrasto('#000000')).toBe('#ffffff'); // nero → bianco
    expect(coloreContrasto('#2f81f7')).toBe('#ffffff'); // blu → bianco
  });

  it('accetta hex a 3 cifre e valori sporchi', () => {
    expect(coloreContrasto('#fff')).toBe('#111111');
    expect(coloreContrasto(' #000 ')).toBe('#ffffff');
    expect(coloreContrasto('non-colore')).toBe('#ffffff'); // fallback leggibile
  });
});
