/**
 * QUANTA STRADA PUÒ FARE UN PEZZO PRIMA DI TOCCARE.
 *
 * Nel piano di taglio i pezzi si spostano in due momenti: quando si
 * riaccostano dopo il piazzamento sulla griglia (geometry/nestingSagome), e
 * quando cadono in fondo al blocco staccato dal rotolo (geometry/segmenti).
 * Sono due movimenti opposti — uno verso l'origine, uno verso il fondo — ma la
 * domanda è la stessa, e per un po' è stata scritta due volte in due modi
 * diversi. Una delle due era sbagliata, e sbagliata in silenzio: i pezzi
 * uscivano sovrapposti dal segmento, non dal nesting.
 *
 * Qui la domanda è scritta UNA VOLTA. Le due regole che la governano:
 *
 * 1. FRA DUE PEZZI LA LAMA DEVE PASSARE SU ALMENO UN ASSE. Non «non si
 *    sovrappongono in x»: due pezzi appoggiati l'uno di fianco all'altro, con
 *    gli ingombri che si sfiorano ma senza accavallarsi, per un controllo di
 *    sovrapposizione risultano indipendenti — e uno può scivolare lungo
 *    l'altro fino a incollarglisi. La lama lì non passa.
 *
 * 2. SOTTO UNA FALDA L'INGOMBRO NON BASTA. Fra due rettangoli il rettangolo
 *    d'ingombro dice la verità. Con una sagoma no: due trapezi incastrati
 *    testa-coda hanno gli ingombri completamente accavallati e sono a posto,
 *    e un pezzo infilato sotto la falda ha ancora strada anche quando
 *    l'ingombro dice di no. Lì si guarda la sagoma vera.
 *
 * Il conto esatto si appoggia a un fatto: la distanza fra due convessi, quando
 * uno trasla lungo una retta, è una funzione CONVESSA dello spostamento. Si
 * cerca il minimo per sezione e, se scende sotto la lama, si bisseca il primo
 * contatto. Senza la convessità un passo a tentoni potrebbe scavalcare il
 * punto di contatto e appoggiare due pezzi uno dentro l'altro.
 */

import {
  copiaSagoma,
  distanzaSagome,
  sagomaDi,
  traslaIn,
  type Sagoma
} from './distanzaPoligoni';
import type { Piazzamento } from './nesting';

const E = 1e-6;

/**
 * Un rettangolo puro: il suo ingombro È la sua sagoma, e non c'è niente da
 * calcolare. Attenzione a non chiederlo ai vertici: il piazzamento porta
 * `punti` anche per i rettangoli — sono i quattro spigoli — e chi guarda lì
 * finisce per fare il conto esatto su tutto il piano, lento e senza motivo.
 */
export const eRettangolo = (p: Piazzamento) => p.forma === undefined || p.forma === 'rett';

const lungoDi = (verso: 'x' | 'y') => (verso === 'y' ? 'altezza' : 'larghezza');

/** i due pezzi hanno il passaggio della lama su quest'asse? */
function separati(a: Piazzamento, b: Piazzamento, asse: 'x' | 'y', lama: number): boolean {
  const l = lungoDi(asse);
  return a[asse] + a[l] + lama <= b[asse] + E || b[asse] + b[l] + lama <= a[asse] + E;
}

/**
 * Di quanto può scorrere `P` prima di arrivare a distanza di lama da `Q`,
 * cercando fra `da` e `massimo`. Sagome vere, conto esatto.
 *
 * `da` non è un'ottimizzazione qualunque: è la corsa che concede l'INGOMBRO, e
 * fin lì la sagoma è al sicuro per costruzione — se i due rettangoli
 * d'ingombro distano una lama, le sagome dentro distano almeno altrettanto.
 * Partire da lì risparmia la parte di ricerca che si sa già come finisce.
 */
function contattoEsatto(
  P: Sagoma,
  Q: Sagoma,
  verso: 'x' | 'y',
  segno: 1 | -1,
  lama: number,
  da: number,
  massimo: number
): number {
  if (massimo <= da) return massimo;
  const mosso = copiaSagoma(P);
  const dist = (d: number) => distanzaSagome(traslaIn(mosso, P, verso, -segno * d), Q);

  let a = da;
  let b = massimo;
  for (let k = 0; k < 22; k++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (dist(m1) < dist(m2)) b = m2;
    else a = m1;
  }
  const peggio = (a + b) / 2;
  if (dist(peggio) >= lama - E) return massimo;

  let sicuro = da;
  let rotto = peggio;
  for (let k = 0; k < 28; k++) {
    const m = (sicuro + rotto) / 2;
    if (dist(m) >= lama - E) sicuro = m;
    else rotto = m;
  }
  return sicuro;
}

