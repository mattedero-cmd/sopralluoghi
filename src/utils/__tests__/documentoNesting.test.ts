import { describe, expect, it } from 'vitest';
import {
  BOBINA_PREDEFINITA,
  LASTRA_PREDEFINITA,
  cambioVenatura,
  duplicaEssenza,
  nomeEssenzaLibero,
  trasferisciPezzi,
  type DocumentoNesting,
  type MaterialeNesting,
  etichettaSupporto,
  materialeNuovo,
  opzioniRicerca,
  migraDocumento,
  parametriDi,
  pezziDi,
  pezziRichiesti
} from '../documentoNesting';
import { BLOCCO_MANEGGEVOLE } from '../../geometry/segmenti';
import type { PezzoNesting } from '../../geometry/nesting';

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

describe('opzioniRicerca', () => {
  it('la bobina cerca blocchi maneggevoli', () => {
    const m = { ...materialeNuovo('m', 'Rovere'), modo: 'bobina' as const };
    expect(opzioniRicerca(m)).toEqual({ bloccoMassimo: BLOCCO_MANEGGEVOLE });
  });

  it('la lastra cerca un avanzo rettangolare', () => {
    expect(opzioniRicerca(materialeNuovo('m', 'Rovere'))).toEqual({ sfridoRettangolare: true });
  });
});

/* --- trasferimento di misure fra essenze ----------------------------- */

const pezzo = (id: string, quantita = 1) => ({
  id,
  nome: `Pezzo ${id}`,
  larghezza: 600,
  altezza: 400,
  quantita,
  ruotabile: true,
  tinta: 0
});

const documento = (materiali: MaterialeNesting[]): DocumentoNesting => ({
  versione: 2,
  nome: 'Cantiere Rossi',
  materiali,
  attivo: materiali[0].id
});

const essenza = (id: string, nome: string, pezzi: PezzoNesting[]): MaterialeNesting => ({
  ...materialeNuovo(id, nome),
  pezzi
});

