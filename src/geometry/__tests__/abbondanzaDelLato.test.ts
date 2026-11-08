import { describe, expect, it } from 'vitest';
import { abbondanzaDelLato, latiDiTaglio, latiTriangoloTaglio, sbordiLati } from '../abbondanze';
import { sagomaPoligonoQuotato, sagomaTaglioPoligono } from '../poligonoQuotato';
import { abbondanzaAlVertice } from '../abbondanze';
import { offsetPoligono } from '../punti';
import { formaDaDividere, formaQuadrilatera, latiQuadrilatero } from '../formaQuadrilatera';
import { ingombroTaglio } from '../pezziDaSopralluogo';
import { primitiveAbbondanze } from '../primitive';
import type {
  Annotazione,
  Punto,
  QuotaPoligono,
  QuotaRettangolo,
  SegmentoQuota
} from '../../db/types';

/**
 * L'ABBONDANZA DI UN LATO.
 *
 * Su un rettangolo l'abbondanza si dice sulla MISURA: «la base è 120, dammene
 * due di qua e due di là». Su una polilinea quella lingua non basta — il lato
 * da 24 fra il soffitto alto e quello basso non ha una misura a cui
 * aggiungere due centimetri: ha un verso in cui sbordare. Due centimetri su
 * quel lato non lo fanno diventare da 26: lo spostano di due verso l'esterno,
 * e sono i lati di fianco ad allungarsi per andarlo a prendere.
 *
 * Qui si prova che le tre strade — l'abbondanza sulla misura, quella del lato
 * e quella perimetrale — dicono la stessa cosa a chi disegna sulla foto, a
 * chi divide in teli e a chi taglia.
 */

/** la foto calibrata uno a uno: i punti del disegno sono già centimetri */
const FOTO = { scala: { px: 1, reale: 1, unita: 'cm' as const }, piano: null, piani: undefined };

const area = (p: Punto[]) => {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    d += a.x * b.y - b.x * a.y;
  }
  return Math.abs(d) / 2;
};

/** quanto dista il punto dal lato (segmento) più vicino del poligono */
const dentro = (poly: Punto[], q: Punto) => {
  // pari/dispari: quante volte una semiretta verso destra taglia il contorno
  let s = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) s = !s;
  }
  return s;
};

const lung = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y);

// ---------------------------------------------------------------------------

describe('il verso del «fuori» su una forma rientrante', () => {
  /** il vano di un controsoffitto a vela: due spalle e il vuoto in mezzo */
  const VELA: Punto[] = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 200 },
    { x: 240, y: 200 },
    { x: 240, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 260 },
    { x: 0, y: 260 }
  ];

  it('ogni lato si sposta IN FUORI, anche quelli dentro al vano', () => {
    const d = 3;
    const T = offsetPoligono(VELA, VELA.map(() => d));
    expect(T.length).toBe(VELA.length);
    // il pezzo da tagliare contiene tutto il pezzo finito: nessun vertice
    // netto resta fuori dal contorno gonfiato
    for (const p of VELA) expect(dentro(T, p)).toBe(true);
    // e cresce: col baricentro tre lati su otto andavano DENTRO, e l'area
    // calava — l'abbondanza diventava un pezzo più corto del netto
    expect(area(T)).toBeGreaterThan(area(VELA));
  });

  it('il vano si stringe di 3 per parte: è lui a stare fuori dal pezzo', () => {
    const T = offsetPoligono(VELA, VELA.map(() => 3));
    // le due spalle del vano: da 60 e 240 si stringono a 63 e 237
    expect(T[2].x).toBeCloseTo(63, 6);
    expect(T[3].x).toBeCloseTo(237, 6);
    // e il fondo del vano sale di 3 (y verso il basso)
    expect(T[2].y).toBeCloseTo(197, 6);
    // mentre il bordo esterno si allarga
    expect(T[0].x).toBeCloseTo(-3, 6);
    expect(T[6].x).toBeCloseTo(303, 6);
  });

  it('due abbondanze che si incontrano in uno scasso si fondono', () => {
    // lo scasso del pilastro: largo 40 in cima, 16 in fondo, profondo 50
    const SCASSO: Punto[] = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 92, y: 50 },
      { x: 108, y: 50 },
      { x: 120, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
      { x: 0, y: 150 }
    ];
    // con poca abbondanza lo scasso resta uno scasso, tutti i lati al posto loro
    const poca = offsetPoligono(SCASSO, SCASSO.map(() => 5));
    expect(poca.length).toBe(SCASSO.length);
    expect(poca[2].x - SCASSO[2].x).toBeGreaterThan(0); // la spalla si stringe
    expect(poca[3].x - SCASSO[3].x).toBeLessThan(0);

    // con tanta, le due pareti si incrociano prima del fondo: il fondo
    // dello scasso non esiste più, e lì sotto c'è materiale
    const tanta = offsetPoligono(SCASSO, SCASSO.map(() => 14));
    expect(tanta.length).toBe(SCASSO.length - 1);
    for (const p of SCASSO) expect(dentro(tanta, p)).toBe(true);
    // resta un contorno sensato, non un nodo
    expect(area(tanta)).toBeGreaterThan(area(SCASSO));
    expect(area(tanta)).toBeLessThan(area(SCASSO) * 1.6);
  });
});

