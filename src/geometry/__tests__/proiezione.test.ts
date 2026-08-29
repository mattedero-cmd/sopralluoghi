import { describe, expect, it } from 'vitest';
import { pianoProiettato } from '../pianoModifica';
import { applicaOmografia, omografiaPiano, omografiaPianoInversa } from '../omografia';
import type { PianoProspettiva, Punto } from '../../db/types';

/** un riferimento piccolo visto di sbieco: una piastrella da 30 cm */
const piastrella: PianoProspettiva = {
  punti: [
    { x: 400, y: 300 },
    { x: 520, y: 296 },
    { x: 526, y: 392 },
    { x: 398, y: 398 }
  ],
  larghezzaReale: 300,
  altezzaReale: 300,
  unita: 'mm',
  celle: 1
};

/** la distanza reale fra due punti dell'immagine, letta da un piano */
const misura = (piano: PianoProspettiva, a: Punto, b: Punto) => {
  const H = omografiaPiano(piano);
  const p = applicaOmografia(H, a);
  const q = applicaOmografia(H, b);
  return Math.hypot(q.x - p.x, q.y - p.y);
};

describe('proiettare il piano in una griglia N×N', () => {
  it('la prospettiva non si tocca: le misure restano identiche', () => {
    const provini: Array<[Punto, Punto]> = [
      [
        { x: 410, y: 310 },
        { x: 510, y: 380 }
      ],
      [
        { x: 300, y: 250 },
        { x: 700, y: 450 }
      ],
      [
        { x: 450, y: 200 },
        { x: 460, y: 500 }
      ]
    ];
    for (const n of [3, 5, 7]) {
      const grande = pianoProiettato(piastrella, n)!;
      expect(grande).toBeTruthy();
      for (const [a, b] of provini) {
        expect(misura(grande, a, b)).toBeCloseTo(misura(piastrella, a, b), 6);
      }
    }
  });

  it('la cella resta quella di partenza: è il metro di tutto', () => {
    for (const n of [3, 5, 9]) {
      const g = pianoProiettato(piastrella, n)!;
      expect(g.larghezzaReale / g.celle!).toBeCloseTo(300, 9);
      expect(g.altezzaReale / g.celle!).toBeCloseTo(300, 9);
      expect(g.celle).toBe(n);
    }
  });

  it('cresce ATTORNO al riferimento, restando centrata dov’era', () => {
    const g = pianoProiettato(piastrella, 3)!;
    // il centro del riferimento, portato sulla foto e riletto dal piano
    // grande, deve cadere nel centro di quello: in prospettiva il baricentro
    // dei quattro angoli NON è il centro del rettangolo, e va confrontato là
    const suFoto = applicaOmografia(omografiaPianoInversa(piastrella), {
      x: piastrella.larghezzaReale / 2,
      y: piastrella.altezzaReale / 2
    });
    const c = applicaOmografia(omografiaPiano(g), suFoto);
    expect(c.x).toBeCloseTo(g.larghezzaReale / 2, 6);
    expect(c.y).toBeCloseTo(g.altezzaReale / 2, 6);
  });

  it('gli angoli del piano proiettato sono LONTANI: è il punto di tutto', () => {
    const g = pianoProiettato(piastrella, 5)!;
    const lato = (p: PianoProspettiva) =>
      Math.hypot(p.punti[1].x - p.punti[0].x, p.punti[1].y - p.punti[0].y);
    // cinque celle per lato: il riquadro sullo schermo è molto più grande, e
    // tirando un angolo là si corregge molto con un movimento piccolo
    expect(lato(g)).toBeGreaterThan(lato(piastrella) * 3.5);
  });

  it('si torna indietro: da 5×5 a 1×1 si ritrova il riferimento', () => {
    const g = pianoProiettato(piastrella, 5)!;
    const tornata = pianoProiettato(g, 1)!;
    tornata.punti.forEach((q, i) => {
      expect(q.x).toBeCloseTo(piastrella.punti[i].x, 6);
      expect(q.y).toBeCloseTo(piastrella.punti[i].y, 6);
    });
    expect(tornata.larghezzaReale).toBeCloseTo(300, 9);
    expect(tornata.celle).toBe(1);
  });

  it('e da 3×3 a 7×7 si passa senza perdere la cella', () => {
    const tre = pianoProiettato(piastrella, 3)!;
    const sette = pianoProiettato(tre, 7)!;
    expect(sette.larghezzaReale / 7).toBeCloseTo(300, 9);
    // e misura ancora come il riferimento di partenza
    const a = { x: 410, y: 310 };
    const b = { x: 510, y: 380 };
    expect(misura(sette, a, b)).toBeCloseTo(misura(piastrella, a, b), 6);
  });

  it('un piano degenere non si proietta', () => {
    const piatto: PianoProspettiva = {
      ...piastrella,
      punti: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 }
      ]
    };
    expect(pianoProiettato(piatto, 3)).toBeNull();
    expect(pianoProiettato({ ...piastrella, larghezzaReale: 0 }, 3)).toBeNull();
  });
});
