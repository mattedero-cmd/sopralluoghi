import { describe, expect, it } from 'vitest';
import { primitivePannelli } from '../primitive';
import { COLORE_PANNELLO } from '../../db/types';
import type { QuotaRettangolo } from '../../db/types';
import type { Pannellizzazione } from '../pannelli';

const stile = { colore: '#ffffff', spessore: 4, dimensioneTesto: 20 };

/**
 * Quota elemento larga 200 cm e alta 100, disegnata frontale su 400×200 px:
 * un centimetro reale vale due pixel, così le posizioni si leggono a mente.
 */
function elemento(pannelli: Pannellizzazione, punti?: QuotaRettangolo['punti']): QuotaRettangolo {
  return {
    id: 'e1',
    fotoId: 'f',
    zIndex: 0,
    stile,
    tipo: 'quotaRett',
    punti: punti ?? [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 0, y: 200 }
    ],
    valoreBase: 200,
    valoreAltezza: 100,
    unita: 'cm',
    stato: 'reale',
    pannelli
  } as QuotaRettangolo;
}

const linee = (p: ReturnType<typeof primitivePannelli>) =>
  p.filter((x): x is Extract<typeof x, { kind: 'linea' }> => x.kind === 'linea');
const testi = (p: ReturnType<typeof primitivePannelli>) =>
  p.filter((x): x is Extract<typeof x, { kind: 'testo' }> => x.kind === 'testo');

describe('primitivePannelli', () => {
  const meta: Pannellizzazione = {
    asse: 'verticale',
    sormonto: 4,
    verso: 'centro',
    giunti: [100]
  };

  it('la giunzione cade dove dicono i centimetri, non dove capita', () => {
    const prim = primitivePannelli(elemento(meta));
    const continue_ = linee(prim).filter((l) => !l.tratteggio);
    expect(continue_).toHaveLength(1);
    // 100 cm su 200 = metà della forma = x 200 px, da cima a fondo
    expect(continue_[0].punti).toEqual([200, 0, 200, 200]);
  });

  it('i due bordi del sormonto sono tratteggiati, ai lati della giunzione', () => {
    const tratteggiate = linee(primitivePannelli(elemento(meta))).filter((l) => l.tratteggio);
    expect(tratteggiate).toHaveLength(2);
    // ±2 cm attorno alla giunzione = ±4 px
    expect(tratteggiate.map((l) => l.punti[0]).sort((a, b) => a - b)).toEqual([196, 204]);
  });

  it('verde, e più sottile della linea di quota', () => {
    const prim = linee(primitivePannelli(elemento(meta)));
    expect(prim.every((l) => l.colore === COLORE_PANNELLO)).toBe(true);
    expect(prim.every((l) => l.spessore < stile.spessore)).toBe(true);
    // stesso alone delle quote: sulla foto si legge su qualunque sfondo
    expect(prim.every((l) => !!l.alone)).toBe(true);
  });

  it('senza sormonto resta la sola linea di giunzione', () => {
    const prim = linee(primitivePannelli(elemento({ ...meta, sormonto: 0 })));
    expect(prim).toHaveLength(1);
    expect(prim[0].tratteggio).toBeUndefined();
  });

  it('ogni telo scrive il suo codice: A1.a, A1.b', () => {
    const t = testi(primitivePannelli(elemento(meta), 'A1'));
    expect(t.map((x) => x.testo)).toEqual(['A1.a', 'A1.b']);
    expect(t.every((x) => x.colore === COLORE_PANNELLO)).toBe(true);
    // uno per campo: a sinistra e a destra della giunzione
    expect(t[0].posizione.x).toBeLessThan(200);
    expect(t[1].posizione.x).toBeGreaterThan(200);
  });

  it('senza codice non si scrive niente: meglio niente che una lettera sola', () => {
    expect(testi(primitivePannelli(elemento(meta)))).toHaveLength(0);
  });

  it('IN PROSPETTIVA la giunzione segue il piano, non l’immagine', () => {
    // stesso elemento visto di sbieco: il lato destro è più corto
    const prim = primitivePannelli(
      elemento(meta, [
        { x: 0, y: 0 },
        { x: 400, y: 50 },
        { x: 400, y: 150 },
        { x: 0, y: 200 }
      ])
    );
    const giunzione = linee(prim).find((l) => !l.tratteggio)!;
    const [x1, y1, x2, y2] = giunzione.punti;
    // a metà della parete reale, ma NON a metà dell'immagine in verticale:
    // gli estremi stanno sui due bordi, che lì sono più vicini fra loro
    expect(x1).toBeGreaterThan(200);
    expect(x2).toBeGreaterThan(200);
    expect(y1).toBeGreaterThan(0);
    expect(y2).toBeLessThan(200);
    // e la linea resta lunga quanto la parete è alta lì: sotto i 200 px
    expect(y2 - y1).toBeLessThan(200);
  });

  it('una forma non pannellizzata non disegna niente', () => {
    const senza = elemento(meta);
    delete (senza as { pannelli?: unknown }).pannelli;
    expect(primitivePannelli(senza)).toEqual([]);
  });

  it('quattro angoli degeneri non fanno disegnare storto: non disegnano', () => {
    const piatto = elemento(meta, [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 0 }
    ]);
    expect(primitivePannelli(piatto)).toEqual([]);
  });
});

