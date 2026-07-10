import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages subpath.
  base: './',
  build: {
    chunkSizeWarningLimit: 1600,
    // Phaser's SVG loader needs real URLs, not inlined data: URIs.
    assetsInlineLimit: 0,
  },
});
