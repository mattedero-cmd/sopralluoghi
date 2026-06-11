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
 * Interpreta l'input manuale di una misura (virgola o punto decimale).
 * Restituisce null se il testo non è un numero valido.
 */
export function analizzaMisura(testo: string): number | null {
  const pulito = testo.trim().replace(',', '.');
  if (pulito === '') return null;
  const n = Number(pulito);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
