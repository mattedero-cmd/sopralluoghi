# Chiusura della porta e posa della pellicola

Ricerca su fonti dei produttori, consultate il 12 novembre 2026.
Ambito concordato: porte battenti con coprifili e filomuro. Le altre aperture
restano da sviluppare con un rilievo dedicato.

L’estensione su sagome dell’anta, doppio scalino e guarnizioni montate anche
sull’anta è documentata in [RICERCA-ANTE.md](RICERCA-ANTE.md).

## Distinzioni usate nell'app

| Aspetto | Significato nel rilievo |
| --- | --- |
| Porta a battente | Sistema di apertura. Non significa che il bordo dell'anta abbia uno scalino. |
| Anta battentata | Bordo con scalino, da misurare con Lb e Sb. |
| Battuta singola o doppia dello stipite | Uno o due gradini del profilo del telaio; non il numero di ante. |
| Anta a filo | Faccia complanare a un piano dichiarato: coprifilo, estremità del telaio o parete. |
| Anta sovrapposta | Faccia sporgente rispetto a quel piano, con distanza da rilevare. |
| Anta rientrata | Faccia arretrata rispetto a quel piano; caso misurato, non valore iniziale universale. |
| Filomuro | Riferimento alla parete e assenza dei coprifili tradizionali. Il telaio resta specifico del sistema. |
| Battuta sul coprifilo | Il risalto dell'anta incontra il frontale del coprifilo di battuta, parte del sistema del telaio. L'allineamento della faccia resta un dato distinto. |

Il numero di gradini del telaio non determina da solo la complanarità o la
geometria del bordo. Le quote del telaio e quelle dell'anta si rilevano
separatamente. Il disegno è una sezione di rilievo, non un progetto costruttivo
del telaio del produttore.

## Fonti sulla chiusura

