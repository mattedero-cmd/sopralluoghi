import { describe, expect, it } from 'vitest';
import {
  calcolaNesting,
  calcolaNestingMigliore,
  CRITERI,
  risalgono,
  ORDINAMENTI,
  VERSI,
  passoGriglia,
  lunghezzaUsata,
  riepilogaNesting,
  type EsitoNesting,
  type ParametriNesting,
  type PezzoNesting
} from '../nesting';
import { segmentaBobina, strisciaResidua } from '../segmenti';

function pezzo(p: Partial<PezzoNesting> & { larghezza: number; altezza: number }): PezzoNesting {
  return {
    id: p.id ?? 'p',
    nome: p.nome ?? 'Pezzo',
    larghezza: p.larghezza,
    altezza: p.altezza,
    quantita: p.quantita ?? 1,
    ruotabile: p.ruotabile ?? true,
    tinta: p.tinta ?? 0
  };
}

const PIANA: ParametriNesting = {
  lastra: { larghezza: 1000, altezza: 1000 },
  lama: 0,
  abbondanza: 0,
  margine: 0
};

describe('calcolaNesting — disposizione sulle lastre', () => {
  it('senza abbondanze quattro quadrati riempiono esattamente la lastra', () => {
    const e = calcolaNesting(PIANA, [pezzo({ larghezza: 500, altezza: 500, quantita: 4 })]);
    expect(e.lastre).toHaveLength(1);
    expect(e.lastre[0].piazzamenti).toHaveLength(4);
    expect(e.scartati).toHaveLength(0);
    // nessuna sovrapposizione e tutti dentro la lastra
    const p = e.lastre[0].piazzamenti;
    for (const a of p) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.larghezza).toBeLessThanOrEqual(1000);
      expect(a.y + a.altezza).toBeLessThanOrEqual(1000);
    }
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const sovrapposti =
          p[i].x < p[j].x + p[j].larghezza &&
          p[j].x < p[i].x + p[i].larghezza &&
          p[i].y < p[j].y + p[j].altezza &&
          p[j].y < p[i].y + p[i].altezza;
        expect(sovrapposti).toBe(false);
      }
    }
  });

  it('apre una seconda lastra solo quando la prima è piena', () => {
    const e = calcolaNesting(PIANA, [pezzo({ larghezza: 500, altezza: 500, quantita: 5 })]);
    expect(e.lastre).toHaveLength(2);
    expect(e.lastre[0].piazzamenti).toHaveLength(4);
    expect(e.lastre[1].piazzamenti).toHaveLength(1);
  });

  it('LAMA: fra due pezzi adiacenti resta esattamente lo spessore della lama', () => {
    // due pezzi 500 di larghezza su una lastra da 1000 con lama 4: il secondo
    // non entra affiancato (500+4+500 > 1000) e va sotto
    const e = calcolaNesting({ ...PIANA, lama: 4 }, [
      pezzo({ larghezza: 500, altezza: 200, quantita: 2, ruotabile: false })
    ]);
    const p = e.lastre[0].piazzamenti;
    expect(p).toHaveLength(2);
    // le misure restituite sono quelle di TAGLIO, senza la lama
    expect(p[0].larghezza).toBe(500);
    expect(p[0].altezza).toBe(200);
    // impilati in verticale: distacco pari alla lama
    const [alto, basso] = [...p].sort((a, b) => a.y - b.y);
    expect(basso.y - (alto.y + alto.altezza)).toBeCloseTo(4);
  });

  it('LAMA: la lastra resta sfruttabile fino al bordo (l’ultima lama non ruba spazio)', () => {
    // 2 pezzi da 500×1000 con lama 4 entrano ancora affiancati? no: 1004 > 1000.
    // Ma 2 pezzi da 498 sì (498+4+498 = 1000), e questo è il caso che il
    // "gonfiaggio + contenitore allargato" deve preservare.
    const e = calcolaNesting({ ...PIANA, lama: 4 }, [
      pezzo({ larghezza: 498, altezza: 1000, quantita: 2, ruotabile: false })
    ]);
    expect(e.lastre).toHaveLength(1);
    expect(e.lastre[0].piazzamenti).toHaveLength(2);
  });

  it('MARGINE: i pezzi stanno dentro l’area utile', () => {
    const e = calcolaNesting({ ...PIANA, margine: 20 }, [
      pezzo({ larghezza: 300, altezza: 300, quantita: 4 })
    ]);
    for (const pc of e.lastre[0].piazzamenti) {
      expect(pc.x).toBeGreaterThanOrEqual(20);
      expect(pc.y).toBeGreaterThanOrEqual(20);
      expect(pc.x + pc.larghezza).toBeLessThanOrEqual(980);
      expect(pc.y + pc.altezza).toBeLessThanOrEqual(980);
    }
  });

  it('ABBONDANZA: allarga il pezzo tagliato ma non la misura finita', () => {
    const e = calcolaNesting({ ...PIANA, abbondanza: 10 }, [
      pezzo({ larghezza: 400, altezza: 200 })
    ]);
    const pc = e.lastre[0].piazzamenti[0];
    expect(pc.larghezza).toBe(410);
    expect(pc.altezza).toBe(210);
    expect(pc.larghezzaFinita).toBe(400);
    expect(pc.altezzaFinita).toBe(200);
  });

  it('ROTAZIONE: un pezzo che entra solo girato viene girato', () => {
    const par: ParametriNesting = {
      lastra: { larghezza: 1000, altezza: 300 },
      lama: 0,
      abbondanza: 0,
      margine: 0
    };
    const e = calcolaNesting(par, [
      pezzo({ larghezza: 250, altezza: 900, quantita: 1, ruotabile: true })
    ]);
    expect(e.scartati).toHaveLength(0);
    expect(e.lastre[0].piazzamenti[0].ruotato).toBe(true);
    // ruotato: l'ingombro sulla lastra è scambiato, la misura finita no
    expect(e.lastre[0].piazzamenti[0].larghezza).toBe(900);
    expect(e.lastre[0].piazzamenti[0].altezza).toBe(250);
    expect(e.lastre[0].piazzamenti[0].larghezzaFinita).toBe(250);
  });

  it('ROTAZIONE vietata: lo stesso pezzo viene scartato', () => {
    const par: ParametriNesting = {
      lastra: { larghezza: 1000, altezza: 300 },
      lama: 0,
      abbondanza: 0,
      margine: 0
    };
    const e = calcolaNesting(par, [
      pezzo({ larghezza: 250, altezza: 900, quantita: 1, ruotabile: false })
    ]);
    expect(e.lastre).toHaveLength(0);
    expect(e.scartati).toHaveLength(1);
    expect(e.scartati[0]).toMatchObject({ larghezzaFinita: 250, altezzaFinita: 900 });
  });

  it('un pezzo più grande della lastra è scartato, gli altri si piazzano', () => {
    const e = calcolaNesting(PIANA, [
      pezzo({ id: 'g', nome: 'Grande', larghezza: 2000, altezza: 100 }),
      pezzo({ id: 'ok', nome: 'Buono', larghezza: 200, altezza: 100, quantita: 2 })
    ]);
    expect(e.scartati).toHaveLength(1);
    expect(e.scartati[0].nome).toBe('Grande');
    expect(e.lastre[0].piazzamenti).toHaveLength(2);
  });

  it('margine e lama insieme riducono l’area disponibile', () => {
    // area utile 960×960 con margine 20; con lama 4 due pezzi da 478 stanno
    // affiancati (478+4+478 = 960), tre no
    const par = { ...PIANA, margine: 20, lama: 4 };
    const due = calcolaNesting(par, [
      pezzo({ larghezza: 478, altezza: 900, quantita: 2, ruotabile: false })
    ]);
    expect(due.lastre).toHaveLength(1);
    const tre = calcolaNesting(par, [
      pezzo({ larghezza: 478, altezza: 900, quantita: 3, ruotabile: false })
    ]);
    expect(tre.lastre).toHaveLength(2);
  });

  it('quantità zero o negativa non genera pezzi', () => {
    const e = calcolaNesting(PIANA, [
      pezzo({ larghezza: 100, altezza: 100, quantita: 0 }),
      pezzo({ larghezza: 100, altezza: 100, quantita: -3 })
    ]);
    expect(e.lastre).toHaveLength(0);
    expect(e.scartati).toHaveLength(0);
  });
});

