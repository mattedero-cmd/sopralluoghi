import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { inizializzaStorage } from './db/repository';
import { mostraToast } from './state/toast';
import './styles.css';

// Service worker: app shell in cache, funzionamento 100% offline.
// Gli aggiornamenti vengono proposti, mai imposti a metà lavoro.
const aggiorna = registerSW({
  onNeedRefresh() {
    if (window.confirm('È disponibile una nuova versione dell’app. Aggiornare adesso?')) {
      void aggiorna(true);
    }
  },
  onOfflineReady() {
    mostraToast('successo', 'App pronta per l’uso offline.');
  }
});

void inizializzaStorage();

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
