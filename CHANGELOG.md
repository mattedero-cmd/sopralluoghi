# Novità per versione

Le voci sono in ordine dal più recente. La data di build che l'app mostra in
Impostazioni → «Versione dell'app» è indipendente da questi numeri: è la data
in cui la copia in cache è stata generata.

> Nota su cache e aggiornamenti: in questo progetto **non esistono**
> `service-worker.js`, `CACHE_NAME` né stringhe `?v=` da tenere allineate a
> mano. Il service worker lo genera `vite-plugin-pwa` a ogni build, con gli
> hash dei file nel precache: basta pubblicare una build nuova e il pulsante
> «Aggiorna all'ultima versione» fa il resto.

## 1.46.0 — Una misura per famiglia calibra la prospettiva

- **Un elemento ripetuto non pesa più di quel che vale.** Cinque copie dello
  stesso serramento portano cinque volte la stessa misura: contarle tutte
  darebbe a quel serramento il peso di tutta la parete, e la prospettiva
  finirebbe per assecondare lui. Adesso della famiglia entra UNA forma sola —
  l'ORIGINALE, cioè la misura presa sul posto (A1), non le sue repliche.
- Le copie «solo etichetta» (A1.2, A1.3… richiamate o duplicate) non entravano
  già prima, perché non hanno quote proprie. Il buco era un altro: due membri
  della stessa famiglia che portano entrambi le quote — dati vecchi, o due
  forme raggruppate dopo — contavano due volte. Ora no.
- Se l'originale della famiglia sta in un'altra foto, in questa comanda il
  membro che si vede meglio: il più grande nell'immagine, che è quello su cui
  l'errore del dito conta meno.

## 1.45.0 — Adesso le pareti si uniscono davvero

- **Il vertice di giunzione non si formava quasi mai.** Due pareti si uniscono
  quando i loro riquadri hanno un angolo in COMUNE: allora la maniglia diventa
  verde e tirandola si muovono tutte e due. Ma non bastava che i due bordi
  cadessero sulla stessa riga: appoggiavano sullo spigolo per tratti diversi —
  le finestre delle due pareti non stanno quasi mai alla stessa quota — e i
  loro angoli finivano a decine di pixel l'uno dall'altro. Sembravano uniti,
  non lo erano: la maniglia tornava gialla appena si mollava il dito.
- **Adesso le due pareti si prendono lo stesso filo.** Al vero spigolo di un
  fabbricato i due muri cominciano e finiscono insieme, e l'aggancio fa così:
  il riquadro più corto si allunga fino a coprire lo stesso tratto di spigolo
  dell'altro. Misurato: gli angoli passano da 37–93 px di distanza a meno di
  mezzo pixel, su foto da 1600, 3024 e 4032 px e con riquadri fino a cinque
  volte uno dell'altro.
- **Il difetto peggiorava con la risoluzione.** La soglia con cui due angoli si
  considerano lo stesso punto è in pixel dell'immagine: su uno scatto da 4032
  px valeva un quarto di quello che vale su uno da 1600, e sulle foto vere non
  si univa mai niente. Le prove ora girano su tutti e tre i formati.
- L'allungamento è solo ESTENSIONE del riquadro: la prospettiva non cambia di
  un millesimo, e nessuna misura si sposta.

## 1.44.0 — La riga dello spigolo passa per il vertice di giunzione

- **Lo spigolo segue l'angolo che hai in mano.** Finora la riga era solo
  *ricavata* dalle due prospettive — l'unica dove i due muri misurano uguale —
  e tirando il vertice di giunzione se ne andava per conto suo: le due pareti
  si leggevano come separate proprio nel punto in cui sono unite. Adesso dove
  i riquadri si toccano c'è un angolo che è di tutte e due, e la riga ci passa
  sempre. Con due angoli in comune la riga è tutta loro; con uno solo la
  posizione è sua e l'inclinazione la dà il filo dei due lati che si affacciano
  lì. Misurato dopo un ritocco a mano di 30 px: prima una delle due pareti
  restava larga 88 px dalla riga, ora il distacco è 31 px e distribuito fra le
  due.
- **La riga non sparisce più.** Dopo un ritocco a mano deciso le due
  prospettive possono non avere più nessuna riga in comune, e lo spigolo
  spariva dallo schermo proprio mentre lo si stava spostando. Ora lo spigolo
  fra due pareti unite c'è sempre: la sua inclinazione la danno i riquadri.
- **L'aggancio, il taglio dei riquadri e l'assegnazione delle misure usano la
  stessa riga che si vede.** Una sola verità: quello che tagli, quello che
  misuri e quello che disegni non possono dire tre cose diverse.
