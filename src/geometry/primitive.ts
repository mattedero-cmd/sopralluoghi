import type {
  Annotazione,
  Callout,
  DisegnoLibero,
  Etichetta,
  Forma,
  ForoTecnico,
  Legenda,
  Freccia,
  Punto,
  Quota,
  QuotaAngolare,
  QuotaPoligono,
  QuotaRaggio,
  QuotaRettangolo,
  QuotaTecnica,
  Rettangolo,
  TestoFoto,
  Unita
} from '../db/types';
import {
  COLORE_QUOTA,
  COLORE_QUOTA_TECNICA,
  quadrilateroQuotaRett,
  segmentiPoligono,
  segmentoELato
} from '../db/types';
import { misureElemento, nomePoligono } from './calibrazione';
import { calcolaCatene, sommaCatenaInUnita } from './catene';
import { formattaMisura, formattaNumero } from '../utils/format';
import {
  direzioneQuota,
  distanza,
  dot,
  normale,
  normalizza,
  scala,
  somma,
  sottrai
} from './punti';

/**
 * Alone scuro semitrasparente: dà a linee, frecce e testi delle quote un
 * leggero contorno che li rende leggibili su qualunque sfondo (chiaro o
 * scuro), come nei rilievi tecnici. Usato in modo uniforme da tutte le quote.
 */
const ALONE = 'rgba(0,0,0,0.55)';

/**
 * Primitive di disegno: l'unica fonte di verità per l'aspetto delle
 * annotazioni. Sia l'editor interattivo (Konva) sia il renderer di
 * export (Canvas2D, usato anche dal PDF) disegnano queste primitive,
 * così la foto esportata è identica a ciò che si vede a schermo.
 * Tutte le coordinate sono in pixel dell'immagine originale.
 */
export type Primitiva =
  | { kind: 'linea'; punti: number[]; colore: string; spessore: number; tratteggio?: number[]; alone?: string }
  | { kind: 'poligono'; punti: number[]; colore: string; alone?: string }
  | { kind: 'polilinea'; punti: number[]; colore: string; spessore: number; alone?: string; tratteggio?: number[] }
  | {
      kind: 'testo';
      testo: string;
      /** punto di ancoraggio (centro del testo, o sinistra se allineamento='left') */
      posizione: Punto;
      rotazioneDeg: number;
      dimensione: number;
      colore: string;
      sfondo: string | null;
      /** alone/contorno scuro per la leggibilità senza riquadro (stile quote) */
      alone?: string;
      /** allineamento orizzontale del testo rispetto alla posizione (default centro) */
      allineamento?: 'left' | 'center';
    }
  | {
      kind: 'rettangolo';
      rect: Rettangolo;
      colore: string;
      spessore: number;
      riempimento?: string;
      /** raggio degli angoli (riquadro arrotondato) */
      raggio?: number;
    }
  | {
      kind: 'cerchio';
      centro: Punto;
      raggio: number;
      colore: string;
      spessore: number;
      tratteggio?: number[];
      alone?: string;
      /** riempimento pieno (es. badge etichetta) */
      riempimento?: string;
    }
  | {
      kind: 'arco';
      centro: Punto;
      raggio: number;
      /** angoli in radianti */
      inizio: number;
      fine: number;
      antiorario: boolean;
      colore: string;
      spessore: number;
      alone?: string;
    }
  | {
      kind: 'ritaglio';
      /** regione dell'immagine originale da disegnare */
      sorgente: Rettangolo;
      /** dove disegnarla (riquadro dell'inserto) */
      destinazione: Rettangolo;
    }
  | {
      kind: 'immagine';
      /** immagine già caricata (foto-dettaglio del callout) */
      img: CanvasImageSource;
      destinazione: Rettangolo;
    };

// ---------------------------------------------------------------------------
// Quota lineare (orizzontale / verticale / allineata)
// ---------------------------------------------------------------------------

export interface GeometriaQuota {
  /** estremi della linea di quota */
  q1: Punto;
  q2: Punto;
  /** direzione di misura (versore) e normale */
  d: Punto;
  n: Punto;
  /** punto medio della linea di quota */
  centro: Punto;
  /** lunghezza misurata in px immagine */
  lunghezzaPx: number;
}

/**
 * Calcola la geometria della linea di quota: gli estremi sono le proiezioni
 * dei punti misurati sulla retta parallela alla direzione di misura,
 * spostata di `offset` lungo la normale.
 */
export function geometriaQuota(q: Pick<Quota, 'sottotipo' | 'p1' | 'p2' | 'offset'>): GeometriaQuota {
  const d = direzioneQuota(q.sottotipo, q.p1, q.p2);
  const n = normale(d);
  const base = somma(q.p1, scala(n, q.offset));
  const t = dot(sottrai(q.p2, q.p1), d);
  const q1 = base;
  const q2 = somma(base, scala(d, t));
  return {
    q1,
    q2,
    d,
    n,
    centro: scala(somma(q1, q2), 0.5),
    lunghezzaPx: Math.abs(t)
  };
}

function freccette(punta: Punto, direzione: Punto, dim: number, colore: string): Primitiva {
  // punta di freccia piena, orientata lungo `direzione` (versore verso l'esterno)
  const n = normale(direzione);
  const base = sottrai(punta, scala(direzione, dim));
  const a = somma(base, scala(n, dim * 0.35));
  const b = sottrai(base, scala(n, dim * 0.35));
  return { kind: 'poligono', punti: [punta.x, punta.y, a.x, a.y, b.x, b.y], colore, alone: ALONE };
}

export function coloreQuota(q: Pick<Quota, 'stato' | 'stile'>): string {
  // Colore UNICO per tutte le quote (manuali o automatiche): l'aspetto non
  // dipende dal modo di creazione né dallo stato reale/stimata. La
  // distinzione reale/stimata resta nel testo (prefisso ≈), non nel colore.
  return q.stile.colore || COLORE_QUOTA;
}

export function etichettaQuota(q: Pick<Quota, 'valore' | 'unita' | 'stato' | 'nota'>): string {
  const misura = q.valore === null ? '?' : formattaMisura(q.valore, q.unita);
  const base = q.stato === 'stimata' ? `≈ ${misura}` : misura;
  // il testo aggiuntivo va su una seconda riga sotto la misura
  return q.nota && q.nota.trim() ? `${base}\n${q.nota.trim()}` : base;
}

export function primitiveQuota(q: Quota, testoOverride?: string): Primitiva[] {
  const g = geometriaQuota(q);
  const colore = coloreQuota(q);
  const sp = q.stile.spessore;
  const dimFreccia = sp * 4 + 6;
  const gap = sp * 1.5; // distacco della linea di estensione dal punto misurato
  const oltre = sp * 2.5; // sporgenza oltre la linea di quota
  const prim: Primitiva[] = [];

  // Linee di estensione: dal punto misurato (con distacco) fin oltre la linea di quota
  for (const [p, qq] of [
    [q.p1, g.q1],
    [q.p2, g.q2]
  ] as const) {
    const v = sottrai(qq, p);
    const lung = Math.hypot(v.x, v.y);
    if (lung > 1e-6) {
      const vn = normalizza(v);
      const inizio = somma(p, scala(vn, Math.min(gap, lung)));
      const fine = somma(qq, scala(vn, oltre));
      prim.push({
        kind: 'linea',
        punti: [inizio.x, inizio.y, fine.x, fine.y],
        colore,
        spessore: sp * 0.75,
        alone: ALONE
      });
    }
  }

  const testo = testoOverride ?? etichettaQuota(q);
  const dimTesto = q.stile.dimensioneTesto;
  // rotazione del testo allineata alla linea di quota, mai capovolta
  let angolo = (Math.atan2(g.d.y, g.d.x) * 180) / Math.PI;
  let dirTesto = g.d;
  if (angolo > 90 || angolo <= -90) {
    angolo += 180;
    if (angolo > 180) angolo -= 360;
    dirTesto = scala(g.d, -1);
  }
  // "sopra"/"sotto" rispetto all'orientamento di lettura del testo
  const su = normale(dirTesto); // punta verso il basso in coordinate immagine? n = (-dy, dx)
  // per il testo orientato a destra (dirTesto.x>0), su = (0, dirTesto.x) → y>0 = sotto.
  // Vogliamo "sopra" = -su quando su.y>0.
  const sopraVett = su.y > 0 ? scala(su, -1) : su;

  // ancora del testo: il centro della linea, eventualmente fatto scorrere
  // LUNGO la linea (utile per le diagonali che si accavallano al centro)
  const scorr = q.scorrTesto ?? 0;
  const ancora = scorr ? somma(g.centro, scala(g.d, scorr)) : g.centro;
  const distTesto = dimTesto * 0.75;
  let posTesto: Punto;
  if (q.posizioneTesto === 'sopra') {
    posTesto = somma(ancora, scala(sopraVett, distTesto));
  } else if (q.posizioneTesto === 'sotto') {
    posTesto = sottrai(ancora, scala(sopraVett, distTesto));
  } else {
    posTesto = ancora;
  }

  // Linea di quota: intera oppure interrotta dove sta il testo (testo "al centro")
  const larghezzaTesto = misuraLarghezzaTesto(testo, dimTesto);
  const frecceFuori = g.lunghezzaPx < dimFreccia * 3;
  if (q.posizioneTesto === 'centro' && g.lunghezzaPx > larghezzaTesto + dimFreccia * 2) {
    const mezzo = larghezzaTesto / 2 + dimTesto * 0.3;
    const v1 = somma(ancora, scala(normalizza(sottrai(g.q1, ancora)), mezzo));
    const v2 = somma(ancora, scala(normalizza(sottrai(g.q2, ancora)), mezzo));
    prim.push(
      { kind: 'linea', punti: [g.q1.x, g.q1.y, v1.x, v1.y], colore, spessore: sp, alone: ALONE },
      { kind: 'linea', punti: [v2.x, v2.y, g.q2.x, g.q2.y], colore, spessore: sp, alone: ALONE }
    );
  } else {
    prim.push({ kind: 'linea', punti: [g.q1.x, g.q1.y, g.q2.x, g.q2.y], colore, spessore: sp, alone: ALONE });
  }

  // Frecce alle estremità: all'interno se c'è spazio, all'esterno se la quota è corta
  if (g.lunghezzaPx > 1e-6) {
    const versoQ2 = normalizza(sottrai(g.q2, g.q1));
    if (frecceFuori) {
      prim.push(
        freccette(g.q1, versoQ2, dimFreccia, colore),
        freccette(g.q2, scala(versoQ2, -1), dimFreccia, colore)
      );
    } else {
      prim.push(
        freccette(g.q1, scala(versoQ2, -1), dimFreccia, colore),
        freccette(g.q2, versoQ2, dimFreccia, colore)
      );
    }
  }

  prim.push({
    kind: 'testo',
    testo,
    posizione: posTesto,
    rotazioneDeg: angolo,
    dimensione: dimTesto,
    colore,
    sfondo: null,
    alone: ALONE
  });

  return prim;
}

