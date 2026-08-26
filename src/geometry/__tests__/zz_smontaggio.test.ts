import { describe, expect, it } from 'vitest';
import { formaQuadrilatera, pannelliDellaForma } from '../formaQuadrilatera';
import { primitivePannelli } from '../primitive';
import { applicaOmografia, calcolaOmografia } from '../omografia';
import { giuntiAutomatici } from '../pannelli';
import type { Annotazione, QuotaPoligono } from '../../db/types';

const base = { id: 'x', fotoId: 'f', zIndex: 0, stile: { colore: '#fff', spessore: 4, dimensioneTesto: 16 } };

// parete 500x230 con 5 cm di abbondanza per parte, disegnata frontale
// su 1000x460 px => 1 cm = 2 px
function parete(giunti: number[]): Annotazione {
  return {
    ...base,
    tipo: 'quotaPoligono',
    punti: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 460 },
      { x: 0, y: 460 }
    ],
    segmenti: [
      { da: 0, a: 1, valore: 500, abbInizio: 5, abbFine: 5 },
      { da: 1, a: 2, valore: 230, abbInizio: 5, abbFine: 5 },
      { da: 2, a: 3, valore: 500, abbInizio: 5, abbFine: 5 },
      { da: 3, a: 0, valore: 230, abbInizio: 5, abbFine: 5 }
    ],
    unita: 'cm',
    stato: 'reale',
    pannelli: { asse: 'verticale', sormonto: 2, verso: 'centro', giunti }
  } as unknown as Annotazione;
}

/** replica ESATTA di AmbientePannelli: forma passata da EditorFoto:4919-4927 */
function ambienteX(g: number, forma: ReturnType<typeof formaQuadrilatera>) {
  const F = forma!;
  const L = F.taglio.larghezza;   // EditorFoto passa il TAGLIO
  const A = F.taglio.altezza;
  const netta = F.netta;          // ...ma anche il netto
  const scostoDi = (t: number, n: number, d?: number) => Math.max(0, d ?? (t - n) / 2);
  const scostoL = scostoDi(L, netta.larghezza, F.scostamento.larghezza);
  const scostoLungo = scostoL; // asse verticale
  const reali = [
    { x: 0, y: 0 },
    { x: netta.larghezza, y: 0 },
    { x: netta.larghezza, y: netta.altezza },
    { x: 0, y: netta.altezza }
  ];
  const H = calcolaOmografia(reali, F.quad);
  return applicaOmografia(H, { x: g - scostoLungo, y: 0 }).x;
}

describe('smontaggio: ambiente vs foto', () => {
  it('i giunti automatici dello scenario', () => {
    const g = giuntiAutomatici(510, { massimo: 137, modo: 'fascia', numero: null, sormonto: 2, verso: 'centro' });
    console.log('giunti', g);
    expect(g.length).toBeGreaterThan(0);
  });

  it('ambiente e foto disegnano la giunzione NELLO STESSO PUNTO', () => {
    const giunti = giuntiAutomatici(510, { massimo: 137, modo: 'fascia', numero: null, sormonto: 2, verso: 'centro' });
    const ann = parete(giunti);
    const forma = formaQuadrilatera(ann);
    const dati = pannelliDellaForma(ann);
    console.log('taglio', forma!.taglio, 'netta', forma!.netta, 'scost', forma!.scostamento, 'scostDati', dati!.scostamento);

    const prim = primitivePannelli(ann as QuotaPoligono);
    const continue_ = prim
      .filter((p): p is Extract<typeof p, { kind: 'linea' }> => p.kind === 'linea' && !p.tratteggio)
      .map((l) => l.punti[0])
      .sort((a, b) => a - b);

    const daAmbiente = dati!.giunti.map((g) => ambienteX(g, forma)).sort((a, b) => a - b);
    console.log('foto px  ', continue_);
    console.log('ambiente ', daAmbiente);
    console.log('foto cm  ', continue_.map((x) => x / 2));
    console.log('ambiente cm', daAmbiente.map((x) => x / 2));
    // la tesi del revisore: ambiente = g*500/510 (senza scostamento)
    console.log('tesi revisore cm', dati!.giunti.map((g) => (g * 500) / 510));

    daAmbiente.forEach((x, i) => expect(x).toBeCloseTo(continue_[i], 6));
  });

  it('trascinando a 100 cm dal bordo del muro, ambiente scrive 105 e la foto ridisegna a 100', () => {
    const ann = parete([136]);
    const forma = formaQuadrilatera(ann)!;
    const netta = forma.netta;
    const reali = [
      { x: 0, y: 0 },
      { x: netta.larghezza, y: 0 },
      { x: netta.larghezza, y: netta.altezza },
      { x: 0, y: netta.altezza }
    ];
    const versoReale = calcolaOmografia(forma.quad, reali);
    const scosto = forma.scostamento.larghezza;
    // dito a 100 cm dal bordo netto = 200 px sulla foto
    const posizioneDa = applicaOmografia(versoReale, { x: 200, y: 10 }).x + scosto;
    console.log('posizione di taglio scritta:', posizioneDa);
    expect(posizioneDa).toBeCloseTo(105, 6);
    // e ridisegnata sulla foto torna esattamente a 200 px = 100 cm
    const ann2 = parete([posizioneDa]);
    const x = primitivePannelli(ann2 as QuotaPoligono)
      .filter((p): p is Extract<typeof p, { kind: 'linea' }> => p.kind === 'linea' && !p.tratteggio)[0].punti[0];
    console.log('ridisegnata a px', x, '=', x / 2, 'cm');
    expect(x).toBeCloseTo(200, 6);
  });
});
