/**
 * PANNELLIZZAZIONE — un telo più grande del supporto, diviso in più pezzi.
 *
 * Una parete di 5 m non esiste in bobina: si taglia in teli affiancati che in
 * opera si sovrappongono di un paio di centimetri. Quel poco di sovrapposizione
 * è il SORMONTO, e non è un dettaglio: è materiale in più da tagliare, decide
 * dove cade la giunzione a vista e da che parte va il lembo che sta sopra.
 *
 * Il modello vive in un'unità sola — quella del pezzo o della forma quotata —
 * e non sa niente di millimetri, di foto o di bobine: sa dividere una lunghezza
 * in pannelli e dire quanto è largo ciascuno.
 *
 * Convenzioni:
 * - l'asse dice DOVE cade il taglio: «verticale» = giunzioni verticali, si
 *   divide la larghezza; «orizzontale» = giunzioni orizzontali, si divide
 *   l'altezza;
 * - SI DIVIDE IL VETRO, non il foglio. Le misure e le giunzioni sono quelle
 *   dell'elemento finito: una giunzione «al centro» deve cadere al centro di
 *   quello che si vede, non al centro del materiale;
 * - le abbondanze stanno ATTORNO al vetro e finiscono nei teli di bordo. Se
 *   sono asimmetriche — due centimetri ai lati e dieci sotto — i teli
 *   risultano di misure diverse, ed è giusto così: il vetro resta diviso
 *   dove serve;
 * - i giunti sono le linee di giunzione a vista, misurate dal LATO DI
 *   RIFERIMENTO (sinistra per l'asse verticale, alto per quello orizzontale);
 * - il sormonto si aggiunge attorno al giunto secondo il verso.
 */

/** dove cadono le linee di giunzione */
export type AssePannelli = 'verticale' | 'orizzontale';

/**
 * Da che parte va il lembo di sormonto rispetto alla linea di giunzione.
 *
 * «avanti»: sormonta il pannello che viene dopo — il suo lembo torna indietro
 * a coprire quello prima. «indietro»: il contrario. «centro»: metà per uno.
 * In opera decide quale telo si vede sopra: si sceglie quasi sempre in base
 * alla luce che entra dalla finestra, perché il bordo che sta sopra si nota.
 */
export type VersoSormonto = 'avanti' | 'indietro' | 'centro';

export interface Pannellizzazione {
  asse: AssePannelli;
  /** sovrapposizione fra due pannelli contigui, nell'unità della forma */
  sormonto: number;
  verso: VersoSormonto;
  /** linee di giunzione dal lato di riferimento, in ordine crescente */
  giunti: number[];
}

/** il sormonto che si usa quasi sempre: 1 cm, qui in millimetri */
export const SORMONTO_PREDEFINITO_MM = 10;

/**
 * Quanto deve restare largo un pannello perché abbia senso tagliarlo.
 *
 * Non può essere un numero fisso: «1» è un millimetro su un pezzo in mm e un
 * METRO su una parete misurata in metri, e in metri butterebbe via quasi tutte
 * le giunzioni. Si prende un millesimo del pezzo — mezzo centimetro su una
 * parete di cinque metri, comunque la si misuri.
 */
export function pannelloMinimo(totale: number): number {
  return Math.max(1e-9, Math.abs(totale) / 1000);
}

/**
 * Le abbondanze attorno al vetro, viste dall'asse di divisione.
 *
 * `inizio` e `fine` stanno ai due capi dell'asse e finiscono ciascuna nel suo
 * telo di bordo; quelle di traverso entrano invece nella misura di TUTTI i
 * teli, perché ogni telo arriva da un bordo all'altro.
 */
export interface AbbondanzeTelo {
  inizio: number;
  fine: number;
  trasversaleInizio: number;
  trasversaleFine: number;
}

export const SENZA_ABBONDANZE: AbbondanzeTelo = {
  inizio: 0,
  fine: 0,
  trasversaleInizio: 0,
  trasversaleFine: 0
};

export interface Pannello {
  /** progressivo dal lato di riferimento, da 1 */
  indice: number;
  /**
   * Bordi del MATERIALE lungo l'asse, nelle coordinate del vetro: sormonto e
   * abbondanze compresi. Il primo telo comincia in negativo quando c'è
   * un'abbondanza a sinistra (o in alto), perché il materiale sborda dal vetro.
   */
  inizio: number;
  fine: number;
  /** misura di taglio lungo l'asse di divisione */
  larghezza: number;
  /** misura di taglio nell'altro verso: uguale per tutti i teli */
  altezza: number;
  /** parte a vista, quella che resta scoperta una volta posato il vicino */
  vistaInizio: number;
  vistaFine: number;
}

