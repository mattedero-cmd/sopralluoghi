import { describe, expect, it } from 'vitest';
import { teliDelPezzo, type Pannellizzazione } from '../pannelli';
import { areaForma, misureDelRitaglio, poligonoSagoma, type MisureForma } from '../sagome';

/**
 * DIVIDERE IN TELI UNA SAGOMA CHE NON È UN RETTANGOLO.
 *
 * Il caso del cantiere: «C1 Trapezio 3180 × 1690 | 2640», una finestra sotto
 * falda che in bobina non entra in nessun modo. Dividendola come si dividono
 * i rettangoli uscirebbero tre pezzi squadrati alti quanto il punto più alto:
 * si butterebbe il triangolo che avanza e, soprattutto, in posa si
 * scoprirebbe che il telo non copre dove la falda scende.
 *
 * Quello che deve succedere è che ogni telo sia LA SUA FETTA di trapezio, con
 * le sue due altezze lette sulla falda vera.
 */

/** il trapezio della foto: base 3180, lato sinistro 1690, lato destro 2640 */
const FALDA: MisureForma = {
  forma: 'trapezioR',
  larghezza: 3180,
  altezza: 1690,
  misura3: 2640
};

const pann = (giunti: number[], extra: Partial<Pannellizzazione> = {}): Pannellizzazione => ({
  asse: 'verticale',
  sormonto: 0,
  verso: 'centro',
  giunti,
  ...extra
});

/** l'altezza della falda alla distanza x dal lato sinistro */
const faldaA = (x: number) => 1690 + ((2640 - 1690) * x) / 3180;

/**
 * I vertici si arrotondano al milionesimo di millimetro quando si
 * normalizzano: il confronto si ferma lì, che è mille volte più fine di
 * qualunque taglio.
 */
const PRECISIONE = 3;
/** le aree sono milioni di mm²: si confrontano in proporzione, non in assoluto */
const stessaArea = (a: number, b: number) => Math.abs(a - b) / Math.max(1, b);

describe('i teli di un trapezio sotto falda', () => {
  it('sono trapezi, non rettangoli', () => {
    const teli = teliDelPezzo(FALDA, pann([1060, 2120]));
    expect(teli).toHaveLength(3);
    for (const t of teli) {
      expect(t.forma).toBe('trapezioR');
      // due altezze diverse: se fossero uguali saremmo tornati a squadrare
      expect(t.misura3).toBeDefined();
      expect(Math.abs((t.misura3 as number) - t.altezza)).toBeGreaterThan(1);
    }
  });

  it('le altezze stanno sulla falda vera, telo per telo', () => {
    const teli = teliDelPezzo(FALDA, pann([1060, 2120]));
    const tagli = [0, 1060, 2120, 3180];
    teli.forEach((t, i) => {
      expect(t.larghezza).toBeCloseTo(tagli[i + 1] - tagli[i], PRECISIONE);
      expect(t.altezza).toBeCloseTo(faldaA(tagli[i]), PRECISIONE);
      expect(t.misura3).toBeCloseTo(faldaA(tagli[i + 1]), PRECISIONE);
    });
  });

  it('senza sormonto i teli rifanno esattamente il pezzo', () => {
    const teli = teliDelPezzo(FALDA, pann([1060, 2120]));
    const somma = teli.reduce((s, t) => s + areaForma(t), 0);
    expect(stessaArea(somma, areaForma(FALDA))).toBeLessThan(1e-6);
  });

  it('col sormonto i teli si sovrappongono: è materiale in più, non in meno', () => {
    const senza = teliDelPezzo(FALDA, pann([1060, 2120]));
    const con = teliDelPezzo(FALDA, pann([1060, 2120], { sormonto: 40 }));
    const area = (t: MisureForma[]) => t.reduce((s, x) => s + areaForma(x), 0);
    expect(area(con)).toBeGreaterThan(area(senza));
    // due giunzioni da 40: ogni giunzione aggiunge una fascia alta quanto la
    // falda in quel punto
    const atteso = 40 * faldaA(1060) + 40 * faldaA(2120);
    expect(area(con) - area(senza)).toBeCloseTo(atteso, 1);
  });

  it('nessun telo è più largo della fascia che si è scelta', () => {
    const teli = teliDelPezzo(FALDA, pann([1060, 2120], { sormonto: 40 }));
    for (const t of teli) expect(t.larghezza).toBeLessThanOrEqual(1140);
  });

  it('la falda resta continua: dove due teli si toccano l’altezza combacia', () => {
    const teli = teliDelPezzo(FALDA, pann([1060, 2120]));
    for (let i = 1; i < teli.length; i++) {
      expect(teli[i].altezza).toBeCloseTo(teli[i - 1].misura3 as number, PRECISIONE);
    }
  });

  it('e si può dividere anche per traverso', () => {
    // fasce orizzontali: le fette NON sono più trapezi rettangoli (i lati
    // verticali non ci sono più) e viaggiano coi loro vertici
    const teli = teliDelPezzo(FALDA, pann([900], { asse: 'orizzontale' }));
    expect(teli).toHaveLength(2);
    expect(stessaArea(teli.reduce((s, t) => s + areaForma(t), 0), areaForma(FALDA))).toBeLessThan(
      1e-6
    );
    for (const t of teli) {
      expect(t.forma === 'quad' || t.forma === 'rett' || t.forma === 'trapezioR').toBe(true);
      if (t.forma === 'quad') expect(poligonoSagoma(t)).not.toBeNull();
    }
  });
});

