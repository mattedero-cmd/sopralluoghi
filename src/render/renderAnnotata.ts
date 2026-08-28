import type { Annotazione, Callout, Foto } from '../db/types';
import { primitiveAnnotazione, primitiveCatene, type Primitiva } from '../geometry/primitive';
import { vociLegenda } from '../geometry/nomenclatura';
import { blobOrigine, canvasInBlob, caricaImmagine } from '../utils/image';
import { immagineCensurata } from '../utils/censura';
import { caricaDettaglio } from './../utils/immaginiCallout';

/**
 * LA FOTO E BASTA, senza una riga sopra.
 *
 * Serve per mandarla a chi non c'entra col rilievo — il cliente che vuole
 * vedere com'è messa la finestra, il collega che deve riconoscere il posto —
 * e vale anche quando la foto è già stata quotata: le quote restano
 * nell'archivio, quello che esce è la fotografia.
 *
 * I VOLTI OSCURATI RESTANO OSCURATI. La censura non è un'annotazione: è una
 * cosa che si è chiesto di togliere dall'immagine, e togliere le quote non
 * può rimetterla dentro.
 */
export async function renderFotoPulita(
  foto: Foto,
  formato: 'image/jpeg' | 'image/png' = 'image/jpeg',
  qualita = 0.92
): Promise<Blob> {
  const originale = await caricaImmagine(blobOrigine(foto));
  const img = immagineCensurata(originale, foto.larghezzaPx, foto.altezzaPx, foto.censure);
  const canvas = document.createElement('canvas');
  canvas.width = foto.larghezzaPx;
  canvas.height = foto.altezzaPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasInBlob(canvas, formato, qualita);
}

/**
 * Renderer di export: disegna l'originale + le primitive delle annotazioni
 * su un canvas e produce una COPIA appiattita ad alta risoluzione.
 * L'originale in archivio non viene mai toccato.
 * Usato sia per l'export JPEG/PNG sia per le immagini del PDF.
 */
