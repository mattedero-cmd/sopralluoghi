import { describe, expect, it } from 'vitest';
import type { PianoProspettiva, Quota, QuotaAngolare, QuotaRaggio } from '../../db/types';
import { applicaOmografia, calcolaOmografia, omografiaPiano } from '../omografia';
import {
  angoloGradi,
  applicaValoriAuto,
  haCalibrazione,
  valoreAutomatico
} from '../calibrazione';
import { vincolaAngolo } from '../punti';

const stile = { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 };

function quota(parziale: Partial<Quota>): Quota {
  return {
    id: 'q1',
    fotoId: 'f1',
    tipo: 'quota',
    sottotipo: 'allineata',
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

describe('omografia (DLT)', () => {
  it('identità su un quadrato non deformato', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const H = calcolaOmografia(src, src);
    const p = applicaOmografia(H, { x: 37, y: 81 });
    expect(p.x).toBeCloseTo(37, 4);
    expect(p.y).toBeCloseTo(81, 4);
  });

  it('rettifica un trapezio prospettico nel rettangolo reale', () => {
    // porta 90x210 cm vista in prospettiva
    const piano: PianoProspettiva = {
      punti: [
        { x: 100, y: 80 },
        { x: 400, y: 120 },
        { x: 390, y: 800 },
        { x: 110, y: 900 }
      ],
      larghezzaReale: 90,
      altezzaReale: 210,
      unita: 'cm'
    };
    const H = omografiaPiano(piano);
    // gli angoli del trapezio finiscono esattamente sugli angoli del rettangolo
    const a = applicaOmografia(H, piano.punti[0]);
    const c = applicaOmografia(H, piano.punti[2]);
    expect(a.x).toBeCloseTo(0, 3);
    expect(a.y).toBeCloseTo(0, 3);
    expect(c.x).toBeCloseTo(90, 3);
    expect(c.y).toBeCloseTo(210, 3);
  });

  it('rifiuta punti degeneri', () => {
    const collineari = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 }
    ];
    expect(() =>
      calcolaOmografia(collineari, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ])
    ).toThrow();
  });
});

describe('valore automatico dalla calibrazione', () => {
  const fotoScala = { scala: { px: 200, reale: 100, unita: 'cm' as const }, piano: null };

  it('haCalibrazione', () => {
    expect(haCalibrazione({ scala: null, piano: null })).toBe(false);
    expect(haCalibrazione(fotoScala)).toBe(true);
  });

  it('quota allineata con scala lineare: 200 px = 100 cm', () => {
    const q = quota({ p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } });
    expect(valoreAutomatico(q, fotoScala)).toBeCloseTo(50);
  });

  it('quota orizzontale: conta solo la componente X, convertita nell’unità della quota', () => {
    const q = quota({ sottotipo: 'orizzontale', p1: { x: 0, y: 0 }, p2: { x: 100, y: 70 }, unita: 'mm' });
    expect(valoreAutomatico(q, fotoScala)).toBeCloseTo(500); // 50 cm in mm
  });

  it('quota su piano prospettico: misura reale corretta dalla prospettiva', () => {
    const piano: PianoProspettiva = {
      punti: [
        { x: 100, y: 80 },
        { x: 400, y: 120 },
        { x: 390, y: 800 },
        { x: 110, y: 900 }
      ],
      larghezzaReale: 90,
      altezzaReale: 210,
      unita: 'cm'
    };
    // quota tra due angoli del riferimento: deve dare il lato reale
    const q = quota({ p1: piano.punti[0], p2: piano.punti[1], unita: 'cm' });
    expect(valoreAutomatico(q, { scala: null, piano })).toBeCloseTo(90, 1);
  });

  it('raggio e diametro', () => {
    const r: QuotaRaggio = {
      id: 'r1',
      fotoId: 'f1',
      tipo: 'quotaRaggio',
      centro: { x: 0, y: 0 },
      bordo: { x: 100, y: 0 },
      modo: 'raggio',
      valore: null,
      unita: 'cm',
      stato: 'stimata',
      zIndex: 1,
      stile
    };
    expect(valoreAutomatico(r, fotoScala)).toBeCloseTo(50);
    expect(valoreAutomatico({ ...r, modo: 'diametro' }, fotoScala)).toBeCloseTo(100);
  });

  it('angolo in gradi, anche senza calibrazione', () => {
    const a: QuotaAngolare = {
      id: 'a1',
      fotoId: 'f1',
      tipo: 'quotaAngolo',
      vertice: { x: 0, y: 0 },
      a: { x: 100, y: 0 },
      b: { x: 0, y: 100 },
      raggioArco: 50,
      valore: null,
      stato: 'stimata',
      zIndex: 1,
      stile
    };
    expect(valoreAutomatico(a, { scala: null, piano: null })).toBeCloseTo(90);
    expect(angoloGradi({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45);
  });

  it('applicaValoriAuto: riempie i null, non tocca i valori manuali', () => {
    const auto = quota({ id: 'a', valore: null });
    const manuale = quota({ id: 'b', valore: 999, valoreAuto: false });
    const esito = applicaValoriAuto([auto, manuale], fotoScala);
    const eAuto = esito.find((x) => x.id === 'a') as Quota;
    const eMan = esito.find((x) => x.id === 'b') as Quota;
    expect(eAuto.valore).toBeCloseTo(50);
    expect(eAuto.valoreAuto).toBe(true);
    expect(eMan.valore).toBe(999);
  });

  it('senza calibrazione i valori restano invariati', () => {
    const q = quota({ valore: null });
    const esito = applicaValoriAuto([q], { scala: null, piano: null });
    expect((esito[0] as Quota).valore).toBeNull();
  });
});

describe('snap angolare', () => {
  it('vincola la direzione al multiplo di 15° più vicino', () => {
    const p = vincolaAngolo({ x: 0, y: 0 }, { x: 100, y: 8 }, 15);
    expect(p.y).toBeCloseTo(0, 5); // ~4.6° → 0°
    const q = vincolaAngolo({ x: 0, y: 0 }, { x: 100, y: 50 }, 15);
    const angolo = (Math.atan2(q.y, q.x) * 180) / Math.PI;
    expect(angolo).toBeCloseTo(30, 5); // ~26.6° → 30°
  });
});
