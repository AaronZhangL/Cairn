# Evaluating a pipeline change

Whether a path is good is a judgement. Whether a change made paths *better or worse* can be
measured, and `bun run eval` measures it for every stage after map.

```bash
bun run eval --judge deepseek-v4-pro   # the usual form: fixed set, 3 runs, against the accepted baseline
bun run eval --accept <runId>          # make a run the baseline, once its change is merged
bun run eval pro-git                   # one book;  --all for the whole library
bun run eval --against shelf           # against the paths on the shelf instead
bun run eval --model deepseek-v4-pro   # generate with another model of the same vendor
bun run eval --paths <runId>           # judge an earlier run's paths again, after changing the judge
bun run eval --runs 1                  # cheaper, and too noisy for a verdict
```

Generation uses the model the settings panel configures; without an API key that is the codex
CLI. `--model` and `--judge` swap in another model of the same vendor. **Judge with a stronger
model than the one generating**: a flash-sized judge misread paths outright, once calling a
3-station, 9-minute path "4 stations, 12 minutes".

## Principles

**Freeze what the change does not touch.** Map is the most expensive stage and the largest source
of variance. The eval reads each book's chapter notes from the library and re-runs only classify
and reduce, so a difference in the report comes from the change and not from a different reading
of the book. Recap is left out of both sides; reduce does not choose it.

**Compare, do not grade.** A 1–10 score from a model drifts from run to run and means little on
its own. The same model asked *which of these two is better* is far more stable (MT-Bench). So
the headline number is a pairwise record against a baseline, and every other judge answers pass
or fail rather than a score (Husain and Shankar).

**Guard what must not break.** A pairwise win can hide a regression the judge did not weigh.
Faithfulness, coverage and staying within budget are guards: if one drops past the noise band the
verdict is *worse*, whatever the pairwise record says.

**Take the model's randomness seriously.** Reduce is not deterministic, so one run proves little.
Each book runs three times by default, and fewer than three new paths get no verdict at all. On
the first trial, one missed idea out of twelve — a single bad draw — read as a regression.

**Judge from the notes, never from memory.** Every judge sees the chapter notes and is told to use
nothing it knows about the book. This is invariant 2 applied to the judge: a judge that remembers
the book would reward paths that match its memory rather than the text.

**Compare like with like.** A baseline built by another model measures the model, not the code,
and scores from one judge do not compare with another's. After switching either, make a new
baseline. A baseline judged by another model is judged again automatically.

**Show the judge only what the change is about.** Reduce chooses and orders stations; the wording
is expanded later, by slides. Shown full paths, the pairwise judge preferred the wordier one
almost every time — "more complete", "keeps this detail" — though told length was no merit. That
is the verbosity bias MT-Bench and AlpacaEval report. So the pairwise judge sees outlines only:
stage names, station titles, minutes, chapters. Wording is still checked, station by station, by
the faithfulness judge. Text length is printed so a gap in it is visible.

**A record must beat chance.** The unchanged pipeline, judged against itself, went 2–5. A verdict
therefore needs a two-sided sign test on the decisive comparisons below `ALPHA` (0.1), and the
noise band on the guards is the drift measured in that same self-comparison, not a guess.

## The measures

| Measure | How | From |
| --- | --- | --- |
| Structure | Code: stations, minutes, chapter coverage, position skew, order inversions, duplicate sourcing | — |
| Budget | Code: `exceedsBudget`, the rule reduce itself retries on, 15% tolerance included | Invariant 1 |
| Coverage | The judge writes an answer key of 12 ideas from the notes, once per book, cached in `.eval/ideas.json`; every path is checked against the same key | QA-based summary evaluation |
| Faithfulness | Every claim in a station's brief and key points is checked against the notes of the chapters it cites | FABLES |
| Coherence | Four failure modes, each pass or fail: repeat, order, salience, grouping | BooookScore's error types |
| Preference | Candidate outline against baseline outline, asked twice with the order swapped. A win needs both verdicts; a split is a tie | MT-Bench |

**Position skew** is the mean position of the cited chapters, 0 at the book's start and 1 at its
end, minus 0.5. FABLES found summarisers over-weight a book's ending; Cairn's reduce, on a tight
budget, leans the other way. It is a symptom to look at, not a target: optimising it directly cost
key-idea coverage (see *Tried and rejected*).

**The budget measure is reduce's own rule on purpose.** The first version checked the budget's
strict range, failed paths reduce had accepted, and called an unchanged pipeline *worse*.

## The verdict

- **Worse** — a guard (faithfulness, coverage, within budget) dropped by more than `NOISE_BAND`
  (0.1), or the sign test is below `ALPHA` (0.1) with losses ahead.
- **Better** — the sign test is below `ALPHA` with wins ahead, and no guard dropped.
- **Unclear** — anything else, or fewer than `MIN_PATHS` (3) new paths.