- **Quando le prospettive non reggono più, la riga diventa arancione.** Il
  disaccordo si mostra invece di nasconderlo disegnando altrove. La soglia è il
  2% della diagonale della foto — la precisione dello spigolo ricavato,
  misurata: sotto quella è rumore del conto, e un avviso che suona sempre non
  serve a niente. Un ritocco fino a ~40 px su una foto da 1600×1000 resta
  verde; uno strappo che manda via le prospettive diventa arancione.

## 1.43.0 — Un mirino che non sparisce mai

- **La croce della lente prende il colore complementare di ciò che
  attraversa.** Finora era un filetto bianco con l'alone nero: leggibile quasi
  sempre, ma «quasi» non basta quando un pixel di lente sono millimetri veri
  sul serramento. Adesso il filetto legge, tratto per tratto, i pixel che sta
  coprendo — foto e annotazioni comprese — e per ognuno usa il complementare:
  tinta ruotata di 180°, luminosità dalla parte opposta. Sul bianco va scuro,
  sul nero va chiaro, sul rosso diventa ciano. Misurato su tutta la gamma dei
  colori, il contrasto peggiore resta 3,8:1 (la soglia per la grafica non
  testuale è 3:1); nella lente vera, sopra una banda rossa, 5,4:1.
- **Croce continua, senza cerchietto.** I due filetti si incrociano: il punto è
  esattamente dove si toccano, e non c'è più il vuoto centrale che obbligava a
  immaginare dove cadesse. I due bracci vengono campionati PRIMA che se ne
  disegni uno, altrimenti il verticale, all'incrocio, leggerebbe il colore del
  mirino stesso e proprio il pixel centrale uscirebbe sbagliato.
- **Il mirino si parametrizza** in Impostazioni → «Mirino di precisione»:
  colore (complementare o fisso), spessore del filetto, vuoto al centro,
  cerchietto, dimensione e ingrandimento della lente. Con un riquadro di prova
  a bande — bianco, grigio, nero e tinte sature — per vedere subito l'effetto
  senza uscire dalle impostazioni.
- **Si torna indietro con un pulsante.** «Torna al mirino classico» rimette
  esattamente il filetto di prima (bianco, alone, vuoto e cerchietto);
  «Ripristina il predefinito» rimette il nuovo.

## 1.42.0 — Non tutti gli incroci sono angoli

- **L'incrocio a T non taglia più il muro.** Un tramezzo che tocca la parete
  nel mezzo fa uno spigolo vero, ma la parete CONTINUA dall'altra parte: prima
  il riquadro veniva tagliato e agganciato là, e una delle finestre restava
  fuori. Adesso l'app guarda da che parte stanno le forme: se una parete ne ha
  di qua e di là, quella riga non è un confine — lo spigolo si vede lo stesso,
  ma non taglia, non aggancia e non decide più a chi appartiene una misura.
- **L'aggancio è un ritocco, non uno stiramento.** Se per arrivare allo
  spigolo il bordo dovesse fare più di mezzo riquadro, le due pareti non si
  toccano in questa foto — una sta dietro l'altra, o l'angolo cade lontano — e
  si lascia perdere. E un aggancio non può mai portare fuori dal riquadro una
  forma della sua parete.
- **Le pareti di scorcio non scappano più dall'inquadratura.** Un muro ripreso
  quasi di taglio ha l'orizzonte a due passi dalle sue forme: allargare il
  riquadro di un quarto poteva portarne gli angoli a migliaia di pixel, e sullo
  schermo si vedevano righe verdi che scappavano da tutte le parti. Ora il
  riquadro resta nei paraggi delle forme da cui nasce.

## 1.41.0 — Le pareti unite, e il vertice di giunzione

- **Lo spigolo è verde**, come le pareti a cui appartiene: stessa famiglia di
  segni, una riga più marcata della griglia.
- **Le pareti nascono unite.** Il riquadro dell'una finisce dove comincia
  quello dell'altra, sulla riga dello spigolo: niente più bordi che si
  scavalcano, e le due griglie si toccano dove si tocca il fabbricato.
  L'aggancio ritocca solo l'ESTENSIONE del riquadro — la prospettiva non
  cambia di un millesimo — e vale sempre: alla nascita, quando il piano si
  rifà da solo, e dopo ogni aggiustata a mano.
- **Il vertice di giunzione si tira in due.** Sull'angolo del fabbricato le
  due pareti hanno lo stesso vertice, e adesso è una maniglia sola — verde e
  più grande delle altre. Tirandola si muovono tutte e due le prospettive
  insieme: l'angolo resta l'angolo, e le pareti non si staccano.

## 1.40.0 — Il piano segue le forme

- **Acceso il piano, comandano le forme.** Correggi la misura di una finestra
  o sposti l'angolo di un rettangolo quotato, e la prospettiva si rifà da
  sola: con lei tutte le misure calcolate. Non c'è più niente da ridare a
  mano — il piano è figlio di quelle forme, e le segue.
