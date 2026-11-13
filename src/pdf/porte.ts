/**
 * Le PORTE nei PDF, come documento da consegnare a chi taglia e a chi monta:
 *
 * 1. elenco delle porte (quante, come si tagliano, quale gruppo di istruzioni);
 * 2. bobine delle porte a strisce DISEGNATE come nell'app, poi i rotoli che ne
 *    escono e i pezzi previsti su ogni rotolo;
 * 3. per ogni gruppo di porte con la stessa costruzione, le istruzioni di
 *    montaggio una volta sola, seguite dall'elenco dei pezzi di OGNI porta.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { formattaNumero } from '../utils/format';
import type { RiepilogoStrisce } from '../utils/portePiano';
import type { MontaggioPorta, PorteDelReport } from '../utils/porteDocumento';

const mm = (v: number) => formattaNumero(Math.round(v * 10) / 10);
const VERDE = '#087b70';
const VERDE_CHIARO = '#dcefeb';
const GIALLO = '#c98a00';
const GIALLO_CHIARO = '#fff1cf';
const GRIGIO_BARRA = '#e6eaed';
const INCHIOSTRO = '#27333b';

function th(testo: string, allineamento: 'left' | 'center' | 'right' = 'left'): TableCell {
  return { text: testo, style: 'th', alignment: allineamento };
}
function td(testo: string, extra: Record<string, unknown> = {}): TableCell {
  return { text: testo, style: 'td', ...extra } as TableCell;
}

function tabella(
  intestazione: TableCell[],
  righe: TableCell[][],
  larghezze: (string | number)[],
  margine: [number, number, number, number] = [0, 4, 0, 12]
): Content {
  return {
    table: { headerRows: 1, widths: larghezze, body: [intestazione, ...righe], dontBreakRows: true },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 1 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => '#c9d2d8',
      paddingTop: () => 4,
      paddingBottom: () => 4
    },
    margin: margine
  } as Content;
}

/** Tre numeri in grande: quello che serve per preparare il materiale. */
function riquadriChiave(voci: Array<[string, string]>): Content {
  return {
    table: {
      widths: voci.map(() => '*'),
      body: [
        voci.map(([etichetta, valore]) => ({
          stack: [
            { text: etichetta.toUpperCase(), fontSize: 8, color: '#56636d', characterSpacing: 0.5 },
            { text: valore, fontSize: 20, bold: true, color: INCHIOSTRO, margin: [0, 2, 0, 0] }
          ],
          fillColor: '#f2f5f7',
          margin: [8, 6, 8, 6]
        }))
      ]
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i > 0 && i < voci.length ? 6 : 0),
      vLineColor: () => '#ffffff'
    },
    margin: [0, 4, 0, 12]
  } as Content;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Una bobina come nell'app: la barra della larghezza intera, le strisce in
 * proporzione con la loro misura, le scorte in giallo, l'avanzo in grigio.
 */
