# Settings overhaul

Status: **done**, 2026-09-24. Kept as the record of why, not as a to-do list.

Where the work diverged from this plan:

- **Search settings were left alone.** They had just been reshaped
  (`brave | firecrawl | tavily`, one key field each) and worked; folding them into a
  `searchKeys` record would have been churn for no behavioural gain. Only the rename and the
  trace move happened.
- **`openai-codex` is not a provider.** Borrowing the `~/.codex` login stays a fallback inside
  `companion/model.ts`, not an entry in a list the reader picks from.
- **The engine row was removed in step 1, not step 5.** Leaving it would have left the panel
  telling the reader to `pip install edge-tts`, which had stopped being true.
- **Default models are hand-picked.** The catalog lists models but does not rank them, and its
  first constrained entry alphabetically is `gpt-4`. `providers.test.ts` fails if an upgrade
  retires one of the picks.
- **`cuesFromBoundaries` merges to sentence level.** Slicing from the original text was not
  enough on its own: `alignSentences` takes the cue holding a sentence's *midpoint*, so
  word-level cues timed every sentence late. Both constraints are in the function's comment.
- **A test preload was added.** `apps/desktop/tests/setup.ts` points the whole run at a
  throwaway library. Two test files had been setting `CAIRN_DATA_DIR` themselves and only worked
  while they happened to load `store.ts` first — otherwise the suite read and wrote the owner's
  real books.
- **Not done, deliberately:** `runtime/http-llm.ts` and `runtime/chatgpt-codex.ts` are no longer
  constructed by anything. Deleting them is its own commit.

## Why

Five things in the settings panel are implementation details wearing the costume of
preferences:

1. **The edge-tts engine row** (`packages/ui/src/settings/pages.tsx:309-322`) shows the reader
   the install path of a Python CLI. It cannot be bundled, and the planned iPhone player is
   sandboxed, so a subprocess is not a future either.
2. **Default budget** (`pages.tsx:325-334`) is chosen when a book is added. Here it is a second
   source of truth.
3. **Default speed** (`pages.tsx:102-109`) likewise, and worse — the player already has a rate
   menu.
4. **The models page** is a `codex | key` toggle plus three bare inputs. There is no provider
   concept, so adding a vendor means editing code.
5. **"Network and keys"** bundles two unrelated things under one name.

Goal: the panel keeps only what is genuinely a global preference; the models and search pages
take the shape llm-space gives them.

## Decisions

- Replace the `edge-tts` CLI with a **native TS client**, removing the Python dependency and
  that settings row outright.
- Adopt **llm-space's architecture**: generation moves onto pi-ai and shares one provider
  registry with the companion. The UI goes as far as "provider sidebar + presets + model
  picker" — no custom-model editor, no headers editor.
- **Keep `prefs.rate`** as the player's memory (written by its own rate menu); delete only the
  settings row. **Delete `defaultBudget`** from `settings.json`.
- **Move the trace switch** to the Data page.

## Constrained sampling: what was measured

`http-llm.ts` sends `response_format: { type: 'json_schema', strict: true }`. That is the
OpenAI Chat Completions wire format — it constrains the *endpoint*, not the model. Any service
speaking that protocol works, gateways included, so "Anthropic is unreachable for generation"
was wrong: through a gateway it is reachable. Only the native Anthropic and Google endpoints
are not.

Whether a given endpoint honours `response_format.json_schema.strict` has never been verified
here. pi-ai's generated catalog records exactly this, per model. One caveat worth stating: the
flag documents `strict` **in tool definitions**, which is a different field from the one in
`response_format`. So the table is precise for the pi-ai path and a strong proxy for the
http-llm path.

That asymmetry is the main reason to adopt pi-ai: **"only offer models with a hard constraint"
can only be honoured precisely on the pi-ai path.**

Measured distribution in 0.87.1, counting both `compat.supportsStrictMode` (OpenAI-shaped) and
`compat.supportsStrictTools` (Anthropic):

