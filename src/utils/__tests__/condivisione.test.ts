import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import { condividiSelezione, nomiUnici } from '../condivisione';
import * as share from '../share';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm"></svg>';
const ora = Date.now();

/** cattura quello che viene mandato via, invece di aprire la condivisione */
const mandati: Array<{ nome: string; dati: Blob }> = [];

beforeEach(async () => {
  mandati.length = 0;
  await Promise.all([db.disegni.clear(), db.nesting.clear()]);
  vi.spyOn(share, 'condividiOScarica').mockImplementation(async (blob, nome) => {
    mandati.push({ nome, dati: blob });
  });
});

describe('condividere più cose insieme', () => {
  it('un disegno solo va via com’è, senza zip', async () => {
    await db.disegni.put({
      id: 'd1',
      nome: 'Taglio rovere',
      cartellaId: null,
      creatoIl: ora,
      modificatoIl: ora,
      svg: SVG
    });
    expect(await condividiSelezione([{ tipo: 'disegno', id: 'd1' }], 'Prova', 'b1')).toBe(1);
    expect(mandati).toHaveLength(1);
    expect(mandati[0].nome).toBe('Taglio_rovere.svg');
    expect(await mandati[0].dati.text()).toBe(SVG);
  });

  it('del piano di taglio si manda il PDF già pronto', async () => {
    await db.nesting.put({
      id: 'n1',
      nome: 'Taglio cucina',
      cartellaId: null,
      creatoIl: ora,
      modificatoIl: ora,
      documento: { versione: 2, nome: 'x', attivo: 'm', materiali: [] },
      pdf: new Blob(['%PDF-1.4 finto']),
      pdfIl: ora + 1000,
      pdfApp: 'b1'
    });
    expect(await condividiSelezione([{ tipo: 'nesting', id: 'n1' }], 'Prova', 'b1')).toBe(1);
    expect(mandati[0].nome).toBe('Taglio_cucina.pdf');
  });

  it('quello che non esiste più non blocca il resto', async () => {
    await db.disegni.put({
      id: 'd1',
      nome: 'Uno',
      cartellaId: null,
      creatoIl: ora,
      modificatoIl: ora,
      svg: SVG
    });
    expect(
      await condividiSelezione(
        [
          { tipo: 'disegno', id: 'sparito' },
          { tipo: 'disegno', id: 'd1' }
        ],
        'Prova',
        'b1'
      )
    ).toBe(1);
    expect(mandati[0].nome).toBe('Uno.svg');
  });

  it('niente da mandare: lo dice invece di aprire un file vuoto', async () => {
    expect(await condividiSelezione([{ tipo: 'disegno', id: 'sparito' }], 'Prova', 'b1')).toBe(0);
    expect(mandati).toHaveLength(0);
  });
});

describe('nomiUnici', () => {
  it('i nomi diversi restano quelli', () => {
    expect(nomiUnici(['a.svg', 'b.pdf'])).toEqual(['a.svg', 'b.pdf']);
  });

  it('il doppione prende il numero, prima dell’estensione', () => {
    expect(nomiUnici(['Taglio.svg', 'Taglio.svg', 'Taglio.svg'])).toEqual([
      'Taglio.svg',
      'Taglio (2).svg',
      'Taglio (3).svg'
    ]);
  });

  it('estensioni diverse non sono doppioni', () => {
    expect(nomiUnici(['Taglio.svg', 'Taglio.pdf'])).toEqual(['Taglio.svg', 'Taglio.pdf']);
  });
});
