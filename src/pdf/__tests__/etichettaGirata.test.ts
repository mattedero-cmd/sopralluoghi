import { describe, expect, it } from 'vitest';
import { impaginaLastra } from '../disegnoNesting';
import type { LastraNesting, Piazzamento } from '../../geometry/nesting';

/**
 * L'ETICHETTA GIRATA DEVE STARE DENTRO IL SUO PEZZO.
 *
 * Su un pezzo stretto e alto il nome si scrive per lungo, e il testo girato
 * si disegna in SVG. In SVG il testo si posa sulla sua LINEA DI BASE, non sul
 * bordo alto della riga: calcolarla come se fosse il bordo alto alza la
 * scritta di quasi un corpo intero, e su un testo girato quell'errore non è
 * in alto — è DI FIANCO.
 *
 * Su un pezzo largo non si vedeva. Su una striscia da 240 mm, dove un corpo è
 * un quarto della larghezza, la scritta usciva dal pezzo e finiva su quello
 * accanto: nel PDF di un lavoro vero 26 etichette su 143 erano fuori posto, e
 * sembravano pezzi sovrapposti.
 */

/** quanto, su Roboto, una riga sale sopra la linea di base e quanto scende */
const SALE = 0.73;
const SCENDE = 0.24;

const P = (nome: string, x: number, y: number, l: number, a: number): Piazzamento =>
  ({
    x,
    y,
    larghezza: l,
    altezza: a,
    larghezzaFinita: l,
    altezzaFinita: a,
    nome,
    tinta: 0,
    ruotato: false,
    chiave: `${nome}#0`
  }) as Piazzamento;

/** la fascia di pagina occupata dalla scritta, di traverso al pezzo */
function banda(e: {
  larghezza: number;
  righe: Array<{ corpo: number; scarto: number }>;
}): { da: number; a: number } {
  const cx = e.larghezza / 2;
  let da = Infinity;
  let a = -Infinity;
  for (const r of e.righe) {
    da = Math.min(da, cx + r.scarto - SALE * r.corpo);
    a = Math.max(a, cx + r.scarto + SCENDE * r.corpo);
  }
  return { da, a };
}

/** una striscia di rotolo con pezzi stretti affiancati, come nel cantiere */
const LASTRA: LastraNesting = {
  piazzamenti: [
    P('D1 Rettangolo.c', 10, 10, 240, 3500),
    P('Z1 Rettangolo.c', 250, 10, 690, 3030),
    P('S1 Rettangolo.d', 940, 10, 110, 3020),
    P('C1 Trapezio.c', 1050, 10, 500, 2640)
  ]
};

describe('il nome scritto per lungo', () => {
  const d = impaginaLastra(LASTRA, { larghezza: 1600, altezza: 3600 }, {
    x: 40,
    y: 100,
    larghezza: 515,
    altezza: 674
  });

  it('sui pezzi stretti si scrive davvero per lungo', () => {
    expect(d.ruotate.length).toBeGreaterThan(0);
  });

  it('e resta dentro il pezzo, non sul pezzo accanto', () => {
    for (const e of d.ruotate) {
      const b = banda(e);
      expect(b.da, `«${e.righe[0]?.testo}» esce a sinistra`).toBeGreaterThanOrEqual(-0.01);
      expect(b.a, `«${e.righe[0]?.testo}» esce a destra`).toBeLessThanOrEqual(e.larghezza + 0.01);
    }
  });

  it('ed è centrata nel pezzo, non appoggiata a un bordo', () => {
    for (const e of d.ruotate) {
      const b = banda(e);
      const centro = (b.da + b.a) / 2;
      expect(Math.abs(centro - e.larghezza / 2)).toBeLessThan(0.3 * e.righe[0].corpo);
    }
  });
});
