import { describe, expect, it } from 'vitest';
import { calcolaNestingAuto } from '../nestingSagome';
import { lunghezzaUsata } from '../nesting';
import { materialeNuovo, opzioniRicerca, parametriDi, pezziDi } from '../../utils/documentoNesting';
import { fileSvgTaglio } from '../../utils/esportaTaglio';

/**
 * FINITA UNA BOBINA SE NE APRE UN'ALTRA.
 *
 * Prima il rotolo era uno solo e quello che non ci stava veniva scartato: per
 * lavorarci bisognava spostare a mano i pezzi avanzati in un'altra essenza e
 * rifare l'impaginazione da capo. In laboratorio non funziona così — si
 * monta un rotolo nuovo — e per ordinare il materiale serve sapere la somma:
 * venticinque metri pieni più nove, non «venticinque e questi avanzano».
 */
const bobina = (larghezza: number, metri: number) => ({
  ...materialeNuovo('m1', 'Pellicola'),
  modo: 'bobina' as const,
  bobina: { larghezza, metri },
  lama: 3,
  margine: 10
});

describe('bobine multiple', () => {
  // 40 teli da 1200 × 2400: su una fascia da 1220 ci va una colonna sola,
  // quindi servono ~96 m e una bobina da 25 m non basta
  const m = {
    ...bobina(1220, 25),
    pezzi: [
      {
        id: 'telo',
        nome: 'Telo vetrina',
        larghezza: 1190,
        altezza: 2400,
        quantita: 12,
        ruotabile: false,
        tinta: 0
      }
    ]
  };

  it('quello che non entra nella prima apre la seconda, invece di finire scartato', () => {
    const esito = calcolaNestingAuto(parametriDi(m), pezziDi(m), opzioniRicerca(m));
    const rotoli = esito.lastre.filter((l) => l.piazzamenti.length > 0);
    expect(rotoli.length).toBeGreaterThan(1);
    // nessun pezzo perso per strada
    expect(esito.scartati ?? []).toHaveLength(0);
    expect(rotoli.reduce((s, l) => s + l.piazzamenti.length, 0)).toBe(12);
    // ogni rotolo sta nei suoi venticinque metri
    for (const r of rotoli) expect(lunghezzaUsata(r, m.margine)).toBeLessThanOrEqual(25000);
  });

  it('i metri da ordinare sono la somma dei rotoli', () => {
    const esito = calcolaNestingAuto(parametriDi(m), pezziDi(m), opzioniRicerca(m));
    const rotoli = esito.lastre.filter((l) => l.piazzamenti.length > 0);
    const totale = rotoli.reduce((s, l) => s + lunghezzaUsata(l, m.margine), 0);
    // dodici teli da 2,4 m in colonna singola: circa trenta metri in tutto
    expect(totale / 1000).toBeGreaterThan(25);
    expect(totale / 1000).toBeLessThan(40);
  });

  it('esce un file di taglio per ogni bobina, e il nome lo dice', () => {
    const doc = {
      versione: 2 as const,
      nome: 'Vetrine',
      attivo: m.id,
      materiali: [m]
    };
    const file = fileSvgTaglio(doc, { perSegmento: false, massimoSegmento: 0, etichette: false });
    expect(file.length).toBeGreaterThan(1);
    expect(file.map((f) => f.foglio)).toEqual(
      file.map((_, i) => `Bobina ${i + 1} di ${file.length}`)
    );
    // e ogni file è alto quanto il tratto davvero occupato di quel rotolo
    for (const f of file) {
      const alt = Number(f.contenuto.match(/height="([\d.]+)mm"/)![1]);
      expect(alt).toBeGreaterThan(0);
      expect(alt).toBeLessThanOrEqual(25000);
    }
  });

  it('un pezzo più largo del rotolo resta fuori: quello i metri non lo salvano', () => {
    const largo = {
      ...bobina(1220, 25),
      pezzi: [
        // largo più della fascia in TUTTI e due i versi: girarlo non aiuta
        { id: 'x', nome: 'Troppo largo', larghezza: 1500, altezza: 1400, quantita: 1, ruotabile: true, tinta: 0 }
      ]
    };
    const esito = calcolaNestingAuto(parametriDi(largo), pezziDi(largo), opzioniRicerca(largo));
    expect(esito.scartati).toHaveLength(1);
  });
});
