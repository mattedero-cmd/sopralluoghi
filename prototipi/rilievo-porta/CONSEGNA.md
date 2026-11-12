# Consegna del prototipo a Claude — 12 novembre 2026

## Ambito

Il prototipo resta autonomo in `rilievo-porta.html`, senza dipendenze e senza
integrazione nell'app Sopralluoghi. Il README accanto contiene le regole finali.
Questo salvataggio nel repository è stato richiesto **senza pubblicare l'app**.
Il branch di lavoro è `claude/practical-hopper-vnajks`; in `vercel.json` è
disabilitato il deploy Git automatico solo per questo branch. Gli altri branch
mantengono il comportamento precedente. Non rimuovere questo blocco per una
semplice consegna; una pubblicazione dovrà essere richiesta separatamente.

## Decisioni da conservare

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
- Abbondanze iniziali: anta 25 mm per lato; stipiti, coprifili e imbotte
  15 mm a ogni estremità. Misure visibili e inseribili con massimo due decimali.
- L/H indicano la luce minima sulla parte più spessa dello stipite, mai la
  distanza fra coprifili. I livelli e le lunghezze dei pezzi usano quel piano.
- La ricerca in `RICERCA-CHIUSURE.md` sostituisce la vecchia deduzione
  «singola sopra il coprifilo, doppia obbligatoria per il filo». Bordo dell'anta,
  gradini dello stipite e complanarità sono scelte indipendenti. Le fonti dei
  produttori sono consultabili anche nei dettagli della guida.
- Nuovo passaggio **Come chiude l'anta?**: sovrapposta, a filo, rientrata;
  riferimento coprifilo o estremità dello stipite, parete nel filomuro.
  Si sceglie se appoggia la faccia oppure lo scalino della battentata e, con
  più battute, su quale avviene l'arresto. `selectedDoorStop` usa le stesse
  chiavi semantiche delle guarnizioni e non ripiega su un'altra battuta se
  quella selezionata manca.
- Lb e Sb rimangono quote dell'anta. Sono rimossi l'automatismo Lb=b1 e il
  relativo pulsante; cambiare b1 non cambia i fogli di un'anta già quotata.
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

HTML SHA256: `f0c4b339baded7dd5db427afff723811a2c57d83dc8cfd72fc0359a7067f375c`.

Superati 121 gruppi di verifica: guarnizioni 17, profili raggiati/smussati 21,
ordine grafico dei sormonti 10, sormonti automatici 8, anta e tagli 12, sezione
e scorte 9, bobine uniformi e luce minima 9, sezione e appoggio dell'anta 8,
regole di chiusura 4, aggancio stabile delle superfici 6, nuovo modello di
chiusura 12, flusso dell'interfaccia 5. Le vecchie prove che imponevano la
regola singola/doppia o Lb=b1 sono state aggiornate ai requisiti documentati;
i confronti di taglio usano le stesse quote fisiche esplicite.

Verificati sintassi, JavaScript effettivo in Node VM, avvio completo e creazione
filomuro in jsdom con elementi ed eventi DOM reali, distinta e piano bobine.
Esportate sei sezioni SVG reali in entrambi i temi e ispezionate le immagini
PNG dei casi principali. La verifica in jsdom non è una verifica di rendering
browser: gli strumenti browser previsti non erano disponibili. Script, dipendenze
di verifica e artefatti rimangono fuori dal prototipo; l'HTML non ha dipendenze.

## Prossimo lavoro

Restano il salvataggio persistente di sopralluoghi e porte, l'integrazione
nell'app, le note operative per il posatore e le maniglie dei raggi. Ricaricare
il prototipo perde ancora lo stato. Non sono state modificate le sorgenti
React, il service worker o la configurazione delle build dell'app.
