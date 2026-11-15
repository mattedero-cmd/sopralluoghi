import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { pdfMake, COLORI_PDF } from './engine';
import { leggiImpostazioni } from '../db/repository';
import { impaginaLastra, type AreaPagina, type DisegnoLastra } from './disegnoNesting';
import { colonneConsigliate, spezzaInColonne, type Colonna } from './colonne';
import {
  lunghezzaUsata,
  riepilogaNesting,
  type EsitoNesting,
  type LastraNesting
} from '../geometry/nesting';
import { calcolaNestingAuto } from '../geometry/nestingSagome';
import { misureForma } from '../geometry/sagome';
import { frasiRitagli, ritagliUtili, segmentaBobina } from '../geometry/segmenti';
import { OPZIONI_PDF_PREDEFINITE, type OpzioniPdfNesting } from './opzioni';
import { contenutoBobinePorte, legendaSigle } from './porte';
import { essenzeKit } from '../utils/portePiano';
import {
  etichettaSupporto,
  opzioniRicerca,
  parametriDi,
  pezziDi,
  type DocumentoNesting,
  type MaterialeNesting
} from '../utils/documentoNesting';
import { larghezzaStimata } from '../utils/etichettaNesting';
import { formattaData, formattaNumero } from '../utils/format';
import { tintaSfondoEsa, tintaBordoEsa } from '../utils/tinte';

/**
 * PDF DEL PIANO DI TAGLIO.
 *
 * Una pagina di riepilogo con la distinta per essenza, poi UNA PAGINA A4 PER
 * OGNI LASTRA O SEGMENTO: è il foglio che si porta al banco.
 *
 * La divisione della bobina in segmenti è un'opzione DI QUESTA esportazione,
 * non un dato del materiale: dove spezzare il rotolo lo trova il programma
 * (vedi geometry/segmenti), perché dipende da come sono impaginati i pezzi.
 */

/** una pagina del PDF: una lastra, oppure un segmento di bobina */
interface Foglio {
  lastra: LastraNesting;
  titolo: string;
  /** misure del supporto disegnato */
  larghezza: number;
  altezza: number;
  /** metri di materiale da staccare (solo bobina) */
  daTagliare: number | null;
  oltreMassimo: boolean;
}

// A4 in punti (in piedi e coricata), meno i margini della pagina
const A4 = { corto: 595.28, lungo: 841.89 };
// gli stessi margini dei report e dei preventivi: i documenti dell'app si
// riconoscono come una famiglia
const MARGINI: [number, number, number, number] = [40, 50, 40, 50];
/** il disegno comincia sotto l'intestazione */
const Y_DISEGNO = 100;
/**
 * Quanto si tiene libero in fondo alla pagina: il margine (50) più una riga
 * per la targhetta sotto le colonne. Qui c'era l'elenco dei pezzi, che voleva
 * tre righe e un conto per non finire sulla pagina dopo; adesso che il
 * disegno si legge l'elenco non serve, e quello spazio torna al disegno.
 */
const SOTTO_DISEGNO = 68;
/** lo spazio fra una colonna e l'altra, e il corpo della sua targhetta */
const VUOTO_COLONNA = 12;
const CORPO_TARGHETTA = 7;
/** corpo del sottotitolo, e quanto si può scendere per non mandarlo a capo */
const CORPO_SOTTOTITOLO = 10;
const CORPO_SOTTOTITOLO_MINIMO = 7;

/**
 * Area del disegno sulla pagina. Una lastra larga si legge molto meglio su
 * una pagina coricata: il verso segue la forma del supporto.
 */
function areaPagina(orizzontale: boolean): AreaPagina {
  const larghezzaPagina = orizzontale ? A4.lungo : A4.corto;
  const altezzaPagina = orizzontale ? A4.corto : A4.lungo;
  return {
    x: MARGINI[0],
    y: Y_DISEGNO,
    larghezza: larghezzaPagina - MARGINI[0] - MARGINI[2],
    altezza: altezzaPagina - Y_DISEGNO - SOTTO_DISEGNO
  };
}

