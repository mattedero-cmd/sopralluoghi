import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingombroForma, misureForma } from '../sagome';

/**
 * LA DISTINTA DEVE DIRE QUELLO CHE DICE IL DISEGNO.
 *
 * Due finestre sotto falda gemelle e speculari — stessa base, stesse due
 * altezze scambiate — finivano nella distinta di taglio una come «860 × 1130»
 * e l'altra come «860 × 1610». Stesso pezzo ribaltato, stesso ingombro, due
 * numeri diversi: al banco è una trappola.
 *
 * La colpa era di `larghezza × altezza`, i due campi grezzi del pezzo. Su un
 * trapezio rettangolo `altezza` è l'altezza SINISTRA, e quale delle due sia la
 * sinistra dipende solo da come è stato girato il pezzo: può benissimo essere
 * la più corta. Il disegno del piano scriveva già la cosa giusta — base e tutte
 * e due le altezze — ma la distinta no, e le due pagine dello stesso PDF non
 * si somigliavano.
 */

describe('le misure nella distinta', () => {
  /** le due gemelle speculari del cantiere */
  const b11 = { forma: 'trapezioR' as const, larghezza: 860, altezza: 1130, misura3: 1610 };
  const b12 = { forma: 'trapezioR' as const, larghezza: 860, altezza: 1610, misura3: 1130 };

  it('due gemelle speculari hanno lo STESSO ingombro', () => {
    expect(ingombroForma(b11)).toEqual({ larghezza: 860, altezza: 1610 });
    expect(ingombroForma(b12)).toEqual({ larghezza: 860, altezza: 1610 });
  });

  it('i due campi grezzi le fanno sembrare pezzi diversi', () => {
    // è il difetto, scritto nero su bianco: questi sono i numeri che finivano
    // in distinta, e non si somigliano
    expect(`${b11.larghezza}×${b11.altezza}`).toBe('860×1130');
    expect(`${b12.larghezza}×${b12.altezza}`).toBe('860×1610');
  });

  it('le misure della forma le fanno leggere, e dicono tutte e due le altezze', () => {
    expect(misureForma(b11)).toBe('860×1130|1610');
    expect(misureForma(b12)).toBe('860×1610|1130');
    // nessuna delle due nasconde l'altezza lunga, che è quella che comanda
    // l'ingombro e quindi il materiale
    for (const m of [misureForma(b11), misureForma(b12)]) expect(m).toContain('1610');
  });

  it('un rettangolo resta scritto come prima', () => {
    expect(misureForma({ larghezza: 1120, altezza: 750 })).toBe('1120×750');
    expect(misureForma({ forma: 'rett', larghezza: 900, altezza: 805 })).toBe('900×805');
  });

  it('la distinta del PDF chiede le misure alla forma, non ai campi', () => {
    // si legge il SORGENTE perché il difetto non stava nei tipi: `p.larghezza`
    // e `p.altezza` esistono e sono numeri giusti, sono solo la cosa sbagliata
    // da scrivere. Il compilatore è contento lo stesso.
    const pdf = readFileSync(new URL('../../pdf/nesting.ts', import.meta.url), 'utf8');
    const i = pdf.indexOf('function distinta(');
    expect(i, 'la distinta non si trova più').toBeGreaterThan(-1);
    const corpo = pdf.slice(i, pdf.indexOf('\n}', i));
    expect(corpo).toContain('misureForma(');
    expect(corpo, 'la distinta scrive di nuovo i campi grezzi').not.toMatch(
      /mm\(p\.larghezza\)\}\s*×\s*\$\{mm\(p\.altezza\)/
    );
  });
});