- [Köhnlein Türen, glossario tecnico ufficiale](https://www.koehnlein-tueren.de/innentueren/weiterfuehrendes/tuerenlexikon/#collapse-35778):
  la voce *Einfachfalz* descrive la battuta dell'anta che chiude nella
  *Falzbekleidung*. Le voci *Bekleidungen* e *Falzbekleidung* distinguono il
  coprifilo di battuta fissato al telaio dalla finitura sul lato opposto.
  Non è una proprietà di qualsiasi cornice decorativa separata.
- [ECO Schulte, Bandtechnik, p. 628, figura 1b](https://www.eco-schulte.com/fileadmin/downloads/intro/eco_intro_bandtechnik.pdf#page=6):
  sezione di anta battentata con guarnizione nel risalto, distinta dalla
  guarnizione interna del telaio. Il termine generico *Zarge* del disegno
  non identifica da solo un coprifilo decorativo separato.
- [SIMONSWERK, TECTUS TE 240 3D](https://selector.simonswerk.com/en/products/detail/te-240-3d)
  e relativa scheda: contempla ante senza battuta e ante battentate complanari.
  Questo contraddice una deduzione universale del tipo «filo = due gradini».
- [FerreroLegno, Flat ed Evoluto Eleva](https://www.ferrerolegno.com/it/arredare/2898-larchitetto-e-il-signor-rossi.html):
  distingue l'anta complanare al coprifilo dai sistemi integrati nella parete.
  Non basta chiamare entrambi «a filo» senza nominare il piano.
- [ECLISSE, libreria tecnica Syntesis Line Battente](https://www.eclisse.it/download/syntesis-collection/syntesis-line-battente/)
  e [scheda del 12 febbraio 2026](https://www.eclisse.it/wp-content/uploads/2026/02/st-syntesislinebattente-syntesislineestensione.pdf):
  sezioni di sistemi filomuro a spingere e a tirare, senza coprifili tradizionali.
  Le quote di questi prodotti non diventano valori standard dell'app.
- [Garofoli, Bilato e Biverso](https://www.garofoli.com/it/bilato-la-porta-complanare-su-entrambi-i-lati/):
  documenta anche complanarità sui due lati e sistemi bidirezionali con telai
  specifici. Questi casi non si ricavano aggiungendo automaticamente un gradino
  al modello generico.

## Applicazione al prototipo

La guida chiede tipo di bordo, piano di confronto, chiusura, superficie
dell'anta in appoggio e battuta effettiva di arresto. Le sezioni e la posizione
delle guarnizioni verificano questi dati. Le misure inserite o confermate non
sono riscritte per far combaciare un esempio.

Per le ante con scalino e coprifili esiste un passo dedicato «Dove appoggia la
battuta dell'anta?»: stipite oppure coprifilo. Una sola anteprima ingrandita
evidenzia il contatto scelto. Nel secondo caso il primo scalino incontra il
frontale del coprifilo; il riferimento è automaticamente il coprifilo e la
domanda sul piano viene saltata. La sporgenza è un risultato di Sb, protetto
nell'editor e non richiesto come quota indipendente. Tornando allo stipite
si ripristina il precedente piano di riferimento scelto.
Le ulteriori battute seguono le quote dell'anta o del telaio secondo la fonte
scelta esplicitamente. Con «entrambi» le misure rilevate restano indipendenti.
Queste sono relazioni del modello schematico di contatto, non quote di norma.

Le guarnizioni dell'anta e dello stipite possono lavorare su due appoggi
distinti. Per l'appoggio sul coprifilo si verifica anche la copertura completa
della fascia di gomma: un contatto parziale vicino a un raggio, smusso o
coprifilo arretrato non basta. La fascia deve essere misurata nella sua
posizione reale; non viene accorciata o spostata in automatico. I vuoti sotto
lo stipite e le guarnizioni contrapposte sul medesimo contatto restano esclusi.
Distinta e bobine usano gli stessi profili e le stesse interruzioni di pellicola.

Il contatto è rappresentato sul piano della guarnizione; il tratto giallo ha
spessore grafico simbolico. Non si assegnano una compressione della guarnizione
o una fuga numerica non rilevate. Se le superfici non si incontrano realmente,
compare un avviso. Lb e Sb rimangono misure dell'anta e alimentano lo stesso
piano di sviluppo usato per grafica, fogli, distinta e piano bobine.

Per il filomuro si quotano solo telaio e superfici effettivamente a vista. Gli
eventuali tratti di parete si escludono in Pellicola; non si disegnano profili
nascosti o sedi di ferramenta inventati e non si generano coprifili assenti.

## Pellicola Cover Styl

L'utente usa più finiture Cover Styl e ha confermato il mantenimento del proprio
metodo sui bordi delle porte. Le regole di posa già definite restano operative:
chiusura sullo spigolo, ordine dei fogli, interruzione alle guarnizioni, scelta
del bordo inferiore, abbondanze 25 mm per l'anta e 15 mm per la maestà.

Fonti del marchio:

- [Manuale tecnico Cover Styl](https://ssi.s3.fr-par.scw.cloud/cover-styl/web/Cover_Styl_Technical_Manual_EN_f5e997a7cc.pdf),
  pp. 11–14: tratta sormonti, giunti accostati, bordi e indicazioni per alcune
  serie. Ad esempio Glitter PET R5–R19 prevede giunti accostati. Le istruzioni
  specifiche si associano alla referenza effettiva, non al solo marchio.
- [FAQ Cover Styl](https://coverstyl.com/en/faq/): raccomandazione generale di
  20–30 mm alle giunzioni fra teli. Non identifica una quota Lb della porta.
  I rotoli hanno misure da controllare sulla referenza: i parametri iniziali
  1220 mm × 50 m del piano restano modificabili.
- [Schede per referenza](https://coverstyl.com/en/resources/data-sheets/):
  fonte per dimensioni, orientamento e particolarità del materiale scelto.

La precedente ricerca della [guida 3M DI-NOC, revisione M, febbraio 2026](https://multimedia.3m.com/mws/media/1576574O/di-noc-install-guide-rk-pdf.pdf)
è servita come confronto: le sue prescrizioni non sono applicate a Cover Styl.
Non si aumenta automaticamente il sormonto di una piccola battuta a 15, 20 o
30 mm, né si aggiunge una percentuale di sfrido al piano di taglio geometrico.

Le facce dell'anta conservano la stessa larghezza di bobina, la maggiore
necessaria. L'assorbimento degli avanzi e le scorte manuali rimangono quelli
concordati; cambiano soltanto i pezzi derivati dalle superfici effettive.
