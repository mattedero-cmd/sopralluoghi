import { describe, expect, it } from 'vitest';
import {
  attributoAmmesso,
  dimensioniDisegno,
  eSvg,
  elementoAmmesso,
  livelliSvg,
  misureSvg,
  nomeDaFile,
  pesoTesto
} from '../svgDisegno';
import { svgTaglio } from '../../geometry/svgTaglio';

describe('misureSvg', () => {
  it('legge le misure reali dichiarate in millimetri', () => {
    const m = misureSvg('<svg width="1220mm" height="3000mm" viewBox="0 0 1220 3000"></svg>');
    expect(m).toMatchObject({ larghezzaMm: 1220, altezzaMm: 3000, reali: true });
    expect(m.larghezza).toBe(1220);
  });

  it('capisce anche centimetri, pollici e punti', () => {
    expect(misureSvg('<svg width="10cm" height="5cm"/>').larghezzaMm).toBe(100);
    expect(misureSvg('<svg width="1in" height="1in"/>').larghezzaMm).toBeCloseTo(25.4);
    expect(misureSvg('<svg width="72pt" height="72pt"/>').larghezzaMm).toBeCloseTo(25.4);
    expect(misureSvg('<svg width="96px" height="96px"/>').larghezzaMm).toBeCloseTo(25.4);
  });

  it('senza unità le misure sono quelle del disegno, e si dice che non sono certe', () => {
    const m = misureSvg('<svg width="800" height="600" viewBox="0 0 800 600"/>');
    expect(m).toMatchObject({ larghezzaMm: 800, altezzaMm: 600, reali: false });
  });

  it('col solo viewBox si prendono le sue unità', () => {
    const m = misureSvg('<svg viewBox="0 0 210 297"/>');
    expect(m).toMatchObject({ larghezza: 210, altezza: 297, reali: false });
  });

  it('una sola misura dichiarata: l’altra segue le proporzioni', () => {
    const m = misureSvg('<svg width="100mm" viewBox="0 0 200 100"/>');
    expect(m.larghezzaMm).toBe(100);
    expect(m.altezzaMm).toBe(50);
    expect(m.reali).toBe(true);
  });

  it('gli apici singoli e le maiuscole non danno fastidio', () => {
    const m = misureSvg("<SVG WIDTH='50mm' HEIGHT='25mm'/>");
    expect(m).toMatchObject({ larghezzaMm: 50, altezzaMm: 25 });
  });

  it('un file che non è un SVG non ha misure', () => {
    expect(misureSvg('%PDF-1.4 ...')).toMatchObject({ larghezzaMm: null, larghezza: null });
  });

  it('misure assurde o vuote non passano', () => {
    expect(misureSvg('<svg width="0mm" height="10mm"/>').larghezzaMm).toBe(null);
    expect(misureSvg('<svg width="tanto" height="poco"/>').larghezzaMm).toBe(null);
  });

  it('legge davvero l’SVG di taglio prodotto dall’app', () => {
    const testo = svgTaglio(
      { piazzamenti: [] },
      { larghezza: 1220, altezza: 2500 },
      { titolo: 'Prova' }
    );
    expect(misureSvg(testo)).toMatchObject({
      larghezzaMm: 1220,
      altezzaMm: 2500,
      reali: true
    });
  });
});

