/**
 * MODIFICARE UN PIANO PROSPETTICO A MANO, SULLA FOTO.
 *
 * Il riquadro verde di un piano fa due mestieri diversi, e vanno tenuti
 * separati o si finisce per rovinare la calibrazione mentre si cerca solo di
 * vedere meglio:
 *
 * - TIRARE UN LATO allarga o stringe il riquadro. È solo la sua ESTENSIONE:
 *   quanta parete il piano copre, e quindi fin dove arriva la griglia di
 *   verifica. La prospettiva non si tocca — le misure prima e dopo sono le
 *   stesse, al millesimo. Sotto, il riquadro si allarga nelle coordinate del
 *   muro e i quattro angoli si riportano sulla foto con la STESSA omografia.
 *
 * - SPOSTARE UN VERTICE cambia la prospettiva. È la regolazione fine: si
 *   guarda la griglia e la si fa combaciare con quello che si vede — i corsi
 *   dei pannelli, il filo dei serramenti — finché il piano non dice il vero.
 *
 * In nessuno dei due casi si toccano le forme del sopralluogo: quelle stanno
 * dove sono state disegnate, e la calibrazione cambia soltanto le misure
 * CALCOLATE. Le misure scritte a mano non si muovono mai.
 */

import type { PianoProspettiva, Punto } from '../db/types';
import { applicaOmografia, invertiOmografia, omografiaPiano } from './omografia';
import { spigoliDellaFoto, spigoliSuiVertici } from './spigolo';

/** i quattro lati del riquadro, nell'ordine dei vertici */
export type LatoPiano = 0 | 1 | 2 | 3; // alto, destro, basso, sinistro

/** il punto di mezzo di ogni lato: è lì che si prende per tirarlo */
export function maniglieDeiLati(piano: PianoProspettiva): Punto[] {
  return piano.punti.map((p, i) => {
    const q = piano.punti[(i + 1) % 4];
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  });
}

/**
 * SPOSTA UN VERTICE: cambia la prospettiva, le misure reali restano quelle.
 *
 * Torna null se i quattro angoli non fanno più un quadrilatero buono — tre
 * punti in fila, o un vertice passato dall'altra parte — perché un piano
 * degenere non misura niente e va rifiutato invece che salvato.
 */
export function pianoConVertice(
  piano: PianoProspettiva,
  vertice: number,
  nuovo: Punto
): PianoProspettiva | null {
  if (vertice < 0 || vertice > 3) return null;
  const punti = piano.punti.map((p, i) => (i === vertice ? { ...nuovo } : { ...p })) as [
    Punto,
    Punto,
    Punto,
    Punto
  ];
  // da qui in poi la prospettiva è roba dell'uomo: non si ricalcola più da
  // sola dalle forme, o la correzione appena fatta sparirebbe al primo
  // ritocco di una quota
  const provvisorio = { ...piano, punti, aMano: true };
  try {
    omografiaPiano(provvisorio); // quattro angoli degeneri: si rifiuta
  } catch {
    return null;
  }
  return provvisorio;
}

/**
 * TIRA UN LATO: il riquadro si allarga o si stringe, la prospettiva no.
 *
 * `punto` è dove si è trascinato, in pixel della foto. Si legge quel punto
 * sulle coordinate del muro, si sposta là il bordo corrispondente del
 * riquadro, e i nuovi quattro angoli si riportano sulla foto con l'omografia
 * di prima: quindi la stessa identica prospettiva, su un pezzo di muro più
 * grande (o più piccolo).
 *
 * Torna null quando il riquadro si ridurrebbe a niente, o quando un angolo
 * finirebbe oltre l'orizzonte del piano — di là dalla linea di fuga la foto
 * non c'è più, e i conti si ribaltano.
 */
