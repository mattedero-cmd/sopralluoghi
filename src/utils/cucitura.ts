/**
 * IL CUCITO VERO E PROPRIO: dagli scatti alla foto panoramica.
 *
 * La geometria sta in `geometry/panoramica.ts` — angoli, abbinamenti,
 * omografie — e non tocca il DOM: si prova da sola. Qui c'è il resto, che il
 * DOM ce l'ha per forza: decodificare i file, deformare gli scatti sulla tela
 * e sfumare le giunzioni.
 *
 * La deformazione si fa a TRIANGOLI. Il canvas sa disegnare un'immagine solo
 * con una trasformazione affine, che una prospettiva non è; ma su un
 * triangolino piccolo la prospettiva È quasi affine. Si taglia allora ogni
 * scatto in una griglia di triangoli, e ognuno si disegna con la sua affine:
 * l'errore che resta è sotto il pixel, e il disegno lo fa la scheda grafica
 * invece di un ciclo su venti milioni di pixel.
 */

import {
  applicaOmografia,
  calcolaOmografia,
  prodotto,
  type Omografia
} from '../geometry/omografia';
import type { Punto } from '../db/types';
import {
  abbina,
  allineamentoCredibile,
  caratteristiche,
  inGrigio,
  omografiaFraScatti,
  reteDiScatti,
  telaDaVerso,
  versoDallaRete,
  type Grigia,
  type Scatto
} from '../geometry/panoramica';

/** lato massimo su cui si cercano gli angoli: oltre è tempo buttato */
const LATO_RICERCA = 1400;
/**
 * QUANTI SCATTI PER UNA PANORAMICA.
 *
 * Erano otto, e il numero non veniva dalla geometria: veniva dalla memoria,
 * perché si tenevano tutte le foto aperte insieme. Adesso se ne apre una per
 * volta, e il tetto lo mette il tempo — ogni scatto in più costa due
 * abbinamenti — non il telefono che chiude la scheda.
 */
const SCATTI_MAX = 24;
/** quanti pixel può avere al massimo la tela finale */
const PIXEL_MAX = 20_000_000;

/**
 * IL TETTO VERO DELLE TELE SU QUESTO DISPOSITIVO, misurato invece che indovinato.
 *
 * Un telefono non permette una tela grande quanto si vuole. Su iOS c'è un
 * limite all'area — storicamente sedici milioni e settecentomila pixel — e
 * quando lo si supera non arriva nessun errore: la tela si crea, si disegna,
 * e resta VUOTA. Una foto vuota non ha spigoli, e la panoramica si ferma
 * dicendo che il secondo scatto non si aggancia al primo, che è la cosa più
 * lontana dalla verità che potesse dire.
 *
 * Le foto di un iPhone recente sono da 24,5 milioni di pixel: un colpo solo
 * sopra il tetto. E il guaio è invisibile da qui — sul computer quel limite
 * non c'è, quindi la prova passa e il telefono no.
 *
 * Scrivere un numero fisso sarebbe indovinare due volte: il limite cambia con
 * il modello e con la versione. Si misura: si prova una tela, ci si scrive un
 * pixel nell'angolo più lontano, e lo si rilegge. Se torna, quella tela
 * regge. Si scende finché non regge, una volta sola per sessione.
 */
let tettoMisurato: number | null = null;

function telaRegge(area: number): boolean {
  // 4:3, come una foto
  const w = Math.max(1, Math.round(Math.sqrt((area * 4) / 3)));
  const h = Math.max(1, Math.round(w * 0.75));
  let c: HTMLCanvasElement | null = document.createElement('canvas');
  try {
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return false;
    // l'angolo più lontano è quello che cade fuori quando la tela è troppo grande
    g.fillStyle = '#ff0000';
    g.fillRect(w - 2, h - 2, 2, 2);
    const p = g.getImageData(w - 1, h - 1, 1, 1).data;
    return p[0] > 200 && p[3] > 200;
  } catch {
    return false;
  } finally {
    if (c) {
      c.width = 0;
      c.height = 0;
      c = null;
    }
  }
}

export function tettoDellaTela(): number {
  if (tettoMisurato !== null) return tettoMisurato;
  if (typeof document === 'undefined') return PIXEL_MAX;
  for (const milioni of [40, 32, 24, 20, 16, 12, 8, 6, 4]) {
    if (telaRegge(milioni * 1_000_000)) {
      tettoMisurato = milioni * 1_000_000;
      return tettoMisurato;
    }
  }
  tettoMisurato = 2_000_000;
  return tettoMisurato;
}

/**
 * Quanto può essere grande UNO SCATTO mentre lo si lavora.
 *
 * Non serve tenerlo a piena risoluzione: la tela finale viene comunque
 * ridotta per stare nel tetto, e con cinque scatti ognuno ci finisce dentro a
 * poco più di metà del suo lato. Si sta larghi il doppio del necessario e si
 * resta lontani dal limite del dispositivo.
 */
function tettoDelloScatto(): number {
  return Math.max(2_000_000, Math.floor(tettoDellaTela() * 0.6));
}
/** la griglia parte di qui e si infittisce finché serve */
const CELLE_X = 8;
const CELLE_Y = 6;
/** oltre questa densità non si va: il tempo cresce, la resa no */
const CELLE_MAX = 64;
/** errore che ci si concede nell'approssimare la prospettiva, in pixel */
const ERRORE_OBIETTIVO = 0.35;

export interface EsitoCucitura {
  blob: Blob;
  larghezza: number;
  altezza: number;
  /** dove la tela è coperta da almeno uno scatto (bianco) e dove no (nero) */
  copertura: { dati: Uint8ClampedArray; larghezza: number; altezza: number } | null;
  /** errore medio di riproiezione su ogni giunzione, in pixel dello scatto */
  errori: number[];
  /** quanti scatti sono stati cuciti */
  scatti: number;
}