const mm = (v: number) => formattaNumero(Math.round(v * 10) / 10);

/**
 * Fogli da stampare per un materiale: le sue lastre, oppure i segmenti in cui
 * conviene spezzare la bobina.
 */
function fogliDi(
  m: MaterialeNesting,
  esito: EsitoNesting,
  opzioni: OpzioniPdfNesting
): Foglio[] {
  if (m.modo !== 'bobina') {
    return esito.lastre.map((lastra, i) => ({
      lastra,
      titolo: `Lastra ${i + 1} di ${esito.lastre.length}`,
      larghezza: m.lastra.larghezza,
      altezza: m.lastra.altezza,
      daTagliare: null,
      oltreMassimo: false
    }));
  }

  // i rotoli possono essere più d'uno: finito il primo se ne apre un altro, e
  // ognuno si stampa per conto suo — si taglia un rotolo alla volta
  const rotoli = esito.lastre.filter((l) => l.piazzamenti.length > 0);
  if (rotoli.length === 0) return [];
  const diQuanti = (i: number) => (rotoli.length > 1 ? ` ${i + 1} di ${rotoli.length}` : '');

  return rotoli.flatMap((rotolo, i) => {
    if (!opzioni.segmenta || !(opzioni.massimoSegmento > 0)) {
      const usata = Math.max(1, lunghezzaUsata(rotolo, m.margine));
      return [
        {
          lastra: rotolo,
          titolo: `Bobina${diQuanti(i)}`,
          larghezza: m.bobina.larghezza,
          altezza: usata,
          daTagliare: usata,
          oltreMassimo: false
        }
      ];
    }
    const segmenti = segmentaBobina(
      rotolo,
      opzioni.massimoSegmento,
      m.margine,
      m.bobina.larghezza,
      m.lama
    );
    return segmenti.map((sg, k) => ({
      lastra: sg.lastra,
      titolo:
        rotoli.length > 1
          ? `Bobina ${i + 1} di ${rotoli.length} — segmento ${k + 1} di ${segmenti.length}`
          : `Segmento ${k + 1} di ${segmenti.length}`,
      larghezza: m.bobina.larghezza,
      altezza: Math.max(1, sg.fine - sg.inizio),
      daTagliare: sg.fine - sg.inizio,
      oltreMassimo: sg.oltreMassimo
    }));
  });
}

/**
 * UNA RIGA DI SOTTOTITOLO CHE NON VA MAI A CAPO.
 *
 * Il disegno comincia a una quota FISSA sotto l'intestazione, quindi una
 * riga che va a capo si infila sotto la cornice e sparisce: su un foglio con
 * tre ritagli buoni la coda — «e 236×1.477 mm» — finiva nascosta dietro il
 * primo pezzo. Qui la riga si misura prima: se non ci sta si rimpicciolisce
 * fino a sette punti, e solo se nemmeno così ci sta si tronca. Meglio una
 * riga un filo più piccola che una riga che non si vede.
 */
function rigaSottotitolo(testo: string, larghezza: number, dove: 'left' | 'right'): Content {
  const peso = Math.max(1e-6, larghezzaStimata(testo));
  const corpo = Math.max(CORPO_SOTTOTITOLO_MINIMO, Math.min(CORPO_SOTTOTITOLO, larghezza / peso));
  let scritto = testo;
  // sotto il minimo non si scende: da lì in poi si leva testo
  if (peso * corpo > larghezza + 1e-6) {
    while (scritto.length > 1 && larghezzaStimata(`${scritto}…`) * corpo > larghezza) {
      scritto = scritto.slice(0, -1);
    }
    scritto = `${scritto.trimEnd()}…`;
  }
  return {
    text: scritto,
    style: 'sottotitolo',
    fontSize: corpo,
    alignment: dove,
    noWrap: true
  };
}

