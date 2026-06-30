import { describe, expect, it } from 'vitest';
import { traslaAnnotazione } from '../fabbrica';
import { primitiveForma, primitiveQuotaTecnica } from '../../geometry/primitive';
import {
  applicaGeometria,
  applicaOffsetSerie,
  ascissaSuGuida,
  direzioneSerie,
  generaParallelo,
  generaProgressiva,
  generaSerie,
  ricalcolaValori,
  ricalcolaValoriSerie
} from '../../geometry/quotaTecnica';
import type { Forma, Punto, QuotaTecnica } from '../../db/types';

const fotoScala = { scala: { px: 100, reale: 50, unita: 'cm' as const }, piano: null };

const stile = { colore: '#1a73e8', spessore: 3, dimensioneTesto: 24 };

function forma(parz: Partial<Forma>): Forma {
  return {
    id: 'f',
    fotoId: 'foto',
    tipo: 'forma',
    forma: 'linea',
    punti: [],
    chiusa: false,
    partePerimetro: false,
    zIndex: 1,
    stile,
    ...parz
  };
}

describe('quotatura tecnica — modello dati additivo', () => {
  it('trasla una Forma spostando tutti i vertici', () => {
    const f: Forma = {
      id: 'f1',
      fotoId: 'foto',
      tipo: 'forma',
      forma: 'poligono',
      punti: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ],
      chiusa: true,
      partePerimetro: false,
      zIndex: 1,
      stile
    };
    const t = traslaAnnotazione(f, 5, -3) as Forma;
    expect(t.tipo).toBe('forma');
    expect(t.punti).toEqual([
      { x: 5, y: -3 },
      { x: 15, y: -3 },
      { x: 15, y: 7 }
    ]);
  });

  it('trasla una QuotaTecnica spostando guida, punti, quote ed elementi', () => {
    const q: QuotaTecnica = {
      id: 'q1',
      fotoId: 'foto',
      tipo: 'quotaTecnica',
      sottotipo: 'serie',
      lineaGuida: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      verso: 'sinistra',
      unita: 'cm',
      puntiOriginali: [
        { x: 10, y: 0 },
        { x: 40, y: 0 }
      ],
      quote: [
        { p1: { x: 10, y: 0 }, p2: { x: 40, y: 0 }, valore: 30, orientamento: 'allineata', offset: 20 }
      ],
      foro: { centro: { x: 60, y: 0 }, raggioPx: 5, raggioReale: null, diametroReale: null, modo: 'diametro' },
      partePerimetro: true,
      zIndex: 1,
      stile
    };
    const t = traslaAnnotazione(q, 2, 7) as QuotaTecnica;
    expect(t.lineaGuida).toEqual({ a: { x: 2, y: 7 }, b: { x: 102, y: 7 } });
    expect(t.puntiOriginali).toEqual([
      { x: 12, y: 7 },
      { x: 42, y: 7 }
    ]);
    expect(t.quote[0].p1).toEqual({ x: 12, y: 7 });
    expect(t.quote[0].p2).toEqual({ x: 42, y: 7 });
    expect(t.foro?.centro).toEqual({ x: 62, y: 7 });
  });
});

describe('primitiveForma — rendering forme generiche', () => {
  it('linea: una primitiva linea', () => {
    const prim = primitiveForma(forma({ forma: 'linea', punti: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }));
    expect(prim.some((p) => p.kind === 'linea')).toBe(true);
  });

  it('cerchio: raggio = distanza centro→bordo', () => {
    const prim = primitiveForma(forma({ forma: 'cerchio', punti: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }));
    const c = prim.find((p) => p.kind === 'cerchio') as { kind: 'cerchio'; raggio: number };
    expect(c?.raggio).toBeCloseTo(5);
  });

  it('rettangolo con riempimento: fondo + contorno', () => {
    const prim = primitiveForma(
      forma({ forma: 'rettangolo', punti: [{ x: 0, y: 0 }, { x: 10, y: 6 }], riempimento: '#1a73e8' })
    );
    expect(prim.some((p) => p.kind === 'rettangolo')).toBe(true); // riempimento
    expect(prim.some((p) => p.kind === 'polilinea')).toBe(true); // contorno
  });

  it('poligono: contorno chiuso', () => {
    const prim = primitiveForma(
      forma({ forma: 'poligono', chiusa: true, punti: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }] })
    );
    const pl = prim.find((p) => p.kind === 'polilinea') as { kind: 'polilinea'; punti: number[] };
    // 3 vertici + ritorno al primo = 4 punti (8 coordinate)
    expect(pl.punti.length).toBe(8);
  });
});