describe('riepilogaNesting — statistiche', () => {
  it('resa 100% quando i pezzi riempiono la lastra senza abbondanze', () => {
    const pezzi = [pezzo({ larghezza: 500, altezza: 500, quantita: 4 })];
    const e = calcolaNesting(PIANA, pezzi);
    const r = riepilogaNesting(PIANA, pezzi, e);
    expect(r.lastreUsate).toBe(1);
    expect(r.pezziPiazzati).toBe(4);
    expect(r.pezziRichiesti).toBe(4);
    expect(r.resa).toBeCloseTo(100);
    expect(r.sfrido).toBeCloseTo(0);
  });

  it('la resa usa le misure FINITE (l’abbondanza è sfrido)', () => {
    const pezzi = [pezzo({ larghezza: 400, altezza: 400, quantita: 1 })];
    const e = calcolaNesting({ ...PIANA, abbondanza: 100 }, pezzi);
    const r = riepilogaNesting({ ...PIANA, abbondanza: 100 }, pezzi, e);
    // 400*400 / 1000*1000 = 16%
    expect(r.resa).toBeCloseTo(16);
  });

  it('conta i pezzi richiesti anche quando alcuni non entrano', () => {
    const pezzi = [
      pezzo({ larghezza: 2000, altezza: 2000, quantita: 2 }),
      pezzo({ id: 'b', larghezza: 100, altezza: 100, quantita: 3 })
    ];
    const e = calcolaNesting(PIANA, pezzi);
    const r = riepilogaNesting(PIANA, pezzi, e);
    expect(r.pezziRichiesti).toBe(5);
    expect(r.pezziPiazzati).toBe(3);
  });
});

