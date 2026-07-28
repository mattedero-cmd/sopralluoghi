import { describe, expect, it } from 'vitest';
import { frasiRitagli, ritagliUtili, segmentaBobina, strisciaResidua } from '../segmenti';
import { calcolaNesting, type LastraNesting, type Piazzamento } from '../nesting';

/** costruisce una lastra fittizia: solo y/altezza contano per il taglio */
function lastra(...righe: Array<[number, number, number?]>): LastraNesting {
  return {
    piazzamenti: righe.map(([y, altezza, x = 0], i) => ({
      x,
      y,
      larghezza: 100,
      altezza,
      larghezzaFinita: 100,
      altezzaFinita: altezza,
      nome: `p${i}`,
      tinta: 0,
      ruotato: false,
      chiave: `p${i}#0`
    })) as Piazzamento[]
  };
}

describe('segmentaBobina', () => {
  it('senza pezzi non produce segmenti', () => {
    expect(segmentaBobina(undefined, 3000)).toEqual([]);
    expect(segmentaBobina({ piazzamenti: [] }, 3000)).toEqual([]);
  });

  it('se il rotolo occupato sta sotto il massimo resta un blocco solo', () => {
    const s = segmentaBobina(lastra([0, 500], [500, 400]), 3000);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ inizio: 0, fine: 900, oltreMassimo: false });
  });

  it('taglia il più tardi possibile entro il massimo', () => {
    // pezzi da 1 m impilati: con massimo 3 m si taglia a 3 m, non a 1 m
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000], [2000, 1000], [3000, 1000]), 3000);
    expect(s.map((x) => [x.inizio, x.fine])).toEqual([
      [0, 3000],
      [3000, 4000]
    ]);
    expect(s.every((x) => !x.oltreMassimo)).toBe(true);
  });

  it('non taglia mai attraverso un pezzo', () => {
    // un pezzo da 0 a 2800 accanto a pezzi corti: il taglio a 3000 non è
    // libero perché a 1000/2000 ci passa in mezzo il pezzo lungo
    const l = lastra([0, 2800, 0], [0, 1000, 200], [1000, 1000, 200], [2000, 1000, 200]);
    const s = segmentaBobina(l, 1500);
    for (const seg of s) {
      for (const p of l.piazzamenti) {
        const attraversa = p.y < seg.fine - 1e-6 && p.y + p.altezza > seg.fine + 1e-6;
        expect(attraversa, `taglio a ${seg.fine} attraverso il pezzo a ${p.y}`).toBe(false);
      }
    }
  });

  it('quando non c’è nessun taglio libero il blocco supera il massimo, e lo dice', () => {
    // un unico pezzo da 4 m: non si può spezzare
    const s = segmentaBobina(lastra([0, 4000]), 3000);
    expect(s).toHaveLength(1);
    expect(s[0].fine).toBe(4000);
    expect(s[0].oltreMassimo).toBe(true);
  });

  it('ogni pezzo finisce in uno e un solo segmento', () => {
    const l = lastra([0, 900], [900, 900], [1800, 900], [2700, 900], [3600, 900], [4500, 900]);
    const s = segmentaBobina(l, 2000);
    const totale = s.reduce((n, x) => n + x.lastra.piazzamenti.length, 0);
    expect(totale).toBe(l.piazzamenti.length);
    const nomi = s.flatMap((x) => x.lastra.piazzamenti.map((p) => p.nome));
    expect(new Set(nomi).size).toBe(l.piazzamenti.length);
  });

  it('le coordinate dei pezzi ripartono da zero in ogni segmento', () => {
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000], [2000, 1000]), 1000);
    expect(s).toHaveLength(3);
    for (const seg of s) {
      expect(Math.min(...seg.lastra.piazzamenti.map((p) => p.y))).toBe(0);
      const fondo = Math.max(...seg.lastra.piazzamenti.map((p) => p.y + p.altezza));
      expect(fondo).toBeLessThanOrEqual(seg.fine - seg.inizio + 1e-6);
    }
  });

  it('i segmenti coprono tutto il tratto, senza buchi né sovrapposizioni', () => {
    const s = segmentaBobina(lastra([0, 700], [700, 1500], [2200, 400], [2600, 2000]), 1800);
    expect(s[0].inizio).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i].inizio).toBe(s[i - 1].fine);
    expect(s[s.length - 1].fine).toBe(4600);
  });

  it('il margine entra nel tratto da tagliare', () => {
    const s = segmentaBobina(lastra([0, 500]), 3000, 10);
    expect(s[0].fine).toBe(510);
  });

  it('regge un nesting vero e non perde pezzi', () => {
    const esito = calcolaNesting(
      { lastra: { larghezza: 1400, altezza: 50000 }, lama: 3, abbondanza: 0, margine: 10, massimoLastre: 1 },
      [
        { id: 'a', nome: 'Testiera', larghezza: 950, altezza: 860, quantita: 4, ruotabile: false, tinta: 0 },
        { id: 'b', nome: 'Frontale', larghezza: 1000, altezza: 150, quantita: 3, ruotabile: true, tinta: 90 },
        { id: 'c', nome: 'Fianco', larghezza: 610, altezza: 750, quantita: 6, ruotabile: true, tinta: 180 }
      ]
    );
    const s = segmentaBobina(esito.lastre[0], 3000, 10);
    const piazzati = esito.lastre[0].piazzamenti.length;
    expect(s.reduce((n, x) => n + x.lastra.piazzamenti.length, 0)).toBe(piazzati);
    for (const seg of s) {
      // nessun pezzo tagliato a metà da un estremo del segmento
      for (const p of esito.lastre[0].piazzamenti) {
        expect(p.y < seg.fine - 1e-6 && p.y + p.altezza > seg.fine + 1e-6).toBe(false);
      }
    }
  });
});

