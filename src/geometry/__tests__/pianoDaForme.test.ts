import { describe, expect, it } from 'vitest';
import {
  adattaPiano,
  gruppiDiPiano,
  pianiDalleForme,
  scartoCalibrazione,
  pianoDaOmografia,
  riferimentiPiano,
  verificaPiano,
  type RiferimentoPiano
} from '../pianoDaForme';
import { applicaOmografia, calcolaOmografia, omografiaPiano } from '../omografia';
import { pianoDi, valoreAutomatico } from '../calibrazione';
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


/* --- due pareti nella stessa foto --------------------------------------- */

/**
 * IL BOX DI CANTIERE, RIPRESO DI TRE QUARTI.
 *
 * Il fianco e il fronte sono due pareti diverse che si incontrano nello
 * spigolo: due piani, non uno. Le finestre quotate stanno due di qua e due di
 * là, e mescolarle darebbe una prospettiva che non è giusta da nessuna parte.
 */
const spigolo = { alto: { x: 470, y: 250 }, basso: { x: 480, y: 700 } };

/** parete FRONTALE: dallo spigolo verso destra, 5000 × 2500 mm */
const versoFronte = calcolaOmografia(
  [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 2500 },
    { x: 0, y: 2500 }
  ],
  [spigolo.alto, { x: 1120, y: 330 }, { x: 1110, y: 640 }, spigolo.basso]
);

/** parete di FIANCO: dallo spigolo verso sinistra, 2400 × 2500 mm */
const versoFianco = calcolaOmografia(
  [
    { x: 0, y: 0 },
    { x: 2400, y: 0 },
    { x: 2400, y: 2500 },
    { x: 0, y: 2500 }
  ],
  [{ x: 90, y: 320 }, spigolo.alto, spigolo.basso, { x: 100, y: 690 }]
);

