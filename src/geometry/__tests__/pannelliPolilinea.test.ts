import { describe, expect, it } from 'vitest';
import {
  bordiSagoma,
  ePannellizzabile,
  formaDaDividere,
  pannelliDellaForma
} from '../formaQuadrilatera';
import { pannelliTaglio } from '../pezziDaSopralluogo';
import { primitivePannelli } from '../primitive';
import { omografiaSagoma } from '../omografia';
import { applicaOmografia, calcolaOmografia } from '../omografia';
import { areaForma } from '../sagome';
import type { Annotazione, Punto, QuotaPoligono } from '../../db/types';

/**
 * LA PARETE SOTTO FALDA SI DIVIDE IN TELI ANCHE DALLA FOTO.
 *
 * Una parete a cinque lati si poteva dividere solo dalla pagina del nesting,
 * cioè dopo, quando la foto col disegno non si vede più: sulla foto il tasto
 * «Dividi in teli» non compariva, perché tutta la pannellizzazione passava da
 * `formaQuadrilatera`, che legge quattro angoli e basta.
 *
 * Adesso ci passa qualunque forma chiusa convessa, e ci passa da UN POSTO
 * SOLO: l'ambiente di divisione, le giunzioni verdi sulla foto e la distinta
 * di taglio leggono `formaDaDividere`. Devono leggere la stessa cosa, se no la
 * giunzione che si vede non è quella che si taglia — ed è il genere di errore
 * che si scopre al banco.
 */

/** la foto calibrata uno a uno: i punti del disegno sono già centimetri */
const FOTO = { scala: { px: 1, reale: 1, unita: 'cm' as const }, piano: null, piani: undefined };

/** i cinque vertici della camera: montante 345, soffitto 70, montante 224 */
const MURO: Array<[number, number]> = [
  [0, 0],
  [70, 0],
  [400, 121],
  [400, 345],
  [0, 345]
];

/** la parete disegnata e quotata, con le abbondanze che le si vogliono dare */
function parete(abbondanze: Record<string, [number, number]> = {}): QuotaPoligono {
  const quote: Array<[number, number, number]> = [
    [0, 1, 70],
    [2, 3, 224],
    [3, 4, 400],
    [4, 0, 345]
  ];
  return {
    id: 'g1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 0,
    punti: MURO.map(([x, y]) => ({ x, y })),
    segmenti: quote.map(([da, a, valore]) => {
      const abb = abbondanze[`${da}-${a}`];
      return {
        da,
        a,
        valore,
        offset: 0,
        ...(abb ? { abbInizio: abb[0], abbFine: abb[1] } : {})
      };
    }),
    unita: 'cm',
    stato: 'reale',
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
  } as unknown as QuotaPoligono;
}

/** la stessa parete, già divisa in tre teli verticali */
function pareteDivisa(): QuotaPoligono {
  return {
    ...parete(),
    pannelli: { asse: 'verticale', sormonto: 1, verso: 'centro', giunti: [135, 270] }
  } as unknown as QuotaPoligono;
}

describe('il tasto «Dividi in teli» su una polilinea', () => {
  it('c’è anche a cinque lati', () => {
    expect(ePannellizzabile(parete())).toBe(true);
  });

  it('ma non su un’etichetta senza misure', () => {
    const sola = { ...parete(), soloEtichetta: true } as unknown as Annotazione;
    expect(ePannellizzabile(sola)).toBe(false);
  });

  it('e resta spento se le quote non bastano a ricavare la forma', () => {
    const muta = { ...parete(), segmenti: [] } as unknown as Annotazione;
    // il tasto si vede (è una forma chiusa) ma non si può premere
    expect(ePannellizzabile(muta)).toBe(true);
    expect(formaDaDividere(muta, FOTO)).toBeNull();
  });
});

