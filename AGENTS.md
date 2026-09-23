# Cairn

Turn an ebook you already own into a path you can walk to the end.

A path is a sequence of **stations** grouped into **stages**, closing with a recap station. Each
station is a short deck of generated slides with narrated audio, sourced from the book's real
text and traceable to the chapters it came from. The reader picks one of four **budgets**; the
station count and coverage follow from it.

Slides are data, not video — the player is one rendering of them, and the only one built so far.
A plain-text rendering is a possibility the data model leaves open.


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
bun run build     # bundle the webview — catches node:* leaking into it
bun run start     # the real desktop app
bun run package   # a distributable .app
```

`bun run start` needs `codex` on PATH and a network path to the narration service. Outside-the-book search defaults
to keyless Firecrawl; Brave Search and Tavily are selectable with keys. `bun run dev` needs none of them and says so in the
answer pane rather than faking a reply.

| Environment variable | Effect |
| --- | --- |
| `CAIRN_DATA_DIR` | Where generated books live. Default `~/Library/Application Support/Cairn/` — never beside the app, whose cwd is rebuilt on every `electrobun dev` |
| `CAIRN_TRACE=1` | Record every model call (prompt, schema, raw reply, ms) under the book's cache. Off by default: a trace of the map stage is the book's text a second time |
| `BRAVE_SEARCH_API_KEY` | Optional Brave Search key; required when Brave is selected |
| `FIRECRAWL_API_KEY` | Optional Firecrawl key; without it, search uses Firecrawl's limited anonymous tier |
| `TAVILY_API_KEY` | Optional Tavily search key. Read in the main process only |

**The settings panel writes `settings.json` beside the library**, and both sources are honoured.
The search-provider picker defaults to keyless Firecrawl. Existing Tavily keys keep Tavily selected
on upgrade; a reader can switch providers explicitly. A key typed into the panel wins over
that provider's environment variable; an empty field means "read the environment". Tracing is on if *either*
`CAIRN_TRACE=1` or the stored switch says so — a machine
configured the old way does not silently stop working. `main/settings.ts` folds the two into one
answer, so nothing downstream reads `process.env` for these.

The reader's own preferences — interface language, theme, text size, default speed — never reach
the main process at all. They live in `localStorage` (`packages/ui/src/settings/prefs.ts`),
because everything they affect is drawn by the webview.

The narration service is reached **before the first model call**, because synthesis runs last
and an unreachable one would otherwise surface only after paying for every station's slides.

## Project structure

```
packages/
  core/          Domain types, parsing, pipeline, storage — no framework imports
    parse/       epub.ts  txt.ts  markdown.ts  chunk.ts  text.ts  language.ts
    pipeline/prompts/  Every prompt, one file per language. `en` is the type's
                 source, so a prompt added there fails the build until `zh` has it
    errors.ts    Named failures (`CairnError`). The reader's language is the
                 renderer's business, so nothing here writes a sentence.
    llm/         Provider *interface* + tracing wrapper. No implementations.
    pipeline/    job.ts (batch state machine), scheduler.ts (interactive one),
                 map/classify/reduce/slides/tts stages — all pure or interface-driven
    store/       Path helpers, file-backed JobStore, ask log
    runtime/     Everything that spawns a process or writes a file:
                 codex-cli.ts, edge-tts-ws.ts, trace-dir.ts
  ui/            Shared React components and design tokens; slide layout renderers
    i18n/        Two dictionaries and the type that keeps them in step
    settings/    The settings panel, and the preferences the webview owns
apps/
  desktop/       Electrobun shell — the only app. Authoring and playback in one window.
