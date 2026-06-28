import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { avviaPianificatoreSync } from './cloud/sincronizzazione';
import { inizializzaStorage } from './db/repository';
import { mostraToast } from './state/toast';
import './styles.css';

// Service worker: app shell in cache, funzionamento 100% offline.
// Aggiornamento automatico alla prima apertura con rete disponibile:
// i dati vivono in IndexedDB, il refresh non tocca mai il lavoro.
registerSW({
  immediate: true,
  onOfflineReady() {
    mostraToast('successo', 'App pronta per l’uso offline.');
  }
});

void inizializzaStorage();

// Sincronizzazione notturna tra dispositivi (se configurata e abilitata).
avviaPianificatoreSync();

/**
 * Se un modulo caricato "su richiesta" (es. il motore PDF) non si trova,
 * di solito è perché l'app è stata aggiornata e il service worker ha
 * sostituito gli asset con nuovi hash: gli URL vecchi non esistono più.
 * Invece di mostrare "Importing a module script failed", si ricarica una
 * volta sola per prendere la versione nuova.
 */
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  const ora = Date.now();
  const ultimo = Number(sessionStorage.getItem('ricaricaChunk') || 0);
  if (ora - ultimo < 15000) return; // già ricaricato di recente: evita il loop
  sessionStorage.setItem('ricaricaChunk', String(ora));
  window.location.reload();
});

// Nessun errore silenzioso: anche gli imprevisti non gestiti vengono mostrati
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  mostraToast('errore', 'Errore imprevisto. Se il problema persiste, esegui un backup e ricarica.');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
