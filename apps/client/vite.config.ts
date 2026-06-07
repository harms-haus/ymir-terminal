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

/**
 * Strips @__PURE__ annotations from CodeMirror packages so Rolldown
 * won't tree-shake their style-injection side effects. More targeted
 * than globally disabling annotation-based tree-shaking.
 *
 * CodeMirror's StyleModule constructors use @__PURE__ annotations which,
 * combined with "sideEffects": false in @codemirror/* package.json files,
 * causes Rolldown to remove the runtime style-injection code.
 *
 * Remove this plugin if Rolldown adds per-package annotation control
 * or CodeMirror removes @__PURE__ from StyleModule.
 */
function stripCodemirrorPureAnnotations(): Plugin {
  return {
    name: 'strip-codemirror-pure-annotations',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/node_modules\/(@codemirror|codemirror|style-mod)\//.test(id)) return null;
      if (!code.includes('@__PURE__')) return null;
      return code.replace(/\/\*[@#__]*PURE__\*\//g, '');
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin(), stripCodemirrorPureAnnotations()],
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
