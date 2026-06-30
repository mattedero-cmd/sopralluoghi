import type { Forma, Foto, Punto, QuotaTecnica, StatoMisura, TipoForma, Unita } from '../db/types';
import { haCalibrazione, misuraSegmento } from '../geometry/calibrazione';
import { formattaNumero } from '../utils/format';

type CalibFoto = Pick<Foto, 'scala' | 'piano'>;

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

const NOME_FORMA: Record<TipoForma, string> = {
  linea: 'Linea',
  rettangolo: 'Rettangolo',
  cerchio: 'Cerchio',
  poligono: 'Poligono',
  manoLibera: 'Tracciato'
};

/** unità nativa della calibrazione della foto (per le misure delle forme). */
function unitaFoto(foto: CalibFoto): Unita {
  return foto.piano?.unita ?? foto.scala?.unita ?? 'cm';
}

/**
 * Riga di riepilogo per una FORMA generica con la spunta "nel PDF"
 * (partePerimetro). Se la foto è calibrata, riporta anche le dimensioni reali
 * (lunghezza, base×altezza, ⌀, perimetro); altrimenti solo il nome.
 */
export function rigaMisuraForma(f: Forma, foto: CalibFoto): RigaTecnica | null {
  if (!f.partePerimetro) return null;
  const nome = f.etichetta ? `${NOME_FORMA[f.forma]} (${f.etichetta})` : NOME_FORMA[f.forma];
  const unita = unitaFoto(foto);
  const calibrata = haCalibrazione(foto);
  const m = (p1: Punto, p2: Punto) => misuraSegmento(p1, p2, foto, unita);
  const n = (v: number | null) => (v === null ? '?' : formattaNumero(v));
  let reale = '—';
  if (calibrata) {
    if (f.forma === 'linea' && f.punti.length >= 2) {
      const v = m(f.punti[0], f.punti[1]);
      if (v !== null) reale = `${n(v)} ${unita}`;
    } else if (f.forma === 'rettangolo' && f.punti.length >= 2) {
      const a = f.punti[0];
      const b = f.punti[1];
      const base = m(a, { x: b.x, y: a.y });
      const alt = m(a, { x: a.x, y: b.y });
      if (base !== null || alt !== null) reale = `b ${n(base)} · h ${n(alt)} ${unita}`;
    } else if (f.forma === 'cerchio' && f.punti.length >= 2) {
      const r = m(f.punti[0], f.punti[1]);
      if (r !== null) reale = `Ø ${n(r * 2)} ${unita}`;
    } else if ((f.forma === 'poligono' || f.forma === 'manoLibera') && f.punti.length >= 2) {
      const tot = f.punti.length;
      const chiuso = f.forma === 'poligono' || f.chiusa;
      const limite = chiuso ? tot : tot - 1;
      let per = 0;
      let ok = true;
      for (let i = 0; i < limite; i++) {
        const v = m(f.punti[i], f.punti[(i + 1) % tot]);
        if (v === null) {
          ok = false;
          break;
        }
        per += v;
      }
      if (ok) reale = `perim. ${formattaNumero(Math.round(per * 100) / 100)} ${unita}`;
    }
  }
  return { forma: nome, reale, stato: calibrata ? 'stimata' : 'reale' };
}
