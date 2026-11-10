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

## Come si usa

1. **Creazione guidata del modello**, una scelta alla volta:
   battuta (nessuna, singola, doppia, con imbotte) → coprifilo (squadrato, smussato,
   raggiato, modanato, a gradino, telescopico, a sormonto, integrato) → posizione del
   coprifilo per lato (a filo, arretrato, sporgente) → angoli (montanti passanti,
   traverso passante, 45°) → riepilogo.
2. **Misure guidate**, una per schermata, con disegno e tastierino: luce L e H, bordo
   dell'anta, L/H/S dell'anta (+ battuta o raggio), facce da rivestire, abbondanze di
   maestà e anta, sormonti di coprifili e stipite.
3. **Sezione a mano** nel banco di lavoro: si trascinano i lati del pezzo (1 mm ogni
   7 px), il coprifilo si sposta su e giù prendendolo dal centro, un tocco apre il
   tastierino accanto alla quota.
4. Strumenti del banco di lavoro: **Misure**, **Pellicola** (tratti da rivestire,
   separazioni, sormonti S), **Guarnizioni** (tocco sul punto del profilo), **Tagli**
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

### Guarnizioni
- Una guarnizione su un tratto interrompe la pellicola: due tagli separati, ognuno con il
  suo risvolto dentro la cava (posizione, larghezza cava, risvolto).

### Lunghezze dei pezzi
- Si misura una volta la **luce del passaggio** L × H, sul piano esterno dello stipite
  (livello 0).
- Ogni tratto del profilo ha un **livello** rispetto alla luce: il coprifilo arriva fino
  a +A, la battuta entra di −b.
- Superfici rivolte verso il passaggio o verso il muro: montante H + livello,
  traverso L + 2 × livello, qualunque sia la giunzione. Per questo le battute si
  incontrano a H − b.
- Facce frontali (faccia del coprifilo, gradino della battuta, teste a vista):
  - montanti passanti → montante H + liv. max, traverso L + 2 × liv. min
  - traverso passante → montante H + liv. min, traverso L + 2 × liv. max
  - 45° → montante H + liv. max, traverso L + 2 × liv. max
- Una striscia di più tratti si taglia sulla lunghezza del tratto più lungo.

### Anta
- Ogni faccia risvolta su tutto il bordo.
- Squadrata: L + 2S × H + 2S. Battentata (L e H sul lato battuta, battuta su 3 lati):
  lato battuta L + 2S + 2Lb × H + 2S + Lb, lato opposto L + 2S × H + 2S.
  Arrotondata: si aggiunge lo sviluppo degli archi.
- Più 2 × abbondanza per lato.

### Sequenza di posa
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
- **Avanzo fino a 50 mm**: si spartisce sui rotoli della bobina a passi di 5 mm. I rotoli
  da anta (≥ 600 mm) possono prendersi tutti i 50 mm, quelli medi (300–600) fino a 20,
  i rotolini al massimo 10. Mai oltre l'abbondanza massima.
- **Spazio libero oltre i 50 mm**: lo decide l'utente. Le scelte sono: tienilo intero,
  fanne scorta con le misure del lavoro, una scorta e il resto intero, oppure nessuna
  scorta. Le proposte mettono davanti le misure **senza margine**: meno di 2 pezzi
  liberi, o meno del 2% dei pezzi, nei rotoli già previsti.
- La **distinta di taglio** si copia in CSV (larghezza; lunghezza; quantità; pezzi) per il
  nesting.

Tutti i parametri del piano bobine si possono modificare dalla scheda Lavoro.

## Da fare

- Salvataggio di sopralluogo, porte del lavoro e decisioni (con l'integrazione nell'app).
- Altre regole di posa (da quale lato partire, note per chi posa).
- Disegno dei sormonti come sovrapposizione anche nel banco di lavoro.
- Maniglie anche sugli spigoli curvi (raggi).
