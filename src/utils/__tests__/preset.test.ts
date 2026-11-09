import { describe, expect, it } from 'vitest';
import {
  PRESET_INIZIALE,
  conAbbondanzaDelPreset,
  conPresetApplicato,
  fasciaDelPreset,
  predefinitiTeli,
  riassuntoPreset,
  teliDelPreset
} from '../preset';
import { pannelliDi } from '../../geometry/pannelli';
import { abbondanzeSullAsse, formaDaDividere } from '../../geometry/formaQuadrilatera';
import { formaQuadrilatera } from '../../geometry/formaQuadrilatera';
import { latiDiTaglio } from '../../geometry/abbondanze';
import type {
  Annotazione,
  PresetProgetto,
  QuotaPoligono,
  QuotaRettangolo,
  SegmentoQuota,
  Unita
} from '../../db/types';

/**
 * IL PRESET DÀ I VALORI QUANDO LA COSA NASCE, E POI LA LASCIA LIBERA.
 *
 * È la regola che tiene insieme tutto: una forma appena disegnata prende
 * l'abbondanza del lavoro, ma se poi qualcuno la cambia a mano quella resta
 * sua, e cambiare il preset a lavoro avviato non riscrive niente di quello
 * che c'è già.
 */

const stile = { colore: '#fff', spessore: 2, dimensioneTesto: 20 };

const forma = (unita: Unita, abbPerimetro?: number): QuotaPoligono =>
  ({
    id: 'p1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 1,
    punti: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ],
    segmenti: [],
    ...(abbPerimetro === undefined ? {} : { abbPerimetro }),
    unita,
    stato: 'reale',
    stile
  }) as unknown as QuotaPoligono;

const PRESET: PresetProgetto = {
  abbPerimetroMm: 20,
  supporto: {
    modo: 'bobina',
    lastra: { larghezza: 2500, altezza: 1250 },
    bobina: { larghezza: 1370, metri: 50 },
    venatura: 'nessuna',
    lama: 0,
    margine: 10
  },
  teli: { sormontoMm: 10, verso: 'centro', asse: 'verticale', modo: 'fascia' }
};

describe('l’abbondanza alla forma che nasce', () => {
  it('venti millimetri diventano due centimetri su una forma in cm', () => {
    const a = conPresetApplicato(forma('cm'), PRESET) as QuotaPoligono;
    expect(a.abbPerimetro).toBe(2);
  });

  it('e venti millimetri su una forma in mm, e due centesimi su una in metri', () => {
    expect((conPresetApplicato(forma('mm'), PRESET) as QuotaPoligono).abbPerimetro).toBe(20);
    expect((conPresetApplicato(forma('m'), PRESET) as QuotaPoligono).abbPerimetro).toBe(0.02);
  });

  it('una forma che ha già la sua non viene toccata, nemmeno a zero', () => {
    expect((conPresetApplicato(forma('cm', 5), PRESET) as QuotaPoligono).abbPerimetro).toBe(5);
    expect((conPresetApplicato(forma('cm', 0), PRESET) as QuotaPoligono).abbPerimetro).toBe(0);
  });

  it('senza preset, o con l’abbondanza a zero, non si inventa niente', () => {
    expect((conPresetApplicato(forma('cm'), undefined) as QuotaPoligono).abbPerimetro).toBeUndefined();
    expect(
      (conPresetApplicato(forma('cm'), { ...PRESET, abbPerimetroMm: 0 }) as QuotaPoligono)
        .abbPerimetro
    ).toBeUndefined();
  });

  it('su quello che non è una forma non si scrive', () => {
    const quota = {
      id: 'q',
      fotoId: 'f',
      tipo: 'quota',
      sottotipo: 'orizzontale',
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      offset: 0,
      valore: 100,
      unita: 'cm',
      posizioneTesto: 'sopra',
      zIndex: 1,
      stato: 'reale',
      stile
    } as unknown as Annotazione;
    expect(conPresetApplicato(quota, PRESET)).toBe(quota);
  });
});

