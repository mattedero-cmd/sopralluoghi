import { describe, expect, it } from 'vitest';
import type { Annotazione, Cartella, Foto, Progetto, QuotaPoligono } from '../../db/types';
import {
  codiceCompletoForma,
  codiceLocaleForma,
  codicePannello,
  etichettaFoto,
  letteraDaIndice,
  numeriProgetto,
  ordinePerNumero,
  percorsoEtichette,
  prossimaLetteraLibera,
  vociLegenda
} from '../nomenclatura';

const stile = { colore: '#ffc400', spessore: 3, dimensioneTesto: 28 };

function forma(id: string, fotoId: string, extra: Partial<QuotaPoligono> = {}): QuotaPoligono {
  return {
    id,
    fotoId,
    tipo: 'quotaPoligono',
    zIndex: 1,
    stile,
    punti: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ],
    segmenti: [{ da: 0, a: 1, valore: 10 }],
    unita: 'cm',
    stato: 'reale',
    etichetta: '',
    ...extra
  };
}

const foto = (id: string, ordine: number, etichetta?: string): Foto =>
  ({ id, ordine, etichetta }) as Foto;

describe('lettere e etichette foto', () => {
  it('0→A, 25→Z, 26→AA', () => {
    expect(letteraDaIndice(0)).toBe('A');
    expect(letteraDaIndice(25)).toBe('Z');
    expect(letteraDaIndice(26)).toBe('AA');
  });

  it('prossimaLetteraLibera salta le lettere già usate', () => {
    expect(prossimaLetteraLibera([])).toBe('A');
    expect(prossimaLetteraLibera(['A', 'B', 'C'])).toBe('D');
    expect(prossimaLetteraLibera(['A', 'C'])).toBe('B'); // riempie i buchi
    expect(prossimaLetteraLibera(['B', 'C'])).toBe('A');
  });

  it('vociLegenda: una riga per lettera, ordinata, lettere prima dei numeri', () => {
    const et = (lettera: string, descrizione = ''): Annotazione =>
      ({ id: lettera + Math.random(), fotoId: 'f', tipo: 'etichetta', posizione: { x: 0, y: 0 }, lettera, descrizione, zIndex: 1, stile }) as Annotazione;
    const voci = vociLegenda([et('B', 'insegna'), et('A', 'vetrofania'), et('A'), et('1', 'monitor')]);
    expect(voci.map((v) => v.lettera)).toEqual(['A', 'B', '1']);
    // più etichette con la stessa lettera condividono la descrizione non vuota
    expect(voci.find((v) => v.lettera === 'A')?.descrizione).toBe('vetrofania');
    // e ne viene contata la quantità (2 × A, 1 × B, 1 × «1»)
    expect(voci.find((v) => v.lettera === 'A')?.quantita).toBe(2);
    expect(voci.find((v) => v.lettera === 'B')?.quantita).toBe(1);
  });
  it('etichetta automatica per ordine, manuale se impostata', () => {
    const lista = [foto('x', 20), foto('y', 10, 'PT'), foto('z', 30)];
    expect(etichettaFoto(foto('x', 20), lista)).toBe('B'); // 2ª per ordine
    expect(etichettaFoto(foto('y', 10, 'PT'), lista)).toBe('PT'); // manuale
  });
});

