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
    const r = analizzaTestoPezzi('ripiano 560x300\nda confermare col cliente');
    expect(r.pezzi).toHaveLength(1);
    expect(r.ignorate).toEqual(['da confermare col cliente']);
  });

  it('«Materiale: rovere» dichiara l’essenza, non è una riga da buttare', () => {
    const r = analizzaTestoPezzi('Materiale: rovere\nripiano 560x300');
    expect(r.materiali).toEqual(['Rovere']);
    expect(r.pezzi[0].materiale).toBe('Rovere');
    expect(r.ignorate).toEqual([]);
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
    expect(analizzaTestoPezzi('')).toEqual({ pezzi: [], ignorate: [], materiali: [] });
    expect(analizzaTestoPezzi('   \n  \n')).toEqual({ pezzi: [], ignorate: [], materiali: [] });
  });
});

describe('liste divise per essenza', () => {
  const LISTA = `Legno scuro

* Ante armadio — 3 pz — 220 × 61 cm
* Sopraluce armadio — 2 pz — 220 × 30 cm
* Fianchi comodino — 8 pz — 50 × 50 cm
* Fianchi/traverse comodino — 4 pz — 50 × 30 cm

Bianco

* Fianchi porta valigie — 3 pz — 61 × 40 cm

Materiale chiaro (pelle chiara)

* Fianco armadio — 1 pz — 230 × 45 cm
* Frontali cassetti comodino — 2 pz — 50 × 15 cm`;

  it('riconosce le intestazioni di materiale e ci attacca i pezzi', () => {
    const e = analizzaTestoPezzi(LISTA);
    expect(e.materiali).toEqual(['Legno scuro', 'Bianco', 'Materiale chiaro (pelle chiara)']);
    expect(e.pezzi).toHaveLength(7);
    expect(e.pezzi[0]).toMatchObject({
      nome: 'Ante armadio',
      larghezza: 2200,
      altezza: 610,
      quantita: 3,
      materiale: 'Legno scuro'
    });
    expect(e.pezzi[3].materiale).toBe('Legno scuro');
    expect(e.pezzi[4]).toMatchObject({ nome: 'Fianchi porta valigie', materiale: 'Bianco' });
    expect(e.pezzi[6].materiale).toBe('Materiale chiaro (pelle chiara)');
    expect(e.ignorate).toEqual([]);
  });

  it('senza intestazioni i pezzi restano senza materiale', () => {
    const e = analizzaTestoPezzi('Anta 600x400 x2\nFianco 300x800');
    expect(e.materiali).toEqual([]);
    expect(e.pezzi.every((p) => p.materiale === undefined)).toBe(true);
  });

  it('una frase di commento non diventa un materiale', () => {
    const e = analizzaTestoPezzi(
      'Ricorda di controllare il verso della venatura prima di tagliare\nAnta 600x400'
    );
    expect(e.materiali).toEqual([]);
    expect(e.ignorate).toHaveLength(1);
  });

  it('un titolo senza pezzi sotto resta fra le righe ignorate', () => {
    const e = analizzaTestoPezzi('Anta 600x400\n\nNoce nazionale');
    expect(e.materiali).toEqual([]);
    expect(e.ignorate).toEqual(['Noce nazionale']);
  });

  it('due titoli di fila: conta solo quello che ha pezzi sotto', () => {
    const e = analizzaTestoPezzi('Rovere\nNoce\nAnta 600x400');
    expect(e.materiali).toEqual(['Noce']);
    expect(e.ignorate).toEqual(['Rovere']);
    expect(e.pezzi[0].materiale).toBe('Noce');
  });

  it('accetta il titolo con i due punti o in grassetto markdown', () => {
    const e = analizzaTestoPezzi('**Legno scuro:**\nAnta 600x400');
    expect(e.materiali).toEqual(['Legno scuro']);
  });
});

describe('analizzaTestoPezzi — forme', () => {
  it('il cerchio: parola e diametro, o solo il Ø', () => {
    expect(uno('cerchio Ø300 x2')).toMatchObject({
      forma: 'cerchio',
      larghezza: 300,
      altezza: 300,
      quantita: 2,
      nome: 'Cerchio'
    });
    // il simbolo basta da solo, anche coi centimetri
    expect(uno('Oblò Ø 30 cm')).toMatchObject({
      forma: 'cerchio',
      larghezza: 300,
      altezza: 300,
      nome: 'Oblò'
    });
    expect(uno('tondo diam. 450')).toMatchObject({ forma: 'cerchio', larghezza: 450 });
  });

  it('il trapezio isoscele scritto B/b×h', () => {
    expect(uno('trapezio 500/300x200 x3')).toMatchObject({
      forma: 'trapezio',
      larghezza: 500, // base maggiore
      altezza: 200, // altezza
      misura3: 300, // base minore
      quantita: 3,
      nome: 'Trapezio'
    });
    // «basi 500 e 300, altezza 200» dice la stessa cosa a parole
    expect(uno('frontone basi 500 e 300, altezza 200')).toMatchObject({
      forma: 'trapezio',
      larghezza: 500,
      altezza: 200,
      misura3: 300
    });
  });

  it('la finestra sotto falda: base più due altezze, senza bisogno della parola', () => {
    expect(uno('Finestra sottotetto base 1200, h sx 900, h dx 1400')).toMatchObject({
      forma: 'trapezioR',
      larghezza: 1200,
      altezza: 900, // altezza sinistra
      misura3: 1400, // altezza destra
      nome: 'Finestra sottotetto'
    });
    // coi centimetri
    expect(uno('velux base 120, h sx 90, h dx 140 cm')).toMatchObject({
      forma: 'trapezioR',
      larghezza: 1200,
      altezza: 900,
      misura3: 1400
    });
  });

  it('altezze uguali: è un rettangolo detto male, la terza misura non resta', () => {
    const p = uno('lucernario base 600, h sx 400, h dx 400');
    expect(p.forma).toBeUndefined();
    expect(p.misura3).toBeUndefined();
    expect(p).toMatchObject({ larghezza: 600, altezza: 400 });
  });

  it('«Trapezi:» da solo apre una sezione: le righe sotto sono trapezi rettangoli', () => {
    const e = analizzaTestoPezzi('Trapezi:\n- Finestra falda 600 x 400 x 800\n- 500 x 300 x 700');
    expect(e.pezzi).toHaveLength(2);
    expect(e.pezzi[0]).toMatchObject({
      forma: 'trapezioR',
      larghezza: 600,
      altezza: 400,
      misura3: 800,
      nome: 'Finestra falda'
    });
    expect(e.pezzi[1]).toMatchObject({ forma: 'trapezioR', misura3: 700 });
    // la sezione di forma non è un'essenza
    expect(e.materiali).toEqual([]);
  });

  it('triangoli e rombi: coppia di misure, il terzo numero è la quantità', () => {
    expect(uno('triangolo 400x300 x2')).toMatchObject({
      forma: 'triangolo',
      larghezza: 400,
      altezza: 300,
      quantita: 2
    });
    expect(uno('rombo 600 × 350')).toMatchObject({ forma: 'rombo', larghezza: 600, altezza: 350 });
  });

  it('le righe rettangolari di sempre non prendono nessuna forma', () => {
    const p = uno('anta 597x720');
    expect(p.forma).toBeUndefined();
    expect(p.misura3).toBeUndefined();
  });
});