/**
 * L'ABBONDANZA PER BASE E ALTEZZA.
 *
 * «Due di lato per entrare sotto i fermavetro, cinque sopra e sotto per
 * avere da tirare»: due numeri, non uno. Vanno a finire sulle due quote
 * della forma — che è dove li scriverebbe a mano chi misura — e da lì li
 * legge tutto il resto dell'app. Qui si controlla proprio quello: che la
 * finestra da 120 × 80 esca 124 × 86, e non 126 × 84.
 */

/** una finestra quotata base × altezza, come la fa il tasto rettangolo */
const finestra = (base: number, altezza: number, unita: Unita = 'cm'): QuotaPoligono =>
  ({
    id: 'r1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 1,
    punti: [
      { x: 0, y: 0 },
      { x: base, y: 0 },
      { x: base, y: altezza },
      { x: 0, y: altezza }
    ],
    segmenti: [
      { da: 0, a: 1, valore: base },
      { da: 0, a: 3, valore: altezza }
    ],
    unita,
    stato: 'reale',
    stile
  }) as unknown as QuotaPoligono;

const PRESET_BH: PresetProgetto = { abbSinistraMm: 20, abbDestraMm: 20, abbSopraMm: 30, abbSottoMm: 30 };
const segs = (a: Annotazione) => ((a as QuotaPoligono).segmenti ?? []) as SegmentoQuota[];