// ---------------------------------------------------------------------------

/** i sette vertici della camera d'albergo, come stanno sulla foto (cm) */
const CAMERA: Array<[number, number]> = [
  [0, 74], // 0  cima del montante sinistro
  [189, 0], // 1  punta della falda
  [264, 0], // 2  fine dei 75 di soffitto alto
  [264, 24], // 3  fondo del gradino (spigolo rientrante)
  [340, 24], // 4  fine dei 76
  [340, 274], // 5  angolo basso-destro
  [0, 274] // 6  angolo basso-sinistro
];

/** le misure prese in camera; il lato della falda è quello col «?» */
const QUOTE: Array<[number, number, number]> = [
  [1, 2, 75],
  [2, 3, 24],
  [3, 4, 76],
  [4, 5, 250],
  [5, 6, 340],
  [6, 0, 200]
];

function camera(mod: Partial<QuotaPoligono> = {}, perLato: Record<string, number> = {}) {
  return {
    id: 'c1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 0,
    punti: CAMERA.map(([x, y]) => ({ x, y })),
    segmenti: QUOTE.map(([da, a, valore]): SegmentoQuota => ({
      da,
      a,
      valore,
      offset: 0,
      ...(perLato[`${da}-${a}`] !== undefined ? { abbLato: perLato[`${da}-${a}`] } : {})
    })),
    // gli spigoli a squadro: tutti tranne la falda e la cima del montante
    angoliRetti: [2, 3, 4, 5, 6],
    unita: 'cm',
    stato: 'reale',
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 },
    ...mod
  } as unknown as QuotaPoligono;
}

