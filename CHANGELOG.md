# Novità per versione

Le voci sono in ordine dal più recente. La data di build che l'app mostra in
Impostazioni → «Versione dell'app» è indipendente da questi numeri: è la data
in cui la copia in cache è stata generata.

> Nota su cache e aggiornamenti: in questo progetto **non esistono**
> `service-worker.js`, `CACHE_NAME` né stringhe `?v=` da tenere allineate a
> mano. Il service worker lo genera `vite-plugin-pwa` a ogni build, con gli
> hash dei file nel precache: basta pubblicare una build nuova e il pulsante
> «Aggiorna all'ultima versione» fa il resto.

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
