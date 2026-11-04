import { describe, expect, it } from 'vitest';
import { contenutoNesting } from '../nesting';
import { larghezzaStimata } from '../../utils/etichettaNesting';
import type { DocumentoNesting } from '../../utils/documentoNesting';
import type { Content } from 'pdfmake/interfaces';

/**
 * LA PAGINA DI UN FOGLIO: quello che ci sta e quello che non ci finisce sopra.
 *
 * Il disegno è appoggiato a quote ASSOLUTE — comincia sotto l'intestazione e
 * arriva in fondo — e pdfmake, quando un blocco assoluto non ci sta, non lo
 * taglia: lo fa continuare sulla pagina dopo, sopra l'intestazione del foglio
 * successivo. Quindi tutto quello che si scrive attorno al disegno si misura
 * PRIMA: il sottotitolo che non deve andare a capo (se no la coda si infila
 * sotto la cornice e sparisce) e le targhette delle colonne, che devono stare
 * nei punti che restano sopra il margine di sotto.
 */

const A4 = { corto: 595.28, lungo: 841.89 };
const MARGINI = [40, 50, 40, 50];
const Y_DISEGNO = 100;
const VUOTO_COLONNA = 12;

type Blocco = Record<string, unknown>;

/** i contenuti pdfmake visti come blocchi qualunque, per poterli frugare */
const blocchi = (c: Content[]) => c as unknown as Blocco[];

const P = (n: string, l: number, a: number, t: number) =>
  ({ id: n, nome: n, larghezza: l, altezza: a, quantita: 1, ruotabile: true, tinta: t }) as never;

const pannelli = (
  [
    ['PANNELLO 5.b', 1080, 1500], ['PANNELLO 6', 1220, 1250], ['PANNELLO 13.a', 1220, 1100],
    ['PANNELLO 14.a', 1220, 1100], ['PANNELLO 12', 1220, 1100], ['PANNELLO 1', 1220, 1100],
    ['PANNELLO 3.a', 1220, 1000], ['PANNELLO 3.b', 1220, 1000], ['PANNELLO 8', 900, 1350],
    ['PANNELLO 13.b', 790, 1100], ['PANNELLO 2.a', 1220, 850], ['PANNELLO 10', 800, 1100],
    ['PANNELLO 1.b', 390, 500], ['PANNELLO 7.a', 630, 1250], ['PANNELLO 14.b', 590, 1100],
    ['PANNELLO 2.b', 490, 850], ['PANNELLO 9', 1000, 400], ['PANNELLO 11', 1100, 350]
  ] as Array<[string, number, number]>
).map(([n, l, a], i) => P(n, l, a, i * 17));

const materiale = (pezzi: never[], modo: 'bobina' | 'lastre') =>
  ({
    id: 'm1', nome: 'BAGNO - PANNELLI', modo,
    lastra: { larghezza: 2500, altezza: 1250 },
    bobina: { larghezza: 1250, metri: 50 },
    venatura: 'nessuna', lama: 3, abbondanza: 0, margine: 0, orientamenti: {}, pezzi
  }) as never;

const documento = (modo: 'bobina' | 'lastre' = 'bobina') =>
  ({
    versione: 2, nome: 'Lido Blu', attivo: 'm1',
    materiali: [materiale(pannelli as never[], modo)]
  }) as unknown as DocumentoNesting;

/** il rotolo intero su una pagina sola: è il caso che va a capo in colonne */
const INTERO = { segmenta: false, massimoSegmento: 0 };

/** le pagine dei fogli: quelle che cominciano con l'intestazione a due voci */
function fogli(contenuto: Blocco[]): Blocco[][] {
  const pagine: Blocco[][] = [];
  for (const b of contenuto) {
    if (b.pageBreak === 'before' && b.pageOrientation) pagine.push([]);
    if (pagine.length) pagine[pagine.length - 1].push(b);
  }
  return pagine;
}

const sottotitoli = (pagina: Blocco[]) =>
  (pagina[1]?.columns as Blocco[] | undefined)?.filter((c) => c.style === 'sottotitolo') ?? [];

/** le cornici dei fogli disegnati: una per colonna */
const cornici = (pagina: Blocco[]) =>
  ((pagina.find((b) => Array.isArray(b.canvas))?.canvas as Blocco[]) ?? []).filter(
    (c) => c.type === 'rect' && c.color === '#f5f6f7'
  );

