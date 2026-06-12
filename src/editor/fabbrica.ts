import type {
  Annotazione,
  Callout,
  DisegnoLibero,
  Foto,
  Freccia,
  Impostazioni,
  Punto,
  Quota,
  QuotaAngolare,
  QuotaRaggio,
  QuotaRettangolo,
  Rettangolo,
  SottotipoQuota,
  Stile,
  TestoFoto
} from '../db/types';
import { quadrilateroQuotaRett } from '../db/types';
import { nuovoId } from '../utils/id';
import { haCalibrazione, misureRettangolo, valoreAutomatico } from '../geometry/calibrazione';

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
      offset: Math.max(28, Math.round(this.lato * 0.035)),
      valore: null,
      valoreAuto: calibrata,
      unita: this.impostazioni.unitaDefault,
      posizioneTesto: 'sopra',
      // un valore derivato dalla calibrazione è una stima, non un rilievo
      stato: calibrata ? 'stimata' : 'reale',
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileBase()
    };
    if (calibrata) q.valore = valoreAutomatico(q, this.foto);
    return q;
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
      stile: this.stileBase()
    };
    q.valore = valoreAutomatico(q, this.foto);
    return q;
  }

  /**
   * Quota elemento (quadrilatero): un solo oggetto per base × altezza.
   * Riceve i 4 angoli (alto-sx, alto-dx, basso-dx, basso-sx) e viene
   * nomenclaturata automaticamente (1, 2, 3…) per distinguere le forme.
   */
  quotaRettangolo(punti: [Punto, Punto, Punto, Punto], esistenti: Annotazione[]): QuotaRettangolo {
    const calibrata = haCalibrazione(this.foto);
    const numero = esistenti.filter((a) => a.tipo === 'quotaRett').length + 1;
    const q: QuotaRettangolo = {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quotaRett',
      punti,
      etichetta: String(numero),
      valoreBase: null,
      valoreAltezza: null,
      valoreAuto: calibrata,
      unita: this.impostazioni.unitaDefault,
      stato: calibrata ? 'stimata' : 'reale',
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileBase()
    };
    if (calibrata) {
      const m = misureRettangolo(punti, this.foto, q.unita);
      if (m) {
        q.valoreBase = m.base;
        q.valoreAltezza = m.altezza;
      }
    }
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
      stile: this.stileBase()
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

    const nCallout = esistenti.filter((a) => a.tipo === 'callout').length;
    const etichetta = String.fromCharCode(65 + (nCallout % 26));

    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'callout',
      sorgente,
      inserto: { x: migliore.x, y: migliore.y, width: larghezzaInserto, height: altezzaInserto },
      etichetta,
      zIndex: this.prossimoZ(esistenti),
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
    case 'testo':
      return { ...a, posizione: { x: a.posizione.x + dx, y: a.posizione.y + dy } };
    case 'disegno': {
      const punti = a.punti.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
      return { ...a, punti };
    }
    case 'callout':
      return { ...a, inserto: { ...a.inserto, x: a.inserto.x + dx, y: a.inserto.y + dy } };
  }
}
