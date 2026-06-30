import type { QuotaTecnica, StatoMisura } from '../db/types';
import { formattaNumero } from '../utils/format';

/**
 * Riga del riepilogo PDF per una quota tecnica (§9). Forma e misura testuali,
 * coerenti con le altre voci della tabella misure. Non è un "pezzo": le quote
 * tecniche non entrano nella distinta di taglio.
 */
export interface RigaTecnica {
  forma: string;
  reale: string;
  stato: StatoMisura;
}

const NOME_CATENA: Record<'serie' | 'parallelo' | 'progressiva', string> = {
  serie: 'Quote in serie',
  parallelo: 'Quote in parallelo',
  progressiva: 'Quote progressive'
};

/**
 * Riga di riepilogo per una quota tecnica STRUTTURATA. Nel riepilogo entrano
 * solo le quote con `partePerimetro = true`; le altre restano sulla foto.
 * Il datum è un riferimento e non genera mai una voce.
 */
export function rigaMisuraTecnica(a: QuotaTecnica): RigaTecnica | null {
  if (!a.partePerimetro) return null;
  const f = (v: number | null) => (v === null ? '?' : formattaNumero(v));
  const stato: StatoMisura = a.valoreAuto === false ? 'reale' : 'stimata';
  switch (a.sottotipo) {
    case 'serie':
    case 'parallelo':
    case 'progressiva': {
      if (a.quote.length === 0) return null;
      const valori = a.quote.map((q) => f(q.valore)).join(' · ');
      return { forma: NOME_CATENA[a.sottotipo], reale: `${valori} ${a.unita}`, stato };
    }
    case 'foro': {
      if (!a.foro) return null;
      const val = a.foro.modo === 'diametro' ? a.foro.diametroReale : a.foro.raggioReale;
      // 'Ø' (U+00D8) e non '⌀' (U+2300): solo il primo è nel font del PDF (Roboto)
      const pre = a.foro.modo === 'diametro' ? 'Ø' : 'R';
      const nome = a.foro.etichetta ? `Foro ${a.foro.etichetta}` : 'Foro';
      return { forma: nome, reale: `${pre} ${f(val)} ${a.unita}`, stato };
    }
    case 'smusso':
      return a.smusso ? { forma: 'Smusso', reale: a.smusso.designazione, stato } : null;
    case 'filettatura':
      return a.filettatura ? { forma: 'Filettatura', reale: a.filettatura.designazione, stato } : null;
    case 'datum':
      return null; // riferimento, non una misura
  }
}