describe('la forma da dividere, a cinque lati', () => {
  const f = formaDaDividere(parete(), FOTO)!;

  it('arriva con il riquadro giusto e cinque vertici', () => {
    expect(f).not.toBeNull();
    expect(f.netta.larghezza).toBeCloseTo(400, 0);
    expect(f.netta.altezza).toBeCloseTo(345, 0);
    expect(f.verticiNetti).toHaveLength(5);
    expect(f.rettangolare).toBe(false);
  });

  it('e porta il contorno disegnato sulla foto, vertice per vertice', () => {
    expect(f.contorno).toHaveLength(5);
    expect(f.contorno.map((p) => [p.x, p.y])).toEqual(MURO);
  });

  it('senza abbondanze la sagoma di taglio è quella netta', () => {
    expect(f.taglio.larghezza).toBeCloseTo(f.netta.larghezza, 6);
    expect(f.taglio.altezza).toBeCloseTo(f.netta.altezza, 6);
  });

  it('con le abbondanze il pezzo cresce, e cresce dalla parte giusta', () => {
    // dieci centimetri di abbondanza in fondo al montante sinistro: il
    // PAVIMENTO scende di dieci, il montante la sua misura ce l'ha scritta
    const con = formaDaDividere(parete({ '4-0': [0, 10] }), FOTO)!;
    expect(con.taglio.altezza).toBeCloseTo(355, 0);
    expect(con.taglio.larghezza).toBeCloseTo(400, 0);
    expect(con.abbondanze.sotto + con.abbondanze.sopra).toBeCloseTo(10, 0);
  });
});

describe('i teli di una parete a cinque lati', () => {
  const dati = pannelliDellaForma(pareteDivisa(), FOTO)!;

  it('si contano: tre', () => {
    expect(dati).not.toBeNull();
    expect(dati.pannelli).toHaveLength(3);
    expect(dati.giunti).toEqual([135, 270]);
  });

  it('e nella distinta arrivano con la loro sagoma vera, non squadrati', () => {
    const teli = pannelliTaglio(pareteDivisa(), FOTO)!;
    expect(teli).toHaveLength(3);
    // sotto una falda diritta due teli su tre sono trapezi rettangoli, e il
    // terzo — quello che contiene lo spigolo del soffitto — ha cinque lati
    const forme = teli.map((t) => t.sagoma?.forma);
    expect(forme.filter((f) => f === 'trapezioR')).toHaveLength(2);
    expect(forme.filter((f) => f === 'quad')).toHaveLength(1);
  });

  it('e rifanno la parete intera: niente materiale perso per strada', () => {
    const teli = pannelliTaglio(pareteDivisa(), FOTO)!;
    const area = teli.reduce((s, t) => {
      const sg = t.sagoma;
      if (!sg) return s + t.larghezza * t.altezza;
      return (
        s +
        areaForma({
          forma: sg.forma,
          larghezza: sg.d1,
          altezza: sg.d2,
          misura3: sg.d3,
          vertici: sg.vertici
        })
      );
    }, 0);
    // la parete in millimetri: 4000 × 3450 meno il triangolo sotto la falda,
    // più i sormonti (tre teli, due giunzioni da 10 mm)
    const parete = 4000 * 3450 - (3300 * 1210) / 2;
    expect(area / parete).toBeGreaterThan(1);
    expect(area / parete).toBeLessThan(1.02);
  });

  it('le giunzioni si disegnano sulla foto: prima non si vedevano affatto', () => {
    const prim = primitivePannelli(pareteDivisa(), 'G1', FOTO);
    expect(prim.length).toBeGreaterThan(0);
  });
});

/**
 * IL TELO DI BORDO ALTO ZERO.
 *
 * Trovato guardando lo schermo, non le prove: nell'ambiente di divisione il
 * primo telo di questa parete era scritto «200,5 × 0 | 297,22 cm». Zero.
 *
 * Una polilinea disegnata a dito su una foto non viene mai a piombo: un pixel
 * di disegno su una parete di tre metri e mezzo sono tre millimetri di
 * pendenza, e la sagoma ricostruita se li porta dietro. `bordiSagoma` chiedeva
 * che un lato fosse parallelo al taglio entro un MILIONESIMO per riconoscerlo
 * come lato di testa: con tre millimetri di pendenza non lo riconosceva più, e
 * al bordo del pezzo trovava solo lo spigolo — un punto, quindi zero di
 * traverso. Adesso la tolleranza è quella del banco: sotto l'uno per cento di
 * quanto il pezzo è lungo, il lato sta sulla linea di taglio.
 */
