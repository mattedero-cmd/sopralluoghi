import { describe, expect, it } from 'vitest';
import type { Annotazione, Cartella, Foto, Progetto, QuotaPoligono } from '../../db/types';
import {
  codiceCompletoForma,
  codiceLocaleForma,
  letteraDaIndice,
  letteraFoto,
  numeroForma,
  percorsoEtichette
} from '../nomenclatura';

const stile = { colore: '#ffc400', spessore: 3, dimensioneTesto: 28 };

function forma(id: string, zIndex: number, etichetta?: string): QuotaPoligono {
  return {
    id,
    fotoId: 'f1',
    tipo: 'quotaPoligono',
    zIndex,
    stile,
    punti: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ],
    segmenti: [{ da: 0, a: 1, valore: 10 }],
    unita: 'cm',
    stato: 'reale',
    etichetta
  };
}

describe('lettere da indice', () => {
  it('0→A, 25→Z, 26→AA, 27→AB', () => {
    expect(letteraDaIndice(0)).toBe('A');
    expect(letteraDaIndice(25)).toBe('Z');
    expect(letteraDaIndice(26)).toBe('AA');
    expect(letteraDaIndice(27)).toBe('AB');
  });
});

describe('lettera della foto per ordine nel progetto', () => {
  const foto = (id: string, ordine: number): Foto => ({ id, ordine }) as Foto;
  it('la prima foto (ordine minore) è A, la seconda B…', () => {
    const lista = [foto('x', 20), foto('y', 10), foto('z', 30)];
    expect(letteraFoto(foto('y', 10), lista)).toBe('A');
    expect(letteraFoto(foto('x', 20), lista)).toBe('B');
    expect(letteraFoto(foto('z', 30), lista)).toBe('C');
  });
});

describe('numero e codice locale della forma', () => {
  const ann: Annotazione[] = [forma('a', 2), forma('b', 1), forma('c', 3)];
  it('il numero segue lo zIndex (1-based)', () => {
    expect(numeroForma('b', ann)).toBe(1);
    expect(numeroForma('a', ann)).toBe(2);
    expect(numeroForma('c', ann)).toBe(3);
  });
  it('codice locale = lettera + numero', () => {
    expect(codiceLocaleForma(ann[1], 'A', ann)).toBe('A1'); // 'b' è la 1ª
    expect(codiceLocaleForma(ann[0], 'A', ann)).toBe('A2'); // 'a' è la 2ª
  });
  it('un override manuale prevale sul codice automatico', () => {
    const conOverride = forma('d', 5, 'SPECIALE');
    expect(codiceLocaleForma(conOverride, 'B', [conOverride])).toBe('SPECIALE');
  });
});

describe('percorso delle etichette di cartelle e progetto', () => {
  const cartelle: Cartella[] = [
    { id: 'edif', nome: 'Edificio A', parentId: null, etichetta: 'E1', creataIl: 0, modificataIl: 0 },
    { id: 'piano', nome: 'Primo piano', parentId: 'edif', etichetta: 'P1', creataIl: 0, modificataIl: 0 },
    { id: 'stanza', nome: 'Stanza 1', parentId: 'piano', etichetta: 'S1', creataIl: 0, modificataIl: 0 }
  ];
  it('concatena dalla radice alla foglia, saltando le etichette vuote', () => {
    const prog = { cartellaId: 'stanza', etichetta: undefined } as Pick<Progetto, 'cartellaId' | 'etichetta'>;
    expect(percorsoEtichette(prog, cartelle)).toEqual(['E1', 'P1', 'S1']);
  });
  it('include anche l’etichetta del progetto se presente', () => {
    const prog = { cartellaId: 'piano', etichetta: 'PR' } as Pick<Progetto, 'cartellaId' | 'etichetta'>;
    expect(percorsoEtichette(prog, cartelle)).toEqual(['E1', 'P1', 'PR']);
  });
  it('codice completo: percorso + codice locale', () => {
    expect(codiceCompletoForma(['E1', 'P1', 'S1'], 'A1')).toBe('E1.P1.S1.A1');
    expect(codiceCompletoForma([], 'A1')).toBe('A1');
  });
});