describe('code vuote', () => {
  it('il margine dopo l’ultimo pezzo non diventa un segmento a sé', () => {
    // due pezzi da 1 m con massimo 1 m: il taglio cade a 1000 e a 2000, ma
    // fineTotale è 2010 per via del margine
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000]), 1000, 10);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.lastra.piazzamenti.length > 0)).toBe(true);
    expect(s[s.length - 1].fine).toBe(2010);
  });

  it('nessun segmento resta senza pezzi, con qualunque massimo', () => {
    const l = lastra([0, 700], [700, 500], [1200, 900], [2100, 600], [2700, 800]);
    for (const massimo of [600, 800, 1000, 1500, 2000, 3000, 4000]) {
      const s = segmentaBobina(l, massimo, 10);
      for (const seg of s) {
        expect(seg.lastra.piazzamenti.length, `massimo ${massimo}`).toBeGreaterThan(0);
      }
      // e continuano a coprire tutto il tratto
      expect(s[0].inizio).toBe(0);
      expect(s[s.length - 1].fine).toBe(3510);
      for (let i = 1; i < s.length; i++) expect(s[i].inizio).toBe(s[i - 1].fine);
    }
  });
});

describe('linee libere che non sono fini di pezzo', () => {
  it('taglia anche nel vuoto fra due file lontane', () => {
    // un pezzo in cima, poi 2,5 m di rotolo sgombro, poi un altro pezzo.
    // Guardando solo le fini dei pezzi si taglierebbe subito a 500 e il
    // blocco successivo verrebbe lungo 3 m; il vuoto invece si può tagliare
    // dove si vuole.
    const s = segmentaBobina(lastra([0, 500], [3000, 500]), 2000);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.fine - x.inizio <= 2000 + 1e-6)).toBe(true);
    expect(s.every((x) => !x.oltreMassimo)).toBe(true);
    expect(s.every((x) => x.lastra.piazzamenti.length === 1)).toBe(true);
  });

  it('due pezzi che si toccano lasciano passare la lama sul contatto', () => {
    const s = segmentaBobina(lastra([0, 1000], [1000, 1000]), 1000);
    expect(s.map((x) => [x.inizio, x.fine])).toEqual([
      [0, 1000],
      [1000, 2000]
    ]);
  });

  it('due pezzi affiancati e sfalsati bloccano il taglio in mezzo', () => {
    // P1 copre 0..1000 a sinistra, P2 copre 900..1600 a destra: fra 900 e
    // 1000 la lama non passa, e nemmeno a 1000
    const l = lastra([0, 1000, 0], [900, 700, 500]);
    const s = segmentaBobina(l, 1200);
    expect(s).toHaveLength(1);
    expect(s[0].fine).toBe(1600);
    expect(s[0].oltreMassimo).toBe(true);
  });
});

