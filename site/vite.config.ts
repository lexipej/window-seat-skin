import { fileURLToPath, URL } from 'node:url';

import selectorParser from 'postcss-selector-parser';
import { defineConfig } from 'vite';
import { CSS_TARGET, flattenScope } from '../skin/flatten-scope.mjs';

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// `@skin/` reaches the skin in ../skin/src, so the site and the workbench share one skin.
export default defineConfig({
  base: './',
  css: { postcss: { plugins: [flattenScope(selectorParser)] } },
  build: { cssTarget: CSS_TARGET },
  // Orbit data, chapters and captions for each pass are served as static files.
  publicDir: path('../data/clips'),
  resolve: {
    // One copy of three and Video.js for the page and the skin.
    dedupe: ['three', '@videojs/html', '@videojs/mux-video'],
    alias: {
      '@skin': path('../skin/src'),
      // The skin's own `@/` imports resolve against its source folder too.
      '@': path('../skin/src'),
    },
  },
  server: {
    fs: { allow: [path('..')] },
  },
});