describe('bobina — una sola lastra e lunghezza consumata', () => {
  // rotolo largo 1000, lungo 5 m
  const BOBINA: ParametriNesting = {
    lastra: { larghezza: 1000, altezza: 5000 },
    lama: 0,
    abbondanza: 0,
    margine: 0,
    massimoLastre: 1
  };

  it('non apre un secondo rotolo: ciò che non entra resta fuori', () => {
    const e = calcolaNesting(BOBINA, [
      pezzo({ larghezza: 1000, altezza: 1000, quantita: 7, ruotabile: false })
    ]);
    expect(e.lastre).toHaveLength(1);
    expect(e.lastre[0].piazzamenti).toHaveLength(5); // 5 m di rotolo
    expect(e.scartati).toHaveLength(2);
  });

  it('senza tetto, invece, apre altre lastre', () => {
    const e = calcolaNesting({ ...BOBINA, massimoLastre: undefined }, [
      pezzo({ larghezza: 1000, altezza: 1000, quantita: 7, ruotabile: false })
    ]);
    expect(e.lastre).toHaveLength(2);
    expect(e.scartati).toHaveLength(0);
  });

  it('la lunghezza usata arriva alla fine del pezzo più lontano', () => {
    const e = calcolaNesting(BOBINA, [
      pezzo({ larghezza: 1000, altezza: 800, quantita: 3, ruotabile: false })
    ]);
    // tre pezzi impilati: 2400 mm
    expect(lunghezzaUsata(e.lastre[0], 0)).toBeCloseTo(2400);
  });

  it('la lunghezza usata comprende il margine di coda', () => {
    const par = { ...BOBINA, margine: 20 };
    const e = calcolaNesting(par, [
      pezzo({ larghezza: 900, altezza: 500, quantita: 1, ruotabile: false })
    ]);
    // parte a y=20 (margine), finisce a 520, più 20 di coda
    expect(lunghezzaUsata(e.lastre[0], par.margine)).toBeCloseTo(540);
  });

  it('senza pezzi piazzati non si consuma nulla', () => {
    expect(lunghezzaUsata(undefined, 10)).toBe(0);
    expect(lunghezzaUsata({ piazzamenti: [] }, 10)).toBe(0);
  });
});

describe('verso imposto a mano (venatura)', () => {
  it('ogni copia ha una chiave stabile idPezzo#indice', () => {
    const e = calcolaNesting(PIANA, [
      pezzo({ id: 'anta', larghezza: 300, altezza: 200, quantita: 3 })
    ]);
    const chiavi = e.lastre[0].piazzamenti.map((p) => p.chiave).sort();
    expect(chiavi).toEqual(['anta#0', 'anta#1', 'anta#2']);
  });

  it('imporre il verso ruotato gira il pezzo anche se sarebbe stato diritto', () => {
    const libero = calcolaNesting(PIANA, [
      pezzo({ id: 'a', larghezza: 400, altezza: 200, quantita: 1, ruotabile: true })
    ]);
    expect(libero.lastre[0].piazzamenti[0].ruotato).toBe(false);
    expect(libero.lastre[0].piazzamenti[0].larghezza).toBe(400);

    const imposto = calcolaNesting({ ...PIANA, orientamenti: { 'a#0': true } }, [
      pezzo({ id: 'a', larghezza: 400, altezza: 200, quantita: 1, ruotabile: true })
    ]);
    const pc = imposto.lastre[0].piazzamenti[0];
    expect(pc.ruotato).toBe(true);
    // l'ingombro è scambiato, la misura finita no
    expect(pc.larghezza).toBe(200);
    expect(pc.altezza).toBe(400);
    expect(pc.larghezzaFinita).toBe(400);
  });

  it('la VENATURA vince sul verso imposto: un pezzo bloccato non si gira', () => {
    // il verso girato a mano prima di accendere la venatura non le sopravvive
    const e = calcolaNesting({ ...PIANA, orientamenti: { 'a#0': true } }, [
      pezzo({ id: 'a', larghezza: 400, altezza: 200, quantita: 1, ruotabile: false })
    ]);
    const pc = e.lastre[0].piazzamenti[0];
    expect(pc.ruotato).toBe(false);
    expect(pc.larghezza).toBe(400);
  });

  it('imporre il verso diritto impedisce la rotazione automatica', () => {
    const par: ParametriNesting = {
      lastra: { larghezza: 1000, altezza: 300 },
      lama: 0,
      abbondanza: 0,
      margine: 0
    };
    // da solo entrerebbe solo girato
    const auto = calcolaNesting(par, [
      pezzo({ id: 'b', larghezza: 250, altezza: 900, quantita: 1, ruotabile: true })
    ]);
    expect(auto.lastre[0].piazzamenti[0].ruotato).toBe(true);

    const forzato = calcolaNesting({ ...par, orientamenti: { 'b#0': false } }, [
      pezzo({ id: 'b', larghezza: 250, altezza: 900, quantita: 1, ruotabile: true })
    ]);
    // imposto diritto: non entra più e finisce fra gli scarti
    expect(forzato.lastre).toHaveLength(0);
    expect(forzato.scartati).toHaveLength(1);
  });

  it('il verso imposto vale solo per la copia indicata', () => {
    const e = calcolaNesting({ ...PIANA, orientamenti: { 'c#1': true } }, [
      pezzo({ id: 'c', larghezza: 300, altezza: 150, quantita: 3, ruotabile: true })
    ]);
    const per = new Map(e.lastre[0].piazzamenti.map((p) => [p.chiave, p.ruotato]));
    expect(per.get('c#0')).toBe(false);
    expect(per.get('c#1')).toBe(true);
    expect(per.get('c#2')).toBe(false);
  });

  it('chiavi che non corrispondono a nessuna copia non danno fastidio', () => {
    const e = calcolaNesting({ ...PIANA, orientamenti: { 'sparito#7': true } }, [
      pezzo({ id: 'd', larghezza: 200, altezza: 200, quantita: 2 })
    ]);
    expect(e.lastre[0].piazzamenti).toHaveLength(2);
    expect(e.scartati).toHaveLength(0);
  });
});

