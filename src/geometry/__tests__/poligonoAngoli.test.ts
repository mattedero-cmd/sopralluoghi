import { describe, expect, it } from 'vitest';
import { poligonoDaAngoliRetti } from '../poligonoAngoli';
import { poligonoConvesso, type PuntoSagoma } from '../sagome';

/**
 * LA CAMERA D'ALBERGO MISURATA SENZA PIANO DI RIFERIMENTO.
 *
 * Il rilievo di una camera è una polilinea: il muro sopra la testiera, il
 * gradino del controsoffitto, lo stipite. Per farne un pezzo da tagliare
 * serviva il PIANO DI RIFERIMENTO — quattro spigoli visibili di un rettangolo
 * vero — e in una camera col letto in mezzo gli spigoli bassi non si vedono.
 * Dopo tre ore di misure, chiedere anche quello è chiedere troppo.
 *
 * Ma gli angoli retti in una stanza si sanno senza misurarli. Dichiarandoli,
 * la figura esce da quelli più le quote, e il disegno serve soltanto a dire da
 * che parte gira ogni spigolo.
 */

/** quanto è lungo il lato i del poligono */
const lato = (v: PuntoSagoma[], i: number) => {
  const a = v[i];
  const b = v[(i + 1) % v.length];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};

/** l'angolo interno allo spigolo i, in gradi */
const angolo = (v: PuntoSagoma[], i: number) => {
  const n = v.length;
  const p = v[(i + n - 1) % n];
  const c = v[i];
  const q = v[(i + 1) % n];
  const a1 = Math.atan2(p[1] - c[1], p[0] - c[0]);
  const a2 = Math.atan2(q[1] - c[1], q[0] - c[0]);
  let d = Math.abs(a1 - a2);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
};

/**
 * LA CAMERA DELLA FOTO, vertice per vertice come è stata disegnata a dito.
 *
 * Partendo dallo spigolo in basso a sinistra e girando: il montante sinistro
 * (200), la falda sopra la testiera (non quotata), un pezzetto corto (non
 * quotato), il soffitto piano (75), il gradino (24), ancora soffitto (76), il
 * montante destro (250) e il pavimento (340).
 */
const CAMERA = {
  // i punti come stanno sulla foto, in pixel: portano la prospettiva
  disegno: [
    [155, 770], // 0 piede sinistro
    [145, 345], // 1 dove comincia la falda
    [573, 237], // 2 dove la falda finisce
    [555, 172], // 3 spigolo del pezzetto corto
    [705, 165], // 4 fine del soffitto piano
    [730, 218], // 5 piede del gradino
    [895, 222], // 6 spigolo in alto a destra
    [885, 772] // 7 piede destro
  ] as PuntoSagoma[],
  //        0:200  1:falda 2:corto 3:75  4:24  5:76  6:250  7:340
  lati: [200, null, null, 75, 24, 76, 250, 340] as Array<number | null>,
  // a squadro tutti tranne i due capi della falda (vertici 1 e 2)
  retti: [true, false, false, true, true, true, true, true]
};

describe('la camera dichiarata a squadro', () => {
  const e = poligonoDaAngoliRetti(CAMERA)!;

  it('la figura si chiude', () => {
    expect(e).not.toBeNull();
    expect(e.vertici).toHaveLength(8);
    expect(e.retti).toBe(6);
  });

  it('e le quote prese sul posto restano quelle: nessuna ha dovuto cedere', () => {
    expect(e.scarto).toBeLessThan(0.5);
    for (const [i, q] of CAMERA.lati.entries()) {
      if (q === null) continue;
      expect(lato(e.vertici, i), `il lato ${i} doveva restare ${q}`).toBeCloseTo(q, 1);
    }
  });

  it('gli spigoli dichiarati sono a novanta gradi davvero', () => {
    for (const [i, retto] of CAMERA.retti.entries()) {
      if (!retto) continue;
      expect(angolo(e.vertici, i), `lo spigolo ${i}`).toBeCloseTo(90, 3);
    }
  });

  it('e la parete esce in piedi, non di sghembo: niente piano di riferimento', () => {
    // il pavimento è il lato 7, da 340: dev'essere ORIZZONTALE
    const a = e.vertici[7];
    const b = e.vertici[0];
    expect(Math.abs(a[1] - b[1]), 'il pavimento non è in piano').toBeLessThan(0.05);
    // i due montanti sono verticali
    for (const i of [0, 6]) {
      const p = e.vertici[i];
      const q = e.vertici[(i + 1) % 8];
      expect(Math.abs(p[0] - q[0]), `il montante ${i} non è a piombo`).toBeLessThan(0.05);
    }
  });

  it('il riquadro è quello che dicono le misure: 340 di base, 274 di altezza', () => {
    const L = Math.max(...e.vertici.map((p) => p[0]));
    const A = Math.max(...e.vertici.map((p) => p[1]));
    // 340 il pavimento; in altezza il montante destro 250 più il gradino 24
    expect(L).toBeCloseTo(340, 1);
    expect(A).toBeCloseTo(274, 1);
  });

  it('e la falda, che nessuno ha misurato, esce dalle misure degli altri', () => {
    // da (0,200) sul montante sinistro fino al pezzetto corto sotto il soffitto
    const falda = lato(e.vertici, 1);
    expect(falda).toBeGreaterThan(100);
    expect(falda).toBeLessThan(340);
  });
});