/** Stima della larghezza del testo (px) senza contesto canvas: media ~0.58 em */
export function misuraLarghezzaTesto(testo: string, dimensione: number): number {
  return testo.length * dimensione * 0.58;
}

// ---------------------------------------------------------------------------
// Quota angolare e quota raggio/diametro (Fase 2)
// ---------------------------------------------------------------------------

export function etichettaAngolo(q: Pick<QuotaAngolare, 'valore' | 'stato'>): string {
  const base = q.valore === null ? '?' : `${formattaNumero(q.valore)}°`;
  return q.stato === 'stimata' ? `≈ ${base}` : base;
}

export function primitiveQuotaAngolare(q: QuotaAngolare): Primitiva[] {
  const colore = coloreQuota(q);
  const sp = q.stile.spessore;
  const dimFreccia = sp * 4 + 6;
  const prim: Primitiva[] = [];

  const a1 = Math.atan2(q.a.y - q.vertice.y, q.a.x - q.vertice.x);
  const a2 = Math.atan2(q.b.y - q.vertice.y, q.b.x - q.vertice.x);
  // arco lungo il percorso minore tra i due lati
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const raggio = Math.max(20, q.raggioArco);

  // lati dell'angolo
  prim.push(
    { kind: 'linea', punti: [q.vertice.x, q.vertice.y, q.a.x, q.a.y], colore, spessore: sp * 0.75, alone: ALONE },
    { kind: 'linea', punti: [q.vertice.x, q.vertice.y, q.b.x, q.b.y], colore, spessore: sp * 0.75, alone: ALONE }
  );

  prim.push({
    kind: 'arco',
    centro: q.vertice,
    raggio,
    inizio: a1,
    fine: a1 + delta,
    antiorario: delta < 0,
    colore,
    spessore: sp,
    alone: ALONE
  });

  // frecce tangenti alle estremità dell'arco
  const puntoArco = (ang: number): Punto => ({
    x: q.vertice.x + raggio * Math.cos(ang),
    y: q.vertice.y + raggio * Math.sin(ang)
  });
  const tangente = (ang: number, verso: number): Punto => ({
    x: -Math.sin(ang) * verso,
    y: Math.cos(ang) * verso
  });
  const segno = Math.sign(delta) || 1;
  prim.push(
    freccette(puntoArco(a1), tangente(a1, -segno), dimFreccia, colore),
    freccette(puntoArco(a1 + delta), tangente(a1 + delta, segno), dimFreccia, colore)
  );

  // valore a metà arco, all'esterno
  const angMedio = a1 + delta / 2;
  const dimTesto = q.stile.dimensioneTesto;
  prim.push({
    kind: 'testo',
    testo: etichettaAngolo(q),
    posizione: {
      x: q.vertice.x + (raggio + dimTesto * 0.9) * Math.cos(angMedio),
      y: q.vertice.y + (raggio + dimTesto * 0.9) * Math.sin(angMedio)
    },
    rotazioneDeg: 0,
    dimensione: dimTesto,
    colore,
    sfondo: null,
    alone: ALONE
  });

  return prim;
}

export function etichettaRettangolo(q: QuotaRettangolo): string {
  const m = misureElemento(q);
  const n = (v: number | null) => (v === null ? '?' : formattaNumero(v));
  const nome =
    m.forma === 'rettangolo' ? 'Rettangolo' : m.forma === 'trapezio' ? 'Trapezio' : 'Quadrilatero';
  let testo: string;
  if (m.forma === 'rettangolo') {
    testo = `${nome} ${n(m.baseSup)} × ${n(m.latoSx)} ${q.unita}`;
  } else if (m.forma === 'trapezio') {
    testo =
      n(m.baseSup) !== n(m.baseInf)
        ? `${nome} basi ${n(m.baseSup)}/${n(m.baseInf)} × h ${n(m.latoSx)} ${q.unita}`
        : `${nome} ${n(m.baseSup)} × lati ${n(m.latoSx)}/${n(m.latoDx)} ${q.unita}`;
  } else {
    testo = `${nome} ${n(m.baseSup)}/${n(m.latoDx)}/${n(m.baseInf)}/${n(m.latoSx)} ${q.unita}`;
  }
  return q.stato === 'stimata' ? `≈ ${testo}` : testo;
}

/**
 * Lati quotati di un elemento quadrilatero, con la proiezione (offset) di
 * ciascuno. Unica fonte di verità condivisa dal disegno e dalle maniglie:
 * 0 = la quota giace sul bordo (frecce sui punti di misura). Per un
 * rettangolo si quotano base e altezza; per trapezi/quadrilateri anche i
 * lati che differiscono, così la forma è descritta per intero.
 */
export function latiQuotaRett(
  q: QuotaRettangolo
): Array<{ idx: number; p1: Punto; p2: Punto; valore: number | null; offset: number }> {
  const [aSx, aDx, bDx, bSx] = quadrilateroQuotaRett(q);
  const m = misureElemento(q);
  const off = (i: number) => q.offsetLati?.[i] ?? 0;
  const lati = [
    { idx: 0, p1: aSx, p2: aDx, valore: m.baseSup, offset: off(0) },
    { idx: 1, p1: aSx, p2: bSx, valore: m.latoSx, offset: off(1) }
  ];
  if (m.forma !== 'rettangolo') {
    if (m.baseInf !== null && m.baseSup !== m.baseInf) {
      lati.push({ idx: 2, p1: bSx, p2: bDx, valore: m.baseInf, offset: off(2) });
    }
    if (m.latoDx !== null && m.latoSx !== m.latoDx) {
      lati.push({ idx: 3, p1: aDx, p2: bDx, valore: m.latoDx, offset: off(3) });
    }
  }
  return lati;
}

/**
 * Quota elemento (quadrilatero): contorno che segue i bordi reali della
 * figura + quota di ciascun lato. Di default le quote giacciono SUI bordi
 * (offset 0, frecce sui punti, nessuna linea di proiezione); trascinando la
 * maniglia di un lato la si proietta all'esterno e compaiono le linee guida.
 */
