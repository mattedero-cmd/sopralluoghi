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
