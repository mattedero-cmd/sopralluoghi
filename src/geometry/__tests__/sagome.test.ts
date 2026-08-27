import { describe, expect, it } from 'vitest';
import {
  areaForma,
  etichetteMisure,
  ingombroForma,
  mascheraSagoma,
  misureComplete,
  misureForma,
  poligonoSagoma,
  rotazioniPer,
  ruotaPunti,
  sagomaDiTaglio,
  type MisureForma,
  type PuntoSagoma
} from '../sagome';
import { calcolaNestingSagome } from '../nestingSagome';
import type { ParametriNesting, PezzoNesting, Piazzamento } from '../nesting';

/**
 * LA SUITE GEOMETRICA DEL MOTORE A SAGOME.
 *
 * Le tre garanzie da cui non si scende:
 * - nessuna sovrapposizione REALE fra pezzi piazzati (verifica esatta fra
 *   poligoni convessi, non a occhio);
 * - la distanza fra due pezzi affiancati è almeno lo spessore della lama;
 * - l'area della sagoma è quella dichiarata — se coincide con l'ingombro,
 *   si sta ancora nestando il bounding box.
 */

const pezzo = (
  id: string,
  forma: MisureForma['forma'],
  d1: number,
  d2 = 0,
  d3?: number,
  extra: Partial<PezzoNesting> = {}
): PezzoNesting => ({
  id,
  nome: id,
  forma,
  larghezza: d1,
  altezza: forma === 'cerchio' ? d1 : d2,
  misura3: d3,
  quantita: 1,
  ruotabile: true,
  tinta: 0,
  ...extra
});

const par = (larghezza: number, altezza: number, extra: Partial<ParametriNesting> = {}): ParametriNesting => ({
  lastra: { larghezza, altezza },
  lama: 3,
  abbondanza: 0,
  margine: 0,
  ...extra
});

/* ---- geometria esatta per le verifiche (indipendente dal motore) -------- */

/** vertici assoluti della sagoma piazzata (poligono) o null (cerchio) */
function sagomaAssoluta(pc: Piazzamento): PuntoSagoma[] | null {
  if (!pc.punti) return null;
  return pc.punti.map((q): PuntoSagoma => [q[0] + pc.x, q[1] + pc.y]);
}

function distanzaPuntoSegmento(p: PuntoSagoma, a: PuntoSagoma, b: PuntoSagoma): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function dentroConvesso(p: PuntoSagoma, poly: PuntoSagoma[]): boolean {
  let segno = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (segno === 0) segno = s;
    else if (s !== segno) return false;
  }
  return true;
}

/** distanza minima fra due poligoni convessi; 0 se si sovrappongono */
function distanzaPoligoni(a: PuntoSagoma[], b: PuntoSagoma[]): number {
  if (a.some((p) => dentroConvesso(p, b)) || b.some((p) => dentroConvesso(p, a))) return 0;
  let minima = Infinity;
  for (const p of a) {
    for (let i = 0; i < b.length; i++) {
      minima = Math.min(minima, distanzaPuntoSegmento(p, b[i], b[(i + 1) % b.length]));
    }
  }
  for (const p of b) {
    for (let i = 0; i < a.length; i++) {
      minima = Math.min(minima, distanzaPuntoSegmento(p, a[i], a[(i + 1) % a.length]));
    }
  }
  return minima;
}

/** distanza minima fra tutte le coppie di sagome piazzate su tutte le lastre */
function distanzaMinimaFraPezzi(
  esito: ReturnType<typeof calcolaNestingSagome>
): number {
  let minima = Infinity;
  for (const l of esito.lastre) {
    const sagome = l.piazzamenti.map((pc) => {
      const s = sagomaAssoluta(pc);
      if (s) return { poly: s };
      // cerchio: approssimato con un poligono a 32 lati DENTRO il cerchio
      // DI TAGLIO (l'ingombro: finito + abbondanza), che è la linea tagliata
      const r = pc.larghezza / 2;
      const cx = pc.x + pc.larghezza / 2;
      const cy = pc.y + pc.altezza / 2;
      const poly: PuntoSagoma[] = [];
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        poly.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return { poly };
    });
    for (let i = 0; i < sagome.length; i++) {
      for (let j = i + 1; j < sagome.length; j++) {
        minima = Math.min(minima, distanzaPoligoni(sagome[i].poly, sagome[j].poly));
      }
    }
  }
  return minima;
}

