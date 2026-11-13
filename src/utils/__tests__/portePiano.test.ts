import { describe, expect, it } from 'vitest';
import type { Porta } from '../../db/types';
import { materialeNuovo, migraDocumento, type DocumentoNesting } from '../documentoNesting';
import { firmaStrisce, NOME_MATERIALE_KIT, pezziKit, sincronizzaKit } from '../portePiano';

const righe = [
  { nome: 'Traverso · Stipite', larghezza: 158, lunghezza: 854, anta: false },
  { nome: 'Montante DX · Stipite', larghezza: 158, lunghezza: 2142, anta: false },
  { nome: 'Montante SX · Stipite', larghezza: 158, lunghezza: 2142, anta: false },
  { nome: 'Anta · Faccia interna', larghezza: 930, lunghezza: 2230, anta: true }
];
function porta(id: string, lettera: string): Porta {
  return {
    id,
    progettoId: 'p',
    nome: `Porta ${lettera}`,
    lettera,
    descrizione: '',
    config: {},
    righe,
    creatoIl: 1,
    modificatoIl: 1
  };
}
function documento(modi: Record<string, 'kit' | 'strisce'>): DocumentoNesting {
  const m = materialeNuovo('m1', 'Pareti');
  return { versione: 2, nome: 'Taglio', materiali: [m], attivo: 'm1', porte: { modi } };
}

describe('porte nel piano di taglio', () => {
  it('in kit i montanti uguali diventano una riga, moltiplicata per le porte', () => {
    const pezzi = pezziKit([porta('a', 'A')], new Map([['a', 12]]), { modi: { a: 'kit' } });
    expect(pezzi.map((p) => [p.nome, p.quantita])).toEqual([
      ['Porta A · Traverso · Stipite', 12],
      ['Porta A · Montanti · Stipite', 24],
      ['Porta A · Anta · Faccia interna', 12]
    ]);
  });

  it('a strisce (il predefinito) non entra niente nei kit', () => {
    expect(pezziKit([porta('a', 'A')], new Map([['a', 3]]), { modi: {} })).toHaveLength(0);
  });

  it('i kit hanno la loro essenza su bobina, che si toglie quando non servono più', () => {
    const porte = [porta('a', 'A'), porta('b', 'B')];
    const conto = new Map([['a', 2], ['b', 5]]);
    const d1 = sincronizzaKit(documento({ a: 'kit' }), porte, conto);
    expect(d1.materiali).toHaveLength(2);
    const kit = d1.materiali.find((m) => m.id === d1.porte?.materialeKit)!;
    expect(kit.nome).toBe(NOME_MATERIALE_KIT);
    expect(kit.modo).toBe('bobina');
    expect(kit.pezzi.every((p) => p.nome.startsWith('Porta A'))).toBe(true);
    // stessa situazione: stesso documento
    expect(sincronizzaKit(d1, porte, conto)).toBe(d1);
    // le etichette cambiano: le quantità seguono
    const d2 = sincronizzaKit(d1, porte, new Map([['a', 3], ['b', 5]]));
    expect(d2.materiali.find((m) => m.id === kit.id)!.pezzi[0].quantita).toBe(3);
    // tutto a strisce: l'essenza dei kit sparisce
    const d3 = sincronizzaKit({ ...d2, porte: { ...d2.porte!, modi: { a: 'strisce' } }, attivo: kit.id }, porte, conto);
    expect(d3.materiali.map((m) => m.nome)).toEqual(['Pareti']);
    expect(d3.attivo).toBe('m1');
    expect(d3.porte?.materialeKit).toBeUndefined();
  });

  it('la sezione porte resta nel salvataggio', () => {
    const d = sincronizzaKit(documento({ a: 'kit' }), [porta('a', 'A')], new Map([['a', 1]]));
    const letto = migraDocumento(JSON.parse(JSON.stringify(d)));
    expect(letto?.porte?.modi).toEqual({ a: 'kit' });
    expect(letto?.porte?.materialeKit).toBe(d.porte?.materialeKit);
  });

  it('la firma cambia con le quantità', () => {
    const p = [porta('a', 'A')];
    expect(firmaStrisce(p, new Map([['a', 1]]))).not.toBe(firmaStrisce(p, new Map([['a', 2]])));
  });
});