describe('le altre sagome', () => {
  it('il rettangolo si divide come si è sempre diviso', () => {
    const teli = teliDelPezzo({ forma: 'rett', larghezza: 3000, altezza: 1200 }, pann([1500]));
    expect(teli).toHaveLength(2);
    for (const t of teli) {
      expect(t.forma).toBe('rett');
      expect(t.larghezza).toBeCloseTo(1500, 6);
      expect(t.altezza).toBeCloseTo(1200, 6);
      expect(t.misura3).toBeUndefined();
    }
  });

  it('un triangolo di sottotetto si divide in due pezzi che lo rifanno', () => {
    const tri: MisureForma = { forma: 'triangolo', larghezza: 2000, altezza: 1400 };
    const teli = teliDelPezzo(tri, pann([1000]));
    expect(teli).toHaveLength(2);
    expect(stessaArea(teli.reduce((s, t) => s + areaForma(t), 0), areaForma(tri))).toBeLessThan(
      1e-6
    );
  });

  it('senza giunzioni non c’è niente da dividere', () => {
    expect(teliDelPezzo(FALDA, pann([]))).toHaveLength(0);
  });

  it('una giunzione fuori dal pezzo non divide niente', () => {
    expect(teliDelPezzo(FALDA, pann([9000]))).toHaveLength(0);
  });
});

describe('il nome della fetta', () => {
  it('una fetta coi lati verticali uguali è un rettangolo, e si chiama così', () => {
    const m = misureDelRitaglio([
      [0, 0],
      [500, 0],
      [500, 800],
      [0, 800]
    ]);
    expect(m?.forma).toBe('rett');
    expect(m?.misura3).toBeUndefined();
  });

  it('una fetta coi lati verticali diversi è un trapezio rettangolo', () => {
    const m = misureDelRitaglio([
      [0, 200],
      [500, 0],
      [500, 800],
      [0, 800]
    ]);
    expect(m).toMatchObject({ forma: 'trapezioR', larghezza: 500, altezza: 600, misura3: 800 });
  });

  it('tutto il resto viaggia coi suoi vertici', () => {
    const m = misureDelRitaglio([
      [0, 0],
      [500, 120],
      [460, 800],
      [40, 700]
    ]);
    expect(m?.forma).toBe('quad');
    expect(m?.vertici).toHaveLength(4);
  });

  it('una fetta senza area non è un pezzo', () => {
    expect(
      misureDelRitaglio([
        [0, 0],
        [500, 0]
      ])
    ).toBeNull();
    expect(
      misureDelRitaglio([
        [0, 0],
        [500, 0],
        [500, 0]
      ])
    ).toBeNull();
  });
});
