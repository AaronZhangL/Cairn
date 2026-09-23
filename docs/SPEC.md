# Cairn — product spec

2026-09-22 · the current product definition

Organised by module. Each section is one part of the system: what it does, the decisions inside
it, and what is deliberately left out. [ARCHITECTURE.md](./ARCHITECTURE.md) covers how the
modules fit together; [DESIGN.md](./DESIGN.md) covers how they look.

| § | Module | Where it lives |
| --- | --- | --- |
| 1 | What this is | — |
| 2 | Intake: shelf, parse, budget | `parse/`, `pipeline/budget.ts`, `AddBook.tsx` |
| 3 | Path generation | `pipeline/map` → `classify` → `reduce` → `recap` |
| 4 | Decks: slides and narration | `pipeline/slides.ts`, `tts.ts`, `build.ts`, `packages/ui` |
| 5 | Player: the three panes | `apps/desktop`, `packages/ui` |
| 6 | Companion | [`COMPANION.md`](./COMPANION.md) |
| 7 | Memory across books | Finished-book recall in the companion; generation use not built |
| 8 | Quality signals | `PathQuality` on each `LibraryEntry` |
| 9 | Boundaries | — |

---

## 1. What this is

**Turn an ebook into a path you can walk to the end, and walk it yourself.**

One owner, one machine, run locally.

### What it is not

- **Not a chat-first reading product.** The companion is a side path; **finishing the walk is the
  main line.**
- **Not a video generator.** Slides are data; the player is one way of rendering them.
- **Not a course platform.** There is no curriculum, no grading, no schedule.

It is also **not a knowledge base today** — but that is a matter of sequence, not principle. See
§7: remembering across books is a direction, and the one place a vector store would earn its
keep.

### How success is judged

There is no metric. The only honest signal: **does its owner reach for it again on a second
book.**

---

## 2. Intake: shelf, parse, budget

**A note on the word.** The code and these documents call one node of the path a *station*. The
reader sees 章, because that is the word they reached for. The two are not the book's own
chapters — those appear only in a quote's provenance, which says 原书第 N 章 to keep them apart.
The reader-facing noun lives in `packages/ui/src/copy.ts` so changing it stays one edit.

1. **Pick a book** — a local EPUB, TXT or Markdown file.
2. **Preview** — parse only, no model call, so picking a file stays instant: title, author,
   chapter count, word count.
3. **Pick a budget** — four rungs, described below.
4. **Generate** — per-chapter progress, interruptible, resumable from where it stopped.

**Deleting** is on the shelf row, behind a confirm, and takes the whole book: its path, decks,
audio, pipeline cache and stored reading position. Nothing is archived — this is one machine and
one owner, and a "deleted" book still occupying a gigabyte of audio would be a lie about disk.

The position has to go with it. Re-adding the same file produces the same id (`bookSlug` hashes
the path), so a kept position would resume the new path at a station that no longer exists.

### The budget is the constraint; the station count is the result

The reader picks how long the whole walk should take. `budget.ts` derives the station count and
how ruthless the selection should be. A tighter budget **drops whole stations** rather than
making each one shallower — a station that cannot make one thing clear is worth nothing.

The four rungs are fixed in intent, not in minutes:

| Rung | Intent | Coverage |
| --- | --- | --- |
| `quick` | Know roughly what it says | The spine argument only |
| `brief` | Get the key points | The spine plus the arguments holding it up |
| `solid` | Actually understand it | Concepts, arguments, representative examples |
| `full` | Walk the whole thing | Nearly all substantive content |

**Their durations are derived per book, never hardcoded.** A complete walk scales with the
square root of word count, anchored at two hours for a 200k-word book and clamped to 30–240
minutes: a book four times as long does not carry four times as many distinct ideas. Each rung
takes a share of that, with a minimum gap between rungs so four choices stay four choices on a
short book. Station count then follows from the target duration, capped by the book's own
chapter count — past roughly two stations per chapter, extra stations split hairs.

A rung whose arithmetic does not work out for this book is **still offered, but labelled**: for a
7-million-word serial, `quick` would put a million words behind each station, and the note says
so rather than hiding the option.

---

## 3. Path generation

```
parse     ebook → Chapter[]                      local, no model
chunk     reshaped into even map units           local
map       each chapter → ChapterNote             N model calls; the text is read exactly once
classify  book type                              1 call
reduce    ChapterNote[] → PathNode[] + stages    1–2 calls, bound by the budget
recap     the path's own briefs → closing node   1 call, reads the path, not the notes
```

