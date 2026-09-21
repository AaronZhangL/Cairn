/** LLM provider abstraction. Backed by the local codex CLI; any OpenAI-compatible endpoint slots in here. */

export interface LlmRequest {
  readonly prompt: string;
  readonly system?: string;
  /** When present, the response must conform to this JSON Schema. */
  readonly schema?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export interface LlmProvider {
  readonly name: string;
  /** Suggested concurrency. A subprocess provider tolerates far less than an HTTP one. */
  readonly suggestedConcurrency: number;
  /** Fixed per-call overhead in tokens, used to estimate cost. */
  readonly overheadTokens: number;
  complete(request: LlmRequest): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'aborted' | 'bad_output' | 'provider_failed',
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Parse the provider's JSON, carrying a snippet on failure so a bad prompt is findable. */
export function parseJsonOutput<T>(raw: string): T {
  const text = raw.trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    // The model occasionally wraps the object in a ```json fence
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as T;
      } catch { /* 落到下方统一报错 */ }
    }
    throw new LlmError('模型输出不是合法 JSON', 'bad_output', text.slice(0, 300));
  }
}
