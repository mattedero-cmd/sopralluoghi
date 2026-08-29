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

import { applicaOmografia, prodotto, type Omografia } from '../geometry/omografia';
import {
  catenaDiScatti,
  disposizione,
  inGrigio,
  type Grigia
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
        `Lo scatto ${catena.rotturaA + 1} non si aggancia al precedente: ` +
          'serve almeno un terzo di sovrapposizione fra uno scatto e il successivo, ' +
          'ripresi girando sul posto senza spostarsi.'
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
      errori: catena.allineamenti.map((a) => a.errore),
      scatti: bitmap.length
    };
  } finally {
    for (const b of bitmap) b.close?.();
  }
}
