import { db } from '../db/db';
import {
  applicaMetadati,
  costruisciIndice,
  type Avanzamento,
  type IndiceArchivio
} from '../db/backup';
import { leggiImpostazioni, salvaImpostazioni } from '../db/repository';
import { apriContesto, caricaOggetto, elencaNomi, scaricaOggetto, scaricaTesto } from './supabaseBackup';
import { segnaSincronizzato } from './promemoria';

/**
 * Sincronizzazione incrementale tra dispositivi (manuale / su richiesta).
 *
 * Niente più mega-zip: l'archivio sul cloud è fatto di oggetti singoli —
 *  - `indice.json`: struttura, quote, clienti, preventivi, impostazioni;
 *  - `foto/<id>.jpg` e `miniature/<id>.jpg`: i binari, caricati una volta sola.
 *
 * Ogni sync:
 *  1. PULL — scarica l'indice, unisce i metadati (per id, senza cancellare) e
 *     scarica solo i binari delle foto che mancano in locale;
 *  2. PUSH — carica solo le foto non ancora presenti sul cloud e riscrive
 *     l'indice aggiornato.
 *
 * Così ogni notte/giornata viaggiano solo le novità: la sync diventa di pochi
 * secondi e non incontra i limiti di dimensione o i timeout dei file unici.
 */

const NOME_INDICE = 'indice.json';

let promessaInCorso: Promise<RisultatoSync> | null = null;

export interface RisultatoSync {
  /** foto nuove scaricate dal cloud */
  scaricate: number;
  /** foto nuove caricate sul cloud */
  caricate: number;
  /** totale foto presenti sul cloud dopo la sync */
  fotoCloud: number;
  /** progetti in archivio dopo la sync */
  progetti: number;
}

/**
 * Esegue la sincronizzazione. Se una sync è già in corso restituisce la STESSA
 * promessa: chi chiama attende il lavoro reale e ne riceve l'esito vero, senza
 * mai dichiarare un "successo" su un'operazione non eseguita.
 */
export function sincronizza(avanzamento?: Avanzamento): Promise<RisultatoSync> {
  if (promessaInCorso) return promessaInCorso;
  const p = eseguiSync(avanzamento);
  promessaInCorso = p;
  void p.catch(() => undefined).finally(() => {
    if (promessaInCorso === p) promessaInCorso = null;
  });
  return p;
}

function bufferDaBlob(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

async function eseguiSync(avanzamento?: Avanzamento): Promise<RisultatoSync> {
  const ctx = await apriContesto();

  // ----- PULL: indice + foto mancanti -----
  avanzamento?.('Lettura indice dal cloud…', 0);
  let scaricate = 0;
  const testo = await scaricaTesto(ctx, NOME_INDICE);
  if (testo) {
    const indice = JSON.parse(testo) as IndiceArchivio;
    await applicaMetadati(indice);
    // foto locali (con binari) per confronto: i binari servono solo a non perderli
    const locali = new Map((await db.foto.toArray()).map((f) => [f.id, f]));
    const daScaricare = indice.foto.filter((f) => !locali.has(f.id));
    // aggiorna i metadati (calibrazione, etichetta, ordine…) delle foto esistenti
    // solo quando la copia remota è più recente, riusando il binario locale
    const daAggiornare = indice.foto.filter((f) => {
      const l = locali.get(f.id);
      return l && f.modificataIl > l.modificataIl;
    });
    if (daAggiornare.length) {
      await db.transaction('rw', db.foto, async () => {
        for (const meta of daAggiornare) {
          await db.foto.put({ ...locali.get(meta.id)!, ...meta });
        }
      });
    }
    for (let i = 0; i < daScaricare.length; i++) {
      const meta = daScaricare[i];
      avanzamento?.('Scaricamento foto…', daScaricare.length ? i / daScaricare.length : 1);
      const orig = await scaricaOggetto(ctx, `foto/${meta.id}.jpg`);
      if (!orig) continue; // foto referenziata ma binario assente: salta
      const mini = await scaricaOggetto(ctx, `miniature/${meta.id}.jpg`);
      const origine = await bufferDaBlob(orig);
      const miniatura = mini ? await bufferDaBlob(mini) : origine.slice(0);
      await db.foto.put({
        ...meta,
        origine,
        origineTipo: meta.origineTipo || 'image/jpeg',
        miniatura,
        miniaturaTipo: meta.miniaturaTipo || 'image/jpeg'
      });
      scaricate++;
    }
  }

  // ----- PUSH: foto nuove + indice aggiornato -----
  avanzamento?.('Confronto con il cloud…', 0.45);
  const idCloud = new Set((await elencaNomi(ctx, 'foto/')).map((n) => n.replace(/\.jpg$/i, '')));
  const idLocali = (await db.foto.toCollection().primaryKeys()) as string[];
  const daCaricare = idLocali.filter((id) => !idCloud.has(id));
  let caricate = 0;
  for (let i = 0; i < daCaricare.length; i++) {
    const id = daCaricare[i];
    const foto = await db.foto.get(id);
    if (!foto) continue;
    avanzamento?.('Caricamento foto…', 0.45 + 0.45 * (daCaricare.length ? i / daCaricare.length : 1));
    await caricaOggetto(ctx, `foto/${id}.jpg`, new Blob([foto.origine], { type: 'image/jpeg' }), 'image/jpeg');
    await caricaOggetto(
      ctx,
      `miniature/${id}.jpg`,
      new Blob([foto.miniatura], { type: 'image/jpeg' }),
      'image/jpeg'
    );
    caricate++;
  }

  avanzamento?.('Aggiornamento indice…', 0.93);
  const indiceLocale = await costruisciIndice();
  await caricaOggetto(
    ctx,
    NOME_INDICE,
    new Blob([JSON.stringify(indiceLocale)], { type: 'application/json' }),
    'application/json'
  );

  // orario dell'ultima sincronizzazione + niente più modifiche in sospeso
  const imp = await leggiImpostazioni();
  const adesso = Date.now();
  if (imp.cloud) {
    await salvaImpostazioni({ ...imp, cloud: { ...imp.cloud, ultimaSync: adesso, ultimoBackup: adesso } });
  }
  segnaSincronizzato();
  avanzamento?.('Completato', 1);

  return {
    scaricate,
    caricate,
    fotoCloud: idCloud.size + caricate,
    progetti: indiceLocale.progetti.length
  };
}
