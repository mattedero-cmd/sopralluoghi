import { describe, expect, it } from 'vitest';
import {
  adattaPiano,
  pianoDaOmografia,
  riferimentiPiano,
  verificaPiano,
  type RiferimentoPiano
} from '../pianoDaForme';
import { applicaOmografia, calcolaOmografia, omografiaPiano } from '../omografia';
import type { Annotazione, Punto } from '../../db/types';

/**
 * UNA PARETE VERA, FOTOGRAFATA STORTA.
 *
 * `verso` porta dai millimetri sul muro ai pixel della foto: è la prospettiva
 * di una foto scattata di tre quarti, con il lato destro che si allontana.
 * Da qui si costruiscono i riferimenti — rettangoli di misure note appoggiati
 * sul muro — e si verifica che il piano ricavato li rimetta d'accordo.
 */
const versoFoto = calcolaOmografia(
  [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 2600 },
    { x: 0, y: 2600 }
  ],
  [
    { x: 120, y: 240 },
    { x: 1860, y: 520 },
    { x: 1820, y: 1420 },
    { x: 150, y: 1330 }
  ]
);

const suFoto = (p: Punto) => applicaOmografia(versoFoto, p);

/** un rettangolo w×h col suo angolo alto-sinistro in (x,y) sul muro */
function riferimento(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rumore = 0
): RiferimentoPiano {
  const reale = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h }
  ];
  // rumore deterministico: il dito non punta mai l'angolo al pixel
  const scosta = (i: number, k: number) =>
    rumore === 0 ? 0 : rumore * Math.sin(id.charCodeAt(0) * 7.13 + i * 2.7 + k * 1.9);
  const immagine = reale.map((q, i) => {
    const p = suFoto({ x: x + q.x, y: y + q.y });
    return { x: p.x + scosta(i, 0), y: p.y + scosta(i, 1) };
  });
  const peso = immagine.reduce((s, p, i) => {
    const q = immagine[(i + 1) % 4];
    return s + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
  return { id, immagine, reale, peso };
}

/**
 * Quanto sbaglia un piano SU TUTTA LA PARETE, non solo dove sono i
 * riferimenti: è la domanda vera, perché le misure dimenticate si prendono
 * dove capita. Si misurano segmenti da un metro sparsi ovunque.
 */
function erroreSullaParete(H: ReturnType<typeof calcolaOmografia>): number {
  let somma = 0;
  let n = 0;
  for (let x = 200; x <= 3600; x += 400) {
    for (let y = 200; y <= 2200; y += 400) {
      for (const [dx, dy] of [
        [1000, 0],
        [0, 1000]
      ]) {
        const a = applicaOmografia(H, suFoto({ x, y }));
        const b = applicaOmografia(H, suFoto({ x: x + dx, y: y + dy }));
        somma += Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 1000);
        n++;
      }
    }
  }
  return somma / n;
}

describe('adattaPiano', () => {
  it('senza rumore ritrova la prospettiva esatta, comunque siano le forme', () => {
    const rif = [
      riferimento('a', 200, 300, 900, 1400),
      riferimento('b', 2600, 400, 1100, 900),
      riferimento('c', 1400, 1500, 800, 700)
    ];
    const esito = adattaPiano(rif)!;
    expect(esito).toBeTruthy();
    // ogni lato di ogni forma torna alla sua misura, al decimo di millimetro
    expect(esito.erroreMedio).toBeLessThan(0.1);
    expect(erroreSullaParete(esito.H)).toBeLessThan(0.5);
  });

  it('più forme sparse battono la sola forma più grande', () => {
    // il dito sbaglia di un paio di pixel per angolo: è la realtà
    const rif = [
      riferimento('a', 200, 300, 900, 1400, 2),
      riferimento('b', 2500, 350, 1200, 1000, 2),
      riferimento('c', 1500, 1400, 900, 800, 2),
      riferimento('d', 300, 1800, 700, 600, 2),
      riferimento('e', 2900, 1700, 800, 700, 2)
    ];
    const tutte = adattaPiano(rif)!;
    const unaSola = adattaPiano([rif[0]])!;
    const conTutte = erroreSullaParete(tutte.H);
    const conUna = erroreSullaParete(unaSola.H);
    // il piano da una forma sola sbaglia parecchio lontano da lei; quello da
    // cinque forme sparse tiene tutta la parete
    expect(conTutte).toBeLessThan(conUna);
    expect(conTutte).toBeLessThan(conUna / 2);
    expect(conTutte).toBeLessThan(12);
  });

  it('con una forma sola il piano è quello di sempre: esatto su di lei', () => {
    const solo = riferimento('a', 500, 500, 1200, 900);
    const esito = adattaPiano([solo])!;
    expect(esito.riferimenti).toHaveLength(1);
    expect(esito.erroreMedio).toBeLessThan(1e-6);
  });

  it('la verifica dice quanto sbaglia, e su quale forma', () => {
    const buone = [riferimento('a', 200, 300, 900, 1400), riferimento('b', 2600, 400, 1100, 900)];
    // una forma quotata male: 1200 dichiarati dove il muro ne fa 900
    const storta = riferimento('c', 1400, 1500, 900, 700);
    storta.reale = [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 1200, y: 700 },
      { x: 0, y: 700 }
    ];
    const esito = adattaPiano([...buone, storta])!;
    expect(esito.peggiore?.id).toBe('c');
    expect(esito.peggiore!.massimo).toBeGreaterThan(50);
  });

  it('senza forme non si inventa un piano', () => {
    expect(adattaPiano([])).toBeNull();
  });
});

