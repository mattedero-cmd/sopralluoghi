/**
 * SIGLE DEI PEZZI DELLE PORTE.
 *
 * Chi taglia alla fresa scrive sul pezzo una sigla corta, non il nome:
 *
 *   PA - E - MDX - CF
 *   │    │   │     └ tipo: CF coprifilo, S stipite (S1, S2… se in più strisce), IM imbotte
 *   │    │   └ posizione: T traverso, MDX / MSX montante destro / sinistro,
 *   │    │                A anta (ASX / ADX con due ante)
 *   │    └ lato: E esterno, I interno
 *   └ porta: PA porta A, PB porta B…
 *
 * La legenda va nelle istruzioni di montaggio e nel piano di taglio.
 */

import type { Porta, RigaPorta } from '../db/types';

/** Sigla senza la porta, ricavata dal nome (porte salvate prima delle sigle). */
export function siglaDaNome(nome: string): string {
  const lato = /estern/i.test(nome) ? 'E' : /intern/i.test(nome) ? 'I' : '';
  if (/^Anta/i.test(nome)) {
    const anta = /sinistra/i.test(nome) ? 'ASX' : /destra/i.test(nome) ? 'ADX' : 'A';
    return [lato, anta].filter(Boolean).join('-');
  }
  const posizione = /^Traverso/i.test(nome)
    ? 'T'
    : /^Montante DX/i.test(nome)
      ? 'MDX'
      : /^Montante SX/i.test(nome)
        ? 'MSX'
        : '';
  const tipo = /Coprifilo/i.test(nome) ? 'CF' : /Imbotte/i.test(nome) ? 'IM' : /Stipite/i.test(nome) ? 'S' : '';
  const striscia = /Striscia (\d+)/i.exec(nome)?.[1] ?? '';
  return [lato, posizione, tipo + (tipo === 'S' ? striscia : '')].filter(Boolean).join('-');
}

/** Sigla completa del pezzo: «PA-E-MDX-CF». */
export function siglaPezzo(porta: Pick<Porta, 'lettera'>, riga: Pick<RigaPorta, 'nome' | 'sigla'>): string {
  return `P${porta.lettera}-${riga.sigla || siglaDaNome(riga.nome)}`;
}

/** Le voci della legenda, nell'ordine in cui si legge la sigla. */
export const LEGENDA_SIGLE: Array<[string, string]> = [
  ['PA, PB…', 'Porta A, porta B…'],
  ['E / I', 'Lato esterno / lato interno'],
  ['T', 'Traverso'],
  ['MDX / MSX', 'Montante destro / montante sinistro'],
  ['A', 'Anta (ASX / ADX: anta sinistra / destra, con due ante)'],
  ['CF', 'Coprifilo'],
  ['S', 'Stipite (S1, S2: strisce dello stipite sullo stesso lato)'],
  ['IM', 'Imbotte']
];
