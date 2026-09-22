# Cairn — architecture

2026-09-22 · how the parts fit together, and why

[SPEC.md](./SPEC.md) says what each module does. This says where the boundaries are, which way
the dependencies point, and which arguments produced them. The decision record at the end (§8)
holds the reasoning behind choices that are easy to undo by accident.

---

## 1. Shape: one local desktop app

```
Electrobun window
├── main process (Bun)                    webview (React)
│   ├── rpc.ts      typed bridge  ◄──────► bridge.ts
│   ├── generate.ts pipeline driver        App / AddBook / Home
│   ├── library.ts  loopback file server   packages/ui panes + slide layouts
│   ├── provider.ts codex exec wrapper
│   ├── tavily.ts   outside search
│   └── store.ts    data dir resolution
└── packages/core   pure domain + pipeline, used by the main process only
```

Everything that touches a process, the filesystem or the network lives in the **main process**.
The webview renders and sends RPC calls. That split is not ceremony: it is what keeps
`TAVILY_API_KEY` out of the webview, and it is why the bridge exists at all.

**Mac first, Windows intended.** Nothing in `core/` is platform-specific; the platform-bound
parts are `runtime/` (spawning `codex` and `edge-tts`) and the Electrobun packaging. The
[llm-space](https://github.com/deer-flow/llm-space) monorepo is the reference for both the
`packages/` + `apps/` boundaries and for shipping the same codebase on macOS and Windows.

**No web build.** `codex exec` and `edge-tts` both need a local process, and nothing is shared,
so there is nothing to deploy.

---

## 2. Package boundaries

```
packages/core/     Domain types, parsing, pipeline, storage — no framework imports
  parse/           epub.ts  txt.ts  markdown.ts  chunk.ts  text.ts
  llm/             LlmProvider interface + tracing wrapper. No implementations.
  pipeline/        map · classify · reduce · recap · slides · tts · build ·
                   budget · caption · fingerprint · ask · ask-outside
                   job.ts (batch state machine) · scheduler.ts (interactive one)
  store/           library.ts, file-store.ts, asks.ts
  runtime/         codex-cli.ts, edge-tts.ts, trace-dir.ts
packages/ui/       React components, design tokens, slide layout renderers
apps/desktop/      Electrobun shell: main process + webview
scripts/           add-book.ts, replay.ts, typecheck.ts
```

**The dependency arrow points one way.** `pipeline/` and `llm/` depend on interfaces —
`LlmProvider`, `Narrator`, `JobStore`, `TraceSink`. `runtime/` implements them. Nothing in
`pipeline/` imports anything in `runtime/`.

The test for whether a file belongs in `runtime/`: **does it import `node:*` for anything but
path arithmetic?** If yes, it is runtime, and the pipeline reaches it through an interface.

This is what makes the pipeline testable without a model or a TTS binary installed, and it is
what makes swapping `codex exec` for an HTTP provider a one-file change.

---

## 3. Data flow

```
file ──parse──► ParsedBook ──chunk──► map units
                                        │
                              map (N calls, batched)
                                        ▼
                                  ChapterNote[] ─────────────┐
                                        │                    │
                                classify (1 call)            │  every downstream
                                        ▼                    │  stage reads the
                                   BookType                  │  notes, never the
                                        │                    │  book again
                              reduce (1–2 calls) ◄───budget──┘
                                        ▼
                              PathNode[] + Stage[]
                                        │
                                 recap (1 call, reads the path)
                                        ▼
                                      Path ──install──► shelf, playable
                                        │
                        scheduler: per station, in walking order
                                        ▼
                     slides (1 call) ──► tts (edge-tts) ──► NodeDeck
```

**The full text is read exactly once.** Map produces the notes; everything after reads notes.
Re-reading per stage multiplies cost roughly 5x for no gain. `recap` goes one further and reads
the station briefs `reduce` already wrote, so closing a book costs no pass over the notes either.

---

## 4. Storage layout

```
$CAIRN_DATA_DIR/            default ~/Library/Application Support/Cairn/
  books/<id>/
    path.json               the station list; installed the moment reduce finishes
    notes.json              ChapterNote[]
    decks/<key>.json        one file per station, content-keyed
    decks/index.json        readiness list the player polls
  library.json              LibraryEntry[] incl. PathQuality and last position
  .cache/<id>/
    map.json                resumable per-chapter results
    audio/                  mp3 per deck key
    trace/                  only when CAIRN_TRACE=1
```

Never beside the app: its cwd is inside its own bundle and is rebuilt on every `electrobun dev`.

**Deck keys are content fingerprints, not positions.** `reduce` re-runs on every generation and
the model is not deterministic, so station `n0` routinely means a different station than it did
last time — and one audio directory is shared by every budget. A positional key let one budget's
synthesis overwrite another's, then shipped the right subtitles over the wrong voice track.

---

## 5. Long-running work

Near a hundred model calls per book, which is the most fragile part of the system. It is written
as a **resumable task state machine**, never one `await Promise.all`:

- each task's result persists the moment it lands, so an interruption loses nothing
- concurrency is capped; a failure is isolated and retried with backoff
- progress is per unit ("chapter 37 of 82"), not a spinner
- an interrupted run resumes where it stopped

Two drivers share one `JobStore`, so a book half-built by one resumes under the other:

| | `runJob` (`job.ts`) | `startDeckScheduler` (`scheduler.ts`) |
| --- | --- | --- |
| Order | Fixed | Re-orderable — follows the reader |
| Pausable | No | Yes; reader questions hold it |
| Used by | `add-book` | the app |

---

## 6. Process boundary and the loopback server

The main process serves the library over `127.0.0.1` on a random port, because `<audio>` needs a
URL it can range-request. `main/library.ts`:

- binds loopback only, and answers `GET` and `HEAD` only
- serves exactly one directory
- requires a per-launch token as the first path segment
- rejects traversal before the path join, then re-checks the result against the root, because a
  decoded segment can contain a separator

It is the only process that listens, and it is not reachable from outside the machine.

---

## 7. Dependencies

| Need | Choice | Why |
| --- | --- | --- |
| Language, runtime, tests | TypeScript + Bun | One toolchain for the app, the scripts and the tests |
| Desktop shell | Electrobun | Small native shell; the reference project ships Mac and Windows with it |
| Build (webview) | Vite | Small output, fast dev |
| UI | React | The slide layouts are components; nothing heavier is needed |
| Model | `codex exec` subprocess behind `LlmProvider` | Already installed, no API spend. See below |
| Narration | `edge-tts`, voice `zh-CN-YunjianNeural` | Free, no key, sentence-level subtitles alongside the audio; Microsoft tunes this voice for audiobooks and commentary |
| Web search | Tavily | One function, called only on the reader's explicit yes |
| EPUB parsing | JSZip, then our own extraction | We only need the text; epub.js brings a whole rendering engine |
| Chat surface | **none — `AskPane.tsx` is ours** | assistant-ui was chosen for its shell and is not installed; the pane turned out to need no container library. Message bodies were always going to be ours, because answers are structured objects (`Answer`, `OutsideAnswer`), not markdown streams |

**Why no chat framework:** the Vercel AI SDK's `useChat` assumes the model sits behind an HTTP
streaming endpoint; ours is a local subprocess over IPC. CopilotKit brings its own runtime and
backend assumptions. assistant-ui's runtime is pluggable and would connect, but the one thing it
would supply — the container — is a scroller and an input, and the things that matter here are
the quoted-selection block, the chapter chip that jumps back, and the book/web separation. All
three are ours either way.

**The cost of `codex exec`:** each call carries roughly 18k tokens of agent harness overhead,
several times the chapter text itself. That is why the map stage batches chapters
(`DEFAULT_BATCH_SIZE`) rather than sending one call per chapter. A plain HTTP provider would have
a few hundred tokens of overhead and could drop the batch size to 1 for cleaner per-chapter
notes. Keep everything behind `LlmProvider` so that swap stays a one-file change.

---

## 8. Decision record

Arguments that are easy to undo by accident. They predate the current shape but still hold.

### Slides are data; nothing renders to mp4

1. Changing one page in an mp4 means re-rendering the whole thing. Slides are JSON; changing a
   page changes a page.
2. The same content can render as a player, as plain text, and later as mp4 — commit to mp4 and
   the text view stops being possible at all.
3. The *feel* of video does not require the format. Auto-advancing slides with narration that
   moves into the next station on its own **is** watching a video, except it can be paused,
   skipped, searched and copied.

If mp4 is ever genuinely wanted, it is an **export**, not the core form.

### No image generation

Generated illustrations are close to useless for abstract ideas — draw "the anchoring effect" and
you get something pretty and uninformative. A good deck is mostly type and diagrams anyway.
Slides are structurally generated layouts rendered with React and SVG: free, instant,
stylistically consistent, traceable page by page. Pictograms come from a closed local glyph set,
never from a model.

### Structure never comes from pretraining memory

Memory works for famous books and becomes confident fabrication on the long tail. Letting it
decide how many stations a path has, or where it cuts, moves that dependency from the content
layer to the structural layer — and hides it better. **A wrong fact can be caught by someone who
read the book; a fabricated structure looks exactly like a real one.**

### `sourceChapters` on every station

The cheapest possible hedge against hallucination, and it costs almost nothing: any claim can be
traced back to the text it came from. Stations citing chapters that do not exist are dropped, and
the count is recorded.

### The sidebar was once rejected, and is now right

The original design chose focus mode with no sidebar, because a sidebar invites skipping and
skipping would have polluted a completion-rate experiment. There is no experiment. A sidebar
costs nothing now, and jumping around is a feature.

### edge-tts is an unofficial endpoint

It rides Microsoft Edge's read-aloud service: free, no key, Chinese voices close to human. The
risk is that it gets rate-limited or shut off; switching to a paid cloud TTS at that point costs
roughly ¥7.5 per book (≈25k characters). Not the browser's own `SpeechSynthesis`: its voice
varies with the operating system.

### Superseded, and why it is worth knowing

The v0 plan was a zero-backend browser app with BYOK, two entry points (`/studio` authoring and a
keyless `/p/:id` reader), Cloudflare Pages hosting, an analytics Worker, and IndexedDB storage —
all of it in service of measuring completion rate on ten strangers. None of that exists. The
product is a local desktop app for one owner, and there is no metric.

What survived from that plan, and why it is in the list above: no mp4, no image generation,
structure from real text, `sourceChapters`, the resumable state machine, and the `packages/` +
`apps/` split. Those arguments never depended on the experiment.
