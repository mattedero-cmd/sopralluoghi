# Rilievo e taglio porta — prototipo

Editor per rilevare maestà e anta durante il sopralluogo e calcolare i tagli di pellicola
per la riqualificazione delle porte. È un prototipo sviluppato a parte: **non è ancora
integrato nell'app Sopralluoghi**.

- File: `rilievo-porta.html`, un'unica pagina con HTML, CSS e JavaScript, senza dipendenze.
  Si apre direttamente nel browser.
- Link diretti alle schede: `#maesta`, `#anta`, `#riepilogo`, `#lavoro`.
  Senza link parte dalla creazione guidata.
- I dati vivono solo nella pagina: ricaricando si perdono. Il salvataggio arriverà con
  l'integrazione nell'app, insieme al sopralluogo.
- Le misure visibili e inseribili hanno al massimo **due decimali**. Gli archi e
  gli altri calcoli geometrici restano precisi; i tagli si arrotondano per eccesso
  al centesimo e i limiti inseribili per difetto.

## Come si usa

1. **Creazione guidata del modello**, una scelta alla volta:
   battuta (nessuna, singola, doppia, con imbotte) → coprifilo (senza coprifili / filomuro, squadrato, smussato,
   raggiato, modanato, a gradino, telescopico, a sormonto, integrato) → posizione del
   coprifilo per lato (a filo, arretrato, sporgente) → angoli (montanti passanti,
   traverso passante, 45°) → riepilogo.
2. **Misure guidate**, una per schermata, con disegno e tastierino: luce L e H, bordo
   dell'anta (squadrato, uno scalino, due scalini o arrotondato), L/H/S dell'anta
   (+ altezze e posizioni degli scalini oppure raggio), guarnizione sull’anta
   (superficie, tutta la larghezza o misure precise),
   **chiusura sovrapposta, a filo o rientrata**, piano di riferimento (coprifilo,
   estremità dello stipite o parete nel filomuro), superficie di appoggio
   dell'anta e battuta del telaio. Poi posizione rilevata dell'arresto, facce
   da rivestire, chiusura del bordo inferiore e abbondanze di
   maestà e anta. I sormonti di giunzione seguono automaticamente lo spigolo; la guida
   mostra le misure calcolate. Per ogni battuta chiede la sua
   larghezza, se c'è la guarnizione e se copre tutta la battuta oppure la sua
   larghezza e la distanza di inizio dal primo spigolo.
3. **Sezione a mano** nel banco di lavoro: si trascinano i lati del pezzo (1 mm ogni
   7 px), il coprifilo si sposta su e giù prendendolo dal centro, un tocco apre il
   tastierino accanto alla quota. Nella sezione piccola restano solo le quote
   essenziali; nello strumento Pellicola il disegno è pulito, senza quote. Lo
   sviluppo in piano e le spiegazioni dei sormonti sono raccolti in dettagli apribili.
4. Strumenti del banco di lavoro: **Misure**, **Pellicola** (tratti da rivestire,
   separazioni, sormonti S), **Guarnizioni** (fascia alla larghezza e posizione
   effettive, misure modificabili e pulsante Elimina), **Tagli**
   (porta vista di fronte, giunzione per pezzo, esclusione di un pezzo).
5. **Riepilogo**: totali e sequenza di posa. **Lavoro**: porte tipo con quantità,
   distinta di taglio e piano bobine.

## Regole decise

### Sormonti e abbondanze

- La posa avviene sulla maestà **già montata**: la pellicola non gira mai dietro i pezzi.
- Il **sormonto** è il tratto con cui una pellicola supera lo spigolo e si sovrappone a
  quella del pezzo vicino, per nascondere il taglio.
- L'**abbondanza** alle estremità dà agio nella posa e serve a sovrapporre le pellicole
  negli angoli.
- Lo stipite si riveste prima del coprifilo: il suo lembo prosegue **sullo spessore
  del coprifilo subito adiacente allo stipite**. Il rivestimento del coprifilo,
  posato dopo, copre quel lembo. Non si aggiunge un lembo reciproco dal coprifilo.
