/**
 * LA MINIATURA CON SOPRA QUELLO CHE È STATO MISURATO.
 *
 * I segni stanno in un SVG sopra la foto, non dentro la miniatura salvata:
 * così sono sempre quelli di adesso — cambi una quota e l'anteprima cambia —
 * e non costano una seconda immagine da generare e tenere aggiornata.
 *
 * Due cose fanno sì che combacino con la foto sotto, che la griglia ritaglia
 * a 4:3 con `object-fit: cover`:
 * - il `viewBox` è l'immagine intera, e `slice` è l'esatto equivalente di
 *   `cover`: stessa scala, stesso ritaglio, stesso centro;
 * - `non-scaling-stroke` tiene il tratto in pixel di SCHERMO. Una quota
 *   disegnata spessa tre pixel su una foto da 2560, rimpicciolita a
 *   centocinquanta, sarebbe spessa due decimi: invisibile.
 *
 * E sotto a ogni segno ne passa uno scuro più largo: su una facciata al sole
 * il giallo su bianco non si vedrebbe.
 */

import { useMemo } from 'react';
import { segniDellAnteprima, type SegnoAnteprima } from '../geometry/anteprima';
import type { Annotazione, Foto } from '../db/types';

export function AnteprimaAnnotata({
  foto,
  annotazioni
}: {
  foto: Foto;
  annotazioni: Annotazione[] | undefined;
}) {
  const segni = useMemo(
    () => (annotazioni?.length ? segniDellAnteprima(foto, annotazioni) : []),
    [foto, annotazioni]
  );
  if (segni.length === 0 || !(foto.larghezzaPx > 0 && foto.altezzaPx > 0)) return null;

  const disegna = (s: SegnoAnteprima, i: number, colorato: boolean) =>
    s.tipo === 'cerchio' ? (
      <circle key={i} cx={s.cx} cy={s.cy} r={s.r} stroke={colorato ? s.colore : undefined} />
    ) : (
      <polyline
        key={i}
        points={coppie(s.punti, s.chiusa)}
        stroke={colorato ? s.colore : undefined}
      />
    );

  return (
    <svg
      className="anteprima-segni"
      viewBox={`0 0 ${foto.larghezzaPx} ${foto.altezzaPx}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g className="alone">{segni.map((s, i) => disegna(s, i, false))}</g>
      <g>{segni.map((s, i) => disegna(s, i, true))}</g>
    </svg>
  );
}

/** da [x,y,x,y…] a «x,y x,y…», richiudendo la spezzata se è chiusa */
function coppie(p: number[], chiusa?: boolean): string {
  const v: string[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) v.push(`${p[i]},${p[i + 1]}`);
  if (chiusa && v.length > 2) v.push(v[0]);
  return v.join(' ');
}
