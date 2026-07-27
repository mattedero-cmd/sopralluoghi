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

describe('code vuote', () => {
  it('il margine dopo l’ultimo pezzo non diventa un segmento a sé', () => {
    // due pezzi da 1 m con massimo 1 m: il taglio cade a 1000 e a 2000, ma
    // fineTotale è 2010 per via del margine
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000]), 1000, 10);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.lastra.piazzamenti.length > 0)).toBe(true);
    expect(s[s.length - 1].fine).toBe(2010);
  });

  it('nessun segmento resta senza pezzi, con qualunque massimo', () => {
    const l = lastra([0, 700], [700, 500], [1200, 900], [2100, 600], [2700, 800]);
    for (const massimo of [600, 800, 1000, 1500, 2000, 3000, 4000]) {
      const s = segmentaBobina(l, massimo, 10);
      for (const seg of s) {
        expect(seg.lastra.piazzamenti.length, `massimo ${massimo}`).toBeGreaterThan(0);
      }
      // e continuano a coprire tutto il tratto
      expect(s[0].inizio).toBe(0);
      expect(s[s.length - 1].fine).toBe(3510);
      for (let i = 1; i < s.length; i++) expect(s[i].inizio).toBe(s[i - 1].fine);
    }
  });
});

describe('linee libere che non sono fini di pezzo', () => {
  it('taglia anche nel vuoto fra due file lontane', () => {
    // un pezzo in cima, poi 2,5 m di rotolo sgombro, poi un altro pezzo.
    // Guardando solo le fini dei pezzi si taglierebbe subito a 500 e il
    // blocco successivo verrebbe lungo 3 m; il vuoto invece si può tagliare
    // dove si vuole.
    const s = segmentaBobina(lastra([0, 500], [3000, 500]), 2000);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.fine - x.inizio <= 2000 + 1e-6)).toBe(true);
    expect(s.every((x) => !x.oltreMassimo)).toBe(true);
    expect(s.every((x) => x.lastra.piazzamenti.length === 1)).toBe(true);
  });

  it('due pezzi che si toccano lasciano passare la lama sul contatto', () => {
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000]), 1000);
    expect(s.map((x) => [x.inizio, x.fine])).toEqual([
      [0, 1000],
      [1000, 2000]
    ]);
  });

  it('due pezzi affiancati e sfalsati bloccano il taglio in mezzo', () => {
    // P1 copre 0..1000 a sinistra, P2 copre 900..1600 a destra: fra 900 e
    // 1000 la lama non passa, e nemmeno a 1000
    const l = lastra([0, 1000, 0], [900, 700, 500]);
    const s = segmentaBobina(l, 1200);
    expect(s).toHaveLength(1);
    expect(s[0].fine).toBe(1600);
    expect(s[0].oltreMassimo).toBe(true);
  });
});

describe('margini senza pezzi dentro', () => {
  it('il margine di TESTA non diventa un segmento a sé', () => {
    // come nel calcolo vero: i pezzi partono a y = margine
    const s = segmentaBobina(lastra([10, 2000], [2010, 1500]), 1800, 10);
    expect(s.every((x) => x.lastra.piazzamenti.length > 0)).toBe(true);
    expect(s[0].inizio).toBe(0);
  });

  it('un solo pezzo lunghissimo resta un blocco solo, non tre', () => {
    const s = segmentaBobina(lastra([10, 4000]), 1000, 10);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ inizio: 0, fine: 4020, oltreMassimo: true });
    expect(s[0].lastra.piazzamenti).toHaveLength(1);
  });

  it('i blocchi restano contigui e coprono tutto anche dopo le fusioni', () => {
    const l = lastra([10, 900], [910, 1200], [2110, 400], [2510, 1500]);
    for (const massimo of [500, 900, 1300, 2000, 2600, 5000]) {
      const s = segmentaBobina(l, massimo, 10);
      expect(s[0].inizio).toBe(0);
      expect(s[s.length - 1].fine).toBe(4020);
      for (let i = 1; i < s.length; i++) expect(s[i].inizio).toBe(s[i - 1].fine);
      expect(s.every((x) => x.lastra.piazzamenti.length > 0)).toBe(true);
      expect(s.reduce((n, x) => n + x.lastra.piazzamenti.length, 0)).toBe(4);
    }
  });
});
