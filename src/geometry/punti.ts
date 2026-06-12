import type { Punto, Quota, SottotipoQuota } from '../db/types';

export const somma = (a: Punto, b: Punto): Punto => ({ x: a.x + b.x, y: a.y + b.y });
export const sottrai = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y });
export const scala = (p: Punto, k: number): Punto => ({ x: p.x * k, y: p.y * k });
export const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;
export const lunghezza = (p: Punto): number => Math.hypot(p.x, p.y);
export const distanza = (a: Punto, b: Punto): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalizza(p: Punto): Punto {
  const l = lunghezza(p);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: p.x / l, y: p.y / l };
}

/** Normale sinistra (perpendicolare) di un versore */
export const normale = (d: Punto): Punto => ({ x: -d.y, y: d.x });

/** Versore della direzione di misura di una quota */
export function direzioneQuota(sottotipo: SottotipoQuota, p1: Punto, p2: Punto): Punto {
  switch (sottotipo) {
    case 'orizzontale':
      return { x: 1, y: 0 };
    case 'verticale':
      return { x: 0, y: 1 };
    case 'allineata':
      return normalizza(sottrai(p2, p1));
  }
}

/** Lunghezza misurata in px immagine (proiezione sulla direzione di misura) */
export function lunghezzaPxQuota(q: Pick<Quota, 'sottotipo' | 'p1' | 'p2'>): number {
  const d = direzioneQuota(q.sottotipo, q.p1, q.p2);
  return Math.abs(dot(sottrai(q.p2, q.p1), d));
}

/** Vincolo "orto": forza il secondo punto sull'asse orizzontale o verticale più vicino */
export function vincolaOrto(p1: Punto, p2: Punto): Punto {
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  return dx >= dy ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y };
}

/** Snap angolare: vincola la direzione p1→p2 al multiplo di `passoGradi` più vicino */
export function vincolaAngolo(p1: Punto, p2: Punto, passoGradi = 15): Punto {
  const d = sottrai(p2, p1);
  const r = Math.hypot(d.x, d.y);
  if (r < 1e-9) return p2;
  const passo = (passoGradi * Math.PI) / 180;
  const angolo = Math.round(Math.atan2(d.y, d.x) / passo) * passo;
  return { x: p1.x + r * Math.cos(angolo), y: p1.y + r * Math.sin(angolo) };
}
