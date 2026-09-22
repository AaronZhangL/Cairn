# Cairn — v0 product document

2026-09-21

> **Decision record.** This is the original pitch, written when the project was still going to
> be a product with users. Its framing — a moat, ten strangers, completion rate as the kill
> criterion, BYOK — has been superseded by [SPEC.md](./SPEC.md), which starts from "one person,
> one machine, nothing published".
>
> What survives is the *reasoning*: why the WeChat Reading API was dropped, why the pipeline
> reads the full text exactly once, why spaced repetition is out of scope, why node expansion
> replaced a git-branch metaphor. Those arguments are still load-bearing. The business case is
> not.

## In one sentence

For people who buy books and never finish them: turn an ebook into a learning path you can walk
in two hours, with something to show at the end.

Note what that sentence does not say: *fast*. We are not selling speed — video and narration are
slower to get through than plain text. We are selling **completion**.

Why us:

> NotebookLM hands you a tool. We hand you a path.

"Upload a document, have an AI summarise and explain it" is something NotebookLM, Kimi and Metaso
already do, for free. Generation is not the barrier. **Path design is**: how chapters are cut,
how nodes are ordered, what feedback arrives where, what "something to show" actually looks like.
That decides where the effort goes — not into prompts and slide templates.

## The problem: not reading slowly, not finishing

Many people buy books; few finish them. The pain is not speed. It is three things:

1. **Plain text is a high barrier.** Most people now consume pictures and video, and reading
   300,000 words continuously gets harder every year.
2. **There is no path.** A book opens on page one. There is no "where do I get to today", no
   progress, no feedback at a stage boundary.
3. **There is nothing to show.** Finish it and you still cannot say what you got. No landing
   place for a sense of achievement.

So the metric being optimised is **completion rate** — not time saved, not how much was retained.

This is a deliberate trade: **we are building an achievement machine, not a learning tool.**
Retention is good, but it is not the promise. Dedao, Fandeng and every reading-streak app are in
that business, and they do fine.

The price of admitting this: features aimed at genuine retention, such as spaced repetition, are
not in v1 (see the decision record).

## The shape: the user walks it once

1. **Upload a book.** EPUB / Markdown / TXT.
2. **Parse and classify.** Split into chapters, decide knowledge or narrative.
3. **Compress.** Summarise every chapter (map); everything downstream reads the summaries
   (reduce). The full text is read once.
4. **Present by type.** Knowledge → a map of the argument. Novels and essays → storyline and
   character relationships.
5. **Lower the barrier.** Each node is mostly visual, with narration (slide-style pages plus
   voice).
6. **Nodes expand.** Did not follow a point → expand it. Not a branch, just an expansion.
7. **Something to show at the end.** Completion feedback and a review of the best lines.
8. **Quote review** (optional enhancement). Overlay WeChat Reading's most-highlighted passages —
   "this sentence, highlighted by N thousand readers".

On step 6: the original design imitated git's branch and checkout. **Abandoned.** Branching earns
its keep through parallel evolution, merge and diff; a book is static, with no merge and no
conflict. Drop the metaphor and the real requirement is a disclosure panel.

On step 8: this is the only surviving use for the WeChat Reading API, and it is the one thing
that API genuinely owns — the collective attention of tens of millions of readers. NotebookLM
cannot supply it and an LLM cannot invent it. **It must be lazy-loaded**: ask for a key when the
user clicks "see what everyone highlighted", never at signup.

## The foundation: why users upload

The original plan pulled books from the WeChat Reading API. Dropped after investigation, because
of one hard constraint.

### The skill is real, but it cannot reach the text

`Tencent/WeChatReading` is genuinely Tencent's own repository: Apache-2.0, v1.0.4, gateway
`https://i.weread.qq.com/api/agent/gateway`, created 2026-09-20.

Across all 14 endpoints, **not one returns chapter text**:

