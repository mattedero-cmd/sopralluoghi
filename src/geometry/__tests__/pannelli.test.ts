import { describe, expect, it } from 'vitest';
import {
  giuntiAutomatici,
  giuntiValidi,
  pannelloMinimo,
  normalizzaPannellizzazione,
  numeroMinimo,
  pannelliDi,
  pannellizzazioneAutomatica,
  sbordo,
  sormontoTotale,
  spostaGiunto,
  type Pannellizzazione
} from '../pannelli';

const larghezze = (p: ReturnType<typeof pannelliDi>) =>
  p.map((x) => Math.round(x.larghezza * 100) / 100);

describe('numeroMinimo', () => {
  it('una parete da 510 su fascia 137 con 2 di sormonto sta in quattro teli', () => {
    // ogni giunzione costa un sormonto: non è 510/137 = 3,7 → 4 per caso
    expect(numeroMinimo(510, 137, 2)).toBe(4);
  });

  it('quello che ci sta nella fascia non si divide', () => {
    expect(numeroMinimo(120, 137, 2)).toBe(1);
    expect(numeroMinimo(137, 137, 2)).toBe(1);
  });

  it('senza una fascia da rispettare non si divide niente', () => {
    expect(numeroMinimo(5000, null, 10)).toBe(1);
    // un sormonto largo quanto la fascia non coprirebbe mai niente di nuovo
    expect(numeroMinimo(5000, 20, 20)).toBe(1);
  });
});

describe('giuntiAutomatici a fascia', () => {
  const opzioni = { massimo: 137, modo: 'fascia' as const, sormonto: 2, verso: 'centro' as const };

  it('i primi teli prendono tutta la bobina, l’ultimo quello che avanza', () => {
    const giunti = giuntiAutomatici(510, opzioni);
    expect(giunti).toEqual([136, 271, 406]);
    expect(larghezze(pannelliDi(510, 230, { asse: 'verticale', sormonto: 2, verso: 'centro', giunti })))
      .toEqual([137, 137, 137, 105]);
  });

  it('il materiale speso è la parete più un sormonto per giunzione', () => {
    const p: Pannellizzazione = {
      asse: 'verticale',
      sormonto: 2,
      verso: 'centro',
      giunti: giuntiAutomatici(510, opzioni)
    };
    const totale = pannelliDi(510, 230, p).reduce((s, x) => s + x.larghezza, 0);
    expect(totale).toBeCloseTo(510 + 3 * 2, 6);
    expect(sormontoTotale(p, 510)).toBe(6);
  });
});

describe('giuntiAutomatici in parti uguali', () => {
  it('«uguali» divide IL VETRO in parti uguali, non il materiale', () => {
    const giunti = giuntiAutomatici(510, {
      massimo: 137,
      modo: 'uguali',
      sormonto: 2,
      verso: 'centro'
    });
    // le giunzioni cadono a un quarto, a metà e a tre quarti del vetro
    expect(giunti).toEqual([127.5, 255, 382.5]);
    // i teli di bordo sormontano da una parte sola: sono più stretti, ed è giusto
    expect(larghezze(pannelliDi(510, 230, { asse: 'verticale', sormonto: 2, verso: 'centro', giunti })))
      .toEqual([128.5, 129.5, 129.5, 128.5]);
  });

  it('una finestra 200×200 in due: la giunzione cade al centro', () => {
    const giunti = giuntiAutomatici(200, {
      numero: 2,
      modo: 'uguali',
      sormonto: 1,
      verso: 'centro'
    });
    expect(giunti).toEqual([100]);
    expect(larghezze(pannelliDi(200, 200, { asse: 'verticale', sormonto: 1, verso: 'centro', giunti })))
      .toEqual([100.5, 100.5]);
  });

  it('il numero chiesto a mano comanda sulla fascia', () => {
    const giunti = giuntiAutomatici(200, {
      massimo: 137,
      numero: 3,
      modo: 'uguali',
      sormonto: 1,
      verso: 'centro'
    });
    expect(giunti).toHaveLength(2);
  });
});