describe('generaSerie — catena di quote in serie', () => {
  it('ordina i punti lungo la guida e crea una quota per coppia consecutiva', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 40, y: 0 }
    ]; // volutamente fuori ordine
    const r = generaSerie(punti, fotoScala, { unita: 'cm', offset: 20, verso: 'sinistra' });
    expect(r.quote).toHaveLength(2);
    expect(r.puntiOrdinati.map((p) => p.x)).toEqual([0, 40, 80]);
    // 40 px → 40·50/100 = 20 cm per ogni tratto
    expect(r.quote[0].valore).toBeCloseTo(20);
    expect(r.quote[1].valore).toBeCloseTo(20);
  });

  it('il verso destra inverte il segno dell’offset', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const sx = generaSerie(punti, fotoScala, { unita: 'cm', offset: 30, verso: 'sinistra' });
    const dx = generaSerie(punti, fotoScala, { unita: 'cm', offset: 30, verso: 'destra' });
    expect(sx.quote[0].offset).toBeCloseTo(30);
    expect(dx.quote[0].offset).toBeCloseTo(-30);
  });

  it('senza calibrazione i valori restano null', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 }
    ];
    const r = generaSerie(punti, { scala: null, piano: null }, {
      unita: 'cm',
      offset: 10,
      verso: 'sinistra'
    });
    expect(r.quote[0].valore).toBeNull();
  });

  it('direzioneSerie e ascissaSuGuida descrivono la guida primo→ultimo', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 30, y: 0 }
    ];
    const d = direzioneSerie(punti);
    expect(d.x).toBeCloseTo(1);
    expect(d.y).toBeCloseTo(0);
    expect(ascissaSuGuida(punti[2], punti[0], d)).toBeCloseTo(30);
  });

  it('ricalcolaValoriSerie ed applicaOffsetSerie aggiornano le quote esistenti', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const { quote } = generaSerie(punti, fotoScala, { unita: 'cm', offset: 20, verso: 'sinistra' });
    // 100 px → 50 cm; in mm → 500
    const inMm = ricalcolaValoriSerie(quote, fotoScala, 'mm');
    expect(inMm[0].valore).toBeCloseTo(500);
    const spostate = applicaOffsetSerie(quote, 45, 'destra');
    expect(spostate[0].offset).toBeCloseTo(-45);
  });
});

describe('primitiveQuotaTecnica — rendering serie', () => {
  function serie(): QuotaTecnica {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 250, y: 0 }
    ];
    const { lineaGuida, quote } = generaSerie(punti, fotoScala, {
      unita: 'cm',
      offset: 40,
      verso: 'sinistra'
    });
    return {
      id: 's1',
      fotoId: 'foto',
      tipo: 'quotaTecnica',
      sottotipo: 'serie',
      lineaGuida,
      verso: 'sinistra',
      unita: 'cm',
      valoreAuto: true,
      puntiOriginali: punti,
      quote,
      partePerimetro: false,
      zIndex: 1,
      stile
    };
  }

  it('produce linea di quota, estensioni e un testo per ogni tratto', () => {
    const prim = primitiveQuotaTecnica(serie());
    expect(prim.some((p) => p.kind === 'linea')).toBe(true);
    // un’etichetta di valore per ciascuno dei 2 tratti
    expect(prim.filter((p) => p.kind === 'testo')).toHaveLength(2);
  });

  it('le sottotipologie non ancora implementate non disegnano nulla', () => {
    const q = { ...serie(), sottotipo: 'foro' as const };
    expect(primitiveQuotaTecnica(q)).toHaveLength(0);
  });
});