describe('passoGriglia', () => {
  it('sceglie passi tondi', () => {
    expect(passoGriglia(1)).toBe(1);
    expect(passoGriglia(120)).toBe(100);
    expect(passoGriglia(280)).toBe(200);
    expect(passoGriglia(600)).toBe(500);
    expect(passoGriglia(900)).toBe(1000);
  });
  it('regge valori non validi', () => {
    expect(passoGriglia(0)).toBe(1);
    expect(passoGriglia(-5)).toBe(1);
  });
});

describe('calcolaNestingMigliore', () => {
  const par = {
    lastra: { larghezza: 2000, altezza: 1000 },
    lama: 0,
    abbondanza: 0,
    margine: 0
  };

  it('non è mai peggio dell’ordine predefinito', () => {
    const liste: PezzoNesting[][] = [
      [
        { id: 'a', nome: 'A', larghezza: 900, altezza: 400, quantita: 4, ruotabile: true, tinta: 0 },
        { id: 'b', nome: 'B', larghezza: 600, altezza: 600, quantita: 3, ruotabile: true, tinta: 0 },
        { id: 'c', nome: 'C', larghezza: 300, altezza: 950, quantita: 5, ruotabile: true, tinta: 0 }
      ],
      [
        { id: 'a', nome: 'A', larghezza: 1990, altezza: 200, quantita: 5, ruotabile: false, tinta: 0 },
        { id: 'b', nome: 'B', larghezza: 500, altezza: 500, quantita: 6, ruotabile: true, tinta: 0 }
      ],
      [
        { id: 'a', nome: 'A', larghezza: 700, altezza: 330, quantita: 12, ruotabile: true, tinta: 0 },
        { id: 'b', nome: 'B', larghezza: 250, altezza: 990, quantita: 7, ruotabile: true, tinta: 0 },
        { id: 'c', nome: 'C', larghezza: 480, altezza: 480, quantita: 9, ruotabile: true, tinta: 0 }
      ]
    ];
    for (const pezzi of liste) {
      const base = calcolaNesting(par, pezzi);
      const meglio = calcolaNestingMigliore(par, pezzi);
      const conta = (e: typeof base) =>
        e.lastre.reduce((n, l) => n + l.piazzamenti.length, 0);
      expect(conta(meglio)).toBeGreaterThanOrEqual(conta(base));
      if (conta(meglio) === conta(base)) {
        expect(meglio.lastre.length).toBeLessThanOrEqual(base.lastre.length);
      }
    }
  });

  it('è deterministico: stessi dati, stesso risultato', () => {
    const pezzi: PezzoNesting[] = [
      { id: 'a', nome: 'A', larghezza: 900, altezza: 400, quantita: 4, ruotabile: true, tinta: 0 },
      { id: 'b', nome: 'B', larghezza: 620, altezza: 610, quantita: 3, ruotabile: true, tinta: 0 }
    ];
    const uno = JSON.stringify(calcolaNestingMigliore(par, pezzi));
    const due = JSON.stringify(calcolaNestingMigliore(par, pezzi));
    expect(uno).toBe(due);
  });

  it('i pezzi non si sovrappongono, qualunque ordine vinca', () => {
    const pezzi: PezzoNesting[] = [
      { id: 'a', nome: 'A', larghezza: 640, altezza: 470, quantita: 7, ruotabile: true, tinta: 0 },
      { id: 'b', nome: 'B', larghezza: 310, altezza: 880, quantita: 5, ruotabile: true, tinta: 0 },
      { id: 'c', nome: 'C', larghezza: 205, altezza: 205, quantita: 11, ruotabile: true, tinta: 0 }
    ];
    const e = calcolaNestingMigliore({ ...par, lama: 3, margine: 10 }, pezzi);
    for (const l of e.lastre) {
      for (let i = 0; i < l.piazzamenti.length; i++) {
        for (let j = i + 1; j < l.piazzamenti.length; j++) {
          const a = l.piazzamenti[i];
          const b = l.piazzamenti[j];
          const separati =
            a.x + a.larghezza <= b.x + 1e-9 ||
            b.x + b.larghezza <= a.x + 1e-9 ||
            a.y + a.altezza <= b.y + 1e-9 ||
            b.y + b.altezza <= a.y + 1e-9;
          expect(separati).toBe(true);
        }
      }
    }
  });

  it('rispetta comunque i versi imposti a mano', () => {
    const pezzi: PezzoNesting[] = [
      { id: 'a', nome: 'A', larghezza: 800, altezza: 300, quantita: 2, ruotabile: true, tinta: 0 }
    ];
    const e = calcolaNestingMigliore({ ...par, orientamenti: { 'a#0': true } }, pezzi);
    const imposto = e.lastre.flatMap((l) => l.piazzamenti).find((p) => p.chiave === 'a#0');
    expect(imposto?.ruotato).toBe(true);
    expect(imposto?.larghezza).toBe(300);
  });
});

