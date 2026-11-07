/**
 * LA SAGOMA VERA DI UNA POLILINEA QUOTATA, a qualunque numero di lati.
 *
 * Una parete sotto falda non è sempre un quadrilatero: quella dell'hotel ha
 * cinque lati — montante, un pezzo di soffitto piano, la falda, il montante
 * corto, il pavimento — e si disegna con la polilinea, si quota dove si può
 * misurare e si lascia il resto al piano di riferimento. Fin qui, nel piano
 * di taglio ne arrivava il RETTANGOLO D'INGOMBRO: si buttava tutto il
 * triangolo sotto la falda, e i teli uscivano squadrati dove invece vanno
 * tagliati in diagonale.
 *
 * LA REGOLA È QUELLA CHE L'APP USA GIÀ PER IL QUADRILATERO, generalizzata:
 * le misure scritte comandano, il disegno dà la forma. Un poligono di n lati
 * è determinato da 2n−3 numeri: gli n lati e n−3 diagonali. Quelli che sono
 * stati misurati si usano così come sono; quelli che mancano si prendono dal
 * DISEGNO — dal piano di riferimento se c'è, che toglie la prospettiva, se no
 * dai pixel — riportati in scala sulle misure vere. Così il pezzo tagliato ha
 * i lati che l'artigiano ha preso, e a essere dedotta è solo la pendenza
 * della figura.
 *
 * Se le misure non chiudono una figura convessa non si inventa niente: torna
 * null, e chi chiama ripiega sull'ingombro come prima.
 */

import type { Foto, Punto, QuotaPoligono, Unita } from '../db/types';
import { angoliRettiDi, segmentiPoligono } from '../db/types';
import { abbondanzaAlVertice, sbordiLati } from './abbondanze';
import { offsetPoligono } from './punti';
import { poligonoDaAngoliRetti, type EsitoAngoli } from './poligonoAngoli';
import { distanzaReale, omografiaDiFoto } from './calibrazione';
import { applicaOmografia } from './omografia';
import { daMillimetri, inMillimetri } from '../utils/format';

/** quel poco della foto che serve a misurare: la scala e il piano */
type CalibFoto = Pick<Foto, 'scala' | 'piano' | 'piani'>;
import { poligonoConvesso, type MisureForma, type PuntoSagoma } from './sagome';

/**
 * IL POLIGONO RICOSTRUITO, triangolo per triangolo.
 *
 * Si parte dal lato 0 appoggiato sull'asse e si gira a ventaglio dal primo
 * vertice: ogni vertice nuovo sta a distanza nota dal vertice 0 (la
 * diagonale) e dal vertice precedente (il lato). Due cerchi, due incroci, e
 * si tiene quello che fa girare la figura sempre nello stesso verso — l'altro
 * la ripiegherebbe su sé stessa.
 *
 * `lati[i]` va dal vertice i al vertice i+1 (l'ultimo chiude sul vertice 0);
 * `diagonali[k]` va dal vertice 0 al vertice k+2.
 */
