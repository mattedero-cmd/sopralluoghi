import { describe, expect, it } from 'vitest';
import { fileSvgTaglio } from '../esportaTaglio';
import { materialeNuovo, type DocumentoNesting } from '../documentoNesting';

const pezzo = (id: string, nome: string, l: number, a: number, q: number) => ({
  id,
  nome,
  larghezza: l,
  altezza: a,
  quantita: q,
  ruotabile: true,
  tinta: 0
});

function documento(): DocumentoNesting {
  const legno = {
    ...materialeNuovo('m1', 'Legno scuro'),
    pezzi: [pezzo('a', 'Anta', 900, 600, 6)]
  };
  const pelle = {
    ...materialeNuovo('m2', 'Pelle chiara'),
    modo: 'bobina' as const,
    bobina: { larghezza: 1220, metri: 50 },
    pezzi: [pezzo('b', 'Testiera', 950, 860, 4), pezzo('c', 'Frontale', 500, 150, 3)]
  };
  return {
    versione: 2,
    nome: 'Camera Rossi',
    attivo: 'm1',
    materiali: [legno, pelle]
  };
}

const OPZ = { perSegmento: true, massimoSegmento: 3000, etichette: false };

describe('fileSvgTaglio', () => {
  it('le lastre fanno un file ciascuna: sono pezzi di materiale separati', () => {
    const file = fileSvgTaglio(documento(), OPZ);
    const lastre = file.filter((f) => f.materiale === 'Legno scuro');
    expect(lastre.length).toBeGreaterThan(0);
    expect(lastre.map((f) => f.foglio)).toEqual(
      lastre.map((_, i) => `Lastra ${i + 1}`)
    );
  });

  it('la bobina a segmenti produce i file dei segmenti', () => {
    const file = fileSvgTaglio(documento(), OPZ);
    const pelle = file.filter((f) => f.materiale === 'Pelle chiara');
    expect(pelle.length).toBeGreaterThan(1);
    expect(pelle[0].foglio).toMatch(/^Segmento 1 di \d+$/);
  });

  it('la bobina intera produce un file solo', () => {
    const file = fileSvgTaglio(documento(), { ...OPZ, perSegmento: false });
    const pelle = file.filter((f) => f.materiale === 'Pelle chiara');
    expect(pelle).toHaveLength(1);
    expect(pelle[0].foglio).toBe('Bobina');
  });

  it('ogni file è un SVG in millimetri con i due livelli previsti', () => {
    for (const f of fileSvgTaglio(documento(), OPZ)) {
      expect(f.contenuto).toMatch(/^<\?xml/);
      expect(f.contenuto).toContain('id="sheet"');
      expect(f.contenuto).toContain('id="CutContour"');
      expect(f.contenuto).toContain('mm"');
      expect(f.contenuto.trimEnd().endsWith('</svg>')).toBe(true);
    }
  });

  it('i nomi dei file sono distinti fra loro', () => {
    const nomi = fileSvgTaglio(documento(), OPZ).map((f) => f.nome);
    expect(new Set(nomi).size).toBe(nomi.length);
    expect(nomi[0]).toContain('Camera_Rossi');
  });

  it('la bobina della bobina intera è lunga quanto il tratto occupato', () => {
    const f = fileSvgTaglio(documento(), { ...OPZ, perSegmento: false }).find(
      (x) => x.foglio === 'Bobina'
    )!;
    const alto = Number(/height="([\d.]+)mm"/.exec(f.contenuto)![1]);
    // non i 50 metri del rotolo: solo quello che serve
    expect(alto).toBeGreaterThan(1000);
    expect(alto).toBeLessThan(10000);
  });

  it('le etichette si aggiungono solo se richieste', () => {
    expect(fileSvgTaglio(documento(), OPZ)[0].contenuto).not.toContain('<text');
    expect(
      fileSvgTaglio(documento(), { ...OPZ, etichette: true })[0].contenuto
    ).toContain('<text');
  });

  it('un materiale senza pezzi non produce file vuoti', () => {
    const d = documento();
    d.materiali[0].pezzi = [];
    const file = fileSvgTaglio(d, OPZ);
    expect(file.every((f) => f.materiale !== 'Legno scuro')).toBe(true);
    expect(file.length).toBeGreaterThan(0);
  });
});
