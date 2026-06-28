import { describe, expect, it } from 'vitest';
import type { Preventivo, RegimeFiscale, VocePreventivo } from '../../db/types';
import { calcolaTotali } from '../calcolo';

function voce(prezzo: number, qta: number, extra: Partial<VocePreventivo> = {}): VocePreventivo {
  return { id: Math.random().toString(36), descrizione: 'x', quantita: qta, unita: 'pz', prezzoUnitario: prezzo, ...extra };
}

function prev(regime: RegimeFiscale, voci: VocePreventivo[], extra: Partial<Preventivo> = {}): Preventivo {
  return {
    id: 'p',
    progettoId: null,
    clienteId: null,
    numero: '2026-001',
    data: 0,
    stato: 'bozza',
    regime,
    voci,
    scontoPercento: 0,
    ivaPercento: 22,
    note: '',
    creatoIl: 0,
    modificatoIl: 0,
    ...extra
  };
}

describe('calcolo fiscale del preventivo', () => {
  it('forfettario: niente IVA/ritenuta/cassa, eventuale bollo', () => {
    const t = calcolaTotali(prev('forfettario', [voce(100, 1), voce(50, 2)], { bolloAttiva: true, bolloImporto: 2 }));
    expect(t.conIva).toBe(false);
    expect(t.imponibile).toBe(200);
    expect(t.iva).toBe(0);
    expect(t.ritenuta).toBe(0);
    expect(t.cassa).toBe(0);
    expect(t.bollo).toBe(2);
    expect(t.totale).toBe(202);
    expect(t.netto).toBe(202);
  });

  it('semplificato con IVA 22%', () => {
    const t = calcolaTotali(prev('semplificato', [voce(100, 1), voce(100, 1)]));
    expect(t.conIva).toBe(true);
    expect(t.imponibile).toBe(200);
    expect(t.iva).toBe(44);
    expect(t.totale).toBe(244);
    expect(t.netto).toBe(244);
  });

  it('semplificato con cassa 4% e ritenuta 20%', () => {
    const t = calcolaTotali(
      prev('semplificato', [voce(100, 1), voce(100, 1)], {
        cassaAttiva: true,
        cassaPercento: 4,
        ritenutaAttiva: true,
        ritenutaPercento: 20
      })
    );
    expect(t.cassa).toBe(8);
    expect(t.baseIva).toBe(208);
    expect(t.iva).toBe(45.76);
    expect(t.ritenuta).toBe(40);
    expect(t.totale).toBe(253.76);
    expect(t.netto).toBe(213.76);
  });

  it('ordinario con aliquote IVA per voce', () => {
    const t = calcolaTotali(
      prev('ordinario', [voce(100, 1, { aliquotaIva: 22 }), voce(100, 1, { aliquotaIva: 10 })])
    );
    expect(t.imponibile).toBe(200);
    expect(t.iva).toBe(32);
    expect(t.totale).toBe(232);
  });

  it('sconto documento e sconto voce', () => {
    // voce 100 con sconto voce 10% → 90; sconto doc 10% → 81 imponibile
    const t = calcolaTotali(prev('forfettario', [voce(100, 1, { scontoPercento: 10 })], { scontoPercento: 10 }));
    expect(t.imponibile).toBe(81);
    expect(t.sconto).toBe(19);
  });
});