- Tutti i sormonti hanno **una sola linguetta marrone centrale**, che separa le
  due pellicole verdi. Il percorso verde esterno è lo strato sopra, raccordato al
  pezzo posato per ultimo; quello interno è lo strato sotto. Le estremità libere
  rimangono aperte per distinguere le due pellicole senza leggere le etichette.
  La stessa regola vale nella guida, nella sezione e nella vista Pezzo, per tutti
  i profili. Lo spessore del segno è ingrandito; quote e tagli restano reali.
- I nomi dei due rivestimenti e l'ordine di posa sono consultabili nei
  **Dettagli dei sormonti**, inizialmente chiusi. A filo, dove il taglio è unico,
  non appare un sormonto. Il pezzo adiacente resta visibile nella vista Pezzo.
- Il limite segue lo spessore realmente disponibile, compresi raggi e smussi, e si
  ferma prima di una cava. Non entra nelle sedi telescopiche o dietro i pezzi montati.
  Un bordo verso il muro o un giunto già coperto dal lembo del vicino ha sormonto
  aggiuntivo iniziale di 0 mm.
- I sormonti delle giunzioni con coprifilo mobile sono **automatici fino allo
  spigolo**: coprono tutta la prima faccia esposta adiacente, fermandosi prima
  di una guarnizione. Con testa a vista raggiata/smussata coprono l'intera testa;
  con coprifilo sporgente coprono tutto il breve retro a vista, senza girare
  sull'altro lato. Le altre famiglie mobili seguono il primo tratto adiacente.
- Modificare eE/eI, trascinare il coprifilo o cambiare le altre quote aggiorna
  immediatamente il sormonto, il disegno, gli sviluppi e i tagli. I vecchi valori
  manuali non bloccano più queste giunzioni. A filo, per raggiati e smussati,
  resta un solo pezzo continuo e non viene aggiunto alcun sormonto.
- La guida mostra le lunghezze automatiche, senza chiederle una seconda volta.
  Le relative quote si consultano ma non si possono staccare dalla geometria
  con il tastierino o trascinando una S. Le misure restano al massimo a due decimali.
- Gli altri giunti, compresi stipite–imbotte e le sedi non spostabili, conservano
  le misure manuali e la validazione entro lo spazio disponibile. Le guarnizioni
  manuali fuori misura restano conservate e bloccano i tagli fino alla correzione.

### Guarnizioni

- Ogni guarnizione resta agganciata alla propria superficie. Spostare i coprifili,
  aggiungere o togliere una testa a vista non la trasferisce su un altro tratto.
  Anche le esclusioni di pellicola e le separazioni restano sulla superficie scelta.
- Nella creazione guidata la scelta iniziale è **Sì**, su ciascuna battuta,
  inizialmente coperta per intero. Un No esplicito o un'eliminazione vengono
  conservati e non sono sovrascritti tornando nella guida.
- Una guarnizione interrompe la pellicola: il suo ingombro viene escluso dal percorso
  verde e dallo sviluppo; ai suoi bordi nascono tagli separati.
- **Tutta la battuta**: larghezza e posizione seguono automaticamente il tratto,
  anche quando cambia la quota della battuta. Su quel tratto non passa pellicola.
- **Misure precise**: si inseriscono la larghezza reale e la distanza dell'inizio dal
  primo spigolo del tratto, indicato con 0 nella guida. Il disegno mostra l'ingombro
  reale anche sui profili curvi, non un quadratino simbolico.
- Ogni guarnizione si può modificare o eliminare dalla scheda Guarnizioni. Eliminando
  la guarnizione, la pellicola torna continua, salvo separazioni impostate a mano.
- L'eventuale **risvolto nella cava** è una misura separata e facoltativa, inizialmente
  0 mm. I risvolti già impostati vengono conservati.
- Una misura manuale che non entra più nel profilo resta conservata e blocca i tagli
  con un errore esplicito. Le due battute si configurano indipendentemente.

### Coprifili raggiati e smussati

- Per entrambe le famiglie la regola dipende dalla posizione del coprifilo e si
  applica **separatamente a ciascun lato** della porta.
- Con uno scalino alla giunzione, la pellicola del coprifilo comprende tutta la
  prima faccia esposta dello stipite. Quella faccia non genera un secondo taglio
  dello stipite; il successivo rivestimento dello stipite può sormontarla entro
  lo spazio disponibile.