export function pianoConLato(
  piano: PianoProspettiva,
  lato: LatoPiano,
  punto: Punto
): PianoProspettiva | null {
  let H;
  try {
    H = omografiaPiano(piano);
  } catch {
    return null;
  }
  const Hinv = invertiOmografia(H);
  if (!Hinv) return null;

  // il punto trascinato, letto sulle coordinate del muro
  const w = H[6] * punto.x + H[7] * punto.y + H[8];
  if (!(Math.abs(w) > 1e-9)) return null;
  const q = applicaOmografia(H, punto);
  if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return null;

  const L = piano.larghezzaReale;
  const A = piano.altezzaReale;
  let x0 = 0;
  let y0 = 0;
  let x1 = L;
  let y1 = A;
  // il riquadro non può sparire: resta almeno un decimo di quello che era
  const minimoL = L * 0.1;
  const minimoA = A * 0.1;
  if (lato === 0) y0 = Math.min(q.y, y1 - minimoA);
  else if (lato === 1) x1 = Math.max(q.x, x0 + minimoL);
  else if (lato === 2) y1 = Math.max(q.y, y0 + minimoA);
  else x0 = Math.min(q.x, x1 - minimoL);

  const larghezza = x1 - x0;
  const altezza = y1 - y0;
  if (!(larghezza > 0) || !(altezza > 0)) return null;
  // e non può gonfiarsi senza ritegno: venti volte è già tutta la facciata
  if (larghezza > L * 20 || altezza > A * 20) return null;

  const angoli = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ].map((p) => {
    const wd = Hinv[6] * p.x + Hinv[7] * p.y + Hinv[8];
    if (!(Math.abs(wd) > 1e-9)) return null;
    return {
      x: (Hinv[0] * p.x + Hinv[1] * p.y + Hinv[2]) / wd,
      y: (Hinv[3] * p.x + Hinv[4] * p.y + Hinv[5]) / wd
    };
  });
  if (angoli.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const nuovo: PianoProspettiva = {
    ...piano,
    punti: angoli as [Punto, Punto, Punto, Punto],
    larghezzaReale: larghezza,
    altezzaReale: altezza
  };
  // prova del nove: la prospettiva dev'essere rimasta quella. Se il riquadro
  // ha attraversato l'orizzonte i conti si ribaltano, e allora non si applica
  try {
    const rifatta = omografiaPiano(nuovo);
    const campioni: Punto[] = [
      { x: piano.punti[0].x, y: piano.punti[0].y },
      { x: piano.punti[2].x, y: piano.punti[2].y },
      {
        x: (piano.punti[0].x + piano.punti[2].x) / 2,
        y: (piano.punti[0].y + piano.punti[2].y) / 2
      }
    ];
    for (let i = 0; i < campioni.length - 1; i++) {
      const prima = distanza(H, campioni[i], campioni[i + 1]);
      const dopo = distanza(rifatta, campioni[i], campioni[i + 1]);
      if (!(prima > 1e-9) || Math.abs(dopo - prima) > prima * 1e-3) return null;
    }
  } catch {
    return null;
  }
  return nuovo;
}

const distanza = (H: ReturnType<typeof omografiaPiano>, p: Punto, q: Punto) => {
  const a = applicaOmografia(H, p);
  const b = applicaOmografia(H, q);
  return Math.hypot(b.x - a.x, b.y - a.y);
};

/**
 * IL PIANO AGGANCIATO AI SUOI SPIGOLI.
 *
 * Due pareti che si toccano devono anche DISEGNARSI attaccate: il riquadro
 * dell'una finisce dove comincia quello dell'altra, sulla riga dello spigolo.
 * Così, oltre a vedersi bene, nasce il vertice di GIUNZIONE — una maniglia
 * sola, condivisa dalle due pareti, che è poi il punto che si vuole prendere
 * quando l'angolo sulla foto non torna.
 *
 * Si tocca soltanto l'ESTENSIONE del riquadro: la riga dello spigolo si legge
 * nelle coordinate del muro, si porta là il bordo che gli sta di fronte, e i
 * quattro angoli tornano sulla foto con la STESSA omografia. La prospettiva
 * non cambia di un millesimo — cambia dove finisce il riquadro.
 */
