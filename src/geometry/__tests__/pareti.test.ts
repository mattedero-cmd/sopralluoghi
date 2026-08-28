import { describe, expect, it } from 'vitest';
import {
  latoDelloSpigolo,
  spigoliDellaFoto,
  spigoliSuiVertici,
  spigoloInDisaccordo,
  vincoliDelPiano
} from '../spigolo';
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

/* --- la riga dello spigolo passa per i vertici in comune ----------------- */

describe('la riga dello spigolo passa per i vertici di giunzione', () => {
  const impianto = () => {
    const f = facciata(2, 0);
    const piani = pianiDalleForme(riferimentiPiano(f.annotazioni)).map((p) => p.piano);
    return { ...f, piani: pianiAgganciati(piani, LARGHEZZA, ALTEZZA) };
  };

  const corretti = (piani: PianoProspettiva[]) =>
    spigoliSuiVertici(
      spigoliDellaFoto(piani, LARGHEZZA, ALTEZZA),
      piani,
      LARGHEZZA,
      ALTEZZA
    );

  /** gli angoli che le due pareti hanno in comune (di norma uno, a volte due) */
  const gemelli = (piani: PianoProspettiva[]): Punto[] => {
    const fuori: Punto[] = [];
    piani[0].punti.forEach((p, k) => {
      if (verticiGemelli(piani, 0, k).length > 0) fuori.push(p);
    });
    return fuori;
  };

  it('quando le pareti sono unite la riga passa per i loro angoli in comune', () => {
    const { piani } = impianto();
    const s = corretti(piani);
    expect(s).toHaveLength(1);
    expect(s[0].daiVertici).toBe(true);
    expect(gemelli(piani).length).toBeGreaterThan(0);
    for (const g of gemelli(piani))
      expect(daRetta([s[0].spigolo.p1, s[0].spigolo.p2], g)).toBeLessThan(0.01);
  });

  it('nel caso automatico non cambia niente: i vertici erano già sulla retta ricavata', () => {
    const { piani } = impianto();
    const ricavato = spigoliDellaFoto(piani, LARGHEZZA, ALTEZZA)[0];
    const corretto = corretti(piani)[0];
    // le due righe coincidono a meno di un pixel, e non c'è disaccordo
    for (const p of [ricavato.spigolo.p1, ricavato.spigolo.p2])
      expect(daRetta([corretto.spigolo.p1, corretto.spigolo.p2], p)).toBeLessThan(1);
    expect(corretto.scarto).toBeLessThan(1);
    expect(spigoloInDisaccordo(corretto, LARGHEZZA, ALTEZZA)).toBe(false);
  });

  it('tirato il vertice di giunzione, la riga lo segue — prima non lo faceva', () => {
    const { piani } = impianto();
    const k = piani[0].punti.findIndex((_, i) => verticiGemelli(piani, 0, i).length > 0);
    const g = verticiGemelli(piani, 0, k)[0];
    const dove = { x: piani[0].punti[k].x + 26, y: piani[0].punti[k].y - 16 };
    const mossi = [
      pianoConVertice(piani[0], k, dove)!,
      pianoConVertice(piani[g.indice], g.vertice, dove)!
    ];
    const ricavato = spigoliDellaFoto(mossi, LARGHEZZA, ALTEZZA)[0];
    const corretto = corretti(mossi)[0];
    // la riga ricavata dalle prospettive o non passa per il punto lasciato dal
    // dito, o non esiste più affatto: è il difetto che si voleva togliere
    if (ricavato) expect(daRetta([ricavato.spigolo.p1, ricavato.spigolo.p2], dove)).toBeGreaterThan(2);
    // quella disegnata sì, e per gli altri angoli in comune anche
    expect(corretto.daiVertici).toBe(true);
    expect(daRetta([corretto.spigolo.p1, corretto.spigolo.p2], dove)).toBeLessThan(0.01);
    for (const p of gemelli(mossi))
      expect(daRetta([corretto.spigolo.p1, corretto.spigolo.p2], p)).toBeLessThan(0.01);
  });

  /**
   * DUE RIQUADRI DI ALTEZZA DIVERSA: è il caso comune sul campo, perché le
   * finestre delle due pareti non stanno mai alla stessa quota. Le pareti si
   * toccano in un angolo solo — quello è il vertice di giunzione.
   */
  const scalati = () => {
    const { piani } = impianto();
    // si accorcia il fianco dall'alto: resta in comune il solo angolo basso
    const alto = piani[1].punti[0].y < piani[1].punti[3].y ? 0 : 2;
    const ridotto = pianoConLato(piani[1], alto as 0 | 1 | 2 | 3, {
      x: piani[1].punti[alto].x,
      y: piani[1].punti[alto].y + 90
    });
    return pianiAgganciati([piani[0], ridotto ?? piani[1]], LARGHEZZA, ALTEZZA);
  };

  it('riquadri di altezza diversa: l’aggancio li allunga fino a condividere lo stesso filo', () => {
    const piani = scalati();
    // il fianco accorciato si riallunga per coprire lo stesso spigolo del
    // fronte: al vero angolo di fabbricato i due muri finiscono insieme
    expect(gemelli(piani)).toHaveLength(2);
    const s = corretti(piani)[0];
    expect(s.daiVertici).toBe(true);
    for (const g of gemelli(piani))
      expect(daRetta([s.spigolo.p1, s.spigolo.p2], g)).toBeLessThan(0.01);
  });

  it('con un angolo in comune solo, la riga ci passa e segue il filo dei due lati', () => {
    const piani = scalati();
    // si stacca UNO dei due angoli, muovendo solo il fianco: resta un
    // vertice di giunzione, ed è lì che la riga deve passare
    const k = piani[1].punti.findIndex((_, i) => verticiGemelli(piani, 1, i).length > 0);
    const staccato = pianoConVertice(piani[1], k, {
      x: piani[1].punti[k].x + 60,
      y: piani[1].punti[k].y + 40
    })!;
    const mossi = [piani[0], staccato];
    expect(gemelli(mossi)).toHaveLength(1);
    const corretto = corretti(mossi)[0];
    expect(corretto.daiVertici).toBe(true);
    expect(daRetta([corretto.spigolo.p1, corretto.spigolo.p2], gemelli(mossi)[0])).toBeLessThan(0.01);
  });

  /** quanto il riquadro più staccato resta lontano dalla riga dello spigolo */
  const distacco = (piani: PianoProspettiva[], retta: [Punto, Punto]) =>
    Math.max(
      ...piani.map((piano) =>
        piano.punti
          .map((q) => daRetta(retta, q))
          .sort((x, y) => x - y)[1]
      )
    );

  it('dopo il ritocco a mano nessuna delle due pareti resta staccata dalla riga', () => {
    const piani = scalati();
    const k = piani[0].punti.findIndex((_, i) => verticiGemelli(piani, 0, i).length > 0);
    const g = verticiGemelli(piani, 0, k)[0];
    const dove = { x: piani[0].punti[k].x + 30, y: piani[0].punti[k].y - 20 };
    const mossi = pianiAgganciati(
      [
        pianoConVertice(piani[0], k, dove)!,
        pianoConVertice(piani[g.indice], g.vertice, dove)!
      ],
      LARGHEZZA,
      ALTEZZA
    );
    const corretto = corretti(mossi)[0];
    const ricavato = spigoliDellaFoto(mossi, LARGHEZZA, ALTEZZA)[0];
    const conLaRiga = distacco(mossi, [corretto.spigolo.p1, corretto.spigolo.p2]);
    // il filo dei due lati distribuisce lo scarto invece di lasciarne una
    // visibilmente staccata: misurato, da 88 px a 31
    expect(conLaRiga).toBeLessThan(40);
    if (ricavato)
      expect(conLaRiga).toBeLessThan(
        distacco(mossi, [ricavato.spigolo.p1, ricavato.spigolo.p2])
      );
    // e la riga passa ancora per il punto lasciato dal dito
    expect(daRetta([corretto.spigolo.p1, corretto.spigolo.p2], dove)).toBeLessThan(2);
  });

  it('il verso resta quello di prima: ogni parete sta sempre da casa sua', () => {
    const { piani } = impianto();
    const ricavato = spigoliDellaFoto(piani, LARGHEZZA, ALTEZZA)[0];
    const corretto = corretti(piani)[0];
    expect(corretto.spigolo.segnoPrimo).toBe(ricavato.spigolo.segnoPrimo);
    // e non solo il numero: le due pareti restano ciascuna dal lato suo
    const cA = { x: piani[0].punti.reduce((t, q) => t + q.x, 0) / 4, y: piani[0].punti.reduce((t, q) => t + q.y, 0) / 4 };
    expect(latoDelloSpigolo(corretto.spigolo, cA)).toBe(latoDelloSpigolo(ricavato.spigolo, cA));
    expect(corretto.a).toBe(ricavato.a);
    expect(corretto.b).toBe(ricavato.b);
    expect(corretto.separante).toBe(ricavato.separante);
  });

  it('e le misure continuano a ritrovare il muro loro', () => {
    const { piani, muri } = impianto();
    const foto = {
      scala: null,
      piano: piani[0],
      piani: piani.slice(1),
      larghezzaPx: LARGHEZZA,
      altezzaPx: ALTEZZA
    };
    const quale = (id: string) => piani.find((p) => p.origini?.includes(id))!;
    for (const [i, id] of [
      [0, 'm0a'],
      [1, 'm1a']
    ] as Array<[number, string]>) {
      for (const a of [300, 1300, 2300]) {
        const p = suFoto(muri[i], a, 1300);
        if (!nellaFoto(p)) continue;
        expect(pianoDi(foto, p)).toBe(quale(id));
      }
    }
  });

  it('pareti non unite: nessun vertice in comune, resta la riga ricavata', () => {
    const f = facciata(2, 0);
    // niente aggancio: i due riquadri non si toccano
    const piani = pianiDalleForme(riferimentiPiano(f.annotazioni)).map((p) => p.piano);
    const vicini = piani.some((_, i) =>
      piani[0].punti.some((_, k) => (i === 0 ? false : verticiGemelli(piani, 0, k).length > 0))
    );
    expect(vicini).toBe(false);
    const s = corretti(piani);
    expect(s[0].daiVertici).toBe(false);
    expect(s[0].scarto).toBe(0);
    expect(spigoloInDisaccordo(s[0], LARGHEZZA, ALTEZZA)).toBe(false);
  });

  it('anche se le prospettive non hanno più una riga in comune, lo spigolo si vede', () => {
    const { piani } = impianto();
    const k = piani[0].punti.findIndex((_, i) => verticiGemelli(piani, 0, i).length > 0);
    const g = verticiGemelli(piani, 0, k)[0];
    const dove = { x: piani[0].punti[k].x + 26, y: piani[0].punti[k].y - 16 };
    const mossi = [
      pianoConVertice(piani[0], k, dove)!,
      pianoConVertice(piani[g.indice], g.vertice, dove)!
    ];
    const s = corretti(mossi);
    expect(s).toHaveLength(1);
    expect(s[0].daiVertici).toBe(true);
    if (!s[0].ricavato) expect(spigoloInDisaccordo(s[0], LARGHEZZA, ALTEZZA)).toBe(true);
  });

  it('quando le prospettive si allontanano dalla riga, la riga lo dice', () => {
    const { piani } = impianto();
    const k = piani[0].punti.findIndex((_, i) => verticiGemelli(piani, 0, i).length > 0);
    const g = verticiGemelli(piani, 0, k)[0];
    // uno strappo grosso: il vertice va lontano da dove le prospettive lo vogliono
    const dove = { x: piani[0].punti[k].x + 90, y: piani[0].punti[k].y - 60 };
    const mossi = [
      pianoConVertice(piani[0], k, dove)!,
      pianoConVertice(piani[g.indice], g.vertice, dove)!
    ];
    const s = corretti(mossi)[0];
    expect(spigoloInDisaccordo(s, LARGHEZZA, ALTEZZA)).toBe(true);
  });
});