function suParete(
  H: ReturnType<typeof calcolaOmografia>,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number
): RiferimentoPiano {
  const reale = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h }
  ];
  const immagine = reale.map((q) => applicaOmografia(H, { x: x + q.x, y: y + q.y }));
  const peso = immagine.reduce((s, p, i) => {
    const q = immagine[(i + 1) % 4];
    return s + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
  return { id, immagine, reale, peso };
}

describe('due pareti nella stessa foto', () => {
  const fronte = [
    suParete(versoFronte, 'G1', 600, 500, 900, 1200),
    suParete(versoFronte, 'G2', 2200, 500, 900, 1200),
    suParete(versoFronte, 'G3', 3600, 500, 850, 800)
  ];
  const fianco = [
    suParete(versoFianco, 'G4', 300, 550, 950, 850),
    suParete(versoFianco, 'G5', 1400, 550, 800, 850)
  ];

  it('le forme si dividono da sole nelle due pareti', () => {
    const gruppi = gruppiDiPiano([...fronte, ...fianco]);
    expect(gruppi).toHaveLength(2);
    const nomi = gruppi.map((g) => g.map((r) => r.id).sort().join(' ')).sort();
    expect(nomi).toEqual(['G1 G2 G3', 'G4 G5']);
  });

  it('mescolarle darebbe un piano sbagliato per tutti: per questo si separano', () => {
    const insieme = adattaPiano([...fronte, ...fianco])!;
    // un piano solo su due pareti sbaglia di decine di millimetri
    expect(insieme.erroreMedio).toBeGreaterThan(30);
    // ognuna per conto suo torna esatta
    for (const gruppo of gruppiDiPiano([...fronte, ...fianco])) {
      expect(adattaPiano(gruppo)!.erroreMedio).toBeLessThan(1);
    }
  });

  it('ogni piano nasce con le sue ancore, e sono le sue forme', () => {
    const piani = pianiDalleForme([...fronte, ...fianco]);
    expect(piani).toHaveLength(2);
    expect(piani[0].piano.ancore).toHaveLength(3);
    expect(piani[1].piano.ancore).toHaveLength(2);
    // le ancore del fianco stanno a sinistra dello spigolo, quelle del fronte a destra
    const mediaX = (p: (typeof piani)[0]) =>
      p.piano.ancore!.reduce((s, q) => s + q.x, 0) / p.piano.ancore!.length;
    expect(mediaX(piani[0])).toBeGreaterThan(spigolo.alto.x);
    expect(mediaX(piani[1])).toBeLessThan(spigolo.alto.x);
  });
});

describe('la misura dimenticata trova la parete giusta', () => {
  const fronte = [
    suParete(versoFronte, 'G1', 600, 500, 900, 1200),
    suParete(versoFronte, 'G2', 2200, 500, 900, 1200),
    suParete(versoFronte, 'G3', 3600, 500, 850, 800)
  ];
  const fianco = [
    suParete(versoFianco, 'G4', 300, 550, 950, 850),
    suParete(versoFianco, 'G5', 1400, 550, 800, 850)
  ];
  const piani = pianiDalleForme([...fronte, ...fianco]);
  const foto = {
    scala: null,
    piano: piani[0].piano,
    piani: piani.slice(1).map((p) => p.piano)
  };

  /** una quota tracciata fra due punti del muro, distanti `mm` in orizzontale */
  const quota = (H: ReturnType<typeof calcolaOmografia>, x: number, y: number, mm: number) =>
    ({
      id: 'q1',
      fotoId: 'f1',
      zIndex: 0,
      stile: { colore: '#fff', spessore: 2, dimensioneTesto: 14 },
      tipo: 'quota',
      sottotipo: 'allineata',
      p1: applicaOmografia(H, { x, y }),
      p2: applicaOmografia(H, { x: x + mm, y }),
      valore: null,
      unita: 'mm',
      stato: 'reale',
      posizioneTesto: 'sopra',
      offset: 0
    }) as unknown as Annotazione;

  it('sul fronte legge il fronte, sul fianco legge il fianco', () => {
    // due metri sul fronte, lontano dallo spigolo
    expect(valoreAutomatico(quota(versoFronte, 2500, 1500, 2000), foto)).toBeCloseTo(2000, 0);
    // e due metri sul fianco, dall'altra parte dello spigolo
    expect(valoreAutomatico(quota(versoFianco, 200, 1500, 2000), foto)).toBeCloseTo(2000, 0);
  });

  it('col piano del fronte solo, la misura sul fianco sarebbe sbagliata', () => {
    const soloFronte = { scala: null, piano: piani[0].piano, piani: [] };
    const sbagliata = valoreAutomatico(quota(versoFianco, 200, 1500, 2000), soloFronte)!;
    expect(Math.abs(sbagliata - 2000)).toBeGreaterThan(100);
  });

  it('il piano si sceglie dal punto: quello con l’ancora più vicina', () => {
    const suFronte = applicaOmografia(versoFronte, { x: 3000, y: 1200 });
    const suFianco = applicaOmografia(versoFianco, { x: 800, y: 1200 });
    expect(pianoDi(foto, suFronte)).toBe(piani[0].piano);
    expect(pianoDi(foto, suFianco)).toBe(piani[1].piano);
  });
});

describe('scartoCalibrazione', () => {
  const fronte = [
    suParete(versoFronte, 'G1', 600, 500, 900, 1200),
    suParete(versoFronte, 'G2', 2200, 500, 900, 1200)
  ];
  const fianco = [suParete(versoFianco, 'G4', 300, 550, 950, 850)];
  const piani = pianiDalleForme([...fronte, ...fianco]);
  const tutte = [...fronte, ...fianco];

  it('con due pareti attive ogni forma si misura col suo piano', () => {
    const foto = { scala: null, piano: piani[0].piano, piani: piani.slice(1).map((p) => p.piano) };
    expect(scartoCalibrazione(foto, tutte)!).toBeLessThan(1);
  });

  it('con una sola parete attiva il confronto dice la verità: l’altra sballa', () => {
    const foto = { scala: null, piano: piani[0].piano, piani: [] };
    expect(scartoCalibrazione(foto, tutte)!).toBeGreaterThan(20);
  });

  it('senza calibrazione non c’è niente da confrontare', () => {
    expect(scartoCalibrazione({ scala: null, piano: null, piani: [] }, tutte)).toBeNull();
  });
});
