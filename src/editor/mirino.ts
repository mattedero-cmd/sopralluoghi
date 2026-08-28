/**
 * IL MIRINO DELLA LENTE.
 *
 * Quando si posa un punto sulla foto, sotto il dito compare una lente: lì
 * dentro il filetto della croce è l'unico riferimento che dice DOVE cadrà il
 * punto. Un filetto bianco su un serramento bianco, o verde su una siepe, non
 * si vede: e ogni pixel sbagliato nella lente sono millimetri veri sbagliati
 * nella misura.
 *
 * Per questo il mirino predefinito non ha un colore proprio: lo prende, tratto
 * per tratto, dal COMPLEMENTARE di ciò che sta attraversando. Il filetto legge
 * i pixel che ha sotto (foto e annotazioni già disegnate), ne ruota la tinta di
 * 180° e ne ribalta la luminosità: su qualunque sfondo resta staccato.
 */

import type { Mirino } from '../db/types';

/** Colori fissi selezionabili in alternativa al complementare. */
const FISSI: Record<string, string> = {
  bianco: '#ffffff',
  nero: '#000000',
  giallo: '#ffe000',
  magenta: '#ff00d0',
  verde: '#32d74b'
};

/** Lisciatura del colore campionato, in px dispositivo: toglie il "coriandolo". */
const RAGGIO_LISCIA = 2;

/**
 * Le due luminosità fra cui scegliere il filetto, e la saturazione minima.
 *
 * Non sono estreme apposta: a 0 e 1 la tinta sparisce e resterebbe un filetto
 * bianco o nero — più contrastato ma senza più nulla di complementare. Con
 * 0.08/0.92 il contrasto peggiore su tutta la gamma dei colori resta 3.8:1
 * (la soglia per la grafica non testuale è 3:1) e il colore si vede ancora.
 */
const CHIARA = 0.92;
const SCURA = 0.08;
const SATURAZIONE_MINIMA = 0.55;

