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

/**
 * LA PARTITA DOPPIA DEL PIANO.
 *
 * Il controllo qui sopra guarda la GEOMETRIA: prende le sagome a due a due e
 * misura se fra loro ci passa la lama. È un conto giusto, ma è un conto solo —
 * e un conto solo, quando sbaglia, sbaglia in silenzio. Serve un secondo
 * libro, tenuto in un modo completamente diverso, che alla fine deve tornare
 * con il primo.
 *
 * Il secondo libro è l'ARITMETICA, e non sa niente di poligoni: la somma delle
 * aree dei pezzi appoggiati su un foglio non può superare l'area del foglio.
 * Se la supera, da qualche parte c'è del materiale contato due volte — cioè
 * due pezzi nello stesso posto — e non c'è disegno, tolleranza o forma strana
 * che possa giustificarlo. Una resa del 121% non è un piano stretto: è un
 * piano impossibile.
 *
 * Le due prove si coprono a vicenda. La geometria vede due pezzi che si
 * sfiorano di un millimetro, dove l'aritmetica non si accorge di niente.
 * L'aritmetica vede tre pezzi impilati nello stesso punto anche se il conto
 * delle distanze avesse un difetto proprio lì. Perché il piano passi devono
 * tornare tutte e due.
 */
export function resaImpossibile(
  lastra: LastraNesting,
  larghezza: number,
  altezza: number
): number | null {
  if (!(larghezza > 0) || !(altezza > 0)) return null;
  const area = lastra.piazzamenti.reduce(
    // sulle sagome conta l'area geometrica vera, non il prodotto delle misure:
    // è lo stesso numero che il piano mostra come «resa»
    (s, p) => s + (p.areaVera ?? p.larghezzaFinita * p.altezzaFinita),
    0
  );
  const resa = (100 * area) / (larghezza * altezza);
  // un filo di tolleranza per l'arrotondamento dei decimi di millimetro: è il
  // 100% che non si può superare, non il 100,01%
  return resa > 100.5 ? resa : null;
}

/** perché questo piano non si può tagliare, se non si può */
export interface PianoRotto {
  /** coppie fra cui la lama non passa */
  sovrapposti: Sovrapposizione[];
  /** resa oltre il 100%, cioè materiale contato due volte */
  resa: number | null;
}

/**
 * Il piano regge? Tutti e due i libri, in un colpo solo.
 *
 * `larghezza` e `altezza` sono quelle del foglio come viene DISEGNATO: su una
 * bobina è il segmento, non il rotolo intero, se no la resa si annacqua e
 * l'aritmetica non vede più niente.
 */
export function pianoRotto(
  lastra: LastraNesting,
  lama: number,
  larghezza: number,
  altezza: number
): PianoRotto | null {
  const sovrapposti = sovrapposizioni(lastra, lama);
  const resa = resaImpossibile(lastra, larghezza, altezza);
  return sovrapposti.length || resa !== null ? { sovrapposti, resa } : null;
}