export function pianoAgganciato(
  piano: PianoProspettiva,
  spigoli: Array<{ p1: Punto; p2: Punto }>
): PianoProspettiva | null {
  if (spigoli.length === 0) return null;
  let H;
  try {
    H = omografiaPiano(piano);
  } catch {
    return null;
  }
  const Hinv = invertiOmografia(H);
  if (!Hinv) return null;

  const L = piano.larghezzaReale;
  const A = piano.altezzaReale;
  let x0 = 0;
  let y0 = 0;
  let x1 = L;
  let y1 = A;

  // UN AGGANCIO È UN RITOCCO, non uno stiramento: se per arrivare allo
  // spigolo il bordo dovesse fare più di mezzo riquadro, quelle due pareti
  // non si toccano in questa foto — una sta dietro l'altra, o l'angolo cade
  // lontano — e si lascia perdere
  const ritocco = (vecchio: number, nuovo: number, misura: number) =>
    Math.abs(nuovo - vecchio) <= misura * 0.5;

  // ALLUNGARSI LUNGO LO SPIGOLO è un'altra cosa che avvicinarsi ad esso: non
  // si sta stirando una parete verso un muro lontano, si sta coprendo lo
  // stesso filo di fabbricato che copre la parete accanto. Il limite resta,
  // perché una parete di scorcio non trascini l'altra fuori dalla foto, ma è
  // più largo: sotto mezzo riquadro non si arrivava mai a chiudere il giunto,
  // e con muri di altezza molto diversa — la norma, quando le finestre stanno
  // a quote diverse — nemmeno sotto il doppio.
  const allungo = (vecchio: number, nuovo: number, misura: number) =>
    Math.abs(nuovo - vecchio) <= misura * 8;

  for (const spigolo of spigoli) {
    const a = applicaOmografia(H, spigolo.p1);
    const b = applicaOmografia(H, spigolo.p2);
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx <= dy) {
      // spigolo VERTICALE sul muro: fa da bordo destro o sinistro
      const cx = (a.x + b.x) / 2;
      const centro = (x0 + x1) / 2;
      if (cx < centro) {
        if (ritocco(x0, cx, L)) x0 = Math.min(cx, x1 - L * 0.1);
      } else if (ritocco(x1, cx, L)) {
        x1 = Math.max(cx, x0 + L * 0.1);
      }
      // …e il riquadro si allunga fino a coprire tutto il filo dello
      // spigolo: al vero angolo di fabbricato le due pareti finiscono in
      // alto e in basso nello stesso punto, ed è quello il vertice di
      // giunzione. Senza questo i due angoli restano a decine di pixel
      // l'uno dall'altro e le pareti non si uniscono mai.
      const su = Math.min(a.y, b.y);
      const giu = Math.max(a.y, b.y);
      if (su < y0 && allungo(y0, su, A)) y0 = su;
      if (giu > y1 && allungo(y1, giu, A)) y1 = giu;
    } else {
      // spigolo ORIZZONTALE: il muro col soffitto, o col pavimento
      const cy = (a.y + b.y) / 2;
      const centro = (y0 + y1) / 2;
      if (cy < centro) {
        if (ritocco(y0, cy, A)) y0 = Math.min(cy, y1 - A * 0.1);
      } else if (ritocco(y1, cy, A)) {
        y1 = Math.max(cy, y0 + A * 0.1);
      }
      const sx = Math.min(a.x, b.x);
      const dxx = Math.max(a.x, b.x);
      if (sx < x0 && allungo(x0, sx, L)) x0 = sx;
      if (dxx > x1 && allungo(x1, dxx, L)) x1 = dxx;
    }
  }

  const larghezza = x1 - x0;
  const altezza = y1 - y0;
  if (!(larghezza > 0) || !(altezza > 0)) return null;
  if (larghezza > L * 20 || altezza > A * 20) return null;
  if (Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6 && Math.abs(larghezza - L) < 1e-6 && Math.abs(altezza - A) < 1e-6) {
    return null; // già agganciato: non c'è niente da cambiare
  }

  const angoli = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ].map((p) => {
    const w = Hinv[6] * p.x + Hinv[7] * p.y + Hinv[8];
    if (!(Math.abs(w) > 1e-9)) return null;
    return {
      x: (Hinv[0] * p.x + Hinv[1] * p.y + Hinv[2]) / w,
      y: (Hinv[3] * p.x + Hinv[4] * p.y + Hinv[5]) / w
    };
  });
  if (angoli.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  // le forme della parete devono restare DENTRO il suo riquadro: se
  // l'aggancio ne taglia fuori una, quello spigolo non era un confine
  const suoi = (piano.ancore ?? []).map((p) => applicaOmografia(H, p));
  if (
    suoi.some(
      (p) => p.x < x0 - 1e-6 || p.x > x1 + 1e-6 || p.y < y0 - 1e-6 || p.y > y1 + 1e-6
    )
  ) {
    return null;
  }

  return {
    ...piano,
    punti: angoli as [Punto, Punto, Punto, Punto],
    larghezzaReale: larghezza,
    altezzaReale: altezza
  };
}

