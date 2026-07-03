import { describe, expect, it } from 'vitest';
import type { SegmentoQuota, VincoloPianta } from '../../db/types';
import {
  applicaDistanza,
  geomQuotaDistanza,
  latoMuovibile,
  libertaDistanza,
  rimisuraDistanze,
  type OggettoDistanza
} from '../parametrico';

// Stanza quadrata 400×400 px; lato 0 = (0,0)→(400,0).
const PUNTI = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 400 },
  { x: 0, y: 400 }
];

const cerchio = (extra?: Partial<OggettoDistanza>): OggettoDistanza => ({
  id: 'o1',
  tipo: 'cerchio',
  x: 200,
  y: 200,
  raggioPx: 50,
  ...extra
});

const vBordo: VincoloPianta = {
  id: 'v1',
  tipo: 'distanza',
  riferimenti: [
    { entita: 'bordoOggetto', oggettoId: 'o1' },
    { entita: 'lato', indice: 0 }
  ],
  valore: 150
};

const vCentro: VincoloPianta = {
  ...vBordo,
  id: 'v2',
  riferimenti: [
    { entita: 'centroOggetto', oggettoId: 'o1' },
    { entita: 'lato', indice: 0 }
  ]
};

const NESSUNA_QUOTA: SegmentoQuota[] = [];

