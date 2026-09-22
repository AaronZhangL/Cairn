# Cairn — v0 architecture

2026-09-21 · originally: a desktop-first web app, later packaged for Mac and Windows with
Electrobun

> **Decision record.** This describes the v0 that was planned, not the tool that exists. Its
> product framing — BYOK, two entry points, ten strangers, completion rate as the only
> deliverable — has been superseded by [SPEC.md](./SPEC.md). The *reasoning* below still holds
> and is why several things are the way they are: why nothing renders to mp4, why there is no
> image generation, why the pipeline is a resumable state machine, why `sourceChapters` exists.
> Read it for the arguments, not for the plan.
>
> Prior document: [PRD-v0.md](./PRD-v0.md).
>
> **No mobile layout.** Two hours of study is something you do at a desk, not on a train, and
> desk sessions have markedly higher completion rates anyway.

## 1. The core conclusion: no backend

BYOK forced the whole architecture:

```
the user brings their own LLM key
  → the key must not reach a server (custody liability, and users will not paste it)
  → the key stays in the browser
  → LLM calls go out from the browser
  → there is no backend
```

What follows from it:

| Benefit | Detail |
| --- | --- |
| Copyright risk disappears | The book is parsed in the browser and never uploaded. The PRD's "store no source text, never reuse across users" is guaranteed by the architecture rather than by discipline |
| No key custody | The key only ever reaches localStorage |
| No operations | Static assets; the Cloudflare Pages free tier is enough |
| Fast to build | v0 exists to get data within a week, not to build a system |

**The only server-side component** is analytics collection, because completion rate cannot prove
itself on the client. It is a stateless Worker that **receives anonymous progress events only,
and never sees a book title, book content, or a user identity.**

The single exception is TTS: `edge-tts` runs under Bun and the browser cannot call it. It lives
as a local script (`scripts/tts.ts`) that only we run on the authoring side — never a hosted
service. See §6.

## 2. Two entry points, one codebase

### Why

**Ten strangers should not have to apply for an LLM API key in order to walk a path.**

If the reading side required BYOK, the completion-rate data would be contaminated by the signup
funnel — it would measure "how many people will configure a key", not "how many people will walk
to the end". The PRD is explicit: v0 validates completion, not acquisition.

### The split

| | `/studio` (authoring) | `/p/:id` (reading) |
| --- | --- | --- |
| Who uses it | Us | The strangers being tested |
| Needs an API key | Yes | **No** |
| Needs an upload | Yes | **No** |
| Job | Upload → parse → compress → generate path and slides → export a bundle | Load the bundle → walk it → emit events |

A stranger's whole flow is: **click a link, start.** No onboarding at all.

Node expansion and narration audio are pre-generated on the authoring side and baked into the
bundle, so **the reading side never needs a key.**

## 3. The constraint is the time budget, not the node count

**The promise is "walk it in two hours", and completion rate is governed directly by total
length. So length is the constraint and the node count is the result.**

The node count comes from **the table of contents plus the per-chapter summaries produced by the
map stage** — both derived from the real text.

> **The model's pretraining memory is never used to decide structure.**
> The PRD records why the original approach was abandoned: memory works for famous books and
> turns into confident fabrication on the long tail. Letting memory decide how many nodes a path
> has, or where it cuts, moves that dependency from the content layer back to the structural
> layer — and hides it better. **A wrong fact can be caught by someone who read the book; a
> fabricated structure looks exactly like a real one.**

### Constraint parameters

- Target total length: **100–120 minutes**
- Three to five slides per station, two to four minutes of narration
- `reduce` must emit `estMinutes` and `sourceChapters` for every node
- **Hard ceiling: over 150 minutes total → force a merge and re-run reduce once**

The ceiling is experimental design, not fastidiousness. If a book produced a five-hour path,
completion would approach zero and **the measurement would be "too long", not "is this path
well designed"**. Length would contaminate v0's only metric.

## 4. The form: slides and narration, not plain text

