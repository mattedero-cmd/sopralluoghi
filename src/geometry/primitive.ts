import type {
  Annotazione,
  Callout,
  DisegnoLibero,
  Freccia,
  Punto,
  Quota,
  QuotaAngolare,
  QuotaRaggio,
  Rettangolo,
  TestoFoto
} from '../db/types';
import { COLORE_REALE, COLORE_STIMATA } from '../db/types';
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
 * Primitive di disegno: l'unica fonte di verità per l'aspetto delle
 * annotazioni. Sia l'editor interattivo (Konva) sia il renderer di
 * export (Canvas2D, usato anche dal PDF) disegnano queste primitive,
 * così la foto esportata è identica a ciò che si vede a schermo.
 * Tutte le coordinate sono in pixel dell'immagine originale.
 */
export type Primitiva =
  | { kind: 'linea'; punti: number[]; colore: string; spessore: number; tratteggio?: number[] }
  | { kind: 'poligono'; punti: number[]; colore: string }
  | { kind: 'polilinea'; punti: number[]; colore: string; spessore: number }
  | {
      kind: 'testo';
      testo: string;
      /** punto di ancoraggio (centro del testo) */
      posizione: Punto;
      rotazioneDeg: number;
      dimensione: number;
      colore: string;
      sfondo: string | null;
    }
  | { kind: 'rettangolo'; rect: Rettangolo; colore: string; spessore: number; riempimento?: string }
  | {
      kind: 'cerchio';
      centro: Punto;
      raggio: number;
      colore: string;
      spessore: number;
      tratteggio?: number[];
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
    }
  | {
      kind: 'ritaglio';
      /** regione dell'immagine originale da disegnare */
      sorgente: Rettangolo;
      /** dove disegnarla (riquadro dell'inserto) */
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
  return { kind: 'poligono', punti: [punta.x, punta.y, a.x, a.y, b.x, b.y], colore };
}

export function coloreQuota(q: Pick<Quota, 'stato' | 'stile'>): string {
  // La distinzione reale/stimata è sempre visibile: colore convenzionale
  return q.stato === 'stimata' ? COLORE_STIMATA : (q.stile.colore || COLORE_REALE);
}

export function etichettaQuota(q: Pick<Quota, 'valore' | 'unita' | 'stato'>): string {
  const base = q.valore === null ? '?' : formattaMisura(q.valore, q.unita);
  return q.stato === 'stimata' ? `≈ ${base}` : base;
}

