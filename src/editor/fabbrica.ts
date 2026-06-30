import type {
  Annotazione,
  Callout,
  DisegnoLibero,
  Etichetta,
  FilettaturaTecnica,
  Forma,
  Foto,
  Freccia,
  Impostazioni,
  Legenda,
  Punto,
  TipoForma,
  Quota,
  QuotaAngolare,
  QuotaPoligono,
  QuotaRaggio,
  QuotaTecnica,
  Rettangolo,
  SegmentoQuota,
  SottotipoQuota,
  Stile,
  TestoFoto,
  Unita,
  VersoQuota
} from '../db/types';
import { COLORE_QUOTA, COLORE_QUOTA_TECNICA, quadrilateroQuotaRett } from '../db/types';
import { nuovoId } from '../utils/id';
import { haCalibrazione, misuraSegmento, valoreAutomatico } from '../geometry/calibrazione';
import {
  designazioneFilettatura,
  generaForo,
  generaParallelo,
  generaProgressiva,
  generaSerie,
  generaSmusso,
  leaderFilettatura
} from '../geometry/quotaTecnica';

/**
 * Creazione delle annotazioni con valori predefiniti proporzionati
 * alla risoluzione della foto: l'immagine esportata resta leggibile
 * a prescindere dai megapixel di partenza.
 */
export class FabbricaAnnotazioni {
  constructor(
    private foto: Foto,
    private impostazioni: Impostazioni
  ) {}

  private get lato(): number {
    return Math.max(this.foto.larghezzaPx, this.foto.altezzaPx);
  }

  stileBase(): Stile {
    const fattore = this.impostazioni.fattoreDimensione || 1;
    return {
      colore: this.impostazioni.stileDefault.colore,
      spessore: Math.max(1, Math.round((this.lato / 600) * fattore)),
      dimensioneTesto: Math.min(140, Math.max(12, Math.round((this.lato / 50) * fattore)))
    };
  }

  /** Stile delle quote: come quello base ma con il colore UNICO delle quote,
   *  così ogni quota (manuale o automatica) nasce con lo stesso aspetto. */
  private stileQuota(): Stile {
    return { ...this.stileBase(), colore: COLORE_QUOTA };
  }

  private prossimoZ(esistenti: Annotazione[]): number {
    return esistenti.reduce((max, a) => Math.max(max, a.zIndex), 0) + 1;
  }

  quota(p1: Punto, p2: Punto, sottotipo: SottotipoQuota, esistenti: Annotazione[]): Quota {
    const calibrata = haCalibrazione(this.foto);
    const q: Quota = {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quota',
      sottotipo,
      p1,
      p2,
      // la linea di quota nasce ESATTAMENTE sui punti scelti (nessuna linea
      // di estensione): trascinando la maniglia centrale la si sposta e
      // solo allora compaiono le linee guida
      offset: 0,
      valore: null,
      valoreAuto: calibrata,
      unita: this.impostazioni.unitaDefault,
      posizioneTesto: 'sopra',
      // un valore derivato dalla calibrazione è una stima, non un rilievo
      stato: calibrata ? 'stimata' : 'reale',
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileQuota()
    };
    if (calibrata) q.valore = valoreAutomatico(q, this.foto);
    return q;
  }

