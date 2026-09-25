const WEB = new Set(['http:', 'https:']);

/** Only web pages leave for the browser: a cited page's `file:` or custom-scheme link must not launch anything. */
export function webUrl(value: string): string | undefined {
  if (!URL.canParse(value)) return undefined;
  const url = new URL(value);
  return WEB.has(url.protocol) ? url.href : undefined;
}