describe('margini senza pezzi dentro', () => {
  it('il margine di TESTA non diventa un segmento a sé', () => {
    // come nel calcolo vero: i pezzi partono a y = margine
    const s = segmentaBobina(lastra([10, 2000], [2010, 1500]), 1800, 10);
    expect(s.every((x) => x.lastra.piazzamenti.length > 0)).toBe(true);
    expect(s[0].inizio).toBe(0);
  });

  it('un solo pezzo lunghissimo resta un blocco solo, non tre', () => {
    const s = segmentaBobina(lastra([10, 4000]), 1000, 10);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ inizio: 0, fine: 4020, oltreMassimo: true });
    expect(s[0].lastra.piazzamenti).toHaveLength(1);
  });

  it('i blocchi restano contigui e coprono tutto anche dopo le fusioni', () => {
    const l = lastra([10, 900], [910, 1200], [2110, 400], [2510, 1500]);
    for (const massimo of [500, 900, 1300, 2000, 2600, 5000]) {
      const s = segmentaBobina(l, massimo, 10);
      expect(s[0].inizio).toBe(0);
      expect(s[s.length - 1].fine).toBe(4020);
      for (let i = 1; i < s.length; i++) expect(s[i].inizio).toBe(s[i - 1].fine);
      expect(s.every((x) => x.lastra.piazzamenti.length > 0)).toBe(true);
      expect(s.reduce((n, x) => n + x.lastra.piazzamenti.length, 0)).toBe(4);
    }
  });
});

describe('sfridi: le strisce restano intere', () => {
  /** lastra con pezzi collocati anche in x, per valutare la striscia laterale */
  function conX(...righe: Array<[number, number, number, number]>): LastraNesting {
    return {
      piazzamenti: righe.map(([x, y, l, a], i) => ({
        x,
        y,
        larghezza: l,
        altezza: a,
        larghezzaFinita: l,
        altezzaFinita: a,
        nome: `p${i}`,
        tinta: 0,
        ruotato: false,
        chiave: `p${i}#0`
      })) as Piazzamento[]
    };
  }

  // come nella foto: sopra una colonna di pezzi da 750 (striscia libera 470),
  // sotto tre file di due pezzi da 500 (striscia libera 220)
  const rotolo = conX(
    [0, 0, 750, 500],
    [0, 500, 750, 500],
    [0, 1000, 500, 500],
    [500, 1000, 500, 500],
    [0, 1500, 500, 500],
    [500, 1500, 500, 500],
    [0, 2000, 500, 500],
    [500, 2000, 500, 500]
  );

  it('taglia dove la striscia cambia larghezza, non in mezzo alle file uguali', () => {
    // il limite cadrebbe a 1800, in mezzo alle file da 500: lì la striscia da
    // 220 verrebbe spezzata in due. Il punto giusto è 1000, dove la striscia
    // passa da 470 a 220 per conto suo.
    const s = segmentaBobina(rotolo, 1800, 0, 1220);
    expect(s[0].fine).toBe(1000);
  });

  it('senza la larghezza del rotolo non può ragionare sulle strisce', () => {
    // 1800 cade dentro una fila, quindi si arretra a 1500: ma lì la striscia
    // da 220 viene spezzata, e senza la larghezza non lo si può sapere
    const s = segmentaBobina(rotolo, 1800, 0);
    expect(s[0].fine).toBe(1500);
  });

  it('una striscia troppo stretta è scarto: non vale la pena accorciare', () => {
    // rotolo largo 1010: di fianco alle file da 500+500 restano 10 mm, che
    // non sono materiale. Spezzarli non toglie niente, quindi si taglia lungo
    const s = segmentaBobina(rotolo, 1800, 0, 1010);
    expect(s[0].fine).toBe(1500);
  });

  it('se accorciare non serve, il taglio resta il più lontano possibile', () => {
    // file tutte diverse: ogni linea cambia la striscia, quindi si usa tutto
    const misto = conX([0, 0, 700, 500], [0, 500, 900, 500], [0, 1000, 600, 500]);
    const s = segmentaBobina(misto, 1000, 0, 1220);
    expect(s[0].fine).toBe(1000);
  });

  it('non perde pezzi né contiguità nemmeno con la preferenza attiva', () => {
    for (const massimo of [700, 1100, 1500, 1800, 2200]) {
      const s = segmentaBobina(rotolo, massimo, 10, 1220);
      expect(s.reduce((n, x) => n + x.lastra.piazzamenti.length, 0)).toBe(8);
      expect(s[0].inizio).toBe(0);
      expect(s[s.length - 1].fine).toBe(2510);
      for (let i = 1; i < s.length; i++) expect(s[i].inizio).toBe(s[i - 1].fine);
    }
  });
});