describe('l’abbondanza detta lato per lato', () => {
  it('va sulle due quote, non attorno', () => {
    const a = conPresetApplicato(finestra(120, 80), PRESET_BH);
    const [b, h] = segs(a);
    expect([b.abbInizio, b.abbFine]).toEqual([2, 2]);
    expect([h.abbInizio, h.abbFine]).toEqual([3, 3]);
    expect((a as QuotaPoligono).abbPerimetro).toBeUndefined();
  });

  it('e la finestra da 120 × 80 si taglia 124 × 86', () => {
    const forma = formaQuadrilatera(conPresetApplicato(finestra(120, 80), PRESET_BH));
    expect(forma?.taglio).toEqual({ larghezza: 124, altezza: 86 });
    expect(forma?.abbondanze).toEqual({ sinistra: 2, destra: 2, sopra: 3, sotto: 3 });
    // la stessa cosa detta lato per lato, che è quella che finisce in distinta
    expect(latiDiTaglio(conPresetApplicato(finestra(120, 80), PRESET_BH) as QuotaPoligono)).toEqual([
      124, 86
    ]);
  });

  it('un numero solo dei due lascia l’altro a zero', () => {
    const solaBase = conPresetApplicato(finestra(120, 80), { abbBaseMm: 20 });
    expect(formaQuadrilatera(solaBase)?.taglio).toEqual({ larghezza: 124, altezza: 80 });
    const solaAltezza = conPresetApplicato(finestra(120, 80), { abbAltezzaMm: 30 });
    expect(formaQuadrilatera(solaAltezza)?.taglio).toEqual({ larghezza: 120, altezza: 86 });
  });

  it('segue l’unità della forma come l’abbondanza attorno', () => {
    expect(segs(conPresetApplicato(finestra(1200, 800, 'mm'), PRESET_BH))[0].abbInizio).toBe(20);
    expect(segs(conPresetApplicato(finestra(1.2, 0.8, 'm'), PRESET_BH))[1].abbFine).toBe(0.03);
  });

  it('non guarda in che ordine è stato disegnato il rettangolo', () => {
    // stessa finestra partendo dall'angolo in basso a destra, girata al
    // contrario: la base è il lato 0→1 solo nei disegni ordinati
    const storta = {
      ...finestra(120, 80),
      punti: [
        { x: 120, y: 80 },
        { x: 0, y: 80 },
        { x: 0, y: 0 },
        { x: 120, y: 0 }
      ],
      segmenti: [
        { da: 1, a: 2, valore: 80 },
        { da: 2, a: 3, valore: 120 }
      ]
    } as unknown as QuotaPoligono;
    const a = conPresetApplicato(storta, PRESET_BH);
    expect(segs(a)[0].abbInizio).toBe(3); // 1→2 è un'altezza
    expect(segs(a)[1].abbInizio).toBe(2); // 2→3 è una base
    expect(formaQuadrilatera(a)?.taglio).toEqual({ larghezza: 124, altezza: 86 });
  });

  it('su una polilinea, dove una base non c’è, vale il più grande dei due', () => {
    const parete = {
      ...finestra(100, 100),
      punti: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 }
      ],
      segmenti: [{ da: 0, a: 1, valore: 100 }]
    } as unknown as QuotaPoligono;
    const a = conPresetApplicato(parete, PRESET_BH) as QuotaPoligono;
    expect(a.abbPerimetro).toBe(3);
    expect(segs(a)[0].abbInizio).toBeUndefined();
  });

  it('e sulla quota elemento, che di abbondanze ne ha una sola, lo stesso', () => {
    const elemento = {
      id: 'e1',
      fotoId: 'f',
      tipo: 'quotaRett',
      zIndex: 1,
      punti: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 80 },
        { x: 0, y: 80 }
      ],
      valoreBase: 120,
      valoreAltezza: 80,
      unita: 'cm',
      stato: 'reale',
      stile
    } as unknown as QuotaRettangolo;
    expect((conPresetApplicato(elemento, PRESET_BH) as QuotaRettangolo).abbPerimetro).toBe(3);
  });

  it('una forma che ha già un’abbondanza sulle sue quote non si tocca', () => {
    const sua = finestra(120, 80);
    sua.segmenti![0] = { ...sua.segmenti![0], abbInizio: 5 };
    const a = conPresetApplicato(sua, PRESET_BH);
    expect(segs(a)[0]).toEqual({ da: 0, a: 1, valore: 120, abbInizio: 5 });
    expect(segs(a)[1].abbFine).toBeUndefined();
  });

  it('quattro numeri diversi vanno ognuno al suo capo', () => {
    const a = conPresetApplicato(finestra(120, 80), {
      abbSinistraMm: 20,
      abbDestraMm: 50,
      abbSopraMm: 70,
      abbSottoMm: 0
    });
    const [b, h] = segs(a);
    expect([b.abbInizio, b.abbFine]).toEqual([2, 5]); // sinistra, destra
    expect([h.abbInizio, h.abbFine]).toEqual([7, undefined]); // sopra, e sotto a filo
    expect(formaQuadrilatera(a)?.abbondanze).toEqual({
      sinistra: 2,
      destra: 5,
      sopra: 7,
      sotto: 0
    });
    expect(formaQuadrilatera(a)?.taglio).toEqual({ larghezza: 127, altezza: 87 });
  });

  it('e li mette dalla parte giusta anche sul rettangolo disegnato al contrario', () => {
    const storta = {
      ...finestra(120, 80),
      punti: [
        { x: 120, y: 80 },
        { x: 0, y: 80 },
        { x: 0, y: 0 },
        { x: 120, y: 0 }
      ],
      // 1→2 è il montante di sinistra, 2→3 è la base in alto
      segmenti: [
        { da: 1, a: 2, valore: 80 },
        { da: 2, a: 3, valore: 120 }
      ]
    } as unknown as QuotaPoligono;
    const a = conPresetApplicato(storta, {
      abbSinistraMm: 20,
      abbDestraMm: 50,
      abbSopraMm: 70,
      abbSottoMm: 0
    });
    expect(formaQuadrilatera(a)?.abbondanze).toEqual({
      sinistra: 2,
      destra: 5,
      sopra: 7,
      sotto: 0
    });
  });

  it('un preset salvato quando i numeri erano due vale ancora', () => {
    const a = conPresetApplicato(finestra(120, 80), { abbBaseMm: 20, abbAltezzaMm: 30 });
    expect(formaQuadrilatera(a)?.taglio).toEqual({ larghezza: 124, altezza: 86 });
  });

  it('su una copia «solo etichetta» non si scrive: la misura è dell’originale', () => {
    const copia = { ...finestra(120, 80), id: 'c1', soloEtichetta: true } as unknown as QuotaPoligono;
    expect(conPresetApplicato(copia, PRESET_BH)).toBe(copia);
    expect(conAbbondanzaDelPreset(copia, PRESET_BH, true)).toBeNull();
  });

  it('e nemmeno se l’abbondanza sua è su un lato, a filo contro un muro', () => {
    const filo = finestra(120, 80);
    filo.segmenti![1] = { ...filo.segmenti![1], abbLato: 0 };
    expect(conPresetApplicato(filo, PRESET_BH)).toBe(filo);
  });
});

