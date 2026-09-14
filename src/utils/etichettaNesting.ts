/**
 * Impaginazione delle etichette sui pezzi nestati.
 *
 * Regola: il nome viene prima di tutto. Su un pezzo stretto si preferisce
 * girare il testo di 90°, mandarlo a capo o rimpicciolirlo piuttosto che
 * mostrare solo la misura: la misura è già nella legenda, il nome no.
 *
 * ANDARE A CAPO viene prima di rimpicciolire e prima di troncare. Un nome da
 * cantiere — «Fianco laterale destro mobile» — su una riga sola obbliga a
 * scegliere fra una scritta minuscola e un moncone con i puntini; spezzato
 * sulle parole ci sta intero e grande, perché righe più corte vogliono dire
 * caratteri più larghi. Si prova una riga, due e tre, e si tiene il corpo più
 * grande che ne esce.
 *
 * Restano due pavimenti, e sono due cose diverse. «Minimo» è la leggibilità:
 * sotto non si scrive, perché una scritta microscopica vale quanto nessuna
 * scritta — ed è fin lì che si può scendere per tenere il nome INTERO andando
 * a capo. «Comodo» è invece il limite dello STRINGERE: quando a capo non si
 * può andare — una parola sola lunghissima, o un pezzo troppo basso per due
 * righe — sotto il comodo si tronca con i puntini invece di continuare a
 * rimpicciolire, perché lì rimpicciolire non fa guadagnare niente.
 */

