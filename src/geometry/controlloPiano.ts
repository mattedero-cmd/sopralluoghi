/**
 * IL PIANO SI CONTROLLA DA SOLO, PRIMA DI FARSI GUARDARE.
 *
 * Un piano di taglio con due pezzi uno sopra l'altro è l'errore più caro che
 * questo programma possa fare: non si vede a colpo d'occhio — al disegno due
 * sagome incastrate e due sagome accavallate si somigliano — e si scopre al
 * banco, con il materiale già tagliato.
 *
 * È già successo due volte, da due cause diverse e lontane fra loro: una volta
 * dal riaccostamento dopo il nesting, una volta dalla caduta dei pezzi in fondo
 * al blocco. Tutte e due le volte le prove del motore erano verdi, perché
 * guardavano il motore e non il piano che si vede.
 *
 * Quindi qui non si prova a indovinare da dove arriva: si guarda il RISULTATO,
 * quello che finisce sotto gli occhi e sotto la lama, e si dice se fra due
 * pezzi la lama ci passa. Costa un pugno di confronti per lastra, perché prima
 * di misurare le sagome si scartano le coppie lontane guardando i rettangoli
 * d'ingombro, che è un conto da niente.
 */

import { distanzaSagome, sagomaDi } from './distanzaPoligoni';
import type { LastraNesting } from './nesting';

export interface Sovrapposizione {
  /** i due pezzi, come si chiamano nel piano */
  a: string;
  b: string;
  /** quanto passa fra le due sagome, in mm (0 = si accavallano) */
  distanza: number;
  /** dove guardare: l'angolo in alto a sinistra dei due ingombri */
  dove: string;
}

/**
 * Le coppie di pezzi fra cui la lama non passa. Vuoto = piano sano.
 *
 * `lama` è la tolleranza richiesta; si concede un centesimo di millimetro di
 * scarto, che è l'arrotondamento del piano e non un vuoto.
 */
export function sovrapposizioni(lastra: LastraNesting, lama: number): Sovrapposizione[] {
  const ps = lastra.piazzamenti;
  const fuori: Sovrapposizione[] = [];
  if (ps.length < 2 || !(lama > 0)) return fuori;

  const sagome = ps.map((p) => sagomaDi(p));
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i];
      const b = ps[j];
      // scarto rapido sugli INGOMBRI: se i rettangoli distano già una lama su
      // un asse, le sagome dentro distano almeno altrettanto e non c'è niente
      // da misurare
      if (
        a.x + a.larghezza + lama <= b.x ||
        b.x + b.larghezza + lama <= a.x ||
        a.y + a.altezza + lama <= b.y ||
        b.y + b.altezza + lama <= a.y
      ) {
        continue;
      }
      const d = distanzaSagome(sagome[i], sagome[j]);
      if (d >= lama - 0.01) continue;
      fuori.push({
        a: a.nome || 'pezzo',
        b: b.nome || 'pezzo',
        distanza: d,
        dove: `${Math.round(a.x)},${Math.round(a.y)} e ${Math.round(b.x)},${Math.round(b.y)}`
      });
    }
  }
  return fuori;
}
