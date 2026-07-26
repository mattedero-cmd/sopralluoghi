/**
 * Palette dei pezzi del nesting.
 *
 * Le tinte sono distribuite sulla ruota dei colori con l'angolo aureo, così
 * anche venti pezzi diversi restano distinguibili. I riempimenti sono pastello
 * chiari: il testo scuro sopra si legge sia col tema chiaro sia con lo scuro,
 * e sulla carta stampata restano leggeri d'inchiostro.
 *
 * L'SVG accetta `hsl()`, il PDF no: le due forme devono restare identiche,
 * per questo stanno insieme qui.
 */

const SFONDO = { s: 52, l: 74 };
const BORDO = { s: 42, l: 42 };

/** tinte ben distanziate sulla ruota dei colori (angolo d'oro) */
export function prossimaTinta(indice: number): number {
  return Math.round((indice * 137.508) % 360);
}

export function tintaSfondo(t: number): string {
  return `hsl(${t},${SFONDO.s}%,${SFONDO.l}%)`;
}

export function tintaBordo(t: number): string {
  return `hsl(${t},${BORDO.s}%,${BORDO.l}%)`;
}

/** la stessa tinta in esadecimale, per PDF e canvas che non capiscono hsl() */
export function tintaSfondoEsa(t: number): string {
  return hslEsa(t, SFONDO.s, SFONDO.l);
}

export function tintaBordoEsa(t: number): string {
  return hslEsa(t, BORDO.s, BORDO.l);
}

export function hslEsa(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = ln - c / 2;
  const bit = (v: number) =>
    Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${bit(r1)}${bit(g1)}${bit(b1)}`;
}
