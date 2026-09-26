English | [中文](./README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/jiehaoZ/Cairn?label=release)](https://github.com/jiehaoZ/Cairn/releases)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)](#download)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Cairn

<!-- SCREENSHOT: save the image as docs/images/screenshot.png, then delete the two comment markers around the next line. -->
<!-- ![Cairn](./docs/images/screenshot.png) -->

<!-- VIDEO: drag the .mp4 into GitHub's web editor for this file; replace this whole comment with the https://github.com/user-attachments/assets/... line it inserts. -->

Cairn turns a book into a series of short narrated clips. How long they run depends on how
deeply you want to know the book.

## Features

- Opens EPUB, PDF, MOBI/AZW3, DOCX, TXT and Markdown. Your own Markdown notes work too.
- Four lengths, from the rough idea to the whole book.
- The path follows the book's table of contents and chapters, not what the model remembers about the book.
- Each station is a set of slides with voice narration and subtitles, laid out as timelines, comparisons, flowcharts, matrices and ten other chart types.
- Progressive loading: station 1 plays as soon as it's ready, and the rest are generated in the background while you listen.
- A companion agent next to the player answers any question about the current book, and links each claim to the passage or web page it came from.

## Download

Get the DMG from the [latest release](https://github.com/jiehaoZ/Cairn/releases/latest). So far it has only
been tested on Apple Silicon Macs.

The app is not notarized. If macOS says it is damaged or cannot be opened, run this once after
moving it to Applications:

```bash
xattr -dr com.apple.quarantine /Applications/Cairn.app
```

On first launch, open **Settings** and pick a model provider and key. Any provider
[pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai) supports will work.

Unconstrained models are not supported yet. A model is unconstrained when the provider cannot
force its reply to match a JSON Schema, so whether the format comes back right is up to the model.
Building one book takes about a hundred model calls, each of which needs well-formed structured
output, so Settings lists only models that support constrained (structured) output.

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

## Contributing

Bug reports and ideas are welcome in [issues](https://github.com/jiehaoZ/Cairn/issues). Before a
pull request, read [`AGENTS.md`](AGENTS.md): it lists the checks that must pass and the invariants
the pipeline depends on.

## License

Cairn is released under the [MIT License](./LICENSE).
