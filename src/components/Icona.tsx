/**
 * Set di icone vettoriali dedicate, coerenti in tutta l'app.
 * Stile: tratto (stroke) uniforme, 24×24, `currentColor`, angoli tondi —
 * ispirato alle icone di sistema iOS / SF Symbols. Niente emoji.
 */

export type NomeIcona =
  | 'indietro'
  | 'avanti'
  | 'giu'
  | 'piu'
  | 'check'
  | 'chiudi'
  | 'altro'
  | 'cestino'
  | 'matita'
  | 'fotocamera'
  | 'immagine'
  | 'cartella'
  | 'cartella-piu'
  | 'progetto'
  | 'duplica'
  | 'impostazioni'
  | 'persone'
  | 'persona'
  | 'documento'
  | 'righello'
  | 'condividi'
  | 'cerca'
  | 'auto'
  | 'cursore'
  | 'archivio'
  | 'freccia'
  | 'testo'
  | 'dettaglio'
  | 'riferimento'
  | 'quota-orizz'
  | 'quota-vert'
  | 'quota-allin'
  | 'rettangolo'
  | 'quad'
  | 'triangolo'
  | 'polilinea'
  | 'cerchio'
  | 'cerchio-3p'
  | 'angolo'
  | 'disegno'
  | 'sposta'
  | 'etichetta'
  | 'piano'
  | 'avviso'
  | 'info'
  | 'annulla'
  | 'ripristina'
  | 'griglia'
  | 'magnete'
  | 'microfono'
  | 'occhio'
  | 'mirino'
  | 'goccia';

/** Contenuto (path/forme) di ogni icona, su viewBox 24×24 */
const FORME: Record<NomeIcona, JSX.Element> = {
  indietro: <path d="M15 18l-6-6 6-6" />,
  avanti: <path d="M9 18l6-6-6-6" />,
  giu: <path d="M6 9l6 6 6-6" />,
  piu: <path d="M12 5v14M5 12h14" />,
  check: <path d="M20 6L9 17l-5-5" />,
  chiudi: <path d="M18 6L6 18M6 6l12 12" />,
  altro: (
    <>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  cestino: (
    <>
      <path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m2 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  matita: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </>
  ),
  fotocamera: (
    <>
      <path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  immagine: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  cartella: <path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  'cartella-piu': (
    <>
      <path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M12 12v5M9.5 14.5h5" />
    </>
  ),
  progetto: (
    <>
      <rect x="4" y="4" width="16" height="18" rx="2.5" />
      <rect x="8.5" y="2.5" width="7" height="4" rx="1.5" />
      <path d="M8 12h8M8 16h5" />
    </>
  ),
  duplica: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 8.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v8.5a2 2 0 002 2h3.5" />
    </>
  ),
  impostazioni: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 009 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 9a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
    </>
  ),
  persone: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 20v-1.5a3.5 3.5 0 00-2.6-3.4M15.5 5.2a3.2 3.2 0 010 6" />
    </>
  ),
  persona: (
    <>
      <path d="M19 20v-1.5a4 4 0 00-4-4H9a4 4 0 00-4 4V20" />
      <circle cx="12" cy="8" r="3.5" />
    </>
  ),
  documento: (
    <>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  righello: (
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="1.5" transform="rotate(-45 12 12)" />
      <path d="M9 7.5l1.5 1.5M6 10.5l1.5 1.5M12 4.5l1.5 1.5M13.5 13.5l1.5 1.5M10.5 16.5l1.5 1.5" />
    </>
  ),
  condividi: (
    <>
      <path d="M12 15V4M8.5 7.5L12 4l3.5 3.5" />
      <path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </>
  ),
  cerca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  auto: (
    <>
      <path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z" />
      <path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  cursore: <path d="M5 3l14 7-6 2.2L11 19z" />,
  archivio: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1.5" />
      <path d="M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
      <path d="M10 12h4" />
    </>
  ),
  freccia: <path d="M7 17L17 7M9 7h8v8" />,
  testo: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  dettaglio: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
    </>
  ),
  riferimento: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <circle cx="8" cy="12" r="2.3" />
      <path d="M13.5 10h5M13.5 14h5" />
    </>
  ),
  'quota-orizz': <path d="M4 12h16M5 9v6M19 9v6" />,
  'quota-vert': <path d="M12 4v16M9 5h6M9 19h6" />,
  'quota-allin': (
    <>
      <path d="M6 18L18 6" />
      <path d="M5 14v4h4M15 6h4v4" />
    </>
  ),
  rettangolo: <rect x="3" y="6" width="18" height="12" rx="1.5" />,
  quad: <path d="M12 3l9 9-9 9-9-9z" />,
  triangolo: <path d="M12 4l9 16H3z" />,
  polilinea: <path d="M3 17l5-8 4 5 4-9 5 7" />,
  cerchio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12h8.5" />
    </>
  ),
  'cerchio-3p': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="3.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="20" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  angolo: (
    <>
      <path d="M5 5v14h14" />
      <path d="M5 14a9 9 0 019-9" />
    </>
  ),
  disegno: <path d="M3 17c2.5-5 4 2 6.5-1.5S13 6 15 8s2.5 5 6 3" />,
  sposta: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>
  ),
  etichetta: (
    <>
      <path d="M3 7v5.2a2 2 0 00.6 1.4l6.8 6.8a2 2 0 002.8 0l5.2-5.2a2 2 0 000-2.8L11.6 5.6A2 2 0 0010.2 5H5a2 2 0 00-2 2z" />
      <circle cx="7.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  piano: (
    <>
      <path d="M3 8l9-4 9 4-9 4z" />
      <path d="M3 8v8l9 4 9-4V8M12 12v8" />
    </>
  ),
  avviso: (
    <>
      <path d="M12 3.5l9 16H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  annulla: (
    <>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 015 5v1" />
    </>
  ),
  ripristina: (
    <>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H9a5 5 0 00-5 5v1" />
    </>
  ),
  griglia: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  magnete: (
    <>
      <path d="M5 4v8a7 7 0 0014 0V4" />
      <path d="M5 9h5M14 9h5" />
    </>
  ),
  microfono: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </>
  ),
  occhio: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  mirino: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  goccia: <path d="M12 3s6.5 6.8 6.5 11.5a6.5 6.5 0 01-13 0C5.5 9.8 12 3 12 3z" />
};

export function Icona({
  nome,
  dimensione = 22,
  className,
  strokeWidth = 1.8
}: {
  nome: NomeIcona;
  dimensione?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className ? `icona ${className}` : 'icona'}
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {FORME[nome]}
    </svg>
  );
}
