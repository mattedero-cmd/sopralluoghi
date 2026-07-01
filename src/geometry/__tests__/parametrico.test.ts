import { describe, expect, it } from 'vitest';
import {
  risolviParametrico,
  risolviChiusura,
  snapAngoliPoligono,
  fondiCollineari,
  eliminaLatoRichiudi
} from '../parametrico';
import type { Punto, SegmentoQuota } from '../../db/types';

function latiPx(punti: Punto[]): number[] {
  const n = punti.length;
  return punti.map((p, i) => {
    const q = punti[(i + 1) % n];
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
}

function angoloGradi(a: Punto, b: Punto): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Rettangolo 400×300 con un lato quotato per ciascun lato. */
function rettangolo(): { punti: Punto[]; segmenti: SegmentoQuota[] } {
  const punti: Punto[] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 }
  ];
  const segmenti: SegmentoQuota[] = [
    { da: 0, a: 1, valore: 400 },
    { da: 1, a: 2, valore: 300 },
    { da: 2, a: 3, valore: 400 },
    { da: 3, a: 0, valore: 300 }
  ];
  return { punti, segmenti };
}

describe('risolviParametrico — modifica quota → geometria', () => {
  it('allungando il lato in alto, il lato opposto lo segue e la figura resta chiusa', () => {
    const { punti, segmenti } = rettangolo();
    segmenti[0].valore = 500; // top 400 → 500
    const r = risolviParametrico(punti, segmenti, { pxPerReale: 1, latoModificato: 0 });
    expect(r.ok).toBe(true);
    const l = latiPx(r.punti);
    expect(l[0]).toBeCloseTo(500, 3); // top
    expect(l[2]).toBeCloseTo(500, 3); // bottom segue
    expect(l[1]).toBeCloseTo(300, 3); // lati verticali invariati
    expect(l[3]).toBeCloseTo(300, 3);
    // chiusura: somma vettoriale dei lati ≈ 0
    const n = r.punti.length;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += r.punti[(i + 1) % n].x - r.punti[i].x;
      sy += r.punti[(i + 1) % n].y - r.punti[i].y;
    }
    expect(Math.hypot(sx, sy)).toBeLessThan(1e-6);
  });

  it('la scala (pxPerReale) converte le quote in pixel', () => {
    const { punti, segmenti } = rettangolo();
    // stesse quote ma pxPerReale=2 → lati doppi in px
    const r = risolviParametrico(punti, segmenti, { pxPerReale: 2, latoModificato: 0 });
    expect(r.ok).toBe(true);
    const l = latiPx(r.punti);
    expect(l[0]).toBeCloseTo(800, 3);
    expect(l[1]).toBeCloseTo(600, 3);
  });

  it('ancora "lato": modificando un altro lato, il lato ancorato non si muove', () => {
    const { punti, segmenti } = rettangolo();
    segmenti[1].ancora = 'lato'; // lato destro rigido
    segmenti[0].valore = 500;
    const r = risolviParametrico(punti, segmenti, { pxPerReale: 1, latoModificato: 0 });
    expect(r.ok).toBe(true);
    // i due vertici del lato 1 (punti[1], punti[2]) restano dov'erano
    expect(r.punti[1].x).toBeCloseTo(400, 3);
    expect(r.punti[1].y).toBeCloseTo(0, 3);
    expect(r.punti[2].x).toBeCloseTo(400, 3);
    expect(r.punti[2].y).toBeCloseTo(300, 3);
  });

  it('ancora "centro": il lato cresce simmetrico rispetto al suo centro', () => {
    const { punti, segmenti } = rettangolo();
    segmenti[0].ancora = 'centro';
    segmenti[0].valore = 500;
    const r = risolviParametrico(punti, segmenti, { pxPerReale: 1, latoModificato: 0 });
    expect(r.ok).toBe(true);
    // centro del lato 0 resta a x=200; estremi simmetrici a -50 e 450
    const cx = (r.punti[0].x + r.punti[1].x) / 2;
    expect(cx).toBeCloseTo(200, 3);
    expect(r.punti[0].x).toBeCloseTo(-50, 3);
    expect(r.punti[1].x).toBeCloseTo(450, 3);
  });

  it('ancora "vertice-da": quel vertice resta fermo', () => {
    const { punti, segmenti } = rettangolo();
    segmenti[0].ancora = 'vertice-da'; // fissa punti[0]
    segmenti[2].valore = 500; // modifica il lato in basso
    const r = risolviParametrico(punti, segmenti, { pxPerReale: 1, latoModificato: 2 });
    expect(r.ok).toBe(true);
    expect(r.punti[0].x).toBeCloseTo(0, 3);
    expect(r.punti[0].y).toBeCloseTo(0, 3);
  });

  it('vincoli ridondanti ma consistenti (due lati opposti bloccati uguali) NON è sovravincolato', () => {
    const { punti, segmenti } = rettangolo();
    // top e bottom bloccati entrambi a 400 (ridondante ma coerente con la chiusura)
    segmenti[0].bloccato = true;
    segmenti[0].valore = 400;
    segmenti[2].bloccato = true;
    segmenti[2].valore = 400;
    // si modifica il lato destro
    segmenti[1].valore = 350;
    const r = risolviParametrico(punti, segmenti, { pxPerReale: 1, latoModificato: 1 });
    expect(r.ok).toBe(true);
    const l = latiPx(r.punti);
    expect(l[0]).toBeCloseTo(400, 2);
    expect(l[2]).toBeCloseTo(400, 2);
    expect(l[1]).toBeCloseTo(350, 2);
    expect(l[3]).toBeCloseTo(350, 2); // il lato sinistro segue
  });

  it('sovravincolato: 4 lati bloccati con misure incoerenti → nessuna modifica + avviso', () => {
    const { punti, segmenti } = rettangolo();
    segmenti[0].valore = 400;
    segmenti[1].valore = 300;
    segmenti[2].valore = 410; // incoerente con il lato 0 (dovrebbero essere uguali)
    segmenti[3].valore = 300;
    for (const s of segmenti) s.bloccato = true;
    const r = risolviParametrico(punti, segmenti, { pxPerReale: 1 });
    expect(r.ok).toBe(false);
    expect(r.avvisi).toContain('sovravincolato');
    // geometria invariata
    expect(r.punti).toEqual(punti);
  });
});

