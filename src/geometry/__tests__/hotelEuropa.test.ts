import { describe, expect, it } from 'vitest';
import { calcolaNestingAuto } from '../nestingSagome';
import { sovrapposizioni } from '../controlloPiano';
import { penetrazione, sagomaDi } from '../distanzaPoligoni';
import type { PezzoNesting } from '../nesting';

/**
 * IL LAVORO VERO CHE HA SCOPERTO IL DIFETTO.
 *
 * «Taglio — Camere hotel Europa»: 201 pezzi su bobina da 1370, lama 0,
 * margine 10. Nel PDF uscito dall'app un trapezio era stampato SOPRA un
 * rettangolo — stesso angolo, stesse coordinate — e nessun controllo se n'era
 * accorto, perché con la lama a zero si spegnevano da soli (vedi lamaZero).
 *
 * La distinta è quella vera, copiata dal PDF del cantiere. Non si verifica
 * COME il motore impagina — quello può migliorare quando vuole — ma che il
 * piano che ne esce si possa tagliare: nessun pezzo dentro un altro.
 */

/** la distinta del cantiere: «nome misura xQuantità» */
const DISTINTA = [
  'A1 Quadrilatero.a 1350×1700 x1',
  'A1 Quadrilatero.b 1350×1700 x1',
  'A1 Quadrilatero.c 1020×1700 x1',
  'C1 Trapezio.a 1350×1690|2093.3 x1',
  'C1 Trapezio.b 1350×2090.3|2493.6 x1',
  'C1 Trapezio.c 500×2490.6|2640 x1',
  'D1 Rettangolo.a 1350×3500 x1',
  'D1 Rettangolo.b 1350×3500 x1',
  'D1 Rettangolo.c 240×3500 x1',
  'E1 Rettangolo.a 1350×2600 x2',
  'E1 Rettangolo.b 1350×2600 x2',
  'E1 Rettangolo.c 820×2600 x2',
  'G1 Pentagono.a 1350×3450 x2',
  'G1 Pentagono.b 1350×3450 x2',
  'G1 Pentagono.c 1320×3450 x2',
  'G1.2% Pentagono.a 1350×3450 x2',
  'G1.2% Pentagono.b 1350×3450 x2',
  'G1.2% Pentagono.c 1320×3450 x2',
  'K1 Rettangolo.a 1350×2920 x1',
  'K1 Rettangolo.b 1350×2920 x1',
  'K1 Rettangolo.c 1020×2920 x2',
  'L1 Rettangolo.a 1350×2400 x4',
  'L1 Rettangolo.b 1350×2400 x4',
  'L1 Rettangolo.c 1350×2400 x4',
  'L1 Rettangolo.d 730×2400 x4',
  'N1 Rettangolo.a 1350×2400 x4',
  'N1 Rettangolo.b 1350×2400 x4',
  'N1 Rettangolo.c 1350×2400 x4',
  'N1 Rettangolo.d 220×2400 x4',
  'P1 Rettangolo.a 1350×2400 x2',
  'P1 Rettangolo.b 1350×2400 x2',
  'P1 Rettangolo.c 1270×2400 x2',
  'Q1 Rettangolo.a 1350×3030 x2',
  'Q1 Rettangolo.b 1350×3030 x2',
  'Q1 Rettangolo.c 1100×3030 x2',
  'R1 Rettangolo.a 1350×2760 x2',
  'R1 Rettangolo.b 1350×2760 x2',
  'R1 Rettangolo.c 890×2760 x2',
  'S1 Rettangolo.a 1350×3020 x8',
  'S1 Rettangolo.b 1350×3020 x8',
  'S1 Rettangolo.c 1350×3020 x8',
  'S1 Rettangolo.d 110×3020 x8',
  'W1 Rettangolo.a 1350×2770 x4',
  'W1 Rettangolo.b 1350×2770 x4',
  'W1 Rettangolo.c 700×2770 x4',
  'Y1 Rettangolo.a 1350×2720 x2',
  'Y1 Rettangolo.b 1350×2720 x2',
  'Y1 Rettangolo.c 510×2720 x2',
  'Z1 Rettangolo.a 1350×3030 x2',
  'Z1 Rettangolo.b 1350×3030 x2',
  'Z1 Rettangolo.c 690×3030 x2',
  'AA1 Rettangolo.a 1350×2750 x2',
  'AA1 Rettangolo.b 1350×2750 x2',
  'AA1 Rettangolo.c 180×2750 x2',
  'AB1 Rettangolo.a 1350×2560 x6',
  'AB1 Rettangolo.b 1350×2560 x6',
  'AB1 Rettangolo.c 290×2560 x6',
  'AE1 Rettangolo.a 1350×1840 x2',
  'AE1 Rettangolo.b 780×1840 x2',
  'AE2 Rettangolo 1000×1840 x2',
  'AF1 Rettangolo.a 1350×2620 x2',
  'AF1 Rettangolo.b 1350×2620 x2',
  'AF1 Rettangolo.c 1350×2620 x2',
  'AF1 Rettangolo.d 1350×2620 x2',
  'AF1 Rettangolo.e 770×2620 x2',
  'AG1 Rettangolo.a 1350×2930 x2',
  'AG1 Rettangolo.b 1350×2930 x2',
  'AG1 Rettangolo.c 1130×2930 x2',
  'AG2 Rettangolo.a 1350×2930 x2',
  'AG2 Rettangolo.b 260×2930 x2',
  'AH1 Rettangolo.a 1350×2690 x2',
  'AH1 Rettangolo.b 1350×2690 x2',
  'AH1 Rettangolo.c 670×2690 x2',
  'AI1 Rettangolo.a 1350×2930 x2',
  'AI1 Rettangolo.b 1350×2930 x2',
  'AI1 Rettangolo.c 1350×2930 x2',
  'AI1 Rettangolo.d 120×2930 x2'
];

