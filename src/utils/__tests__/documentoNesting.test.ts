import { describe, expect, it } from 'vitest';
import {
  etichettaSupporto,
  materialeNuovo,
  migraDocumento,
  parametriDi,
  pezziRichiesti
} from '../documentoNesting';

const conPezzi = (m: ReturnType<typeof materialeNuovo>) => ({
  ...m,
  pezzi: [
    { id: 'a', nome: 'Anta', larghezza: 600, altezza: 400, quantita: 3, ruotabile: true, tinta: 0 }
  ]
});

describe('parametriDi', () => {
  it('lastre: usa le misure della lastra, senza limite di numero', () => {
    const p = parametriDi(materialeNuovo('m1', 'Legno'));
    expect(p.lastra).toEqual({ larghezza: 2500, altezza: 1250 });
    expect(p.massimoLastre).toBeUndefined();
  });

  it('bobina senza segmenti: una sola striscia lunga quanto il rotolo', () => {
    const m = { ...materialeNuovo('m1', 'Pelle'), modo: 'bobina' as const };
    const p = parametriDi(m);
    expect(p.lastra).toEqual({ larghezza: 1000, altezza: 50000 });
    expect(p.massimoLastre).toBe(1);
  });

  it('bobina a segmenti: ogni lastra del calcolo è un segmento da staccare', () => {
    const m = { ...materialeNuovo('m1', 'Pelle'), modo: 'bobina' as const, segmento: 2200 };
    const p = parametriDi(m);
    expect(p.lastra).toEqual({ larghezza: 1000, altezza: 2200 });
    // 50 m / 2,2 m = 22,7 → 23 segmenti: il limite è il rotolo, non l'infinito
    expect(p.massimoLastre).toBe(23);
  });

  it('i segmenti non possono superare i metri disponibili', () => {
    const m = {
      ...materialeNuovo('m1', 'Pelle'),
      modo: 'bobina' as const,
      segmento: 2200,
      bobina: { larghezza: 1000, metri: 5 }
    };
    expect(parametriDi(m).massimoLastre).toBe(3);
  });
});

describe('etichettaSupporto', () => {
  it('descrive lastre, bobina e bobina a segmenti', () => {
    const m = materialeNuovo('m1', 'Legno');
    expect(etichettaSupporto(m)).toBe('lastre 2500 × 1250 mm');
    expect(etichettaSupporto({ ...m, modo: 'bobina' })).toBe('bobina 1000 mm × 50 m');
    expect(etichettaSupporto({ ...m, modo: 'bobina', segmento: 2200 })).toBe(
      'bobina 1000 mm × 50 m, segmenti da 2200 mm'
    );
  });
});

describe('pezziRichiesti', () => {
  it('somma le quantità', () => {
    expect(pezziRichiesti(conPezzi(materialeNuovo('m1', 'Legno')))).toBe(3);
    expect(pezziRichiesti(materialeNuovo('m1', 'Legno'))).toBe(0);
  });
});

describe('migraDocumento', () => {
  it('legge il formato precedente e lo avvolge in un materiale unico', () => {
    const v1 = {
      lastra: { larghezza: 3000, altezza: 1200 },
      lama: 4,
      abbondanza: 2,
      margine: 5,
      modo: 'bobina',
      bobina: { larghezza: 1400, metri: 30 },
      venatura: 'verticale',
      orientamenti: { 'e1#0': true },
      pezzi: [
        { id: 'e1', nome: 'Anta', larghezza: 600, altezza: 400, quantita: 2, ruotabile: false, tinta: 10 }
      ]
    };
    const d = migraDocumento(v1);
    expect(d?.materiali).toHaveLength(1);
    const m = d!.materiali[0];
    expect(m.modo).toBe('bobina');
    expect(m.bobina).toEqual({ larghezza: 1400, metri: 30 });
    expect(m.lastra).toEqual({ larghezza: 3000, altezza: 1200 });
    expect(m.venatura).toBe('verticale');
    expect(m.orientamenti).toEqual({ 'e1#0': true });
    expect(m.pezzi[0]).toMatchObject({ nome: 'Anta', quantita: 2, ruotabile: false });
    expect(d!.attivo).toBe(m.id);
  });

  it('rilegge un documento già nel formato nuovo', () => {
    const d0 = {
      versione: 2,
      nome: 'Camera Rossi',
      attivo: 'm2',
      materiali: [
        { ...materialeNuovo('m1', 'Legno scuro'), pezzi: [] },
        { ...materialeNuovo('m2', 'Bianco'), pezzi: [] }
      ]
    };
    const d = migraDocumento(JSON.parse(JSON.stringify(d0)));
    expect(d?.nome).toBe('Camera Rossi');
    expect(d?.materiali.map((m) => m.nome)).toEqual(['Legno scuro', 'Bianco']);
    expect(d?.attivo).toBe('m2');
  });

  it('un documento senza materiali ne riceve uno vuoto', () => {
    const d = migraDocumento({ versione: 2, materiali: [] });
    expect(d?.materiali).toHaveLength(1);
    expect(d?.attivo).toBe(d?.materiali[0].id);
  });

  it('«attivo» che non esiste ricade sul primo materiale', () => {
    const d = migraDocumento({
      versione: 2,
      attivo: 'sparito',
      materiali: [materialeNuovo('m1', 'Legno')]
    });
    expect(d?.attivo).toBe('m1');
  });

  it('scarta i valori impossibili invece di propagarli', () => {
    const d = migraDocumento({
      versione: 2,
      materiali: [
        {
          nome: '  ',
          lastra: { larghezza: -5, altezza: 'boh' },
          lama: null,
          pezzi: [
            { nome: 'Buono', larghezza: 100, altezza: 50, quantita: 2 },
            { nome: 'Rotto', larghezza: 0, altezza: 50 },
            null
          ]
        }
      ]
    });
    const m = d!.materiali[0];
    expect(m.nome).toBe('Materiale 1');
    expect(m.lastra).toEqual({ larghezza: 2500, altezza: 1250 });
    expect(m.lama).toBe(3);
    expect(m.pezzi.map((p) => p.nome)).toEqual(['Buono']);
    expect(m.pezzi[0].ruotabile).toBe(true);
  });

  it('rifiuta ciò che non è un documento', () => {
    expect(migraDocumento(null)).toBeNull();
    expect(migraDocumento('ciao')).toBeNull();
    expect(migraDocumento({})).toBeNull();
  });
});