describe('il comando «applica a tutte»', () => {
  it('riscrive: quello che c’era va via, anche l’abbondanza attorno', () => {
    const vecchia = finestra(120, 80);
    vecchia.abbPerimetro = 10;
    vecchia.segmenti![0] = { ...vecchia.segmenti![0], abbLato: 7, abbFine: 9 };
    const a = conAbbondanzaDelPreset(vecchia, PRESET_BH, true) as QuotaPoligono;
    expect(a.abbPerimetro).toBeUndefined();
    expect(segs(a)[0]).toEqual({ da: 0, a: 1, valore: 120, abbInizio: 2, abbFine: 2 });
    // e il pezzo è quello del preset, non quello che vinceva prima
    expect(formaQuadrilatera(a)?.taglio).toEqual({ larghezza: 124, altezza: 86 });
  });

  it('un numero solo cancella le abbondanze per lato e mette il giro', () => {
    const vecchia = finestra(120, 80);
    vecchia.segmenti![0] = { ...vecchia.segmenti![0], abbLato: 7 };
    const a = conAbbondanzaDelPreset(vecchia, { abbPerimetroMm: 20 }, true) as QuotaPoligono;
    expect(a.abbPerimetro).toBe(2);
    expect(segs(a)[0].abbLato).toBeUndefined();
    expect(formaQuadrilatera(a)?.taglio).toEqual({ larghezza: 124, altezza: 84 });
  });

  it('a zero le toglie tutte, e non scrive niente dove non c’era niente', () => {
    const vecchia = finestra(120, 80);
    vecchia.abbPerimetro = 10;
    const a = conAbbondanzaDelPreset(vecchia, {}, true) as QuotaPoligono;
    expect(a.abbPerimetro).toBeUndefined();
    expect(conAbbondanzaDelPreset(finestra(120, 80), {}, true)).toBeNull();
  });

  it('e dice che non c’è niente da fare quando il valore è già quello', () => {
    const gia = conPresetApplicato(finestra(120, 80), PRESET_BH);
    expect(conAbbondanzaDelPreset(gia, PRESET_BH, true)).toBeNull();
  });
});

describe('la fascia del supporto', () => {
  it('è il rotolo meno i due margini, nell’unità della forma', () => {
    // bobina 1370, margine 10 per parte → 1350 mm → 135 cm
    expect(fasciaDelPreset(PRESET, 'cm').massimo).toBe(135);
    expect(fasciaDelPreset(PRESET, 'mm').massimo).toBe(1350);
    expect(fasciaDelPreset(PRESET, 'm').massimo).toBe(1.35);
  });

  it('di una lastra comanda il lato più lungo', () => {
    const lastre: PresetProgetto = {
      ...PRESET,
      supporto: { ...PRESET.supporto!, modo: 'lastre' }
    };
    expect(fasciaDelPreset(lastre, 'mm').massimo).toBe(2480);
    // il separatore delle migliaia lo mette la lingua del dispositivo: qui
    // si guarda quello che il testo deve DIRE, non come lo scrive
    expect(fasciaDelPreset(lastre, 'mm').fonteMassimo).toMatch(/^Lastra 2[.,]?500 mm del preset/);
  });

  it('senza supporto non si dice niente, e chi divide fa come prima', () => {
    expect(fasciaDelPreset(undefined, 'cm')).toEqual({});
    expect(fasciaDelPreset({ abbPerimetroMm: 20 }, 'cm')).toEqual({});
  });

  it('un margine che si mangia il rotolo non dà una fascia negativa', () => {
    const assurdo: PresetProgetto = {
      supporto: { ...PRESET.supporto!, bobina: { larghezza: 15, metri: 50 } }
    };
    expect(fasciaDelPreset(assurdo, 'mm')).toEqual({});
  });
});