export async function renderFotoAnnotata(
  foto: Foto,
  annotazioni: Annotazione[],
  formato: 'image/jpeg' | 'image/png' = 'image/jpeg',
  qualita = 0.92,
  /** codice/etichetta strutturato della forma (nomenclatura): se assente si usa
   *  l'etichetta grezza salvata. Serve perché la foto del PDF mostri A1, A1.1… */
  codiceForma?: (a: Annotazione) => string | undefined,
  /** disegna ANCHE la legenda dentro l'immagine. Per il PDF resta false (la
   *  legenda è trascritta a parte); per la condivisione come immagine è true
   *  così l'immagine contiene tutto, legenda compresa. */
  opzioni?: { legenda?: boolean }
): Promise<Blob> {
  const originale = await caricaImmagine(blobOrigine(foto));
  // PRIVACY: da qui in avanti si lavora SOLO sulla copia con i volti
  // oscurati — anche gli ingrandimenti dei callout (primitiva 'ritaglio')
  // ricampionano questa, così un volto non può riaffiorare nell'inserto.
  const img = immagineCensurata(originale, foto.larghezzaPx, foto.altezzaPx, foto.censure);
  const canvas = document.createElement('canvas');
  canvas.width = foto.larghezzaPx;
  canvas.height = foto.altezzaPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
  ctx.imageSmoothingQuality = 'high';
  if (foto.sfondoNascosto) {
    // pianta con sfondo nascosto: solo lo schizzo su bianco, niente foto
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  // foto-dettaglio dei callout: precaricate, così l'export le disegna
  const dettagli = new Map<string, HTMLImageElement>();
  for (const a of annotazioni) {
    if (a.tipo === 'callout' && a.fotoDettaglio) {
      try {
        dettagli.set(a.id, await caricaDettaglio(a.fotoDettaglio));
      } catch {
        // foto-dettaglio illeggibile: l'inserto resterà col segnaposto
      }
    }
  }
  const risolvi = (c: Callout) => dettagli.get(c.id) ?? null;

  // voci della legenda: vuote per il PDF (legenda esclusa dall'immagine),
  // valorizzate per la condivisione come immagine (legenda disegnata)
  const voci = opzioni?.legenda ? vociLegenda(annotazioni) : [];

  const ordinate = [...annotazioni].sort((a, b) => a.zIndex - b.zIndex);
  for (const ann of ordinate) {
    for (const p of primitiveAnnotazione(ann, risolvi, codiceForma, () => voci, {
      abbondanze: foto.mostraAbbondanze
    })) {
      disegnaPrimitiva(ctx, p, img);
    }
  }

  // evidenziazione delle misure concatenate, sopra le quote
  for (const p of primitiveCatene(annotazioni)) disegnaPrimitiva(ctx, p, img);

  // foto di dettaglio: sigla in alto a destra che richiama l'etichetta di origine
  if (foto.dettaglioDi) {
    disegnaBadgeDettaglio(ctx, canvas.width, canvas.height, foto.dettaglioDi.lettera, img);
  }

  return canvasInBlob(canvas, formato, qualita);
}

/** Sigla "▣ lettera" in alto a destra, per marcare una foto di dettaglio. */
function disegnaBadgeDettaglio(
  ctx: CanvasRenderingContext2D,
  larghezza: number,
  altezza: number,
  lettera: string,
  img: CanvasImageSource
): void {
  const lato = Math.max(larghezza, altezza);
  const dim = Math.max(18, Math.round(lato / 34));
  const testo = `▣ ${lettera}`;
  ctx.save();
  ctx.font = `bold ${dim}px system-ui, sans-serif`;
  const w = ctx.measureText(testo).width + dim * 1.1;
  const h = dim * 1.7;
  const margine = dim * 0.7;
  const rect = { x: larghezza - margine - w, y: margine, width: w, height: h };
  ctx.restore();
  disegnaPrimitiva(
    ctx,
    {
      kind: 'rettangolo',
      rect,
      colore: '#1a73e8',
      spessore: 0,
      riempimento: '#1a73e8',
      raggio: h / 2
    },
    img
  );
  disegnaPrimitiva(
    ctx,
    {
      kind: 'testo',
      testo,
      posizione: { x: rect.x + w / 2, y: rect.y + h / 2 },
      rotazioneDeg: 0,
      dimensione: dim,
      colore: '#ffffff',
      sfondo: null
    },
    img
  );
}

export function disegnaPrimitiva(
  ctx: CanvasRenderingContext2D,
  p: Primitiva,
  originale: CanvasImageSource
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (p.kind) {
    case 'linea': {
      if (p.tratteggio) ctx.setLineDash(p.tratteggio);
      ctx.beginPath();
      ctx.moveTo(p.punti[0], p.punti[1]);
      ctx.lineTo(p.punti[2], p.punti[3]);
      if (p.alone) {
        ctx.strokeStyle = p.alone;
        ctx.lineWidth = p.spessore + Math.max(2, p.spessore * 0.9);
        ctx.stroke();
      }
      ctx.strokeStyle = p.colore;
      ctx.lineWidth = p.spessore;
      ctx.stroke();
      break;
    }
    case 'polilinea': {
      ctx.beginPath();
      ctx.moveTo(p.punti[0], p.punti[1]);
      for (let i = 2; i < p.punti.length; i += 2) {
        ctx.lineTo(p.punti[i], p.punti[i + 1]);
      }
      if (p.alone && !p.tratteggio) {
        ctx.strokeStyle = p.alone;
        ctx.lineWidth = p.spessore + Math.max(2, p.spessore * 0.9);
        ctx.stroke();
      }
      if (p.tratteggio) ctx.setLineDash(p.tratteggio);
      ctx.strokeStyle = p.colore;
      ctx.lineWidth = p.spessore;
      ctx.stroke();
      break;
    }
    case 'poligono': {
      ctx.beginPath();
      ctx.moveTo(p.punti[0], p.punti[1]);
      for (let i = 2; i < p.punti.length; i += 2) {
        ctx.lineTo(p.punti[i], p.punti[i + 1]);
      }
      ctx.closePath();
      // contorno scuro attorno alla freccia, poi riempimento colorato
      if (p.alone) {
        ctx.strokeStyle = p.alone;
        ctx.lineWidth = Math.max(2, 3);
        ctx.stroke();
      }
      ctx.fillStyle = p.colore;
      ctx.fill();
      break;
    }
    case 'cerchio': {
      if (p.tratteggio) ctx.setLineDash(p.tratteggio);
      ctx.beginPath();
      ctx.arc(p.centro.x, p.centro.y, p.raggio, 0, Math.PI * 2);
      if (p.riempimento) {
        ctx.fillStyle = p.riempimento;
        ctx.fill();
      }
      if (p.alone) {
        ctx.strokeStyle = p.alone;
        ctx.lineWidth = p.spessore + Math.max(2, p.spessore * 0.9);
        ctx.stroke();
      }
      if (p.spessore > 0) {
        ctx.strokeStyle = p.colore;
        ctx.lineWidth = p.spessore;
        ctx.stroke();
      }
      break;
    }
    case 'arco': {
      ctx.beginPath();
      ctx.arc(p.centro.x, p.centro.y, p.raggio, p.inizio, p.fine, p.antiorario);
      if (p.alone) {
        ctx.strokeStyle = p.alone;
        ctx.lineWidth = p.spessore + Math.max(2, p.spessore * 0.9);
        ctx.stroke();
      }
      ctx.strokeStyle = p.colore;
      ctx.lineWidth = p.spessore;
      ctx.stroke();
      break;
    }
    case 'rettangolo': {
      const r = p.raggio ?? 0;
      if (r > 0) {
        const rr = Math.min(r, p.rect.width / 2, p.rect.height / 2);
        ctx.beginPath();
        ctx.moveTo(p.rect.x + rr, p.rect.y);
        ctx.arcTo(p.rect.x + p.rect.width, p.rect.y, p.rect.x + p.rect.width, p.rect.y + p.rect.height, rr);
        ctx.arcTo(p.rect.x + p.rect.width, p.rect.y + p.rect.height, p.rect.x, p.rect.y + p.rect.height, rr);
        ctx.arcTo(p.rect.x, p.rect.y + p.rect.height, p.rect.x, p.rect.y, rr);
        ctx.arcTo(p.rect.x, p.rect.y, p.rect.x + p.rect.width, p.rect.y, rr);
        ctx.closePath();
        if (p.riempimento) {
          ctx.fillStyle = p.riempimento;
          ctx.fill();
        }
        if (p.spessore > 0) {
          ctx.strokeStyle = p.colore;
          ctx.lineWidth = p.spessore;
          ctx.stroke();
        }
      } else {
        if (p.riempimento) {
          ctx.fillStyle = p.riempimento;
          ctx.fillRect(p.rect.x, p.rect.y, p.rect.width, p.rect.height);
        }
        if (p.spessore > 0) {
          ctx.strokeStyle = p.colore;
          ctx.lineWidth = p.spessore;
          ctx.strokeRect(p.rect.x, p.rect.y, p.rect.width, p.rect.height);
        }
      }
      break;
    }
    case 'ritaglio': {
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.destinazione.x, p.destinazione.y, p.destinazione.width, p.destinazione.height);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.destinazione.x, p.destinazione.y, p.destinazione.width, p.destinazione.height);
      ctx.drawImage(
        originale,
        p.sorgente.x,
        p.sorgente.y,
        p.sorgente.width,
        p.sorgente.height,
        p.destinazione.x,
        p.destinazione.y,
        p.destinazione.width,
        p.destinazione.height
      );
      ctx.restore();
      break;
    }
    case 'immagine': {
      // foto-dettaglio: riempie l'inserto mantenendo il riempimento bianco sotto
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.destinazione.x, p.destinazione.y, p.destinazione.width, p.destinazione.height);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.destinazione.x, p.destinazione.y, p.destinazione.width, p.destinazione.height);
      ctx.drawImage(
        p.img,
        p.destinazione.x,
        p.destinazione.y,
        p.destinazione.width,
        p.destinazione.height
      );
      ctx.restore();
      break;
    }
    case 'testo': {
      const font = `bold ${p.dimensione}px system-ui, sans-serif`;
      ctx.font = font;
      ctx.textAlign = p.allineamento === 'left' ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(p.posizione.x, p.posizione.y);
      ctx.rotate((p.rotazioneDeg * Math.PI) / 180);
      const righe = p.testo.split('\n');
      const altezzaRiga = p.dimensione * 1.25;
      const y0 = -((righe.length - 1) * altezzaRiga) / 2;
      if (p.sfondo) {
        const larghezza = Math.max(...righe.map((r) => ctx.measureText(r).width));
        const pad = p.dimensione * 0.25;
        ctx.fillStyle = p.sfondo;
        ctx.fillRect(
          -larghezza / 2 - pad,
          y0 - p.dimensione / 2 - pad,
          larghezza + pad * 2,
          (righe.length - 1) * altezzaRiga + p.dimensione + pad * 2
        );
      }
      // alone scuro per la leggibilità senza riquadro (stile quote)
      if (p.alone) {
        ctx.strokeStyle = p.alone;
        ctx.lineWidth = Math.max(2, p.dimensione * 0.2);
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        righe.forEach((riga, i) => {
          ctx.strokeText(riga, 0, y0 + i * altezzaRiga);
        });
      }
      ctx.fillStyle = p.colore;
      righe.forEach((riga, i) => {
        ctx.fillText(riga, 0, y0 + i * altezzaRiga);
      });
      break;
    }
  }
  ctx.restore();
}
