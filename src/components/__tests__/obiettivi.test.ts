import { describe, expect, it } from 'vitest';
import { fattoreTeleSalvato, salvaFattoreTele, scegliObiettivi } from '../Panoramica';

/** una memoria locale finta: le prove girano senza browser */
const memoria = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
  key: (i: number) => [...memoria.keys()][i] ?? null,
  get length() {
    return memoria.size;
  }
} as Storage;

/**
 * Le voci che iOS elenca davvero su un iPhone Pro: le tre fotocamere fisiche
 * PIÙ le fotocamere finte che le combinano. Prenderle tutte per buone
 * riempiva la fila di 1× identici — visto sullo schermo: 0,5× 1× 1× 1× 1× 2×.
 */
const iPhonePro = [
  { deviceId: 'a', label: 'Fotocamera anteriore' },
  { deviceId: 'b', label: 'Fotocamera posteriore' },
  { deviceId: 'c', label: 'Fotocamera posteriore doppia' },
  { deviceId: 'd', label: 'Fotocamera posteriore tripla' },
  { deviceId: 'e', label: 'Fotocamera posteriore grandangolo' },
  { deviceId: 'f', label: 'Fotocamera posteriore ultra-grandangolo' },
  { deviceId: 'g', label: 'Fotocamera posteriore teleobiettivo' }
];

describe('la fila degli obiettivi', () => {
  it('su un iPhone Pro sono tre, non sei', () => {
    const o = scegliObiettivi(iPhonePro);
    expect(o.map((x) => x.segno)).toEqual(['0,5×', '1×', 'Tele']);
  });

  it('prende l’obiettivo FISICO, non la fotocamera composita', () => {
    const o = scegliObiettivi(iPhonePro);
    expect(o.find((x) => x.segno === '1×')?.etichetta).toBe(
      'Fotocamera posteriore grandangolo'
    );
  });

  it('non mette mai la fotocamera frontale nella fila', () => {
    const o = scegliObiettivi(iPhonePro);
    expect(o.some((x) => /anteriore/i.test(x.etichetta))).toBe(false);
  });

  it('funziona anche con i nomi in inglese', () => {
    const o = scegliObiettivi([
      { deviceId: '1', label: 'Front Camera' },
      { deviceId: '2', label: 'Back Camera' },
      { deviceId: '3', label: 'Back Dual Wide Camera' },
      { deviceId: '4', label: 'Back Ultra Wide Camera' },
      { deviceId: '5', label: 'Back Telephoto Camera' }
    ]);
    expect(o.map((x) => x.segno)).toEqual(['0,5×', '1×', 'Tele']);
    expect(o.find((x) => x.segno === '0,5×')?.deviceId).toBe('4');
    expect(o.find((x) => x.segno === 'Tele')?.deviceId).toBe('5');
  });

  it('il teleobiettivo non si spaccia per un numero finché non lo si sa', () => {
    // sul 16 Pro è 5×, su altri 2× o 3×: il sistema non lo dice, e stampare
    // un numero a caso è peggio che non stamparne nessuno — chi misura si
    // fida dei numeri che l'app scrive
    const o = scegliObiettivi(iPhonePro);
    expect(o.find((x) => /tele/i.test(x.etichetta))?.segno).toBe('Tele');
    expect(o.find((x) => /tele/i.test(x.etichetta))?.tele).toBe(true);
  });

  it('e quando lo si sa, lo scrive — e non lo chiede più', () => {
    salvaFattoreTele('g', 5);
    expect(fattoreTeleSalvato('g')).toBe(5);
    const o = scegliObiettivi(iPhonePro);
    expect(o.map((x) => x.segno)).toEqual(['0,5×', '1×', '5×']);
  });

  it('i fattori con la virgola si scrivono all’italiana', () => {
    salvaFattoreTele('g', 2.5);
    expect(scegliObiettivi(iPhonePro).find((x) => x.tele)?.segno).toBe('2,5×');
  });

  it('un fattore assurdo non viene creduto', () => {
    salvaFattoreTele('g', 0.2);
    expect(fattoreTeleSalvato('g')).toBeNull();
    expect(scegliObiettivi(iPhonePro).find((x) => x.tele)?.segno).toBe('Tele');
  });

  it('un telefono con una fotocamera sola non mostra nessuna fila', () => {
    expect(scegliObiettivi([{ deviceId: '1', label: 'Back Camera' }])).toEqual([]);
  });

  it('due obiettivi soli: ultra e grandangolo, in ordine', () => {
    const o = scegliObiettivi([
      { deviceId: '1', label: 'Back Camera' },
      { deviceId: '2', label: 'Back Ultra Wide Camera' }
    ]);
    expect(o.map((x) => x.segno)).toEqual(['0,5×', '1×']);
  });

  it('senza etichette non si inventa niente', () => {
    expect(scegliObiettivi([])).toEqual([]);
  });
});
