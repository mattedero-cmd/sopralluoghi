import type { Unita } from '../db/types';

export const FATTORE_MM: Record<Unita, number> = { mm: 1, cm: 10, m: 1000 };

export function inMillimetri(valore: number, unita: Unita): number {
  return valore * FATTORE_MM[unita];
}

export function daMillimetri(mm: number, unita: Unita): number {
  return mm / FATTORE_MM[unita];
}

/** Formato numerico italiano, senza zeri inutili (max 2 decimali) */
export function formattaNumero(v: number): string {
  return v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

export function formattaMisura(valore: number | null, unita: Unita): string {
  if (valore === null) return '—';
  return `${formattaNumero(valore)} ${unita}`;
}

export function formattaData(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formattaDataOra(timestamp: number): string {
  return new Date(timestamp).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Converte un timestamp nel formato accettato da <input type="datetime-local"> */
export function aInputDataOra(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function daInputDataOra(valore: string): number | null {
  const t = new Date(valore).getTime();
  return Number.isFinite(t) ? t : null;
}

export function formattaByte(byte: number): string {
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} kB`;
  if (byte < 1024 * 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
  return `${(byte / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * LA CALCOLATRICE NEL CAMPO DELLA MISURA.
 *
 * Al banco una misura viene quasi sempre a pezzi: 100 di qua, 124 di là, 113
 * di là ancora. Scriverla voleva dire uscire dall'app, cercare la
 * calcolatrice, fare la somma e tornare col totale. Adesso il totale lo fa il
 * campo: si scrive «100+124+113» e vale 337.
 *
 * Si accettano + − × ÷ e le parentesi, con la virgola o il punto per i
 * decimali. Niente `eval`: un conto battuto a mano in un campo di testo non
 * deve poter eseguire codice, e un parser di quaranta righe si legge e si
 * prova. La «x» NON moltiplica: «120x80», in cantiere, è un rettangolo, non
 * 9600.
 */

/** i segni che le tastiere scrivono, riportati a quelli che il conto capisce */
const SEGNI: Array<[RegExp, string]> = [
  [/[\s\u00a0]/g, ''],
  [/,/g, '.'],
  [/[\u2212\u2013\u2014]/g, '-'],
  [/[\u00d7]/g, '*'],
  [/[\u00f7:]/g, '/']
];

const perIlConto = (testo: string) =>
  SEGNI.reduce((t, [re, con]) => t.replace(re, con), testo);

/**
 * Il testo è un CONTO e non un numero?
 *
 * Il meno iniziale non conta: quello è un segno, non una sottrazione. Serve a
 * sapere quando mostrare il risultato e quando riscrivere il campo col
 * totale — un «12,5» battuto a mano non si tocca.
 */
export function eCalcolo(testo: string): boolean {
  const t = perIlConto(testo);
  return /[+*/()]/.test(t) || /[\d.)]-/.test(t);
}

/**
 * Il conto, senza `eval`: parser a discesa ricorsiva su + - * / e parentesi.
 * `null` appena qualcosa non torna — testo avanzato, parentesi non chiusa,
 * divisione per zero — così un conto a metà («100+») non salva un valore
 * sbagliato mentre lo si sta ancora scrivendo.
 */
function calcola(s: string): number | null {
  let i = 0;

  const numero = (): number | null => {
    const da = i;
    while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) i++;
    if (i === da) return null;
    const v = Number(s.slice(da, i));
    return Number.isFinite(v) ? v : null;
  };

  const fattore = (): number | null => {
    if (s[i] === '(') {
      i++;
      const v = somma();
      if (v === null || s[i] !== ')') return null;
      i++;
      return v;
    }
    // niente segno davanti a un fattore: «100++50» o «100+-50» sono il doppio
    // tocco di un dito, non un conto, e una misura negativa non esiste
    return numero();
  };

  const prodotto = (): number | null => {
    let v = fattore();
    for (;;) {
      const op = s[i];
      if (op !== '*' && op !== '/') return v;
      i++;
      const d = fattore();
      if (v === null || d === null) return null;
      if (op === '/' && d === 0) return null;
      v = op === '*' ? v * d : v / d;
    }
  };

  const somma = (): number | null => {
    let v = prodotto();
    for (;;) {
      const op = s[i];
      if (op !== '+' && op !== '-') return v;
      i++;
      const d = prodotto();
      if (v === null || d === null) return null;
      v = op === '+' ? v + d : v - d;
    }
  };

  const v = somma();
  // se è avanzato qualcosa il conto non è scritto bene: meglio niente che un
  // numero preso da mezza riga
  return i === s.length ? v : null;
}

/**
 * Interpreta l'input manuale di una misura: un numero (virgola o punto
 * decimale) oppure un conto da fare.
 * Restituisce null se il testo non è una misura valida.
 */
export function analizzaMisura(testo: string): number | null {
  const pulito = perIlConto(testo);
  if (pulito === '') return null;
  // la strada di sempre per chi scrive un numero e basta: niente cambia
  const n = Number(pulito);
  if (Number.isFinite(n)) return n >= 0 ? n : null;
  const v = calcola(pulito);
  if (v === null || !Number.isFinite(v) || v < 0) return null;
  // il conto si arrotonda al decimillesimo: 0,1+0,2 fa 0,3 e non
  // 0,30000000000000004 — un decimo di millesimo di millimetro non esiste
  return Math.round(v * 1e4) / 1e4;
}

/** Il campo riscritto col conto già fatto: «100+124+113» diventa «337» */
export function normalizzaMisura(testo: string): string {
  if (!eCalcolo(testo)) return testo;
  const v = analizzaMisura(testo);
  return v === null ? testo : String(v).replace('.', ',');
}
