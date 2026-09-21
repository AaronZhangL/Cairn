export default {
  scripts: {
    install: ['hutch', 'install', '--frozen-lockfile'],
    // `prepare` projects the Electrobun SDK into .hutch/devkit; nothing resolves without it
    start: 'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev',
    dev: 'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch',
    hmr: 'hutch electrobun prepare && hutch pm exec -- vite --port 5173',
    build: 'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable',
  },
  electrobun: { version: '2.0.1' },
};