### Structure comes from the real text

Station count and ordering derive from the table of contents plus the per-chapter notes. **The
model's pretraining memory is never used to decide structure**: it works for famous books and
turns into confident fabrication on the long tail. A wrong fact can be caught by someone who read
the book; a fabricated structure looks exactly like a real one.

Every station carries `sourceChapters`. Stations citing chapters that do not exist are dropped,
and the count is recorded (§8).

### Stages come from the path, not from the table of contents

The left pane groups by the path's **own** stages. The path has already reordered things: chapter
44 of Pro Git (reset and the three trees) becomes station 3, because it is a mental model that
belongs early. Grouping by the original structure would fight the actual order.

A stage name describes **what the reader is doing right now** — "build the model", "work through
the argument", "put it into practice" — not the table of contents.

### The path closes with a recap

The last station is the walk's own ending: it reconnects the stations into one line, says what
the book finally claims, and tells the reader they have finished. It is built from the path's own
station briefs rather than from the chapters, so it costs no second pass over the book. It quotes
nothing — it has no excerpts of its own, and an invented quotation is exactly what this pipeline
refuses to render.

### The path is decided in one go; the decks fill in behind you

What you wait for after picking a budget is the **path**, not every station. For a 200k-word book
at the full budget that is roughly 24 model calls against 36 more for the decks — the decks are
about six tenths of the wait.

So `reduce` installs the path immediately and the book appears on the shelf; the first station
follows and you start walking. Jump to station 10 and the queue re-orders to 10, 11, 12, with the
stations you skipped moved to the end rather than dropped.

**The path itself cannot be progressive.** `reduce` needs every chapter note before it can select
and order stations; adding stations as you read would let arrival time decide the station count
instead of the budget — the one thing the budget exists to decide. The station list is complete
from the first moment, with deckless stations marked pending.

---

## 4. Decks: slides and narration

### Why slides and not video

Slides are data, so one piece of content can render as a player, as plain text, and later as mp4
if it ever needs to. Commit to mp4 first and changing one page means re-rendering the whole
thing — and the text view stops being possible at all.

**Only the player is built.** No code today turns a `Slide` into text; the point is about what
the data model keeps available.

### Data model

```
PathNode {
  …
  slides:    Slide[]
  narration: NarrationCue[]
  audio:     { src, durationMs }
}

Slide        { id, layout, data, atMs }     // atMs = when it appears on the audio timeline
NarrationCue { text, startMs, endMs }       // drives the caption
```

### Layouts

| `layout` | Used for |
| --- | --- |
| `title` | Opening each station |
| `points` | Three claims at most |
| `number` | Experimental data, key ratios |
| `quote` | A line from the book |
| `compare` | A versus B |
| `flow` | A chain of reasoning or cause |
| `timeline` | A dated or staged progression |
| `matrix` | The same question asked of both sides |
| `relation` | Cause and effect, as the book states it |

