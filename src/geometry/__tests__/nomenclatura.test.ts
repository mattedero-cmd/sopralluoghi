import { describe, expect, it } from 'vitest';
import type { Annotazione, Cartella, Foto, Progetto, QuotaPoligono } from '../../db/types';
import {
  codiceCompletoForma,
  codiceLocaleForma,
  etichettaFoto,
  letteraDaIndice,
  numeriProgetto,
  ordinePerNumero,
  percorsoEtichette
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