describe('due centimetri sul lato da 24 della camera', () => {
  it('non lo fanno diventare da 26: lo spostano di due', () => {
    const netta = formaDaDividere(camera(), FOTO)!;
    const abbondata = formaDaDividere(camera({}, { '2-3': 2 }), FOTO)!;
    expect(netta).not.toBeNull();

    const latoNetto = lung(netta.verticiTaglio[2], netta.verticiTaglio[3]);
    const latoAbb = lung(abbondata.verticiTaglio[2], abbondata.verticiTaglio[3]);
    // il lato resta lungo quello che è: 24, non 26
    expect(latoNetto).toBeCloseTo(24, 1);
    expect(latoAbb).toBeCloseTo(24, 1);

    // si è spostato di due verso l'esterno: lo scasso è più stretto di 2
    expect(abbondata.verticiTaglio[2].x - netta.verticiTaglio[2].x).toBeCloseTo(2, 1);
    expect(abbondata.verticiTaglio[3].x - netta.verticiTaglio[3].x).toBeCloseTo(2, 1);
  });

  it('sono i lati di fianco ad allungarsi per andarlo a prendere', () => {
    const netta = formaDaDividere(camera(), FOTO)!;
    const abbondata = formaDaDividere(camera({}, { '2-3': 2 }), FOTO)!;
    // il soffitto alto (lato 1-2) si allunga di 2, il tratto da 76 si accorcia
    const soffittoNetto = lung(netta.verticiTaglio[1], netta.verticiTaglio[2]);
    const soffittoAbb = lung(abbondata.verticiTaglio[1], abbondata.verticiTaglio[2]);
    expect(soffittoAbb - soffittoNetto).toBeCloseTo(2, 1);
    const tratto76Netto = lung(netta.verticiTaglio[3], netta.verticiTaglio[4]);
    const tratto76Abb = lung(abbondata.verticiTaglio[3], abbondata.verticiTaglio[4]);
    expect(tratto76Netto - tratto76Abb).toBeCloseTo(2, 1);
  });

  it('l’ingombro del pezzo non cambia: lo scasso è dentro, non fuori', () => {
    const netta = formaDaDividere(camera(), FOTO)!;
    const abbondata = formaDaDividere(camera({}, { '2-3': 2 }), FOTO)!;
    expect(abbondata.taglio.larghezza).toBeCloseTo(netta.taglio.larghezza, 1);
    expect(abbondata.taglio.altezza).toBeCloseTo(netta.taglio.altezza, 1);
  });
});

describe('l’abbondanza perimetrale della camera', () => {
  it('due centimetri attorno: il pezzo cresce di 4 in larghezza e in altezza', () => {
    const netta = formaDaDividere(camera(), FOTO)!;
    const giro = formaDaDividere(camera({ abbPerimetro: 2 }), FOTO)!;
    expect(giro.taglio.larghezza - netta.taglio.larghezza).toBeCloseTo(4, 1);
    expect(giro.taglio.altezza - netta.taglio.altezza).toBeCloseTo(4, 1);
    expect(giro.abbondanze.sinistra).toBeCloseTo(2, 1);
    expect(giro.abbondanze.destra).toBeCloseTo(2, 1);
    expect(giro.abbondanze.sopra).toBeCloseTo(2, 1);
    expect(giro.abbondanze.sotto).toBeCloseTo(2, 1);
  });

  it('il lato che ha la sua comanda lui, anche a zero', () => {
    const giro = formaDaDividere(camera({ abbPerimetro: 2 }), FOTO)!;
    // il pavimento messo a filo: zero scritto a mano su quel lato soltanto
    const filo = formaDaDividere(camera({ abbPerimetro: 2 }, { '5-6': 0 }), FOTO)!;
    expect(giro.abbondanze.sotto).toBeCloseTo(2, 1);
    expect(filo.abbondanze.sotto).toBeCloseTo(0, 1);
    // gli altri tre lati non si accorgono di niente
    expect(filo.abbondanze.sopra).toBeCloseTo(2, 1);
    expect(filo.abbondanze.sinistra).toBeCloseTo(2, 1);
    expect(filo.abbondanze.destra).toBeCloseTo(2, 1);
  });

  it('dieci in fondo al montante abbassano TUTTO il pavimento', () => {
    /**
     * Qui si vede perché gonfiare non è allungare. Dieci centimetri in fondo
     * al montante sinistro vogliono dire che il pavimento scende di dieci:
     * scende sotto il montante sinistro e anche sotto il destro, perché il
     * pavimento è uno solo. Allungando il solo lato misurato — come si faceva
     * da cinque lati in su — il montante sinistro usciva da 210 e il destro
     * restava da 250, e la figura si richiudeva storta attorno a quei numeri.
     */
    const q = camera();
    const segmenti = (q.segmenti ?? []).map((sg) =>
      sg.da === 6 && sg.a === 0 ? { ...sg, abbInizio: 10 } : sg
    );
    const f = formaDaDividere({ ...q, segmenti } as QuotaPoligono, FOTO)!;
    const netta = formaDaDividere(q, FOTO)!;
    expect(f).not.toBeNull();
    // tutti e due i montanti crescono di dieci, non uno solo
    const montanteSx = (v: Punto[]) => lung(v[6], v[0]);
    const montanteDx = (v: Punto[]) => lung(v[4], v[5]);
    expect(montanteSx(f.verticiTaglio) - montanteSx(netta.verticiTaglio)).toBeCloseTo(10, 1);
    expect(montanteDx(f.verticiTaglio) - montanteDx(netta.verticiTaglio)).toBeCloseTo(10, 1);
    // e il pavimento resta lungo 340: scende, non si allunga
    expect(lung(f.verticiTaglio[5], f.verticiTaglio[6])).toBeCloseTo(340, 1);
    // la distinta dice la stessa cosa: 340 × 284, non un pezzo rifatto
    const ing = ingombroTaglio({ ...q, segmenti } as Annotazione, FOTO)!;
    expect(ing.larghezza).toBeCloseTo(3400, 0);
    expect(ing.altezza).toBeCloseTo(2840, 0);
  });

  it('arriva al taglio con la forma giusta, non con la forma deformata', () => {
    const netta = ingombroTaglio(camera(), FOTO)!;
    const giro = ingombroTaglio(camera({ abbPerimetro: 2 }), FOTO)!;
    // in millimetri: 20 mm per parte
    expect(giro.larghezza - netta.larghezza).toBeCloseTo(40, 0);
    expect(giro.altezza - netta.altezza).toBeCloseTo(40, 0);
    expect(giro.conAbbondanze).toBe(true);
    // e la falda resta inclinata come prima: gonfiare non deforma
    const ang = (s: { sagoma?: { vertici?: Array<[number, number]> } }) => {
      const v = s.sagoma!.vertici!;
      return Math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0]);
    };
    expect(ang(giro)).toBeCloseTo(ang(netta), 2);
  });
});

