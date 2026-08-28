import { describe, expect, it } from 'vitest';
import { spigoliDellaFoto } from '../spigolo';
import { pianiAggiornati, pianiDalleForme, riferimentiPiano } from '../pianoDaForme';
import {
  pianiAgganciati,
  pianoConLato,
  pianoConVertice,
  verticiGemelli
} from '../pianoModifica';
import { applicaOmografia, omografiaPiano } from '../omografia';
import { pianoDi } from '../calibrazione';
import type { Annotazione, PianoProspettiva, Punto } from '../../db/types';

/**
 * UNA FACCIATA A SVOLTE, con le sue finestre quotate.
 *
 * Non tutte le pareti stanno su un muro solo: un capannone con i risvolti, un
 * terrazzo con tre lati, una casa ripresa d'angolo. Qui la scena si costruisce
 * come nella realtà — obiettivo, posa, muri che svoltano uno dopo l'altro — e
 * si verifica tutto il percorso: le forme quotate diventano pareti, le pareti
 * si toccano negli spigoli, e ogni misura ritrova il muro suo.
 */

const LARGHEZZA = 1600;
const ALTEZZA = 1000;
const FUOCO = 1100;

type M3 = number[];
const mul = (A: M3, B: M3): M3 => {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[r * 3 + k] * B[k * 3 + c];
      C[r * 3 + c] = s;
    }
  return C;
};
const mv = (A: M3, v: number[]) => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
];
const K: M3 = [FUOCO, 0, LARGHEZZA / 2, 0, FUOCO, ALTEZZA / 2, 0, 0, 1];
const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];

function muro(R: M3, O: number[], asse: number[]): M3 {
  const KR = mul(K, R);
  const u = mv(KR, asse);
  const v = mv(KR, [0, 1, 0]);
  const o = mv(KR, O);
  return [u[0], v[0], o[0], u[1], v[1], o[1], u[2], v[2], o[2]];
}
const suFoto = (G: M3, a: number, b: number): Punto => {
  const p = mv(G, [a, b, 1]);
  return { x: p[0] / p[2], y: p[1] / p[2] };
};
const nellaFoto = (p: Punto) => p.x >= 0 && p.x <= LARGHEZZA && p.y >= 0 && p.y <= ALTEZZA;

/** una finestra quotata sui quattro lati, con l'errore del dito sugli angoli */
const finestra = (
  G: M3,
  id: string,
  a: number,
  b: number,
  w: number,
  h: number,
  rumore: number
): Annotazione => {
  const sc = (i: number, k: number) =>
    rumore * Math.sin(id.charCodeAt(id.length - 1) * 5.1 + i * 2.9 + k * 1.3);
  const punti = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h]
  ].map(([dx, dy], i) => {
    const p = suFoto(G, a + dx, b + dy);
    return { x: p.x + sc(i, 0), y: p.y + sc(i, 1) };
  });
  return {
    id,
    fotoId: 'f1',
    zIndex: 0,
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 13 },
    tipo: 'quotaPoligono',
    unita: 'mm',
    stato: 'reale',
    punti,
    segmenti: [
      { da: 0, a: 1, valore: w },
      { da: 1, a: 2, valore: h },
      { da: 2, a: 3, valore: w },
      { da: 3, a: 0, valore: h }
    ]
  } as unknown as Annotazione;
};

/**
 * `n` muri che svoltano a fisarmonica, due finestre per muro. I muri pari e
 * quelli dispari sono paralleli fra loro: è il caso peggiore, perché due
 * pareti parallele non fanno spigolo e due non contigue si incrociano in una
 * retta che spigolo non è.
 */
