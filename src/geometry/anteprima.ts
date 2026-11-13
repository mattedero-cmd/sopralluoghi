/**
 * I SEGNI DELL'ANTEPRIMA: cosa si vede di un sopralluogo in un francobollo.
 *
 * Nella griglia del progetto le foto erano nude. Trenta scatti di camere
 * d'albergo si somigliano tutti, e per sapere quale era già stata misurata —
 * o quale parete era stata divisa in teli — bisognava aprirle una per una.
 *
 * Qui si prendono gli stessi disegni che l'editor mette sulla foto e si
 * tengono solo le LINEE: le quote, i contorni delle forme, le giunzioni
 * verdi dei teli, il tratteggio delle abbondanze. Il testo si butta — a
 * centocinquanta pixel un numero è una macchia — e con lui le frecce piene e
 * gli inserti dei richiami, che a quella misura sono sporco.
 *
 * Quello che resta non si legge: si RICONOSCE. Giallo sparso vuol dire «qui
 * ho misurato», due righe verdi parallele «questa l'ho divisa in teli», un
 * francobollo pulito «questa non l'ho ancora toccata». Ed è tutto quello che
 * serve per scegliere quale aprire.
 */

import type { Annotazione, Foto } from '../db/types';
import { abbondanzeAVista } from '../db/types';
import { primitiveAnnotazione, type Primitiva } from './primitive';

/** un segno dell'anteprima: una spezzata, oppure un cerchio */
export type SegnoAnteprima =
  | { tipo: 'spezzata'; punti: number[]; colore: string; chiusa?: boolean }
  | { tipo: 'cerchio'; cx: number; cy: number; r: number; colore: string };

/** quanti lati per disegnare un arco: pochi, tanto è grande come un'unghia */
const LATI_ARCO = 10;

/**
 * I segni da disegnare sopra la miniatura, nelle coordinate dell'immagine
 * intera: chi disegna ci mette sopra il suo riquadro e li scala da sé.
 */
export function segniDellAnteprima(
  foto: Pick<Foto, 'scala' | 'piano' | 'piani' | 'mostraAbbondanze'>,
  annotazioni: Annotazione[]
): SegnoAnteprima[] {
  const fuori: SegnoAnteprima[] = [];
  for (const a of annotazioni) {
    let prim: Primitiva[];
    try {
      prim = primitiveAnnotazione(a, undefined, undefined, undefined, {
        foto,
        abbondanze: abbondanzeAVista(foto)
      });
    } catch {
      // una forma che non si sa disegnare non deve far sparire l'anteprima
      // delle altre: si salta e basta
      continue;
    }
    for (const p of prim) fuori.push(...segniDellaPrimitiva(p));
  }
  return fuori;
}

function segniDellaPrimitiva(p: Primitiva): SegnoAnteprima[] {
  switch (p.kind) {
    case 'linea':
    case 'polilinea':
      return p.punti.length >= 4 ? [{ tipo: 'spezzata', punti: p.punti, colore: p.colore }] : [];
    /**
     * UN RETTANGOLO PIENO È LO SFONDO DI QUALCOSA DI SCRITTO — il bollino di
     * un codice, il riquadro di una nota, la legenda — e il testo qui non
     * arriva: resterebbe una scatola vuota. Uno con il solo contorno invece è
     * una cosa DISEGNATA, un oggetto dentro una pianta, e quella va vista.
     * Stessa regola per i cerchi.
     */
    case 'rettangolo': {
      if (p.riempimento) return [];
      const { x, y, width: w, height: h } = p.rect;
      if (!(w > 0 && h > 0)) return [];
      return [
        {
          tipo: 'spezzata',
          punti: [x, y, x + w, y, x + w, y + h, x, y + h],
          colore: p.colore,
          chiusa: true
        }
      ];
    }
    case 'cerchio':
      return p.raggio > 0 && !p.riempimento
        ? [{ tipo: 'cerchio', cx: p.centro.x, cy: p.centro.y, r: p.raggio, colore: p.colore }]
        : [];
    case 'arco': {
      if (!(p.raggio > 0)) return [];
      const punti: number[] = [];
      for (let i = 0; i <= LATI_ARCO; i++) {
        const t = p.inizio + ((p.fine - p.inizio) * i) / LATI_ARCO;
        punti.push(p.centro.x + Math.cos(t) * p.raggio, p.centro.y + Math.sin(t) * p.raggio);
      }
      return [{ tipo: 'spezzata', punti, colore: p.colore }];
    }
    // il testo a questa misura è una macchia; la punta piena di una freccia e
    // gli inserti dei richiami, a un centesimo della loro grandezza, sono
    // sporco. Non si disegnano.
    default:
      return [];
  }
}