describe('generaParallelo — quote da un’origine comune', () => {
  const punti: Punto[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 250, y: 0 }
  ];

  it('quota ogni punto dall’origine e impila gli offset a base + i·passo', () => {
    const r = generaParallelo(punti, fotoScala, {
      unita: 'cm',
      offset: 40,
      passo: 20,
      verso: 'sinistra',
      origineEstremo: 'inizio'
    });
    // origine = primo punto; altri due punti → 2 quote
    expect(r.quote).toHaveLength(2);
    expect(r.quote.every((q) => q.p1.x === 0)).toBe(true);
    // offset impilati: 40, 60
    expect(r.quote[0].offset).toBeCloseTo(40);
    expect(r.quote[1].offset).toBeCloseTo(60);
    // valori = distanza dall’origine: 100px→50cm, 250px→125cm
    expect(r.quote[0].valore).toBeCloseTo(50);
    expect(r.quote[1].valore).toBeCloseTo(125);
  });

  it('origine = fine usa l’ultimo punto come origine', () => {
    const r = generaParallelo(punti, fotoScala, {
      unita: 'cm',
      offset: 40,
      passo: 20,
      verso: 'sinistra',
      origineEstremo: 'fine'
    });
    expect(r.quote.every((q) => q.p1.x === 250)).toBe(true);
  });
});

describe('generaProgressiva — ordinate con segno dallo zero', () => {
  it('lo zero non genera quota; i valori sono la distanza con segno', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 250, y: 0 }
    ];
    const r = generaProgressiva(punti, fotoScala, {
      unita: 'cm',
      offset: 40,
      verso: 'sinistra',
      origineEstremo: 'inizio'
    });
    // 3 punti, zero escluso → 2 ordinate
    expect(r.quote).toHaveLength(2);
    expect(r.quote.every((q) => q.p1.x === 0)).toBe(true);
    expect(r.quote[0].valore).toBeCloseTo(50);
    expect(r.quote[1].valore).toBeCloseTo(125);
  });

  it('con zero = fine le ordinate diventano negative (a monte dello zero)', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const r = generaProgressiva(punti, fotoScala, {
      unita: 'cm',
      offset: 40,
      verso: 'sinistra',
      origineEstremo: 'fine'
    });
    // zero = punto a x=100; l’altro punto è a sinistra → valore negativo
    expect(r.quote).toHaveLength(1);
    expect(r.quote[0].valore).toBeCloseTo(-50);
  });

  it('ricalcolaValori conserva il segno della progressiva al cambio unità', () => {
    const punti: Punto[] = [
      { x: 100, y: 0 },
      { x: 0, y: 0 }
    ];
    const q = generaProgressiva(punti, fotoScala, {
      unita: 'cm',
      offset: 40,
      verso: 'sinistra',
      origineEstremo: 'fine'
    });
    const quota = { sottotipo: 'progressiva' as const, quote: q.quote, lineaGuida: q.lineaGuida };
    const inMm = ricalcolaValori(quota, fotoScala, 'mm');
    // 50 cm con segno negativo → -500 mm
    expect(inMm[0].valore).toBeCloseTo(-500);
  });
});

describe('applicaGeometria — offset per sottotipo', () => {
  it('parallelo impila, serie/progressiva mantengono offset costante', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 250, y: 0 }
    ];
    const par = generaParallelo(punti, fotoScala, {
      unita: 'cm',
      offset: 40,
      passo: 20,
      verso: 'sinistra',
      origineEstremo: 'inizio'
    });
    const ri = applicaGeometria({ sottotipo: 'parallelo', quote: par.quote }, {
      offset: 30,
      passo: 15,
      verso: 'destra'
    });
    // destra → segno negativo; impilati: -(30), -(45)
    expect(ri[0].offset).toBeCloseTo(-30);
    expect(ri[1].offset).toBeCloseTo(-45);

    const ser = generaSerie(punti, fotoScala, { unita: 'cm', offset: 40, verso: 'sinistra' });
    const ris = applicaGeometria({ sottotipo: 'serie', quote: ser.quote }, {
      offset: 30,
      passo: 15,
      verso: 'sinistra'
    });
    expect(ris.every((q) => Math.abs(q.offset) === 30)).toBe(true);
  });
});