export function primitiveQuotaRettangolo(q: QuotaRettangolo, etichetta?: string): Primitiva[] {
  const badge = etichetta ?? q.etichetta;
  const [altoSx, altoDx, bassoDx, bassoSx] = quadrilateroQuotaRett(q);
  const prim: Primitiva[] = [
    {
      kind: 'polilinea',
      punti: [
        altoSx.x, altoSx.y,
        altoDx.x, altoDx.y,
        bassoDx.x, bassoDx.y,
        bassoSx.x, bassoSx.y,
        altoSx.x, altoSx.y
      ],
      colore: coloreQuota(q),
      spessore: q.stile.spessore * 0.75,
      alone: ALONE
    }
  ];
  const comune = {
    id: q.id,
    fotoId: q.fotoId,
    tipo: 'quota' as const,
    sottotipo: 'allineata' as const,
    zIndex: q.zIndex,
    stile: q.stile,
    posizioneTesto: 'sopra' as const,
    stato: q.stato,
    unita: q.unita
  };
  for (const lato of latiQuotaRett(q)) {
    prim.push(
      ...primitiveQuota({ ...comune, p1: lato.p1, p2: lato.p2, offset: lato.offset, valore: lato.valore })
    );
  }

  // nomenclatura dell'elemento: badge al centro della figura, per
  // distinguere le forme quotate l'una dall'altra (foto e report)
  if (badge) {
    const dim = q.stile.dimensioneTesto;
    const centro: Punto = {
      x: (altoSx.x + altoDx.x + bassoDx.x + bassoSx.x) / 4,
      y: (altoSx.y + altoDx.y + bassoDx.y + bassoSx.y) / 4
    };
    const colore = coloreQuota(q);
    const mezzaL = Math.max(dim * 0.9, misuraLarghezzaTesto(badge, dim) / 2 + dim * 0.4);
    prim.push(
      {
        kind: 'rettangolo',
        rect: { x: centro.x - mezzaL, y: centro.y - dim * 0.8, width: mezzaL * 2, height: dim * 1.6 },
        colore,
        spessore: 0,
        riempimento: colore
      },
      {
        kind: 'testo',
        testo: badge,
        posizione: centro,
        rotazioneDeg: 0,
        dimensione: dim,
        colore: coloreContrasto(colore),
        sfondo: null
      }
    );
  }
  return prim;
}

/**
 * Nome della forma in base ai segmenti quotati: 4 vertici con 2 quote =
 * rettangolo, con 3 = trapezio, con diagonali = rombo, ecc.
 */
export function nomeFormaPoligono(q: QuotaPoligono): string {
  const segs = segmentiPoligono(q);
  const n = q.punti.length;
  const lati = segs.filter((s) => segmentoELato(s, n)).length;
  const diagonali = segs.length - lati;
  if (n === 4) {
    if (diagonali > 0) return 'Rombo';
    if (lati <= 2) return 'Rettangolo';
    if (lati === 3) return 'Trapezio';
    return 'Quadrilatero';
  }
  return nomePoligono(n);
}

/**
 * Nome geometrico di ciascun segmento quotato, adatto al report:
 * rettangolo → b/h; trapezio → B (base maggiore)/b (minore)/H/h; triangolo →
 * ip (ipotenusa)/C/c; rombo → D/d (diagonali) + l (lati). Un `simbolo`
 * impostato a mano sul segmento prevale sempre.
 */
/** Nomi dei due estremi di un segmento secondo la geometria (sopra/sotto o sinistra/destra) */
export function versiSegmento(p1: Punto, p2: Punto): [string, string] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return p1.y <= p2.y ? ['sopra', 'sotto'] : ['sotto', 'sopra'];
  }
  return p1.x <= p2.x ? ['sinistra', 'destra'] : ['destra', 'sinistra'];
}

export function simboliPoligono(q: QuotaPoligono): string[] {
  const segs = segmentiPoligono(q);
  const n = q.punti.length;
  const forma = nomeFormaPoligono(q);
  const info = segs.map((s, i) => {
    const a = q.punti[s.da];
    const b = q.punti[s.a];
    const dx = b ? b.x - a.x : 0;
    const dy = b ? b.y - a.y : 0;
    return {
      i,
      px: Math.hypot(dx, dy),
      ang: ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI,
      orizz: Math.abs(dx) >= Math.abs(dy),
      lato: segmentoELato(s, n)
    };
  });
  const taglia = (i: number) => segs[i].valore ?? info[i].px;
  const out: string[] = segs.map(() => '');

  if (forma === 'Rettangolo') {
    info.forEach((x) => (out[x.i] = x.orizz ? 'b' : 'h'));
  } else if (forma === 'Triangolo') {
    [...info]
      .sort((p, r) => taglia(r.i) - taglia(p.i))
      .forEach((x, k) => (out[x.i] = k === 0 ? 'ip' : k === 1 ? 'C' : 'c'));
  } else if (forma === 'Rombo') {
    // i lati prendono la nomenclatura del rettangolo (b orizzontale, h
    // verticale) quando sono al massimo due; le diagonali restano D/d
    const lati = info.filter((x) => x.lato);
    if (lati.length <= 2) lati.forEach((x) => (out[x.i] = x.orizz ? 'b' : 'h'));
    else lati.forEach((x) => (out[x.i] = 'l'));
    [...info.filter((x) => !x.lato)]
      .sort((p, r) => taglia(r.i) - taglia(p.i))
      .forEach((x, k) => (out[x.i] = k === 0 ? 'D' : 'd'));
  } else if (forma === 'Trapezio' || forma === 'Quadrilatero') {
    const lati = info.filter((x) => x.lato);
    // coppia di lati più paralleli = le basi
    let coppia: [number, number] | null = null;
    let diff = Infinity;
    for (let i = 0; i < lati.length; i++) {
      for (let j = i + 1; j < lati.length; j++) {
        let d = Math.abs(lati[i].ang - lati[j].ang);
        d = Math.min(d, Math.PI - d);
        if (d < diff) {
          diff = d;
          coppia = [lati[i].i, lati[j].i];
        }
      }
    }
    if (coppia && diff < 0.3) {
      const [g, p] = taglia(coppia[0]) >= taglia(coppia[1]) ? coppia : [coppia[1], coppia[0]];
      out[g] = 'B';
      out[p] = 'b';
    }
    const altre = ['H', 'h', 'H₂', 'h₂'];
    let k = 0;
    for (const x of lati) if (!out[x.i]) out[x.i] = altre[k++] ?? `l${k}`;
    let d = 0;
    for (const x of info) if (!x.lato && !out[x.i]) out[x.i] = d++ === 0 ? 'D' : 'd';
  } else {
    info.forEach((x, k) => (out[x.i] = `L${k + 1}`));
  }
  return out.map((s, i) => segs[i].simbolo || s || `L${i + 1}`);
}

/**
 * Posizione del badge di nomenclatura del poligono: al baricentro (più lo
 * spostamento scelto dall'utente, mantenuto dentro la figura). Se la figura è
 * troppo piccola perché il numero ci stia leggibile, il numero esce
 * automaticamente, appena sopra il vertice più alto.
 */
/**
 * Posizione di DEFAULT del badge (senza spostamento manuale): il baricentro se
 * la figura è abbastanza grande da contenerlo, altrimenti appena sopra la figura
 * (quando è troppo piccola). È la base su cui si somma `etichettaOffset`.
 */
export function posizioneEtichettaBase(q: QuotaPoligono): Punto {
  const punti = q.punti;
  const n = punti.length || 1;
  const centro: Punto = {
    x: punti.reduce((s, p) => s + p.x, 0) / n,
    y: punti.reduce((s, p) => s + p.y, 0) / n
  };
  const xs = punti.map((p) => p.x);
  const ys = punti.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dim = q.stile.dimensioneTesto;
  // serve almeno questo ingombro perché il badge stia dentro la figura
  const serve = dim * 2.4;
  if (Math.min(maxX - minX, maxY - minY) < serve) {
    return { x: (minX + maxX) / 2, y: minY - dim * 1.3 };
  }
  return centro;
}

/**
 * Posizione effettiva del badge: base + spostamento manuale (`etichettaOffset`).
 * Lo spostamento è SEMPRE applicato — anche quando la figura è piccola e il
 * badge sta fuori — così l'etichetta resta liberamente trascinabile.
 */
export function posizioneEtichettaPoligono(q: QuotaPoligono): Punto {
  const base = posizioneEtichettaBase(q);
  const off = q.etichettaOffset ?? { x: 0, y: 0 };
  return { x: base.x + off.x, y: base.y + off.y };
}

export function etichettaPoligono(q: QuotaPoligono): string {
  const nome = nomeFormaPoligono(q);
  const valori = segmentiPoligono(q).map((s) => (s.valore === null ? '?' : formattaNumero(s.valore)));
  const testo = `${nome} ${valori.join('/')} ${q.unita}`;
  return q.stato === 'stimata' ? `≈ ${testo}` : testo;
}

/**
 * Quota elemento poligonale (3, 5… lati): contorno chiuso che segue i
 * vertici + quota di ciascun lato, allineata e spinta all'esterno della
 * figura. Riusa la geometria delle quote lineari, come la quota rettangolo.
 */
/** Etichetta "=Ln" se il lato `edgeIdx` è il lato GUIDATO (primo riferimento)
 *  di un vincolo di uguale lunghezza; il numero è quello del lato di
 *  riferimento (secondo riferimento). Altrimenti null. */
function etichettaUguaglianzaLato(q: QuotaPoligono, edgeIdx: number): string | null {
  for (const v of q.vincoli ?? []) {
    if (v.tipo !== 'ugualeLunghezza' || v.riferimento) continue;
    const r0 = v.riferimenti[0];
    const r1 = v.riferimenti[1];
    if (
      r0?.entita === 'lato' &&
      r0.indice === edgeIdx &&
      r1?.entita === 'lato' &&
      r1.indice != null
    ) {
      return `=L${r1.indice + 1}`;
    }
  }
  return null;
}