function pezzi(): PezzoNesting[] {
  return DISTINTA.map((riga, i) => {
    const m = riga.match(/^(.*) ([\d.]+)×([\d.]+)(?:\|([\d.]+))? x(\d+)$/);
    if (!m) throw new Error(`riga non letta: ${riga}`);
    const [, nome, l, a, m3, q] = m;
    return {
      id: `p${i}`,
      nome,
      larghezza: Number(l),
      altezza: Number(a),
      misura3: m3 === undefined ? undefined : Number(m3),
      forma: m3 === undefined ? ('rett' as const) : ('trapezioR' as const),
      quantita: Number(q),
      ruotabile: true,
      tinta: (i * 37) % 360
    };
  });
}

const PAR = {
  lastra: { larghezza: 1370, altezza: 50000 },
  lama: 0,
  abbondanza: 0,
  margine: 10,
  massimoLastre: 10
};

describe('Camere hotel Europa, 201 pezzi senza lama', () => {
  const esito = calcolaNestingAuto(PAR, pezzi());

  it('i pezzi ci sono tutti e stanno su dieci bobine', () => {
    const piazzati = esito.lastre.reduce((s, l) => s + l.piazzamenti.length, 0);
    expect(piazzati + esito.scartati.length).toBe(201);
  });

  it('il piano è quello vero, non il ripiego sugli ingombri', () => {
    // quando il motore si accorge di un piano rotto ripiega sui rettangoli
    // d'ingombro: è la rete di sicurezza, non il risultato. Se questo
    // controllo cade vuol dire che il piano a sagome è tornato a rompersi,
    // e il test qui sotto non se ne accorgerebbe perché guarda il ripiego
    expect(esito.ripiego).toBeUndefined();
  });

  it('nessun pezzo finisce dentro un altro', () => {
    for (const [i, l] of esito.lastre.entries()) {
      const sagome = l.piazzamenti.map((p) => sagomaDi(p));
      for (let a = 0; a < sagome.length; a++) {
        for (let b = a + 1; b < sagome.length; b++) {
          const dentro = penetrazione(sagome[a], sagome[b]);
          expect(
            dentro,
            `bobina ${i + 1}: «${l.piazzamenti[a].nome}» e «${l.piazzamenti[b].nome}» si accavallano di ${dentro.toFixed(1)} mm`
          ).toBeLessThan(0.05);
        }
      }
    }
  });

  it('e il controllo del piano lo conferma, bobina per bobina', () => {
    for (const [i, l] of esito.lastre.entries()) {
      const rotte = sovrapposizioni(l, PAR.lama);
      expect(rotte, `bobina ${i + 1}: ${JSON.stringify(rotte)}`).toHaveLength(0);
    }
  });
});