describe('verso del sormonto', () => {
  const base = { asse: 'verticale' as const, sormonto: 4, giunti: [100] };

  it('«centro» divide la sovrapposizione a metà per uno', () => {
    expect(sbordo({ sormonto: 4, verso: 'centro' })).toEqual({ inizio: 2, fine: 2 });
    const p = pannelliDi(200, 100, { ...base, verso: 'centro' });
    expect(larghezze(p)).toEqual([102, 102]);
  });

  it('«avanti»: il lembo torna indietro dal telo che viene dopo', () => {
    const p = pannelliDi(200, 100, { ...base, verso: 'avanti' });
    expect(larghezze(p)).toEqual([100, 104]);
    expect(p[1].inizio).toBe(96);
  });

  it('«indietro»: sopra sta il telo che viene prima', () => {
    const p = pannelliDi(200, 100, { ...base, verso: 'indietro' });
    expect(larghezze(p)).toEqual([104, 100]);
    expect(p[0].fine).toBe(104);
  });

  it('in ogni verso il materiale speso è lo stesso', () => {
    for (const verso of ['avanti', 'indietro', 'centro'] as const) {
      const somma = pannelliDi(200, 100, { ...base, verso }).reduce((s, x) => s + x.larghezza, 0);
      expect(somma).toBe(204);
    }
  });

  it('la parte a vista non dipende dal verso: la giunzione è dov’è', () => {
    for (const verso of ['avanti', 'indietro', 'centro'] as const) {
      const p = pannelliDi(200, 100, { ...base, verso });
      expect([p[0].vistaInizio, p[0].vistaFine]).toEqual([0, 100]);
      expect([p[1].vistaInizio, p[1].vistaFine]).toEqual([100, 200]);
    }
  });
});

describe('pannelliDi', () => {
  it('senza giunzioni resta la forma intera', () => {
    const p = pannelliDi(200, 120, { asse: 'verticale', sormonto: 10, verso: 'centro', giunti: [] });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ inizio: 0, fine: 200, larghezza: 200, altezza: 120 });
  });

  it('la misura trasversale non viene toccata da nessuna divisione', () => {
    const p = pannelliDi(500, 230, {
      asse: 'orizzontale',
      sormonto: 2,
      verso: 'centro',
      giunti: [150, 320]
    });
    expect(p.map((x) => x.altezza)).toEqual([230, 230, 230]);
  });

  it('i bordi esterni del pezzo non sormontano niente', () => {
    const p = pannelliDi(300, 100, {
      asse: 'verticale',
      sormonto: 6,
      verso: 'indietro',
      giunti: [100, 200]
    });
    expect(p[0].inizio).toBe(0);
    expect(p[p.length - 1].fine).toBe(300);
  });

  it('non esiste un numero massimo di pannelli', () => {
    const giunti = Array.from({ length: 19 }, (_, i) => (i + 1) * 100);
    const p = pannelliDi(2000, 100, { asse: 'verticale', sormonto: 2, verso: 'centro', giunti });
    expect(p).toHaveLength(20);
  });
});

describe('pannelloMinimo', () => {
  it('è relativo al pezzo: un millimetro non può valere come un metro', () => {
    // la stessa parete misurata in tre unità dà lo stesso limite reale
    expect(pannelloMinimo(5100)).toBeCloseTo(5.1, 9); // mm
    expect(pannelloMinimo(510)).toBeCloseTo(0.51, 9); // cm
    expect(pannelloMinimo(5.1)).toBeCloseTo(0.0051, 9); // m
  });

  it('in metri le giunzioni restano tutte: prima ne sarebbe sopravvissuta una', () => {
    // parete di 5,1 m divisa in quattro: i giunti cadono a 1,36 · 2,71 · 4,06
    const giunti = giuntiAutomatici(5.1, {
      massimo: 1.37,
      modo: 'fascia',
      sormonto: 0.02,
      verso: 'centro'
    });
    expect(giunti).toHaveLength(3);
    expect(giuntiValidi(giunti, 5.1)).toHaveLength(3);
  });
});

