/**
 * LA FORMA DA MISURE E ANGOLI RETTI, senza piano di riferimento.
 *
 * In una stanza gli angoli retti sono la cosa che si sa SENZA misurarla: lo
 * spigolo fra due pareti è a squadro, lo stipite è a piombo, il gradino del
 * controsoffitto fa novanta. Finché l'app non lo sapeva, una polilinea per
 * diventare un pezzo da tagliare aveva bisogno del PIANO DI RIFERIMENTO — e
 * il piano, in una camera d'albergo col letto in mezzo, vuole quattro spigoli
 * visibili che spesso non ci sono. Dopo tre ore di rilievo, chiedere anche
 * quello è chiedere troppo.
 *
 * Qui si fa l'opposto: si dichiarano gli angoli a novanta — tutti insieme o
 * uno per uno, anche dopo aver preso le misure — e la figura esce da quelli
 * più le quote. Il disegno serve solo a due cose, e sono due cose che un dito
 * su una foto sa dire benissimo: DA CHE PARTE gira ogni spigolo, e un valore
 * di primo tentativo per quello che non è stato né quotato né dichiarato.
 *
 * IL CONTO È UN GIRO DEL PERIMETRO. Si parte da un lato, si cammina: a ogni
 * spigolo si sterza. Dove lo spigolo è dichiarato retto si sterza di
 * esattamente novanta gradi; dove non lo è, di quanto dice il disegno, ma
 * quella sterzata resta LIBERA. Alla fine del giro si deve tornare al punto
 * di partenza, e quella è l'equazione che chiude il conto: due numeri — lo
 * scarto in orizzontale e quello in verticale — che le quantità libere devono
 * annullare. Sono proprio gli «angoli strani» a venire fuori di lì, estratti
 * dalle misure invece che dal disegno.
 *
 * QUANDO LE MISURE NON CHIUDONO si cede sulle lunghezze quotate, ma pochissimo
 * — pesano mille volte più di tutto il resto — e di quanto si è ceduto si
 * tiene il conto e lo si dice. Un perimetro con tutti gli angoli a novanta che
 * non torna di sette centimetri non è un difetto del programma: è una quota
 * sbagliata, o uno spigolo che a squadro non è. Meglio saperlo in cantiere che
 * al banco di taglio.
 */

import type { PuntoSagoma } from './sagome';

/** l'angolo riportato fra −π e π */
const giroPiccolo = (a: number) => {
  let v = a;
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v < -Math.PI) v += 2 * Math.PI;
  return v;
};

export interface MisureConAngoli {
  /** la lunghezza del lato i, dal vertice i al vertice i+1; null se non quotata */
  lati: Array<number | null>;
  /** true dove il vertice è dichiarato a 90° */
  retti: boolean[];
  /** il poligono come è stato disegnato: dà i versi di giro e le prime stime */
  disegno: PuntoSagoma[];
}

export interface EsitoAngoli {
  /** i vertici della figura, appoggiata in (0,0), y verso il basso */
  vertici: PuntoSagoma[];
  /**
   * Di quanto una quota ha dovuto cedere perché il perimetro chiudesse, nella
   * stessa unità delle quote. Zero = le misure e gli angoli vanno d'accordo.
   */
  scarto: number;
  /** quanti spigoli sono stati tenuti a novanta per davvero */
  retti: number;
}

/**
 * Sotto questa sterzata il disegno non sa dire da che parte si gira, e una
 * dichiarazione di angolo retto lì non si può usare: la si lascia perdere
 * invece di indovinare il verso.
 */
const STERZATA_MINIMA = (12 * Math.PI) / 180;

/** quanto una quota è più pesante di una stima: cede mille volte meno */
const PESO_QUOTA = 1000;

