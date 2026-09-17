import { describe, expect, it } from 'vitest';
import { abbondanzeZoppe, latiQuadrilatero } from '../formaQuadrilatera';
import { primitiveAbbondanze } from '../primitive';
import type { Annotazione } from '../../db/types';

/**
 * L'ABBONDANZA CHE MANCA E NON SI VEDE.
 *
 * Due finestre sotto falda gemelle, richiamate con lo specchio; su una delle
 * due altezze l'abbondanza non è stata messa. I dati sono giusti — il lato
 * corto esce corto — ma il contorno tratteggiato sulla foto è IDENTICO a
 * quello del pezzo abbondato bene, perché il modello dell'abbondanza è a
 * quattro numeri e su ogni asse comanda il lato che determina l'ingombro.
 *
 * Quindi a monitor sembra che ci sia l'abbondanza su tutti e due i lati, e la
 * dimenticanza si scopre in posa, quando non c'è niente da rifilare.
 *
 * Qui si tiene fermo il fatto — il disegno non la fa vedere, ed è una
 * semplificazione voluta del modello a quattro numeri — e si prova che almeno
 * qualcuno lo dice.
 */

const stile = { colore: '#ffd166', spessore: 4, dimensioneTesto: 18 };
const base = { id: 'a1', fotoId: 'f1', zIndex: 0, stile, unita: 'cm', stato: 'reale' };

/** finestra sotto falda: base 300, altezza sinistra 200 (lunga), destra 120 */
const falda = (abbDestra: number): Annotazione =>
  ({
    ...base,
    tipo: 'quotaPoligono',
    punti: [
      { x: 0, y: 0 },
      { x: 300, y: 80 },
      { x: 300, y: 200 },
      { x: 0, y: 200 }
    ],
    segmenti: [
      { da: 3, a: 0, valore: 200, abbInizio: 10, abbFine: 10 },
      { da: 1, a: 2, valore: 120, abbInizio: abbDestra, abbFine: abbDestra },
      { da: 2, a: 3, valore: 300, abbInizio: 10, abbFine: 10 }
    ]
  }) as unknown as Annotazione;

const contorno = (a: Annotazione) => {
  const l = primitiveAbbondanze(a).find(
    (x): x is Extract<typeof x, { kind: 'polilinea' }> => x.kind === 'polilinea'
  );
  return l ? l.punti.map((v) => Math.round(v * 10) / 10).join(' ') : null;
};

describe('l’abbondanza dimenticata su un lato', () => {
  it('i dati la registrano: il lato corto esce corto', () => {
    expect(latiQuadrilatero(falda(10))).toMatchObject({ sinistro: 220, destro: 140 });
    expect(latiQuadrilatero(falda(0))).toMatchObject({ sinistro: 220, destro: 120 });
  });

  it('ma il contorno sulla foto è lo stesso: la dimenticanza non si vede', () => {
    // NON è un difetto da correggere qui: è il limite del modello a quattro
    // numeri, e cambiarlo vorrebbe dire rifare il disegno dell'abbondanza.
    // Sta scritto perché chi legge sappia che quel disegno non è una prova.
    expect(contorno(falda(0))).toBe(contorno(falda(10)));
  });

  it('e allora lo dice il controllo, con il lato e i millimetri', () => {
    expect(abbondanzeZoppe(falda(10))).toEqual([]);
    const zoppe = abbondanzeZoppe(falda(0));
    expect(zoppe).toHaveLength(1);
    expect(zoppe[0]).toMatchObject({ lato: 'sinistro', abbondato: 20, opposto: 0 });
  });

  it('un lato NON QUOTATO non ha dimenticato niente', () => {
    // la falda obliqua non è quotata: non è una dimenticanza, è una misura che
    // non si prende. Un avviso lì sarebbe rumore, e il rumore si impara a
    // ignorare — compreso quando ha ragione.
    const senzaAlto = falda(10);
    expect(abbondanzeZoppe(senzaAlto)).toEqual([]);
  });

  it('un rettangolo abbondato su tutti i lati non dice niente', () => {
    const rett = {
      ...base,
      tipo: 'quotaPoligono',
      punti: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 200 },
        { x: 0, y: 200 }
      ],
      segmenti: [
        { da: 0, a: 1, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 1, a: 2, valore: 200, abbInizio: 20, abbFine: 20 },
        { da: 2, a: 3, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 3, a: 0, valore: 200, abbInizio: 20, abbFine: 20 }
      ]
    } as unknown as Annotazione;
    expect(abbondanzeZoppe(rett)).toEqual([]);
  });

  it('un rettangolo con l’abbondanza solo in alto lo dice', () => {
    const rett = {
      ...base,
      tipo: 'quotaPoligono',
      punti: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 200 },
        { x: 0, y: 200 }
      ],
      segmenti: [
        { da: 0, a: 1, valore: 300, abbInizio: 10, abbFine: 10 },
        { da: 1, a: 2, valore: 200, abbInizio: 20, abbFine: 20 },
        { da: 2, a: 3, valore: 300 },
        { da: 3, a: 0, valore: 200, abbInizio: 20, abbFine: 20 }
      ]
    } as unknown as Annotazione;
    expect(abbondanzeZoppe(rett)).toEqual([{ lato: 'alto', abbondato: 20, opposto: 0 }]);
  });
});
