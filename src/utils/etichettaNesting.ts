/**
 * Impaginazione delle etichette sui pezzi nestati.
 *
 * Regola: il nome viene prima di tutto. Su un pezzo stretto si preferisce
 * girare il testo di 90°, rimpicciolirlo o troncarlo piuttosto che
 * mostrare solo la misura: la misura è già nella legenda, il nome no.
 */

export interface PianoEtichetta {
  /** testo scritto lungo il lato lungo del pezzo (pezzi alti e stretti) */
  ruotata: boolean;
  nome?: string;
  misura?: string;
  corpoNome: number;
  corpoMisura: number;
  /** vero quando c'è spazio per nome e misura su due righe */
  ampia: boolean;
}

export interface CorpiEtichetta {
  /** corpo massimo: oltre non si ingrandisce, anche se il pezzo è enorme */
  massimo: number;
  /** corpo sotto il quale la scritta è illeggibile e si lascia il pezzo muto */
  minimo: number;
  /** corpo sotto il quale non conviene spendere due righe per la misura */
  dueRighe: number;
}

/** rapporto medio larghezza/corpo di un carattere del font di sistema */
const LARGHEZZA_CARATTERE = 0.58;
/** interlinea: quanto spazio verticale serve per una riga di testo */
const INTERLINEA = 1.15;

/**
 * Decide cosa scrivere dentro un pezzo e con che corpo.
 *
 * Il corpo non ha gradini: si prende il più grande che ci sta, limitato
 * dal lato lungo (numero di caratteri) e da quello corto (righe).
 *
 * @param larghezza larghezza del pezzo, nelle unità del disegno
 * @param altezza   altezza del pezzo, nelle unità del disegno
 * @param nome      nome del pezzo (può essere vuoto)
 * @param misura    misura già formattata, es. «600×420»
 * @param corpi     soglie dei corpi, nelle unità del disegno
 * @returns il piano di impaginazione, oppure null se non ci sta nulla
 */
export function pianoEtichetta(
  larghezza: number,
  altezza: number,
  nome: string,
  misura: string,
  corpi: CorpiEtichetta
): PianoEtichetta | null {
  if (!(corpi.minimo > 0) || !(larghezza > 0) || !(altezza > 0)) return null;

  // pezzo decisamente più alto che largo: si scrive nel verso lungo, come
  // si fa a matita sui listelli
  const ruotata = altezza > larghezza * 1.15;
  const lungo = (ruotata ? altezza : larghezza) * 0.96;
  const alto = ruotata ? larghezza : altezza;

  /** il corpo più grande con cui `testo` ci sta su `righe` righe */
  const corpoPer = (testo: string, righe: number) =>
    Math.min(
      corpi.massimo,
      alto / (righe * INTERLINEA),
      testo.length > 0 ? lungo / (LARGHEZZA_CARATTERE * testo.length) : corpi.massimo
    );

  if (nome) {
    // 1) nome e misura su due righe, se restano abbastanza grandi da servire
    const due = Math.min(corpoPer(nome, 2), corpoPer(misura, 2) / 0.92);
    if (due >= corpi.dueRighe) {
      return {
        ruotata,
        nome,
        misura,
        corpoNome: due,
        corpoMisura: due * 0.92,
        ampia: true
      };
    }

    // 2) solo il nome, grande quanto il pezzo consente
    const uno = corpoPer(nome, 1);
    if (uno >= corpi.minimo) {
      return { ruotata, nome, corpoNome: uno, corpoMisura: 0, ampia: false };
    }

    // 3) nome troncato: «Trav…» dice più della sola misura
    const corpo = Math.min(corpi.massimo, alto / INTERLINEA);
    if (corpo >= corpi.minimo) {
      const quanti = Math.floor(lungo / (LARGHEZZA_CARATTERE * corpo)) - 1;
      if (quanti >= 2) {
        return {
          ruotata,
          nome: nome.slice(0, quanti).trimEnd() + '…',
          corpoNome: corpo,
          corpoMisura: 0,
          ampia: false
        };
      }
    }
    return null;
  }

  // 4) pezzo senza nome: almeno la misura
  const soloMisura = corpoPer(misura, 1);
  if (soloMisura >= corpi.minimo) {
    return { ruotata, misura, corpoNome: 0, corpoMisura: soloMisura, ampia: false };
  }
  return null;
}
