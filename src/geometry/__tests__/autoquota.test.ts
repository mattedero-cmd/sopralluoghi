import { describe, expect, it } from 'vitest';
import { RicercaBordi, rilevaFigura, rilevaFiguraEvidenziata, rilevaRiempimento } from '../bordi';
import {
  misureRettangolo,
  applicaValoriAuto,
  classificaForma,
  misureElemento,
  misurePoligono,
  nomePoligono,
  perimetroPoligono
} from '../calibrazione';
import { primitiveQuota, primitiveQuotaPoligono, etichettaPoligono } from '../primitive';
import type { Punto, Quota, QuotaPoligono, QuotaRettangolo } from '../../db/types';

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

/** Figura a BASSO contrasto (195 su 180): come un'anta bianca su mobile bianco */
function immagineBassoContrasto(): RicercaBordi {
  const w = 220;
  const h = 180;
  const lum = new Float32Array(w * h).fill(180);
  for (let y = 50; y <= 130; y++) {
    for (let x = 60; x <= 160; x++) lum[y * w + x] = 195;
  }
  return RicercaBordi.daDati(lum, w, h, 1);
}

describe('autoquotatura: rilevamento figura', () => {
  it('basso contrasto (bianco su bianco): la soglia adattiva rileva comunque', () => {
    // salto di soli 15 livelli: la soglia fissa precedente lo perdeva,
    // quella adattiva al contrasto della scena lo riconosce
    const figura = rilevaFigura(immagineBassoContrasto(), { x: 110, y: 90 });
    expect(figura).not.toBeNull();
    const [altoSx, , bassoDx] = figura!.punti;
    vicino(altoSx, 60, 50, 6);
    vicino(bassoDx, 160, 130, 6);
  });

  it('tolleranza: una soglia severa (×3) non rileva più un bordo debole', () => {
    // lo stesso bordo a basso contrasto rilevato con tolleranza normale
    // sparisce con una soglia molto più severa, e ricompare allentandola
    const img = immagineBassoContrasto();
    const punto = { x: 110, y: 90 };
    expect(rilevaFigura(img, punto)).not.toBeNull(); // tolleranza normale
    expect(rilevaFigura(img, punto, 3)).toBeNull(); // soglia ×3: troppo severa
    expect(rilevaFigura(img, punto, 0.6)).not.toBeNull(); // allentata: torna
  });

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

describe('riempimento "secchiello": contorno → poligono', () => {
  /** triangolo rettangolo chiaro (220) su sfondo scuro (40) */
  function immagineTriangolo(): RicercaBordi {
    const w = 140;
    const h = 140;
    const lum = new Float32Array(w * h).fill(40);
    for (let y = 10; y <= 110; y++) {
      for (let x = 10; x <= 120 - y; x++) lum[y * w + x] = 220;
    }
    return RicercaBordi.daDati(lum, w, h, 1);
  }

  /** rettangolo chiaro (220) su sfondo scuro (40) */
  function immagineRettangolo(): RicercaBordi {
    const w = 140;
    const h = 140;
    const lum = new Float32Array(w * h).fill(40);
    for (let y = 20; y <= 100; y++) {
      for (let x = 30; x <= 110; x++) lum[y * w + x] = 220;
    }
    return RicercaBordi.daDati(lum, w, h, 1);
  }

  it('un triangolo pieno produce un poligono a ~3 lati', () => {
    const poly = rilevaRiempimento(immagineTriangolo(), { x: 25, y: 25 }, 40);
    expect(poly).not.toBeNull();
    expect(poly!.length).toBeGreaterThanOrEqual(3);
    expect(poly!.length).toBeLessThanOrEqual(4);
  });

  it('un rettangolo pieno produce un poligono a 4 lati', () => {
    const poly = rilevaRiempimento(immagineRettangolo(), { x: 60, y: 60 }, 40);
    expect(poly).not.toBeNull();
    expect(poly!.length).toBe(4);
  });

  it('una forma complessa (cerchio) è comunque semplificata a ≤ 4 lati', () => {
    // un disco pieno: il contorno avrebbe molti vertici, ma il
    // rilevamento li limita a un poligono semplice (max 4)
    const w = 160;
    const h = 160;
    const lum = new Float32Array(w * h).fill(40);
    const cx = 80;
    const cy = 80;
    const r = 50;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) lum[y * w + x] = 220;
      }
    }
    const poly = rilevaRiempimento(RicercaBordi.daDati(lum, w, h, 1), { x: cx, y: cy }, 40);
    expect(poly).not.toBeNull();
    expect(poly!.length).toBeLessThanOrEqual(4);
    expect(poly!.length).toBeGreaterThanOrEqual(3);
  });

  it('tolleranza troppo bassa non esce dal singolo colore di sfondo uniforme', () => {
    const w = 120;
    const h = 120;
    const lum = new Float32Array(w * h).fill(120); // tutto uniforme
    const analisi = RicercaBordi.daDati(lum, w, h, 1);
    // il riempimento invade tutta l'area → rifiutato (è lo sfondo)
    expect(rilevaRiempimento(analisi, { x: 60, y: 60 }, 40)).toBeNull();
  });

  it('tolleranza ampia ingloba colori vicini (regione più grande del triangolo stretto)', () => {
    // due livelli: triangolo 220 con una fascia 200 attorno; tolleranza
    // bassa prende solo il 220, alta prende anche il 200
    const w = 140;
    const h = 140;
    const lum = new Float32Array(w * h).fill(40);
    for (let y = 10; y <= 110; y++) {
      for (let x = 10; x <= 120 - y; x++) lum[y * w + x] = y < 60 ? 220 : 200;
    }
    const analisi = RicercaBordi.daDati(lum, w, h, 1);
    const stretto = rilevaRiempimento(analisi, { x: 25, y: 25 }, 8); // solo 220
    const ampio = rilevaRiempimento(analisi, { x: 25, y: 25 }, 40); // 220 + 200
    expect(stretto).not.toBeNull();
    expect(ampio).not.toBeNull();
    // l'area ampia arriva più in basso (y maggiore) del riempimento stretto
    const maxY = (p: { y: number }[]) => Math.max(...p.map((q) => q.y));
    expect(maxY(ampio!)).toBeGreaterThan(maxY(stretto!));
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

describe('classificazione forma elemento', () => {
  const stile = { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 };
  const base = (punti: [Punto, Punto, Punto, Punto], extra = {}): QuotaRettangolo => ({
    id: 'e1',
    fotoId: 'f1',
    tipo: 'quotaRett',
    punti,
    valoreBase: 100,
    valoreAltezza: 200,
    unita: 'cm',
    stato: 'reale',
    zIndex: 1,
    stile,
    ...extra
  });

  it('rettangolo: lati opposti uguali', () => {
    const q = base([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 }
    ]);
    expect(classificaForma(q.punti)).toBe('rettangolo');
    expect(misureElemento(q).forma).toBe('rettangolo');
  });

  it('trapezio: base superiore diversa dall’inferiore (parete sotto tetto inclinato)', () => {
    const q = base([
      { x: 40, y: 0 },
      { x: 160, y: 0 }, // base sup = 120
      { x: 200, y: 100 },
      { x: 0, y: 100 } // base inf = 200
    ]);
    expect(classificaForma(q.punti)).toBe('trapezio');
    const m = misureElemento(q);
    expect(m.forma).toBe('trapezio');
    // base inferiore ricavata in proporzione: 100 cm * (200px/120px) ≈ 166.67
    expect(m.baseSup).toBe(100);
    expect(m.baseInf).toBeCloseTo(166.67, 1);
  });

  it('quadrilatero: entrambe le coppie di lati differiscono', () => {
    const q = base([
      { x: 0, y: 0 },
      { x: 180, y: 20 },
      { x: 150, y: 130 },
      { x: 10, y: 90 }
    ]);
    expect(classificaForma(q.punti)).toBe('quadrilatero');
  });
});

describe('elemento poligonale (3 / 5 lati)', () => {
  const stile = { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 };
  const fotoScala = { scala: { px: 100, reale: 50, unita: 'cm' as const }, piano: null };
  const poligono = (punti: Punto[], extra: Partial<QuotaPoligono> = {}): QuotaPoligono => ({
    id: 'p1',
    fotoId: 'f1',
    tipo: 'quotaPoligono',
    punti,
    etichetta: '1',
    lati: punti.map(() => null),
    unita: 'cm',
    stato: 'reale',
    zIndex: 1,
    stile,
    ...extra
  });

  it('nomePoligono: 3 = Triangolo, 5 = Pentagono', () => {
    expect(nomePoligono(3)).toBe('Triangolo');
    expect(nomePoligono(5)).toBe('Pentagono');
    expect(nomePoligono(7)).toBe('Ettagono');
    expect(nomePoligono(9)).toBe('Poligono 9 lati');
  });

  it('misurePoligono: lunghezza reale di ogni lato dalla scala', () => {
    // triangolo rettangolo 3-4-5 in px (×100): lati 300, 400, 500 px
    const tri: Punto[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 0, y: 400 }
    ];
    const lati = misurePoligono(tri, fotoScala, 'cm');
    expect(lati).not.toBeNull();
    // scala 100px = 50cm → 300px = 150cm, 400px = 200cm, ipotenusa 500px = 250cm
    expect(lati![0]).toBeCloseTo(150);
    expect(lati![1]).toBeCloseTo(250);
    expect(lati![2]).toBeCloseTo(200);
  });

  it('misurePoligono: null senza calibrazione', () => {
    expect(misurePoligono([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], { scala: null, piano: null }, 'cm')).toBeNull();
  });

  it('applicaValoriAuto riempie i lati di un poligono, rispetta i valori manuali', () => {
    const tri: Punto[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 0, y: 400 }
    ];
    const auto = poligono(tri, { stato: 'stimata', valoreAuto: true });
    const manuale = poligono(tri, { id: 'p2', lati: [10, 20, 30], valoreAuto: false });
    const esito = applicaValoriAuto([auto, manuale], fotoScala);
    const eAuto = esito.find((a) => a.id === 'p1') as QuotaPoligono;
    const eMan = esito.find((a) => a.id === 'p2') as QuotaPoligono;
    expect(eAuto.lati[0]).toBeCloseTo(150);
    expect(eAuto.lati[1]).toBeCloseTo(250);
    expect(eAuto.valoreAuto).toBe(true);
    expect(eMan.lati).toEqual([10, 20, 30]);
  });

  it('perimetroPoligono: somma dei lati noti', () => {
    expect(perimetroPoligono(poligono([{ x: 0, y: 0 }], { lati: [10, 20, 30] }))).toBeCloseTo(60);
    expect(perimetroPoligono(poligono([{ x: 0, y: 0 }], { lati: [null, null] }))).toBeNull();
  });

  it('etichettaPoligono: nome forma + lati, prefisso ≈ se stimata', () => {
    const penta = poligono(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 120, y: 80 },
        { x: 50, y: 130 },
        { x: -20, y: 80 }
      ],
      { lati: [100, 50, 50, 100, 50], stato: 'stimata' }
    );
    const testo = etichettaPoligono(penta);
    expect(testo.startsWith('≈ Pentagono')).toBe(true);
  });

  it('primitiveQuotaPoligono: contorno chiuso + una quota per lato', () => {
    const penta = poligono([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 120, y: 80 },
      { x: 50, y: 130 },
      { x: -20, y: 80 }
    ]);
    const prim = primitiveQuotaPoligono(penta);
    const contorni = prim.filter((p) => p.kind === 'polilinea');
    expect(contorni.length).toBe(1);
    // contorno chiuso: 5 vertici + ritorno al primo = 6 punti (12 coordinate)
    expect((contorni[0] as { punti: number[] }).punti.length).toBe(12);
  });
});

describe('quota lineare: linee di estensione solo con offset', () => {
  const stile = { colore: '#ff3b30', spessore: 3, dimensioneTesto: 24 };
  const quota = (offset: number): Quota => ({
    id: 'q1',
    fotoId: 'f1',
    tipo: 'quota',
    sottotipo: 'orizzontale',
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    offset,
    valore: 50,
    unita: 'cm',
    posizioneTesto: 'sopra',
    stato: 'reale',
    zIndex: 1,
    stile
  });

  it('offset 0: nessuna linea di estensione (linea di quota sui punti)', () => {
    const prim = primitiveQuota(quota(0));
    const linee = prim.filter((p) => p.kind === 'linea');
    // solo la linea di quota, nessuna linea di estensione
    expect(linee.length).toBe(1);
  });

  it('offset > 0: compaiono le due linee di estensione', () => {
    const prim = primitiveQuota(quota(40));
    const linee = prim.filter((p) => p.kind === 'linea');
    // linea di quota + 2 linee di estensione
    expect(linee.length).toBe(3);
  });
});