describe('trasferisciPezzi', () => {
  it('sposta i pezzi scelti nell’essenza di arrivo, con nome misure e quantità', () => {
    const d = documento([
      essenza('m1', 'Bobina larga', [pezzo('a', 3), pezzo('b', 2)]),
      essenza('m2', 'Bobina stretta', [])
    ]);
    const dopo = trasferisciPezzi(d, { da: 'm1', a: 'm2', pezzi: ['b'] });

    expect(dopo.materiali[0].pezzi.map((p) => p.id)).toEqual(['a']);
    const arrivato = dopo.materiali[1].pezzi[0];
    expect(arrivato).toMatchObject({ nome: 'Pezzo b', larghezza: 600, altezza: 400, quantita: 2 });
    // identità nuova: nell'essenza di arrivo è un'altra riga
    expect(arrivato.id).not.toBe('b');
    // ci si posiziona dove sono finite le misure
    expect(dopo.attivo).toBe('m2');
  });

  it('copiando, gli originali restano dov’erano', () => {
    const d = documento([essenza('m1', 'Larga', [pezzo('a', 3)]), essenza('m2', 'Stretta', [])]);
    const dopo = trasferisciPezzi(d, { da: 'm1', a: 'm2', pezzi: ['a'], copia: true });
    expect(dopo.materiali[0].pezzi).toHaveLength(1);
    expect(dopo.materiali[1].pezzi[0].quantita).toBe(3);
  });

  it('portando solo una parte delle copie, il resto rimane alla partenza', () => {
    const d = documento([essenza('m1', 'Larga', [pezzo('a', 10)]), essenza('m2', 'Stretta', [])]);
    const dopo = trasferisciPezzi(d, {
      da: 'm1',
      a: 'm2',
      pezzi: ['a'],
      quantita: { a: 4 }
    });
    expect(dopo.materiali[0].pezzi[0].quantita).toBe(6);
    expect(dopo.materiali[1].pezzi[0].quantita).toBe(4);
  });

  it('una quantità oltre il disponibile porta via la riga intera', () => {
    const d = documento([essenza('m1', 'Larga', [pezzo('a', 2)]), essenza('m2', 'Stretta', [])]);
    const dopo = trasferisciPezzi(d, { da: 'm1', a: 'm2', pezzi: ['a'], quantita: { a: 99 } });
    expect(dopo.materiali[0].pezzi).toHaveLength(0);
    expect(dopo.materiali[1].pezzi[0].quantita).toBe(2);
  });

  it('con arrivo nullo nasce un’essenza gemella: stesso supporto, nome libero', () => {
    const larga = {
      ...essenza('m1', 'Pelle', [pezzo('a', 1)]),
      modo: 'bobina' as const,
      bobina: { larghezza: 1400, metri: 30 },
      lama: 4,
      margine: 12
    };
    const dopo = trasferisciPezzi(documento([larga]), { da: 'm1', a: null, pezzi: ['a'] });

    expect(dopo.materiali).toHaveLength(2);
    const nata = dopo.materiali[1];
    expect(nata).toMatchObject({
      nome: 'Pelle (2)',
      modo: 'bobina',
      bobina: { larghezza: 1400, metri: 30 },
      lama: 4,
      margine: 12
    });
    expect(nata.pezzi).toHaveLength(1);
  });

  it('il nome chiesto per la nuova essenza vale, se non è già di un’altra', () => {
    const d = documento([essenza('m1', 'Pelle', [pezzo('a')]), essenza('m2', 'Bianco', [])]);
    const dopo = trasferisciPezzi(d, { da: 'm1', a: null, pezzi: ['a'], nome: 'Bianco' });
    expect(dopo.materiali[2].nome).toBe('Bianco (2)');
  });

  it('arrivando in un’essenza venata i pezzi liberi si bloccano nel loro verso', () => {
    const d = documento([
      essenza('m1', 'Liscio', [pezzo('a')]),
      { ...essenza('m2', 'Venato', []), venatura: 'verticale' as const }
    ]);
    const dopo = trasferisciPezzi(d, { da: 'm1', a: 'm2', pezzi: ['a'] });
    expect(dopo.materiali[1].pezzi[0].ruotabile).toBe(false);
  });

  it('i versi imposti a mano sui pezzi partiti non restano appesi', () => {
    const partenza = {
      ...essenza('m1', 'Larga', [pezzo('a', 3), pezzo('b', 1)]),
      orientamenti: { 'a#0': true, 'b#0': false }
    };
    const dopo = trasferisciPezzi(documento([partenza, essenza('m2', 'Stretta', [])]), {
      da: 'm1',
      a: 'm2',
      pezzi: ['a']
    });
    expect(dopo.materiali[0].orientamenti).toEqual({ 'b#0': false });
    expect(dopo.materiali[1].orientamenti).toEqual({});
  });

  it('senza niente da portare il documento non si tocca', () => {
    const d = documento([essenza('m1', 'Larga', [pezzo('a')]), essenza('m2', 'Stretta', [])]);
    expect(trasferisciPezzi(d, { da: 'm1', a: 'm2', pezzi: [] })).toBe(d);
    expect(trasferisciPezzi(d, { da: 'm1', a: 'm1', pezzi: ['a'] })).toBe(d);
    expect(trasferisciPezzi(d, { da: 'ignoto', a: 'm2', pezzi: ['a'] })).toBe(d);
    expect(trasferisciPezzi(d, { da: 'm1', a: 'ignoto', pezzi: ['a'] })).toBe(d);
    expect(trasferisciPezzi(d, { da: 'm1', a: 'm2', pezzi: ['a'], quantita: { a: 0 } })).toBe(d);
  });
});

