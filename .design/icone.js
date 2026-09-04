// Set di icone: 24×24, stroke currentColor 1.8, cap/join tondi — lo stile
// dell'app (src/components/Icona.tsx). NESSUNA uguale a un'altra.
const ICONE = {
  // --- fissi -------------------------------------------------------------
  seleziona: '<path d="M5 3l6 16 2.2-6.4L19.6 10z"/>',
  richiama: '<rect x="4" y="8" width="10" height="10" rx="2"/><path d="M9 5h7a4 4 0 0 1 4 4v6"/><path d="M17.5 12.5L20 15l2.2-2.5"/>',
  // --- scala -------------------------------------------------------------
  scalaVuota: '<rect x="2.5" y="8" width="19" height="8" rx="1.6"/><path d="M7 8v3M12 8v4M17 8v3"/>',
  scalaFatta: '<rect x="2.5" y="8" width="13" height="8" rx="1.6"/><path d="M6.5 8v3M11 8v4"/><path d="M17 13.5l2 2 3.5-4"/>',
  // --- gruppi FOTO -------------------------------------------------------
  gQuote: '<path d="M4 7v10M20 7v10"/><path d="M4 12h16"/><path d="M7 9.5L4.5 12 7 14.5M17 9.5L19.5 12 17 14.5"/>',
  gCatene: '<path d="M3 16h18"/><path d="M3 13v6M9 13v6M15 13v6M21 13v6"/><path d="M5 8.5h2.5M10.5 8.5h3M17 8.5h2.5"/>',
  gPezzi: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M4 9h3M17 9h3M4 15h3M17 15h3"/>',
  gTondi: '<circle cx="12" cy="12" r="7.5"/><path d="M4.5 12h15"/><path d="M9 9.5L6.5 12 9 14.5"/>',
  gSegni: '<path d="M4 20c3-1 4-4 6-7s4-5 7-4"/><path d="M14.5 4.5l4 4L9 18l-4.5.5L5 14z"/>',
  gNote: '<path d="M4 5h16v11H9l-4 3z"/><path d="M8 9.5h8M8 12.5h5"/>',
  // --- FOTO · Quote ------------------------------------------------------
  orizzontale: '<path d="M4 6v12M20 6v12"/><path d="M6.5 12h11"/><path d="M8.5 9.8L6.3 12l2.2 2.2M15.5 9.8l2.2 2.2-2.2 2.2"/>',
  verticale: '<path d="M6 4h12M6 20h12"/><path d="M12 6.5v11"/><path d="M9.8 8.5L12 6.3l2.2 2.2M9.8 15.5L12 17.7l2.2-2.2"/>',
  inclinata: '<path d="M3.5 8.5l3-3M17.5 18.5l3-3"/><path d="M6.5 17.5L17.5 6.5"/><path d="M6.6 14.4v3.2h3.2M17.4 9.6V6.4h-3.2"/>',
  angolo: '<path d="M5 19h15"/><path d="M5 19L17 5"/><path d="M13.5 19a8.5 8.5 0 0 0-2.1-5.6"/>',
  // --- FOTO · Catene -----------------------------------------------------
  inSerie: '<path d="M3 17h18"/><path d="M3 14v6M10 14v6M17 14v6"/><path d="M4.5 9h4M11.5 9h4"/><path d="M5.6 7.9L4.4 9l1.2 1.1M12.6 7.9L11.4 9l1.2 1.1"/>',
  daOrigine: '<path d="M4 4v16"/><path d="M4 8h6M4 13h11M4 18h16"/><path d="M8.6 6.9L9.8 8 8.6 9.1M13.6 11.9L14.8 13l-1.2 1.1M18.6 16.9L19.8 18l-1.2 1.1"/>',
  progressiva: '<path d="M4 19V6"/><path d="M4 19h16"/><path d="M9 19V9M14 19v-5M19 19v-8"/><circle cx="9" cy="7.5" r="1.2"/><circle cx="14" cy="12.5" r="1.2"/><circle cx="19" cy="9.5" r="1.2"/>',
  // --- FOTO · Pezzi ------------------------------------------------------
  riconosci: '<rect x="3" y="7" width="12" height="10" rx="1.5"/><path d="M18.5 4.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/><path d="M19 15.5v4M17 17.5h4"/>',
  rettangolo: '<rect x="3.5" y="7" width="17" height="10" rx="1"/><path d="M3.5 4.5h17"/><path d="M6 3.6v1.8M18 3.6v1.8"/>',
  quattroAngoli: '<path d="M4.5 6.5l15 2-2.5 9.5-11-1.5z"/><circle cx="4.5" cy="6.5" r="1.4"/><circle cx="19.5" cy="8.5" r="1.4"/><circle cx="17" cy="18" r="1.4"/><circle cx="6" cy="16.5" r="1.4"/>',
  triangolo: '<path d="M12 5l8 14H4z"/><path d="M12 5v14"/>',
  spezzata: '<path d="M3.5 17l4.5-7 4.5 4L21 5"/><circle cx="3.5" cy="17" r="1.5"/><circle cx="8" cy="10" r="1.5"/><circle cx="12.5" cy="14" r="1.5"/><circle cx="21" cy="5" r="1.5"/>',
  // --- FOTO · Tondi ------------------------------------------------------
  raggio: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.3"/><path d="M12 12l5.7-5.7"/>',
  cerchio3p: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="1.6"/><circle cx="18.9" cy="16" r="1.6"/><circle cx="5.1" cy="16" r="1.6"/>',
  foro: '<circle cx="12" cy="12" r="5.5"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21"/>',
  smusso: '<path d="M5 19V9l5-5h9"/><path d="M5 9h5V4"/>',
  // --- FOTO · Segni ------------------------------------------------------
  linea: '<path d="M5 18L19 6"/><circle cx="5" cy="18" r="1.6"/><circle cx="19" cy="6" r="1.6"/>',
  riquadro: '<rect x="4" y="6" width="16" height="12" rx="2.5"/>',
  ovale: '<ellipse cx="12" cy="12" rx="8.5" ry="5.5"/>',
  poligono: '<path d="M12 3.5l8.5 6.2-3.2 10H6.7l-3.2-10z"/>',
  penna: '<path d="M3 20c1.5-.4 2.4-1.6 3.2-3"/><path d="M6.2 17l9.6-9.6 3.4 3.4L9.6 20.4z"/><path d="M17 6.2l1.6-1.6a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3L20.4 9.6z"/>',
  // --- FOTO · Note -------------------------------------------------------
  etichetta: '<path d="M11.5 3.5H20a.5.5 0 0 1 .5.5v8.5L11 22 2.5 13.5z"/><circle cx="17" cy="7" r="1.6"/>',
  testo: '<path d="M5 6V4.5h14V6"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>',
  freccia: '<path d="M4 20L20 4"/><path d="M13 4h7v7"/>',
  dettaglio: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21"/><path d="M8 10h4M10 8v4"/>',
  // --- gruppi PIANTA -----------------------------------------------------
  gTraccia: '<path d="M3.5 20V8l8.5-5 8.5 5v12z"/><path d="M9 20v-6h6v6"/>',
  gDetta: '<path d="M3 6h18v5H3z"/><path d="M7 6v5M11 6v5M15 6v5"/><path d="M6 15h4M6 18.5h8"/><path d="M14.5 14l3 3 4-5"/>',
  gRaddrizza: '<path d="M4 4v16h16"/><path d="M4 12h8v8"/><path d="M15 8l4-4 2 2-4 4z"/>',
  // --- PIANTA · Traccia --------------------------------------------------
  perimetro: '<path d="M4 19c-.6-4 .4-8 2.5-11 2-3 6-4 9-2.5s4.5 5.5 3.5 9c-.9 3-3.5 4.8-6.5 4.5"/><circle cx="4" cy="19" r="1.5"/><circle cx="12.5" cy="19" r="1.5"/>',
  ingombroRett: '<rect x="4" y="7" width="16" height="10" rx="1"/><path d="M4 17L20 7"/><path d="M4 12l5-5M9 17l11-7.5"/>',
  ingombroCerchio: '<circle cx="12" cy="12" r="7.5"/><path d="M6 16l10-8M8.5 18.5L19 11M5 11l6-5"/>',
  nomeStanza: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 15v-6l3 4 3-4v6"/><path d="M16 15V9h1.5a2 2 0 0 1 0 4H16"/>',
  origine: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="1"/>',
  // --- PIANTA · Detta misure ---------------------------------------------
  quotaDuePunti: '<circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/><path d="M6.7 15.5L17.3 8.5"/><path d="M8.6 14.9l-1.9 1.3.4 2.2M15.4 9.1l1.9-1.3-.4-2.2"/>',
  angoloVertice: '<circle cx="5" cy="18" r="1.8"/><path d="M5 18h14M5 18L15 5"/><path d="M12.6 18a7.6 7.6 0 0 0-1.4-4.4"/>',
  stessaMisura: '<path d="M3 8h8M3 16h8"/><path d="M3 6v4M11 6v4M3 14v4M11 14v4"/><path d="M15 10h6M15 14h6"/>',
  // --- PIANTA · Raddrizza ------------------------------------------------
  ortogonale: '<path d="M5 4v15h15"/><path d="M5 13h6v6"/><path d="M13 4h7v7"/><path d="M20 4l-7 7"/>',
  mettiDritto: '<path d="M4 18L15 6"/><path d="M4 18h16"/><path d="M12.5 4.5a7 7 0 0 1 3.5 6" stroke-dasharray="2.5 2.5"/><path d="M17.5 9.5l-1.5 1.5-1.5-1.5"/>',
  allinea: '<path d="M2.5 12h8M13.5 12h8"/><circle cx="12" cy="12" r="1.6"/><path d="M6 8.5v7M18 8.5v7"/>',
  semplifica: '<path d="M3 16c2.5 0 3-5 5.5-5S11 15 13.5 15 16 8 21 8"/><path d="M3 20h18" stroke-dasharray="2 3"/>',
  ricostruisci: '<path d="M6 19V9h12v10"/><path d="M4 19h16"/><path d="M9 6.5h6"/><path d="M10.4 5.2L9 6.5l1.4 1.3M13.6 5.2L15 6.5l-1.4 1.3"/>',
  eliminaLato: '<path d="M4 18V7h16v11"/><path d="M4 18h16" stroke-dasharray="2.5 2.5"/><path d="M9 20.5l6-5M9 15.5l6 5"/>',
  sblocca: '<rect x="4.5" y="11" width="15" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/><path d="M12 15v2.5"/>'
};
