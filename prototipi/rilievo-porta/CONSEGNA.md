# Consegna del prototipo a Claude — 12 novembre 2026

## Ambito

Il prototipo resta autonomo in `rilievo-porta.html`, senza dipendenze e senza
integrazione nell'app Sopralluoghi. Il README accanto contiene le regole finali.
Questo salvataggio nel repository è stato richiesto **senza pubblicare l'app**.
Il branch di lavoro è `claude/practical-hopper-vnajks`; in `vercel.json` è
disabilitato il deploy Git automatico solo per questo branch. Gli altri branch
mantengono il comportamento precedente. Non rimuovere questo blocco per una
semplice consegna; una pubblicazione dovrà essere richiesta separatamente.

## Da dove riprendere

- Repository: `mattedero-cmd/sopralluoghi`, branch `claude/practical-hopper-vnajks`.
  Le ultime funzionalità sono nel commit
  `a792790d6f54a588ecf4d04b7eb9de7837565cbb`; questa consegna aggiorna solo
  la documentazione, mantenendo identico l'HTML verificato.
- File da aprire: `prototipi/rilievo-porta/rilievo-porta.html`. È un prototipo
  HTML/CSS/JavaScript autonomo, senza installazione o build React.
- Leggere prima il [README](README.md), poi le note
  [sulle chiusure](RICERCA-CHIUSURE.md) e
  [sui profili delle ante](RICERCA-ANTE.md).
