/**
 * Le PORTE nei PDF: piano delle bobine delle porte a strisce e istruzioni di
 * montaggio (pagine fatte dal rilievo porta, qui come immagini).
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { formattaNumero } from '../utils/format';
import type { RiepilogoStrisce } from '../utils/portePiano';
import type { PorteDelReport } from '../utils/porteDocumento';

const mm = (v: number) => formattaNumero(Math.round(v * 10) / 10);

function tabella(intestazione: string[], righe: TableCell[][], larghezze: (string | number)[]): Content {
  return {
    table: {
      headerRows: 1,
      widths: larghezze,
      body: [intestazione.map((t) => ({ text: t, style: 'th' })), ...righe]
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 12]
  } as Content;
}

/** Piano delle bobine delle porte a strisce. */
export function contenutoBobinePorte(r: RiepilogoStrisce): Content[] {
  const scorte = r.tagli.reduce((n, t) => n + t.bobine * t.strisce.filter((s) => s.scorta).length, 0);
  const daDecidere = r.tagli.some((t) => t.daDecidere);
  const out: Content[] = [
    { text: 'Bobine delle porte a strisce', style: 'h2', tocItem: true } as Content,
    {
      text: [
        `${r.bobine} ${r.bobine === 1 ? 'bobina' : 'bobine'} da ${mm(r.larghezza)} mm · rotoli da ${mm(r.metriRotolo)} m`,
        scorte ? ` · ${scorte} ${scorte === 1 ? 'rotolo' : 'rotoli'} di scorta` : '',
        daDecidere ? ' · ATTENZIONE: spazio libero ancora da decidere' : ''
      ].join(''),
      style: 'dati'
    },
    { text: 'Come tagliare le bobine', style: 'h3', margin: [0, 8, 0, 2] },
    tabella(
      ['Bobine', 'Strisce (mm, * = scorta)', 'Avanzo'],
      r.tagli.map((t) => {
        const usato = t.strisce.reduce((n, s) => n + s.larghezza, 0);
        return [
          { text: String(t.bobine), style: 'td', alignment: 'center' },
          {
            text: t.strisce.map((s) => `${mm(s.larghezza)}${s.scorta ? '*' : s.intero ? ' (resto intero)' : ''}`).join(' · '),
            style: 'td'
          },
          {
            text: r.larghezza - usato > 0.5 ? `${mm(r.larghezza - usato)} mm` + (t.daDecidere ? ' (da decidere)' : '') : '—',
            style: 'td'
          }
        ];
      }),
      [45, '*', 90]
    ),
    { text: 'Rotoli che escono dal taglio', style: 'h3', margin: [0, 4, 0, 2] },
    tabella(
      ['Rotolo', 'Rotoli', 'Metri', 'Pezzi che ci vanno'],
      r.rotoli.map((g) => [
        {
          text: `${mm(g.larghezza)} mm` + (g.larghezza > g.da ? `\n(pezzi da ${mm(g.da)})` : ''),
          style: 'td'
        },
        { text: String(g.rotoli), style: 'td', alignment: 'center' },
        { text: formattaNumero(g.metri), style: 'td', alignment: 'right' },
        {
          text: g.pezzi
            .map((p) => `${p.quantita} × ${mm(p.larghezza)}×${mm(p.lunghezza)} — ${p.nomi.join(', ')}`)
            .join('\n'),
          style: 'td',
          fontSize: 8.5
        }
      ]),
      [70, 40, 45, '*']
    )
  ];
  return out;
}

/**
 * Capitolo PORTE in coda al PDF del sopralluogo: elenco dei tipi, bobine
 * delle porte a strisce (se richiesto) e istruzioni di montaggio.
 */
export function contenutoPorte(
  dati: PorteDelReport,
  opzioni: { bobine: boolean; orizzontale?: boolean }
): Content[] {
  const out: Content[] = [
    { text: 'Porte', style: 'h1', pageBreak: 'before', tocItem: true } as Content,
    tabella(
      ['Porta', 'Descrizione', 'Q.tà', 'Taglio'],
      dati.porte.map((p) => [
        { text: p.porta.nome, style: 'td', bold: true },
        { text: p.porta.descrizione, style: 'td', fontSize: 9 },
        { text: String(p.quantita), style: 'td', alignment: 'center' },
        { text: p.modo === 'kit' ? 'Kit' : 'Strisce', style: 'td' }
      ]),
      [60, '*', 35, 50]
    ),
    {
      text: 'Kit: ogni pezzo alla sua misura, nel piano di taglio (essenza «Porte (kit)»). Strisce: rotoli ricavati dalle bobine, qui sotto. Il numero di porte viene dalle etichette sulle foto.',
      style: 'dati'
    }
  ];
  if (opzioni.bobine && dati.bobine) out.push(...contenutoBobinePorte(dati.bobine));
  // pagine di montaggio: A4 verticali, intere
  const area: [number, number] = opzioni.orizzontale ? [760, 470] : [515, 700];
  for (const p of dati.porte) {
    p.pagine.forEach((img, i) => {
      if (i === 0) {
        out.push({
          text: `Montaggio ${p.porta.nome}`,
          style: 'h2',
          pageBreak: 'before',
          tocItem: true
        } as Content);
      }
      out.push({
        image: img,
        fit: area,
        alignment: 'center',
        ...(i > 0 ? { pageBreak: 'before' } : {})
      } as Content);
    });
  }
  return out;
}
