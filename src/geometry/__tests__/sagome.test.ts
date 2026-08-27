import { describe, expect, it } from 'vitest';
import {
  areaForma,
  etichetteMisure,
  ingombroForma,
  mascheraSagoma,
  misureComplete,
  misureForma,
  ancoraEtichetta,
  poligonoSagoma,
  orientazioniPer,
  rotazioniPer,
  ruotaPunti,
  versiAMano,
  versiParalleli,
  versiStretti,
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

describe('i due difetti trovati dalla revisione', () => {
  it('un pezzo largo quanto l’utile entra: la coda della griglia non lo mangia', () => {
    // la fascia 1300 di larghezza sta esattamente nell'utile della lastra.
    // Con la griglia troncata (floor) la sua maschera chiedeva una cella più
    // di quante ne esistessero, e il pezzo veniva dichiarato «non entra»
    // mentre da solo — cioè col motore rettangolare — si piazzava benissimo
    const pezzi = [
      pezzo('t', 'trapezioR', 600, 400, 800),
      pezzo('fascia', 'rett', 1300, 300, undefined, { ruotabile: false })
    ];
    const esito = calcolaNestingSagome(
      par(1300, 1250, { margine: 0 }),
      pezzi as PezzoNesting[]
    );
    expect(esito.scartati).toHaveLength(0);
    // e sta davvero dentro la lastra, non mezzo fuori
    for (const l of esito.lastre) {
      for (const pc of l.piazzamenti) {
        expect(pc.x).toBeGreaterThanOrEqual(-1e-6);
        expect(pc.y).toBeGreaterThanOrEqual(-1e-6);
        expect(pc.x + pc.larghezza).toBeLessThanOrEqual(1300 + 1e-6);
        expect(pc.y + pc.altezza).toBeLessThanOrEqual(1250 + 1e-6);
      }
    }
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('sul rotolo un pezzo impossibile non si porta dietro quelli che entravano', () => {
    // il 1250×1250 col verso bloccato non entra in un rotolo da 1220: è un
    // fatto del materiale. Ma il suo scarto faceva ritentare con finestre
    // sempre più larghe, la cella si ingrossava e alla fine restava fuori
    // anche la fascia da 1195, su un rotolo praticamente vuoto
    const pezzi = [
      pezzo('fascia', 'rett', 1195, 300, undefined, { ruotabile: false }),
      pezzo('t', 'trapezioR', 600, 400, 800),
      pezzo('imp', 'rett', 1250, 1250, undefined, { ruotabile: false })
    ];
    const esito = calcolaNestingSagome(
      par(1220, 50000, { massimoLastre: 1, margine: 10 }),
      pezzi as PezzoNesting[]
    );
    expect(esito.scartati.map((s) => s.id)).toEqual(['imp']);
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });
});

describe('il triangolo dei tre lati (SSS)', () => {
  it('tre lati misurati sono già la forma: poligono esatto, area di Erone', () => {
    // 450/400/300: storto, quello che il sopralluogo trova davvero
    const p: MisureForma = { forma: 'triangoloL', larghezza: 450, altezza: 400, misura3: 300 };
    const poly = poligonoSagoma(p)!;
    expect(poly).toHaveLength(3);
    const sp = (450 + 400 + 300) / 2;
    const erone = Math.sqrt(sp * (sp - 450) * (sp - 400) * (sp - 300));
    expect(areaForma(p)).toBeCloseTo(erone, 6);
    expect(areaPoligono(poly)).toBeCloseTo(erone, 4);
    // i lati del poligono sono davvero quelli misurati
    const lati = poly
      .map((q, i) => Math.hypot(q[0] - poly[(i + 1) % 3][0], q[1] - poly[(i + 1) % 3][1]))
      .sort((a, b) => b - a);
    expect(lati[0]).toBeCloseTo(450, 4);
    expect(lati[1]).toBeCloseTo(400, 4);
    expect(lati[2]).toBeCloseTo(300, 4);
  });

  it('sta appoggiato sul lato più lungo e riempie il suo ingombro', () => {
    const p: MisureForma = { forma: 'triangoloL', larghezza: 450, altezza: 400, misura3: 300 };
    const ing = ingombroForma(p);
    const poly = poligonoSagoma(p)!;
    expect(Math.max(...poly.map((q) => q[0]))).toBeCloseTo(ing.larghezza, 4);
    expect(Math.max(...poly.map((q) => q[1]))).toBeCloseTo(ing.altezza, 4);
    expect(ing.larghezza).toBeCloseTo(450, 6);
    // e l'area vera è ben meno dell'ingombro: è lì che stava lo spreco
    expect(areaForma(p)).toBeLessThan(ing.larghezza * ing.altezza * 0.6);
  });

  it('l’ordine in cui si scrivono i lati non cambia il pezzo', () => {
    const a = poligonoSagoma({ forma: 'triangoloL', larghezza: 300, altezza: 450, misura3: 400 })!;
    const b = poligonoSagoma({ forma: 'triangoloL', larghezza: 450, altezza: 400, misura3: 300 })!;
    expect(areaPoligono(a)).toBeCloseTo(areaPoligono(b), 6);
    expect(Math.max(...a.map((q) => q[0]))).toBeCloseTo(Math.max(...b.map((q) => q[0])), 6);
  });

  it('tre numeri che non chiudono un triangolo sono misure incomplete, non NaN', () => {
    const impossibile: MisureForma = {
      forma: 'triangoloL',
      larghezza: 1000,
      altezza: 200,
      misura3: 300
    };
    expect(misureComplete(impossibile)).toBe(false);
    expect(poligonoSagoma(impossibile)).toBeNull();
    const esito = calcolaNestingSagome(par(1300, 1250), [
      { ...pezzo('x', 'triangoloL', 1000, 200, 300), quantita: 2 }
    ] as PezzoNesting[]);
    expect(esito.incompleti).toBe(2);
    expect(Number.isFinite(esito.cella)).toBe(true);
  });

  it('due triangoli storti si incastrano testa-coda nel loro parallelogramma', () => {
    // 800/700/500 sta in un ingombro 800×433. Due, per ingombro, vogliono
    // 1600 di larghezza o 866 di altezza: su una lastra 1100×450 non entrano
    // in nessuno dei due modi. Girandone uno di 180° e appoggiandolo al
    // fianco obliquo dell'altro il parallelogramma è largo ~1050 e alto 433:
    // se entrambi entrano, il motore li ha davvero incastrati
    const pezzi = [pezzo('tri', 'triangoloL', 800, 700, 500, { quantita: 2 })];
    const esito = calcolaNestingSagome(par(1100, 450), pezzi as PezzoNesting[]);
    expect(esito.scartati).toHaveLength(0);
    expect(esito.lastre).toHaveLength(1);
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });
});

describe('i versi obliqui: appoggiare un lato per terra', () => {
  it('per OGNI lato c’è un verso che lo appoggia per terra', () => {
    // è la proprietà che serve: girando a mano si cerca il lato da mettere
    // in basso. (I quattro quarti canonici restano in elenco comunque: a
    // 90° un triangolo storto non appoggia niente, ed è giusto così)
    const p: MisureForma = { forma: 'triangoloL', larghezza: 800, altezza: 700, misura3: 500 };
    const poly = poligonoSagoma(p)!;
    const versi = orientazioniPer(p);
    for (let i = 0; i < poly.length; i++) {
      const lungo = Math.hypot(poly[i][0] - poly[(i + 1) % 3][0], poly[i][1] - poly[(i + 1) % 3][1]);
      // gli angoli sono tenuti al centesimo di grado, che su un lato da 700
      // basta a chiudere le chiavi di cache e sbaglia di quattro centesimi di
      // millimetro: molto sotto la lama, si misura in decimi
      const appoggiato = versi.some((g) => {
        const r = ruotaPunti(poly, g);
        return r.some((q, k) => {
          const b = r[(k + 1) % r.length];
          return (
            Math.abs(q[1] - b[1]) < 0.2 && Math.abs(Math.hypot(q[0] - b[0], q[1] - b[1]) - lungo) < 0.2
          );
        });
      });
      expect(appoggiato).toBe(true);
    }
  });

  it('niente doppioni: due angoli che danno lo stesso pezzo valgono per uno', () => {
    // il rombo è simmetrico rispetto al centro: metà dei suoi angoli sono
    // lo stesso appoggio, e farli provare al motore (o toccare a mano) è
    // tempo perso
    const rombo = orientazioniPer({ forma: 'rombo', larghezza: 754, altezza: 597 });
    expect(rombo).toHaveLength(6);
    const impronte = new Set(
      rombo.map((g) =>
        ruotaPunti(poligonoSagoma({ forma: 'rombo', larghezza: 754, altezza: 597 })!, g)
          .map((q) => `${Math.round(q[0] * 100) / 100},${Math.round(q[1] * 100) / 100}`)
          .sort()
          .join(' ')
      )
    );
    expect(impronte.size).toBe(rombo.length);
  });

  it('i quarti di sempre ci sono, e vengono per primi', () => {
    const t = orientazioniPer({ forma: 'trapezioR', larghezza: 600, altezza: 400, misura3: 800 });
    expect(t.slice(0, 4)).toEqual([0, 90, 180, 270]);
  });

  it('i versi da girare a mano: il quadrato uno, il cerchio uno, il rettangolo due', () => {
    expect(versiAMano({ forma: 'rett', larghezza: 600, altezza: 400 })).toEqual([0, 90]);
    expect(versiAMano({ forma: 'rett', larghezza: 500, altezza: 500 })).toEqual([0]);
    expect(versiAMano({ forma: 'cerchio', larghezza: 300, altezza: 300 })).toEqual([0]);
    expect(versiAMano({ forma: 'rombo', larghezza: 754, altezza: 597 }).length).toBe(6);
  });

  it('i rombi obliqui accorciano davvero la lastra', () => {
    // quattro rombi 754×597: a soli quarti di giro restano nel loro riquadro,
    // appoggiati su un lato si affiancano
    const pezzi = [pezzo('ro', 'rombo', 754, 597, undefined, { quantita: 4 })];
    const esito = calcolaNestingSagome(par(1300, 2500, { margine: 10 }), pezzi as PezzoNesting[]);
    expect(esito.scartati).toHaveLength(0);
    let piuGiu = 0;
    for (const pc of esito.lastre[0].piazzamenti) piuGiu = Math.max(piuGiu, pc.y + pc.altezza);
    expect(piuGiu).toBeLessThanOrEqual(1250);
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });
});

describe('il verso messo a mano', () => {
  it('vince sul calcolo: si prova solo quello', () => {
    const p = pezzo('t', 'trapezioR', 600, 400, 800);
    const esito = calcolaNestingSagome(
      { ...par(1300, 1250), orientamenti: { 't#0': 180 } },
      [p] as PezzoNesting[]
    );
    expect(esito.lastre[0].piazzamenti[0].rotazione).toBe(180);
  });

  it('vale anche un angolo obliquo, e il pezzo resta dentro la lastra', () => {
    const p = pezzo('ro', 'rombo', 754, 597);
    const versi = versiAMano({ forma: 'rombo', larghezza: 754, altezza: 597 });
    const obliquo = versi.find((g) => g % 90 !== 0)!;
    const esito = calcolaNestingSagome(
      { ...par(1300, 1250, { margine: 10 }), orientamenti: { 'ro#0': obliquo } },
      [p] as PezzoNesting[]
    );
    const pc = esito.lastre[0].piazzamenti[0];
    expect(pc.rotazione).toBe(obliquo);
    expect(pc.x).toBeGreaterThanOrEqual(-1e-6);
    expect(pc.x + pc.larghezza).toBeLessThanOrEqual(1300 + 1e-6);
  });

  it('con la venatura non si lascia forzare: comanda la fibra', () => {
    const p = pezzo('t', 'trapezioR', 600, 400, 800, { ruotabile: false });
    const esito = calcolaNestingSagome(
      { ...par(1300, 1250), orientamenti: { 't#0': 90 } },
      [p] as PezzoNesting[]
    );
    expect(esito.lastre[0].piazzamenti[0].rotazione).toBe(0);
  });

  it('il vecchio vincolo booleano continua a valere: vero = mezzo quarto', () => {
    const p = pezzo('r', 'rett', 600, 400);
    const esito = calcolaNestingSagome(
      { ...par(1300, 1250), orientamenti: { 'r#0': true } },
      [p] as PezzoNesting[]
    );
    expect(esito.lastre[0].piazzamenti[0].rotazione).toBe(90);
  });
});

describe('le copie parallele: il rombo che tassella', () => {
  it('appoggiato su un lato riempie l’81% del suo riquadro, in piedi il 50%', () => {
    const rombo: MisureForma = { forma: 'rombo', larghezza: 753.8, altezza: 597.1 };
    const poly = poligonoSagoma(rombo)!;
    const area = areaForma(rombo);
    const pieno = (g: number) => {
      const r = ruotaPunti(poly, g);
      return area / (Math.max(...r.map((q) => q[0])) * Math.max(...r.map((q) => q[1])));
    };
    expect(pieno(0)).toBeCloseTo(0.5, 3);
    expect(pieno(versiParalleli(rombo)[0])).toBeGreaterThan(0.8);
  });

  it('il verso parallelo è uno solo per il rombo, due per il trapezio (testa-coda)', () => {
    // il rombo è simmetrico rispetto al centro: mezzo giro è lo stesso pezzo.
    // Il trapezio no, e il suo mezzo giro serve ad accoppiarlo testa-coda
    expect(versiParalleli({ forma: 'rombo', larghezza: 754, altezza: 597 })).toHaveLength(1);
    expect(
      versiParalleli({ forma: 'trapezioR', larghezza: 600, altezza: 400, misura3: 800 })
    ).toHaveLength(2);
  });

  it('IL DIFETTO: il limite di ingombro va preso sul pezzo RUOTATO', () => {
    // Due rombi 754×597 su una lastra larga 1100: in piedi sulla punta non ci
    // stanno affiancati in nessun verso (2×597 = 1194 > 1080 utili), appoggiati
    // su un lato sì (481 + 591 = 1072). Il limite «devi starci dentro» era
    // calcolato sull'ingombro NON ruotato — la larghezza del diamante — e il
    // secondo pezzo non poteva mai arrivare accanto al primo: l'incastro che
    // si vede a occhio non nasceva. La lastra è bassa apposta, così l'unico
    // modo di farceli stare è affiancarli.
    const pezzi = [pezzo('ro', 'rombo', 754, 597, undefined, { quantita: 2 })];
    const esito = calcolaNestingSagome(
      par(1100, 700, { margine: 10 }),
      pezzi as PezzoNesting[]
    );
    expect(esito.scartati).toHaveLength(0);
    expect(esito.lastre).toHaveLength(1);
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('appoggiati e paralleli i rombi si affiancano davvero, non a zig-zag', () => {
    // due copie sulla stessa riga: se sono parallele e appoggiate, la seconda
    // sta accanto alla prima (stessa altezza), non scalata più in basso
    const pezzi = [pezzo('ro', 'rombo', 753.8, 597.1, undefined, { quantita: 2 })];
    const esito = calcolaNestingSagome(
      par(1220, 40000, { margine: 10, massimoLastre: 1 }),
      pezzi as PezzoNesting[]
    );
    const [a, b] = esito.lastre[0].piazzamenti;
    expect(a.rotazione).toBe(b.rotazione);
    expect(Math.abs(a.y - b.y)).toBeLessThan(20);
  });

  it('dieci rombi parallelo contro dieci rombi in piedi: quasi un metro di bobina', () => {
    const pezzi = [pezzo('ro', 'rombo', 753.8, 597.1, undefined, { quantita: 10 })];
    const esito = calcolaNestingSagome(
      par(1220, 40000, { margine: 10, massimoLastre: 1 }),
      pezzi as PezzoNesting[]
    );
    let piuGiu = 0;
    for (const pc of esito.lastre[0].piazzamenti) piuGiu = Math.max(piuGiu, pc.y + pc.altezza);
    // a soli quarti di giro erano 3,24 m; appoggiati e paralleli stanno in 2,4
    expect(piuGiu + 10).toBeLessThanOrEqual(2500);
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });
});

describe('il verso delle famiglie pesanti, scelto a catena', () => {
  it('gli appoggi che pareggiano col più stretto sono tutti candidati', () => {
    // il rombo ne ha QUATTRO con lo stesso identico riquadro: quale
    // impacchetti meglio non si sa dal pezzo, dipende da cosa gli sta intorno
    const stretti = versiStretti({ forma: 'rombo', larghezza: 753.8, altezza: 597.1 });
    expect(stretti).toHaveLength(4);
    expect(stretti).toContain(versiParalleli({ forma: 'rombo', larghezza: 753.8, altezza: 597.1 })[0]);
    // e sono tutti obliqui: in piedi sulla punta il riquadro è quasi doppio
    expect(stretti.every((g) => g % 90 !== 0)).toBe(true);
  });

  it('LA LISTA DEL CANTIERE: cinque forme per dieci copie su bobina da 152', () => {
    // Il caso che ha fatto vedere il limite: scegliere il verso di UNA sola
    // famiglia non bastava — il pacco buono vuole i trapezi per lungo E i
    // rombi appoggiati, decisi insieme. Coi soli quarti di giro erano 11,9 m
    // di bobina, adesso 11,2.
    const pezzi = [
      pezzo('rett', 'rett', 700, 820, undefined, { quantita: 10 }),
      pezzo('cer', 'cerchio', 290, 0, undefined, { quantita: 10 }),
      pezzo('tz', 'trapezioR', 450, 950, 750, { quantita: 10 }),
      pezzo('tri', 'triangoloL', 794.7, 675.2, 558.2, { quantita: 10 }),
      pezzo('ro', 'rombo', 753.8, 597.1, undefined, { quantita: 10 })
    ];
    const esito = calcolaNestingSagome(
      par(1520, 80000, { margine: 10, massimoLastre: 1 }),
      pezzi as PezzoNesting[]
    );
    expect(esito.scartati).toHaveLength(0);
    let piuGiu = 0;
    for (const pc of esito.lastre[0].piazzamenti) piuGiu = Math.max(piuGiu, pc.y + pc.altezza);
    expect(piuGiu + 10).toBeLessThanOrEqual(11500);
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });
});

describe('il quadrilatero storto', () => {
  /** un quadrilatero convesso qualunque, coi lati tutti diversi */
  const VERTICI: PuntoSagoma[] = [
    [0, 500],
    [600, 470],
    [640, 60],
    [40, 0]
  ];
  const quad = (extra: Partial<PezzoNesting> = {}): PezzoNesting =>
    ({
      id: 'q',
      nome: 'q',
      forma: 'quad',
      larghezza: 640,
      altezza: 500,
      vertici: VERTICI,
      quantita: 1,
      ruotabile: true,
      tinta: 0,
      ...extra
    }) as PezzoNesting;

  it('area e ingombro sono quelli del poligono, non del riquadro', () => {
    const p = quad();
    expect(areaPoligono(poligonoSagoma(p)!)).toBeCloseTo(areaForma(p), 4);
    const ing = ingombroForma(p);
    expect(ing.larghezza).toBeCloseTo(640, 6);
    expect(ing.altezza).toBeCloseTo(500, 6);
    // se coincidesse col riquadro staremmo ancora nestando il bounding box
    expect(areaForma(p)).toBeLessThan(ing.larghezza * ing.altezza);
  });

  it('un poligono concavo non diventa una sagoma: la griglia lo romperebbe', () => {
    // la rasterizzazione assume uno span unico per riga (poligoni convessi)
    const concavo = quad({
      vertici: [
        [0, 500],
        [600, 470],
        [300, 250],
        [640, 60]
      ]
    } as Partial<PezzoNesting>);
    expect(misureComplete(concavo)).toBe(false);
    expect(poligonoSagoma(concavo)).toBeNull();
  });

  it('si nesta come sagoma, e fra due copie resta la lama', () => {
    const esito = calcolaNestingSagome(
      par(1300, 1250, { margine: 10 }),
      [quad({ quantita: 3 })] as PezzoNesting[]
    );
    expect(esito.scartati).toHaveLength(0);
    for (const pc of esito.lastre[0].piazzamenti) {
      expect(pc.punti).toBeTruthy();
      expect(pc.punti).toHaveLength(4);
      expect(pc.areaVera).toBeCloseTo(areaForma(quad()), 4);
    }
    expect(distanzaMinimaFraPezzi(esito)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('l’etichetta dice i quattro lati, non larghezza per altezza', () => {
    const misure = misureForma({ forma: 'quad', larghezza: 640, altezza: 500, vertici: VERTICI });
    expect(misure.split('/')).toHaveLength(4);
  });
});

describe('l’ancora dell’etichetta', () => {
  /** il testo, centrato sull'ancora, sta tutto dentro il poligono? */
  const dentroTutto = (poly: PuntoSagoma[], larghezza: number, altezza: number, a: { x: number; y: number }) => {
    const angoli: PuntoSagoma[] = [
      [a.x - larghezza / 2, a.y - altezza / 2],
      [a.x + larghezza / 2, a.y - altezza / 2],
      [a.x + larghezza / 2, a.y + altezza / 2],
      [a.x - larghezza / 2, a.y + altezza / 2]
    ];
    return angoli.every((q) => dentroConvesso(q, poly));
  };

  it('sul rettangolo resta il centro, con tutto lo spazio', () => {
    const poly = poligonoSagoma({ forma: 'rett', larghezza: 600, altezza: 400 })!;
    const a = ancoraEtichetta(poly);
    expect(a.x).toBeCloseTo(300, 6);
    expect(a.y).toBeCloseTo(200, 6);
    expect(a.larghezza).toBeCloseTo(600, 6);
    expect(a.altezza).toBeCloseTo(400, 6);
  });

  it('IL DIFETTO: sul pezzo storto lo spazio non è quello del riquadro', () => {
    // Il quadrilatero della segnalazione: lungo e sbieco. Prendendo l'altezza
    // del RIQUADRO, la scritta girata usciva dal pezzo — era lunga quanto il
    // riquadro, non quanto il pezzo lì in mezzo.
    const poly: PuntoSagoma[] = [
      [0, 1200],
      [480, 1150],
      [520, 60],
      [40, 0]
    ];
    const a = ancoraEtichetta(poly);
    const ing = { larghezza: 520, altezza: 1200 };
    expect(a.larghezza).toBeLessThan(ing.larghezza);
    expect(a.altezza).toBeLessThan(ing.altezza);
    // e con quelle misure la scritta ci sta davvero dentro, nei due versi
    expect(dentroTutto(poly, a.larghezza, a.altezza * 0.25, a)).toBe(true);
    expect(dentroTutto(poly, a.larghezza * 0.25, a.altezza, a)).toBe(true);
  });

  it('anche sul triangolo la scritta resta dentro', () => {
    const poly = poligonoSagoma({ forma: 'triangoloL', larghezza: 800, altezza: 700, misura3: 500 })!;
    const a = ancoraEtichetta(poly);
    expect(dentroConvesso([a.x, a.y], poly)).toBe(true);
    expect(dentroTutto(poly, a.larghezza, a.altezza * 0.3, a)).toBe(true);
  });
});