function svgBobina(larghezzaBobina: number, strisce: RiepilogoStrisce['tagli'][number]['strisce']): string {
  const W = 515;
  const H = 74;
  const y0 = 18;
  const h = 40;
  const k = W / larghezzaBobina;
  const parti: string[] = [];
  // quota della bobina intera
  parti.push(
    `<line x1="0.5" y1="9" x2="${W - 0.5}" y2="9" stroke="#56636d" stroke-width="0.7"/>`,
    `<line x1="0.5" y1="5" x2="0.5" y2="13" stroke="#56636d" stroke-width="0.7"/>`,
    `<line x1="${W - 0.5}" y1="5" x2="${W - 0.5}" y2="13" stroke="#56636d" stroke-width="0.7"/>`,
    `<rect x="${W / 2 - 34}" y="3" width="68" height="11" fill="#ffffff"/>`,
    `<text x="${W / 2}" y="12" font-size="9" text-anchor="middle" fill="#56636d">${mm(larghezzaBobina)} mm</text>`
  );
  let x = 0;
  const segmento = (w: number, riempi: string, bordo: string, testo: string, sotto: string, colore: string) => {
    const larg = w * k;
    parti.push(
      `<rect x="${x + 0.4}" y="${y0}" width="${Math.max(0.5, larg - 0.8)}" height="${h}" fill="${riempi}" stroke="${bordo}" stroke-width="0.8"/>`
    );
    const cx = x + larg / 2;
    if (larg >= testo.length * 5.4 + 4) {
      parti.push(
        `<text x="${cx}" y="${y0 + h / 2 + 4}" font-size="10" font-weight="bold" text-anchor="middle" fill="${colore}">${esc(testo)}</text>`
      );
    } else {
      // striscia stretta: la misura in verticale
      parti.push(
        `<text x="${cx + 3.2}" y="${y0 + h / 2}" font-size="8.5" font-weight="bold" text-anchor="middle" fill="${colore}" transform="rotate(-90 ${cx + 3.2} ${y0 + h / 2})">${esc(testo)}</text>`
      );
    }
    if (sotto) {
      parti.push(
        `<text x="${cx}" y="${y0 + h + 11}" font-size="7.5" text-anchor="middle" fill="${colore}">${esc(sotto)}</text>`
      );
    }
    x += larg;
  };
  let usato = 0;
  for (const s of strisce) {
    if (s.scorta) segmento(s.larghezza, GIALLO_CHIARO, GIALLO, mm(s.larghezza), s.larghezza * k > 30 ? 'scorta' : '', '#7a5300');
    else if (s.intero) segmento(s.larghezza, GRIGIO_BARRA, '#9aa5ad', mm(s.larghezza), s.larghezza * k > 40 ? 'resto intero' : '', '#56636d');
    else segmento(s.larghezza, VERDE_CHIARO, VERDE, mm(s.larghezza), '', VERDE);
    usato += s.larghezza;
  }
  const resto = larghezzaBobina - usato;
  if (resto > 0.5) segmento(resto, '#f4f6f7', '#c3cbd1', mm(resto), resto * k > 34 ? 'avanzo' : '', '#7d8a93');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">${parti.join('')}</svg>`;
}

/** Piano delle bobine delle porte a strisce: grafica, rotoli, pezzi previsti. */
export function contenutoBobinePorte(r: RiepilogoStrisce): Content[] {
  const daDecidere = r.tagli.some((t) => t.daDecidere);
  const out: Content[] = [
    { text: 'Bobine delle porte a strisce', style: 'h2', tocItem: true } as Content,
    riquadriChiave([
      ['Bobine da tagliare', String(r.bobine)],
      ['Larghezza bobina', `${mm(r.larghezza)} mm`],
      ['Lunghezza rotolo', `${mm(r.metriRotolo)} m`]
    ])
  ];
  if (daDecidere) {
    out.push({
      text: 'Attenzione: su alcune bobine lo spazio libero non è ancora stato assegnato (scorta o avanzo).',
      color: '#a3480b',
      fontSize: 10,
      margin: [0, 0, 0, 8]
    } as Content);
  }

  // 1. come tagliare le bobine: la stessa barra dell'app
  out.push({ text: 'Taglio delle bobine', style: 'h3', margin: [0, 4, 0, 4] } as Content);
  for (const t of r.tagli) {
    out.push({
      stack: [
        {
          text: [
            { text: `${t.bobine} ${t.bobine === 1 ? 'bobina' : 'bobine'}`, bold: true, fontSize: 11 },
            { text: t.bobine === 1 ? '  tagliata così' : '  tagliate tutte così', fontSize: 9, color: '#56636d' }
          ]
        },
        { svg: svgBobina(r.larghezza, t.strisce), width: 515, margin: [0, 2, 0, 0] }
      ],
      unbreakable: true,
      margin: [0, 2, 0, 8]
    } as Content);
  }
  out.push({
    text: [
      { text: '■ ', color: VERDE },
      'striscia per i pezzi   ',
      { text: '■ ', color: GIALLO },
      'scorta   ',
      { text: '■ ', color: '#9aa5ad' },
      'avanzo / resto intero. Misure in mm.'
    ],
    fontSize: 8.5,
    color: '#56636d',
    margin: [0, 0, 0, 12]
  } as Content);

  // 2. rotoli risultanti: quanti, larghi quanto, lunghi quanto
  out.push({ text: 'Rotoli risultanti', style: 'h3', margin: [0, 4, 0, 2] } as Content);
  out.push(
    tabella(
      [th('Rotoli', 'center'), th('Larghezza'), th('Lunghezza rotolo'), th('Metri da tagliare', 'right')],
      r.rotoli.map((g) => [
        td(
          `${g.rotoli + (g.scorta ?? 0)}${g.scorta ? `\n(di cui ${g.scorta} scorta)` : ''}`,
          { alignment: 'center', bold: true, fontSize: 13 }
        ),
        td(`${mm(g.larghezza)} mm`, { bold: true, fontSize: 13 }),
        td(`${mm(r.metriRotolo)} m`, { bold: true, fontSize: 13 }),
        td(`${formattaNumero(g.metri)} m`, { alignment: 'right' })
      ]),
      [70, '*', '*', 90]
    )
  );

  // 3. pezzi previsti su ogni rotolo
  out.push({ text: 'Pezzi previsti per rotolo', style: 'h3', margin: [0, 4, 0, 2] } as Content);
  for (const g of r.rotoli) {
    const righe: TableCell[][] = (g.dettaglio && g.dettaglio.length
      ? g.dettaglio
      : g.pezzi.map((p) => ({
          pezzo: p.nomi.join(', '),
          porta: '',
          quantita: p.quantita,
          larghezza: p.larghezza,
          lunghezza: p.lunghezza
        }))
    ).map((d) => [
      td(d.pezzo),
      td(d.porta.replace(/^Porta\s+/, ''), { alignment: 'center' }),
      td(String(d.quantita), { alignment: 'center', bold: true }),
      td(`${mm(d.larghezza)} × ${mm(d.lunghezza)}`, { alignment: 'right' })
    ]);
    out.push({
      stack: [
        { text: `Rotolo ${mm(g.larghezza)} mm`, bold: true, fontSize: 10.5, color: VERDE, margin: [0, 4, 0, 0] },
        tabella(
          [th('Pezzo'), th('Porta', 'center'), th('Q.tà', 'center'), th('Dimensioni di taglio (mm)', 'right')],
          righe,
          ['*', 40, 40, 130],
          [0, 2, 0, 8]
        )
      ]
    } as Content);
  }
  return out;
}

