import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analizzaTestoPezzi } from '../parserPezzi';

/**
 * IL DOCUMENTO DELLE REGOLE DEVE DIRE LA VERITÀ.
 *
 * `docs/REGOLE-LISTA-PEZZI.md` è il testo che si incolla nel progetto
 * dell'assistente vocale perché la lista dettata in cantiere esca già nel
 * formato che l'app sa leggere. Un documento del genere invecchia in fretta e
 * in silenzio: basta un ritocco al lettore e le istruzioni diventano un
 * consiglio sbagliato, che si scopre in cantiere.
 *
 * Qui l'esempio del documento viene letto DAL FILE e fatto passare dal lettore
 * vero. Se non ne esce quello che il documento promette, questa prova si
 * rompe — e si aggiustano tutti e due insieme.
 */

const documento = readFileSync(new URL('../../../docs/REGOLE-LISTA-PEZZI.md', import.meta.url), 'utf8');

/** il primo blocco di codice del documento: è l'esempio completo */
function esempioDalDocumento(): string {
  const blocchi = [...documento.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  expect(blocchi.length, 'nel documento manca il blocco di esempio').toBeGreaterThan(0);
  return blocchi[0];
}

describe('le regole della lista pezzi', () => {
  const esito = analizzaTestoPezzi(esempioDalDocumento());

  it('nessuna riga dell’esempio finisce fra le ignorate', () => {
    expect(esito.ignorate).toEqual([]);
  });

  it('i titoli diventano due essenze, anche quello con il numero', () => {
    expect(esito.materiali).toEqual(['VAGONE DI TESTA', 'VAGONE 2']);
  });

  it('nove righe e sedici pezzi, come dice il documento', () => {
    expect(esito.pezzi).toHaveLength(9);
    expect(esito.pezzi.reduce((s, p) => s + p.quantita, 0)).toBe(16);
  });

  it('i centimetri diventano millimetri, e la quantità si legge', () => {
    expect(esito.pezzi[0]).toMatchObject({
      nome: 'FINESTRE SOPRA',
      larghezza: 3000,
      altezza: 350,
      quantita: 2,
      ruotabile: true,
      materiale: 'VAGONE DI TESTA'
    });
  });

  it('un nome con un numero dentro non perde il numero', () => {
    const anta = esito.pezzi.find((p) => p.nome.includes('ANTA 1'));
    expect(anta?.nome).toBe('CENTRO SX SOPRA ANTA 1');
    expect(anta).toMatchObject({ larghezza: 2000, altezza: 350, quantita: 1 });
  });

  it('«verso fisso» blocca il pezzo, e solo quello', () => {
    const fissa = esito.pezzi.find((p) => p.nome.startsWith('FASCIA'))!;
    expect(fissa.ruotabile).toBe(false);
    expect(esito.pezzi.filter((p) => !p.ruotabile)).toHaveLength(1);
  });

  it('le tre forme dell’esempio escono con le loro misure', () => {
    expect(esito.pezzi.find((p) => p.nome.startsWith('OBLÒ'))).toMatchObject({
      forma: 'cerchio',
      larghezza: 300,
      altezza: 300,
      quantita: 2
    });
    expect(esito.pezzi.find((p) => p.nome.startsWith('LUCERNARIO'))).toMatchObject({
      forma: 'trapezioR',
      larghezza: 1200,
      altezza: 900,
      misura3: 1400
    });
  });

  it('il pezzo che si CHIAMA triangolo resta un rettangolo', () => {
    const t = esito.pezzi.find((p) => p.nome.includes('TRIANGOLO'))!;
    expect(t.forma).toBeUndefined();
    expect(t).toMatchObject({ larghezza: 1550, altezza: 700, quantita: 2 });
    // e il nome se lo tiene: è così che lo si riconosce in cantiere
    expect(t.nome).toBe('TRAP DX TRIANGOLO SOTTO');
  });

  it('la punteggiatura sparisce dai nomi, come il documento avverte', () => {
    for (const p of esito.pezzi) expect(p.nome, p.nome).not.toMatch(/[–—.,;:()/]/);
  });

  it('il documento non promette formati che il lettore non accetta', () => {
    // i metri non si leggono: il documento dice di convertirli, e deve
    // continuare a dirlo
    expect(documento).toMatch(/Non usare i metri/);
    const conMetri = analizzaTestoPezzi('- FASCIA — 1 pz — 3 × 0,35 m');
    expect(conMetri.pezzi[0]?.larghezza).not.toBe(3000);
  });
});