/** il giro del perimetro, chiuso sulle misure e sugli angoli dichiarati */
export function poligonoDaAngoliRetti(m: MisureConAngoli): EsitoAngoli | null {
  const n = m.disegno.length;
  if (n < 3 || m.lati.length !== n || m.retti.length !== n) return null;

  // il disegno: direzione e lunghezza di ogni lato, com'è stato tracciato
  const dir: number[] = [];
  const lung: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = m.disegno[i];
    const b = m.disegno[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy);
    if (!(d > 0)) return null; // due vertici nello stesso punto: non è un giro
    dir.push(Math.atan2(dy, dx));
    lung.push(d);
  }

  // LA SCALA fra il disegno e il mondo: la dànno le quote. Senza nemmeno una
  // quota non c'è misura, e una forma senza misura non è un pezzo da tagliare
  const rapporti: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = m.lati[i];
    if (q !== null && q > 0) rapporti.push(q / lung[i]);
  }
  if (rapporti.length === 0) return null;
  const scala = rapporti.reduce((s, r) => s + r, 0) / rapporti.length;

  /** la sterzata disegnata allo spigolo i, fra il lato i−1 e il lato i */
  const sterzata = (i: number) => giroPiccolo(dir[i] - dir[(i + n - 1) % n]);

  /**
   * Gli spigoli tenuti a novanta. Il VERSO lo dice il disegno — a destra o a
   * sinistra — ed è l'unica cosa che gli si chiede: su una sterzata quasi
   * dritta non lo saprebbe dire, e lì la dichiarazione si lascia cadere.
   */
  const aSquadro: boolean[] = [];
  for (let i = 0; i < n; i++) {
    aSquadro.push(m.retti[i] === true && Math.abs(sterzata(i)) >= STERZATA_MINIMA);
  }

  /**
   * LE DIREZIONI, una catena alla volta.
   *
   * Il lato 0 parte come l'ha disegnato chi misurava: il verso complessivo
   * della figura si sistema dopo, qui conta solo che i lati stiano fra loro
   * come devono. Da lì in avanti ogni direzione o è INCHIODATA alla
   * precedente da uno spigolo a novanta, o è una variabile libera.
   */
  const direzione = [dir[0]];
  /** per ogni lato: l'indice della variabile libera che lo comanda, o −1 */
  const comandaDir: number[] = [-1];
  const libereDir: number[] = [];
  for (let i = 1; i < n; i++) {
    if (aSquadro[i]) {
      direzione.push(direzione[i - 1] + Math.sign(sterzata(i)) * (Math.PI / 2));
      comandaDir.push(comandaDir[i - 1]);
    } else {
      direzione.push(direzione[i - 1] + sterzata(i));
      comandaDir.push(libereDir.length);
      libereDir.push(i);
    }
  }

  /** le lunghezze di partenza: la quota se c'è, se no il disegno in scala */
  const L = m.lati.map((q, i) => (q !== null && q > 0 ? q : lung[i] * scala));
  const quotato = m.lati.map((q) => q !== null && q > 0);

  /**
   * LE INCOGNITE, con quanto ciascuna si lascia muovere.
   *
   * Prima le sterzate libere, poi le lunghezze. Una lunghezza QUOTATA è un
   * numero preso sul posto e si muove mille volte meno delle altre: entra fra
   * le incognite solo perché, se le misure non chiudono, qualcosa deve pur
   * cedere — e allora cede lei, di pochissimo, e lo si dice.
   */
  const peso: number[] = [];
  for (let k = 0; k < libereDir.length; k++) peso.push(1);
  for (let i = 0; i < n; i++) peso.push(quotato[i] ? PESO_QUOTA : 1);
  const nVar = peso.length;
  if (nVar === 0) return null;

  /**
   * LO SCARTO DA ANNULLARE: il giro non torna al punto di partenza.
   *
   * Due numeri quando lo spigolo 0 è libero; tre quando anche lui è dichiarato
   * a novanta, perché allora deve tornare pure l'ultima sterzata — quella fra
   * l'ultimo lato e il primo, che la catena non ha potuto inchiodare.
   */
  const chiudeAncheIlPrimo = aSquadro[0];
  const resto = (): number[] => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += L[i] * Math.cos(direzione[i]);
      y += L[i] * Math.sin(direzione[i]);
    }
    if (!chiudeAncheIlPrimo) return [x, y];
    const voluta = Math.sign(sterzata(0)) * (Math.PI / 2);
    return [x, y, giroPiccolo(direzione[0] - direzione[n - 1] - voluta) * dimensione()];
  };
  /** quanto è grande la figura: serve a mettere angoli e lunghezze sulla stessa bilancia */
  const dimensione = () => L.reduce((s, v) => s + v, 0) / (2 * Math.PI);

  /** la derivata dello scarto rispetto a ogni incognita */
  const jacobiana = (): number[][] => {
    const righe = chiudeAncheIlPrimo ? 3 : 2;
    const J: number[][] = Array.from({ length: righe }, () => new Array(nVar).fill(0));
    // una sterzata libera gira TUTTI i lati che vengono dopo
    for (let k = 0; k < libereDir.length; k++) {
      let dx = 0;
      let dy = 0;
      for (let i = libereDir[k]; i < n; i++) {
        dx += -L[i] * Math.sin(direzione[i]);
        dy += L[i] * Math.cos(direzione[i]);
      }
      J[0][k] = dx;
      J[1][k] = dy;
      if (chiudeAncheIlPrimo) J[2][k] = -dimensione();
    }
    // una lunghezza allunga il suo lato e basta
    for (let i = 0; i < n; i++) {
      J[0][libereDir.length + i] = Math.cos(direzione[i]);
      J[1][libereDir.length + i] = Math.sin(direzione[i]);
    }
    return J;
  };

  const partenza = [...L];

  /**
   * SI CHIUDE IL GIRO a passi piccoli.
   *
   * Lo scarto non dipende dalle incognite in modo lineare — una sterzata gira
   * dei seni e dei coseni — quindi si linearizza, si fa un passo, si rifà il
   * conto. Il passo è quello che annulla lo scarto MUOVENDO IL MENO POSSIBILE,
   * ciascuna incognita in proporzione a quanto si lascia muovere: è il sistema
   * normale pesato, e siccome le equazioni sono due o tre la matrice da
   * invertire è minuscola.
   */
  for (let giro = 0; giro < 40; giro++) {
    const r = resto();
    if (Math.hypot(...r) < 1e-9) break;
    // Si tengono solo le equazioni su cui si può AGIRE. Con tutti gli spigoli
    // dichiarati non resta nessuna sterzata libera, e la riga dell'angolo si
    // annulla: è un'equazione che nessuna incognita può muovere. Tenerla
    // renderebbe il sistema singolare e il conto si fermerebbe lì, lasciando
    // il pezzo senza forma proprio nel caso più comune — la parete col
    // gradino, tutta a novanta.
    const J = jacobiana().filter((riga) => riga.some((v) => Math.abs(v) > 1e-9));
    const righe = J.length;
    if (righe === 0) break;
    // A = J · W⁻¹ · Jᵀ, con W la matrice (diagonale) dei pesi
    // il resto delle sole equazioni tenute, nello stesso ordine
    const rTenuti = jacobiana()
      .map((riga, i) => ({ riga, i }))
      .filter(({ riga }) => riga.some((v) => Math.abs(v) > 1e-9))
      .map(({ i }) => r[i]);
    const A: number[][] = Array.from({ length: righe }, () => new Array(righe + 1).fill(0));
    for (let a = 0; a < righe; a++) {
      for (let b = 0; b < righe; b++) {
        let s = 0;
        for (let k = 0; k < nVar; k++) s += (J[a][k] * J[b][k]) / peso[k];
        A[a][b] = s;
      }
      A[a][righe] = -rTenuti[a];
    }
    // Gauss con pivot: A · λ = −r
    let singolare = false;
    for (let c = 0; c < righe && !singolare; c++) {
      let p = c;
      for (let rr = c + 1; rr < righe; rr++) if (Math.abs(A[rr][c]) > Math.abs(A[p][c])) p = rr;
      if (Math.abs(A[p][c]) < 1e-12) {
        singolare = true;
        break;
      }
      [A[c], A[p]] = [A[p], A[c]];
      for (let rr = 0; rr < righe; rr++) {
        if (rr === c) continue;
        const f = A[rr][c] / A[c][c];
        for (let cc = c; cc <= righe; cc++) A[rr][cc] -= f * A[c][cc];
      }
    }
    if (singolare) break;
    const lambda = A.map((riga, i) => riga[righe] / riga[i]);

    // il passo: Δx = W⁻¹ · Jᵀ · λ
    for (let k = 0; k < nVar; k++) {
      let s = 0;
      for (let a = 0; a < righe; a++) s += J[a][k] * lambda[a];
      const passo = s / peso[k];
      if (k < libereDir.length) {
        // una sterzata libera gira il suo lato e tutti quelli dopo
        for (let i = libereDir[k]; i < n; i++) direzione[i] += passo;
      } else {
        const i = k - libereDir.length;
        L[i] = Math.max(1e-6, L[i] + passo);
      }
    }
  }

  /**
   * SI GIUDICA SULLA CHIUSURA DI POSIZIONE, non sull'angolo.
   *
   * Se il giro torna al punto di partenza la figura esiste, ed è quella. Può
   * restare fuori posto l'ULTIMO spigolo — quello fra l'ultimo lato e il
   * primo — quando tutte le sterzate sono inchiodate e le misure dicono
   * un'altra cosa: vuol dire che lì a squadro non è, e lo si dice contandolo
   * fuori dagli spigoli tenuti a novanta, non buttando via il pezzo.
   */
  const finale = resto();
  if (Math.hypot(finale[0], finale[1]) > Math.max(1e-6, dimensione() * 1e-6)) return null;

  // il giro, adesso che torna
  const punti: PuntoSagoma[] = [[0, 0]];
  for (let i = 0; i < n - 1; i++) {
    const p = punti[i];
    punti.push([p[0] + L[i] * Math.cos(direzione[i]), p[1] + L[i] * Math.sin(direzione[i])]);
  }
  if (punti.length !== n) return null;
  if (punti.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;

  let scarto = 0;
  for (let i = 0; i < n; i++) if (quotato[i]) scarto = Math.max(scarto, Math.abs(L[i] - partenza[i]));

  return {
    vertici: squadra(punti, direzione, aSquadro),
    scarto,
    retti: aSquadro.filter(Boolean).length
  };
}

