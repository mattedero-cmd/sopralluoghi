import { describe, expect, it } from 'vitest';
import { segmentaBobina } from '../segmenti';
import { calcolaNesting, type LastraNesting, type Piazzamento } from '../nesting';

/** costruisce una lastra fittizia: solo y/altezza contano per il taglio */
function lastra(...righe: Array<[number, number, number?]>): LastraNesting {
  return {
    piazzamenti: righe.map(([y, altezza, x = 0], i) => ({
      x,
      y,
      larghezza: 100,
      altezza,
      larghezzaFinita: 100,
      altezzaFinita: altezza,
      nome: `p${i}`,
      tinta: 0,
      ruotato: false,
      chiave: `p${i}#0`
    })) as Piazzamento[]
  };
}

describe('segmentaBobina', () => {
  it('senza pezzi non produce segmenti', () => {
    expect(segmentaBobina(undefined, 3000)).toEqual([]);
    expect(segmentaBobina({ piazzamenti: [] }, 3000)).toEqual([]);
  });

  it('se il rotolo occupato sta sotto il massimo resta un blocco solo', () => {
    const s = segmentaBobina(lastra([0, 500], [500, 400]), 3000);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ inizio: 0, fine: 900, oltreMassimo: false });
  });

  it('taglia il più tardi possibile entro il massimo', () => {
    // pezzi da 1 m impilati: con massimo 3 m si taglia a 3 m, non a 1 m
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000], [2000, 1000], [3000, 1000]), 3000);
    expect(s.map((x) => [x.inizio, x.fine])).toEqual([
      [0, 3000],
      [3000, 4000]
    ]);
    expect(s.every((x) => !x.oltreMassimo)).toBe(true);
  });

  it('non taglia mai attraverso un pezzo', () => {
    // un pezzo da 0 a 2800 accanto a pezzi corti: il taglio a 3000 non è
    // libero perché a 1000/2000 ci passa in mezzo il pezzo lungo
    const l = lastra([0, 2800, 0], [0, 1000, 200], [1000, 1000, 200], [2000, 1000, 200]);
    const s = segmentaBobina(l, 1500);
    for (const seg of s) {
      for (const p of l.piazzamenti) {
        const attraversa = p.y < seg.fine - 1e-6 && p.y + p.altezza > seg.fine + 1e-6;
        expect(attraversa, `taglio a ${seg.fine} attraverso il pezzo a ${p.y}`).toBe(false);
      }
    }
  });

  it('quando non c’è nessun taglio libero il blocco supera il massimo, e lo dice', () => {
    // un unico pezzo da 4 m: non si può spezzare
    const s = segmentaBobina(lastra([0, 4000]), 3000);
    expect(s).toHaveLength(1);
    expect(s[0].fine).toBe(4000);
    expect(s[0].oltreMassimo).toBe(true);
  });

  it('ogni pezzo finisce in uno e un solo segmento', () => {
    const l = lastra([0, 900], [900, 900], [1800, 900], [2700, 900], [3600, 900], [4500, 900]);
    const s = segmentaBobina(l, 2000);
    const totale = s.reduce((n, x) => n + x.lastra.piazzamenti.length, 0);
    expect(totale).toBe(l.piazzamenti.length);
    const nomi = s.flatMap((x) => x.lastra.piazzamenti.map((p) => p.nome));
    expect(new Set(nomi).size).toBe(l.piazzamenti.length);
  });

  it('le coordinate dei pezzi ripartono da zero in ogni segmento', () => {
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000], [2000, 1000]), 1000);
    expect(s).toHaveLength(3);
    for (const seg of s) {
      expect(Math.min(...seg.lastra.piazzamenti.map((p) => p.y))).toBe(0);
      const fondo = Math.max(...seg.lastra.piazzamenti.map((p) => p.y + p.altezza));
      expect(fondo).toBeLessThanOrEqual(seg.fine - seg.inizio + 1e-6);
    }
  });

  it('i segmenti coprono tutto il tratto, senza buchi né sovrapposizioni', () => {
    const s = segmentaBobina(lastra([0, 700], [700, 1500], [2200, 400], [2600, 2000]), 1800);
    expect(s[0].inizio).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i].inizio).toBe(s[i - 1].fine);
    expect(s[s.length - 1].fine).toBe(4600);
  });

  it('il margine entra nel tratto da tagliare', () => {
    const s = segmentaBobina(lastra([0, 500]), 3000, 10);
    expect(s[0].fine).toBe(510);
  });

  it('regge un nesting vero e non perde pezzi', () => {
    const esito = calcolaNesting(
      { lastra: { larghezza: 1400, altezza: 50000 }, lama: 3, abbondanza: 0, margine: 10, massimoLastre: 1 },
      [
        { id: 'a', nome: 'Testiera', larghezza: 950, altezza: 860, quantita: 4, ruotabile: false, tinta: 0 },
        { id: 'b', nome: 'Frontale', larghezza: 1000, altezza: 150, quantita: 3, ruotabile: true, tinta: 90 },
        { id: 'c', nome: 'Fianco', larghezza: 610, altezza: 750, quantita: 6, ruotabile: true, tinta: 180 }
      ]
    );
    const s = segmentaBobina(esito.lastre[0], 3000, 10);
    const piazzati = esito.lastre[0].piazzamenti.length;
    expect(s.reduce((n, x) => n + x.lastra.piazzamenti.length, 0)).toBe(piazzati);
    for (const seg of s) {
      // nessun pezzo tagliato a metà da un estremo del segmento
      for (const p of esito.lastre[0].piazzamenti) {
        expect(p.y < seg.fine - 1e-6 && p.y + p.altezza > seg.fine + 1e-6).toBe(false);
      }
    }
  });
});