/** Luminanza percettiva (Rec. 709) di un colore 0..255 → 0..1 */
export function luminanza(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Luminanza relativa WCAG (canali linearizzati) di un colore 0..255 */
export function luminanzaRelativa([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Rapporto di contrasto WCAG fra due colori (1 = identici, 21 = bianco/nero) */
export function contrasto(a: [number, number, number], b: [number, number, number]): number {
  const la = luminanzaRelativa(a);
  const lb = luminanzaRelativa(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Complementare "utile" di un colore: tinta ruotata di 180°, saturazione
 * portata a un minimo (così anche i grigi danno un colore vero) e luminosità
 * scelta — fra chiara e scura — per quella che contrasta di più con lo sfondo.
 *
 * Il complementare puro non basterebbe: il complementare di un grigio medio è
 * lo stesso grigio medio, e il filetto sparirebbe proprio dove serve di più.
 * E non basta nemmeno una soglia fissa sulla luminosità: certe tinte sature
 * (un rosso acceso, un magenta) sono scure per luminanza ma abbaglianti alla
 * vista, e la scelta va fatta misurando, non indovinando.
 */
export function complementare(r: number, g: number, b: number): [number, number, number] {
  const [h, s] = versoHsl(r, g, b);
  const h2 = (h + 180) % 360;
  const s2 = Math.max(s, SATURAZIONE_MINIMA);
  const fondo: [number, number, number] = [r, g, b];
  const scura = daHsl(h2, s2, SCURA);
  const chiara = daHsl(h2, s2, CHIARA);
  return contrasto(scura, fondo) >= contrasto(chiara, fondo) ? scura : chiara;
}

/** RGB 0..255 → [tinta 0..360, saturazione 0..1, luminosità 0..1] */
export function versoHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = ((gg - bb) / d) % 6;
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/** [tinta 0..360, saturazione 0..1, luminosità 0..1] → RGB 0..255 */
export function daHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

/**
 * Media dei pixel di una banda RGBA, lungo l'asse del filetto.
 *
 * `perColonna` = true per un braccio orizzontale (una media per colonna),
 * false per un braccio verticale (una media per riga).
 */
export function medieBanda(
  dati: Uint8ClampedArray,
  larghezza: number,
  altezza: number,
  perColonna: boolean
): Array<[number, number, number]> {
  const passi = perColonna ? larghezza : altezza;
  const conta = perColonna ? altezza : larghezza;
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < passi; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let j = 0; j < conta; j++) {
      const x = perColonna ? i : j;
      const y = perColonna ? j : i;
      const k = (y * larghezza + x) * 4;
      r += dati[k];
      g += dati[k + 1];
      b += dati[k + 2];
    }
    out.push([r / conta, g / conta, b / conta]);
  }
  return out;
}

/** Media mobile sui colori campionati: il filetto cambia tinta per zone, non per pixel. */
export function liscia(
  colori: Array<[number, number, number]>,
  raggio = RAGGIO_LISCIA
): Array<[number, number, number]> {
  if (raggio <= 0) return colori;
  const n = colori.length;
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let c = 0;
    for (let j = Math.max(0, i - raggio); j <= Math.min(n - 1, i + raggio); j++) {
      r += colori[j][0];
      g += colori[j][1];
      b += colori[j][2];
      c++;
    }
    out.push([r / c, g / c, b / c]);
  }
  return out;
}

export function css([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** I due tratti di un braccio: dal bordo al vuoto centrale, e dall'altra parte. */
export function tratti(lato: number, vuoto: number, bordo: number): Array<[number, number]> {
  const c = lato / 2;
  const a = Math.max(0, c - vuoto);
  const b = Math.min(lato, c + vuoto);
  if (vuoto <= 0) return [[bordo, lato - bordo]];
  return [
    [bordo, a],
    [b, lato - bordo]
  ].filter(([da, aa]) => aa - da > 0.5) as Array<[number, number]>;
}

/**
 * Disegna il mirino su un contesto già in PIXEL DISPOSITIVO (nessuna
 * trasformazione attiva): il campionamento del complementare lavora sui pixel
 * veri, quindi il filetto è colorato esattamente da ciò che copre.
 *
 * `lato` è il lato della lente in px dispositivo.
 */
export function disegnaMirino(
  ctx: CanvasRenderingContext2D,
  lato: number,
  m: Mirino,
  dpr: number,
  agganciato: boolean
): void {
  const sp = Math.max(1, Math.round(m.spessore * dpr));
  const vuoto = Math.max(0, m.vuoto * dpr);
  const bordo = 2 * dpr;
  const c = lato / 2;
  const y0 = Math.round(c - sp / 2);
  const x0 = Math.round(c - sp / 2);

  if (m.colore === 'complementare') {
    // PRIMA si campiona, POI si dipinge: se il braccio verticale leggesse dopo
    // che l'orizzontale è già stato disegnato, all'incrocio prenderebbe il
    // colore del mirino stesso invece di quello della foto — e proprio il
    // pixel centrale, quello che conta, uscirebbe sbagliato.
    const letture: Array<{ x: number; y: number; passo: number; colori: Array<[number, number, number]> }> = [];
    for (const [da, a] of tratti(lato, vuoto, bordo)) {
      const w = Math.round(a) - Math.round(da);
      if (w > 0) {
        const banda = ctx.getImageData(Math.round(da), y0, w, sp);
        letture.push({ x: Math.round(da), y: y0, passo: 1, colori: liscia(medieBanda(banda.data, w, sp, true)) });
      }
      const h = Math.round(a) - Math.round(da);
      if (h > 0) {
        const banda = ctx.getImageData(x0, Math.round(da), sp, h);
        letture.push({ x: x0, y: Math.round(da), passo: 0, colori: liscia(medieBanda(banda.data, sp, h, false)) });
      }
    }
    for (const l of letture) {
      for (let i = 0; i < l.colori.length; i++) {
        ctx.fillStyle = css(complementare(...l.colori[i]));
        if (l.passo === 1) ctx.fillRect(l.x + i, l.y, 1, sp);
        else ctx.fillRect(l.x, l.y + i, sp, 1);
      }
    }
  } else {
    const strati: Array<[string, number]> = m.alone
      ? [['rgba(0,0,0,0.85)', sp + 2 * dpr], [FISSI[m.colore] ?? '#ffffff', sp]]
      : [[FISSI[m.colore] ?? '#ffffff', sp]];
    for (const [colore, spessore] of strati) {
      ctx.strokeStyle = colore;
      ctx.lineWidth = spessore;
      ctx.beginPath();
      for (const [da, a] of tratti(lato, vuoto, bordo)) {
        ctx.moveTo(da, c);
        ctx.lineTo(a, c);
        ctx.moveTo(c, da);
        ctx.lineTo(c, a);
      }
      ctx.stroke();
    }
  }

  if (m.cerchio) {
    const raggio = Math.max(4 * dpr, vuoto > 0 ? vuoto : 7 * dpr);
    const anello = coloreAnello(ctx, c, raggio, m);
    ctx.strokeStyle = anello;
    ctx.lineWidth = sp;
    ctx.beginPath();
    ctx.arc(c, c, raggio, 0, Math.PI * 2);
    ctx.stroke();
  }

  // l'aggancio allo snap resta segnalato dal bordo verde della lente: il
  // filetto non cambia colore, altrimenti perderebbe il contrasto proprio
  // nel momento in cui serve leggerlo.
  void agganciato;
}

/** Colore del cerchietto: complementare della media dei pixel che attraversa. */
function coloreAnello(
  ctx: CanvasRenderingContext2D,
  c: number,
  raggio: number,
  m: Mirino
): string {
  if (m.colore !== 'complementare') return FISSI[m.colore] ?? '#ffffff';
  const d = Math.max(1, Math.round(raggio * 2));
  // la lente è quadrata e il cerchio è al centro: stesso scarto sui due assi
  const angolo = Math.max(0, Math.round(c - raggio));
  const banda = ctx.getImageData(angolo, angolo, d, d);
  let r = 0;
  let g = 0;
  let b = 0;
  const n = d * d;
  for (let i = 0; i < n; i++) {
    r += banda.data[i * 4];
    g += banda.data[i * 4 + 1];
    b += banda.data[i * 4 + 2];
  }
  return css(complementare(r / n, g / n, b / n));
}
