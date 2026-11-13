import { describe, expect, it } from 'vitest';
import type { Porta } from '../../db/types';
import { materialeNuovo, migraDocumento, type DocumentoNesting } from '../documentoNesting';
import { firmaStrisce, gruppiMontaggio, NOME_MATERIALE_KIT, nomePorte, pezziKit, sincronizzaKit } from '../portePiano';

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
  it('in kit ogni pezzo porta la sua sigla e la quantità delle porte', () => {
    const pezzi = pezziKit([porta('a', 'A')], new Map([['a', 12]]), { modi: { a: 'kit' } });
    expect(pezzi.map((p) => [p.nome, p.quantita])).toEqual([
      ['PA-T-S', 12],
      ['PA-MDX-S', 12],
      ['PA-MSX-S', 12],
      ['PA-I-A', 12]
    ]);
  });

  it('la sigla salvata dal rilievo porta comanda sul nome', () => {
    const p = { ...porta('a', 'A'), righe: [{ ...righe[1], sigla: 'E-MDX-S' }] };
    expect(pezziKit([p], new Map([['a', 1]]), { modi: { a: 'kit' } })[0].nome).toBe('PA-E-MDX-S');
  });

  it('con la venatura il lato lungo va nel verso della fibra e il pezzo non gira', () => {
    const conto = new Map([['a', 1]]);
    const v = pezziKit([porta('a', 'A')], conto, { modi: { a: 'kit' } }, 'verticale');
    const traverso = v.find((p) => p.nome.includes('-T-'))!;
    expect([traverso.larghezza, traverso.altezza, traverso.ruotabile]).toEqual([158, 854, false]);
    const o = pezziKit([porta('a', 'A')], conto, { modi: { a: 'kit' } }, 'orizzontale');
    const montante = o.find((p) => p.nome.includes('-MDX-'))!;
    expect([montante.larghezza, montante.altezza, montante.ruotabile]).toEqual([2142, 158, false]);
    // senza venatura il motore li gira come conviene
    expect(pezziKit([porta('a', 'A')], conto, { modi: { a: 'kit' } }).every((p) => p.ruotabile)).toBe(true);
  });

  it('cambiando la venatura dell\'essenza dei kit i pezzi si rimettono nel verso giusto', () => {
    const porte = [porta('a', 'A')];
    const conto = new Map([['a', 1]]);
    const d1 = sincronizzaKit(documento({ a: 'kit' }), porte, conto);
    const id = d1.porte!.materialeKit!;
    // l'utente mette venatura orizzontale e gira a mano una copia
    const d2 = {
      ...d1,
      materiali: d1.materiali.map((m) =>
        m.id === id ? { ...m, venatura: 'orizzontale' as const, orientamenti: { 'x#0': true } } : m
      )
    };
    const d3 = sincronizzaKit(d2, porte, conto);
    const kit = d3.materiali.find((m) => m.id === id)!;
    expect(kit.orientamenti).toEqual({});
    const traverso = kit.pezzi.find((p) => p.nome.includes('-T-'))!;
    expect([traverso.larghezza, traverso.altezza, traverso.ruotabile]).toEqual([854, 158, false]);
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
    expect(kit.pezzi.every((p) => p.nome.startsWith('PA-'))).toBe(true);
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

  it('stessa famiglia e stessa firma: stesse istruzioni; una porta nuova fa gruppo a sé', () => {
    const a = { ...porta('a', 'A'), famiglia: 'a', firma: 'x' };
    const b = { ...porta('b', 'B'), famiglia: 'a', firma: 'x' };
    const c = { ...porta('c', 'C'), famiglia: 'a', firma: 'y' }; // modificata nella costruzione
    const d = { ...porta('d', 'D'), famiglia: 'd', firma: 'x' }; // da zero, costruita uguale
    const e = porta('e', 'E'); // salvata prima delle famiglie
    const g = gruppiMontaggio([a, b, c, d, e]);
    expect(g.map((x) => nomePorte(x.porte))).toEqual(['Porte A, B', 'Porta C', 'Porta D', 'Porta E']);
    expect(g.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
  });
});