/** disegno di un foglio come contenuti pdfmake, posizionati sulla pagina */
function paginaFoglio(m: MaterialeNesting, foglio: Foglio): Content[] {
  const lastra = foglio.lastra;
  const disegnate = { larghezza: foglio.larghezza, altezza: foglio.altezza };

  const titolo = foglio.titolo;
  // lo sfrido buono: i pezzi interi che restano, dal più grande
  const ritagli = ritagliUtili(lastra, foglio.larghezza, foglio.altezza);
  const avanzo = frasiRitagli(ritagli);
  const sottotitolo =
    foglio.daTagliare !== null
      ? `${mm(foglio.larghezza)} × ${mm(foglio.altezza)} mm · da staccare ${formattaNumero(
          Math.round(foglio.daTagliare) / 1000
        )} m${foglio.oltreMassimo ? ' · nessun taglio libero prima' : ''}`
      : `${mm(foglio.larghezza)} × ${mm(foglio.altezza)} mm`;

  const orizzontale = disegnate.larghezza >= disegnate.altezza;
  const area = areaPagina(orizzontale);

  // IL ROTOLO VA A CAPO. Un segmento lungo venti metri e largo uno, disegnato
  // intero, è un filo dove i nomi non si leggono: si spezza in colonne
  // affiancate, come il testo di un giornale.
  const quante = colonneConsigliate(disegnate, area, VUOTO_COLONNA);
  const colonne = spezzaInColonne(lastra, disegnate, quante);
  const largaColonna = (area.larghezza - (quante - 1) * VUOTO_COLONNA) / quante;
  // TUTTE LE COLONNE ALLA STESSA SCALA. I tagli non cadono a distanze uguali
  // — si spostano per non spezzare un pezzo — e lasciando che ognuna si
  // scalasse da sé un pezzo finiva disegnato più grande nella colonna accanto
  // a quella del suo gemello. La scala la detta la colonna più lunga.
  const piuLunga = Math.max(...colonne.map((c) => c.a - c.da));
  const scala = Math.min(largaColonna / Math.max(1, disegnate.larghezza), area.altezza / piuLunga);
  const disegni = colonne.map((c, i) =>
    impaginaLastra(
      c.lastra,
      { larghezza: disegnate.larghezza, altezza: c.a - c.da },
      {
        x: area.x + i * (largaColonna + VUOTO_COLONNA),
        y: area.y,
        larghezza: largaColonna,
        altezza: area.altezza
      },
      {
        margine: m.margine,
        // il bordo del margine c'è solo dove il rotolo comincia e dove
        // finisce davvero: fra una colonna e l'altra non c'è nessun bordo
        margineCima: i === 0,
        margineFondo: i === colonne.length - 1,
        venatura: m.venatura,
        scala,
        giunzioni: c.giunzioni,
        conEtichetta: (pc) => c.etichettate.has(pc.chiave)
      }
    )
  );
  // le cornici restano separate (una per colonna), tutto il resto si disegna
  // in un pezzo solo: pezzi, venatura ed etichette portano già la loro
  // posizione sulla pagina
  const d = {
    pezzi: disegni.flatMap((x) => x.pezzi),
    venatura: disegni.flatMap((x) => x.venatura),
    testi: disegni.flatMap((x) => x.testi),
    ruotate: disegni.flatMap((x) => x.ruotate),
    giunzioni: disegni.flatMap((x) => x.giunzioni)
  };

  const disegno: Content = {
    absolutePosition: { x: 0, y: 0 },
    canvas: [
      ...disegni.map((x) => ({
        type: 'rect' as const,
        x: x.cornice.x,
        y: x.cornice.y,
        w: x.cornice.larghezza,
        h: x.cornice.altezza,
        color: x.cornice.riempimento,
        lineColor: x.cornice.bordo,
        lineWidth: x.cornice.spessore
      })),
      ...disegni.flatMap((x) =>
        x.margine
          ? [
              {
                type: 'rect' as const,
                x: x.margine.x,
                y: x.margine.y,
                w: x.margine.larghezza,
                h: x.margine.altezza,
                lineColor: x.margine.bordo,
                lineWidth: x.margine.spessore,
                dash: { length: 3, space: 2 }
              }
            ]
          : []
      ),
      // la sagoma vera quando c'è: il PDF mostra il taglio, non l'ingombro
      ...d.pezzi.map((p) =>
        p.raggio
          ? {
              type: 'ellipse' as const,
              x: p.x + p.larghezza / 2,
              y: p.y + p.altezza / 2,
              r1: p.raggio,
              r2: p.raggio,
              color: p.riempimento,
              lineColor: p.bordo,
              lineWidth: p.spessore
            }
          : p.poligono
            ? {
                type: 'polyline' as const,
                closePath: true,
                points: p.poligono,
                color: p.riempimento,
                lineColor: p.bordo,
                lineWidth: p.spessore
              }
            : {
                type: 'rect' as const,
                x: p.x,
                y: p.y,
                w: p.larghezza,
                h: p.altezza,
                color: p.riempimento,
                lineColor: p.bordo,
                lineWidth: p.spessore
              }
      ),
      ...d.venatura.map((l) => ({
        type: 'line' as const,
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        lineColor: '#7d6a54',
        lineWidth: 0.25
      })),
      // DOVE IL FOGLIO HA TAGLIATO IL PEZZO si deve vedere. Il bordo pieno
      // si cancella con una riga bianca — lì il pezzo non finisce — e al suo
      // posto va un tratteggio scuro, che non somiglia a nessun altro bordo
      // del disegno. Sopra ci si scrive che parte è.
      ...d.giunzioni.map((g) => ({
        type: 'line' as const,
        x1: g.x1,
        y1: g.y1,
        x2: g.x2,
        y2: g.y2,
        lineColor: '#ffffff',
        lineWidth: 2.2
      })),
      ...d.giunzioni.map((g) => ({
        type: 'line' as const,
        x1: g.x1,
        y1: g.y1,
        x2: g.x2,
        y2: g.y2,
        lineColor: '#1d2229',
        lineWidth: 0.9,
        dash: { length: 3, space: 2.4 }
      }))
    ]
  };

  /**
   * Etichette girate di 90°: pdfmake non sa ruotare il testo, ma sa disegnare
   * un frammento SVG, e dentro l'SVG la rotazione è normale amministrazione.
   * Se ne mette uno per pezzo, grande quanto il pezzo.
   */
  const perXml = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ruotate: Content[] = d.ruotate.map((e) => {
    const cx = e.larghezza / 2;
    const cy = e.altezza / 2;
    const righe = e.righe
      .map(
        (r) =>
          `<text x="${cx.toFixed(2)}" y="${(cy + r.scarto).toFixed(2)}" text-anchor="middle"` +
          ` font-family="Roboto" font-size="${r.corpo.toFixed(2)}"` +
          (r.grassetto ? ' font-weight="bold"' : '') +
          ` fill="${r.colore}" transform="rotate(-90 ${cx.toFixed(2)} ${cy.toFixed(2)})">` +
          `${perXml(r.testo)}</text>`
      )
      .join('');
    return {
      absolutePosition: { x: e.x, y: e.y },
      width: e.larghezza,
      height: e.altezza,
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${e.larghezza.toFixed(2)}"` +
        ` height="${e.altezza.toFixed(2)}">${righe}</svg>`
    } as Content;
  });

  // il testo va centrato nella larghezza del PEZZO, non della pagina: solo una
  // colonna di larghezza fissa dà quel controllo a pdfmake.
  //
  // `noWrap` perché le righe le ha già decise il motore delle etichette, che
  // le colloca una sotto l'altra: se pdfmake ne mandasse una a capo per conto
  // suo, la coda finirebbe sopra la riga successiva — «PANNELL» con la «O»
  // stampata sulla misura. Che ci stiano lo garantisce il motore, che misura
  // il testo carattere per carattere.
  const etichette: Content[] = d.testi.map((t) => ({
    absolutePosition: { x: t.x, y: t.y },
    columns: [
      {
        width: t.larghezza,
        text: t.testo,
        fontSize: t.corpo,
        bold: t.grassetto,
        color: t.colore,
        alignment: 'center',
        noWrap: true
      }
    ]
  }));

  /**
   * «PARTE 1 DI 2»: che il foglio abbia tagliato il pezzo si deve capire.
   *
   * Tutt'e due le parti lo dicono, non solo quella senza nome: chi legge la
   * parte col nome deve sapere che il pezzo non finisce lì, se no lo misura
   * corto. Il nome ci va dentro quando ci sta — così la parte di là non è
   * anonima — e la freccia indica la colonna dove sta il resto.
   *
   * Dove la fetta è troppo sottile per scriverci resta il tratteggio, che da
   * solo dice già che lì il disegno taglia e il materiale no.
   */
  const CORPO_SEGUE = 6;
  const continua: Content[] = [];
  for (const g of d.giunzioni) {
    const larga = Math.abs(g.x2 - g.x1);
    // dentro il pezzo ci dev'essere posto per scriverci: se la fetta è un
    // filo resta il tratteggio, che da solo dice già che lì il foglio taglia
    if (g.spessore < CORPO_SEGUE * 2.1) continue;
    const avanti = g.verso === 'dopo';
    const testo = [
      `${g.nome} · parte ${g.parte} di ${g.parti}`,
      `${g.nome} · ${g.parte} di ${g.parti}`,
      `parte ${g.parte} di ${g.parti}`,
      `${g.parte} di ${g.parti}`
    ]
      .map((t) => (avanti ? `${t} »` : `« ${t}`))
      .find((t) => larghezzaStimata(t) * CORPO_SEGUE <= larga - 4);
    if (!testo) continue;
    continua.push({
      absolutePosition: {
        x: Math.min(g.x1, g.x2),
        // dentro il pezzo, non fuori: sotto la riga se il pezzo scende, sopra
        // se sale
        y: avanti ? g.y1 - 2.5 - CORPO_SEGUE * 1.2 : g.y1 + 2.5
      },
      columns: [
        {
          width: larga,
          text: testo,
          fontSize: CORPO_SEGUE,
          bold: true,
          color: '#1d2229',
          alignment: 'center' as const,
          noWrap: true
        }
      ]
    });
  }

  return [
    {
      pageBreak: 'before',
      pageOrientation: orizzontale ? 'landscape' : 'portrait',
      columns: [
        { text: m.nome, style: 'h2' },
        { text: titolo, style: 'h2', alignment: 'right' }
      ]
    },
    {
      columns: [
        rigaSottotitolo(sottotitolo, (area.larghezza - VUOTO_COLONNA) / 2, 'left'),
        rigaSottotitolo(
          avanzo
            ? `${lastra.piazzamenti.length} pezzi · ${avanzo}`
            : `${lastra.piazzamenti.length} pezzi`,
          (area.larghezza - VUOTO_COLONNA) / 2,
          'right'
        )
      ],
      margin: [0, 2, 0, 0]
    },
    disegno,
    ...etichette,
    ...ruotate,
    ...continua,
    ...targhette(colonne, disegni, largaColonna, area)
  ];
}