/**
 * Quanta strada può fare `p` lungo `verso` nel senso `segno` (−1 verso
 * l'origine, +1 verso il fondo) senza scendere sotto la lama da nessuno degli
 * `ostacoli`, e senza superare `massimo`.
 *
 * Gli ostacoli vanno passati TUTTI, anche quelli che stanno dalla parte da cui
 * ci si allontana: andare verso l'origine non vuol dire allontanarsi da chi
 * sta dietro. Se il vicino è un trapezio che si stringe, salendo gli si scorre
 * lungo la falda e gli si va incontro. Con i rettangoli non succede — e
 * infatti per loro il conto si chiude subito — con una falda sì, e il prezzo
 * sono due pezzi tagliati uno dentro l'altro.
 *
 * `pronte` è facoltativo: se chi chiama tiene già le sagome in mano (e le
 * rifà quando un pezzo si muove) si risparmia di ricostruirle a ogni
 * confronto, che è il grosso del conto. `pronte.altrui` è allineato a
 * `ostacoli`, e una casella nulla vuol dire «rettangolo, non serve».
 */
export function corsaLibera(
  p: Piazzamento,
  ostacoli: Piazzamento[],
  verso: 'x' | 'y',
  segno: 1 | -1,
  lama: number,
  massimo: number,
  pronte?: { propria: Sagoma | null; altrui: Array<Sagoma | null> }
): number {
  if (!(massimo > 0)) return 0;
  const lungo = lungoDi(verso);
  const altro = verso === 'y' ? 'x' : 'y';
  const pRett = eRettangolo(p);
  let corsa = massimo;
  let P: Sagoma | null = null;

  for (let k = 0; k < ostacoli.length && corsa > 0; k++) {
    const q = ostacoli[k];
    if (q === p) continue;
    // la lama passa già di fianco: scorrere su quest'asse non li avvicina mai
    if (separati(p, q, altro, lama)) continue;

    // LA FINESTRA DEGLI INGOMBRI, e si calcola a mente. Scorrendo di `d` i due
    // rettangoli d'ingombro si avvicinano a meno di una lama solo per `d`
    // dentro un intervallo; fuori di lì gli ingombri sono larghi, e la sagoma
    // che ci sta dentro lo è almeno altrettanto.
    const a = q[verso] - p[verso] - p[lungo] - lama;
    const b = q[verso] + q[lungo] + lama - p[verso];
    const apre = segno > 0 ? a : -b;
    const chiude = segno > 0 ? b : -a;
    if (apre >= corsa || chiude <= 0) continue;

    if (pRett && eRettangolo(q)) {
      // fra rettangoli non si entra nella finestra e basta
      corsa = Math.max(0, Math.min(corsa, apre));
      continue;
    }
    if (!P) P = pronte?.propria ?? sagomaDi(p);
    const fin = Math.min(corsa, chiude);
    const trovato = contattoEsatto(
      P,
      pronte?.altrui[k] ?? sagomaDi(q),
      verso,
      segno,
      lama,
      Math.max(0, apre),
      fin
    );
    // fermarsi in fondo alla finestra non è fermarsi davvero: se la sagoma
    // arriva in fondo senza toccare, oltre la finestra è di nuovo libera
    if (trovato < fin) corsa = Math.min(corsa, trovato);
  }
  return Math.max(0, corsa);
}

/**
 * La posizione arrotondata al decimo di millimetro DALLA PARTE LARGA: il piano
 * non porta in giro numeri come 3,000055, e un decimo in più di vuoto è sempre
 * concesso, un decimo in meno no. Il pizzico di tolleranza (un millesimo di
 * millimetro, cioè niente) copre sia la virgola mobile sia la precisione della
 * bisezione, che senza di essa trasformerebbe un 3013 tondo in 3013,0001 e poi
 * in 3013,1.
 */
export function fermata(partenza: number, corsa: number, segno: 1 | -1): number {
  const d = Math.max(0, corsa);
  return segno > 0
    ? Math.min(partenza + d, Math.floor((partenza + d) * 10 + 1e-3) / 10)
    : Math.max(partenza - d, Math.ceil((partenza - d) * 10 - 1e-3) / 10);
}
