import { describe, expect, it } from 'vitest';
import { MAGENTA_TAGLIO, nomeFoglioSvg, svgTaglio } from '../svgTaglio';
import { calcolaNesting, type LastraNesting, type Piazzamento } from '../nesting';

const lastra = (...righe: Array<[number, number, number, number, string?]>): LastraNesting => ({
  piazzamenti: righe.map(([x, y, l, a, nome], i) => ({
    x,
    y,
    larghezza: l,
    altezza: a,
    larghezzaFinita: l,
    altezzaFinita: a,
    nome: nome ?? `p${i}`,
    tinta: 0,
    ruotato: false,
    chiave: `p${i}#0`
  })) as Piazzamento[]
});

describe('svgTaglio', () => {
  const s = svgTaglio(lastra([10, 10, 500, 300, 'Anta'], [520, 10, 200, 800, 'Fianco']), {
    larghezza: 1220,
    altezza: 2000
  });

  it('è un SVG in millimetri reali, scala 1:1', () => {
    expect(s).toContain('width="1220mm"');
    expect(s).toContain('height="2000mm"');
    expect(s).toContain('viewBox="0 0 1220 2000"');
  });

  it('il contorno del supporto sta nel livello «sheet», nero', () => {
    const g = s.slice(s.indexOf('id="sheet"'), s.indexOf('id="CutContour"'));
    expect(g).toContain('stroke="#000000"');
    expect(g).toContain('<rect x="0" y="0" width="1220" height="2000"/>');
    // il supporto non è un pezzo da tagliare: un solo rettangolo
    expect(g.match(/<rect/g)).toHaveLength(1);
  });

  it('i tagli stanno nel livello «CutContour», magenta 100%', () => {
    const g = s.slice(s.indexOf('id="CutContour"'));
    expect(g).toContain(`stroke="${MAGENTA_TAGLIO}"`);
    expect(MAGENTA_TAGLIO).toBe('#EC008C');
    expect(g).toContain('<rect x="10" y="10" width="500" height="300"/>');
    expect(g).toContain('<rect x="520" y="10" width="200" height="800"/>');
    expect(g.match(/<rect/g)).toHaveLength(2);
  });

  it('niente riempimenti: la macchina segue le linee', () => {
    expect(s).not.toContain('fill="#');
    expect((s.match(/fill="none"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('senza etichette non scrive testo', () => {
    expect(s).not.toContain('<text');
  });

  it('con le etichette scrive i nomi in un livello a parte', () => {
    const con = svgTaglio(lastra([10, 10, 500, 300, 'Anta']), { larghezza: 1220, altezza: 2000 }, {
      etichette: true
    });
    expect(con).toContain('id="etichette"');
    expect(con).toContain('>Anta<');
    // e le etichette restano fuori dal livello di taglio
    const taglio = con.slice(con.indexOf('id="CutContour"'), con.indexOf('id="etichette"'));
    expect(taglio).not.toContain('<text');
  });

  it('i caratteri speciali non rompono il file', () => {
    const con = svgTaglio(lastra([0, 0, 100, 100, 'Anta & <fianco>']), {
      larghezza: 200,
      altezza: 200
    }, { etichette: true, titolo: 'Lavoro "prova" & co.' });
    expect(con).toContain('Anta &amp; &lt;fianco&gt;');
    expect(con).toContain('Lavoro &quot;prova&quot; &amp; co.');
  });

  it('un nesting vero finisce tutto dentro il contorno del supporto', () => {
    const esito = calcolaNesting(
      { lastra: { larghezza: 1220, altezza: 2400 }, lama: 3, abbondanza: 0, margine: 10 },
      [
        { id: 'a', nome: 'Testiera', larghezza: 950, altezza: 860, quantita: 2, ruotabile: true, tinta: 0 },
        { id: 'b', nome: 'Frontale', larghezza: 500, altezza: 150, quantita: 4, ruotabile: true, tinta: 90 }
      ]
    );
    const testo = svgTaglio(esito.lastre[0], { larghezza: 1220, altezza: 2400 });
    const rett = [...testo.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"\/>/g)]
      .map((m) => m.slice(1).map(Number));
    // il primo è il supporto, gli altri i pezzi
    expect(rett).toHaveLength(1 + esito.lastre[0].piazzamenti.length);
    for (const [x, y, w, h] of rett.slice(1)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(1220);
      expect(y + h).toBeLessThanOrEqual(2400);
    }
  });

  it('un supporto senza pezzi resta un contorno vuoto, non un file rotto', () => {
    const vuoto = svgTaglio({ piazzamenti: [] }, { larghezza: 1000, altezza: 1000 });
    expect(vuoto).toContain('id="CutContour"');
    expect(vuoto.trimEnd().endsWith('</svg>')).toBe(true);
  });
});

describe('nomeFoglioSvg', () => {
  it('mette insieme lavoro, essenza e foglio in un nome da file', () => {
    expect(nomeFoglioSvg('Camera Rossi', 'Legno scuro', 'Segmento 1')).toBe(
      'Camera_Rossi__Legno_scuro__Segmento_1'
    );
  });

  it('toglie accenti e caratteri che i file system non gradiscono', () => {
    expect(nomeFoglioSvg('Città/2026', 'Pelle*chiara')).toBe('Citta2026__Pellechiara');
  });

  it('senza foglio non lascia separatori penzoloni', () => {
    expect(nomeFoglioSvg('Lavoro', 'Essenza')).toBe('Lavoro__Essenza');
  });
});