Nine comparisons can only reach significance when lopsided (7–1 or so). For a close call, raise
`--runs`.

Read the per-book lines as well. The summary averages across books, and a failure confined to one
book can vanish in the mean.

## The fixed set

`scripts/eval-set.json` names the books a plain `bun run eval` judges, so runs weeks apart judge
the same books. They were chosen to differ on every axis the pipeline cares about:

| Book | Stands for |
| --- | --- |
| Atomic Habits | The common case: Chinese method book, solid budget, chapters split into parts |
| Pro Git | Technical manual: 61 chapters, front matter, order matters, quick budget |
| incentives | Smoke test and the few-chapters edge case |

认知觉醒 was left out: same genre and language as Atomic Habits, with notes from an older map.
Ids are library slugs, so the set only means something on the machine whose library holds them. A
missing book is reported, not skipped silently. The budget follows the shelf entry, so re-adding a
book at another budget changes what it tests. There is no narrative book yet; add one before
judging a change aimed at fiction.

## Where results go

`<library>/.eval/<runId>/report.json`, with `meta.json` beside it recording the models and the
baseline, all beside the library and never in the repository: they hold the model's reading of
books the owner bought. The report is written after every book, so an interrupted run keeps what
it judged.

**The baseline is the accepted run, not the best one.** `--accept` records it in
`.eval/baseline.json`, and every run compares against it until another is accepted. Accept a run
when its change is merged — the baseline is what the code on main does. Keeping the best-scoring
run instead would keep the luckiest draw, and every later change of equal quality would look
worse against it.

## Baseline

`2026-09-26T05-26-56-353Z` — the pipeline as on main, deepseek-flash generating, judged by
deepseek-v4-pro.

## Tried and rejected

Reverted changes leave nothing in git, so they are listed here, to be read before trying the same
thing again. The first three were judged by the earlier method (flash judge, full-path pairwise,
no significance test); their guard failures were large enough to stand, their pairwise records
may not.

- **Telling quick and brief budgets to draw "from across the whole book".** Pro Git stayed
  front-loaded; coverage and faithfulness dropped.
- **Telling reduce how many chapters each station stands for.** Coverage 0.44 → 0.78 on Pro Git,
  but faithfulness 0.89 → 0.58: stations became grab-bags citing up to 28 chapters.
- **Reduce as propose → select → arrange**, with claim-level citations, budgeted greedy selection
  in code, and optionally Self-Refine or best-of-3. Key-idea coverage 0.80 → 0.56–0.64 on every
  variant; select + refine lost 0–6 (p 0.03). It spread chapters evenly and missed what mattered.
  Full record and archived code: `.scratch/reduce-select-strategy/`.
- **A stronger model for reduce alone** (deepseek-v4-pro): unclear, 2–5–2 (p 0.45), coverage
  unchanged. Every coherence mode improved, but that judge was the generating model, so the gain
  is not trusted. It front-loads Pro Git just the same.

**What the Pro Git front-loading turned out to be.** Judged fairly, the unchanged pipeline's Pro
Git paths cover 0.64–0.67 of the key ideas — as much as the codex path on the shelf, and about
what 4 stations can hold of 12 ideas. The early "Pro Git loses" came from a flash judge and the
length bias. Whether a 10-minute rung for a 61-chapter manual is worth offering is a question
about the budget ladder, not about reduce.

## Known limits

- **The judge is one vendor.** Only a DeepSeek key is configured, so the judge is the generator's
  vendor, and where `--model` equals `--judge` it is the generating model itself. Models favour
  their own output; a second vendor's key would make the judge fairer.
- **The judge reads notes, not the book.** An error map made is invisible here. Spot-check a few
  claims against the text now and then.
- **The judge is uncalibrated.** Hand-label a handful of paths and check how often it agrees
  before trusting a close result ("Who Validates the Validators?").
- **Slides are not judged.** PPTEval's content / design / coherence split is the obvious next step.

## Sources

- Chang et al., *BooookScore: A systematic exploration of book-length summarization in the era of
  LLMs*, ICLR 2024 — arXiv 2310.00785
- Kim et al., *FABLES: Evaluating faithfulness and content selection in book-length
  summarization*, 2024 — arXiv 2404.01261
- Deutsch et al., *Towards Question-Answering as an Automatic Metric for Evaluating the Content
  Quality of a Summary*, TACL 2021 — arXiv 2010.00490
- Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, 2023 — arXiv 2306.05685
- Shankar et al., *Who Validates the Validators?*, UIST 2024 — arXiv 2404.12272
- Husain and Shankar, *AI Evals FAQ* — hamel.dev/blog/posts/evals-faq
- Zheng et al., *PPTAgent: Generating and Evaluating Presentations Beyond Text-to-Slides*, EMNLP
  2025 — arXiv 2501.03936
