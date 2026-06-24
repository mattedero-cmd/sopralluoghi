import { describe, expect, it } from 'vitest';
import { RicercaBordi } from '../bordi';
import { rilevaQuad4, punteggioQuad, ordinaQuad, rettangoloAreaMinima } from '../quad4';
import { campiRicerca } from '../bordi';
import type { Punto } from '../../db/types';

const vicino = (p: Punto, x: number, y: number, tol = 8) => {
  expect(Math.abs(p.x - x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(p.y - y)).toBeLessThanOrEqual(tol);
};

/** rettangolo chiaro (210) su sfondo scuro (40) */
function rett(): RicercaBordi {
  const w = 200;
  const h = 160;
  const lum = new Float32Array(w * h).fill(40);
  for (let y = 30; y <= 130; y++) for (let x = 40; x <= 160; x++) lum[y * w + x] = 210;
  return RicercaBordi.daDati(lum, w, h, 1);
}

/** trapezio (prospettiva): lato alto più stretto del basso */
function trapezio(): RicercaBordi {
  const w = 220;
  const h = 170;
  const lum = new Float32Array(w * h).fill(40);
  // vertici: TL(60,30) TR(140,30) BR(170,130) BL(30,130)
  for (let y = 30; y <= 130; y++) {
    const t = (y - 30) / 100;
    const xL = Math.round(60 + (30 - 60) * t);
    const xR = Math.round(140 + (170 - 140) * t);
    for (let x = xL; x <= xR; x++) lum[y * w + x] = 210;
  }
  return RicercaBordi.daDati(lum, w, h, 1);
}

describe('motore ibrido quad4: rilevamento a 4 lati', () => {
  it('rettangolo netto: 4 angoli precisi e confidenza alta', () => {
    const e = rilevaQuad4(rett(), { tipo: 'tocco', punto: { x: 100, y: 80 } });
    expect(e).not.toBeNull();
    const [tl, tr, br, bl] = e!.punti;
    vicino(tl, 40, 30);
    vicino(tr, 160, 30);
    vicino(br, 160, 130);
    vicino(bl, 40, 130);
    expect(e!.confidenza).toBeGreaterThan(0.4);
  });

  it('trapezio (prospettiva): segue i lati inclinati', () => {
    const e = rilevaQuad4(trapezio(), { tipo: 'tocco', punto: { x: 100, y: 80 } });
    expect(e).not.toBeNull();
    const [tl, tr, br, bl] = e!.punti;
    vicino(tl, 60, 30, 10);
    vicino(tr, 140, 30, 10);
    vicino(br, 170, 130, 10);
    vicino(bl, 30, 130, 10);
  });

  it('interno texturato: il bordo netto vince comunque', () => {
    // rettangolo con bordo forte (40→210) ma interno a righe (210/150)
    const w = 200;
    const h = 160;
    const lum = new Float32Array(w * h).fill(40);
    for (let y = 30; y <= 130; y++) {
      for (let x = 40; x <= 160; x++) lum[y * w + x] = (x + y) % 8 < 4 ? 210 : 150;
    }
    const e = rilevaQuad4(RicercaBordi.daDati(lum, w, h, 1), { tipo: 'tocco', punto: { x: 100, y: 80 } }, {
      sensibilita: 70
    });
    expect(e).not.toBeNull();
    const [tl, , br] = e!.punti;
    vicino(tl, 40, 30, 12);
    vicino(br, 160, 130, 12);
  });

  it('evidenziatore: una passata sottile sopra il rettangolo lo rileva', () => {
    // swipe quasi orizzontale dentro il rettangolo (bbox sottile in y):
    // col vecchio clip la regione restava intrappolata in una striscia
    const traccia: Punto[] = [
      { x: 60, y: 78 },
      { x: 90, y: 80 },
      { x: 120, y: 82 },
      { x: 145, y: 80 }
    ];
    const e = rilevaQuad4(rett(), { tipo: 'traccia', punti: traccia });
    expect(e).not.toBeNull();
    const [tl, , br] = e!.punti;
    vicino(tl, 40, 30, 10);
    vicino(br, 160, 130, 10);
  });

  it('zona uniforme: nessun rilevamento', () => {
    const w = 160;
    const h = 160;
    const lum = new Float32Array(w * h).fill(120);
    const e = rilevaQuad4(RicercaBordi.daDati(lum, w, h, 1), { tipo: 'tocco', punto: { x: 80, y: 80 } });
    expect(e).toBeNull();
  });
});

describe('quad4: componenti', () => {
  it('ordinaQuad: alto-sx, alto-dx, basso-dx, basso-sx', () => {
    const q = ordinaQuad([
      { x: 160, y: 130 },
      { x: 40, y: 30 },
      { x: 40, y: 130 },
      { x: 160, y: 30 }
    ]);
    vicino(q[0], 40, 30, 0);
    vicino(q[1], 160, 30, 0);
    vicino(q[2], 160, 130, 0);
    vicino(q[3], 40, 130, 0);
  });

  it('rettangoloAreaMinima: ritrova un rettangolo dal suo contorno', () => {
    const contorno: Array<[number, number]> = [];
    for (let x = 10; x <= 90; x++) {
      contorno.push([x, 20]);
      contorno.push([x, 70]);
    }
    for (let y = 20; y <= 70; y++) {
      contorno.push([10, y]);
      contorno.push([90, y]);
    }
    const r = rettangoloAreaMinima(contorno);
    expect(r).not.toBeNull();
    const q = ordinaQuad(r!);
    vicino(q[0], 10, 20, 2);
    vicino(q[2], 90, 70, 2);
  });

  it('punteggioQuad: il quad sui bordi batte un quad spostato', () => {
    const c = campiRicerca(rett());
    const giusto = ordinaQuad([
      { x: 40, y: 30 },
      { x: 160, y: 30 },
      { x: 160, y: 130 },
      { x: 40, y: 130 }
    ]);
    const spostato = ordinaQuad([
      { x: 70, y: 50 },
      { x: 190, y: 50 },
      { x: 190, y: 150 },
      { x: 70, y: 150 }
    ]);
    const seme = { x: 100, y: 80 };
    expect(punteggioQuad(c, giusto, seme, 40)).toBeGreaterThan(
      punteggioQuad(c, spostato, seme, 40)
    );
  });
});