- A filo, coprifilo e stipite si rivestono con **un unico pezzo fino alla
  guarnizione**. Il disegno, lo sviluppo, la distinta e i totali usano lo stesso
  collegamento, su entrambi i lati della porta.
- Con **coprifilo sporgente** si riveste prima lo stipite e poi il coprifilo.
  I tagli restano separati: il lembo dello stipite sormonta soltanto il breve
  tratto a vista del coprifilo subito adiacente allo stipite, senza proseguire
  sul resto dello spessore o sul raccordo. Il limite segue quel tratto e le cave.
- L'ordine automatico rispetta anche i casi misti: un lato può richiedere il
  coprifilo prima dello stipite e l'altro il coprifilo dopo. I pezzi unici
  rimangono indivisibili e l'anta viene rivestita dopo la maestà.
- Guarnizioni, superfici escluse e separazioni manuali interrompono il pezzo
  continuo. Se non c'è una guarnizione, il percorso continua fino al bordo o
  all'interruzione successiva.
- Il taglio condiviso somma gli sviluppi una volta sola e usa la maggiore
  lunghezza necessaria tra le parti collegate, comprese le rispettive abbondanze.

### Lunghezze dei pezzi

- Si misura una volta la **luce minima dello stipite** L × H, sulla sua parte
  più spessa (livello 0). Non si misura fra i coprifili. Nel doppio gradino o
  nell’imbotte vale il tratto di stipite che restringe maggiormente il passaggio.
- Ogni tratto ha un **livello** rispetto al piano più spesso dello stipite.
  Per esempio, con battuta singola b, il piano spesso è 0, l’altro piano è +b
  e il coprifilo esterno arriva fino a +(A+b).
- Superfici rivolte verso il passaggio o verso il muro: montante H + livello,
  traverso L + 2 × livello, qualunque sia la giunzione. Per questo le battute si
  incontrano a H − b.
- Facce frontali (faccia del coprifilo, gradino della battuta, teste a vista):
  - montanti passanti → montante H + liv. max, traverso L + 2 × liv. min
  - traverso passante → montante H + liv. min, traverso L + 2 × liv. max
  - 45° → montante H + liv. max, traverso L + 2 × liv. max
- Una striscia di più tratti si taglia sulla lunghezza del tratto più lungo.

### Anta

- La sagoma del legno e le guarnizioni si rilevano separatamente. La ricerca
  su fonti ECO Schulte, Westag e Sebino è in [RICERCA-ANTE.md](RICERCA-ANTE.md).
  Oltre ai profili precedenti, **Due scalini** aggiunge Lb2 e Sb2 indipendenti
  dal telaio. La guida non ricava la sagoma da quella dello stipite.
- **Guarnizioni sull’anta** è una sezione apribile nella scheda Anta, distinta
  da Guarnizioni della Maestà. La guida parte da Sì e richiede la superficie;
  si sceglie tutto il tratto oppure larghezza e inizio dal suo spigolo 0.
  Le fasce si modificano, aggiungono o eliminano per ogni tratto rettilineo.
  La configurazione vale sopra e sui due lati; il bordo inferiore resta separato.
- Una guarnizione sull’anta interrompe il rivestimento. I fogli si arrestano
  ai suoi bordi; eventuali tratti isolati diventano strisce separate sui tre
  lati, comprese nella distinta e nel piano bobine. Il risvolto in cava
  facoltativo si somma ai bordi adiacenti. Il disegno usa lo stesso sviluppo.
- La sezione verifica separatamente i contatti delle guarnizioni dell’anta
  con il telaio, anche con guarnizioni su entrambi. Segnala ciascuna fascia
  che non trova appoggio. Le quote della gomma non aumentano quelle del legno.
- **Sopra e sui lati** il rivestimento è completo: prima il foglio destro, poi
  il sinistro sopra. Nell'anta semplice entrambi girano su tutto lo spessore S;
  nell'anta battentata si sovrappongono solo sul tratto verticale Lb, chiudendo
  nello spigolo basso. Con due scalini, in assenza di guarnizioni che
  interrompono la pellicola, si sceglie su quale effettuare il sormonto.
  La linguetta marrone centrale mostra il sormonto; sulle guarnizioni non compare.
