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
 *
 * Le etichette — livello a parte, che la macchina non taglia — sono impaginate
 * dallo stesso motore del PDF: nome e misura dentro il pezzo, grandi quanto il
 * pezzo consente, girati per lungo sui pezzi stretti. Così quello che si legge
 * sul foglio e quello che si legge nel file sono la stessa cosa.
 */

import type { LastraNesting, Piazzamento } from './nesting';
import { misureForma } from './sagome';
import { pianoEtichetta } from '../utils/etichettaNesting';

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

  // il contorno da tagliare è la SAGOMA vera del pezzo: la macchina segue
  // questa linea, e un trapezio tagliato per ingombro è un pezzo sbagliato
  const contorni = lastra.piazzamenti
    .map((p) => {
      if (p.forma === 'cerchio') {
        // il taglio comprende l'abbondanza: il Ø dell'ingombro, non il finito
        const r = p.larghezza / 2;
        return `    <circle cx="${num(p.x + p.larghezza / 2)}" cy="${num(
          p.y + p.altezza / 2
        )}" r="${num(r)}"/>`;
      }
      if (p.punti) {
        const punti = p.punti.map((q) => `${num(p.x + q[0])},${num(p.y + q[1])}`).join(' ');
        return `    <polygon points="${punti}"/>`;
      }
      return `    <rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.larghezza)}" height="${num(
        p.altezza
      )}"/>`;
    })
    .join('\n');

  const etichette = opzioni?.etichette
    ? lastra.piazzamenti
        .map(etichettaPezzo)
        .filter(Boolean)
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
      ? `  <g id="etichette" fill="${GRIGIO_ETICHETTA}" stroke="none" font-family="sans-serif">\n${etichette}\n  </g>`
      : '',
    '</svg>',
    ''
  ]
    .filter((r) => r !== '')
    .join('\n');
}

/**
 * CORPI DELLE ETICHETTE, in millimetri reali del disegno.
 *
 * Un file di taglio si guarda quasi sempre rimpicciolito — un foglio da due
 * metri e mezzo su uno schermo largo dieci centimetri — quindi le scritte
 * vanno prese larghe: il tetto è alto, e la soglia sotto la quale conviene
 * troncare il nome invece di rimpicciolirlo ancora sta a un centimetro.
 */
const CORPI_ETICHETTA = { massimo: 50, comodo: 10, dueRighe: 8, minimo: 3.5 };

/** grigio scuro: si distingue dal nero del supporto e si legge sul chiaro */
const GRIGIO_ETICHETTA = '#4d4d4d';

/** interlinea, come nell'impaginazione del PDF */
const INTERLINEA = 1.15;

/** l'etichetta di un pezzo: nome e misura, o quel che ci sta */
function etichettaPezzo(p: Piazzamento): string {
  const cx = p.x + p.larghezza / 2;
  const cy = p.y + p.altezza / 2;
  // la misura parla la lingua della forma: Ø300, 500/300×200, 600×400|800
  const misura = misureForma({
    forma: p.forma,
    larghezza: p.larghezzaFinita,
    altezza: p.altezzaFinita,
    misura3: p.misura3Finita
  });
  const piano = pianoEtichetta(p.larghezza, p.altezza, p.nome || '', misura, CORPI_ETICHETTA);
  if (!piano) return '';

  const riga = (testo: string, corpo: number, dy: number, forte: boolean) =>
    `      <text x="${num(cx)}" y="${num(cy + dy)}" font-size="${num(corpo)}"` +
    `${forte ? ' font-weight="600"' : ''}` +
    ` text-anchor="middle" dominant-baseline="central">${perXml(testo)}</text>`;

  const righe: string[] = [];
  if (piano.ampia && piano.nome && piano.misura) {
    // due righe centrate sul pezzo: il nome sopra, la misura sotto
    righe.push(riga(piano.nome, piano.corpoNome, -(piano.corpoMisura * INTERLINEA) / 2, true));
    righe.push(riga(piano.misura, piano.corpoMisura, (piano.corpoNome * INTERLINEA) / 2, false));
  } else if (piano.nome) {
    righe.push(riga(piano.nome, piano.corpoNome, 0, true));
  } else if (piano.misura) {
    righe.push(riga(piano.misura, piano.corpoMisura, 0, false));
  }
  if (righe.length === 0) return '';

  // sui pezzi stretti la scritta va per lungo: gira tutto il gruppo attorno al
  // centro del pezzo, così le due righe restano in colonna
  const rot = piano.ruotata ? ` transform="rotate(-90 ${num(cx)} ${num(cy)})"` : '';
  return `    <g${rot}>\n${righe.join('\n')}\n    </g>`;
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