describe('verso globale: la leva che serve sui pezzi tutti uguali', () => {
  // il caso segnalato: 3 pezzi 610×400 su una bobina larga 1220.
  // Diritti ne stanno 2 per fila (1220) e il terzo va sotto: 800 mm di rotolo.
  // Girati sono larghi 400: ci stanno tutti e tre in fila, 610 mm di rotolo.
  const bobina = {
    lastra: { larghezza: 1220, altezza: 50000 },
    lama: 0,
    abbondanza: 0,
    margine: 0,
    massimoLastre: 1
  };
  const tre: PezzoNesting[] = [
    { id: 'a', nome: 'Fianco', larghezza: 610, altezza: 400, quantita: 3, ruotabile: true, tinta: 0 }
  ];
  const usata = (e: ReturnType<typeof calcolaNesting>) =>
    e.lastre[0].piazzamenti.reduce((f, p) => Math.max(f, p.y + p.altezza), 0);

  it('l’ordine da solo non basta: i pezzi uguali si ordinano allo stesso modo', () => {
    for (const ordinamento of ORDINAMENTI) {
      expect(usata(calcolaNesting({ ...bobina, ordinamento }, tre))).toBe(800);
    }
  });

  it('girandoli tutti il rotolo consumato scende da 800 a 610 mm', () => {
    expect(usata(calcolaNesting({ ...bobina, verso: 'girato' }, tre))).toBe(610);
    expect(usata(calcolaNestingMigliore(bobina, tre))).toBe(610);
  });

  it('la ricerca sceglie «diritto» quando girare peggiorerebbe', () => {
    const larghi: PezzoNesting[] = [
      { id: 'a', nome: 'Fascia', larghezza: 1200, altezza: 200, quantita: 4, ruotabile: true, tinta: 0 }
    ];
    expect(usata(calcolaNestingMigliore(bobina, larghi))).toBe(800);
  });

  it('il verso forzato non tocca i pezzi vincolati dalla venatura', () => {
    const fissi: PezzoNesting[] = [
      { id: 'a', nome: 'Anta', larghezza: 610, altezza: 400, quantita: 3, ruotabile: false, tinta: 0 }
    ];
    const e = calcolaNesting({ ...bobina, verso: 'girato' }, fissi);
    for (const p of e.lastre[0].piazzamenti) {
      expect(p.ruotato).toBe(false);
      expect(p.larghezza).toBe(610);
    }
  });

  it('il verso forzato non tocca i versi imposti a mano dall’anteprima', () => {
    const e = calcolaNesting({ ...bobina, verso: 'diritto', orientamenti: { 'a#1': true } }, tre);
    const imposto = e.lastre[0].piazzamenti.find((p) => p.chiave === 'a#1');
    expect(imposto?.ruotato).toBe(true);
    expect(imposto?.larghezza).toBe(400);
  });

  it('un pezzo girato dichiara di esserlo, così l’anteprima lo mostra giusto', () => {
    const e = calcolaNesting({ ...bobina, verso: 'girato' }, tre);
    for (const p of e.lastre[0].piazzamenti) {
      expect(p.ruotato).toBe(true);
      expect(p.larghezza).toBe(400);
      expect(p.altezza).toBe(610);
      // le misure FINITE restano quelle richieste dall'utente
      expect(p.larghezzaFinita).toBe(610);
      expect(p.altezzaFinita).toBe(400);
    }
  });

  it('i pezzi non si sovrappongono nemmeno col verso forzato', () => {
    const misti: PezzoNesting[] = [
      { id: 'a', nome: 'A', larghezza: 610, altezza: 400, quantita: 5, ruotabile: true, tinta: 0 },
      { id: 'b', nome: 'B', larghezza: 300, altezza: 300, quantita: 6, ruotabile: true, tinta: 0 },
      { id: 'c', nome: 'C', larghezza: 900, altezza: 250, quantita: 3, ruotabile: false, tinta: 0 }
    ];
    const e = calcolaNestingMigliore({ ...bobina, lama: 3, margine: 10 }, misti);
    for (const l of e.lastre) {
      for (let i = 0; i < l.piazzamenti.length; i++) {
        for (let j = i + 1; j < l.piazzamenti.length; j++) {
          const a = l.piazzamenti[i];
          const b = l.piazzamenti[j];
          const separati =
            a.x + a.larghezza <= b.x + 1e-9 ||
            b.x + b.larghezza <= a.x + 1e-9 ||
            a.y + a.altezza <= b.y + 1e-9 ||
            b.y + b.altezza <= a.y + 1e-9;
          expect(separati).toBe(true);
        }
      }
    }
  });
});

