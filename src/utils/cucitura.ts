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
  catenaDiScatti,
  disposizione,
  inGrigio,
  type Grigia,
  type Scatto
} from '../geometry/panoramica';

/** lato massimo su cui si cercano gli angoli: oltre è tempo buttato */
const LATO_RICERCA = 1400;
/** quanti pixel può avere al massimo la tela finale */
const PIXEL_MAX = 20_000_000;
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
function perLaRicerca(bitmap: ImageBitmap): { grigia: Grigia; fattore: number } {
  const fattore = Math.min(1, LATO_RICERCA / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * fattore));
  const h = Math.max(1, Math.round(bitmap.height * fattore));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new CucituraFallita('Il dispositivo non permette di elaborare le immagini.');
  ctx.drawImage(bitmap, 0, 0, w, h);
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
  bitmap: ImageBitmap,
  sfumaSinistra: boolean,
  sfumaDestra: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new CucituraFallita('Il dispositivo non permette di elaborare le immagini.');
  ctx.drawImage(bitmap, 0, 0);
  if (!sfumaSinistra && !sfumaDestra) return canvas;
  const larghezza = Math.max(1, Math.round(bitmap.width * 0.12));
  const g = ctx.createLinearGradient(0, 0, bitmap.width, 0);
  const s = larghezza / bitmap.width;
  g.addColorStop(0, sfumaSinistra ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
  g.addColorStop(s, 'rgba(0,0,0,1)');
  g.addColorStop(1 - s, 'rgba(0,0,0,1)');
  g.addColorStop(1, sfumaDestra ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
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
  const largo = Math.round((lato(quad[0], quad[1]) + lato(quad[3], quad[2])) / 2);
  const alto = Math.round((lato(quad[1], quad[2]) + lato(quad[0], quad[3])) / 2);
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
export async function cuciPanoramica(
  file: Array<File | Blob>,
  opzioni: OpzioniCucitura = {}
): Promise<EsitoCucitura> {
  const avanti = opzioni.avanzamento ?? (() => {});
  if (file.length < 2) throw new CucituraFallita('Servono almeno due scatti.');
  if (file.length > 8) throw new CucituraFallita('Al massimo otto scatti per panoramica.');

  avanti(0.05, 'Apro gli scatti');
  const bitmap: ImageBitmap[] = [];
  try {
    for (const f of file) {
      bitmap.push(await createImageBitmap(f instanceof Blob ? f : new Blob([f])));
    }
    const larghezze = bitmap.map((b) => b.width);
    const altezze = bitmap.map((b) => b.height);

    avanti(0.15, 'Cerco i punti in comune');
    const ridotte = bitmap.map(perLaRicerca);
    const catena = catenaDiScatti(ridotte.map((r) => r.grigia));
    if (catena.rotturaA !== null) {
      throw new CucituraFallita(
        `Lo scatto ${catena.rotturaA + 1} non si aggancia al ${catena.rotturaA}. ` +
          `Con «Ancora» fai uno scatto a metà strada fra i due, poi rimettilo in fila. ` +
          'Serve più di un terzo di sovrapposizione, e bisogna girare sul posto: ' +
          'spostandosi di lato le cose vicine e quelle lontane scorrono in modo diverso, ' +
          'e nessuna prospettiva può rimetterle d’accordo.'
      );
    }

    avanti(0.5, 'Metto in fila gli scatti');
    // i legami sono stati trovati sulle immagini ridotte: si riportano alla
    // scala piena prima di comporre la tela
    // legami[i] porta lo scatto i+1 su quello i: sorgente i+1, destinazione i
    const legami = catena.legami.map((H, i) =>
      inScalaPiena(H, ridotte[i + 1].fattore, ridotte[i].fattore)
    );
    const scatti = bitmap.map((b) => ({ larghezza: b.width, altezza: b.height }));
    const latoMax = opzioni.latoMax ?? 6000;
    const disp = disposizione(scatti, legami, latoMax);
    if (!disp) throw new CucituraFallita('Gli scatti non compongono una panoramica sensata.');
    if (disp.larghezza * disp.altezza > PIXEL_MAX) {
      const k = Math.sqrt(PIXEL_MAX / (disp.larghezza * disp.altezza));
      const ridotto = disposizione(scatti, legami, Math.floor(latoMax * k));
      if (!ridotto) throw new CucituraFallita('Panoramica troppo grande per questo dispositivo.');
      Object.assign(disp, ridotto);
    }

    avanti(0.6, 'Cucio');
    const tela = document.createElement('canvas');
    tela.width = disp.larghezza;
    tela.height = disp.altezza;
    const ctx = tela.getContext('2d');
    if (!ctx) throw new CucituraFallita('Il dispositivo non permette di elaborare le immagini.');
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < bitmap.length; i++) {
      const sfumato = conBordoSfumato(bitmap[i], i > 0, i < bitmap.length - 1);
      disegnaDeformata(ctx, sfumato, larghezze[i], altezze[i], disp.verso[i]);
      avanti(0.6 + (0.35 * (i + 1)) / bitmap.length, 'Cucio');
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
      errori: catena.allineamenti.map((a) => a.errore),
      scatti: bitmap.length
    };
  } finally {
    for (const b of bitmap) b.close?.();
  }
}