export function poligonoDaLati(lati: number[], diagonali: number[]): PuntoSagoma[] | null {
  const n = lati.length;
  if (n < 3 || diagonali.length !== n - 3) return null;
  if (lati.some((v) => !(v > 0)) || diagonali.some((v) => !(v > 0))) return null;

  /** la distanza dal vertice 0 al vertice k */
  const raggio = (k: number) => (k === 1 ? lati[0] : k === n - 1 ? lati[n - 1] : diagonali[k - 2]);

  const V: Array<[number, number]> = [
    [0, 0],
    [lati[0], 0]
  ];
  for (let k = 2; k < n; k++) {
    const r0 = raggio(k);
    const r1 = lati[k - 1];
    const prec = V[k - 1];
    const d = Math.hypot(prec[0], prec[1]);
    // i due cerchi si devono incontrare: se no i numeri non chiudono
    if (!(d > 0) || r0 + r1 <= d || Math.abs(r0 - r1) >= d) return null;
    const dPrec = raggio(k - 1);
    const a = (d * d + r0 * r0 - r1 * r1) / (2 * d);
    const hq = r0 * r0 - a * a;
    if (hq <= 0) return null;
    const h = Math.sqrt(hq);
    const ux = prec[0] / d;
    const uy = prec[1] / d;
    // dei due incroci si tiene quello che tiene il giro antiorario
    const scelte: Array<[number, number]> = [
      [a * ux - h * uy, a * uy + h * ux],
      [a * ux + h * uy, a * uy - h * ux]
    ];
    const giusto = scelte.find((q) => prec[0] * q[1] - prec[1] * q[0] > 1e-9);
    if (!giusto) return null;
    void dPrec;
    V.push(giusto);
  }

  // in coordinate del disegno: y verso il basso e riquadro appoggiato in (0,0)
  const maxY = Math.max(...V.map((q) => q[1]));
  const minX = Math.min(...V.map((q) => q[0]));
  const punti = V.map((q): PuntoSagoma => [
    Math.round((q[0] - minX) * 1e6) / 1e6,
    Math.round((maxY - q[1]) * 1e6) / 1e6
  ]);
  return poligonoConvesso(punti) ? punti : null;
}


/**
 * IL VERSO DELLA FIGURA LO DÀ IL DISEGNO.
 *
 * `poligonoDaLati` qui sopra appoggia il lato 0 sull'asse e costruisce da lì:
 * la FORMA che esce è giusta, il VERSO è quello che càpita — dipende da quale
 * lato è stato disegnato per primo. La stessa parete, disegnata partendo dallo
 * spigolo accanto, usciva ruotata di un quarto di giro; partendo dalla falda
 * usciva INCLINATA di venti gradi, e il suo riquadro passava da 400×345 a
 * 494×348 centimetri.
 *
 * Non è un dettaglio estetico. Il riquadro gonfiato manda il pezzo fuori
 * misura dal supporto, i teli vengono tagliati lungo le verticali del
 * riquadro — che su una parete inclinata non sono le verticali del MURO, e le
 * giunzioni escono in diagonale — e un trapezio girato non si riconosce più
 * come trapezio: diventa una sagoma qualunque, descritta per vertici. Era
 * esattamente quello che si vedeva nel piano di taglio dell'hotel: un telo
 * largo 1350 con il lato di fondo da 1362,5, cioè in diagonale.
 *
 * Quindi: le misure fanno la forma, il disegno la gira. Si cerca la rotazione
 * che sovrappone meglio la figura ricostruita ai punti del disegno — il conto
 * in forma chiusa, non a tentativi — e prima si controlla il VERSO DI GIRO: se
 * la figura è venuta rovesciata la si specchia, perché un pezzo specchiato si
 * applica sulla faccia sbagliata del muro ed è un errore che non si recupera.
 */