describe('strisciaResidua', () => {
  const conX = (...righe: Array<[number, number, number, number]>): LastraNesting => ({
    piazzamenti: righe.map(([x, y, l, a], i) => ({
      x, y, larghezza: l, altezza: a,
      larghezzaFinita: l, altezzaFinita: a,
      nome: `p${i}`, tinta: 0, ruotato: false, chiave: `p${i}#0`
    })) as Piazzamento[]
  });

  it('misura il ritaglio intero più grande che avanza di fianco ai pezzi', () => {
    const s = strisciaResidua(conX([0, 0, 750, 500], [0, 500, 700, 500]), 1220, 1000);
    expect(s).toEqual({ larghezza: 470, lunghezza: 1000, inizio: 0 });
  });

  it('preferisce il rettangolo più grande, non la striscia più stretta', () => {
    // sopra avanzano 470 mm per 500 di lunghezza (235.000 mm²), sotto ne
    // avanzano 720 per 1000 (720.000): il ritaglio buono è il secondo
    const s = strisciaResidua(conX([0, 0, 750, 500], [0, 500, 500, 1000]), 1220, 1500);
    expect(s).toEqual({ larghezza: 720, lunghezza: 1000, inizio: 500 });
  });

  it('il ritaglio a cavallo di più fasce vale la larghezza minore', () => {
    // 470 su tutte e due le fasce = 470 × 1000, meglio di 720 × 500
    const s = strisciaResidua(conX([0, 0, 750, 500], [0, 500, 500, 500]), 1220, 1000);
    expect(s).toEqual({ larghezza: 470, lunghezza: 1000, inizio: 0 });
  });

  it('una striscia sotto i 10 cm è scarto, non materiale', () => {
    expect(strisciaResidua(conX([0, 0, 1180, 500]), 1220, 500)).toBeNull();
  });

  it('senza pezzi o senza misure non inventa niente', () => {
    expect(strisciaResidua(undefined, 1220, 1000)).toBeNull();
    expect(strisciaResidua(conX([0, 0, 500, 500]), 0, 1000)).toBeNull();
    expect(strisciaResidua(conX([0, 0, 500, 500]), 1220, 0)).toBeNull();
  });
});

