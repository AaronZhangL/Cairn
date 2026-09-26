# Reduce by propose → select → arrange

Status: resolved — rejected by `bun run eval`, code archived in `code/` (files renamed `.txt` so
`bun test` does not pick them up).

## The idea

Pro Git's quick paths (4 stations over 61 chapters) drew only on its opening chapters. Instead of
one reduce call, three steps:

1. **Propose** — the notes are cut into slices of at most 12 chapters, and each slice proposes
   narrow candidate stations in its own call. Every key point names its chapter, and a point may
   only cite a chapter of its own slice (claim-level citation, after ALCE). A station's
   `sourceChapters` are derived from its points, never written by the model.
2. **Select** — code, not a model: budgeted greedy coverage (Lin & Bilmes). Gain per minute
   rewards chapters and slices not yet walked; `NEW_PART_WORTH = 2` because weights are judged
   within one slice and do not compare across slices.
3. **Arrange** — one call orders and groups the chosen stations; code repairs the grouping
   (every id once, no single-station stage).

Options tried on top: `refine` (Self-Refine: one call reviews and fixes order, grouping and
repeats) and `samples` (best of N drafts, ranked by code on spread and budget).

## Result

Judged against the unchanged pipeline, deepseek-flash generating, deepseek-v4-pro judging with
outline-only pairwise (see docs/EVAL.md). Paths re-judged after the length-bias fix.

| Variant | Pairwise | p | Key-idea coverage |
| --- | --- | --- | --- |
| select | 1–6–2 | 0.13 | 0.80 → 0.56 |
| select + refine | 0–6–3 | 0.03 | 0.80 → 0.64 |
| select × 3 samples | 2–7–0 | 0.18 | 0.80 → 0.59 |

Every variant failed the coverage guard, on Atomic Habits and Pro Git alike.

## Why it failed

It optimised the wrong target. Selection rewarded *chapter* spread, so Pro Git's position skew
went from −0.24 to −0.01 — and each slice's contribution was whatever it held, central or not.
Covering the book evenly is not covering what matters in it. Faithfulness and the repeat / order
checks did improve; they did not make up for the loss.

## What it taught

- The front-loading was mostly not a defect. Re-judged fairly, the unchanged pipeline's Pro Git
  paths cover 0.64–0.67 of the key ideas, as much as the codex path on the shelf; around 0.64 is
  what 4 stations can hold of 12 ideas. Position skew is a symptom to look at, not a target.
- A stronger model for reduce alone (deepseek-v4-pro) front-loads Pro Git just the same.
- If this is revisited: weight selection by the book's key ideas, not by chapters — e.g. score
  candidates against an answer key of central ideas — and judge with a judge from another vendor.
