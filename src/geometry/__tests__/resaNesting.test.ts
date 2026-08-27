import { describe, expect, it } from 'vitest';
import { calcolaNestingSagome } from '../nestingSagome';
import { areaForma } from '../sagome';
import type { FormaPezzo } from '../sagome';
import type { ParametriNesting, PezzoNesting } from '../nesting';

/**
 * LA RETE DI SICUREZZA SULLA RESA.
 *
 * Il materiale pesa: ogni punto di resa perso è pellicola buttata, e una
 * modifica al motore può peggiorare l'impacchettamento senza rompere nessun
 * test di correttezza — nessuna sovrapposizione, nessuno scarto, e intanto
 * mezzo metro di rotolo in più.
 *
 * Qui stanno liste di cantiere vere, con la resa che il motore raggiunge
 * oggi. Le soglie sono un paio di punti sotto: servono a fermare un
 * peggioramento, non a fotografare la disposizione (che può cambiare
 * legittimamente). Se una soglia salta, la domanda giusta è «quanto materiale
 * costa questa modifica»; se invece il motore migliora, si alzano le soglie.
 *
 * La resa è misurata sul materiale DAVVERO consumato — la lunghezza occupata
 * per la larghezza del supporto — contro l'area geometrica vera dei pezzi.
 */

const pz = (
  id: string,
  forma: FormaPezzo | undefined,
  d1: number,
  d2: number,
  d3: number | undefined,
  quantita: number
): PezzoNesting => ({
  id,
  nome: id,
  forma,
  larghezza: d1,
  altezza: forma === 'cerchio' ? d1 : d2,
  misura3: d3,
  quantita,
  ruotabile: true,
  tinta: 0
});

/** resa in percentuale e metri di supporto consumati */
function resaDi(par: ParametriNesting, pezzi: PezzoNesting[]) {
  const esito = calcolaNestingSagome(par, pezzi);
  const areaPezzi = pezzi.reduce((a, p) => a + areaForma(p) * p.quantita, 0);
  let consumato = 0;
  let metri = 0;
  for (const l of esito.lastre) {
    let piuGiu = 0;
    for (const pc of l.piazzamenti) piuGiu = Math.max(piuGiu, pc.y + pc.altezza);
    consumato += (piuGiu + par.margine) * par.lastra.larghezza;
    metri += (piuGiu + par.margine) / 1000;
  }
  return {
    resa: consumato > 0 ? (areaPezzi / consumato) * 100 : 0,
    metri,
    lastre: esito.lastre.length,
    scartati: esito.scartati.length
  };
}

const bobina = (larghezza: number, extra: Partial<ParametriNesting> = {}): ParametriNesting => ({
  lastra: { larghezza, altezza: 40000 },
  lama: 3,
  abbondanza: 0,
  margine: 10,
  massimoLastre: 1,
  ...extra
});

const lastra = (larghezza: number, altezza: number, extra: Partial<ParametriNesting> = {}): ParametriNesting => ({
  lastra: { larghezza, altezza },
  lama: 3,
  abbondanza: 0,
  margine: 10,
  ...extra
});