Slides per station follow the station's length — roughly one per 22 seconds of narration, four
at the fewest and fourteen at the most (`slideCount`). A fixed cap of six left a four-minute
station holding one card for fifty seconds, which reads as a stall. `world` (a novel's setting)
is not built.

The last four draw only on material the map stage extracted verbatim — `figures`, `sequences`,
`contrasts`, `relations` on each `ChapterNote`. A chapter that yields none of a kind produces no
slide of that kind. These are the layouts that look most evidenced, so a fabricated one does the
most damage; the rule is enforced in the prompt and in normalization, not left to taste.

The reasoning behind each layout — what shape of claim it is for, and the decision inside it —
is in [DESIGN.md](DESIGN.md).

**No image-generation model is called.** Abstract ideas do not yield informative illustrations,
and a good deck is mostly type and simple diagrams anyway. Pictograms are not generated images:
`core/src/icons.ts` is a closed list of glyph names and `ui/src/slides/glyphs.ts` draws each with
a few stroked paths — local, offline, free, identical on every render. A slide's `icon` picks a
name from that list or leaves it empty.

Icons appear in exactly two places: `title` (so a station has a recognisable mark) and the two
halves of `compare` (so it is obvious which side is which). **Never on every bullet of `points`**
— the numbering already carries the rhythm. The list deliberately contains no abstract concepts:
"compounding" and "identity" have no honest glyph, and inventing one turns the deck into clipart.

### Generating and syncing

```
slides   PathNode + the ChapterNotes of its sourceChapters
           → Slide[] + a narration script split into sentences    1 call per station
             ↓
tts      narration script → mp3 + per-sentence timing             edge-tts, local, free
             ↓
         timings become NarrationCue[]; each slide's atMs aligns
         to the start of the sentence it belongs to
```

`edge-tts` emits sentence-level subtitles alongside the audio, and **both the caption and the
slide changes are driven from them** — nothing is timed by hand.

Captions are cut finer than narration sentences: `caption.ts` splits at clause punctuation, drops
the trailing mark, and enforces a minimum line length and on-screen time. A 40-character sentence
is the right unit for a script and the wrong one for a subtitle.

Quote provenance: `slides.ts` resolves each quote back to the `ChapterNote` excerpt it came from,
and the slide renders it. A quote it cannot locate says so on the slide.

Deck caching is keyed on **content, not position**: `deckKey()` fingerprints the station, because
`reduce` is not deterministic and one audio directory is shared by every budget.

---

## 5. Player: the three panes

### The deck plays like a video

The centre pane is a player. Nothing shows over the frame but a progress line until the pointer
moves; the controls fade in on the frame itself and fade out again after 2.5 seconds idle, or
300ms after the pointer leaves. They stay up while paused, because pausing means looking for
something.

Play/pause, volume with mute, elapsed and total, playback rate, slide count, fullscreen —
all bare marks with no container, so the strongest thing on screen stays the slide. Keyboard:
space, ← / → to seek (hold to rewind or to speed up), ↑ / ↓ volume, `m` mute, `f` fullscreen.

Fullscreen goes through the frame's centring wrapper, so the slide keeps its 16:9 and
letterboxes rather than stretching to the display's shape.

```
┌──────────┬────────────────────────────┬──────────────┐
│ Progress │        Slide (16:9)        │     Ask      │
│          │                            │              │
│ Model    │                            │  ┌────────┐  │
│  ✓ 1     │        Anchoring           │  │ quoted │  │
│  ✓ 2     │                            │  └────────┘  │
│  ● 3     │   The first number you     │  What does   │
│    4     │   hear hijacks every       │  this mean?  │
│          │   judgement after it       │              │
│ Argument ├────────────────────────────┤  A: …        │
│    5     │ Caption (one line at a time)│  ch. 11     │
│    …     │ ▶ ━━━━━━━──────  1:14/3:12 │  [input]     │
└──────────┴────────────────────────────┴──────────────┘
```

| Pane | Contents | Behaviour |
| --- | --- | --- |
| **Left: progress** | Every station, grouped by the path's stages, in three states: walked / current / ahead | Click to jump. This is a personal tool; skipping is not gated |
| **Centre: slide** | The current deck, with caption and transport below | Plays and advances itself |
| **Right: ask** | Questions from a selection or typed freely, answers, provenance | Asking pauses narration; it does not resume automatically |

### The reader sets the pace

- `←` `→` previous / next slide
- `↓` `↑` previous / next station
- `space` pause and resume
- **Click the slide** to pause and resume. A deck plays like a video, so the frame is the pause
  target; there is no play button below it. A drag that selects caption text is a quote, not a
  pause, so a live selection does not toggle playback.
- Select text in the caption or on the slide → the right pane picks it up as a quote

### Asking pauses, answering does not resume

Asking means attention has already left the main line; resuming automatically would make the
reader miss what just played. Resuming is the reader's own keypress.

### Closing the app does not lose your place

Which book, which station, which second — remembered per book. The next launch reopens the last
book where it stopped, **paused**: being dropped into the middle of a sentence unannounced is
worse than pressing play. A position in the first or last few seconds of a station starts that
station over, because resuming there buys nothing. Going back to the shelf is deliberate, so the
launch after that opens on the shelf; each book's position is still kept.

---

## 6. Ask: three layers

> **Historical design, superseded by [`COMPANION.md`](./COMPANION.md).** This section describes
> the retired ask pane, not the current implementation.

| Layer | Trigger | Mechanism | Calls |
| --- | --- | --- | --- |
| **Anchored** | Select a passage and ask | The station's `sourceChapters` already point at the text — no retrieval | 1 |
| **Whole book** | Type a question | Every `ChapterNote` *is* the index (~20k tokens for a 200k-word book); the model picks chapters, then they load | 2 |
| **Outside** | Only when the first two cannot answer **and the reader says yes** | Tavily, rendered as a separate block with its sources | 1 + search |

### Three hard rules

1. A question about the book is answered from the book. If it cannot be, say so — **never
   quietly go outside.**
2. Going outside is the reader's click, not the model's decision.
3. **Book-sourced and web-sourced content render separately and are never merged.** The reader
   has not read the book; merged into one paragraph, the two become indistinguishable.

Reader questions hold background deck building for their duration — both go through the same
codex pool, and only one of them is being watched.

### Why no retrieval inside one book

The pipeline is **sweep-driven**: every chapter is read exactly once, in a fixed order. Retrieval
answers "find the relevant piece among many", and here we do not pick — we sweep. The list of
`ChapterNote`s is the index, and it fits: ~18k tokens for a 200k-word book, ~42k for a 500k-word
one. What crosses the line is a serial of a thousand chapters or more.

For a book that size the bottleneck is still not retrieval. `map` is linear in chapter count, so
2300 chapters is roughly 580 calls, and retrieval cannot remove them: a complete sweep is the
point, and skipping `map` would leave `reduce` ordering stations from chapters the model never
read. The answer there is **hierarchical summarisation**: fold every 20 `ChapterNote`s into a
volume note, let `reduce` read the volume list (2300 chapters → 115 entries), and drill down for
detail. About N/20 extra calls, and just another `runJob`.

### Why not MCP

One web search is a function, not a protocol. MCP earns its keep when tools are many and
unpredictable — Obsidian, Zotero, later. We also do not use codex's own search: letting the model
decide when to search means we no longer know what it searched or which sentence came from the
web, and labelling the source is the entire value of the feature.

---

## 7. Memory across books — companion recall built

The companion can recall stations from paths the reader has finished, with citations back to
each book and station. Using that memory while generating new paths or slides remains planned.
The following design notes describe the longer-term direction.

- Every completed path, its station briefs, and the quotes kept are retained across books.
- When `slides` builds a station, or `ask` answers a question, prior material that genuinely
  connects is surfaced and **cited as prior reading** — "you met this as X in *Thinking, Fast and
  Slow*" — so new knowledge attaches to old instead of arriving unanchored.
- This is where a vector store finally earns its place. Retrieval across **one** book is
  unnecessary (§6), because the index fits in context. Retrieval across **a library of books read
  over years** does not fit, and is exactly the "find the relevant piece among many" problem
  embeddings are for.

Constraints it must respect when built:

1. Prior-reading material is a **third source**, rendered distinctly from book-sourced and
   web-sourced content (§6, rule 3). Three kinds of provenance, three renderings.
2. It never decides structure. Station count and ordering still come from the current book's real
   text alone.
3. It stays local, like everything else.

`ChapterLocator` already returns a `ChapterRef` with an optional `bookId` — that is the seam.

---

## 8. Quality signals

Every run records four numbers on the `LibraryEntry`, all of which should be 0:

| Signal | Meaning |
| --- | --- |
| `dropped` | Stations citing chapters that do not exist |
| `retries` | Times the path was regenerated for overrunning the budget |
| `failed` | Decks that never built |
| `unsourcedQuotes` | Quote slides whose text was not found in any chapter excerpt |

They are recorded, not recomputed. With no completion metric, they are the only objective way to
tell whether a prompt change made things better or worse.

---

## 9. Boundaries

| Not doing | Why |
| --- | --- |
| Sharing / publishing / accounts / telemetry / a networked server | Personal tool |
| PDF parsing | Scanned pages, OCR, two-column layouts, no chapter structure: too expensive |
| mp4 rendering | The slide player replaces it |
| Image generation | Abstract ideas do not yield informative illustrations |
| MCP | One search is not worth a protocol |
| Spaced repetition | Conflicts with "you walk it, then you are done" |
| Retrieval **within** one book | The index fits in context (§6). Retrieval **across** books is a separate question, and the answer there is yes (§7) |

**Not built yet, but in scope:** the `world` layout (a novel's setting); the plain-text
rendering of a deck; cross-book memory (§7); pruning the pipeline cache — content-addressed keys
mean every regeneration adds a fresh set of entries and audio, and nothing removes the old ones.