function facciata(n: number, rumore: number) {
  const R = mul(rotX(-0.06), rotY(0.25));
  let O = [-4500, -1300, 9000];
  const muri: M3[] = [];
  const spigoliVeri: Array<[Punto, Punto]> = [];
  const annotazioni: Annotazione[] = [];
  for (let i = 0; i < n; i++) {
    const ang = 0.15 + (i % 2 === 0 ? 0.45 : -0.45);
    const d = [Math.cos(ang), 0, Math.sin(ang)];
    const G = muro(R, O, d);
    muri.push(G);
    if (i > 0) spigoliVeri.push([suFoto(G, 0, 0), suFoto(G, 0, 2600)]);
    annotazioni.push(finestra(G, `m${i}a`, 350, 700, 700, 900, rumore));
    annotazioni.push(finestra(G, `m${i}b`, 1500, 700, 700, 900, rumore));
    O = [O[0] + d[0] * 2600, O[1], O[2] + d[2] * 2600];
  }
  return { muri, annotazioni, spigoliVeri };
}

/** il percorso completo: finestre quotate → pareti → spigoli */
function rileva(n: number, rumore: number) {
  const f = facciata(n, rumore);
  const pareti = pianiDalleForme(riferimentiPiano(f.annotazioni));
  const piani = pareti.map((p) => p.piano);
  const spigoli = spigoliDellaFoto(piani, LARGHEZZA, ALTEZZA);
  /** l'indice del piano che raccoglie le finestre del muro `i` */
  const pianoDelMuro = (i: number) =>
    pareti.findIndex((q) => q.esito.riferimenti.some((r) => r.id.startsWith(`m${i}`)));
  return { ...f, pareti, piani, spigoli, pianoDelMuro };
}

const daRetta = (s: [Punto, Punto], p: Punto) => {
  const a = s[1].y - s[0].y;
  const b = s[0].x - s[1].x;
  const c = -(a * s[0].x + b * s[0].y);
  return Math.abs(a * p.x + b * p.y + c) / Math.hypot(a, b);
};

describe('facciate con più svolte', () => {
  for (const n of [3, 4, 5]) {
    it(`${n} muri diventano ${n} pareti, ciascuna con le sue finestre`, () => {
      const r = rileva(n, 0.5);
      expect(r.pareti).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        expect(r.pianoDelMuro(i)).toBeGreaterThanOrEqual(0);
        // e ogni parete raccoglie SOLO le finestre del suo muro
        const suo = r.pareti[r.pianoDelMuro(i)];
        expect(suo.esito.riferimenti.every((x) => x.id.startsWith(`m${i}`))).toBe(true);
      }
    });

    it(`${n} muri: uno spigolo per ogni svolta inquadrata, e nessuno inventato`, () => {
      const r = rileva(n, 0.5);
      // le svolte che si vedono nella foto
      const attese = r.spigoliVeri
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => nellaFoto(s[0]) || nellaFoto(s[1]));
      const coppia = (i: number, j: number) =>
        r.spigoli.some(
          (x) =>
            (x.a === r.pianoDelMuro(i) && x.b === r.pianoDelMuro(j)) ||
            (x.b === r.pianoDelMuro(i) && x.a === r.pianoDelMuro(j))
        );
      // ogni svolta inquadrata ha il suo spigolo…
      for (const { i } of attese) expect(coppia(i, i + 1)).toBe(true);
      // …e non ce ne sono altri: due muri non contigui si incrociano sì, ma
      // quella retta non è uno spigolo che si vede
      expect(r.spigoli).toHaveLength(attese.length);
      // ogni spigolo disegnato cade su una svolta vera
      for (const x of r.spigoli) {
        const scarto = Math.min(
          ...r.spigoliVeri.map((v) => Math.max(daRetta(v, x.spigolo.p1), daRetta(v, x.spigolo.p2)))
        );
        expect(scarto).toBeLessThan(30);
      }
    });

    it(`${n} muri: ogni misura ritrova il suo, anche a venti centimetri dalla svolta`, () => {
      const r = rileva(n, 0.5);
      const foto = {
        scala: null,
        piano: r.piani[0],
        piani: r.piani.slice(1),
        larghezzaPx: LARGHEZZA,
        altezzaPx: ALTEZZA
      };
      for (let i = 0; i < n; i++) {
        // in mezzo al muro, e a venti centimetri dalle due svolte
        for (const a of [200, 1300, 2400]) {
          const p = suFoto(r.muri[i], a, 1300);
          if (!nellaFoto(p)) continue;
          expect(pianoDi(foto, p)).toBe(r.piani[r.pianoDelMuro(i)]);
        }
      }
    });
  }

  it('due muri paralleli non fanno spigolo, per quanti siano', () => {
    const r = rileva(5, 0);
    // i muri pari sono paralleli fra loro, e così i dispari: nessuno spigolo
    for (const [i, j] of [
      [0, 2],
      [1, 3],
      [2, 4]
    ]) {
      const trovato = r.spigoli.some(
        (x) =>
          (x.a === r.pianoDelMuro(i) && x.b === r.pianoDelMuro(j)) ||
          (x.b === r.pianoDelMuro(i) && x.a === r.pianoDelMuro(j))
      );
      expect(trovato).toBe(false);
    }
  });
});

