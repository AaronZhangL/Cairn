import type { ErrorPayload } from '@cairn/core/errors';
import type { Messages } from './messages/en';

type Entry = Messages['errors'][keyof Messages['errors']];

/** Codes whose sentence cannot say what happened: a model call fails for a vendor's own reasons. */
const TAIL_SAYS_WHY: ReadonlySet<ErrorPayload['code']> = new Set(['unknown', 'llm_failed']);

/**
 * The sentence for a failure, in the reader's language.
 *
 * The only place a code becomes words. A code this build does not know falls
 * back to the generic sentence rather than rendering the code itself — an older
 * shell talking to a newer player is a real combination, and `cairn-error:{…}`
 * on screen would be worse than "something went wrong".
 */
export function errorText(payload: ErrorPayload, t: Messages): string {
  const entry: Entry | undefined = t.errors[payload.code as keyof Messages['errors']];
  const base = entry === undefined
    ? t.errors.unknown
    : typeof entry === 'function'
      ? (entry as (p: ErrorPayload['params']) => string)(payload.params)
      : entry;

  // The tail is a stderr snippet or an exit code — never translated, and only
  // worth showing when the sentence above it cannot say what actually happened.
  return payload.detail && (TAIL_SAYS_WHY.has(payload.code) || entry === undefined)
    ? `${base}\n${payload.detail}`
    : base;
}