describe('risolviChiusura — casi limite', () => {
  it('senza obiettivi né blocchi richiude minimizzando lo spostamento', () => {
    // quasi-rettangolo con un piccolo gap: le lunghezze si aggiustano di poco
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 402, y: 300 },
      { x: 0, y: 300 }
    ];
    const r = risolviChiusura(
      punti,
      punti.map(() => null),
      punti.map(() => false)
    );
    expect(r.ok).toBe(true);
    const n = r.punti.length;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += r.punti[(i + 1) % n].x - r.punti[i].x;
      sy += r.punti[(i + 1) % n].y - r.punti[i].y;
    }
    expect(Math.hypot(sx, sy)).toBeLessThan(1e-6);
  });
});

describe('snapAngoliPoligono — snap angolare + richiusura', () => {
  it('aggancia i lati di un quasi-rettangolo storto agli assi (snap 45°) e resta chiuso', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 300, y: 5 },
      { x: 295, y: 205 },
      { x: -5, y: 200 }
    ];
    const r = snapAngoliPoligono(punti, 45, 10);
    expect(r).toHaveLength(4);
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const a = angoloGradi(r[i], r[(i + 1) % n]);
      // ogni lato è su un multiplo di 45°
      const resto = Math.abs(((((a % 45) + 45) % 45 + 22.5) % 45) - 22.5);
      expect(resto).toBeLessThan(0.5);
    }
  });

  it('non tocca i lati la cui inclinazione è oltre la tolleranza', () => {
    // triangolo con un lato chiaramente a ~30° (oltre tol 8 da 0/45/90)
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 87 }
    ];
    const r = snapAngoliPoligono(punti, 45, 8);
    // il lato 0→1 resta orizzontale, la figura resta un triangolo valido
    expect(r).toHaveLength(3);
    expect(angoloGradi(r[0], r[1])).toBeCloseTo(0, 1);
  });
});

