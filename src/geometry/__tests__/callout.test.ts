import { describe, expect, it } from 'vitest';
import type { Callout } from '../../db/types';
import { primitiveCallout } from '../primitive';

const base: Callout = {
  id: 'c1',
  fotoId: 'f1',
  tipo: 'callout',
  sorgente: { x: 10, y: 10, width: 40, height: 30 },
  inserto: { x: 200, y: 200, width: 120, height: 90 },
  etichetta: 'A',
  zIndex: 0,
  stile: { colore: '#ffc400', spessore: 3, dimensioneTesto: 24 }
};

describe('primitive del dettaglio (callout)', () => {
  it('senza foto scattata → l’inserto è un ritaglio della foto', () => {
    const prim = primitiveCallout(base);
    expect(prim.some((p) => p.kind === 'ritaglio')).toBe(true);
    expect(prim.some((p) => p.kind === 'immagine')).toBe(false);
  });

  it('con foto scattata e immagine pronta → primitiva immagine sull’inserto', () => {
    const finta = { width: 100, height: 80 } as unknown as CanvasImageSource;
    const prim = primitiveCallout({ ...base, fotoDettaglio: new ArrayBuffer(8) }, finta);
    const img = prim.find((p) => p.kind === 'immagine');
    expect(img).toBeTruthy();
    if (img && img.kind === 'immagine') {
      expect(img.destinazione).toEqual(base.inserto);
    }
    expect(prim.some((p) => p.kind === 'ritaglio')).toBe(false);
  });

  it('con foto scattata ma non ancora caricata → segnaposto, nessun ritaglio', () => {
    const prim = primitiveCallout({ ...base, fotoDettaglio: new ArrayBuffer(8) }, null);
    expect(prim.some((p) => p.kind === 'immagine')).toBe(false);
    expect(prim.some((p) => p.kind === 'ritaglio')).toBe(false);
    // segnaposto: testo della fotocamera
    expect(prim.some((p) => p.kind === 'testo' && p.testo === '📷')).toBe(true);
  });
});
