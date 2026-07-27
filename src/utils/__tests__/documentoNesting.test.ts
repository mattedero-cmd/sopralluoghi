import { describe, expect, it } from 'vitest';
import {
  cambioVenatura,
  etichettaSupporto,
  materialeNuovo,
  migraDocumento,
  parametriDi,
  pezziDi,
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

  it('la bobina resta una striscia sola: dove spezzarla si decide dopo', () => {
    const m = {
      ...materialeNuovo('m1', 'Pelle'),
      modo: 'bobina' as const,
      bobina: { larghezza: 1400, metri: 5 }
    };
    const p = parametriDi(m);
    expect(p.lastra).toEqual({ larghezza: 1400, altezza: 5000 });
    expect(p.massimoLastre).toBe(1);
  });
});

describe('etichettaSupporto', () => {
  it('descrive lastre e bobina', () => {
    const m = materialeNuovo('m1', 'Legno');
    expect(etichettaSupporto(m)).toBe('lastre 2500 × 1250 mm');
    expect(etichettaSupporto({ ...m, modo: 'bobina' })).toBe('bobina 1220 mm × 50 m');
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

describe('pezziDi', () => {
  const conVerso = (m: ReturnType<typeof materialeNuovo>) => ({
    ...m,
    pezzi: [
      { id: 'a', nome: 'Anta', larghezza: 600, altezza: 400, quantita: 1, ruotabile: false, tinta: 0 },
      { id: 'b', nome: 'Ripiano', larghezza: 500, altezza: 300, quantita: 1, ruotabile: true, tinta: 0 }
    ]
  });

  it('senza venatura tutti i pezzi sono liberi di girare', () => {
    const m = conVerso(materialeNuovo('m1', 'Legno'));
    expect(pezziDi(m).map((p) => p.ruotabile)).toEqual([true, true]);
  });

  it('con la venatura comanda la spunta del pezzo', () => {
    const m = { ...conVerso(materialeNuovo('m1', 'Legno')), venatura: 'verticale' as const };
    expect(pezziDi(m).map((p) => p.ruotabile)).toEqual([false, true]);
  });

  it('non altera i pezzi salvati', () => {
    const m = conVerso(materialeNuovo('m1', 'Legno'));
    pezziDi(m);
    expect(m.pezzi[0].ruotabile).toBe(false);
  });
});

describe('cambioVenatura', () => {
  const conPezzi2 = () => ({
    ...materialeNuovo('m1', 'Legno'),
    orientamenti: { 'a#0': true },
    pezzi: [
      { id: 'a', nome: 'Anta', larghezza: 600, altezza: 400, quantita: 2, ruotabile: true, tinta: 0 },
      { id: 'b', nome: 'Fianco', larghezza: 300, altezza: 800, quantita: 1, ruotabile: false, tinta: 0 }
    ]
  });

  it('accendendo la venatura blocca il verso di tutti i pezzi', () => {
    const patch = cambioVenatura(conPezzi2(), 'verticale');
    expect(patch.venatura).toBe('verticale');
    expect(patch.pezzi?.map((p) => p.ruotabile)).toEqual([false, false]);
  });

  it('accendendo la venatura decadono i versi girati a mano', () => {
    expect(cambioVenatura(conPezzi2(), 'orizzontale').orientamenti).toEqual({});
  });

  it('cambiando direzione non si tocca ciò che l’utente ha già deciso', () => {
    const m = { ...conPezzi2(), venatura: 'verticale' as const };
    const patch = cambioVenatura(m, 'orizzontale');
    expect(patch).toEqual({ venatura: 'orizzontale' });
  });

  it('spegnendo la venatura non si tocca nulla: i valori restano per dopo', () => {
    const m = { ...conPezzi2(), venatura: 'verticale' as const };
    expect(cambioVenatura(m, 'nessuna')).toEqual({ venatura: 'nessuna' });
  });

  it('riscegliere la stessa venatura non azzera niente', () => {
    const m = { ...conPezzi2(), venatura: 'verticale' as const };
    expect(cambioVenatura(m, 'verticale')).toEqual({ venatura: 'verticale' });
  });

  it('dopo il blocco il motore non gira più nessun pezzo', () => {
    const m = conPezzi2();
    const bloccato = { ...m, ...cambioVenatura(m, 'verticale') } as typeof m;
    expect(pezziDi(bloccato).every((p) => !p.ruotabile)).toBe(true);
  });
});

describe('opzioni di stampa nel documento', () => {
  it('la lunghezza massima scelta a mano sopravvive al salvataggio', () => {
    const d = migraDocumento({
      versione: 2,
      materiali: [materialeNuovo('m1', 'Legno')],
      stampa: { segmenta: true, massimoSegmento: 2000 }
    });
    expect(d?.stampa).toEqual({ segmenta: true, massimoSegmento: 2000 });
  });

  it('senza opzioni valide non ne inventa', () => {
    expect(migraDocumento({ versione: 2, materiali: [] })?.stampa).toBeUndefined();
    expect(
      migraDocumento({ versione: 2, materiali: [], stampa: { massimoSegmento: 0 } })?.stampa
    ).toBeUndefined();
    expect(
      migraDocumento({ versione: 2, materiali: [], stampa: 'boh' })?.stampa
    ).toBeUndefined();
  });

  it('«non segmentare» è una scelta, non un valore mancante', () => {
    const d = migraDocumento({
      versione: 2,
      materiali: [],
      stampa: { segmenta: false, massimoSegmento: 3000 }
    });
    expect(d?.stampa).toEqual({ segmenta: false, massimoSegmento: 3000 });
  });
});
