import { describe, expect, it } from 'vitest';
import type { SegmentoQuota, VincoloPianta } from '../../db/types';
import {
  applicaVincoliOggetti,
  eVincoloOggetti,
  lineaRiferimento,
  puntoRiferimento,
  type OggettoDistanza
} from '../parametrico';

// Stanza 1000×800 px (y verso il basso): lato 0 = alto, lato 2 = basso ("base").
const PUNTI = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 800 },
  { x: 0, y: 800 }
];
const NESSUNA: SegmentoQuota[] = [];

const rett = (extra?: Partial<OggettoDistanza>): OggettoDistanza => ({
  id: 'r1',
  tipo: 'rettangolo',
  x: 400, // basso-sx
  y: 600,
  larghezza: 200,
  altezza: 150,
  ...extra
});
const cerchio = (extra?: Partial<OggettoDistanza>): OggettoDistanza => ({
  id: 'c1',
  tipo: 'cerchio',
  x: 100,
  y: 100,
  raggioPx: 60,
  ...extra
});

const vinc = (
  tipo: VincoloPianta['tipo'],
  r0: VincoloPianta['riferimenti'][0],
  r1: VincoloPianta['riferimenti'][0]
): VincoloPianta => ({ id: `v-${tipo}`, tipo, riferimenti: [r0, r1] });

describe('riferimenti puntuali e di lato (anche di oggetto)', () => {
  it('risolve vertici, centri-lato e centro di un rettangolo', () => {
    const o = rett();
    // vertici: 0 basso-sx (400,600), 2 alto-dx (600,450)
    expect(puntoRiferimento(PUNTI, [o], { entita: 'vertice', oggettoId: 'r1', indice: 0 })).toEqual({
      x: 400,
      y: 600
    });
    expect(puntoRiferimento(PUNTI, [o], { entita: 'vertice', oggettoId: 'r1', indice: 2 })).toEqual({
      x: 600,
      y: 450
    });
    // centro del lato ALTO (lato 2: alto-dx → alto-sx)
    expect(
      puntoRiferimento(PUNTI, [o], { entita: 'centroLato', oggettoId: 'r1', indice: 2 })
    ).toEqual({ x: 500, y: 450 });
    expect(puntoRiferimento(PUNTI, [o], { entita: 'centroOggetto', oggettoId: 'r1' })).toEqual({
      x: 500,
      y: 525
    });
  });

  it('risolve punti del perimetro (vertice e centro-lato)', () => {
    expect(puntoRiferimento(PUNTI, [], { entita: 'vertice', indice: 1 })).toEqual({ x: 1000, y: 0 });
    expect(puntoRiferimento(PUNTI, [], { entita: 'centroLato', indice: 2 })).toEqual({
      x: 500,
      y: 800
    });
  });

  it('risolve il lato di un rettangolo come segmento', () => {
    const L = lineaRiferimento(PUNTI, [rett()], { entita: 'lato', oggettoId: 'r1', indice: 0 });
    expect(L).toEqual({ a: { x: 400, y: 600 }, b: { x: 600, y: 600 } });
  });
});

