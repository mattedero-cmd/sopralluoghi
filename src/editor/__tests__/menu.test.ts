import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * IL MENU: UNA VOCE, UNA COSA, UN'ICONA.
 *
 * Il menu era arrivato a settanta voci con ventisei icone, e le stesse parole
 * comparivano in tre gruppi diversi facendo tre cose diverse: «Rettangolo» era
 * un pezzo quotato, un segno grafico e un ingombro di pianta. Chi guarda la
 * barra, in cantiere, con i guanti, non ci trova niente.
 *
 * Queste prove leggono il SORGENTE e non i tipi, perché il difetto non stava
 * nei tipi: due voci possono benissimo portare la stessa icona e chiamarsi
 * uguale, e il compilatore è contento lo stesso.
 */

const editor = readFileSync(new URL('../EditorFoto.tsx', import.meta.url), 'utf8');
const icone = readFileSync(new URL('../../components/Icona.tsx', import.meta.url), 'utf8');

/** il corpo di una costante `const NOME: ... = [ ... ];` */
function blocco(nome: string): string {
  const i = editor.indexOf(`const ${nome}`);
  expect(i, `costante ${nome} non trovata`).toBeGreaterThan(-1);
  const fine = editor.indexOf('\n];', i);
  return editor.slice(i, fine);
}

const MENU = ['GRUPPI_MISURE', 'GRUPPI_NOTE', 'GRUPPI_PIANTA'] as const;

/** ogni voce: gruppo di appartenenza, etichetta e icona */
function voci(nome: string): Array<{ gruppo: string; testo: string; icona: string }> {
  const b = blocco(nome);
  const fuori: Array<{ gruppo: string; testo: string; icona: string }> = [];
  // i gruppi si aprono con `id: '…'`; tutto quello che segue fino al prossimo
  // `id:` sono le sue voci
  const capi = [...b.matchAll(/^ {4}id: '([a-zA-Z0-9]+)',/gm)];
  capi.forEach((capo, k) => {
    const da = capo.index!;
    const a = k + 1 < capi.length ? capi[k + 1].index! : b.length;
    const pezzo = b.slice(da, a);
    // le voci di Misure/Note sono `{ s, icona, testo }`, quelle della pianta
    // `{ icona, testo, … }`: la coppia icona+testo è comune a tutte
    for (const m of pezzo.matchAll(/icona: '([a-z0-9-]+)', testo: '([^']+)'/g))
      fuori.push({ gruppo: capo[1], icona: m[1], testo: m[2] });
  });
  return fuori;
}

/** l'icona del pulsante di gruppo (quella che si vede nella barra) */
function iconeDiGruppo(nome: string): Array<{ gruppo: string; icona: string }> {
  const b = blocco(nome);
  return [...b.matchAll(/id: '([a-zA-Z0-9]+)',\s*\n\s*icona: '([a-z0-9-]+)',/g)].map((m) => ({
    gruppo: m[1],
    icona: m[2]
  }));
}

const dichiarate = new Set(
  [...icone.matchAll(/^ {2}\| '([a-z0-9-]+)'/gm)].map((m) => m[1])
);

describe('il menu dell’editor', () => {
  it('ogni icona nominata nel menu esiste davvero', () => {
    const usate = MENU.flatMap((n) => [
      ...voci(n).map((v) => v.icona),
      ...iconeDiGruppo(n).map((g) => g.icona)
    ]);
    expect(usate.length).toBeGreaterThan(40);
    expect(usate.filter((i) => !dichiarate.has(i))).toEqual([]);
  });

  it('nessuna icona serve due voci diverse', () => {
    const visti = new Map<string, string>();
    const doppie: string[] = [];
    for (const nome of MENU) {
      for (const g of iconeDiGruppo(nome)) {
        const prima = visti.get(g.icona);
        if (prima) doppie.push(`${g.icona}: ${prima} = gruppo ${g.gruppo}`);
        else visti.set(g.icona, `gruppo ${g.gruppo}`);
      }
      for (const v of voci(nome)) {
        const prima = visti.get(v.icona);
        if (prima) doppie.push(`${v.icona}: ${prima} = ${v.testo}`);
        else visti.set(v.icona, v.testo);
      }
    }
    expect(doppie, 'icone usate da più di una voce').toEqual([]);
  });

  it('nessuna etichetta compare due volte', () => {
    const tutte = MENU.flatMap((n) => voci(n).map((v) => v.testo));
    const doppie = tutte.filter((t, i) => tutte.indexOf(t) !== i);
    expect(doppie, 'stessa parola per cose diverse').toEqual([]);
  });

  it('la calibrazione non è più una voce di menu ma la striscia', () => {
    // «Scala e piano» stava in un cassetto insieme agli strumenti di disegno:
    // per sapere se una foto era calibrata bisognava aprirlo
    const dentro = MENU.flatMap((n) => voci(n).map((v) => v.testo));
    for (const parola of ['Scala (segmento)', 'Piano (prospettiva)', 'Togli la scala'])
      expect(dentro).not.toContain(parola);
    expect(editor).toContain('className="striscia-scala"');
    // e «Togli il piano», che nel codice non aveva nessuna voce che lo
    // chiamasse, adesso ce l'ha
    expect(editor).toContain('Togli il piano');
    expect(editor).toContain('void togliPiano();');
  });

  it('la pianta si apre come documento, non si arma come strumento', () => {
    // «Schizzo stanza» armava su una foto normale lo strumento parametrico,
    // ma tutti i suoi rami sono chiusi da `foto.ePianta`: non faceva niente
    const misure = blocco('GRUPPI_MISURE');
    expect(misure).not.toContain("s: 'schizzo'");
    expect(misure).toContain("comando: 'apriPianta'");
    expect(editor).toContain('creaPiantaDaFoto(foto.progettoId, foto)');
  });
});
