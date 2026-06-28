import type { Preventivo, RegimeFiscale, VocePreventivo } from '../db/types';

/**
 * Calcolo fiscale del preventivo, dipendente dal REGIME.
 *
 * - Forfettario: nessuna IVA, nessuna ritenuta, nessuna cassa. Eventuale marca
 *   da bollo se l'importo supera la soglia. Totale = imponibile (− sconti) +
 *   bollo.
 * - Semplificato / Ordinario: imponibile (− sconti), + cassa (rivalsa) che di
 *   norma concorre alla base IVA, + IVA, − ritenuta d'acconto (sull'imponibile),
 *   + bollo (di norma solo su importi esenti/non imponibili). Netto a incassare
 *   = totale documento − ritenuta.
 */

export interface TotaliPreventivo {
  /** somma delle voci, prima degli sconti */
  lordo: number;
  /** sconto totale (voce + documento) */
  sconto: number;
  /** imponibile netto dopo gli sconti */
  imponibile: number;
  /** cassa previdenziale / rivalsa (€) */
  cassa: number;
  /** base su cui si calcola l'IVA (imponibile + eventuale cassa) */
  baseIva: number;
  /** IVA totale (€) */
  iva: number;
  /** ritenuta d'acconto (€) */
  ritenuta: number;
  /** marca da bollo (€) */
  bollo: number;
  /** totale del documento */
  totale: number;
  /** netto effettivamente da incassare (totale − ritenuta) */
  netto: number;
  /** true se il regime prevede l'IVA */
  conIva: boolean;
}

/** imponibile di una singola voce, già scontata */
export function importoVoce(v: VocePreventivo): number {
  const lordo = (v.quantita || 0) * (v.prezzoUnitario || 0);
  const sconto = (lordo * (v.scontoPercento || 0)) / 100;
  return lordo - sconto;
}

function arrotonda(v: number): number {
  return Math.round(v * 100) / 100;
}

export function calcolaTotali(p: Preventivo): TotaliPreventivo {
  const regime: RegimeFiscale = p.regime ?? 'forfettario';
  const conIva = regime !== 'forfettario';

  const lordo = p.voci.reduce((s, v) => s + (v.quantita || 0) * (v.prezzoUnitario || 0), 0);
  const dopoVoci = p.voci.reduce((s, v) => s + importoVoce(v), 0);
  const scontoDoc = (dopoVoci * (p.scontoPercento || 0)) / 100;
  const imponibile = dopoVoci - scontoDoc;
  const sconto = lordo - imponibile;

  // cassa (rivalsa) solo se attiva e regime con IVA
  const cassa = conIva && p.cassaAttiva ? (imponibile * (p.cassaPercento || 0)) / 100 : 0;

  // IVA: per voce (aliquota voce) o con l'aliquota documento; la cassa, se
  // concorre, viene ripartita proporzionalmente sull'imponibile
  let iva = 0;
  const baseIva = conIva ? imponibile + cassa : 0;
  if (conIva && imponibile > 0) {
    const fattoreScontoDoc = 1 - (p.scontoPercento || 0) / 100;
    const fattoreCassa = imponibile > 0 ? (imponibile + cassa) / imponibile : 1;
    for (const v of p.voci) {
      const baseVoce = importoVoce(v) * fattoreScontoDoc * fattoreCassa;
      const aliq = v.aliquotaIva ?? p.ivaPercento ?? 0;
      iva += (baseVoce * aliq) / 100;
    }
  }

  // ritenuta d'acconto sull'imponibile (regimi con IVA)
  const ritenuta = conIva && p.ritenutaAttiva ? (imponibile * (p.ritenutaPercento || 0)) / 100 : 0;

  const totaleSenzaBollo = imponibile + cassa + iva;
  // bollo: forfettario sopra soglia (di norma); per gli altri se attivato a mano
  const bollo = p.bolloAttiva ? p.bolloImporto || 0 : 0;

  const totale = totaleSenzaBollo + bollo;
  const netto = totale - ritenuta;

  return {
    lordo: arrotonda(lordo),
    sconto: arrotonda(sconto),
    imponibile: arrotonda(imponibile),
    cassa: arrotonda(cassa),
    baseIva: arrotonda(baseIva),
    iva: arrotonda(iva),
    ritenuta: arrotonda(ritenuta),
    bollo: arrotonda(bollo),
    totale: arrotonda(totale),
    netto: arrotonda(netto),
    conIva
  };
}

/** Etichetta leggibile del regime */
export function nomeRegime(r: RegimeFiscale): string {
  return r === 'forfettario' ? 'Forfettario' : r === 'semplificato' ? 'Semplificato' : 'Ordinario';
}