| Endpoint | Returns |
| --- | --- |
| `/store/search` | Title, author, rating |
| `/book/info` | Blurb, category, ISBN, word count |
| `/book/chapterinfo` | Chapter titles, word counts, paywall flags |
| `/book/bestbookmarks` | Popular highlights — server-fixed top 20, no pagination |
| `/book/bookmarklist` | The user's own highlights |
| `/book/readreviews`, `/review/*` | Public reviews, personal notes |
| `/shelf/sync`, `/user/notebooks`, `/readdata/detail` | Shelf, notebook overview, reading stats |
| `/book/recommend`, `/book/similar`, `/book/underlines`, `/book/getprogress` | Recommendations, similar books, highlight density, progress |

Searching every response shape for `content`, it appears only inside **review text** and **user
notes**.

For a 300,000-word book, the total retrievable text is roughly: a 200-word blurb, the table of
contents, and 20 highlights — **under 2,000 words, and not contiguous.**

### Why that is fatal

Sticking with the original plan means the output can only come from the model's pretraining
memory, with WeChat Reading reduced to a search box. That splits the product in half, and the
split lands exactly on the moat:

| | Famous books | Long tail / new |
| --- | --- | --- |
| Does the model know it | Yes, output is passable | No |
| Is WeChat Reading needed | No | Yes, but it only gives contents and 20 highlights |
| Output quality | Free alternatives already saturate this | Confident fabrication |
| Can the user catch an error | Yes | No — they have not read it, which is why they came |

Shipping plausible-looking content at volume to people who cannot verify it works for a while,
but the failure mode is certain: one day someone notices the book says no such thing, and
screenshots it. Novels are worse — storyline and character relationships must come from the text,
and there is none.

### What user uploads fix

With the real text, nothing is invented. "Any book works" becomes true. And a book someone
uploads on purpose signals far higher intent than one tapped in a store.

The cost is a different foundation and a different set of competitors (see risks).

## Decision record: what was cut

| Originally | Now | Why |
| --- | --- | --- |
| Fetch full text from the WeChat Reading API | **User uploads** | No endpoint returns text; compression has nothing to work on |
| git branch / checkout for going deeper | **Node expansion** | No merge, no diff — the metaphor borrowed a shell and added mental load |
| Scheduled spaced-repetition reminders | **Cut** | It serves retention, which conflicts with the achievement framing; Anki is free and better |
| Feynman method: forced output at each checkpoint | **Optional** | Speed readers will not do homework — but the cost is real (see risks) |
| PDF parsing | **Deferred** | Scanned pages, OCR, two-column layouts, no chapter structure: three months and still bad |
| Reusing one book's output across users | **No** | Reuse = caching and distributing derivatives of pirated books; it only defers the risk |
| The platform paying for LLM calls | **BYOK in v0** | Removes cost, copyright distribution and cache deduplication in one cut |

On cost: 300,000 Chinese characters is roughly 450–500k tokens. What matters is how many times
you read them.

```
Wrong: classify, outline, mind map, script, slide copy — each re-reads the whole book
  500k × 5 = 2.5M tokens per book

Right: read the full text exactly once
  map:     per-chapter summaries (one pass)   500k tokens
  reduce:  everything downstream reads notes   ~30k tokens
  total                                       ≈ 530k tokens
```

At ¥1–4 per million input tokens for Chinese models, that is **¥3–10 per book** including TTS;
with Claude- or GPT-class models, 10–20× that. In v0 the user brings the key, so we do not pay it.

## v1 is an experiment, not a product

**This is the most important premise in the document. Agree with it before reading the rest.**

v0 uses BYOK. That cleanly removes cost, copyright distribution, and cache deduplication.

It also deletes our original reason for existing. The argument was: users will not top up an LLM
account and will not write prompts, so providing the service directly is more convenient. BYOK is
precisely making them do it themselves.

A new user's actual flow:

1. Upload an EPUB (which first requires having a DRM-free EPUB)
2. Register somewhere, verify identity, add credit, get an LLM API key, paste it
3. (Optional) copy a `wrk-` key from WeChat Reading's website, paste it

That is **developer-tool onboarding**, not the onboarding of an app people reach for when they
think "I want to learn this quickly".

So the framing has to be explicit: **v0 is not a product, it is validation.** The first thing to
do once it works is replace the key with platform-paid calls; otherwise the audience is forever
the small set of people who can configure an API key.

### In

- EPUB / Markdown / TXT parsing and chapter splitting
- Per-chapter map-reduce compression (the full text read once)
- Book type classification (knowledge / narrative)
- Visual learning path with node expansion
- Completion feedback
- A BYOK settings page

