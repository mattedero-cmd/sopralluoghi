# Consegna del prototipo a Claude — 12 novembre 2026

## Stato del lavoro

Il sorgente corrente è `prototipi/rilievo-porta/rilievo-porta.html` sul branch
`claude/practical-hopper-vnajks` di `mattedero-cmd/sopralluoghi`.
Questa revisione prosegue dal salvataggio `6f04c0e60e817f961b6aa56ee2a5e761b82dcee6`
e contiene la revisione d’uso e la nuova scelta iniziale della maniglia.

Rimane un HTML/CSS/JavaScript autonomo, senza installazione o build React.
Il [README](README.md) descrive le regole correnti; le fonti tecniche sono in
[RICERCA-CHIUSURE.md](RICERCA-CHIUSURE.md) e [RICERCA-ANTE.md](RICERCA-ANTE.md).
Non reinterpretare le indicazioni dei produttori come quote già rilevate.

**L’app Sopralluoghi non è stata pubblicata.** Non sono state modificate le sue
sorgenti, il service worker o le build. La disabilitazione del deploy Git
automatico per questo solo branch in `vercel.json` resta invariata. Il nuovo
commit usa anche `[skip ci]`; non togliere il blocco per consegnare il prototipo.

## Blocco operativo: copia di prova ancora da aggiornare

L’ambiente di lavoro si è arrestato e non è ripartito: il servizio ha restituito
`503 / gateway_unavailable / container_service_failed`. Il recupero finale,
le modifiche e il salvataggio sono stati eseguiti attraverso gli strumenti
disponibili in memoria e il connettore GitHub, senza ambiente shell.