/**
 * TUTTE LE PARETI AGGANCIATE FRA LORO, come vanno salvate.
 *
 * Si passa qui ogni volta che i piani cambiano — quando nascono dalle forme,
 * quando si aggiustano a mano, quando si rifanno da soli — così restano
 * sempre attaccate lungo gli spigoli.
 */
export function pianiAgganciati(
  piani: PianoProspettiva[],
  larghezza: number,
  altezza: number
): PianoProspettiva[] {
  if (piani.length < 2) return piani;
  // ci si aggancia alla riga che si VEDE: quella che passa per i vertici di
  // giunzione, quando ce ne sono. Alla nascita delle pareti non ce ne sono
  // ancora e la riga è quella ricavata, come sempre; dopo un ritocco a mano
  // invece comanda l'angolo che l'utente ha messo lì, e i due riquadri gli si
  // richiudono attorno invece di aprirsi a V sotto di esso.
  const spigoli = spigoliSuiVertici(
    spigoliDellaFoto(piani, larghezza, altezza),
    piani,
    larghezza,
    altezza
  );
  if (spigoli.length === 0) return piani;
  return piani.map((piano, i) => {
    const suoi = spigoli
      .filter((s) => s.separante && (s.a === i || s.b === i))
      .map((s) => trattoCondiviso(piani[s.a], piani[s.b], s.spigolo));
    return pianoAgganciato(piano, suoi) ?? piano;
  });
}

/**
 * IL TRATTO DI SPIGOLO CHE LE DUE PARETI SI DIVIDONO.
 *
 * La riga dello spigolo attraversa tutta la foto, ma lo spigolo vero del
 * fabbricato comincia e finisce dove finiscono i due muri. Si prende quindi
 * l'unione dei due bordi che gli si affacciano: è il filo verticale che le
 * pareti hanno in comune, dal punto più alto dell'una o dell'altra al più
 * basso. Agganciandosi a quel tratto tutte e due, i loro angoli finiscono
 * nello stesso posto — ed è lì che nasce il vertice di giunzione.
 */
function trattoCondiviso(
  A: PianoProspettiva,
  B: PianoProspettiva,
  s: { p1: Punto; p2: Punto }
): { p1: Punto; p2: Punto } {
  const dx = s.p2.x - s.p1.x;
  const dy = s.p2.y - s.p1.y;
  const lung2 = dx * dx + dy * dy;
  if (!(lung2 > 1e-12)) return s;
  const dove = (p: Punto) => ((p.x - s.p1.x) * dx + (p.y - s.p1.y) * dy) / lung2;
  const daRetta = (p: Punto) => Math.abs((p.x - s.p1.x) * dy - (p.y - s.p1.y) * dx) / Math.sqrt(lung2);
  /** i due angoli del riquadro che stanno sullo spigolo: il bordo affacciato */
  const bordo = (piano: PianoProspettiva) =>
    [...piano.punti]
      .sort((p, q) => daRetta(p) - daRetta(q))
      .slice(0, 2)
      .map(dove);
  const t = [...bordo(A), ...bordo(B)];
  const su = Math.min(...t);
  const giu = Math.max(...t);
  return {
    p1: { x: s.p1.x + dx * su, y: s.p1.y + dy * su },
    p2: { x: s.p1.x + dx * giu, y: s.p1.y + dy * giu }
  };
}