export class CucituraFallita extends Error {}

/** l'immagine ridotta al lato di ricerca, con il fattore usato */
function perLaRicerca(
  bitmap: CanvasImageSource,
  larghezza: number,
  altezza: number,
  lato = LATO_RICERCA
): { grigia: Grigia; fattore: number } {
  const fattore = Math.min(1, lato / Math.max(larghezza, altezza));
  const w = Math.max(1, Math.round(larghezza * fattore));
  const h = Math.max(1, Math.round(altezza * fattore));

  // A METÀ PER VOLTA, non in un colpo solo.
  //
  // Da 5712 px a 1050 c'è un fattore cinque e mezzo, e proprio lì i browser si
  // comportano in modo diverso: chi rimpicciolisce bene fa la media di tutti i
  // pixel che finiscono in uno, chi va di fretta ne prende uno e butta gli
  // altri. Il secondo non «sfoca di più»: INVENTA struttura, perché quale
  // pixel sopravvive dipende dalla griglia di campionamento. Gli spigoli che
  // ne escono cadono su artefatti che non si ripetono nello scatto accanto, e
  // gli abbinamenti crollano.
  //
  // Dimezzare è l'unico passo che ogni browser fa bene — quattro pixel in uno,
  // niente da scegliere — e ripetuto porta vicino al bersaglio prima
  // dell'ultimo ritocco. Così la panoramica non dipende più da chi la cuce:
  // sulle stesse cinque foto, il legame più povero passava da 38 abbinamenti a
  // 63 secondo il modo di rimpicciolire, e 38 era sotto la soglia.
  let sorgente: CanvasImageSource = bitmap;
  let sw = larghezza;
  let sh = altezza;
  while (sw >= w * 2 && sh >= h * 2) {
    const mezzo = document.createElement('canvas');
    mezzo.width = Math.max(1, Math.round(sw / 2));
    mezzo.height = Math.max(1, Math.round(sh / 2));
    const g = mezzo.getContext('2d');
    if (!g) break;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(sorgente, 0, 0, mezzo.width, mezzo.height);
    sorgente = mezzo;
    sw = mezzo.width;
    sh = mezzo.height;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new CucituraFallita('Il dispositivo non permette di elaborare le immagini.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sorgente, 0, 0, sw, sh, 0, 0, w, h);
  return { grigia: inGrigio(ctx.getImageData(0, 0, w, h).data, w, h), fattore };
}

/**
 * L'omografia trovata sulle immagini RIDOTTE, riportata alla scala piena.
 *
 * Ridurre un'immagine è un cambio di coordinate come un altro: si scende alla
 * scala della sorgente, si applica l'omografia, si risale a quella della
 * destinazione. I due scatti possono essere stati ridotti di quanto diverso —
 * capita, se hanno risoluzioni diverse — e i due fattori vanno tenuti distinti.
 */
export function inScalaPiena(
  H: Omografia,
  fattoreSorgente: number,
  fattoreDestinazione: number
): Omografia {
  const giu: Omografia = [fattoreSorgente, 0, 0, 0, fattoreSorgente, 0, 0, 0, 1];
  const su: Omografia = [
    1 / fattoreDestinazione, 0, 0,
    0, 1 / fattoreDestinazione, 0,
    0, 0, 1
  ];
  return prodotto(prodotto(su, H), giu) as Omografia;
}

/**
 * L'affine che porta un triangolo su un altro. Tre punti la determinano tutta:
 * è il sistema 6×6 che si risolve a mano, senza scomodare niente.
 */
export function affineFraTriangoli(
  s: [number, number][],
  d: [number, number][]
): [number, number, number, number, number, number] | null {
  const det =
    (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const a =
    ((d[1][0] - d[0][0]) * (s[2][1] - s[0][1]) - (d[2][0] - d[0][0]) * (s[1][1] - s[0][1])) / det;
  const c =
    ((d[2][0] - d[0][0]) * (s[1][0] - s[0][0]) - (d[1][0] - d[0][0]) * (s[2][0] - s[0][0])) / det;
  const b =
    ((d[1][1] - d[0][1]) * (s[2][1] - s[0][1]) - (d[2][1] - d[0][1]) * (s[1][1] - s[0][1])) / det;
  const dd =
    ((d[2][1] - d[0][1]) * (s[1][0] - s[0][0]) - (d[1][1] - d[0][1]) * (s[2][0] - s[0][0])) / det;
  const e = d[0][0] - a * s[0][0] - c * s[0][1];
  const f = d[0][1] - b * s[0][0] - dd * s[0][1];
  return [a, b, c, dd, e, f];
}

/** il triangolo allargato di poco attorno al suo baricentro: niente fessure */
function gonfio(t: [number, number][], quanto = 0.7): [number, number][] {
  const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
  const cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
  return t.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * quanto, y + ((y - cy) / d) * quanto] as [number, number];
  });
}

/**
 * QUANTO SBAGLIA LA GRIGLIA. Dentro un triangolo si usa un'affine al posto
 * della prospettiva: l'errore è massimo al centro del triangolo, e si misura
 * confrontando i due risultati proprio lì. Serve a scegliere quanti triangoli
 * fare — pochi e si vede, troppi e il telefono ci mette un minuto.
 */
