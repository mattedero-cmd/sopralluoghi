import { describe, expect, it } from 'vitest';
import { pianoEtichetta, righeEtichetta } from '../etichettaNesting';

// corpi tipici (in mm di disegno) su una lastra da 2500 mm larga ~390 px:
// 1 px di schermo ≈ 6,4 mm
const CORPI = { massimo: 77, comodo: 58, dueRighe: 51, minimo: 32 };

/** il testo scritto sta davvero dentro il pezzo? */
function dentro(l: number, a: number, p: ReturnType<typeof pianoEtichetta>) {
  if (!p) return true;
  const lungo = p.ruotata ? a : l;
  const alto = p.ruotata ? l : a;
  const righe = righeEtichetta(p);
  const piuLargo = Math.max(...righe.map((r) => r.corpo * 0.58 * r.testo.length));
  const altezzaTesto = righe.reduce((s, r) => s + r.corpo * 1.15, 0);
  return piuLargo <= lungo && altezzaTesto <= alto;
}

/** il nome come si legge, righe rimesse insieme */
const letto = (p: ReturnType<typeof pianoEtichetta>) => p?.nome?.join(' ');

describe('pianoEtichetta', () => {
  it('su un pezzo grande scrive nome e misura su due righe', () => {
    const p = pianoEtichetta(600, 400, 'Anta', '600×400', CORPI);
    expect(p).toMatchObject({ nome: ['Anta'], misura: '600×400', ampia: true, ruotata: false });
    expect(dentro(600, 400, p)).toBe(true);
  });

  it('non supera mai il corpo massimo, anche su pezzi enormi', () => {
    const p = pianoEtichetta(2000, 1200, 'Anta', '2000×1200', CORPI);
    expect(p?.corpoNome).toBe(CORPI.massimo);
  });

  it('un nome lungo va a capo intero invece di finire troncato', () => {
    const p = pianoEtichetta(600, 400, 'Fianco laterale destro mobile', '600×400', CORPI);
    expect(letto(p)).toBe('Fianco laterale destro mobile');
    expect(p?.nome!.length).toBeGreaterThan(1);
    // e va a capo fra le parole, non dentro una parola
    for (const riga of p!.nome!) expect(riga).not.toMatch(/…/);
    expect(p?.corpoNome).toBeGreaterThanOrEqual(CORPI.comodo);
    expect(p?.misura).toBe('600×400');
    expect(dentro(600, 400, p)).toBe(true);
  });

  it('andare a capo fa scrivere più grande che stringersi su una riga', () => {
    const nome = 'Vetrata scorrevole soggiorno';
    const p = pianoEtichetta(700, 500, nome, '700×500', CORPI);
    // su una riga sola quel nome starebbe in 700·0,96/(0,58·28) ≈ 41 mm
    const suUnaRiga = (700 * 0.96) / (0.58 * nome.length);
    expect(p?.corpoNome).toBeGreaterThan(suUnaRiga);
    expect(letto(p)).toBe(nome);
  });

  it('non spende più di tre righe per un nome', () => {
    const p = pianoEtichetta(
      900,
      900,
      'Anta a battente della colonna dispensa lato finestra cucina',
      '900×900',
      CORPI
    );
    expect(p?.nome!.length).toBeLessThanOrEqual(3);
    expect(dentro(900, 900, p)).toBe(true);
  });

  it('una parola sola troppo lunga si tronca: a capo non si può andare', () => {
    const p = pianoEtichetta(150, 150, 'Controtelaio', '150×150', CORPI);
    expect(p?.nome!.length).toBe(1);
    expect(p?.nome![0]).toMatch(/…$/);
    expect(dentro(150, 150, p)).toBe(true);
  });

  it('quando le due righe rimpicciolirebbero troppo tiene solo il nome', () => {
    const p = pianoEtichetta(500, 60, 'Zoccolo', '500×60', CORPI);
    expect(letto(p)).toBe('Zoccolo');
    expect(p?.misura).toBeUndefined();
    expect(p?.ampia).toBe(false);
    expect(dentro(500, 60, p)).toBe(true);
  });

  it('rimpicciolisce sotto il comodo solo quando è l’altezza a imporlo', () => {
    const p = pianoEtichetta(600, 40, 'Montante', '600×40', CORPI);
    expect(letto(p)).toBe('Montante');
    expect(p?.corpoNome).toBeLessThan(CORPI.comodo);
    expect(dentro(600, 40, p)).toBe(true);
  });

  it('su un pezzo basso non va a capo: righe in più non ci stanno', () => {
    const p = pianoEtichetta(900, 50, 'Traversa superiore', '900×50', CORPI);
    expect(p?.nome!.length).toBe(1);
    expect(dentro(900, 50, p)).toBe(true);
  });

  it('gira il testo sui pezzi alti e stretti', () => {
    const p = pianoEtichetta(40, 600, 'Montante', '40×600', CORPI);
    expect(p?.ruotata).toBe(true);
    expect(letto(p)).toBe('Montante');
    expect(dentro(40, 600, p)).toBe(true);
  });

  it('tronca il nome invece di lasciare il pezzo muto', () => {
    const p = pianoEtichetta(180, 60, 'Traversa superiore lunga', '180×60', CORPI);
    expect(p?.nome!.join(' ')).toMatch(/…$/);
    expect(p?.nome![0].length).toBeGreaterThan(2);
    expect(p?.misura).toBeUndefined();
    expect(dentro(180, 60, p)).toBe(true);
  });

  it('sotto il corpo minimo il pezzo resta muto: illeggibile è peggio di vuoto', () => {
    expect(pianoEtichetta(30, 30, 'Tassello', '30×30', CORPI)).toBeNull();
  });

  it('sul pezzo senza nome ripiega sulla misura, mai troncata', () => {
    const p = pianoEtichetta(300, 200, '', '300×200', CORPI);
    expect(p).toMatchObject({ misura: '300×200', ampia: false });
    expect(p?.nome).toBeUndefined();
    expect(dentro(300, 200, p)).toBe(true);
  });

  it('senza misure valide non impagina nulla', () => {
    expect(pianoEtichetta(600, 400, 'Anta', '600×400', { ...CORPI, minimo: 0 })).toBeNull();
    expect(pianoEtichetta(0, 400, 'Anta', '600×400', CORPI)).toBeNull();
    expect(pianoEtichetta(600, 0, 'Anta', '600×400', CORPI)).toBeNull();
  });

  it('il testo non deborda mai dal pezzo, in nessuna delle combinazioni', () => {
    const nomi = [
      'Anta',
      'Zoccolo',
      'Montante',
      'Traversa superiore lunga',
      'Fianco laterale destro mobile cucina',
      'R',
      ''
    ];
    for (const nome of nomi) {
      for (let l = 20; l <= 1400; l += 37) {
        for (let a = 20; a <= 1400; a += 53) {
          const p = pianoEtichetta(l, a, nome, `${l}×${a}`, CORPI);
          expect(dentro(l, a, p), `${nome} su ${l}×${a}`).toBe(true);
          if (p) {
            const corpo = Math.min(p.corpoNome || Infinity, p.corpoMisura || Infinity);
            expect(corpo, `${nome} su ${l}×${a}`).toBeGreaterThanOrEqual(CORPI.minimo * 0.92);
          }
        }
      }
    }
  });

  it('un pezzo abbastanza grande non resta mai muto, per quanto lungo sia il nome', () => {
    // il patto è questo: o il nome si legge INTERO, e allora può essere un po'
    // più piccolo del comodo perché è andato a capo; oppure è stato troncato,
    // e allora dev'essere almeno comodo — troncare per scrivere piccolo non
    // avrebbe senso.
    const nome = 'Fianco laterale destro del mobile alto della cucina';
    for (let l = 200; l <= 1400; l += 61) {
      for (let a = 200; a <= 1400; a += 71) {
        const p = pianoEtichetta(l, a, nome, `${l}×${a}`, CORPI);
        expect(p?.nome, `${l}×${a}`).toBeTruthy();
        const intero = p!.nome!.join(' ') === nome;
        if (intero) expect(p!.corpoNome, `${l}×${a}`).toBeGreaterThanOrEqual(CORPI.minimo);
        else expect(p!.corpoNome, `${l}×${a}`).toBeGreaterThanOrEqual(CORPI.comodo);
      }
    }
  });

  it('un nome fatto di parole corte non resta mai troncato su un pezzo grande', () => {
    const nome = 'Anta bassa vano lato est';
    for (let l = 300; l <= 1200; l += 53) {
      for (let a = 300; a <= 1200; a += 67) {
        const p = pianoEtichetta(l, a, nome, `${l}×${a}`, CORPI);
        expect(p?.nome?.join(' '), `${l}×${a}`).toBe(nome);
      }
    }
  });
});

describe('righeEtichetta', () => {
  it('centra il blocco di testo sul pezzo', () => {
    const p = pianoEtichetta(600, 400, 'Anta', '600×400', CORPI)!;
    const righe = righeEtichetta(p);
    const cima = righe[0].dy - righe[0].corpo * 1.15 * 0.5;
    const fondo =
      righe[righe.length - 1].dy + righe[righe.length - 1].corpo * 1.15 * 0.5;
    expect(cima + fondo).toBeCloseTo(0, 6);
  });

  it('mette il nome sopra e la misura sotto, nell’ordine di lettura', () => {
    const p = pianoEtichetta(800, 600, 'Fianco laterale destro', '800×600', CORPI)!;
    const righe = righeEtichetta(p);
    expect(righe.length).toBe(p.nome!.length + 1);
    expect(righe[righe.length - 1].testo).toBe('800×600');
    expect(righe[righe.length - 1].forte).toBe(false);
    for (let i = 1; i < righe.length; i++) expect(righe[i].dy).toBeGreaterThan(righe[i - 1].dy);
  });
});
