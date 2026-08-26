import { describe, it } from 'vitest';
import { codiceLocaleForma, famigliaDi, eCopiaEtichetta } from '../nomenclatura';
import type { QuotaPoligono } from '../../db/types';

const f = (etichetta?: string) => ({
  id: 'q1', fotoId: 'f1', zIndex: 0,
  stile: { colore: '#fff', spessore: 4, dimensioneTesto: 20 },
  tipo: 'quotaPoligono',
  punti: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2 }, { x: 0, y: 2 }],
  segmenti: [], unita: 'cm', stato: 'reale', etichetta
} as unknown as QuotaPoligono);

describe('probe etichette', () => {
  it('override manuali', () => {
    const numeri = new Map([['q1', { etichettaFoto: 'A', numero: 7, quantita: 1, quantitaGlobale: 1 }]] as never);
    for (const et of ['F1.dx', 'B2.x', 'P2.int', 'A1.a', 'C3.bis', 'A1.2.b', 'M1', 'Porta', 'S1.sx', 'L2.cm']) {
      console.log(JSON.stringify(et), '-> codice:', JSON.stringify(codiceLocaleForma(f(et), numeri as never)),
        '| famiglia:', JSON.stringify(famigliaDi(f(et))), '| copia:', eCopiaEtichetta(f(et)));
    }
  });
});
