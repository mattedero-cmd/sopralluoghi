import { describe, expect, it } from 'vitest';
import { siglaDaNome, siglaPezzo } from '../sigle';

describe('sigle dei pezzi delle porte', () => {
  it('dal nome dei pezzi salvati prima delle sigle', () => {
    expect(siglaDaNome('Montante DX · Coprifilo esterno')).toBe('E-MDX-CF');
    expect(siglaDaNome('Traverso · Coprifilo interno')).toBe('I-T-CF');
    expect(siglaDaNome('Montante SX · Stipite · Striscia 2')).toBe('MSX-S2');
    expect(siglaDaNome('Anta · Faccia esterna')).toBe('E-A');
    expect(siglaDaNome('Anta sinistra · Faccia interna')).toBe('I-ASX');
  });
  it('con la porta davanti', () => {
    expect(siglaPezzo({ lettera: 'B' }, { nome: 'x', sigla: 'I-T-CF' })).toBe('PB-I-T-CF');
  });
});