export function erroreDellaGriglia(
  w: number,
  h: number,
  H: Omografia,
  celleX = CELLE_X,
  celleY = CELLE_Y
): number {
  const px = w / celleX;
  const py = h / celleY;
  let peggio = 0;
  for (let j = 0; j < celleY; j++) {
    for (let i = 0; i < celleX; i++) {
      for (const [s, ang] of [
        [
          [
            [i * px, j * py],
            [(i + 1) * px, j * py],
            [i * px, (j + 1) * py]
          ]
        ],
        [
          [
            [(i + 1) * px, j * py],
            [(i + 1) * px, (j + 1) * py],
            [i * px, (j + 1) * py]
          ]
        ]
      ].map((t) => [t[0] as [number, number][], t[0] as [number, number][]])) {
        void ang;
        const d = s.map(([x, y]) => {
          const q = applicaOmografia(H, { x, y });
          return [q.x, q.y] as [number, number];
        });
        const m = affineFraTriangoli(s, d);
        if (!m) continue;
        // il baricentro del triangolo: dove l'affine si discosta di più
        const cx = (s[0][0] + s[1][0] + s[2][0]) / 3;
        const cy = (s[0][1] + s[1][1] + s[2][1]) / 3;
        const vero = applicaOmografia(H, { x: cx, y: cy });
        const stimato = {
          x: m[0] * cx + m[2] * cy + m[4],
          y: m[1] * cx + m[3] * cy + m[5]
        };
        peggio = Math.max(peggio, Math.hypot(vero.x - stimato.x, vero.y - stimato.y));
      }
    }
  }
  return peggio;
}

/**
 * QUANTI TRIANGOLI SERVONO, per questa prospettiva e questo scatto.
 *
 * L'errore dell'approssimazione affine cala col quadrato del lato della
 * cella: si parte larghi e si raddoppia finché si sta sotto l'obiettivo. Una
 * panoramica di scatti quasi allineati se la cava con poche celle e ci mette
 * un attimo; una con la macchina girata forte ne chiede di più, e le paga.
 */
export function grigliaAdatta(
  w: number,
  h: number,
  H: Omografia,
  obiettivo = ERRORE_OBIETTIVO
): { x: number; y: number; errore: number } {
  let cx = CELLE_X;
  let cy = CELLE_Y;
  let errore = erroreDellaGriglia(w, h, H, cx, cy);
  while (errore > obiettivo && cx < CELLE_MAX && cy < CELLE_MAX) {
    cx = Math.min(CELLE_MAX, cx * 2);
    cy = Math.min(CELLE_MAX, cy * 2);
    errore = erroreDellaGriglia(w, h, H, cx, cy);
  }
  return { x: cx, y: cy, errore };
}

/** Disegna `sorgente` sulla tela deformandola con `H`, a triangoli. */
export function disegnaDeformata(
  ctx: CanvasRenderingContext2D,
  sorgente: CanvasImageSource,
  w: number,
  h: number,
  H: Omografia
): void {
  const { x: CELLE_X, y: CELLE_Y } = grigliaAdatta(w, h, H);
  const px = w / CELLE_X;
  const py = h / CELLE_Y;
  const nodo: Array<Array<[number, number]>> = [];
  for (let j = 0; j <= CELLE_Y; j++) {
    nodo[j] = [];
    for (let i = 0; i <= CELLE_X; i++) {
      const p = applicaOmografia(H, { x: i * px, y: j * py });
      nodo[j][i] = [p.x, p.y];
    }
  }
  for (let j = 0; j < CELLE_Y; j++) {
    for (let i = 0; i < CELLE_X; i++) {
      const sorg: Array<[number, number]> = [
        [i * px, j * py],
        [(i + 1) * px, j * py],
        [i * px, (j + 1) * py]
      ];
      const sorg2: Array<[number, number]> = [
        [(i + 1) * px, j * py],
        [(i + 1) * px, (j + 1) * py],
        [i * px, (j + 1) * py]
      ];
      const dest: Array<[number, number]> = [nodo[j][i], nodo[j][i + 1], nodo[j + 1][i]];
      const dest2: Array<[number, number]> = [
        nodo[j][i + 1],
        nodo[j + 1][i + 1],
        nodo[j + 1][i]
      ];
      for (const [s, d] of [
        [sorg, dest],
        [sorg2, dest2]
      ] as Array<[Array<[number, number]>, Array<[number, number]>]>) {
        const m = affineFraTriangoli(s as [number, number][], d as [number, number][]);
        if (!m) continue;
        const g = gonfio(d as [number, number][]);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(g[0][0], g[0][1]);
        ctx.lineTo(g[1][0], g[1][1]);
        ctx.lineTo(g[2][0], g[2][1]);
        ctx.closePath();
        ctx.clip();
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.drawImage(sorgente, 0, 0, w, h);
        ctx.restore();
      }
    }
  }
}

/**
 * Lo scatto con i bordi SFUMATI dalla parte in cui incontra il vicino.
 *
 * Due scatti sovrapposti non hanno mai la stessa luce: il telefono cambia
 * esposizione fra uno e l'altro, e una giunzione netta si vede come un
 * gradino. Sfumando l'ultimo decimo dello scatto verso il trasparente, i due
 * si mescolano e il gradino sparisce. Si sfuma SOLO il lato che tocca il
 * vicino: sui bordi esterni della panoramica la sfumatura sarebbe un alone.
 */
