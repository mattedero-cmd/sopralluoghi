import { describe, expect, it } from 'vitest';
import { traslaAnnotazione } from '../fabbrica';
import type { Forma, QuotaTecnica } from '../../db/types';

const stile = { colore: '#1a73e8', spessore: 3, dimensioneTesto: 24 };

describe('quotatura tecnica — modello dati additivo', () => {
  it('trasla una Forma spostando tutti i vertici', () => {
    const f: Forma = {
      id: 'f1',
      fotoId: 'foto',
      tipo: 'forma',
      forma: 'poligono',
      punti: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ],
      chiusa: true,
      partePerimetro: false,
      zIndex: 1,
      stile
    };
    const t = traslaAnnotazione(f, 5, -3) as Forma;
    expect(t.tipo).toBe('forma');
    expect(t.punti).toEqual([
      { x: 5, y: -3 },
      { x: 15, y: -3 },
      { x: 15, y: 7 }
    ]);
  });

  it('trasla una QuotaTecnica spostando guida, punti, quote ed elementi', () => {
    const q: QuotaTecnica = {
      id: 'q1',
      fotoId: 'foto',
      tipo: 'quotaTecnica',
      sottotipo: 'serie',
      lineaGuida: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      verso: 'sinistra',
      puntiOriginali: [
        { x: 10, y: 0 },
        { x: 40, y: 0 }
      ],
      quote: [
        { p1: { x: 10, y: 0 }, p2: { x: 40, y: 0 }, valore: 30, orientamento: 'allineata', offset: 20 }
      ],
      foro: { centro: { x: 60, y: 0 }, raggioPx: 5, raggioReale: null, diametroReale: null, modo: 'diametro' },
      partePerimetro: true,
      zIndex: 1,
      stile
    };
    const t = traslaAnnotazione(q, 2, 7) as QuotaTecnica;
    expect(t.lineaGuida).toEqual({ a: { x: 2, y: 7 }, b: { x: 102, y: 7 } });
    expect(t.puntiOriginali).toEqual([
      { x: 12, y: 7 },
      { x: 42, y: 7 }
    ]);
    expect(t.quote[0].p1).toEqual({ x: 12, y: 7 });
    expect(t.quote[0].p2).toEqual({ x: 42, y: 7 });
    expect(t.foro?.centro).toEqual({ x: 62, y: 7 });
  });
});