- Cambia **solo la parete che c'entra**: correggere una finestra del fronte
  non tocca il fianco.
- **Il riquadro verde resta dov'è**, anche se l'hai allargato tirando un lato:
  cambia la prospettiva, non fin dove arriva la griglia.
- **Una prospettiva aggiustata a mano non si tocca più.** Se hai spostato un
  vertice guardando la foto, quella correzione vale più del conto: da lì in
  poi il piano non si ricalcola da solo. Per rifarlo dalle forme basta ridare
  «Piano dalle forme».
- Quotando due forme su un muro che prima non c'era, **la sua parete compare
  da sé**. E un piano calibrato a mano, che di forme non ne ha, resta com'è.
- Il ricalcolo aspetta mezzo secondo di quiete: mentre trascini un angolo
  arrivano venti modifiche al secondo, e rifare i conti venti volte non
  servirebbe a niente.

## 1.39.0 — Il riquadro del piano si tira e si aggiusta

- **Ogni parete si disegna a casa sua.** Con più muri nella stessa foto i
  riquadri verdi si accavallavano oltre lo spigolo, e si vedevano due griglie
  sovrapposte su un muro solo. Ora ognuna si ferma allo spigolo: quello che
  vedi su un muro è la prospettiva di quel muro, e basta.
- **Tirando un LATO si allarga il riquadro, la prospettiva non si tocca.** Le
  maniglie quadrate verdi a metà di ogni lato servono a coprire più parete —
  per portare la griglia fin dove serve guardarla — e le misure restano
  identiche al millesimo: sotto, il riquadro cresce nelle coordinate del muro
  e torna sulla foto con la stessa identica omografia.
- **Spostando un VERTICE si aggiusta la prospettiva.** Le maniglie tonde gialle
  agli angoli sono la regolazione fine: si guarda la griglia e la si fa
  combaciare con quello che si vede — i corsi dei pannelli, il filo dei
  serramenti — finché il piano non dice il vero.
- **Le forme del sopralluogo non si muovono mai.** Aggiustare il piano cambia
  soltanto le misure CALCOLATE; le quote scritte a mano restano quelle, e
  nessun disegno si deforma.
- Con più pareti, si prende in mano quella che serve toccandola: le maniglie
  si spostano lì. Il riquadro completo della parete in mano resta tratteggiato
  anche oltre lo spigolo, così si vede fin dove arriva.

## 1.38.0 — Facciate a più svolte

- **Tre, quattro, cinque pareti nella stessa foto.** Un capannone coi
  risvolti, un terrazzo a tre lati, una casa a fisarmonica: le forme quotate
  si dividono da sole in tante pareti quanti sono i muri, ognuna con le sue
  finestre, e ogni misura ritrova il muro suo — anche presa a venti
  centimetri da una svolta.
- **Niente spigoli inventati.** Due muri che non si toccano si incrociano
  comunque, in geometria: il primo e il terzo di una facciata a zig-zag hanno
  una retta d'intersezione, che però non è uno spigolo che si vede. Prima
  veniva disegnata in mezzo alla foto; adesso l'app guarda se fra le due
  pareti ne cade in mezzo un'altra, e in quel caso lascia perdere. Restano le
  svolte vere, una per ogni angolo inquadrato.
- Due muri **paralleli** — quelli alterni di una fisarmonica — non fanno
  spigolo e nessuna riga compare. Una svolta che cade **fuori dall'inquadratura**
  non si disegna: là comanda di nuovo la parete più vicina.
- Il conto è anche più svelto, perché le coppie che non si toccano non
  vengono nemmeno calcolate: cinque pareti si sistemano in una ventina di
  millisecondi, e il risultato resta in memoria finché non si ricalibra.

## 1.37.0 — Lo spigolo fra due pareti

- **Si vede dove finisce un muro e comincia l'altro.** Con più pareti sulla
  stessa foto compare lo *spigolo*: la riga bianca dove le due prospettive si
  incontrano. Non è disegnata a occhio — si ricava dalle due pareti, perché
  un punto dello spigolo appartiene a tutte e due e lì, e solo lì, le due
  prospettive misurano la stessa cosa. L'app cerca proprio quella riga.
- **E lo spigolo comanda.** Vicino all'angolo «la parete con la forma più
  vicina» è un lancio di moneta: una quota presa venticinque centimetri oltre
  lo spigolo poteva finire sull'altro muro. Adesso decide lo spigolo, ed è la
  stessa riga che vedi disegnata — quello che guardi è quello che l'app usa.
- Il conto si fa dentro l'immagine, dove le prospettive valgono: mezzo pixel
  di errore nel puntare gli angoli sposta lo spigolo di una trentina di pixel
  su un'immagine da milleduecento, il 2%. Due pareti parallele — che spigolo
  non ne fanno — non producono nessuna riga: l'app se ne accorge e non
  inventa niente.
