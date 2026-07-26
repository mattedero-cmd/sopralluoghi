import { describe, expect, it } from 'vitest';
import {
  calcolaNesting,
  passoGriglia,
  lunghezzaUsata,
  riepilogaNesting,
  type ParametriNesting,
  type PezzoNesting
} from '../nesting';

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
      pezzo({ id: 'a', larghezza: 400, altezza: 200, quantita: 1, ruotabile: false })
    ]);
    expect(libero.lastre[0].piazzamenti[0].ruotato).toBe(false);
    expect(libero.lastre[0].piazzamenti[0].larghezza).toBe(400);

    const imposto = calcolaNesting({ ...PIANA, orientamenti: { 'a#0': true } }, [
      pezzo({ id: 'a', larghezza: 400, altezza: 200, quantita: 1, ruotabile: false })
    ]);
    const pc = imposto.lastre[0].piazzamenti[0];
    expect(pc.ruotato).toBe(true);
    // l'ingombro è scambiato, la misura finita no
    expect(pc.larghezza).toBe(200);
    expect(pc.altezza).toBe(400);
    expect(pc.larghezzaFinita).toBe(400);
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
      pezzo({ id: 'c', larghezza: 300, altezza: 150, quantita: 3, ruotabile: false })
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
