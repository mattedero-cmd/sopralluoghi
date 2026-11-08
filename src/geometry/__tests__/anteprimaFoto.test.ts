import { describe, expect, it } from 'vitest';
import { segniDellAnteprima } from '../anteprima';
import { COLORE_PANNELLO } from '../../db/types';
import type { Annotazione, Foto, Quota, QuotaPoligono, TestoFoto } from '../../db/types';

/**
 * IL FRANCOBOLLO DEVE DIRE SE LA FOTO È GIÀ STATA MISURATA.
 *
 * Trenta scatti di camere d'albergo si somigliano tutti: per sapere quale era
 * già quotata — o quale parete divisa in teli — bisognava aprirli uno per
 * uno. Sull'anteprima vanno quindi gli stessi disegni dell'editor, ma solo le
 * LINEE: a centocinquanta pixel un numero è una macchia, e una punta di
 * freccia è sporco.
 */

const GIALLO = '#ffcc00';
const FOTO = {
  scala: { px: 1, reale: 1, unita: 'cm' as const },
  piano: null,
  piani: undefined,
  mostraAbbondanze: false
} satisfies Pick<Foto, 'scala' | 'piano' | 'piani' | 'mostraAbbondanze'>;

const stile = { colore: GIALLO, spessore: 4, dimensioneTesto: 34 };

const quota = (valore: number | null): Quota =>
  ({
    id: 'q1',
    fotoId: 'f',
    tipo: 'quota',
    sottotipo: 'orizzontale',
    p1: { x: 100, y: 700 },
    p2: { x: 900, y: 700 },
    offset: 0,
    valore,
    unita: 'cm',
    posizioneTesto: 'sopra',
    zIndex: 1,
    stato: 'reale',
    stile
  }) as unknown as Quota;

const parete = (pannelli?: QuotaPoligono['pannelli']): QuotaPoligono =>
  ({
    id: 'p1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 1,
    punti: [
      { x: 100, y: 100 },
      { x: 900, y: 100 },
      { x: 900, y: 700 },
      { x: 100, y: 700 }
    ],
    segmenti: [
      { da: 0, a: 1, valore: 400, offset: 0 },
      { da: 1, a: 2, valore: 260, offset: 0 },
      { da: 2, a: 3, valore: 400, offset: 0 },
      { da: 3, a: 0, valore: 260, offset: 0 }
    ],
    ...(pannelli ? { pannelli } : {}),
    unita: 'cm',
    stato: 'reale',
    stile
  }) as unknown as QuotaPoligono;

describe('i segni dell’anteprima', () => {
  it('una foto senza niente resta un francobollo pulito', () => {
    expect(segniDellAnteprima(FOTO, [])).toEqual([]);
  });

  it('una quota si vede, col suo colore', () => {
    const s = segniDellAnteprima(FOTO, [quota(340)]);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.colore === GIALLO)).toBe(true);
    expect(s.every((x) => x.tipo === 'spezzata')).toBe(true);
  });

  it('il numero scritto NON entra: a quella misura è una macchia', () => {
    // la stessa quota con e senza valore disegna le stesse linee: la
    // differenza fra le due è solo il testo, che qui non arriva
    const con = segniDellAnteprima(FOTO, [quota(340)]);
    const senza = segniDellAnteprima(FOTO, [quota(null)]);
    expect(con.length).toBe(senza.length);
  });

  it('un testo sulla foto non lascia segni', () => {
    const t = {
      id: 't1',
      fotoId: 'f',
      tipo: 'testo',
      testo: 'Attenzione al termosifone',
      posizione: { x: 300, y: 300 },
      zIndex: 1,
      stile
    } as unknown as TestoFoto;
    expect(segniDellAnteprima(FOTO, [t as Annotazione])).toEqual([]);
  });

  it('la parete divisa in teli porta le giunzioni verdi', () => {
    const nuda = segniDellAnteprima(FOTO, [parete()]);
    const divisa = segniDellAnteprima(FOTO, [
      parete({ asse: 'verticale', sormonto: 2, verso: 'centro', giunti: [133, 266] })
    ]);
    expect(nuda.some((s) => s.colore === COLORE_PANNELLO)).toBe(false);
    expect(divisa.some((s) => s.colore === COLORE_PANNELLO)).toBe(true);
    expect(divisa.length).toBeGreaterThan(nuda.length);
  });

  it('le coordinate sono quelle dell’immagine, non della miniatura', () => {
    // chi disegna ci mette sopra il suo riquadro e scala da sé: se i numeri
    // fossero già scalati, l'anteprima non combacerebbe con la foto
    const s = segniDellAnteprima(FOTO, [parete()]);
    const xs = s.flatMap((x) => (x.tipo === 'spezzata' ? x.punti.filter((_, i) => i % 2 === 0) : [x.cx]));
    expect(Math.max(...xs)).toBeGreaterThan(500);
  });

  it('il bollino del codice non lascia una scatola vuota', () => {
    // la forma col suo codice disegna un rettangolo PIENO dietro la scritta:
    // senza la scritta resterebbe una scatola che non vuol dire niente
    const con = segniDellAnteprima(FOTO, [{ ...parete(), etichetta: 'A1' } as unknown as Annotazione]);
    const senza = segniDellAnteprima(FOTO, [parete()]);
    expect(con.length).toBe(senza.length);
  });

  it('un oggetto disegnato in una pianta invece si vede', () => {
    // un rettangolo col solo contorno è una cosa disegnata, non uno sfondo
    const pianta = {
      ...parete(),
      oggetti: [{ id: 'o1', tipo: 'rettangolo', x: 200, y: 600, larghezza: 300, altezza: 200 }]
    } as unknown as QuotaPoligono;
    const s = segniDellAnteprima(FOTO, [pianta]);
    expect(s.length).toBeGreaterThan(segniDellAnteprima(FOTO, [parete()]).length);
  });

  it('una forma che non si sa disegnare non fa sparire le altre', () => {
    // un poligono con un solo punto: la geometria non regge
    const rotta = {
      id: 'x',
      fotoId: 'f',
      tipo: 'quotaPoligono',
      zIndex: 1,
      punti: [{ x: 10, y: 10 }],
      segmenti: [],
      unita: 'cm',
      stato: 'reale',
      stile
    } as unknown as QuotaPoligono;
    const s = segniDellAnteprima(FOTO, [rotta, quota(340)]);
    expect(s.length).toBeGreaterThan(0);
  });
});
