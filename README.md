# Sopralluoghi — PWA per quotatura su foto e report tecnici

Strumento di lavoro professionale per sopralluoghi tecnici: quotatura delle foto
come in un disegno tecnico (non distruttiva), note, callout di dettaglio e
report PDF strutturati. Progettata per l'uso reale sul campo: **funziona al
100% offline** e privilegia stabilità e sicurezza dei dati.

## Stato — Fase 1 (nucleo robusto)

- ✅ Cartelle annidabili + progetti (CRUD, spostamento, duplica come modello)
- ✅ Acquisizione foto da fotocamera/galleria con compressione, correzione
  orientamento EXIF, data scatto e geotag da EXIF (entrambi modificabili),
  miniature per le liste
- ✅ Editor di annotazioni vettoriali su canvas (Konva), **non distruttivo**:
  l'originale non viene mai modificato, tutto è rieditabile
- ✅ Quote lineari orizzontali / verticali / allineate con linee di estensione,
  frecce, valore + unità (mm/cm/m), posizione testo sopra/centro/sotto,
  marcatura **reale / stimata** (sempre distinte per colore, in app e nel PDF)
- ✅ **Catene di quote con auto-aggancio** (soglia configurabile) e somma
  automatica; snapping ai punti esistenti e modalità orto
- ✅ Foto-nella-foto (callout di dettaglio) con freccia leader ed etichetta
  automatica (A, B, C…)
- ✅ Testo su foto, disegno libero, frecce; due tipi di nota per foto:
  note visive sull'immagine e **note dato** (testo che finisce nel PDF)
- ✅ Undo/redo completo; **autosave transazionale** (IndexedDB via Dexie);
  indicatori stato salvataggio e online/offline sempre visibili
- ✅ **PDF strutturato**: copertina, indice con numeri di pagina, una sezione
  per foto (immagine quotata + note dato + tabella misure), riepilogo misure
  con totali delle catene, piè di pagina con numerazione
- ✅ Export immagine quotata JPEG ad alta risoluzione (download / Web Share)
- ✅ Archivio con ricerca testuale su progetti, note e didascalie
- ✅ **Backup/restore locale su file** (zip con foto originali) — transazionale
  e idempotente
- ✅ PWA installabile, app shell in cache, archiviazione persistente richiesta
  al browser, avviso preventivo di quota piena

## Stato — Fase 2 (quotatura avanzata e precisione)

- ✅ **Calibrazione di scala**: segmento di lunghezza nota → rapporto px↔reale;
  le quote successive vengono calcolate automaticamente (marcate `auto`,
  ricalcolate quando la geometria cambia, mai sovrascrivono un valore manuale).
  Una quota già misurata può diventare riferimento di scala ("Usa come scala").
- ✅ **Quotatura in prospettiva (omografia/DLT)**: 4 punti di un rettangolo
  reale noto (porta, piastrella…) → tutte le misure su quel piano vengono
  calcolate correggendo la prospettiva (`src/geometry/omografia.ts`).
- ✅ **Quote angolari** (vertice + due lati, arco con frecce, gradi calcolati
  dalla geometria — sul piano rettificato se calibrato) e **raggio/diametro**
  (circonferenza di riferimento, modalità R/⌀).
- ✅ **Snap angolare** (vincolo direzioni a 15°, ciclo Off→Orto→15°) e
  **snap a bordi/spigoli** (rilevamento contorni Sobel locale).
- ✅ **Layer**: mostra/nascondi separatamente quote, note e callout.
- ✅ **Dettatura vocale** delle note dato in italiano (Web Speech API, it-IT).

## Stato — Fase 3 (cloud e gestione lavoro)

- ✅ **Anagrafica clienti**: CRUD completo, ricerca, scheda cliente con
  storico lavori (sopralluoghi e preventivi collegati). Eliminare un cliente
  scollega i documenti senza eliminarli; rinominarlo aggiorna i progetti.
- ✅ **Preventivi collegati ai sopralluoghi**: numerazione progressiva per
  anno, voci con quantità/unità/prezzo, **importazione delle misure rilevate**
  (quote con valore → voci), sconto e IVA, totali, stato
  bozza/inviato/accettato/rifiutato, **PDF del preventivo** con intestazione
  professionale e condivisione.
- ✅ **Backup cloud offline-first** (Supabase via REST, senza SDK): copia
  unidirezionale dispositivo→cloud del backup completo, elenco dei backup,
  ripristino, stato dell'ultimo backup sempre visibile. Il cloud è solo una
  copia di sicurezza: l'app non ne dipende mai. Setup una tantum nelle
  Impostazioni (progetto Supabase gratuito + bucket privato "backup").
- ✅ Ricerca globale estesa a clienti e preventivi; lente di ingrandimento
  con mirino per il posizionamento di precisione al tocco.

Restano per iterazioni future: metrologia 3D da punti di fuga, quote ad
arco/baseline dedicate (le catene coprono già le quote in serie), sync cloud
bidirezionale.

## Stack

| Area | Scelta |
| --- | --- |
| UI | React 18 + TypeScript, Vite |
| PWA / offline | vite-plugin-pwa (Workbox, precache app shell) |
| Persistenza | IndexedDB via Dexie (unica fonte di verità; foto come Blob) |
| Canvas | Konva / react-konva |
| PDF | pdfmake (indice/TOC nativo, tutto client-side) |
| Backup | JSZip; EXIF: exifr |

### Architettura chiave

- **`src/geometry/primitive.ts`** — le annotazioni vengono trasformate in
  *primitive di disegno* usate sia dall'editor interattivo sia dal renderer
  Canvas2D di export/PDF: ciò che si vede a schermo è esattamente ciò che si
  esporta.
- **`src/db/repository.ts`** — tutte le scritture passano da un unico punto:
  transazioni atomiche, stato di salvataggio visibile, errori mai silenziosi
  (incl. quota storage piena), integrità relazionale (una foto non può essere
  orfana, le annotazioni appartengono sempre alla foto corretta).
- **Catene di quote** calcolate dinamicamente dagli estremi condivisi
  (`src/geometry/catene.ts`): nessuno stato duplicato, sempre coerenti.

## Sviluppo

```bash
npm install
npm run dev       # sviluppo
npm test          # unit test (geometria, catene, repository su fake-indexeddb)
npm run build     # type-check + build produzione + service worker
npm run preview   # prova della build
```
