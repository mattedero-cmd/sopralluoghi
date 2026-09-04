# La proposta per il menù

Sorgenti della proposta di riordino del menù strumenti — non entra
nell'applicazione: da qui si genera il canvas che si guarda e si commenta.

    icone.js        le 53 icone, tutte diverse, nello stile dell'app
                    (24×24, tratto 1.8, currentColor, estremi tondi)
    genera.mjs      → Main.dc.html (barra della FOTO) e Pianta.dc.html
    genera2.mjs     → Icone.dc.html (la tavola) e Doppioni.dc.html (l'analisi)
    genera3.mjs     → Prima.dc.html (la barra di oggi, con le icone VERE
                      estratte da src/components/Icona.tsx)
    canvas.json     dove stanno gli artboard sulla tela

Per rifare tutto:

    node genera.mjs && node genera2.mjs && node genera3.mjs

Il canvas cucito (`menu-sopralluoghi.html`, 2,5 MB) non si versiona: si
ricuce con `seed-canvas.mjs` passando i cinque `.dc.html` e `canvas.json`.

## Cosa dice la proposta

70 voci di menù → 33; 26 icone (l'icona «angolo» ne copre sette da sola)
→ 53, nessuna ripetuta; tre menù sulla foto → due, perché la pianta è un
altro documento (`foto.ePianta`), non una scheda della foto.

Due difetti trovati nel codice mentre la si studiava, ancora da correggere:

- `togliPiano` è dichiarato (EditorFoto.tsx:217), implementato (:1004) e
  gestito (:4853), ma nessuna voce di menù lo richiama: il piano si toglie
  soltanto da una scheda flottante, per caso.
- «Schizzo stanza» (`s: 'schizzo'`, :271) e «Mano libera» del menù Schizzo
  (`tool: 'schizzo'`, :402) sono lo STESSO strumento con due nomi e due
  icone; e sulla foto normale apre un menù parametrico che quel documento
  non sa eseguire (35 rami chiusi da `foto.ePianta`).
