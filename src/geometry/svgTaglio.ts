/**
 * SVG PER IL TAGLIO A MACCHINA (plotter da taglio, fresa, laser).
 *
 * Il file segue la convenzione print & cut usata dai RIP:
 *
 * - un livello «sheet» con il solo contorno del supporto, in nero: serve alla
 *   macchina per sapere dov'è il materiale, non va tagliato;
 * - un livello «CutContour» con i contorni dei pezzi, in MAGENTA 100%
 *   (C0 M100 Y0 K0, cioè #EC008C in schermo): è il nome che i software di
 *   taglio cercano per riconoscere le linee da seguire.
 *
 * Le misure sono in millimetri reali: `width`/`height` in mm e viewBox con
 * un'unità = un millimetro, così il disegno arriva in scala 1:1 senza che
 * nessuno debba riscalarlo a mano.
 */

import type { LastraNesting } from './nesting';

/** magenta 100% in quadricromia, come lo rende lo schermo */
export const MAGENTA_TAGLIO = '#EC008C';

export interface OpzioniSvgTaglio {
  /** titolo del disegno, finisce nel tag <title> */
  titolo?: string;
  /** spessore delle linee in mm: sottile, deve solo essere visibile */
  spessore?: number;
  /** disegnare anche il nome dei pezzi (non tagliato, solo riferimento) */
  etichette?: boolean;
}

const num = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
};

const perXml = (t: string) =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Un foglio da tagliare: il contorno del supporto e i contorni dei pezzi.
 *
 * @param lastra  pezzi piazzati, in coordinate del supporto (mm)
 * @param misure  misure del supporto (mm)
 */
export function svgTaglio(
  lastra: LastraNesting,
  misure: { larghezza: number; altezza: number },
  opzioni?: OpzioniSvgTaglio
): string {
  const L = Math.max(0, misure.larghezza);
  const A = Math.max(0, misure.altezza);
  const sp = opzioni?.spessore ?? 0.25;

  const contorni = lastra.piazzamenti
    .map(
      (p) =>
        `    <rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.larghezza)}" height="${num(
          p.altezza
        )}"/>`
    )
    .join('\n');

  const etichette = opzioni?.etichette
    ? lastra.piazzamenti
        .map((p) => {
          const cx = p.x + p.larghezza / 2;
          const cy = p.y + p.altezza / 2;
          const corpo = Math.max(3, Math.min(12, Math.min(p.larghezza, p.altezza) / 6));
          const gira = p.altezza > p.larghezza * 1.15;
          const rot = gira ? ` transform="rotate(-90 ${num(cx)} ${num(cy)})"` : '';
          return (
            `    <text x="${num(cx)}" y="${num(cy)}" font-size="${num(corpo)}"` +
            ` text-anchor="middle" dominant-baseline="central"${rot}>${perXml(p.nome || '')}</text>`
          );
        })
        .join('\n')
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"`,
    `     width="${num(L)}mm" height="${num(A)}mm" viewBox="0 0 ${num(L)} ${num(A)}">`,
    opzioni?.titolo ? `  <title>${perXml(opzioni.titolo)}</title>` : '',
    `  <g id="sheet" fill="none" stroke="#000000" stroke-width="${num(sp)}">`,
    `    <rect x="0" y="0" width="${num(L)}" height="${num(A)}"/>`,
    '  </g>',
    `  <g id="CutContour" fill="none" stroke="${MAGENTA_TAGLIO}" stroke-width="${num(sp)}">`,
    contorni,
    '  </g>',
    etichette
      ? `  <g id="etichette" fill="#808080" stroke="none" font-family="sans-serif">\n${etichette}\n  </g>`
      : '',
    '</svg>',
    ''
  ]
    .filter((r) => r !== '')
    .join('\n');
}

/** nome file sicuro e riconoscibile per un foglio */
export function nomeFoglioSvg(lavoro: string, materiale: string, foglio?: string): string {
  const pulisci = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40);
  return [pulisci(lavoro), pulisci(materiale), foglio ? pulisci(foglio) : '']
    .filter(Boolean)
    .join('__');
}