The PRD's central judgement is that most people would rather consume pictures and video, and
that text is a higher barrier. So **a station's main view is a set of auto-playing slides with
narration**, and text is the alternate view, not the primary one.

### Video is a playback experience, not a file format

**No mp4 rendering; a synchronised slide-and-audio player instead.** Four reasons:

1. **A zero-backend app cannot render it.** ffmpeg.wasm rendering 100 minutes of video in a
   browser is not realistic, and rendering server-side means uploading the book — which brings
   every copyright risk back.
2. **Changing one page would mean re-rendering everything.** Slides are data; changing a page is
   changing one piece of JSON.
3. **Completion rate would become meaningless.** In one long mp4, "finished" degrades into
   "played to the end", and dragging the scrubber is enough to fake it. Per-station events are
   the only metric and cannot be fuzzy.
4. **The feel of video does not require mp4.** Auto-advancing slides, narration, and moving into
   the next station on its own *is* watching a video — except it can be skipped, searched,
   copied, and switched to text.

If mp4 is ever genuinely needed (to drive traffic on Bilibili or Xiaohongshu) it becomes an
**export feature**, rendered once server-side, not the core form.

### No image generation

Generated illustrations are close to useless for abstract ideas — draw "the anchoring effect"
and you get something pretty and uninformative. A good deck is mostly type and diagrams anyway.

Slides are **structurally generated layouts** rendered with React and SVG, with no image model:
free, instant, stylistically consistent, and traceable page by page.

| `layout` | Used for | Applies to |
| --- | --- | --- |
| `title` | Opening each station | Both |
| `points` | Three claims at most | Both |
| `number` | Experimental data, key ratios | Knowledge |
| `quote` | A line from the book | Both |
| `compare` | A versus B | Knowledge |
| `flow` | A chain of reasoning or cause | Knowledge |
| `relation` | Character relationships | Novels |
| `timeline` | Storyline | Novels |
| `world` | Worldbuilding | Novels |

## 5. Navigation: focus mode as the spine, overview as support

Chosen after comparing three options (see the design review):

- **Spine: focus mode.** One station at a time, no sidebar. `←` `→` to move through slides, `↓`
  for the next station, `space` to pause, `O` for the overview. There is no way to skip ahead,
  so **"finished" is unambiguous and the analytics stay clean.**
- **Support: path overview.** A separate page, summoned with `O`, shown at the start, after each
  part, and at the end. It supplies the two things focus mode lacks: a sense of place, and the
  picture of a path walked.
- **Rejected: left-pane path, right-pane content.** A sidebar invites skipping, which conflicts
  with the only metric — and it looks like every documentation site.

> Superseded: the current app uses exactly the rejected layout. With no experiment to protect,
> a sidebar costs nothing and jumping around is a feature, not a leak.

## 6. The pipeline

```
parse     ebook → Chapter[]                 local only, no LLM
  ↓
map       each chapter → ChapterNote        N LLM calls; the text is read exactly once
  ↓
classify  all gists → book type             1 call
  ↓
reduce    all ChapterNotes → PathNode[]     1–2 calls, bound by the time budget
  ↓
slides    each station → Slide[] + script   N calls
  ↓
tts       script → mp3 + caption timeline   local bun script, edge-tts, free
  ↓
bundle    Path JSON + mp3 → a package the reading side can load
```

A 300k-word book is 50–100 chapters, so the map stage is 50–100 calls. This is the most fragile
part of the system and has to be written as a **resumable task state machine**, never as one
`await Promise.all`:

- **Each chapter's summary is persisted the moment it lands**, so a refresh loses nothing
- **Concurrency capped at 4**, exponential backoff on failure, one chapter's failure isolated
- **Progress visible per chapter** (chapter 37 of 82), not a spinner
- An interrupted run resumes from where it stopped

### TTS