describe('pianoDaOmografia', () => {
  it('l’omografia si riscrive come piano salvabile, e rilegge le stesse misure', () => {
    const rif = [
      riferimento('a', 200, 300, 900, 1400),
      riferimento('b', 2600, 400, 1100, 900),
      riferimento('c', 1400, 1500, 800, 700)
    ];
    const esito = adattaPiano(rif)!;
    const piano = pianoDaOmografia(esito.H, esito.riferimenti)!;
    expect(piano).toBeTruthy();
    expect(piano.unita).toBe('mm');
    // il piano scritto sulla foto misura come l'omografia da cui nasce
    const riletta = omografiaPiano(piano);
    expect(verificaPiano(riletta, rif).medio).toBeCloseTo(esito.erroreMedio, 1);
    // e il rettangolo salvato contiene le forme, con un po' di margine
    expect(piano.larghezzaReale).toBeGreaterThan(3400);
    expect(piano.celle).toBe(4);
  });
});

/* --- quali forme del sopralluogo diventano riferimenti ------------------ */

const stile = { colore: '#fff', spessore: 3, dimensioneTesto: 16 };
const poligono = (extra: object): Annotazione =>
  ({
    id: 'p1',
    fotoId: 'f1',
    zIndex: 0,
    stile,
    tipo: 'quotaPoligono',
    unita: 'cm',
    stato: 'reale',
    punti: [
      { x: 100, y: 100 },
      { x: 500, y: 120 },
      { x: 495, y: 400 },
      { x: 105, y: 380 }
    ],
    segmenti: [
      { da: 0, a: 1, valore: 200 },
      { da: 1, a: 2, valore: 140 },
      { da: 2, a: 3, valore: 200 },
      { da: 3, a: 0, valore: 140 }
    ],
    ...extra
  }) as unknown as Annotazione;

describe('riferimentiPiano', () => {
  it('una forma quotata a mano è un riferimento, e le misure vanno in millimetri', () => {
    const rif = riferimentiPiano([poligono({})]);
    expect(rif).toHaveLength(1);
    // 200 cm × 140 cm → 2000 mm × 1400 mm
    const [altoSx, altoDx, bassoDx] = rif[0].reale;
    expect(Math.hypot(altoDx.x - altoSx.x, altoDx.y - altoSx.y)).toBeCloseTo(2000, 6);
    expect(Math.hypot(bassoDx.x - altoDx.x, bassoDx.y - altoDx.y)).toBeCloseTo(1400, 6);
  });

  it('una forma quotata DAL piano non può correggere il piano', () => {
    expect(riferimentiPiano([poligono({ valoreAuto: true })])).toHaveLength(0);
    // ma se i lati li ha scritti l'uomo, il regime misto va bene
    const misto = poligono({
      valoreAuto: true,
      segmenti: [
        { da: 0, a: 1, valore: 200, manuale: true },
        { da: 1, a: 2, valore: 140, manuale: true },
        { da: 2, a: 3, valore: 200, manuale: true },
        { da: 3, a: 0, valore: 140, manuale: true }
      ]
    });
    expect(riferimentiPiano([misto])).toHaveLength(1);
  });

  it('le copie solo-etichetta e le forme senza misure restano fuori', () => {
    expect(riferimentiPiano([poligono({ soloEtichetta: true })])).toHaveLength(0);
    expect(riferimentiPiano([poligono({ segmenti: [] })])).toHaveLength(0);
  });
});
