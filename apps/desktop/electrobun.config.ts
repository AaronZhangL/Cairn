import type { ElectrobunConfig } from 'electrobun';

export default {
  app: { name: 'Cairn', identifier: 'dev.cairn.app', version: '0.0.1' },
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
    // `icons` is the default path, named here because it is generated:
    // scripts/make-iconset.py rebuilds it from icon.src.png.
    mac: { bundleCEF: false, icons: 'icon.iconset' },
  },
} satisfies ElectrobunConfig;
