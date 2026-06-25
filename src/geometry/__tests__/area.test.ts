import { describe, expect, it } from 'vitest';
import type { Foto, PianoProspettiva, QuotaPoligono, SegmentoQuota } from '../../db/types';
import { angoliTriangolo, areaReale } from '../calibrazione';

const stile = { colore: '#ffc400', spessore: 3, dimensioneTesto: 28 };

function poligono(punti: { x: number; y: number }[], segmenti: SegmentoQuota[]): QuotaPoligono {
  return {
    id: 'p1',
    fotoId: 'f1',
    tipo: 'quotaPoligono',
    zIndex: 0,
    stile,
    punti,
    segmenti,
    unita: 'cm',
    stato: 'reale'
  };
}

/** foto minima con la sola calibrazione necessaria */
function foto(cal: Partial<Pick<Foto, 'scala' | 'piano'>>): Foto {
  return {
    id: 'f1',
    progettoId: 'pr1',
    larghezzaPx: 1000,
    altezzaPx: 1000,
    creataIl: 0,
    ...cal
  } as Foto;
}

describe('angoli del triangolo dai 3 lati (SSS)', () => {
  it('triangolo 3-4-5 → angoli 90/~53/~37 sommano a 180', () => {
    // lati: 0-1 = 3, 1-2 = 4, 2-0 = 5 (il retto è opposto all'ipotenusa 5,
    // cioè al vertice 1)
    const q = poligono(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 }
      ],
      [
        { da: 0, a: 1, valore: 3 },
        { da: 1, a: 2, valore: 4 },
        { da: 2, a: 0, valore: 5 }
      ]
    );
    const ang = angoliTriangolo(q);
    expect(ang).not.toBeNull();
    const [a0, a1, a2] = ang!;
    expect(a0 + a1 + a2).toBeCloseTo(180, 1);
    expect(a1).toBeCloseTo(90, 1); // angolo retto al vertice 1
  });

  it('triangolo equilatero → 60/60/60', () => {
    const q = poligono(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8.66 }
      ],
      [
        { da: 0, a: 1, valore: 10 },
        { da: 1, a: 2, valore: 10 },
        { da: 2, a: 0, valore: 10 }
      ]
    );
    expect(angoliTriangolo(q)).toEqual([60, 60, 60]);
  });

  it('lati che violano la disuguaglianza triangolare → null', () => {
    const q = poligono(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 }
      ],
      [
        { da: 0, a: 1, valore: 1 },
        { da: 1, a: 2, valore: 1 },
        { da: 2, a: 0, valore: 10 }
      ]
    );
    expect(angoliTriangolo(q)).toBeNull();
  });
});

describe('area reale e prospettiva', () => {
  it('triangolo: area esatta da Erone, indipendente dalla prospettiva', () => {
    const q = poligono(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 }
      ],
      [
        { da: 0, a: 1, valore: 3 },
        { da: 1, a: 2, valore: 4 },
        { da: 2, a: 0, valore: 5 }
      ]
    );
    const r = areaReale(q, foto({}));
    expect(r).not.toBeNull();
    // 3·4/2 = 6 cm² = 0.0006 m²
    expect(r!.m2).toBeCloseTo(0.0006, 6);
    expect(r!.affidabile).toBe(true);
    expect(r!.metodo).toBe('triangolo');
  });

  it('rettangolo da base×altezza → area esatta', () => {
    const q = poligono(
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 }
      ],
      [
        { da: 0, a: 1, valore: 200 },
        { da: 1, a: 2, valore: 100 }
      ]
    );
    const r = areaReale(q, foto({}));
    // 200·100 = 20000 cm² = 2 m²
    expect(r!.m2).toBeCloseTo(2, 4);
    expect(r!.affidabile).toBe(true);
  });

  it('piano prospettico: area esatta anche con un quadrilatero deformato', () => {
    // piano reale 100×100 cm visto in prospettiva (trapezio in pixel)
    const angoli: { x: number; y: number }[] = [
      { x: 100, y: 100 },
      { x: 900, y: 150 },
      { x: 800, y: 850 },
      { x: 150, y: 800 }
    ];
    const piano: PianoProspettiva = {
      punti: [angoli[0], angoli[1], angoli[2], angoli[3]],
      larghezzaReale: 100,
      altezzaReale: 100,
      unita: 'cm'
    };
    // poligono che coincide col piano → deve dare 100×100 = 10000 cm² = 1 m²
    const q = poligono(
      angoli.map((p) => ({ ...p })),
      [
        { da: 0, a: 1, valore: 100 },
        { da: 1, a: 2, valore: 100 },
        { da: 2, a: 3, valore: 100 },
        { da: 3, a: 0, valore: 100 }
      ]
    );
    const r = areaReale(q, foto({ piano }));
    expect(r!.metodo).toBe('piano');
    expect(r!.affidabile).toBe(true);
    expect(r!.m2).toBeCloseTo(1, 3);
  });

  it('senza piano, un quadrilatero generico è solo una STIMA (non affidabile)', () => {
    const q = poligono(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 120, y: 80 },
        { x: 10, y: 90 }
      ],
      [
        { da: 0, a: 1, valore: 100 },
        { da: 1, a: 2, valore: 80 },
        { da: 2, a: 3, valore: 110 }
      ]
    );
    const r = areaReale(q, foto({ scala: { px: 100, reale: 100, unita: 'cm' } }));
    expect(r).not.toBeNull();
    expect(r!.affidabile).toBe(false);
    expect(r!.metodo).toBe('stima');
  });
});
