# Evaluating a pipeline change

Whether a path is good is a judgement. Whether a change made paths *better or worse* can be
measured, and `bun run eval` measures it for every stage after map.

```bash
bun run eval                        # the fixed set, 3 runs each, against the shelf
bun run eval --against <runId>      # against an earlier eval run — the usual form
bun run eval --all                  # every book in the library
bun run eval pro-git                # one book
bun run eval --runs 1               # cheaper, and too noisy for a verdict
```

The model is whatever the settings panel configures, for generating and judging alike. Without an
API key that is the codex CLI.

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

**Compare like with like.** A baseline built by another model measures the model, not the code.
After switching models, make a new baseline before judging code changes.

## The measures

| Measure | How | From |
| --- | --- | --- |
| Structure | Code: stations, minutes, chapter coverage, position skew, order inversions, duplicate sourcing | — |
| Budget | Code: `exceedsBudget`, the rule reduce itself retries on, 15% tolerance included | Invariant 1 |
| Coverage | The judge writes an answer key of 12 ideas from the notes, once per book, cached in `.eval/ideas.json`; every path is checked against the same key | QA-based summary evaluation |
| Faithfulness | Every claim in a station's brief and key points is checked against the notes of the chapters it cites | FABLES |
| Coherence | Four failure modes, each pass or fail: repeat, order, salience, grouping | BooookScore's error types |
| Preference | Candidate against baseline, asked twice with the order swapped. A win needs both verdicts; a split is a tie | MT-Bench |

**Position skew** is the mean position of the cited chapters, 0 at the book's start and 1 at its
end, minus 0.5. FABLES found summarisers over-weight a book's ending; Cairn's reduce, on a tight
budget, did the opposite (see below). Either way the number moves.

**The budget measure is reduce's own rule on purpose.** The first version checked the budget's
strict range, failed paths reduce had accepted, and called an unchanged pipeline *worse*.

## The verdict

- **Worse** — a guard dropped by more than `NOISE_BAND` (0.05), or losses outnumber wins.
- **Better** — wins outnumber losses and no guard dropped.
- **Unclear** — anything else, or fewer than `MIN_PATHS` (3) new paths.

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

`<library>/.eval/<runId>/report.json`, beside the library and never in the repository: it holds
the model's reading of books the owner bought. It is written after every book, so an interrupted
run keeps what it judged. Pass its run id to `--against` to use it as the next baseline; its scores
are reused rather than judged again.

## Record

Baselines and the changes judged against them. Newest last.

| Run | Model | What it measured | Result |
| --- | --- | --- | --- |
| `2026-09-26T04-55-56-511Z` | deepseek-flash | Switching from codex to deepseek-flash, against the shelf. **The current baseline** | Better, 3–2–4. Faithfulness 0.88 → 0.96, order 0 → 0.78, salience 0.67 → 0.33. Pro Git lost 2 of 3: every path drew only from its first 18 of 61 chapters (skew −0.13 → −0.30) |
| `2026-09-26T05-04-36-097Z` | deepseek-flash | Quick and brief coverage text told to draw "from across the whole book" | Worse, 1–3–5; faithfulness and coverage dropped. Pro Git still front-loaded (skew −0.36). Reverted |
| `2026-09-26T05-08-04-275Z` | deepseek-flash | Reduce told how many book chapters each station stands for, when that is 3 or more | Worse, 0–3–6. Leaked onto Atomic Habits (36 / 14 rounds to 3). incentives, whose prompt was unchanged, still lost 2 of 3 — see noise below |
| `2026-09-26T05-11-22-219Z` | deepseek-flash | The same, from 5 chapters per station, and asked to cite every chapter a point comes from. Pro Git only | Worse by the guards, though 1–0–2 pairwise. Coverage 0.44 → 0.78 and skew −0.31 → −0.08, but faithfulness 0.89 → 0.58: stations became grab-bags citing up to 28 chapters, and one path ran 18 minutes. Reverted |

**Noise, measured.** In the third run incentives' prompt was byte-identical to the baseline's and
it lost two of three. On a small book three comparisons can swing that far on chance alone, so a
record of a few losses on one book is a prompt to look, not a verdict.

**Open problem: a long manual on a tight budget.** Pro Git's quick paths (4 stations over 61
chapters) either stay in the opening chapters or, pushed to spread, lose track of which chapter
said what. Two prompt patches failed. The next attempt is probably structural rather than
wording — for instance reduce first choosing the book's themes across all chapters, then building
stations from them — and should be judged with `bun run eval pro-git --against 2026-09-26T04-55-56-511Z`
before the full set.

## Known limits

- **The judge is the generating model.** Models favour their own output, and a flash-sized judge
  misreads: once it called a 3-station, 9-minute path "4 stations, 12 minutes". A stronger judge
  from another vendor would be fairer; it is not wired yet.
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