describe('giuntiValidi', () => {
  it('mette in ordine, butta i doppioni e quello che cade fuori dal pezzo', () => {
    expect(giuntiValidi([300, 50, -10, 700, 50.2, NaN], 500)).toEqual([50, 300]);
  });
});

describe('spostaGiunto', () => {
  const p: Pannellizzazione = {
    asse: 'verticale',
    sormonto: 2,
    verso: 'centro',
    giunti: [100, 250, 400]
  };

  it('sposta dove si chiede, quando c’è spazio', () => {
    expect(spostaGiunto(p, 1, 300, 500).giunti).toEqual([100, 300, 400]);
  });

  it('non lascia scavalcare le giunzioni vicine', () => {
    const passo = pannelloMinimo(500);
    expect(spostaGiunto(p, 1, 900, 500).giunti[1]).toBeCloseTo(400 - passo, 9);
    expect(spostaGiunto(p, 1, -50, 500).giunti[1]).toBeCloseTo(100 + passo, 9);
  });

  it('trascinato a fondo corsa il giunto resta: il limite è lo stesso', () => {
    // spostare fino al bordo e poi rileggere non deve far sparire la giunzione
    const unico: Pannellizzazione = { ...p, giunti: [250] };
    const alBordo = spostaGiunto(unico, 0, -1000, 500);
    expect(giuntiValidi(alBordo.giunti, 500)).toEqual(alBordo.giunti);
    const allAltroBordo = spostaGiunto(unico, 0, 1000, 500);
    expect(giuntiValidi(allAltroBordo.giunti, 500)).toEqual(allAltroBordo.giunti);
  });

  it('un indice che non esiste non cambia niente', () => {
    expect(spostaGiunto(p, 7, 300, 500)).toBe(p);
  });
});

describe('normalizzaPannellizzazione', () => {
  it('legge un salvataggio buono', () => {
    const p = normalizzaPannellizzazione(
      { asse: 'orizzontale', sormonto: 2, verso: 'avanti', giunti: [100, 50] },
      300
    );
    expect(p).toEqual({ asse: 'orizzontale', sormonto: 2, verso: 'avanti', giunti: [50, 100] });
  });

  it('senza giunzioni valide non c’è pannellizzazione', () => {
    expect(normalizzaPannellizzazione({ giunti: [] }, 300)).toBeNull();
    expect(normalizzaPannellizzazione({ giunti: [900] }, 300)).toBeNull();
    expect(normalizzaPannellizzazione(null, 300)).toBeNull();
  });

  it('i campi rovinati tornano ai valori sensati, i giunti restano', () => {
    const p = normalizzaPannellizzazione(
      { asse: 'boh', sormonto: -5, verso: 'obliquo', giunti: [150] },
      300
    );
    expect(p).toEqual({ asse: 'verticale', sormonto: 0, verso: 'centro', giunti: [150] });
  });
});

describe('pannellizzazioneAutomatica', () => {
  it('mette insieme asse, sormonto e giunti proposti', () => {
    const p = pannellizzazioneAutomatica(510, {
      asse: 'verticale',
      massimo: 137,
      modo: 'fascia',
      sormonto: 2,
      verso: 'centro'
    });
    expect(p.asse).toBe('verticale');
    expect(p.giunti).toHaveLength(3);
  });
});

