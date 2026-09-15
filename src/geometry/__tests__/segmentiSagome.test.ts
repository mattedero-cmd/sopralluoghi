import { describe, expect, it } from 'vitest';
import { calcolaNestingAuto } from '../nestingSagome';
import { segmentaBobina } from '../segmenti';
import { coppiaPiuStretta } from '../distanzaPoligoni';
import { opzioniRicerca, parametriDi } from '../../utils/documentoNesting';
import type { PezzoNesting } from '../nesting';

/**
 * IL SEGMENTO NON DEVE ROVINARE IL PIANO.
 *
 * Il nesting produce un rotolo intero; poi il rotolo si divide in blocchi
 * maneggiabili al banco, e dentro ogni blocco i pezzi vengono fatti CADERE in
 * fondo — non cambia il taglio, cambia la forma dello sfrido, che così resta
 * un pezzo unico invece di due ritagli corti.
 *
 * Quella caduta era scritta a parte dal resto, e guardava solo se gli ingombri
 * si accavallavano in x. Sbagliava in due modi, tutti e due silenziosi:
 *
 *  - due pezzi AFFIANCATI, con gli ingombri che si sfiorano ma non si
 *    accavallano, risultavano indipendenti: uno scendeva scorrendo lungo
 *    l'altro fino a incollarglisi, e lì la lama non passa;
 *  - con le SAGOME l'ingombro non è la sagoma: due trapezi incastrati
 *    testa-coda hanno gli ingombri completamente accavallati, e venivano
 *    scaricati in fondo uno addosso all'altro.
 *
 * Il nesting era sano e il piano arrivava rotto lo stesso — e si vedeva solo
 * guardando il disegno. Queste prove guardano il piano DOPO la divisione in
 * segmenti, che è quello che si porta al banco.
 */

const P = (id: string, nome: string, l: number, a: number, q: number, t: number, extra = {}) =>
  ({
    id,
    nome,
    larghezza: l,
    altezza: a,
    quantita: q,
    ruotabile: true,
    tinta: t,
    ...extra
  }) as unknown as PezzoNesting;

/** il materiale come lo costruisce l'app, così la strada è quella vera */
function materiale(pezzi: PezzoNesting[], larghezza: number, metri: number, lama: number) {
  return {
    id: 'm',
    nome: 'M',
    modo: 'bobina' as const,
    lastra: { larghezza: 2500, altezza: 1250 },
    bobina: { larghezza, metri },
    venatura: 'nessuna' as const,
    lama,
    abbondanza: 0,
    margine: 10,
    orientamenti: {},
    pezzi
  };
}

/** la coppia più stretta di TUTTI i segmenti di TUTTI i rotoli */
function piuStrettaNeiSegmenti(
  pezzi: PezzoNesting[],
  larghezza: number,
  metri: number,
  lama: number,
  blocco: number
) {
  const m = materiale(pezzi, larghezza, metri, lama);
  const esito = calcolaNestingAuto(parametriDi(m), pezzi, opzioniRicerca(m));
  let minima = Infinity;
  let chi = '';
  let contati = 0;
  for (const rotolo of esito.lastre.filter((l) => l.piazzamenti.length > 0)) {
    const segmenti = segmentaBobina(rotolo, blocco, m.margine, larghezza, lama);
    // nessun pezzo deve sparire per strada
    const dentro = segmenti.reduce((s, g) => s + g.lastra.piazzamenti.length, 0);
    expect(dentro, 'pezzi persi nella divisione in segmenti').toBe(rotolo.piazzamenti.length);
    for (const g of segmenti) {
      contati += g.lastra.piazzamenti.length;
      const d = coppiaPiuStretta({ lastre: [g.lastra] });
      if (d.minima < minima) {
        minima = d.minima;
        chi = d.chi;
      }
    }
  }
  return { minima, chi, contati, cella: (esito as { cella?: number }).cella };
}

