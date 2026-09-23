import type { Locale } from './locale';
import { en, type Messages } from './messages/en';
import { zh } from './messages/zh';

const DICTIONARIES: Readonly<Record<Locale, Messages>> = { en, zh };

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}

export type { Messages };
export {
  DEFAULT_LOCALE, detectLocale, format, isLocale, LOCALES, parseLocale, type Locale,
} from './locale';
