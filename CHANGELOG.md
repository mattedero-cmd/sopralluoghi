# Novità per versione

Le voci sono in ordine dal più recente. La data di build che l'app mostra in
Impostazioni → «Versione dell'app» è indipendente da questi numeri: è la data
in cui la copia in cache è stata generata.

> Nota su cache e aggiornamenti: in questo progetto **non esistono**
> `service-worker.js`, `CACHE_NAME` né stringhe `?v=` da tenere allineate a
> mano. Il service worker lo genera `vite-plugin-pwa` a ogni build, con gli
> hash dei file nel precache: basta pubblicare una build nuova e il pulsante
> «Aggiorna all'ultima versione» fa il resto.

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