describe('ricerca attenta ai blocchi maneggevoli', () => {
  // la pelle chiara della camera: impaginata "al più stretto" viene un unico
  // blocco da 4,58 m che al banco non si maneggia; 16 cm di rotolo in più la
  // spezzano in due blocchi sotto i 3 m
  const par = {
    lastra: { larghezza: 1400, altezza: 50000 },
    lama: 3,
    abbondanza: 0,
    margine: 10,
    massimoLastre: 1
  };
  const pelle: PezzoNesting[] = [
    { id: 'a', nome: 'Fianco armadio', larghezza: 2000, altezza: 450, quantita: 1, ruotabile: true, tinta: 0 },
    { id: 'b', nome: 'Sopra armadio', larghezza: 1650, altezza: 100, quantita: 1, ruotabile: true, tinta: 0 },
    { id: 'c', nome: 'Frontale', larghezza: 1000, altezza: 150, quantita: 1, ruotabile: true, tinta: 0 },
    { id: 'd', nome: 'Frontali com', larghezza: 500, altezza: 150, quantita: 2, ruotabile: true, tinta: 0 },
    { id: 'e', nome: 'Retro frigo', larghezza: 750, altezza: 610, quantita: 1, ruotabile: true, tinta: 0 },
    { id: 'f', nome: 'Testiera', larghezza: 950, altezza: 860, quantita: 4, ruotabile: true, tinta: 0 }
  ];

  const usata = (e: ReturnType<typeof calcolaNestingMigliore>) =>
    e.lastre[0].piazzamenti.reduce((f, p) => Math.max(f, p.y + p.altezza), 0);

  it('senza il vincolo conta solo il materiale: sceglie il più stretto', () => {
    // la tagliabilità si paga in rotolo, quindi senza vincolo non si spende
    expect(usata(calcolaNestingMigliore(par, pelle))).toBeLessThanOrEqual(
      usata(calcolaNestingMigliore(par, pelle, { bloccoMassimo: 3000 }))
    );
  });

  it('con il blocco maneggevole preferisce la disposizione tagliabile', () => {
    const e = calcolaNestingMigliore(par, pelle, { bloccoMassimo: 3000 });
    const s = segmentaBobina(e.lastre[0], 3000, par.margine);
    expect(s.every((x) => !x.oltreMassimo)).toBe(true);
    expect(s.length).toBeGreaterThan(1);
    for (const x of s) expect(x.fine - x.inizio).toBeLessThanOrEqual(3000);
  });

  it('non sacrifica MAI un pezzo piazzato per la tagliabilità', () => {
    const senza = calcolaNestingMigliore(par, pelle);
    const con = calcolaNestingMigliore(par, pelle, { bloccoMassimo: 3000 });
    const conta = (e: typeof senza) => e.lastre.reduce((n, l) => n + l.piazzamenti.length, 0);
    expect(conta(con)).toBe(conta(senza));
  });

  it('il prezzo in materiale resta piccolo', () => {
    const senza = usata(calcolaNestingMigliore(par, pelle));
    const con = usata(calcolaNestingMigliore(par, pelle, { bloccoMassimo: 3000 }));
    expect(con / senza).toBeLessThan(1.1);
  });
});

/**
 * Il motore deve girare i pezzi DA SÉ: girarne uno a mano nell'anteprima e
 * vedere il lavoro accorciarsi vuol dire che il calcolo non aveva finito.
 */
