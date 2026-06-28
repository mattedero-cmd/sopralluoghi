import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Icona } from './Icona';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Altezza massima dell'area di anteprima (la pagina ci sta sempre intera) */
const MAX_H = 460;

/**
 * Anteprima del PDF una pagina alla volta, dimensionata per stare intera, con
 * frecce e swipe per sfogliare. Renderizza le pagine con pdf.js (canvas).
 */
export default function AnteprimaPdf({ blob, generando }: { blob: Blob | null; generando?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [nPagine, setNPagine] = useState(0);
  const [pagina, setPagina] = useState(0); // 0-based
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const renderRef = useRef<RenderTask | null>(null);

  // Carica il documento a ogni nuovo blob (mantiene la pagina corrente)
  useEffect(() => {
    if (!blob) return;
    let vivo = true;
    let docLocale: PDFDocumentProxy | null = null;
    blob
      .arrayBuffer()
      .then((buf) => pdfjs.getDocument({ data: new Uint8Array(buf) }).promise)
      .then((d) => {
        if (!vivo) {
          void d.destroy();
          return;
        }
        docLocale = d;
        setDoc(d);
        setNPagine(d.numPages);
        setPagina((p) => Math.min(p, d.numPages - 1));
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (docLocale) void docLocale.destroy();
    };
  }, [blob]);

  // Renderizza la pagina corrente su canvas, fittata nell'area
  useEffect(() => {
    if (!doc) return;
    let vivo = true;
    (async () => {
      const page = await doc.getPage(pagina + 1);
      if (!vivo) return;
      const base = page.getViewport({ scale: 1 });
      const W = (wrapRef.current?.clientWidth ?? 320) - 2;
      let w = W;
      let h = (W * base.height) / base.width;
      if (h > MAX_H) {
        h = MAX_H;
        w = (MAX_H * base.width) / base.height;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: (w * dpr) / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderRef.current?.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderRef.current = task;
      try {
        await task.promise;
      } catch {
        return; // render annullato (cambio pagina/blob)
      }
      if (vivo) setImgUrl(canvas.toDataURL('image/jpeg', 0.9));
    })();
    return () => {
      vivo = false;
    };
  }, [doc, pagina]);

  const vai = (delta: number) => setPagina((p) => Math.max(0, Math.min(nPagine - 1, p + delta)));

  // swipe
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) vai(dx < 0 ? 1 : -1);
  };

  return (
    <div className="anteprima-sfoglia" ref={wrapRef}>
      <div className="anteprima-pagina-box" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {imgUrl ? (
          <img src={imgUrl} alt={`Pagina ${pagina + 1}`} className="anteprima-pagina-img" />
        ) : (
          <div className="anteprima-pagina-vuota" />
        )}
        {generando && <div className="anteprima-pdf-stato">Aggiorno…</div>}
        {nPagine > 1 && (
          <>
            <button
              className="sfoglia-freccia sx"
              aria-label="Pagina precedente"
              disabled={pagina === 0}
              onClick={() => vai(-1)}
            >
              <Icona nome="indietro" dimensione={22} />
            </button>
            <button
              className="sfoglia-freccia dx"
              aria-label="Pagina successiva"
              disabled={pagina >= nPagine - 1}
              onClick={() => vai(1)}
            >
              <Icona nome="avanti" dimensione={22} />
            </button>
          </>
        )}
      </div>
      {nPagine > 0 && (
        <div className="sfoglia-indicatore">
          Pagina {pagina + 1} di {nPagine}
        </div>
      )}
    </div>
  );
}