/**
 * Di quanto un pannello sborda oltre le sue giunzioni, secondo il verso.
 *
 * `inizio` vale sulla giunzione che ha alle spalle, `fine` su quella davanti.
 * La somma fa sempre un sormonto: è la stessa sovrapposizione vista dai due
 * pannelli che la condividono.
 */
export function sbordo(p: Pick<Pannellizzazione, 'sormonto' | 'verso'>): {
  inizio: number;
  fine: number;
} {
  const s = Math.max(0, p.sormonto);
  if (p.verso === 'avanti') return { inizio: s, fine: 0 };
  if (p.verso === 'indietro') return { inizio: 0, fine: s };
  return { inizio: s / 2, fine: s / 2 };
}

/** i giunti buoni: dentro il pezzo, in ordine, senza pannelli inconsistenti */
export function giuntiValidi(giunti: number[], totale: number): number[] {
  const minimo = pannelloMinimo(totale);
  const puliti = giunti
    .filter((g) => Number.isFinite(g) && g >= minimo && g <= totale - minimo)
    .sort((a, b) => a - b);
  const tenuti: number[] = [];
  for (const g of puliti) {
    const precedente = tenuti[tenuti.length - 1];
    if (precedente === undefined || g - precedente >= minimo) tenuti.push(g);
  }
  return tenuti;
}

/**
 * I pannelli che escono da una pannellizzazione.
 *
 * `totale` e `trasversale` sono le misure DEL VETRO lungo e di traverso
 * all'asse; le abbondanze stanno attorno e si aggiungono ai teli di bordo.
 * Senza giunti validi torna un pannello solo: la forma intera, abbondanze
 * comprese.
 */
export function pannelliDi(
  totale: number,
  trasversale: number,
  p: Pannellizzazione,
  abbondanze: AbbondanzeTelo = SENZA_ABBONDANZE
): Pannello[] {
  const ab = abbondanze;
  // ogni telo va da un bordo all'altro: le abbondanze di traverso ci sono su
  // tutti, non solo sul primo e sull'ultimo
  const altezza = trasversale + ab.trasversaleInizio + ab.trasversaleFine;
  const tagli = giuntiValidi(p.giunti, totale);
  if (tagli.length === 0) {
    return [
      {
        indice: 1,
        inizio: ab.inizio === 0 ? 0 : -ab.inizio,
        fine: totale + ab.fine,
        larghezza: totale + ab.inizio + ab.fine,
        altezza,
        vistaInizio: 0,
        vistaFine: totale
      }
    ];
  }
  const sb = sbordo(p);
  const bordi = [0, ...tagli, totale];
  const pannelli: Pannello[] = [];
  for (let i = 0; i < bordi.length - 1; i++) {
    const primo = i === 0;
    const ultimo = i === bordi.length - 2;
    // ai capi del vetro non c'è niente da sormontare: c'è l'abbondanza
    const inizio = primo ? (ab.inizio === 0 ? 0 : -ab.inizio) : bordi[i] - sb.inizio;
    const fine = ultimo ? totale + ab.fine : bordi[i + 1] + sb.fine;
    pannelli.push({
      indice: i + 1,
      inizio,
      fine,
      larghezza: fine - inizio,
      altezza,
      vistaInizio: bordi[i],
      vistaFine: bordi[i + 1]
    });
  }
  return pannelli;
}

/** quanto materiale serve in più rispetto alla forma intera */
export function sormontoTotale(p: Pannellizzazione, totale: number): number {
  return giuntiValidi(p.giunti, totale).length * Math.max(0, p.sormonto);
}

export interface OpzioniGiunti {
  /**
   * Larghezza massima di un pannello: la fascia utile del supporto. È il
   * vincolo vero — il telo non può essere più largo del rotolo.
   */
  massimo?: number | null;
  /** quanti pannelli si vogliono; senza indicazione li conta il massimo */
  numero?: number | null;
  /**
   * «fascia» sfrutta tutta la larghezza utile e lascia il resto all'ultimo
   * pannello: meno giunzioni, meno sfrido. «uguali» divide in parti uguali:
   * più ordinato a vista, e a volte è quello che chiede il cliente.
   */
  modo: 'fascia' | 'uguali';
  sormonto: number;
  verso: VersoSormonto;
  /** le abbondanze attorno al vetro: entrano nei teli di bordo */
  abbondanze?: AbbondanzeTelo;
}

/**
 * Quanti pannelli servono come minimo.
 *
 * Ogni giunzione costa un sormonto in più di materiale, quindi il conto non è
 * `totale / massimo`: n pannelli coprono `n·massimo − (n−1)·sormonto`.
 */
