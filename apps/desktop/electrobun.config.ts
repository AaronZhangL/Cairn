import type { ElectrobunConfig } from 'electrobun';

export default {
  app: { name: 'Vibe Reading', identifier: 'reading.vibe.dev', version: '0.0.1' },
  build: {
    mainProcess: 'cottontail',
    cottontail: { entrypoint: 'src/main/index.ts' },
    // Vite builds the renderer; the generated bundle ships beside it
    copy: {
      'dist/index.html': 'views/mainview/index.html',
      'dist/assets': 'views/mainview/assets',
      'public': 'views/mainview',
    },
    watchIgnore: ['dist/**'],
    mac: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
