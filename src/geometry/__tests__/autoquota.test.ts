import { describe, expect, it } from 'vitest';
import { RicercaBordi, rilevaFigura, rilevaFiguraEvidenziata } from '../bordi';
import { misureRettangolo, applicaValoriAuto } from '../calibrazione';
import type { Punto, QuotaRettangolo } from '../../db/types';

/**
 * Immagine sintetica: sfondo scuro (40) con un rettangolo chiaro (210)
 * da (60,50) a (160,130) — come una finestra chiara su una parete scura.
 */
function immagineOrtogonale(): RicercaBordi {
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

/**
 * Figura in "prospettiva": quadrilatero chiaro con i lati verticali
 * inclinati (il bordo sinistro va da x=60 in alto a x=72 in basso,
 * il destro da x=160 a x=148), come una porta fotografata di sbieco.
 */
function immagineInclinata(): RicercaBordi {
  const w = 220;
  const h = 200;
  const lum = new Float32Array(w * h).fill(40);
  for (let y = 40; y <= 160; y++) {
    const t = (y - 40) / 120;
    const xSx = Math.round(60 + 12 * t);
    const xDx = Math.round(160 - 12 * t);
    for (let x = xSx; x <= xDx; x++) {
      lum[y * w + x] = 210;
    }
  }
  return RicercaBordi.daDati(lum, w, h, 1);
}

const vicino = (p: Punto, x: number, y: number, tolleranza = 5) => {
  expect(Math.abs(p.x - x)).toBeLessThanOrEqual(tolleranza);
  expect(Math.abs(p.y - y)).toBeLessThanOrEqual(tolleranza);
};

describe('autoquotatura: rilevamento figura', () => {
  it('figura ortogonale: i 4 angoli coincidono con i bordi', () => {
    const figura = rilevaFigura(immagineOrtogonale(), { x: 110, y: 90 });
    expect(figura).not.toBeNull();
    const [altoSx, altoDx, bassoDx, bassoSx] = figura!.punti;
    vicino(altoSx, 60, 50);
    vicino(altoDx, 160, 50);
    vicino(bassoDx, 160, 130);
    vicino(bassoSx, 60, 130);
  });

  it('figura in prospettiva: il quadrilatero segue i lati inclinati', () => {
    const figura = rilevaFigura(immagineInclinata(), { x: 110, y: 100 });
    expect(figura).not.toBeNull();
    const [altoSx, altoDx, bassoDx, bassoSx] = figura!.punti;
    // i lati verticali sono inclinati: gli angoli alti e bassi NON
    // hanno la stessa x — il rilevamento non è un rettangolo statico
    vicino(altoSx, 60, 40, 6);
    vicino(altoDx, 160, 40, 6);
    vicino(bassoDx, 148, 160, 6);
    vicino(bassoSx, 72, 160, 6);
    expect(bassoSx.x - altoSx.x).toBeGreaterThan(6); // inclinazione rilevata
    expect(altoDx.x - bassoDx.x).toBeGreaterThan(6);
  });

  it('evidenziatore: con un riquadro ornamentale interno rileva l’oggetto completo', () => {
    // porta chiara (50,30)-(170,170) su sfondo scuro, con cornice
    // ornamentale più scura all'interno: (75,55)-(145,145)
    const w = 220;
    const h = 200;
    const lum = new Float32Array(w * h).fill(40);
    for (let y = 30; y <= 170; y++) {
      for (let x = 50; x <= 170; x++) lum[y * w + x] = 200;
    }
    const cornice = (x: number, y: number) =>
      ((x === 75 || x === 76 || x === 144 || x === 145) && y >= 55 && y <= 145) ||
      ((y === 55 || y === 56 || y === 144 || y === 145) && x >= 75 && x <= 145);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (cornice(x, y)) lum[y * w + x] = 90;
      }
    }
    const analisi = RicercaBordi.daDati(lum, w, h, 1);

    // tocco al centro: si aggancia alla cornice interna (figura più interna)
    const tocco = rilevaFigura(analisi, { x: 110, y: 100 });
    expect(tocco).not.toBeNull();
    expect(tocco!.punti[0].x).toBeGreaterThan(65); // bordo interno, non la porta

    // evidenziatura sopra l'oggetto completo: rileva la PORTA intera,
    // ignorando la cornice ornamentale dentro la zona tracciata
    const traccia: Punto[] = [
      { x: 60, y: 45 },
      { x: 110, y: 100 },
      { x: 160, y: 155 },
      { x: 60, y: 155 },
      { x: 160, y: 45 }
    ];
    const figura = rilevaFiguraEvidenziata(analisi, traccia);
    expect(figura).not.toBeNull();
    const [altoSx, altoDx, bassoDx, bassoSx] = figura!.punti;
    vicino(altoSx, 50, 30, 6);
    vicino(altoDx, 170, 30, 6);
    vicino(bassoDx, 170, 170, 6);
    vicino(bassoSx, 50, 170, 6);
  });

  it('su una zona uniforme non propone nulla', () => {
    const w = 200;
    const h = 200;
    const lum = new Float32Array(w * h).fill(120); // tutto grigio uniforme
    const analisi = RicercaBordi.daDati(lum, w, h, 1);
    expect(rilevaFigura(analisi, { x: 100, y: 100 })).toBeNull();
  });

  it('fuori dall’immagine non propone nulla', () => {
    expect(rilevaFigura(immagineOrtogonale(), { x: -10, y: 5 })).toBeNull();
  });
});

describe('quota elemento (quadrilatero)', () => {
  const stile = { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 };
  const fotoScala = { scala: { px: 100, reale: 50, unita: 'cm' as const }, piano: null };
  const puntiOrto: [Punto, Punto, Punto, Punto] = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 0, y: 100 }
  ];

  it('misureRettangolo: base e altezza misurate lungo i lati reali', () => {
    const m = misureRettangolo(puntiOrto, fotoScala, 'cm');
    expect(m).not.toBeNull();
    expect(m!.base).toBeCloseTo(100);
    expect(m!.altezza).toBeCloseTo(50);
    // lato inclinato: la base è la lunghezza del lato, non la proiezione
    const inclinati: [Punto, Punto, Punto, Punto] = [
      { x: 0, y: 0 },
      { x: 160, y: 120 }, // lato alto lungo 200 (3-4-5)
      { x: 160, y: 220 },
      { x: 0, y: 100 }
    ];
    const mi = misureRettangolo(inclinati, fotoScala, 'cm');
    expect(mi!.base).toBeCloseTo(100);
  });

  it('applicaValoriAuto riempie base e altezza, rispetta i valori manuali', () => {
    const auto: QuotaRettangolo = {
      id: 'r1',
      fotoId: 'f1',
      tipo: 'quotaRett',
      punti: puntiOrto,
      etichetta: '1',
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
      etichetta: '2',
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
