import type { Foto, RegioneCensura } from '../db/types';

/**
 * CENSURA DELLE REGIONI SENSIBILI (volti).
 *
 * L'originale in archivio non viene mai alterato: la censura si applica ai
 * PIXEL DISEGNATI, in tutti i punti in cui la foto si vede o esce dall'app
 * (editor, miniature, PDF, immagine condivisa, export foto). Così una
 * rilevazione sbagliata si corregge sempre, senza aver perso l'immagine.
 *
 * Resa: SFOCATURA su area OVALE (la forma naturale di un volto).
 *
 * La sfocatura non è solo un effetto grafico: prima l'area viene ridotta a
 * pochi pixel e poi riportata in scala interpolata. È la riduzione a
 * distruggere davvero l'informazione — una sfocatura "morbida" applicata ai
 * pixel originali sarebbe in parte ricostruibile. Il risultato all'occhio è
 * un blur pulito, ma il volto non è più nei dati.
 */

/** lato in pixel a cui si riduce l'area prima di riportarla in scala */
const LATO_RIDOTTO = 14;

/**
 * L'ovale deborda un poco dal riquadro: un'ellisse inscritta lascerebbe
 * scoperti gli angoli (orecchie, mento, capelli ai lati).
 */
export const DEBORDO_CENSURA = 1.08;

/** regione valida e non degenere */
function regioneUtile(r: RegioneCensura): boolean {
  return r.larghezza >= 1 && r.altezza >= 1;
}

/** true se la foto ha almeno una regione da oscurare */
export function haCensure(foto: Pick<Foto, 'censure'>): boolean {
  return !!foto.censure?.some(regioneUtile);
}

/**
 * Sfoca le regioni indicate (area ovale), campionando da `sorgente`.
 *
 * - le coordinate delle regioni sono in PIXEL DELL'ORIGINALE;
 * - `scala` converte dai pixel dell'originale a quelli del canvas di
 *   destinazione (1 = stessa risoluzione, <1 per miniature/anteprime).
 */
export function disegnaCensure(
  ctx: CanvasRenderingContext2D,
  sorgente: CanvasImageSource,
  censure: RegioneCensura[] | undefined,
  larghezzaSorgente: number,
  altezzaSorgente: number,
  scala = 1
): void {
  if (!censure?.length) return;
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d');
  if (!tctx) return;

  for (const r of censure) {
    if (!regioneUtile(r)) continue;
    // ovale iscritto nel riquadro (con un po' di debordo)
    const cx = r.x + r.larghezza / 2;
    const cy = r.y + r.altezza / 2;
    const rx = (r.larghezza / 2) * DEBORDO_CENSURA;
    const ry = (r.altezza / 2) * DEBORDO_CENSURA;

    // area da sfocare = rettangolo che contiene l'ovale, ritagliato nei limiti
    // dell'immagine (drawImage con sorgente fuori dai bordi non disegna nulla)
    const sx = Math.max(0, Math.floor(cx - rx));
    const sy = Math.max(0, Math.floor(cy - ry));
    const sw = Math.min(larghezzaSorgente, Math.ceil(cx + rx)) - sx;
    const sh = Math.min(altezzaSorgente, Math.ceil(cy + ry)) - sy;
    if (sw < 1 || sh < 1) continue;

    // 1) riduzione a pochi pixel: è questo passaggio a cancellare il volto
    const f = Math.min(1, LATO_RIDOTTO / Math.max(sw, sh));
    const pw = Math.max(1, Math.round(sw * f));
    const ph = Math.max(1, Math.round(sh * f));
    tmp.width = pw;
    tmp.height = ph;
    tctx.clearRect(0, 0, pw, ph);
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(sorgente, sx, sy, sw, sh, 0, 0, pw, ph);

    // 2) ritorno in scala interpolato + sfocatura, dentro l'ovale
    const dw = Math.max(1, sw * scala);
    const dh = Math.max(1, sh * scala);
    const sfocatura = Math.max(2, Math.min(dw, dh) / 9);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx * scala, cy * scala, rx * scala, ry * scala, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // se `filter` non è supportato (WebView vecchie) resta la sfocatura data
    // dall'interpolazione: l'area è comunque irriconoscibile
    ctx.filter = `blur(${sfocatura}px)`;
    // si disegna un po' oltre i bordi: la sfocatura sfuma sui margini
    // dell'immagine disegnata, e senza margine l'ovale mostrerebbe un alone
    // nitido nei punti in cui tocca il rettangolo
    const m = sfocatura * 2;
    ctx.drawImage(tmp, 0, 0, pw, ph, sx * scala - m, sy * scala - m, dw + m * 2, dh + m * 2);
    ctx.restore();
  }
}

/**
 * Rigenera la miniatura di una foto applicando le censure correnti. Serve
 * quando i riquadri cambiano a mano: le liste mostrano la miniatura
 * archiviata, che è un derivato e va tenuto allineato.
 */
export async function miniaturaCensurata(
  sorgente: CanvasImageSource,
  larghezza: number,
  altezza: number,
  censure: RegioneCensura[] | undefined,
  lato = 400,
  qualita = 0.75
): Promise<Blob> {
  const fattore = Math.min(1, lato / Math.max(larghezza, altezza));
  const w = Math.max(1, Math.round(larghezza * fattore));
  const h = Math.max(1, Math.round(altezza * fattore));
  const tela = document.createElement('canvas');
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sorgente, 0, 0, w, h);
  disegnaCensure(ctx, sorgente, censure, larghezza, altezza, fattore);
  return new Promise<Blob>((risolvi, rifiuta) => {
    tela.toBlob(
      (b) => (b ? risolvi(b) : rifiuta(new Error('Miniatura non generata.'))),
      'image/jpeg',
      qualita
    );
  });
}

/**
 * Copia dell'immagine con le censure già applicate, pronta da disegnare.
 * È la sorgente unica usata da editor, PDF ed export: così anche gli
 * ingrandimenti dei callout (che ricampionano l'immagine) pescano da pixel
 * già oscurati e non possono far riaffiorare un volto.
 *
 * Se non ci sono censure restituisce l'immagine originale (nessuna copia).
 */
export function immagineCensurata<T extends CanvasImageSource>(
  sorgente: T,
  larghezza: number,
  altezza: number,
  censure: RegioneCensura[] | undefined
): T | HTMLCanvasElement {
  if (!censure?.some(regioneUtile)) return sorgente;
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(larghezza));
  tela.height = Math.max(1, Math.round(altezza));
  const ctx = tela.getContext('2d');
  if (!ctx) return sorgente;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sorgente, 0, 0, tela.width, tela.height);
  disegnaCensure(ctx, sorgente, censure, larghezza, altezza, 1);
  return tela;
}