- Con tre pareti gli spigoli sono tre, uno per ogni coppia che si incontra.

## 1.36.0 — Due pareti, due piani

- **Una foto di tre quarti inquadra due muri.** Il box di cantiere ripreso
  d'angolo ha le finestre del fianco e quelle del fronte nella stessa foto:
  sono due piani, e una prospettiva sola non può descriverli entrambi. Messe
  tutte nello stesso conto ne usciva una griglia che attraversava lo spigolo e
  non era giusta da nessuna delle due parti.
- Ora «Piano dalle forme» **riconosce da sé le pareti**: parte dalla forma più
  grande, aggiunge quelle che reggono la stessa prospettiva e chiude il gruppo
  quando nessun'altra ci sta più. La scheda le elenca — «A1 A2 A3 · 3 forme ·
  3,7 mm», «A4 A5 · 2 forme · 1,3 mm» — e le applichi tutte insieme o solo
  quelle che vuoi.
- **La foto tiene più piani insieme.** Ogni misura usa la parete più vicina:
  una quota presa sul fianco legge il fianco, una presa sul fronte legge il
  fronte, anche a due dita dallo spigolo. La griglia di verifica si disegna su
  ciascuna, e si vede subito dove finisce una parete e comincia l'altra.
- Il confronto con la calibrazione di prima usa la stessa regola, forma per
  forma: se la foto era già calibrata a due pareti, la scheda non dice più che
  il piano di adesso è pessimo solo perché stava misurando il fianco col piano
  del fronte.
- Le foto con un piano solo non cambiano di una virgola: è lo stesso piano di
  sempre, che vale su tutta la foto.

## 1.35.0 — Il piano ricavato da tutte le forme quotate

- **Le misure dimenticate si prendono dopo, sulla foto.** Ogni quadrilatero
  che quoti È già un riferimento prospettico: quattro angoli puntati e le
  misure vere prese sul posto. Finora ne serviva uno solo, scelto apposta, e
  la precisione del piano era quella di quell'unico riquadro — piccolo o in
  un angolo, sbagliava dappertutto.
- Nuovo comando in **Quotature → Scala e piano → «Piano dalle forme»**: prende
  TUTTE le forme quotate a mano e ne ricava un piano solo, che le mette
  d'accordo. Più sono sparse sulla foto, più il piano tiene anche dove non hai
  quotato niente: su una prova con cinque forme sparse su una parete di
  4 × 2,6 m, l'errore su una misura da un metro presa a caso è passato da
  **28 mm a 2,7 mm**.
- **Non cambia niente da solo.** Il comando calcola e apre una scheda che dice
  quante forme ha trovato, quanto sbaglia il piano che hai adesso, quanto
  sbaglia quello nuovo e su quale forma va peggio. Applicare è una tua scelta,
  e se il piano nuovo fosse peggiore te lo dice.
- Lo *scarto* mostrato è la differenza fra la misura che hai scritto su un
  lato e quella che il piano legge sullo stesso lato: qualche millimetro è
  normale, ma una forma che sballa da sola quasi sempre ha una quota sbagliata
  — così la scheda serve anche a trovare gli errori di battitura del rilievo.
- Le forme quotate DAL piano restano fuori dal conto: una misura calcolata non
  può correggere la calibrazione che l'ha prodotta.

## 1.34.0 — Le abbondanze a vista sulla foto

- **Un interruttore per vedere il pezzo da tagliare.** L'abbondanza è scritta
  nei lati e non si vedeva da nessuna parte: la foto diceva la misura a vista
  e basta. In *Opzioni → Abbondanze a vista* ora c'è **Mostra / Nascondi**: da
  acceso, ogni forma abbondata porta il contorno verde tratteggiato del pezzo
  che esce dalla macchina — lo stesso segno dell'ambiente di pannellizzazione,
  così il linguaggio è uno solo.
- L'interruttore sta **sulla foto**, non sull'app: puoi tenerlo acceso dove
  serve e spento dove no. E comanda anche il **PDF** e le immagini condivise:
  quello che vedi è quello che stampi.
- Segue la forma vera, non il riquadro: su una finestra sotto falda
  l'abbondanza corre parallela all'obliquo; su un cerchio col margine diventa
  un cerchio più grande; su un triangolo o un pezzo a cinque lati ogni lato si
  sposta di quanto dice la sua quota.

## 1.33.1 — I teli arrivano al taglio con la loro forma

- **Il telo di una falda non è più un rettangolo nel nesting.** Portando il
  sopralluogo nel piano di taglio, una forma divisa in teli entrava come i
  suoi teli — giusto — ma ognuno **senza la sua sagoma**: nel disegno del
  nesting si vedeva il rettangolo d'ingombro, e il file di taglio seguiva
  quello. Adesso ogni telo porta con sé la forma che ha (`1525×2000|3016.7`),
  si incastra con gli altri e si taglia com'è.