export function primitiveQuota(q: Quota): Primitiva[] {
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
        spessore: sp * 0.75
      });
    }
  }

  const testo = etichettaQuota(q);
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

  const distTesto = dimTesto * 0.75;
  let posTesto: Punto;
  if (q.posizioneTesto === 'sopra') {
    posTesto = somma(g.centro, scala(sopraVett, distTesto));
  } else if (q.posizioneTesto === 'sotto') {
    posTesto = sottrai(g.centro, scala(sopraVett, distTesto));
  } else {
    posTesto = g.centro;
  }

  // Linea di quota: intera oppure interrotta al centro (testo "al centro")
  const larghezzaTesto = misuraLarghezzaTesto(testo, dimTesto);
  const frecceFuori = g.lunghezzaPx < dimFreccia * 3;
  if (q.posizioneTesto === 'centro' && g.lunghezzaPx > larghezzaTesto + dimFreccia * 2) {
    const mezzo = larghezzaTesto / 2 + dimTesto * 0.3;
    const v1 = somma(g.centro, scala(normalizza(sottrai(g.q1, g.centro)), mezzo));
    const v2 = somma(g.centro, scala(normalizza(sottrai(g.q2, g.centro)), mezzo));
    prim.push(
      { kind: 'linea', punti: [g.q1.x, g.q1.y, v1.x, v1.y], colore, spessore: sp },
      { kind: 'linea', punti: [v2.x, v2.y, g.q2.x, g.q2.y], colore, spessore: sp }
    );
  } else {
    prim.push({ kind: 'linea', punti: [g.q1.x, g.q1.y, g.q2.x, g.q2.y], colore, spessore: sp });
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
    sfondo: q.posizioneTesto === 'centro' ? null : 'rgba(255,255,255,0.72)'
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
    { kind: 'linea', punti: [q.vertice.x, q.vertice.y, q.a.x, q.a.y], colore, spessore: sp * 0.75 },
    { kind: 'linea', punti: [q.vertice.x, q.vertice.y, q.b.x, q.b.y], colore, spessore: sp * 0.75 }
  );

  prim.push({
    kind: 'arco',
    centro: q.vertice,
    raggio,
    inizio: a1,
    fine: a1 + delta,
    antiorario: delta < 0,
    colore,
    spessore: sp
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
    sfondo: 'rgba(255,255,255,0.72)'
  });

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
    tratteggio: [sp * 4, sp * 3]
  });

  const inizio = q.modo === 'diametro' ? sottrai(q.centro, scala(d, r)) : q.centro;
  prim.push({
    kind: 'linea',
    punti: [inizio.x, inizio.y, q.bordo.x, q.bordo.y],
    colore,
    spessore: sp
  });
  prim.push(freccette(q.bordo, d, dimFreccia, colore));
  if (q.modo === 'diametro') {
    prim.push(freccette(inizio, scala(d, -1), dimFreccia, colore));
  } else {
    // croce sul centro
    const c = sp * 3;
    prim.push(
      { kind: 'linea', punti: [q.centro.x - c, q.centro.y, q.centro.x + c, q.centro.y], colore, spessore: sp * 0.75 },
      { kind: 'linea', punti: [q.centro.x, q.centro.y - c, q.centro.x, q.centro.y + c], colore, spessore: sp * 0.75 }
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
    sfondo: 'rgba(255,255,255,0.72)'
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
    { kind: 'linea', punti: [f.p1.x, f.p1.y, fine.x, fine.y], colore, spessore: f.stile.spessore },
    freccette(f.p2, d, dimFreccia, colore)
  ];
}

export function primitiveTesto(t: TestoFoto): Primitiva[] {
  return [
    {
      kind: 'testo',
      testo: t.testo || ' ',
      posizione: t.posizione,
      rotazioneDeg: 0,
      dimensione: t.stile.dimensioneTesto,
      colore: t.stile.colore,
      sfondo: 'rgba(255,255,255,0.72)'
    }
  ];
}

export function primitiveDisegno(d: DisegnoLibero): Primitiva[] {
  if (d.punti.length < 4) return [];
  return [{ kind: 'polilinea', punti: d.punti, colore: d.stile.colore, spessore: d.stile.spessore }];
}

export function primitiveCallout(c: Callout): Primitiva[] {
  const colore = c.stile.colore;
  const sp = c.stile.spessore;
  const prim: Primitiva[] = [];

  // contorno della regione sorgente
  prim.push({ kind: 'rettangolo', rect: c.sorgente, colore, spessore: sp * 0.75 });

  // inserto: ritaglio ingrandito + cornice
  prim.push({ kind: 'ritaglio', sorgente: c.sorgente, destinazione: c.inserto });
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
  if (c.etichetta) {
    const dim = c.stile.dimensioneTesto;
    prim.push({
      kind: 'rettangolo',
      rect: { x: c.inserto.x, y: c.inserto.y, width: dim * 1.6, height: dim * 1.4 },
      colore,
      spessore: 0,
      riempimento: colore
    });
    prim.push({
      kind: 'testo',
      testo: c.etichetta,
      posizione: { x: c.inserto.x + dim * 0.8, y: c.inserto.y + dim * 0.7 },
      rotazioneDeg: 0,
      dimensione: dim,
      colore: '#ffffff',
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

export function primitiveAnnotazione(a: Annotazione): Primitiva[] {
  switch (a.tipo) {
    case 'quota':
      return primitiveQuota(a);
    case 'quotaAngolo':
      return primitiveQuotaAngolare(a);
    case 'quotaRaggio':
      return primitiveQuotaRaggio(a);
    case 'freccia':
      return primitiveFreccia(a);
    case 'testo':
      return primitiveTesto(a);
    case 'disegno':
      return primitiveDisegno(a);
    case 'callout':
      return primitiveCallout(a);
  }
}
