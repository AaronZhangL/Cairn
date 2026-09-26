English | [中文](./README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/jiehaoZ/Cairn?label=release)](https://github.com/jiehaoZ/Cairn/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey?logo=apple)](#download)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Cairn

<!-- SCREENSHOT: save the image as docs/images/screenshot.png, then delete the two comment markers around the next line. -->
<!-- ![Cairn](./docs/images/screenshot.png) -->

<!-- VIDEO: drag the .mp4 into GitHub's web editor for this file; replace this whole comment with the https://github.com/user-attachments/assets/... line it inserts. -->

Cairn reads a book once and lays out a **path**: short **stations** of narrated slides, grouped
into stages and closed by a recap. You choose how long the walk should take, and the number of
stations follows from that. Every station is built from the book's own text and records which
chapters it came from.

## Features

- **Your books, locally.** EPUB, PDF, MOBI/AZW3, DOCX, TXT, Markdown, or your own Markdown notes.
- **Four budgets.** The rough idea, the key points, really read it, or walk it all. A tighter budget drops stations instead of thinning each one.
- **Grounded in the text.** The table of contents and the chapters decide the path, not the model's memory.
- **Slides, not video.** Fourteen chart layouts, with captions timed to the narration.
- **Start right away.** Station 1 plays as soon as it is ready; the rest build while you walk.
- **A companion that cites.** Ask about the book, books you've finished, or the web, with sources.
- **Chinese and English.** Each book is narrated in its own language, whatever the interface uses.

## Download

Get the DMG from the [latest release](https://github.com/jiehaoZ/Cairn/releases/latest). macOS on
Apple Silicon only for now.

The app is not notarized. If macOS says it is damaged or cannot be opened, run this once after
moving it to Applications:

```bash
xattr -dr com.apple.quarantine /Applications/Cairn.app
```

On first launch, open **Settings** and pick a model provider and key. Any provider
[pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai) supports will work; models
that support structured output are listed first.

## Build from source

Requires [Bun](https://bun.sh) 1.3 or later.

```bash
git clone https://github.com/jiehaoZ/Cairn.git
cd Cairn
bun install
cd apps/desktop && bunx electrobun prepare   # once per checkout

bun run start       # run the app
bun run package     # build a distributable .app
```

`bun test` runs the tests and `bun run typecheck` checks all four TypeScript projects.
[`AGENTS.md`](AGENTS.md) has the rest of the commands and the project's conventions.

## Configuration

Everything is set in the app's **Settings** panel. A key field written as `$NAME` reads that
environment variable instead of storing the key.

| Variable | Purpose |
| --- | --- |
| `CAIRN_DATA_DIR` | Library location. Default `~/Library/Application Support/Cairn/` |
| `FIRECRAWL_API_KEY` | Optional. Web search works without it on a limited tier |
| `BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` | Needed only if you pick that search provider |
| `WEREAD_API_KEY` | Optional WeChat Reading integration |

## Privacy

Books, audio and caches stay on your Mac. There are no accounts and no telemetry. Data leaves the
machine only for:

- **your model provider**: the book's text while a path is built, and your companion messages;
- **the narration service** (Microsoft Edge read-aloud voices): each station's script;
- **your search provider**: queries the model writes, never whole chapters;
- **WeChat Reading**, only with a key: the book's title and author, to find its highlights.

## Documentation

- [`docs/PRD.md`](docs/PRD.md): what the product does, module by module
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): module boundaries and the decisions behind them
- [`docs/DESIGN.md`](docs/DESIGN.md): visual design and the slide layouts
- [`docs/EVAL.md`](docs/EVAL.md): how a change to the pipeline is judged

## Roadmap

- An iPhone player for books built on the Mac, synced through iCloud
- A plain-text rendering of every station
- Remembering what you've already walked across books

## Contributing

Bug reports and ideas are welcome in [issues](https://github.com/jiehaoZ/Cairn/issues). Before a
pull request, read [`AGENTS.md`](AGENTS.md): it lists the checks that must pass and the invariants
the pipeline depends on.

## License

[MIT](./LICENSE). The narration library it depends on, `edge-tts-universal`, is AGPL-3.0,
so the packaged app as a whole is distributed under AGPL-3.0 terms.
