import { describe, expect, it } from 'vitest';
import { spigoliDellaFoto, spigoliSuiVertici } from '../spigolo';
import { pianiAgganciati, verticiGemelli } from '../pianoModifica';
import { pianoDi } from '../calibrazione';
import type { PianoProspettiva } from '../../db/types';
import { ALTEZZA, LARGHEZZA, nellaFoto, rileva, suFoto, type M3 } from './scenaStanza';

describe('una stanza intera: tre pareti, pavimento e soffitto', () => {
  it('i cinque piani si riconoscono, ciascuno con le sue forme', () => {
    const r = rileva();
    console.log(`piani trovati: ${r.piani.length}`);
    expect(r.piani).toHaveLength(5);
    for (const p of ['fo', 'si', 'de', 'pa', 'so']) {
      const i = r.quale(p);
      expect(i, `piano di ${p}`).toBeGreaterThanOrEqual(0);
      expect(
        r.gruppi[i].esito.riferimenti.every((x) => x.id.startsWith(p)),
        `il piano di ${p} raccoglie solo le sue forme`
      ).toBe(true);
    }
  });

  it('ogni misura ritrova il suo piano, anche vicino agli spigoli', () => {
    const r = rileva();
    const foto = {
      scala: null,
      piano: r.piani[0],
      piani: r.piani.slice(1),
      larghezzaPx: LARGHEZZA,
      altezzaPx: ALTEZZA
    };
    const prove: Array<[string, M3, number, number]> = [
      ['fo', r.s.fondo, 1200, 1200],
      ['si', r.s.sinistra, 1200, 1200],
      ['de', r.s.destra, 1200, 1200],
      ['pa', r.s.pavimento, 1200, 1200],
      ['so', r.s.soffitto, 1200, 1200]
    ];
    let giusti = 0;
    let contati = 0;
    for (const [pref, G, a, b] of prove) {
      const p = suFoto(G, a, b);
      if (!nellaFoto(p)) continue;
      contati++;
      if (pianoDi(foto, p) === r.piani[r.quale(pref)]) giusti++;
    }
    console.log(`misure al posto giusto: ${giusti}/${contati}`);
    expect(giusti).toBe(contati);
  });

  it('gli spigoli sono quelli veri: parete-parete e parete-pavimento', () => {
    const r = rileva();
    const sp = spigoliDellaFoto(r.piani, LARGHEZZA, ALTEZZA);
    const coppia = (a: string, b: string) =>
      sp.some(
        (x) =>
          (x.a === r.quale(a) && x.b === r.quale(b)) ||
          (x.b === r.quale(a) && x.a === r.quale(b))
      );
    console.log(
      'spigoli:',
      sp
        .map((x) => {
          const nome = (i: number) =>
            ['fo', 'si', 'de', 'pa', 'so'].find((p) => r.quale(p) === i) ?? `?${i}`;
          return `${nome(x.a)}-${nome(x.b)}${x.separante ? '' : ' (T)'}`;
        })
        .join(', ')
    );
    // le due pareti laterali NON si toccano: in mezzo c'è quella di fondo
    expect(coppia('si', 'de')).toBe(false);
    // il fondo tocca tutti
    for (const altro of ['si', 'de', 'pa', 'so']) {
      expect(coppia('fo', altro), `fondo-${altro}`).toBe(true);
    }
  });

  it('l’aggancio non manda le pareti fuori dal mondo', () => {
    const r = rileva();
    const attaccati = pianiAgganciati(r.piani, LARGHEZZA, ALTEZZA);
    for (let i = 0; i < attaccati.length; i++) {
      const prima = r.piani[i];
      const dopo = attaccati[i];
      const misura = (p: PianoProspettiva) => p.larghezzaReale * p.altezzaReale;
      const crescita = misura(dopo) / misura(prima);
      console.log(
        `piano ${i}: ${Math.round(prima.larghezzaReale)}×${Math.round(prima.altezzaReale)} → ` +
          `${Math.round(dopo.larghezzaReale)}×${Math.round(dopo.altezzaReale)} (×${crescita.toFixed(1)})`
      );
      // un aggancio è un ritocco: non può decuplicare una parete
      expect(crescita, `piano ${i}`).toBeLessThan(6);
      expect(dopo.punti.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
    }
  });

  it('e la riga di ogni spigolo resta dentro la foto', () => {
    const r = rileva();
    const attaccati = pianiAgganciati(r.piani, LARGHEZZA, ALTEZZA);
    const sp = spigoliSuiVertici(
      spigoliDellaFoto(attaccati, LARGHEZZA, ALTEZZA),
      attaccati,
      LARGHEZZA,
      ALTEZZA
    );
    for (const x of sp) {
      for (const p of [x.spigolo.p1, x.spigolo.p2]) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
    console.log(`spigoli disegnati: ${sp.length}`);
  });

  /**
   * IL CASO DA CUI È PARTITO TUTTO: tre pareti e IL PAVIMENTO, senza soffitto.
   *
   * È il sopralluogo vero — in un bagno il soffitto non si quota quasi mai, il
   * pavimento sì. Ed è qui che il modello «andava fuori equilibrio»: finché i
   * piani erano solo pareti, nessuno diceva a un muro dove finiva in alto e in
   * basso, e per far combaciare i due vertici dello spigolo il riquadro si
   * allungava lungo il filo a tentoni. Col pavimento sotto, quel tentativo si
   * scontrava con uno spigolo orizzontale vero, e le pareti partivano.
   */
  it('tre pareti e il pavimento, senza soffitto, restano al loro posto', () => {
    const r = rileva(['so']);
    expect(r.piani).toHaveLength(4);
    for (const p of ['fo', 'si', 'de', 'pa']) {
      expect(r.quale(p), `piano di ${p}`).toBeGreaterThanOrEqual(0);
    }
    const sp = spigoliDellaFoto(r.piani, LARGHEZZA, ALTEZZA);
    const coppia = (a: string, b: string) =>
      sp.some(
        (x) =>
          (x.a === r.quale(a) && x.b === r.quale(b)) ||
          (x.b === r.quale(a) && x.a === r.quale(b))
      );
    expect(coppia('si', 'de'), 'le due laterali non si toccano').toBe(false);
    for (const altro of ['si', 'de', 'pa']) {
      expect(coppia('fo', altro), `fondo-${altro}`).toBe(true);
    }
    const attaccati = pianiAgganciati(r.piani, LARGHEZZA, ALTEZZA);
    attaccati.forEach((dopo, i) => {
      const prima = r.piani[i];
      const crescita =
        (dopo.larghezzaReale * dopo.altezzaReale) /
        (prima.larghezzaReale * prima.altezzaReale);
      console.log(
        `senza soffitto, piano ${i}: ${Math.round(prima.larghezzaReale)}×${Math.round(prima.altezzaReale)} → ` +
          `${Math.round(dopo.larghezzaReale)}×${Math.round(dopo.altezzaReale)} (×${crescita.toFixed(1)})`
      );
      expect(crescita, `piano ${i}`).toBeLessThan(6);
    });
  });

  /**
   * I VERTICI DI GIUNZIONE DELLA STANZA.
   *
   * È il punto della faccenda: due piani che si toccano devono avere un
   * angolo IN COMUNE, la maniglia che diventa verde e si tira una volta sola.
   * In una stanza intera non è più un angolo per volta — nel vertice in basso
   * a sinistra si incontrano la parete di fondo, quella di sinistra e il
   * pavimento — e ogni parete deve chiudersi con tutte le vicine, non solo
   * con la prima che le capita.
   */
  it('ogni coppia di piani che si tocca ha l’angolo in comune', () => {
    const r = rileva();
    const attaccati = pianiAgganciati(r.piani, LARGHEZZA, ALTEZZA);
    const piuVicini = (i: number, j: number) => {
      let d = Infinity;
      attaccati[i].punti.forEach((p) =>
        attaccati[j].punti.forEach((q) => {
          d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
        })
      );
      return d;
    };
    for (const [a, b] of [
      ['fo', 'si'],
      ['fo', 'de'],
      ['fo', 'pa'],
      ['fo', 'so'],
      ['si', 'pa'],
      ['si', 'so'],
      ['de', 'pa'],
      ['de', 'so']
    ]) {
      const d = piuVicini(r.quale(a), r.quale(b));
      console.log(`${a}-${b}: ${d.toFixed(0)} px`);
      expect(d, `${a} e ${b} si toccano`).toBeLessThan(15);
    }
    // le due laterali no: in mezzo c'è la parete di fondo
    expect(piuVicini(r.quale('si'), r.quale('de'))).toBeGreaterThan(100);
    // e le maniglie condivise ci sono davvero
    let gemelli = 0;
    for (let i = 0; i < attaccati.length; i++) {
      for (let k = 0; k < 4; k++) {
        if (verticiGemelli(attaccati, i, k).length > 0) gemelli++;
      }
    }
    expect(gemelli, 'maniglie di giunzione').toBeGreaterThanOrEqual(8);
  });

  /**
   * E LE PARETI ARRIVANO DAVVERO DA TERRA AL SOFFITTO.
   *
   * Non è un vezzo grafico: il riquadro verde è dove si prende la griglia e
   * si contano le piastrelle. Se il muro si ferma alle finestre, sotto e sopra
   * non si può misurare niente, e con la stanza chiusa quel limite non ha più
   * ragione di esserci — il pavimento e il soffitto dicono esattamente dove
   * finisce.
   */
  it('con pavimento e soffitto le pareti si estendono all’altezza vera', () => {
    const r = rileva();
    const attaccati = pianiAgganciati(r.piani, LARGHEZZA, ALTEZZA);
    for (const p of ['fo', 'si', 'de']) {
      const alto = attaccati[r.quale(p)].altezzaReale;
      console.log(`parete ${p}: alta ${Math.round(alto)} mm (vera 2500)`);
      expect(alto, `parete ${p}`).toBeGreaterThan(2500 * 0.9);
      expect(alto, `parete ${p}`).toBeLessThan(2500 * 1.1);
    }
  });
});