const LISTE: Array<{
  nome: string;
  par: ParametriNesting;
  pezzi: PezzoNesting[];
  resaMinima: number;
}> = [
  {
    // la lista che ha fatto venire fuori il triangolo per ingombro
    nome: 'rettangoli, rombi e triangoli storti su bobina da 122',
    par: bobina(1220),
    pezzi: [
      pz('rett', undefined, 700, 820, undefined, 2),
      pz('rombo', 'rombo', 753.8, 597.1, undefined, 2),
      pz('tri', 'triangoloL', 794.7, 620, 560, 6)
    ],
    resaMinima: 65
  },
  {
    nome: 'finestre sotto falda su lastra',
    par: lastra(1300, 1250, { margine: 0 }),
    pezzi: [pz('falda', 'trapezioR', 600, 400, 800, 4), pz('ob', 'cerchio', 300, 300, undefined, 2)],
    resaMinima: 79
  },
  {
    nome: 'misto di cantiere su bobina da 152',
    par: bobina(1520, { abbondanza: 20 }),
    pezzi: [
      pz('v1', undefined, 900, 1400, undefined, 3),
      pz('falda', 'trapezioR', 800, 500, 1100, 4),
      pz('tri', 'triangoloL', 900, 750, 600, 4),
      pz('tz', 'trapezio', 700, 400, 300, 3),
      pz('ob', 'cerchio', 420, 420, undefined, 2),
      pz('ro', 'rombo', 600, 500, undefined, 2)
    ],
    // 73,8% coi soli quarti, 78,9% scegliendo il verso delle famiglie pesanti
    resaMinima: 77
  },
  {
    nome: 'soli triangoli storti su bobina da 91,5',
    par: bobina(915),
    pezzi: [pz('tri', 'triangoloL', 800, 700, 500, 8)],
    resaMinima: 77
  },
  {
    nome: 'falde piccole e fitte, con abbondanza',
    par: bobina(1220, { abbondanza: 10 }),
    pezzi: [
      pz('f', 'trapezioR', 450, 300, 520, 12),
      pz('r', undefined, 380, 300, undefined, 8)
    ],
    // 69% coi soli quarti, 80,5% con le falde tutte parallele fra loro
    resaMinima: 78
  },
  {
    nome: 'tanti pezzetti su bobina stretta',
    par: bobina(915, { abbondanza: 5 }),
    pezzi: [
      pz('a', undefined, 200, 300, undefined, 20),
      pz('b', 'triangoloL', 260, 220, 180, 15),
      pz('c', 'cerchio', 150, 150, undefined, 10)
    ],
    resaMinima: 73
  },
  {
    nome: 'trapezi isosceli su lastra larga',
    par: lastra(2000, 1000, { margine: 0 }),
    pezzi: [pz('tz', 'trapezio', 700, 450, 400, 6)],
    resaMinima: 80
  },
  {
    nome: 'falde e fasce a tutta bobina',
    par: bobina(1220),
    pezzi: [
      pz('fascia', undefined, 1200, 400, undefined, 3),
      pz('f', 'trapezioR', 700, 450, 900, 5)
    ],
    // 67% coi soli quarti di giro, 73% appoggiando le falde su un fianco
    resaMinima: 71
  },
  {
    // il caso che chiedeva gli angoli obliqui: due rombi affiancati non
    // stanno nel loro riquadro, appoggiati su un lato sì
    nome: 'rombi e cerchi su lastra',
    par: lastra(1300, 2500),
    pezzi: [
      pz('ro', 'rombo', 754, 597, undefined, 4),
      pz('ob', 'cerchio', 350, 350, undefined, 4)
    ],
    resaMinima: 64
  },
  {
    // la seconda schermata del cantiere: dieci rombi, quattro trapezi, due
    // rettangoli e un oblò. È qui che si vede se i rombi tassellano
    nome: 'rombi, trapezi e rettangoli su bobina da 122',
    par: bobina(1220),
    pezzi: [
      pz('r', undefined, 700, 820, undefined, 2),
      pz('ro', 'rombo', 753.8, 597.1, undefined, 10),
      pz('tz', 'trapezioR', 450, 950, 750, 4),
      pz('c', 'cerchio', 290, 290, undefined, 1)
    ],
    resaMinima: 71
  },
  {
    // dieci rombi da soli: in piedi sulla punta 3,24 m, appoggiati 2,38
    nome: 'soli rombi su bobina da 122',
    par: bobina(1220),
    pezzi: [pz('ro', 'rombo', 753.8, 597.1, undefined, 10)],
    resaMinima: 75
  },
  {
    // la terza schermata del cantiere: rombi e triangoli storti insieme,
    // con una colonna di rettangoli di fianco
    nome: 'rombi, triangoli storti e rettangoli',
    par: bobina(1220),
    pezzi: [
      pz('r', undefined, 700, 820, undefined, 6),
      pz('ro', 'rombo', 753.8, 597.1, undefined, 10),
      pz('tri', 'triangoloL', 794.7, 675.2, 558.2, 4),
      pz('c', 'cerchio', 290, 290, undefined, 1)
    ],
    resaMinima: 65
  },
  {
    // LA LISTA DEL CANTIERE: dieci copie di ognuna delle cinque forme, su
    // bobina da 152. È quella su cui si è visto che scegliere il verso di UNA
    // famiglia non basta: ci vogliono i trapezi e i rombi decisi insieme
    nome: 'dieci per forma su bobina da 152',
    par: bobina(1520),
    pezzi: [
      pz('rett', undefined, 700, 820, undefined, 10),
      pz('cer', 'cerchio', 290, 290, undefined, 10),
      pz('tz', 'trapezioR', 450, 950, 750, 10),
      pz('tri', 'triangoloL', 794.7, 675.2, 558.2, 10),
      pz('ro', 'rombo', 753.8, 597.1, undefined, 10)
    ],
    resaMinima: 82
  }
];

describe('resa del nesting a sagome — soglie da non scendere', () => {
  for (const L of LISTE) {
    it(L.nome, () => {
      const r = resaDi(L.par, L.pezzi);
      // prima di tutto: niente resta fuori. Una resa alta ottenuta scartando
      // pezzi non sarebbe una resa, sarebbe un lavoro non fatto
      expect(r.scartati).toBe(0);
      expect(r.resa).toBeGreaterThanOrEqual(L.resaMinima);
    });
  }

  it('la lista del cantiere non deve tornare a mangiare rotolo', () => {
    // 2 rettangoli, 2 rombi e 6 triangoli storti: coi triangoli nestati per
    // ingombro erano 5,24 m di bobina, con la forma vera 3,21 m
    const L = LISTE[0];
    expect(resaDi(L.par, L.pezzi).metri).toBeLessThanOrEqual(3.4);
  });

  it('quattro finestre sotto falda stanno su una lastra sola', () => {
    const r = resaDi(lastra(1300, 1250, { margine: 0 }), [
      pz('falda', 'trapezioR', 600, 400, 800, 4)
    ]);
    expect(r.lastre).toBe(1);
    expect(r.scartati).toBe(0);
  });
});