describe('numerazione condivisa per etichetta foto', () => {
  it('foto con etichette diverse → numerazioni separate', () => {
    const f1 = foto('f1', 1, 'A');
    const f2 = foto('f2', 2, 'B');
    const ann: Record<string, Annotazione[]> = {
      f1: [forma('a', 'f1', { creatoIl: 100 })],
      f2: [forma('b', 'f2', { creatoIl: 200 })]
    };
    const numeri = numeriProgetto([f1, f2], (id) => ann[id] ?? []);
    expect(codiceLocaleForma(ann.f1[0], numeri)).toBe('A1');
    expect(codiceLocaleForma(ann.f2[0], numeri)).toBe('B1');
  });

  it('stessa etichetta su due foto → sequenza unica per ordine di creazione', () => {
    const f1 = foto('f1', 1, 'A');
    const f2 = foto('f2', 2, 'A');
    // creazione: forma1@f1 (t=100), forma2@f2 (t=200), forma3@f1 (t=300)
    const ann: Record<string, Annotazione[]> = {
      f1: [forma('s1', 'f1', { creatoIl: 100 }), forma('s3', 'f1', { creatoIl: 300 })],
      f2: [forma('s2', 'f2', { creatoIl: 200 })]
    };
    const numeri = numeriProgetto([f1, f2], (id) => ann[id] ?? []);
    expect(codiceLocaleForma(ann.f1[0], numeri)).toBe('A1'); // s1
    expect(codiceLocaleForma(ann.f2[0], numeri)).toBe('A2'); // s2
    expect(codiceLocaleForma(ann.f1[1], numeri)).toBe('A3'); // s3
  });

  it('forme già caricate senza creatoIl: ordinate per (foto, zIndex), prima delle nuove', () => {
    const f1 = foto('f1', 1, 'A');
    const ann: Record<string, Annotazione[]> = {
      f1: [
        forma('vecchia', 'f1', { creatoIl: undefined, zIndex: 5 }),
        forma('nuova', 'f1', { creatoIl: Date.now() })
      ]
    };
    const numeri = numeriProgetto([f1], (id) => ann[id] ?? []);
    expect(codiceLocaleForma(ann.f1[0], numeri)).toBe('A1'); // vecchia prima
    expect(codiceLocaleForma(ann.f1[1], numeri)).toBe('A2');
  });

  it('vecchia etichetta numerica ("1") non è un override: applica il nuovo codice', () => {
    const f1 = foto('f1', 1, 'A');
    const ann = [forma('a', 'f1', { etichetta: '1', creatoIl: 100 })];
    const numeri = numeriProgetto([f1], () => ann);
    expect(codiceLocaleForma(ann[0], numeri)).toBe('A1');
  });

  it('override manuale vero (multi-carattere) prevale', () => {
    const f1 = foto('f1', 1, 'A');
    const ann = [forma('a', 'f1', { etichetta: 'SPEC', creatoIl: 100 })];
    const numeri = numeriProgetto([f1], () => ann);
    expect(codiceLocaleForma(ann[0], numeri)).toBe('SPEC');
  });

  it('vecchio codice ("A3") non è un override: eliminando una forma le altre si rinumerano', () => {
    const f1 = foto('f1', 1, 'A');
    // dati legacy: la forma rimasta ha "A3" salvato in etichetta; resta solo
    // un'altra forma → "A3" deve diventare A2, non restare congelata su A3
    const ann = [
      forma('s1', 'f1', { etichetta: 'A1', creatoIl: 100 }),
      forma('s3', 'f1', { etichetta: 'A3', creatoIl: 300 })
    ];
    const numeri = numeriProgetto([f1], () => ann);
    expect(codiceLocaleForma(ann[0], numeri)).toBe('A1');
    expect(codiceLocaleForma(ann[1], numeri)).toBe('A2');
  });
});

describe('elementi ripetuti (duplicazione)', () => {
  it('una sola forma → A1; duplicata su 5 elementi → A1.1…A1.5', () => {
    const f1 = foto('f1', 1, 'A');
    // 5 forme con lo stesso gruppoQuota (copie), create in ordine
    const ann = [0, 1, 2, 3, 4].map((i) =>
      forma(`s${i}`, 'f1', { creatoIl: 100 + i, gruppoQuota: 'G' })
    );
    const numeri = numeriProgetto([f1], () => ann);
    expect(codiceLocaleForma(ann[0], numeri)).toBe('A1.1');
    expect(codiceLocaleForma(ann[4], numeri)).toBe('A1.5');
    expect(numeri.get('s0')!.quantita).toBe(5);
  });

  it('famiglia ripetuta + elemento singolo → A1.x e A2', () => {
    const f1 = foto('f1', 1, 'A');
    const ann = [
      forma('w1', 'f1', { creatoIl: 100, gruppoQuota: 'G' }),
      forma('w2', 'f1', { creatoIl: 110, gruppoQuota: 'G' }),
      forma('porta', 'f1', { creatoIl: 200 }) // singola, nessun gruppo
    ];
    const numeri = numeriProgetto([f1], () => ann);
    expect(codiceLocaleForma(ann[0], numeri)).toBe('A1.1');
    expect(codiceLocaleForma(ann[1], numeri)).toBe('A1.2');
    expect(codiceLocaleForma(ann[2], numeri)).toBe('A2');
  });

  it('famiglia richiamata tra foto diverse della stessa cartella → sequenza continua', () => {
    // due foto dello stesso progetto: la misura originale è in f1 e viene
    // richiamata in f2; il sotto-indice prosegue (stessa cartella)
    const f1 = { id: 'f1', ordine: 1, progettoId: 'p1' } as Foto;
    const f2 = { id: 'f2', ordine: 2, progettoId: 'p1' } as Foto;
    const ann: Record<string, Annotazione[]> = {
      f1: [forma('orig', 'f1', { creatoIl: 100, gruppoQuota: 'G' })],
      f2: [forma('cop', 'f2', { creatoIl: 200, gruppoQuota: 'G', soloEtichetta: true })]
    };
    const numeri = numeriProgetto([f1, f2], (id) => ann[id] ?? []);
    // l'originale (in f1, foto A) dà la base A1; due membri → A1.1 e A1.2
    expect(codiceLocaleForma(ann.f1[0], numeri)).toBe('A1.1');
    expect(codiceLocaleForma(ann.f2[0], numeri)).toBe('A1.2');
    expect(numeri.get('cop')!.quantitaGlobale).toBe(2);
  });

  it('famiglia richiamata in una cartella diversa → il sotto-indice riparte da .1', () => {
    const f1 = { id: 'f1', ordine: 1, progettoId: 'p1' } as Foto;
    const f2 = { id: 'f2', ordine: 2, progettoId: 'p2' } as Foto;
    const ann: Record<string, Annotazione[]> = {
      f1: [
        forma('o1', 'f1', { creatoIl: 100, gruppoQuota: 'G' }),
        forma('c1', 'f1', { creatoIl: 110, gruppoQuota: 'G', soloEtichetta: true })
      ],
      f2: [
        forma('c2', 'f2', { creatoIl: 200, gruppoQuota: 'G', soloEtichetta: true }),
        forma('c3', 'f2', { creatoIl: 210, gruppoQuota: 'G', soloEtichetta: true })
      ]
    };
    const percorso: Record<string, string[]> = { f1: ['P1'], f2: ['P2'] };
    const numeri = numeriProgetto([f1, f2], (id) => ann[id] ?? [], (id) => percorso[id] ?? []);
    // P1: A1.1, A1.2 — P2 riparte: A1.1, A1.2 (stessa misura originale A1)
    expect(codiceLocaleForma(ann.f1[0], numeri)).toBe('A1.1');
    expect(codiceLocaleForma(ann.f1[1], numeri)).toBe('A1.2');
    expect(codiceLocaleForma(ann.f2[0], numeri)).toBe('A1.1');
    expect(codiceLocaleForma(ann.f2[1], numeri)).toBe('A1.2');
    expect(numeri.get('c2')!.quantita).toBe(2); // copie dentro P2
    expect(numeri.get('c2')!.quantitaGlobale).toBe(4); // copie totali
  });
});

