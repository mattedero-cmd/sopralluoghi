import { describe, expect, it } from 'vitest';
import { rigaMisuraForma, rigaMisuraTecnica } from '../righeTecniche';
import type { Forma, QuotaTecnica } from '../../db/types';

const stile = { colore: '#00A896', spessore: 3, dimensioneTesto: 24 };
const fotoScala = { scala: { px: 100, reale: 50, unita: 'cm' as const }, piano: null };

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

  it('serie con "Mostra totale": il totale entra nella riga', () => {
    const r = rigaMisuraTecnica(
      base({
        sottotipo: 'serie',
        mostraTotale: true,
        quote: [
          { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, valore: 50, orientamento: 'allineata', offset: 0 },
          { p1: { x: 1, y: 0 }, p2: { x: 2, y: 0 }, valore: 30, orientamento: 'allineata', offset: 0 }
        ]
      })
    );
    expect(r!.reale).toBe('50 · 30 — Tot. 80 cm');
  });

  it('serie con totale e misura mancante → "Tot. ?"', () => {
    const r = rigaMisuraTecnica(
      base({
        sottotipo: 'serie',
        mostraTotale: true,
        quote: [
          { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, valore: 50, orientamento: 'allineata', offset: 0 },
          { p1: { x: 1, y: 0 }, p2: { x: 2, y: 0 }, valore: null, orientamento: 'allineata', offset: 0 }
        ]
      })
    );
    expect(r!.reale).toBe('50 · ? — Tot. ? cm');
  });

  it('parallelo: il totale NON si applica (solo serie)', () => {
    const r = rigaMisuraTecnica(
      base({
        sottotipo: 'parallelo',
        mostraTotale: true,
        quote: [
          { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, valore: 50, orientamento: 'allineata', offset: 0 }
        ]
      })
    );
    expect(r!.reale).toBe('50 cm');
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
    expect(r!.reale).toBe('Ø 50 cm'); // Ø (U+00D8), reso correttamente dal font del PDF
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

function forma(parz: Partial<Forma>): Forma {
  return {
    id: 'f',
    fotoId: 'foto',
    tipo: 'forma',
    forma: 'linea',
    punti: [],
    chiusa: false,
    partePerimetro: true,
    zIndex: 1,
    stile,
    ...parz
  };
}

describe('rigaMisuraForma — forme nel riepilogo PDF', () => {
  it('non trascrive le forme senza la spunta nel PDF', () => {
    expect(
      rigaMisuraForma(forma({ partePerimetro: false, punti: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }), fotoScala)
    ).toBeNull();
  });

  it('linea: nome + lunghezza reale', () => {
    const r = rigaMisuraForma(forma({ forma: 'linea', punti: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }), fotoScala);
    expect(r!.forma).toBe('Linea');
    expect(r!.reale).toBe('50 cm'); // 100 px → 50 cm
  });

  it('rettangolo: base × altezza', () => {
    const r = rigaMisuraForma(
      forma({ forma: 'rettangolo', chiusa: true, punti: [{ x: 0, y: 0 }, { x: 100, y: 60 }] }),
      fotoScala
    );
    expect(r!.forma).toBe('Rettangolo');
    expect(r!.reale).toBe('b 50 · h 30 cm');
  });

  it('cerchio: Ø (renderizzabile nel PDF)', () => {
    const r = rigaMisuraForma(
      forma({ forma: 'cerchio', chiusa: true, punti: [{ x: 0, y: 0 }, { x: 0, y: 100 }] }),
      fotoScala
    );
    expect(r!.reale).toBe('Ø 100 cm'); // raggio 100px=50cm → ⌀ 100cm
  });

  it('senza calibrazione: solo il nome, misura —', () => {
    const r = rigaMisuraForma(forma({ forma: 'linea', punti: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }), {
      scala: null,
      piano: null
    });
    expect(r!.forma).toBe('Linea');
    expect(r!.reale).toBe('—');
    expect(r!.stato).toBe('reale');
  });

  it('usa l’etichetta nel nome se presente', () => {
    const r = rigaMisuraForma(
      forma({ forma: 'linea', etichetta: 'asse', punti: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }),
      fotoScala
    );
    expect(r!.forma).toBe('Linea (asse)');
  });
});
