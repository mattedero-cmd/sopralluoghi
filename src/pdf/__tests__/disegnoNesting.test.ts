import { describe, expect, it } from 'vitest';
import { impaginaLastra, riassuntoLastra } from '../disegnoNesting';
import { calcolaNesting } from '../../geometry/nesting';
import { hslEsa, tintaSfondoEsa } from '../../utils/tinte';

const AREA = { x: 28, y: 78, larghezza: 539, altezza: 430 };

const esito = calcolaNesting(
  { lastra: { larghezza: 2500, altezza: 1250 }, lama: 3, abbondanza: 0, margine: 10 },
  [
    { id: 'a', nome: 'Anta', larghezza: 597, altezza: 720, quantita: 4, ruotabile: false, tinta: 0 },
    { id: 'r', nome: 'Ripiano', larghezza: 560, altezza: 300, quantita: 6, ruotabile: true, tinta: 138 },
    { id: 'z', nome: 'Zoccolo', larghezza: 500, altezza: 60, quantita: 4, ruotabile: true, tinta: 275 }
  ]
);

describe('impaginaLastra', () => {
  const d = impaginaLastra(esito.lastre[0], { larghezza: 2500, altezza: 1250 }, AREA, {
    margine: 10
  });

  it('il foglio sta dentro l’area, centrato in orizzontale', () => {
    expect(d.cornice.x).toBeGreaterThanOrEqual(AREA.x - 0.001);
    expect(d.cornice.y).toBe(AREA.y);
    expect(d.cornice.larghezza).toBeLessThanOrEqual(AREA.larghezza + 0.001);
    expect(d.cornice.altezza).toBeLessThanOrEqual(AREA.altezza + 0.001);
    const sinistra = d.cornice.x - AREA.x;
    const destra = AREA.x + AREA.larghezza - (d.cornice.x + d.cornice.larghezza);
    expect(Math.abs(sinistra - destra)).toBeLessThan(0.001);
  });

  it('usa tutta l’area disponibile su un lato', () => {
    const pieno =
      Math.abs(d.cornice.larghezza - AREA.larghezza) < 0.001 ||
      Math.abs(d.cornice.altezza - AREA.altezza) < 0.001;
    expect(pieno).toBe(true);
  });

  it('nessun pezzo esce dalla cornice', () => {
    expect(d.pezzi.length).toBe(esito.lastre[0].piazzamenti.length);
    for (const p of d.pezzi) {
      expect(p.x).toBeGreaterThanOrEqual(d.cornice.x - 0.001);
      expect(p.y).toBeGreaterThanOrEqual(d.cornice.y - 0.001);
      expect(p.x + p.larghezza).toBeLessThanOrEqual(d.cornice.x + d.cornice.larghezza + 0.001);
      expect(p.y + p.altezza).toBeLessThanOrEqual(d.cornice.y + d.cornice.altezza + 0.001);
    }
  });

  it('ogni etichetta sta dentro il proprio pezzo', () => {
    for (const t of d.testi) {
      const suo = d.pezzi.find(
        (p) =>
          t.x >= p.x - 0.001 &&
          t.x + t.larghezza <= p.x + p.larghezza + 0.001 &&
          t.y >= p.y - 0.001 &&
          t.y + t.corpo * 1.2 <= p.y + p.altezza + 0.001
      );
      expect(suo, `«${t.testo}» a (${t.x}, ${t.y})`).toBeTruthy();
    }
  });

  it('un nome lungo va a capo sul pezzo, e le righe restano in colonna', () => {
    const lungo = calcolaNesting(
      { lastra: { larghezza: 2500, altezza: 1250 }, lama: 3, abbondanza: 0, margine: 10 },
      [
        {
          id: 'v',
          nome: 'Pannello laterale corto vano tecnico',
          larghezza: 600,
          altezza: 900,
          quantita: 2,
          ruotabile: true,
          tinta: 0
        }
      ]
    );
    const p = impaginaLastra(lungo.lastre[0], { larghezza: 2500, altezza: 1250 }, AREA, {
      margine: 10
    });
    expect(p.ruotate).toHaveLength(0);
    // il nome esce intero, spezzato fra le parole, più la misura
    const scritte = p.testi.map((t) => t.testo);
    // sul foglio il pezzo è largo 129 punti: a corpo 9 ci stanno 23 caratteri
    // per riga, e questo nome ne ha 36
    expect(scritte.join(' ')).toContain('Pannello laterale corto vano tecnico');
    expect(scritte).not.toContain('Pannello laterale corto vano tecnico');
    expect(scritte.filter((t) => t.includes('…'))).toEqual([]);
    // le righe di uno stesso pezzo stanno sulla stessa colonna, una sotto
    // l'altra e dentro il pezzo
    for (const pezzo of p.pezzi) {
      const sue = p.testi
        .filter((t) => t.x >= pezzo.x - 0.001 && t.x + t.larghezza <= pezzo.x + pezzo.larghezza + 0.001)
        .filter((t) => t.y >= pezzo.y - 0.001 && t.y <= pezzo.y + pezzo.altezza + 0.001)
        .sort((a, b) => a.y - b.y);
      if (sue.length < 2) continue;
      for (const t of sue) expect(t.x).toBeCloseTo(sue[0].x, 6);
      for (let i = 1; i < sue.length; i++) expect(sue[i].y).toBeGreaterThan(sue[i - 1].y);
      // il blocco è centrato sul pezzo
      const cima = sue[0].y;
      const fondo = sue[sue.length - 1].y + sue[sue.length - 1].corpo * 1.15;
      const centro = (cima + fondo) / 2;
      expect(centro).toBeCloseTo(pezzo.y + pezzo.altezza / 2, 0);
    }
  });

  it('gira il testo solo dove dritto non ci starebbe', () => {
    // gli Zoccolo sono impaginati in piedi (60 mm di larghezza): lì il nome
    // ci sta solo per lungo. Anta e Ripiano restano dritti.
    for (const e of d.ruotate) expect(e.larghezza).toBeLessThan(e.altezza);
    expect(d.testi.map((t) => t.testo)).toContain('Anta');
    expect(d.testi.map((t) => t.testo)).toContain('Ripiano');
  });

  it('i colori sono esadecimali: pdfmake non capisce hsl()', () => {
    for (const p of d.pezzi) {
      expect(p.riempimento).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.bordo).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('il margine tratteggiato sta dentro la cornice', () => {
    expect(d.margine).not.toBeNull();
    expect(d.margine!.x).toBeGreaterThan(d.cornice.x);
    expect(d.margine!.larghezza).toBeLessThan(d.cornice.larghezza);
    expect(d.margine!.tratteggio).toBe(true);
  });

  it('senza margine non disegna la cornice interna', () => {
    const senza = impaginaLastra(esito.lastre[0], { larghezza: 2500, altezza: 1250 }, AREA);
    expect(senza.margine).toBeNull();
  });

  it('una lastra molto lunga (segmento di bobina) rientra in altezza', () => {
    const strisce = calcolaNesting(
      { lastra: { larghezza: 1000, altezza: 2200 }, lama: 3, abbondanza: 0, margine: 5 },
      [{ id: 'p', nome: 'Fascia', larghezza: 900, altezza: 400, quantita: 5, ruotabile: false, tinta: 20 }]
    );
    const dd = impaginaLastra(strisce.lastre[0], { larghezza: 1000, altezza: 2200 }, AREA);
    expect(dd.cornice.altezza).toBeLessThanOrEqual(AREA.altezza + 0.001);
    expect(dd.cornice.larghezza).toBeLessThanOrEqual(AREA.larghezza + 0.001);
  });
});

describe('riassuntoLastra', () => {
  it('raggruppa i pezzi per nome e misura', () => {
    const r = riassuntoLastra(esito.lastre[0]);
    expect(r).toMatch(/×\s*Anta 597×720/);
    expect(r).toContain('·');
  });
});

describe('tinte', () => {
  it('hsl e esadecimale descrivono lo stesso colore', () => {
    expect(hslEsa(0, 100, 50)).toBe('#ff0000');
    expect(hslEsa(120, 100, 50)).toBe('#00ff00');
    expect(hslEsa(240, 100, 50)).toBe('#0000ff');
    expect(hslEsa(0, 0, 100)).toBe('#ffffff');
    expect(tintaSfondoEsa(0)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('venatura nel PDF', () => {
  it('senza venatura non disegna righe', () => {
    const d = impaginaLastra(esito.lastre[0], { larghezza: 2500, altezza: 1250 }, AREA);
    expect(d.venatura).toEqual([]);
  });

  it('le righe della venatura restano dentro i pezzi e seguono il materiale', () => {
    const d = impaginaLastra(esito.lastre[0], { larghezza: 2500, altezza: 1250 }, AREA, {
      venatura: 'verticale'
    });
    expect(d.venatura.length).toBeGreaterThan(10);
    for (const l of d.venatura) {
      // verticale: la riga è parallela all'asse Y, sempre, anche sui pezzi girati
      expect(l.x1).toBe(l.x2);
      const dentro = d.pezzi.some(
        (p) =>
          l.x1 >= p.x - 0.001 &&
          l.x1 <= p.x + p.larghezza + 0.001 &&
          l.y1 >= p.y - 0.001 &&
          l.y2 <= p.y + p.altezza + 0.001
      );
      expect(dentro).toBe(true);
    }
  });

  it('la venatura orizzontale disegna righe orizzontali', () => {
    const d = impaginaLastra(esito.lastre[0], { larghezza: 2500, altezza: 1250 }, AREA, {
      venatura: 'orizzontale'
    });
    expect(d.venatura.length).toBeGreaterThan(10);
    for (const l of d.venatura) expect(l.y1).toBe(l.y2);
  });
});

describe('etichette girate sui pezzi stretti', () => {
  const strettoAlto = calcolaNesting(
    { lastra: { larghezza: 1220, altezza: 2400 }, lama: 3, abbondanza: 0, margine: 10 },
    [
      { id: 'a', nome: 'Sopra armadio', larghezza: 100, altezza: 1650, quantita: 1, ruotabile: false, tinta: 0 },
      { id: 'b', nome: 'Fianco armadio', larghezza: 450, altezza: 2300, quantita: 1, ruotabile: false, tinta: 90 },
      { id: 'c', nome: 'Traversa', larghezza: 600, altezza: 400, quantita: 1, ruotabile: false, tinta: 200 }
    ]
  );

  it('un pezzo stretto e alto riceve l’etichetta per lungo, non troncata', () => {
    const d = impaginaLastra(strettoAlto.lastre[0], { larghezza: 1220, altezza: 2400 }, AREA);
    expect(d.ruotate.length).toBeGreaterThan(0);
    const nomi = d.ruotate.flatMap((e) => e.righe.map((r) => r.testo));
    expect(nomi).toContain('Sopra armadio');
    // scritto per intero: nessuna ellissi
    expect(nomi.some((t) => t.endsWith('…'))).toBe(false);
  });

  it('il riquadro dell’etichetta girata coincide col pezzo', () => {
    const d = impaginaLastra(strettoAlto.lastre[0], { larghezza: 1220, altezza: 2400 }, AREA);
    for (const e of d.ruotate) {
      const suo = d.pezzi.find(
        (p) =>
          Math.abs(p.x - e.x) < 0.001 &&
          Math.abs(p.y - e.y) < 0.001 &&
          Math.abs(p.larghezza - e.larghezza) < 0.001 &&
          Math.abs(p.altezza - e.altezza) < 0.001
      );
      expect(suo).toBeTruthy();
    }
  });

  it('il testo girato sta nella lunghezza del pezzo', () => {
    const d = impaginaLastra(strettoAlto.lastre[0], { larghezza: 1220, altezza: 2400 }, AREA);
    for (const e of d.ruotate) {
      for (const r of e.righe) {
        // girato: la larghezza del testo si misura sull'ALTEZZA del pezzo
        expect(r.corpo * 0.58 * r.testo.length).toBeLessThanOrEqual(e.altezza);
        expect(r.corpo * 1.2).toBeLessThanOrEqual(e.larghezza);
      }
    }
  });

  it('nella stessa lastra i pezzi larghi restano col testo dritto', () => {
    const d = impaginaLastra(strettoAlto.lastre[0], { larghezza: 1220, altezza: 2400 }, AREA);
    expect(d.testi.map((t) => t.testo)).toContain('Traversa');
  });
});