function versoDelDisegno(
  vertici: PuntoSagoma[],
  riferimento: PuntoSagoma[]
): PuntoSagoma[] {
  if (vertici.length !== riferimento.length || vertici.length < 3) return vertici;

  /** l'area con il segno: dice da che parte gira il poligono */
  const giro = (p: PuntoSagoma[]) => {
    let doppia = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      doppia += a[0] * b[1] - b[0] * a[1];
    }
    return doppia;
  };

  // se gira al contrario del disegno la figura è il ROVESCIO di quella giusta
  let fig = giro(vertici) * giro(riferimento) < 0
    ? vertici.map(([x, y]): PuntoSagoma => [-x, y])
    : vertici.slice();

  const medio = (p: PuntoSagoma[]) => [
    p.reduce((s, q) => s + q[0], 0) / p.length,
    p.reduce((s, q) => s + q[1], 0) / p.length
  ];
  const [fx, fy] = medio(fig);
  const [rx, ry] = medio(riferimento);

  // la rotazione che sovrappone meglio le due nuvole di punti: l'angolo che
  // annulla la derivata della somma degli scarti al quadrato
  let sen = 0;
  let cos = 0;
  for (let i = 0; i < fig.length; i++) {
    const ax = fig[i][0] - fx;
    const ay = fig[i][1] - fy;
    const bx = riferimento[i][0] - rx;
    const by = riferimento[i][1] - ry;
    sen += ax * by - ay * bx;
    cos += ax * bx + ay * by;
  }
  if (sen !== 0 || cos !== 0) {
    const n = Math.hypot(sen, cos);
    const c = cos / n;
    const s = sen / n;
    fig = fig.map(([x, y]): PuntoSagoma => [
      (x - fx) * c - (y - fy) * s,
      (x - fx) * s + (y - fy) * c
    ]);
  }

  // appoggiata di nuovo in (0,0), e i millesimi di millimetro buttati: sono
  // il residuo del conto, non una misura
  const minX = Math.min(...fig.map((q) => q[0]));
  const minY = Math.min(...fig.map((q) => q[1]));
  return fig.map((q): PuntoSagoma => [
    Math.round((q[0] - minX) * 1e6) / 1e6,
    Math.round((q[1] - minY) * 1e6) / 1e6
  ]);
}

/**
 * I PUNTI DEL DISEGNO COME STANNO SUL MURO.
 *
 * Con il piano di riferimento si passano per l'omografia e la prospettiva
 * sparisce: quello che resta è la parete vista di fronte, ed è il riferimento
 * giusto per girare la figura. Senza piano restano i pixel della foto, che
 * vanno bene lo stesso — una foto si scatta più o meno in piano, e comunque è
 * il disegno che l'artigiano ha davanti agli occhi.
 */
function disegnoRaddrizzato(q: QuotaPoligono, foto: CalibFoto | null): PuntoSagoma[] {
  const grezzi = q.punti.map((p): PuntoSagoma => [p.x, p.y]);
  if (!foto) return grezzi;
  const piano = omografiaDiFoto(foto, q.punti);
  if (!piano) return grezzi;
  return q.punti.map((p) => {
    const r = applicaOmografia(piano.H, p);
    return [r.x, r.y] as PuntoSagoma;
  });
}

/** la misura scritta su un segmento: quella netta, a vista */
function quotato(q: QuotaPoligono, da: number, a: number): number | null {
  for (const s of segmentiPoligono(q)) {
    if ((s.da !== da || s.a !== a) && (s.da !== a || s.a !== da)) continue;
    if (s.valore === null || !(s.valore > 0)) continue;
    return s.valore;
  }
  return null;
}

/**
 * LA SAGOMA DI TAGLIO DI UNA POLILINEA: la netta, con ogni lato spostato in
 * fuori di quello che gli chiedono le abbondanze.
 *
 * Prima qui si allungavano i LATI, sommando l'abbondanza alla misura scritta
 * e ricostruendo la figura da capo. Ma allungare un lato da solo non gonfia
 * una forma: la deforma. Su una parete a sei lati il montante allungato di
 * dieci centimetri usciva anche più INCLINATO, perché la figura si richiude
 * come può attorno alle misure nuove, e il pezzo che ne veniva non era quello
 * netto con dieci di abbondanza: era un altro pezzo. Sul quadrilatero invece
 * l'app ha sempre fatto la cosa giusta — ogni lato in fuori, gli angoli dove
 * si reincontrano — ed è quella che si fa anche qui.
 *
 * I vertici tornano NEL RIQUADRO DELLA FORMA NETTA: chi vuole l'ingombro del
 * pezzo da tagliare misura quanto sbordano, e sa anche da che parte.
 */
export function sagomaTaglioPoligono(
  q: QuotaPoligono,
  netta: MisureForma | null
): PuntoSagoma[] | null {
  const v = netta?.vertici;
  if (!v || v.length < 3 || v.length !== q.punti.length) return null;
  const sbordi = sbordiLati(q, abbondanzaAlVertice);
  if (!sbordi.some((x) => x > 0)) return v.map((p): PuntoSagoma => [p[0], p[1]]);
  return offsetPoligono(
    v.map(([x, y]) => ({ x, y })),
    sbordi
  ).map((p): PuntoSagoma => [p.x, p.y]);
}

