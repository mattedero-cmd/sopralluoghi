import { describe, it, expect } from 'vitest';
import {
  complementare,
  disegnaMirino,
  css,
  daHsl,
  liscia,
  luminanza,
  medieBanda,
  tratti,
  versoHsl
} from '../mirino';
import { MIRINO_CLASSICO, MIRINO_DEFAULT } from '../../db/types';

/** contrasto WCAG fra due colori 0..255 */
function contrasto(a: [number, number, number], b: [number, number, number]): number {
  const rel = ([r, g, b2]: [number, number, number]) => {
    const c = [r, g, b2].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const l1 = rel(a);
  const l2 = rel(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('HSL', () => {
  it('va e torna senza perdere il colore', () => {
    for (const c of [
      [255, 0, 0],
      [0, 128, 64],
      [17, 34, 51],
      [200, 200, 200],
      [0, 0, 0],
      [255, 255, 255]
    ] as Array<[number, number, number]>) {
      const [h, s, l] = versoHsl(...c);
      expect(daHsl(h, s, l)).toEqual(c);
    }
  });
});

describe('complementare', () => {
  it('ruota la tinta di 180°', () => {
    // rosso saturo → tinta ciano
    const [h] = versoHsl(...complementare(220, 20, 20));
    expect(Math.abs(h - 180)).toBeLessThan(25);
  });

  it('stacca sempre dal fondo, anche sul grigio medio', () => {
    // il complementare "puro" del grigio medio sarebbe il grigio medio:
    // il caso che farebbe sparire il filetto proprio dove serve
    const fondo: [number, number, number] = [128, 128, 128];
    expect(contrasto(complementare(...fondo), fondo)).toBeGreaterThan(3);
  });

  it('mantiene un contrasto forte su tutta la gamma', () => {
    let peggiore = Infinity;
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const fondo: [number, number, number] = [r, g, b];
          peggiore = Math.min(peggiore, contrasto(complementare(...fondo), fondo));
        }
      }
    }
    // 3:1 è la soglia WCAG per la grafica non testuale
    expect(peggiore).toBeGreaterThan(3.5);
  });

  it('va chiaro sul buio e scuro sul chiaro', () => {
    expect(luminanza(...complementare(10, 10, 10))).toBeGreaterThan(0.6);
    expect(luminanza(...complementare(245, 245, 245))).toBeLessThan(0.3);
  });

  it('resta un colore, non ripiega su bianco o nero puro', () => {
    const [, s] = versoHsl(...complementare(128, 128, 128));
    expect(s).toBeGreaterThan(0.4);
  });

  it('non produce canali fuori scala', () => {
    for (const c of [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 255],
      [1, 254, 3]
    ] as Array<[number, number, number]>) {
      for (const v of complementare(...c)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('css scrive un colore valido', () => {
    expect(css([1, 2, 3])).toBe('rgb(1, 2, 3)');
  });
});

describe('medieBanda', () => {
  /** banda 4×2 RGBA: colonne rosse crescenti */
  const banda = () => {
    const d = new Uint8ClampedArray(4 * 2 * 4);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        const k = (y * 4 + x) * 4;
        d[k] = x * 60;
        d[k + 1] = y * 100;
        d[k + 2] = 0;
        d[k + 3] = 255;
      }
    }
    return d;
  };

  it('media per colonna (braccio orizzontale)', () => {
    const m = medieBanda(banda(), 4, 2, true);
    expect(m).toHaveLength(4);
    expect(m[0]).toEqual([0, 50, 0]);
    expect(m[3]).toEqual([180, 50, 0]);
  });

  it('media per riga (braccio verticale)', () => {
    const m = medieBanda(banda(), 4, 2, false);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual([90, 0, 0]);
    expect(m[1]).toEqual([90, 100, 0]);
  });
});

describe('liscia', () => {
  it('smorza il pixel isolato senza spostare le zone piatte', () => {
    const c: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 0, 0],
      [255, 255, 255],
      [0, 0, 0],
      [0, 0, 0]
    ];
    const l = liscia(c, 2);
    expect(l[2][0]).toBeLessThan(100);
    expect(l[2][0]).toBeGreaterThan(0);
  });

  it('con raggio 0 non tocca nulla', () => {
    const c: Array<[number, number, number]> = [[1, 2, 3]];
    expect(liscia(c, 0)).toBe(c);
  });
});