// ---------------------------------------------------------------------------

describe('la regola, scritta una volta sola', () => {
  const q = camera({ abbPerimetro: 3 }, { '2-3': 7, '5-6': 0 });
  const segs = (da: number, a: number) =>
    (q.segmenti ?? []).find((s) => s.da === da && s.a === a);

  it('il lato prende la sua, se ce l’ha; se no quella perimetrale', () => {
    expect(abbondanzaDelLato(q, segs(2, 3))).toBe(7);
    expect(abbondanzaDelLato(q, segs(1, 2))).toBe(3);
    expect(abbondanzaDelLato(q, segs(5, 6))).toBe(0);
    // anche un lato che non è nemmeno quotato segue il perimetro: spostarlo
    // in fuori non chiede di sapere quanto è lungo
    expect(abbondanzaDelLato(q, undefined)).toBe(3);
  });

  it('gli sbordi li legge chi disegna e chi taglia, dallo stesso posto', () => {
    const s = sbordiLati(q, abbondanzaAlVertice);
    expect(s[0]).toBe(3); // la falda, non quotata: segue il perimetro
    expect(s[2]).toBe(7); // il gradino
    expect(s[5]).toBe(0); // il pavimento a filo
  });

  it('non si sommano: fra la sua e quella dei vicini vince la più grande', () => {
    // il montante sinistro con 5 di abbondanza in fondo spinge giù il
    // pavimento di 5; se il pavimento ne ha già 3 di suo, restano 5, non 8
    const misto = camera({ abbPerimetro: 3 });
    const segmenti = (misto.segmenti ?? []).map((s) =>
      s.da === 6 && s.a === 0 ? { ...s, abbInizio: 5 } : s
    );
    const s = sbordiLati({ ...misto, segmenti } as QuotaPoligono, abbondanzaAlVertice);
    expect(s[5]).toBe(5);
  });
});

