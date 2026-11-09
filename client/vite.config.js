import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// W dev podmieniamy znaczniki z index.html na domyślne wartości.
// W prod robi to serwer per ścieżka (server/src/seo.js), więc build zostawia znaczniki.
const devSeo = {
  name: 'dev-seo-placeholders',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html
      .replaceAll('__TITLE__', 'Gwiazdka — świąteczne losowanie prezentów online')
      .replaceAll('__DESCRIPTION__', 'Darmowe losowanie prezentów na Wigilię (dev).')
      .replaceAll('__ROBOTS__', 'noindex')
      .replaceAll('__URL__', 'http://localhost:5173/')
      .replaceAll('__ORIGIN__', 'http://localhost:5173'),
};

export default defineConfig({
  plugins: [react(), devSeo],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:3000',
    },
    watch: { usePolling: Boolean(process.env.CHOKIDAR_USEPOLLING) },
  },
});
