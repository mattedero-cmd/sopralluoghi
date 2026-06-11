import type { Annotazione, Foto } from '../db/types';
import { primitiveAnnotazione, type Primitiva } from '../geometry/primitive';
import { canvasInBlob, caricaImmagine } from '../utils/image';

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
  qualita = 0.92
): Promise<Blob> {
  const img = await caricaImmagine(foto.blobOriginale);
  const canvas = document.createElement('canvas');
  canvas.width = foto.larghezzaPx;
  canvas.height = foto.altezzaPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile su questo dispositivo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const ordinate = [...annotazioni].sort((a, b) => a.zIndex - b.zIndex);
  for (const ann of ordinate) {
    for (const p of primitiveAnnotazione(ann)) {
      disegnaPrimitiva(ctx, p, img);
    }
  }
  return canvasInBlob(canvas, formato, qualita);
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
      ctx.strokeStyle = p.colore;
      ctx.lineWidth = p.spessore;
      if (p.tratteggio) ctx.setLineDash(p.tratteggio);
      ctx.beginPath();
      ctx.moveTo(p.punti[0], p.punti[1]);
      ctx.lineTo(p.punti[2], p.punti[3]);
      ctx.stroke();
      break;
    }
    case 'polilinea': {
      ctx.strokeStyle = p.colore;
      ctx.lineWidth = p.spessore;
      ctx.beginPath();
      ctx.moveTo(p.punti[0], p.punti[1]);
      for (let i = 2; i < p.punti.length; i += 2) {
        ctx.lineTo(p.punti[i], p.punti[i + 1]);
      }
      ctx.stroke();
      break;
    }
    case 'poligono': {
      ctx.fillStyle = p.colore;
      ctx.beginPath();
      ctx.moveTo(p.punti[0], p.punti[1]);
      for (let i = 2; i < p.punti.length; i += 2) {
        ctx.lineTo(p.punti[i], p.punti[i + 1]);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'rettangolo': {
      if (p.riempimento) {
        ctx.fillStyle = p.riempimento;
        ctx.fillRect(p.rect.x, p.rect.y, p.rect.width, p.rect.height);
      }
      if (p.spessore > 0) {
        ctx.strokeStyle = p.colore;
        ctx.lineWidth = p.spessore;
        ctx.strokeRect(p.rect.x, p.rect.y, p.rect.width, p.rect.height);
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
    case 'testo': {
      const font = `bold ${p.dimensione}px system-ui, sans-serif`;
      ctx.font = font;
      ctx.textAlign = 'center';
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
      ctx.fillStyle = p.colore;
      righe.forEach((riga, i) => {
        ctx.fillText(riga, 0, y0 + i * altezzaRiga);
      });
      break;
    }
  }
  ctx.restore();
}
