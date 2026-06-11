import { describe, expect, it } from 'vitest';
import type { Quota } from '../../db/types';
import { geometriaQuota } from '../primitive';
import { vincolaOrto, lunghezzaPxQuota } from '../punti';
import { puntiAggancio, snapPunto, sonoInCatena } from '../snap';
import { calcolaCatene, sommaCatenaInUnita } from '../catene';
import { analizzaMisura, inMillimetri, daMillimetri } from '../../utils/format';

const stile = { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 };

function quota(parziale: Partial<Quota>): Quota {
  return {
    id: parziale.id ?? 'q1',
    fotoId: 'f1',
    tipo: 'quota',
    sottotipo: 'orizzontale',
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    offset: 40,
    valore: null,
    unita: 'cm',
    posizioneTesto: 'sopra',
    stato: 'reale',
    zIndex: 1,
    stile,
    ...parziale
  };
}

describe('geometriaQuota', () => {
  it('quota orizzontale: linea di quota parallela a X, spostata di offset', () => {
    const g = geometriaQuota(quota({ p1: { x: 10, y: 20 }, p2: { x: 110, y: 50 } }));
    // direzione (1,0), normale (0,1): offset sposta in basso
    expect(g.q1).toEqual({ x: 10, y: 60 });
    expect(g.q2).toEqual({ x: 110, y: 60 });
    expect(g.lunghezzaPx).toBe(100);
  });

  it('quota verticale: misura solo la componente Y', () => {
    const g = geometriaQuota(
      quota({ sottotipo: 'verticale', p1: { x: 10, y: 20 }, p2: { x: 80, y: 220 } })
    );
    expect(g.lunghezzaPx).toBe(200);
    // normale di (0,1) è (-1,0): offset sposta a sinistra
    expect(g.q1.x).toBeCloseTo(-30);
    expect(g.q2.x).toBeCloseTo(-30);
  });

  it('quota allineata: misura la distanza euclidea', () => {
    const g = geometriaQuota(
      quota({ sottotipo: 'allineata', p1: { x: 0, y: 0 }, p2: { x: 30, y: 40 }, offset: 0 })
    );
    expect(g.lunghezzaPx).toBeCloseTo(50);
    expect(g.q1).toEqual({ x: 0, y: 0 });
    expect(g.q2.x).toBeCloseTo(30);
    expect(g.q2.y).toBeCloseTo(40);
  });

  it('lunghezzaPxQuota coerente con la geometria', () => {
    const q = quota({ p1: { x: 0, y: 0 }, p2: { x: 60, y: 80 } });
    expect(lunghezzaPxQuota(q)).toBe(60); // orizzontale: solo componente X
  });
});

describe('vincolo orto', () => {
  it('forza sull’asse dominante', () => {
    expect(vincolaOrto({ x: 0, y: 0 }, { x: 100, y: 30 })).toEqual({ x: 100, y: 0 });
    expect(vincolaOrto({ x: 0, y: 0 }, { x: 20, y: 90 })).toEqual({ x: 0, y: 90 });
  });
});

describe('snap e auto-aggancio', () => {
  it('aggancia al punto più vicino entro la soglia', () => {
    const candidati = [
      { x: 100, y: 100 },
      { x: 200, y: 200 }
    ];
    const vicino = snapPunto({ x: 105, y: 98 }, candidati, 24);
    expect(vicino.agganciato).toBe(true);
    expect(vicino.punto).toEqual({ x: 100, y: 100 });
    const lontano = snapPunto({ x: 150, y: 150 }, candidati, 24);
    expect(lontano.agganciato).toBe(false);
  });

  it('estrae i punti di aggancio da quote e frecce, escludendo l’annotazione indicata', () => {
    const q = quota({ id: 'a' });
    const punti = puntiAggancio([q], 'a');
    expect(punti).toHaveLength(0);
    expect(puntiAggancio([q])).toHaveLength(2);
  });

  it('riconosce quote adiacenti in catena (estremo condiviso, stessa direzione)', () => {
    const a = quota({ id: 'a', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } });
    const b = quota({ id: 'b', p1: { x: 100, y: 0 }, p2: { x: 250, y: 0 } });
    const c = quota({ id: 'c', sottotipo: 'verticale', p1: { x: 100, y: 0 }, p2: { x: 100, y: 80 } });
    expect(sonoInCatena(a, b)).toBe(true);
    expect(sonoInCatena(a, c)).toBe(false); // direzione diversa: non è una catena
  });
});

describe('catene di quote', () => {
  it('calcola la somma in unità coerenti', () => {
    const a = quota({ id: 'a', valore: 50, unita: 'cm', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } });
    const b = quota({ id: 'b', valore: 1, unita: 'm', p1: { x: 100, y: 0 }, p2: { x: 220, y: 0 } });
    const catene = calcolaCatene([a, b]);
    expect(catene).toHaveLength(1);
    expect(catene[0].sommaMm).toBe(1500);
    expect(catene[0].completa).toBe(true);
    expect(sommaCatenaInUnita(catene[0])).toBeCloseTo(150); // in cm
  });

  it('catene transitive: a-b-c connesse tramite estremi condivisi', () => {
    const a = quota({ id: 'a', valore: 10, p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } });
    const b = quota({ id: 'b', valore: 20, p1: { x: 100, y: 0 }, p2: { x: 200, y: 0 } });
    const c = quota({ id: 'c', valore: 30, p1: { x: 200, y: 0 }, p2: { x: 300, y: 0 } });
    const catene = calcolaCatene([a, b, c]);
    expect(catene).toHaveLength(1);
    expect(catene[0].quote).toHaveLength(3);
    expect(sommaCatenaInUnita(catene[0])).toBeCloseTo(60);
  });

  it('quota senza valore: somma parziale e catena incompleta', () => {
    const a = quota({ id: 'a', valore: 10, p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } });
    const b = quota({ id: 'b', valore: null, p1: { x: 100, y: 0 }, p2: { x: 200, y: 0 } });
    const catene = calcolaCatene([a, b]);
    expect(catene[0].completa).toBe(false);
    expect(sommaCatenaInUnita(catene[0])).toBeCloseTo(10);
  });

  it('quote isolate non formano catene', () => {
    const a = quota({ id: 'a', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } });
    const b = quota({ id: 'b', p1: { x: 500, y: 500 }, p2: { x: 600, y: 500 } });
    expect(calcolaCatene([a, b])).toHaveLength(0);
  });
});

describe('formati e conversioni', () => {
  it('analizzaMisura accetta virgola e punto, rifiuta input non numerici', () => {
    expect(analizzaMisura('12,5')).toBe(12.5);
    expect(analizzaMisura('12.5')).toBe(12.5);
    expect(analizzaMisura(' 300 ')).toBe(300);
    expect(analizzaMisura('')).toBeNull();
    expect(analizzaMisura('abc')).toBeNull();
    expect(analizzaMisura('-5')).toBeNull();
  });

  it('conversioni mm/cm/m', () => {
    expect(inMillimetri(2.5, 'm')).toBe(2500);
    expect(inMillimetri(12, 'cm')).toBe(120);
    expect(daMillimetri(1500, 'cm')).toBe(150);
  });
});
