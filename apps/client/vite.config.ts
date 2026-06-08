import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite 8 hardcodes `crossorigin` on script/link tags.
 * This breaks resource loading in Tauri's `tauri://localhost` webview
 * due to CORS restrictions. Remove this plugin when Vite provides a
 * config option to disable the attribute.
 */
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html: string) {
      return html.replace(/(\s+)crossorigin(="[^"]*")?/g, '$1');
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  resolve: {
    alias: {
      '@ymir/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