export function primitiveQuotaPoligono(q: QuotaPoligono, etichetta?: string): Primitiva[] {
  const punti = q.punti;
  const n = punti.length;
  const colore = coloreQuota(q);
  const badge = etichetta ?? q.etichetta;
  // copia "solo etichetta" di un elemento ripetuto: nessun contorno né quote,
  // solo il codice nel punto toccato (baricentro della copia).
  if (q.soloEtichetta) {
    if (!badge) return [];
    return badgePoligono(q, badge, colore, posizioneEtichettaPoligono(q));
  }
  const contorno: number[] = [];
  for (const pt of punti) contorno.push(pt.x, pt.y);
  if (n > 0) contorno.push(punti[0].x, punti[0].y);
  const prim: Primitiva[] = [
    { kind: 'polilinea', punti: contorno, colore, spessore: q.stile.spessore * 0.75, alone: ALONE }
  ];

  const comune = {
    id: q.id,
    fotoId: q.fotoId,
    tipo: 'quota' as const,
    sottotipo: 'allineata' as const,
    zIndex: q.zIndex,
    stile: q.stile,
    stato: q.stato,
    unita: q.unita
  };
  // ogni segmento quotato (lato o diagonale) è una quota allineata; di
  // default sul segmento (offset 0), proiettabile con la sua maniglia
  for (const seg of segmentiPoligono(q)) {
    const a = punti[seg.da];
    const b = punti[seg.a];
    if (!a || !b) continue;
    // lato guidato da un'uguaglianza (=L1): l'etichetta mostra il riferimento
    const edgeIdx =
      (seg.da + 1) % n === seg.a ? seg.da : (seg.a + 1) % n === seg.da ? seg.a : null;
    const eq = edgeIdx != null ? etichettaUguaglianzaLato(q, edgeIdx) : null;
    prim.push(
      ...primitiveQuota(
        {
          ...comune,
          p1: a,
          p2: b,
          offset: seg.offset ?? 0,
          posizioneTesto: seg.posizioneTesto ?? 'sopra',
          scorrTesto: seg.scorrTesto,
          nota: seg.nota,
          valore: seg.valore
        },
        eq ?? undefined
      )
    );
  }

  // OGGETTI INTERNI (Fase 4): rettangoli/cerchi disegnati dentro la pianta
  for (const o of q.oggetti ?? []) {
    if (o.tipo === 'rettangolo' && o.larghezza && o.altezza) {
      // (x,y) = angolo in basso a sinistra → il rettangolo sale verso l'alto
      prim.push({
        kind: 'rettangolo',
        rect: { x: o.x, y: o.y - o.altezza, width: o.larghezza, height: o.altezza },
        colore,
        spessore: Math.max(1.5, q.stile.spessore * 0.6)
      });
    } else if (o.tipo === 'cerchio' && o.raggioPx) {
      prim.push({
        kind: 'cerchio',
        centro: { x: o.x, y: o.y },
        raggio: o.raggioPx,
        colore,
        spessore: Math.max(1.5, q.stile.spessore * 0.6),
        alone: ALONE
      });
    }
    if (o.etichetta) {
      const cx = o.tipo === 'rettangolo' && o.larghezza ? o.x + o.larghezza / 2 : o.x;
      const cy = o.tipo === 'rettangolo' && o.altezza ? o.y - o.altezza / 2 : o.y;
      prim.push({
        kind: 'testo',
        testo: o.etichetta,
        posizione: { x: cx, y: cy },
        rotazioneDeg: 0,
        dimensione: q.stile.dimensioneTesto * 0.85,
        colore,
        sfondo: null,
        alone: ALONE
      });
    }
  }

  // ORIGINE (datum): assicella d'assi (L) al vertice origine, se definito
  if (q.origine != null && q.origine >= 0 && q.origine < n && punti[q.origine]) {
    prim.push(...glifoOrigine(punti[q.origine], colore, q.stile.dimensioneTesto));
  }

  // nomenclatura: badge spostabile, che esce dalla figura se è troppo piccola
  if (badge) prim.push(...badgePoligono(q, badge, colore, posizioneEtichettaPoligono(q)));
  return prim;
}

/** Simbolo dell'origine (datum): due assi corti + pallino, al vertice indicato. */
function glifoOrigine(p: Punto, colore: string, dim: number): Primitiva[] {
  const l = Math.max(14, dim * 0.9);
  return [
    { kind: 'linea', punti: [p.x, p.y, p.x + l, p.y], colore, spessore: 2.5, alone: ALONE },
    { kind: 'linea', punti: [p.x, p.y, p.x, p.y - l], colore, spessore: 2.5, alone: ALONE },
    { kind: 'cerchio', centro: p, raggio: Math.max(3, dim * 0.18), colore, spessore: 2, riempimento: colore }
  ];
}

/** Badge della nomenclatura (riquadro pieno + codice bianco) di un poligono */
function badgePoligono(q: QuotaPoligono, badge: string, colore: string, pos: Punto): Primitiva[] {
  const dim = q.stile.dimensioneTesto;
  const mezzaL = Math.max(dim * 0.9, misuraLarghezzaTesto(badge, dim) / 2 + dim * 0.4);
  return [
    {
      kind: 'rettangolo',
      rect: { x: pos.x - mezzaL, y: pos.y - dim * 0.8, width: mezzaL * 2, height: dim * 1.6 },
      colore,
      spessore: 0,
      riempimento: colore
    },
    {
      kind: 'testo',
      testo: badge,
      posizione: pos,
      rotazioneDeg: 0,
      dimensione: dim,
      colore: coloreContrasto(colore),
      sfondo: null
    }
  ];
}

/**
 * Bianco o nero in base alla luminanza dello sfondo: la lettera dell'etichetta
 * resta sempre leggibile a prescindere dal colore scelto (es. su giallo → nero).
 */
export function coloreContrasto(sfondo: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(sfondo.trim());
  if (!m) return '#ffffff';
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; // luminanza percepita
  return lum > 0.6 ? '#111111' : '#ffffff';
}

/** Etichetta alfabetica: badge circolare pieno con la lettera (colore automatico). */
export function primitiveEtichetta(a: Etichetta): Primitiva[] {
  const dim = a.stile.dimensioneTesto;
  const raggio = Math.max(dim * 0.95, misuraLarghezzaTesto(a.lettera, dim) / 2 + dim * 0.45);
  const colore = a.stile.colore;
  return [
    {
      kind: 'cerchio',
      centro: a.posizione,
      raggio,
      colore,
      spessore: 0,
      riempimento: colore,
      alone: ALONE
    },
    {
      kind: 'testo',
      testo: a.lettera,
      posizione: a.posizione,
      rotazioneDeg: 0,
      dimensione: dim,
      colore: coloreContrasto(colore),
      sfondo: null
    }
  ];
}

/** Tronca un testo con ellissi se supera la larghezza massima (px immagine). */
function troncaTesto(testo: string, dim: number, maxLarghezza: number): string {
  if (maxLarghezza <= 0 || misuraLarghezzaTesto(testo, dim) <= maxLarghezza) return testo;
  let t = testo;
  while (t.length > 1 && misuraLarghezzaTesto(t + '…', dim) > maxLarghezza) t = t.slice(0, -1);
  return t + '…';
}

/**
 * Legenda: riquadro con le voci (badge lettera + descrizione) che rifluiscono a
 * una o più colonne in base alla dimensione del riquadro, sempre in ordine
 * alfabetico. Usata SOLO nell'editor (nel PDF la legenda è trascritta a parte).
 */
export function primitiveLegenda(
  l: Legenda,
  voci: Array<{ lettera: string; descrizione: string; quantita?: number }>
): Primitiva[] {
  if (voci.length === 0) return [];
  const dim = l.stile.dimensioneTesto;
  const pad = dim * 0.6;
  const rowH = dim * 1.7;
  const W = l.larghezza;
  const H = l.altezza;
  const x0 = l.posizione.x;
  const y0 = l.posizione.y;
  const usableH = Math.max(rowH, H - 2 * pad);
  const righePerColonna = Math.max(1, Math.floor(usableH / rowH));
  const colonne = Math.max(1, Math.ceil(voci.length / righePerColonna));
  const colW = (W - 2 * pad) / colonne;
  const badgeR = dim * 0.6;
  const prim: Primitiva[] = [
    {
      kind: 'rettangolo',
      rect: { x: x0, y: y0, width: W, height: H },
      colore: 'rgba(20,24,33,0.85)',
      spessore: Math.max(2, dim * 0.08),
      riempimento: 'rgba(255,255,255,0.94)',
      raggio: l.forma === 'arrotondato' ? Math.min(dim, W / 2, H / 2) : 0
    }
  ];
  voci.forEach((v, i) => {
    const col = Math.floor(i / righePerColonna);
    const row = i % righePerColonna;
    const cx = x0 + pad + col * colW + badgeR;
    const cy = y0 + pad + row * rowH + rowH / 2;
    prim.push({
      kind: 'cerchio',
      centro: { x: cx, y: cy },
      raggio: badgeR,
      colore: l.stile.colore,
      spessore: 0,
      riempimento: l.stile.colore
    });
    prim.push({
      kind: 'testo',
      testo: v.lettera,
      posizione: { x: cx, y: cy },
      rotazioneDeg: 0,
      dimensione: dim * 0.82,
      colore: coloreContrasto(l.stile.colore),
      sfondo: null
    });
    const tx = cx + badgeR + dim * 0.45;
    const maxW = colW - (badgeR * 2 + dim * 0.6);
    // mostra la quantità quando l'elemento è ripetuto (es. "×3")
    const testoRiga =
      (v.quantita ?? 1) > 1
        ? `${v.descrizione || '—'}  ×${v.quantita}`
        : v.descrizione || '—';
    prim.push({
      kind: 'testo',
      testo: troncaTesto(testoRiga, dim * 0.92, maxW),
      posizione: { x: tx, y: cy },
      rotazioneDeg: 0,
      dimensione: dim * 0.92,
      colore: '#14181f',
      sfondo: null,
      allineamento: 'left'
    });
  });
  return prim;
}

