/** Field-level reading of a model's slide output, shared by every layout's normaliser. */
import { type FitField, overBudget } from '../fit';

export const str = { type: 'string' } as const;
export const nullableStr = { type: ['string', 'null'] } as const;
export const strList = { type: 'array', items: str } as const;
export const nullableInt = { type: ['integer', 'null'] } as const;

/**
 * OpenAI structured output requires `required` to list every key in `properties`,
 * so a single wide object with per-layout optional fields is rejected. Each layout
 * is its own complete variant instead, and genuinely optional fields are declared
 * nullable rather than omitted.
 */
export const variant = (
  layout: string,
  props: Record<string, unknown>,
): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  required: ['layout', 'atSentence', ...Object.keys(props)],
  properties: {
    layout: { type: 'string', enum: [layout] },
    atSentence: { type: 'integer' },
    ...props,
  },
});

export const asText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];

/** The text, or '' when no size would fit it — which reads as missing downstream. */
export const fitted = (v: unknown, field: FitField): string => {
  const value = asText(v);
  return value && !overBudget(value, field) ? value : '';
};

/** All or nothing: dropping one item of three quietly changes what was claimed. */
export const anyOverBudget = (texts: readonly string[], field: FitField): boolean =>
  texts.some((text) => overBudget(text, field));

export const opt = (key: string, item: Record<string, unknown>, field: FitField): Record<string, string> => {
  const value = fitted(item[key], field);
  return value ? { [key]: value } : {};
};

/** A focus that points at no item is dropped rather than clamped onto the wrong one. */
export const focusOf = (value: unknown, count: number): { focus?: number } =>
  (Number.isInteger(value) && (value as number) >= 0 && (value as number) < count
    ? { focus: value as number }
    : {});

/** Heading, and the margin note every diagram layout may carry. */
export const extras = (item: Record<string, unknown>): Record<string, string> => ({
  ...opt('heading', item, 'heading'),
  ...opt('aside', item, 'aside'),
});