La [copia privata di prova](https://rilievo-porta-prova.matteo89.chatgpt.site)
**non contiene questa revisione**. Il suo ultimo HTML confermato è quello con
SHA-256 `a2032b248b17b1b7e3fdfca54d7e41b8004a589329c522753181c0c0419a4722`,
commit del repository Sites `cda2e538282bd511240ee48e2aadc9702dd2b712`.
Il progetto Sites esistente è `appgprj_6af3f9c9344c8191ad26a7f203565364`,
statico, directory `dist`, con pubblico privato del proprietario.
L’aggiornamento della sola copia di prova è già stato richiesto dall’utente:
preservare identità e pubblico, seguire il workflow Sites e usare questo HTML
come `dist/index.html`. L’app principale resta fuori dalla pubblicazione.

Se torna disponibile il vecchio workspace, la bozza HTML locale potrebbe
precedere il recupero finale: **prendere come riferimento il file di questo
branch**, non sovrascriverlo con quella bozza.

## Modifiche di questa revisione

1. **Prima domanda: lato della maniglia.** La vista è dal lato a tirare; il
   disegno mostra maniglia e cerniere opposte. `state.handleSide` e
   `state.handleChosen` conservano la scelta, inizialmente esplicita.
   La riflessione è grafica: quote, superfici, ordini di posa, quantità e tagli
   rimangono identici. I testi vengono contro-riflessi e restano leggibili;
   gli spostamenti orizzontali delle quote seguono il verso della vista.
   Le ante 1 e 2 conservano la numerazione sinistra/destra nel prospetto.
   I nomi delle facce usano grande/piccola o esterna/interna, evitando indicazioni
   destra/sinistra che sarebbero ambigue nella vista riflessa.
   Non è stata introdotta una classificazione normativa della mano di apertura.
2. **Coprifili:** un dettaglio grande della forma scelta; parete a righe,
   stipite incrociato, coprifilo pieno, nomi con richiami. Le forme alternative
   sono pulsanti compatti. Posizione esterna e interna sono due passaggi separati.
3. **Guida snella:** eliminati il riepilogo iniziale e le pagine informative
   sui sormonti automatici. Il modello viene applicato entrando nella prima
   misura. I sormonti continuano a essere calcolati e le misure manuali
   necessarie rimangono nella guida.
4. **Misure riconoscibili:** nella luce minima non compare l’anta; nelle
   misure dell’anta non compare la maestà e c’è la maniglia. I dettagli di
   chiusura nominano anta, stipite e coprifilo. La battuta dello stipite viene
   quotata senza mostrare un’anta che possa confondere il riferimento.
5. **Misure L/H sulla faccia più grande, comprese le battute**, confermato
   esplicitamente dall’utente. Le facce più piccole sono ricavate sottraendo
   2 × somma scalini in larghezza e 1 × somma scalini in altezza.
   Il piano fisico della pellicola alimenta anche strisce separate, tagli,
   riepilogo e bobine. Il fronte e retro rimangono della stessa larghezza
   di bobina per ciascuna anta.
6. **Guarnizioni raggruppate:** prima le presenze sullo stipite e sull’anta,
   poi larghezze e posizioni. Con due ante si raggruppano entrambe le presenze.
   I dettagli mantengono il proprietario della misura e una spiegazione breve
   distingue gomma su tutta la battuta da larghezza/inizio rilevati.
   Sul **bordo diritto** non esistono guarnizioni dell’anta: nessuna domanda,
   aggiunta nell’editor o interruzione di pellicola dovuta a vecchie fasce.
   Rimane indipendente la guarnizione dello stipite.

## Convenzione delle misure: attenzione nell’integrazione

Il nuovo stato `door.sizeBasis` vale `outer`. `doorFaceSizes()` centralizza
le misure effettive delle due facce e `doorFilmPlan()` aggiunge risvolti e
abbondanze. Le lunghezze delle strisce isolate fanno riferimento alla faccia
piccola, preservando la geometria precedente a parità di porta reale.

Uno stato preesistente senza `sizeBasis` vale `back`, ossia la convenzione
precedente. Confermare o modificare L/H nella guida chiama
`useOuterDoorSizeBasis()`, che converte entrambe le misure senza cambiare i tagli.
Non rinominare le vecchie quote senza convertirle. Il lavoro salva
`sizeBasis` per ogni anta e nella sua chiusura. La scelta della vista è in
`opening.handleSide`, con `opening.view:'pull-side'`.

## Verifica eseguita e limiti

Il rapporto [VERIFICA-USABILITA.json](VERIFICA-USABILITA.json) accompagna
**lo stesso HTML** salvato in questo commit. Sono passati 14 gruppi di controlli
in V8: sintassi, 54 dettagli di coprifilo, quote e proprietari, guarnizioni,
equivalenza dei tagli delle due convenzioni, profili a uno/due scalini con
guarnizioni parziali e strisce isolate, chiusura a filo, indipendenza della vista
e due percorsi della guida fino all’aggiunta al lavoro.

I percorsi usano le funzioni reali del prototipo e gli eventi dei controlli
su un DOM minimo simulato. Sono esclusi il bootstrap HTML/CSS completo,
il rendering del browser, dimensioni effettive dei testi e l’interazione touch
reale; alcune funzioni di ridisegno vengono sostituite durante la navigazione.
Non sono test jsdom e non sostituiscono una prova sul telefono.
Le 256 verifiche della versione precedente non sono dichiarate rieseguite
su questo HTML. I vecchi artefatti di sessione possono non essere disponibili.

Quando torna l’ambiente, le attività residue sono:

- Provare su telefono maniglia sinistra/destra, leggibilità dei richiami,
  entrambe le posizioni del coprifilo e le quote specchiate.
- Provare una porta a bordo diritto a filo e una battentata, con gomma sullo
  stipite oppure sull’anta. Controllare che i dettagli non nascondano l’appoggio.
- Provare le due ante disuguali, anche senza traverso, modificando il profilo
  di una sola; verificare distinta e scorte senza duplicare il telaio.
- Aggiornare la sola copia privata Sites dal file del repository e confermare
  l’esito del deploy. Questa è l’unica pubblicazione ancora necessaria per
  la richiesta corrente.

## Regole precedenti da conservare

- Una sola linguetta marrone centrale distingue i due strati di pellicola.
  Nei raggiati/smussati: scalino → coprifilo prima e stipite sopra; a filo →
  un pezzo fino alla guarnizione; sporgente → stipite prima e coprifilo sopra.
  I sormonti seguono l’intero tratto adiacente fino allo spigolo e si fermano
  alle guarnizioni, senza aggiungere lembi reciproci.
- La guarnizione resta agganciata alla superficie semantica anche spostando
  i coprifili. Guarnizioni di anta e stipite sono distinte e non possono
  sovrapporsi sulla stessa superficie di contatto.
- Le quote misurate/confermate non vengono modificate per forzare una chiusura;
  le incompatibilità fisiche rimangono bloccate. Nessun vuoto o compressione
  inventati. Battuta singola/doppia e chiusura a filo sono indipendenti.
- Sul coprifilo di battuta il piano è automatico e la sporgenza è calcolata.
  Senza coprifili il riferimento parete è unico: nessuna domanda sul piano.
- Anta: 25 mm per lato; maestà: 15 mm alle estremità. Quote massime a due
  decimali, calcoli degli archi precisi e arrotondamento dei tagli per eccesso.
- Senza traverso: niente angoli o pezzi superiori, montanti senza maggiorazione
  del giunto alto. Due ante: dati e pezzi indipendenti, telaio contato una volta.
- Scorte composte dall’utente, al massimo due suggerimenti. Avanzi fino a 50 mm
  assorbiti solo se tutti i rotoli della stessa famiglia aumentano allo stesso modo.
  Metodo sui bordi confermato dall’utente per più finiture Cover Styl.

## Limiti del prototipo

Ricaricare perde ancora rilievo e lavoro. `opening`, `leaves`, `closure`
e i tagli di `job.types[]` sono metadati, non una serializzazione completa.
Occorre salvare anche bozza del telaio, decisioni sulle superfici e sui tagli,
entrambe le ante, anta attiva e decisioni sulle bobine. Lo stato dell’anta
attiva è in `door`, gli snapshot delle altre ante sono in `leafRecords`:
non serializzare `leafRecords` da solo.

Il telaio è comune. La sezione mostra l’appoggio dell’anta selezionata sul telaio,
non il profilo costruttivo dell’incontro centrale. Un bordo centrale differente
richiede un rilievo dedicato: non dedurre denti, inserti o guarnizioni da foto
insufficienti e non introdurre quote standard come misure rilevate.

Restano separati persistenza e integrazione nell’app, altre aperture, note per
il posatore e maniglie dei raggi.

## Revisione di Claude e correzioni concordate (12 novembre 2026)

Prova in un browser vero (Chromium): 576 combinazioni di stipite, coprifilo,
anta, battuta di arresto, appoggio e chiusura, più la guida percorsa per intero.
Nessun errore di script. Problemi trovati nella versione consegnata, ancora
presenti dopo il commit «Semplifica il rilievo guidato» e ora corretti sopra di esso:

- L'anta squadrata partiva «sovrapposta»: 20 mm fuori dallo stipite e 10 mm oltre
  il coprifilo, senza niente che coprisse la fessura (32 combinazioni).
- Bordo dell'anta a contatto, a gioco zero, con stipite e testa del coprifilo in
  tutti i casi.
- Guarnizioni su battute che l'anta non tocca (34 combinazioni, ad esempio la
  seconda battuta con anta semplice); guida con guarnizione Sì sull'anta e su
  ogni battuta; scheda Guarnizioni che accettava qualsiasi lato, anche i coprifili.