describe('i pezzi che cadono in fondo al segmento', () => {
  it('due trapezi non finiscono uno dentro l’altro in fondo al blocco', () => {
    // caso vero, pescato provando: con la caduta a ingombri questi due trapezi
    // da 1460 × 250 escono dal segmento a distanza ZERO, cioè sovrapposti
    const pezzi = [
      P('p0', 'P0', 500, 600, 1, 0, { forma: 'trapezioR', misura3: 351 }),
      P('p1', 'P1', 500, 250, 1, 1),
      P('p2', 'P2', 500, 1610, 2, 2, { forma: 'trapezioR', misura3: 737 }),
      P('p3', 'P3', 1460, 250, 3, 3, { forma: 'trapezioR', misura3: 123 }),
      P('p4', 'P4', 1480, 600, 3, 4, { forma: 'cerchio' }),
      P('p5', 'P5', 1460, 900, 3, 5, { forma: 'trapezio', misura3: 1130 }),
      P('p6', 'P6', 1460, 900, 4, 6, { forma: 'trapezioR', misura3: 746 })
    ];
    const r = piuStrettaNeiSegmenti(pezzi, 1520, 12, 3, 4000);
    expect(r.contati, 'la prova non misura niente').toBeGreaterThan(10);
    expect(r.minima, r.chi).toBeGreaterThanOrEqual(3 - 0.01);
  }, 120000);

  it('un cerchio che scende non si incolla al cerchio di fianco', () => {
    // stesso difetto, altra faccia: due tondi affiancati con gli ingombri che
    // si sfiorano venivano dichiarati indipendenti, e uno scendeva strisciando
    // lungo l'altro fino a un millimetro — con la lama da due
    const pezzi = [
      P('p0', 'P0', 1160, 600, 1, 0, { forma: 'trapezioR', misura3: 525 }),
      P('p1', 'P1', 1180, 900, 1, 1, { forma: 'trapezio', misura3: 951 }),
      P('p2', 'P2', 1180, 600, 4, 2, { forma: 'trapezioR', misura3: 523, ruotabile: false }),
      P('p3', 'P3', 700, 1260, 4, 3, { forma: 'triangolo' }),
      P('p4', 'P4', 500, 1260, 4, 4, { forma: 'cerchio', ruotabile: false })
    ];
    const r = piuStrettaNeiSegmenti(pezzi, 1220, 12, 2, 3000);
    expect(r.contati).toBeGreaterThan(10);
    expect(r.minima, r.chi).toBeGreaterThanOrEqual(2 - 0.01);
  }, 120000);

  it('su duecento lavori a caso la lama passa sempre, anche dopo i segmenti', () => {
    let seme = 2024;
    const caso = () => ((seme = (seme * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const scegli = <T>(v: T[]): T => v[Math.floor(caso() * v.length)];
    const forme = [undefined, 'cerchio', 'triangolo', 'rombo', 'trapezio', 'trapezioR', 'trapezioR'];

    let provati = 0;
    for (let giro = 0; giro < 200; giro++) {
      const largo = scegli([900, 1220, 1520]);
      const lama = scegli([2, 3, 5]);
      const pezzi = Array.from({ length: 3 + Math.floor(caso() * 5) }, (_, i) => {
        const f = scegli(forme);
        const l = scegli([300, 500, 700, largo - 60, largo - 40]);
        const a = scegli([250, 600, 900, 1260, 1610]);
        const m3 =
          f === 'trapezioR'
            ? Math.round(a * (0.2 + caso() * 0.7))
            : f === 'trapezio'
              ? Math.round(l * (0.2 + caso() * 0.7))
              : undefined;
        return P(`p${i}`, `P${i}`, l, a, 1 + Math.floor(caso() * 4), i, {
          ruotabile: caso() < 0.9,
          ...(f ? { forma: f } : {}),
          ...(m3 ? { misura3: m3 } : {})
        });
      });
      if (!pezzi.some((p) => (p as { forma?: string }).forma)) continue;
      provati++;
      const r = piuStrettaNeiSegmenti(
        pezzi,
        largo,
        scegli([12, 25]),
        lama,
        scegli([2000, 3000, 4000])
      );
      expect(r.minima, `giro ${giro}: ${r.chi}`).toBeGreaterThanOrEqual(lama - 0.01);
    }
    expect(provati, 'quasi nessun lavoro aveva una sagoma').toBeGreaterThan(150);
  }, 900000);
});
