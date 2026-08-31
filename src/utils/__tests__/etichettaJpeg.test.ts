import { describe, expect, it } from 'vitest';
import { etichettaJpeg, inOrdineDiScatto } from '../cucitura';

/**
 * L'ETICHETTA DENTRO IL JPEG.
 *
 * Due cose ci servono da lì, e sono tutte e due difetti visti sul campo: come
 * va girata la foto — perché i browser non si comportano allo stesso modo e
 * la stessa panoramica usciva coricata su un telefono e dritta sull'altro — e
 * quando è stata scattata, per rimettere in fila le foto prese dal rullino,
 * che arrivano nell'ordine in cui le si tocca.
 *
 * Il blocco EXIF si costruisce qui a mano: è un formato con i rimandi (l'ora
 * sta in un secondo blocco, raggiunto da un puntatore) e le due varianti di
 * ordine dei byte, ed è proprio lì che un lettore scritto a occhio sbaglia.
 */

/** un JPEG finto: giusto la testata, l'etichetta EXIF e le misure */
function jpegConEtichetta(opzioni: {
  orientamento?: number;
  quando?: string | null;
  piccolo?: boolean;
  larghezza?: number;
  altezza?: number;
}): Blob {
  const { orientamento = 1, quando = null, piccolo = false } = opzioni;
  const larghezza = opzioni.larghezza ?? 4000;
  const altezza = opzioni.altezza ?? 3000;
  const testo = quando ? `${quando}\0` : '';
  const conOra = testo.length > 0;

  // TIFF: testata 8 · IFD0 · (SubIFD · testo)
  const voci0 = conOra ? 2 : 1;
  const ifd0 = 8;
  const finelfd0 = ifd0 + 2 + voci0 * 12 + 4;
  const sub = finelfd0;
  const fineSub = sub + 2 + 1 * 12 + 4;
  const doveTesto = fineSub;
  const lungoTiff = conOra ? doveTesto + testo.length : finelfd0;

  const t = new DataView(new ArrayBuffer(lungoTiff));
  const s8 = (o: number, v: number) => t.setUint8(o, v);
  const s16 = (o: number, v: number) => t.setUint16(o, v, piccolo);
  const s32 = (o: number, v: number) => t.setUint32(o, v, piccolo);
  s8(0, piccolo ? 0x49 : 0x4d);
  s8(1, piccolo ? 0x49 : 0x4d);
  s16(2, 42);
  s32(4, ifd0);
  s16(ifd0, voci0);
  // orientamento (SHORT: il valore sta nei primi due byte del campo)
  s16(ifd0 + 2, 0x0112);
  s16(ifd0 + 4, 3);
  s32(ifd0 + 6, 1);
  s16(ifd0 + 10, orientamento);
  if (conOra) {
    s16(ifd0 + 14, 0x8769);
    s16(ifd0 + 16, 4);
    s32(ifd0 + 18, 1);
    s32(ifd0 + 22, sub);
    s16(sub, 1);
    s16(sub + 2, 0x9003);
    s16(sub + 4, 2);
    s32(sub + 6, testo.length);
    s32(sub + 10, doveTesto);
    for (let i = 0; i < testo.length; i++) s8(doveTesto + i, testo.charCodeAt(i));
  }

  const tiff = new Uint8Array(t.buffer);
  const app1 = new Uint8Array(2 + 2 + 6 + tiff.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1[2] = ((6 + tiff.length + 2) >> 8) & 0xff;
  app1[3] = (6 + tiff.length + 2) & 0xff;
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  app1.set(tiff, 10);

  // SOF0 con le misure vere dei pixel scritti
  const sof = new Uint8Array([
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (altezza >> 8) & 0xff, altezza & 0xff,
    (larghezza >> 8) & 0xff, larghezza & 0xff,
    0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1
  ]);
  return new Blob([new Uint8Array([0xff, 0xd8]), app1, sof, new Uint8Array([0xff, 0xd9])]);
}

describe('l’etichetta dentro il JPEG', () => {
  it('legge orientamento e misure, con i byte in tutti e due i versi', async () => {
    for (const piccolo of [false, true]) {
      const e = await etichettaJpeg(
        jpegConEtichetta({ orientamento: 6, piccolo, larghezza: 5712, altezza: 4284 })
      );
      expect(e, `endian ${piccolo ? 'II' : 'MM'}`).not.toBeNull();
      expect(e!.orientamento).toBe(6);
      expect(e!.larghezza).toBe(5712);
      expect(e!.altezza).toBe(4284);
    }
  });

  it('segue il rimando e trova l’ora dello scatto', async () => {
    for (const piccolo of [false, true]) {
      const e = await etichettaJpeg(
        jpegConEtichetta({ orientamento: 1, quando: '2026:08:31 14:03:22', piccolo })
      );
      expect(e!.istante).toBe(new Date(2026, 7, 31, 14, 3, 22).getTime());
    }
  });

  it('senza l’ora non inventa niente', async () => {
    const e = await etichettaJpeg(jpegConEtichetta({ orientamento: 3 }));
    expect(e!.orientamento).toBe(3);
    expect(e!.istante).toBeNull();
  });

  it('su un file che non è un JPEG non si impunta', async () => {
    expect(await etichettaJpeg(new Blob([new Uint8Array([1, 2, 3, 4])]))).toBeNull();
  });
});

describe('le foto del rullino si rimettono in fila', () => {
  const orario = (m: number) => `2026:08:31 14:${String(m).padStart(2, '0')}:00`;

  it('l’ordine dello scatto vince su quello dei tocchi', async () => {
    const fatte = [1, 2, 3, 4, 5].map((k) =>
      jpegConEtichetta({ quando: orario(k), larghezza: 100 + k, altezza: 90 })
    );
    // toccate a casaccio: 3, 1, 5, 2, 4
    const toccate = [fatte[2], fatte[0], fatte[4], fatte[1], fatte[3]];
    const messe = await inOrdineDiScatto(toccate);
    const quale = await Promise.all(messe.map(async (b) => (await etichettaJpeg(b))!.larghezza));
    expect(quale).toEqual([101, 102, 103, 104, 105]);
  });

  it('se anche una sola non ha l’ora, non si mescola niente', async () => {
    const conOra = [3, 1, 2].map((k) => jpegConEtichetta({ quando: orario(k), larghezza: 100 + k, altezza: 90 }));
    const senza = jpegConEtichetta({ larghezza: 200, altezza: 90 });
    const dati = [...conOra, senza];
    const messe = await inOrdineDiScatto(dati);
    expect(messe).toEqual(dati);
  });
});
