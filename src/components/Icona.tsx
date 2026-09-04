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
  | 'goccia'
  // --- il menu strumenti: una per voce, nessuna ripetuta ---
  | 'punta'
  | 'richiamo'
  | 'scala-vuota'
  | 'scala-piena'
  | 'misure'
  | 'catene'
  | 'pezzi'
  | 'tondi'
  | 'segni'
  | 'note'
  | 'quota-h'
  | 'quota-v'
  | 'quota-obliqua'
  | 'quota-angolo'
  | 'catena-serie'
  | 'catena-origine'
  | 'catena-progressiva'
  | 'forma-auto'
  | 'forma-rett'
  | 'forma-quattro'
  | 'forma-tri'
  | 'forma-spezzata'
  | 'tondo-raggio'
  | 'tondo-tre-punti'
  | 'tondo-foro'
  | 'tondo-smusso'
  | 'tondo-filetto'
  | 'segno-linea'
  | 'segno-riquadro'
  | 'segno-ovale'
  | 'segno-poligono'
  | 'segno-penna'
  | 'nota-etichetta'
  | 'nota-testo'
  | 'nota-freccia'
  | 'nota-dettaglio'
  | 'pianta'
  | 'quote-comandano'
  | 'raddrizza'
  | 'muro-perimetro'
  | 'muro-ingombro'
  | 'muro-tondo'
  | 'muro-nome'
  | 'muro-origine'
  | 'dist-due-punti'
  | 'dist-angolo'
  | 'dist-uguale'
  | 'dritto-90'
  | 'dritto-asse'
  | 'dritto-allinea'
  | 'dritto-semplifica'
  | 'dritto-ricostruisci'
  | 'dritto-elimina'
  | 'dritto-sblocca'
  | 'porta-pianta'
  | 'dist-distanza'
  | 'dritto-unisci';

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
  goccia: <path d="M12 3s6.5 6.8 6.5 11.5a6.5 6.5 0 01-13 0C5.5 9.8 12 3 12 3z" />,

  // --- il menu strumenti: una per voce del menu, nessuna ripetuta ---
  'punta': <path d="M5 3l6 16 2.2-6.4L19.6 10z" />,
  'richiamo': (
    <>
      <rect x="4" y="8" width="10" height="10" rx="2" />
      <path d="M9 5h7a4 4 0 0 1 4 4v6" />
      <path d="M17.5 12.5L20 15l2.2-2.5" />
    </>
  ),
  'scala-vuota': (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="1.6" />
      <path d="M7 8v3M12 8v4M17 8v3" />
    </>
  ),
  'scala-piena': (
    <>
      <rect x="2.5" y="8" width="13" height="8" rx="1.6" />
      <path d="M6.5 8v3M11 8v4" />
      <path d="M17 13.5l2 2 3.5-4" />
    </>
  ),
  'misure': (
    <>
      <path d="M4 7v10M20 7v10" />
      <path d="M4 12h16" />
      <path d="M7 9.5L4.5 12 7 14.5M17 9.5L19.5 12 17 14.5" />
    </>
  ),
  'catene': (
    <>
      <path d="M3 16h18" />
      <path d="M3 13v6M9 13v6M15 13v6M21 13v6" />
      <path d="M5 8.5h2.5M10.5 8.5h3M17 8.5h2.5" />
    </>
  ),
  'pezzi': (
    <>
      <rect x="4" y="6" width="16" height="12" rx="1.5" />
      <path d="M4 9h3M17 9h3M4 15h3M17 15h3" />
    </>
  ),
  'tondi': (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M4.5 12h15" />
      <path d="M9 9.5L6.5 12 9 14.5" />
    </>
  ),
  'segni': (
    <>
      <path d="M4 20c3-1 4-4 6-7s4-5 7-4" />
      <path d="M14.5 4.5l4 4L9 18l-4.5.5L5 14z" />
    </>
  ),
  'note': (
    <>
      <path d="M4 5h16v11H9l-4 3z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  'quota-h': (
    <>
      <path d="M4 6v12M20 6v12" />
      <path d="M6.5 12h11" />
      <path d="M8.5 9.8L6.3 12l2.2 2.2M15.5 9.8l2.2 2.2-2.2 2.2" />
    </>
  ),
  'quota-v': (
    <>
      <path d="M6 4h12M6 20h12" />
      <path d="M12 6.5v11" />
      <path d="M9.8 8.5L12 6.3l2.2 2.2M9.8 15.5L12 17.7l2.2-2.2" />
    </>
  ),
  'quota-obliqua': (
    <>
      <path d="M3.5 8.5l3-3M17.5 18.5l3-3" />
      <path d="M6.5 17.5L17.5 6.5" />
      <path d="M6.6 14.4v3.2h3.2M17.4 9.6V6.4h-3.2" />
    </>
  ),
  'quota-angolo': (
    <>
      <path d="M5 19h15" />
      <path d="M5 19L17 5" />
      <path d="M13.5 19a8.5 8.5 0 0 0-2.1-5.6" />
    </>
  ),
  'catena-serie': (
    <>
      <path d="M3 17h18" />
      <path d="M3 14v6M10 14v6M17 14v6" />
      <path d="M4.5 9h4M11.5 9h4" />
      <path d="M5.6 7.9L4.4 9l1.2 1.1M12.6 7.9L11.4 9l1.2 1.1" />
    </>
  ),
  'catena-origine': (
    <>
      <path d="M4 4v16" />
      <path d="M4 8h6M4 13h11M4 18h16" />
      <path d="M8.6 6.9L9.8 8 8.6 9.1M13.6 11.9L14.8 13l-1.2 1.1M18.6 16.9L19.8 18l-1.2 1.1" />
    </>
  ),
  'catena-progressiva': (
    <>
      <path d="M4 19V6" />
      <path d="M4 19h16" />
      <path d="M9 19V9M14 19v-5M19 19v-8" />
      <circle cx="9" cy="7.5" r="1.2" />
      <circle cx="14" cy="12.5" r="1.2" />
      <circle cx="19" cy="9.5" r="1.2" />
    </>
  ),
  'forma-auto': (
    <>
      <rect x="3" y="7" width="12" height="10" rx="1.5" />
      <path d="M18.5 4.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
      <path d="M19 15.5v4M17 17.5h4" />
    </>
  ),
  'forma-rett': (
    <>
      <rect x="3.5" y="7" width="17" height="10" rx="1" />
      <path d="M3.5 4.5h17" />
      <path d="M6 3.6v1.8M18 3.6v1.8" />
    </>
  ),
  'forma-quattro': (
    <>
      <path d="M4.5 6.5l15 2-2.5 9.5-11-1.5z" />
      <circle cx="4.5" cy="6.5" r="1.4" />
      <circle cx="19.5" cy="8.5" r="1.4" />
      <circle cx="17" cy="18" r="1.4" />
      <circle cx="6" cy="16.5" r="1.4" />
    </>
  ),
  'forma-tri': (
    <>
      <path d="M12 5l8 14H4z" />
      <path d="M12 5v14" />
    </>
  ),
  'forma-spezzata': (
    <>
      <path d="M3.5 17l4.5-7 4.5 4L21 5" />
      <circle cx="3.5" cy="17" r="1.5" />
      <circle cx="8" cy="10" r="1.5" />
      <circle cx="12.5" cy="14" r="1.5" />
      <circle cx="21" cy="5" r="1.5" />
    </>
  ),
  'tondo-raggio': (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.3" />
      <path d="M12 12l5.7-5.7" />
    </>
  ),
  'tondo-tre-punti': (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="4" r="1.6" />
      <circle cx="18.9" cy="16" r="1.6" />
      <circle cx="5.1" cy="16" r="1.6" />
    </>
  ),
  'tondo-foro': (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
    </>
  ),
  'tondo-smusso': (
    <>
      <path d="M5 19V9l5-5h9" />
      <path d="M5 9h5V4" />
    </>
  ),
  'tondo-filetto': (
    <>
      <path d="M7 5v14M17 5v14" />
      <path d="M7 8h10M7 12h10M7 16h10" />
      <path d="M4 5h6M14 5h6" />
    </>
  ),
  'segno-linea': (
    <>
      <path d="M5 18L19 6" />
      <circle cx="5" cy="18" r="1.6" />
      <circle cx="19" cy="6" r="1.6" />
    </>
  ),
  'segno-riquadro': <rect x="4" y="6" width="16" height="12" rx="2.5" />,
  'segno-ovale': <ellipse cx="12" cy="12" rx="8.5" ry="5.5" />,
  'segno-poligono': <path d="M12 3.5l8.5 6.2-3.2 10H6.7l-3.2-10z" />,
  'segno-penna': (
    <>
      <path d="M3 20c1.5-.4 2.4-1.6 3.2-3" />
      <path d="M6.2 17l9.6-9.6 3.4 3.4L9.6 20.4z" />
      <path d="M17 6.2l1.6-1.6a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3L20.4 9.6z" />
    </>
  ),
  'nota-etichetta': (
    <>
      <path d="M11.5 3.5H20a.5.5 0 0 1 .5.5v8.5L11 22 2.5 13.5z" />
      <circle cx="17" cy="7" r="1.6" />
    </>
  ),
  'nota-testo': (
    <>
      <path d="M5 6V4.5h14V6" />
      <path d="M12 4.5v15" />
      <path d="M9 19.5h6" />
    </>
  ),
  'nota-freccia': (
    <>
      <path d="M4 20L20 4" />
      <path d="M13 4h7v7" />
    </>
  ),
  'nota-dettaglio': (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="M14.5 14.5L21 21" />
      <path d="M8 10h4M10 8v4" />
    </>
  ),
  'pianta': (
    <>
      <path d="M3.5 20V8l8.5-5 8.5 5v12z" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  'quote-comandano': (
    <>
      <path d="M3 6h18v5H3z" />
      <path d="M7 6v5M11 6v5M15 6v5" />
      <path d="M6 15h4M6 18.5h8" />
      <path d="M14.5 14l3 3 4-5" />
    </>
  ),
  'raddrizza': (
    <>
      <path d="M4 4v16h16" />
      <path d="M4 12h8v8" />
      <path d="M15 8l4-4 2 2-4 4z" />
    </>
  ),
  'muro-perimetro': (
    <>
      <path d="M4 19c-.6-4 .4-8 2.5-11 2-3 6-4 9-2.5s4.5 5.5 3.5 9c-.9 3-3.5 4.8-6.5 4.5" />
      <circle cx="4" cy="19" r="1.5" />
      <circle cx="12.5" cy="19" r="1.5" />
    </>
  ),
  'muro-ingombro': (
    <>
      <rect x="4" y="7" width="16" height="10" rx="1" />
      <path d="M4 17L20 7" />
      <path d="M4 12l5-5M9 17l11-7.5" />
    </>
  ),
  'muro-tondo': (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M6 16l10-8M8.5 18.5L19 11M5 11l6-5" />
    </>
  ),
  'muro-nome': (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M7.5 15v-6l3 4 3-4v6" />
      <path d="M16 15V9h1.5a2 2 0 0 1 0 4H16" />
    </>
  ),
  'muro-origine': (
    <>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  'dist-due-punti': (
    <>
      <circle cx="5" cy="17" r="2" />
      <circle cx="19" cy="7" r="2" />
      <path d="M6.7 15.5L17.3 8.5" />
      <path d="M8.6 14.9l-1.9 1.3.4 2.2M15.4 9.1l1.9-1.3-.4-2.2" />
    </>
  ),
  'dist-angolo': (
    <>
      <circle cx="5" cy="18" r="1.8" />
      <path d="M5 18h14M5 18L15 5" />
      <path d="M12.6 18a7.6 7.6 0 0 0-1.4-4.4" />
    </>
  ),
  'dist-uguale': (
    <>
      <path d="M3 8h8M3 16h8" />
      <path d="M3 6v4M11 6v4M3 14v4M11 14v4" />
      <path d="M15 10h6M15 14h6" />
    </>
  ),
  'dritto-90': (
    <>
      <path d="M5 4v15h15" />
      <path d="M5 13h6v6" />
      <path d="M13 4h7v7" />
      <path d="M20 4l-7 7" />
    </>
  ),
  'dritto-asse': (
    <>
      <path d="M4 18L15 6" />
      <path d="M4 18h16" />
      <path d="M12.5 4.5a7 7 0 0 1 3.5 6" strokeDasharray="2.5 2.5" />
      <path d="M17.5 9.5l-1.5 1.5-1.5-1.5" />
    </>
  ),
  'dritto-allinea': (
    <>
      <path d="M2.5 12h8M13.5 12h8" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M6 8.5v7M18 8.5v7" />
    </>
  ),
  'dritto-semplifica': (
    <>
      <path d="M3 16c2.5 0 3-5 5.5-5S11 15 13.5 15 16 8 21 8" />
      <path d="M3 20h18" strokeDasharray="2 3" />
    </>
  ),
  'dritto-ricostruisci': (
    <>
      <path d="M6 19V9h12v10" />
      <path d="M4 19h16" />
      <path d="M9 6.5h6" />
      <path d="M10.4 5.2L9 6.5l1.4 1.3M13.6 5.2L15 6.5l-1.4 1.3" />
    </>
  ),
  'dritto-elimina': (
    <>
      <path d="M4 18V7h16v11" />
      <path d="M4 18h16" strokeDasharray="2.5 2.5" />
      <path d="M9 20.5l6-5M9 15.5l6 5" />
    </>
  ),
  'porta-pianta': (
    <>
      <path d="M3.5 20V9l7-5 7 5" />
      <path d="M14 20v-7h6v7" />
      <path d="M16.5 16.5h3" />
      <path d="M9 20v-4h3" />
    </>
  ),
  'dist-distanza': (
    <>
      <circle cx="4.5" cy="12" r="2" />
      <circle cx="19.5" cy="12" r="2" />
      <path d="M7 12h10" />
      <path d="M12 8.5v7" />
    </>
  ),
  'dritto-unisci': (
    <>
      <path d="M3 12h7M14 12h7" />
      <path d="M10 9.5v5M14 9.5v5" />
      <path d="M11 6.5l1.5-1.5L14 6.5" />
    </>
  ),
  'dritto-sblocca': (
    <>
      <rect x="4.5" y="11" width="15" height="9.5" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 7.6-1.7" />
      <path d="M12 15v2.5" />
    </>
  ),
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
