import { describe, expect, it } from 'vitest';
import { rigaMisuraTecnica } from '../righeTecniche';
import type { QuotaTecnica } from '../../db/types';

const stile = { colore: '#1a73e8', spessore: 3, dimensioneTesto: 24 };

function base(parz: Partial<QuotaTecnica>): QuotaTecnica {
  return {
    id: 'q',
    fotoId: 'foto',
    tipo: 'quotaTecnica',
    sottotipo: 'serie',
    verso: 'sinistra',
    unita: 'cm',
    puntiOriginali: [],
    quote: [],
    partePerimetro: true,
    zIndex: 1,
    stile,
    ...parz
  };
}

describe('rigaMisuraTecnica — riepilogo PDF delle quote tecniche', () => {
  it('non trascrive le quote con partePerimetro=false', () => {
    expect(rigaMisuraTecnica(base({ partePerimetro: false, quote: [{ p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, valore: 10, orientamento: 'allineata', offset: 0 }] }))).toBeNull();
  });

  it('serie: elenca i valori dei tratti', () => {
    const r = rigaMisuraTecnica(
      base({
        sottotipo: 'serie',
        quote: [
          { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, valore: 50, orientamento: 'allineata', offset: 0 },
          { p1: { x: 1, y: 0 }, p2: { x: 2, y: 0 }, valore: 30, orientamento: 'allineata', offset: 0 }
        ]
      })
    );
    expect(r).not.toBeNull();
    expect(r!.forma).toBe('Quote in serie');
    expect(r!.reale).toBe('50 · 30 cm');
  });

  it('serie senza tratti → nessuna riga', () => {
    expect(rigaMisuraTecnica(base({ sottotipo: 'serie', quote: [] }))).toBeNull();
  });

  it('foro: ⌀ con etichetta', () => {
    const r = rigaMisuraTecnica(
      base({
        sottotipo: 'foro',
        foro: {
          centro: { x: 0, y: 0 },
          raggioPx: 10,
          raggioReale: 25,
          diametroReale: 50,
          modo: 'diametro',
          etichetta: 'A'
        }
      })
    );
    expect(r!.forma).toBe('Foro A');
    expect(r!.reale).toBe('⌀ 50 cm');
  });

  it('foro in modo raggio usa R', () => {
    const r = rigaMisuraTecnica(
      base({
        sottotipo: 'foro',
        foro: {
          centro: { x: 0, y: 0 },
          raggioPx: 10,
          raggioReale: 25,
          diametroReale: 50,
          modo: 'raggio',
          etichetta: ''
        }
      })
    );
    expect(r!.forma).toBe('Foro');
    expect(r!.reale).toBe('R 25 cm');
  });

  it('smusso e filettatura usano la designazione', () => {
    const sm = rigaMisuraTecnica(
      base({
        sottotipo: 'smusso',
        smusso: {
          a: { x: 0, y: 0 },
          b: { x: 1, y: 0 },
          catetoReale: 2,
          angoloGradi: 45,
          modo: 'C',
          designazione: 'C2'
        }
      })
    );
    expect(sm).toEqual({ forma: 'Smusso', reale: 'C2', stato: 'stimata' });

    const fil = rigaMisuraTecnica(
      base({
        sottotipo: 'filettatura',
        filettatura: {
          filettatura: 'interna',
          ancora: { x: 0, y: 0 },
          diametroNominale: 8,
          passo: 1.25,
          classeTolleranza: '6H',
          designazione: 'M8 × 1,25 - 6H'
        }
      })
    );
    expect(fil!.forma).toBe('Filettatura');
    expect(fil!.reale).toBe('M8 × 1,25 - 6H');
  });

  it('datum non genera mai una voce', () => {
    expect(
      rigaMisuraTecnica(base({ sottotipo: 'datum', etichetta: 'A', partePerimetro: true }))
    ).toBeNull();
  });

  it('stato: reale se i valori sono manuali, stimata se derivati', () => {
    const auto = rigaMisuraTecnica(
      base({ sottotipo: 'serie', valoreAuto: true, quote: [{ p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, valore: 10, orientamento: 'allineata', offset: 0 }] })
    );
    const manuale = rigaMisuraTecnica(
      base({ sottotipo: 'serie', valoreAuto: false, quote: [{ p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, valore: 10, orientamento: 'allineata', offset: 0 }] })
    );
    expect(auto!.stato).toBe('stimata');
    expect(manuale!.stato).toBe('reale');
  });
});