// ---------------------------------------------------------------------------

describe('le altre forme', () => {
  const quad = (mod: Partial<QuotaPoligono> = {}, perLato: Record<string, number> = {}) =>
    ({
      id: 'q1',
      fotoId: 'f',
      tipo: 'quotaPoligono',
      zIndex: 0,
      punti: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 200 },
        { x: 0, y: 200 }
      ],
      segmenti: [
        [0, 1, 120],
        [1, 2, 200],
        [2, 3, 120],
        [3, 0, 200]
      ].map(([da, a, valore]): SegmentoQuota => ({
        da,
        a,
        valore,
        offset: 0,
        ...(perLato[`${da}-${a}`] !== undefined ? { abbLato: perLato[`${da}-${a}`] } : {})
      })),
      unita: 'cm',
      stato: 'reale',
      stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 },
      ...mod
    }) as unknown as QuotaPoligono;

  it('il quadrilatero: due attorno fanno 124 × 204', () => {
    const f = formaQuadrilatera(quad({ abbPerimetro: 2 }))!;
    expect(f.netta).toEqual({ larghezza: 120, altezza: 200 });
    expect(f.taglio.larghezza).toBeCloseTo(124, 6);
    expect(f.taglio.altezza).toBeCloseTo(204, 6);
  });

  it('il quadrilatero: un lato solo abbondato allarga da una parte sola', () => {
    const f = formaQuadrilatera(quad({}, { '3-0': 5 }))!;
    expect(f.abbondanze.sinistra).toBeCloseTo(5, 6);
    expect(f.abbondanze.destra).toBeCloseTo(0, 6);
    expect(f.taglio.larghezza).toBeCloseTo(125, 6);
    expect(f.taglio.altezza).toBeCloseTo(200, 6);
  });

  it('il lato da tagliare si allunga per i VICINI, non per sé stesso', () => {
    // 5 sul montante sinistro: la base da tagliare passa da 120 a 125,
    // il montante resta 200 — spostarlo non lo allunga
    const l = latiQuadrilatero(quad({}, { '3-0': 5 }))!;
    expect(l.alto).toBeCloseTo(125, 6);
    expect(l.basso).toBeCloseTo(125, 6);
    expect(l.sinistro).toBeCloseTo(200, 6);
    expect(l.destro).toBeCloseTo(200, 6);
  });

  it('la quota elemento: non aveva dove scriverla, adesso sì', () => {
    const rett = {
      id: 'r1',
      fotoId: 'f',
      tipo: 'quotaRett',
      zIndex: 0,
      punti: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 }
      ],
      valoreBase: 140,
      valoreAltezza: 220,
      unita: 'cm',
      stato: 'reale',
      stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
    } as unknown as QuotaRettangolo;
    const senza = ingombroTaglio(rett, FOTO)!;
    expect(senza.larghezza).toBeCloseTo(1400, 6);
    expect(senza.conAbbondanze).toBe(false);

    const con = ingombroTaglio({ ...rett, abbPerimetro: 2 } as Annotazione, FOTO)!;
    expect(con.larghezza).toBeCloseTo(1440, 6);
    expect(con.altezza).toBeCloseTo(2240, 6);
  });

  it('il triangolo cresce restando lo stesso triangolo', () => {
    const tri = (abb?: number) =>
      ({
        id: 't1',
        fotoId: 'f',
        tipo: 'quotaPoligono',
        zIndex: 0,
        punti: [
          { x: 0, y: 0 },
          { x: 300, y: 0 },
          { x: 120, y: 160 }
        ],
        segmenti: [
          { da: 0, a: 1, valore: 300, offset: 0 },
          { da: 1, a: 2, valore: 240, offset: 0 },
          { da: 2, a: 0, valore: 200, offset: 0 }
        ],
        ...(abb === undefined ? {} : { abbPerimetro: abb }),
        unita: 'cm',
        stato: 'reale',
        stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
      }) as unknown as QuotaPoligono;

    expect(latiTriangoloTaglio(tri())).toEqual([300, 240, 200]);
    const t = 2;
    const [a, b, c] = latiTriangoloTaglio(tri(t))!;
    // stesso triangolo, scalato attorno al centro del cerchio inscritto:
    // il fattore è (r + t) / r
    const sp = (300 + 240 + 200) / 2;
    const r = Math.sqrt(((sp - 300) * (sp - 240) * (sp - 200)) / sp);
    const k = (r + t) / r;
    expect(a).toBeCloseTo(300 * k, 4);
    expect(b).toBeCloseTo(240 * k, 4);
    expect(c).toBeCloseTo(200 * k, 4);
  });

  it('il rombo: le diagonali crescono quanto basta a dare l’abbondanza', () => {
    const rombo = (abb?: number) =>
      ({
        id: 'rb',
        fotoId: 'f',
        tipo: 'quotaPoligono',
        zIndex: 0,
        punti: [
          { x: 100, y: 0 },
          { x: 200, y: 60 },
          { x: 100, y: 120 },
          { x: 0, y: 60 }
        ],
        segmenti: [
          { da: 0, a: 2, valore: 120, offset: 0 },
          { da: 1, a: 3, valore: 200, offset: 0 }
        ],
        ...(abb === undefined ? {} : { abbPerimetro: abb }),
        unita: 'cm',
        stato: 'reale',
        stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
      }) as unknown as QuotaPoligono;

    const senza = ingombroTaglio(rombo(), FOTO)!;
    expect(senza.larghezza).toBeCloseTo(2000, 6);
    expect(senza.altezza).toBeCloseTo(1200, 6);

    const t = 3;
    const con = ingombroTaglio(rombo(t), FOTO)!;
    const lato = Math.hypot(100, 60);
    const r = (200 * 120) / (4 * lato);
    const k = (r + t) / r;
    // la distinta arrotonda al decimo di millimetro
    expect(con.larghezza).toBeCloseTo(2000 * k, 1);
    expect(con.altezza).toBeCloseTo(1200 * k, 1);
  });
});