const meta: Pannellizzazione = {
  asse: 'verticale',
  sormonto: 4,
  verso: 'centro',
  giunti: [100]
};

describe('abbondanze sulla foto', () => {
  /**
   * La finestra della foto: 2 cm ai lati, 10 cm solo sotto, giunzione
   * orizzontale a metà del vetro.
   */
  const finestra = (): QuotaRettangolo =>
    ({
      id: 'f1',
      fotoId: 'f',
      zIndex: 0,
      stile,
      tipo: 'quotaPoligono',
      unita: 'cm',
      stato: 'reale',
      punti: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 400 },
        { x: 0, y: 400 }
      ],
      segmenti: [
        { da: 0, a: 1, valore: 200, abbInizio: 2, abbFine: 2 },
        { da: 1, a: 2, valore: 200, abbFine: 10 },
        { da: 2, a: 3, valore: 200, abbInizio: 2, abbFine: 2 },
        { da: 3, a: 0, valore: 200, abbInizio: 10 }
      ],
      pannelli: { asse: 'orizzontale', sormonto: 1, verso: 'centro', giunti: [100] }
    }) as unknown as QuotaRettangolo;

  it('il contorno di ogni telo si disegna col filetto verde tratteggiato', () => {
    const prim = primitivePannelli(finestra());
    const contorni = prim.filter(
      (x): x is Extract<typeof x, { kind: 'polilinea' }> => x.kind === 'polilinea'
    );
    expect(contorni).toHaveLength(2); // un contorno per telo
    expect(contorni.every((c) => c.colore === COLORE_PANNELLO)).toBe(true);
    expect(contorni.every((c) => !!c.tratteggio)).toBe(true);
    // più sottile della giunzione, che è già più sottile della quota
    const giunzione = linee(prim).find((l) => !l.tratteggio)!;
    expect(contorni[0].spessore).toBeLessThan(giunzione.spessore);
  });

  it('il contorno sborda dal vetro dove c’è l’abbondanza, e solo lì', () => {
    // 200 cm di vetro su 400 px: un centimetro vale due pixel
    const contorni = primitivePannelli(finestra()).filter(
      (x): x is Extract<typeof x, { kind: 'polilinea' }> => x.kind === 'polilinea'
    );
    const y = (c: (typeof contorni)[0]) => c.punti.filter((_, i) => i % 2 === 1);
    // il primo telo parte dal bordo alto del vetro: niente abbondanza sopra
    expect(Math.min(...y(contorni[0]))).toBeCloseTo(0, 6);
    // l'ultimo arriva 10 cm sotto il vetro = 20 px
    expect(Math.max(...y(contorni[1]))).toBeCloseTo(420, 6);
    // e ai lati sborda di 2 cm = 4 px da entrambe le parti
    const x = (c: (typeof contorni)[0]) => c.punti.filter((_, i) => i % 2 === 0);
    expect(Math.min(...x(contorni[0]))).toBeCloseTo(-4, 6);
    expect(Math.max(...x(contorni[0]))).toBeCloseTo(404, 6);
  });

  it('senza abbondanze non si disegna nessun contorno in più', () => {
    const prim = primitivePannelli(elemento(meta));
    expect(prim.some((x) => x.kind === 'polilinea')).toBe(false);
  });
});

