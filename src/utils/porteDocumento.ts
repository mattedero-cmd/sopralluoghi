/**
 * LE PORTE NEI PDF.
 *
 * Il rilievo porta sa disegnare le istruzioni di montaggio e fare il piano
 * delle bobine; l'app no, e non deve rifarlo. Qui lo si apre in un riquadro
 * NASCOSTO, gli si passano porte, quantità e scelte del piano di taglio, e si
 * raccolgono:
 *
 * - il riepilogo delle bobine delle porte a strisce;
 * - il PDF di montaggio di ogni porta, le cui pagine diventano immagini per
 *   entrare in coda al PDF del sopralluogo (che è fatto con un altro motore).
 */

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ID, Porta } from '../db/types';
import { contaPorte, nestingDiProgetto, portePerProgetto } from '../db/repository';
import { migraDocumento } from './documentoNesting';
import {
  gruppiMontaggio,
  modoPorta,
  nomePorte,
  type ModoPorta,
  type PorteNesting,
  type RiepilogoStrisce
} from './portePiano';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Porta come la riceve il rilievo porta. */
export interface PortaPerRilievo {
  id: ID;
  nome: string;
  qty: number;
  modo: ModoPorta;
  config: unknown;
  descrizione: string;
  righe: Porta['righe'];
}

/** Porte del progetto con quantità e scelte del suo piano di taglio. */
export async function contestoPorte(progettoId: ID): Promise<{
  porte: Porta[];
  conto: Map<ID, number>;
  sezione: PorteNesting | undefined;
  perRilievo: PortaPerRilievo[];
}> {
  const [porte, conto, lavoro] = await Promise.all([
    portePerProgetto(progettoId),
    contaPorte(progettoId),
    nestingDiProgetto(progettoId)
  ]);
  const sezione = lavoro ? migraDocumento(lavoro.documento)?.porte : undefined;
  return {
    porte,
    conto,
    sezione,
    perRilievo: porte.map((p) => ({
      id: p.id,
      nome: p.nome,
      qty: conto.get(p.id) ?? 0,
      modo: modoPorta(sezione, p.id),
      config: p.config,
      descrizione: p.descrizione,
      righe: p.righe
    }))
  };
}

/** Il rilievo porta in un riquadro invisibile, a cui si parla per messaggi. */
class RilievoNascosto {
  private frame: HTMLIFrameElement;
  private attese: Array<{ tipo: string; risolvi: (m: Record<string, unknown>) => void }> = [];
  private ascolta = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin || ev.source !== this.frame.contentWindow) return;
    const m = ev.data as Record<string, unknown>;
    if (!m || m.sorgente !== 'rilievo-porta') return;
    const i = this.attese.findIndex((a) => a.tipo === m.tipo || (m.tipo === 'errore' && a.tipo === 'file'));
    if (i >= 0) this.attese.splice(i, 1)[0].risolvi(m);
  };

  constructor() {
    this.frame = document.createElement('iframe');
    // fuori schermo ma con una misura vera: i disegni si misurano
    Object.assign(this.frame.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '420px',
      height: '900px',
      border: '0',
      visibility: 'hidden'
    });
    this.frame.setAttribute('aria-hidden', 'true');
    window.addEventListener('message', this.ascolta);
  }

  aspetta(tipo: string, ms = 60000): Promise<Record<string, unknown>> {
    return new Promise((risolvi, rifiuta) => {
      const voce = { tipo, risolvi: (m: Record<string, unknown>) => (clearTimeout(t), risolvi(m)) };
      const t = setTimeout(() => {
        this.attese = this.attese.filter((a) => a !== voce);
        rifiuta(new Error('Il rilievo porta non ha risposto.'));
      }, ms);
      this.attese.push(voce);
    });
  }

  async apri(): Promise<void> {
    const pronta = this.aspetta('pronta');
    this.frame.src = '/rilievo-porta.html?ospite';
    document.body.append(this.frame);
    await pronta;
  }

  manda(msg: Record<string, unknown>) {
    this.frame.contentWindow?.postMessage({ destinazione: 'rilievo-porta', ...msg }, window.location.origin);
  }

  chiudi() {
    window.removeEventListener('message', this.ascolta);
    this.frame.remove();
  }
}