/**
 * IL PIANO PROIETTATO IN UNA GRIGLIA N×N ATTORNO A SÉ.
 *
 * Un piano nasce da un riferimento piccolo: una piastrella, un foglio A4, un
 * pannello. Su quel riquadro la prospettiva è quella che è — e un errore di
 * mezzo grado, lì dentro, non si vede. Lo si vede LONTANO: proiettando il
 * riferimento in una griglia di tre, cinque, sette celle per lato si copre
 * mezza parete, e allora due cose diventano evidenti insieme.
 *
 * La prima: se il muro è piastrellato o a corsi di mattoni, le celle della
 * griglia devono cadere sui giunti veri. Se dopo tre file scappano, la
 * prospettiva è sbagliata, e si vede a occhio senza misurare niente.
 *
 * La seconda: gli angoli del piano proiettato sono LONTANI dal riferimento, e
 * un grado di errore là si traduce in centimetri di scarto. Tirarli è il modo
 * più fine che ci sia per aggiustare la prospettiva: si corregge molto con un
 * movimento piccolo, invece di litigare con quattro angoli tutti vicini.
 *
 * La proiezione NON tocca la prospettiva: cambia solo quanto piano si guarda.
 * La cella di partenza resta quella, e resta il metro di tutto.
 */
export function pianoProiettato(piano: PianoProspettiva, celle: number): PianoProspettiva | null {
  const n = Math.max(1, Math.round(celle));
  const c = Math.max(1, Math.round(piano.celle ?? 1));
  if (!(piano.larghezzaReale > 0) || !(piano.altezzaReale > 0)) return null;
  const cellaL = piano.larghezzaReale / c;
  const cellaA = piano.altezzaReale / c;
  let H;
  try {
    H = omografiaPiano(piano);
  } catch {
    return null;
  }
  const Hinv = invertiOmografia(H);
  if (!Hinv) return null;
  // la griglia cresce ATTORNO al riferimento, restando centrata dov'era
  const x0 = piano.larghezzaReale / 2 - (n * cellaL) / 2;
  const y0 = piano.altezzaReale / 2 - (n * cellaA) / 2;
  const x1 = x0 + n * cellaL;
  const y1 = y0 + n * cellaA;
  const angoli = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ].map((q) => applicaOmografia(Hinv, q));
  if (angoli.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) return null;
  return {
    ...piano,
    punti: angoli as [Punto, Punto, Punto, Punto],
    larghezzaReale: n * cellaL,
    altezzaReale: n * cellaA,
    celle: n
  };
}

/**
 * I VERTICI DI GIUNZIONE: gli angoli che due pareti hanno in comune.
 *
 * Dopo l'aggancio i riquadri si toccano sullo spigolo, e là due angoli — uno
 * per parete — cadono nello stesso punto. Tirandone uno si tirano tutti e
 * due: è l'angolo del fabbricato, e appartiene a tutte e due le pareti.
 */
export function verticiGemelli(
  piani: PianoProspettiva[],
  indice: number,
  vertice: number,
  tolleranza = 14
): Array<{ indice: number; vertice: number }> {
  const p = piani[indice]?.punti[vertice];
  if (!p) return [];
  const fuori: Array<{ indice: number; vertice: number }> = [];
  piani.forEach((altro, i) => {
    if (i === indice) return;
    altro.punti.forEach((q, k) => {
      if (Math.hypot(q.x - p.x, q.y - p.y) <= tolleranza) fuori.push({ indice: i, vertice: k });
    });
  });
  return fuori;
}