describe('quello che il conto non deve fare', () => {
  it('senza nessuna quota non si inventa una misura', () => {
    const e = poligonoDaAngoliRetti({
      ...CAMERA,
      lati: CAMERA.lati.map(() => null)
    });
    expect(e).toBeNull();
  });

  it('senza nessun angolo dichiarato resta il disegno, e si vede', () => {
    const e = poligonoDaAngoliRetti({ ...CAMERA, retti: CAMERA.retti.map(() => false) })!;
    expect(e).not.toBeNull();
    expect(e.retti).toBe(0);
    // chiude lo stesso, ma la figura è quella storta del disegno
    expect(lato(e.vertici, 7)).toBeCloseTo(340, 0);
  });

  it('due vertici nello stesso punto non sono un giro', () => {
    const doppio = [...CAMERA.disegno];
    doppio[3] = [...doppio[2]] as PuntoSagoma;
    expect(poligonoDaAngoliRetti({ ...CAMERA, disegno: doppio })).toBeNull();
  });

  it('una dichiarazione su uno spigolo quasi dritto si lascia cadere', () => {
    // il disegno non sa dire da che parte si gira: meglio ignorarla che
    // indovinare il verso e ribaltare mezza figura
    const dritto: PuntoSagoma[] = [
      [0, 0],
      [100, 1],
      [200, 0],
      [200, 100],
      [0, 100]
    ];
    const e = poligonoDaAngoliRetti({
      disegno: dritto,
      lati: [100, 100, 100, 200, 100],
      retti: [false, true, false, true, true]
    });
    // lo spigolo 1 è quasi dritto: non viene contato fra quelli tenuti a squadro
    expect(e?.retti).toBe(2);
  });
});

describe('il rettangolo con un gradino, tutto a squadro', () => {
  /**
   * IL CASO CHE CAPITA PIÙ SPESSO: una parete con un risvolto, sei spigoli,
   * tutti a novanta. Qui non c'è niente da estrapolare — le misure e gli
   * angoli bastano da soli — e infatti bastano anche quando due lati non sono
   * stati scritti: li tira fuori la chiusura del perimetro.
   */
  const GRADINO = {
    disegno: [
      [0, 300],
      [0, 0],
      [200, 0],
      [200, 100],
      [400, 100],
      [400, 300]
    ] as PuntoSagoma[],
    retti: [true, true, true, true, true, true]
  };

  it('con tutte le quote torna il rettangolo col gradino', () => {
    const e = poligonoDaAngoliRetti({
      ...GRADINO,
      lati: [300, 200, 100, 200, 200, 400]
    })!;
    expect(e).not.toBeNull();
    expect(e.scarto).toBeLessThan(0.01);
    expect(Math.max(...e.vertici.map((p) => p[0]))).toBeCloseTo(400, 2);
    expect(Math.max(...e.vertici.map((p) => p[1]))).toBeCloseTo(300, 2);
  });

  it('e con due lati non scritti li ricava dal giro', () => {
    const e = poligonoDaAngoliRetti({
      ...GRADINO,
      // mancano il lato 2 (100) e il lato 5 (400, il fondo)
      lati: [300, 200, null, 200, 200, null]
    })!;
    expect(e).not.toBeNull();
    expect(lato(e.vertici, 2), 'il lato non scritto').toBeCloseTo(100, 2);
    expect(lato(e.vertici, 5), 'il fondo non scritto').toBeCloseTo(400, 2);
  });

  it('se una quota è sbagliata il perimetro non torna, e lo dice', () => {
    // il fondo dichiarato 420 quando i pezzi sopra fanno 400: venti centimetri
    // che non esistono. Con tutti gli angoli a squadro non c'è dove nasconderli
    const e = poligonoDaAngoliRetti({
      ...GRADINO,
      lati: [300, 200, 100, 200, 200, 420]
    })!;
    expect(e).not.toBeNull();
    expect(e.scarto, 'lo scarto va detto, non nascosto').toBeGreaterThan(1);
  });
});