- Vale per il piano creato dal sopralluogo e per quello allegato al report.
  I **piani già salvati** non cambiano da soli: rifai «Crea piano di taglio»
  dal sopralluogo, oppure scegli la forma nella riga del pezzo.

## 1.33.0 — La falda si divide come una falda

- **Basta col rettangolo in prospettiva.** Aprendo «Dividi in teli» su una
  finestra sotto falda, l'ambiente disegnava un RETTANGOLO deformato dalla
  prospettiva: l'obliquo si vedeva solo perché era il contorno della foto, ma
  il modello sotto era sempre un rettangolo. La giunzione finiva così a un
  terzo della base invece che a metà, e i teli erano riquadri.
- Ora l'ambiente parte dai **quattro angoli veri del vetro**: la giunzione
  cade dove dicono i centimetri, la linea gialla si ferma sulla falda invece
  di sparare sopra il tetto, e il contorno verde di ogni telo è il trapezio
  che esce dalla macchina, abbondanze comprese.
- Sotto «Pezzi da tagliare» un telo obliquo porta **due misure di traverso**,
  una per capo — `167,5 × 212 | 323,7` — perché è così che si scrive sul telo
  prima di posarlo. Sono gli stessi numeri della distinta di taglio: quello
  che si guarda e quello che si taglia sono lo stesso pezzo.
- Stessa correzione **sulla foto del sopralluogo** e nel PDF: le giunzioni
  verdi, i lembi di sormonto e i codici dei teli seguivano il rettangolo
  d'ingombro, adesso seguono la sagoma.
- Sotto, una sola regola per tutti: la forma di un quadrilatero — falda,
  trapezio isoscele, finestra fuori squadro — si legge in un posto solo, e da
  lì passano il disegno, l'ambiente dei teli e il piano di taglio.

## 1.32.0 — La misura speculare

- **Due finestre affacciate, un rilievo solo.** Sotto il colmo di un tetto le
  finestre vanno a coppie: stesse misure, falda che sale da una parte e
  dall'altra. Ora si richiama la misura come sempre, si tocca la copia e
  compare **⇋ Specula**: il codice prende il segno `%` (B1.1 la dritta, B1.2%
  la gemella) e nel piano di taglio nasce un **pezzo a sé**, con la falda
  dall'altra parte.
- Non è la stessa cosa che girarlo: un trapezio rettangolo ruotato di mezzo
  giro ha la falda sempre dallo stesso lato. Montare uno al posto dell'altro
  vuol dire buttarlo, ed è per questo che in distinta sono due voci separate —
  due dritte e una specchiata fanno «2 +1», non «3».
- Vale per tutte le forme che ne hanno bisogno: la falda scambia le due
  altezze, il triangolo storto e il quadrilatero fuori squadro si specchiano
  sui vertici. Rettangolo, cerchio, rombo e trapezio isoscele sono simmetrici
  e restano quello che sono.
- Se la forma è divisa in **teli**, si specchiano anche quelli: il primo
  diventa l'ultimo e ognuno prende la sua forma ribaltata, così i codici a/b/c
  seguono il verso in cui si posa.
- Il pulsante compare solo sulle copie richiamate: l'originale è la misura, e
  ribaltare lui vorrebbe dire ribaltare tutta la famiglia.

## 1.31.0 — Pannellizzare la finestra sotto falda

- **I teli seguono la falda.** La pannellizzazione divideva sempre in teli
  RETTANGOLARI, anche quando l'elemento non lo era: su una finestra sotto
  falda ogni telo veniva alto quanto il punto più alto, quindi si buttava il
  triangolo che avanza e in posa il telo non copriva dove serviva. Ora ogni
  telo è ritagliato dalla sagoma vera — il pezzo di trapezio compreso fra le
  sue due giunzioni — e arriva nel piano di taglio come trapezio rettangolo
  con le SUE due altezze.
- Le giunzioni non cambiano: restano posizioni sull'asse, decise sul vetro
  nell'editor come prima. Cambia solo la forma che se ne ricava.
- Vale anche per la fascia orizzontale e per il quadrilatero fuori squadro:
  il telo è sempre il ritaglio della sagoma, e quando non è un trapezio
  rettangolo viaggia coi suoi vertici.
- **Correzione:** un rettangolo quotato su tutti e quattro i lati era
  diventato un quadrilatero storto, preso dalla pendenza del disegno. Lati
  opposti uguali a due a due vuol dire parallelogramma, e senza una diagonale
  non c'è modo di sapere se è dritto o storto: resta rettangolo, come ha
  sempre fatto l'app. Con la diagonale quotata invece la forma è determinata
  e si segue.

