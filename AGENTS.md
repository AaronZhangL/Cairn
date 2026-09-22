# Cairn

Turn an ebook you already own into a path you can walk to the end.

The path is a sequence of stations grouped into stages. Each station is a short deck of
generated slides with narrated audio, backed by the book's real text and traceable to the
chapters it came from. You pick how long the whole walk should take — 10 minutes, 30, an hour,
two — and the station count and coverage follow from that.

Slides are data, not video. The same station renders as a player and as plain text.

## Project overview

**One user, one machine, nothing published.** No accounts, no telemetry, no server, no sharing.
The owner feeds it books they already have and walks the generated path themselves.

That decision removes a great deal: there is no completion-rate experiment, no keyless reader
for strangers, no CORS constraint on provider choice, and no distribution of derived content.
It also removes the need for a competitive moat — this tool does not have to beat DeepTutor or
NotebookLM, it only has to suit how its owner wants to read.

What it does *not* remove: the honest self-test. With no metric, the only signal is whether the
owner reaches for it again on a second book. Build so that answer can be yes.

### Documents

| Document | Read it when |
| --- | --- |
| [`docs/SPEC.md`](docs/SPEC.md) | Before changing scope. This is the current product definition. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Before touching `tokens.css` or any CSS that affects appearance. Several values there are load-bearing for contrast and for the elevation hierarchy; changing one silently breaks it. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Decision record. Its reasoning still holds; its product framing does not. |
| [`docs/PRD-v0.md`](docs/PRD-v0.md) | Decision record — why the WeChat Reading API was dropped, why no MP4, why no image generation. |

## Setup and commands

```bash
bun install

bun test                  # every package
bun test packages/core    # one package
bun run typecheck         # tsc --noEmit, strict

cd apps/desktop
bun run dev               # Vite only: the three panes, no model, no shell
bun run start             # the real desktop app
bun run package           # a distributable .app

bun run add-book <file>   # drive the same pipeline from the terminal
```

`bun run start` needs `codex` on PATH, `edge-tts` reachable (see below), and — only for
outside-the-book search — `TAVILY_API_KEY` in the environment. `bun run dev` needs none of them
and says so in the answer pane rather than faking a reply.

`edge-tts` is looked up beyond PATH (`~/.local/bin`, Homebrew, every pyenv version); set
`VIBE_EDGE_TTS` to override. It is checked **before the first model call**, because synthesis
runs last and a missing binary would otherwise be discovered only after paying for every
station's slides.

Generated books live in `~/Library/Application Support/Cairn/` — never beside the app, whose
cwd is inside its own bundle and is rebuilt on every `electrobun dev`. `CAIRN_DATA_DIR`
overrides it.

## Testing

- `bun test` for everything; `bun test <path>` for one file or package.
- Tests mirror source paths: `src/parse/chunk.ts` → `tests/parse/chunk.test.ts`.
- Four separate typechecks must pass, not one: `packages/core`, `packages/ui`,
  `apps/desktop/tsconfig.json`, `apps/desktop/tsconfig.main.json`.
- Pure logic is extracted so it can be tested without a browser or a model — `caption.ts`,
  `split.ts`, `fingerprint.ts` and `budget.ts` are all directly testable.
- A change to cache keys, budgets, or caption timing needs a regression test that would have
  caught the original bug, not just a test that the new code runs.

## Code style

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any`, no non-null assertions on
  external data.
- Immutable data. Functions return new objects; `readonly` on domain types.
- Small focused files. Extract rather than grow past ~400 lines.
- Errors are explicit and typed (`ParseError` carries a `code` so the UI can show something a
  human understands). Never swallow an error.
- Comments explain *why*, especially where a simpler approach was rejected for a reason that is
  not obvious from the code.
- **Code and documentation are written in English** — comments, doc comments, identifiers, test
  names, and everything under `docs/`.
- **Product-facing strings are Chinese** — `ParseError` messages, UI copy, and the LLM prompts
  that generate Chinese content. An English UI is a later iteration, not now.
- Word counting treats CJK per character and Latin per word.
- **Follow `karpathy-guidelines`**: state assumptions before coding, write the minimum that
  solves the problem, keep changes surgical, and define a verifiable success check per step.
- **Visual changes follow [`docs/DESIGN.md`](docs/DESIGN.md)**: the shadow budget belongs to the
  slide alone, regions separate by surface rather than by rules, and letter-spacing is tiered by
  size. Re-measure the contrast tables there after changing any colour.

## Layout

```
packages/
  core/          Domain types, parsing, pipeline, LLM clients, storage — no framework imports
    parse/       epub.ts  txt.ts  markdown.ts  chunk.ts  text.ts
    llm/         Provider interface + implementations
    pipeline/    job.ts (resumable state machine), map/classify/reduce/slides stages
    store/       Local persistence (file-backed JobStore)
  ui/            Shared React components and design tokens; slide layout renderers
apps/
  desktop/       Electrobun shell — the only app. Authoring and playback in one window.