describe('ritaglio più grande: casi a gradini', () => {
  const conX = (...righe: Array<[number, number, number, number]>): LastraNesting => ({
    piazzamenti: righe.map(([x, y, l, a], i) => ({
      x, y, larghezza: l, altezza: a,
      larghezzaFinita: l, altezzaFinita: a,
      nome: `p${i}`, tinta: 0, ruotato: false, chiave: `p${i}#0`
    })) as Piazzamento[]
  });

  it('un tratto largo e corto batte una striscia stretta e lunga se ha più area', () => {
    // fasce libere: 320 (0..610), 157 (610..1220), 470 (1220..2455)
    // 470 × 1235 = 580.450 vince su 157 × 2455 = 385.435
    const s = strisciaResidua(
      conX(
        [0, 0, 900, 610],
        [0, 610, 750, 610],
        [750, 610, 313, 610],
        [0, 1220, 750, 1235]
      ),
      1220,
      2455
    );
    expect(s).toEqual({ larghezza: 470, lunghezza: 1235, inizio: 1220 });
  });

  it('una striscia stretta ma lunghissima vince se ha più area', () => {
    // i 100 mm liberi in cima proseguono anche nella fascia sotto (che ne ha
    // 400): la striscia vale 100 × 6000, meglio dei 400 × 1000 in fondo
    const s = strisciaResidua(
      conX([0, 0, 1120, 5000], [0, 5000, 820, 1000]),
      1220,
      6000
    );
    expect(s).toEqual({ larghezza: 100, lunghezza: 6000, inizio: 0 });
  });

  it('il ritaglio dichiarato è davvero libero: nessun pezzo ci finisce dentro', () => {
    const l = conX(
      [0, 0, 900, 610],
      [0, 610, 750, 610],
      [750, 610, 313, 610],
      [0, 1220, 750, 1235]
    );
    const s = strisciaResidua(l, 1220, 2455)!;
    for (const p of l.piazzamenti) {
      const sovrappone =
        p.x < 1220 - s.larghezza + 1220 &&
        p.x + p.larghezza > 1220 - s.larghezza &&
        p.y < s.inizio + s.lunghezza &&
        p.y + p.altezza > s.inizio;
      // il ritaglio sta a destra di tutti i pezzi che lo attraversano in altezza
      if (sovrappone) expect(p.x + p.larghezza).toBeLessThanOrEqual(1220 - s.larghezza + 1e-6);
    }
  });
});

describe('ritaglio: a parità di superficie vince il più largo', () => {
  const conX = (...righe: Array<[number, number, number, number]>): LastraNesting => ({
    piazzamenti: righe.map(([x, y, l, a], i) => ({
      x, y, larghezza: l, altezza: a,
      larghezzaFinita: l, altezzaFinita: a,
      nome: `p${i}`, tinta: 0, ruotato: false, chiave: `p${i}#0`
    })) as Piazzamento[]
  });

  it('il caso reale: il ritaglio largo 460 batte la bandella da 157', () => {
    // due traverse sporgono a destra solo per un tratto: sotto resta un
    // ritaglio corto ma largo, quasi della stessa superficie della bandella
    const s = strisciaResidua(
      conX(
        [10, 3, 900, 610],
        [10, 616, 750, 610],
        [10, 1229, 750, 610],
        [10, 1842, 750, 610],
        [763, 616, 300, 500],
        [763, 1119, 300, 500]
      ),
      1220,
      2455
    );
    expect(s?.larghezza).toBe(460);
    expect(Math.round(s!.lunghezza)).toBe(836);
  });

  it('una differenza di superficie vera decide comunque lei', () => {
    // 100 × 6000 = 600.000 contro 400 × 1000: non è parità, vince l'area
    const s = strisciaResidua(conX([0, 0, 1120, 5000], [0, 5000, 820, 1000]), 1220, 6000);
    expect(s?.larghezza).toBe(100);
  });
});