/**
 * SI METTE IN SQUADRO QUELLO CHE È IN SQUADRO.
 *
 * La figura esce orientata come il primo lato è stato disegnato, cioè storta
 * di quanto era storta la foto. Ma se gli spigoli a novanta ci sono, la parte
 * rettilinea della figura HA un suo dritto, e quel dritto va messo in piano:
 * i teli si tagliano lungo le verticali del riquadro, e su una parete messa di
 * sghembo quelle verticali non sono le verticali del muro.
 *
 * Si prende la direzione dei lati che toccano uno spigolo a novanta, la si
 * guarda modulo un quarto di giro — a quel punto sono tutte quasi la stessa —
 * e si gira la figura della media, pesata sulla lunghezza dei lati: i lati
 * lunghi sono quelli disegnati meglio. Poi la si rimette in piedi scegliendo,
 * fra i quattro quarti di giro, quello che somiglia di più al disegno.
 */
function squadra(punti: PuntoSagoma[], direzione: number[], aSquadro: boolean[]): PuntoSagoma[] {
  const n = punti.length;
  const lato = (i: number) => {
    const a = punti[i];
    const b = punti[(i + 1) % n];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  // i lati che toccano uno spigolo dichiarato: sono loro a dire dov'è il dritto
  let sen = 0;
  let cos = 0;
  for (let i = 0; i < n; i++) {
    if (!aSquadro[i] && !aSquadro[(i + 1) % n]) continue;
    const peso = lato(i);
    // modulo un quarto di giro: un lato e il suo perpendicolare dicono la
    // stessa cosa sul dritto della figura
    const a = 4 * direzione[i];
    sen += peso * Math.sin(a);
    cos += peso * Math.cos(a);
  }
  if (sen === 0 && cos === 0) return appoggia(punti);
  const storto = Math.atan2(sen, cos) / 4;
  const c = Math.cos(-storto);
  const s = Math.sin(-storto);
  return appoggia(punti.map((p): PuntoSagoma => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]));
}

/** la figura appoggiata in (0,0), coi millesimi di millimetro buttati */
function appoggia(punti: PuntoSagoma[]): PuntoSagoma[] {
  const minX = Math.min(...punti.map((p) => p[0]));
  const minY = Math.min(...punti.map((p) => p[1]));
  return punti.map((p): PuntoSagoma => [
    Math.round((p[0] - minX) * 1e6) / 1e6,
    Math.round((p[1] - minY) * 1e6) / 1e6
  ]);
}