- L e H si misurano sulla faccia destra, lato battuta. La faccia sinistra misura
  L + 2Lb e H + Lb; con due scalini si usa la somma Lb + Lb2. **Sb** è la posizione della battuta nello spessore, inizialmente
  S/2 come esempio modificabile e da rilevare, senza dedurla dallo stipite:
  il sinistro risvolta Sb + Lb, il destro S − Sb + Lb.
- **Sotto**, verso il pavimento: sormonto completo (iniziale e consigliato),
  due lembi a metà senza sovrapposizione, oppure bordo scoperto. Il bordo inferiore
  della battentata è diritto; questa scelta modifica solo il risvolto inferiore.
- Fronte e retro vengono tagliati sempre con la stessa larghezza, pari alla
  maggiore necessaria fra le facce attive, così usano la stessa misura di bobina.
  Le lunghezze restano quelle necessarie ai rispettivi pezzi.
- Uno stesso piano di sviluppo alimenta disegno, tagli, totali e pezzi nel Lavoro.
  Per il bordo arrotondato si usano gli sviluppi reali degli archi. Con una sola
  faccia rivestita, quel foglio copre tutto il bordo superiore senza inventare
  una seconda pellicola; sotto si sceglie completo o scoperto.
- **Bordo dell'anta, battuta del telaio e piano di chiusura sono indipendenti**.
  Non vale la precedente regola universale «per il filo serve la doppia battuta».
  Anche una battuta singola può permettere la complanarità, con un profilo adatto.
  La guida chiede come chiude l'anta e rispetto a quale piano.
- **Lb e Sb sono quote dell'anta**: non cambiano modificando b1 dello stipite.
  Il vecchio automatismo Lb=b1 e il pulsante che lo ripristinava sono rimossi.
  I valori iniziali (Lb 6, Sb S/2, sporgenza 10 mm) sono esempi, non standard di
  fabbricazione. Nella guida le misure effettive si inseriscono sul disegno.
- **Sovrapposta**: distanza positiva oltre il piano scelto; **a filo**: distanza
  0; **rientrata**: distanza positiva di arretramento. Il rientro rimane un caso
  rilevato, senza trasformarlo nel comportamento iniziale di tutte le porte.
- L'**appoggio** si sceglie sulla faccia oppure, per un'anta battentata, sullo
  scalino. Con più battute si sceglie quella effettiva di arresto. L'app verifica
  l'intersezione reale delle superfici con le guarnizioni, anche per i contatti
  secondari. Un solo spigolo coincidente non basta per dichiarare il contatto.
  Senza guarnizione l'appoggio è sulla battuta; se manca anche la superficie di
  arresto, il disegno segnala «appoggio non rilevato».
- La sezione mantiene corpo chiaro, contorno continuo in battuta, fianchi
  tratteggiati e interruzione del corpo. Un segno individua il contatto effettivo;
  nella guida una linea indica il piano scelto. Il giallo rappresenta la
  guarnizione: lo spessore grafico è simbolico, la lunghezza segue la misura.
  È rimossa la precedente fuga numerica di riferimento da 2 mm: non viene
  inventata una distanza o simulata la compressione della guarnizione.
- Le posizioni automatiche servono a comporre l'esempio iniziale. Una posizione
  dello stipite inserita o **confermata con Avanti** diventa una quota rilevata.
  Cambiare chiusura, sporgenza o bordo dell'anta non la sovrascrive. Se le quote
  non corrispondono alla chiusura scelta, l'app mostra la distanza effettiva e
  l'incompatibilità; non allarga il telaio o modifica la battuta dell'anta.
- **Filomuro**: scegli Senza coprifili e il riferimento Parete. Si quotano il
  telaio e le superfici a vista; la sezione non ricostruisce dettagli proprietari
  incassati. Un tratto di parete si può escludere in Pellicola. Non esistono
  pezzi di coprifilo o sormonti verso coprifili assenti. I tagli e il piano bobine
  consumano la stessa lista delle superfici effettivamente selezionate.