describe('pezzi giustificati in fondo al segmento', () => {
  const conX = (...righe: Array<[number, number, number, number]>): LastraNesting => ({
    piazzamenti: righe.map(([x, y, l, a], i) => ({
      x, y, larghezza: l, altezza: a,
      larghezzaFinita: l, altezzaFinita: a,
      nome: `p${i}`, tinta: 0, ruotato: false, chiave: `p${i}#0`
    })) as Piazzamento[]
  });

  // il caso della foto: due colonne alte a sinistra, una colonna media, e due
  // frontali fermi a metà blocco sotto di essa
  const rotolo = conX(
    [10, 10, 450, 2300],
    [463, 10, 200, 2300],
    [666, 10, 100, 1650],
    [666, 1663, 500, 150],
    [666, 1816, 500, 150]
  );

  it('i frontali scendono in fondo e il ritaglio diventa più grande', () => {
    const senza = strisciaResidua(rotolo, 1220, 2310)!;
    const s = segmentaBobina(rotolo, 3000, 10, 1220, 3);
    expect(s).toHaveLength(1);
    const con = strisciaResidua(s[0].lastra, 1220, 2310)!;
    expect(con.larghezza * con.lunghezza).toBeGreaterThan(senza.larghezza * senza.lunghezza);

    const frontali = s[0].lastra.piazzamenti.filter((p) => p.altezza === 150);
    // il più basso arriva a filo dei pezzi alti, cioè in fondo al segmento
    const piuBasso = Math.max(...frontali.map((p) => p.y + p.altezza));
    expect(piuBasso).toBe(2310);
  });

  it('non sovrappone i pezzi e lascia la lama fra loro', () => {
    const s = segmentaBobina(rotolo, 3000, 10, 1220, 3);
    const pezzi = s[0].lastra.piazzamenti;
    for (let i = 0; i < pezzi.length; i++) {
      for (let j = i + 1; j < pezzi.length; j++) {
        const a = pezzi[i];
        const b = pezzi[j];
        const separati =
          a.x + a.larghezza <= b.x + 1e-9 ||
          b.x + b.larghezza <= a.x + 1e-9 ||
          a.y + a.altezza <= b.y + 1e-9 ||
          b.y + b.altezza <= a.y + 1e-9;
        expect(separati, `${a.nome} e ${b.nome} si toccano`).toBe(true);
        // se sono incolonnati, fra loro resta almeno la lama
        const incrociaX = a.x < b.x + b.larghezza && a.x + a.larghezza > b.x;
        if (incrociaX) {
          const sopra = a.y < b.y ? a : b;
          const sotto = a.y < b.y ? b : a;
          expect(sotto.y - (sopra.y + sopra.altezza)).toBeGreaterThanOrEqual(3 - 1e-9);
        }
      }
    }
  });

  it('nessun pezzo esce dal segmento', () => {
    const s = segmentaBobina(rotolo, 3000, 10, 1220, 3);
    for (const seg of s) {
      for (const p of seg.lastra.piazzamenti) {
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y + p.altezza).toBeLessThanOrEqual(seg.fine - seg.inizio + 1e-9);
      }
    }
  });

  it('le misure dei pezzi non vengono toccate', () => {
    const s = segmentaBobina(rotolo, 3000, 10, 1220, 3);
    const misure = s[0].lastra.piazzamenti
      .map((p) => `${p.larghezza}x${p.altezza}@${p.x}`)
      .sort();
    expect(misure).toEqual(
      rotolo.piazzamenti.map((p) => `${p.larghezza}x${p.altezza}@${p.x}`).sort()
    );
  });

  it('se il blocco è già compatto non cambia niente', () => {
    const pieno = conX([10, 10, 600, 1000], [616, 10, 594, 1000]);
    const s = segmentaBobina(pieno, 3000, 10, 1220, 3);
    expect(s[0].lastra.piazzamenti.map((p) => p.y)).toEqual([10, 10]);
  });

  it('senza la larghezza del rotolo non si azzarda a spostare niente', () => {
    const s = segmentaBobina(rotolo, 3000, 10);
    expect(s[0].lastra.piazzamenti.map((p) => p.y)).toEqual(
      rotolo.piazzamenti.map((p) => p.y)
    );
  });
});

