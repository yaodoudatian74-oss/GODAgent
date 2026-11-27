import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const singlefile = !!process.env.VITE_SINGLEFILE;

export default defineConfig({
  plugins: [
    react(),
    ...(singlefile ? [
      viteSingleFile(),
      // Keep the 21 MB ONNX Runtime .wasm as a sibling file (the APK ships it);
      // inlining it would blow past artifact size limits.
      { name: 'keep-wasm-external', enforce: 'post' as const, config: (c: any) => { c.build = c.build || {}; c.build.assetsInlineLimit = (f: string) => !f.endsWith('.wasm'); } },
      // A bundled library contains a literal U+FFFD inside a JS string; write it as
      // the equivalent escape so the single HTML file is clean UTF-8 text.
      { name: 'escape-replacement-char', enforce: 'post' as const,
        generateBundle: { order: 'post' as const, handler(_o: any, bundle: any) {
          for (const f of Object.values(bundle) as any[]) if (f.type === 'asset' && f.fileName.endsWith('.html') && typeof f.source === 'string') f.source = f.source.split('\uFFFD').join('\\uFFFD');
        } } },
    ] : []),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/computer-apps': 'http://localhost:8787',
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
