import { describe, expect, it } from 'vitest';
import { analizzaTestoPezzi } from '../parserPezzi';

const uno = (testo: string) => analizzaTestoPezzi(testo).pezzi[0];

describe('analizzaTestoPezzi — misure', () => {
  it('riconosce le forme comuni della coppia di dimensioni', () => {
    expect(uno('ante 597x720')).toMatchObject({ larghezza: 597, altezza: 720 });
    expect(uno('ripiano 560 × 300')).toMatchObject({ larghezza: 560, altezza: 300 });
    expect(uno('fondo 1160✕560')).toMatchObject({ larghezza: 1160, altezza: 560 });
    expect(uno('tavola 800*400')).toMatchObject({ larghezza: 800, altezza: 400 });
  });

  it('accetta la virgola decimale', () => {
    expect(uno('lato 597,5 x 720,25')).toMatchObject({ larghezza: 597.5, altezza: 720.3 });
  });

  it('converte i centimetri in millimetri', () => {
    expect(uno('ripiano 56x30 cm')).toMatchObject({ larghezza: 560, altezza: 300 });
  });

  it('se ci sono i mm non converte (anche se cita cm)', () => {
    expect(uno('ripiano 560x300 mm (non cm)')).toMatchObject({ larghezza: 560, altezza: 300 });
  });

  it('una riga senza misura finisce fra le ignorate', () => {
    const r = analizzaTestoPezzi('Materiale: rovere\nripiano 560x300\nda confermare col cliente');
    expect(r.pezzi).toHaveLength(1);
    expect(r.ignorate).toEqual(['Materiale: rovere', 'da confermare col cliente']);
  });

  it('scarta le righe con misura nulla', () => {
    const r = analizzaTestoPezzi('strano 0x300');
    expect(r.pezzi).toHaveLength(0);
    expect(r.ignorate).toHaveLength(1);
  });
});

describe('analizzaTestoPezzi — quantità', () => {
  it('riconosce le forme comuni', () => {
    expect(uno('Cassetto 400x140 x8').quantita).toBe(8);
    expect(uno('4 ante 597 x 720').quantita).toBe(4);
    expect(uno('ripiani 560x300 6 pezzi').quantita).toBe(6);
    expect(uno('ripiani 560x300 q.tà 6').quantita).toBe(6);
    expect(uno('ripiani 560x300 n. 8').quantita).toBe(8);
    expect(uno('fondo 1160x560 3 pz').quantita).toBe(3);
  });

  it('«quantità 3» funziona: `à` non è un word character, quindi dopo di essa NON va `\\b`', () => {
    // regressione: con `\b` dopo `quantit[àa]` questo caso tornava 1
    expect(uno('ripiano 560x300 quantità 3').quantita).toBe(3);
    expect(uno('ripiano 560x300 quantita 3').quantita).toBe(3);
    expect(uno('ripiano 560x300 quantità: 5').quantita).toBe(5);
  });

  it('senza indicazioni la quantità è 1', () => {
    expect(uno('anta 597x720').quantita).toBe(1);
  });

  it('non confonde la misura con una quantità', () => {
    // "597x720" non deve essere letto come "x720"
    expect(uno('anta 597x720').quantita).toBe(1);
    expect(uno('- 2 fondi 1160×560').quantita).toBe(2);
  });
});

describe('analizzaTestoPezzi — rotazione', () => {
  it('di default è consentita', () => {
    expect(uno('anta 597x720').ruotabile).toBe(true);
  });

  it('«verso fisso» e simili la vietano', () => {
    expect(uno('fondo 1160x560 verso fisso').ruotabile).toBe(false);
    expect(uno('anta 597x720 (venatura verticale)').ruotabile).toBe(false);
    expect(uno('anta 597x720 non ruotare').ruotabile).toBe(false);
  });

  it('un «ruotabile» esplicito ha la meglio', () => {
    expect(uno('ripiano 560x300 (ruotabile, verso libero)').ruotabile).toBe(true);
  });
});

describe('analizzaTestoPezzi — nome', () => {
  it('ripulisce elenco, misure, quantità e parole di servizio', () => {
    expect(uno('- 4 ante 597 x 720 mm (ruotabili)').nome).toBe('Ante');
    expect(uno('1. Cassetto frontale 400x140 x8').nome).toBe('Cassetto frontale');
    expect(uno('• 6 ripiani da 560x300 cm').nome).toBe('Ripiani');
  });

  it('senza nome utile usa un segnaposto', () => {
    expect(uno('560x300').nome).toBe('Pezzo');
  });

  it('l’iniziale è maiuscola', () => {
    expect(uno('fianco 300x800').nome).toBe('Fianco');
  });
});

describe('analizzaTestoPezzi — lista realistica', () => {
  it('interpreta un elenco misto', () => {
    const r = analizzaTestoPezzi(
      [
        'Progetto cucina — lista tagli',
        '- 4 ante 597 x 720',
        '- 6 ripiani 560x300 (ruotabili)',
        '- 2 fondi 1160×560 verso fisso',
        '- Cassetto 400x140 x8',
        'nota: bordare i frontali'
      ].join('\n')
    );
    expect(r.pezzi).toHaveLength(4);
    expect(r.pezzi.map((p) => [p.nome, p.larghezza, p.altezza, p.quantita, p.ruotabile])).toEqual([
      ['Ante', 597, 720, 4, true],
      ['Ripiani', 560, 300, 6, true],
      ['Fondi', 1160, 560, 2, false],
      ['Cassetto', 400, 140, 8, true]
    ]);
    expect(r.ignorate).toHaveLength(2);
  });

  it('testo vuoto non produce nulla', () => {
    expect(analizzaTestoPezzi('')).toEqual({ pezzi: [], ignorate: [] });
    expect(analizzaTestoPezzi('   \n  \n')).toEqual({ pezzi: [], ignorate: [] });
  });
});
