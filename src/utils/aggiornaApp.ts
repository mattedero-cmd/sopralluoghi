/**
 * AGGIORNAMENTO FORZATO DELL'APP.
 *
 * L'app è una PWA: per funzionare in cantiere senza rete tiene in cache tutto
 * quello che serve ad avviarsi. Il rovescio è che una versione nuova può non
 * arrivare subito — un'app installata sul telefono e mai chiusa davvero
 * continua a servire quella vecchia, e chi la usa non ha modo di accorgersene
 * se non dalla data di build.
 *
 * Qui c'è la via d'uscita: si buttano il service worker e le sue cache e si
 * ricarica dalla rete. I DATI NON SI TOCCANO: vivono in IndexedDB, che non
 * c'entra niente con la cache degli asset.
 */

/**
 * Toglie di mezzo il service worker e le cache degli asset.
 *
 * Non lancia mai: un browser senza service worker (o in modalità privata) non
 * è un errore, è solo un browser che non ha niente da svuotare. Quello che
 * conta è che dopo si possa ricaricare.
 */
export async function svuotaCacheApp(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrazioni = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrazioni.map((r) => r.unregister()));
    }
  } catch {
    // niente service worker da togliere: si prosegue
  }
  try {
    if (typeof caches !== 'undefined') {
      const nomi = await caches.keys();
      await Promise.all(nomi.map((n) => caches.delete(n)));
    }
  } catch {
    // cache non accessibili: si prosegue lo stesso, il reload proverà la rete
  }
}

/** svuota e ricarica: alla riapertura l'app si riprende dalla rete */
export async function aggiornaApp(): Promise<void> {
  await svuotaCacheApp();
  // `reload` da solo può ripescare l'index dalla memoria del browser: un
  // indirizzo con un marcatore diverso obbliga a ripartire davvero
  const url = new URL(window.location.href);
  url.searchParams.set('aggiornata', String(Date.now()));
  window.location.replace(url.toString());
}
