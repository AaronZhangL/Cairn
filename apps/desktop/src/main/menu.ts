import { ApplicationMenu } from 'electrobun/main';
import type { UiLocale } from '../shared/settings';
import { menuTemplate, type MenuOptions } from './menu-template';

export { OPEN_INSPECTOR, OPEN_SETTINGS, type MenuOptions } from './menu-template';

/**
 * Re-callable: switching the interface language rebuilds the menu in place,
 * rather than waiting for the next launch.
 */
export function installMenu(locale: UiLocale = 'en', options: MenuOptions = {}): void {
  ApplicationMenu.setApplicationMenu(menuTemplate(locale, options, process.platform));
}
