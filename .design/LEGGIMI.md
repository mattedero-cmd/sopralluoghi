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

Due difetti trovati nel codice mentre la si studiava, ora corretti (1.58.0):

- `togliPiano` era dichiarato, implementato e gestito, ma nessuna voce di
  menù lo richiamava: il piano si metteva e non si toglieva più. Adesso sta
  nel pannello della calibrazione, accanto a «Togli la scala».
- «Schizzo stanza» e «Mano libera» del menù Schizzo erano lo STESSO
  strumento con due nomi e due icone; e sulla foto normale apriva un menù
  parametrico che quel documento non sa eseguire (35 rami chiusi da
  `foto.ePianta`). Adesso la voce sulla foto è una PORTA: apre (o riapre) il
  documento pianta ricalcato su quella foto.

## Dove l'app finita si scosta dalla proposta

La proposta metteva la calibrazione in una striscia con tutte e sei le voci
per esteso. Misurata nel browser su uno schermo da 390 px, quella striscia
è larga 787 px con la foto scalibrata e 966 px con scala e piano: i due
terzi restavano fuori, e una striscia che si legge solo scorrendola non è
più visibile del cassetto di prima. Nell'app la striscia porta lo STATO
(sempre a schermo, in giallo quando manca) più la via più rapida; gli altri
modi stanno nel pannello dove si aprono tutti gli altri strumenti, divisi
fra SCALA e PIANO.

Rispetto alle 53 icone della proposta l'app ne ha 108 in tutto: le 53 nuove
si aggiungono a quelle che il resto dell'applicazione già usava, più
`tondo-filetto` per la Filettatura, che la proposta aveva lasciato fuori dal
gruppo Tondi.
