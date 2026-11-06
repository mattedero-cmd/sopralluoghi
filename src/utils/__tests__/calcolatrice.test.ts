import { describe, expect, it } from 'vitest';
import { analizzaMisura, eCalcolo, normalizzaMisura } from '../format';

/**
 * LA CALCOLATRICE NEL CAMPO DELLA MISURA.
 *
 * Una misura al banco viene a pezzi — 100 di qua, 124 di là, 113 di là
 * ancora — e scriverla voleva dire uscire dall'app, cercare la calcolatrice e
 * tornare col totale. Adesso il totale lo fa il campo.
 *
 * Due cose vanno tenute ferme. La prima: chi scrive un numero e basta non
 * deve accorgersi di niente, oggi come ieri. La seconda: un conto a metà non
 * vale un numero — mentre si scrive «100+124» il campo passa per «100+», e lì
 * non deve salvare 100.
 */

describe('un numero scritto normalmente', () => {
  it('si legge come sempre, con la virgola o col punto', () => {
    expect(analizzaMisura('12,5')).toBe(12.5);
    expect(analizzaMisura('12.5')).toBe(12.5);
    expect(analizzaMisura(' 300 ')).toBe(300);
    expect(analizzaMisura('0')).toBe(0);
  });

  it('non viene arrotondato: il numero battuto a mano è quello', () => {
    expect(analizzaMisura('12,123456')).toBe(12.123456);
  });

  it('quello che non è una misura resta niente', () => {
    for (const t of ['', '   ', 'abc', '12 cm', '--', '+', '(', ')', '1,2,3']) {
      expect(analizzaMisura(t), `«${t}»`).toBeNull();
    }
  });

  it('una misura negativa non esiste', () => {
    expect(analizzaMisura('-5')).toBeNull();
    expect(analizzaMisura('100-120')).toBeNull();
  });
});

describe('il conto', () => {
  it('somma i pezzi di una misura presa a tratti', () => {
    expect(analizzaMisura('100+124+113')).toBe(337);
    expect(analizzaMisura('100 + 124 + 113')).toBe(337);
  });

  it('sottrae, moltiplica e divide', () => {
    expect(analizzaMisura('1200-150')).toBe(1050);
    expect(analizzaMisura('3*750')).toBe(2250);
    expect(analizzaMisura('2400/2')).toBe(1200);
  });

  it('somma e sottrae nella stessa catena: il tutto meno quello che si leva', () => {
    expect(analizzaMisura('337+63-15')).toBe(385);
    expect(analizzaMisura('1200-150-150')).toBe(900);
    expect(analizzaMisura('100+124+113-37')).toBe(300);
  });

  it('un conto che finisce sotto zero non è una misura', () => {
    // il campo lo lascia scritto com'è: chi lo sta scrivendo lo corregge
    expect(analizzaMisura('150-1200')).toBeNull();
    expect(normalizzaMisura('150-1200')).toBe('150-1200');
  });

  it('rispetta la precedenza e le parentesi', () => {
    expect(analizzaMisura('100+2*50')).toBe(200);
    expect(analizzaMisura('(100+50)*2')).toBe(300);
    expect(analizzaMisura('2*(300+150)/3')).toBe(300);
  });

  it('prende i decimali con la virgola, anche più d’uno', () => {
    expect(analizzaMisura('100,5+20,25')).toBe(120.75);
  });

  it('accetta i segni che scrivono le tastiere', () => {
    expect(analizzaMisura('3×750')).toBe(2250); // ×
    expect(analizzaMisura('2400÷2')).toBe(1200); // ÷
    expect(analizzaMisura('2400:2')).toBe(1200);
    expect(analizzaMisura('1200−150')).toBe(1050); // meno tipografico
    expect(analizzaMisura('100 + 124')).toBe(224); // spazio unificatore
  });

  it('non arrotonda in modo sciocco: 0,1+0,2 fa 0,3', () => {
    expect(analizzaMisura('0,1+0,2')).toBe(0.3);
  });

  it('tiene i decimali che servono a una misura', () => {
    expect(analizzaMisura('1000/3')).toBe(333.3333);
  });

  it('«x» non moltiplica: 120x80 è un rettangolo, non 9600', () => {
    expect(analizzaMisura('120x80')).toBeNull();
  });

  it('un conto a metà non vale un numero', () => {
    // è lo stato in cui passa il campo mentre si scrive: non deve salvare
    for (const t of ['100+', '100*', '(100+50', '100++50', '100+50)', '*50']) {
      expect(analizzaMisura(t), `«${t}»`).toBeNull();
    }
  });

  it('non si divide per zero', () => {
    expect(analizzaMisura('100/0')).toBeNull();
  });

  it('non esegue codice: è un parser, non una eval', () => {
    for (const t of ['1+1;alert(1)', 'process.exit(1)', '[].constructor', '1e3+1']) {
      const v = analizzaMisura(t);
      expect(v === null || Number.isFinite(v), `«${t}»`).toBe(true);
    }
    expect(analizzaMisura('100+Math.PI')).toBeNull();
  });
});

describe('quando il campo si riscrive col totale', () => {
  it('riconosce un conto da un numero', () => {
    expect(eCalcolo('100+124')).toBe(true);
    expect(eCalcolo('1200-150')).toBe(true);
    expect(eCalcolo('2*3')).toBe(true);
    expect(eCalcolo('(100)')).toBe(true);
    expect(eCalcolo('12,5')).toBe(false);
    expect(eCalcolo('-5')).toBe(false); // un segno, non una sottrazione
    expect(eCalcolo('')).toBe(false);
  });

  it('il totale prende il posto del conto, e il numero resta com’è', () => {
    expect(normalizzaMisura('100+124+113')).toBe('337');
    expect(normalizzaMisura('100,5+20,25')).toBe('120,75');
    expect(normalizzaMisura('337+63-15')).toBe('385');
    expect(normalizzaMisura('12,5')).toBe('12,5');
    // un conto che non torna si lascia lì: chi lo sta scrivendo lo finisce
    expect(normalizzaMisura('100+')).toBe('100+');
  });
});
