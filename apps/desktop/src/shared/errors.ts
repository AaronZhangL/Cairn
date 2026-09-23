/**
 * Carrying a failure's identity across the RPC bridge.
 *
 * The bridge serializes a thrown value down to `error.message` and nothing
 * else, so a structured payload has to travel inside that one string. The
 * alternative — turning every typed response into a `{ ok, value | error }`
 * envelope — would touch all nine handlers and all nine call sites to solve the
 * same problem, and would still need a decoder on the far side.
 *
 * The tag is what makes it safe: anything without it is a message from some
 * other layer (or from a shell built before this existed) and is shown verbatim
 * rather than being mistaken for a code.
 */
import { type ErrorPayload, payloadOf } from '@cairn/core/errors';

const TAG = 'cairn-error:';

export function encodeError(cause: unknown): Error {
  const payload = payloadOf(cause);
  const encoded = new Error(`${TAG}${JSON.stringify(payload)}`);
  // Keep the original for the terminal; only `message` crosses the bridge
  encoded.stack = cause instanceof Error ? cause.stack : encoded.stack;
  return encoded;
}

/**
 * The payload a message carries, or an `unknown` payload holding the raw text.
 *
 * An empty message means the bridge itself failed rather than the handler —
 * usually a shell running a build from before the handler existed.
 */
export function decodeError(message: string): ErrorPayload {
  if (!message.startsWith(TAG)) {
    return message
      ? { code: 'unknown', params: {}, detail: message }
      : { code: 'main_silent', params: {} };
  }
  try {
    const parsed = JSON.parse(message.slice(TAG.length)) as Partial<ErrorPayload>;
    if (typeof parsed?.code !== 'string') return { code: 'unknown', params: {}, detail: message };
    return {
      code: parsed.code,
      params: (parsed.params ?? {}) as ErrorPayload['params'],
      ...(parsed.detail ? { detail: parsed.detail } : {}),
    };
  } catch {
    return { code: 'unknown', params: {}, detail: message };
  }
}

/**
 * Wrap every handler so whatever it throws leaves as an encoded payload.
 *
 * Done once around the whole object rather than per handler: a `try/catch` in
 * nine places is nine chances to forget the tenth.
 */
export function encodingErrors<T extends Record<string, (...args: never[]) => unknown>>(
  handlers: T,
): T {
  const wrapped = Object.entries(handlers).map(([name, fn]) => [
    name,
    async (...args: never[]): Promise<unknown> => {
      try {
        return await (fn as (...a: never[]) => unknown)(...args);
      } catch (cause) {
        throw encodeError(cause);
      }
    },
  ]);
  return Object.fromEntries(wrapped) as T;
}
