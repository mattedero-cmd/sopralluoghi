import { describe, expect, it } from 'vitest';
import {
  PRESET_INIZIALE,
  conPresetApplicato,
  fasciaDelPreset,
  predefinitiTeli,
  riassuntoPreset
} from '../preset';
import type { Annotazione, PresetProgetto, QuotaPoligono, Unita } from '../../db/types';

/**
 * IL PRESET DÀ I VALORI QUANDO LA COSA NASCE, E POI LA LASCIA LIBERA.
 *
 * È la regola che tiene insieme tutto: una forma appena disegnata prende
 * l'abbondanza del lavoro, ma se poi qualcuno la cambia a mano quella resta
 * sua, e cambiare il preset a lavoro avviato non riscrive niente di quello
 * che c'è già.
 */

const stile = { colore: '#fff', spessore: 2, dimensioneTesto: 20 };

const forma = (unita: Unita, abbPerimetro?: number): QuotaPoligono =>
  ({
    id: 'p1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 1,
    punti: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ],
    segmenti: [],
    ...(abbPerimetro === undefined ? {} : { abbPerimetro }),
    unita,
    stato: 'reale',
    stile
  }) as unknown as QuotaPoligono;

const PRESET: PresetProgetto = {
  abbPerimetroMm: 20,
  supporto: {
    modo: 'bobina',
    lastra: { larghezza: 2500, altezza: 1250 },
    bobina: { larghezza: 1370, metri: 50 },
    venatura: 'nessuna',
    lama: 0,
    margine: 10
  },
  teli: { sormontoMm: 10, verso: 'centro', asse: 'verticale', modo: 'fascia' }
};

describe('l’abbondanza alla forma che nasce', () => {
  it('venti millimetri diventano due centimetri su una forma in cm', () => {
    const a = conPresetApplicato(forma('cm'), PRESET) as QuotaPoligono;
    expect(a.abbPerimetro).toBe(2);
  });

  it('e venti millimetri su una forma in mm, e due centesimi su una in metri', () => {
    expect((conPresetApplicato(forma('mm'), PRESET) as QuotaPoligono).abbPerimetro).toBe(20);
    expect((conPresetApplicato(forma('m'), PRESET) as QuotaPoligono).abbPerimetro).toBe(0.02);
  });

  it('una forma che ha già la sua non viene toccata, nemmeno a zero', () => {
    expect((conPresetApplicato(forma('cm', 5), PRESET) as QuotaPoligono).abbPerimetro).toBe(5);
    expect((conPresetApplicato(forma('cm', 0), PRESET) as QuotaPoligono).abbPerimetro).toBe(0);
  });

  it('senza preset, o con l’abbondanza a zero, non si inventa niente', () => {
    expect((conPresetApplicato(forma('cm'), undefined) as QuotaPoligono).abbPerimetro).toBeUndefined();
    expect(
      (conPresetApplicato(forma('cm'), { ...PRESET, abbPerimetroMm: 0 }) as QuotaPoligono)
        .abbPerimetro
    ).toBeUndefined();
  });

  it('su quello che non è una forma non si scrive', () => {
    const quota = {
      id: 'q',
      fotoId: 'f',
      tipo: 'quota',
      sottotipo: 'orizzontale',
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      offset: 0,
      valore: 100,
      unita: 'cm',
      posizioneTesto: 'sopra',
      zIndex: 1,
      stato: 'reale',
      stile
    } as unknown as Annotazione;
    expect(conPresetApplicato(quota, PRESET)).toBe(quota);
  });
});

describe('la fascia del supporto', () => {
  it('è il rotolo meno i due margini, nell’unità della forma', () => {
    // bobina 1370, margine 10 per parte → 1350 mm → 135 cm
    expect(fasciaDelPreset(PRESET, 'cm').massimo).toBe(135);
    expect(fasciaDelPreset(PRESET, 'mm').massimo).toBe(1350);
    expect(fasciaDelPreset(PRESET, 'm').massimo).toBe(1.35);
  });

  it('di una lastra comanda il lato più lungo', () => {
    const lastre: PresetProgetto = {
      ...PRESET,
      supporto: { ...PRESET.supporto!, modo: 'lastre' }
    };
    expect(fasciaDelPreset(lastre, 'mm').massimo).toBe(2480);
    // il separatore delle migliaia lo mette la lingua del dispositivo: qui
    // si guarda quello che il testo deve DIRE, non come lo scrive
    expect(fasciaDelPreset(lastre, 'mm').fonteMassimo).toMatch(/^Lastra 2[.,]?500 mm del preset/);
  });

  it('senza supporto non si dice niente, e chi divide fa come prima', () => {
    expect(fasciaDelPreset(undefined, 'cm')).toEqual({});
    expect(fasciaDelPreset({ abbPerimetroMm: 20 }, 'cm')).toEqual({});
  });

  it('un margine che si mangia il rotolo non dà una fascia negativa', () => {
    const assurdo: PresetProgetto = {
      supporto: { ...PRESET.supporto!, bobina: { larghezza: 15, metri: 50 } }
    };
    expect(fasciaDelPreset(assurdo, 'mm')).toEqual({});
  });
});

describe('da dove parte una divisione nuova', () => {
  it('il sormonto segue l’unità della forma', () => {
    expect(predefinitiTeli(PRESET, 'mm')?.sormonto).toBe(10);
    expect(predefinitiTeli(PRESET, 'cm')?.sormonto).toBe(1);
    expect(predefinitiTeli(PRESET, 'm')?.sormonto).toBe(0.01);
  });

  it('verso, asse e modo passano com’erano', () => {
    const p = predefinitiTeli({ teli: { sormontoMm: 5, verso: 'avanti', asse: 'orizzontale', modo: 'uguali' } }, 'cm');
    expect(p).toEqual({ sormonto: 0.5, verso: 'avanti', asse: 'orizzontale', modo: 'uguali' });
  });

  it('senza preset dei teli non si impone niente', () => {
    expect(predefinitiTeli(undefined, 'cm')).toBeUndefined();
    expect(predefinitiTeli({ abbPerimetroMm: 20 }, 'cm')).toBeUndefined();
  });
});

describe('la riga che riassume', () => {
  it('dice le tre cose, in italiano', () => {
    expect(riassuntoPreset(PRESET)).toMatch(
      /^2 cm attorno · bobina 1[.,]?370 · teli verticali, sormonto 10 mm$/
    );
  });

  it('di un preset vuoto non dice niente, e il tasto lo sa', () => {
    expect(riassuntoPreset(undefined)).toBeNull();
    expect(riassuntoPreset({})).toBeNull();
  });

  it('il preset di partenza è una bobina da 137, come in laboratorio', () => {
    expect(PRESET_INIZIALE.supporto.bobina.larghezza).toBe(1370);
    expect(PRESET_INIZIALE.teli.sormontoMm).toBe(10);
  });
});
