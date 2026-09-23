import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Gauntlet, SettingsProvider } from '@cairn/ui';
import { App } from './App';

/**
 * `?gauntlet` renders every slide layout at its worst instead of the app.
 *
 * Dev only, and dev only by construction as well as by flag: the packaged shell
 * loads a fixed URL, so there is nowhere to type a query string. Overflow is
 * the one defect in the slide layer that no test can catch, so it gets a place
 * to be looked at.
 */
const gauntlet = import.meta.env.DEV && new URLSearchParams(location.search).has('gauntlet');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Wraps the gauntlet too: it draws slides, and slides read the text scale. */}
    <SettingsProvider>
      {gauntlet ? <Gauntlet /> : <App />}
    </SettingsProvider>
  </StrictMode>,
);