// ---------------------------------------------------------------------------

describe('le misure che vanno sul foglio', () => {
  /**
   * SU UNO SPIGOLO RIENTRANTE la somma dice il contrario del vero.
   *
   * «Il lato si allunga di quanto escono i suoi vicini» vale finché lo
   * spigolo sporge. Dove rientra — il gradino di un controsoffitto — il
   * vicino che esce ENTRA nel lato e lo accorcia: il tratto da 76, con dieci
   * di abbondanza sul montantino del gradino, diventa 66 e non 86. Il foglio
   * che va in cantiere deve dire la misura che taglia la macchina, quindi si
   * misura il contorno vero del pezzo, non si somma.
   */
  const q = camera({ abbPerimetro: 2 }, { '2-3': 10, '5-6': 0 });
  const contorno = sagomaTaglioPoligono(q, sagomaPoligonoQuotato(q, FOTO, false));

  it('il lato oltre il gradino si ACCORCIA, non si allunga', () => {
    const tagli = latiDiTaglio(q, contorno);
    // L3 è il tratto da 76: il gradino gli mangia dieci, il montante
    // destro gliene rende due
    expect(tagli[2]).toBeCloseTo(68, 3);
    expect(tagli[2]!).toBeLessThan(76);
    // e il gradino stesso resta da 24: sopra e sotto escono tutti e due di
    // due, uno lo allunga e l'altro lo accorcia
    expect(tagli[1]).toBeCloseTo(24, 3);
  });

  it('e sono le misure del pezzo che esce dalla macchina', () => {
    const tagli = latiDiTaglio(q, contorno);
    const v = contorno!;
    // la quota k del poligono è il lato che parte dal vertice QUOTE[k][0]
    QUOTE.forEach(([da], k) => {
      const j = (da + 1) % v.length;
      const d = Math.hypot(v[j][0] - v[da][0], v[j][1] - v[da][1]);
      expect(tagli[k]).toBeCloseTo(d, 3);
    });
    // il pavimento a filo si allunga lo stesso: sono i due montanti a uscire
    expect(tagli[4]).toBeCloseTo(344, 3);
  });

  it('sommare darebbe quattro misure sbagliate su sei', () => {
    const somma = latiDiTaglio(q);
    const veri = latiDiTaglio(q, contorno);
    const diverse = veri.filter((v, i) => Math.abs((v ?? 0) - (somma[i] ?? 0)) > 0.01).length;
    expect(diverse).toBe(4);
    expect(somma[2]).toBeCloseTo(88, 3); // la somma direbbe 88 dove sono 68
    expect(somma[1]).toBeCloseTo(28, 3); // e 28 dove sono 24
  });

  it('su un quadrilatero, dove gli spigoli sporgono tutti, la somma basta', () => {
    const r = {
      id: 'q2',
      fotoId: 'f',
      tipo: 'quotaPoligono',
      zIndex: 0,
      punti: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 200 },
        { x: 0, y: 200 }
      ],
      segmenti: [
        { da: 0, a: 1, valore: 120, offset: 0 },
        { da: 1, a: 2, valore: 200, offset: 0 },
        { da: 2, a: 3, valore: 120, offset: 0 },
        { da: 3, a: 0, valore: 200, offset: 0 }
      ],
      abbPerimetro: 2,
      unita: 'cm',
      stato: 'reale',
      stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
    } as unknown as QuotaPoligono;
    expect(latiDiTaglio(r)).toEqual([124, 204, 124, 204]);
  });
});