/**
 * QUELLO CHE AVANZA, TUTTO.
 *
 * Di una lastra impaginata non conta l'area libera — è un numero che non dice
 * niente — ma in quanti pezzi interi si riesce a raccoglierla.
 */
describe('ritagliUtili', () => {
  const lastra = (...r: Array<[number, number, number, number]>): LastraNesting => ({
    piazzamenti: r.map(([x, y, l, a], i) => ({
      x,
      y,
      larghezza: l,
      altezza: a,
      larghezzaFinita: l,
      altezzaFinita: a,
      nome: `p${i}`,
      tinta: 0,
      ruotato: false,
      chiave: `p${i}#0`
    }))
  });
  const area = (r: ReturnType<typeof ritagliUtili>) =>
    r.reduce((t, x) => t + x.larghezza * x.lunghezza, 0);

  it('una lastra vuota avanza tutta intera', () => {
    expect(ritagliUtili({ piazzamenti: [] }, 1000, 2000)).toEqual([
      { x: 0, y: 0, larghezza: 1000, lunghezza: 2000 }
    ]);
  });

  it('una colonna a sinistra lascia la fascia a destra', () => {
    const r = ritagliUtili(lastra([0, 0, 300, 2000]), 1000, 2000);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ x: 300, larghezza: 700, lunghezza: 2000 });
  });

  it('una L lascia due rettangoli, e insieme fanno tutto il libero', () => {
    const r = ritagliUtili(lastra([0, 0, 600, 1200]), 1000, 2000);
    expect(r).toHaveLength(2);
    // 1000×2000 meno il pezzo 600×1200: il libero si raccoglie tutto
    expect(area(r)).toBe(1000 * 2000 - 600 * 1200);
  });

  it('il pezzetto sotto la colonna alta lascia più materiale di quello sotto la bassa', () => {
    const sottoLaBassa = lastra(
      [4, 4, 290, 2800],
      [298, 4, 290, 2470],
      [298, 2478, 290, 185],
      [592, 4, 290, 2470],
      [886, 4, 290, 2470],
      [1180, 4, 290, 2470]
    );
    const sottoLAlta = lastra(
      [4, 4, 290, 2800],
      [4, 2808, 290, 185],
      [298, 4, 290, 2470],
      [592, 4, 290, 2470],
      [886, 4, 290, 2470],
      [1180, 4, 290, 2470]
    );
    // sotto l'alta: un rettangolo solo che attraversa le altre quattro colonne
    const buono = ritagliUtili(sottoLAlta, 1500, 3050);
    expect(buono).toHaveLength(1);
    expect(buono[0].larghezza).toBeGreaterThan(1200);
    expect(area(buono)).toBeGreaterThan(area(ritagliUtili(sottoLaBassa, 1500, 3050)));
  });

  it('gli scampoli troppo stretti non si contano: non sono materiale', () => {
    // resta una bandella da 40 mm: si butta
    expect(ritagliUtili(lastra([0, 0, 960, 2000]), 1000, 2000)).toEqual([]);
  });

  it('non si conta due volte lo stesso pezzo di lastra', () => {
    const r = ritagliUtili(lastra([0, 0, 600, 1200]), 1000, 2000, 5);
    expect(area(r)).toBeLessThanOrEqual(1000 * 2000 - 600 * 1200 + 1e-6);
  });
});

describe('frasiRitagli', () => {
  it('un ritaglio solo', () => {
    expect(frasiRitagli([{ x: 0, y: 0, larghezza: 1500, lunghezza: 442 }])).toBe(
      'avanza 1.500×442 mm'
    );
  });

  it('due ritagli', () => {
    expect(
      frasiRitagli([
        { x: 0, y: 0, larghezza: 1500, lunghezza: 442 },
        { x: 0, y: 0, larghezza: 912, lunghezza: 155 }
      ])
    ).toBe('avanzano 1.500×442 e 912×155 mm');
  });

  it('niente da tenere, niente da dire', () => {
    expect(frasiRitagli([])).toBe('');
  });
});
