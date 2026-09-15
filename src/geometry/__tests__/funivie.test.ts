import { describe, expect, it } from 'vitest';
import { calcolaNestingAuto } from '../nestingSagome';
import { sovrapposizioni } from '../controlloPiano';
import { areaForma } from '../sagome';
import { opzioniRicerca, parametriDi } from '../../utils/documentoNesting';
import type { PezzoNesting } from '../nesting';

/**
 * IL LAVORO DELLE FUNIVIE, come è uscito dal cantiere: pellicola solare su
 * bobina da 91,5 cm, tre trapezi e otto rettangoli, quasi tutti larghi fra 60
 * e 90 cm.
 *
 * Su questa bobina NESSUN PEZZO STA DI FIANCO A UN ALTRO — i due più stretti
 * sono 600 e 750, e 1350 non entra in 915 — quindi il lavoro è una colonna
 * sola, e per una colonna l'ordine migliore si può calcolare per intero:
 * undici pezzi, i loro versi, e il salto minimo fra ogni coppia. Quel conto
 * dà 15,396 m, ed è un piano legale (verificato pezzo per pezzo, zero coppie
 * sotto la lama).
 *
 * Il piano che si portava in cantiere ne usava 15,806.
 *
 * I 410 mm di differenza stavano tutti in un incastro mancato, e la ragione
 * era l'ORDINE D'INSERIMENTO: il motore prova tutti i versi che vuole, ma
 * infila i pezzi dal più lungo al più corto, e così un rettangolo alto si
 * prendeva il vuoto sotto la falda del trapezio grosso. Il trapezio che
 * sarebbe entrato lì — 477 mm di incastro — finiva più avanti, di fianco a un
 * pezzo con cui non si incastra affatto.
 *
 * Una cosa che il conto dice e che a occhio non si direbbe: i due trapezi
 * B1.1 (860×1130|1610) e B1.2% (860×1610|1130) NON si possono incastrare fra
 * loro, per quanto li si giri. Sono l'uno lo specchio dell'altro, le loro
 * falde pendono al contrario, e il programma i pezzi li gira ma non li
 * ribalta. Metterli uno dietro l'altro a distanza di lama è il massimo, ed è
 * quello che il motore faceva già.
 */

const P = (nome: string, l: number, a: number, q: number, t: number, extra = {}) =>
  ({
    id: nome,
    nome,
    larghezza: l,
    altezza: a,
    quantita: q,
    ruotabile: true,
    tinta: t,
    ...extra
  }) as unknown as PezzoNesting;

const PEZZI: PezzoNesting[] = [
  P('B1.1', 860, 1130, 1, 0, { forma: 'trapezioR', misura3: 1610 }),
  P('B1.2%', 860, 1610, 1, 1, { forma: 'trapezioR', misura3: 1130 }),
  P('C1', 860, 1260, 1, 2, { forma: 'trapezioR', misura3: 715 }),
  P('D4', 1120, 750, 1, 3),
  P('E2', 1490, 600, 1, 4),
  P('G1', 880, 1270, 1, 5),
  P('G2', 865, 865, 1, 6),
  P('G3', 900, 805, 1, 7),
  P('G4', 960, 865, 1, 8),
  P('A1', 885, 2500, 2, 9)
];

const LARGO = 915;
const LAMA = 3;

function piano() {
  const m = {
    id: 'm',
    nome: '91,5 Silver 20',
    modo: 'bobina' as const,
    lastra: { larghezza: 2500, altezza: 1250 },
    bobina: { larghezza: LARGO, metri: 50 },
    venatura: 'nessuna' as const,
    lama: LAMA,
    abbondanza: 0,
    margine: 0,
    orientamenti: {},
    pezzi: PEZZI
  };
  return calcolaNestingAuto(parametriDi(m), PEZZI, opzioniRicerca(m));
}

describe('il lavoro delle funivie', () => {
  it('sta in meno di 15,6 m, e nessun pezzo resta fuori', () => {
    const e = piano();
    const usato = e.lastre.reduce(
      (s, l) => s + (l.piazzamenti.length ? Math.max(...l.piazzamenti.map((p) => p.y + p.altezza)) : 0),
      0
    );
    const area = PEZZI.reduce((s, p) => s + areaForma(p) * p.quantita, 0);
    expect(e.scartati).toHaveLength(0);
    // 15,806 era il piano di prima; 15,396 è l'ottimo calcolato per intero
    expect(usato).toBeLessThanOrEqual(15_600);
    expect(usato).toBeGreaterThanOrEqual(15_390);
    // e la resa non scende: sotto l'89% si è perso un incastro per strada
    expect((100 * area) / (LARGO * usato)).toBeGreaterThan(89);
  }, 120000);

  it('un trapezio si infila DAVVERO sotto la falda di un altro', () => {
    // il numero da solo non basta: si può arrivare a 15,5 m per caso. Qui si
    // chiede l'incastro vero, cioè due trapezi i cui ingombri si accavallano
    // di parecchio lungo il rotolo — cosa che fra due rettangoli non potrebbe
    // mai succedere.
    const e = piano();
    let massimo = 0;
    for (const l of e.lastre) {
      const tz = l.piazzamenti.filter((p) => p.forma === 'trapezioR');
      for (let a = 0; a < tz.length; a++)
        for (let b = a + 1; b < tz.length; b++) {
          const su = tz[a].y < tz[b].y ? tz[a] : tz[b];
          const giu = tz[a].y < tz[b].y ? tz[b] : tz[a];
          massimo = Math.max(massimo, su.y + su.altezza - giu.y);
        }
    }
    expect(massimo, 'nessun trapezio è entrato sotto la falda di un altro').toBeGreaterThan(300);
  }, 120000);

  it('il piano è tagliabile: fra due pezzi passa sempre la lama', () => {
    const e = piano();
    const guasti = e.lastre.flatMap((l) => sovrapposizioni(l, LAMA));
    expect(guasti).toEqual([]);
  }, 120000);
});