```

The desktop shell is not deferred: `codex exec` and `edge-tts` both need a local process, and
with no web deployment there is nothing to gain from a browser build.

## Invariants

These are load-bearing. Breaking one silently undoes a decision that took real work to reach.

1. **Nothing leaves the machine except by explicit request.** No upload, no telemetry, no
   publishing. Two outbound paths exist and no others: the LLM call, and a Tavily web search
   that only runs when the user has answered "yes, go look it up" (`pipeline/ask-outside.ts`).
   Book content is never sent to the search API — only the user's question.

   One local exception, added deliberately: the main process serves the library over
   `127.0.0.1` on a random port behind a per-launch token (`main/library.ts`), because
   `<audio>` needs a URL it can range-request. It binds loopback only, answers GET only,
   and exposes one directory. Nothing is reachable from outside the machine.

2. **The reading budget is the constraint; the node count is the result.** The user picks a
   budget (10 min / 30 min / 1 h / 2 h) and `budget.ts` derives station count and coverage from
   it. A tighter budget drops whole stations rather than making each one shallower — a station
   that cannot make one thing clear is worth nothing.

3. **Book-sourced and web-sourced statements are rendered separately, never blended.** The
   reader has not read the book; a merged paragraph makes the two indistinguishable. This is the
   whole point of the outside-search feature, and a generic chat component will flatten it if
   allowed to.

4. **Structure comes from the real text, never from the model's pretraining memory.** Node count
   and ordering derive from the table of contents plus the per-chapter summaries produced by the
   map stage. Memory-derived structure fails silently on long-tail books, and a fabricated
   station looks exactly like a real one.

5. **Every node carries `sourceChapters`.** Cheapest possible hedge against hallucination: any
   claim can be traced back to the text it came from.

6. **The pipeline reads the full text exactly once.** Map produces per-chapter notes; every
   downstream stage reads the notes, not the book. Re-reading the book per stage multiplies
   cost by 5x for no gain.

7. **Long-running work goes through `runJob`.** Near a hundred LLM calls per book. Results
   persist per task, concurrency is capped, failures are isolated and retried with backoff, and
   an interrupted run resumes from where it stopped.

8. **Cache keys derive from content, never from position.** `reduce` re-runs on every generation
   and the model is not deterministic, so station `n0` routinely means a different station than
   it did last time — and one audio directory is shared by every budget. A positional key let
   one budget's synthesis overwrite another's, then shipped the right subtitles over the wrong
   voice track. `deckKey()` in `pipeline/build.ts` fingerprints the node's content instead.

## Out of scope

PDF parsing · MP4 rendering · image generation · spaced repetition · user accounts · telemetry ·
any *networked* server component. (The loopback file server in invariant 1 is the only
process that listens, and only on 127.0.0.1.)

Novels are **in** scope. They were previously deferred only because mixing them with knowledge
books would have blurred the completion-rate experiment. With no experiment, the narrative
layouts (`timeline`, `relation`, `world`) can be built whenever they are wanted. Catching up on
a long serial at the 10-minute budget is a first-class use case.

RAG and MCP are deliberately absent. RAG answers "find the relevant passage", which this
pipeline does not ask — it sweeps every chapter exactly once in a fixed order. MCP would let the
model fetch outside material, which directly breaks the invariant that structure comes only from
the book's real text.

## Security

The threat model is small — one machine, one user, no network service — but three rules hold:

- **No secret is ever hardcoded.** `TAVILY_API_KEY` comes from the environment and is read in
  the main process only; the webview never holds a key. That boundary is the reason the RPC
  bridge exists.
- **The loopback server is scoped, not open.** It binds `127.0.0.1`, answers GET and HEAD only,
  serves exactly one directory, and every request must carry a per-launch token as its first
  path segment. Traversal is rejected before the join and the result is re-checked against the
  root afterwards, because a decoded segment can contain a separator.
- **Generated books are derived content and stay local.** `.gitignore` keeps the library and the
  pipeline cache out of the repository; they contain full chapter text from books the owner
  bought.

## Commits and pull requests

- Conventional commits: `<type>: <description>`, where type is one of
  `feat` `fix` `refactor` `docs` `test` `chore` `perf` `ci`.
- One reason per commit. A formatting sweep and a behaviour change do not belong together.
- Before committing: `bun test` and all four typechecks pass, and no generated book, audio file,
  or cache entry is staged.
- A commit that fixes a silent bug names the invariant it restores.

## Status

- **Done** — the whole pipeline: `parse` / `chunk` / `map` / `classify` / `reduce` /
  `budget` / `slides` / `tts` / `build`, plus `ask` and `ask-outside`.
- **Done** — `packages/ui`: six slide layouts and the three panes. Each layout carries a
  graphic skeleton (proportional bars, node chains, quote watermark) and builds in step with
  the narration; pictograms come from a fixed local glyph set, never from image generation.
- **Done** — `apps/desktop`: Electrobun shell, RPC bridge, Tavily search, library server,
  and a `Cairn-dev.app` that builds and runs.
- **Done** — adding a book from the UI: a shelf with a drop zone, a parse-only preview before
  any model call, a budget choice, then the run with live progress.
- **Verified end to end** on Pro Git zh (13.9 MB EPUB, 201k words, 86 chapters):
  at the 10-minute budget, 4 stations / 1 stage / 13 minutes of real narrated audio;
  at 1 hour, 18 stations / 5 stages / 70 minutes. Zero fabricated chapter references.
- **Next** — pick a book, walk it, and fix what annoys you.

## Chosen dependencies

| Need | Choice |
| --- | --- |
| Web search | Tavily |
| Narration voice | `zh-CN-YunjianNeural` via edge-tts |
| Desktop shell | Electrobun, built directly (no web-first step) |
| Chat surface | assistant-ui — its shell only; message bodies are ours, because answers are structured objects (`Answer`, `OutsideAnswer`) rather than markdown streams |

## A note on the LLM provider

Generation runs through the locally installed `codex exec` CLI as a subprocess, so there is no
API spend. For a personal tool on the owner's own machine this is simply using a tool they
already have.

One cost to keep in mind: each `codex exec` call carries roughly 18k tokens of agent harness
overhead, several times the chapter text itself. This is why the map stage batches chapters
(`DEFAULT_BATCH_SIZE`) instead of sending one call per chapter. A plain HTTP provider would have
a few hundred tokens of overhead and could drop the batch size to 1 for cleaner per-chapter
summaries — keep everything behind `LlmProvider` so that swap stays a one-file change.