describe('vincoli tra oggetti (livello oggetti)', () => {
  it('classifica i vincoli del livello oggetti', () => {
    expect(
      eVincoloOggetti(
        vinc('coincidente', { entita: 'centroOggetto', oggettoId: 'c1' }, { entita: 'vertice', indice: 0 })
      )
    ).toBe(true);
    // solo perimetro → livello LM, non oggetti
    expect(
      eVincoloOggetti(vinc('coincidente', { entita: 'vertice', indice: 0 }, { entita: 'vertice', indice: 1 }))
    ).toBe(false);
  });

  it('COLLINEARE: il lato basso del rettangolo diventa complanare alla base', () => {
    const v = vinc(
      'collineare',
      { entita: 'lato', oggettoId: 'r1', indice: 0 },
      { entita: 'lato', indice: 2 } // base della stanza (y=800)
    );
    const r = applicaVincoliOggetti(PUNTI, NESSUNA, [rett()], [v]);
    expect(r).not.toBeNull();
    expect(r!.falliti).toBe(0);
    const o = r!.oggetti[0];
    expect(o.y).toBeCloseTo(800); // lato basso sul pavimento
    expect(o.x).toBeCloseTo(400); // nessuno spostamento laterale
  });

  it('SCENARIO COMPLETO: rettangolo sulla base + cerchio centrato sul lato alto', () => {
    const vBase = vinc(
      'collineare',
      { entita: 'lato', oggettoId: 'r1', indice: 0 },
      { entita: 'lato', indice: 2 }
    );
    // centro del cerchio allineato ORIZZ. e VERT. al centro del lato alto del rettangolo
    const vOrizz = vinc(
      'orizzontale',
      { entita: 'centroOggetto', oggettoId: 'c1' },
      { entita: 'centroLato', oggettoId: 'r1', indice: 2 }
    );
    const vVert = vinc(
      'verticale',
      { entita: 'centroOggetto', oggettoId: 'c1' },
      { entita: 'centroLato', oggettoId: 'r1', indice: 2 }
    );
    const r = applicaVincoliOggetti(PUNTI, NESSUNA, [rett(), cerchio()], [vBase, vOrizz, vVert]);
    expect(r!.falliti).toBe(0);
    const or = r!.oggetti.find((o) => o.id === 'r1')!;
    const oc = r!.oggetti.find((o) => o.id === 'c1')!;
    expect(or.y).toBeCloseTo(800);
    // centro cerchio = centro lato alto del rettangolo (500, 800-150=650)
    expect(oc.x).toBeCloseTo(500);
    expect(oc.y).toBeCloseTo(650);
  });

  it('COINCIDENTE tra centro del cerchio e vertice del perimetro', () => {
    const v = vinc(
      'coincidente',
      { entita: 'centroOggetto', oggettoId: 'c1' },
      { entita: 'vertice', indice: 2 }
    );
    const r = applicaVincoliOggetti(PUNTI, NESSUNA, [cerchio()], [v]);
    expect(r!.oggetti[0]).toMatchObject({ x: 1000, y: 800 });
  });

  it('oggetto ancorato: si muove l’ALTRO oggetto', () => {
    const v = vinc(
      'coincidente',
      { entita: 'centroOggetto', oggettoId: 'c1' },
      { entita: 'centroOggetto', oggettoId: 'r1' }
    );
    const r = applicaVincoliOggetti(
      PUNTI,
      NESSUNA,
      [rett(), cerchio({ centroAncorato: true })],
      [v]
    );
    expect(r!.falliti).toBe(0);
    // il cerchio è fermo: il rettangolo porta il SUO centro sul cerchio
    const or = r!.oggetti.find((o) => o.id === 'r1')!;
    expect(or.x + 100).toBeCloseTo(100); // centro rett = (x+100, y-75)
    expect(or.y - 75).toBeCloseTo(100);
  });

  it('collineare con oggetto ancorato: trasla il lato del perimetro (se libero)', () => {
    const v = vinc(
      'collineare',
      { entita: 'lato', oggettoId: 'r1', indice: 0 },
      { entita: 'lato', indice: 2 }
    );
    const r = applicaVincoliOggetti(
      PUNTI,
      NESSUNA,
      [rett({ centroAncorato: true })],
      [v],
      0 // origine sul vertice 0 (non sul lato 2) → lato muovibile
    );
    expect(r!.falliti).toBe(0);
    // il muro sale fino al lato basso del rettangolo (y=600)
    expect(r!.punti[2].y).toBeCloseTo(600);
    expect(r!.punti[3].y).toBeCloseTo(600);
  });

  it('tutto ancorato e muro bloccato → vincolo fallito, niente si muove', () => {
    const v = vinc(
      'collineare',
      { entita: 'lato', oggettoId: 'r1', indice: 0 },
      { entita: 'lato', indice: 2 }
    );
    // origine sul vertice 2 = un estremo del lato 2 → muro NON muovibile
    const r = applicaVincoliOggetti(PUNTI, NESSUNA, [rett({ centroAncorato: true })], [v], 2);
    expect(r!.falliti).toBe(1);
    expect(r!.punti).toEqual(PUNTI);
    expect(r!.oggetti[0].y).toBe(600);
  });

  it('collineare tra lati NON paralleli → fallisce (gli oggetti non ruotano)', () => {
    const v = vinc(
      'collineare',
      { entita: 'lato', oggettoId: 'r1', indice: 0 }, // orizzontale
      { entita: 'lato', indice: 1 } // lato destro, verticale
    );
    const r = applicaVincoliOggetti(PUNTI, NESSUNA, [rett()], [v]);
    expect(r!.falliti).toBe(1);
  });

  it('vincolo di riferimento (misura soltanto) → ignorato', () => {
    const v = {
      ...vinc('coincidente', { entita: 'centroOggetto', oggettoId: 'c1' }, { entita: 'vertice', indice: 0 }),
      riferimento: true
    };
    expect(applicaVincoliOggetti(PUNTI, NESSUNA, [cerchio()], [v])).toBeNull();
  });

  it('CONFLITTO tra due coincidenze sullo stesso oggetto → segnalato fallito', () => {
    // il cerchio non può stare su due vertici opposti: la verifica finale
    // deve accorgersene (non basta "essersi mossi" per dirsi soddisfatti)
    const v1 = vinc(
      'coincidente',
      { entita: 'centroOggetto', oggettoId: 'c1' },
      { entita: 'vertice', indice: 0 }
    );
    const v2 = {
      ...vinc('coincidente', { entita: 'centroOggetto', oggettoId: 'c1' }, { entita: 'vertice', indice: 2 }),
      id: 'v-coincidente-2'
    };
    const r = applicaVincoliOggetti(PUNTI, NESSUNA, [cerchio()], [v1, v2]);
    expect(r!.falliti).toBeGreaterThanOrEqual(1);
    expect(r!.fallitiIds.length).toBe(r!.falliti);
  });

  it('un vincolo che si soddisfa grazie a un altro NON resta segnato fallito', () => {
    // il cerchio ancorato a (0,600); vA lega il vertice 3 al centro del cerchio
    // (immobile finché il muro non si muove); vB (collineare) sposta il muro a
    // y=600 rendendo vera anche vA: la verifica finale deve dare 0 falliti
    const vA = vinc(
      'coincidente',
      { entita: 'vertice', indice: 3 },
      { entita: 'centroOggetto', oggettoId: 'c1' }
    );
    const vB = vinc(
      'collineare',
      { entita: 'lato', oggettoId: 'r1', indice: 0 },
      { entita: 'lato', indice: 2 }
    );
    const r = applicaVincoliOggetti(
      PUNTI,
      NESSUNA,
      [rett({ centroAncorato: true, y: 600 }), cerchio({ centroAncorato: true, x: 0, y: 600 })],
      [vA, vB],
      0
    );
    expect(r!.punti[3].y).toBeCloseTo(600);
    expect(r!.falliti).toBe(0);
  });

  it('le catene LUNGHE convergono (passate scalate col numero di vincoli)', () => {
    // 9 cerchi in catena: ognuno coincidente col precedente, dichiarati in
    // ordine inverso (il caso peggiore: un anello converge per passata)
    const cerchi = Array.from({ length: 10 }, (_, i) =>
      cerchio({ id: `c${i}`, x: 100 + i * 17, y: 100 + i * 13 })
    );
    cerchi[0] = { ...cerchi[0], centroAncorato: true };
    const catena = Array.from({ length: 9 }, (_, i) => ({
      ...vinc(
        'coincidente',
        { entita: 'centroOggetto', oggettoId: `c${i + 1}` },
        { entita: 'centroOggetto', oggettoId: `c${i}` }
      ),
      id: `cat-${i}`
    })).reverse();
    const r = applicaVincoliOggetti(PUNTI, NESSUNA, cerchi, catena);
    expect(r!.falliti).toBe(0);
    for (const o of r!.oggetti) {
      expect(o.x).toBeCloseTo(100);
      expect(o.y).toBeCloseTo(100);
    }
  });

  it('le catene convergono anche in ordine inverso', () => {
    // il cerchio dipende dal rettangolo, dichiarato PRIMA del vincolo base
    const vOrizz = vinc(
      'orizzontale',
      { entita: 'centroOggetto', oggettoId: 'c1' },
      { entita: 'centroLato', oggettoId: 'r1', indice: 2 }
    );
    const vVert = vinc(
      'verticale',
      { entita: 'centroOggetto', oggettoId: 'c1' },
      { entita: 'centroLato', oggettoId: 'r1', indice: 2 }
    );
    const vBase = vinc(
      'collineare',
      { entita: 'lato', oggettoId: 'r1', indice: 0 },
      { entita: 'lato', indice: 2 }
    );
    const r = applicaVincoliOggetti(
      PUNTI,
      NESSUNA,
      [rett(), cerchio()],
      [vOrizz, vVert, vBase]
    );
    expect(r!.falliti).toBe(0);
    const oc = r!.oggetti.find((o) => o.id === 'c1')!;
    expect(oc.x).toBeCloseTo(500);
    expect(oc.y).toBeCloseTo(650);
  });
});
