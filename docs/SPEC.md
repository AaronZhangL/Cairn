# Cairn — product spec

2026-09-21 · supersedes [PRD-v0.md](./PRD-v0.md) as the current product definition

> PRD-v0.md and ARCHITECTURE.md are kept as **decision records**: their arguments — why the
> WeChat Reading API was dropped, why nothing renders to mp4, why there is no image generation —
> still hold. Their product framing (moat, completion-rate criterion, ten strangers) does not.
> That was a pitch written for a co-founder; this is a tool its owner uses alone.

---

## 1. What this is

**Turn an ebook into a path you can walk to the end, and walk it yourself.**

One user, one machine. No sharing, no publishing, no accounts, no telemetry, no server.

### What it is not

- **Not a learning platform.** No knowledge base, no RAG infrastructure, no MCP tool ecosystem.
  DeepTutor does that well, but it asks you to be a serious student.
- **Not a chat-based reading assistant.** Asking questions is a side path; **finishing the walk
  is the main line.**
- **Not a video generator.** Slides are data; the player is one way of rendering them.

### How success is judged

There is no metric. The only honest signal: **after it is built, does its owner reach for it
again on a second book.**

---

## 2. The main window: three panes

```
┌──────────┬────────────────────────────┬──────────────┐
│ Progress │        Slide (16:9)        │     Ask      │
│          │                            │              │
│ Model    │                            │  ┌────────┐  │
│  ✓ 1     │        Anchoring           │  │ quoted │  │
│  ✓ 2     │                            │  └────────┘  │
│  ● 3     │   The first number you      │  What does   │
│    4     │   hear hijacks every        │  this mean?  │
│          │   judgement after it        │              │
│ Argument ├────────────────────────────┤  A: …        │
│    5     │ Caption (one line at a time)│  ch. 11      │
│    …     │ ▶ ━━━━━━━──────  1:14/3:12 │  [input]     │
└──────────┴────────────────────────────┴──────────────┘
```

| Pane | Contents | Behaviour |
| --- | --- | --- |
| **Left: progress** | Every station, **grouped by the path's own stages** (not the book's parts and chapters), in three states: walked / current / ahead | Click any station to jump straight there. This is a personal tool; skipping is not gated |
| **Centre: slide** | The current station's deck, with the caption and transport below | Plays and advances itself; `←` `→` seek, `space` pauses |
| **Right: ask** | Questions from a selection or typed freely, answers, and provenance | Asking **pauses the narration**; it does not resume automatically |

### Stages come from the path, not from the table of contents

The left pane groups by the path's **own** stages rather than the book's parts. The path has
already reordered things: chapter 44 of Pro Git (reset and the three trees) becomes station 3,
because it is a mental model that belongs early. Grouping by the original structure would fight
the actual order.

A stage name should describe **what the reader is doing right now** — "build the model",
"work through the argument", "put it into practice" — not restate the table of contents.

### The reader sets the pace

- `←` `→` previous / next slide
- `↓` `↑` previous / next station
- `space` pause and resume
- **Click the slide** to pause and resume. A deck plays like a video, so the frame is the pause
  target; there is no play button below it. A drag that selects caption text is a quote, not a
  pause, so a live selection does not toggle playback.
- Click any station in the left pane to jump
- Select text in the caption or on the slide → the right pane picks it up as a quote

### Closing the app does not lose your place

Which book, which station, which second — remembered per book. The next launch reopens the last
book where it stopped, **paused**: being dropped into the middle of a sentence unannounced is
worse than pressing play. A position in the first few seconds or the last few of a station starts
that station over instead, because resuming there buys nothing. Going back to the shelf is
deliberate, so the launch after that opens on the shelf; the position in each book is still kept.

### The path closes with a recap

The last station is not a chapter — it is the walk's own ending. It reconnects the stations into
one line, says what the book finally claims, and tells the reader they have finished. It is built
from the path's own station briefs rather than from the chapters, so it costs no second pass over
the book, and it quotes nothing: it has no excerpts of its own, and an invented quotation is
exactly what this pipeline refuses to render.