describe('riordino manuale del numero', () => {
  it('porta una forma al numero 1: la sua chiave d’ordine diventa la più piccola', () => {
    const f1 = foto('f1', 1, 'A');
    const ann = [
      forma('s1', 'f1', { creatoIl: 100 }),
      forma('s2', 'f1', { creatoIl: 200 }),
      forma('s3', 'f1', { creatoIl: 300 })
    ];
    const nuovoOrdine = ordinePerNumero(ann[2], 1, [f1], () => ann);
    expect(nuovoOrdine).not.toBeNull();
    expect(nuovoOrdine!).toBeLessThan(100); // prima di s1
    // applicando il nuovo ordine, s3 diventa A1
    const conOrdine = { ...ann[2], ordine: nuovoOrdine! };
    const lista = [ann[0], ann[1], conOrdine];
    const numeri = numeriProgetto([f1], () => lista);
    expect(codiceLocaleForma(conOrdine, numeri)).toBe('A1');
    expect(codiceLocaleForma(ann[0], numeri)).toBe('A2');
  });
});

describe('percorso e codice completo', () => {
  const cartelle: Cartella[] = [
    { id: 'e', nome: 'Edificio', parentId: null, etichetta: 'E1', creataIl: 0, modificataIl: 0 },
    { id: 'p', nome: 'Piano', parentId: 'e', etichetta: 'P1', creataIl: 0, modificataIl: 0 }
  ];
  it('concatena le etichette delle cartelle', () => {
    const prog = { cartellaId: 'p', etichetta: undefined } as Pick<Progetto, 'cartellaId' | 'etichetta'>;
    expect(percorsoEtichette(prog, cartelle)).toEqual(['E1', 'P1']);
    expect(codiceCompletoForma(['E1', 'P1'], 'A1')).toBe('E1.P1.A1');
    expect(codiceCompletoForma([], 'A1')).toBe('A1');
  });
});

describe('codicePannello', () => {
  it('il telo si scrive con una lettera minuscola: A1.a, A1.b', () => {
    expect(codicePannello('A1', 0)).toBe('A1.a');
    expect(codicePannello('A1', 1)).toBe('A1.b');
    // su una copia della famiglia si accoda al sotto-indice: A1.2.a
    expect(codicePannello('A1.2', 0)).toBe('A1.2.a');
    // oltre la Z si continua come le etichette: aa, ab…
    expect(codicePannello('A1', 26)).toBe('A1.aa');
  });
});

describe('etichette manuali che somigliano a un codice', () => {
  const forma = (etichetta: string) =>
    ({
      id: 'q1',
      fotoId: 'f1',
      zIndex: 0,
      stile: { colore: '#fff', spessore: 4, dimensioneTesto: 20 },
      tipo: 'quotaPoligono',
      punti: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 2 },
        { x: 0, y: 2 }
      ],
      segmenti: [],
      unita: 'cm',
      stato: 'reale',
      etichetta
    }) as unknown as Annotazione;

  const numeri = new Map([
    ['q1', { etichettaFoto: 'A', numero: 7, quantita: 1, quantitaGlobale: 1 }]
  ]) as never;

  it('un codice automatico scritto a mano non congela la numerazione', () => {
    for (const e of ['A7', 'A1.2', 'AA12', '3', 'B']) {
      expect(codiceLocaleForma(forma(e), numeri)).toBe('A7');
    }
  });

  it('«F1.dx» è un nome, non un codice: resta com’è scritto', () => {
    // il suffisso del telo lo mette il programma, non l'utente: se qualcuno
    // scrive destra/sinistra nell'etichetta, quella deve comandare
    for (const e of ['F1.dx', 'S1.sx', 'P2.int', 'C3.bis', 'Porta']) {
      expect(codiceLocaleForma(forma(e), numeri)).toBe(e);
    }
  });
});