| Coverage | Providers |
| --- | --- |
| Every model | openai 41/41, anthropic 15/15, groq 7/7, deepseek 2/2, zai, qwen, xiaomi, huggingface, baseten, cloudflare-workers-ai |
| Some models | openrouter 371/386, amazon-bedrock 80/165, fireworks 10/33, github-copilot 6/32 |
| No model | moonshotai 0/4, minimax 0/3, xai 0/4, together 0/22, google 0/22, mistral 0/33, nvidia 0/19, vercel-ai-gateway 0/246, cerebras 0/2 |

moonshotai, minimax and xai are in today's chat-model options, so the migration exposes an
existing fact rather than creating a problem.

## What pi-ai does not cost

Verified by reading the API, not assumed:

- **No stream folding.** `Models.completeSimple(model, context, options)` returns
  `Promise<AssistantMessage>` (`dist/models.d.ts:143`) and `options.signal` is native
  (`dist/types.d.ts:58`).
- **Forcing the tool call is possible.** `ToolChoice` is typed `'auto' | 'none'`, but every
  adapter supports a forcing mode; only the literal differs. See the table in step 3.
- **No credential store needed.** An explicit `options.apiKey` short-circuits resolution
  (`auth/resolve.js:33`); omitting it falls back to ambient environment variables
  (`resolve.js:51-54`), which is exactly the "empty means read the environment" semantics.
- **Our hand-written JSON Schema passes through.** `Tool.parameters` is typed as TypeBox's
  `TSchema`, but no adapter validates it — `validateToolCall` / `validateToolArguments` are
  opt-in helpers nothing calls. One `as` suffices.
- **Test doubles ship with it.** `fauxProvider()` / `fauxToolCall()` / `fauxAssistantMessage()`.

## What pi-ai does cost

1. **Failure does not throw.** `completeSimple` is `streamSimple(...).result()`, and the stream
   resolves the error *as a value* (`utils/event-stream.js:88-90`). Handled in step 3; getting
   it wrong is a silent bug.
2. **pi-ai retries internally.** `maxRetryDelayMs` defaults to 60s and would compound with
   `runJob`'s backoff. Turn it off.
3. **`overheadTokens` / `suggestedConcurrency` accuracy.** These drive the map batch size and
   scheduler concurrency (invariants 5 and 6). Derive from the catalog; fall back to
   `http-llm.ts`'s measured `400 / 4`.
4. **Placement.** A pi-ai-backed implementation belongs in `apps/desktop/src/main/`, since
   `packages/core` must not depend on it. `scripts/add-book.ts` and `scripts/replay.ts:58`
   follow.
5. **Dependency blast radius.** `apps/desktop/package.json:13-14` pins pi-ai at `0.87.1`.
   Today a break costs the companion pane; afterwards it costs whether a book can be built at
   all. Keep the pin, upgrade in its own commit, and run a real book before accepting one.
6. **Debugging gets deeper.** Four layers (Models → Provider → adapter → compat) instead of one
   readable `fetch`.

Residual uncertainty after filtering out `strict = false` models is **the same as today's**:
truncation at `max_tokens` (which `response_format` suffers equally). pi-ai does not make the
output less certain; it makes the existing uncertainty visible and filterable.

---

## Step 1 — Native TS narrator, drop the edge-tts CLI

Use `edge-tts-universal` (npm 1.4.0; pure TS over WebSocket, no Python, no key). It exposes
`Communicate.stream()`, yielding
`{ type: 'audio' | 'WordBoundary' | 'SentenceBoundary', data, offset, duration, text }`.

- Add `packages/core/src/runtime/edge-tts-ws.ts` exporting `edgeTtsNarrator()`, `synthesize()`
  and `speakSample()`. Fold WordBoundary `offset`/`duration` (100ns units) straight into
  `SrtCue[]` — **no SRT text in between**.
- **Unchanged**: the `Narrator` interface, `alignSentences()`, `assembleDeck()` and
  `CHARS_PER_SECOND` in `pipeline/tts.ts`.
- **Verify, do not assume**: `alignSentences` locates each sentence by cumulative character
  offset across cue text. Word-level cues omit whitespace and punctuation, so the concatenated
  length may no longer match the sentences. Write the word-level-cue test first; if alignment
  breaks, merge boundaries into sentence-level cues before handing them over.