describe('la forma che ne esce è una forma vera', () => {
  it('il rettangolo col gradino è rientrante, e resta rientrante', () => {
    const e = poligonoDaAngoliRetti({
      disegno: [
        [0, 300],
        [0, 0],
        [200, 0],
        [200, 100],
        [400, 100],
        [400, 300]
      ] as PuntoSagoma[],
      lati: [300, 200, 100, 200, 200, 400],
      retti: [true, true, true, true, true, true]
    })!;
    // il gradino fa un angolo rientrante: la figura NON è convessa, ed è giusto
    expect(poligonoConvesso(e.vertici)).toBe(false);
  });

  /**
   * ANCHE LA CAMERA È RIENTRANTE, e non per un difetto: il soffitto fa un
   * gradino di ventiquattro centimetri, e un gradino è uno spigolo che
   * rientra. È il caso vero, quello della foto.
   *
   * Un pezzo rientrante il motore di piazzamento non lo sa trattare — le
   * sagome lì dentro sono tutte convesse — ma le sue FASCE VERTICALI sì: il
   * muro si divide in teli, e i teli tornano forme buone. Quello che conta è
   * che le fasce siano pezzi INTERI, non due ritagli staccati, e di un muro
   * con un gradino nel soffitto lo sono sempre: ogni verticale lo attraversa
   * una volta sola.
   */
  it('la camera rientra sul gradino del soffitto, e le sue fasce restano intere', async () => {
    const { fasciaDiPoligono, areaForma } = await import('../sagome');
    const e = poligonoDaAngoliRetti(CAMERA)!;
    expect(poligonoConvesso(e.vertici), 'il gradino la fa rientrare').toBe(false);

    const area = (v: PuntoSagoma[]) =>
      v.length >= 3 ? areaForma({ forma: 'quad', larghezza: 1, altezza: 1, vertici: v }) : 0;
    const intero = area(e.vertici);
    // tre fasce verticali, come le farebbe una bobina da 135
    const tagli: Array<[number, number]> = [
      [0, 135],
      [135, 270],
      [270, 340]
    ];
    let somma = 0;
    for (const [da, a] of tagli) {
      const f = fasciaDiPoligono(e.vertici, 0, da, a);
      expect(f.length, `la fascia ${da}-${a} è vuota`).toBeGreaterThanOrEqual(3);
      somma += area(f);
    }
    // le fasce rifanno il muro intero: nessun pezzo perso, nessuno contato due volte
    expect(somma / intero).toBeCloseTo(1, 4);
  });
});

/* ───────── dal rilievo al piano di taglio, senza piano di riferimento ───────── */

/** la camera come annotazione sulla foto, con le quote dove le ha prese */
function cameraAnnotata(angoliRetti?: number[]) {
  const quote: Array<[number, number, number]> = [
    [0, 1, 200],
    [3, 4, 75],
    [4, 5, 24],
    [5, 6, 76],
    [6, 7, 250],
    [7, 0, 340]
  ];
  return {
    id: 'c1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 0,
    punti: CAMERA.disegno.map(([x, y]) => ({ x, y })),
    segmenti: quote.map(([da, a, valore]) => ({ da, a, valore, offset: 0 })),
    unita: 'cm',
    stato: 'reale',
    etichetta: 'C1',
    ...(angoliRetti ? { angoliRetti } : {})
  } as never;
}

/** la foto come viene da una camera d'albergo: nessun piano di riferimento */
const SENZA_PIANO = { scala: { px: 1, reale: 1, unita: 'cm' as const }, piano: null };

