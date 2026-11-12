import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import selectorParser from 'postcss-selector-parser';
import { defineConfig } from 'vite';
import { CSS_TARGET, flattenScope } from './flatten-scope.mjs';

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// The workbench in apps/preview serves the app; `@/` imports reach the skin in src/.
export default defineConfig({
  root: path('./apps/preview'),
  // Relative URLs, so the build works at a domain root or in a subfolder such as GitHub Pages.
  base: './',
  plugins: [tailwindcss(), react()],
  css: { postcss: { plugins: [flattenScope(selectorParser)] } },
  resolve: {
    alias: {
      '@preview': path('./apps/preview/src'),
      '@': path('./src'),
    },
  },
  // Prebundle for dev so the first fullscreen import doesn't reload the workbench.
  optimizeDeps: { include: ['three'] },
  server: {
    fs: { allow: [path('.'), path('../data/clips')] },
  },
  build: {
    cssTarget: CSS_TARGET,
    outDir: path('./dist'),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        workbench: path('./apps/preview/index.html'),
        preview: path('./apps/preview/preview.html'),
        sheet: path('./apps/preview/sheet.html'),
      },
    },
  },
});
