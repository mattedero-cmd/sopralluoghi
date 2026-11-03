import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { larghezzaStimata, riassuntoLastra } from '../disegnoNesting';
import type { LastraNesting, Piazzamento } from '../../geometry/nesting';

/**
 * LA DIDASCALIA CHE FINIVA SULLA PAGINA DOPO.
 *
 * Sotto il disegno di ogni lastra c'è l'elenco dei suoi pezzi, appoggiato a
 * una posizione ASSOLUTA: subito sotto il disegno, perché una lastra bassa e
 * larga non lasci mezza pagina bianca. Un blocco assoluto che non ci sta però
 * pdfmake non lo taglia — lo fa continuare sulla pagina dopo, dove casca
 * sopra l'intestazione della lastra successiva.
 *
 * Misurato con pdfmake sul foglio vero del cantiere: la didascalia di
 * diciotto pannelli è 550 caratteri, lo spazio sotto un disegno a tutta
 * altezza ne reggeva DODICI PUNTI — una riga — e il documento usciva con
 * l'elenco di una lastra stampato sopra il titolo di quella dopo.
 *
 * Adesso lo spazio si conta prima e il testo si fa stare. Il conto di quanto
 * ci sta non è una media: su Roboto un carattere va da 0,20 del punto a 0,89
 * della W, e con la media si sfonda su «PARETE WWW». Si pesa carattere per
 * carattere, arrotondando ogni classe PER ECCESSO — stimare largo fa perdere
 * una voce, stimare stretto manda l'elenco nella pagina dopo.
 */

const P = (nome: string, l: number, a: number): Piazzamento =>
  ({
    x: 0,
    y: 0,
    larghezza: l,
    altezza: a,
    larghezzaFinita: l,
    altezzaFinita: a,
    nome,
    tinta: 0,
    ruotato: false,
    chiave: `${nome}#0`
  }) as Piazzamento;

/** i diciotto pannelli del cantiere, quelli che facevano traboccare la pagina */
const PANNELLI: LastraNesting = {
  piazzamenti: (
    [
      ['PANNELLO 5.b', 1080, 1500], ['PANNELLO 6', 1220, 1250], ['PANNELLO 13.a', 1220, 1100],
      ['PANNELLO 14.a', 1220, 1100], ['PANNELLO 12', 1220, 1100], ['PANNELLO 1', 1220, 1100],
      ['PANNELLO 3.a', 1220, 1000], ['PANNELLO 3.b', 1220, 1000], ['PANNELLO 8', 900, 1350],
      ['PANNELLO 13.b', 790, 1100], ['PANNELLO 2.a', 1220, 850], ['PANNELLO 10', 800, 1100],
      ['PANNELLO 1.b', 390, 500], ['PANNELLO 7.a', 630, 1250], ['PANNELLO 14.b', 590, 1100],
      ['PANNELLO 2.b', 490, 850], ['PANNELLO 9', 1000, 400], ['PANNELLO 11', 1100, 350]
    ] as Array<[string, number, number]>
  ).map(([n, l, a]) => P(n, l, a))
};

/** la larghezza utile sotto il disegno su A4 in piedi */
const LARGHEZZA = 515.28;
const CORPO = 8;

