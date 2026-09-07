import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, /api se redirige al backend local (puerto 5007).
// En build, los archivos salen a client/dist y nginx los sirve.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5007',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
