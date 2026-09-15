import { describe, expect, it } from 'vitest';
import { pianoRotto, resaImpossibile, sovrapposizioni } from '../controlloPiano';
import type { LastraNesting, Piazzamento } from '../nesting';

/**
 * IL CONTROLLO CHE GUARDA IL RISULTATO.
 *
 * Non sa niente di come il piano è stato calcolato, ed è il punto: le due
 * volte che un piano è uscito con due pezzi uno sopra l'altro, le prove del
 * motore erano verdi — guardavano il motore. Questo guarda quello che finisce
 * sotto la lama.
 */

const pezzo = (nome: string, x: number, y: number, l: number, a: number, extra = {}): Piazzamento =>
  ({
    x,
    y,
    larghezza: l,
    altezza: a,
    larghezzaFinita: l,
    altezzaFinita: a,
    nome,
    tinta: 0,
    ruotato: false,
    chiave: `${nome}#0`,
    ...extra
  }) as Piazzamento;

const piano = (...p: Piazzamento[]): LastraNesting => ({ piazzamenti: p });

describe('sovrapposizioni', () => {
  it('un piano sano non ha niente da dire', () => {
    expect(sovrapposizioni(piano(pezzo('A', 0, 0, 100, 100), pezzo('B', 103, 0, 100, 100)), 3))
      .toEqual([]);
    expect(sovrapposizioni(piano(pezzo('A', 0, 0, 100, 100), pezzo('B', 0, 103, 100, 100)), 3))
      .toEqual([]);
  });

  it('due pezzi accavallati si dicono, col nome e col posto', () => {
    const g = sovrapposizioni(piano(pezzo('Anta', 0, 0, 100, 100), pezzo('Fianco', 50, 50, 100, 100)), 3);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ a: 'Anta', b: 'Fianco', distanza: 0 });
    expect(g[0].dove).toBe('0,0 e 50,50');
  });

  it('due pezzi troppo vicini si dicono anche se non si toccano', () => {
    const g = sovrapposizioni(piano(pezzo('A', 0, 0, 100, 100), pezzo('B', 0, 101, 100, 100)), 3);
    expect(g).toHaveLength(1);
    expect(g[0].distanza).toBeCloseTo(1, 6);
  });

  it('due sagome INCASTRATE non sono un guasto, per quanto si accavallino gli ingombri', () => {
    // è tutta la ragione per cui il motore a sagome esiste: due trapezi
    // testa-coda hanno i rettangoli d'ingombro sovrapposti e stanno benissimo
    const su = pezzo('Trapezio', 10, 10, 860, 1260, {
      forma: 'trapezioR',
      punti: [
        [860, 0],
        [0, 0],
        [0, 715],
        [860, 1260]
      ]
    });
    const giu = pezzo('Trapezio', 10, 728.6, 860, 1260, {
      forma: 'trapezioR',
      punti: [
        [0, 1260],
        [860, 1260],
        [860, 545],
        [0, 0]
      ]
    });
    // gli ingombri si accavallano per mezzo metro
    expect(su.y + su.altezza).toBeGreaterThan(giu.y + 500);
    expect(sovrapposizioni(piano(su, giu), 3)).toEqual([]);
  });

  it('due sagome che si accavallano DAVVERO si dicono', () => {
    const su = pezzo('Trapezio', 10, 10, 860, 1260, {
      forma: 'trapezioR',
      punti: [
        [860, 0],
        [0, 0],
        [0, 715],
        [860, 1260]
      ]
    });
    // lo stesso trapezio, ma salito di mezzo metro: adesso le sagome si tagliano
    const dentro = pezzo('Trapezio', 10, 228.6, 860, 1260, {
      forma: 'trapezioR',
      punti: [
        [0, 1260],
        [860, 1260],
        [860, 545],
        [0, 0]
      ]
    });
    expect(sovrapposizioni(piano(su, dentro), 3)).toHaveLength(1);
  });

  it('il cerchio si misura da cerchio, non dal suo riquadro', () => {
    // due tondi con gli ingombri che si toccano in uno spigolo: fra i cerchi
    // veri ci passa tutto
    const a = pezzo('Obló', 0, 0, 100, 100, { forma: 'cerchio' });
    const b = pezzo('Obló', 100, 100, 100, 100, { forma: 'cerchio' });
    expect(sovrapposizioni(piano(a, b), 3)).toEqual([]);
  });
});

describe('la partita doppia: geometria e aritmetica', () => {
  const pezzo = (nome: string, x: number, y: number, l: number, a: number, extra = {}): Piazzamento =>
    ({
      x, y, larghezza: l, altezza: a, larghezzaFinita: l, altezzaFinita: a,
      nome, tinta: 0, ruotato: false, chiave: `${nome}#0`, ...extra
    }) as Piazzamento;
  const piano = (...p: Piazzamento[]): LastraNesting => ({ piazzamenti: p });

  it('un piano sano torna in tutti e due i libri', () => {
    const l = piano(pezzo('A', 0, 0, 900, 1000), pezzo('B', 0, 1003, 900, 1000));
    expect(resaImpossibile(l, 915, 2003)).toBeNull();
    expect(pianoRotto(l, 3, 915, 2003)).toBeNull();
  });

  it('la resa non può superare il 100%: è materiale contato due volte', () => {
    // tre pezzi impilati nello stesso punto: 2,7 volte il foglio
    const l = piano(
      pezzo('A', 0, 0, 900, 1000),
      pezzo('B', 0, 0, 900, 1000),
      pezzo('C', 0, 0, 900, 700)
    );
    const r = resaImpossibile(l, 915, 1000);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(250);
  });

  it('un foglio pieno esatto passa: è il 100% che non si supera', () => {
    const l = piano(pezzo('A', 0, 0, 915, 1000));
    expect(resaImpossibile(l, 915, 1000)).toBeNull();
  });

  it('l’ARITMETICA vede quello che la geometria potrebbe lasciarsi sfuggire', () => {
    // due sagome dichiarate lontane da una misura sbagliata, ma impilate:
    // qui i `punti` mentono di proposito — sono due triangolini in un angolo —
    // mentre le misure finite dicono che i pezzi sono grandi. La geometria si
    // fida dei punti e tace; l'aritmetica no.
    const bugiardo = (nome: string) =>
      pezzo(nome, 0, 0, 900, 1000, {
        forma: 'triangolo',
        punti: nome === 'A' ? [[0, 0], [10, 0], [0, 10]] : [[890, 990], [900, 990], [900, 1000]],
        areaVera: 900 * 1000
      });
    const l = piano(bugiardo('A'), bugiardo('B'));
    expect(sovrapposizioni(l, 3), 'la geometria non vede niente').toEqual([]);
    expect(resaImpossibile(l, 915, 1000), 'l’aritmetica sì').not.toBeNull();
    expect(pianoRotto(l, 3, 915, 1000)).not.toBeNull();
  });

  it('la GEOMETRIA vede quello che l’aritmetica non può vedere', () => {
    // due pezzi piccoli che si sfiorano: l'area è una briciola del foglio,
    // l'aritmetica è tranquilla, ma la lama lì non passa
    const l = piano(pezzo('A', 0, 0, 100, 100), pezzo('B', 0, 101, 100, 100));
    expect(resaImpossibile(l, 915, 1000), 'l’aritmetica non vede niente').toBeNull();
    expect(sovrapposizioni(l, 3), 'la geometria sì').toHaveLength(1);
    expect(pianoRotto(l, 3, 915, 1000)).not.toBeNull();
  });
});