/**
 * LE TARGHETTE SOTTO LE COLONNE.
 *
 * Quando il rotolo va a capo, ogni colonna è un tratto diverso dello stesso
 * foglio, e senza dirlo si leggono come fogli distinti: la targhetta scrive
 * da dove a dove va, in metri, così che al banco si sappia dove si è.
 *
 * Con una colonna sola non serve: il tratto è tutto il foglio, e lo dice già
 * il sottotitolo.
 */
function targhette(
  colonne: Colonna[],
  disegni: DisegnoLastra[],
  largaColonna: number,
  area: AreaPagina
): Content[] {
  if (colonne.length < 2) return [];
  const metri = (v: number) => formattaNumero(Math.round(v) / 1000);
  return colonne.map((c, i) => ({
    absolutePosition: {
      x: area.x + i * (largaColonna + VUOTO_COLONNA),
      y: disegni[i].cornice.y + disegni[i].cornice.altezza + 4
    },
    columns: [
      {
        width: largaColonna,
        text: `da ${metri(c.da)} a ${metri(c.a)} m`,
        fontSize: CORPO_TARGHETTA,
        color: '#5a6472',
        alignment: 'center' as const
      }
    ]
  }));
}

/** distinta di taglio di un materiale */
function distinta(m: MaterialeNesting, esito: EsitoNesting): Content {
  const righe: TableCell[][] = [
    [
      { text: '', style: 'th' },
      { text: 'Pezzo', style: 'th' },
      { text: 'Misura (mm)', style: 'th', alignment: 'right' },
      { text: 'Qtà', style: 'th', alignment: 'right' },
      { text: 'Verso', style: 'th' }
    ]
  ];
  // quante copie di ogni pezzo sono rimaste fuori
  const fuori = new Map<string, number>();
  for (const s of esito.scartati) fuori.set(s.id, (fuori.get(s.id) ?? 0) + 1);

  for (const p of m.pezzi) {
    const q = Math.max(0, Math.round(p.quantita) || 0);
    if (q === 0) continue;
    const mancanti = fuori.get(p.id) ?? 0;
    righe.push([
      {
        // pastiglia del colore, per ritrovare il pezzo nel disegno
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 1,
            w: 8,
            h: 8,
            r: 1,
            color: tintaSfondoEsa(p.tinta),
            lineColor: tintaBordoEsa(p.tinta),
            lineWidth: 0.6
          }
        ]
      },
      {
        text: p.nome || '—',
        style: 'td',
        color: mancanti > 0 ? '#b3261e' : undefined
      },
      {
        // LE MISURE DELLA FORMA, non i due campi grezzi.
        //
        // `larghezza × altezza` su un trapezio rettangolo scrive la base per
        // l'altezza SINISTRA, che può benissimo essere la più corta: due
        // finestre sotto falda gemelle e speculari finivano in distinta una
        // come 860 × 1130 e l'altra come 860 × 1610, pur essendo lo stesso
        // pezzo ribaltato e pur avendo lo stesso ingombro. Al banco è una
        // trappola. Qui si scrive quello che scrive il disegno — base, le due
        // altezze — così la distinta e il piano dicono la stessa cosa.
        text: misureForma({
          forma: p.forma,
          larghezza: p.larghezza,
          altezza: p.altezza,
          misura3: p.misura3,
          vertici: p.vertici
        }),
        style: 'td',
        alignment: 'right'
      },
      {
        // «2 / 8» dice a colpo d'occhio quante copie sono rimaste fuori
        text: mancanti > 0 ? `${q - mancanti} / ${q}` : String(q),
        style: 'td',
        alignment: 'right',
        bold: true,
        color: mancanti > 0 ? '#b3261e' : undefined
      },
      {
        text: mancanti > 0 ? 'NON ENTRA' : p.ruotabile ? 'libero' : 'fisso',
        style: 'td',
        color: mancanti > 0 ? '#b3261e' : undefined,
        bold: mancanti > 0
      }
    ]);
  }
  if (esito.scartati.length > 0) {
    righe.push([
      { text: '', style: 'td' },
      {
        text: `${esito.scartati.length} ${
          esito.scartati.length === 1 ? 'pezzo non entra' : 'pezzi non entrano'
        } nel supporto: o sono più grandi del materiale, o il materiale non basta`,
        style: 'td',
        color: '#b3261e',
        colSpan: 4,
        bold: true
      },
      {},
      {},
      {}
    ]);
  }
  return {
    // la colonna del verso deve tenere «NON ENTRA» su una riga sola
    table: { headerRows: 1, widths: [12, '*', 90, 36, 60], body: righe },
    layout: 'lightHorizontalLines',
    margin: [0, 6, 0, 0]
  };
}