/** Pagine di un PDF come immagini JPEG (data URL), larghe `larghezzaPx`. */
async function pagineInImmagini(blob: Blob, larghezzaPx = 1400): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pagine: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: larghezzaPx / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    pagine.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  await pdf.destroy();
  return pagine;
}

export interface MontaggioPorta {
  porta: Porta;
  quantita: number;
  modo: ModoPorta;
  /** numero del gruppo di istruzioni di montaggio */
  gruppo: number;
}

export interface GruppoDelReport {
  numero: number;
  /** «Porte A, B, C» */
  nome: string;
  porte: MontaggioPorta[];
  /** pagine delle istruzioni comuni, come immagini (vuoto se non generate) */
  pagine: string[];
}

export interface PorteDelReport {
  porte: MontaggioPorta[];
  gruppi: GruppoDelReport[];
  /** piano delle bobine delle porte a strisce (null se non ce ne sono) */
  bobine: RiepilogoStrisce | null;
}

/**
 * Tutto quello che serve al PDF del sopralluogo sulle porte: piano delle
 * bobine e istruzioni di montaggio di ogni porta presente sulle foto.
 * `null` se il progetto non ha porte.
 */
export async function porteDelReport(
  progettoId: ID,
  avanzamento?: (msg: string) => void
): Promise<PorteDelReport | null> {
  const ctx = await contestoPorte(progettoId);
  const usate = ctx.perRilievo.filter((p) => p.qty > 0);
  if (usate.length === 0) return null;
  const rilievo = new RilievoNascosto();
  try {
    await rilievo.apri();
    const piano = ctx.sezione?.piano ?? null;
    // piano delle bobine: solo le porte a strisce
    let bobine: RiepilogoStrisce | null = null;
    const strisce = usate.filter((p) => p.modo === 'strisce');
    if (strisce.length) {
      avanzamento?.('Porte: piano delle bobine…');
      const risposta = rilievo.aspetta('piano', 20000);
      rilievo.manda({ tipo: 'apri', modo: 'lavoro', porte: strisce, piano });
      bobine = ((await risposta).riepilogo as RiepilogoStrisce | null) ?? null;
    }
    // un'istruzione per famiglia costruttiva, fatta sulla prima porta del gruppo
    const gruppi: GruppoDelReport[] = [];
    const porte: MontaggioPorta[] = [];
    for (const g of gruppiMontaggio(ctx.porte.filter((p) => usate.some((u) => u.id === p.id)))) {
      const membri: MontaggioPorta[] = g.porte.map((porta) => {
        const u = usate.find((x) => x.id === porta.id)!;
        return { porta, quantita: u.qty, modo: u.modo, gruppo: g.numero };
      });
      porte.push(...membri);
      const nome = nomePorte(g.porte);
      const capo = usate.find((x) => x.id === g.porte[0].id)!;
      let pagine: string[] = [];
      if (capo.config && typeof capo.config === 'object' && Object.keys(capo.config).length) {
        avanzamento?.(`Porte: montaggio ${nome}…`);
        const file = rilievo.aspetta('file', 90000);
        rilievo.manda({
          tipo: 'pdf',
          id: capo.id,
          porte: usate,
          piano,
          gruppo: { nome, qty: membri.reduce((n, m) => n + m.quantita, 0) }
        });
        const m = await file;
        if (m.blob instanceof Blob) pagine = await pagineInImmagini(m.blob);
      }
      gruppi.push({ numero: g.numero, nome, porte: membri, pagine });
    }
    return { porte, gruppi, bobine };
  } finally {
    rilievo.chiudi();
  }
}