/* --- il piano segue le forme -------------------------------------------- */

describe('acceso il piano, le forme comandano', () => {
  /** la scena di due muri, con le sue annotazioni e i suoi piani */
  const impianto = () => {
    const f = facciata(2, 0);
    const pareti = pianiDalleForme(riferimentiPiano(f.annotazioni));
    return { ...f, piani: pareti.map((p) => p.piano) };
  };

  /** cambia la misura scritta su un lato di una finestra */
  const conQuota = (ann: Annotazione[], id: string, valore: number): Annotazione[] =>
    ann.map((a) =>
      a.id === id
        ? ({
            ...a,
            segmenti: (a as unknown as { segmenti: Array<{ valore: number }> }).segmenti.map(
              (s, i) => (i === 0 || i === 2 ? { ...s, valore } : s)
            )
          } as Annotazione)
        : a
    );

  it('il piano nasce sapendo da quali forme viene', () => {
    const { piani } = impianto();
    expect(piani[0].origini?.length).toBe(2);
    expect(piani[0].aMano).toBeUndefined();
  });

  it('senza modifiche non si rifà niente', () => {
    const { piani, annotazioni } = impianto();
    expect(pianiAggiornati(piani, annotazioni)).toBeNull();
  });

  it('correggendo una quota la prospettiva si aggiorna di conseguenza', () => {
    const { piani, annotazioni, muri } = impianto();
    // la finestra m0a era larga 700: adesso dice 900
    const corrette = conQuota(annotazioni, 'm0a', 900);
    const nuovi = pianiAggiornati(piani, corrette)!;
    expect(nuovi).toBeTruthy();
    // il piano di quel muro ora legge misure diverse: è quello che deve fare
    const p = suFoto(muri[0], 1000, 1300);
    const q = suFoto(muri[0], 2000, 1300);
    const misura = (piano: PianoProspettiva) => {
      const H = omografiaPiano(piano);
      const a = applicaOmografia(H, p);
      const b = applicaOmografia(H, q);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    const quale = (elenco: PianoProspettiva[]) =>
      elenco.find((x) => x.origini?.includes('m0a'))!;
    expect(Math.abs(misura(quale(nuovi)) - misura(quale(piani)))).toBeGreaterThan(20);
    // l'altro muro non c'entra: resta com'era
    const altro = (elenco: PianoProspettiva[]) => elenco.find((x) => x.origini?.includes('m1a'))!;
    expect(misura(altro(nuovi))).toBeCloseTo(misura(altro(piani)), 3);
  });

  it('il riquadro allargato a mano resta allargato', () => {
    const { piani, annotazioni } = impianto();
    // il piano del primo muro, quello che verrà toccato dalla correzione
    const suo = piani.find((p) => p.origini?.includes('m0a'))!;
    const altri = piani.filter((p) => p !== suo);
    // si allarga il suo riquadro, come tirando il lato destro
    const largo = pianoConLato(suo, 1, { x: suo.punti[1].x + 120, y: suo.punti[1].y })!;
    expect(largo.larghezzaReale).toBeGreaterThan(suo.larghezzaReale);
    // una correzione come capita: la finestra era 700, si scopre che è 730
    const nuovi = pianiAggiornati([largo, ...altri], conQuota(annotazioni, 'm0a', 730))!;
    const rifatto = nuovi.find((x) => x.origini?.includes('m0a'))!;
    // il riquadro copre ancora lo stesso pezzo di foto: gli angoli sono lì
    largo.punti.forEach((p, i) => {
      expect(Math.hypot(p.x - rifatto.punti[i].x, p.y - rifatto.punti[i].y)).toBeLessThan(40);
    });
    // e non si è ristretto: il pezzo di parete coperto prima ci sta ancora
    const area = (q: Punto[]) =>
      Math.abs(
        q.reduce((s, p, i) => {
          const r = q[(i + 1) % q.length];
          return s + (p.x * r.y - r.x * p.y);
        }, 0) / 2
      );
    expect(area(rifatto.punti)).toBeGreaterThan(area(largo.punti) * 0.9);
    expect(area(rifatto.punti)).toBeLessThan(area(largo.punti) * 1.6);
  });

  it('una prospettiva aggiustata a mano non si tocca più', () => {
    const { piani, annotazioni } = impianto();
    const suo = piani.find((p) => p.origini?.includes('m0a'))!;
    const altri = piani.filter((p) => p !== suo);
    const aMano = pianoConVertice(suo, 1, { x: suo.punti[1].x + 30, y: suo.punti[1].y - 20 })!;
    expect(aMano.aMano).toBe(true);
    const nuovi = pianiAggiornati([aMano, ...altri], conQuota(annotazioni, 'm0a', 900));
    // l'altro piano non è cambiato, questo è protetto: non c'è niente da fare
    if (nuovi) {
      const suo = nuovi.find((x) => x.origini?.includes('m0a'))!;
      expect(suo.punti).toEqual(aMano.punti);
      expect(suo.larghezzaReale).toBe(aMano.larghezzaReale);
    }
  });

  it('un piano calibrato a mano non segue nessuna forma', () => {
    const { annotazioni } = impianto();
    const aMano: PianoProspettiva = {
      punti: [
        { x: 100, y: 100 },
        { x: 500, y: 120 },
        { x: 495, y: 400 },
        { x: 105, y: 380 }
      ],
      larghezzaReale: 1000,
      altezzaReale: 800,
      unita: 'mm'
    };
    expect(pianiAggiornati([aMano], annotazioni)).toBeNull();
  });

  it('quotando un muro nuovo compare la sua parete', () => {
    const f = facciata(3, 0);
    // si parte con le sole finestre dei primi due muri
    const primi = f.annotazioni.filter((a) => !a.id.startsWith('m2'));
    const piani = pianiDalleForme(riferimentiPiano(primi)).map((p) => p.piano);
    expect(piani).toHaveLength(2);
    const nuovi = pianiAggiornati(piani, f.annotazioni)!;
    expect(nuovi).toBeTruthy();
    expect(nuovi).toHaveLength(3);
    expect(nuovi.some((p) => p.origini?.some((x) => x.startsWith('m2')))).toBe(true);
  });
});

/* --- le pareti si agganciano allo spigolo -------------------------------- */

describe('pareti attaccate lungo lo spigolo', () => {
  const impianto = () => {
    const f = facciata(2, 0);
    const piani = pianiDalleForme(riferimentiPiano(f.annotazioni)).map((p) => p.piano);
    return { ...f, piani };
  };

  /** quanto dista un punto dalla retta di uno spigolo */
  const daSpigolo = (s: { p1: Punto; p2: Punto }, p: Punto) => {
    const a = s.p2.y - s.p1.y;
    const b = s.p1.x - s.p2.x;
    const c = -(a * s.p1.x + b * s.p1.y);
    return Math.abs(a * p.x + b * p.y + c) / Math.hypot(a, b);
  };

  it('dopo l’aggancio ogni riquadro finisce sullo spigolo', () => {
    const { piani } = impianto();
    const attaccati = pianiAgganciati(piani, LARGHEZZA, ALTEZZA);
    const spigoli = spigoliDellaFoto(attaccati, LARGHEZZA, ALTEZZA);
    expect(spigoli).toHaveLength(1);
    const s = spigoli[0].spigolo;
    // due angoli per parete cadono sulla riga dello spigolo
    for (const piano of attaccati) {
      const sopra = piano.punti.filter((p) => daSpigolo(s, p) < 2);
      expect(sopra.length).toBe(2);
    }
  });

  it('e le due pareti si trovano nello stesso punto: è il vertice di giunzione', () => {
    const { piani } = impianto();
    const attaccati = pianiAgganciati(piani, LARGHEZZA, ALTEZZA);
    // ogni angolo sullo spigolo della prima parete ha il suo gemello
    let gemelli = 0;
    attaccati[0].punti.forEach((_, k) => {
      if (verticiGemelli(attaccati, 0, k).length > 0) gemelli++;
    });
    expect(gemelli).toBe(2);
  });

  it('l’aggancio non tocca la prospettiva', () => {
    const { piani, muri } = impianto();
    const provini: Array<[Punto, Punto]> = [
      [suFoto(muri[0], 600, 900), suFoto(muri[0], 1600, 900)],
      [suFoto(muri[0], 900, 600), suFoto(muri[0], 900, 1800)]
    ];
    const misura = (piano: PianoProspettiva, a: Punto, b: Punto) => {
      const H = omografiaPiano(piano);
      const x = applicaOmografia(H, a);
      const y = applicaOmografia(H, b);
      return Math.hypot(y.x - x.x, y.y - x.y);
    };
    const attaccati = pianiAgganciati(piani, LARGHEZZA, ALTEZZA);
    const quale = (elenco: PianoProspettiva[]) => elenco.find((p) => p.origini?.includes('m0a'))!;
    provini.forEach(([a, b]) => {
      expect(misura(quale(attaccati), a, b)).toBeCloseTo(misura(quale(piani), a, b), 3);
    });
  });

  it('agganciare due volte non cambia più niente', () => {
    const { piani } = impianto();
    const una = pianiAgganciati(piani, LARGHEZZA, ALTEZZA);
    const due = pianiAgganciati(una, LARGHEZZA, ALTEZZA);
    una.forEach((p, i) => {
      p.punti.forEach((q, k) => {
        expect(Math.hypot(q.x - due[i].punti[k].x, q.y - due[i].punti[k].y)).toBeLessThan(0.5);
      });
    });
  });

  it('con una parete sola non c’è niente da agganciare', () => {
    const f = facciata(1, 0);
    const piani = pianiDalleForme(riferimentiPiano(f.annotazioni)).map((p) => p.piano);
    expect(pianiAgganciati(piani, LARGHEZZA, ALTEZZA)).toEqual(piani);
  });

  it('il vertice di giunzione si tira in due: le due pareti seguono insieme', () => {
    const { piani } = impianto();
    const attaccati = pianiAgganciati(piani, LARGHEZZA, ALTEZZA);
    // si prende un angolo sullo spigolo e si guarda chi altro sta lì
    const k = attaccati[0].punti.findIndex((_, i) => verticiGemelli(attaccati, 0, i).length > 0);
    expect(k).toBeGreaterThanOrEqual(0);
    const gemelli = verticiGemelli(attaccati, 0, k);
    expect(gemelli).toHaveLength(1);
    const destinazione = {
      x: attaccati[0].punti[k].x + 18,
      y: attaccati[0].punti[k].y - 10
    };
    const primo = pianoConVertice(attaccati[0], k, destinazione)!;
    const secondo = pianoConVertice(attaccati[gemelli[0].indice], gemelli[0].vertice, destinazione)!;
    // tutti e due hanno ora l'angolo lì, e tutti e due sono passati «a mano»
    expect(primo.punti[k]).toEqual(destinazione);
    expect(secondo.punti[gemelli[0].vertice]).toEqual(destinazione);
    expect(primo.aMano).toBe(true);
    expect(secondo.aMano).toBe(true);
  });
});