/**
 * Il piano di taglio come CONTENUTO pdfmake, senza copertina.
 *
 * Serve a due padroni: il PDF del solo piano di taglio (che ci mette la sua
 * copertina davanti) e il report del sopralluogo, che se lo allega in fondo.
 * Gli stili usati sono quelli di casa — h1, h2, th, td — quindi il blocco si
 * innesta in qualunque documento dell'app senza portarsi dietro nulla.
 */
export function contenutoNesting(
  doc: DocumentoNesting,
  opzioni: OpzioniPdfNesting = OPZIONI_PDF_PREDEFINITE
): Content[] {
  // `tocItem` serve quando queste pagine finiscono in coda a un report: il
  // piano di taglio compare nell'indice come le altre parti del documento
  const distinte: Content[] = [
    { text: 'Piano di taglio', style: 'h1', pageBreak: 'before', tocItem: true } as Content
  ];
  const pagine: Content[] = [];
  // solo le essenze con qualcosa da tagliare: un «Materiale 1» vuoto (un
  // cantiere di sole porte) non deve lasciare intestazioni né tabelle vuote
  const materiali = doc.materiali.filter((m) =>
    m.pezzi.some((p) => Math.round(p.quantita) > 0)
  );
  if (materiali.length === 0 && !doc.porte?.riepilogo) return [];

  for (const m of materiali) {
    const par = parametriDi(m);
    // stessi pezzi e stesso motore dell'anteprima: il PDF non può mostrare
    // una disposizione diversa da quella che si vede a schermo
    const pezzi = pezziDi(m);
    const esito = calcolaNestingAuto(par, pezzi, opzioniRicerca(m));
    const riep = riepilogaNesting(par, pezzi, esito);
    const fogli = fogliDi(m, esito, opzioni);
    const usataTotale = esito.lastre.reduce((s, l) => s + lunghezzaUsata(l, m.margine), 0);

    const dati: string[] = [
      etichettaSupporto(m),
      `lama ${mm(m.lama)} mm · abbondanza ${mm(m.abbondanza)} mm · margine ${mm(m.margine)} mm`,
      m.venatura === 'nessuna' ? 'venatura: nessuna' : `venatura ${m.venatura}`
    ];
    if (m.modo === 'bobina') {
      dati.push(
        `materiale usato ${formattaNumero(Math.round(usataTotale) / 1000)} m su ${formattaNumero(
          m.bobina.metri
        )} m`
      );
      if (opzioni.segmenta && fogli.length > 0) {
        const lunghezze = fogli
          .map((f) => `${formattaNumero(Math.round(f.daTagliare ?? 0) / 1000)} m`)
          .join(' + ');
        dati.push(
          `${fogli.length} ${fogli.length === 1 ? 'segmento' : 'segmenti'} da staccare: ${lunghezze}`
        );
        const forzati = fogli.filter((f) => f.oltreMassimo).length;
        if (forzati > 0) {
          dati.push(
            `${forzati} ${
              forzati === 1 ? 'segmento supera' : 'segmenti superano'
            } i ${formattaNumero(opzioni.massimoSegmento / 1000)} m: i pezzi impaginati non lasciano un taglio libero prima`
          );
        }
      }
    } else {
      dati.push(
        `${riep.lastreUsate} lastre · resa ${formattaNumero(Math.round(riep.resa * 10) / 10)}%`
      );
    }
    dati.push(
      esito.scartati.length > 0
        ? `${riep.pezziPiazzati} pezzi piazzati su ${riep.pezziRichiesti}`
        : `${riep.pezziPiazzati} pezzi piazzati`
    );

    distinte.push({ text: m.nome, style: 'h2' });
    distinte.push({ text: dati.join('\n'), style: 'dati' });
    distinte.push(distinta(m, esito));
    // i pezzi dei kit delle porte si chiamano con le sigle: qui la loro legenda
    if (essenzeKit(doc.porte).includes(m.id)) distinte.push(legendaSigle());

    for (const foglio of fogli) pagine.push(...paginaFoglio(m, foglio));
  }

  // le porte a strisce non passano dal nesting: il loro piano delle bobine
  // (fatto nel piano di taglio) va in coda alle distinte
  if (doc.porte?.riepilogo) distinte.push(...contenutoBobinePorte(doc.porte.riepilogo));

  return [...distinte, ...pagine];
}

