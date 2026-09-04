import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * LE ICONE, UNA PER COSA.
 *
 * Il menu strumenti era arrivato a 70 voci con 26 icone: «angolo» ne copriva
 * sette da sola — Angolo, Smusso, Angolo su vertice, il gruppo Vincoli,
 * Perpendicolare, Snap 45° e Snap 30° — e in dodici casi l'icona del gruppo
 * era identica a quella di una sua voce. Un'icona che vale per sette cose non
 * è un'icona: è decorazione, e chi guarda la barra non ci trova niente.
 *
 * Questa prova legge il sorgente invece dei tipi, perché il difetto non stava
 * nei tipi: due nomi diversi possono benissimo puntare allo stesso disegno, e
 * il compilatore è contento.
 */

const sorgente = readFileSync(new URL('../Icona.tsx', import.meta.url), 'utf8');

/** i nomi dichiarati nell'unione NomeIcona */
function nomiDichiarati(): string[] {
  return [...sorgente.matchAll(/^ {2}\| '([a-z0-9-]+)'/gm)].map((m) => m[1]);
}

/** il disegno di ogni icona, normalizzato per poterli confrontare */
function disegni(): Map<string, string> {
  const blocco = sorgente.slice(
    sorgente.indexOf('const FORME'),
    sorgente.indexOf('export function Icona')
  );
  const inizi = [...blocco.matchAll(/^ {2}'?([a-z0-9-]+)'?: /gm)];
  const fuori = new Map<string, string>();
  inizi.forEach((m, i) => {
    const fine = i + 1 < inizi.length ? inizi[i + 1].index! : blocco.lastIndexOf('};');
    const corpo = blocco
      .slice(m.index! + m[0].length, fine)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/,$/, '');
    fuori.set(m[1], corpo);
  });
  return fuori;
}

describe('le icone dell’app', () => {
  it('ogni nome dichiarato ha il suo disegno, e viceversa', () => {
    const nomi = nomiDichiarati();
    const forme = disegni();
    expect(nomi.length).toBeGreaterThan(100);
    const senzaDisegno = nomi.filter((n) => !forme.has(n));
    const senzaNome = [...forme.keys()].filter((n) => !nomi.includes(n));
    expect(senzaDisegno, 'nomi senza disegno').toEqual([]);
    expect(senzaNome, 'disegni senza nome').toEqual([]);
  });

  it('non ci sono due icone disegnate uguali', () => {
    const visti = new Map<string, string>();
    const doppie: string[] = [];
    for (const [nome, corpo] of disegni()) {
      const prima = visti.get(corpo);
      if (prima) doppie.push(`${prima} = ${nome}`);
      else visti.set(corpo, nome);
    }
    expect(doppie, 'icone con lo stesso identico disegno').toEqual([]);
  });

  it('nessun nome è dichiarato due volte', () => {
    const nomi = nomiDichiarati();
    const doppi = nomi.filter((n, i) => nomi.indexOf(n) !== i);
    expect(doppi).toEqual([]);
  });
});
