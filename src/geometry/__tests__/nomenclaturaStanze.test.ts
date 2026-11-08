import { describe, expect, it } from 'vitest';
import {
  MAX_ETICHETTA_FOTO,
  codiceBase,
  codiceLocaleForma,
  etichettaDalNome,
  etichetteFotoDelProgetto,
  numeriProgetto,
  percorsoDellaFoto
} from '../nomenclatura';
import type { Annotazione, Foto, Progetto, QuotaPoligono } from '../../db/types';

/**
 * IL CODICE DEVE DIRE LA STANZA.
 *
 * In un albergo si misura come si può: la stanza libera adesso, quella
 * occupata domani. Le lettere seguono l'ordine degli scatti, e a lavoro finito
 * la parete A è nella stanza 3 e la C nella stanza 1 — per sapere dove va un
 * telo serve il progetto cartaceo in mano. Il numero della stanza però c'è
 * già: è il nome che si dà alla foto mentre la si scatta.
 */

const foto = (id: string, ordine: number, didascalia: string, etichetta?: string): Foto =>
  ({
    id,
    progettoId: 'p',
    origine: new ArrayBuffer(0),
    origineTipo: 'image/jpeg',
    miniatura: new ArrayBuffer(0),
    miniaturaTipo: 'image/jpeg',
    larghezzaPx: 100,
    altezzaPx: 100,
    dataScatto: 0,
    geotag: null,
    didascalia,
    noteDato: '',
    scala: null,
    ordine,
    creataIl: 0,
    modificataIl: 0,
    ...(etichetta === undefined ? {} : { etichetta })
  }) as unknown as Foto;

/**
 * Una forma come le fa l'app: senza `ordine` (che si scrive solo rinumerando
 * a mano) e con l'ora in cui è stata presa. È quell'ora a metterle in fila.
 */
const forma = (id: string, fotoId: string, creatoIl: number): QuotaPoligono =>
  ({
    id,
    fotoId,
    tipo: 'quotaPoligono',
    zIndex: 1,
    creatoIl,
    punti: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ],
    segmenti: [{ da: 0, a: 1, valore: 100, offset: 0 }],
    unita: 'cm',
    stato: 'reale',
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
  }) as unknown as QuotaPoligono;

const PROGETTO = { cartellaId: null, etichetta: undefined, sezioni: [] } as unknown as Progetto;

describe('il nome della foto che diventa codice', () => {
  it('un numero corto si prende così com’è', () => {
    expect(etichettaDalNome('307')).toBe('307');
    expect(etichettaDalNome(' 12 ')).toBe('12');
    expect(etichettaDalNome('307b')).toBe('307b');
    expect(etichettaDalNome('bagno')).toBe('bagno');
  });

  it('di una frase si tiene il numero della stanza', () => {
    expect(etichettaDalNome('Camera 307')).toBe('307');
    expect(etichettaDalNome('Piano 1 camera 307')).toBe('307');
    expect(etichettaDalNome('stanza 12 — parete nord')).toBe('12');
  });

  it('senza niente da cui ricavarlo non si inventa', () => {
    expect(etichettaDalNome('')).toBeNull();
    expect(etichettaDalNome(undefined)).toBeNull();
    expect(etichettaDalNome('corridoio del primo piano')).toBeNull();
    // un numero più lungo del codice non è un codice
    expect(etichettaDalNome('fattura 1234567890123')).toBeNull();
    expect('307'.length).toBeLessThanOrEqual(MAX_ETICHETTA_FOTO);
  });
});

describe('il punto fra la stanza e il pezzo', () => {
  it('con una lettera si attaccano, come è sempre stato', () => {
    expect(codiceBase('A', 1)).toBe('A1');
    expect(codiceBase('AA', 12)).toBe('AA12');
  });

  it('il punto entra appena c’è una cifra, anche in mezzo', () => {
    // «302b1» si leggerebbe anche «302» più «b1»: il punto toglie il dubbio
    expect(codiceBase('302b', 1)).toBe('302b.1');
    expect(codiceBase('307', 1)).toBe('307.1');
  });

  it('con un numero ci va il punto, se no 307 e 1 fanno 3071', () => {
    expect(codiceBase('307', 1)).toBe('307.1');
    expect(codiceBase('12', 3)).toBe('12.3');
  });
});

describe('l’albergo, prima e dopo', () => {
  /** tre stanze misurate nell’ordine in cui erano libere */
  const foto3 = [foto('f1', 0, '307'), foto('f2', 1, '301'), foto('f3', 2, '305')];
  // misurate in quest'ordine: le due pareti della 307, poi la 301, poi la 305
  const forme = new Map<string, Annotazione[]>([
    ['f1', [forma('a1', 'f1', 1000), forma('a2', 'f1', 1100)]],
    ['f2', [forma('b1', 'f2', 1200)]],
    ['f3', [forma('c1', 'f3', 1300)]]
  ]);
  const annotazioniDi = (id: string) => forme.get(id) ?? [];
  const codici = (lista: Foto[]) => {
    const numeri = numeriProgetto(lista, annotazioniDi, (id) => {
      const f = lista.find((x) => x.id === id);
      return f ? percorsoDellaFoto(f, PROGETTO, []) : [];
    });
    return [...forme.values()].flat().map((a) => codiceLocaleForma(a, numeri));
  };

  it('a lavoro finito le lettere non dicono la stanza', () => {
    expect(codici(foto3)).toEqual(['A1', 'A2', 'B1', 'C1']);
  });

  it('presi i nomi, il codice dice la stanza', () => {
    const conNomi = foto3.map((f) => ({ ...f, etichetta: etichettaDalNome(f.didascalia)! }));
    expect(codici(conNomi)).toEqual(['307.1', '307.2', '301.1', '305.1']);
  });

  it('due foto della stessa stanza numerano insieme', () => {
    // due pareti della 307: le misure continuano, non ripartono da 1
    const stessaStanza = [
      { ...foto3[0], etichetta: '307' },
      { ...foto3[1], etichetta: '307' },
      { ...foto3[2], etichetta: '305' }
    ];
    expect(codici(stessaStanza)).toEqual(['307.1', '307.2', '307.3', '305.1']);
  });

  it('rimesse le lettere si torna esattamente a prima', () => {
    const conNomi = foto3.map((f) => ({ ...f, etichetta: etichettaDalNome(f.didascalia)! }));
    const pulite = conNomi.map((f) => ({ ...f, etichetta: undefined }));
    expect(codici(pulite)).toEqual(codici(foto3));
  });

  it('riordinando le foto le lettere seguono', () => {
    // le stesse foto rimesse in ordine di stanza: 301, 305, 307
    const inOrdine = [
      { ...foto3[1], ordine: 0 },
      { ...foto3[2], ordine: 1 },
      { ...foto3[0], ordine: 2 }
    ];
    const etich = etichetteFotoDelProgetto(inOrdine, PROGETTO, []);
    expect(etich.get('f2')).toBe('A'); // 301
    expect(etich.get('f3')).toBe('B'); // 305
    expect(etich.get('f1')).toBe('C'); // 307
    expect(codici(inOrdine)).toEqual(['C1', 'C2', 'A1', 'B1']);
  });
});