/* --- gli incroci che NON sono angoli di fabbricato ----------------------- */

describe('un incrocio a T non è un confine', () => {
  /**
   * Un tramezzo che tocca il muro nel mezzo: lo spigolo c'è e si vede, ma il
   * muro CONTINUA dall'altra parte della riga. Tagliarci il riquadro — o
   * agganciarcelo — vorrebbe dire buttare via mezza parete.
   */
  const scena = () => {
    const R = rotX(-0.05);
    const principale = muro(R, [-3000, -1300, 7000], [1, 0, 0]);
    const tramezzo = muro(R, [0, -1300, 7000], [0.5, 0, -0.866]);
    const annotazioni = [
      finestra(principale, 'p1', 800, 600, 900, 1000, 0),
      finestra(principale, 'p2', 4000, 600, 900, 1000, 0),
      finestra(tramezzo, 't1', 600, 600, 800, 900, 0),
      finestra(tramezzo, 't2', 1700, 600, 800, 900, 0)
    ];
    const piani = pianiDalleForme(riferimentiPiano(annotazioni)).map((p) => p.piano);
    return { principale, tramezzo, annotazioni, piani };
  };

  /** un punto sta dentro un poligono convesso? */
  const dentro = (poly: Punto[], q: Punto) => {
    let segno = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const cr = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      if (Math.abs(cr) < 1e-9) continue;
      const s = cr > 0 ? 1 : -1;
      if (segno === 0) segno = s;
      else if (s !== segno) return false;
    }
    return segno !== 0;
  };

  it('lo spigolo c’è, ma è marcato come non separante', () => {
    const { piani } = scena();
    expect(piani).toHaveLength(2);
    const spigoli = spigoliDellaFoto(piani, LARGHEZZA, ALTEZZA);
    expect(spigoli).toHaveLength(1);
    expect(spigoli[0].separante).toBe(false);
  });

  it('il muro non si taglia a metà: nessun vincolo di disegno', () => {
    const { piani } = scena();
    const spigoli = spigoliDellaFoto(piani, LARGHEZZA, ALTEZZA);
    const muroPrincipale = piani.findIndex((p) => p.origini?.includes('p1'));
    expect(vincoliDelPiano(spigoli, muroPrincipale)).toHaveLength(0);
  });

  it('e l’aggancio non gli porta via una finestra', () => {
    const { piani } = scena();
    const attaccati = pianiAgganciati(piani, LARGHEZZA, ALTEZZA);
    for (const piano of attaccati) {
      for (const ancora of piano.ancore ?? []) {
        expect(dentro(piano.punti, ancora)).toBe(true);
      }
    }
  });
});