/** Una riga della distinta: i pezzi uguali (montante destro e sinistro) insieme. */
interface RigaDistinta {
  numeri: number[];
  nome: string;
  larghezza: number;
  lunghezza: number;
  perPorta: number;
}

function righeDistinta(righe: MontaggioPorta['porta']['righe']): { maesta: RigaDistinta[]; anta: RigaDistinta[] } {
  const raccogli = (lista: typeof righe) => {
    const out: Array<RigaDistinta & { originale: string }> = [];
    lista.forEach((r, i) => {
      const nome = r.nome.replace(/^Montante (DX|SX)\b/, 'Montanti');
      const gia =
        nome !== r.nome
          ? out.find((x) => x.nome === nome && x.larghezza === r.larghezza && x.lunghezza === r.lunghezza)
          : undefined;
      if (gia) {
        gia.numeri.push(i + 1);
        gia.perPorta++;
      } else {
        out.push({ numeri: [i + 1], nome, originale: r.nome, larghezza: r.larghezza, lunghezza: r.lunghezza, perPorta: 1 });
      }
    });
    // un montante rimasto solo (destro e sinistro di misure diverse) riprende il suo nome
    return out.map(({ originale, ...x }) => (x.perPorta === 1 ? { ...x, nome: originale } : x));
  };
  return { maesta: raccogli(righe.filter((r) => !r.anta)), anta: raccogli(righe.filter((r) => r.anta)) };
}