### One interaction decision

**Asking a question pauses the narration, and answering does not resume it.** Asking means
attention has already left the main line; resuming automatically would make the reader miss what
just played. Resuming is the reader's own keypress.

---

## 3. The whole flow

1. **Pick a book** — a local EPUB, TXT or Markdown file. It never leaves the machine.
2. **Pick a budget** — 10 minutes / 30 minutes / 1 hour / 2 hours. The options depend on the
   book's size, and a budget that would distort this book is offered but labelled (`budget.ts`).
3. **Generate the path** — per-chapter progress, interruptible, resumable from where it stopped.
4. **Walk it** — the three-pane window opens as soon as station 1 is playable; the rest are
   built behind you, in the order you are walking them.
5. **Finish** — completion feedback and a review of the quotes worth keeping.

### The path is decided in one go; the stations fill in behind you

What you wait for after picking a budget is the **path** (map + classify + reduce), not every
station. For a 200k-word book at the two-hour budget that is roughly 24 model calls against 36
more for the decks — the decks are about six tenths of the wait.

So `reduce` installs the path immediately and the book appears on the shelf; the first station
follows and you start walking. Jump to station 10 and the queue re-orders to 10, 11, 12, with
the stations you skipped moved to the end rather than dropped.

**The path itself cannot be progressive.** `reduce` needs every chapter note before it can
select and order stations; adding stations as you read would let arrival time decide the station
count instead of the budget, which is the one thing the budget exists to decide. The station
list is complete from the first moment, with stations that have no deck yet marked pending.

### 路径一次确定，站点渐进建成

选完预算后要等的是**路径**（map + classify + reduce），不是全部站点。以 20 万字的书、2 小时预算为例，
路径约 24 次模型调用，全部站点要再加 36 次——占整段等待的六成。

所以 reduce 一出结果就把路径落盘，书立刻出现在书架上；第一站建好就能开始走，后面的站在后台继续。
读者跳到第 10 站时，队列重排成 10、11、12，被跳过的站排到末尾而不是丢掉。

**路径本身不能渐进。** reduce 要拿到全部章节摘要才能选站和排序；边读边加站等于让"到达时间"决定站数，
而不是预算决定——那正是要守住的那条。站点列表从一开始就完整显示，没建好的标"准备中"。

---

## 4. Slides and narration

### Why slides and not video

Argued in ARCHITECTURE.md §4, and the conclusion stands: slides are data, so one piece of
content renders as a player, as plain text, and later as mp4 if it ever needs to. Commit to mp4
first and changing one page means re-rendering the whole thing — and the text view stops
existing.

### Data model

```
PathNode {
  …existing fields…
  slides:    Slide[]
  narration: NarrationCue[]
  audio:     { src, durationMs }
  text:      string          // the text view: the same content, another rendering
}

Slide        { id, layout, data, atMs }     // atMs = when it appears on the audio timeline
NarrationCue { text, startMs, endMs }       // drives the caption
```

### Layouts

No image-generation model is called. Abstract ideas do not yield informative illustrations, and
a good deck is mostly type and simple diagrams anyway.

**Pictograms are not generated images.** `packages/core/src/icons.ts` is a closed list of glyph
names, and `packages/ui/src/slides/glyphs.ts` draws each one with a few stroked paths — local,
offline, free, and identical on every render. A slide's `icon` field only picks a name from that
list, and leaves it empty when nothing fits.

Icons appear in exactly two places: `title` (so a station has a mark you can recognise) and the
two halves of `compare` (so it is obvious which side is which). **Never on every bullet of
`points`** — the numbering already carries the rhythm, and an icon per line is noise. The list
also deliberately contains no abstract concepts: "compounding" and "identity" have no honest
glyph, and inventing one turns the deck into clipart.

| `layout` | Used for |
| --- | --- |
| `title` | Opening each station |
| `points` | Three claims at most |
| `number` | Experimental data, key ratios |
| `quote` | A line from the book |
| `compare` | A versus B |
| `flow` | A chain of reasoning or cause |