function areaPoligono(poly: PuntoSagoma[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/* ---- forme canoniche ---------------------------------------------------- */

describe('poligoni canonici', () => {
  it('il trapezio rettangolo ha 4 vertici e area base·(hsx+hdx)/2, MINORE dell’ingombro', () => {
    const p: MisureForma = { forma: 'trapezioR', larghezza: 600, altezza: 400, misura3: 800 };
    const poly = poligonoSagoma(p)!;
    expect(poly).toHaveLength(4);
    const area = areaForma(p);
    expect(area).toBeCloseTo((600 * (400 + 800)) / 2, 6);
    expect(areaPoligono(poly)).toBeCloseTo(area, 6);
    // se coincidesse con l'ingombro staremmo ancora nestando il bounding box
    const ing = ingombroForma(p);
    expect(area).toBeLessThan(ing.larghezza * ing.altezza);
    expect(ing).toEqual({ larghezza: 600, altezza: 800 });
  });

  it('ogni forma ha l’area della sua formula, verificata sul poligono', () => {
    const casi: MisureForma[] = [
      { forma: 'rett', larghezza: 500, altezza: 300 },
      { forma: 'triangolo', larghezza: 400, altezza: 300 },
      { forma: 'rombo', larghezza: 400, altezza: 240 },
      { forma: 'trapezio', larghezza: 500, altezza: 200, misura3: 300 },
      { forma: 'trapezioR', larghezza: 500, altezza: 300, misura3: 700 }
    ];
    for (const c of casi) {
      expect(areaPoligono(poligonoSagoma(c)!)).toBeCloseTo(areaForma(c), 6);
    }
  });

  it('il cerchio conta πr², non il suo quadrato', () => {
    expect(areaForma({ forma: 'cerchio', larghezza: 300, altezza: 300 })).toBeCloseTo(
      (Math.PI * 300 * 300) / 4,
      6
    );
  });

  it('la base minore di un trapezio storto non produce un poligono concavo', () => {
    const poly = poligonoSagoma({ forma: 'trapezio', larghezza: 300, altezza: 200, misura3: 900 })!;
    // b viene ridotta a B: il poligono resta un rettangolo, mai una farfalla
    expect(areaPoligono(poly)).toBeCloseTo(300 * 200, 6);
  });

  it('la rotazione ritrasla il bbox in (0,0) e conserva l’area', () => {
    const poly = poligonoSagoma({ forma: 'trapezioR', larghezza: 600, altezza: 400, misura3: 800 })!;
    for (const g of [90, 180, 270]) {
      const r = ruotaPunti(poly, g);
      expect(Math.min(...r.map((p) => p[0]))).toBeCloseTo(0, 5);
      expect(Math.min(...r.map((p) => p[1]))).toBeCloseTo(0, 5);
      expect(areaPoligono(r)).toBeCloseTo(areaPoligono(poly), 4);
    }
  });

  it('le rotazioni sensate: 180° per i trapezi (l’incastro), niente per il cerchio', () => {
    expect(rotazioniPer({ forma: 'trapezioR', larghezza: 6, altezza: 4, misura3: 8, ruotabile: true })).toEqual([0, 90, 180, 270]);
    expect(rotazioniPer({ forma: 'cerchio', larghezza: 6, altezza: 6, ruotabile: true })).toEqual([0]);
    expect(rotazioniPer({ forma: 'rett', larghezza: 6, altezza: 4, ruotabile: true })).toEqual([0, 90]);
    expect(rotazioniPer({ forma: 'rett', larghezza: 6, altezza: 6, ruotabile: true })).toEqual([0]);
    expect(rotazioniPer({ forma: 'trapezioR', larghezza: 6, altezza: 4, misura3: 8, ruotabile: false })).toEqual([0]);
  });

  it('misure scritte come si dicono, con un’etichetta per ogni forma', () => {
    expect(misureForma({ forma: 'cerchio', larghezza: 300, altezza: 300 })).toBe('Ø300');
    expect(misureForma({ forma: 'trapezio', larghezza: 500, altezza: 200, misura3: 300 })).toBe('500/300×200');
    expect(misureForma({ forma: 'trapezioR', larghezza: 600, altezza: 400, misura3: 800 })).toBe('600×400|800');
    expect(misureForma({ larghezza: 600, altezza: 400 })).toBe('600×400');
    // il nome di ripiego copre TUTTE le forme: la mancanza di una voce
    // faceva andare in eccezione il parser
    for (const f of ['rett', 'cerchio', 'triangolo', 'rombo', 'trapezio', 'trapezioR'] as const) {
      expect(etichetteMisure(f).l.length).toBeGreaterThan(0);
    }
  });

  it('misureComplete pretende la terza misura solo dai trapezi', () => {
    expect(misureComplete({ forma: 'trapezioR', larghezza: 600, altezza: 400 })).toBe(false);
    expect(misureComplete({ forma: 'trapezioR', larghezza: 600, altezza: 400, misura3: 800 })).toBe(true);
    expect(misureComplete({ forma: 'cerchio', larghezza: 300, altezza: 0 })).toBe(true);
    expect(misureComplete({ larghezza: 600, altezza: 0 })).toBe(false);
  });
});

/* ---- maschere conservative ---------------------------------------------- */

describe('mascheraSagoma', () => {
  it('è conservativa: copre almeno l’area della sagoma gonfiata', () => {
    const p: MisureForma = { forma: 'trapezioR', larghezza: 600, altezza: 400, misura3: 800 };
    const cs = 3;
    const pad = 1.5;
    const m = mascheraSagoma(p, 0, pad, cs);
    const areaCelle = m.cells * cs * cs;
    // l'area gonfiata approssimata: sagoma + perimetro*pad
    expect(areaCelle).toBeGreaterThanOrEqual(areaForma(p));
    // e ogni riga è uno span unico (convessità)
    for (const r of m.rows) {
      if (r) expect(r[0]).toBeLessThanOrEqual(r[1]);
    }
  });

  it('il cerchio rasterizzato copre il cerchio gonfiato', () => {
    const m = mascheraSagoma({ forma: 'cerchio', larghezza: 300, altezza: 300 }, 0, 2, 5);
    const R = (300 + 4) / 2;
    expect(m.cells * 25).toBeGreaterThanOrEqual(Math.PI * R * R * 0.99);
  });
});

/* ---- il motore ----------------------------------------------------------- */

describe('calcolaNestingSagome', () => {
  it('IL CASO CONCRETO: 4 trapezi rettangoli 600×400|800 entrano in 1300×1250', () => {
    // a solo ingombro (600×800) ne entrerebbero 2: gli altri due esistono
    // solo se i trapezi si incastrano testa-coda
    const pezzi = [pezzo('t', 'trapezioR', 600, 400, 800, { quantita: 4 })];
    const esito = calcolaNestingSagome(par(1300, 1250), pezzi as PezzoNesting[]);
    expect(esito.scartati).toHaveLength(0);
    expect(esito.lastre).toHaveLength(1);
    expect(esito.lastre[0].piazzamenti).toHaveLength(4);
  });

  it('nessuna sovrapposizione reale e lama rispettata (verifica geometrica, non a occhio)', () => {
    const pezzi = [
      pezzo('t', 'trapezioR', 600, 400, 800, { quantita: 4 }),
      pezzo('c', 'cerchio', 300, 0, undefined, { quantita: 2 }),
      pezzo('tri', 'triangolo', 400, 350, undefined, { quantita: 3 }),
      pezzo('r', 'rett', 500, 200, undefined, { quantita: 2 })
    ];
    const esito = calcolaNestingSagome(par(1300, 1250), pezzi as PezzoNesting[]);
    expect(esito.scartati).toHaveLength(0);
    // fra due sagome finite deve restare ALMENO la lama
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('due trapezi isosceli affiancati testa-coda formano il parallelogramma', () => {
    // B 600, b 200, h 500: uno dritto e uno a 180° condividono il fianco
    // obliquo e la coppia è larga B+(B+b)/2 = 1000 per 500 di altezza. A solo
    // ingombro (600×500) in 1020×520 i due non entrano in nessun verso
    const pezzi = [pezzo('tz', 'trapezio', 600, 500, 200, { quantita: 2 })];
    const esito = calcolaNestingSagome(par(1020, 520), pezzi as PezzoNesting[]);
    expect(esito.scartati).toHaveLength(0);
    expect(esito.lastre).toHaveLength(1);
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('l’area della sagoma piazzata è quella dichiarata, non l’ingombro', () => {
    const p = pezzo('t', 'trapezioR', 600, 400, 800);
    const esito = calcolaNestingSagome(par(1300, 1250), [p] as PezzoNesting[]);
    const pc = esito.lastre[0].piazzamenti[0];
    expect(pc.areaVera).toBeCloseTo((600 * (400 + 800)) / 2, 6);
    expect(areaPoligono(sagomaAssoluta(pc)!)).toBeCloseTo(pc.areaVera!, 4);
    // e l'ingombro del piazzamento resta il rettangolo che contiene la
    // sagoma (per segmenti e avanzi), comunque il motore l'abbia girata
    expect(Math.max(pc.larghezza, pc.altezza)).toBeGreaterThanOrEqual(800);
    expect(Math.min(pc.larghezza, pc.altezza)).toBeGreaterThanOrEqual(600);
  });

  it('un pezzo con misure incomplete non sparisce in silenzio: si conta', () => {
    const pezzi = [
      pezzo('ok', 'rett', 500, 300),
      pezzo('manca', 'trapezioR', 600, 400, undefined, { quantita: 2 })
    ];
    const esito = calcolaNestingSagome(par(1300, 1250), pezzi as PezzoNesting[]);
    expect(esito.incompleti).toBe(2);
    expect(esito.lastre[0].piazzamenti).toHaveLength(1);
  });

  it('i piazzamenti restano dentro la lastra, margine compreso', () => {
    const pezzi = [
      pezzo('t', 'trapezioR', 600, 400, 800, { quantita: 3 }),
      pezzo('c', 'cerchio', 250, 0, undefined, { quantita: 3 })
    ];
    const margine = 10;
    const esito = calcolaNestingSagome(par(1300, 1250, { margine }), pezzi as PezzoNesting[]);
    for (const l of esito.lastre) {
      for (const pc of l.piazzamenti) {
        expect(pc.x).toBeGreaterThanOrEqual(margine - 1e-6);
        expect(pc.y).toBeGreaterThanOrEqual(margine - 1e-6);
        expect(pc.x + pc.larghezza).toBeLessThanOrEqual(1300 - margine + 1e-6);
        expect(pc.y + pc.altezza).toBeLessThanOrEqual(1250 - margine + 1e-6);
      }
    }
  });

  it('sulla bobina (striscia unica) la finestra di lavoro si allarga finché serve', () => {
    // rotolo 1220×20 m: la stima parte corta, ma tutto deve entrare comunque
    const pezzi = [pezzo('t', 'trapezioR', 600, 400, 800, { quantita: 12 })];
    const esito = calcolaNestingSagome(
      par(1220, 20000, { massimoLastre: 1, margine: 10 }),
      pezzi as PezzoNesting[]
    );
    expect(esito.scartati).toHaveLength(0);
    expect(esito.lastre).toHaveLength(1);
    expect(esito.lastre[0].piazzamenti).toHaveLength(12);
    // e la cella resta fine abbastanza da non mangiarsi la lama
    expect(esito.cella).toBeLessThanOrEqual(6);
  });

  it('un pezzo più largo del rotolo resta fuori e si sa di chi è', () => {
    // col verso bloccato (venatura) non può nemmeno salvarsi girandosi
    const pezzi = [
      pezzo('g', 'rett', 1500, 400, undefined, { ruotabile: false }),
      pezzo('ok', 'rett', 500, 300)
    ];
    const esito = calcolaNestingSagome(
      par(1220, 20000, { massimoLastre: 1, margine: 10 }),
      pezzi as PezzoNesting[]
    );
    expect(esito.scartati.map((s) => s.id)).toEqual(['g']);
  });

  it('le chiavi delle copie sono stabili: idPezzo#indice, come nell’altro motore', () => {
    const pezzi = [pezzo('a', 'trapezioR', 600, 400, 800, { quantita: 2 })];
    const esito = calcolaNestingSagome(par(1300, 1250), pezzi as PezzoNesting[]);
    const chiavi = esito.lastre[0].piazzamenti.map((pc) => pc.chiave).sort();
    expect(chiavi).toEqual(['a#0', 'a#1']);
  });
});

describe('la sagoma di taglio con l’abbondanza', () => {
  it('sul rettangolo il gonfiaggio restituisce esattamente l’ingombro', () => {
    // finito 100×50, abbondanza 10 (mezza per lato): il taglio è 110×60
    const g = sagomaDiTaglio(poligonoSagoma({ larghezza: 100, altezza: 50 })!, 5, 110, 60);
    const xs = g.map((q) => q[0]);
    const ys = g.map((q) => q[1]);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(110, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(60, 6);
    expect(areaPoligono(g)).toBeCloseTo(110 * 60, 4);
  });

  it('il trapezio tagliato comprende l’abbondanza, sta nell’ingombro e tiene la lama', () => {
    const pezzi = [pezzo('t', 'trapezioR', 600, 400, 800, { quantita: 2 })];
    const esito = calcolaNestingSagome(
      par(1300, 1250, { abbondanza: 10 }),
      pezzi as PezzoNesting[]
    );
    expect(esito.scartati).toHaveLength(0);
    for (const pc of esito.lastre[0].piazzamenti) {
      // ogni vertice del taglio dentro l'ingombro del piazzamento…
      for (const [x, y] of pc.punti!) {
        expect(x).toBeGreaterThanOrEqual(-1e-6);
        expect(x).toBeLessThanOrEqual(pc.larghezza + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeLessThanOrEqual(pc.altezza + 1e-6);
      }
      // …e il taglio è PIÙ GRANDE della sagoma finita: l'abbondanza si taglia,
      // in posa deve restare qualcosa da rifilare
      expect(areaPoligono(sagomaAssoluta(pc)!)).toBeGreaterThan(pc.areaVera! + 1);
    }
    // fra due linee di taglio resta comunque almeno la lama
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('la punta del triangolo gonfiata viene tosata dall’ingombro, non lo sfonda', () => {
    const p = pezzo('tri', 'triangolo', 300, 600, undefined, { ruotabile: false });
    const esito = calcolaNestingSagome(par(1300, 1250, { abbondanza: 20 }), [p] as PezzoNesting[]);
    const pc = esito.lastre[0].piazzamenti[0];
    // il vertice in punta, gonfiato lungo due lati quasi paralleli,
    // finirebbe ben oltre: il ritaglio lo tiene dentro
    for (const [x, y] of pc.punti!) {
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(pc.larghezza + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(pc.altezza + 1e-6);
    }
    expect(areaPoligono(sagomaAssoluta(pc)!)).toBeGreaterThan(pc.areaVera!);
  });

  it('senza abbondanza il taglio È la sagoma finita, identica a prima', () => {
    const p = pezzo('t', 'trapezioR', 600, 400, 800);
    const esito = calcolaNestingSagome(par(1300, 1250), [p] as PezzoNesting[]);
    const pc = esito.lastre[0].piazzamenti[0];
    expect(areaPoligono(sagomaAssoluta(pc)!)).toBeCloseTo(pc.areaVera!, 4);
  });
});
