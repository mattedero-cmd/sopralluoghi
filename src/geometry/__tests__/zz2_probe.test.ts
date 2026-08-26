import { describe, it } from 'vitest';
import { ingombroTaglio, pannelliTaglio } from '../pezziDaSopralluogo';
import { formaQuadrilatera } from '../formaQuadrilatera';
import type { QuotaPoligono } from '../../db/types';

const foto = { larghezzaPx: 1000, altezzaPx: 1000 } as never;

/** trapezio: base sup 480 con +5/+5, base inf 500 senza abbondanze */
const trap = {
  id: 'q1', fotoId: 'f1', zIndex: 0,
  stile: { colore: '#fff', spessore: 4, dimensioneTesto: 20 },
  tipo: 'quotaPoligono',
  punti: [{ x: 10, y: 0 }, { x: 490, y: 0 }, { x: 500, y: 230 }, { x: 0, y: 230 }],
  segmenti: [
    { da: 0, a: 1, valore: 480, abbInizio: 5, abbFine: 5, simbolo: 'B' },
    { da: 1, a: 2, valore: 230, abbInizio: 0, abbFine: 0, simbolo: 'h' },
    { da: 2, a: 3, valore: 500, abbInizio: 0, abbFine: 0, simbolo: 'b' },
    { da: 3, a: 0, valore: 230, abbInizio: 0, abbFine: 0, simbolo: 'h' }
  ],
  unita: 'cm', stato: 'reale',
  pannelli: { asse: 'verticale', sormonto: 2, verso: 'centro', giunti: [136, 271, 406] }
} as unknown as QuotaPoligono;

describe('probe2', () => {
  it('ingombroTaglio vs somma dei teli', () => {
    console.log('forma.taglio  ', formaQuadrilatera(trap)!.taglio);
    console.log('ingombroTaglio', ingombroTaglio(trap, foto));
    const t = pannelliTaglio(trap)!;
    console.log('teli mm', t.map((x) => x.larghezza));
    console.log('somma teli mm', t.reduce((s, x) => s + x.larghezza, 0), '(3 sormonti da 20 = 60)');
  });
});
