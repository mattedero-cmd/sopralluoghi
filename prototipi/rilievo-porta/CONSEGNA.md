# Consegna del prototipo a Claude — 11 novembre 2026

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
- Anta: sopra e sui lati il foglio destro sta sotto e il sinistro sopra.
  Nella battentata si sovrappongono sul tratto Lb fino allo spigolo basso;
  nella semplice entrambi coprono tutto lo spessore. Sotto: completo, due metà
  senza sovrapposizione, oppure scoperto. Sopra resta sempre rivestita.
- Abbondanze iniziali: anta 25 mm per lato; stipiti, coprifili e imbotte
  15 mm a ogni estremità. Misure visibili e inseribili con massimo due decimali.
- L/H indicano la luce minima sulla parte più spessa dello stipite, mai la
  distanza fra coprifili. I livelli e le lunghezze dei pezzi usano quel piano.
- Anta iniziale a filo del coprifilo esterno, sporgenza configurabile da 0 mm,
  appoggio sulla guarnizione reale. Le quote di battuta rilevate manualmente
  sono conservate e disattivano il posizionamento automatico.
- Sezione dell'anta basata sugli esempi fotografici di ante in battuta:
  bordo di chiusura continuo con scalino effettivo, riempimento leggero,
  fianchi tratteggiati e interruzione grafica del corpo. Una fuga di riferimento
  separa i bordi paralleli lasciando il fianco sulla guarnizione. Il disegno
  mantiene i colori del progetto e non altera quote o tagli di pellicola.
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

HTML SHA256: `c81967ed627089c01db551d050f75a0540fbdf772c18e60e57220d6d01ab73b9`.

Superati 91 gruppi di verifica sul JavaScript effettivo in Node VM e DOM simulato:
guarnizioni 17, profili raggiati/smussati 21, ordine grafico dei sormonti 10,
sormonti automatici 8, anta e tagli 12, sezione e scorte 9, bobine uniformi e
luce minima 9, sezione dell'anta e appoggio 5. Verificati sintassi e SVG reali
esportati in PNG, compresa la sezione quotata in modalità chiara e scura. L'ultima
iterazione non ha una verifica browser completa: gli strumenti di anteprima
non erano disponibili. Gli script e gli artefatti di sessione restano fuori
dal prototipo; non sono richiesti per aprire l'HTML.

## Prossimo lavoro

Restano il salvataggio persistente di sopralluoghi e porte, l'integrazione
nell'app, le note operative per il posatore e le maniglie dei raggi. Ricaricare
il prototipo perde ancora lo stato. Non sono state modificate le sorgenti
React, il service worker o la configurazione delle build dell'app.
