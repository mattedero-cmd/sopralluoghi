import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALTEZZA_COLLAGE,
  LARGHEZZA_COLLAGE,
  adattaInCasella,
  caselleDettagli,
  quartiCollage
} from '../collagePorta';
import { collageDaAllegare } from '../../pdf/porte';
import { db } from '../../db/db';
import {
  collageDellaPorta,
  collagePorteProgetto,
  creaProgetto,
  duplicaProgetto,
  portePerProgetto,
  salvaCollagePorta,
  salvaPorta
} from '../../db/repository';

describe('collage A4 delle foto della porta', () => {
  it('il foglio è un A4 verticale', () => {
    expect(ALTEZZA_COLLAGE / LARGHEZZA_COLLAGE).toBeCloseTo(297 / 210, 2);
  });

  it('quattro quarti verticali, uguali, dentro il foglio e senza sovrapporsi', () => {
    const q = quartiCollage(1000, 1414);
    expect(q).toHaveLength(4);
    for (const r of q) {
      expect(r.h).toBeGreaterThan(r.w);
      expect(r.w).toBeCloseTo(q[0].w);
      expect(r.x + r.w).toBeLessThanOrEqual(1000);
      expect(r.y + r.h).toBeLessThanOrEqual(1414);
    }
    // ordine di lettura: esterno, interno sopra; stipite, dettagli sotto
    expect(q[1].x).toBeGreaterThan(q[0].x + q[0].w);
    expect(q[2].y).toBeGreaterThan(q[0].y + q[0].h);
  });

  it('i dettagli si dividono il loro quarto: 1, 2 in colonna, 3-4 in griglia, mai più di 4', () => {
    const quarto = { x: 0, y: 0, w: 100, h: 140 };
    expect(caselleDettagli(quarto, 0)).toHaveLength(0);
    expect(caselleDettagli(quarto, 1)).toEqual([quarto]);
    const due = caselleDettagli(quarto, 2);
    expect(due[0].w).toBe(100);
    expect(due[1].y).toBeGreaterThan(due[0].y + due[0].h - 1e-9);
    const quattro = caselleDettagli(quarto, 4);
    expect(quattro).toHaveLength(4);
    expect(quattro[3].x + quattro[3].w).toBeCloseTo(100);
    expect(quattro[3].y + quattro[3].h).toBeCloseTo(140);
    expect(caselleDettagli(quarto, 7)).toHaveLength(4);
  });

  it('una foto verticale riempie la casella; una orizzontale ci sta intera', () => {
    const casella = { x: 10, y: 20, w: 100, h: 141 };
    const v = adattaInCasella(3000, 4000, casella);
    expect(v.destinazione).toEqual(casella);
    expect(v.sorgente.h).toBe(4000);
    expect(v.sorgente.w).toBeLessThan(3000);
    const o = adattaInCasella(4000, 3000, casella);
    expect(o.sorgente).toEqual({ x: 0, y: 0, w: 4000, h: 3000 });
    expect(o.destinazione.w).toBeCloseTo(100);
    expect(o.destinazione.h).toBeCloseTo(75);
    expect(o.destinazione.y).toBeCloseTo(20 + (141 - 75) / 2);
  });
});

describe('la foto del rilievo nei PDF, una volta sola', () => {
  const collage = new Map([
    ['pA', { id: 'fA' }],
    ['pB', { id: 'fB' }]
  ]);
  it('se il report ha già la foto, le istruzioni non la ripetono', () => {
    expect([...collageDaAllegare(['pA', 'pB'], collage, new Set(['fA', 'fB'])).keys()]).toEqual([]);
  });
  it('se la foto è stata esclusa dal report, va nelle istruzioni della sua porta', () => {
    expect([...collageDaAllegare(['pA', 'pB', 'pC'], collage, new Set(['fA']))]).toEqual([['pB', 'fB']]);
  });
});

describe('il collage come foto del progetto', () => {
  beforeEach(async () => {
    await Promise.all([db.progetti.clear(), db.foto.clear(), db.annotazioni.clear(), db.porte.clear()]);
  });
  const dati = (n: number) => ({
    origine: new Uint8Array([n]).buffer as ArrayBuffer,
    origineTipo: 'image/jpeg',
    miniatura: new Uint8Array([n]).buffer as ArrayBuffer,
    miniaturaTipo: 'image/jpeg',
    larghezzaPx: LARGHEZZA_COLLAGE,
    altezzaPx: ALTEZZA_COLLAGE,
    dataScatto: 1,
    collagePorta: { portaId: '', aree: [{ ruolo: 'esterno' as const, x: 0, y: 0, w: 10, h: 10 }] }
  });

  it('si aggiunge una volta, poi si aggiorna al suo posto; null lo toglie', async () => {
    const p = await creaProgetto({ nome: 'Hotel', cliente: '', luogo: '' }, null);
    const porta = await salvaPorta({ progettoId: p.id, descrizione: '', config: {}, righe: [] });
    const primo = await salvaCollagePorta(porta, { ...dati(1), collagePorta: { ...dati(1).collagePorta, portaId: porta.id } });
    expect(primo?.didascalia).toBe('Porta A · foto del rilievo');
    const secondo = await salvaCollagePorta(porta, { ...dati(2), collagePorta: { ...dati(2).collagePorta, portaId: porta.id } });
    expect(secondo?.id).toBe(primo?.id);
    expect(await db.foto.count()).toBe(1);
    expect(new Uint8Array((await collageDellaPorta(porta))!.origine)[0]).toBe(2);
    await salvaCollagePorta(porta, null);
    expect(await db.foto.count()).toBe(0);
  });

  it('duplicando il progetto il collage segue la porta copiata', async () => {
    const p = await creaProgetto({ nome: 'Hotel', cliente: '', luogo: '' }, null);
    const porta = await salvaPorta({ progettoId: p.id, descrizione: '', config: {}, righe: [] });
    await salvaCollagePorta(porta, { ...dati(1), collagePorta: { ...dati(1).collagePorta, portaId: porta.id } });
    const copia = await duplicaProgetto(p.id);
    const [pc] = await portePerProgetto(copia.id);
    const mappa = await collagePorteProgetto(copia.id);
    expect(mappa.has(pc.id)).toBe(true);
    expect(mappa.has(porta.id)).toBe(false);
  });
});