/**
 * LA SAGOMA DI UNA POLILINEA DI CINQUE LATI O PIÙ.
 *
 * Per tre e quattro lati ci sono già le regole loro — il triangolo dai tre
 * lati, la falda e il quadrilatero storto — che sanno anche dare un nome alla
 * forma. Qui si prende tutto il resto, dove un nome non c'è e il pezzo va
 * descritto per vertici.
 */
export function sagomaPoligonoQuotato(
  q: QuotaPoligono,
  foto: CalibFoto | null,
  conAbbondanze: boolean
): MisureForma | null {
  const netta = sagomaNettaPoligono(q, foto);
  if (!netta || !conAbbondanze) return netta;
  const taglio = sagomaTaglioPoligono(q, netta);
  if (!taglio) return netta;
  // riappoggiata in (0,0): l'abbondanza esce anche dal bordo di sopra e di
  // sinistra, e un pezzo con le coordinate negative non lo si piazza
  const minX = Math.min(...taglio.map((p) => p[0]));
  const minY = Math.min(...taglio.map((p) => p[1]));
  const vertici = taglio.map((p): PuntoSagoma => [p[0] - minX, p[1] - minY]);
  const larghezza = Math.max(...vertici.map((p) => p[0]));
  const altezza = Math.max(...vertici.map((p) => p[1]));
  if (!(larghezza > 0 && altezza > 0)) return netta;
  return { forma: 'quad', larghezza, altezza, vertici };
}

/** la sagoma NETTA, a vista: le misure scritte comandano, il disegno la gira */
function sagomaNettaPoligono(q: QuotaPoligono, foto: CalibFoto | null): MisureForma | null {
  const n = q.punti.length;
  if (n < 5) return null;

  /** quanto è lungo, sul DISEGNO, il segmento fra due vertici */
  const disegnato = (i: number, j: number): number | null => {
    const p1 = q.punti[i];
    const p2 = q.punti[j];
    if (!p1 || !p2) return null;
    // col piano di riferimento la distanza è quella VERA sul muro: la
    // prospettiva è già tolta, e la stima parte da lì invece che dai pixel.
    // Non arrotondata: qui le distanze si sommano in una figura, e gli
    // arrotondamenti si sommerebbero con loro
    const m = foto ? distanzaReale(foto, p1, p2) : null;
    if (m && m.valore > 0) {
      return daMillimetri(inMillimetri(m.valore, m.unita), q.unita);
    }
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return d > 0 ? d : null;
  };

  const lati: Array<number | null> = [];
  const disLati: Array<number | null> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    lati.push(quotato(q, i, j));
    disLati.push(disegnato(i, j));
  }

  /**
   * GLI SPIGOLI DICHIARATI A SQUADRO COMANDANO, e tolgono di mezzo il piano.
   *
   * Quando ci sono, la figura non si costruisce più a ventaglio dalle
   * diagonali — che il disegno deve indovinare — ma si CAMMINA sul perimetro:
   * a ogni spigolo dichiarato si sterza di novanta esatti, e quello che resta
   * lo decide la chiusura del giro, cioè le misure. Al disegno si chiede
   * soltanto da che parte gira ogni spigolo, che è una cosa che un dito su una
   * foto sa dire benissimo anche senza piano di riferimento.
   */
  const retti = angoliRettiDi(q);
  if (retti.some(Boolean)) {
    const giro = giroDelPerimetro(q, foto, lati, retti);
    if (giro) {
      const larghezza = Math.max(...giro.vertici.map((p) => p[0]));
      const altezza = Math.max(...giro.vertici.map((p) => p[1]));
      if (larghezza > 0 && altezza > 0) {
        return { forma: 'quad', larghezza, altezza, vertici: giro.vertici };
      }
    }
  }

  /**
   * DA DISEGNO A REALE: il rapporto medio fra quello che è stato misurato e
   * quello che si vede. Con il piano di riferimento vale quasi uno — la
   * distanza sul piano è già in misure vere — e serve solo a non far litigare
   * le quote scritte con la scala del piano.
   */
  const rapporti: number[] = [];
  for (let i = 0; i < n; i++) {
    const l = lati[i];
    const d = disLati[i];
    if (l !== null && d !== null && d > 0) rapporti.push(l / d);
  }
  if (rapporti.length === 0) return null;
  const scala = rapporti.reduce((s, r) => s + r, 0) / rapporti.length;

  const stimato = (i: number, j: number): number | null => {
    const d = disegnato(i, j);
    return d === null ? null : d * scala;
  };

  const latiVeri: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = lati[i] ?? stimato(i, (i + 1) % n);
    if (v === null || !(v > 0)) return null;
    latiVeri.push(v);
  }
  const diagonali: number[] = [];
  for (let k = 2; k <= n - 2; k++) {
    const v = quotato(q, 0, k) ?? stimato(0, k);
    if (v === null || !(v > 0)) return null;
    diagonali.push(v);
  }

  const grezzi = poligonoDaLati(latiVeri, diagonali);
  if (!grezzi) return null;
  // la forma è fatta: ora la si gira come sta sul muro
  const vertici = versoDelDisegno(grezzi, disegnoRaddrizzato(q, foto));
  const larghezza = Math.max(...vertici.map((p) => p[0]));
  const altezza = Math.max(...vertici.map((p) => p[1]));
  if (!(larghezza > 0 && altezza > 0)) return null;
  return { forma: 'quad', larghezza, altezza, vertici };
}

