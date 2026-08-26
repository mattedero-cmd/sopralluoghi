import { describe, it, expect } from 'vitest';
import { giuntiAutomatici, pannelliDi, numeroMinimo, type AbbondanzeTelo, type VersoSormonto } from '../pannelli';

const AB0: AbbondanzeTelo = { inizio: 0, fine: 0, trasversaleInizio: 0, trasversaleFine: 0 };
const AB5: AbbondanzeTelo = { inizio: 5, fine: 5, trasversaleInizio: 0, trasversaleFine: 0 };

function larghezze(totale: number, giunti: number[], sormonto: number, verso: VersoSormonto, ab: AbbondanzeTelo) {
  return pannelliDi(totale, 240, { asse: 'verticale', sormonto, verso, giunti }, ab).map((p) => p.larghezza);
}

describe('probe', () => {
  it('senza abbondanze: totale 510', () => {
    const g = giuntiAutomatici(510, { massimo: 137, modo: 'fascia', numero: null, sormonto: 2, verso: 'centro', abbondanze: AB0 });
    console.log('n minimo', numeroMinimo(510, 137, 2, AB0));
    console.log('giunti centro', g);
    for (const v of ['centro', 'indietro', 'avanti'] as VersoSormonto[]) {
      console.log('  verso', v, larghezze(510, g, 2, v, AB0));
    }
    // dopo ridistribuzione col verso nuovo
    for (const v of ['indietro', 'avanti'] as VersoSormonto[]) {
      const g2 = giuntiAutomatici(510, { massimo: 137, modo: 'fascia', numero: null, sormonto: 2, verso: v, abbondanze: AB0 });
      console.log('  RIDIST verso', v, g2, larghezze(510, g2, 2, v, AB0));
    }
  });

  it('come nel componente: vetro 500 + abbondanze 5/5', () => {
    const g = giuntiAutomatici(500, { massimo: 137, modo: 'fascia', numero: null, sormonto: 2, verso: 'centro', abbondanze: AB5 });
    console.log('n minimo', numeroMinimo(500, 137, 2, AB5));
    console.log('giunti centro', g);
    for (const v of ['centro', 'indietro', 'avanti'] as VersoSormonto[]) {
      console.log('  verso', v, larghezze(500, g, 2, v, AB5));
    }
    for (const v of ['indietro', 'avanti'] as VersoSormonto[]) {
      const g2 = giuntiAutomatici(500, { massimo: 137, modo: 'fascia', numero: null, sormonto: 2, verso: v, abbondanze: AB5 });
      console.log('  RIDIST verso', v, g2, larghezze(500, g2, 2, v, AB5));
    }
  });

  it('mm reali: vetro 5000 mm, bobina 1370, sormonto 20, abbondanze 50', () => {
    const AB: AbbondanzeTelo = { inizio: 50, fine: 50, trasversaleInizio: 50, trasversaleFine: 50 };
    const g = giuntiAutomatici(5000, { massimo: 1370, modo: 'fascia', numero: null, sormonto: 20, verso: 'centro', abbondanze: AB });
    console.log('giunti centro', g);
    for (const v of ['centro', 'indietro', 'avanti'] as VersoSormonto[]) {
      console.log('  verso', v, larghezze(5000, g, 20, v, AB));
    }
  });
});