export interface PianoEtichetta {
  /** testo scritto lungo il lato lungo del pezzo (pezzi alti e stretti) */
  ruotata: boolean;
  /** righe del nome: una, o più se è stato mandato a capo */
  nome?: string[];
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
/** oltre tre righe un'etichetta su un pezzo non si legge più: si tronca */
const MAX_RIGHE_NOME = 3;

/**
 * Spezza il testo sulle parole, entro `caratteri` per riga.
 *
 * `null` se una parola da sola non ci sta: quella non si può spezzare, e
 * mandare a capo non serve — bisognerà rimpicciolire o troncare.
 */
function spezzaParole(testo: string, caratteri: number): string[] | null {
  const parole = testo.split(/\s+/).filter(Boolean);
  if (parole.length === 0 || !(caratteri >= 1)) return null;
  const righe: string[] = [];
  let riga = '';
  for (const parola of parole) {
    if (parola.length > caratteri) return null;
    const prova = riga ? `${riga} ${parola}` : parola;
    if (prova.length <= caratteri) riga = prova;
    else {
      righe.push(riga);
      riga = parola;
    }
  }
  if (riga) righe.push(riga);
  return righe;
}

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

/**
 * LE RIGHE GIÀ COLLOCATE, per chi deve disegnarle.
 *
 * Lo scarto è dal CENTRO del blocco di testo al centro di ogni riga: schermo,
 * PDF e file di taglio impaginano così la stessa cosa nello stesso punto, che
 * è tutto il senso di avere un motore solo.
 */
export function righeEtichetta(
  piano: PianoEtichetta
): Array<{ testo: string; corpo: number; forte: boolean; dy: number }> {
  const pezzi: Array<{ testo: string; corpo: number; forte: boolean }> = [];
  for (const riga of piano.nome ?? []) pezzi.push({ testo: riga, corpo: piano.corpoNome, forte: true });
  if (piano.misura) pezzi.push({ testo: piano.misura, corpo: piano.corpoMisura, forte: false });
  const altezza = pezzi.reduce((s, r) => s + r.corpo * INTERLINEA, 0);
  let cima = -altezza / 2;
  return pezzi.map((r) => {
    const dy = cima + (r.corpo * INTERLINEA) / 2;
    cima += r.corpo * INTERLINEA;
    return { ...r, dy };
  });
}

/** quanto vale un piano: numeri più bassi sono migliori */
function valore(p: PianoEtichetta | null): [number, number, number, number] {
  if (!p) return [3, 1, 1, 0];
  const righe = p.nome ?? (p.misura ? [p.misura] : []);
  const ultima = righe[righe.length - 1] ?? '';
  return [
    p.nome ? 0 : 1, // col nome vale sempre più che con la sola misura
    ultima.endsWith('…') ? 1 : 0, // intero meglio che troncato
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
  // un filo d'aria sui due lati: il testo non deve toccare il bordo del pezzo,
  // e riempire il pezzo al millesimo vuol dire debordare al primo
  // arrotondamento in virgola mobile
  const lungo = lungoPezzo * 0.96;
  const alto = altoPezzo * 0.98;

  const larghezzaTesto = (corpo: number, testo: string) =>
    corpo * LARGHEZZA_CARATTERE * testo.length;

  /** quanti caratteri stanno su una riga con questo corpo */
  const caratteri = (corpo: number) =>
    Math.floor(lungo / (LARGHEZZA_CARATTERE * corpo) + 1e-6);

  /**
   * IL NOME INTERO, MANDATO A CAPO, col corpo più grande possibile.
   *
   * Più righe vuol dire righe più corte, quindi caratteri più larghi: il corpo
   * cresce con le righe finché non è l'altezza del pezzo a fermarlo. Si prova
   * ogni numero di righe e si tiene il risultato più grande; a parità di corpo
   * vincono le righe in meno.
   *
   * `rigaMisura` è lo spazio già impegnato sotto dalla misura, in righe.
   */
  const aCapo = (testo: string, rigaMisura: number): { righe: string[]; corpo: number } | null => {
    let migliore: { righe: string[]; corpo: number } | null = null;
    for (let k = 1; k <= MAX_RIGHE_NOME; k++) {
      const perAltezza = Math.min(corpi.massimo, alto / ((k + rigaMisura) * INTERLINEA));
      // il pavimento qui è «minimo», non «comodo»: la soglia comoda serve a
      // non STRINGERE un nome lungo su una riga sola, dove rimpicciolire è
      // l'unico modo di farcelo stare e la scritta diventa un filo. Andare a
      // capo è un'altra cosa — tre righe danno tre volte la larghezza di
      // carattere — e un nome intero appena più piccolo batte un moncone con
      // i puntini, purché resti leggibile: leggibile è appunto «minimo».
      if (perAltezza < corpi.minimo) break;
      // il minimo di caratteri per riga che basta a stare in k righe: meno
      // caratteri ci stanno, più largo è il carattere, più grande il corpo
      for (let c = Math.max(1, Math.ceil(testo.length / k)); c <= testo.length; c++) {
        const prova = spezzaParole(testo, c);
        if (!prova || prova.length > k) continue;
        const corpo = Math.min(perAltezza, lungo / (LARGHEZZA_CARATTERE * c));
        if (corpo < corpi.minimo) break;
        // col corpo davvero usato le righe possono stare più larghe di così:
        // si rispezza, per non lasciare un a capo dove non serviva
        const finali = spezzaParole(testo, caratteri(corpo));
        const righe = finali && finali.length <= k ? finali : prova;
        if (!migliore || corpo > migliore.corpo + 1e-9) migliore = { righe, corpo };
        break;
      }
    }
    return migliore;
  };

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
    const quanti = caratteri(corpo);
    if (quanti >= testo.length) return testo;
    return quanti - 1 >= 2 ? testo.slice(0, quanti - 1).trimEnd() + '…' : null;
  };

  if (nome) {
    // 1) nome (anche su più righe) e misura sotto
    const conMisura = aCapo(nome, RAPPORTO_MISURA);
    if (conMisura && conMisura.corpo >= corpi.dueRighe) {
      const corpoMisura = conMisura.corpo * RAPPORTO_MISURA;
      if (larghezzaTesto(corpoMisura, misura) <= lungo) {
        return {
          ruotata,
          nome: conMisura.righe,
          misura,
          corpoNome: conMisura.corpo,
          corpoMisura,
          ampia: true
        };
      }
    }

    // 2) solo il nome, intero, grande quanto il pezzo consente
    const solo = aCapo(nome, 0);
    if (solo) {
      return { ruotata, nome: solo.righe, corpoNome: solo.corpo, corpoMisura: 0, ampia: false };
    }

    // 3) a capo non basta (pezzo troppo basso, o una parola sola lunghissima):
    //    si torna a una riga sola, rimpicciolita e semmai troncata
    const corpo2 = Math.min(scegliCorpo(nome, 2), scegliCorpo(misura, 2) / RAPPORTO_MISURA);
    if (corpo2 >= corpi.dueRighe) {
      const testo = adatta(nome, corpo2);
      if (testo && larghezzaTesto(corpo2 * RAPPORTO_MISURA, misura) <= lungo) {
        return {
          ruotata,
          nome: [testo],
          misura,
          corpoNome: corpo2,
          corpoMisura: corpo2 * RAPPORTO_MISURA,
          ampia: true
        };
      }
    }
    const corpo1 = scegliCorpo(nome, 1);
    if (corpo1 >= corpi.minimo) {
      const testo = adatta(nome, corpo1);
      if (testo) {
        return { ruotata, nome: [testo], corpoNome: corpo1, corpoMisura: 0, ampia: false };
      }
    }
    // se non ci sta nemmeno un nome troncato si ripiega sulla misura
  }

  // 4) pezzo senza nome (o nome impossibile): almeno la misura
  const corpoMisura = scegliCorpo(misura, 1);
  if (corpoMisura >= corpi.minimo && adatta(misura, corpoMisura) === misura) {
    return { ruotata, misura, corpoNome: 0, corpoMisura, ampia: false };
  }
  return null;
}
