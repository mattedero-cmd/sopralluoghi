import { useEffect, useRef, useState } from 'react';

/**
 * Menu circolare per scegliere la lettera (o il numero) dell'etichetta attiva.
 * Si apre con un tap prolungato direttamente sotto il dito.
 *
 *  - mostra alcune voci disposte radialmente, in senso orario;
 *  - la voce in alto è quella proposta (la prima libera dopo l'ultima usata);
 *  - si può toccare direttamente una voce visibile per sceglierla;
 *  - oppure ruotare il dito attorno al centro per scorrere tutte le voci
 *    (orario = successive, antiorario = precedenti) fino alla Z e poi ai numeri;
 *  - non serve tenere premuto: il menu resta aperto finché non si sceglie o si
 *    tocca fuori.
 */

const VISIBILI = 8;
const RAGGIO = 104;
/** gradi di rotazione del dito per scorrere di una voce */
const STEP_GRADI = 28;

export function MenuCircolareEtichette({
  centro,
  sequenza,
  indiceIniziale,
  onScegli,
  onChiudi
}: {
  centro: { x: number; y: number };
  sequenza: string[];
  indiceIniziale: number;
  onScegli: (valore: string) => void;
  onChiudi: () => void;
}) {
  const L = sequenza.length;
  const [base, setBase] = useState((((indiceIniziale % L) + L) % L) || 0);
  // si arma al primo rilascio del dito (quello del tap prolungato), così il
  // sollevamento iniziale non seleziona né chiude nulla
  const [armato, setArmato] = useState(false);
  const trascina = useRef(false);
  const ruotato = useRef(false);
  const ultimoAngolo = useRef(0);
  const accumulo = useRef(0);

  const margine = RAGGIO + 34;
  const cx = Math.min(Math.max(centro.x, margine), window.innerWidth - margine);
  const cy = Math.min(Math.max(centro.y, margine), window.innerHeight - margine);

  useEffect(() => {
    const arma = () => setArmato(true);
    window.addEventListener('pointerup', arma, { once: true });
    return () => window.removeEventListener('pointerup', arma);
  }, []);

  const angoloDa = (x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

  const giuRot = (e: React.PointerEvent) => {
    if (!armato) return;
    trascina.current = true;
    ruotato.current = false;
    ultimoAngolo.current = angoloDa(e.clientX, e.clientY);
    accumulo.current = 0;
  };
  const muoviRot = (e: React.PointerEvent) => {
    if (!trascina.current) return;
    const a = angoloDa(e.clientX, e.clientY);
    let d = a - ultimoAngolo.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    ultimoAngolo.current = a;
    accumulo.current += d;
    if (Math.abs(accumulo.current) > 6) ruotato.current = true;
    while (accumulo.current >= STEP_GRADI) {
      setBase((b) => (b + 1) % L);
      accumulo.current -= STEP_GRADI;
    }
    while (accumulo.current <= -STEP_GRADI) {
      setBase((b) => (b - 1 + L) % L);
      accumulo.current += STEP_GRADI;
    }
  };

  const slots = Array.from({ length: VISIBILI }, (_, i) => {
    const ang = (-90 + (360 / VISIBILI) * i) * (Math.PI / 180);
    return {
      valore: sequenza[(base + i) % L],
      attivo: i === 0,
      x: cx + RAGGIO * Math.cos(ang),
      y: cy + RAGGIO * Math.sin(ang)
    };
  });
  const corrente = sequenza[base];

  return (
    <div
      className="menu-circolare-velo"
      onPointerDown={giuRot}
      onPointerMove={muoviRot}
      onPointerUp={(e) => {
        trascina.current = false;
        if (armato && !ruotato.current && (e.target as HTMLElement).classList.contains('menu-circolare-velo')) {
          onChiudi();
        }
      }}
      onWheel={(e) => {
        if (!armato) return;
        setBase((b) => (e.deltaY > 0 ? b + 1 : b - 1 + L) % L);
      }}
    >
      <button
        type="button"
        className="menu-circolare-centro"
        style={{ left: cx, top: cy }}
        onClick={() => {
          if (!ruotato.current) onScegli(corrente);
        }}
      >
        {corrente}
      </button>
      {slots.map((s, i) => (
        <button
          key={i}
          type="button"
          className={`menu-circolare-voce${s.attivo ? ' attiva' : ''}`}
          style={{ left: s.x, top: s.y }}
          onClick={() => {
            if (!ruotato.current) onScegli(s.valore);
          }}
        >
          {s.valore}
        </button>
      ))}
    </div>
  );
}