describe('la camera arriva al piano di taglio', () => {
  it('senza dichiarare niente resta il rettangolo d’ingombro, come prima', async () => {
    const { pezziDaAnnotazioni } = await import('../pezziDaSopralluogo');
    const [p] = pezziDaAnnotazioni([cameraAnnotata()], SENZA_PIANO);
    // la polilinea non si ricostruisce: senza angoli e senza piano le
    // diagonali verrebbero dai pixel, e la figura non chiude convessa
    expect(p.sagoma?.vertici ?? null).toBeNull();
  });

  it('dichiarando gli spigoli arriva con la sua forma vera, e senza piano', async () => {
    const { pezziDaAnnotazioni } = await import('../pezziDaSopralluogo');
    const [p] = pezziDaAnnotazioni([cameraAnnotata([0, 3, 4, 5, 6, 7])], SENZA_PIANO);
    // in MILLIMETRI nel piano di taglio
    expect(p.larghezza).toBeCloseTo(3400, 0);
    expect(p.altezza).toBeCloseTo(2740, 0);
    expect(p.sagoma?.forma).toBe('quad');
    expect(p.sagoma?.vertici).toHaveLength(8);
  });

  it('e il pezzo è più piccolo del suo ingombro: è tutto il senso della cosa', async () => {
    const { pezziDaAnnotazioni } = await import('../pezziDaSopralluogo');
    const { areaForma } = await import('../sagome');
    const [p] = pezziDaAnnotazioni([cameraAnnotata([0, 3, 4, 5, 6, 7])], SENZA_PIANO);
    const area = areaForma({
      forma: 'quad',
      larghezza: p.sagoma!.d1,
      altezza: p.sagoma!.d2,
      vertici: p.sagoma!.vertici
    });
    // il triangolo sotto la falda e l'angolo del gradino non si tagliano
    expect(area / (3400 * 2740)).toBeLessThan(0.9);
    expect(area / (3400 * 2740)).toBeGreaterThan(0.8);
  });

  it('e divisa in teli verticali torna il muro intero, teli buoni', async () => {
    const { pannelliTaglio } = await import('../pezziDaSopralluogo');
    const { areaForma } = await import('../sagome');
    const conTeli = {
      ...(cameraAnnotata([0, 3, 4, 5, 6, 7]) as object),
      pannelli: { asse: 'verticale', sormonto: 0, verso: 'centro', giunti: [135, 270] }
    } as never;
    const teli = pannelliTaglio(conTeli, SENZA_PIANO)!;
    expect(teli).toHaveLength(3);
    const area = teli.reduce((s, t) => {
      const sg = t.sagoma;
      return (
        s +
        (sg
          ? areaForma({
              forma: sg.forma,
              larghezza: sg.d1,
              altezza: sg.d2,
              misura3: sg.d3,
              vertici: sg.vertici
            })
          : t.larghezza * t.altezza)
      );
    }, 0);
    // la parete vera: 340×274 meno il triangolo della falda e l'angolo del gradino
    const [p] = (await import('../pezziDaSopralluogo')).pezziDaAnnotazioni(
      [cameraAnnotata([0, 3, 4, 5, 6, 7])],
      SENZA_PIANO
    );
    const intera = areaForma({
      forma: 'quad',
      larghezza: p.sagoma!.d1,
      altezza: p.sagoma!.d2,
      vertici: p.sagoma!.vertici
    });
    /**
     * IL TELO DI MEZZO PRENDE IL GRADINO, e un telo che rientra non è una
     * forma che il taglio sappia trattare: quello si taglia SQUADRATO. Si
     * consuma un po' più di materiale — il 2,6% su questo muro — e mai meno,
     * che è il verso giusto in cui sbagliare: un telo più corto del muro non
     * copre, uno più lungo si rifila in posa.
     *
     * Mettendo una giunzione PROPRIO SUL GRADINO i teli tornerebbero tutti
     * convessi e non si butterebbe niente: è una cosa che chi divide può
     * fare a mano, spostando la pallina gialla.
     */
    expect(area / intera).toBeGreaterThan(0.999);
    expect(area / intera).toBeLessThan(1.05);
    // i due teli che non toccano il gradino escono con la loro forma vera
    const conSagoma = teli.filter((t) => t.sagoma).length;
    expect(conSagoma).toBe(2);
  });

  it('e mettendo la giunzione sul gradino non si butta più niente', async () => {
    const { pannelliTaglio, pezziDaAnnotazioni } = await import('../pezziDaSopralluogo');
    const { areaForma } = await import('../sagome');
    const area = (sg: { forma: string; d1: number; d2: number; d3?: number; vertici?: unknown }) =>
      areaForma({
        forma: sg.forma as never,
        larghezza: sg.d1,
        altezza: sg.d2,
        misura3: sg.d3,
        vertici: sg.vertici as never
      });
    // i due gradini del soffitto stanno a 189 e 264 cm dal piede sinistro:
    // ci si mettono sopra le giunzioni, e ogni telo torna una forma pulita
    const conTeli = {
      ...(cameraAnnotata([0, 3, 4, 5, 6, 7]) as object),
      pannelli: { asse: 'verticale', sormonto: 0, verso: 'centro', giunti: [189, 264] }
    } as never;
    const teli = pannelliTaglio(conTeli, SENZA_PIANO)!;
    expect(teli).toHaveLength(3);
    // adesso ogni telo ha la sua forma: nessuno è squadrato per ripiego
    expect(teli.every((t) => t.sagoma)).toBe(true);
    const somma = teli.reduce((s, t) => s + area(t.sagoma!), 0);
    const [p] = pezziDaAnnotazioni([cameraAnnotata([0, 3, 4, 5, 6, 7])], SENZA_PIANO);
    expect(somma / area(p.sagoma!)).toBeCloseTo(1, 3);
  });
});

