import { describe, expect, it } from 'vitest';
import {
  codiceCompletoForma,
  codiceLocaleForma,
  etichetteFotoDelProgetto,
  numeriProgetto,
  ordinePerNumero,
  percorsoDellaFoto
} from '../nomenclatura';
import type { Annotazione, Foto, Progetto } from '../../db/types';

/**
 * L'ETICHETTA DATA A UNA SEZIONE RINUMERA QUELLO CHE C'È DENTRO.
 *
 * Una sezione con la sua etichetta è un capitolo a sé: «Piano 1» si chiama P1
 * e le sue foto sono P1.A, P1.B. Prima le lettere correvano su TUTTO il
 * progetto, e il piano secondo cominciava da P2.C — un codice che non dice
 * niente a chi lo legge, e che cambia da solo appena aggiungi una foto al
 * piano di sotto.
 *
 * E la numerazione si rifà anche DOPO: si misura prima, si danno le etichette
 * alle sezioni quando si mette in ordine il lavoro, e i codici si aggiornano
 * da soli — non c'è niente di salvato da tenere allineato.
 */

const foto = (id: string, ordine: number, sezioneId?: string, etichetta?: string) =>
  ({ id, progettoId: 'P', ordine, sezioneId, etichetta }) as unknown as Foto;

const forma = (id: string, fotoId: string, creatoIl: number, gruppoQuota?: string) =>
  ({
    id,
    fotoId,
    tipo: 'quotaPoligono',
    zIndex: 1,
    creatoIl,
    gruppoQuota,
    punti: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ],
    unita: 'cm',
    stato: 'reale',
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 }
  }) as unknown as Annotazione;

/** due piani: il primo con due foto, il secondo con una */
const FOTO = [foto('f1', 0, 's1'), foto('f2', 1, 's1'), foto('f3', 2, 's2')];
const ANN: Record<string, Annotazione[]> = {
  f1: [forma('a1', 'f1', 100), forma('a2', 'f1', 200)],
  f2: [forma('a3', 'f2', 300)],
  f3: [forma('a4', 'f3', 400)]
};
const annDi = (id: string) => ANN[id] ?? [];

const progetto = (etichette: Record<string, string | undefined>) =>
  ({
    id: 'P',
    cartellaId: null,
    sezioni: [
      { id: 's1', nome: 'Piano 1', etichetta: etichette.s1, ordine: 0 },
      { id: 's2', nome: 'Piano 2', etichetta: etichette.s2, ordine: 1 }
    ]
  }) as unknown as Progetto;

/** i codici completi delle forme, come finiscono nel PDF */
function codici(p: Progetto): Record<string, string> {
  const perc = (id: string) => percorsoDellaFoto(FOTO.find((f) => f.id === id)!, p, []);
  const numeri = numeriProgetto(FOTO, annDi, perc);
  const fuori: Record<string, string> = {};
  for (const a of Object.values(ANN).flat()) {
    fuori[a.id] = codiceCompletoForma(perc(a.fotoId), codiceLocaleForma(a, numeri));
  }
  return fuori;
}

describe('le sezioni senza etichetta', () => {
  it('non fanno capitolo: le lettere corrono su tutto il progetto, come sempre', () => {
    expect(codici(progetto({}))).toEqual({ a1: 'A1', a2: 'A2', a3: 'B1', a4: 'C1' });
  });
});

