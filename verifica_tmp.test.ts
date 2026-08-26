import { describe, it, expect } from 'vitest';
import { pianoEtichetta } from './src/utils/etichettaNesting';
import { codicePannello } from './src/geometry/nomenclatura';

const CORPI = { massimo: 50, comodo: 10, dueRighe: 8, minimo: 3.5 };

describe('scenario del revisore', () => {
  it('stringhe prodotte dalle due strade', () => {
    // strada report (pezziDaProgetto): codice separato
    const daReport = [codicePannello('A1', 0), 'Rettangolo'].join(' ');
    // strada NestingPage: codicePannello su tutto il nome
    const daNesting = codicePannello('A1 Rettangolo', 0);
    console.log('report :', daReport, '| len', daReport.length);
    console.log('nesting:', daNesting, '| len', daNesting.length);
    expect(daReport.length).toBe(daNesting.length);
  });

  it('etichetta SVG su teli realistici: si tronca?', () => {
    const nomi = ['A1.a Rettangolo', 'A1 Rettangolo.a'];
    const misure: [number, number][] = [
      [1370, 2400], // telo di una parete 5100x2400 divisa in 4
      [1200, 2700],
      [600, 2000],
      [300, 2400],
      [200, 900],
      [120, 120],
      [90, 90],
      [80, 80],
      [60, 60]
    ];
    for (const [l, h] of misure) {
      for (const n of nomi) {
        const p = pianoEtichetta(l, h, n, `${l}×${h}`, CORPI);
        console.log(
          `${l}x${h} «${n}» -> ${p ? `«${p.nome ?? '(nessun nome)'}» corpo ${p.corpoNome.toFixed(1)} ruotata=${p.ruotata}` : 'NIENTE'}`
        );
      }
    }
  });

  it('cosa farebbe la correzione proposta (prima parola) sui nomi veri dell app', () => {
    const primaParola = (nome: string, i: number) => {
      const sp = nome.indexOf(' ');
      return sp < 0
        ? codicePannello(nome, i)
        : codicePannello(nome.slice(0, sp), i) + nome.slice(sp);
    };
    const veri = [
      'A1 Rettangolo',            // pezziDaProgetto (codice davanti)
      'Rettangolo 3',             // pezziDaAnnotazioni: nomeDi mette la FORMA davanti
      'Poligono 5 lati',          // pezziDaAnnotazioni senza etichetta
      'Cerchio — vetro satinato', // nota libera
      'Pezzo 1',                  // aggiungiPezzo
      'Top cucina',               // nome scritto a mano / incollato
      'P1.A2 Trapezio'            // codice con percorso
    ];
    for (const n of veri) console.log(`«${n}» -> proposta «${primaParola(n, 0)}» | attuale «${codicePannello(n, 0)}»`);
  });
});
