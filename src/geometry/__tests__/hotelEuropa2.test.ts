import { describe, expect, it } from 'vitest';
import { aIngombro, calcolaNestingAuto, calcolaNestingSagome } from '../nestingSagome';
import { calcolaNestingMigliore } from '../nesting';
import { sovrapposizioni } from '../controlloPiano';
import { improntaForma, sagomaSpeculare } from '../sagome';
import { giuntiAutomatici, teliDelPezzo } from '../pannelli';
import { sagomaPoligonoQuotato } from '../poligonoQuotato';
import type { PezzoNesting } from '../nesting';
import type { QuotaPoligono } from '../../db/types';

/**
 * «PIANO RIFATTO A INGOMBRI», E NESSUNO SAPEVA PERCHÉ.
 *
 * Il piano di taglio delle camere dell'hotel — 115 pezzi su sei bobine da
 * 1370 — si rifiutava di uscire a sagoma reale: il controllo trovava pezzi
 * sovrapposti, il motore ripiegava sui rettangoli d'ingombro e l'app chiedeva
 * di segnalare il difetto. Eccolo segnalato, e messo sotto prova.
 *
 * LA CAUSA era la cache delle maschere del motore di piazzamento. La chiave
 * era «forma|larghezza|altezza|misura3», cioè il RIQUADRO — e una sagoma
 * descritta per vertici non è il suo riquadro. Il telo di una parete e quello
 * della parete specchiata hanno sempre lo stesso riquadro ed sono uno il
 * rovescio dell'altro: la cache serviva la maschera di quella sbagliata, il
 * motore riservava il posto di una sagoma e ne appoggiava un'altra. Due teli
 * del pentagono finivano alla STESSA coordinata, uno dentro l'altro di
 * settantotto centimetri.
 *
 * Due pezzi bastano a farlo vedere, ed è la prima prova qui sotto; la lista
 * vera dell'hotel è l'ultima, perché un difetto trovato su un lavoro va
 * tenuto fermo con quel lavoro.
 */

const quad = (id: string, v: Array<[number, number]>, q = 1): PezzoNesting => ({
  id,
  nome: id,
  larghezza: Math.max(...v.map((p) => p[0])),
  altezza: Math.max(...v.map((p) => p[1])),
  vertici: v,
  forma: 'quad',
  quantita: q,
  ruotabile: true,
  tinta: 0
});

/** una parete sotto falda e la sua specchiata: stesso riquadro, forme opposte */
const FALDA: Array<[number, number]> = [[0, 0], [300, 0], [900, 400], [900, 2000], [0, 2000]];
const SPECCHIO: Array<[number, number]> = FALDA.map(
  ([x, y]): [number, number] => [900 - x, y]
).reverse();

const BOBINA = {
  lastra: { larghezza: 1000, altezza: 20000 },
  lama: 0,
  abbondanza: 0,
  margine: 10,
  massimoLastre: 1
};

describe('una sagoma e la sua specchiata', () => {
  it('hanno lo stesso riquadro ma non sono lo stesso pezzo', () => {
    const a = quad('A', FALDA);
    const b = quad('B', SPECCHIO);
    expect(b.larghezza).toBe(a.larghezza);
    expect(b.altezza).toBe(a.altezza);
    // è questo che la cache delle maschere deve saper distinguere
    expect(improntaForma(b)).not.toBe(improntaForma(a));
  });

  it('non finiscono una sopra l’altra', () => {
    const lista = [quad('A', FALDA), quad('B', SPECCHIO)];
    const e = calcolaNestingSagome(BOBINA, lista);
    for (const l of e.lastre) {
      expect(sovrapposizioni(l, 0), JSON.stringify(sovrapposizioni(l, 0))).toHaveLength(0);
    }
  });

  it('e il piano esce a sagoma reale, senza ripiegare sugli ingombri', () => {
    const lista = [quad('A', FALDA), quad('B', SPECCHIO)];
    expect(calcolaNestingAuto(BOBINA, lista).ripiego).toBeUndefined();
  });

  it('anche in più copie', () => {
    for (const q of [2, 3, 4]) {
      const lista = [quad('A', FALDA, q), quad('B', SPECCHIO, q)];
      expect(calcolaNestingAuto(BOBINA, lista).ripiego, `${q} copie`).toBeUndefined();
    }
  });
});

/* ────────────────────── la lista vera delle camere ────────────────────── */

