/**
 * I MATERIALI DI UNA PORTA, PEZZO PER PEZZO.
 *
 * Una porta ha un materiale (`materialeId`) e, se serve, colori diversi:
 * maestà e anta, e con il rilievo che divide lo stipite sulla battuta
 * (`latiDiversi`) anche lato esterno e lato interno. Ogni pezzo sa se è
 * dell'anta e da che lato sta (la sigla comincia con E o I): da qui il suo
 * materiale. Un posto senza materiale prende quello della porta.
 */

import type { ID, Porta, PostoMateriale, PresetProgetto, RigaPorta } from '../db/types';
import { materialeDelPreset } from './preset';
import { siglaDaNome } from './sigle';

/** lato del pezzo: dalla sigla (E-…, I-…) */
export function latoRiga(r: Pick<RigaPorta, 'nome' | 'sigla'>): 'E' | 'I' {
  return (r.sigla || siglaDaNome(r.nome)).startsWith('I') ? 'I' : 'E';
}

/** il posto del pezzo: senza lati diversi conta solo maestà o anta */
export function postoRiga(p: Pick<Porta, 'latiDiversi'>, r: RigaPorta): PostoMateriale {
  const lato = p.latiDiversi ? latoRiga(r) : 'E';
  return `${r.anta ? 'anta' : 'maesta'}${lato}` as PostoMateriale;
}

/** il materiale di un posto, se c'è nel preset ('' = nessuno) */
export function materialePosto(
  p: Pick<Porta, 'materialeId' | 'materiali'>,
  posto: PostoMateriale,
  preset: PresetProgetto | undefined
): ID | '' {
  const proprio = p.materiali?.[posto];
  if (proprio && materialeDelPreset(preset, proprio)) return proprio;
  return materialeDelPreset(preset, p.materialeId) ? p.materialeId! : '';
}

/** il materiale di un pezzo ('' = nessuno) */
export function materialeRiga(p: Porta, r: RigaPorta, preset: PresetProgetto | undefined): ID | '' {
  return materialePosto(p, postoRiga(p, r), preset);
}

/** i posti che la porta mostra: maestà e anta, o tutti e quattro */
export function postiPorta(p: Pick<Porta, 'latiDiversi'>): Array<[PostoMateriale, string]> {
  return p.latiDiversi
    ? [
        ['maestaE', 'Maestà esterna'],
        ['maestaI', 'Maestà interna'],
        ['antaE', 'Anta esterna'],
        ['antaI', 'Anta interna']
      ]
    : [
        ['maestaE', 'Maestà'],
        ['antaE', 'Anta']
      ];
}

/** i materiali usati dalla porta, nell'ordine dei posti (senza ripetizioni) */
export function materialiUsati(p: Porta, preset: PresetProgetto | undefined): ID[] {
  const usati = new Set<ID>();
  for (const r of p.righe) {
    const m = materialeRiga(p, r, preset);
    if (m) usati.add(m);
  }
  return [...usati];
}

/** «Solare» o «Solare / Acidato»: i nomi dei materiali della porta */
export function nomeMaterialiPorta(p: Porta, preset: PresetProgetto | undefined): string {
  return materialiUsati(p, preset)
    .map((id) => materialeDelPreset(preset, id)?.nome ?? '')
    .filter(Boolean)
    .join(' / ');
}

/** la porta ha materiali diversi fra i suoi posti */
export function haColoriDiversi(p: Porta): boolean {
  return Object.values(p.materiali ?? {}).some((id) => id && id !== p.materialeId);
}
