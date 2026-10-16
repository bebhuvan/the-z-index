import { defineConfig } from 'astro/config';

// SITE and BASE_PATH are set by the GitHub Pages workflow (actions/configure-pages).
// Locally they default to the root.
export default defineConfig({
  site: process.env.SITE || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  // CSS is ~10 KB: inlining it removes the only render-blocking request.
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
});
