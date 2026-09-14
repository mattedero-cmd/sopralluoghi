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
 * Le misure sono in millimetri reali: la viewBox ha un'unità = un millimetro,
 * così il disegno arriva senza che nessuno debba riscalarlo a mano.
 *
 * LA SCALA. Alla macchina si manda 1:1, ed è il valore predefinito: il file è
 * largo quanto il materiale. Per guardarlo, o per stamparlo su un foglio e
 * prenderci le misure sopra, serve invece una riduzione: un foglio da due
 * metri e mezzo su un A4 vuole un 1:10. Si riduce `width`/`height` lasciando
 * intatta la viewBox, così le coordinate restano i millimetri veri del pezzo;
 * e la scala finisce SCRITTA nel titolo, perché una misura presa da un
 * disegno di cui non si sa la scala è una misura sbagliata.
 *
 * Le etichette — livello a parte, che la macchina non taglia — sono impaginate
 * dallo stesso motore del PDF: nome e misura dentro il pezzo, grandi quanto il
 * pezzo consente, girati per lungo sui pezzi stretti. Così quello che si legge
 * sul foglio e quello che si legge nel file sono la stessa cosa.
 */

import type { LastraNesting, Piazzamento } from './nesting';
import { ancoraEtichetta, misureForma } from './sagome';
import { pianoEtichetta, righeEtichetta } from '../utils/etichettaNesting';

/** magenta 100% in quadricromia, come lo rende lo schermo */
export const MAGENTA_TAGLIO = '#EC008C';

export interface OpzioniSvgTaglio {
  /** titolo del disegno, finisce nel tag <title> */
  titolo?: string;
  /** spessore delle linee in mm DI FOGLIO: sottile, deve solo essere visibile */
  spessore?: number;
  /** disegnare anche il nome dei pezzi (non tagliato, solo riferimento) */
  etichette?: boolean;
  /**
   * Denominatore della scala: 1 = 1:1 (alla macchina), 10 = 1:10 (sul foglio).
   * Rimpicciolisce il disegno stampato, non le coordinate.
   */
  scala?: number;
}

/** le scale che si usano davvero: 1:1 per la macchina, il resto per il foglio */
export const SCALE_TAGLIO = [1, 2, 5, 10, 20, 25, 50] as const;

/**
 * Il denominatore della scala, messo in riga: un intero da 1 in su.
 *
 * Un valore assente, storto o minore di uno vale 1:1 — l'unica scala che
 * non può mai essere sbagliata, perché è il file che va alla macchina.
 */
export function denominatoreScala(v: number | undefined): number {
  return Number.isFinite(v) ? Math.max(1, Math.round(v as number)) : 1;
}

/** «1:10», come si scrive su un disegno */
export function scalaScritta(denominatore: number): string {
  return `1:${denominatoreScala(denominatore)}`;
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
  const k = denominatoreScala(opzioni?.scala);
  // il tratto è una proprietà del FOGLIO, non del disegno: a 1:10 una linea da
  // un quarto di millimetro diventerebbe un quarantesimo, cioè niente. Si
  // ingrandisce quanto si rimpicciolisce il disegno, e resta com'era in mano.
  const sp = (opzioni?.spessore ?? 0.25) * k;

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
    `     width="${num(L / k)}mm" height="${num(A / k)}mm" viewBox="0 0 ${num(L)} ${num(A)}">`,
    // la scala si dichiara sempre, anche quando è 1:1: è il dato che rende
    // vera o falsa ogni misura presa sul disegno
    `  <title>${perXml(
      [opzioni?.titolo, `scala ${scalaScritta(k)}`].filter(Boolean).join(' — ')
    )}</title>`,
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

/** l'etichetta di un pezzo: nome e misura, o quel che ci sta */
function etichettaPezzo(p: Piazzamento): string {
  // come in pagina: il testo sta nel baricentro della sagoma, non del riquadro
  const ancora = p.punti ? ancoraEtichetta(p.punti) : null;
  const cx = p.x + (ancora ? ancora.x : p.larghezza / 2);
  const cy = p.y + (ancora ? ancora.y : p.altezza / 2);
  const largaUtile = ancora ? ancora.larghezza : p.larghezza;
  const altaUtile = ancora ? ancora.altezza : p.altezza;
  // la misura parla la lingua della forma: Ø300, 500/300×200, 600×400|800
  const misura = misureForma({
    forma: p.forma,
    larghezza: p.larghezzaFinita,
    altezza: p.altezzaFinita,
    misura3: p.misura3Finita,
    vertici: p.verticiFiniti
  });
  const piano = pianoEtichetta(largaUtile, altaUtile, p.nome || '', misura, CORPI_ETICHETTA);
  if (!piano) return '';

  // le righe — il nome, magari mandato a capo, e sotto la misura — arrivano
  // già collocate dal motore: schermo, PDF e file di taglio le mettono nello
  // stesso punto perché le chiedono alla stessa funzione
  const righe = righeEtichetta(piano).map(
    (r) =>
      `      <text x="${num(cx)}" y="${num(cy + r.dy)}" font-size="${num(r.corpo)}"` +
      `${r.forte ? ' font-weight="600"' : ''}` +
      ` text-anchor="middle" dominant-baseline="central">${perXml(r.testo)}</text>`
  );
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
