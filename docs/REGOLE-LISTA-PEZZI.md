# Regole per la lista pezzi da dettare in cantiere

Questo testo si incolla nelle istruzioni del progetto dell'assistente vocale
(ChatGPT, Claude, quello che si usa). Serve a una cosa sola: che la lista che
esce dalla chiacchierata in cantiere sia **esattamente** quella che
Sopralluoghi sa leggere con «Incolla da testo», senza doverla sistemare a mano
dopo.

Le regole qui sotto non sono preferenze: sono il formato che il programma
legge davvero. Se cambia il programma, cambia anche questo file — e c'è una
prova automatica (`src/utils/__tests__/regoleLista.test.ts`) che fa passare
l'esempio di questo documento dal lettore vero e controlla che ne esca quello
che c'è scritto qui. Se un domani non tornasse, la prova si rompe.

---

## Da copiare e incollare nel progetto

> **Come devi scrivere la lista dei pezzi**
>
> Quando ti chiedo la lista, rispondi **solo** con la lista, senza premesse e
> senza commenti finali. Una riga per pezzo, così:
>
> `- NOME DEL PEZZO — N pz — L × A cm`
>
> **Le misure**
> - Sempre due misure per pezzo: prima la larghezza, poi l'altezza, separate
>   da `×` (va bene anche `x`).
> - Sempre **cm**, scritto alla fine della riga. Non usare i metri. Se una
>   misura ha i decimali usa la virgola: `122,5 × 35 cm`.
> - Se te le detto in metri, convertile tu in centimetri.
>
> **La quantità**
> - Sempre `N pz`, anche quando è uno solo: `1 pz`.
>
> **Il nome**
> - Da due a quattro parole corte, tutte maiuscole, dal generale al
>   particolare: `ZONA – ELEMENTO – POSIZIONE`.
>   Esempi: `FINESTRE – SOPRA`, `GUIDA DX – SOPRA – ANTA`,
>   `CENTRO SX – SOPRA – ANTA 1`.
> - Usa sempre le stesse parole per le stesse cose, da un lavoro all'altro:
>   `SOPRA / SOTTO / VERT` per la posizione, `DX / SX` per il lato,
>   `ANTA / FISSO` per il tipo, `INT / EST` per interno ed esterno.
> - Se due pezzi sono uguali di nome ma diversi di misura, numerali:
>   `ANTA 1`, `ANTA 2`.
> - **Non cominciare mai un nome con una parola di forma** (triangolo,
>   trapezio, cerchio, tondo, rombo, rettangolo, quadrato): il programma la
>   leggerebbe come una dichiarazione di forma. Se un pezzo è fatto a
>   triangolo, scrivilo dopo: `TRAP. DX – TRIANGOLO SOTTO`.
>
> **I titoli**
> - Raggruppa i pezzi per zona o per materiale, con una riga di titolo in
>   maiuscolo, da sola, senza misure e senza trattini iniziali:
>   `VAGONE DI TESTA`, `PIANO 1`, `PELLICOLA SCURA`.
> - Lascia una riga vuota prima di ogni titolo.
> - Il titolo può contenere un numero (`VAGONE 1`) e arrivare a otto parole.
> - Ogni titolo deve avere almeno un pezzo sotto, altrimenti va perso.
>
> **I pezzi che non sono rettangoli** (solo se le misure ce le hai davvero)
> - Cerchio: `OBLÒ INGRESSO — 2 pz — Ø 30 cm`
> - Triangolo di cui conosci i tre lati: `VELA – FIANCO — 1 pz — 80/70/50 cm`
> - Trapezio isoscele (base maggiore / base minore × altezza):
>   `FRONTONE — 1 pz — 50/30×20 cm`
> - Finestra sotto falda (base e le due altezze):
>   `LUCERNARIO — 1 pz — base 120, h sx 90, h dx 140 cm`
> - In tutti gli altri casi scrivi due misure: l'ingombro rettangolare da cui
>   il pezzo si taglia. Due misure vogliono dire rettangolo, sempre.
>
> **Il verso**
> - Non scrivere niente: i pezzi possono essere girati.
> - Solo se un pezzo NON si può girare (pellicola con una direzione,
>   stampa, venatura) aggiungi `verso fisso` in fondo alla riga.
>
> **Quello che non devi fare**
> - Niente righe di totali, di riepilogo o di commento in mezzo alla lista.
> - Niente misure dentro il nome del pezzo.
> - Niente unità diverse da cm (o mm) sulla stessa riga.
> - Niente tabelle, niente grassetti, niente numerazione `1.` `2.` `3.`:
>   solo trattini a inizio riga, o niente.

---

## Esempio completo

```
VAGONE DI TESTA

- FINESTRE – SOPRA — 2 pz — 300 × 35 cm
- FINESTRE – SOTTO — 4 pz — 175 × 42 cm
- GUIDA DX – SOPRA – ANTA — 1 pz — 65 × 35 cm
- CENTRO SX – SOPRA – ANTA 1 — 1 pz — 200 × 35 cm
- OBLÒ PORTA — 2 pz — Ø 30 cm
- FASCIA STAMPATA — 1 pz — 240 × 40 cm verso fisso

VAGONE 2

- SNODO – ARCO EST — 2 pz — 215 × 70 cm
- TRAP. DX – TRIANGOLO SOTTO — 2 pz — 155 × 70 cm
- LUCERNARIO TETTUCCIO — 1 pz — base 120, h sx 90, h dx 140 cm
```

Questa lista diventa **due essenze** (VAGONE DI TESTA e VAGONE 2), nove righe
e sedici pezzi. L'oblò è un cerchio da 300 mm, il lucernario è un trapezio
rettangolo, la fascia stampata non si gira, e il pezzo che si chiama
«TRIANGOLO SOTTO» resta un rettangolo da 1550 × 700 mm — perché di misure ne
porta due, ed è il nome che dice com'è fatto, non la geometria da tagliare.

---

## Cosa fa il programma con quello che riceve

| Nel testo | Nel piano di taglio |
|---|---|
| riga di titolo | una **essenza** a sé, col suo supporto e le sue impostazioni |
| `N pz` | la quantità |
| `L × A cm` | l'ingombro in millimetri (i cm vengono moltiplicati per 10) |
| resto della riga | il nome del pezzo, senza punteggiatura |
| `verso fisso` | il pezzo non viene girato |
| `Ø`, `a/b/c`, `B/b×h`, `base, h sx, h dx` | la forma vera, che il nesting incastra |

Il nome arriva **senza punteggiatura**: trattini, punti e virgole diventano
spazi. `TRAP. DX – RETT. SOTTO` diventa `TRAP DX RETT SOTTO`. Va benissimo —
basta saperlo e scegliere nomi che si leggano bene anche così, perché è quello
che si stampa dentro il pezzo sul piano di taglio.

## Prima di compilare, guarda l'anteprima

«Incolla da testo» mostra sempre, prima di toccare qualcosa: quanti pezzi ha
riconosciuto, come li ha divisi per essenza, e **le righe che ha ignorato**.
Una riga fra le ignorate è una riga che non aveva misure leggibili: quasi
sempre è un commento di troppo, o un titolo scritto con una misura dentro.