`edge-tts` rides Microsoft Edge's read-aloud service: **free, no key, and Chinese voices close
to human.** Use `zh-CN-YunjianNeural` (tuned for audiobooks and commentary) or
`zh-CN-XiaoxiaoNeural` (better for explanatory material).

Not the browser's own `SpeechSynthesis`: its voice varies with the user's operating system, so
**ten testers would hear different things and their completion rates would not be comparable.**

Volume: 34 stations × 3 minutes ≈ 25k characters per book. Free on edge-tts; roughly ¥7.5 per
book on Alibaba Cloud.

Risk: an unofficial endpoint that could be rate-limited or shut off. Switching to Alibaba Cloud
or Volcano at that point costs acceptably little.

## 7. Data model

```
Book        { id, title, author, type: 'knowledge'|'narrative', chapterCount, createdAt }
Chapter     { id, bookId, idx, title, text, wordCount }   // text only in IndexedDB, never in a bundle
ChapterNote { chapterId, gist, keyPoints[], quotes[] }     // map output

Path        { id, bookId, title, type, nodes[], totalMinutes, generatedAt }
PathNode    {
  id, idx, title, kind,
  slides: Slide[],
  narration: NarrationCue[],     // caption timeline; drives slide changes and highlighting
  audio: { src, durationMs },
  text,                          // the text view: the same data, another rendering
  sourceChapters: number[],      // provenance
  estMinutes,
  children: PathNode[]           // one pre-generated level of expansion
}
Slide         { id, layout, data, atMs }        // atMs = when it appears on the audio timeline
NarrationCue  { text, startMs, endMs }
Progress      { pathId, currentIdx, doneIds[], startedAt, finishedAt }
```

**`sourceChapters` is the key hedge against hallucination**, and it costs almost nothing: every
station can be traced back to the text.

**`Chapter.text` never enters an exported bundle.** Exports carry derived content only.

**Slides are data, not video**, so one piece of content renders as a player, as text, and later
server-side as mp4.

## 8. Project structure