Three to five slides per station. `relation` / `timeline` / `world` (for novels) are not built
in this version.

### Generating and syncing

```
slides stage   PathNode + the ChapterNotes of its sourceChapters
                 → Slide[] + a narration script, split into sentences   1 LLM call per station
                                 ↓
tts stage      narration script → mp3 + per-sentence timing             edge-tts, local, free
                                 ↓
               timings become NarrationCue[], and each slide's
               atMs aligns to the start of the sentence it belongs to
```

`edge-tts` emits sentence-level subtitles alongside the audio, and **both the caption and the
slide changes are driven from them** — nothing is timed by hand.

Captions are cut finer than the narration sentences: `caption.ts` splits at clause punctuation,
drops the trailing mark, and enforces a minimum line length and on-screen time. A 40-character
sentence is the right unit for a script and the wrong one for a subtitle.

---

## 5. Asking questions — three layers

| Layer | Trigger | Mechanism | Calls |
| --- | --- | --- | --- |
| **Anchored** | Select a passage and ask | The station's `sourceChapters` already point at the text — **no retrieval** | 1 |
| **Whole book** | Type a question | Every `ChapterNote` *is* the index (~20k tokens for a 200k-word book); the model picks chapters, then they load | 2 |
| **Outside** | Only when the first two cannot answer **and the user says yes** | A search API of our own, rendered as a separate block with its sources | 1 + search |

### Three hard rules

1. A question about the book is answered from the book. If it cannot be, say so —
   **never quietly go outside.**
2. Going outside is the reader's click, not the model's decision.
3. **Book-sourced and web-sourced content render separately and are never merged.** The reader
   has not read the book; merged into one paragraph, the two become indistinguishable.

### Why not RAG

The pipeline is **sweep-driven**: every chapter is read exactly once, in a fixed order. RAG
solves "find the relevant piece among many", and we do not pick — we sweep. The list of
`ChapterNote`s is the index.

A vector store earns its place when **the index itself no longer fits in context**: ~18k tokens
for a 200k-word book fits easily, and so does an ordinary long non-fiction book (500k words,
~200 chapters, ~42k tokens). What crosses the line is a serial of a thousand chapters or more —
around 2300 chapters and 290k tokens.

For a book that size the bottleneck is **not retrieval**. `map` is linear in chapter count, so
2300 chapters is roughly 580 calls, and RAG cannot remove them: invariant 6 wants one complete
sweep, RAG offers "only the relevant part". Skipping `map` would leave `reduce` ordering
stations from chapters the model never read — invariant 4, failing silently.

The answer for that day is **hierarchical summarization, not embeddings**: fold every 20
`ChapterNote`s into one volume note, let `reduce` read the volume list (2300 chapters → 115
entries, which fits again), and drill down for detail. It costs about N/20 extra calls and keeps
all three guarantees — structure from real text, the book read once, provenance intact — each of
which a vector store would weaken. It is also just another `runJob`, so it is nearly no new code.

The `ChapterLocator` interface is already there for that day; it returns a `ChapterRef` carrying
an optional `bookId`, which is also the seam for asking across several books at once.

### Why not MCP

One web search is a function, not a protocol. MCP earns its keep when tools are many and
unpredictable — Obsidian, Zotero, later.

More importantly, we also do not use codex's own search. Letting the model decide when to search
means we no longer know what it searched or which sentence came from the web — and labelling the
source is the entire value of the feature.

---

## 6. Pipeline status

```
parse     ebook → Chapter[]                      done, verified on real books
chunk     reshaped into even map units           done
map       each chapter → ChapterNote             done; quotes matched verbatim 35/36
classify  book type                              done
reduce    ChapterNote[] → PathNode[]             done, budget-constrained
budget    budget → station count and coverage    done
slides    PathNode → Slide[] + narration script  done
tts       script → mp3 + timeline                done
build     per-station decks, resumable           done; content-keyed cache
scheduler decks in the order you walk them      done, prefetching ahead of the reader
ask       three layers                           done
```