describe('la didascalia sotto il disegno', () => {
  it('senza limiti resta quella di sempre', () => {
    const t = riassuntoLastra(PANNELLI);
    expect(t).toContain('1× PANNELLO 5.b 1080×1500');
    expect(t).toContain('1× PANNELLO 11 1100×350');
    expect(t).not.toContain('…e altri');
  });

  it('in due righe si tronca, e dice quanti ne restano fuori', () => {
    const t = riassuntoLastra(PANNELLI, { larghezza: LARGHEZZA, righe: 2, corpo: CORPO });
    const m = t.match(/…e altri (\d+)$/);
    expect(m, 'non dice quanti ne mancano').toBeTruthy();
    const restano = Number(m![1]);
    const nominati = t.split('   ·   ').length - 1;
    expect(nominati + restano).toBe(18);
    expect(nominati).toBeGreaterThan(2);
  });

  it('non supera mai lo spazio che ha, qualunque siano i nomi', () => {
    // il patto: larghezza stimata del testo ≤ righe × larghezza × la resa
    const nomi = [
      'A', 'PANNELLO 1', 'INTERNO 13.a', 'PARETE DIVISORIA SOGGIORNO ALTA 12.b',
      'VETRATA SCORREVOLE PIANO PRIMO LATO EST ANTA 3', 'WWWWW WWWWW WWWWW WWWWW'
    ];
    for (const nome of nomi)
      for (const n of [1, 2, 4, 8, 16, 40])
        for (const righe of [1, 2, 3, 6]) {
          const lastra: LastraNesting = {
            piazzamenti: Array.from({ length: n }, (_, k) => P(`${nome} ${k}`, 1000 + k, 500 + k))
          };
          const t = riassuntoLastra(lastra, { larghezza: LARGHEZZA, righe, corpo: CORPO });
          const serve = larghezzaStimata(t) * CORPO;
          const ha = LARGHEZZA * righe;
          // una riga sola di un nome lunghissimo può sforare: si nomina sempre
          // almeno un pezzo, perché una didascalia vuota non dice niente
          const unoSolo = !t.includes('   ·   ');
          if (!unoSolo) expect(serve, `${nome} ×${n} su ${righe} righe`).toBeLessThanOrEqual(ha);
        }
  });

  it('un pezzo si nomina sempre, anche se non ci starebbe', () => {
    const lunga: LastraNesting = {
      piazzamenti: [P('PARETE DIVISORIA DEL SOGGIORNO GRANDE LATO EST', 1200, 800)]
    };
    const t = riassuntoLastra(lunga, { larghezza: 60, righe: 1, corpo: CORPO });
    expect(t).toContain('PARETE');
  });

  it('i pesi dei caratteri non stanno sotto a quelli veri del font', () => {
    // misurati su Roboto a corpo 1000 e divisi per 1000: se qualcuno abbassa
    // un peso, la stima diventa ottimista e la didascalia torna a traboccare
    const misurati: Array<[string, number]> = [
      ['W', 0.887], ['M', 0.873], ['m', 0.877], ['w', 0.751],
      ['I', 0.272], ['A', 0.654], ['0', 0.562], ['9', 0.562],
      ['l', 0.239], ['t', 0.348], ['a', 0.531], ['o', 0.558],
      [' ', 0.248], ['.', 0.197], ['·', 0.264], ['×', 0.534]
    ];
    for (const [c, vero] of misurati)
      expect(larghezzaStimata(c), `il carattere «${c}»`).toBeGreaterThanOrEqual(vero);
  });

  it('un carattere mai visto si conta come il più largo', () => {
    expect(larghezzaStimata('☃')).toBeGreaterThanOrEqual(larghezzaStimata('W'));
  });

  it('il PDF calcola quante righe ci stanno, e ne toglie una', () => {
    // si legge il sorgente: il difetto non era nei tipi, era un blocco
    // assoluto messo dove non ci stava
    const pdf = readFileSync(new URL('../nesting.ts', import.meta.url), 'utf8');
    const i = pdf.indexOf('function didascalia(');
    expect(i, 'la didascalia non si trova più').toBeGreaterThan(-1);
    const corpo = pdf.slice(i, pdf.indexOf('\n}', i));
    expect(corpo).toMatch(/Math\.floor\(\(fondo - y\)/);
    expect(corpo, 'la riga di sicurezza è sparita').toContain('- 1)');
    expect(corpo).toContain('riassuntoLastra(lastra, {');
  });
});

describe('la didascalia dice le misure della forma', () => {
  it('un trapezio porta tutte e due le altezze, come in distinta', () => {
    // stesso difetto della distinta, stessa correzione: «larghezzaFinita ×
    // altezzaFinita» su un trapezio scrive la base per l'altezza SINISTRA, che
    // può essere la più corta. Due gemelle speculari si leggevano con numeri
    // diversi anche qui sotto il disegno.
    const tz = (nome: string, a: number, m3: number) =>
      ({
        x: 0, y: 0, larghezza: 860, altezza: Math.max(a, m3),
        larghezzaFinita: 860, altezzaFinita: a, misura3Finita: m3,
        forma: 'trapezioR', nome, tinta: 0, ruotato: false, chiave: `${nome}#0`
      }) as unknown as Piazzamento;
    const t = riassuntoLastra({ piazzamenti: [tz('B1.1', 1130, 1610), tz('B1.2%', 1610, 1130)] });
    expect(t).toContain('B1.1 860×1130|1610');
    expect(t).toContain('B1.2% 860×1610|1130');
  });

  it('un rettangolo resta scritto come prima', () => {
    const t = riassuntoLastra({ piazzamenti: [P('Anta', 597, 720)] });
    expect(t).toBe('1× Anta 597×720');
  });
});