function conBordoSfumato(
  bitmap: CanvasImageSource,
  larghezza: number,
  altezza: number,
  sfumaSinistra: boolean,
  sfumaDestra: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = larghezza;
  canvas.height = altezza;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new CucituraFallita('Il dispositivo non permette di elaborare le immagini.');
  ctx.drawImage(bitmap, 0, 0);
  if (!sfumaSinistra && !sfumaDestra) return canvas;
  const fascia = Math.max(1, Math.round(larghezza * 0.12));
  const g = ctx.createLinearGradient(0, 0, larghezza, 0);
  const s = fascia / larghezza;
  g.addColorStop(0, sfumaSinistra ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
  g.addColorStop(s, 'rgba(0,0,0,1)');
  g.addColorStop(1 - s, 'rgba(0,0,0,1)');
  g.addColorStop(1, sfumaDestra ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, larghezza, altezza);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/**
 * IL RIQUADRO PIENO: il rettangolo PIÙ GRANDE che non tocca il vuoto lasciato
 * dal cucito.
 *
 * Una panoramica piana non è un rettangolo: gli scatti ai lati si inclinano e
 * restano dei cunei di fondo sopra e sotto, a farfalla. Qui si cerca il
 * rettangolo massimo che ne sta fuori — non uno qualunque: il massimo.
 *
 * Il modo ovvio — «stringi il lato messo peggio finché il bordo è pulito» — è
 * quello sbagliato, e si vede: su una farfalla i bordi alto e basso restano
 * sporchi più a lungo dei fianchi, così si continua a mangiare l'altezza e si
 * finisce con una striscia. (Provato: 933×44 su una tela 988×672.) Serve
 * l'algoritmo esatto: per ogni riga si guarda quanto sale la colonna di pieno
 * sopra ogni pixel, e su quell'istogramma si cerca il rettangolo massimo con
 * la pila. Costa quanto leggere l'immagine una volta.
 *
 * La maschera si legge a passo grosso: il ritaglio non ha bisogno del pixel —
 * è solo il punto di partenza, da lì si tira a mano — e su una panoramica da
 * venti megapixel leggere tutto costerebbe più del cucito.
 */
export function riquadroPieno(
  dati: Uint8ClampedArray,
  w: number,
  h: number,
  eVuoto: (r: number, g: number, b: number) => boolean = (r) => eScoperto(r),
  latoMaschera = 900
): { x: number; y: number; larghezza: number; altezza: number } {
  const passo = Math.max(1, Math.ceil(Math.max(w, h) / latoMaschera));
  const mw = Math.floor(w / passo);
  const mh = Math.floor(h / passo);
  if (mw < 2 || mh < 2) return { x: 0, y: 0, larghezza: w, altezza: h };

  // quanto è alta la colonna di pieno che finisce su questo pixel
  const colonna = new Int32Array(mw);
  let migliore = { x: 0, y: 0, larghezza: 0, altezza: 0, area: 0 };
  const pila: number[] = [];
  for (let j = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++) {
      const k = (Math.min(h - 1, j * passo) * w + Math.min(w - 1, i * passo)) * 4;
      colonna[i] = eVuoto(dati[k], dati[k + 1], dati[k + 2]) ? 0 : colonna[i] + 1;
    }
    // rettangolo massimo nell'istogramma della riga j
    pila.length = 0;
    for (let i = 0; i <= mw; i++) {
      const altezza = i === mw ? 0 : colonna[i];
      while (pila.length > 0 && colonna[pila[pila.length - 1]] >= altezza) {
        const alto = colonna[pila.pop()!];
        const sinistra = pila.length === 0 ? 0 : pila[pila.length - 1] + 1;
        const largo = i - sinistra;
        const area = largo * alto;
        if (area > migliore.area) {
          migliore = {
            x: sinistra,
            y: j - alto + 1,
            larghezza: largo,
            altezza: alto,
            area
          };
        }
      }
      pila.push(i);
    }
  }
  if (migliore.area === 0) return { x: 0, y: 0, larghezza: w, altezza: h };
  // si torna ai pixel veri, stando un passo dentro: la maschera è a campione
  // e il bordo esatto può cadere fra un campione e l'altro
  const x0 = Math.min(w - 2, (migliore.x + 1) * passo);
  const y0 = Math.min(h - 2, (migliore.y + 1) * passo);
  const x1 = Math.max(x0 + 1, (migliore.x + migliore.larghezza - 1) * passo);
  const y1 = Math.max(y0 + 1, (migliore.y + migliore.altezza - 1) * passo);
  return { x: x0, y: y0, larghezza: x1 - x0, altezza: y1 - y0 };
}

/**
 * DOV'È COPERTA LA TELA, saputo per geometria e non indovinato dal colore.
 *
 * Riconoscere i cunei di fondo «dal fatto che sono scuri» sembra comodo e non
 * funziona: l'interno di una finestra, una porta aperta, un'ombra sotto la
 * gronda sono scuri quanto il fondo, e il ritaglio comincerebbe a evitarli
 * come se fossero buchi. (Provato: una facciata con le finestre scure dava un
 * ritaglio di 39 px d'altezza.) Ma dove cade ogni scatto lo sappiamo con
 * esattezza — sono i quattro angoli passati per la sua omografia — e da lì la
 * maschera esce giusta per costruzione.
 */
export function mascheraCopertura(
  scatti: Scatto[],
  verso: Omografia[],
  larghezza: number,
  altezza: number,
  lato = 900
): { dati: Uint8ClampedArray; larghezza: number; altezza: number } | null {
  const k = Math.min(1, lato / Math.max(larghezza, altezza));
  const w = Math.max(2, Math.round(larghezza * k));
  const h = Math.max(2, Math.round(altezza * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  scatti.forEach((s, i) => {
    const angoli = [
      { x: 0, y: 0 },
      { x: s.larghezza, y: 0 },
      { x: s.larghezza, y: s.altezza },
      { x: 0, y: s.altezza }
    ].map((p) => applicaOmografia(verso[i], p));
    ctx.beginPath();
    angoli.forEach((p, j) => {
      if (j === 0) ctx.moveTo(p.x * k, p.y * k);
      else ctx.lineTo(p.x * k, p.y * k);
    });
    ctx.closePath();
    ctx.fill();
  });
  return { dati: ctx.getImageData(0, 0, w, h).data, larghezza: w, altezza: h };
}

/** nella maschera di copertura, nero = fuori da ogni scatto */
export const eScoperto = (r: number): boolean => r < 128;

/**
 * RADDRIZZA E RITAGLIA: il quadrilatero scelto diventa il rettangolo finale.
 *
 * Serve a due cose in un gesto solo. Se i quattro angoli restano quelli di un
 * rettangolo, è un semplice RITAGLIO. Se invece li si porta sui quattro
 * spigoli del muro, quel muro viene RADDRIZZATO — visto di fronte, come se la
 * macchina fosse stata lì davanti.
 *
 * E le misure restano valide: la foto è legata al muro da un'omografia, e
 * comporne un'altra dà ancora un'omografia. Le righe dritte restano dritte,
 * le quote continuano a leggersi, il piano prospettico pure.
 */
export async function raddrizza(
  sorgente: CanvasImageSource,
  larghezza: number,
  altezza: number,
  quad: [Punto, Punto, Punto, Punto],
  qualita = 0.9
): Promise<{ blob: Blob; larghezza: number; altezza: number }> {
  // il rettangolo di arrivo: la media dei lati opposti, così non si stira né
  // si schiaccia niente rispetto a com'era
  const lato = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y);
  let largo = Math.round((lato(quad[0], quad[1]) + lato(quad[3], quad[2])) / 2);
  let alto = Math.round((lato(quad[1], quad[2]) + lato(quad[0], quad[3])) / 2);
  // «Tieni tutta» su una panoramica lunga chiede una tela quanto la
  // panoramica: si resta sotto il tetto del dispositivo, o esce un ritaglio
  // nero senza che nessuno dica niente
  const tetto = tettoDellaTela();
  if (largo * alto > tetto) {
    const k = Math.sqrt(tetto / (largo * alto));
    largo = Math.max(9, Math.round(largo * k));
    alto = Math.max(9, Math.round(alto * k));
  }
  if (!(largo > 8) || !(alto > 8)) throw new CucituraFallita('Ritaglio troppo piccolo.');
  const H = calcolaOmografia(quad, [
    { x: 0, y: 0 },
    { x: largo, y: 0 },
    { x: largo, y: alto },
    { x: 0, y: alto }
  ]);
  const tela = document.createElement('canvas');
  tela.width = largo;
  tela.height = alto;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new CucituraFallita('Il dispositivo non permette di elaborare le immagini.');
  ctx.imageSmoothingQuality = 'high';
  disegnaDeformata(ctx, sorgente, larghezza, altezza, H);
  const blob = await new Promise<Blob | null>((res) => tela.toBlob(res, 'image/jpeg', qualita));
  if (!blob) throw new CucituraFallita('Non è stato possibile salvare il ritaglio.');
  return { blob, larghezza: largo, altezza: alto };
}

export interface OpzioniCucitura {
  /** lato lungo massimo della panoramica (px) */
  latoMax?: number;
  qualita?: number;
  /** avvisa dell'avanzamento: 0..1 */
  avanzamento?: (quota: number, cosa: string) => void;
}

/**
 * CUCE GLI SCATTI, in ordine. Il primo file è l'estremo di sinistra (o di
 * destra: basta che siano in fila), e ogni scatto deve sovrapporsi al
 * precedente di almeno un terzo.
 */
/**
 * L'ORIENTAMENTO SCRITTO DENTRO IL JPEG, e le misure che il file dichiara.
 *
 * Un telefono tenuto in verticale non gira i pixel: li scrive come li legge
 * il sensore — orizzontali — e mette in un'etichetta «questa va girata di un
 * quarto». Chi guarda la foto applica l'etichetta, e nessuno se ne accorge
 * mai. Tranne noi: `createImageBitmap` la applica su un browser e non
 * sull'altro, e la stessa panoramica esce dritta di qua e coricata di là.
 * Peggio: se non la si applica, una panoramica scattata girando in
 * orizzontale scorre in VERTICALE nei pixel, e le sfumature dei bordi
 * finiscono sui lati sbagliati.
 *
 * Qui l'etichetta si legge da soli, e si confronta con quello che il browser
 * ha effettivamente deciso di fare. Così non si dipende più da chi la applica.
 */
export async function etichettaJpeg(
  blob: Blob
): Promise<{
  orientamento: number;
  larghezza: number;
  altezza: number;
  /** quando è stato premuto l'otturatore, in millisecondi; null se non c'è */
  istante: number | null;
} | null> {
  // bastano i primi blocchi: EXIF e la testata delle misure stanno all'inizio
  const b = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer());
  if (b.byteLength < 4 || b.getUint16(0) !== 0xffd8) return null;
  let orientamento = 1;
  let larghezza = 0;
  let altezza = 0;
  let istante: number | null = null;
  let i = 2;
  while (i + 4 <= b.byteLength) {
    if (b.getUint8(i) !== 0xff) {
      i++;
      continue;
    }
    const marchio = b.getUint8(i + 1);
    if (marchio === 0xd8 || marchio === 0x01 || (marchio >= 0xd0 && marchio <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marchio === 0xda) break; // comincia l'immagine: oltre non serve
    const lungo = b.getUint16(i + 2);
    // SOF: le misure vere dei pixel scritti nel file
    const eSof = marchio >= 0xc0 && marchio <= 0xcf && marchio !== 0xc4 && marchio !== 0xc8 && marchio !== 0xcc;
    if (eSof && i + 9 <= b.byteLength) {
      altezza = b.getUint16(i + 5);
      larghezza = b.getUint16(i + 7);
    }
    if (marchio === 0xe1 && i + 10 < b.byteLength) {
      let testo = '';
      for (let k = i + 4; k < i + 8; k++) testo += String.fromCharCode(b.getUint8(k));
      if (testo === 'Exif') {
        try {
          const t = i + 10;
          const piccolo = b.getUint8(t) === 0x49;
          const l16 = (o: number) => b.getUint16(o, piccolo);
          const l32 = (o: number) => b.getUint32(o, piccolo);
          const ifd = t + l32(t + 4);
          const quanti = l16(ifd);
          let sottoExif = 0;
          for (let k = 0; k < quanti; k++) {
            const voce = ifd + 2 + k * 12;
            const chiave = l16(voce);
            if (chiave === 0x0112) orientamento = l16(voce + 8);
            if (chiave === 0x8769) sottoExif = t + l32(voce + 8);
          }
          // L'ORA DELLO SCATTO sta nel blocco Exif vero e proprio, che si
          // raggiunge seguendo il rimando 0x8769. Serve per rimettere in fila
          // le foto prese dal rullino: là arrivano nell'ordine in cui le si
          // tocca, non in quello in cui sono state fatte.
          if (sottoExif > 0 && sottoExif + 2 < b.byteLength) {
            const n2 = l16(sottoExif);
            for (let k = 0; k < n2; k++) {
              const voce = sottoExif + 2 + k * 12;
              if (voce + 12 > b.byteLength) break;
              if (l16(voce) !== 0x9003) continue; // DateTimeOriginal
              const dove = t + l32(voce + 8);
              if (dove + 19 > b.byteLength) break;
              let testo = '';
              for (let q = dove; q < dove + 19; q++) testo += String.fromCharCode(b.getUint8(q));
              // «2026:08:31 14:03:22» — non è una data ISO, va tradotta
              const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(testo);
              if (m) {
                const v = new Date(
                  +m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]
                ).getTime();
                if (Number.isFinite(v)) istante = v;
              }
            }
          }
        } catch {
          // etichetta malformata: si tiene l'orientamento neutro
        }
      }
    }
    i += 2 + lungo;
  }
  if (!(larghezza > 0) || !(altezza > 0)) return null;
  return { orientamento, larghezza, altezza, istante };
}

/**
 * LE FOTO RIMESSE IN FILA PER ORA DI SCATTO.
 *
 * Il rullino consegna le foto nell'ordine in cui le si è TOCCATE, non in
 * quello in cui sono state fatte. Basta sbagliare un tocco e la cucitura si
 * rifiuta dicendo che la seconda non si aggancia alla prima — e chi guarda
 * non ha modo di capire che il difetto era l'ordine.
 *
 * Per una panoramica l'ordine del tempo È l'ordine della fila: si è girato o
 * camminato in un verso solo. Quindi si legge l'ora dentro ogni foto e si
 * ordina. Ma solo se ce l'hanno TUTTE: se anche una sola non la porta, si
 * lascia tutto com'era invece di mescolare foto datate e foto senza data,
 * che è il modo migliore per rompere una fila che era giusta.
 */
export async function inOrdineDiScatto<T extends Blob>(file: T[]): Promise<T[]> {
  const conOra = await Promise.all(
    file.map(async (f, i) => ({
      f,
      i,
      quando: (await etichettaJpeg(f).catch(() => null))?.istante ?? null
    }))
  );
  if (!conOra.every((x) => x.quando !== null)) return [...file];
  // a parità di secondo si tiene l'ordine in cui sono arrivate
  conOra.sort((a, b) => a.quando! - b.quando! || a.i - b.i);
  return conOra.map((x) => x.f);
}

/**
 * LO SCATTO APERTO DRITTO, comunque si comporti il browser.
 *
 * Si guarda che FORMA ha il file e che forma ha l'immagine decodificata: se il
 * file è disteso e l'etichetta dice «un quarto di giro», quello che si vede
 * dev'essere in piedi. Se arriva ancora disteso, l'etichetta non l'ha
 * applicata nessuno e la applica l'app.
 *
 * Si guarda la forma e non le misure esatte apposta: un telefono a corto di
 * memoria decodifica le foto grandi già rimpicciolite, e con le misure esatte
 * non combacerebbe più niente.
 *
 * Si raddrizzano solo i quarti di giro (etichette 5-8), gli unici che si
 * riconoscono con certezza dalla forma. Un capovolgimento non la cambia e non
 * si può distinguere da qui: sarebbe una scommessa, e una foto capovolta si
 * cuce comunque bene — coricata no.
 *
 * E la tela in cui si gira non supera mai il tetto del dispositivo: una tela
 * troppo grande non dà errore, resta vuota, e una foto vuota non ha spigoli.
 */
/**
 * VA GIRATA DA NOI, questa foto? E di quanto.
 *
 * Torna 0 se non c'è niente da fare — o perché l'etichetta non chiede un
 * quarto di giro, o perché il browser l'ha già applicata — altrimenti il
 * numero dell'orientamento da applicare (5, 6, 7 o 8).
 *
 * Si confrontano le FORME, non le misure: un telefono a corto di memoria
 * decodifica le foto grandi già rimpicciolite, e con le misure esatte non
 * combacerebbe più niente — si finirebbe per girare una foto già girata, o
 * per non girarne una che andava girata. E se capita solo su ALCUNI scatti,
 * quelli restano coricati rispetto agli altri e non si agganciano più.
 *
 * Su una foto quadrata la forma non dice nulla, e non si scommette.
 */
export function giroDaApplicare(
  etichetta: { orientamento: number; larghezza: number; altezza: number } | null,
  larghezzaDecodificata: number,
  altezzaDecodificata: number
): number {
  if (!etichetta) return 0;
  const o = etichetta.orientamento;
  if (o < 5 || o > 8) return 0;
  if (etichetta.larghezza === etichetta.altezza) return 0;
  if (larghezzaDecodificata === altezzaDecodificata) return 0;
  const fileDisteso = etichetta.larghezza > etichetta.altezza;
  const arrivaDisteso = larghezzaDecodificata > altezzaDecodificata;
  // se arriva con la stessa forma del file, il quarto di giro non l'ha
  // applicato nessuno e tocca a noi
  return arrivaDisteso === fileDisteso ? o : 0;
}

export async function apriDritta(
  blob: Blob
): Promise<{ immagine: ImageBitmap | HTMLCanvasElement; larghezza: number; altezza: number }> {
  const bmp = await createImageBitmap(blob);
  const etichetta = await etichettaJpeg(blob).catch(() => null);

  // HA GIÀ GIRATO IL BROWSER? Si guardava se le misure decodificate erano
  // quelle del file scambiate. Non basta: un telefono a corto di memoria
  // decodifica le foto grandi RIMPICCIOLITE, e allora nessuna delle due misure
  // combacia — si finiva per girare una foto già girata, o per non girarne una
  // che andava girata. E se capita solo su ALCUNI scatti, quelli restano
  // coricati rispetto agli altri e non si agganciano più.
  //
  // La forma invece sopravvive al rimpicciolimento: se il file è disteso e
  // l'etichetta dice «un quarto di giro», l'immagine mostrata dev'essere in
  // piedi. Se arriva ancora distesa, il browser non ha applicato niente.
  const daGirare = giroDaApplicare(etichetta, bmp.width, bmp.height);

  // …e comunque non si tiene uno scatto più grande di quanto la tela regga
  const tetto = tettoDelloScatto();
  const areaFinita = bmp.width * bmp.height;
  const riduci = areaFinita > tetto ? Math.sqrt(tetto / areaFinita) : 1;

  if (!daGirare && riduci === 1) {
    return { immagine: bmp, larghezza: bmp.width, altezza: bmp.height };
  }

  const lw = Math.max(1, Math.round(bmp.width * riduci));
  const lh = Math.max(1, Math.round(bmp.height * riduci));
  const c = document.createElement('canvas');
  c.width = daGirare ? lh : lw;
  c.height = daGirare ? lw : lh;
  const g = c.getContext('2d');
  if (!g) {
    return { immagine: bmp, larghezza: bmp.width, altezza: bmp.height };
  }
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  if (daGirare) {
    // 6 = un quarto in senso orario, 8 = antiorario, 5 e 7 con lo specchio
    if (daGirare === 6) g.transform(0, 1, -1, 0, lh, 0);
    else if (daGirare === 8) g.transform(0, -1, 1, 0, 0, lw);
    else if (daGirare === 5) g.transform(0, 1, 1, 0, 0, 0);
    else g.transform(0, -1, -1, 0, lh, lw);
  }
  g.drawImage(bmp, 0, 0, lw, lh);
  bmp.close?.();
  return { immagine: c, larghezza: c.width, altezza: c.height };
}

/**
 * QUANTO SI SOVRAPPONGONO DUE SCATTI, subito dopo averli fatti.
 *
 * La misura sul banco è netta: con venti scatti sovrapposti a metà la
 * panoramica deriva di ottanta pixel all'estremità, sovrapposti a due terzi
 * di quindici, a quattro quinti di pochissimo. La sovrapposizione è la leva
 * che conta, molto più di qualunque raffinamento del conto — e l'unico
 * momento in cui si può ancora fare qualcosa è mentre si è ancora lì, con il
 * telefono in mano.
 *
 * Perciò si guarda subito, appena scattato. Si lavora su copie piccole e con
 * pochi angoli: non serve l'omografia buona, serve sapere se c'è abbastanza
 * roba in comune, e questo si vede anche in fretta.
 *
 * Torna quanta parte della LARGHEZZA dello scatto precedente si rivede in
 * quello nuovo — che è poi la sovrapposizione, quella che si governa col
 * passo. Non l'area: il cielo e l'asfalto non danno punti, e su una facciata
 * bassa e larga l'area direbbe «poca» anche quando si sta larghissimi.
 *
 * Le soglie vengono dal banco, non a occhio: dodici scatti sovrapposti al 55%
 * derivano di 41 px, al 67% di 10, all'81% di meno di 2.
 */
export async function sovrapposizioneFra(
  precedente: Blob,
  nuovo: Blob
): Promise<number | null> {
  const apri = async (b: Blob) => {
    const { immagine: bmp, larghezza, altezza } = await apriDritta(b);
    try {
      // stessa riduzione a metà per volta della ricerca vera: qui si scende
      // ancora di più — sette volte e mezzo — e in un colpo solo il conto lo
      // farebbe ognuno a modo suo
      return perLaRicerca(bmp, larghezza, altezza, 760).grigia;
    } finally {
      if ('close' in bmp) bmp.close?.();
    }
  };
  const a = await apri(precedente);
  const b = await apri(nuovo);
  if (!a || !b) return null;
  const fa = caratteristiche(a, 500, 12);
  const fb = caratteristiche(b, 500, 12);
  const all = omografiaFraScatti(abbina(fa, fb));
  if (!all || !allineamentoCredibile(all, b.w, b.h)) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const c of all.buone) {
    x0 = Math.min(x0, c.a.x);
    x1 = Math.max(x1, c.a.x);
  }
  return Math.max(0, Math.min(1, (x1 - x0) / a.w));
}