Verified on Pro Git (Chinese, 202k words, 86 chapters):

| Budget | Stations | Length | Within target |
| --- | --- | --- | --- |
| 10 minutes | 4 | 12 min | yes |
| 30 minutes | 9 | 32 min | yes |
| 2 hours | 36 | 125 min | slightly over, within tolerance |

315 tests pass; four TypeScript strict typechecks are clean.

Every run records four quality signals, all of which should be 0: `dropped` (stations citing
chapters that do not exist), `retries`, `failed`, and `unsourcedQuotes` (quote slides whose text
could not be found in any chapter excerpt). With no completion metric available, these are the
only objective way to tell whether a prompt change made things better or worse.

---

## 7. Technical shape

**An Electrobun desktop app, Mac first.** No web build: `codex exec` and `edge-tts` both need a
local process, and with nothing being shared there is no reason to deploy one.

```
packages/core/    Domain types, parsing, pipeline, LLM — no framework dependencies
packages/ui/      React components and design tokens, slide layout renderers
apps/desktop/     The Electrobun shell and the three-pane window
```

The LLM runs as a local `codex exec` subprocess. Each call carries roughly 18k tokens of agent
harness overhead, far more than the chapter text itself — which is why the map stage batches
chapters. Everything sits behind the `LlmProvider` interface, so swapping in an HTTP provider is
a one-file change.

---

## 8. Explicitly not doing

| Not doing | Why |
| --- | --- |
| Sharing / publishing / accounts / telemetry / a server | Personal tool |
| Novel mode (world, storyline, character relations) | Not this version. Following a serial is measured in *progress*, not in *whole books* — that is a different product |
| PDF parsing | Scanned pages, OCR, two-column layouts, no chapter structure: too expensive |
| mp4 rendering | The slide player replaces it |
| Image generation | Abstract ideas do not yield informative illustrations |
| RAG infrastructure / vector store | The index fits in context |
| MCP | One search is not worth a protocol |
| Spaced repetition | Conflicts with "you walk it, then you are done" |
| English UI | A later iteration |

---

## 9. Settled technical choices

| Item | Choice |
| --- | --- |
| Search API | **Tavily** |
| Narration voice | **`zh-CN-YunjianNeural`** — Microsoft tunes it for audiobooks and commentary |
| Desktop shell | **Electrobun directly**, with no web-first step |
| Left-pane grouping | **The path's own stages** (see §2) |
| Chat surface | **assistant-ui** (MIT, active) — its shell only |

### About the chat surface

assistant-ui supplies the **container**: scrolling, stick-to-bottom, the input, streaming text,
markdown. **The message bodies are ours**, because our answers are structured objects rather
than a markdown stream:

```
Answer        { text, grounded, sourceChapters, suggestion }
OutsideAnswer { text, citations, empty }
```

None of what we need exists in a general chat library: the quoted-selection block, the clickable
chapter chip that jumps back, **the separation between book and web**, and the "shall I go look
it up?" confirmation. The last two are where §5's rules land in the interface, and a generic
component would flatten them.

Everything unneeded is turned off: tool-call UI, attachments, multimodal.

Why not the Vercel AI SDK: its `useChat` assumes the model sits behind an HTTP streaming
endpoint, while ours is a local codex subprocess over IPC. assistant-ui's runtime is pluggable,
so it connects. CopilotKit is a full agent frontend stack with its own runtime and backend
assumptions — too much for a tool one person uses.

---

## 10. What is next

The pipeline and the window are built. What remains is use:

1. **Walk a book end to end and fix what annoys you.** That is the only signal this project has.
2. **Novel layouts** (`timeline`, `relation`, `world`) whenever they are wanted — no longer
   blocked by anything but the decision to build them.
3. **Pruning the pipeline cache.** Content-addressed keys mean every regeneration of a book adds
   a fresh set of entries and audio; nothing removes the old ones yet.