/** la distinta stampata nel piano: «copie;nome;larghezza×altezza[|terza]» */
const DISTINTA = [
  '1;A1 Trapezio.a;1350×3060|2563.8', '1;A1 Trapezio.b;1350×2567.5|2071.2',
  '1;A1 Trapezio.c;1020×2074.9|1700', '1;C1 Trapezio.a;1350×1690|2093.3',
  '1;C1 Trapezio.b;1350×2090.3|2493.6', '1;C1 Trapezio.c;500×2490.6|2640',
  '1;D1 Rettangolo.a;1350×3500', '1;D1 Rettangolo.b;1350×3500',
  '1;D1 Rettangolo.c;240×3500', '2;E1 Rettangolo.a;1350×2600',
  '2;E1 Rettangolo.b;1350×2600', '2;E1 Rettangolo.c;820×2600',
  '1;K1 Rettangolo.a;1350×2920', '1;K1 Rettangolo.b;1350×2920',
  '1;K1 Rettangolo.c;1020×2920', '2;L1 Rettangolo.a;1350×2400',
  '2;L1 Rettangolo.b;1350×2400', '2;L1 Rettangolo.c;1350×2400',
  '2;L1 Rettangolo.d;730×2400', '2;N1 Rettangolo.a;1350×2400',
  '2;N1 Rettangolo.b;1350×2400', '2;N1 Rettangolo.c;1350×2400',
  '2;N1 Rettangolo.d;220×2400', '1;P1 Rettangolo.a;1350×2400',
  '1;P1 Rettangolo.b;1350×2400', '1;P1 Rettangolo.c;1270×2400',
  '1;Q1 Rettangolo.a;1350×3030', '1;Q1 Rettangolo.b;1350×3030',
  '1;Q1 Rettangolo.c;1100×3030', '1;R1 Rettangolo.a;1350×2760',
  '1;R1 Rettangolo.b;1350×2760', '1;R1 Rettangolo.c;890×2760',
  '4;S1 Rettangolo.a;1350×3020', '4;S1 Rettangolo.b;1350×3020',
  '4;S1 Rettangolo.c;1350×3020', '4;S1 Rettangolo.d;110×3020',
  '2;W1 Rettangolo.a;1350×2770', '2;W1 Rettangolo.b;1350×2770',
  '2;W1 Rettangolo.c;700×2770', '1;Y1 Rettangolo.a;1350×2720',
  '1;Y1 Rettangolo.b;1350×2720', '1;Y1 Rettangolo.c;510×2720',
  '1;Z1 Rettangolo.a;1350×3030', '1;Z1 Rettangolo.b;1350×3030',
  '1;Z1 Rettangolo.c;690×3030', '1;AA1 Rettangolo.a;1350×2750',
  '1;AA1 Rettangolo.b;1350×2750', '1;AA1 Rettangolo.c;180×2750',
  '3;AB1 Rettangolo.a;1350×2560', '3;AB1 Rettangolo.b;1350×2560',
  '3;AB1 Rettangolo.c;290×2560', '1;AE1 Rettangolo.a;1350×1840',
  '1;AE1 Rettangolo.b;780×1840', '1;AE2 Rettangolo;1000×1840',
  '1;AF1 Rettangolo.a;1350×2620', '1;AF1 Rettangolo.b;1350×2620',
  '1;AF1 Rettangolo.c;1350×2620', '1;AF1 Rettangolo.d;1350×2620',
  '1;AF1 Rettangolo.e;770×2620', '1;AG1 Rettangolo.a;1350×2930',
  '1;AG1 Rettangolo.b;1350×2930', '1;AG1 Rettangolo.c;1130×2930',
  '1;AG2 Rettangolo.a;1350×2930', '1;AG2 Rettangolo.b;260×2930',
  '1;AH1 Rettangolo.a;1350×2690', '1;AH1 Rettangolo.b;1350×2690',
  '1;AH1 Rettangolo.c;670×2690', '1;AI1 Rettangolo.a;1350×2930',
  '1;AI1 Rettangolo.b;1350×2930', '1;AI1 Rettangolo.c;1350×2930',
  '1;AI1 Rettangolo.d;120×2930'
];

const FOTO = { scala: { px: 1, reale: 1, unita: 'cm' as const }, piano: null };
/** la parete sotto falda della camera: montante 345, soffitto 70, montante 224 */
const MURO: Array<[number, number]> = [[0, 0], [70, 0], [400, 121], [400, 345], [0, 345]];
const QUOTE: Record<string, number> = { '0-1': 70, '2-3': 224, '3-4': 400, '4-0': 345 };

/** la polilinea come l'avrebbe disegnata partendo dal vertice `da` */
function pareteDisegnata(da: number, verso: 1 | -1): QuotaPoligono {
  const idx: number[] = [];
  for (let k = 0; k < 5; k++) idx.push((((da + verso * k) % 5) + 5) % 5);
  const segmenti: Array<{ da: number; a: number; valore: number }> = [];
  for (let k = 0; k < 5; k++) {
    const v = QUOTE[`${idx[k]}-${idx[(k + 1) % 5]}`] ?? QUOTE[`${idx[(k + 1) % 5]}-${idx[k]}`];
    if (v !== undefined) segmenti.push({ da: k, a: (k + 1) % 5, valore: v });
  }
  return {
    id: 'g1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 0,
    punti: idx.map((i) => ({ x: MURO[i][0], y: MURO[i][1] })),
    segmenti,
    unita: 'cm',
    stato: 'reale',
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
  } as unknown as QuotaPoligono;
}

