import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // aggiornamento automatico: sul campo nessuno deve gestire gli update;
      // la nuova versione si attiva da sola alla prima apertura con rete
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Sopralluoghi — Quotatura foto e report',
        short_name: 'Sopralluoghi',
        description:
          'Strumento professionale per sopralluoghi tecnici: quotatura su foto, note e report PDF. Funziona offline.',
        lang: 'it',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#10141a',
        theme_color: '#10141a',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // `bin` e `json`: pesi del modello per il rilevamento dei volti, che
        // deve funzionare anche in cantiere senza rete
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,bin,json}'],
        // pdfmake con i font incorporati supera il limite predefinito di 2 MiB
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
  define: {
    // data di build visibile nelle Impostazioni: permette di verificare
    // quale versione sta effettivamente girando sul dispositivo
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' '))
  },
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts'],
          konva: ['konva', 'react-konva'],
          // rilevatore di volti: caricato solo quando serve (import dinamico),
          // così non pesa sull'avvio dell'app
          volti: ['@vladmandic/face-api']
        }
      }
    }
  },
  test: {
    environment: 'node'
  }
});
