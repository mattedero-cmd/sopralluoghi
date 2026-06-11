import type { Annotazione, Punto, Quota } from '../db/types';
import { distanza } from './punti';

/**
 * Punti di aggancio esistenti su una foto: gli estremi delle quote
 * (e delle frecce). L'auto-aggancio delle catene nasce qui: quando un
 * estremo di una nuova quota viene posato entro la soglia da un estremo
 * esistente, i due punti coincidono esattamente e le quote condividono
 * la linea di riferimento.
 */
export function puntiAggancio(annotazioni: Annotazione[], escludiId?: string): Punto[] {
  const punti: Punto[] = [];
  for (const a of annotazioni) {
    if (a.id === escludiId) continue;
    if (a.tipo === 'quota' || a.tipo === 'freccia') {
      punti.push(a.p1, a.p2);
    }
  }
  return punti;
}

export interface EsitoSnap {
  punto: Punto;
  agganciato: boolean;
}

/** Aggancia `p` al punto esistente più vicino entro `soglia` px immagine */
export function snapPunto(p: Punto, candidati: Punto[], soglia: number): EsitoSnap {
  let migliore: Punto | null = null;
  let dMin = soglia;
  for (const c of candidati) {
    const d = distanza(p, c);
    if (d <= dMin) {
      dMin = d;
      migliore = c;
    }
  }
  return migliore ? { punto: { ...migliore }, agganciato: true } : { punto: p, agganciato: false };
}

/**
 * Quote adiacenti in catena: stessa direzione di misura e un estremo
 * in comune (entro epsilon — dopo lo snap i punti coincidono).
 */
export function sonoInCatena(a: Quota, b: Quota, epsilon = 0.5): boolean {
  if (!stessaDirezione(a, b)) return false;
  return (
    distanza(a.p1, b.p1) <= epsilon ||
    distanza(a.p1, b.p2) <= epsilon ||
    distanza(a.p2, b.p1) <= epsilon ||
    distanza(a.p2, b.p2) <= epsilon
  );
}

function stessaDirezione(a: Quota, b: Quota): boolean {
  if (a.sottotipo !== 'allineata' && a.sottotipo === b.sottotipo) return true;
  // per le allineate confronta l'angolo delle due direzioni
  const angolo = (q: Quota) => {
    if (q.sottotipo === 'orizzontale') return 0;
    if (q.sottotipo === 'verticale') return Math.PI / 2;
    return Math.atan2(q.p2.y - q.p1.y, q.p2.x - q.p1.x);
  };
  const diff = Math.abs(angolo(a) - angolo(b)) % Math.PI;
  const tol = 0.035; // ~2 gradi
  return diff < tol || Math.PI - diff < tol;
}