/** il pentagono in millimetri, come lo ricostruisce l'app */
function pentagono(da = 0, verso: 1 | -1 = 1) {
  const s = sagomaPoligonoQuotato(pareteDisegnata(da, verso), FOTO, false);
  if (!s) throw new Error('la parete non si ricostruisce');
  return {
    forma: s.forma,
    larghezza: s.larghezza * 10,
    altezza: s.altezza * 10,
    vertici: (s.vertici ?? []).map(([x, y]): [number, number] => [x * 10, y * 10])
  };
}

/** i teli del pentagono, divisi come li divide il programma su bobina 1370 */
function teliPentagono(specchio: boolean, da = 0, verso: 1 | -1 = 1): PezzoNesting[] {
  const base = pentagono(da, verso);
  const pezzo = specchio ? sagomaSpeculare(base) : base;
  const giunti = giuntiAutomatici(pezzo.larghezza, {
    massimo: 1350,
    sormonto: 10,
    modo: 'fascia',
    verso: 'centro'
  });
  return teliDelPezzo(pezzo, { asse: 'verticale', sormonto: 10, verso: 'centro', giunti }).map(
    (t, i) => ({
      id: `pent${specchio ? 'S' : ''}${i}`,
      nome: `${specchio ? 'G1.2% ' : 'G1 '}Pentagono.${'abcde'[i]}`,
      larghezza: t.larghezza,
      altezza: t.altezza,
      misura3: t.misura3,
      vertici: t.vertici,
      forma: t.forma,
      quantita: 2,
      ruotabile: true,
      tinta: i * 40
    })
  );
}

/** tutta la lista delle camere: i rettangoli e i trapezi della distinta, più i teli */
function listaCamere(da = 0, verso: 1 | -1 = 1): PezzoNesting[] {
  const altri = DISTINTA.map((riga, i) => {
    const [q, nome, mis] = riga.split(';');
    const [riquadro, m3] = mis.split('|');
    const [l, a] = riquadro.split('×').map(Number);
    return {
      id: `p${i}`,
      nome,
      larghezza: l,
      altezza: a,
      misura3: m3 === undefined ? undefined : Number(m3),
      forma: m3 === undefined ? ('rett' as const) : ('trapezioR' as const),
      quantita: Number(q),
      ruotabile: true,
      tinta: (i * 37) % 360
    };
  });
  return [...altri, ...teliPentagono(false, da, verso), ...teliPentagono(true, da, verso)];
}

/** i parametri scritti in testa al suo PDF */
const CAMERE = {
  lastra: { larghezza: 1370, altezza: 50000 },
  lama: 0,
  abbondanza: 0,
  margine: 10,
  massimoLastre: 10
};

describe('le camere dell’hotel, seconda versione', () => {
  it('è la lista giusta: 115 copie', () => {
    const copie = listaCamere().reduce((s, p) => s + p.quantita, 0);
    expect(copie).toBe(115);
  });

  it('il piano esce a sagoma reale, da qualunque spigolo sia partito il disegno', () => {
    for (let da = 0; da < 5; da++) {
      for (const verso of [1, -1] as const) {
        const e = calcolaNestingAuto(CAMERE, listaCamere(da, verso));
        expect(e.ripiego, `disegnando dal vertice ${da} verso ${verso}`).toBeUndefined();
      }
    }
  });

  it('e costa meno materiale del ripiego a ingombri', () => {
    const lista = listaCamere();
    const sagome = calcolaNestingSagome(CAMERE, lista);
    const ingombri = calcolaNestingMigliore(CAMERE, lista.map(aIngombro));
    const metri = (e: { lastre: Array<{ piazzamenti: Array<{ y: number; altezza: number }> }> }) =>
      e.lastre.reduce(
        (s, l) => s + Math.max(0, ...l.piazzamenti.map((p) => p.y + p.altezza)) / 1000,
        0
      );
    const aSagoma = metri(sagome);
    const aRiquadro = metri(ingombri);
    console.log(
      `a sagoma reale: ${sagome.lastre.length} bobine, ${aSagoma.toFixed(2)} m · ` +
        `a ingombri: ${ingombri.lastre.length} bobine, ${aRiquadro.toFixed(2)} m · ` +
        `risparmio ${(aRiquadro - aSagoma).toFixed(2)} m`
    );
    // il motore a sagome esiste per questo: deve consumare meno
    expect(aSagoma).toBeLessThan(aRiquadro);
  });

  it('e nessuna bobina ha due pezzi nello stesso posto', () => {
    const e = calcolaNestingSagome(CAMERE, listaCamere());
    for (const l of e.lastre) {
      const rotte = sovrapposizioni(l, 0);
      expect(rotte, JSON.stringify(rotte.slice(0, 3))).toHaveLength(0);
    }
  });
});
