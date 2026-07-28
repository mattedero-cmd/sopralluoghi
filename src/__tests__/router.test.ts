import { describe, expect, it } from 'vitest';
import { analizzaHash, urlRotta, type Rotta } from '../router';

/** ogni indirizzo deve tornare identico dopo un giro completo */
const andataERitorno = (r: Rotta) => analizzaHash(urlRotta(r));

describe('indirizzi del nesting', () => {
  it('la bozza corrente', () => {
    expect(analizzaHash('#/nesting')).toEqual({ nome: 'nesting' });
  });

  it('un lavoro salvato in archivio', () => {
    expect(analizzaHash('#/nesting/abc-123')).toEqual({ nome: 'nesting', id: 'abc-123' });
  });

  it('un lavoro nuovo dentro una cartella', () => {
    expect(analizzaHash('#/nesting/nuovo/cart-1')).toEqual({ nome: 'nesting', nuovoIn: 'cart-1' });
  });

  it('lo strumento aperto DA una cartella: la bozza sa dove andrà a finire', () => {
    expect(analizzaHash('#/nesting/in/cart-1')).toEqual({ nome: 'nesting', dentro: 'cart-1' });
  });

  it('«in» senza cartella non è un indirizzo: vale come id, non si perde nulla', () => {
    expect(analizzaHash('#/nesting/in')).toEqual({ nome: 'nesting', id: 'in' });
  });

  it('andata e ritorno', () => {
    expect(andataERitorno({ nome: 'nesting' })).toEqual({ nome: 'nesting' });
    expect(andataERitorno({ nome: 'nesting', id: 'x1' })).toEqual({ nome: 'nesting', id: 'x1' });
    expect(andataERitorno({ nome: 'nesting', nuovoIn: 'c1' })).toEqual({
      nome: 'nesting',
      nuovoIn: 'c1'
    });
    expect(andataERitorno({ nome: 'nesting', dentro: 'c1' })).toEqual({
      nome: 'nesting',
      dentro: 'c1'
    });
  });
});

describe('indirizzi dei disegni', () => {
  it('un disegno in archivio', () => {
    expect(analizzaHash('#/disegno/d-1')).toEqual({ nome: 'disegno', id: 'd-1' });
    expect(urlRotta({ nome: 'disegno', id: 'd-1' })).toBe('#/disegno/d-1');
  });

  it('senza id si torna all’archivio invece di aprire il vuoto', () => {
    expect(analizzaHash('#/disegno')).toEqual({ nome: 'archivio', cartellaId: null });
  });
});

describe('il resto dell’archivio', () => {
  it('radice, cartella, progetto, foto', () => {
    expect(analizzaHash('#/')).toEqual({ nome: 'archivio', cartellaId: null });
    expect(analizzaHash('#/cartella/c9')).toEqual({ nome: 'archivio', cartellaId: 'c9' });
    expect(analizzaHash('#/progetto/p9')).toEqual({ nome: 'progetto', id: 'p9' });
    expect(analizzaHash('#/foto/f9')).toEqual({ nome: 'foto', id: 'f9' });
  });

  it('un indirizzo sconosciuto non lascia l’app in bianco', () => {
    expect(analizzaHash('#/qualcosa/che/non/esiste')).toEqual({
      nome: 'archivio',
      cartellaId: null
    });
  });
});