## 1.30.1 — Le etichette non escono più dal pezzo

- Sul quadrilatero storto il nome usciva dalla sagoma. Spostare la scritta sul
  baricentro non bastava: lo SPAZIO dichiarato era ancora quello del riquadro
  d'ingombro, e su un pezzo sbieco il riquadro è molto più grande del pezzo —
  la scritta girata veniva lunga quanto il riquadro e sbordava.
- Ora si calcola il **riquadro più grande che sta davvero dentro** la sagoma,
  centrato sul baricentro: per un poligono convesso ogni lato è un semipiano,
  e un rettangolo ci sta tutto se ci sta il suo angolo peggiore. Chi impagina
  riceve una misura di cui può fidarsi nei due versi, dritto e girato, in
  pagina come nel PDF e nel file per la macchina.
- Verificato sul disegno vero, non a occhio: ventitré etichette, nessuna fuori
  dal proprio pezzo.

## 1.30.0 — Il quadrilatero storto

- **La finestra fuori squadro non è più un rettangolo.** Un quadrilatero con
  tutti e quattro i lati quotati — nessuna coppia uguale, quindi né rettangolo
  né trapezio — entrava nel piano di taglio col suo rettangolo d'ingombro, di
  cui NESSUN lato corrispondeva a una misura presa sul posto. Ora entra con la
  sua forma: si nesta, si disegna e si taglia per quello che è, e l'etichetta
  dice i suoi quattro lati.
- **Come si ricostruisce, e cosa è misurato.** Quattro lati non bastano a
  determinare un quadrilatero: tenendoli tutti uguali la figura si deforma
  come un telaio snodato. Serve un quinto numero, la diagonale. Se una
  diagonale è quotata la forma è **esatta** (due triangoli per tre lati
  ciascuno); se non c'è, la diagonale si prende dal quadrilatero **disegnato**
  sulla foto, riportato in scala sui lati misurati. I quattro lati restano
  quelli presi sul posto — il pezzo tagliato ha le misure giuste — e a essere
  stimata è solo la pendenza della figura, la stessa cosa che l'app già ricava
  dal disegno quando una quota manca. Per averla esatta basta quotare anche
  una diagonale.
- Un quadrilatero **concavo** resta un rettangolo d'ingombro: la griglia del
  motore conta su forme convesse, e forzarla sarebbe un errore silenzioso.
- Nella lista il quadrilatero mostra il suo ingombro e non si modifica a mano
  (quattro lati non stanno in tre caselle) e non si può nemmeno sceglierlo dal
  menù delle forme: arriva dal rilievo, che è l'unico posto dove quei numeri
  esistono.
- **Il tocco torna a girare la sola copia toccata.** Il verso comune a tutta
  la famiglia lo cerca già il motore da solo, quindi il tocco serve a
  correggere il singolo pezzo, non a rifare il pacco.

## 1.29.0 — Il verso delle famiglie, scelto a catena

- **Chi pesa di più detta la disposizione.** Sulla lista di prova del cantiere
  — dieci copie di rettangolo, cerchio, trapezio, triangolo e rombo su bobina
  da 152 — girare i pezzi a mano batteva il calcolo di quasi il 5%. Il motivo:
  il pacco buono vuole i trapezi per lungo **e** i rombi appoggiati, decisi
  INSIEME, e provare una famiglia alla volta non lo trova. Ora il motore fissa
  il verso della famiglia che occupa più materiale, poi — tenendo quello fermo
  — il verso della seconda: otto pacchi invece dei sedici che servirebbero a
  provarle tutte, e la combinazione si trova lo stesso. È lo stesso ragionamento
  che si fa a mano: prima si sistema il pezzo grosso, poi il successivo.
- Fra gli appoggi si provano **tutti quelli che pareggiano** col più stretto:
  un rombo ne ha quattro con lo stesso identico riquadro, e quale impacchetti
  meglio non si sa guardando il pezzo. Su questa lista fra il primo e il
  migliore ballava mezzo metro di bobina, deciso da un pareggio rotto a caso.
- Quanto vale: la lista del cantiere passa da **11,89 a 11,20 m** (resa 79,3 →
  84,1%), il misto da 7,37 a **7,01 m**. Nessuna lista del banco peggiora, e
  ora nessuna rotazione a mano batte più il calcolo su quella lista.

## 1.28.0 — Un tocco gira tutte le copie

- **Il tocco gira la famiglia, non la singola copia.** Due rombi appoggiati sul
  lato tassellano solo se restano PARALLELI: girarne uno alla volta vuol dire
  passare per dieci disposizioni peggiori prima di arrivare a quella buona, e
  con dieci copie sono dieci tocchi per una cosa sola. Ora un tocco su un pezzo
  porta tutte le sue copie al verso successivo, e il giro completo le rimette
  tutte in automatico.