describe('dando l’etichetta a una sezione già piena di forme', () => {
  it('le lettere ripartono da A dentro ogni sezione etichettata', () => {
    expect(codici(progetto({ s1: 'P1', s2: 'P2' }))).toEqual({
      a1: 'P1.A1',
      a2: 'P1.A2',
      a3: 'P1.B1',
      a4: 'P2.A1'
    });
  });

  it('e i numeri ripartono con loro: non esce un A2 senza il suo A1', () => {
    // col solo percorso aggiunto e i numeri lasciati globali uscirebbe P2.A3
    const c = codici(progetto({ s1: 'P1', s2: 'P2' }));
    expect(c.a4).toBe('P2.A1');
  });

  it('etichettandone una sola, l’altra resta nella sequenza del progetto', () => {
    // le foto delle sezioni senza etichetta stanno tutte insieme, con quelle
    // senza sezione: il loro percorso è quello del progetto
    expect(codici(progetto({ s1: 'P1' }))).toEqual({
      a1: 'P1.A1',
      a2: 'P1.A2',
      a3: 'P1.B1',
      a4: 'A1'
    });
  });

  it('la lettera scritta a mano sulla foto comanda sempre', () => {
    const conMano = [foto('f1', 0, 's1', 'PT'), FOTO[1], FOTO[2]];
    const p = progetto({ s1: 'P1', s2: 'P2' });
    const perc = (id: string) => percorsoDellaFoto(conMano.find((f) => f.id === id)!, p, []);
    const numeri = numeriProgetto(conMano, annDi, perc);
    expect(codiceLocaleForma(ANN.f1[0], numeri)).toBe('PT1');
    // la foto accanto resta la SECONDA del piano: la lettera automatica segue
    // il posto della foto, non quante lettere automatiche ci sono prima. È
    // come è sempre stato, ed è voluto — se no battezzare una foto a mano
    // rimescolerebbe i codici di tutte le altre
    expect(codiceLocaleForma(ANN.f2[0], numeri)).toBe('B1');
  });
});

describe('quello che la numerazione per sezione non deve rompere', () => {
  it('una famiglia di copie conta le sue copie dentro la sezione', () => {
    const conCopie: Record<string, Annotazione[]> = {
      f1: [forma('a1', 'f1', 100, 'g'), forma('a2', 'f1', 200, 'g')],
      f2: [],
      f3: [forma('a4', 'f3', 400, 'g')]
    };
    const p = progetto({ s1: 'P1', s2: 'P2' });
    const perc = (id: string) => percorsoDellaFoto(FOTO.find((f) => f.id === id)!, p, []);
    const numeri = numeriProgetto(FOTO, (id) => conCopie[id] ?? [], perc);
    // tre copie della stessa misura: due al piano primo, una al secondo
    expect(numeri.get('a1')!.quantitaGlobale).toBe(3);
    expect(numeri.get('a1')!.quantita).toBe(2);
    expect(numeri.get('a4')!.quantita).toBe(1);
    // e i sotto-indici ripartono per sezione
    expect(codiceLocaleForma(conCopie.f1[0], numeri)).toBe('A1.1');
    expect(codiceLocaleForma(conCopie.f1[1], numeri)).toBe('A1.2');
    expect(codiceLocaleForma(conCopie.f3[0], numeri)).toBe('A1.1');
  });

  it('spostare una forma al numero 2 la mette fra quelle del SUO piano', () => {
    const p = progetto({ s1: 'P1', s2: 'P2' });
    const perc = (id: string) => percorsoDellaFoto(FOTO.find((f) => f.id === id)!, p, []);
    // a2 è la seconda forma della foto f1 (P1.A2): portarla al numero 1
    const ord = ordinePerNumero(ANN.f1[1], 1, FOTO, annDi, perc);
    expect(ord).not.toBeNull();
    // deve finire PRIMA di a1 (chiave 100), non prima di una forma di P2
    expect(ord!).toBeLessThan(100);
  });

  it('lo ZIP chiama le foto come l’app: «Piano 2/A», non «Piano 2/C»', () => {
    const lettere = etichetteFotoDelProgetto(FOTO, progetto({ s1: 'P1', s2: 'P2' }));
    expect(lettere.get('f1')).toBe('A');
    expect(lettere.get('f2')).toBe('B');
    expect(lettere.get('f3')).toBe('A');
    // senza etichette resta la sequenza di prima
    const senza = etichetteFotoDelProgetto(FOTO, progetto({}));
    expect(senza.get('f3')).toBe('C');
  });
});