- Delete `packages/core/src/runtime/edge-tts.ts` including `candidateDirs()`, `findEdgeTts()`,
  `forgetEdgeTts()` and `ensureEdgeTts()`.
- `ensureReady()` stays on `Narrator` but becomes a light reachability probe. The reason for
  checking before the first model call still holds: synthesis runs last.
- Drop `CAIRN_EDGE_TTS`; repurpose `errors.ts`'s `tts_missing` to mean "narration service
  unreachable". Update the AGENTS.md environment table.
- The dependency imports `node:*` and `ws`, so it stays in `runtime/` and the webview must not
  reach it. Only `cd apps/desktop && bun run build` catches a leak.

Call sites: `main/rpc.ts` `engineStatus` / `previewVoice`, and `scripts/add-book.ts:19`.

## Step 2 — One provider registry (settings schema)

In `apps/desktop/src/shared/settings.ts` (shared, no `node:*`, no React).

```
ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'moonshotai' | 'minimax'
           | 'minimax-cn' | 'google' | 'xai' | 'groq' | 'openrouter'
           | 'openai-codex' | 'custom'
SearchProviderId = 'keenable' | 'tavily'
```

Provider ids are pi-ai's own, so `models.setProvider()` needs no mapping table.

```ts
interface ProviderProfile {
  readonly apiKey: string;   // '' means read the environment
  readonly baseUrl: string;  // '' means the catalog default
  readonly model: string;    // '' means the catalog default
}

interface ShellSettingsValues {
  readonly providers: Readonly<Partial<Record<ProviderId, ProviderProfile>>>;
  readonly generationProvider: ProviderId;
  readonly chatProvider: ProviderId | 'inherit';
  readonly narration: NarrationLanguage;
  readonly voices: Readonly<Record<ContentLocale, string>>;
  readonly searchProvider: SearchProviderId;
  readonly searchKeys: Readonly<Partial<Record<SearchProviderId, string>>>;
  readonly trace: boolean;
}
```

**The preset table is imported, not written.** `@earendil-works/pi-ai/providers/<id>.models`
exports a `Record<modelId, Model>` carrying `id` `name` `api` `provider` `baseUrl` `cost`
`contextWindow` `maxTokens` `compat`. It is plain data; no pi-ai runtime is needed to read it.
Only two presentation fields are ours:

```ts
interface ProviderChrome {
  readonly id: ProviderId;
  readonly getKeyUrl: string;
  readonly faviconDomain: string;
}
```

Hard-constraint capability comes from `compat.supportsStrictMode || compat.supportsStrictTools`
— **both names, or Anthropic reads as unsupported.**

**Migration** goes in `parseSettings()` (`:141-190`), which already re-validates on-disk JSON:

- `model.source === 'key'` → `providers.openai`, or `providers.custom` when `baseUrl` is set.
- `model.source === 'codex'` → `generationProvider = 'openai-codex'`.
- `chatModel.source` values are already provider ids; move them into `providers` and
  `chatProvider`. `inherit` stays.
- `defaultBudget` is read and discarded.

`redactSettings()` (`:192-204`) must walk `providers` and `searchKeys`. `settings-store.ts:25-37`
("a patch field equal to `REDACTED_SECRET` keeps the stored secret") becomes a per-provider deep
merge — **the likeliest place for a bug here**, so it gets its own test.

Mirror the shape in `packages/ui/src/settings/shell.ts` (`ShellPrefs`), which must not import
from the desktop app.

## Step 3 — A pi-ai-backed `LlmProvider`

New `apps/desktop/src/main/pi-provider.ts`.

```ts
export function piLlmProvider(cfg: {
  providerId: ProviderId; apiKey: string; baseUrl?: string; model: string;
}): LlmProvider
```

`Models.completeSimple(model, context, options)` where `context` is
`{ systemPrompt, messages, tools }`.

**Structured output** — when `LlmRequest.schema` is present, declare exactly one tool:

```ts
tools: [{
  name: 'emit',
  description: 'Call once with the result as its arguments',
  parameters: request.schema,
  constrainedSampling: { type: 'json_schema', strict: <from catalog> },
}]
```

**Force the call.** The literal differs per API, and `model.api` comes from the catalog:

| `model.api` | `options.toolChoice` | Adapter behaviour |
| --- | --- | --- |
| `openai-completions`, `openai-responses`, `azure-openai-responses`, `openai-codex-responses` | `'required'` | forwarded verbatim (`openai-completions.js:612`) |
| `anthropic-messages` | `'any'` | wrapped as `{ type: 'any' }` — Anthropic's forcing mode |
| `google-generative-ai`, `google-vertex` | `'any'` | `mapToolChoice` → `FunctionCallingConfigMode.ANY` |
| `bedrock-converse-stream`, `mistral-conversations` | `'any'` | explicitly supported |

The type omits these values, so one `as` is needed — **in this one place**, not scattered.

**Receiving stays two-branched**, with the second branch demoted to defensive code:

1. A `toolCall` named `emit` in `AssistantMessage.content` → `JSON.stringify(its arguments)`.
2. Otherwise concatenate the `text` content and let `parseJsonOutput` handle it. Should not
   happen once the call is forced; if it does, behaviour falls back to today's.

Count branch 2 in the trace. A non-zero count means an adapter is not forcing as expected.

**Failure does not throw.** `completeSimple` resolves an `AssistantMessage` whose `stopReason`
carries the outcome:

| `stopReason` | Handling |
| --- | --- |
| `stop`, `toolUse` | normal |
| `length` | **output truncated** → `LlmError('bad_output')`, saying so plainly |
| `aborted` | our timeout controller or the caller's signal → `'timeout'` / `'aborted'` |
| `error` | `LlmError('provider_failed', errorMessage)` |
| `pending`, `deferred` | unexpected; treat as `'provider_failed'` |

`job.ts:126` and `scheduler.ts:140` distinguish a stop from a failure by `signal.aborted`, so
this mapping cannot be wrong.

> This also fixes a live defect: `http-llm.ts`'s `firstMessage()` never inspects
> `finish_reason`, so a truncated reply surfaces today as "model output is not valid JSON".

**Pass `maxTokens` explicitly** from `model.maxTokens`; `options.maxTokens` is omitted from the
request when unset (`openai-completions.js:587`).

**Disable pi-ai's retry** with `maxRetryDelayMs: 0`; retry policy stays in `runJob` alone.

**Timeout**: wrap `request.signal` in an `AbortController` with `DEFAULT_TIMEOUT_MS = 180_000`,
following `http-llm.ts:88-127` — on catch, check `signal.aborted` before the local controller,
or `'aborted'` and `'timeout'` swap.

**Retry once on unparseable JSON**, appending the parse error to the prompt. `runJob`'s backoff
does not inspect content.

Then: `main/provider.ts` resolves from `generationProvider` + `providers[id]`, keeping
`codexCliProvider()` as the nothing-configured fallback; `main/companion/model.ts` drops its
hand-written provider ternary and `CHAT_DEFAULT_MODELS` in favour of the same registry;
`http-llm.ts` and `chatgpt-codex.ts` stay for now (the latter still supplies the codex OAuth
login) but are no longer constructed by `provider.ts`; `scripts/add-book.ts:64` imports
`resolveProvider()`.

## Step 4 — Redraw the models page

Rewrite `ModelsPage` (`pages.tsx:141-273`) into its own
`packages/ui/src/settings/ModelsPage.tsx`; `pages.tsx` is already 477 lines.

Two columns, following llm-space's `search-page.tsx` (far easier to borrow from than its
1700-line models-page, and the same shape):

- **Left**: providers, each with favicon, name, a configured tick and a "default" badge.
  Providers where no model has a hard constraint sink to the bottom, annotated — not hidden,
  since hiding reads as "unsupported".
- **Right**: API key (`SecretField` plus a "get a key" link), base URL (only for `custom`,
  otherwise behind a "custom endpoint" switch), model picker, status row with a "test
  connection" button, and "set as generation default".