- Provata e **scartata perché non paga**: una passata «mista», con l'appoggio
  unico dato solo ai pezzi a cui conviene (i rombi sì, i triangoli no) e gli
  altri liberi. Sulle tredici liste del banco guadagna **zero** e costa il 20%
  di tempo in più. Il criterio per riconoscere quei pezzi (quanto riempiono il
  proprio riquadro appoggiati contro in piedi) funzionava; è la passata in più
  che non serviva, perché quella parallela già li copre.

## 1.27.0 — I rombi tassellano

- **Il difetto che teneva fermi gli incastri.** Il controllo «il pezzo deve
  starci dentro» era calcolato sull'ingombro NON ruotato: per un rombo
  appoggiato su un lato usava la larghezza del diamante (754) invece di quella
  vera (591). Risultato: il pezzo dopo non poteva mai arrivare accanto al
  primo, e l'incastro che si vede a occhio non nasceva. Adesso l'ingombro si
  prende sul pezzo davvero ruotato.
- **Copie parallele.** Un rombo appoggiato su un lato è un parallelogramma:
  affiancato a sé stesso tassella senza buchi, ma solo se le copie restano
  parallele — basta che la scansione ne giri una di novanta gradi e l'incastro
  salta. C'è quindi una passata in cui ogni pezzo ha UN solo appoggio, quello
  col riquadro più stretto, più il suo mezzo giro (che serve ai trapezi per
  accoppiarsi testa-coda). Come sempre si tiene il pacco migliore.
- Quanto vale, misurato: dieci rombi su bobina da 122 passano da **3,24 a
  2,38 m** (resa 57 → 78%); dodici falde piccole da **3,71 a 3,18 m** (69 →
  80,5%); la lista di cantiere con rombi, trapezi e rettangoli da **6,37 a
  5,63 m**. Sulle dodici liste del banco la perdita media scende dal 28,8 al
  **26,7%**, e nessuna lista peggiora.

## 1.26.0 — Girare i pezzi: angoli veri e un tocco

- **Non solo quarti di giro.** I quarti sono un'ipotesi da rettangoli: un
  rombo o un triangolo storto, girati a mano, si appoggiano su un LORO LATO,
  ed è così che due pezzi combaciano lungo il fianco. Ora il motore calcola
  proprio quegli angoli — per ogni lato del pezzo, la rotazione che lo porta
  in basso — e fa un pacco intero a quarti e uno intero ad angoli obliqui,
  tenendo il migliore. Quattro rombi 754×597 passano da 1,64 a **1,51 m** di
  lastra, cinque falde con tre fasce da 4,63 a **4,26 m** di bobina.
  (Gli angoli non si possono mescolare agli altri dentro lo stesso pacco:
  provati tutti insieme peggiorano di tre punti, perché il primo pezzo si
  affeziona a un verso storto e il resto si arrangia.)
- **Un tocco sul pezzo lo gira.** Niente pulsante: si tocca il pezzo nel
  disegno e passa al verso successivo fra quelli sensati — per un rettangolo
  il mezzo giro, per una sagoma i suoi appoggi di lato. Finito il giro il
  vincolo si toglie da solo e il pezzo torna a farsi mettere dal calcolo. Con
  la venatura resta bloccato: lì comanda la fibra.
- Due angoli che danno lo stesso pezzo appoggiato non contano due volte: un
  rombo ha sei versi veri, non dodici, e un quadrato uno solo. Meno tocchi a
  vuoto e meno lavoro per il motore.
- **Le etichette stanno nel pezzo.** Erano piazzate al centro del riquadro
  d'ingombro: sul triangolo finivano nella metà vuota, sopra il pezzo accanto.
  Ora vanno sul baricentro della sagoma, larghe quanto il pezzo è largo a
  quell'altezza — in pagina, nel PDF e nel file per la macchina.

## 1.25.0 — La resa, misurata

- **I pezzi lunghi entrano per primi.** Con la scansione dal basso chi arriva
  prima si prende il fondo, e una fascia arrivata tardi non trova più dove
  stendersi. Ordinando dal lato più lungo invece che per area: misurato su
  undici liste di cantiere non perde mai, e sulla lista che aveva fatto venire
  fuori il problema dei triangoli accorcia il rotolo di **16 cm**. Costa uguale.
- **Rete di sicurezza sulla resa.** Le stesse undici liste sono diventate un
  test con la resa minima da non scendere: d'ora in poi una modifica al motore
  che spreca materiale fa fallire la build, anche se non rompe niente altro.
  Un test di correttezza non se ne sarebbe accorto — mezzo metro di rotolo in
  più non è un errore, è solo pellicola buttata.