/** Converte un colore hex in rgba con l'opacità data (per i riempimenti forma). */
function coloreConOpacita(hex: string, opacita: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacita))})`;
}

/** Forma di disegno generica: contorno (+ riempimento opzionale) per linea,
 *  rettangolo, cerchio, poligono e tracciato a mano libera. */
export function primitiveForma(f: Forma): Primitiva[] {
  const colore = f.stile.colore;
  const sp = f.stile.spessore;
  const tratteggio = f.tratteggio;
  const riemp = f.riempimento ? coloreConOpacita(f.riempimento, f.opacitaRiempimento ?? 0.3) : undefined;
  const prim: Primitiva[] = [];
  switch (f.forma) {
    case 'linea':
      if (f.punti.length >= 2) {
        prim.push({
          kind: 'linea',
          punti: [f.punti[0].x, f.punti[0].y, f.punti[1].x, f.punti[1].y],
          colore,
          spessore: sp,
          tratteggio,
          alone: tratteggio ? undefined : ALONE
        });
      }
      break;
    case 'rettangolo': {
      if (f.punti.length < 2) break;
      const a = f.punti[0];
      const b = f.punti[1];
      const rect = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y)
      };
      const contorno = [
        rect.x, rect.y, rect.x + rect.width, rect.y,
        rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height,
        rect.x, rect.y
      ];
      if (riemp) prim.push({ kind: 'rettangolo', rect, colore: riemp, spessore: 0, riempimento: riemp });
      prim.push({ kind: 'polilinea', punti: contorno, colore, spessore: sp, tratteggio, alone: tratteggio ? undefined : ALONE });
      break;
    }
    case 'cerchio': {
      if (f.punti.length < 2) break;
      const raggio = distanza(f.punti[0], f.punti[1]);
      prim.push({
        kind: 'cerchio',
        centro: f.punti[0],
        raggio,
        colore,
        spessore: sp,
        riempimento: riemp,
        tratteggio,
        alone: tratteggio ? undefined : ALONE
      });
      break;
    }
    case 'poligono':
    case 'manoLibera': {
      if (f.punti.length < 2) break;
      const flat = f.punti.flatMap((pt) => [pt.x, pt.y]);
      const chiudi = f.chiusa || f.forma === 'poligono';
      const contorno = chiudi ? [...flat, f.punti[0].x, f.punti[0].y] : flat;
      if (riemp && f.punti.length >= 3) prim.push({ kind: 'poligono', punti: flat, colore: riemp });
      prim.push({ kind: 'polilinea', punti: contorno, colore, spessore: sp, tratteggio, alone: tratteggio ? undefined : ALONE });
      break;
    }
  }
  return prim;
}

// ---------------------------------------------------------------------------
// Quotatura tecnica (§5) — rendering per sottotipo
// ---------------------------------------------------------------------------

/** Piede di `p` sulla linea di quota: proiezione sulla guida + offset normale. */
function piedeQuotaTecnica(p: Punto, a: Punto, d: Punto, n: Punto, offset: number): Punto {
  const t = dot(sottrai(p, a), d);
  return somma(somma(a, scala(d, t)), scala(n, offset));
}

/** Etichetta del valore di una quota tecnica (— se non calcolabile). */
function etichettaQuotaTecnica(valore: number | null, unita: Unita): string {
  return valore === null ? '—' : formattaMisura(valore, unita);
}

/**
 * Terminatori della linea di quota ai due piedi f1, f2, secondo lo stile:
 * frecce (default; interne se c'è spazio, tacche oblique se il tratto è corto),
 * tacche oblique a 45°, oppure pallini pieni.
 */
function disegnaTerminatori(
  prim: Primitiva[],
  f1: Punto,
  f2: Punto,
  terminatore: 'freccia' | 'tacca' | undefined,
  dimFreccia: number,
  colore: string,
  sp: number
): void {
  const d = normalizza(sottrai(f2, f1));
  const n = normale(d);
  const tacca = (f: Punto) => {
    const obliqua = normalizza(somma(d, n));
    const tk = dimFreccia * 0.6;
    prim.push({
      kind: 'linea',
      punti: [f.x - obliqua.x * tk, f.y - obliqua.y * tk, f.x + obliqua.x * tk, f.y + obliqua.y * tk],
      colore,
      spessore: sp,
      alone: ALONE
    });
  };
  if (terminatore === 'tacca') {
    tacca(f1);
    tacca(f2);
    return;
  }
  // freccia (default): interne se c'è spazio, oblique se il tratto è corto
  if (distanza(f1, f2) > dimFreccia * 2.2) {
    prim.push(freccette(f1, d, dimFreccia, colore), freccette(f2, scala(d, -1), dimFreccia, colore));
  } else {
    tacca(f1);
    tacca(f2);
  }
}

/** Orientamento del testo allineato alla guida, mai capovolto, + versore "sopra". */
function orientamentoTesto(d: Punto): { angolo: number; sopra: Punto } {
  let angolo = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  let dirTesto = d;
  if (angolo > 90 || angolo <= -90) {
    angolo += 180;
    if (angolo > 180) angolo -= 360;
    dirTesto = scala(d, -1);
  }
  const su = normale(dirTesto);
  return { angolo, sopra: su.y > 0 ? scala(su, -1) : su };
}

/** Parametri editabili delle linee di estensione (con default dallo spessore). */
function paramEstensione(q: QuotaTecnica, sp: number): { gap: number; oltre: number; visibili: boolean } {
  return {
    gap: q.gapEstensione ?? sp * 1.5,
    oltre: q.sporgenzaEstensione ?? sp * 2.5,
    visibili: q.estensioniVisibili !== false
  };
}

/** Linea di estensione da un punto reale fino al suo piede sulla linea di quota. */
function lineaEstensione(
  p: Punto,
  piede: Punto,
  gap: number,
  oltre: number,
  colore: string,
  sp: number
): Primitiva | null {
  const v = sottrai(piede, p);
  const lung = Math.hypot(v.x, v.y);
  if (lung <= 1e-6) return null;
  const vn = normalizza(v);
  const inizio = somma(p, scala(vn, Math.min(gap, lung)));
  const fine = somma(piede, scala(vn, oltre));
  return { kind: 'linea', punti: [inizio.x, inizio.y, fine.x, fine.y], colore, spessore: sp * 0.75, alone: ALONE };
}

/**
 * Quotatura IN SERIE: un'unica linea di quota a offset costante dalla guida,
 * linee di estensione da ciascun punto reale e, per ogni segmento, frecce
 * (o tacche oblique se corto) ed etichetta del valore.
 */
function primitiveSerie(q: QuotaTecnica): Primitiva[] {
  const prim: Primitiva[] = [];
  const guida = q.lineaGuida;
  if (!guida || q.quote.length === 0) return prim;

  const colore = q.stile.colore || COLORE_QUOTA_TECNICA;
  const sp = q.stile.spessore;
  const dimTesto = q.stile.dimensioneTesto;
  const dimFreccia = sp * 3 + 5;
  const { gap, oltre, visibili } = paramEstensione(q, sp);
  const d = normalizza(sottrai(guida.b, guida.a));
  const n = normale(d);
  const a = guida.a;
  const offset = q.quote[0].offset;

  // 1) Linee di estensione, una per ogni estremo distinto
  if (visibili) {
    const visti: Punto[] = [];
    for (const seg of q.quote) {
      for (const p of [seg.p1, seg.p2]) {
        if (visti.some((v) => Math.abs(v.x - p.x) < 0.5 && Math.abs(v.y - p.y) < 0.5)) continue;
        visti.push(p);
        const piede = piedeQuotaTecnica(p, a, d, n, offset);
        const e = lineaEstensione(p, piede, gap, oltre, colore, sp);
        if (e) prim.push(e);
      }
    }
  }

  // 2) Linea di quota continua tra il primo e l'ultimo piede
  const primoPiede = piedeQuotaTecnica(q.quote[0].p1, a, d, n, offset);
  const ultimoPiede = piedeQuotaTecnica(q.quote[q.quote.length - 1].p2, a, d, n, offset);
  prim.push({
    kind: 'linea',
    punti: [primoPiede.x, primoPiede.y, ultimoPiede.x, ultimoPiede.y],
    colore,
    spessore: sp,
    alone: ALONE
  });

  // orientamento del testo: allineato alla guida, mai capovolto
  let angolo = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  let dirTesto = d;
  if (angolo > 90 || angolo <= -90) {
    angolo += 180;
    if (angolo > 180) angolo -= 360;
    dirTesto = scala(d, -1);
  }
  const su = normale(dirTesto);
  const sopraVett = su.y > 0 ? scala(su, -1) : su;

  // 3) Per ogni segmento: terminatori ai piedi ed etichetta del valore
  for (const seg of q.quote) {
    const f1 = piedeQuotaTecnica(seg.p1, a, d, n, offset);
    const f2 = piedeQuotaTecnica(seg.p2, a, d, n, offset);
    const lungSeg = distanza(f1, f2);
    if (lungSeg < 1e-6) continue;
    disegnaTerminatori(prim, f1, f2, q.terminatore, dimFreccia, colore, sp);
    const centro = scala(somma(f1, f2), 0.5);
    const posTesto = somma(centro, scala(sopraVett, dimTesto * 0.75));
    prim.push({
      kind: 'testo',
      testo: etichettaQuotaTecnica(seg.valore, q.unita),
      posizione: posTesto,
      rotazioneDeg: angolo,
      dimensione: dimTesto,
      colore,
      sfondo: null,
      alone: ALONE
    });
  }

  return prim;
}

/**
 * Quotatura IN PARALLELO: ogni punto è quotato dall'origine su una propria
 * linea di quota parallela alla guida, impilata a offset crescente.
 */
function primitiveParallelo(q: QuotaTecnica): Primitiva[] {
  const prim: Primitiva[] = [];
  const guida = q.lineaGuida;
  if (!guida || q.quote.length === 0) return prim;

  const colore = q.stile.colore || COLORE_QUOTA_TECNICA;
  const sp = q.stile.spessore;
  const dimTesto = q.stile.dimensioneTesto;
  const dimFreccia = sp * 3 + 5;
  const { gap, oltre, visibili } = paramEstensione(q, sp);
  const d = normalizza(sottrai(guida.b, guida.a));
  const n = normale(d);
  const a = guida.a;
  const { angolo, sopra } = orientamentoTesto(d);

  // marcatore dell'origine (comune a tutte le quote)
  const origine = q.quote[0].p1;
  prim.push({ kind: 'cerchio', centro: origine, raggio: dimFreccia * 0.5, colore, spessore: sp, alone: ALONE });

  for (const seg of q.quote) {
    const f1 = piedeQuotaTecnica(seg.p1, a, d, n, seg.offset); // piede dell'origine
    const f2 = piedeQuotaTecnica(seg.p2, a, d, n, seg.offset); // piede del punto
    const lungSeg = distanza(f1, f2);
    if (lungSeg < 1e-6) continue;

    if (visibili) {
      const e1 = lineaEstensione(seg.p1, f1, gap, oltre, colore, sp);
      const e2 = lineaEstensione(seg.p2, f2, gap, oltre, colore, sp);
      if (e1) prim.push(e1);
      if (e2) prim.push(e2);
    }

    prim.push({ kind: 'linea', punti: [f1.x, f1.y, f2.x, f2.y], colore, spessore: sp, alone: ALONE });

    disegnaTerminatori(prim, f1, f2, q.terminatore, dimFreccia, colore, sp);

    const centro = scala(somma(f1, f2), 0.5);
    prim.push({
      kind: 'testo',
      testo: etichettaQuotaTecnica(seg.valore, q.unita),
      posizione: somma(centro, scala(sopra, dimTesto * 0.75)),
      rotazioneDeg: angolo,
      dimensione: dimTesto,
      colore,
      sfondo: null,
      alone: ALONE
    });
  }
  return prim;
}

/**
 * Quotatura PROGRESSIVA (ordinate): un'unica linea di riferimento dallo zero;
 * ogni punto ha una breve estensione e il solo valore con segno, senza
 * doppia freccia.
 */
function primitiveProgressiva(q: QuotaTecnica): Primitiva[] {
  const prim: Primitiva[] = [];
  const guida = q.lineaGuida;
  if (!guida || q.quote.length === 0) return prim;

  const colore = q.stile.colore || COLORE_QUOTA_TECNICA;
  const sp = q.stile.spessore;
  const dimTesto = q.stile.dimensioneTesto;
  const dimFreccia = sp * 3 + 5;
  const { gap, oltre, visibili } = paramEstensione(q, sp);
  const d = normalizza(sottrai(guida.b, guida.a));
  const n = normale(d);
  const a = guida.a;
  const offset = q.quote[0].offset;
  const { angolo, sopra } = orientamentoTesto(d);

  const zero = q.quote[0].p1; // tutte le quote partono dallo zero
  const zeroFoot = piedeQuotaTecnica(zero, a, d, n, offset);

  // linea di riferimento: dallo zero fino al piede più lontano lungo la guida
  let tMin = 0;
  let tMax = 0;
  for (const seg of q.quote) {
    const t = dot(sottrai(seg.p2, zero), d);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  const rifA = somma(zeroFoot, scala(d, tMin));
  const rifB = somma(zeroFoot, scala(d, tMax));
  prim.push({ kind: 'linea', punti: [rifA.x, rifA.y, rifB.x, rifB.y], colore, spessore: sp, alone: ALONE });

  // marcatore dello zero + etichetta "0"
  prim.push({ kind: 'cerchio', centro: zeroFoot, raggio: dimFreccia * 0.45, colore, spessore: sp, alone: ALONE });
  if (visibili) {
    const e0 = lineaEstensione(zero, zeroFoot, gap, oltre, colore, sp);
    if (e0) prim.push(e0);
  }

  for (const seg of q.quote) {
    const piede = piedeQuotaTecnica(seg.p2, a, d, n, offset);
    if (visibili) {
      const e = lineaEstensione(seg.p2, piede, gap, oltre, colore, sp);
      if (e) prim.push(e);
    }
    // tacca corta sulla linea di riferimento (niente doppia freccia)
    const tk = dimFreccia * 0.6;
    prim.push({
      kind: 'linea',
      punti: [piede.x - n.x * tk, piede.y - n.y * tk, piede.x + n.x * tk, piede.y + n.y * tk],
      colore,
      spessore: sp,
      alone: ALONE
    });
    // fondino chiaro: la quota interrompe nettamente le linee di proiezione
    prim.push({
      kind: 'testo',
      testo: etichettaQuotaTecnica(seg.valore, q.unita),
      posizione: somma(piede, scala(sopra, dimTesto * 0.95)),
      rotazioneDeg: angolo,
      dimensione: dimTesto,
      colore,
      sfondo: 'rgba(255,255,255,0.92)'
    });
  }
  return prim;
}

/** Etichetta del foro: tag opzionale + ⌀/R + valore reale (o — se assente). */
function etichettaForo(f: ForoTecnico, unita: Unita): string {
  const val = f.modo === 'diametro' ? f.diametroReale : f.raggioReale;
  const prefisso = f.modo === 'diametro' ? '⌀ ' : 'R ';
  const tag = f.etichetta ? `${f.etichetta}  ` : '';
  return `${tag}${prefisso}${formattaMisura(val, unita)}`;
}

/**
 * Quotatura FORO (§5.4): circonferenza, croce di centro, leader ed etichetta
 * con ⌀ o R nelle unità reali.
 */
function primitiveForo(q: QuotaTecnica): Primitiva[] {
  const f = q.foro;
  if (!f) return [];
  const colore = q.stile.colore || COLORE_QUOTA_TECNICA;
  const sp = q.stile.spessore;
  const s = q.stile.dimensioneTesto;
  const c = f.centro;
  const r = f.raggioPx;
  const cross = Math.max(r * 0.5, s * 0.4);
  const dir = normalizza({ x: 1, y: -1 }); // leader a 45° in alto a destra
  const bordo = somma(c, scala(dir, r));
  const fine = somma(c, scala(dir, r + s * 1.4));
  return [
    { kind: 'cerchio', centro: c, raggio: r, colore, spessore: sp, alone: ALONE },
    { kind: 'linea', punti: [c.x - cross, c.y, c.x + cross, c.y], colore, spessore: sp * 0.75, alone: ALONE },
    { kind: 'linea', punti: [c.x, c.y - cross, c.x, c.y + cross], colore, spessore: sp * 0.75, alone: ALONE },
    { kind: 'linea', punti: [bordo.x, bordo.y, fine.x, fine.y], colore, spessore: sp * 0.75, alone: ALONE },
    {
      kind: 'testo',
      testo: etichettaForo(f, q.unita),
      posizione: somma(fine, scala(dir, s * 0.15)),
      rotazioneDeg: 0,
      dimensione: s,
      colore,
      sfondo: null,
      alone: ALONE,
      allineamento: 'left'
    }
  ];
}

/**
 * Riferimento / datum: triangolo pieno con l'apice sul punto di riferimento,
 * leader e riquadro con la lettera del datum (A, B, …).
 */
function primitiveDatum(q: QuotaTecnica): Primitiva[] {
  const p = q.riferimento?.punti[0] ?? q.puntiOriginali[0];
  if (!p) return [];
  const colore = q.stile.colore || COLORE_QUOTA_TECNICA;
  const sp = q.stile.spessore;
  const s = q.stile.dimensioneTesto;
  const triBaseY = p.y - s * 0.7;
  const boxLato = s * 1.35;
  const boxCy = triBaseY - s * 0.6 - boxLato / 2;
  const rect = { x: p.x - boxLato / 2, y: boxCy - boxLato / 2, width: boxLato, height: boxLato };
  return [
    {
      kind: 'poligono',
      punti: [p.x, p.y, p.x - s * 0.35, triBaseY, p.x + s * 0.35, triBaseY],
      colore,
      alone: ALONE
    },
    { kind: 'linea', punti: [p.x, triBaseY, p.x, boxCy + boxLato / 2], colore, spessore: sp, alone: ALONE },
    { kind: 'rettangolo', rect, colore, spessore: sp, riempimento: 'rgba(255,255,255,0.92)' },
    {
      kind: 'testo',
      testo: q.etichetta || '?',
      posizione: { x: p.x, y: boxCy },
      rotazioneDeg: 0,
      dimensione: s,
      colore,
      sfondo: null
    }
  ];
}

/** Leader di richiamo con mensola e testo (callout di smusso/filettatura). */
function leaderCallout(
  da: Punto,
  a: Punto,
  testo: string,
  dimTesto: number,
  colore: string,
  sp: number
): Primitiva[] {
  const larghezza = misuraLarghezzaTesto(testo, dimTesto);
  const verso = a.x >= da.x ? 1 : -1;
  const shelfEnd = { x: a.x + verso * larghezza, y: a.y };
  const testoX = verso > 0 ? a.x : shelfEnd.x;
  return [
    { kind: 'cerchio', centro: da, raggio: Math.max(sp * 1.4, 2), colore, spessore: 0, riempimento: colore },
    { kind: 'linea', punti: [da.x, da.y, a.x, a.y], colore, spessore: sp * 0.75, alone: ALONE },
    { kind: 'linea', punti: [a.x, a.y, shelfEnd.x, shelfEnd.y], colore, spessore: sp * 0.75, alone: ALONE },
    {
      kind: 'testo',
      testo,
      posizione: { x: testoX, y: a.y - dimTesto * 0.62 },
      rotazioneDeg: 0,
      dimensione: dimTesto,
      colore,
      sfondo: null,
      alone: ALONE,
      allineamento: 'left'
    }
  ];
}

/** Smusso (§5.7): segmento smussato evidenziato + leader con la callout C/angolo. */
function primitiveSmusso(q: QuotaTecnica): Primitiva[] {
  const s = q.smusso;
  if (!s) return [];
  const colore = q.stile.colore || COLORE_QUOTA_TECNICA;
  const sp = q.stile.spessore;
  const dimT = q.stile.dimensioneTesto;
  const medio = scala(somma(s.a, s.b), 0.5);
  const leader = s.leader ?? { da: medio, a: medio };
  return [
    { kind: 'linea', punti: [s.a.x, s.a.y, s.b.x, s.b.y], colore, spessore: sp, alone: ALONE },
    ...leaderCallout(leader.da, leader.a, s.designazione, dimT, colore, sp)
  ];
}

/** Filettatura (§5.8): leader + callout normalizzata (nessun filetto disegnato). */
function primitiveFilettatura(q: QuotaTecnica): Primitiva[] {
  const f = q.filettatura;
  if (!f) return [];
  const colore = q.stile.colore || COLORE_QUOTA_TECNICA;
  const sp = q.stile.spessore;
  const dimT = q.stile.dimensioneTesto;
  const leader = f.leader ?? { da: f.ancora, a: f.ancora };
  return leaderCallout(leader.da, leader.a, f.designazione, dimT, colore, sp);
}

/** Dispatcher della quotatura tecnica per sottotipo. */
export function primitiveQuotaTecnica(q: QuotaTecnica): Primitiva[] {
  switch (q.sottotipo) {
    case 'serie':
      return primitiveSerie(q);
    case 'parallelo':
      return primitiveParallelo(q);
    case 'progressiva':
      return primitiveProgressiva(q);
    case 'datum':
      return primitiveDatum(q);
    case 'foro':
      return primitiveForo(q);
    case 'smusso':
      return primitiveSmusso(q);
    case 'filettatura':
      return primitiveFilettatura(q);
  }
}

/** Colore dedicato alle catene di misure (turchese), distinto dal giallo quote. */
const COLORE_CATENA = '#13b8cc';
const COLORE_CATENA_BANDA = 'rgba(19,184,204,0.42)';

/**
 * Evidenziazione grafica delle MISURE CONCATENATE: una banda turchese lungo
 * ogni quota della catena (così il gruppo si riconosce a colpo d'occhio) e un
 * badge "Σ totale" al centro della catena. Disegnata SOPRA le quote.
 */
export function primitiveCatene(annotazioni: Annotazione[]): Primitiva[] {
  const catene = calcolaCatene(annotazioni);
  const prim: Primitiva[] = [];
  for (const c of catene) {
    let sx = 0;
    let sy = 0;
    let dim = 24;
    const g0 = geometriaQuota(c.quote[0]);
    for (const q of c.quote) {
      const g = geometriaQuota(q);
      dim = q.stile.dimensioneTesto;
      prim.push({
        kind: 'linea',
        punti: [g.q1.x, g.q1.y, g.q2.x, g.q2.y],
        colore: COLORE_CATENA_BANDA,
        spessore: q.stile.spessore * 3 + 10
      });
      sx += g.centro.x;
      sy += g.centro.y;
    }
    const n = c.quote.length;
    const tot = sommaCatenaInUnita(c);
    if (n > 0 && tot !== null) {
      const off = dim * 2.2;
      const cx = sx / n + g0.n.x * off;
      const cy = sy / n + g0.n.y * off;
      const testo = `Σ ${formattaMisura(tot, c.unita)}`;
      const w = misuraLarghezzaTesto(testo, dim) + dim * 0.9;
      const h = dim * 1.6;
      prim.push({
        kind: 'rettangolo',
        rect: { x: cx - w / 2, y: cy - h / 2, width: w, height: h },
        colore: COLORE_CATENA,
        spessore: 0,
        riempimento: COLORE_CATENA,
        raggio: h / 2
      });
      prim.push({
        kind: 'testo',
        testo,
        posizione: { x: cx, y: cy },
        rotazioneDeg: 0,
        dimensione: dim * 0.85,
        colore: coloreContrasto(COLORE_CATENA),
        sfondo: null,
        alone: ALONE
      });
    }
  }
  return prim;
}

export function etichettaRaggio(q: Pick<QuotaRaggio, 'valore' | 'unita' | 'stato' | 'modo'>): string {
  const prefisso = q.modo === 'diametro' ? '⌀ ' : 'R ';
  const base = q.valore === null ? `${prefisso}?` : `${prefisso}${formattaMisura(q.valore, q.unita)}`;
  return q.stato === 'stimata' ? `≈ ${base}` : base;
}

export function primitiveQuotaRaggio(q: QuotaRaggio): Primitiva[] {
  const colore = coloreQuota(q);
  const sp = q.stile.spessore;
  const dimFreccia = sp * 4 + 6;
  const r = distanza(q.centro, q.bordo);
  const d = normalizza(sottrai(q.bordo, q.centro));
  const prim: Primitiva[] = [];

  // circonferenza di riferimento tratteggiata
  prim.push({
    kind: 'cerchio',
    centro: q.centro,
    raggio: r,
    colore,
    spessore: sp * 0.6,
    tratteggio: [sp * 4, sp * 3],
    alone: ALONE
  });

  const inizio = q.modo === 'diametro' ? sottrai(q.centro, scala(d, r)) : q.centro;
  prim.push({
    kind: 'linea',
    punti: [inizio.x, inizio.y, q.bordo.x, q.bordo.y],
    colore,
    spessore: sp,
    alone: ALONE
  });
  prim.push(freccette(q.bordo, d, dimFreccia, colore));
  if (q.modo === 'diametro') {
    prim.push(freccette(inizio, scala(d, -1), dimFreccia, colore));
  } else {
    // croce sul centro
    const c = sp * 3;
    prim.push(
      { kind: 'linea', punti: [q.centro.x - c, q.centro.y, q.centro.x + c, q.centro.y], colore, spessore: sp * 0.75, alone: ALONE },
      { kind: 'linea', punti: [q.centro.x, q.centro.y - c, q.centro.x, q.centro.y + c], colore, spessore: sp * 0.75, alone: ALONE }
    );
  }

  const dimTesto = q.stile.dimensioneTesto;
  const n = normale(d);
  const medio = scala(somma(inizio, q.bordo), 0.5);
  prim.push({
    kind: 'testo',
    testo: etichettaRaggio(q),
    posizione: somma(medio, scala(n, n.y > 0 ? -dimTesto * 0.85 : dimTesto * 0.85)),
    rotazioneDeg: 0,
    dimensione: dimTesto,
    colore,
    sfondo: null,
    alone: ALONE
  });

  return prim;
}

// ---------------------------------------------------------------------------
// Altre annotazioni
// ---------------------------------------------------------------------------

export function primitiveFreccia(f: Freccia): Primitiva[] {
  const colore = f.stile.colore;
  const dimFreccia = f.stile.spessore * 4 + 6;
  const d = normalizza(sottrai(f.p2, f.p1));
  const fine = sottrai(f.p2, scala(d, dimFreccia * 0.6));
  return [
    { kind: 'linea', punti: [f.p1.x, f.p1.y, fine.x, fine.y], colore, spessore: f.stile.spessore, alone: ALONE },
    freccette(f.p2, d, dimFreccia, colore)
  ];
}

export function primitiveTesto(t: TestoFoto): Primitiva[] {
  const prim: Primitiva[] = [];
  const colore = t.stile.colore;
  // nota con richiamo: freccia dal riquadro al punto segnalato
  if (t.ancora) {
    const v = sottrai(t.ancora, t.posizione);
    if (Math.hypot(v.x, v.y) > 1e-3) {
      const dir = normalizza(v);
      const sp = Math.max(2, t.stile.spessore * 0.75);
      prim.push({
        kind: 'linea',
        punti: [t.posizione.x, t.posizione.y, t.ancora.x, t.ancora.y],
        colore,
        spessore: sp,
        alone: ALONE
      });
      prim.push(freccette(t.ancora, dir, t.stile.spessore * 4 + 6, colore));
    }
  }
  // nota in stile legenda: riquadro chiaro arrotondato con bordo del colore
  // scelto e testo scuro a contrasto, così resta sempre leggibile.
  const dim = t.stile.dimensioneTesto;
  const righe = (t.testo || ' ').split('\n');
  const altRiga = dim * 1.25;
  const larghezza = Math.max(...righe.map((r) => misuraLarghezzaTesto(r, dim)));
  const pad = dim * 0.5;
  const w = larghezza + pad * 2;
  const h = (righe.length - 1) * altRiga + dim + pad * 2;
  prim.push({
    kind: 'rettangolo',
    rect: { x: t.posizione.x - w / 2, y: t.posizione.y - h / 2, width: w, height: h },
    colore,
    spessore: Math.max(2, dim * 0.1),
    riempimento: 'rgba(255,255,255,0.95)',
    raggio: dim * 0.4
  });
  prim.push({
    kind: 'testo',
    testo: t.testo || ' ',
    posizione: t.posizione,
    rotazioneDeg: 0,
    dimensione: dim,
    colore: coloreContrasto('#ffffff'), // testo scuro sul riquadro chiaro
    sfondo: null
  });
  return prim;
}

export function primitiveDisegno(d: DisegnoLibero): Primitiva[] {
  if (d.punti.length < 4) return [];
  return [{ kind: 'polilinea', punti: d.punti, colore: d.stile.colore, spessore: d.stile.spessore }];
}

export function primitiveCallout(
  c: Callout,
  imgDettaglio?: CanvasImageSource | null,
  etichetta?: string
): Primitiva[] {
  const colore = c.stile.colore;
  const sp = c.stile.spessore;
  const prim: Primitiva[] = [];

  // contorno della regione sorgente
  prim.push({ kind: 'rettangolo', rect: c.sorgente, colore, spessore: sp * 0.75 });

  // inserto: foto scattata, oppure ingrandimento del ritaglio
  if (c.fotoDettaglio) {
    if (imgDettaglio) {
      prim.push({ kind: 'immagine', img: imgDettaglio, destinazione: c.inserto });
    } else {
      // segnaposto mentre la foto si carica
      prim.push({ kind: 'rettangolo', rect: c.inserto, colore, spessore: 0, riempimento: 'rgba(0,0,0,0.4)' });
      prim.push({
        kind: 'testo',
        testo: '📷',
        posizione: { x: c.inserto.x + c.inserto.width / 2, y: c.inserto.y + c.inserto.height / 2 },
        rotazioneDeg: 0,
        dimensione: Math.max(12, Math.min(c.inserto.width, c.inserto.height) * 0.4),
        colore: '#ffffff',
        sfondo: null
      });
    }
  } else {
    prim.push({ kind: 'ritaglio', sorgente: c.sorgente, destinazione: c.inserto });
  }
  prim.push({ kind: 'rettangolo', rect: c.inserto, colore, spessore: sp });

  // leader: dal bordo dell'inserto al centro della regione sorgente
  const centroSorgente: Punto = {
    x: c.sorgente.x + c.sorgente.width / 2,
    y: c.sorgente.y + c.sorgente.height / 2
  };
  const centroInserto: Punto = {
    x: c.inserto.x + c.inserto.width / 2,
    y: c.inserto.y + c.inserto.height / 2
  };
  const partenza = puntoSuBordo(c.inserto, centroSorgente);
  const d = normalizza(sottrai(centroSorgente, centroInserto));
  const dimFreccia = sp * 4 + 6;
  const fine = sottrai(centroSorgente, scala(d, dimFreccia * 0.6));
  prim.push({
    kind: 'linea',
    punti: [partenza.x, partenza.y, fine.x, fine.y],
    colore,
    spessore: sp * 0.75,
    tratteggio: [sp * 4, sp * 3]
  });
  prim.push(freccette(centroSorgente, d, dimFreccia, colore));

  // etichetta nell'angolo dell'inserto
  const badge = etichetta ?? c.etichetta;
  if (badge) {
    const dim = c.stile.dimensioneTesto;
    const larg = Math.max(dim * 1.6, misuraLarghezzaTesto(badge, dim) + dim * 0.6);
    prim.push({
      kind: 'rettangolo',
      rect: { x: c.inserto.x, y: c.inserto.y, width: larg, height: dim * 1.4 },
      colore,
      spessore: 0,
      riempimento: colore
    });
    prim.push({
      kind: 'testo',
      testo: badge,
      posizione: { x: c.inserto.x + larg / 2, y: c.inserto.y + dim * 0.7 },
      rotazioneDeg: 0,
      dimensione: dim,
      colore: coloreContrasto(colore),
      sfondo: null
    });
  }

  return prim;
}

/** Punto sul bordo del rettangolo lungo la retta centro→target */
function puntoSuBordo(r: Rettangolo, target: Punto): Punto {
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const v = sottrai(target, c);
  if (Math.abs(v.x) < 1e-9 && Math.abs(v.y) < 1e-9) return c;
  const tx = v.x !== 0 ? r.width / 2 / Math.abs(v.x) : Infinity;
  const ty = v.y !== 0 ? r.height / 2 / Math.abs(v.y) : Infinity;
  const t = Math.min(tx, ty);
  return somma(c, scala(v, t));
}

export function primitiveAnnotazione(
  a: Annotazione,
  /** risolve la foto-dettaglio di un callout (già caricata) */
  risolviDettaglio?: (c: Callout) => CanvasImageSource | null,
  /** codice/etichetta calcolato della forma (nomenclatura strutturata) */
  etichettaForma?: (a: Annotazione) => string | undefined,
  /** voci della legenda della foto (lettera = descrizione = quantità), in ordine */
  vociLegenda?: () => Array<{ lettera: string; descrizione: string; quantita?: number }>
): Primitiva[] {
  switch (a.tipo) {
    case 'quota':
      return primitiveQuota(a);
    case 'quotaAngolo':
      return primitiveQuotaAngolare(a);
    case 'quotaRaggio':
      return primitiveQuotaRaggio(a);
    case 'quotaRett':
      return primitiveQuotaRettangolo(a, etichettaForma?.(a));
    case 'quotaPoligono':
      return primitiveQuotaPoligono(a, etichettaForma?.(a));
    case 'freccia':
      return primitiveFreccia(a);
    case 'testo':
      return primitiveTesto(a);
    case 'disegno':
      return primitiveDisegno(a);
    case 'callout':
      return primitiveCallout(a, risolviDettaglio?.(a) ?? null, etichettaForma?.(a));
    case 'etichetta':
      return primitiveEtichetta(a);
    case 'legenda':
      // disegnata nell'editor (riquadro con le voci); nel PDF viene esclusa e
      // trascritta come elenco separato
      return primitiveLegenda(a, vociLegenda?.() ?? []);
    case 'forma':
      return primitiveForma(a);
    case 'quotaTecnica':
      return primitiveQuotaTecnica(a);
  }
}