describe('quota di distanza oggetto–lato (Fase 4 schizzo)', () => {
  it('misura la distanza dal bordo del cerchio al lato', () => {
    const g = geomQuotaDistanza(PUNTI, [cerchio()], vBordo);
    expect(g).not.toBeNull();
    expect(g!.dPx).toBeCloseTo(150);
    expect(g!.p).toEqual({ x: 200, y: 150 });
    expect(g!.f).toEqual({ x: 200, y: 0 });
  });

  it('misura la distanza dal centro (il raggio non conta)', () => {
    const g = geomQuotaDistanza(PUNTI, [cerchio()], vCentro);
    expect(g!.dPx).toBeCloseTo(200);
  });

  it('supporto esatto per il rettangolo (bordo più vicino)', () => {
    const rett: OggettoDistanza = {
      id: 'o1',
      tipo: 'rettangolo',
      x: 150, // angolo basso-sx → centro (200, 160), semialtezza 40
      y: 200,
      larghezza: 100,
      altezza: 80
    };
    const g = geomQuotaDistanza(PUNTI, [rett], vBordo);
    expect(g!.dPx).toBeCloseTo(120); // 160 (centro) − 40
  });

  it('niente ancore → si sposta tutto l’oggetto', () => {
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, [cerchio()], vBordo)).toBe('oggetto');
    const r = applicaDistanza(PUNTI, NESSUNA_QUOTA, [cerchio()], vBordo, 100);
    expect(r?.oggetti?.[0]).toMatchObject({ x: 200, y: 150 }); // verso il lato
    expect(r?.punti).toBeUndefined();
  });

  it('diametro bloccato (centro libero) → si sposta il centro', () => {
    const ogg = [cerchio({ dimensioneBloccata: true })];
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo)).toBe('oggetto');
    const r = applicaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo, 200);
    expect(r?.oggetti?.[0]).toMatchObject({ x: 200, y: 250, raggioPx: 50 });
  });

  it('centro ancorato → si muove la circonferenza (cambia il raggio)', () => {
    const ogg = [cerchio({ centroAncorato: true })];
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo)).toBe('dimensione');
    const r = applicaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo, 100);
    expect(r?.oggetti?.[0]).toMatchObject({ x: 200, y: 200, raggioPx: 100 });
  });

  it('raggio degenere (≤ 0) → modifica rifiutata', () => {
    const ogg = [cerchio({ centroAncorato: true })];
    expect(applicaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo, 200)).toBeNull();
  });

  it('centro + dimensione bloccati → si sposta il LATO', () => {
    const ogg = [cerchio({ centroAncorato: true, dimensioneBloccata: true })];
    // origine sul vertice 2, lontano dal lato 0
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo, 2)).toBe('lato');
    const r = applicaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo, 100, 2);
    expect(r?.punti?.[0]).toEqual({ x: 0, y: 50 });
    expect(r?.punti?.[1]).toEqual({ x: 400, y: 50 });
    expect(r?.punti?.[2]).toEqual(PUNTI[2]);
    // il nuovo assetto misura davvero 100
    const g = geomQuotaDistanza(r!.punti!, ogg, vBordo);
    expect(g!.dPx).toBeCloseTo(100);
  });

  it('tutto vincolato → quota bloccata (~…~)', () => {
    const ogg = [cerchio({ centroAncorato: true, dimensioneBloccata: true })];
    // origine su un vertice del lato: il muro non può traslare
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo, 0)).toBe('bloccata');
    expect(applicaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vBordo, 100, 0)).toBeNull();
  });

  it('lato non muovibile con quota fissa su un lato adiacente', () => {
    const segs: SegmentoQuota[] = [{ da: 1, a: 2, valore: 100, manuale: true }];
    expect(latoMuovibile(PUNTI, segs, 0)).toBe(false);
    const segsAuto: SegmentoQuota[] = [{ da: 1, a: 2, valore: 100 }];
    expect(latoMuovibile(PUNTI, segsAuto, 0)).toBe(true);
  });

  it('lato non muovibile se un’ancora fissa un suo vertice', () => {
    const segs: SegmentoQuota[] = [{ da: 0, a: 1, valore: null, ancora: 'vertice-da' }];
    expect(latoMuovibile(PUNTI, segs, 0)).toBe(false);
    expect(latoMuovibile(PUNTI, segs, 2)).toBe(true);
  });

  it('rimisuraDistanze aggiorna il valore dalla geometria', () => {
    const out = rimisuraDistanze([vBordo], PUNTI, [cerchio()], 2);
    expect(out?.[0].valore).toBeCloseTo(75); // 150 px / 2 px-per-unità
  });

  it('PUNTO↔PUNTO: centro cerchio ↔ vertice del perimetro (misura e comando)', () => {
    const v: VincoloPianta = {
      id: 'pp',
      tipo: 'distanza',
      riferimenti: [
        { entita: 'centroOggetto', oggettoId: 'o1' },
        { entita: 'vertice', indice: 0 } // (0,0)
      ]
    };
    const g = geomQuotaDistanza(PUNTI, [cerchio()], v);
    expect(g!.dPx).toBeCloseTo(Math.hypot(200, 200));
    // il cerchio è libero: si sposta LUNGO la congiungente fino alla distanza voluta
    const r = applicaDistanza(PUNTI, NESSUNA_QUOTA, [cerchio()], v, 100);
    const o = r!.oggetti![0];
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(100);
    // resta sulla stessa direzione (45°)
    expect(o.x).toBeCloseTo(o.y);
  });

  it('PUNTO↔PUNTO tra due oggetti: si muove il primo libero', () => {
    const rett: OggettoDistanza = {
      id: 'o2',
      tipo: 'rettangolo',
      x: 300,
      y: 380,
      larghezza: 100,
      altezza: 60
    };
    const v: VincoloPianta = {
      id: 'pp2',
      tipo: 'distanza',
      riferimenti: [
        { entita: 'centroOggetto', oggettoId: 'o1' },
        { entita: 'centroLato', oggettoId: 'o2', indice: 2 } // centro lato ALTO (350, 320)
      ]
    };
    const g = geomQuotaDistanza(PUNTI, [cerchio(), rett], v);
    expect(g!.dPx).toBeCloseTo(Math.hypot(200 - 350, 200 - 320));
    const r = applicaDistanza(PUNTI, NESSUNA_QUOTA, [cerchio(), rett], v, 50);
    const oc = r!.oggetti!.find((o) => o.id === 'o1')!;
    expect(Math.hypot(oc.x - 350, oc.y - 320)).toBeCloseTo(50);
  });

  it('PUNTO(perimetro)↔LATO(oggetto): si muove l’oggetto proprietario del lato', () => {
    const rett: OggettoDistanza = {
      id: 'o2',
      tipo: 'rettangolo',
      x: 300,
      y: 380,
      larghezza: 100,
      altezza: 60
    };
    const v: VincoloPianta = {
      id: 'pl',
      tipo: 'distanza',
      riferimenti: [
        { entita: 'centroLato', indice: 0 }, // centro del lato alto del perimetro (200,0)
        { entita: 'lato', oggettoId: 'o2', indice: 2 } // lato alto del rettangolo (y=320)
      ]
    };
    const g = geomQuotaDistanza(PUNTI, [rett], v);
    expect(g!.dPx).toBeCloseTo(320);
    const r = applicaDistanza(PUNTI, NESSUNA_QUOTA, [rett], v, 200);
    const o = r!.oggetti![0];
    expect(o.y - (o.altezza ?? 0)).toBeCloseTo(200); // lato alto a y=200
    expect(o.x).toBeCloseTo(300); // niente deriva laterale
  });

  it('PUNTO↔PUNTO con oggetto ancorato → bloccata (nessun muro coinvolto)', () => {
    const v: VincoloPianta = {
      id: 'pp3',
      tipo: 'distanza',
      riferimenti: [
        { entita: 'centroOggetto', oggettoId: 'o1' },
        { entita: 'vertice', indice: 0 }
      ]
    };
    const ogg = [cerchio({ centroAncorato: true })];
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, ogg, v)).toBe('bloccata');
    expect(applicaDistanza(PUNTI, NESSUNA_QUOTA, ogg, v, 100)).toBeNull();
  });

  it('distanza dal centro con centro ancorato → si muove il lato (se libero)', () => {
    const ogg = [cerchio({ centroAncorato: true })];
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vCentro, 2)).toBe('lato');
    expect(libertaDistanza(PUNTI, NESSUNA_QUOTA, ogg, vCentro, 0)).toBe('bloccata');
  });
});
