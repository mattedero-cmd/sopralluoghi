import { describe, expect, it } from 'vitest';
import { analizzaTestoPezzi } from '../../utils/parserPezzi';
import { calcolaNestingMigliore, type PezzoNesting } from '../nesting';

/**
 * IL LAVORO DEL TRENO, come è arrivato: tre vagoni, settantacinque righe,
 * centotrenta pezzi, su pellicola in lastre da 122 cm per 5 metri.
 *
 * È un banco di prova vero, e serve a due cose. La prima: la lista si legge
 * tutta, con i tre vagoni come essenze separate e senza inventare forme che
 * non ci sono — le due righe che si chiamano «TRIANGOLO SOTTO» portano due
 * misure, cioè un rettangolo. La seconda: il piano di taglio che ne esce non
 * deve peggiorare. Diciassette lastre è quello che si ottiene oggi; se un
 * domani ne servissero diciotto, questa prova lo dice prima del cantiere.
 */
const LISTA = `
  VAGONE DI TESTA

  * FINESTRE – SOPRA — 2 pz — 300 × 35 cm
  * FINESTRE – SOTTO — 4 pz — 175 × 42 cm
  * FINESTRE – VERTICALI — 6 pz — 122 × 35 cm
  * FIN. PICCOLA – SOPRA — 2 pz — 175 × 10 cm
  * FIN. PICCOLA – VERT. DX — 2 pz — 175 × 45 cm
  * FIN. PICCOLA – VERT. SX — 2 pz — 122 × 10 cm
  * FIN. PICCOLA – SOTTO — 2 pz — 122 × 25 cm
  * SNODO – ARCO EST. — 1 pz — 215 × 70 cm
  * SNODO – BASSO EST. — 2 pz — 170 × 60 cm
  * SNODO – ARCO INT. — 1 pz — 210 × 45 cm
  * SNODO – BASSO INT. — 2 pz — 165 × 45 cm
  * GUIDA – FASCIA SX — 1 pz — 100 × 225 cm
  * GUIDA – PORTA — 1 pz — 65 × 225 cm
  * GUIDA – FASCIA DX — 1 pz — 22 × 192 cm
  * GUIDA SX – SOPRA – ANTA — 1 pz — 113 × 35 cm
  * GUIDA SX – SOPRA – FISSO — 1 pz — 35 × 35 cm
  * GUIDA DX – SOPRA – FISSO SX — 1 pz — 20 × 35 cm
  * GUIDA DX – SOPRA – ANTA — 1 pz — 65 × 35 cm
  * GUIDA DX – SOPRA – FISSO DX — 1 pz — 38 × 35 cm
  * CENTRO DX – SOPRA – FISSO SX — 1 pz — 35 × 35 cm
  * CENTRO DX – SOPRA – ANTA 1 — 1 pz — 160 × 35 cm
  * CENTRO DX – SOPRA – FISSO DX — 1 pz — 22 × 35 cm
  * CENTRO DX – SOPRA – ANTA 2 — 1 pz — 130 × 35 cm
  * CENTRO DX – SOPRA – FISSO FINE — 1 pz — 40 × 35 cm
  * CENTRO SX – SOPRA – FISSO SX — 1 pz — 35 × 35 cm
  * CENTRO SX – SOPRA – ANTA 1 — 1 pz — 200 × 35 cm
  * CENTRO SX – SOPRA – ANTA 2 — 1 pz — 145 × 35 cm
  * CENTRO SX – SOPRA – FISSO FINE — 1 pz — 40 × 35 cm

  VAGONE CENTRALE

  * SNODO – ARCO EST. — 2 pz — 215 × 70 cm
  * SNODO – BASSO EST. — 4 pz — 170 × 60 cm
  * SNODO – ARCO INT. — 2 pz — 210 × 45 cm
  * SNODO – BASSO INT. — 4 pz — 165 × 45 cm
  * TRAP. DX – SOPRA — 2 pz — 225 × 35 cm
  * TRAP. DX – VERT. SX — 2 pz — 20 × 170 cm
  * TRAP. DX – VERT. DX — 2 pz — 25 × 105 cm
  * TRAP. DX – TRIANGOLO SOTTO — 2 pz — 155 × 70 cm
  * TRAP. DX – RETT. SOTTO — 2 pz — 130 × 38 cm
  * TRAP. SX – SOPRA — 2 pz — 185 × 35 cm
  * TRAP. SX – VERT. SX — 2 pz — 32 × 102 cm
  * TRAP. SX – VERT. DX — 2 pz — 20 × 170 cm
  * TRAP. SX – TRIANGOLO SOTTO — 2 pz — 155 × 70 cm
  * TRAP. SX – RETT. SOTTO — 2 pz — 90 × 37 cm
  * SOPRA – LATO SX — 2 pz — 45 × 55 cm
  * SOPRA – LATO DX — 2 pz — 45 × 55 cm
  * SOPRA – FRONTALE FISSO — 2 pz — 180 × 60 cm
  * SNODO – CARENA LATERALE — 4 pz — 80 × 165 cm
  * SNODO – CARENA ARCO — 2 pz — 80 × 200 cm

  VAGONE DI CODA

  * FINESTRE – SOPRA — 2 pz — 300 × 35 cm
  * FINESTRE – SOTTO — 4 pz — 175 × 42 cm
  * FINESTRE – VERTICALI — 6 pz — 122 × 35 cm
  * FIN. PICCOLA – SOPRA — 2 pz — 175 × 10 cm
  * FIN. PICCOLA – VERT. DX — 2 pz — 175 × 45 cm
  * FIN. PICCOLA – VERT. SX — 2 pz — 122 × 10 cm
  * FIN. PICCOLA – SOTTO — 2 pz — 122 × 25 cm
  * SNODO – ARCO EST. — 1 pz — 215 × 70 cm
  * SNODO – BASSO EST. — 2 pz — 170 × 60 cm
  * SNODO – ARCO INT. — 1 pz — 210 × 45 cm
  * SNODO – BASSO INT. — 2 pz — 165 × 45 cm
  * GUIDA – FASCIA SX — 1 pz — 100 × 225 cm
  * GUIDA – PORTA — 1 pz — 65 × 225 cm
  * GUIDA – FASCIA DX — 1 pz — 22 × 192 cm
  * GUIDA SX – SOPRA – ANTA — 1 pz — 113 × 35 cm
  * GUIDA SX – SOPRA – FISSO — 1 pz — 35 × 35 cm
  * GUIDA DX – SOPRA – FISSO SX — 1 pz — 20 × 35 cm
  * GUIDA DX – SOPRA – ANTA — 1 pz — 65 × 35 cm
  * GUIDA DX – SOPRA – FISSO DX — 1 pz — 38 × 35 cm
  * CENTRO DX – SOPRA – FISSO SX — 1 pz — 35 × 35 cm
  * CENTRO DX – SOPRA – ANTA 1 — 1 pz — 160 × 35 cm
  * CENTRO DX – SOPRA – FISSO DX — 1 pz — 22 × 35 cm
  * CENTRO DX – SOPRA – ANTA 2 — 1 pz — 130 × 35 cm
  * CENTRO DX – SOPRA – FISSO FINE — 1 pz — 40 × 35 cm
  * CENTRO SX – SOPRA – FISSO SX — 1 pz — 35 × 35 cm
  * CENTRO SX – SOPRA – ANTA 1 — 1 pz — 200 × 35 cm
  * CENTRO SX – SOPRA – ANTA 2 — 1 pz — 145 × 35 cm
  * CENTRO SX – SOPRA – FISSO FINE — 1 pz — 40 × 35 cm
`;