- [Copia privata di prova](https://rilievo-porta-prova.matteo89.chatgpt.site),
  già aggiornata allo stesso HTML. È separata dall'app Sopralluoghi e dal suo
  deploy. L'aggiornamento della copia di prova era autorizzato separatamente;
  il vincolo di non pubblicazione riguarda l'app principale.

## Ultima lavorazione completata

1. Linea di quota in ogni domanda numerica, anche negli spessori del telaio
   senza coprifili. La quota evidenzia gli estremi effettivi; non basta la
   descrizione scritta del punto da misurare.
2. Nessuna domanda sul piano quando il riferimento è unico. Con appoggio
   sul coprifilo, il riferimento è automaticamente il coprifilo; tornando
   allo stipite viene recuperata l'eventuale scelta precedente.
3. Traverso superiore facoltativo. L'utente ha precisato «senza traverso»,
   non «senza montante»: senza traverso non si chiedono gli angoli, non si
   generano i relativi pezzi e non si maggiorano i montanti per il giunto in alto.
4. Una o due ante, anche disuguali, con schede indipendenti. Sono compresi
   rilievo guidato, selezione dell'anta nella sezione dello stipite, riepilogo,
   aggiunta al lavoro e piano bobine. Il telaio viene contato una volta sola.

## Verifiche da riprendere in browser

Sono passati 256 gruppi in 31 esecuzioni sullo stesso HTML, con JavaScript reale,
Node VM, flussi completi in jsdom e immagini SVG/PNG ispezionate. Non è stata
completata una verifica di rendering nel browser. Gli script e gli artefatti
di prova erano nella cartella di sessione, fuori dal repository: una nuova
sessione Claude non deve presumere di trovarli nel checkout.

Prima di modificare o integrare il prototipo, riprovare questi percorsi:

- Senza coprifili: quote D/s e, con imbotte, E/I/sI; nessuna domanda sul
  riferimento unico. Verificare leggibilità delle quote sul telefono.
- Battuta sul coprifilo: zoom sul contatto, sporgenza calcolata, nessuna
  domanda sul piano; ritorno allo stipite senza perdere la scelta precedente.
- Porta senza traverso: guida senza angoli, due montanti nel prospetto,
  nessun traverso nella distinta o nel piano bobine.
- Due ante disuguali: ad esempio 640,25 × 2100 e 359,75 × 2098,5 mm.
  Passare da un'anta all'altra, modificare il profilo della seconda e verificare
  che la prima resti invariata. Riprovare con e senza traverso.
- Rendere non valida una misura della seconda anta: tutta la porta deve
  rimanere esclusa dall'aggiunta al lavoro fino alla correzione.
- Verificare le scorte manuali e gli avanzi sotto i 50 mm dopo l'aggiunta
  della porta: i rotoli di una stessa famiglia devono restare uniformi.

## Limiti da tenere presenti nell'integrazione

Lo stato è ancora in memoria: ricaricare la pagina perde rilievo e lavoro.
`opening`, `leaves`, `closure` e i tagli nei tipi di porta (`job.types[]`)
sono metadati del lavoro,
non una serializzazione completa che permetta di riaprire e modificare il
rilievo. Per la persistenza occorrono anche bozza del telaio, decisioni sulle
superfici e sui tagli, entrambe le ante, ante attiva e decisioni sulle bobine.
Non serializzare `leafRecords` da solo: lo stato dell'anta attiva è in `door`,
mentre gli snapshot delle altre ante sono in `leafRecords`.

Il telaio è comune alle due ante. La sezione di chiusura mostra l'appoggio
dell'anta selezionata sul telaio; non è una sezione costruttiva dell'incontro
centrale. Il profilo di ciascuna anta alimenta sopra e i due lati: un bordo
centrale differente richiede un rilievo dedicato, senza dedurre denti, inserti
o guarnizioni da una foto insufficiente. Non introdurre quote standard come
se fossero misure rilevate dall'utente.

Restano da fare persistenza, integrazione nell'app, verifica visiva nel browser,
note per chi posa e maniglie per i raggi. Non serve riprogettare la grafica:
mantenere lo stile esistente, una scelta per schermata, un'anteprima grande
e una quota evidente per ciascuna misura.

## Decisioni da conservare

- Quote presenti in ogni passaggio numerico, comprese profondità e spessori
  D/E/I/s/sI del telaio senza coprifili. `quoteKey` risolve gli estremi reali
  nelle quote del pezzo; raggi e sormonti hanno il proprio segno di misura.
  `automaticDoorReference` salta il passo e nasconde il controllo quando il
  piano è unico, oltre al caso della battuta sul coprifilo.
- `state.hasHead` distingue il traverso presente o assente. Senza traverso si
  salta il passo degli angoli, `partCut.head` vale zero per tutti i profili,
  i montanti usano l'altezza rilevata senza maggiorazione di giunto e il
  prospetto non disegna il membro superiore. Le esclusioni manuali sono conservate.
- `state.leafCount` distingue una/due ante; `leafRecords`, `withLeaf` e
  `setActiveLeaf` conservano le misure, il profilo, le guarnizioni, i fogli,
  il fondo e le abbondanze di ciascuna. La guida rileva le ante in successione
  con ID distinti; le quote del telaio già rilevate non vengono chieste due volte.
  Il selettore dell'anta è disponibile anche nella sezione dello stipite.
  `allDoorRows` e `invalidLeaf` alimentano riepilogo, lavoro e bobine con tutte
  le ante: una non valida blocca la porta completa, il telaio non raddoppia.
  Il lavoro salva `opening` e `leaves`, conservando anche `closure` della prima
  anta per compatibilità. Tornare a un'anta esclude la seconda senza perderne i dati.
- Appoggio della battuta dell'anta: `door.stopTarget` distingue `jamb` da
  `casing`, separatamente da chiusura e piano di riferimento. Il caso coprifilo
  usa il primo scalino dell'anta sul frontale reale del coprifilo esterno;
  le ulteriori superfici seguono le battute dello stipite. Una sola anteprima
  ingrandita indica il contatto e la sporgenza calcolata. I profili a due scalini
  sono gestiti anche con due guarnizioni su appoggi distinti.
  `casingFitPairs`/`syncCasingFit` rispettano la fonte delle quote: anta calcola
  il telaio, telaio calcola le quote dipendenti dell'anta, entrambi conserva
  quelle misurate. Non si impone una distanza di sporgenza indipendente.
  Il riferimento è automaticamente il coprifilo, senza domanda sul piano né
  controlli di riferimento nell'editor. `seatChoices` conserva anche il piano
  scelto prima per ripristinarlo tornando allo stipite.
  Tutta la larghezza delle guarnizioni deve incontrare una superficie reale;
  raggi, smussi e distanze dei coprifili non vengono compensati spostando la gomma.
  `closure.stopTarget` e la superficie di arresto vengono salvati nel lavoro;
  film, distinta e bobine continuano a usare il profilo effettivo dell'anta.
  Fonti primarie Köhnlein ed ECO Schulte in `RICERCA-CHIUSURE.md`.
- Sormonti di giunzione aggiornati automaticamente fino allo spigolo adiacente.
  Una sola linguetta marrone separa le due pellicole verdi: il percorso esterno
  appartiene al pezzo posato per ultimo, che copre quello sottostante.
- Coprifili raggiati e smussati: con scalino prima il coprifilo, comprendendo la
  prima faccia dello stipite, poi lo stipite sopra; a filo un pezzo unico fino
  alla guarnizione; sporgenti prima lo stipite, poi il coprifilo sopra, con
  sormonto sul solo breve tratto a vista adiacente. Regola distinta per lato.
- Guarnizione iniziale Sì per ogni battuta; copertura intera o larghezza e
  posizione reali. Modificabile ed eliminabile. Interrompe la pellicola.
  Le scelte esplicite No/eliminata rimangono conservate tornando nella guida.
- Guarnizioni, decisioni Sì/No, copertura e separazioni usano le identità stabili
  delle superfici (`edgeStateKey`), assegnate prima delle teste a vista variabili.
  Le battute hanno chiavi `rebate:1`/`rebate:2`, conservate anche se cambia il
  pezzo che ospita la battuta dell'imbotte. Non usare gli indici del disegno
  come chiavi di stato: aggiungere la testa esterna cambia quegli indici.
  Anche i riferimenti già aperti della guida risolvono la superficie attuale
  e non possono scrivere in un'altra bozza. L'avviso di anta incassata nella
  doppia battuta non deve descriverla come una battuta singola.
- Anta: sopra e sui lati il foglio destro sta sotto e il sinistro sopra.
  Nella battentata si sovrappongono sul tratto Lb fino allo spigolo basso;
  nella semplice entrambi coprono tutto lo spessore. Sotto: completo, due metà
  senza sovrapposizione, oppure scoperto. Sopra resta sempre rivestita.
- La ricerca in `RICERCA-ANTE.md` documenta sagome e guarnizioni anche sull’anta,
  su fonti ECO Schulte, Westag e Sebino. L’utente conferma guarnizioni su entrambi
  gli elementi. Dalla foto non si identifica un ulteriore inserto rigido certo:
  nessun dente o sede proprietaria è stato inventato.
- Revisione guidata richiesta durante la prova: una sola scelta e una sola
  anteprima grande per schermata. Chiusura, piano di riferimento, superficie
  dell’anta e arresto del telaio sono quattro passaggi distinti. Le quote
  Sb/Lb/Sb2/Lb2 hanno linee di quota; sporgenza e P/P1/P2 hanno uno zoom con
  riferimenti sui punti effettivi. Le figure delle guarnizioni comprendono
  telaio e anta, senza lo schema isolato a Z.
- La presenza della guarnizione mostra subito gomma gialla e freccia; No
  cambia davvero il disegno. Con una sola sede Sì/Avanti la assegna, senza
  chiedere dove si trova. Con più scalini la scelta resta esplicita.
  Anche il passo sull’appoggio viene saltato se esiste una sola risposta valida.
- `doorJambGaps` confronta le superfici orizzontali con l’inviluppo dello stipite.
  Il controllo è indipendente dalla fonte delle quote e dai tipi di appoggio;
  scegliere Faccia non può più saltarlo. `fitPairs` include anche il riferimento
  della faccia per la battuta singola. Configurazioni con un vuoto sono escluse
  e non producono una distinta valida. Le quote rilevate non vengono falsificate.
  Gli esempi di anta senza scalini su telaio doppio iniziano sulla prima battuta,
  senza obbligare una cavità sotto il bordo. Le altre scelte restano verificabili.
- `fitBasis` richiede una scelta esplicita: anta, stipite o entrambi.
  `fitPairs`, `syncFitGeometry` e `fitCandidate` collegano solo le superfici
  corrispondenti gestite dal modello. Anta calcola le battute del telaio;
  stipite calcola gli scalini dell’anta. Le quote dipendenti sono protette
  nell’editor e saltate nella guida. Con entrambi si conservano le quote
  rilevate e si impedisce la conferma degli abbinamenti incompatibili.
  Non estendere queste relazioni a profili proprietari non rilevati.
- Le guarnizioni delle ante battentate si inseriscono solo sugli scalini
  verticali: primo, secondo o entrambi, con misure separate. Nessuna sui
  piani del bordo. Una guarnizione sull’anta esclude quella contrapposta
  sulla superficie del telaio che la riceve: le altre restano indipendenti.
  `leafSealOnFrameSurface` impedisce la reinserzione sul medesimo appoggio.
- **Due scalini** aggiunge Lb2 e Sb2 indipendenti dal telaio. `doorProfileEdges`
  è la sagoma comune per sezione, film e tagli. Senza guarnizioni si sceglie
  esplicitamente lo scalino del sormonto; non si deduce dall’arresto del telaio.
- `door.profileOptions` conserva per sagoma guarnizioni e scelta del sormonto.
  Chiavi `leaf:<tipo>:<superficie>`, separate da quelle della maestà. La guida
  parte da Sì: con una sede unica la assegna, con più sedi chiede quale;
  non indovina una sede nei profili complessi.
  Le fasce rettilinee si modificano ed eliminano nella scheda Anta. Si estendono
  sopra e sui due lati; sotto restano le tre opzioni precedenti.
- `leafProfileRanges` sottrae la gomma dallo sviluppo reale. I fogli terminano
  ai suoi bordi; i tratti rimasti separati generano tre strisce aggiuntive
  (due montanti e traverso), con abbondanze e lunghezze proprie. Il risvolto
  in cava facoltativo si somma ai bordi adiacenti. Distinta e bobine usano
  gli stessi pezzi; nessun sormonto marrone passa attraverso la guarnizione.
- `closedDoorLeaf` verifica anche i contatti delle guarnizioni dell’anta con
  piani orizzontali e verticali del telaio. La sezione riflessa inverte le
  coordinate del tratto, mantenendo l’origine della misura. Ogni fascia
  senza appoggio viene segnalata, anche se un’altra fascia appoggia.
- Abbondanze iniziali: anta 25 mm per lato; stipiti, coprifili e imbotte
  15 mm a ogni estremità. Misure visibili e inseribili con massimo due decimali.
- L/H indicano la luce minima sulla parte più spessa dello stipite, mai la
  distanza fra coprifili. I livelli e le lunghezze dei pezzi usano quel piano.
- La ricerca in `RICERCA-CHIUSURE.md` sostituisce la vecchia deduzione
  «singola sopra il coprifilo, doppia obbligatoria per il filo». Bordo dell'anta,
  gradini dello stipite e complanarità sono scelte indipendenti. Le fonti dei
  produttori sono consultabili anche nei dettagli della guida.
- Passaggio **Come chiude l'anta?**: sovrapposta, a filo, rientrata;
  riferimento coprifilo o estremità dello stipite, parete nel filomuro.
  Negli ulteriori passaggi separati si scelgono riferimento, parte dell’anta
  in appoggio e battuta del telaio. `selectedDoorStop` usa le stesse
  chiavi semantiche delle guarnizioni e non ripiega su un'altra battuta se
  quella selezionata manca.
- Lb e Sb rimangono quote dell'anta nel rilievo indipendente. Il vecchio
  automatismo universale Lb=b1 è rimosso; il nuovo collegamento vale soltanto
  scegliendo esplicitamente nella guida quale elemento misurare e quale calcolare.
  Lb 6, Sb S/2 e sporgenza 10 mm sono esempi iniziali dichiarati, non norme.
- `closedDoorLeaf` verifica contatti di superficie reali sulla faccia o sullo
  scalino selezionato. La sezione mantiene il linguaggio grafico precedente,
  con un segno sul contatto effettivo e il piano di confronto nella guida.
  È rimossa la fuga numerica convenzionale da 2 mm. Il giallo ha spessore
  grafico simbolico: non simula una compressione misurata della guarnizione.
- Le posizioni automatiche compongono solo quote ancora di esempio. Il nuovo
  passo di misura dell'arresto registra la quota anche premendo Avanti senza
  digitare un altro valore (`confirm`). Chiusura, sporgenza e tipo di bordo
  non sovrascrivono le posizioni rilevate. Le incompatibilità compaiono come
  avvisi; non si allarga il telaio o si modifica Lb per ottenere un contatto.
- **Senza coprifili / filomuro**: `casing:'none'`, riferimento `wall`.
  La sezione contiene solo telaio/imbotte a vista da rilevare. I tratti di
  parete si escludono in Pellicola, i dettagli incassati non si ricostruiscono.
  Distinta e bobine non contengono coprifili o sormonti verso pezzi assenti.
- Lavoro salva metadati di chiusura (scelta e distanza effettiva), profilo,
  appoggio e materiale insieme alla distinta. Il materiale è **Cover Styl**;
  l'utente usa più finiture e ha confermato di conservare il proprio metodo
  sui bordi. Nessun minimo di sormonto 3M o generico Cover Styl viene applicato
  automaticamente a una battuta della porta. Restano da associare le eventuali
  istruzioni specifiche alla referenza effettiva.
- Le facce dell'anta usano sempre la stessa larghezza di taglio bobina, la
  maggiore necessaria; le lunghezze rimangono specifiche dei due fogli.
- Avanzi fino a 50 mm: una famiglia si allarga solo se tutti i suoi rotoli,
  su tutte le bobine, possono aumentare ugualmente. Altrimenti resta lo scarto.
- Scorte composte dall'utente con misura, quantità, controllo del residuo e
  applicazione esplicita; al massimo due suggerimenti inizialmente chiusi.
  Le composizioni manuali non vengono ridimensionate automaticamente.
- Sezione mobile leggibile: quote essenziali in Misure, disegno pulito in
  Pellicola, sviluppi e spiegazioni nei dettagli apribili.

## Verifica dello stato consegnato

HTML SHA256: `a2032b248b17b1b7e3fdfca54d7e41b8004a589329c522753181c0c0419a4722`.

Superati 256 gruppi in 31 esecuzioni. Le nuove verifiche comprendono 11 gruppi
su tutte le quote numeriche, riferimenti automatici, traverso assente, due ante
indipendenti e conteggi; due creazioni complete con ante disuguali, con e senza
traverso, 5 gruppi ciascuna, fino al lavoro e al piano bobine. I restanti 235:
appoggio sul coprifilo 13,
sei creazioni complete sul coprifilo (uno/due scalini, quote da anta/stipite/entrambi)
5 ciascuna; guarnizioni 17, profili raggiati/smussati 21,
ordine grafico dei sormonti 10, sormonti automatici 8, anta e tagli 12, sezione
e scorte 9, bobine uniformi e luce minima 9, sezione e appoggio dell'anta 8,
regole di chiusura 4, aggancio stabile delle superfici 6, nuovo modello di
chiusura 12, flusso dell'interfaccia 5, profili e guarnizioni dell’anta 17,
guida e vincoli geometrici 13, tre flussi completi dell’anta e dei controlli
5 ciascuno, presenza/sede unica/inviluppo fisico 11 e tre flussi completi
a battuta singola 5 ciascuno. Le vecchie prove che imponevano la
regola singola/doppia o Lb=b1 sono state aggiornate ai requisiti documentati;
i confronti di taglio usano le stesse quote fisiche esplicite.

Verificati sintassi, JavaScript effettivo in Node VM, avvio completo e creazione
filomuro, tre creazioni a due scalini e tre a scalino singolo (quote da anta,
stipite o entrambi),
con guarnizioni sui due elementi in jsdom,
con elementi ed eventi DOM reali, tastierino a due decimali, distinta e bobine.
Verificati conservazione del materiale, tratti isolati, fasce fuori misura,
quote dipendenti, assenza di vuoto fra gli scalini e guarnizioni contrapposte
impedite. Le vecchie prove delle guarnizioni sui piani sono aggiornate ai
soli scalini richiesti dall’utente.
Verificato il cambiamento reale Sì/No, l’assegnazione della sede unica,
il rifiuto dell’appoggio con vuoto e il mantenimento dei casi Faccia validi.
Verificati appoggio sul coprifilo, contatti separati delle guarnizioni,
copertura completa della gomma anche vicino a raggi e smussi, protezione della
sporgenza calcolata, ritorno allo stipite e riapertura del passo corretto della
guida. Le sei creazioni aggiuntive arrivano al lavoro e al piano bobine.
Le prove dei tagli grezzi restano distinte dall’ammissibilità dell’insieme:
un profilo impossibile non viene più considerato esportabile solo perché
le singole superfici sono quotate.
Esportate sezioni SVG reali in entrambi i temi e ispezionate le immagini
PNG dei casi principali, comprese doppia battuta e sezione riflessa.
La verifica in jsdom non è una verifica di rendering
browser: gli strumenti browser previsti non erano disponibili. Script, dipendenze
di verifica e artefatti rimangono fuori dal prototipo; l'HTML non ha dipendenze.

## Prossimo lavoro

Restano il salvataggio persistente di sopralluoghi e porte, l'integrazione
nell'app, le note operative per il posatore e le maniglie dei raggi. Ricaricare
il prototipo perde ancora lo stato. Non sono state modificate le sorgenti
React, il service worker o la configurazione delle build dell'app.
