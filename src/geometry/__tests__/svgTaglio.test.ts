import { describe, expect, it } from 'vitest';
import { MAGENTA_TAGLIO, nomeFoglioSvg, scalaScritta, svgTaglio } from '../svgTaglio';
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

  it('senza chiedere niente esce 1:1, e la scala è scritta nel titolo', () => {
    expect(s).toContain('<title>scala 1:1</title>');
  });

  it('la scala rimpicciolisce il foglio ma non le coordinate', () => {
    const r = svgTaglio(lastra([10, 10, 500, 300, 'Anta']), { larghezza: 1220, altezza: 2000 }, {
      titolo: 'Cucina Rossi — Bianco — Lastra 1',
      scala: 10
    });
    // il file è dieci volte più piccolo da stampare…
    expect(r).toContain('width="122mm"');
    expect(r).toContain('height="200mm"');
    // …ma le misure dentro restano i millimetri veri del pezzo
    expect(r).toContain('viewBox="0 0 1220 2000"');
    expect(r).toContain('<rect x="10" y="10" width="500" height="300"/>');
    // e la scala è dichiarata, in coda al titolo
    expect(r).toContain('<title>Cucina Rossi — Bianco — Lastra 1 — scala 1:10</title>');
  });

  it('a scala ridotta il tratto resta grosso uguale sul foglio', () => {
    const uno = svgTaglio(lastra([0, 0, 100, 100]), { larghezza: 500, altezza: 500 });
    const dieci = svgTaglio(lastra([0, 0, 100, 100]), { larghezza: 500, altezza: 500 }, {
      scala: 10
    });
    const tratto = (t: string) => Number(t.match(/stroke-width="([\d.]+)"/)![1]);
    // dieci volte più grosso in unità di disegno = uguale in millimetri di
    // foglio, perché il disegno è dieci volte più piccolo
    expect(tratto(dieci)).toBeCloseTo(tratto(uno) * 10, 6);
  });

  it('una scala storta non rompe niente: sotto l’uno si torna a 1:1', () => {
    for (const k of [0, -5, 0.5, NaN]) {
      const r = svgTaglio(lastra([0, 0, 100, 100]), { larghezza: 500, altezza: 500 }, { scala: k });
      expect(r, String(k)).toContain('width="500mm"');
      expect(r, String(k)).toContain('<title>scala 1:1</title>');
    }
  });

  it('scalaScritta si legge come su un disegno', () => {
    expect(scalaScritta(1)).toBe('1:1');
    expect(scalaScritta(20)).toBe('1:20');
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

  it('l’etichetta porta nome E misura, come sul PDF', () => {
    const con = svgTaglio(lastra([10, 10, 600, 400, 'I1 Rettangolo']), {
      larghezza: 1220,
      altezza: 2000
    }, { etichette: true });
    expect(con).toContain('>I1 Rettangolo<');
    expect(con).toContain('>600×400<');
  });

  it('le scritte sono grandi abbastanza da leggersi', () => {
    // il difetto da cui si è partiti: dodici millimetri su un foglio da due
    // metri sono illeggibili appena il disegno si guarda rimpicciolito
    const con = svgTaglio(lastra([10, 10, 600, 400, 'Anta']), {
      larghezza: 1220,
      altezza: 2000
    }, { etichette: true });
    const corpi = [...con.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(corpi.length).toBeGreaterThan(0);
    expect(Math.max(...corpi)).toBeGreaterThanOrEqual(30);
  });

  it('il nome è in evidenza, la misura no', () => {
    const con = svgTaglio(lastra([10, 10, 600, 400, 'Anta']), {
      larghezza: 1220,
      altezza: 2000
    }, { etichette: true });
    /** il tag <text …> che contiene questo testo */
    const tag = (testo: string) => {
      const fine = con.indexOf(`>${testo}<`);
      return con.slice(con.lastIndexOf('<text', fine), fine);
    };
    expect(tag('Anta')).toContain('font-weight="600"');
    expect(tag('600×400')).not.toContain('font-weight');
  });

  it('su un pezzo stretto la scritta gira per lungo', () => {
    const con = svgTaglio(lastra([10, 10, 200, 1800, 'Montante']), {
      larghezza: 1220,
      altezza: 2000
    }, { etichette: true });
    expect(con).toMatch(/<g transform="rotate\(-90 110 910\)">/);
    expect(con).toContain('>Montante<');
  });

  it('su un pezzo largo la scritta resta dritta', () => {
    const con = svgTaglio(lastra([10, 10, 900, 700, 'Schienale']), {
      larghezza: 1220,
      altezza: 2000
    }, { etichette: true });
    const et = con.slice(con.indexOf('id="etichette"'));
    expect(et).not.toContain('rotate(');
  });

  it('su un pezzo minuscolo si tace invece di scrivere l’illeggibile', () => {
    const con = svgTaglio(lastra([0, 0, 6, 6, 'Tassello']), { larghezza: 200, altezza: 200 }, {
      etichette: true
    });
    expect(con).not.toContain('<text');
  });

  it('un nome lungo su un pezzo piccolo va a capo invece di essere troncato', () => {
    const con = svgTaglio(
      lastra([0, 0, 120, 90, 'Frontale cassettone centrale inferiore']),
      { larghezza: 400, altezza: 400 },
      { etichette: true }
    );
    const scritte = [...con.matchAll(/>([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(scritte.filter((t) => t !== '120×90').join(' ')).toBe(
      'Frontale cassettone centrale inferiore'
    );
    expect(con).not.toContain('…');
    const corpi = [...con.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...corpi)).toBeGreaterThanOrEqual(3.5);
  });

  it('le righe di un nome andato a capo stanno una sotto l’altra, centrate', () => {
    const con = svgTaglio(
      lastra([0, 0, 300, 300, 'Anta della colonna dispensa']),
      { larghezza: 400, altezza: 400 },
      { etichette: true }
    );
    const righe = [
      ...con.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"[^>]*>([^<]+)</g)
    ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), corpo: Number(m[3]), testo: m[4] }));
    expect(righe.length).toBeGreaterThan(2);
    // tutte sulla stessa colonna, e in ordine dall'alto in basso
    for (const r of righe) expect(r.x).toBe(150);
    for (let i = 1; i < righe.length; i++) expect(righe[i].y).toBeGreaterThan(righe[i - 1].y);
    // il BLOCCO è centrato sul pezzo: la cima della prima riga e il fondo
    // dell'ultima cadono alla stessa distanza dal centro
    const primo = righe[0];
    const ultimo = righe[righe.length - 1];
    const cima = primo.y - (primo.corpo * 1.15) / 2;
    const fondo = ultimo.y + (ultimo.corpo * 1.15) / 2;
    expect((cima + fondo) / 2).toBeCloseTo(150, 2);
  });

  it('i caratteri speciali non rompono il file', () => {
    const con = svgTaglio(lastra([0, 0, 100, 100, 'Anta & <fianco>']), {
      larghezza: 200,
      altezza: 200
    }, { etichette: true, titolo: 'Lavoro "prova" & co.' });
    // il nome può essere andato a capo: quello che conta è che ogni pezzo di
    // testo sia passato dall'escape e che nel file non resti markup crudo
    const scritte = [...con.matchAll(/>([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(scritte.join(' ')).toContain('&amp;');
    expect(scritte.join(' ')).toContain('&lt;fianco&gt;');
    expect(con).toContain('Lavoro &quot;prova&quot; &amp; co.');
    expect(con.replace(/<[^>]+>/g, '')).not.toContain('<fianco>');
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
