import { describe, expect, it } from 'vitest';
import { RicercaBordi, rilevaFigura } from '../bordi';
import { misureRettangolo, applicaValoriAuto } from '../calibrazione';
import type { QuotaRettangolo } from '../../db/types';

/**
 * Immagine sintetica: sfondo scuro (40) con un rettangolo chiaro (210)
 * da (60,50) a (160,130) — come una finestra chiara su una parete scura.
 */
function immagineSintetica(): RicercaBordi {
  const w = 220;
  const h = 180;
  const lum = new Float32Array(w * h).fill(40);
  for (let y = 50; y <= 130; y++) {
    for (let x = 60; x <= 160; x++) {
      lum[y * w + x] = 210;
    }
  }
  return RicercaBordi.daDati(lum, w, h, 1);
}

describe('autoquotatura: rilevamento figura', () => {
  it('toccando il centro della figura ne rileva i bordi', () => {
    const analisi = immagineSintetica();
    const figura = rilevaFigura(analisi, { x: 110, y: 90 });
    expect(figura).not.toBeNull();
    const r = figura!.rettangolo;
    expect(r.x).toBeGreaterThan(55);
    expect(r.x).toBeLessThan(65);
    expect(r.x + r.width).toBeGreaterThan(155);
    expect(r.x + r.width).toBeLessThan(165);
    expect(r.y).toBeGreaterThan(45);
    expect(r.y).toBeLessThan(55);
    expect(r.y + r.height).toBeGreaterThan(125);
    expect(r.y + r.height).toBeLessThan(135);
  });

  it('su una zona uniforme non propone nulla', () => {
    const w = 200;
    const h = 200;
    const lum = new Float32Array(w * h).fill(120); // tutto grigio uniforme
    const analisi = RicercaBordi.daDati(lum, w, h, 1);
    expect(rilevaFigura(analisi, { x: 100, y: 100 })).toBeNull();
  });

  it('fuori dall’immagine non propone nulla', () => {
    const analisi = immagineSintetica();
    expect(rilevaFigura(analisi, { x: -10, y: 5 })).toBeNull();
  });
});

describe('quota rettangolo', () => {
  const stile = { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 };
  const fotoScala = { scala: { px: 100, reale: 50, unita: 'cm' as const }, piano: null };

  it('misureRettangolo: base e altezza dalla calibrazione', () => {
    const m = misureRettangolo({ x: 0, y: 0, width: 200, height: 100 }, fotoScala, 'cm');
    expect(m).not.toBeNull();
    expect(m!.base).toBeCloseTo(100);
    expect(m!.altezza).toBeCloseTo(50);
  });

  it('applicaValoriAuto riempie base e altezza, rispetta i valori manuali', () => {
    const auto: QuotaRettangolo = {
      id: 'r1',
      fotoId: 'f1',
      tipo: 'quotaRett',
      rect: { x: 0, y: 0, width: 200, height: 100 },
      valoreBase: null,
      valoreAltezza: null,
      unita: 'cm',
      stato: 'stimata',
      zIndex: 1,
      stile
    };
    const manuale: QuotaRettangolo = {
      ...auto,
      id: 'r2',
      valoreBase: 90,
      valoreAltezza: 210,
      valoreAuto: false
    };
    const esito = applicaValoriAuto([auto, manuale], fotoScala);
    const eAuto = esito.find((a) => a.id === 'r1') as QuotaRettangolo;
    const eMan = esito.find((a) => a.id === 'r2') as QuotaRettangolo;
    expect(eAuto.valoreBase).toBeCloseTo(100);
    expect(eAuto.valoreAltezza).toBeCloseTo(50);
    expect(eAuto.valoreAuto).toBe(true);
    expect(eMan.valoreBase).toBe(90);
    expect(eMan.valoreAltezza).toBe(210);
  });
});