describe('fondiCollineari — unione lati consecutivi allineati', () => {
  it('rimuove un vertice collineare e somma le quote dei due lati', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 }, // vertice collineare sul lato superiore
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 }
    ];
    const segmenti: SegmentoQuota[] = [
      { da: 0, a: 1, valore: 200 },
      { da: 1, a: 2, valore: 200 },
      { da: 2, a: 3, valore: 300 },
      { da: 3, a: 4, valore: 400 },
      { da: 4, a: 0, valore: 300 },
      { da: 2, a: 4, valore: 500 } // diagonale
    ];
    const r = fondiCollineari(punti, segmenti, 4);
    expect(r).not.toBeNull();
    expect(r!.rimossi).toBe(1);
    expect(r!.punti).toHaveLength(4);
    // lato superiore fuso 200+200 = 400
    const latoTop = r!.segmenti.find((s) => s.da === 0 && s.a === 1);
    expect(latoTop?.valore).toBeCloseTo(400);
    // diagonale (2,4) rimappata → (1,3), valore invariato
    const diag = r!.segmenti.find((s) => s.valore === 500);
    expect(diag).toBeDefined();
    expect(diag!.da).toBe(1);
    expect(diag!.a).toBe(3);
  });

  it('non fonde nulla se non ci sono collineari', () => {
    const { punti, segmenti } = rettangolo();
    expect(fondiCollineari(punti, segmenti, 4)).toBeNull();
  });

  it('non scende sotto i 3 vertici', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 }
    ];
    expect(fondiCollineari(punti, [], 4)).toBeNull();
  });
});

describe('eliminaLatoRichiudi — elimina lato e richiudi', () => {
  it('elimina un lato di un pentagono e richiude a quadrilatero riallineando gli indici', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 50 },
      { x: 150, y: 200 },
      { x: 0, y: 150 }
    ];
    const segmenti: SegmentoQuota[] = [
      { da: 0, a: 1, valore: 100 },
      { da: 1, a: 2, valore: 110 },
      { da: 2, a: 3, valore: 160 },
      { da: 3, a: 4, valore: 160 },
      { da: 4, a: 0, valore: 150 }
    ];
    const r = eliminaLatoRichiudi(punti, segmenti, 1); // elimina lato 1→2
    expect(r).not.toBeNull();
    expect(r!.punti).toHaveLength(4);
    // 4 lati, indici contigui 0..3, nessuno che punti a un vertice inesistente
    expect(r!.segmenti).toHaveLength(4);
    for (const s of r!.segmenti) {
      expect(s.da).toBeGreaterThanOrEqual(0);
      expect(s.da).toBeLessThan(4);
      expect(s.a).toBeGreaterThanOrEqual(0);
      expect(s.a).toBeLessThan(4);
    }
    // la figura resta chiusa (poligono a 4 vertici)
    expect(r!.punti[0]).toEqual({ x: 0, y: 0 });
  });

  it('non produce segmenti duplicati quando una diagonale collassa su un lato', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];
    const segmenti: SegmentoQuota[] = [
      { da: 0, a: 1, valore: 100 },
      { da: 1, a: 2, valore: 100 },
      { da: 2, a: 3, valore: 100 },
      { da: 3, a: 0, valore: 100 },
      { da: 0, a: 2, valore: 141 }, // diagonale D1
      { da: 1, a: 3, valore: 141 } // diagonale D2 (collassa su un lato)
    ];
    const r = eliminaLatoRichiudi(punti, segmenti, 0);
    expect(r).not.toBeNull();
    expect(r!.punti).toHaveLength(3);
    // nessuna coppia (da,a) ripetuta (le diagonali collassate non duplicano i lati)
    const chiavi = r!.segmenti.map((s) => [Math.min(s.da, s.a), Math.max(s.da, s.a)].join('-'));
    expect(new Set(chiavi).size).toBe(chiavi.length);
  });

  it('restituisce null se scenderebbe sotto i 3 vertici', () => {
    const punti: Punto[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 }
    ];
    expect(eliminaLatoRichiudi(punti, [], 0)).toBeNull();
  });
});