export async function cuciPanoramica(
  file: Array<File | Blob>,
  opzioni: OpzioniCucitura = {}
): Promise<EsitoCucitura> {
  const avanti = opzioni.avanzamento ?? (() => {});
  if (file.length < 2) throw new CucituraFallita('Servono almeno due scatti.');
  if (file.length > SCATTI_MAX)
    throw new CucituraFallita(`Al massimo ${SCATTI_MAX} scatti per panoramica.`);

  const apri = (f: File | Blob) => apriDritta(f instanceof Blob ? f : new Blob([f]));

  // PRIMA PASSATA: uno scatto per volta.
  //
  // Prima si aprivano tutte le foto insieme e si tenevano aperte fino alla
  // fine. Con otto scatti da dodici megapixel sono già trecento megabyte di
  // memoria viva, e il telefono chiude la scheda senza dire niente: era quello
  // il vero motivo del tetto di otto, non l'algoritmo. Qui ogni scatto si
  // apre, lascia la sua copia RIDOTTA per la ricerca — un millesimo del peso —
  // e si richiude subito. Alla cucitura si riapre uno per volta.
  avanti(0.05, 'Apro gli scatti');
  const ridotte: Array<{ grigia: Grigia; fattore: number }> = [];
  const scatti: Array<{ larghezza: number; altezza: number }> = [];
  for (let i = 0; i < file.length; i++) {
    const { immagine, larghezza, altezza } = await apri(file[i]);
    try {
      scatti.push({ larghezza, altezza });
      ridotte.push(perLaRicerca(immagine, larghezza, altezza));
    } finally {
      if ('close' in immagine) immagine.close?.();
    }
    avanti(0.05 + (0.1 * (i + 1)) / file.length, 'Apro gli scatti');
  }

  avanti(0.15, 'Cerco i punti in comune');
  const rete = reteDiScatti(ridotte.map((r) => r.grigia));
  if (rete.rotturaA !== null) {
    throw new CucituraFallita(
      `Lo scatto ${rete.rotturaA + 1} non si aggancia a nessuno di quelli prima. ` +
        `Con «Ancora» fai uno scatto a metà strada, poi rimettilo in fila. ` +
        'Serve più di un terzo di sovrapposizione con lo scatto precedente. ' +
        'Davanti a una facciata piatta ci si può spostare di lato camminando; ' +
        'se invece nell’inquadratura c’è roba vicina e roba lontana insieme, ' +
        'bisogna girare sul posto, perché spostandosi scorrono in modo diverso ' +
        'e nessuna prospettiva può rimetterle d’accordo.'
    );
  }

  avanti(0.45, 'Metto in fila gli scatti');
  // la rete si risolve nelle coordinate RIDOTTE, dove stanno i punti trovati;
  // poi ogni omografia si riporta alla scala piena del suo scatto
  const versoRidotto = versoDallaRete(file.length, rete);
  if (!versoRidotto) throw new CucituraFallita('Gli scatti non compongono una panoramica sensata.');
  const verso = versoRidotto.map((h: Omografia, i: number) => {
    const f = ridotte[i].fattore;
    return prodotto(h, [f, 0, 0, 0, f, 0, 0, 0, 1]) as Omografia;
  });

  // una fila lunga merita una tela più lunga: con venti scatti su seimila
  // pixel resterebbero trecento pixel di roba nuova per scatto, e su quelli
  // non si misura niente. Il tetto vero resta quello dei pixel totali.
  const latoMax = opzioni.latoMax ?? Math.min(16000, 4000 + 1000 * file.length);
  const disp = telaDaVerso(scatti, verso, latoMax);
  if (!disp) throw new CucituraFallita('Gli scatti non compongono una panoramica sensata.');
  // il tetto della tela è il più stretto fra quello che ci siamo dati e
  // quello che il dispositivo regge davvero
  const tettoFinale = Math.min(PIXEL_MAX, tettoDellaTela());
  if (disp.larghezza * disp.altezza > tettoFinale) {
    const k = Math.sqrt(tettoFinale / (disp.larghezza * disp.altezza));
    const ridotto = telaDaVerso(scatti, verso, Math.floor(latoMax * k));
    if (!ridotto) throw new CucituraFallita('Panoramica troppo grande per questo dispositivo.');
    Object.assign(disp, ridotto);
  }

  avanti(0.5, 'Cucio');
  const tela = document.createElement('canvas');
  tela.width = disp.larghezza;
  tela.height = disp.altezza;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new CucituraFallita('Il dispositivo non permette di elaborare le immagini.');
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, tela.width, tela.height);
  ctx.imageSmoothingQuality = 'high';
  // SECONDA PASSATA: si riapre uno scatto per volta, si disegna, si richiude
  for (let i = 0; i < file.length; i++) {
    const { immagine, larghezza, altezza } = await apri(file[i]);
    try {
      const sfumato = conBordoSfumato(immagine, larghezza, altezza, i > 0, i < file.length - 1);
      disegnaDeformata(ctx, sfumato, larghezza, altezza, disp.verso[i]);
    } finally {
      if ('close' in immagine) immagine.close?.();
    }
    avanti(0.5 + (0.45 * (i + 1)) / file.length, 'Cucio');
  }

  avanti(0.97, 'Salvo');
  const blob = await new Promise<Blob | null>((res) =>
    tela.toBlob(res, 'image/jpeg', opzioni.qualita ?? 0.9)
  );
  if (!blob) throw new CucituraFallita('Non è stato possibile salvare la panoramica.');
  return {
    blob,
    larghezza: tela.width,
    altezza: tela.height,
    copertura: mascheraCopertura(scatti, disp.verso, tela.width, tela.height),
    errori: rete.legami.map((l: { errore: number }) => l.errore),
    scatti: file.length
  };
}