scripts/         add-book.ts, replay.ts, typecheck.ts
```

**The dependency arrow points one way.** `pipeline/` and `llm/` depend on interfaces
(`LlmProvider`, `Narrator`, `JobStore`, `TraceSink`); `runtime/` implements them, never the
reverse. Test for whether a file belongs in `runtime/`: does it import `node:*` for anything but
path arithmetic?

**A second, sharper rule for anything the webview also imports.** Path arithmetic is allowed in
`core`, but a module the *renderer* pulls in may not import `node:*` at all — Vite externalises
it and the build fails at bundle time, after every typecheck has passed. `pipeline/voice.ts`
exists for exactly this: the player needs the voice defaults and the speech rates, and
`pipeline/tts.ts` imports `node:path`. `bun test` and four clean typechecks will not catch this;
`cd apps/desktop && bun run build` will.

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

### Change scope and review

- Limit implementation to the requested behavior and contracts it directly affects. Add an
  abstraction, configuration option, or fallback only for a concrete need.
- In code review, report actionable defects with a location, a concrete failure path, and its
  impact. Do not present style preferences or hypothetical edge cases as defects.
- Start with checks relevant to the change. Expand investigation for a concrete failure or
  unresolved risk. Before committing, run the full checks listed below.

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

4. **Claims attributed to a source must be checkable.** The companion uses inline citations for
   claims about the current book, fetched web pages, and completed books; general explanation
   can be uncited. See [`docs/COMPANION.md`](docs/COMPANION.md).

5. **The pipeline reads the full text exactly once.** Map produces per-chapter notes — prose
   plus the structured material the chart layouts need (`figures`, `contrasts`, `sequences`,
   `relations`) — and every downstream stage reads the notes, not the book. Map's task ids are
   positional, so notes cached before a field existed stay valid and stay thin; a book wants its
   cache cleared to gain one. Re-reading per stage multiplies cost ~5x for
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
   build behind the reader in walking order, one at a time at first and further ahead as they get
   deeper (`lookaheadFor`) — a reader at station six is far likelier to finish than one at station
   one, so buying ahead stops being speculative, and past halfway the rest is built as fast as the
   machine sensibly allows. Progress is written to the library index on every station, not only at
   the end: a shelf that reads 0 of 15 for a whole run is worse than no count. A station with no deck yet shows as pending, never
   hidden.

8. **Cache keys derive from content, never from position.** `reduce` re-runs on every generation
   and the model is not deterministic, so station `n0` routinely means a different station than
   last time — and one audio directory is shared by every budget. A positional key let one
   budget's synthesis overwrite another's, then shipped the right subtitles over the wrong voice
   track. `deckKey()` in `pipeline/build.ts` fingerprints the station's content instead.

9. **A book keeps the voice it was built with.** The voice is part of `deckKey`, and that one
   key protects both halves of `buildNode` — the model call that writes the script *and* the
   synthesis that speaks it. So changing the voice does not re-synthesise a book, it rebuilds
   it: every station is a cache miss and costs a fresh `slides` call. The voice is therefore
   resolved **once**, when the book is added, and recorded on its `LibraryEntry` along with the
   language it was detected as. Changing the setting only affects books added afterwards. A
   half-built book resumed after a change keeps its original voice, or it would end up in two.
   An entry with no recorded voice was built with `DEFAULT_VOICE`, and must be resolved to that
   and not to the current setting.

10. **The language a book is narrated in comes from the book, not from the interface.** A reader
    with an English interface can walk a Chinese book, and it stays Chinese. `parse/language.ts`
    counts the text and uses `dc:language` only when there is too little of it to count —
    conversion tools routinely stamp `en` on a Chinese translation, and trusting that would
    narrate the whole book in the wrong voice for the price of a full generation.

11. **A prompt states the language it wants back.** The prompts were Chinese and said nothing
    about output language, so the model followed the system prompt — which made an English book
    come back in Chinese, silently. Every stage now takes the book's `ContentLocale` and loads
    its prompts from `pipeline/prompts/`. Thread it through any new stage; a stage that defaults
    to `zh` and is never passed a locale is the bug coming back.

12. **English narration is commissioned in words, Chinese in characters.** `CHARS_PER_SECOND` is
    per language and measured (zh 4.9, en 17.0 — three samples each, recorded in `tts.ts`).
    English prompts ask for a word count because a model counts words far more reliably than
    characters. Re-measure rather than adjust by feel: nothing downstream checks the length, so
    an error here just makes every station the wrong length.

## Security

- **No secret is hardcoded.** Optional `TAVILY_API_KEY` comes from the environment and is read in
  the main process only; the webview never holds a key. The selected search service receives
  model-written queries, which may contain brief book context, not whole chapters. That boundary
  is why the RPC bridge exists.
- **The loopback server is scoped, not open.** `main/library.ts` binds `127.0.0.1` on a random
  port (because `<audio>` needs a range-requestable URL), answers GET and HEAD only, serves one
  directory, and requires a per-launch token as the first path segment. Traversal is rejected
  before the join and re-checked against the root after, because a decoded segment can contain a
  separator.
- **Generated books stay local.** `.gitignore` keeps the library and pipeline cache out of the
  repository; they contain full chapter text from books the owner bought. Planned iCloud sync
  contradicts this sentence — see the note under Boundaries before building it.

## Commits and pull requests

- Conventional commits: `<type>: <description>`, type one of
  `feat` `fix` `refactor` `docs` `test` `chore` `perf` `ci`.
- One reason per commit. A formatting sweep and a behaviour change do not belong together.
- Before committing: `bun test`, all four typechecks, and `cd apps/desktop && bun run build`
  pass, and no generated book, audio file or cache entry is staged. The bundle is a separate
  check on purpose: a `node:*` import that reaches the webview passes every typecheck and fails
  only at bundle time.
- A commit that fixes a silent bug names the invariant it restores.

## Boundaries

**Out of scope:** PDF parsing · MP4 rendering · image generation · spaced repetition · user
accounts · telemetry · any networked server component.

**Planned, and the reason several decisions look the way they do:** books generated on the Mac
sync (iCloud) and are read on an iPhone. Nothing is built for it yet, but three consequences
already bind:

1. **The phone can only be a player.** An iOS app ships through the App Store, so it *is*
   sandboxed: no subprocess, no `codex`. Generation stays on the Mac. This is
   already the shape the data model implies — "slides are data, not video" — so keep the split
   clean rather than letting anything player-side depend on a generation-side artifact.
2. **A book must be movable.** Everything the player needs lives under `books/<id>/`, and
   nothing persisted there may hold an absolute path — see `NodeDeck.audioPath`. `.cache/` is
   generation-side and never travels.
3. **Syncing changes what "stays local" means.** `chapters.json` is the full text of a book the
   owner bought, and today the Security section below can say it never leaves the machine.
   Putting it in iCloud makes that false. Either the synced bundle excludes it — costing
   anchored questions on the phone — or the claim gets rewritten honestly. Decide before
   building sync, not after.

**In scope, not built:** the `world` layout (a novel's setting); the plain-text rendering of a
deck; cross-book memory of what the reader has already walked
([`docs/SPEC.md`](docs/SPEC.md) §7).

**Ask before:** changing `tokens.css`, cache key derivation, budget arithmetic, or anything that
sends data off the machine.

## Agent skills

Matt Pocock's skills live in `.agents/skills/`; `.claude/skills/` links to them. Codex and
Claude Code use the same project-level copies.

### Issue tracker

Specs and issues live in local Markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles. See `docs/agents/triage-labels.md`.

### Domain docs

Use one root `CONTEXT.md` for Cairn's product vocabulary. See `docs/agents/domain.md`.

## Reference

| Document | Read it when |
| --- | --- |
| [`docs/SPEC.md`](docs/SPEC.md) | Before changing scope. The current product definition, organised by module |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module boundaries, data flow, dependency choices, and the decision record behind them |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Before touching `tokens.css` or any CSS that affects appearance |
| [`docs/COMPANION.md`](docs/COMPANION.md) | Before touching the companion pane. It supersedes SPEC §6 |

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
