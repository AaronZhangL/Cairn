# Cairn

Turn an ebook you already own into a path you can walk to the end.

Cairn reads a book once and lays out a **path**: a sequence of short **stations**, grouped into
stages and closed by a recap. Each station is a small deck of slides with narrated audio, built
from the book's real text and traceable to the chapters it came from. You pick how long the whole
walk should take; the number of stations follows from that.

It is a local macOS desktop app for one reader on one machine. Books, audio and caches never
leave it.

## What it does

- **Reads EPUB, PDF, MOBI/AZW3, DOCX, TXT and Markdown.** A PDF needs a text layer (scans are
  refused, not OCR'd), and a Kindle file must be DRM-free. Previewing a book (title, author, chapters, word count) needs
  no model call.
- **Four reading budgets:** skim, gist, read, or walk it all. Their lengths come from the book's
  own size and structure. A tighter budget drops whole stations instead of thinning every one.
- **Structure comes from the text, not the model's memory.** The table of contents and
  per-chapter notes decide which stations exist and in what order. Every station records its
  `sourceChapters`.
- **Slides are data, not video.** Fourteen layouts (points, quote, compare, flow, timeline,
  matrix, cycle, quadrant, fishbone and others) render in the player. Captions and slide changes
  follow the narration's own word timings.
- **Start walking before the book is done.** The full path is decided first. Station 1 becomes
  playable as soon as it is built, and the rest build behind you in walking order.
- **Resumable.** Model calls are cached per task, failures retry with backoff, and an
  interrupted build picks up where it stopped.
- **A companion pane.** Ask about the current book, books you have finished, or anything else.
  Claims about a source carry inline citations. Web search can use Firecrawl (no key needed),
  Brave Search or Tavily.
- **Chinese and English,** both in the interface and in the books. A book is narrated in the
  language it is written in, whatever language the interface uses.

## Requirements

- macOS (only Apple Silicon has been tested)
- [Bun](https://bun.sh) 1.3 or later
- A language model. Configure a provider and API key in **Settings**. Cairn uses
  [pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai) and lists models that support structured
  output first. With nothing configured, it falls back to the `codex` CLI if it is on your `PATH`.
- Network access for narration (Microsoft Edge read-aloud voices) and, optionally, web search

## Getting started

```bash
git clone https://github.com/jiehaoZ/cairn.git
cd cairn
bun install
cd apps/desktop && bunx electrobun prepare   # once per checkout

bun run start       # run the desktop app
```

Other commands:

```bash
# from the repo root
bun test                      # all tests
bun run typecheck             # all four TypeScript projects, strict
bun run add-book <file>       # build a book from the terminal
bun run replay <bookId>       # list or re-send recorded model calls (needs CAIRN_TRACE=1)

# from apps/desktop
bun run dev                   # webview only in Vite, with no model and no shell
bun run build                 # bundle the webview
bun run package               # build a distributable .app
```

## Configuration

Most settings are in the app's settings panel, which writes `settings.json` next to the library.
Environment variables are also read. A key typed into the panel overrides the environment
variable for that provider, and an empty field means "use the environment".

| Variable | Effect |
| --- | --- |
| `CAIRN_DATA_DIR` | Where generated books live. Default: `~/Library/Application Support/Cairn/` |
| `CAIRN_TRACE=1` | Record every model call under the book's cache. Off by default, because the trace contains the book's text |
| `FIRECRAWL_API_KEY` | Optional. Without it, search uses Firecrawl's limited anonymous tier |
| `BRAVE_SEARCH_API_KEY` | Required when Brave Search is selected |
| `TAVILY_API_KEY` | Required when Tavily is selected |

API keys are read only by the main process. The webview never sees them.

## Privacy

Generated books contain the full chapter text and narration of books you own. They live in
`CAIRN_DATA_DIR` and are git-ignored. Cairn sends data to three kinds of service:

1. **Your configured model provider** receives the book's text while building a path, plus the
   messages you send in the companion.
2. **The narration service** receives each station's script.
3. **The search provider you select** receives queries the model writes. Queries can include
   brief context from the book, but never whole chapters.

There are no accounts and no telemetry, and Cairn runs no server of its own. The local audio
server binds to `127.0.0.1` and requires a per-launch token.

## Project layout

```
packages/core    domain types, parsing, generation pipeline, storage (no framework imports)
packages/ui      shared React components, design tokens, slide layouts
apps/desktop     Electrobun shell: main process + webview, authoring and playback in one window
scripts/         add-book, replay, typecheck
docs/            PRD, architecture, design
```

## Documentation

- [`docs/PRD.md`](docs/PRD.md): the product definition, module by module
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): module boundaries, data flow, decision record
- [`docs/DESIGN.md`](docs/DESIGN.md): visual design and the reasoning behind each slide layout
- [`AGENTS.md`](AGENTS.md): conventions and invariants for contributors, human or agent

## Not in scope

OCR of scanned PDFs, video rendering, image generation, spaced repetition, user accounts, and any
networked server component.
