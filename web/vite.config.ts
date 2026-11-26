import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const singlefile = !!process.env.VITE_SINGLEFILE;

export default defineConfig({
  plugins: [react(), ...(singlefile ? [viteSingleFile()] : [])],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/computer-apps': 'http://localhost:8787',
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
