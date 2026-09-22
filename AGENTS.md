# Cairn

Turn an ebook you already own into a path you can walk to the end.

A path is a sequence of **stations** grouped into **stages**, closing with a recap station. Each
station is a short deck of generated slides with narrated audio, sourced from the book's real
text and traceable to the chapters it came from. The reader picks one of four **budgets**; the
station count and coverage follow from it.

Slides are data, not video — the player is one rendering of them, and the only one built so far.
A plain-text rendering is a possibility the data model leaves open.

Personal tool: one owner, one machine, run locally.

## Setup and commands

```bash
bun install
cd apps/desktop && bunx electrobun prepare   # once per checkout; projects the SDK into .hutch/

bun test                                     # every package
bun test packages/core/tests/fit.test.ts     # one file
bun run typecheck                            # all four projects, strict
bun run add-book <file>                      # run the pipeline from the terminal
bun run replay <bookId> [file]               # list recorded model calls, or re-send one

cd apps/desktop
bun run dev       # Vite only: the three panes, no model, no shell
bun run start     # the real desktop app
bun run package   # a distributable .app
```

`bun run start` needs `codex` on PATH, `edge-tts` reachable, and — only for outside-the-book
search — `TAVILY_API_KEY` in the environment. `bun run dev` needs none of them and says so in the
answer pane rather than faking a reply.

| Environment variable | Effect |
| --- | --- |
| `CAIRN_DATA_DIR` | Where generated books live. Default `~/Library/Application Support/Cairn/` — never beside the app, whose cwd is rebuilt on every `electrobun dev` |
| `CAIRN_EDGE_TTS` | Path to `edge-tts`. Otherwise looked up beyond PATH: `~/.local/bin`, Homebrew, every pyenv version |
| `CAIRN_TRACE=1` | Record every model call (prompt, schema, raw reply, ms) under the book's cache. Off by default: a trace of the map stage is the book's text a second time |
| `TAVILY_API_KEY` | Outside-the-book search. Read in the main process only |

`edge-tts` is checked **before the first model call**, because synthesis runs last and a missing
binary would otherwise surface only after paying for every station's slides.

## Project structure

```
packages/
  core/          Domain types, parsing, pipeline, storage — no framework imports
    parse/       epub.ts  txt.ts  markdown.ts  chunk.ts  text.ts
    llm/         Provider *interface* + tracing wrapper. No implementations.
    pipeline/    job.ts (batch state machine), scheduler.ts (interactive one),
                 map/classify/reduce/slides/tts stages — all pure or interface-driven
    store/       Path helpers, file-backed JobStore, ask log
    runtime/     Everything that spawns a process or writes a file:
                 codex-cli.ts, edge-tts.ts, trace-dir.ts
  ui/            Shared React components and design tokens; slide layout renderers
apps/
  desktop/       Electrobun shell — the only app. Authoring and playback in one window.
scripts/         add-book.ts, replay.ts, typecheck.ts
```

**The dependency arrow points one way.** `pipeline/` and `llm/` depend on interfaces
(`LlmProvider`, `Narrator`, `JobStore`, `TraceSink`); `runtime/` implements them, never the
reverse. Test for whether a file belongs in `runtime/`: does it import `node:*` for anything but
path arithmetic?

## Code style

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any`, no non-null assertions on external
  data.
- Immutable data. Functions return new objects; `readonly` on domain types.
- Small focused files. Extract rather than grow past ~400 lines.
- Errors are explicit and typed. `ParseError` carries a `code` so the UI can show something a
  human understands. Never swallow an error.
- Code, identifiers, doc comments and everything under `docs/` are written in **English**.
- Product-facing copy targets **Chinese and English**. Do not bake a language into logic; keep
  user-visible strings where they can be swapped.
- **Follow `karpathy-guidelines`**: state assumptions before coding, write the minimum that
  solves the problem, keep changes surgical, define a verifiable success check per step.
- Visual changes follow [`docs/DESIGN.md`](docs/DESIGN.md). Re-measure its contrast tables after
  changing any colour.

### Comments

The default is **no comment**. Code that needs a paragraph usually needs a better name or a
smaller function. Write one only when all three hold:

1. It explains **why**, not what.
2. The why cannot be recovered from the names, the types, or the test.
3. Someone changing this code would get it wrong without it — a rejected simpler approach, a
   non-obvious ordering constraint, a bug this line prevents.

Length ceilings:

| Position | Ceiling |
| --- | --- |
| Inline, or above a statement | **1 line** |
| Above a function, type or constant | **3 lines** |
| File header | **8 lines**, and only where the file carries a decision (`budget.ts`, `fit.ts`) |

Past the ceiling the explanation belongs in `docs/`, and the comment points at it.

Never: restating the signature; narrating steps (`// loop over chapters`); commented-out code; a
`TODO` with no name attached; re-commenting lines the diff did not touch.

```ts
// WRONG — restates the code, and three lines to say nothing
/**
 * Clamps the given minutes value to the budget's per-node range.
 * @param minutes the minutes
 * @param budget the budget
 */

// RIGHT — the constraint that is not visible from here
/** A station that cannot make one thing clear is worth nothing, so the floor is real. */
```

## Testing

- `bun test` for everything; `bun test <path>` for one file or package.
- Tests mirror source paths: `src/parse/chunk.ts` → `tests/parse/chunk.test.ts`.
- **Four separate typechecks must pass, not one**: `packages/core`, `packages/ui`,
  `apps/desktop/tsconfig.json`, `apps/desktop/tsconfig.main.json`. `bun run typecheck` runs all
  four and names any it skipped; a script that silently checks one of four is how the desktop
  projects went unchecked.