/**
 * I blocchi appoggiati a una quota assoluta, con quanto sono alti e quante
 * righe vorrebbero. Le righe contano: pdfmake un testo più largo della sua
 * cassa lo manda a capo da sé, e la riga in più scende sopra quella dopo.
 */
function assoluti(pagina: Blocco[]): Array<{ y: number; alto: number; righe: number }> {
  const fuori: Array<{ y: number; alto: number; righe: number }> = [];
  for (const b of pagina) {
    const pos = b.absolutePosition as { x: number; y: number } | undefined;
    if (!pos) continue;
    for (const c of (b.columns as Blocco[] | undefined) ?? []) {
      const corpo = (c.fontSize as number) ?? 11;
      const serve = larghezzaStimata(String(c.text ?? '')) * corpo;
      const righe = c.noWrap ? 1 : Math.max(1, Math.ceil(serve / Math.max(1, c.width as number)));
      fuori.push({ y: pos.y, alto: corpo * 1.5 * righe, righe });
    }
    if (b.svg) fuori.push({ y: pos.y, alto: (b.height as number) ?? 0, righe: 1 });
  }
  return fuori;
}

describe('il sottotitolo del foglio', () => {
  it('non va mai a capo: una riga a capo finisce sotto il disegno', () => {
    for (const orizzontale of [false, true]) {
      const larghezzaPagina = orizzontale ? A4.lungo : A4.corto;
      const meta = (larghezzaPagina - MARGINI[0] - MARGINI[2] - VUOTO_COLONNA) / 2;
      for (const pagina of fogli(blocchi(contenutoNesting(documento(), INTERO)))) {
        const righe = sottotitoli(pagina);
        expect(righe.length).toBe(2);
        for (const r of righe) {
          expect(r.noWrap, 'pdfmake la manderebbe a capo').toBe(true);
          // la riga ci sta nella sua metà: è questo che la tiene su una riga
          const serve = larghezzaStimata(r.text as string) * (r.fontSize as number);
          if (pagina[0].pageOrientation === (orizzontale ? 'landscape' : 'portrait')) {
            expect(serve, `«${r.text}»`).toBeLessThanOrEqual(meta + 1e-6);
          }
        }
      }
    }
  });

  it('con poco da dire resta del corpo di sempre', () => {
    const pagina = fogli(blocchi(contenutoNesting(documento('lastre'))))[0];
    const sinistra = sottotitoli(pagina)[0];
    expect(sinistra.fontSize).toBe(10);
    expect(sinistra.text).toContain('2500 × 1250 mm');
  });
});

describe('il rotolo lungo va a capo in colonne', () => {
  it('un rotolo da quindici metri si spezza, e ogni colonna dice il suo tratto', () => {
    const pagina = fogli(blocchi(contenutoNesting(documento(), INTERO)))[0];
    expect(cornici(pagina).length).toBeGreaterThan(1);
    const targhette = pagina
      .flatMap((b) => ((b.columns as Blocco[] | undefined) ?? []).map((c) => c.text as string))
      .filter((t) => typeof t === 'string' && /^da [\d.,]+ a [\d.,]+ m$/.test(t));
    expect(targhette.length).toBe(cornici(pagina).length);
    // i tratti si susseguono: dove finisce uno comincia l'altro
    const estremi = targhette.map((t) => t.match(/[\d.,]+/g)!.map((v) => +v.replace(',', '.')));
    for (let i = 1; i < estremi.length; i++) expect(estremi[i][0]).toBeCloseTo(estremi[i - 1][1], 6);
  });

  it('una lastra normale resta una cornice sola, senza targhette', () => {
    const pagina = fogli(blocchi(contenutoNesting(documento('lastre'))))[0];
    expect(cornici(pagina).length).toBe(1);
    const targhette = pagina
      .flatMap((b) => ((b.columns as Blocco[] | undefined) ?? []).map((c) => c.text as string))
      .filter((t) => typeof t === 'string' && /^da .* a .* m$/.test(t));
    expect(targhette).toHaveLength(0);
  });

  it('sotto il disegno non c’è più l’elenco dei pezzi', () => {
    // era un blocco assoluto di centinaia di caratteri che pdfmake, non
    // potendolo tagliare, faceva continuare sulla pagina dopo
    for (const pagina of fogli(blocchi(contenutoNesting(documento(), INTERO)))) {
      const testi = pagina.flatMap((b) =>
        ((b.columns as Blocco[] | undefined) ?? []).map((c) => String(c.text ?? ''))
      );
      for (const t of testi) expect(t.length, `«${t}»`).toBeLessThan(80);
    }
  });
});