- **Bottom**: the chat model — `inherit` or a named provider.

The model picker lists **only hard-constraint models by default**, with a "show all models"
switch; selecting an unconstrained model states the consequence in the status row.

Reuse `Section` / `Row` / `StackedRow` / `Select` / `Switch` / `SecretField` from `rows.tsx`.

`useShellSettings.ts` replaces whole fields today; provider profiles are nested, so add
`setProvider(id, patch)` and refresh `modelStatus` on `generationProvider` (today `model`,
`:63`).

## Step 5 — Deletions, renames, moves

| Action | Where |
| --- | --- |
| Drop the default-speed row | `pages.tsx:102-109`. **Keep** `rate` / `RATE_VALUES` in `prefs.ts` |
| Drop the default-budget section | `pages.tsx:325-334`; `defaultBudget` and `BUDGET_IDS` in `shared/settings.ts`; `BUDGET_IDS` in `shell.ts:15`; `main/generate.ts:66-72` uses `recommended` directly |
| Drop the engine row | `pages.tsx:309-322`; `EngineStatus` / `engine` / `recheckEngine` in `shell.ts`; `engineStatus` in `rpc.ts:177-181`. `VoiceRow`'s preview button loses `disabled` |
| `keys` → `search` | `SETTINGS_TABS` and `PAGES` in `SettingsPanel.tsx`; `KeysPage` → `SearchPage`; `KeyMark` → `SearchMark` |
| Move the trace switch | from `KeysPage:405-412` into `DataPage`, between the data directory and cache rows |
| Render the search provider | `searchProvider` is in the schema but **no row renders it**. Same two-column shape: keenable (no key) / tavily |

**i18n**: `packages/ui/src/i18n/messages/en.ts:197-329` and `zh.ts:185-311`. `en` is the type
source, so edit it first — a missing zh key fails the build.

Fix the existing drift while here: en's `keys` has `searchProvider` / `searchProviderHint` /
`keenable` / `tavilyProvider` (`en.ts:302-305`); zh has none (`zh.ts:287-296`).

## Step 6 — Documentation

- `AGENTS.md`: drop `CAIRN_EDGE_TTS`; `bun run start` no longer needs `edge-tts`; rewrite the
  closing "A note on the LLM provider" — the codex CLI becomes a fallback, and the 18k-overhead
  reasoning stays but changes tense.
- `docs/ARCHITECTURE.md`: the `runtime/` implementation list, and the decision record for
  merging the generation and chat model paths.
- Invariant 9 is untouched: the voice stays part of `deckKey`.

---

## Verification

In order, each green before the next:

1. `bun test` — word-level cue alignment; `parseSettings` migration from the old shape;
   `REDACTED_SECRET` deep merge; and the `pi-provider` faux tests (normal tool path, text
   fallback, one retry on bad JSON, abort vs timeout mapping).
2. `bun run typecheck` — all four projects.
3. `cd apps/desktop && bun run build` — **not optional**. `edge-tts-universal` pulls `ws` and
   `node:*`; only this catches a leak into the webview.
4. `cd apps/desktop && bun run dev` — seven pages become six; the two-column pages show
   `Offline` without a main process; `?gauntlet` for overflow.
5. `cd apps/desktop && bun run start` (via the `cairn-desktop-verify` skill) — configure a real
   provider, test the connection, add a short book (budget preselects `recommended`), build a
   station, hear it with aligned captions, audition both voices, change speed and reopen, ask
   the companion under both `inherit` and a named provider, and ask an outside-the-book
   question with Tavily configured.
6. Start against a **pre-change** `settings.json` and confirm `model.source`,
   `chatModel.source` and `defaultBudget` migrate with no key lost.

## Commits

One reason each:

1. `feat: native edge-tts client, drop the python cli`
2. `refactor: unify generation and chat on one provider registry`
3. `feat: provider sidebar in the models settings page`
4. `refactor: rename the keys page to search, move tracing to data`
5. `refactor: drop the default budget and default speed settings`
6. `docs: ...`

Before each: `bun test`, four typechecks and `bun run build` pass, and no generated book, audio
file or cache entry is staged.
