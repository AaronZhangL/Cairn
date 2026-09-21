import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { electrobunViteAliases } from './.hutch/devkit/api/config/electrobun-vite';

const here = import.meta.dirname;

export default defineConfig({
  // Assets must be referenced relatively: the packaged app loads index.html over
  // the views:// scheme, where a leading slash resolves outside the bundle.
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      // The npm `electrobun` package is only a bootstrap and throws on import.
      // The real SDK is the devkit Hutch projects into .hutch/devkit.
      ...electrobunViteAliases(resolve(here, '.hutch/devkit')),
      { find: '@vibe/ui', replacement: resolve(here, '../../packages/ui/src') },
      { find: /^@vibe\/core\/(.*)$/, replacement: resolve(here, '../../packages/core/src') + '/$1' },
    ],
  },
  server: { port: 5173, strictPort: true },
});
