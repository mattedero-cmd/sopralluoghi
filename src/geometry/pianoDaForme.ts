/**
 * IL PIANO PROSPETTICO RICAVATO DALLE FORME GIÀ QUOTATE.
 *
 * Ogni quadrilatero quotato sulla foto È un riferimento: quattro angoli
 * puntati a mano e le misure vere prese sul posto. Finora ne serviva uno solo,
 * scelto apposta, e la precisione del piano era quella di quell'unico
 * riquadro: piccolo o storto, sbagliava dappertutto.
 *
 * Qui si usano TUTTE le forme quotate insieme. Una forma di misure note,
 * appoggiata sul piano, non dice dove sta né come è girata — quello si scopre
 * strada facendo — ma dice esattamente quanto è grande, e questo basta a
 * legare fra loro punti lontani dell'immagine. Il conto è un'alternanza:
 *
 *   1. con l'omografia corrente si guarda dove cade ogni forma sul piano;
 *   2. sopra quei punti si appoggia la sagoma vera, senza stirarla — solo
 *      ruotata e spostata (Procuste rigido): è la posa della forma sul muro;
 *   3. si rifà l'omografia ai minimi quadrati su TUTTI gli angoli insieme;
 *   4. si ricomincia, finché smette di migliorare.
 *
 * La prima forma resta ferma dov'è: fissa l'origine e il verso del piano, che
 * altrimenti scivolerebbero a ogni giro senza cambiare una sola misura.
 *
 * Non si inventa niente: le misure sono quelle scritte a mano nel sopralluogo
 * — i valori calcolati dalla calibrazione sono esclusi, o il piano si darebbe
 * ragione da solo.
 */

import type { Annotazione, Foto, PianoProspettiva, Punto, Unita } from '../db/types';
import { segmentiPoligono } from '../db/types';
import { formaQuadrilatera } from './formaQuadrilatera';
import { famigliaDi } from './nomenclatura';
import { pianoDi } from './calibrazione';
import {
  applicaOmografia,
  calcolaOmografia,
  invertiOmografia,
  omografiaAiMinimiQuadrati,
  omografiaPiano,
  type Omografia
} from './omografia';
import { inMillimetri } from '../utils/format';

/** una forma quotata usata come riferimento del piano */
export interface RiferimentoPiano {
  id: string;
  /** i quattro angoli sulla foto (alto-sx, alto-dx, basso-dx, basso-sx) */
  immagine: Punto[];
  /** la sagoma vera in millimetri, negli stessi quattro angoli */
  reale: Punto[];
  /** perimetro sulla foto in pixel: un riferimento grande è puntato meglio */
  peso: number;
}

/** quanto sbaglia un piano su una forma: differenza sui suoi lati, in mm */
export interface ScartoRiferimento {
  id: string;
  /** media degli scarti sui quattro lati (mm) */
  medio: number;
  /** il lato peggiore (mm) */
  massimo: number;
}

export interface EsitoPiano {
  /** foto → piano, in millimetri */
  H: Omografia;
  riferimenti: RiferimentoPiano[];
  /** scarto medio su tutte le forme (mm) */
  erroreMedio: number;
  /** la forma che il piano sbaglia di più */
  peggiore: ScartoRiferimento | null;
}

/**
 * LE FORME UTILIZZABILI COME RIFERIMENTO.
 *
 * Serve un quadrilatero con le misure scritte a mano: il rettangolo quotato,
 * la finestra sotto falda, l'elemento fuori squadro. Restano fuori le forme
 * senza misure, le copie solo-etichetta e — soprattutto — tutto ciò che la
 * calibrazione ha già calcolato da sé.
 *
 * E UNA SOLA FORMA PER FAMIGLIA. Un elemento ripetuto — cinque volte lo stesso
 * serramento — porta cinque volte la stessa misura: contarla cinque volte
 * darebbe a quel serramento un peso che non ha, e la prospettiva finirebbe per
 * assecondare lui invece di tutta la parete. Della famiglia entra il suo
 * ORIGINALE, che è la misura presa sul posto; le copie richiamate portano solo
 * il codice, e già non entravano.
 */