describe('da dove parte una divisione nuova', () => {
  it('il sormonto segue l’unità della forma', () => {
    expect(predefinitiTeli(PRESET, 'mm')?.sormonto).toBe(10);
    expect(predefinitiTeli(PRESET, 'cm')?.sormonto).toBe(1);
    expect(predefinitiTeli(PRESET, 'm')?.sormonto).toBe(0.01);
  });

  it('verso, asse e modo passano com’erano', () => {
    const p = predefinitiTeli({ teli: { sormontoMm: 5, verso: 'avanti', asse: 'orizzontale', modo: 'uguali' } }, 'cm');
    expect(p).toEqual({ sormonto: 0.5, verso: 'avanti', asse: 'orizzontale', modo: 'uguali' });
  });

  it('senza preset dei teli non si impone niente', () => {
    expect(predefinitiTeli(undefined, 'cm')).toBeUndefined();
    expect(predefinitiTeli({ abbPerimetroMm: 20 }, 'cm')).toBeUndefined();
  });
});

/**
 * I TELI DEL PRESET, senza aprire l'ambiente di divisione.
 *
 * È il conto che il comando «applica a tutto» fa su ogni parete di un
 * albergo: la stessa fascia, lo stesso sormonto, lo stesso verso. La prova
 * che conta è una sola — nessun telo più largo del rotolo — perché un telo
 * che dal rotolo non esce è un pezzo buttato.
 */
