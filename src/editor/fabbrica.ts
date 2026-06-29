import type {
  Annotazione,
  Callout,
  DisegnoLibero,
  Etichetta,
  Foto,
  Freccia,
  Impostazioni,
  Legenda,
  Punto,
  Quota,
  QuotaAngolare,
  QuotaPoligono,
  QuotaRaggio,
  Rettangolo,
  SegmentoQuota,
  SottotipoQuota,
  Stile,
  TestoFoto
} from '../db/types';
import { COLORE_QUOTA, quadrilateroQuotaRett } from '../db/types';
import { nuovoId } from '../utils/id';
import { haCalibrazione, misuraSegmento, valoreAutomatico } from '../geometry/calibrazione';

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
  }
}