  /**
   * Poligono come OGGETTO UNICO: `coppie` sono gli indici dei vertici dei
   * segmenti quotati (lati e/o diagonali). Ogni segmento resta modificabile
   * da solo, ma fa parte dello stesso poligono. Numerato automaticamente.
   */
  poligono(punti: Punto[], coppie: Array<[number, number]>, esistenti: Annotazione[]): QuotaPoligono {
    const calibrata = haCalibrazione(this.foto);
    const unita = this.impostazioni.unitaDefault;
    const segmenti: SegmentoQuota[] = coppie.map(([da, a]) => ({
      da,
      a,
      valore: calibrata ? misuraSegmento(punti[da], punti[a], this.foto, unita) : null
    }));
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaPoligono',
      punti,
      segmenti,
      // vuota: il codice (A1, A2…) è assegnato automaticamente dalla
      // nomenclatura; questo campo resta solo come override manuale
      etichetta: '',
      valoreAuto: calibrata,
      unita,
      stato: calibrata ? 'stimata' : 'reale',
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileQuota()
    };
  }

  /** elemento a 4 lati: poligono unico quotato con base (0→1) e altezza (0→3) */
  quadrilatero(punti: [Punto, Punto, Punto, Punto], esistenti: Annotazione[]): QuotaPoligono {
    return this.poligono(
      punti,
      [
        [0, 1],
        [0, 3]
      ],
      esistenti
    );
  }

  /** poligono (triangolo, pentagono…): tutti i lati quotati */
  poligonoLati(punti: Punto[], esistenti: Annotazione[]): QuotaPoligono {
    const coppie = punti.map((_, i) => [i, (i + 1) % punti.length] as [number, number]);
    return this.poligono(punti, coppie, esistenti);
  }

  quotaAngolare(vertice: Punto, a: Punto, b: Punto, esistenti: Annotazione[]): QuotaAngolare {
    const q: QuotaAngolare = {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaAngolo',
      vertice,
      a,
      b,
      raggioArco: Math.max(30, Math.round(this.lato * 0.05)),
      valore: null,
      valoreAuto: true,
      // l'angolo misurato sull'immagine è una stima (salvo piano calibrato)
      stato: 'stimata',
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileQuota()
    };
    q.valore = valoreAutomatico(q, this.foto);
    return q;
  }

  quotaRaggio(centro: Punto, bordo: Punto, esistenti: Annotazione[]): QuotaRaggio {
    const calibrata = haCalibrazione(this.foto);
    const q: QuotaRaggio = {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaRaggio',
      centro,
      bordo,
      modo: 'raggio',
      valore: null,
      valoreAuto: calibrata,
      unita: this.impostazioni.unitaDefault,
      stato: calibrata ? 'stimata' : 'reale',
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileQuota()
    };
    if (calibrata) q.valore = valoreAutomatico(q, this.foto);
    return q;
  }

  testo(posizione: Punto, esistenti: Annotazione[]): TestoFoto {
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'testo',
      posizione,
      testo: '',
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileBase()
    };
  }

  freccia(p1: Punto, p2: Punto, esistenti: Annotazione[]): Freccia {
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'freccia',
      p1,
      p2,
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileBase()
    };
  }

  disegno(punti: number[], esistenti: Annotazione[]): DisegnoLibero {
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'disegno',
      punti,
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileBase()
    };
  }

  /**
   * Callout "foto nella foto": l'inserto viene collocato automaticamente
   * nell'angolo più lontano dal dettaglio, con etichetta progressiva (A, B…).
   */
  callout(sorgente: Rettangolo, esistenti: Annotazione[]): Callout {
    const W = this.foto.larghezzaPx;
    const H = this.foto.altezzaPx;
    const margine = Math.round(W * 0.025);
    const larghezzaInserto = Math.round(W * 0.34);
    const altezzaInserto = Math.round(
      (larghezzaInserto * sorgente.height) / Math.max(1, sorgente.width)
    );

    const cx = sorgente.x + sorgente.width / 2;
    const cy = sorgente.y + sorgente.height / 2;
    const angoli: Punto[] = [
      { x: margine, y: margine },
      { x: W - margine - larghezzaInserto, y: margine },
      { x: margine, y: H - margine - altezzaInserto },
      { x: W - margine - larghezzaInserto, y: H - margine - altezzaInserto }
    ];
    let migliore = angoli[0];
    let dMax = -1;
    for (const a of angoli) {
      const d = Math.hypot(a.x + larghezzaInserto / 2 - cx, a.y + altezzaInserto / 2 - cy);
      if (d > dMax) {
        dMax = d;
        migliore = a;
      }
    }

    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'callout',
      sorgente,
      inserto: { x: migliore.x, y: migliore.y, width: larghezzaInserto, height: altezzaInserto },
      // vuota: il codice (A1, B2…) è assegnato automaticamente dalla
      // nomenclatura; questo campo resta solo come override manuale
      etichetta: '',
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileBase()
    };
  }

  /** Etichetta alfabetica posata con un tap; la lettera è scelta dal chiamante. */
  etichetta(posizione: Punto, lettera: string, esistenti: Annotazione[]): Etichetta {
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'etichetta',
      posizione,
      lettera,
      descrizione: '',
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileBase()
    };
  }

  /** Forma di disegno generica (linea/rettangolo/cerchio/poligono). */
  forma(forma: TipoForma, punti: Punto[], esistenti: Annotazione[]): Forma {
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'forma',
      forma,
      punti,
      chiusa: forma === 'rettangolo' || forma === 'poligono' || forma === 'cerchio',
      partePerimetro: false,
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileBase()
    };
  }

  /** Stile delle quote tecniche: come quello base ma con il blu tecnico. */
  private stileQuotaTecnica(): Stile {
    return { ...this.stileBase(), colore: COLORE_QUOTA_TECNICA };
  }

  /** Offset di default della linea di quota tecnica dai punti (px immagine). */
  private offsetTecnicoDefault(): number {
    return Math.max(30, Math.round(this.stileBase().dimensioneTesto * 2.5));
  }

  /** Passo di impilamento di default delle quote in parallelo (px immagine). */
  private passoTecnicoDefault(): number {
    return Math.max(18, Math.round(this.stileBase().dimensioneTesto * 1.6));
  }

  private baseQuotaTecnica(
    sottotipo: 'serie' | 'parallelo' | 'progressiva',
    puntiOriginali: Punto[],
    unita: Unita,
    verso: VersoQuota,
    lineaGuida: { a: Punto; b: Punto },
    quote: QuotaTecnica['quote'],
    esistenti: Annotazione[]
  ): QuotaTecnica {
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaTecnica',
      sottotipo,
      lineaGuida,
      verso,
      unita,
      valoreAuto: haCalibrazione(this.foto),
      puntiOriginali,
      quote,
      partePerimetro: false,
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileQuotaTecnica()
    };
  }

  /**
   * Quotatura tecnica IN SERIE da N punti posati: ordina i punti lungo la
   * guida e genera la catena di quote allineate su un'unica linea di quota.
   */
  quotaTecnicaSerie(
    puntiOriginali: Punto[],
    opts: { unita?: Unita; offset?: number; verso?: VersoQuota },
    esistenti: Annotazione[]
  ): QuotaTecnica {
    const unita = opts.unita ?? this.impostazioni.unitaDefault;
    const verso: VersoQuota = opts.verso ?? 'sinistra';
    const offset = opts.offset ?? this.offsetTecnicoDefault();
    const { lineaGuida, quote } = generaSerie(puntiOriginali, this.foto, { unita, offset, verso });
    return this.baseQuotaTecnica('serie', puntiOriginali, unita, verso, lineaGuida, quote, esistenti);
  }

  /** Quotatura tecnica IN PARALLELO: ogni punto quotato dall'origine, linee impilate. */
  quotaTecnicaParallelo(
    puntiOriginali: Punto[],
    opts: { unita?: Unita; offset?: number; passo?: number; verso?: VersoQuota; origineEstremo?: 'inizio' | 'fine' },
    esistenti: Annotazione[]
  ): QuotaTecnica {
    const unita = opts.unita ?? this.impostazioni.unitaDefault;
    const verso: VersoQuota = opts.verso ?? 'sinistra';
    const offset = opts.offset ?? this.offsetTecnicoDefault();
    const passo = opts.passo ?? this.passoTecnicoDefault();
    const origineEstremo = opts.origineEstremo ?? 'inizio';
    const { lineaGuida, quote } = generaParallelo(puntiOriginali, this.foto, {
      unita,
      offset,
      passo,
      verso,
      origineEstremo
    });
    const q = this.baseQuotaTecnica('parallelo', puntiOriginali, unita, verso, lineaGuida, quote, esistenti);
    return { ...q, passo, origineEstremo };
  }

  /** Quotatura tecnica PROGRESSIVA (ordinate da punto zero). */
  quotaTecnicaProgressiva(
    puntiOriginali: Punto[],
    opts: { unita?: Unita; offset?: number; verso?: VersoQuota; origineEstremo?: 'inizio' | 'fine' },
    esistenti: Annotazione[]
  ): QuotaTecnica {
    const unita = opts.unita ?? this.impostazioni.unitaDefault;
    const verso: VersoQuota = opts.verso ?? 'sinistra';
    const offset = opts.offset ?? this.offsetTecnicoDefault();
    const origineEstremo = opts.origineEstremo ?? 'inizio';
    const { lineaGuida, quote } = generaProgressiva(puntiOriginali, this.foto, {
      unita,
      offset,
      verso,
      origineEstremo
    });
    const q = this.baseQuotaTecnica('progressiva', puntiOriginali, unita, verso, lineaGuida, quote, esistenti);
    return { ...q, origineEstremo };
  }

  /** Quotatura foro: tre tap sul bordo → centro (circumcentro) + ⌀/R reali.
   *  null se i tre punti sono allineati. */
  quotaTecnicaForo(p0: Punto, p1: Punto, p2: Punto, esistenti: Annotazione[]): QuotaTecnica | null {
    const unita = this.impostazioni.unitaDefault;
    const r = generaForo(p0, p1, p2, this.foto, { unita, modo: 'diametro' });
    if (!r) return null;
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaTecnica',
      sottotipo: 'foro',
      verso: 'sinistra',
      unita,
      valoreAuto: haCalibrazione(this.foto),
      foro: r.foro,
      puntiOriginali: [p0, p1, p2],
      quote: [],
      partePerimetro: false,
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileQuotaTecnica()
    };
  }

  /** Smusso: due tap sugli estremi del segmento smussato → callout C/angolo. */
  quotaTecnicaSmusso(a: Punto, b: Punto, esistenti: Annotazione[]): QuotaTecnica {
    const unita = this.impostazioni.unitaDefault;
    const { smusso } = generaSmusso(a, b, this.foto, { unita, modo: 'C', angoloGradi: 45 });
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaTecnica',
      sottotipo: 'smusso',
      verso: 'sinistra',
      unita,
      valoreAuto: haCalibrazione(this.foto),
      smusso,
      puntiOriginali: [a, b],
      quote: [],
      partePerimetro: false,
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileQuotaTecnica()
    };
  }

  /** Filettatura: un tap (ancora) → callout normalizzata (default M8 × 1.25 - 6H). */
  quotaTecnicaFilettatura(ancora: Punto, esistenti: Annotazione[]): QuotaTecnica {
    const unita = this.impostazioni.unitaDefault;
    const off = Math.max(40, Math.round(this.stileBase().dimensioneTesto * 2.5));
    const filettatura: FilettaturaTecnica = {
      filettatura: 'interna',
      ancora,
      diametroNominale: 8,
      passo: 1.25,
      classeTolleranza: '6H',
      designazione: designazioneFilettatura({
        diametroNominale: 8,
        passo: 1.25,
        classeTolleranza: '6H'
      }),
      leader: leaderFilettatura(ancora, off)
    };
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaTecnica',
      sottotipo: 'filettatura',
      verso: 'sinistra',
      unita,
      filettatura,
      puntiOriginali: [ancora],
      quote: [],
      partePerimetro: false,
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileQuotaTecnica()
    };
  }

  /** Riferimento / datum: marcatore con lettera posato con un tap. */
  quotaTecnicaDatum(punto: Punto, lettera: string, esistenti: Annotazione[]): QuotaTecnica {
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaTecnica',
      sottotipo: 'datum',
      verso: 'sinistra',
      unita: this.impostazioni.unitaDefault,
      etichetta: lettera,
      riferimento: { riferimentoTipo: 'puntoZero', punti: [punto] },
      puntiOriginali: [punto],
      quote: [],
      partePerimetro: false,
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileQuotaTecnica()
    };
  }

  /** Legenda della foto (una sola): riquadro in basso a sinistra per default. */
  legenda(esistenti: Annotazione[]): Legenda {
    const W = this.foto.larghezzaPx;
    const H = this.foto.altezzaPx;
    const larghezza = Math.round(W * 0.32);
    const altezza = Math.round(H * 0.28);
    const margine = Math.round(W * 0.025);
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'legenda',
      posizione: { x: margine, y: Math.max(margine, H - margine - altezza) },
      larghezza,
      altezza,
      scalaTesto: 1,
      forma: 'arrotondato',
      zIndex: this.prossimoZ(esistenti),
      creatoIl: Date.now(),
      stile: this.stileBase()
    };
  }
}