describe('raffinatura: gira un pezzo alla volta', () => {
  const bobina = {
    lastra: { larghezza: 1220, altezza: 50000 },
    lama: 0,
    abbondanza: 0,
    margine: 0,
    massimoLastre: 1
  };

  const p = (l: number, a: number, q: number, i: number): PezzoNesting => ({
    id: `p${i}`,
    nome: `P${i}`,
    larghezza: l,
    altezza: a,
    quantita: q,
    ruotabile: true,
    tinta: 0
  });

  const usata = (e: EsitoNesting) =>
    e.lastre.reduce(
      (s, l) => s + l.piazzamenti.reduce((f, x) => Math.max(f, x.y + x.altezza), 0),
      0
    );

  /** il meglio che si ottiene provando solo ordini, versi globali e criteri */
  const soloStrategie = (pezzi: PezzoNesting[]): number => {
    let best = Infinity;
    for (const ordinamento of ORDINAMENTI)
      for (const verso of VERSI)
        for (const criterio of CRITERI)
          best = Math.min(
            best,
            usata(calcolaNesting({ ...bobina, ordinamento, verso, criterio }, pezzi))
          );
    return best;
  };

  it('trova quello che le strategie globali non vedono', () => {
    // qui il guadagno sta nel girare DUE copie su nove: nessun verso globale
    // ci arriva, perché girarle tutte peggiora
    const lista = [p(200, 550, 3, 1), p(250, 600, 3, 2), p(250, 550, 3, 3)];
    expect(usata(calcolaNestingMigliore(bobina, lista))).toBeLessThan(soloStrategie(lista));
  });

  it('su una lista mista accorcia il rotolo di parecchio', () => {
    const lista = [
      p(150, 550, 2, 1),
      p(250, 350, 1, 2),
      p(300, 400, 3, 3),
      p(350, 550, 3, 4),
      p(100, 150, 1, 5)
    ];
    expect(usata(calcolaNestingMigliore(bobina, lista))).toBeLessThanOrEqual(
      soloStrategie(lista) * 0.9
    );
  });

  it('non tocca i pezzi bloccati dalla venatura', () => {
    const lista: PezzoNesting[] = [
      { ...p(200, 550, 3, 1), ruotabile: false },
      { ...p(250, 600, 3, 2), ruotabile: false },
      { ...p(250, 550, 3, 3), ruotabile: false }
    ];
    const e = calcolaNestingMigliore(bobina, lista);
    for (const pc of e.lastre.flatMap((l) => l.piazzamenti)) expect(pc.ruotato).toBe(false);
  });

  it('non tocca i versi imposti a mano', () => {
    const lista = [p(200, 550, 3, 1), p(250, 600, 3, 2), p(250, 550, 3, 3)];
    const e = calcolaNestingMigliore({ ...bobina, orientamenti: { 'p1#0': true } }, lista);
    const pc = e.lastre.flatMap((l) => l.piazzamenti).find((x) => x.chiave === 'p1#0');
    expect(pc?.ruotato).toBe(true);
  });

  it('qualunque cosa faccia, i pezzi restano dentro la lastra e non si toccano', () => {
    let seme = 7;
    const caso = () => ((seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let prova = 0; prova < 12; prova++) {
      const lista: PezzoNesting[] = [];
      const n = 3 + Math.floor(caso() * 5);
      for (let i = 0; i < n; i++)
        lista.push(
          p(100 + Math.round(caso() * 10) * 100, 100 + Math.round(caso() * 10) * 100, 1 + Math.floor(caso() * 3), i)
        );
      const e = calcolaNestingMigliore({ ...bobina, lama: 3, margine: 10 }, lista);
      for (const l of e.lastre) {
        for (const pc of l.piazzamenti) {
          expect(pc.x).toBeGreaterThanOrEqual(10 - 1e-9);
          expect(pc.y).toBeGreaterThanOrEqual(10 - 1e-9);
          expect(pc.x + pc.larghezza).toBeLessThanOrEqual(1220 - 10 + 3 + 1e-9);
        }
        for (let i = 0; i < l.piazzamenti.length; i++)
          for (let j = i + 1; j < l.piazzamenti.length; j++) {
            const a = l.piazzamenti[i];
            const b = l.piazzamenti[j];
            expect(
              a.x + a.larghezza <= b.x + 1e-9 ||
                b.x + b.larghezza <= a.x + 1e-9 ||
                a.y + a.altezza <= b.y + 1e-9 ||
                b.y + b.altezza <= a.y + 1e-9
            ).toBe(true);
          }
      }
    }
  });
});

/**
 * IL PONTE FRA DUE BLOCCHI.
 *
 * Due pezzi stretti incolonnati, rimasti più in basso del necessario, si
 * allungano oltre la fine della fila che hanno di fianco: da lì in poi la
 * lama non trova più un punto dove passare e il rotolo si stacca tutto
 * intero. Presi uno per uno non possono salire — sopra ognuno c'è meno
 * spazio di quanto sia lungo — quindi devono muoversi insieme.
 */
describe('risalita verso la testa del rotolo', () => {
  const piazza = (nome: string, x: number, y: number, larghezza: number, altezza: number) => ({
    x,
    y,
    larghezza,
    altezza,
    larghezzaFinita: larghezza,
    altezzaFinita: altezza,
    nome,
    tinta: 0,
    ruotato: false,
    chiave: `${nome}#0`
  });

  // quattro file da 1400 una sotto l'altra e, di fianco, due pezzi stretti
  // rimasti 800 mm più in basso del necessario: a cavallo delle file, fanno da
  // ponte e saldano il rotolo in un blocco unico da 4,2 m
  const ponte: EsitoNesting = {
    scartati: [],
    lastre: [
      {
        piazzamenti: [
          piazza('Fila 1', 0, 0, 1440, 1400),
          piazza('Fila 2', 0, 1400, 1440, 1400),
          piazza('Fila 3', 0, 2800, 1440, 1400),
          piazza('Fila 4', 0, 4200, 1440, 1400),
          piazza('Stretto 1', 1440, 800, 200, 1200),
          piazza('Stretto 2', 1440, 2000, 200, 1200)
        ]
      }
    ]
  };

  it('senza risalita resta un blocco che al banco non si maneggia', () => {
    const s = segmentaBobina(ponte.lastre[0], 3000, 0, 1830, 0);
    expect(s.some((x) => x.oltreMassimo)).toBe(true);
    expect(Math.max(...s.map((x) => x.fine - x.inizio))).toBe(4200);
  });

  it('le due colonne salgono INSIEME: da sole non ci sarebbero mai arrivate', () => {
    // sopra ciascuna c'\u2019\u00e8 meno spazio di quanto sia lunga (800 contro 1200):
    // spostare un pezzo alla volta non serve a niente
    const su = risalgono(ponte, 0, 0);
    const stretti = su.lastre[0].piazzamenti
      .filter((p) => p.nome.startsWith('Stretto'))
      .sort((a, b) => a.y - b.y);
    expect(stretti.map((p) => p.y)).toEqual([0, 1200]);
  });

  it('e il rotolo torna a lasciarsi spezzare', () => {
    const s = segmentaBobina(risalgono(ponte, 0, 0).lastre[0], 3000, 0, 1830, 0);
    expect(s.every((x) => !x.oltreMassimo)).toBe(true);
    for (const x of s) expect(x.fine - x.inizio).toBeLessThanOrEqual(3000);
  });

  it('nessuno scavalca nessuno e il materiale non cresce mai', () => {
    const su = risalgono(ponte, 0, 0);
    const p = su.lastre[0].piazzamenti;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        expect(
          p[i].x + p[i].larghezza <= p[j].x + 1e-9 ||
            p[j].x + p[j].larghezza <= p[i].x + 1e-9 ||
            p[i].y + p[i].altezza <= p[j].y + 1e-9 ||
            p[j].y + p[j].altezza <= p[i].y + 1e-9
        ).toBe(true);
    const fine = (e: EsitoNesting) =>
      e.lastre[0].piazzamenti.reduce((f, x) => Math.max(f, x.y + x.altezza), 0);
    expect(fine(su)).toBeLessThanOrEqual(fine(ponte));
  });

  it('la lama resta fra i pezzi e il margine di testa non si invade', () => {
    const su = risalgono(ponte, 3, 10);
    const stretti = su.lastre[0].piazzamenti
      .filter((p) => p.nome.startsWith('Stretto'))
      .sort((a, b) => a.y - b.y);
    expect(stretti[0].y).toBe(10);
    expect(stretti[1].y).toBe(10 + 1200 + 3);
  });
});

/**
 * LO SFRIDO SU LASTRA DEVE ESSERE RETTANGOLARE.
 *
 * Cinque colonne piene e, sotto, due pezzetti soli: in materiale non costano
 * niente, ma mordono l'avanzo e da un rettangolo alto 74 cm ne fanno uno alto
 * 55 più uno scalino che si butta. Quei pezzetti stanno benissimo su una
 * lastra già aperta, tutti insieme.
 */
describe('forma dello sfrido sulle lastre', () => {
  const par = {
    lastra: { larghezza: 1500, altezza: 3050 },
    lama: 3,
    abbondanza: 0,
    margine: 10
  };

  const p = (nome: string, l: number, a: number, q: number): PezzoNesting => ({
    id: nome,
    nome,
    larghezza: l,
    altezza: a,
    quantita: q,
    ruotabile: true,
    tinta: 0
  });

  /** il ritaglio rettangolare che avanza da ogni lastra */
  const ritagli = (e: EsitoNesting) =>
    e.lastre.map((l) => {
      const r = strisciaResidua(l, par.lastra.larghezza, par.lastra.altezza);
      return r ? r.larghezza * r.lunghezza : 0;
    });

  // dieci colonne alte (cinque per lastra, esatte) e tre pezzetti
  const lista = [
    p('Lato 1 B', 290, 2300, 5),
    p('Lato 3 B', 290, 2300, 5),
    p('Lato 1 D', 290, 185, 1),
    p('Lato 2 D', 290, 185, 1),
    p('Lato 3 D', 290, 185, 1)
  ];

  it('i pezzetti si raccolgono e una lastra resta con l’avanzo intero', () => {
    const e = calcolaNestingMigliore(par, lista, { sfridoRettangolare: true });
    // una lastra conserva il rettangolo pieno: tutta la larghezza per l'altezza
    // che avanza sotto le colonne
    const pulita = e.lastre.find(
      (l) => !l.piazzamenti.some((pc) => pc.altezzaFinita === 185)
    );
    expect(pulita).toBeDefined();
    const r = strisciaResidua(pulita!, par.lastra.larghezza, par.lastra.altezza);
    expect(r!.larghezza).toBe(1500);
    expect(r!.lunghezza).toBeGreaterThan(700);
  });

  it('l’avanzo recuperabile cresce rispetto a non guardarlo affatto', () => {
    const somma = (e: EsitoNesting) => ritagli(e).reduce((a, b) => a + b, 0);
    const senza = calcolaNestingMigliore(par, lista);
    const con = calcolaNestingMigliore(par, lista, { sfridoRettangolare: true });
    expect(somma(con)).toBeGreaterThan(somma(senza));
  });

  it('non apre mai una lastra in più per fare bella figura', () => {
    const senza = calcolaNestingMigliore(par, lista);
    const con = calcolaNestingMigliore(par, lista, { sfridoRettangolare: true });
    expect(con.lastre.length).toBe(senza.lastre.length);
    const conta = (e: EsitoNesting) => e.lastre.reduce((n, l) => n + l.piazzamenti.length, 0);
    expect(conta(con)).toBe(conta(senza));
  });

  it('i pezzi restano dentro la lastra e non si sovrappongono', () => {
    const e = calcolaNestingMigliore(par, lista, { sfridoRettangolare: true });
    for (const l of e.lastre) {
      for (const pc of l.piazzamenti) {
        expect(pc.x).toBeGreaterThanOrEqual(par.margine - 1e-9);
        expect(pc.y).toBeGreaterThanOrEqual(par.margine - 1e-9);
        expect(pc.x + pc.larghezza).toBeLessThanOrEqual(1500 - par.margine + par.lama + 1e-9);
        expect(pc.y + pc.altezza).toBeLessThanOrEqual(3050 - par.margine + par.lama + 1e-9);
      }
      for (let i = 0; i < l.piazzamenti.length; i++)
        for (let j = i + 1; j < l.piazzamenti.length; j++) {
          const a = l.piazzamenti[i];
          const b = l.piazzamenti[j];
          expect(
            a.x + a.larghezza <= b.x + 1e-9 ||
              b.x + b.larghezza <= a.x + 1e-9 ||
              a.y + a.altezza <= b.y + 1e-9 ||
              b.y + b.altezza <= a.y + 1e-9
          ).toBe(true);
        }
    }
  });

  it('ogni copia resta una sola: raccogliere non duplica né perde niente', () => {
    const e = calcolaNestingMigliore(par, lista, { sfridoRettangolare: true });
    const chiavi = e.lastre.flatMap((l) => l.piazzamenti.map((pc) => pc.chiave));
    expect(new Set(chiavi).size).toBe(chiavi.length);
    expect(chiavi).toHaveLength(13);
  });
});