describe('duplicaEssenza', () => {
  it('sdoppia l’essenza con tutta la lista, lasciando intatta l’originale', () => {
    const d = documento([essenza('m1', 'Rovere', [pezzo('a', 2), pezzo('b', 5)])]);
    const dopo = duplicaEssenza(d, 'm1');

    expect(dopo.materiali[0].pezzi).toHaveLength(2);
    expect(dopo.materiali[0].pezzi[0].quantita).toBe(2);
    const gemella = dopo.materiali[1];
    expect(gemella.nome).toBe('Rovere (2)');
    expect(gemella.pezzi.map((p) => [p.nome, p.quantita])).toEqual([
      ['Pezzo a', 2],
      ['Pezzo b', 5]
    ]);
    // liste distinte: toccare la copia non tocca l'originale
    expect(gemella.pezzi[0].id).not.toBe(dopo.materiali[0].pezzi[0].id);
    expect(dopo.attivo).toBe(gemella.id);
  });

  it('anche un’essenza ancora vuota si può sdoppiare', () => {
    const d = documento([{ ...essenza('m1', 'Rovere', []), margine: 25 }]);
    const dopo = duplicaEssenza(d, 'm1');
    expect(dopo.materiali).toHaveLength(2);
    expect(dopo.materiali[1]).toMatchObject({ nome: 'Rovere (2)', margine: 25, pezzi: [] });
  });

  it('un’essenza che non c’è non cambia niente', () => {
    const d = documento([essenza('m1', 'Rovere', [])]);
    expect(duplicaEssenza(d, 'ignoto')).toBe(d);
  });
});

describe('nomeEssenzaLibero', () => {
  it('scala i numeri finché il nome è libero, senza badare alle maiuscole', () => {
    const m = [essenza('1', 'Bianco', []), essenza('2', 'bianco (2)', [])];
    expect(nomeEssenzaLibero(m, 'Bianco')).toBe('Bianco (3)');
    expect(nomeEssenzaLibero(m, 'Nero')).toBe('Nero');
    expect(nomeEssenzaLibero(m, '  ')).toBe('Materiale');
  });
});

describe('la nuova essenza nasce già sul supporto giusto', () => {
  it('la fascia si sceglie mentre si spostano i pezzi rimasti fuori', () => {
    const stretta = {
      ...essenza('m1', 'Controllo solare', [pezzo('a', 2), pezzo('b', 1)]),
      modo: 'bobina' as const,
      bobina: { larghezza: 915, metri: 30 },
      margine: 8
    };
    const dopo = trasferisciPezzi(documento([stretta]), {
      da: 'm1',
      a: null,
      pezzi: ['b'],
      supporto: {
        modo: 'bobina',
        lastra: LASTRA_PREDEFINITA,
        bobina: { larghezza: 1220, metri: 30 }
      }
    });

    const nata = dopo.materiali[1];
    expect(nata.modo).toBe('bobina');
    expect(nata.bobina).toEqual({ larghezza: 1220, metri: 30 });
    // il resto resta quello dell'essenza di partenza
    expect(nata.margine).toBe(8);
    expect(nata.pezzi.map((p) => p.nome)).toEqual(['Pezzo b']);
    expect(dopo.materiali[0].pezzi.map((p) => p.nome)).toEqual(['Pezzo a']);
  });

  it('il supporto non tocca un’essenza di arrivo che esiste già', () => {
    const d = documento([
      essenza('m1', 'Larga', [pezzo('a')]),
      { ...essenza('m2', 'Stretta', []), modo: 'bobina' as const, bobina: { larghezza: 915, metri: 10 } }
    ]);
    const dopo = trasferisciPezzi(d, {
      da: 'm1',
      a: 'm2',
      pezzi: ['a'],
      supporto: { modo: 'lastre', lastra: { larghezza: 9999, altezza: 9999 }, bobina: BOBINA_PREDEFINITA }
    });
    expect(dopo.materiali[1].modo).toBe('bobina');
    expect(dopo.materiali[1].bobina).toEqual({ larghezza: 915, metri: 10 });
  });
});