/* ───────────── il quadrilatero: lo spigolo dà la diagonale ───────────── */

describe('la finestra fuori squadro, con uno spigolo dichiarato', () => {
  /**
   * Quattro lati non determinano un quadrilatero: tenendoli tutti uguali la
   * figura si deforma come un telaio snodato, e serve un quinto numero. Senza
   * diagonale quotata quel numero veniva dal DISEGNO — l'unica cosa dedotta
   * in tutta la forma. Uno spigolo dichiarato a novanta lo dà esatto.
   */
  const finestra = (angoliRetti?: number[], punti?: Array<[number, number]>) =>
    ({
      id: 'f1',
      fotoId: 'f',
      tipo: 'quotaPoligono',
      zIndex: 0,
      punti: (punti ?? [
        [0, 0],
        [120, 0],
        [120, 90],
        [0, 90]
      ]).map(([x, y]) => ({ x, y })),
      segmenti: [
        { da: 0, a: 1, valore: 120, offset: 0 },
        { da: 1, a: 2, valore: 90, offset: 0 },
        { da: 2, a: 3, valore: 120, offset: 0 },
        { da: 3, a: 0, valore: 90, offset: 0 }
      ],
      unita: 'cm',
      stato: 'reale',
      ...(angoliRetti ? { angoliRetti } : {})
    }) as never;

  it('senza dichiarazione la diagonale la stima il disegno', async () => {
    const { diagonaleQuadrilatero, latiQuadrilatero } = await import('../formaQuadrilatera');
    const { ordinaQuad } = await import('../punti');
    // un disegno schiacciato: la diagonale stimata esce più corta del vero
    const storto: Array<[number, number]> = [
      [0, 0],
      [120, 0],
      [118, 70],
      [2, 72]
    ];
    const a = finestra(undefined, storto);
    const quad = ordinaQuad((a as unknown as { punti: Array<{ x: number; y: number }> }).punti);
    const d = diagonaleQuadrilatero(a, quad as never, latiQuadrilatero(a)!, false)!;
    expect(d.quotata).toBe(false);
    // 150 sarebbe l'ipotenusa di 120 e 90: il disegno dà un altro numero
    expect(Math.abs(d.valore - 150)).toBeGreaterThan(5);
  });

  it('con lo spigolo dichiarato la diagonale è l’ipotenusa, esatta', async () => {
    const { diagonaleQuadrilatero, latiQuadrilatero } = await import('../formaQuadrilatera');
    const { ordinaQuad } = await import('../punti');
    const storto: Array<[number, number]> = [
      [0, 0],
      [120, 0],
      [118, 70],
      [2, 72]
    ];
    // lo spigolo in alto a sinistra (vertice 0 del disegno) è a squadro
    const a = finestra([0], storto);
    const quad = ordinaQuad((a as unknown as { punti: Array<{ x: number; y: number }> }).punti);
    const d = diagonaleQuadrilatero(a, quad as never, latiQuadrilatero(a)!, false)!;
    expect(d.valore).toBeCloseTo(Math.hypot(120, 90), 6);
  });

  it('e una diagonale QUOTATA vince comunque: è una misura, non una dichiarazione', async () => {
    const { diagonaleQuadrilatero, latiQuadrilatero } = await import('../formaQuadrilatera');
    const { ordinaQuad } = await import('../punti');
    const a = finestra([0]) as unknown as { segmenti: unknown[] };
    // la diagonale che comanda la forma va da basso-sinistra ad alto-destra
    a.segmenti = [...a.segmenti, { da: 1, a: 3, valore: 147, offset: 0 }];
    const quad = ordinaQuad(
      (a as unknown as { punti: Array<{ x: number; y: number }> }).punti
    );
    const d = diagonaleQuadrilatero(a as never, quad as never, latiQuadrilatero(a as never)!, false)!;
    expect(d.quotata).toBe(true);
    expect(d.valore).toBeCloseTo(147, 6);
  });
});