describe('eSvg', () => {
  it('riconosce un disegno vero', () => {
    expect(eSvg('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(true);
  });

  it('scarta quello che SVG non è', () => {
    expect(eSvg('%PDF-1.4')).toBe(false);
    expect(eSvg('<html><body>ciao</body></html>')).toBe(false);
    expect(eSvg('')).toBe(false);
  });
});

describe('livelliSvg', () => {
  it('elenca i livelli nell’ordine del file, senza ripetizioni', () => {
    const testo = svgTaglio({ piazzamenti: [] }, { larghezza: 100, altezza: 100 });
    expect(livelliSvg(testo)).toEqual(['sheet', 'CutContour']);
  });
});

describe('nomeDaFile', () => {
  it('toglie percorso ed estensione', () => {
    expect(nomeDaFile('/tmp/cucina/taglio_rovere.svg')).toBe('taglio_rovere');
    expect(nomeDaFile('Disegno.SVG')).toBe('Disegno');
    expect(nomeDaFile('.svg')).toBe('Disegno');
  });
});

describe('pesoTesto', () => {
  it('dice il peso in byte, kB o MB', () => {
    expect(pesoTesto('abc')).toBe('3 byte');
    expect(pesoTesto('x'.repeat(2048))).toBe('2,0 kB');
    expect(pesoTesto('x'.repeat(2 * 1024 * 1024))).toBe('2,0 MB');
  });
});

describe('cosa passa nella pagina e cosa no', () => {
  it('i tag che disegnano passano', () => {
    for (const t of ['svg', 'g', 'path', 'rect', 'text', 'use', 'clipPath', 'linearGradient'])
      expect(elementoAmmesso(t)).toBe(true);
  });

  it('tutto il resto no, comprese le maiuscole di comodo', () => {
    for (const t of ['script', 'SCRIPT', 'foreignObject', 'image', 'style', 'iframe', 'animate', 'set'])
      expect(elementoAmmesso(t)).toBe(false);
  });

  it('un tag mai visto non entra per distrazione', () => {
    expect(elementoAmmesso('qualcosaDiNuovo')).toBe(false);
  });

  it('gli attributi che disegnano passano', () => {
    expect(attributoAmmesso('d', 'M0 0 L10 10')).toBe(true);
    expect(attributoAmmesso('stroke', '#EC008C')).toBe(true);
    expect(attributoAmmesso('viewBox', '0 0 100 100')).toBe(true);
    expect(attributoAmmesso('style', 'fill: none; stroke-width: 0.25')).toBe(true);
  });

  it('i gestori di eventi non passano mai', () => {
    expect(attributoAmmesso('onload', 'alert(1)')).toBe(false);
    expect(attributoAmmesso('onclick', 'x()')).toBe(false);
    expect(attributoAmmesso('ONMOUSEOVER', 'x()')).toBe(false);
  });

  it('i rimandi escono solo verso il documento stesso', () => {
    expect(attributoAmmesso('href', '#pezzo1')).toBe(true);
    expect(attributoAmmesso('xlink:href', '#simbolo')).toBe(true);
    expect(attributoAmmesso('href', 'https://esempio.it/x.png')).toBe(false);
    expect(attributoAmmesso('href', 'javascript:alert(1)')).toBe(false);
    expect(attributoAmmesso('xlink:href', 'data:image/svg+xml;base64,AAA')).toBe(false);
  });

  it('gli indirizzi nascosti dentro un valore qualsiasi non passano', () => {
    expect(attributoAmmesso('fill', 'javascript:alert(1)')).toBe(false);
    expect(attributoAmmesso('style', 'background: url(https://esempio.it/x)')).toBe(false);
    expect(attributoAmmesso('style', '@import "x.css"')).toBe(false);
  });

  it('un colore che contiene «data» per caso non viene scambiato per un indirizzo', () => {
    expect(attributoAmmesso('id', 'dataset-1')).toBe(true);
    expect(attributoAmmesso('class', 'javascripty')).toBe(true);
  });
});

describe('dimensioniDisegno', () => {
  it('le unità del disegno diventano pixel', () => {
    expect(dimensioniDisegno(misureSvg('<svg width="1220mm" height="900mm" viewBox="0 0 1220 900"/>')))
      .toEqual({ larghezza: 1220, altezza: 900 });
  });

  it('senza viewBox restano i millimetri', () => {
    expect(dimensioniDisegno(misureSvg('<svg width="100mm" height="50mm"/>'))).toEqual({
      larghezza: 100,
      altezza: 50
    });
  });

  it('un file senza misure ha comunque una dimensione con cui partire', () => {
    expect(dimensioniDisegno(misureSvg('<svg/>')).larghezza).toBeGreaterThan(0);
  });
});
