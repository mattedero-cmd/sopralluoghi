/**
 * Impaginazione delle etichette sui pezzi nestati.
 *
 * Regola: il nome viene prima di tutto. Su un pezzo stretto si preferisce
 * girare il testo di 90°, rimpicciolirlo o troncarlo piuttosto che
 * mostrare solo la misura: la misura è già nella legenda, il nome no.
 *
 * Il testo però non si rimpicciolisce all'infinito pur di far stare un
 * nome lungo: sotto la soglia «comodo» si tronca, perché una scritta
 * microscopica su un pezzo grande vale quanto nessuna scritta.
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
  /** sotto questo corpo si tronca il testo invece di rimpicciolirlo ancora */
  comodo: number;
  /** corpo sotto il quale non conviene spendere due righe per la misura */
  dueRighe: number;
  /** corpo sotto il quale la scritta è illeggibile e si lascia il pezzo muto */
  minimo: number;
}

/** rapporto medio larghezza/corpo di un carattere del font di sistema */
const LARGHEZZA_CARATTERE = 0.58;
/** interlinea: quanto spazio verticale serve per una riga di testo */
const INTERLINEA = 1.15;
/** la misura è scritta un filo più piccola del nome */
const RAPPORTO_MISURA = 0.92;

/**
 * Decide cosa scrivere dentro un pezzo e con che corpo.
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
  corpi: CorpiEtichetta,
  opzioni?: { rotazione?: boolean }
): PianoEtichetta | null {
  if (!(corpi.minimo > 0) || !(larghezza > 0) || !(altezza > 0)) return null;

  // Si prova a scrivere nei due versi e si tiene il migliore. Girare il testo
  // serve sui pezzi stretti — lì per lungo ci sta tutto il nome — ma su un
  // pezzo appena più alto che largo il testo dritto si legge meglio: a parità
  // di risultato vince l'orizzontale.
  const dritto = pianoNelVerso(larghezza, altezza, false, nome, misura, corpi);
  if (opzioni?.rotazione === false) return dritto;
  const girato = pianoNelVerso(altezza, larghezza, true, nome, misura, corpi);
  return meglio(dritto, girato) <= 0 ? dritto : girato;
}

/** quanto vale un piano: numeri più bassi sono migliori */
function valore(p: PianoEtichetta | null): [number, number, number, number] {
  if (!p) return [3, 1, 1, 0];
  const testo = p.nome ?? p.misura ?? '';
  return [
    p.nome ? 0 : 1, // col nome vale sempre più che con la sola misura
    testo.endsWith('…') ? 1 : 0, // intero meglio che troncato
    p.ampia ? 0 : 1, // nome E misura meglio del solo nome
    -(p.nome ? p.corpoNome : p.corpoMisura) // più grande, meglio
  ];
}

/** <=0 se «a» è almeno buono quanto «b» */
function meglio(a: PianoEtichetta | null, b: PianoEtichetta | null): number {
  const va = valore(a);
  const vb = valore(b);
  for (let i = 0; i < va.length; i++) {
    if (Math.abs(va[i] - vb[i]) > 1e-9) return va[i] - vb[i];
  }
  return 0;
}

/**
 * Impagina nel verso dato: `lungo` è la misura del pezzo lungo la riga di
 * scrittura, `alto` quella perpendicolare.
 */
function pianoNelVerso(
  lungoPezzo: number,
  altoPezzo: number,
  ruotata: boolean,
  nome: string,
  misura: string,
  corpi: CorpiEtichetta
): PianoEtichetta | null {
  const lungo = lungoPezzo * 0.96;
  const alto = altoPezzo;

  const larghezzaTesto = (corpo: number, testo: string) =>
    corpo * LARGHEZZA_CARATTERE * testo.length;

  /**
   * Corpo scelto per un testo su `righe` righe: il più grande che ci sta,
   * scendendo fino a «comodo» per far entrare tutto il testo. Più in basso
   * si scende solo se è l'altezza del pezzo a imporlo.
   */
  const scegliCorpo = (testo: string, righe: number) => {
    const perAltezza = Math.min(corpi.massimo, alto / (righe * INTERLINEA));
    const perLarghezza = lungo / (LARGHEZZA_CARATTERE * Math.max(1, testo.length));
    return Math.min(perAltezza, Math.max(perLarghezza, corpi.comodo));
  };

  /** il testo com'è, troncato con l'ellissi, oppure null se non ci sta */
  const adatta = (testo: string, corpo: number): string | null => {
    // il +1e-6 evita che un testo che ci sta esatto venga troncato per un
    // arrotondamento in virgola mobile
    const quanti = Math.floor(lungo / (LARGHEZZA_CARATTERE * corpo) + 1e-6);
    if (quanti >= testo.length) return testo;
    return quanti - 1 >= 2 ? testo.slice(0, quanti - 1).trimEnd() + '…' : null;
  };

  if (nome) {
    // 1) nome e misura su due righe (il nome può essere troncato, la misura no)
    const corpo2 = Math.min(
      scegliCorpo(nome, 2),
      scegliCorpo(misura, 2) / RAPPORTO_MISURA
    );
    if (corpo2 >= corpi.dueRighe) {
      const testo = adatta(nome, corpo2);
      if (testo && larghezzaTesto(corpo2 * RAPPORTO_MISURA, misura) <= lungo) {
        return {
          ruotata,
          nome: testo,
          misura,
          corpoNome: corpo2,
          corpoMisura: corpo2 * RAPPORTO_MISURA,
          ampia: true
        };
      }
    }

    // 2) solo il nome, grande quanto il pezzo consente
    const corpo1 = scegliCorpo(nome, 1);
    if (corpo1 >= corpi.minimo) {
      const testo = adatta(nome, corpo1);
      if (testo) {
        return { ruotata, nome: testo, corpoNome: corpo1, corpoMisura: 0, ampia: false };
      }
    }
    // se non ci sta nemmeno un nome troncato si ripiega sulla misura
  }

  // 3) pezzo senza nome (o nome impossibile): almeno la misura
  const corpoMisura = scegliCorpo(misura, 1);
  if (corpoMisura >= corpi.minimo && adatta(misura, corpoMisura) === misura) {
    return { ruotata, misura, corpoNome: 0, corpoMisura, ampia: false };
  }
  return null;
}
