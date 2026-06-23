import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@abycloud-co-uk/van-der-view/browser', replacement: fileURLToPath(new URL('../../src/browser.ts', import.meta.url)) },
      { find: '@abycloud-co-uk/van-der-view', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    ],
  },
});