describe('tratti del braccio', () => {
  it('senza vuoto il filetto è continuo da bordo a bordo', () => {
    expect(tratti(100, 0, 2)).toEqual([[2, 98]]);
  });

  it('col vuoto si spezza in due, simmetrici sul centro', () => {
    expect(tratti(100, 10, 2)).toEqual([
      [2, 40],
      [60, 98]
    ]);
  });

  it('un vuoto più grande della lente non lascia tratti', () => {
    expect(tratti(100, 90, 2)).toEqual([]);
  });
});

describe('preimpostazioni', () => {
  it('il predefinito è la croce continua a colore complementare', () => {
    expect(MIRINO_DEFAULT.colore).toBe('complementare');
    expect(MIRINO_DEFAULT.vuoto).toBe(0);
    expect(MIRINO_DEFAULT.cerchio).toBe(false);
  });

  it('il classico riproduce il mirino di prima: bianco, alone, cerchietto', () => {
    expect(MIRINO_CLASSICO.colore).toBe('bianco');
    expect(MIRINO_CLASSICO.alone).toBe(true);
    expect(MIRINO_CLASSICO.cerchio).toBe(true);
    expect(MIRINO_CLASSICO.vuoto).toBe(7);
  });
});


/**
 * Contesto 2D finto: registra l'ordine delle chiamate e simula una foto
 * uniforme, così si può verificare COSA legge il mirino e QUANDO.
 */
function ctxFinto(sfondo: [number, number, number]) {
  const eventi: string[] = [];
  const dipinti: Array<{ x: number; y: number; w: number; h: number; colore: string }> = [];
  let stile = '';
  const ctx = {
    get fillStyle() {
      return stile;
    },
    set fillStyle(v: string) {
      stile = v;
    },
    strokeStyle: '',
    lineWidth: 0,
    getImageData(_x: number, _y: number, w: number, h: number) {
      eventi.push('leggi');
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        d[i * 4] = sfondo[0];
        d[i * 4 + 1] = sfondo[1];
        d[i * 4 + 2] = sfondo[2];
        d[i * 4 + 3] = 255;
      }
      return { data: d, width: w, height: h };
    },
    fillRect(x: number, y: number, w: number, h: number) {
      eventi.push('dipingi');
      dipinti.push({ x, y, w, h, colore: stile });
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    stroke() {
      eventi.push('dipingi');
    }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, eventi, dipinti };
}

describe('disegnaMirino', () => {
  it('campiona tutto prima di dipingere: l’incrocio legge la foto, non se stesso', () => {
    const { ctx, eventi } = ctxFinto([255, 255, 255]);
    disegnaMirino(ctx, 150, MIRINO_DEFAULT, 1, false);
    const ultimaLettura = eventi.lastIndexOf('leggi');
    const primaPennellata = eventi.indexOf('dipingi');
    expect(primaPennellata).toBeGreaterThan(ultimaLettura);
  });

  it('su fondo bianco il filetto va scuro, su fondo nero va chiaro', () => {
    const chiaro = ctxFinto([255, 255, 255]);
    disegnaMirino(chiaro.ctx, 150, MIRINO_DEFAULT, 1, false);
    const scuro = ctxFinto([0, 0, 0]);
    disegnaMirino(scuro.ctx, 150, MIRINO_DEFAULT, 1, false);
    const leggi = (c: string) => c.match(/\d+/g)!.map(Number) as [number, number, number];
    expect(luminanza(...leggi(chiaro.dipinti[0].colore))).toBeLessThan(0.3);
    expect(luminanza(...leggi(scuro.dipinti[0].colore))).toBeGreaterThan(0.6);
  });

  it('la croce continua copre tutta la lente, bracci compresi', () => {
    const { dipinti } = (() => {
      const f = ctxFinto([128, 128, 128]);
      disegnaMirino(f.ctx, 150, MIRINO_DEFAULT, 1, false);
      return f;
    })();
    const orizzontali = dipinti.filter((d) => d.w === 1);
    const verticali = dipinti.filter((d) => d.h === 1);
    expect(orizzontali.length).toBe(146);
    expect(verticali.length).toBe(146);
    // il centro esatto è dipinto da entrambi i bracci
    expect(orizzontali.some((d) => d.x === 75)).toBe(true);
    expect(verticali.some((d) => d.y === 75)).toBe(true);
  });

  it('col colore fisso non legge nemmeno i pixel', () => {
    const { ctx, eventi } = ctxFinto([128, 128, 128]);
    disegnaMirino(ctx, 150, { ...MIRINO_CLASSICO, cerchio: false }, 1, false);
    expect(eventi).not.toContain('leggi');
  });
});
