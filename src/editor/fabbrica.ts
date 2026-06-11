import type {
  Annotazione,
  Callout,
  DisegnoLibero,
  Foto,
  Freccia,
  Impostazioni,
  Punto,
  Quota,
  Rettangolo,
  SottotipoQuota,
  Stile,
  TestoFoto
} from '../db/types';
import { nuovoId } from '../utils/id';

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
    return {
      id: nuovoId(),
      fotoId: this.foto.id,
      tipo: 'quota',
      sottotipo,
      p1,
      p2,
      offset: Math.max(28, Math.round(this.lato * 0.035)),
      valore: null,
      unita: this.impostazioni.unitaDefault,
      posizioneTesto: 'sopra',
      stato: 'reale',
      zIndex: this.prossimoZ(esistenti),
      stile: this.stileBase()
    };
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
