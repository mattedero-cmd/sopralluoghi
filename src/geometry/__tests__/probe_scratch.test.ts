import { describe, it } from 'vitest';
import { semplificaPianta, eliminaLatoRichiudi } from '../parametrico';
import type { Punto, SegmentoQuota } from '../../db/types';

describe('S1 deep', () => {
  it('micro edge carrying manual quote: trace eliminaLatoRichiudi', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 401, y: 1 },
      { x: 400, y: 300 },
      { x: 0, y: 300 }
    ];
    const seg: SegmentoQuota[] = [
      { da: 0, a: 1, valore: 400, manuale: true },
      { da: 1, a: 2, valore: 999, manuale: true }, // micro-edge manual driving dim
      { da: 2, a: 3, valore: 300, manuale: true },
      { da: 3, a: 4, valore: 400, manuale: true },
      { da: 4, a: 0, valore: 300, manuale: true }
    ];
    // shortest edge is 1->2 (~1.4px). eliminaLatoRichiudi index 1:
    const r = eliminaLatoRichiudi(punti, seg, 1, undefined);
    console.log('after eliminaLatoRichiudi(1):', JSON.stringify(r?.segmenti));
    // The 999 quote (edge 1-2) is dropped; the collapse merges vertex 2 into 1.
  });

  it('micro edge is a DIAGONAL-quoted? no. But what about adjacent manual quote reassigned?', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 401, y: 1 },
      { x: 400, y: 300 },
      { x: 0, y: 300 }
    ];
    const seg: SegmentoQuota[] = [
      { da: 0, a: 1, valore: 400, manuale: true },
      { da: 1, a: 2, valore: 999, manuale: true },
      { da: 2, a: 3, valore: 300, manuale: true },
      { da: 3, a: 4, valore: 400, manuale: true },
      { da: 4, a: 0, valore: 300, manuale: true }
    ];
    const r = semplificaPianta(punti, seg, undefined, 10);
    console.log('final segmenti:', JSON.stringify(r?.segmenti));
    console.log('final rimossi:', r?.rimossi);
  });
});
