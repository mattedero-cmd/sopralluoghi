import { describe, expect, it } from 'vitest';
import { disposizioneDallaRete, reteDiScatti, riquadroSano, telaDaVerso } from '../panoramica';
import type { Omografia } from '../omografia';
import { H, W, passeggiata } from './scenaPasseggiata';

describe('le panoramiche impossibili si rifiutano, non si consegnano', () => {
  it('una fila buona passa', () => {
    const { immagini } = passeggiata(6, 850);
    const scatti = immagini.map(() => ({ larghezza: W, altezza: H }));
    const rete = reteDiScatti(immagini);
    const motivo = { testo: '' };
    const d = disposizioneDallaRete(scatti, rete, 6000, motivo);
    console.log(d ? `buona: ${d.larghezza}×${d.altezza}` : `RIFIUTATA: ${motivo.testo}`);
    expect(d).not.toBeNull();
  }, 300000);

  it('uno scatto che attraversa il proprio orizzonte viene fermato', () => {
    // un'omografia con la retta d'orizzonte in mezzo al fotogramma: il
    // denominatore cambia segno fra un angolo e l'altro
    const cattiva: Omografia = [1, 0, 0, 0, 1, 0, 0.004, 0, -1];
    expect(riquadroSano(cattiva, W, H, 0.02, 60)).toBe(false);
    // e la stessa cosa, sana, passa
    expect(riquadroSano([1, 0, 0, 0, 1, 0, 0, 0, 1] as Omografia, W, H, 0.02, 60)).toBe(true);
  });

  it('quando in mezzo non resta niente da misurare, lo dice e non consegna', () => {
    const scatti = [0, 1, 2].map(() => ({ larghezza: W, altezza: H }));
    // due scatti di testa stirati enormemente, quello di mezzo intatto:
    // la tela la dimensionano i bordi, e il centro si schiaccia
    const verso: Omografia[] = [
      [1, 0, 0, 0, 1, 0, 0.0014, 0, 1],
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      [1, 0, 4000, 0, 1, 0, -0.0014, 0, 1]
    ];
    const motivo = { testo: '' };
    const d = telaDaVerso(scatti, verso, 6000, motivo);
    console.log(`esito: ${d ? `${d.larghezza}×${d.altezza}` : motivo.testo}`);
    expect(d).toBeNull();
    expect(motivo.testo).toMatch(/DUE panoramiche|di taglio|ventaglio/);
  });
});