describe('forme che non si possono mappare', () => {
  it('un quadrilatero rientrante non disegna niente invece di sparare linee fuori', () => {
    // angolo basso-destro trascinato DENTRO la forma
    const concavo = elemento({ ...meta, giunti: [50, 100, 150] }, [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 120, y: 60 },
      { x: 0, y: 200 }
    ]);
    expect(primitivePannelli(concavo)).toEqual([]);
  });

  it('una prospettiva forte ma convessa si disegna, e resta dentro la forma', () => {
    const prospettico = elemento(meta, [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 300, y: 150 },
      { x: 50, y: 200 }
    ]);
    const x = linee(primitivePannelli(prospettico)).flatMap((l) =>
      l.punti.filter((_, i) => i % 2 === 0)
    );
    expect(Math.min(...x)).toBeGreaterThan(-1);
    expect(Math.max(...x)).toBeLessThan(401);
  });
});

/* --- la finestra sotto falda ------------------------------------------ */

describe('una forma che non è un rettangolo', () => {
  /**
   * Trapezio rettangolo disegnato frontale: base 300 cm su 300 px (1 cm = 1
   * px), altezza sinistra 200 e destra 400. Nessuna prospettiva, così quello
   * che esce si legge in centimetri.
   */
  const falda = (pannelli: Pannellizzazione) =>
    ({
      id: 'p1',
      fotoId: 'f',
      zIndex: 0,
      stile,
      tipo: 'quotaPoligono',
      punti: [
        { x: 0, y: 200 },
        { x: 300, y: 0 },
        { x: 300, y: 400 },
        { x: 0, y: 400 }
      ],
      segmenti: [
        { da: 1, a: 2, valore: 400 },
        { da: 2, a: 3, valore: 300 },
        { da: 3, a: 0, valore: 200 }
      ],
      unita: 'cm',
      stato: 'reale',
      pannelli
    }) as unknown as Parameters<typeof primitivePannelli>[0];

  const meta: Pannellizzazione = {
    asse: 'verticale',
    sormonto: 0,
    verso: 'centro',
    giunti: [150]
  };

  it('la giunzione si ferma sulla falda, non spara sopra il tetto', () => {
    const l = linee(primitivePannelli(falda(meta)));
    expect(l).toHaveLength(1);
    const [x1, y1, x2, y2] = l[0].punti;
    expect(x1).toBeCloseTo(150, 6);
    expect(x2).toBeCloseTo(150, 6);
    // a metà base la falda è a metà fra le due altezze: 100 px dal bordo alto
    const alto = Math.min(y1, y2);
    const basso = Math.max(y1, y2);
    expect(alto).toBeCloseTo(100, 6);
    expect(basso).toBeCloseTo(400, 6);
  });

  it('il codice del telo sta dentro la sagoma, non sopra', () => {
    const t = testi(primitivePannelli(falda(meta), 'B1'));
    expect(t.map((x) => x.testo)).toEqual(['B1.a', 'B1.b']);
    // il primo telo va da 0 a 150: a metà la falda è a 150 px dall'alto, e la
    // scritta sta più in basso ancora
    expect(t[0].posizione.y).toBeGreaterThan(150);
    expect(t[1].posizione.y).toBeGreaterThan(50);
    expect(t.every((x) => x.posizione.y < 400)).toBe(true);
  });
});