### Out

- PDF
- Platform-paid LLM calls
- Reusing output across users
- Spaced repetition
- Video rendering (do visuals and a script first; revisit after validation)
- WeChat Reading highlight overlay (second batch, lazy-loaded)

## Kill criteria

A project without kill criteria does not fail; it drags on half-alive, which costs more than
failing.

**One metric: the completion rate of the first book uploaded by ten strangers.**

- They must be strangers. Friends are polite and their data is worthless.
- Below **30%** → the premise that people want to finish is false, and the product needs
  rethinking, not prompt tuning.
- Above 30% → continue, and solve paid calls and user-owned assets next.

This experiment returns a result within a week and **does not require finishing the features, or
even writing code** — generate ten paths by hand and see whether people walk them.

The whole product bets on "people want to finish". This one number tests it directly.

## Risks and open questions

### 1. The moat argument is dead and needs a new answer

The original argument was that WeChat would not build this itself, because it would cannibalise
WeChat Reading's DAU. Once users upload their own books, we are no longer on WeChat Reading's
territory and the argument collapses entirely. The competitors are different now:

| Competitor | Already does | Price |
| --- | --- | --- |
| NotebookLM | Upload a document → two-host podcast explanation + mind map | Free |
| Kimi | 200k-character documents, ask directly | Free |
| Metaso / Doubao / WPS AI | Document parsing and summaries | Free |
| ChatPDF / Humata | Same lane, overseas | Paid |

NotebookLM's Audio Overview *is* the "slides plus narration" we intend to build — free, from
Google, and shipping for two years.

"Big companies have internal conflicts" no longer answers this; Google has none here. One answer
is left: **path design.** That answer is unvalidated.

### 2. Where the user's EPUB comes from

Legitimate ebooks all carry DRM (WeChat Reading, Kindle, iReader, Duokan), so users **essentially
cannot obtain a DRM-free EPUB**. In practice there are three sources: pirated files, personal
scans, and public-domain books.

Which means the core user is "someone with a library of pirated books". With no reuse and no
stored source text the risk is contained in v0 — but **user uploads have never been a
disclaimer, only a deferral of responsibility to the day there is traffic.** Every file-sharing
service has walked this road.

Possible middle ground (undecided): reuse output only for public-domain books and direct
publisher deals; for uploads, keep output visible to the uploader alone and store summaries
rather than text.

### 3. The user leaves nothing behind

Making Feynman-style output optional means, in practice, not doing it. Add BYOK, which removes
even a billing relationship, and **switching cost is currently zero.** A user loses nothing by
using something else.

The goal is to be what people think of when they want to learn something fast — a position in
someone's head. That requires repeat use, and repeat use requires having accumulated something
here. This can be solved later, but it is owed.

A lighter possible answer: make the output not feel like homework — one sentence, a voice note, a
multiple-choice question, or "the AI got one thing wrong on purpose, find it". All produce user
output; none require writing an essay.

### 4. The onboarding funnel

See above. The v0 experiment can bypass it by hand (we configure it for them), but that means
v0's funnel data is worthless. **v0 validates completion, not acquisition.**

## Next steps

Two phases; the first has no code.

### Phase 1: validate the premise (about a week, no code)

- [ ] Pick two or three representative books (one knowledge, one narrative)
- [ ] Run the flow by hand, produce complete paths, confirm the output is good enough
- [ ] Find ten strangers (not friends) and send it to them
- [ ] Measure completion rate against the 30% threshold

### Phase 2: build it, only after passing

- [ ] EPUB / MD / TXT parsing and chapter splitting
- [ ] Per-chapter map-reduce compression pipeline
- [ ] Type classification and branching presentation (mind map / storyline)
- [ ] Learning path UI with node expansion
- [ ] BYOK settings page

### To settle first

1. **Whether "v0 is an experiment, not a product" is agreed.** If not, every trade-off below it
   is back open.
2. **Whether 30% is the right threshold.** Better to set it high than to lower it afterwards.
3. **What "path design" actually is.** It is the only differentiation left and it is currently a
   word, not a design. Phase 1 has to make it concrete.