describe('primitiveQuotaTecnica — parallelo e progressiva', () => {
  const punti: Punto[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 250, y: 0 }
  ];
  function quotaDa(sottotipo: 'parallelo' | 'progressiva'): QuotaTecnica {
    const r =
      sottotipo === 'parallelo'
        ? generaParallelo(punti, fotoScala, {
            unita: 'cm',
            offset: 40,
            passo: 20,
            verso: 'sinistra',
            origineEstremo: 'inizio'
          })
        : generaProgressiva(punti, fotoScala, {
            unita: 'cm',
            offset: 40,
            verso: 'sinistra',
            origineEstremo: 'inizio'
          });
    return {
      id: 'q',
      fotoId: 'foto',
      tipo: 'quotaTecnica',
      sottotipo,
      lineaGuida: r.lineaGuida,
      verso: 'sinistra',
      unita: 'cm',
      origineEstremo: 'inizio',
      puntiOriginali: punti,
      quote: r.quote,
      partePerimetro: false,
      zIndex: 1,
      stile
    };
  }

  it('parallelo: una linea di quota e un testo per ogni punto + marcatore origine', () => {
    const prim = primitiveQuotaTecnica(quotaDa('parallelo'));
    expect(prim.filter((p) => p.kind === 'testo')).toHaveLength(2);
    expect(prim.some((p) => p.kind === 'cerchio')).toBe(true); // marcatore origine
  });

  it('progressiva: linea di riferimento, marcatore zero e un valore per ordinata', () => {
    const prim = primitiveQuotaTecnica(quotaDa('progressiva'));
    expect(prim.filter((p) => p.kind === 'testo')).toHaveLength(2);
    expect(prim.some((p) => p.kind === 'cerchio')).toBe(true); // marcatore zero
    expect(prim.some((p) => p.kind === 'linea')).toBe(true); // riferimento
  });
});

describe('primitiveQuotaTecnica — datum (Fase 4)', () => {
  function datum(lettera: string): QuotaTecnica {
    return {
      id: 'd',
      fotoId: 'foto',
      tipo: 'quotaTecnica',
      sottotipo: 'datum',
      verso: 'sinistra',
      unita: 'cm',
      etichetta: lettera,
      riferimento: { riferimentoTipo: 'puntoZero', punti: [{ x: 100, y: 200 }] },
      puntiOriginali: [{ x: 100, y: 200 }],
      quote: [],
      partePerimetro: false,
      zIndex: 1,
      stile
    };
  }

  it('disegna triangolo, riquadro e la lettera del datum', () => {
    const prim = primitiveQuotaTecnica(datum('A'));
    expect(prim.some((p) => p.kind === 'poligono')).toBe(true); // triangolo
    expect(prim.some((p) => p.kind === 'rettangolo')).toBe(true); // riquadro
    const t = prim.find((p) => p.kind === 'testo') as { kind: 'testo'; testo: string };
    expect(t.testo).toBe('A');
  });

  it('il triangolo ha l’apice sul punto di riferimento', () => {
    const prim = primitiveQuotaTecnica(datum('B'));
    const tri = prim.find((p) => p.kind === 'poligono') as { kind: 'poligono'; punti: number[] };
    // primo vertice = apice = punto datum (100, 200)
    expect(tri.punti[0]).toBeCloseTo(100);
    expect(tri.punti[1]).toBeCloseTo(200);
  });
});

describe('linee di estensione editabili (Fase 4)', () => {
  function serie(estensioniVisibili?: boolean): QuotaTecnica {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 250, y: 0 }
    ];
    const r = generaSerie(punti, fotoScala, { unita: 'cm', offset: 40, verso: 'sinistra' });
    return {
      id: 's',
      fotoId: 'foto',
      tipo: 'quotaTecnica',
      sottotipo: 'serie',
      lineaGuida: r.lineaGuida,
      verso: 'sinistra',
      unita: 'cm',
      estensioniVisibili,
      puntiOriginali: punti,
      quote: r.quote,
      partePerimetro: false,
      zIndex: 1,
      stile
    };
  }

  it('nascondere le estensioni riduce le linee disegnate', () => {
    const con = primitiveQuotaTecnica(serie(undefined)).filter((p) => p.kind === 'linea').length;
    const senza = primitiveQuotaTecnica(serie(false)).filter((p) => p.kind === 'linea').length;
    expect(senza).toBeLessThan(con);
  });
});