- Pure logic is extracted so it can be tested without a browser or a model — `caption.ts`,
  `split.ts`, `fingerprint.ts`, `budget.ts`, `scheduler.ts`, `trace.ts`. This is why `runtime/`
  exists: a stage that shells out cannot be tested without the tool installed.
- A change to cache keys, budgets or caption timing needs a regression test **that would have
  caught the original bug**, not just a test that the new code runs.
- Slide overflow cannot be unit-tested. `?gauntlet` in `bun run dev` draws every layout at its
  worst; check there.

## Invariants

Load-bearing. Breaking one silently undoes a decision that took real work to reach.

1. **The reading budget is the constraint; the station count is the result.** The reader picks
   one of four budgets, and `budgetsFor()` derives their length from the book's own word count
   and chapter structure — the rungs are fixed in intent (skim / gist / read / walk it all), not
   in minutes. A tighter budget drops whole stations rather than making each one shallower.

2. **Structure comes from the real text, never from the model's pretraining memory.** Station
   count and ordering derive from the table of contents plus the per-chapter notes from the map
   stage. Memory-derived structure fails silently on long-tail books, and a fabricated station
   looks exactly like a real one.

3. **Every station carries `sourceChapters`.** The cheapest hedge against hallucination: any
   claim can be traced back to the text it came from.

4. **Book-sourced and web-sourced statements render separately, never blended.** The reader has
   not read the book; a merged paragraph makes the two indistinguishable. A generic chat
   component will flatten this if allowed to.

5. **The pipeline reads the full text exactly once.** Map produces per-chapter notes; every
   downstream stage reads the notes, not the book. Re-reading per stage multiplies cost ~5x for
   no gain. `pipeline/recap.ts` goes further and reads the *path* — the station briefs `reduce`
   already wrote — so closing a book costs no pass over the notes either.

6. **Long-running work goes through `runJob` or `scheduler.ts`.** Near a hundred model calls per
   book. Results persist per task, concurrency is capped, failures are isolated and retried with
   backoff, and an interrupted run resumes where it stopped. `runJob` is the batch path (fixed
   order, `add-book`); `startDeckScheduler` is the interactive one (re-orderable, pausable, the
   app). They share the `JobStore`, so a book half-built by one resumes under the other.

7. **The full list of stations exists before the first one plays; only their decks arrive
   progressively.** `reduce` needs every chapter note before it can choose and order stations,
   so the path cannot be streamed — a path that grew as you read would let arrival time decide
   the station count instead of the budget, breaking invariant 1. The decks *are* independent,
   and that is where the wait lives: `generate` returns once station 1 is playable, and the rest
   build behind the reader in walking order. A station with no deck yet shows as pending, never
   hidden.

8. **Cache keys derive from content, never from position.** `reduce` re-runs on every generation
   and the model is not deterministic, so station `n0` routinely means a different station than
   last time — and one audio directory is shared by every budget. A positional key let one
   budget's synthesis overwrite another's, then shipped the right subtitles over the wrong voice
   track. `deckKey()` in `pipeline/build.ts` fingerprints the station's content instead.

## Security

- **No secret is hardcoded.** `TAVILY_API_KEY` comes from the environment and is read in the main
  process only; the webview never holds a key. That boundary is why the RPC bridge exists.
- **The loopback server is scoped, not open.** `main/library.ts` binds `127.0.0.1` on a random
  port (because `<audio>` needs a range-requestable URL), answers GET and HEAD only, serves one
  directory, and requires a per-launch token as the first path segment. Traversal is rejected
  before the join and re-checked against the root after, because a decoded segment can contain a
  separator.
- **Generated books stay local.** `.gitignore` keeps the library and pipeline cache out of the
  repository; they contain full chapter text from books the owner bought.

## Commits and pull requests

- Conventional commits: `<type>: <description>`, type one of
  `feat` `fix` `refactor` `docs` `test` `chore` `perf` `ci`.
- One reason per commit. A formatting sweep and a behaviour change do not belong together.
- Before committing: `bun test` and all four typechecks pass, and no generated book, audio file
  or cache entry is staged.
- A commit that fixes a silent bug names the invariant it restores.

## Boundaries

**Out of scope:** PDF parsing · MP4 rendering · image generation · spaced repetition · user
accounts · telemetry · any networked server component.

**In scope, not built:** novel layouts (`timeline`, `relation`, `world`); the plain-text
rendering of a deck; cross-book memory of what the reader has already walked
([`docs/SPEC.md`](docs/SPEC.md) §7).

**Ask before:** changing `tokens.css`, cache key derivation, budget arithmetic, or anything that
sends data off the machine.

## Reference

| Document | Read it when |
| --- | --- |
| [`docs/SPEC.md`](docs/SPEC.md) | Before changing scope. The current product definition, organised by module |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module boundaries, data flow, dependency choices, and the decision record behind them |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Before touching `tokens.css` or any CSS that affects appearance |

Two projects worth borrowing from:

- **DeepTutor** — for *features*: how a reading session is structured, how sources are shown, how
  a long piece of material is paced.
- **[llm-space](https://github.com/deer-flow/llm-space)** — for *code architecture and
  multi-platform packaging*. It ships on both macOS and Windows; its monorepo boundaries are
  where this repo's `packages/` + `apps/` split came from.

## A note on the LLM provider

Generation runs through the locally installed `codex exec` CLI as a subprocess, so there is no
API spend. One cost to keep in mind: each call carries roughly 18k tokens of agent harness
overhead, several times the chapter text itself — which is why the map stage batches chapters
(`DEFAULT_BATCH_SIZE`) instead of one call per chapter. A plain HTTP provider would have a few
hundred tokens of overhead and could drop the batch size to 1 for cleaner per-chapter notes.
Keep everything behind `LlmProvider` so that swap stays a one-file change.