Borrowed from [deer-flow/llm-space](https://github.com/deer-flow/llm-space)'s monorepo
boundaries — the right shape for "web first, desktop later". **Copy its directory boundaries,
not its engineering scale** (we skip husky, lint-staged, release scripts and a plugin system;
those would eat the time that validates completion rate).

```
packages/
  core/          Domain types, parsing, pipeline, LLM clients, storage — no framework deps
    parse/       epub.ts  txt.ts  markdown.ts
    llm/         client.ts  providers/
    pipeline/    job.ts  map.ts  classify.ts  reduce.ts  slides.ts  prompts/
    store/       Dexie schema
  ui/            Shared React components and design tokens (slide renderers live here)
apps/
  web/
    studio/      Authoring
    reader/      Reading
  desktop/       Electrobun shell — a placeholder; not built in v0
scripts/
  tts.ts         Local batch generation with edge-tts
```

**Boundary rule: `apps/web/reader` must not import `core/parse`, `core/llm` or
`core/pipeline`.** Enforced with an ESLint rule. It is what guarantees the reading side never
needs a key and stays small.

### Technology choices

| Layer | Choice | Why |
| --- | --- | --- |
| Language and tooling | TypeScript + Bun | Matches the reference project; quick to start |
| Build | Vite | Small output |
| UI | React + Tailwind + shadcn/ui | Authoring can lift components directly; reading uses tokens only |
| Motion | Motion | A sense of achievement is made of animation — slide transitions, completion feedback |
| Local storage | Dexie (IndexedDB) | Source text runs to several MB |
| EPUB parsing | JSZip + DOMParser | We only need the text; epub.js brings a whole rendering engine |
| Desktop shell | **Electrobun** (later) | Matches the reference project; v0 only reserves the directory |
| Deployment | Cloudflare Pages | Static hosting and the analytics Worker on one platform |

The reading side takes no component library: their default aesthetic is "forms and tables", and
what we need is a path someone wants to walk. A full mobile component library also starts at
200KB compressed, where the reading side can stay under 50KB.

## 9. Analytics (v0's only deliverable)

```
path_opened    { sessionId, pathId, ts }
node_done      { sessionId, pathId, nodeIdx, ts }
node_expanded  { sessionId, pathId, nodeIdx, ts }
mode_switched  { sessionId, pathId, nodeIdx, to: 'audio'|'text', ts }
path_finished  { sessionId, pathId, ts }
```

- `sessionId` is a random string generated on the device and carries no identity
- **No book title, node title, or book content is ever reported**
- Completion rate = distinct `path_finished` sessions / distinct `path_opened` sessions
- The distribution of `node_done` matters just as much: **which station people drop at** is more
  instructive than the final percentage
- `mode_switched` tests the PRD's central assumption: would people genuinely rather listen than
  read

## 10. Technical risks to verify

1. ~~Whether Chinese LLM vendors allow direct browser calls (CORS).~~ **Verified 2026-09-21.**
   A CORS preflight against each vendor (`OPTIONS` + `Origin` +
   `Access-Control-Request-Headers: authorization`):

   | Vendor | Preflight | `Authorization` header |
   | --- | --- | --- |
   | DeepSeek | 200 | allowed |
   | Moonshot Kimi | 204 | allowed |
   | Tongyi DashScope | 200 (`*`) | allowed |
   | Zhipu GLM | 200 | allowed |
   | OpenAI | 200 | allowed |

   All four Chinese vendors echo `Access-Control-Allow-Origin` and permit the `authorization`
   header. **Zero-backend holds: no forwarding Worker is needed and no key touches our servers.**
   Remaining: a passing preflight does not strictly guarantee the actual `POST` response carries
   CORS headers. One real request with a key settles it.

2. ~~WeChat's in-app browser and its file-picker restrictions.~~ **Not applicable** — v0 is not
   opened inside WeChat, and there is no mobile layout.

3. **edge-tts stability.** An unofficial endpoint. If rate-limited, switch to Alibaba Cloud or
   Volcano at roughly ¥7.5 per book.

4. **IndexedDB capacity and stability on Safari.** Losing source text is acceptable — it can be
   re-uploaded — but **progress must not be lost**; progress is also written to analytics, and
   the server copy wins.

## 11. Explicitly out of scope for v0

- PDF parsing
- mp4 rendering (the slide player replaces it; video export is a later feature)
- Image generation
- **Novel mode** — the layouts are reserved in the data model, but v0 does not build them. See
  below
- The platform paying for LLM calls
- Reusing output across users
- Spaced repetition
- Overlaying WeChat Reading highlights (second batch, lazy-loaded; the `quote` layout already
  has a place for it)
- User accounts
- The Electrobun desktop build (directory placeholder only)
- Storing book content server-side (the architecture has no such path)

### Why novels are not in v0

Speed-reading novels is a real need, and a bigger one than the PRD first judged — **the show is
airing, everyone is discussing it, and you want the plot without reading the book.** For someone
who has decided not to read it, spoilers *are* the product, not a side effect.

But it is **a different product with a different metric**:

| | Knowledge | Long serials |
| --- | --- | --- |
| Unit | A book | **A stretch of progress** (caught up to volume X) |
| Goal | Finish it | **Enough to join the conversation** |
| Done when | Completed | **Satisfied** |
| Character relations | — | Must be trimmed to current progress |

*A Record of a Mortal's Journey to Immortality* is 7 million words across 2,400+ chapters — 25×
*Thinking, Fast and Slow*. The pipeline can process it (roughly 50 minutes of map, a few tens of
yuan), but the "walk it in two hours" promise collapses outright.

**Mixed into the same v0, completion rate becomes a blend of two behaviours and proves
nothing.**

Resolution: v0 measures knowledge books only; novels get dogfooded by us and stay out of the
experiment data. A side note — that book is DRM-protected on its original platform, so only a
pirated txt is usable, which is the first concrete instance of the PRD's risk that "the core
user is someone with a library of pirated books".
