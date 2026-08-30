import { describe, expect, it } from 'vitest';
import {
  catenaDiScatti,
  disposizione,
  disposizioneDallaRete,
  reteDiScatti
} from '../panoramica';
import { applicaOmografia, invertiOmografia, type Omografia } from '../omografia';
import { H, W, mul, passeggiata, type M3 } from './scenaPasseggiata';

/** quanto due omografie dicono cose diverse, in pixel di fotogramma */
function scarto(A: Omografia, B: Omografia) {
  let peggio = 0;
  let somma = 0;
  let n = 0;
  for (let y = 0; y <= H; y += H / 4)
    for (let x = 0; x <= W; x += W / 4) {
      const a = applicaOmografia(A, { x, y });
      const b = applicaOmografia(B, { x, y });
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      somma += d;
      peggio = Math.max(peggio, d);
      n++;
    }
  return { medio: somma / n, peggio };
}

/**
 * QUANTO SI ALLONTANA DAL VERO l'ultimo scatto della fila.
 *
 * Si confronta la tela ricavata con quella vera. Le due possono differire per
 * una trasformazione d'insieme (la tela sceglie il suo riferimento e la sua
 * scala): si toglie di mezzo ancorandosi allo scatto di riferimento, e quello
 * che resta è deriva vera.
 */
function derivaDellaFila(n: number, passo?: number, rete = false) {
  const { veri, immagini } = passeggiata(n, passo);
  const scatti = immagini.map(() => ({ larghezza: W, altezza: H }));
  let disp;
  let legamiTrovati = n - 1;
  if (rete) {
    const r = reteDiScatti(immagini, 3);
    if (r.rotturaA !== null) return { rotto: r.rotturaA, peggio: Infinity, medio: Infinity, legami: 0 };
    legamiTrovati = r.legami.length;
    disp = disposizioneDallaRete(scatti, r, 100000);
  } else {
    const catena = catenaDiScatti(immagini);
    if (catena.rotturaA !== null)
      return { rotto: catena.rotturaA, peggio: Infinity, medio: Infinity, legami: 0 };
    disp = disposizione(scatti, catena.legami, 100000);
  }
  if (!disp) return { rotto: -1, peggio: Infinity, medio: Infinity, legami: legamiTrovati };
  const rif = Math.floor((n - 1) / 2);
  // il vero, riportato allo stesso riferimento della tela. `veri[i]` porta il
  // PIANO sui pixel dello scatto i: da scatto a scatto si passa per il piano,
  // cioè veri[rif] · veri[i]⁻¹, e poi la tela ci mette il suo riferimento.
  const T = mul(disp.verso[rif] as M3, veri[rif] as M3) as Omografia;
  let peggio = 0;
  let medio = 0;
  for (let i = 0; i < n; i++) {
    const atteso = mul(T as M3, invertiOmografia(veri[i])! as M3) as Omografia;
    const s = scarto(disp.verso[i], atteso);
    peggio = Math.max(peggio, s.peggio);
    medio += s.medio / n;
  }
  return { rotto: null as number | null, peggio, medio, legami: legamiTrovati };
}

describe('una fila lunga di scatti', () => {
  it('sedici scatti si agganciano tutti, e la rete trova i suoi controventi', () => {
    const { immagini } = passeggiata(16, 640);
    const rete = reteDiScatti(immagini);
    expect(rete.rotturaA, 'nessuno scatto resta staccato').toBeNull();
    // almeno la catena; con sovrapposizione larga anche qualche controvento
    expect(rete.legami.length).toBeGreaterThanOrEqual(15);
    console.log(`16 scatti → ${rete.legami.length} legami`);
  }, 300000);

  /**
   * LA SOVRAPPOSIZIONE È LA LEVA, e questa prova la inchioda.
   *
   * Non è una raffinatezza del conto: con la stessa identica catena, passare
   * da metà a due terzi di sovrapposizione taglia la deriva di quattro volte.
   * È il motivo per cui l'app adesso la misura appena scattato, invece di
   * scoprirlo a cucitura finita.
   */
  it('sovrapporsi di più vale più di qualunque raffinamento', () => {
    const stretta = derivaDellaFila(12, 1150, true);
    const larga = derivaDellaFila(12, 850, true);
    console.log(
      `12 scatti: sovrapposti a metà ${stretta.peggio.toFixed(1)} px, ` +
        `a due terzi ${larga.peggio.toFixed(1)} px`
    );
    expect(larga.peggio).toBeLessThan(stretta.peggio / 2);
    expect(larga.peggio).toBeLessThan(25);
  }, 300000);

  it('la rete non fa mai peggio della catena', () => {
    for (const [n, passo] of [
      [12, 850],
      [16, 480]
    ] as Array<[number, number]>) {
      const c = derivaDellaFila(n, passo, false);
      const r = derivaDellaFila(n, passo, true);
      console.log(
        `${n} scatti, passo ${passo}: catena ${c.peggio.toFixed(1)} px → rete ${r.peggio.toFixed(1)} px`
      );
      // mai peggio, a meno del rumore di misura
      expect(r.peggio).toBeLessThanOrEqual(c.peggio + 0.5);
    }
  }, 900000);
});
