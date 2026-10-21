import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// MathJax (mathjax-full, P06-M3) resolves its own version in
// `js/components/version.js` with an EAGER `eval('require')` unless the
// bundler injects `PACKAGE_VERSION` — the guard
// `typeof PACKAGE_VERSION === 'undefined'` is the hook MathJax's own
// webpack build uses. Without the injection the browser bundle dies with
// "ReferenceError: require is not defined" at module load (white screen),
// because that module is reachable from `js/handlers/html.js`. Node-based
// verification suites never see this (native CJS), so it is fixed here for
// BOTH dev pre-bundling and the production build.
const mathjaxVersion = JSON.parse(
  readFileSync(new URL('./node_modules/mathjax-full/package.json', import.meta.url), 'utf8'),
).version;
const mathjaxDefine = { PACKAGE_VERSION: JSON.stringify(mathjaxVersion) };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: mathjaxDefine,
  optimizeDeps: {
    // `define` must also reach the esbuild pre-bundling of node_modules.
    esbuildOptions: { define: mathjaxDefine },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