export function riferimentiPiano(annotazioni: Annotazione[]): RiferimentoPiano[] {
  const rif: Array<RiferimentoPiano & { famiglia: string; originale: boolean }> = [];
  for (const a of annotazioni) {
    if (a.tipo !== 'quotaPoligono' && a.tipo !== 'quotaRett') continue;
    if (misureCalcolate(a)) continue;
    const forma = formaQuadrilatera(a);
    if (!forma) continue;
    const u = forma.unita;
    const reale = forma.verticiNetti.map((p) => ({
      x: inMillimetri(p.x, u),
      y: inMillimetri(p.y, u)
    }));
    // una forma sbilenca o sfilata non è un riferimento: darebbe un piano peggio
    const lati = forma.quad.map((p, i) => {
      const q = forma.quad[(i + 1) % 4];
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    const peso = lati.reduce((s, v) => s + v, 0);
    if (!(peso > 0) || lati.some((v) => v < 8)) continue;
    if (reale.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    const famiglia = famigliaDi(a);
    rif.push({
      id: a.id,
      immagine: forma.quad.map((p) => ({ ...p })),
      reale,
      peso,
      famiglia,
      // la chiave della famiglia è l'id dell'originale: chi ce l'ha uguale al
      // proprio è la misura vera, gli altri sono repliche della stessa
      originale: famiglia === a.id
    });
  }

  // una per famiglia: l'originale se c'è, altrimenti la più grande — quando
  // l'originale sta in un'altra foto, di qua comanda quella che si vede meglio
  const scelta = new Map<string, (typeof rif)[number]>();
  for (const r of rif) {
    const gia = scelta.get(r.famiglia);
    if (!gia || (r.originale && !gia.originale) || (r.originale === gia.originale && r.peso > gia.peso)) {
      scelta.set(r.famiglia, r);
    }
  }
  return rif
    .filter((r) => scelta.get(r.famiglia) === r)
    .map(({ id, immagine, reale, peso }) => ({ id, immagine, reale, peso }));
}

/**
 * true se le misure della forma le ha scritte la calibrazione, non l'uomo.
 *
 * Una forma quotata dal piano non può poi correggere il piano: si darebbe
 * ragione da sola. Nel regime misto delle piante — quote a mano e quote
 * calcolate insieme — vale solo se OGNI lato quotato è stato messo a mano e
 * non è una quota «di riferimento», che segue la geometria.
 */
function misureCalcolate(a: Annotazione): boolean {
  if (a.tipo === 'quotaRett') return a.valoreAuto === true;
  if (a.tipo !== 'quotaPoligono') return false;
  if (a.soloEtichetta) return true;
  if (a.valoreAuto !== true) return false;
  return segmentiPoligono(a).some((s) => s.valore !== null && !(s.manuale && !s.riferimento));
}

/**
 * LO SCARTO DI UN PIANO su una forma: quanto sbaglia sui suoi lati.
 *
 * È la verifica che si può mostrare in chiaro — «questo lato lo hai misurato
 * 1000 e il piano ne legge 1004» — e non dipende da dove il piano ha messo
 * l'origine: guarda solo le lunghezze, che sono quelle che si tagliano.
 */
export function scartoDelPiano(H: Omografia, r: RiferimentoPiano): ScartoRiferimento {
  let somma = 0;
  let massimo = 0;
  for (let i = 0; i < 4; i++) {
    const a = applicaOmografia(H, r.immagine[i]);
    const b = applicaOmografia(H, r.immagine[(i + 1) % 4]);
    const letto = Math.hypot(b.x - a.x, b.y - a.y);
    const vero = Math.hypot(
      r.reale[(i + 1) % 4].x - r.reale[i].x,
      r.reale[(i + 1) % 4].y - r.reale[i].y
    );
    const scarto = Math.abs(letto - vero);
    somma += scarto;
    massimo = Math.max(massimo, scarto);
  }
  return { id: r.id, medio: somma / 4, massimo };
}

/** lo scarto medio di un piano su tutte le forme, e la peggiore */
export function verificaPiano(
  H: Omografia,
  rif: RiferimentoPiano[]
): { medio: number; peggiore: ScartoRiferimento | null } {
  if (rif.length === 0) return { medio: 0, peggiore: null };
  const scarti = rif.map((r) => scartoDelPiano(H, r));
  const medio = scarti.reduce((s, v) => s + v.medio, 0) / scarti.length;
  const peggiore = scarti.reduce((a, b) => (b.medio > a.medio ? b : a));
  return { medio, peggiore };
}

/**
 * LO SCARTO DELLA CALIBRAZIONE CHE C'È ADESSO, per confronto.
 *
 * Ogni forma si misura col piano che la riguarda davvero — quello con
 * l'ancora più vicina — altrimenti su una foto già calibrata a due pareti il
 * confronto direbbe sempre che il piano di adesso è pessimo, solo perché si
 * starebbe misurando il fianco col piano del fronte.
 */
export function scartoCalibrazione(
  foto: Pick<Foto, 'piano' | 'piani' | 'scala'>,
  rif: RiferimentoPiano[]
): number | null {
  if (rif.length === 0) return null;
  const scarti: number[] = [];
  for (const r of rif) {
    const piano = pianoDi(foto, r.immagine);
    if (!piano) continue;
    try {
      const inMm = {
        ...piano,
        larghezzaReale: inMillimetri(piano.larghezzaReale, piano.unita),
        altezzaReale: inMillimetri(piano.altezzaReale, piano.unita),
        unita: 'mm' as Unita
      };
      scarti.push(scartoDelPiano(omografiaPiano(inMm), r).medio);
    } catch {
      // piano degenere: quella forma non entra nel confronto
    }
  }
  if (scarti.length === 0) return null;
  return scarti.reduce((s, v) => s + v, 0) / scarti.length;
}

/** la posa di una sagoma sul piano: ruotata e spostata, mai stirata */
function posaRigida(sagoma: Punto[], osservati: Punto[]): Punto[] {
  const n = sagoma.length;
  const media = (p: Punto[]) => ({
    x: p.reduce((s, q) => s + q.x, 0) / n,
    y: p.reduce((s, q) => s + q.y, 0) / n
  });
  const cs = media(sagoma);
  const co = media(osservati);
  let sin = 0;
  let cos = 0;
  for (let i = 0; i < n; i++) {
    const a = { x: sagoma[i].x - cs.x, y: sagoma[i].y - cs.y };
    const b = { x: osservati[i].x - co.x, y: osservati[i].y - co.y };
    sin += a.x * b.y - a.y * b.x;
    cos += a.x * b.x + a.y * b.y;
  }
  const ang = Math.atan2(sin, cos);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return sagoma.map((p) => {
    const x = p.x - cs.x;
    const y = p.y - cs.y;
    return { x: co.x + x * c - y * s, y: co.y + x * s + y * c };
  });
}

/**
 * IL PIANO CHE METTE D'ACCORDO TUTTE LE FORME.
 *
 * Con una forma sola il risultato è esatto e non c'è niente da mediare: è la
 * calibrazione di sempre, presa dalla forma invece che da un riquadro
 * disegnato apposta. Con due o più comincia il lavoro vero.
 */
export function adattaPiano(riferimenti: RiferimentoPiano[]): EsitoPiano | null {
  const rif = [...riferimenti].sort((a, b) => b.peso - a.peso);
  if (rif.length === 0) return null;

  let H: Omografia;
  try {
    H = calcolaOmografia(rif[0].immagine, rif[0].reale);
  } catch {
    return null;
  }
  if (rif.length === 1) {
    const v = verificaPiano(H, rif);
    return { H, riferimenti: rif, erroreMedio: v.medio, peggiore: v.peggiore };
  }

  // la prima forma resta ferma: è lei a fissare origine e verso del piano
  let pose: Punto[][] = rif.map((r) => r.reale);
  let migliore = { H, errore: verificaPiano(H, rif).medio };
  for (let giro = 0; giro < 24; giro++) {
    pose = rif.map((r, i) => {
      if (i === 0) return r.reale;
      const osservati = r.immagine.map((p) => applicaOmografia(H, p));
      return posaRigida(r.reale, osservati);
    });
    const immagine: Punto[] = [];
    const piano: Punto[] = [];
    const pesi: number[] = [];
    rif.forEach((r, i) => {
      for (let k = 0; k < 4; k++) {
        immagine.push(r.immagine[k]);
        piano.push(pose[i][k]);
        pesi.push(r.peso);
      }
    });
    const nuova = omografiaAiMinimiQuadrati(immagine, piano, pesi);
    if (!nuova) break;
    H = nuova;
    const errore = verificaPiano(H, rif).medio;
    // si tiene il migliore: l'alternanza scende quasi sempre, ma se un giro
    // peggiora non si porta a casa un piano peggiore di quello che si aveva
    if (errore < migliore.errore - 1e-9) {
      migliore = { H, errore };
    } else {
      break;
    }
  }

  const v = verificaPiano(migliore.H, rif);
  return { H: migliore.H, riferimenti: rif, erroreMedio: v.medio, peggiore: v.peggiore };
}

/**
 * QUANTO PUÒ SBAGLIARE UNA FORMA e restare sullo stesso piano.
 *
 * Gli angoli si puntano col dito su uno schermo: un paio di pixel di scarto
 * su una finestra piccola valgono già un centimetro. La soglia è quindi
 * proporzionale alla forma — il 2% del suo lato medio — con un minimo di un
 * centimetro per le forme piccole. Sopra, la forma sta su un'altra parete:
 * lo scarto di una parete diversa non è di millimetri, è di decine.
 */
function tolleranza(r: RiferimentoPiano): number {
  let lato = 0;
  for (let i = 0; i < 4; i++) {
    lato +=
      Math.hypot(
        r.reale[(i + 1) % 4].x - r.reale[i].x,
        r.reale[(i + 1) % 4].y - r.reale[i].y
      ) / 4;
  }
  return Math.max(10, lato * 0.02);
}

/**
 * LE FORME RAGGRUPPATE PER PARETE.
 *
 * Una foto di tre quarti inquadra due pareti insieme: il fianco del box con
 * le sue finestre e il fronte con le sue. Sono DUE piani, e una sola
 * omografia non può descriverli entrambi — se le si mette tutte nello stesso
 * conto esce un piano che non è giusto da nessuna delle due parti.
 *
 * Qui si scopre da sé quali forme stanno insieme: si parte dalla più grande,
 * si prova ad aggiungere quella che regge meglio, e la si tiene solo se resta
 * dentro la sua tolleranza. Quando nessuna regge più, il gruppo è chiuso e si
 * ricomincia con quelle rimaste. Le forme che non si accompagnano a nessuna
 * restano da sole: un piano da una forma sola è comunque esatto su di lei.
 */
export function gruppiDiPiano(riferimenti: RiferimentoPiano[]): RiferimentoPiano[][] {
  let restanti = [...riferimenti].sort((a, b) => b.peso - a.peso);
  const gruppi: RiferimentoPiano[][] = [];
  while (restanti.length > 0) {
    let gruppo = [restanti[0]];
    let fuori = restanti.slice(1);
    for (;;) {
      let scelta: { r: RiferimentoPiano; scarto: number } | null = null;
      for (const r of fuori) {
        const esito = adattaPiano([...gruppo, r]);
        if (!esito) continue;
        const scarto = scartoDelPiano(esito.H, r).medio;
        // e non deve rovinare quelle che c'erano già
        const rovina = gruppo.some((g) => scartoDelPiano(esito.H, g).medio > tolleranza(g));
        if (rovina || scarto > tolleranza(r)) continue;
        if (!scelta || scarto < scelta.scarto) scelta = { r, scarto };
      }
      if (!scelta) break;
      gruppo = [...gruppo, scelta.r];
      fuori = fuori.filter((r) => r !== scelta!.r);
    }
    gruppi.push(gruppo);
    restanti = fuori;
  }
  return gruppi;
}

/** un piano pronto da salvare, con le forme che lo hanno prodotto */
export interface PianoRicavato {
  esito: EsitoPiano;
  piano: PianoProspettiva;
}

/**
 * I PIANI DI UNA FOTO, uno per parete, già scritti come piani salvabili.
 *
 * Le ancore di ciascuno sono i baricentri delle sue forme: è così che poi
 * ogni misura ritrova la parete giusta.
 */
export function pianiDalleForme(riferimenti: RiferimentoPiano[]): PianoRicavato[] {
  const fuori: PianoRicavato[] = [];
  for (const gruppo of gruppiDiPiano(riferimenti)) {
    const esito = adattaPiano(gruppo);
    if (!esito) continue;
    const piano = pianoDaOmografia(esito.H, esito.riferimenti);
    if (!piano) continue;
    piano.ancore = gruppo.map((r) => ({
      x: r.immagine.reduce((s, p) => s + p.x, 0) / 4,
      y: r.immagine.reduce((s, p) => s + p.y, 0) / 4
    }));
    // le forme da cui è nato: finché ci sono, il piano le segue
    piano.origini = gruppo.map((r) => r.id);
    fuori.push({ esito, piano });
  }
  return fuori;
}

/**
 * L'OMOGRAFIA SCRITTA COME PIANO su un'estensione DATA.
 *
 * Serve quando un piano si rifà: la prospettiva è nuova, ma il riquadro verde
 * deve restare quello che l'utente ha in mano — magari allargato apposta per
 * vedere la griglia fin dove serviva. Si prendono i suoi quattro angoli sulla
 * foto, si guarda dove cadono nella prospettiva nuova, e da lì si riscrive il
 * riquadro.
 */
export function pianoSuEstensione(
  H: Omografia,
  angoliImmagine: Punto[],
  celle = 4
): PianoProspettiva | null {
  const Hinv = invertiOmografia(H);
  if (!Hinv || angoliImmagine.length === 0) return null;
  const punti = angoliImmagine.map((p) => applicaOmografia(H, p));
  const minX = Math.min(...punti.map((p) => p.x));
  const maxX = Math.max(...punti.map((p) => p.x));
  const minY = Math.min(...punti.map((p) => p.y));
  const maxY = Math.max(...punti.map((p) => p.y));
  const L = Math.max(1, maxX - minX);
  const A = Math.max(1, maxY - minY);
  const angoli = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ].map((q) => {
    const w = Hinv[6] * q.x + Hinv[7] * q.y + Hinv[8];
    if (!(Math.abs(w) > 1e-9)) return null;
    return {
      x: (Hinv[0] * q.x + Hinv[1] * q.y + Hinv[2]) / w,
      y: (Hinv[3] * q.x + Hinv[4] * q.y + Hinv[5]) / w
    };
  });
  if (angoli.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  if (!stanoInPiedi(angoli as Punto[], angoliImmagine)) return null;
  return {
    punti: angoli as [Punto, Punto, Punto, Punto],
    larghezzaReale: L,
    altezzaReale: A,
    unita: 'mm' as Unita,
    celle
  };
}

/**
 * I PIANI RIFATTI DOPO UNA MODIFICA ALLE FORME.
 *
 * Una volta acceso, il piano segue le forme da cui è nato: si corregge una
 * quota, si sposta l'angolo di una finestra, e la prospettiva si aggiorna di
 * conseguenza — senza chiedere niente, perché è quello che deve fare.
 *
 * Con due riguardi, però:
 * - il RIQUADRO resta quello che è, anche se allargato a mano: cambia la
 *   prospettiva, non fin dove arriva la griglia;
 * - un piano AGGIUSTATO A MANO non si tocca. Chi ha spostato un vertice
 *   guardando la foto ne sa più del conto, e cancellargli la correzione al
 *   primo ritocco di una quota sarebbe un dispetto. Per rifarlo dalle forme
 *   basta ridare «Piano dalle forme».
 * - così pure un piano calibrato a mano, che di forme non ne ha.
 *
 * Torna `null` quando non c'è niente da cambiare: è il caso normale, e non
 * deve costare niente.
 */
export function pianiAggiornati(
  attuali: PianoProspettiva[],
  annotazioni: Annotazione[]
): PianoProspettiva[] | null {
  const daForme = attuali.filter((p) => p.origini?.length && !p.aMano);
  if (daForme.length === 0) return null;

  const rifatti = pianiDalleForme(riferimentiPiano(annotazioni));
  let cambiato = false;
  const fuori: PianoProspettiva[] = [];
  const usati = new Set<number>();

  for (const piano of attuali) {
    if (!piano.origini?.length || piano.aMano) {
      fuori.push(piano); // a mano, o calibrato a mano: non si tocca
      // le sue forme restano sue: il gruppo che le raccoglie non deve poi
      // rientrare dalla finestra come parete «nuova»
      if (piano.origini?.length) {
        const mie = new Set(piano.origini);
        rifatti.forEach((r, i) => {
          if (r.esito.riferimenti.some((x) => mie.has(x.id))) usati.add(i);
        });
      }
      continue;
    }
    // il gruppo che raccoglie le stesse forme: si riconosce dai codici
    const origini = new Set(piano.origini);
    let scelto = -1;
    let quante = 0;
    rifatti.forEach((r, i) => {
      if (usati.has(i)) return;
      const comuni = r.esito.riferimenti.filter((x) => origini.has(x.id)).length;
      if (comuni > quante) {
        quante = comuni;
        scelto = i;
      }
    });
    if (scelto < 0) {
      // le sue forme sono sparite tutte: il piano non ha più fondamento
      cambiato = true;
      continue;
    }
    usati.add(scelto);
    const nuovo = pianoSuEstensione(rifatti[scelto].esito.H, piano.punti, piano.celle ?? 4);
    if (!nuovo) {
      fuori.push(piano);
      continue;
    }
    fuori.push({
      ...nuovo,
      nome: rifatti[scelto].piano.nome ?? piano.nome,
      ancore: rifatti[scelto].piano.ancore,
      origini: rifatti[scelto].piano.origini
    });
    if (!ugualeAbbastanza(piano, fuori[fuori.length - 1])) cambiato = true;
  }

  // una parete NUOVA — hai quotato due finestre su un muro che prima non
  // c'era — entra da sé: è la stessa regola, applicata a un gruppo in più
  rifatti.forEach((r, i) => {
    if (usati.has(i)) return;
    if (r.esito.riferimenti.length < 2) return; // una forma sola non fa parete
    fuori.push(r.piano);
    cambiato = true;
  });

  return cambiato && fuori.length > 0 ? fuori : null;
}

/** due piani sono lo stesso, a meno di un decimo di pixel? */
function ugualeAbbastanza(a: PianoProspettiva, b: PianoProspettiva): boolean {
  if (Math.abs(a.larghezzaReale - b.larghezzaReale) > 0.1) return false;
  if (Math.abs(a.altezzaReale - b.altezzaReale) > 0.1) return false;
  return a.punti.every(
    (p, i) => Math.abs(p.x - b.punti[i].x) < 0.1 && Math.abs(p.y - b.punti[i].y) < 0.1
  );
}

/**
 * L'OMOGRAFIA SCRITTA COME PIANO DI RIFERIMENTO.
 *
 * Il piano salvato sulla foto è sempre quattro angoli più due misure reali:
 * qualunque omografia si può dire così. Si prende un rettangolo sul piano che
 * copre le forme quotate (con un po' di margine attorno, per avere la griglia
 * di verifica anche fuori) e lo si riporta sull'immagine.
 *
 * Se il rettangolo, riportato indietro, cade oltre l'orizzonte — succede sulle
 * foto molto inclinate — si stringe finché torna un quadrilatero sano.
 */
/**
 * IL RIQUADRO NON PUÒ SCAPPARE DALLA FOTO.
 *
 * Una parete ripresa di scorcio ha l'orizzonte a due passi dalle sue forme:
 * allargare il riquadro di un quarto sulle coordinate del muro può portarne
 * gli angoli a migliaia di pixel, fuori dall'inquadratura, e sullo schermo si
 * vedono righe verdi che scappano da tutte le parti. Il riquadro resta quindi
 * nei paraggi delle forme da cui nasce: al massimo una volta e mezza il loro
 * ingombro per lato.
 */
function stanoInPiedi(angoli: Punto[], attorno: Punto[]): boolean {
  if (attorno.length === 0) return true;
  const xs = attorno.map((p) => p.x);
  const ys = attorno.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const larghi = Math.max(1, maxX - minX) * 1.5;
  const alti = Math.max(1, maxY - minY) * 1.5;
  return angoli.every(
    (p) =>
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x > minX - larghi &&
      p.x < maxX + larghi &&
      p.y > minY - alti &&
      p.y < maxY + alti
  );
}

export function pianoDaOmografia(
  H: Omografia,
  riferimenti: RiferimentoPiano[],
  celle = 4
): PianoProspettiva | null {
  const Hinv = invertiOmografia(H);
  if (!Hinv) return null;
  const punti = riferimenti.flatMap((r) => r.immagine.map((p) => applicaOmografia(H, p)));
  if (punti.length === 0) return null;
  const minX = Math.min(...punti.map((p) => p.x));
  const maxX = Math.max(...punti.map((p) => p.x));
  const minY = Math.min(...punti.map((p) => p.y));
  const maxY = Math.max(...punti.map((p) => p.y));
  const L0 = Math.max(1, maxX - minX);
  const A0 = Math.max(1, maxY - minY);

  for (const margine of [0.25, 0.1, 0]) {
    const L = L0 * (1 + 2 * margine);
    const A = A0 * (1 + 2 * margine);
    const x0 = minX - L0 * margine;
    const y0 = minY - A0 * margine;
    const angoli = [
      { x: x0, y: y0 },
      { x: x0 + L, y: y0 },
      { x: x0 + L, y: y0 + A },
      { x: x0, y: y0 + A }
    ].map((q) => {
      const w = Hinv[6] * q.x + Hinv[7] * q.y + Hinv[8];
      if (!(Math.abs(w) > 1e-9)) return null;
      return {
        x: (Hinv[0] * q.x + Hinv[1] * q.y + Hinv[2]) / w,
        y: (Hinv[3] * q.x + Hinv[4] * q.y + Hinv[5]) / w
      };
    });
    if (angoli.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    // e non deve scappare lontano dalle forme: su una parete di scorcio un
    // margine generoso porterebbe gli angoli fuori dal mondo
    if (!stanoInPiedi(angoli as Punto[], riferimenti.flatMap((r) => r.immagine))) continue;
    const piano: PianoProspettiva = {
      punti: angoli as [Punto, Punto, Punto, Punto],
      larghezzaReale: L,
      altezzaReale: A,
      unita: 'mm' as Unita,
      celle
    };
    // prova del nove: il piano scritto così deve rileggere le stesse misure
    try {
      const riletta = omografiaPiano(piano);
      const uguali = riferimenti.every((r) => {
        const a = scartoDelPiano(H, r);
        const b = scartoDelPiano(riletta, r);
        return Math.abs(a.medio - b.medio) < 0.5 && Math.abs(a.massimo - b.massimo) < 0.5;
      });
      if (uguali) return piano;
    } catch {
      // quattro angoli degeneri: si prova con un rettangolo più stretto
    }
  }
  return null;
}