const LASTRA = { larghezza: 1220, altezza: 5000 };
const PAR = { lastra: LASTRA, lama: 3, abbondanza: 0, margine: 10 };

function pezziDi(vagone: string): PezzoNesting[] {
  return analizzaTestoPezzi(LISTA)
    .pezzi.filter((p) => p.materiale === vagone)
    .map((p, i) => ({
      id: `p${i}`,
      nome: p.nome,
      larghezza: p.larghezza,
      altezza: p.altezza,
      ...(p.misura3 !== undefined ? { misura3: p.misura3 } : {}),
      ...(p.forma && p.forma !== 'rett' ? { forma: p.forma } : {}),
      quantita: p.quantita,
      ruotabile: true,
      tinta: i * 37
    }));
}

const VAGONI = ['VAGONE DI TESTA', 'VAGONE CENTRALE', 'VAGONE DI CODA'];

describe('il lavoro del treno', () => {
  it('la lista si legge tutta: tre vagoni, niente righe perse, niente forme inventate', () => {
    const e = analizzaTestoPezzi(LISTA);
    expect(e.materiali).toEqual(VAGONI);
    expect(e.ignorate).toEqual([]);
    expect(e.pezzi).toHaveLength(75);
    expect(e.pezzi.reduce((s, p) => s + p.quantita, 0)).toBe(130);
    // «TRAP. DX – TRIANGOLO SOTTO — 155 × 70»: due misure sono un rettangolo
    expect(e.pezzi.filter((p) => p.forma && p.forma !== 'rett')).toEqual([]);
    // i due vagoni di testa e di coda sono identici: stesse righe, stessi pezzi
    const testa = e.pezzi.filter((p) => p.materiale === VAGONI[0]);
    const coda = e.pezzi.filter((p) => p.materiale === VAGONI[2]);
    expect(coda.map((p) => `${p.nome} ${p.larghezza}x${p.altezza} ${p.quantita}`)).toEqual(
      testa.map((p) => `${p.nome} ${p.larghezza}x${p.altezza} ${p.quantita}`)
    );
  });

  it('sta in diciassette lastre, e non ne perde per strada nessun pezzo', () => {
    let lastre = 0;
    for (const vagone of VAGONI) {
      const pezzi = pezziDi(vagone);
      const esito = calcolaNestingMigliore(PAR, pezzi, { sfridoRettangolare: true });
      const usate = esito.lastre.filter((l) => l.piazzamenti.length > 0);
      lastre += usate.length;

      // tutti piazzati
      const messi = esito.lastre.reduce((s, l) => s + l.piazzamenti.length, 0);
      expect(messi, vagone).toBe(pezzi.reduce((s, p) => s + p.quantita, 0));
      expect(esito.scartati ?? [], vagone).toHaveLength(0);

      // dentro la lastra, e senza sovrapporsi
      for (const l of usate) {
        for (const p of l.piazzamenti) {
          expect(p.x, `${vagone} ${p.nome}`).toBeGreaterThanOrEqual(PAR.margine - 1e-6);
          expect(p.y, `${vagone} ${p.nome}`).toBeGreaterThanOrEqual(PAR.margine - 1e-6);
          expect(p.x + p.larghezza).toBeLessThanOrEqual(LASTRA.larghezza - PAR.margine + 1e-6);
          expect(p.y + p.altezza).toBeLessThanOrEqual(LASTRA.altezza - PAR.margine + 1e-6);
        }
        for (let i = 0; i < l.piazzamenti.length; i++) {
          for (let k = i + 1; k < l.piazzamenti.length; k++) {
            const a = l.piazzamenti[i];
            const b = l.piazzamenti[k];
            const separati =
              a.x + a.larghezza <= b.x + 1e-6 ||
              b.x + b.larghezza <= a.x + 1e-6 ||
              a.y + a.altezza <= b.y + 1e-6 ||
              b.y + b.altezza <= a.y + 1e-6;
            expect(separati, `${vagone}: ${a.nome} e ${b.nome} si sovrappongono`).toBe(true);
          }
        }
      }
    }
    // il conto che si porta in cantiere
    expect(lastre).toBeLessThanOrEqual(17);
  });
});
