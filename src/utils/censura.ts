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
 * Quanto si estende la sfumatura OLTRE il riquadro memorizzato.
 *
 * Il riquadro (l'ovale che si vede tratteggiato nell'editor) è la zona
 * SFOCATA AL 100%. Da lì la sfocatura si spegne gradualmente fino a questo
 * raggio: senza dissolvenza il bordo dell'ovale si vedrebbe come un taglio
 * netto sulla foto.
 */
const SFUMATURA = 1.35;

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
  // strato d'appoggio: ci si costruisce la sfocatura con la sua maschera
  // sfumata, e solo dopo la si posa sulla foto
  const strato = document.createElement('canvas');

  for (const r of censure) {
    if (!regioneUtile(r)) continue;
    const cx = r.x + r.larghezza / 2;
    const cy = r.y + r.altezza / 2;
    // nucleo = ovale del riquadro (sfocato pieno); esterno = fine della sfumatura
    const rxE = (r.larghezza / 2) * SFUMATURA;
    const ryE = (r.altezza / 2) * SFUMATURA;

    // area sorgente da campionare, ritagliata nei limiti dell'immagine
    // (drawImage con rettangolo sorgente fuori dai bordi non disegna nulla)
    const sx = Math.max(0, Math.floor(cx - rxE));
    const sy = Math.max(0, Math.floor(cy - ryE));
    const sw = Math.min(larghezzaSorgente, Math.ceil(cx + rxE)) - sx;
    const sh = Math.min(altezzaSorgente, Math.ceil(cy + ryE)) - sy;
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

    // 2) sullo strato: ritorno in scala interpolato + sfocatura
    const dx = sx * scala;
    const dy = sy * scala;
    const dw = Math.max(1, sw * scala);
    const dh = Math.max(1, sh * scala);
    strato.width = Math.max(1, Math.ceil(dw));
    strato.height = Math.max(1, Math.ceil(dh));
    const sc = strato.getContext('2d');
    if (!sc) continue;
    sc.clearRect(0, 0, strato.width, strato.height);
    sc.imageSmoothingEnabled = true;
    sc.imageSmoothingQuality = 'high';
    const sfocatura = Math.max(2, Math.min(dw, dh) / 12);
    // se `filter` non è supportato (WebView vecchie) resta la sfocatura data
    // dall'interpolazione: l'area è comunque irriconoscibile
    sc.filter = `blur(${sfocatura}px)`;
    // si disegna oltre i bordi dello strato: la sfocatura sfuma sui margini
    // dell'immagine disegnata, che così restano fuori campo
    const m = sfocatura * 2;
    sc.drawImage(tmp, 0, 0, pw, ph, -m, -m, dw + m * 2, dh + m * 2);
    sc.filter = 'none';

    // 3) maschera ovale con DISSOLVENZA: piena sul nucleo, spenta all'esterno.
    // È questo passaggio a togliere il bordo netto.
    sc.globalCompositeOperation = 'destination-in';
    sc.save();
    // spazio normalizzato: raggio 1 = fine della sfumatura, così un gradiente
    // circolare diventa ellittico e segue la forma del viso
    sc.translate(cx * scala - dx, cy * scala - dy);
    sc.scale(Math.max(0.01, rxE * scala), Math.max(0.01, ryE * scala));
    const nucleo = Math.min(0.97, 1 / SFUMATURA);
    const g = sc.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(nucleo, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = g;
    sc.fillRect(-1.2, -1.2, 2.4, 2.4);
    sc.restore();
    sc.globalCompositeOperation = 'source-over';

    // 4) la sfocatura sfumata si posa sulla foto
    ctx.drawImage(strato, dx, dy);
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