describe('niente finisce sulla pagina dopo', () => {
  it('ogni blocco appoggiato a una quota sta dentro i margini della pagina', () => {
    for (const opzioni of [INTERO, { segmenta: true, massimoSegmento: 3000 }]) {
      for (const pagina of fogli(blocchi(contenutoNesting(documento(), opzioni)))) {
        const orizzontale = pagina[0].pageOrientation === 'landscape';
        const fondo = (orizzontale ? A4.corto : A4.lungo) - MARGINI[3];
        for (const b of assoluti(pagina)) {
          expect(b.y, 'sopra l’intestazione').toBeGreaterThanOrEqual(Y_DISEGNO - 1e-6);
          expect(b.righe, 'una riga in più scende su quella dopo').toBe(1);
          expect(b.y + b.alto, 'oltre il margine di sotto').toBeLessThanOrEqual(fondo);
        }
      }
    }
  });
});

describe('il pezzo che il capoverso taglia in due', () => {
  /** una vetrata da sette metri: nessun capoverso può evitarla */
  const vetrate = [
    { id: 'V1', nome: 'VETRATA SUD', larghezza: 1150, altezza: 7200, quantita: 1, ruotabile: false, tinta: 10 },
    { id: 'V2', nome: 'VETRATA NORD', larghezza: 1150, altezza: 4300, quantita: 1, ruotabile: false, tinta: 40 },
    { id: 'P1', nome: 'PORTA 1', larghezza: 900, altezza: 2100, quantita: 2, ruotabile: false, tinta: 80 }
  ] as never[];
  const doc = {
    versione: 2, nome: 'Vetrate', attivo: 'm1', materiali: [materiale(vetrate, 'bobina')]
  } as unknown as DocumentoNesting;
  const pagina = () => fogli(blocchi(contenutoNesting(doc, INTERO)))[0];

  const testi = (p: Blocco[]) =>
    p.flatMap((b) => ((b.columns as Blocco[] | undefined) ?? []).map((c) => String(c.text ?? '')));

  it('il nome del pezzo si scrive una volta sola', () => {
    const quante = testi(pagina()).filter((t) => t === 'VETRATA SUD').length;
    expect(quante, 'due nomi uguali vorrebbero dire due pezzi').toBe(1);
  });

  it('tutt’e due le parti dicono che è un pezzo solo, tagliato dal foglio', () => {
    const t = testi(pagina());
    // «parte 1 di 2» dice in tre parole che il pezzo è uno e che lì il
    // disegno l'ha spezzato; la freccia dice da che parte sta il resto
    const prima = t.find((x) => x.includes('parte 1 di 2') || x.includes('1 di 2'));
    const dopo = t.find((x) => x.includes('parte 2 di 2') || x.includes('2 di 2'));
    expect(prima, 'la prima parte non lo dice').toBeDefined();
    expect(dopo, 'la seconda parte non lo dice').toBeDefined();
    expect(prima!.endsWith(' »'), `«${prima}» deve mandare avanti`).toBe(true);
    expect(dopo!.startsWith('« '), `«${dopo}» deve mandare indietro`).toBe(true);
    // e il nome ci sta: la parte di là non resta anonima
    expect(prima).toContain('VETRATA SUD');
    expect(dopo).toContain('VETRATA SUD');
  });

  it('il bordo sul capoverso è segnato come giunzione, non come taglio', () => {
    const canvas = (pagina().find((b) => Array.isArray(b.canvas))?.canvas as Blocco[]) ?? [];
    const giunzioni = canvas.filter((l) => l.type === 'line' && l.dash);
    expect(giunzioni.length).toBeGreaterThanOrEqual(2);
    for (const g of giunzioni) {
      // orizzontale, che è come corre il capoverso
      expect(g.y1).toBeCloseTo(g.y2 as number, 6);
      expect(Math.abs((g.x2 as number) - (g.x1 as number))).toBeGreaterThan(1);
    }
  });
});