/** il giro del perimetro con gli spigoli dichiarati: un posto solo */
function giroDelPerimetro(
  q: QuotaPoligono,
  foto: CalibFoto | null,
  lati: Array<number | null>,
  retti: boolean[]
): EsitoAngoli | null {
  return poligonoDaAngoliRetti({ lati, retti, disegno: disegnoRaddrizzato(q, foto) });
}

/**
 * COME SI CHIUDE IL PERIMETRO con gli spigoli dichiarati a squadro.
 *
 * Serve a dirlo a chi misura, mentre misura: se con quegli angoli le quote
 * non tornano, da qualche parte c'è una misura sbagliata o uno spigolo che a
 * squadro non è. È un controllo che prima non si poteva nemmeno fare — senza
 * angoli dichiarati un perimetro chiude sempre, perché la forma si piega
 * finché torna — e vale più di molte verifiche: lo si scopre in cantiere, col
 * metro ancora in mano, invece che al banco di taglio.
 */
export function chiusuraAngoliRetti(
  q: QuotaPoligono,
  foto: CalibFoto | null
): EsitoAngoli | null {
  const n = q.punti.length;
  if (n < 3) return null;
  const retti = angoliRettiDi(q);
  if (!retti.some(Boolean)) return null;
  const lati: Array<number | null> = [];
  for (let i = 0; i < n; i++) lati.push(quotato(q, i, (i + 1) % n));
  return giroDelPerimetro(q, foto, lati, retti);
}

/** i vertici reali di una polilinea, nell'unità della quota: per chi disegna */
export function verticiPoligono(
  q: QuotaPoligono,
  foto: CalibFoto | null,
  conAbbondanze = true
): { vertici: PuntoSagoma[]; larghezza: number; altezza: number; unita: Unita } | null {
  const s = sagomaPoligonoQuotato(q, foto, conAbbondanze);
  if (!s || !s.vertici) return null;
  return { vertici: s.vertici, larghezza: s.larghezza, altezza: s.altezza, unita: q.unita };
}

/** il punto come lo vuole la calibrazione, per chi ha solo una coppia */
export const comePunto = (p: PuntoSagoma): Punto => ({ x: p[0], y: p[1] });