- Provate e **scartate perché non pagano**, misurate alla mano: più ordini di
  inserimento (+0,7 punti per il triplo del tempo), griglia quattro volte più
  fine (+0,4 per otto volte il tempo), rotazioni intermedie a 45° (peggiora di
  3 punti: il greedy si affeziona a un verso storto e rovina il pacco) e una
  passata di compattazione (guadagno zero — la scansione aveva già messo tutti
  nel punto più basso raggiungibile).

## 1.24.0 — Il triangolo dei tre lati

- **Il triangolo non è più un rettangolo.** Un triangolo quotato sui suoi tre
  lati diventa una sagoma vera anche quando è storto: prima serviva che fosse
  isoscele, e uno qualunque finiva nel piano di taglio come rettangolo
  d'ingombro, buttando via metà del materiale sotto l'ipotenusa. Tre lati
  misurati sono già la forma — non c'è niente da inventare. Su una lista di
  prova (2 rettangoli, 2 rombi, 6 triangoli su bobina da 122) il rotolo
  consumato passa da **5,24 m a 3,37 m**, la resa dal 56% al 66%.
- Nella lista c'è la forma **«Triangolo (3 lati)»** con i tre campi Lato A / B
  / C; l'incolla da testo capisce `triangolo 800/700/500`. Tre numeri che non
  chiudono un triangolo non diventano un pezzo: la riga resta in vista fra
  quelle ignorate, o il pezzo fra quelli con misure incomplete.
- **Il giro di partenza.** Due triangoli storti uguali si incastrano lungo il
  fianco obliquo solo se il primo è già girato di mezzo giro, e il primo non
  poteva saperlo. Ora il pacco si rifà anche partendo da 180° e si tiene il
  migliore (solo quando in lista c'è una forma che gira davvero).
- Un pezzo largo **esattamente quanto l'utile** — una fascia a tutta bobina —
  non viene più dichiarato «non entra» per un arrotondamento della griglia.
- Sul rotolo un pezzo **impossibile** (più largo del rotolo, o col verso
  bloccato) non si porta più dietro pezzi che entravano benissimo.

## 1.23.0 — Nesting a forma reale

- I pezzi del piano di taglio possono avere una **forma vera**: rettangolo,
  cerchio (Ø), triangolo isoscele, rombo, trapezio isoscele (B/b×h) e
  **trapezio rettangolo** (base + altezza sinistra + altezza destra — la
  finestra sotto falda).
- Quando nella lista c'è almeno una sagoma, il calcolo passa a un **motore a
  griglia conservativo**: le forme si incastrano davvero (4 finestre sotto
  falda 600×400×800 entrano tutte su una lastra 1300×1250, dove a rettangoli
  ce ne stavano 2), la distanza minima fra i pezzi resta la lama, e la resa è
  calcolata sull'area geometrica vera. Le liste di soli rettangoli continuano
  a usare il motore di sempre.
- In ogni riga della lista c'è un **selettore di forma**, con i campi che
  cambiano di conseguenza (un solo Ø per il cerchio, tre misure per i
  trapezi). I pezzi con misure incomplete **non spariscono**: un avviso dice
  quanti sono stati esclusi dal calcolo.
- Le sagome arrivano da sole **dal sopralluogo**: un quadrilatero quotato con
  base e due altezze laterali diverse diventa un trapezio rettangolo nel piano
  di taglio (mai inventando la terza misura quando non è stata quotata).
- Anteprima, PDF e SVG per il plotter disegnano le sagome sui **vertici
  veri** (poligoni e cerchi), non sul rettangolo d'ingombro.
- «Incolla da testo» riconosce anche le forme: `cerchio Ø300`,
  `trapezio 500/300x200`, `base 1200, h sx 900, h dx 1400`, e le sezioni
  («Trapezi:») che valgono per le righe sotto.

## 1.22.0 — Quote corte

- Su una misura corta il numero si può portare **fuori dalle linee di
  estensione**, con la linea di quota che si prolunga fino a lui
  (comando «◀ Fuori · In mezzo · Fuori ▶»).

## 1.21.x — Pannellizzazione e condivisione

- **Pannellizzazione**: gli elementi troppo grandi per la bobina si dividono
  in teli con sormonto, disegnati in prospettiva sulla foto (codici A1.a,
  A1.b…). La divisione avviene sul vetro reale e le abbondanze, anche
  asimmetriche, finiscono nei teli di bordo. Nel piano di taglio vanno i teli,
  non l'elemento intero.
- La foto si può **condividere anche senza le quote** (i volti censurati
  restano censurati in entrambi i casi).
- Nei quadrilateri la **base è il lato in basso** e l'altezza quella laterale,
  sempre, con il comando «Scambia base e altezza» per i casi particolari.
- Le misure di un piano di taglio si possono **trasferire fra materiali**
  (bobine 91,5 / 122 / 152 cm) senza reinserirle.
- Pulsante **«Aggiorna all'ultima versione»** in Impostazioni.