export function numeroMinimo(
  totale: number,
  massimo: number | null | undefined,
  sormonto: number,
  abbondanze: AbbondanzeTelo = SENZA_ABBONDANZE
): number {
  if (!massimo || !(massimo > 0)) return 1;
  // il materiale da coprire è il vetro più le abbondanze dei due capi
  const materiale = totale + abbondanze.inizio + abbondanze.fine;
  if (materiale <= massimo) return 1;
  const s = Math.max(0, sormonto);
  // un sormonto largo quanto la fascia non coprirebbe mai niente di nuovo
  if (massimo - s <= 0) return 1;
  return Math.max(1, Math.ceil((materiale - s) / (massimo - s)));
}

/**
 * I giunti proposti dal programma.
 *
 * A «fascia» i primi pannelli prendono tutta la larghezza utile e l'ultimo si
 * tiene quello che avanza. A «uguali» tutti i pannelli hanno la stessa misura
 * di taglio, sormonti compresi.
 */
export function giuntiAutomatici(totale: number, o: OpzioniGiunti): number[] {
  const s = Math.max(0, o.sormonto);
  const ab = o.abbondanze ?? SENZA_ABBONDANZE;
  const sb = sbordo({ sormonto: s, verso: o.verso });
  const n = Math.max(1, Math.round(o.numero ?? numeroMinimo(totale, o.massimo, s, ab)));
  if (n <= 1 || totale <= 0) return [];

  const giunti: number[] = [];
  if (o.modo === 'fascia' && o.massimo && o.massimo > s) {
    // i primi n−1 teli larghi quanto la fascia, l'ultimo prende il resto.
    // Il primo però porta anche l'abbondanza di bordo: sul vetro copre di meno
    let g = o.massimo - ab.inizio - sb.fine;
    for (let i = 0; i < n - 1; i++) {
      giunti.push(g);
      g += o.massimo - s;
    }
  } else {
    // PARTI UGUALI SUL VETRO: è quello che si guarda. Le abbondanze rendono
    // poi diversi i teli di bordo, ed è giusto — la giunzione resta dov'era
    for (let i = 1; i < n; i++) giunti.push((totale * i) / n);
  }
  return giuntiValidi(giunti, totale);
}

/** una pannellizzazione nuova, già divisa come si dividerebbe a mano */
export function pannellizzazioneAutomatica(
  totale: number,
  o: OpzioniGiunti & { asse: AssePannelli }
): Pannellizzazione {
  return {
    asse: o.asse,
    sormonto: Math.max(0, o.sormonto),
    verso: o.verso,
    giunti: giuntiAutomatici(totale, o)
  };
}

/**
 * Sposta una giunzione, senza lasciarle scavalcare le vicine.
 *
 * Serve sia al campo numerico sia al trascinamento sul disegno: il limite è
 * lo stesso, e sta in un posto solo perché le due strade non possano dare
 * risultati diversi.
 */
export function spostaGiunto(
  p: Pannellizzazione,
  indice: number,
  posizione: number,
  totale: number
): Pannellizzazione {
  const giunti = [...p.giunti];
  if (indice < 0 || indice >= giunti.length) return p;
  const passo = pannelloMinimo(totale);
  const minimo = (giunti[indice - 1] ?? 0) + passo;
  const massimo = (giunti[indice + 1] ?? totale) - passo;
  if (massimo < minimo) return p;
  giunti[indice] = Math.min(massimo, Math.max(minimo, posizione));
  return { ...p, giunti };
}

/**
 * Rimette a posto una pannellizzazione letta da un salvataggio.
 *
 * I documenti vecchi e i file scambiati fra dispositivi possono contenere di
 * tutto: qui si scarta il non-numero e si riporta il resto dentro i limiti,
 * senza mai buttare via il lavoro dell'utente.
 */
export function normalizzaPannellizzazione(
  grezzo: unknown,
  totale: number
): Pannellizzazione | null {
  if (!grezzo || typeof grezzo !== 'object') return null;
  const g = grezzo as Record<string, unknown>;
  const giunti = Array.isArray(g.giunti)
    ? g.giunti.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
  const validi = giuntiValidi(giunti, totale);
  if (validi.length === 0) return null;
  const sormonto =
    typeof g.sormonto === 'number' && Number.isFinite(g.sormonto) && g.sormonto >= 0
      ? g.sormonto
      : 0;
  return {
    asse: g.asse === 'orizzontale' ? 'orizzontale' : 'verticale',
    sormonto,
    verso: g.verso === 'avanti' || g.verso === 'indietro' ? g.verso : 'centro',
    giunti: validi
  };
}

/** «1/3», «2/3»… come si scrive su un telo prima di arrotolarlo */
export function etichettaPannello(indice: number, totale: number): string {
  return `${indice}/${totale}`;
}
