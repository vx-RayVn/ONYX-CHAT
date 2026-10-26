import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { appLocation, publicPage } from './website/routes.js';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

function routeFrontend(req: IncomingMessage, _res: ServerResponse, next: () => void) {
  const url = new URL(req.url || '/', 'http://localhost');
  const fixture = ['ui-e2e', 'voice-e2e', 'gallery', 'local'].some(key => url.searchParams.has(key));
  if (appLocation(url) || fixture || url.searchParams.has('invite') || /^\/(?:invite\/|i\/)/.test(url.pathname) || /^\/[a-z0-9_-]{3,100}\/?$/i.test(url.pathname) && !publicPage(url.pathname)) req.url = '/app.html' + url.search;
  else { const page = publicPage(url.pathname); if (page && page !== 'home') req.url = '/' + page + '/index.html' + url.search; }
  next();
}

export default defineConfig({
  plugins: [react(), {
    name: 'onyx-public-pages',
    configureServer(server) {
      server.middlewares.use(routeFrontend);
    },
    configurePreviewServer(server) {
      server.middlewares.use(routeFrontend);
    },
  }],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1000,
    // Libraries in their own chunks (cached separately, keeps the app chunk under the limit).
    rolldownOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), app: resolve(import.meta.dirname, 'app.html') },
      output: {
        postBanner: '/*! Third-party license notices: /THIRD-PARTY-NOTICES.txt */',
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'krisp', test: /node_modules[\\/]@livekit[\\/]krisp-noise-filter[\\/]/ },
            { name: 'livekit', test: /node_modules[\\/](livekit-client|@livekit)[\\/](?!krisp-noise-filter[\\/])/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