describe('i teli del preset', () => {
  /** la larghezza di taglio del telo più largo, nell'unità della forma */
  const teloPiuLargo = (a: QuotaPoligono, preset: PresetProgetto): number => {
    const pann = teliDelPreset(a, null, preset)!;
    const forma = formaDaDividere(a, null)!;
    const dritto = pann.asse === 'verticale';
    const pannelli = pannelliDi(
      dritto ? forma.netta.larghezza : forma.netta.altezza,
      dritto ? forma.netta.altezza : forma.netta.larghezza,
      pann,
      abbondanzeSullAsse(forma, pann.asse)
    );
    return Math.max(...pannelli.map((x) => x.larghezza));
  };

  const CON_BOBINA: PresetProgetto = {
    ...PRESET,
    abbPerimetroMm: 20,
    teli: { sormontoMm: 10, verso: 'centro', asse: 'verticale', modo: 'fascia' }
  };

  it('una parete da quattro metri esce divisa, e nessun telo supera la fascia', () => {
    const parete = finestra(400, 250);
    const pann = teliDelPreset(conPresetApplicato(parete, CON_BOBINA), null, CON_BOBINA);
    expect(pann?.giunti.length).toBeGreaterThan(0);
    expect(pann?.asse).toBe('verticale');
    expect(pann?.sormonto).toBe(1); // 10 mm su una forma in cm
    // bobina 1370 meno due margini da 10 = 1350 mm = 135 cm
    expect(teloPiuLargo(conPresetApplicato(parete, CON_BOBINA) as QuotaPoligono, CON_BOBINA))
      .toBeLessThanOrEqual(135);
  });

  it('una finestra che ci sta nel rotolo non si divide affatto', () => {
    expect(teliDelPreset(conPresetApplicato(finestra(120, 80), CON_BOBINA), null, CON_BOBINA))
      .toBeNull();
  });

  it('«uguali» divide in parti uguali, ma sempre dentro la fascia', () => {
    const uguali: PresetProgetto = {
      ...CON_BOBINA,
      teli: { sormontoMm: 10, verso: 'centro', asse: 'verticale', modo: 'uguali' }
    };
    const parete = conPresetApplicato(finestra(400, 250), uguali) as QuotaPoligono;
    const pann = teliDelPreset(parete, null, uguali)!;
    const passi = [0, ...pann.giunti, 400].slice(1).map((v, i) => v - [0, ...pann.giunti][i]);
    for (const p of passi) expect(p).toBeCloseTo(passi[0], 6);
    expect(teloPiuLargo(parete, uguali)).toBeLessThanOrEqual(135);
  });

  it('teli orizzontali dividono l’altezza, non la base', () => {
    const sdraiati: PresetProgetto = {
      ...CON_BOBINA,
      teli: { sormontoMm: 10, verso: 'centro', asse: 'orizzontale', modo: 'fascia' }
    };
    const parete = conPresetApplicato(finestra(400, 250), sdraiati) as QuotaPoligono;
    const pann = teliDelPreset(parete, null, sdraiati)!;
    expect(pann.asse).toBe('orizzontale');
    // l'altezza è 250: le giunzioni ci stanno dentro
    for (const g of pann.giunti) expect(g).toBeLessThan(250);
    expect(teloPiuLargo(parete, sdraiati)).toBeLessThanOrEqual(135);
  });

  it('senza supporto nel preset non si inventa quanti teli fare', () => {
    expect(teliDelPreset(finestra(400, 250), null, { teli: CON_BOBINA.teli })).toBeNull();
    expect(teliDelPreset(finestra(400, 250), null, undefined)).toBeNull();
  });

  it('e una forma senza misure non si divide', () => {
    const muta = { ...finestra(400, 250), segmenti: [] } as unknown as QuotaPoligono;
    expect(teliDelPreset(muta, null, CON_BOBINA)).toBeNull();
  });
});

describe('la riga che riassume', () => {
  it('dice le tre cose, in italiano', () => {
    expect(riassuntoPreset(PRESET)).toMatch(
      /^2 cm attorno · bobina 1[.,]?370 · teli verticali, sormonto 10 mm$/
    );
  });

  it('e i quattro numeri li dice in italiano, senza ripetersi', () => {
    expect(riassuntoPreset(PRESET_BH)).toBe('2 cm di lato, 3 sopra e sotto');
    expect(riassuntoPreset({ abbSopraMm: 30, abbSottoMm: 30 })).toBe('3 cm sopra e sotto');
    expect(
      riassuntoPreset({ abbSinistraMm: 20, abbDestraMm: 20, abbSopraMm: 20, abbSottoMm: 20 })
    ).toBe('2 cm attorno');
    expect(
      riassuntoPreset({ abbSinistraMm: 20, abbDestraMm: 50, abbSopraMm: 70, abbSottoMm: 0 })
    ).toBe('sx 2, dx 5, sopra 7, sotto 0 cm');
    // i lati comandano: l'abbondanza attorno non si dice due volte
    expect(riassuntoPreset({ abbPerimetroMm: 20, abbSinistraMm: 50, abbDestraMm: 50 })).toBe(
      '5 cm di lato'
    );
  });

  it('di un preset vuoto non dice niente, e il tasto lo sa', () => {
    expect(riassuntoPreset(undefined)).toBeNull();
    expect(riassuntoPreset({})).toBeNull();
  });

  it('il preset di partenza è una bobina da 137, come in laboratorio', () => {
    expect(PRESET_INIZIALE.supporto.bobina.larghezza).toBe(1370);
    expect(PRESET_INIZIALE.teli.sormontoMm).toBe(10);
  });
});
