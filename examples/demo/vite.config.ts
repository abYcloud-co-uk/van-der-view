import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Order matters — Vite matches aliases by prefix, so the "/browser" subpath MUST
    // stay above the bare package name; reversed, "/browser" would resolve to
    // src/index.ts and break the demo. (Same longest-match-first rule as tsconfig paths.)
    alias: [
      { find: '@abycloud-co-uk/van-der-view/browser', replacement: fileURLToPath(new URL('../../src/browser.ts', import.meta.url)) },
      { find: '@abycloud-co-uk/van-der-view', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    ],
  },
});