// ---------------------------------------------------------------------------

describe('il contorno tratteggiato sulla foto', () => {
  it('compare anche quando l’abbondanza è solo perimetrale', () => {
    expect(primitiveAbbondanze(camera() as Annotazione)).toHaveLength(0);
    expect(primitiveAbbondanze(camera({ abbPerimetro: 2 }) as Annotazione).length).toBeGreaterThan(0);
  });

  it('e anche sulla quota elemento, che prima non ne aveva nessuna', () => {
    const rett = {
      id: 'r2',
      fotoId: 'f',
      tipo: 'quotaRett',
      zIndex: 0,
      punti: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 }
      ],
      valoreBase: 100,
      valoreAltezza: 60,
      unita: 'cm',
      stato: 'reale',
      stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
    } as unknown as QuotaRettangolo;
    expect(primitiveAbbondanze(rett as Annotazione)).toHaveLength(0);
    const con = primitiveAbbondanze({ ...rett, abbPerimetro: 5 } as Annotazione);
    expect(con).toHaveLength(1);
    const p = con[0] as { punti: number[] };
    // il tratteggio sborda di cinque: il rettangolo disegnato è 100 × 60 e la
    // misura è 100 × 60, quindi un centimetro è un pixel
    expect(Math.min(...p.punti.filter((_, i) => i % 2 === 0))).toBeCloseTo(-5, 4);
  });

  it('due sul lato da 24 si vedono sulla foto, spostati in fuori', () => {
    const prime = primitiveAbbondanze(camera({}, { '2-3': 2 }) as Annotazione);
    expect(prime).toHaveLength(1);
    const p = (prime[0] as { punti: number[] }).punti;
    // il vertice 2 del contorno tratteggiato: due pixel più a destra di
    // com'è disegnato (la foto è uno a uno)
    expect(p[4]).toBeCloseTo(266, 4);
    expect(p[6]).toBeCloseTo(266, 4);
  });
});