/** Trasla un'annotazione di (dx, dy); per i callout si sposta solo l'inserto */
export function traslaAnnotazione(a: Annotazione, dx: number, dy: number): Annotazione {
  switch (a.tipo) {
    case 'quota':
    case 'freccia':
      return {
        ...a,
        p1: { x: a.p1.x + dx, y: a.p1.y + dy },
        p2: { x: a.p2.x + dx, y: a.p2.y + dy }
      };
    case 'quotaAngolo':
      return {
        ...a,
        vertice: { x: a.vertice.x + dx, y: a.vertice.y + dy },
        a: { x: a.a.x + dx, y: a.a.y + dy },
        b: { x: a.b.x + dx, y: a.b.y + dy }
      };
    case 'quotaRaggio':
      return {
        ...a,
        centro: { x: a.centro.x + dx, y: a.centro.y + dy },
        bordo: { x: a.bordo.x + dx, y: a.bordo.y + dy }
      };
    case 'quotaRett': {
      const punti = quadrilateroQuotaRett(a).map((p) => ({ x: p.x + dx, y: p.y + dy })) as [
        Punto,
        Punto,
        Punto,
        Punto
      ];
      const { rect: _r, ...resto } = a;
      return { ...resto, punti };
    }
    case 'quotaPoligono':
      return { ...a, punti: a.punti.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'testo':
      return {
        ...a,
        posizione: { x: a.posizione.x + dx, y: a.posizione.y + dy },
        ancora: a.ancora ? { x: a.ancora.x + dx, y: a.ancora.y + dy } : undefined
      };
    case 'disegno': {
      const punti = a.punti.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
      return { ...a, punti };
    }
    case 'callout':
      return { ...a, inserto: { ...a.inserto, x: a.inserto.x + dx, y: a.inserto.y + dy } };
    case 'etichetta':
    case 'legenda':
      return { ...a, posizione: { x: a.posizione.x + dx, y: a.posizione.y + dy } };
    case 'forma':
      return { ...a, punti: a.punti.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'quotaTecnica': {
      const t = (p: Punto): Punto => ({ x: p.x + dx, y: p.y + dy });
      return {
        ...a,
        lineaGuida: a.lineaGuida ? { a: t(a.lineaGuida.a), b: t(a.lineaGuida.b) } : undefined,
        riferimento: a.riferimento
          ? { ...a.riferimento, punti: a.riferimento.punti.map(t) }
          : undefined,
        puntiOriginali: a.puntiOriginali.map(t),
        quote: a.quote.map((q) => ({
          ...q,
          p1: t(q.p1),
          p2: t(q.p2),
          estensioni: q.estensioni?.map((e) => ({ ...e, daPunto: t(e.daPunto), aPunto: t(e.aPunto) }))
        })),
        foro: a.foro ? { ...a.foro, centro: t(a.foro.centro) } : undefined,
        smusso: a.smusso
          ? {
              ...a.smusso,
              a: t(a.smusso.a),
              b: t(a.smusso.b),
              leader: a.smusso.leader ? { da: t(a.smusso.leader.da), a: t(a.smusso.leader.a) } : undefined
            }
          : undefined,
        filettatura: a.filettatura
          ? {
              ...a.filettatura,
              ancora: t(a.filettatura.ancora),
              leader: a.filettatura.leader
                ? { da: t(a.filettatura.leader.da), a: t(a.filettatura.leader.a) }
                : undefined
            }
          : undefined
      };
    }
  }
}