describe('abbondanze attorno al vetro', () => {
  /** la finestra della foto: 2 cm ai lati, 10 cm solo sotto */
  const ABB = { inizio: 2, fine: 2, trasversaleInizio: 0, trasversaleFine: 10 };

  it('la giunzione al centro cade al centro DEL VETRO, non del foglio', () => {
    const giunti = giuntiAutomatici(160, { modo: 'uguali', numero: 2, sormonto: 1, verso: 'centro', abbondanze: ABB });
    expect(giunti).toEqual([80]);
  });

  it('i teli di bordo si portano la loro abbondanza: misure diverse, vetro diviso a metà', () => {
    const p = pannelliDi(160, 100, { asse: 'verticale', sormonto: 1, verso: 'centro', giunti: [80] }, ABB);
    // 80 di vetro + mezzo sormonto + 2 di abbondanza per ciascuno
    expect(larghezze(p)).toEqual([82.5, 82.5]);
    // e ogni telo porta le abbondanze di traverso: 100 + 0 + 10
    expect(p.map((x) => x.altezza)).toEqual([110, 110]);
    // il materiale del primo telo comincia FUORI dal vetro
    expect(p[0].inizio).toBe(-2);
    expect(p[1].fine).toBe(162);
  });

  it('con abbondanza da un lato solo i teli escono diversi, e il vetro resta diviso a metà', () => {
    const soloSotto = { inizio: 0, fine: 10, trasversaleInizio: 2, trasversaleFine: 2 };
    const giunti = giuntiAutomatici(164, { modo: 'uguali', numero: 2, sormonto: 1, verso: 'centro', abbondanze: soloSotto });
    expect(giunti).toEqual([82]);
    const p = pannelliDi(164, 120, { asse: 'orizzontale', sormonto: 1, verso: 'centro', giunti }, soloSotto);
    // 82 + 0,5 in alto; 82 + 0,5 + 10 in basso
    expect(larghezze(p)).toEqual([82.5, 92.5]);
    expect(p.map((x) => x.altezza)).toEqual([124, 124]);
  });

  it('a «fascia» il conto comprende le abbondanze dei due capi', () => {
    // vetro 500 + 5 + 5 = 510 di materiale su fascia 137
    const abb = { inizio: 5, fine: 5, trasversaleInizio: 5, trasversaleFine: 5 };
    expect(numeroMinimo(500, 137, 2, abb)).toBe(4);
    const giunti = giuntiAutomatici(500, { massimo: 137, modo: 'fascia', sormonto: 2, verso: 'centro', abbondanze: abb });
    const p = pannelliDi(500, 230, { asse: 'verticale', sormonto: 2, verso: 'centro', giunti }, abb);
    expect(larghezze(p)).toEqual([137, 137, 137, 105]);
    // il materiale è vetro + abbondanze + un sormonto per giunzione
    expect(p.reduce((s, x) => s + x.larghezza, 0)).toBeCloseTo(500 + 10 + 3 * 2, 6);
    expect(p.every((x) => x.altezza === 240)).toBe(true);
  });

  it('senza giunzioni il telo unico è il vetro con tutte le sue abbondanze', () => {
    const p = pannelliDi(160, 100, { asse: 'verticale', sormonto: 1, verso: 'centro', giunti: [] }, ABB);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ larghezza: 164, altezza: 110, inizio: -2, fine: 162 });
  });
});

describe('il verso cambia le misure dei teli', () => {
  it('a fascia, cambiare verso senza ridistribuire farebbe sforare la bobina', () => {
    // è la ragione per cui l'ambiente ridistribuisce quando si cambia il verso
    const giunti = [131, 266, 401];
    const abb = { inizio: 5, fine: 5, trasversaleInizio: 5, trasversaleFine: 5 };
    const misure = (verso: 'avanti' | 'indietro' | 'centro') =>
      larghezze(pannelliDi(500, 230, { asse: 'verticale', sormonto: 2, verso, giunti }, abb));
    expect(misure('centro')).toEqual([137, 137, 137, 105]);
    expect(misure('indietro')).toEqual([138, 137, 137, 104]); // il primo sfora
    expect(misure('avanti')).toEqual([136, 137, 137, 106]);
    // ridistribuendo col verso nuovo si torna dentro la fascia
    const rifatti = giuntiAutomatici(500, {
      massimo: 137,
      modo: 'fascia',
      sormonto: 2,
      verso: 'indietro',
      abbondanze: abb
    });
    expect(
      larghezze(pannelliDi(500, 230, { asse: 'verticale', sormonto: 2, verso: 'indietro', giunti: rifatti }, abb))
    ).toEqual([137, 137, 137, 105]);
  });
});
