import { describe, expect, it } from 'vitest';
import type { Quota, QuotaPoligono, SegmentoQuota } from '../../db/types';
import {
  simboliPoligono,
  nomeFormaPoligono,
  posizioneEtichettaPoligono,
  primitiveQuota
} from '../primitive';

/** Rettangolo (con o senza diagonali) costruito attorno all'origine */
function rettangolo(larg: number, alt: number, segmenti: SegmentoQuota[]): QuotaPoligono {
  return {
    id: 'p1',
    fotoId: 'f1',
    tipo: 'quotaPoligono',
    zIndex: 0,
    stile: { colore: '#ffc400', spessore: 3, dimensioneTesto: 28 },
    punti: [
      { x: 0, y: 0 },
      { x: larg, y: 0 },
      { x: larg, y: alt },
      { x: 0, y: alt }
    ],
    segmenti,
    unita: 'cm',
    stato: 'reale'
  };
}

describe('nomenclatura poligono con diagonali', () => {
  it('un rettangolo con diagonali usa b/h sui lati (non l) e D/d sulle diagonali', () => {
    const q = rettangolo(102, 200, [
      { da: 0, a: 1, valore: 102 }, // lato orizzontale → b
      { da: 1, a: 2, valore: 200 }, // lato verticale → h
      { da: 0, a: 2, valore: 220 }, // diagonale → D (più lunga)
      { da: 1, a: 3, valore: 210 } // diagonale → d
    ]);
    expect(nomeFormaPoligono(q)).toBe('Rombo');
    const s = simboliPoligono(q);
    expect(s[0]).toBe('b');
    expect(s[1]).toBe('h');
    expect(s[2]).toBe('D');
    expect(s[3]).toBe('d');
  });
});

describe('posizione del numero del poligono', () => {
  it('sta dentro la figura (vicino al baricentro) quando è abbastanza grande', () => {
    const q = { ...rettangolo(400, 400, [{ da: 0, a: 1, valore: 400 }]), etichetta: '1' };
    const pos = posizioneEtichettaPoligono(q);
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(400);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.y).toBeLessThan(400);
  });

  it('rispetta lo spostamento scelto dall’utente', () => {
    const q = {
      ...rettangolo(400, 400, [{ da: 0, a: 1, valore: 400 }]),
      etichetta: '1',
      etichettaOffset: { x: 60, y: -50 }
    };
    const pos = posizioneEtichettaPoligono(q);
    expect(pos.x).toBeCloseTo(260, 0); // 200 + 60
    expect(pos.y).toBeCloseTo(150, 0); // 200 - 50
  });

  it('esce automaticamente dalla figura quando è troppo piccola', () => {
    const q = { ...rettangolo(20, 20, [{ da: 0, a: 1, valore: 20 }]), etichetta: '1' };
    const pos = posizioneEtichettaPoligono(q);
    // il badge va sopra il bordo superiore (y negativa)
    expect(pos.y).toBeLessThan(0);
  });
});

describe('scorrimento del testo lungo la linea di quota', () => {
  const base: Quota = {
    id: 'q1',
    fotoId: 'f1',
    tipo: 'quota',
    sottotipo: 'allineata',
    p1: { x: 0, y: 0 },
    p2: { x: 1000, y: 0 },
    offset: 0,
    valore: 1000,
    unita: 'cm',
    posizioneTesto: 'centro',
    stato: 'reale',
    zIndex: 0,
    stile: { colore: '#ffc400', spessore: 3, dimensioneTesto: 28 }
  };
  const testoX = (q: Quota) => {
    const t = primitiveQuota(q).find((p) => p.kind === 'testo');
    return t && t.kind === 'testo' ? t.posizione.x : NaN;
  };

  it('senza scorrimento il testo sta al centro', () => {
    expect(testoX(base)).toBeCloseTo(500, 0);
  });

  it('con scorrimento positivo il testo si sposta lungo la linea', () => {
    expect(testoX({ ...base, scorrTesto: 200 })).toBeCloseTo(700, 0);
    expect(testoX({ ...base, scorrTesto: -200 })).toBeCloseTo(300, 0);
  });
});