export async function generaPdfNesting(
  doc: DocumentoNesting,
  opzioni: OpzioniPdfNesting = OPZIONI_PDF_PREDEFINITE
): Promise<Blob> {
  const imp = await leggiImpostazioni();
  const prof = imp.professionista;
  const BLU = imp.pdf.colore || COLORI_PDF.blu;
  const righeProf = [prof.nome, prof.azienda, prof.indirizzo, prof.telefono, prof.email].filter(
    Boolean
  );

  // copertina come quella dei report: stesso impianto, stesso ritmo
  const copertina: Content[] = [
    { text: 'PIANO DI TAGLIO', style: 'copertinaTipo', margin: [0, 120, 0, 8] },
    { text: doc.nome || 'Piano di taglio', style: 'copertinaTitolo' },
    {
      text: `Data: ${formattaData(Date.now())}`,
      style: 'copertinaDati',
      margin: [0, 18, 0, 0]
    },
    righeProf.length > 0
      ? {
          text: righeProf.join('\n'),
          style: 'copertinaProf',
          absolutePosition: { x: 40, y: 700 }
        }
      : { text: '' }
  ];

  const pieDiPagina = imp.pdf.pieDiPagina.trim() || prof.azienda || prof.nome || '';

  const def: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: MARGINI,
    info: {
      title: `Piano di taglio — ${doc.nome || 'senza nome'}`,
      author: prof.nome || 'Sopralluoghi'
    },
    content: [...copertina, ...contenutoNesting(doc, opzioni)],
    defaultStyle: { fontSize: 11, color: '#20252b' },
    styles: {
      copertinaTipo: {
        fontSize: 13,
        color: COLORI_PDF.grigio,
        alignment: 'center',
        characterSpacing: 2
      },
      copertinaTitolo: { fontSize: 30, bold: true, alignment: 'center', color: BLU },
      copertinaDati: { fontSize: 14, alignment: 'center', color: '#222222' },
      copertinaProf: { fontSize: 10, color: COLORI_PDF.grigio },
      h1: { fontSize: 20, bold: true, color: BLU, margin: [0, 0, 0, 12] },
      h2: { fontSize: 15, bold: true, color: BLU, margin: [0, 10, 0, 4] },
      h3: { fontSize: 12.5, bold: true, color: '#33424f', margin: [0, 0, 0, 4] },
      sottotitolo: { fontSize: 10, color: COLORI_PDF.grigio },
      dati: { fontSize: 10, color: COLORI_PDF.grigio, lineHeight: 1.3 },
      th: { fontSize: 9, bold: true, color: '#ffffff', fillColor: BLU },
      td: { fontSize: 10 },
      pie: { fontSize: 9, color: COLORI_PDF.grigio }
    },
    footer: (pagina, totale) => ({
      columns: [
        { text: pieDiPagina, style: 'pie' },
        { text: `Pagina ${pagina} di ${totale}`, style: 'pie', alignment: 'right' }
      ],
      margin: [40, 16, 40, 0]
    })
  };

  return new Promise<Blob>((resolve) => {
    pdfMake.createPdf(def).getBlob((blob) => resolve(blob));
  });
}