describe('una parete di scorcio non scappa dalla foto', () => {
  it('il riquadro resta nei paraggi delle sue forme', () => {
    // muro che fugge indietro, ripreso quasi di taglio: l'orizzonte è a due
    // passi, e un margine generoso porterebbe gli angoli a migliaia di pixel
    const R = mul(rotX(-0.05), rotY(0.1));
    const scorcio = muro(R, [1200, -1300, 5000], [0.34, 0, 0.94]);
    const annotazioni = [
      finestra(scorcio, 's1', 600, 700, 500, 400, 0),
      finestra(scorcio, 's2', 1500, 700, 500, 400, 0)
    ];
    const piani = pianiDalleForme(riferimentiPiano(annotazioni)).map((p) => p.piano);
    expect(piani).toHaveLength(1);
    const forme = annotazioni.flatMap((a) =>
      (a as unknown as { punti: Punto[] }).punti
    );
    const minX = Math.min(...forme.map((p) => p.x));
    const maxX = Math.max(...forme.map((p) => p.x));
    const minY = Math.min(...forme.map((p) => p.y));
    const maxY = Math.max(...forme.map((p) => p.y));
    const largo = (maxX - minX) * 1.5;
    const alto = (maxY - minY) * 1.5;
    for (const p of piani[0].punti) {
      expect(p.x).toBeGreaterThan(minX - largo);
      expect(p.x).toBeLessThan(maxX + largo);
      expect(p.y).toBeGreaterThan(minY - alto);
      expect(p.y).toBeLessThan(maxY + alto);
    }
  });
});