describe('la parete fotografata di tre quarti', () => {
  /** la stessa camera, ripresa da sinistra: i punti sulla foto sono in prospettiva */
  const SULLA_FOTO: Array<[number, number]> = [
    [300, 180],
    [456, 202],
    [1139, 519],
    [1120, 900],
    [320, 820]
  ];
  /** il piano di riferimento: un rettangolo VERO sul muro, 400 × 224 */
  const CONPIANO = {
    scala: null,
    piano: {
      punti: [
        { x: 307, y: 414 },
        { x: 1139, y: 519 },
        { x: 1120, y: 900 },
        { x: 320, y: 820 }
      ] as [Punto, Punto, Punto, Punto],
      larghezzaReale: 400,
      altezzaReale: 224,
      unita: 'cm' as const,
      celle: 1
    },
    piani: undefined
  };
  const inProspettiva = (pannelli?: unknown) =>
    ({
      ...parete(),
      punti: SULLA_FOTO.map(([x, y]) => ({ x, y })),
      ...(pannelli ? { pannelli } : {})
    }) as unknown as QuotaPoligono;

  it('il piano di riferimento la raddrizza: 400 × 345, non una figura storta', () => {
    const f = formaDaDividere(inProspettiva(), CONPIANO)!;
    expect(f).not.toBeNull();
    // un pixel di disegno su quattro metri: il centimetro non si discute
    expect(f.netta.larghezza).toBeCloseTo(400, 0);
    expect(f.netta.altezza).toBeCloseTo(345, 0);
  });

  it('e i teli di bordo sono alti quanto i montanti, non zero', () => {
    const q = inProspettiva({ asse: 'verticale', sormonto: 1, verso: 'centro', giunti: [200] });
    const dati = pannelliDellaForma(q, CONPIANO)!;
    expect(dati.pannelli).toHaveLength(2);
    // le due misure di traverso di ogni telo: ai capi ci sono i montanti
    // misurati, 345 a sinistra e 224 a destra
    const capi = dati.pannelli.map((p) => [
      bordiSagoma(dati.forma.verticiTaglio, 'verticale', p.inizio),
      bordiSagoma(dati.forma.verticiTaglio, 'verticale', p.fine)
    ]);
    const alto = (b: { da: number; a: number } | null) => (b ? b.a - b.da : 0);
    expect(alto(capi[0][0])).toBeCloseTo(345, 0);
    expect(alto(capi[1][1])).toBeCloseTo(224, 0);
  });
});

describe('l’omografia di una sagoma, a quanti vertici ha', () => {
  const quattro: Punto[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 }
  ];
  const sullaFoto: Punto[] = [
    { x: 10, y: 20 },
    { x: 210, y: 40 },
    { x: 200, y: 180 },
    { x: 20, y: 160 }
  ];

  it('con quattro corrispondenze è quella di sempre', () => {
    const a = omografiaSagoma(quattro, sullaFoto)!;
    const b = calcolaOmografia(quattro, sullaFoto);
    expect(a).not.toBeNull();
    for (let i = 0; i < 9; i++) expect(a[i]).toBeCloseTo(b[i], 9);
  });

  it('con cinque manda ogni vertice dove deve andare', () => {
    // un pentagono e la sua immagine attraverso un'omografia nota: il conto
    // deve ritrovarla, qualunque quaterna scelga
    const H = calcolaOmografia(quattro, sullaFoto);
    const cinque: Punto[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 100, y: 25 },
      { x: 100, y: 80 },
      { x: 0, y: 80 }
    ];
    const immagine = cinque.map((p) => applicaOmografia(H, p));
    const trovata = omografiaSagoma(cinque, immagine)!;
    expect(trovata).not.toBeNull();
    for (let i = 0; i < cinque.length; i++) {
      const q = applicaOmografia(trovata, cinque[i]);
      expect(q.x, `vertice ${i}`).toBeCloseTo(immagine[i].x, 6);
      expect(q.y, `vertice ${i}`).toBeCloseTo(immagine[i].y, 6);
    }
  });

  it('con tre vertici non si inventa niente', () => {
    expect(omografiaSagoma(quattro.slice(0, 3), sullaFoto.slice(0, 3))).toBeNull();
  });

  it('e nemmeno con vertici tutti in fila', () => {
    const fila: Punto[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 }
    ];
    expect(omografiaSagoma(fila, fila)).toBeNull();
  });
});