/** Elenco dei pezzi di UNA porta: maestà e anta, con quantità e misure. */
function distintaPorta(m: MontaggioPorta, rotolo: (larghezza: number) => number | null): Content[] {
  const { maesta, anta } = righeDistinta(m.porta.righe);
  const taglio = (w: number) => {
    if (m.modo === 'kit') return 'Kit';
    const r = rotolo(w);
    return r ? `Rotolo ${mm(r)}` : '—';
  };
  const sezione = (titolo: string, righe: RigaDistinta[]): TableCell[][] =>
    righe.length === 0
      ? []
      : [
          [
            { text: titolo.toUpperCase(), colSpan: 7, bold: true, fontSize: 9, color: VERDE, fillColor: '#eef6f4', characterSpacing: 0.6 },
            {}, {}, {}, {}, {}, {}
          ] as TableCell[],
          ...righe.map((r) => [
            td(r.numeri.join(' · '), { alignment: 'center', color: '#56636d' }),
            td(r.nome),
            td(mm(r.larghezza), { alignment: 'right', bold: true }),
            td(mm(r.lunghezza), { alignment: 'right', bold: true }),
            td(String(r.perPorta), { alignment: 'center' }),
            td(String(r.perPorta * m.quantita), { alignment: 'center', bold: true }),
            td(taglio(r.larghezza))
          ])
        ];
  // la distinta di una porta resta intera su una pagina, se ci sta
  return [{ stack: [
    {
      text: [
        { text: `ELENCO PEZZI – ${m.porta.nome.toUpperCase()}`, bold: true },
        { text: `   ${m.quantita} ${m.quantita === 1 ? 'porta' : 'porte'} · ${m.modo === 'kit' ? 'kit (pezzi a misura)' : 'a strisce'}`, color: '#56636d', fontSize: 10 }
      ],
      fontSize: 13,
      color: INCHIOSTRO,
      margin: [0, 14, 0, 2]
    } as Content,
    tabella(
      [
        th('N°', 'center'),
        th('Pezzo'),
        th('Larghezza', 'right'),
        th('Lunghezza', 'right'),
        th('Per porta', 'center'),
        th('Totale', 'center'),
        th('Taglio')
      ],
      [...sezione('Maestà', maesta), ...sezione('Anta', anta)],
      [34, '*', 54, 54, 44, 38, 62]
    ),
    {
      text: 'Misure in mm, già comprese di sormonti e abbondanze. I numeri sono quelli dei disegni di montaggio.',
      fontSize: 8,
      color: '#56636d',
      margin: [0, -6, 0, 6]
    } as Content
  ], unbreakable: true } as Content];
}

/**
 * Capitolo PORTE in coda al PDF del sopralluogo.
 */
export function contenutoPorte(
  dati: PorteDelReport,
  opzioni: { bobine: boolean; orizzontale?: boolean }
): Content[] {
  const out: Content[] = [
    { text: 'Porte', style: 'h1', pageBreak: 'before', tocItem: true } as Content,
    tabella(
      [th('Porta'), th('Quantità', 'center'), th('Tipo di taglio'), th('Istruzioni di montaggio')],
      dati.porte.map((p) => [
        td(p.porta.lettera, { bold: true, fontSize: 12 }),
        td(String(p.quantita), { alignment: 'center', bold: true, fontSize: 12 }),
        td(p.modo === 'kit' ? 'Kit (pezzi a misura)' : 'Strisce da bobina'),
        td(`Gruppo ${p.gruppo}`)
      ]),
      [60, 70, '*', '*']
    )
  ];
  if (opzioni.bobine && dati.bobine) out.push(...contenutoBobinePorte(dati.bobine));

  // larghezza del rotolo di ogni pezzo a strisce
  const rotolo = (w: number) =>
    dati.bobine?.rotoli.find((g) => g.pezzi.some((p) => p.larghezza === w))?.larghezza ?? null;
  const area: [number, number] = opzioni.orizzontale ? [760, 470] : [515, 690];
  for (const g of dati.gruppi) {
    out.push({
      text: `GRUPPO ${g.numero} – ISTRUZIONI DI MONTAGGIO – ${g.nome.toUpperCase()}`,
      style: 'h2',
      pageBreak: 'before',
      tocItem: true
    } as Content);
    if (g.pagine.length === 0) {
      out.push({ text: 'Istruzioni non disponibili per queste porte.', style: 'dati' } as Content);
    }
    g.pagine.forEach((img, i) => {
      out.push({ image: img, fit: area, alignment: 'center', ...(i > 0 ? { pageBreak: 'before' } : {}) } as Content);
    });
    // le distinte, una per porta, dopo le istruzioni comuni
    out.push({ text: '', pageBreak: 'before' } as Content);
    for (const p of g.porte) out.push(...distintaPorta(p, rotolo));
  }
  return out;
}