- «Misuro l'anta» riscriveva quote dello stipite già rilevate e componeva
  battute da 5 mm; l'anta battentata su battuta singola partiva bloccata.

Regole concordate con l'utente e applicate:

1. Il rilievo comanda: una quota rilevata non viene mai riscritta per far
   combaciare; se non torna si mostra un avviso.
2. Fuga fra anta e telaio solo grafica (3 mm), fuori da quote e tagli.
3. Solo combinazioni reali: con la battuta sullo stipite l'anta è a filo con
   l'estremità dello stipite o rientrata; sovrapposta solo con la battuta sul
   coprifilo (sporgenza calcolata). Esempio iniziale dell'anta battentata con lo
   scalino uguale alla battuta.
4. All'inizio una sola guarnizione, la più comune, sulla battuta in appoggio;
   sull'anta No. Guarnizioni del telaio ammesse solo sulle battute che almeno
   un'anta preme; quelle rimaste su battute non più toccate vengono tolte.
5. Salvataggio: rimandato su richiesta dell'utente.

Corretto anche il verso delle scritte senza allineamento esplicito nella
vista specchiata (maniglia a sinistra): «ESTERNO» usciva dal riquadro.

Esito della stessa prova dopo le correzioni: nessuna guarnizione non premuta,
mai più di una guarnizione iniziale, nessuna anta fuori dal telaio. Restano
avvisi corretti solo per lo stipite senza battuta (l'anta non ha dove chiudere)
e per l'anta a due scalini su telaio a battuta singola.

HTML SHA256 dopo la revisione: `aed9fad80d466d27cdac9feead56baba7f21dfee0c7d7ae58dd0a750334f145f`.

## Seconda revisione con l'utente (13 novembre 2026)

Richieste dell'utente dopo la prova sul telefono, applicate:

- **Lunghezze per tipo di angolo** (errore di calcolo): i bordi esterni
  dei pezzi usavano sempre la regola dei 45°. Nei giunti di testa il pezzo
  che si ferma è ora tagliato al filo verso la luce del pezzo che passa
  (coprifilo interno 70 mm, L 800, H 2100: montanti passanti 2170/800,
  traverso passante 2100/940, 45° 2170/940).
- **Striscia fra coprifilo e guarnizione**: sotto 30 mm entra nel pezzo del
  coprifilo; altrimenti pezzo a sé con l'abbondanza della maestà (15 mm).
- **Orientamento dalla maniglia invertito**: la sezione è lo stipite dal lato
  della maniglia visto dal lato a tirare; con maniglia a destra l'anta è a destra.
- **Dettagli con la lente**: sezione intera, cerchietto sul punto, lente
  ingrandita con la quota (sezione, coprifili, luce minima vista di fronte).
- **Guida**: maniglia scelta anche toccando la porta; tolto «Da quale pezzo
  misuri?» (anta e stipite si misurano sempre entrambi, P1 e P2 con la doppia
  battuta); nuovo ultimo passo del modello «Coprifili uguali sui due lati?»
  con larghezze del lato diverso nelle misure.
- **Pulizie**: niente scelta degli angoli pezzo per pezzo in Tagli, niente
  copia CSV della distinta, niente «mm» sul numero di porte.

Verifica in Chromium: guida completa senza errori; la prova delle 576
combinazioni dà gli stessi risultati della prima revisione.

HTML SHA256 dopo la seconda revisione: `eb688d44f7bae7ef25b64163d4b9d02397acf5a1ede8582d9b10a5ed31ee0b77`.