- Nel Lavoro ogni porta conserva i dati di chiusura, profilo e appoggio insieme
  alla propria distinta. Un cambiamento del solo piano di chiusura non cambia
  i fogli di un'anta le cui quote L/H/S/Lb/Sb sono rimaste uguali.
- **Materiale: Cover Styl**, con più finiture. L'utente ha confermato di mantenere
  il proprio metodo sui bordi. Le indicazioni generali sulle giunzioni fra teli
  non diventano automaticamente misure di sormonto sul bordo della porta.
  Fonti, distinzioni e limiti sono in [RICERCA-CHIUSURE.md](RICERCA-CHIUSURE.md)
  e nei dettagli «Tipi di chiusura e fonti tecniche» della guida.
- Abbondanze iniziali: **25 mm su ogni lato dell'anta**, **15 mm a ogni estremità
  di stipiti, coprifili e imbotte**. Restano modificabili e vengono sommate dopo
  lo sviluppo dei risvolti: 2 × abbondanza su larghezza e altezza di ciascun foglio.

### Sequenza di posa

Per i coprifili raggiati e smussati valgono le precedenze della sezione precedente.
Per le altre famiglie:

1. Dall'alto verso il basso: prima i traversi, poi i montanti.
2. Dall'interno verso l'esterno: prima stipite e imbotte, poi i coprifili, così i sormonti
   guardano verso il passaggio.
3. Se le regole sono in conflitto vince l'alto. L'anta si riveste dopo la maestà.

Il numero di posa (P01…) è anche il numero del taglio. L'ordine si può cambiare a mano.

### Piano bobine (lavori con molte porte)

- Bobina da 1220 mm, tutta utile; rotoli da 50 m.
- **Stessa misura per comodità**: larghezze entro 20 mm vanno nello stesso rotolo.
- Una misura che riempie almeno un rotolo da 50 m ha il suo rotolo. Quelle che non lo
  riempiono passano alla misura più larga, entro l'abbondanza massima (70 mm) o se sono
  pochi pezzi (fino a 10). Oltre l'abbondanza ideale (50 mm) l'app avvisa.
- **Misure tonde**: ogni rotolo finisce per 0 o per 5.
- Taglio delle bobine: i rotoli più larghi per primi, nella prima bobina dove entrano.
- **Avanzo fino a 50 mm**: si controllano tutte le bobine insieme. Una famiglia
  può aumentare di 5 mm solo se tutti i suoi rotoli, su ogni bobina, possono
  aumentare allo stesso modo entro lo spazio e le abbondanze consentite.
  Se anche uno non può farlo, gli altri non cambiano: resta il piccolo scarto.
  Le scorte manuali e il residuo scelto dall'utente restano esatti.
- **Spazio libero oltre i 50 mm**: lo compone l'utente. Ogni riga contiene una
  larghezza (multipli di 5 mm) e la quantità di rotoli per bobina; si possono
  aggiungere misure diverse da quelle del lavoro, eliminare righe e controllare
  il residuo. Un pulsante applica la composizione, validata tutta insieme.
- Il residuo si può tenere intero o lasciare come avanzo. Le scorte manuali
  conservano esattamente la larghezza scelta: non assorbono automaticamente
  l'ultimo avanzo. Restano le azioni rapide Tieni intero e Nessuna scorta.
- Al massimo **due suggerimenti**, raggruppati come quantità × larghezza,
  sono disponibili in un dettaglio inizialmente chiuso. Anche il riepilogo
  della bobina raggruppa le misure ripetute, senza lunghe somme di rotolini.
- Una composizione non valida o divenuta troppo larga non viene applicata
  parzialmente: la bobina torna da decidere. La quantità di ogni riga vale per
  ciascuna bobina della stessa combinazione, indicata nell'interfaccia.
- La **distinta di taglio** si copia in CSV (larghezza; lunghezza; quantità; pezzi) per il
  nesting.

Tutti i parametri del piano bobine si possono modificare dalla scheda Lavoro.

## Da fare

- Salvataggio di sopralluogo, porte del lavoro e decisioni (con l'integrazione nell'app).
- Altre regole di posa (da quale lato partire, note per chi posa).
- Maniglie anche sugli spigoli curvi (raggi).
