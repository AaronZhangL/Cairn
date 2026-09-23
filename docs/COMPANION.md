# Cairn — the reading companion

> **Status: implemented in the desktop app; live model, book chat, finished-book recall, and
> public-page fetch have been verified with synthetic data. Firecrawl is the keyless search
> default; Brave Search and Tavily are selectable with keys. The three search adapters have
> mock-response tests, but Firecrawl and Brave have not had live-query verification.** This
> replaces §6 of [`SPEC.md`](./SPEC.md) ("Ask: three layers") and overrides invariant 4 in
> [`AGENTS.md`](../AGENTS.md). Read §1 before changing either.

The right pane becomes a lightweight chat companion. Readers can ask about the current book,
other books they have finished, or anything else. The companion reads local book material and
searches the web when that helps it answer accurately.

## 0. How heavy this is allowed to be

**Lightweight describes the architecture, not an exhaustive feature list.** Compared with a
coding or research agent, this companion has a small, read-oriented tool surface and no
subagents, shell, workspace editing, or long-running task orchestration. It still needs normal
chat capabilities: multi-turn conversation, streaming, interruption, tool calls and results,
clarifying questions, persisted sessions, context management, provider selection, and clear
errors. Reader-oriented skills may be loaded when relevant rather than permanently occupying
the prompt. This list describes the baseline; it is not a cap on useful chat behavior.

Keep the ordinary chat machinery behind an existing agent library where it fits. Cairn owns
the book context, evidence rules, and completed-reading memory. Add tools when they serve a
concrete reader need, and keep their permissions read-only unless the product scope changes.

---

## 1. What is being overridden, and what must survive

Three recorded decisions are affected. The source boundary changes to support natural chat,
web access becomes model-directed, and claims about the book still need real book evidence.

### 1.1 "Book-sourced and web-sourced render separately, never blended"

*(AGENTS.md invariant 4, SPEC §6 hard rule 3.)*

The reason for the old rule is provenance: a reader should be able to tell whether a claim
comes from this book, a web page, or another book they finished. A chat response can mix those
sources in readable prose if source-dependent claims have nearby citations. A claim without
evidence must not masquerade as a quote or a sourced fact.

The earlier draft called the assistant's explanations, comparisons, and transitions a `model`
source. That was a category error. The model writes the whole answer; its synthesis is not an
evidence source. General explanation can be uncited. Claims attributed to a source must carry
a checkable reference.

| Source | What it is | Rendered as |
| --- | --- | --- |
| `book` | The current book's text or notes returned by a tool | Cite the chapter; quote only from text actually fetched |
| `web` | A page fetched from a search result or URL | Cite its title and URL near the claim |
| `shelf` | A completed book's returned station (§5) | Cite the book and station |

### 1.2 "Going outside is the reader's click, not the model's decision"

*(SPEC §6 hard rule 2; `main/rpc.ts` says merging the two paths "would let the model decide to
leave the book on its own".)*

This rule is intentionally superseded. The model may call `search_web` and `fetch_web` without
asking first when external information helps answer correctly. `ask_user` is for genuine
clarification, not a web permission gate. The answer distinguishes book evidence from web
evidence through citations. Search queries should use the minimum needed context rather than
copying whole chapters into a search request.

### 1.3 "Never answer from pretraining memory"

*(`pipeline/ask.ts` hard rule 1; AGENTS.md invariant 2 for the pipeline's half of it.)*

For **claims about what this book says**, use book material actually returned by the tools,
not recollection of a known title. Exact quotations must occur in chapter text fetched in the
current context; validate that mechanically. General questions can use the model's knowledge,
and current or uncertain facts can be checked with web search and page fetches.

The pipeline already checks slide quotations through `PathQuality.unsourcedQuotes`. The
companion applies the same principle to quotations in chat.

### 1.4 What else must not regress

- **Active turns pause background deck building** (`pauseBackgroundBuilds`). Resume it when the
  model finishes or waits for reader input; an open chat should not pause generation forever.
- **Web access is visible.** The UI shows searches and fetched pages in the tool trail, and
  source links stay attached to the answer.

---

## 2. Book context and conversation compaction

These solve different problems. The book ladder limits which book material is resident on
every turn. Conversation compaction limits how much past chat and tool output is sent back to
the model. Compacting a chat requires a new summary; it cannot be replaced by the book's
existing chapter notes.

### Book context ladder

| Rung | Artifact | ~Size for a 200k-word book | How it is reached |
| --- | --- | --- | --- |
| 0 | The path — station titles and briefs | 1–2k | Resident |
| 1 | One line per chapter: index, title, gist | ~3k | Resident |
| 2 | The full `ChapterNote` — key points, quotes, figures | ~18k total | `read_notes` |
| 3 | Raw chapter text | the book | `read_chapter` |

Rungs 0 and 1 are the standing context. Rung 0 *is* the book already: curated, ordered, and the
thing the reader is actually walking. Rung 1 exists beside it because the budget drops chapters,
and a question about a dropped chapter must not be answered with "that is not in this book".

### Why this is not what SPEC §6 said

SPEC §6 established that "every `ChapterNote` *is* the index — ~18k tokens for a 200k-word book",
and for a single question that is the right trade: one call, everything present, no round trip.

A conversation changes the arithmetic. That 18k is paid **per turn**, and a twenty-turn
conversation pays it twenty times. Splitting the note into its gist (resident) and its body (a
tool call) takes the standing context from ~20k to ~5k while losing nothing the model cannot ask
for. The index is still complete; only its depth is deferred.

### Conversation compaction

Follow the small, established pattern used by Claude Code and nanobot: retain the complete
session on disk while giving the model a bounded working context. Estimate tokens before each
model call, including the system prompt, book and shelf indexes, recent messages, tool results,
and room for the next response. When the estimate approaches that model's context limit,
compact older turns into a short structured summary and keep the most recent complete turns
verbatim. Cut only between user turns so a tool call never loses its result.

The summary carries the reader's current goal, stable preferences expressed in the chat,
important conclusions, unresolved questions, and source references that those conclusions
depend on. It can record which chapters and pages were consulted, but those identifiers do not
make their full contents available to the model. Chapter text and large web results leave the
working context and are fetched again if needed for a fresh quotation or verification.

Compaction is automatic near the window limit and available manually. Keep the original
messages for history and audit; never overwrite them with the summary. The trigger and recent
turn budget are derived from the selected model's window and measured usage, not fixed at a
Claude Code-sized token count. Bound individual tool results before they enter the context,
and retry after compaction if a provider still reports context overflow. A failed compaction
must leave the durable transcript intact and surface an error if the next call cannot fit.

This follows [Claude Code's auto-compact behavior](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code)
and [nanobot's separation of session history from durable memory](https://github.com/HKUDS/nanobot/blob/main/docs/architecture.md).
It also preserves complete turns and a full archive as described in
[Pi's compaction design](https://github.com/ai-cre/pi-mono/blob/main/packages/coding-agent/docs/compaction.md).

### Why still no retrieval inside one book

SPEC §6 argues it and nothing here changes it: the index fits, and the pipeline is sweep-driven
rather than search-driven. The model picks chapters by reading the index it already has — the
same judgement `noteIndexLocator` asks it to make today, minus a round trip.

The line is the same as before: a serial of a thousand chapters or more needs hierarchical notes
(fold every 20 into a volume note), not a vector store.

## 3. Tools

A small initial tool set for reading and answering. Add a tool when it solves a specific reader
need; this table is not a permanent numerical limit. Skills provide instructions on demand
and do not imply that Cairn needs a coding-agent tool set.

| Tool | Returns | Notes |
| --- | --- | --- |
| `read_chapter(idx[])` | Verbatim chapter text | Grounds current-book claims and quotations. Bounded: N chapters per call, truncated per chapter. |
| `read_notes(idx[])` | Full `ChapterNote`s | Rung 2 of §2. Cheaper than raw text when the question is about what a chapter argues rather than how it worded it. |
| `recall_reading(query)` | Stations from other finished books | §5. Returns `{ bookId, bookTitle, nodeId, title, brief }`, never raw text from another book. |
| `search_web(query)` | Titles, URLs, snippets | Model-directed when current or outside information would improve the answer. |
| `fetch_web(url)` | Bounded page text and metadata | Follow a search result or supplied URL before citing page contents. Reject non-public and local addresses. |
| `ask_user(question, options[])` | The reader's choice | Clarify a material ambiguity when available context cannot settle it. |
| `load_skill(name)` | A reader skill's instructions | Load a relevant packaged skill on demand; the skill adds guidance, not new machine permissions. |

The loop also needs a tool-call limit, cancellation, and visible errors. A search result snippet
alone is not enough to support a detailed factual claim; fetch the page used in the answer.

Deliberately absent:

- **`find_chapters`** — the index is already in context; a search tool would be a round trip to
  re-derive what the model can already read.
- **Anything that writes.** The companion cannot edit the path, regenerate a station, or change
  settings. A reading companion that can silently rebuild the thing being read is a different
  product with a different risk profile.

---

## 4. Data model

`Turn`, `Answer` and `OutsideAnswer` are replaced. The pane renders natural chat text with
inline references; references point to tool results the session actually received.

```
Message
  | { role: 'user',  text: string, selection?: string, atNode?: string }
  | { role: 'assistant', text: string, citations: Citation[] }
  | { role: 'tool', name: string, summary: string, resultId: string }

Citation = {
  span: [start, end]        // range in assistant text
  source: 'book' | 'web' | 'shelf'
  resultId: string         // evidence returned by a tool in this session
  ref: ChapterRef | WebRef | ShelfRef
}
```

Notes on the shape:

- **Inline references.** The renderer attaches each citation to the claim it supports. A
  citation is accepted only if its `resultId` exists and its reference was in that result.
- **`role: 'tool'` messages are kept and shown.** Collapsed by default, they make searches and
  book reads inspectable. Detailed tool output can be left out of the model's compacted context.
- **Shelf references cite a station, not a page.** `ShelfRef = { bookId, bookTitle, nodeId,
  nodeTitle }` — enough for the reader to open that station and check, which is the only version
  of "you read this before" worth making.
- **`atNode`** replaces today's anchored/whole-book split. Where the reader was is context, not
  a separate code path.

### Persistence

One conversation per book, beside the book (`books/<id>/chat.json`), for the same reason the
resume position is stored: a path is walked over several sittings.

This also means a conversation **syncs with the book** — see the iCloud note in AGENTS.md. A
conversation contains quoted chapter text, so it inherits the same question `chapters.json` has.

The full transcript, tool audit trail, and compaction summaries are separate records. §2
defines the smaller working context sent to the model. A summary never replaces the original
chat or the references needed to inspect an earlier answer.

---

## 5. Memory across the shelf

SPEC §7 planned this and set three constraints. All three survive; what changes is that it turns
out to cost almost nothing, because **the artifact already exists**.

### The recap is the memory

`pipeline/recap.ts` already reads the *path* — not the book — and writes a closing station whose
whole job is "what this book finally argues". That is a compressed account of a finished book,
generated once, at no extra cost. Nothing new needs summarising.

So the shelf index is derived, not stored:

```
ShelfEntry = {
  bookId, title, author?
  finished: boolean        // LibraryEntry.complete, and the reader reached the recap
  claim: string            // the recap station's brief
}
```

Resident cost: ~30 tokens a book. Fifty books is ~1.5k — smaller than one chapter note. Station
titles and briefs of *other* books are fetched on demand, never resident.

### Only books actually walked

`finished` means the path completed **and the reader got to the end of it**, which
`resume.ts` already knows. A book merely added to the shelf is not a book the reader has read,
and "you met this in X" about a book they never opened is a lie that costs the whole feature its
credibility the first time it happens.

### Citing earlier reading

Prior reading is a source like any other, rendered distinctly — SPEC §7 constraint 1, which is
the same argument as §1.1 applied one more time:

| Source | Rendered as |
| --- | --- |
| `shelf` | "You met this as *X* in «Book», station Y" — cited to that station |

And the same mechanical rule as §1.3: **a shelf citation must point to a station that
`recall_reading` returned in this conversation.** Cross-book connection is where a model most
wants to confabulate — asked to find a resonance it will always find one — so the citation is
what separates a real connection from a flattering one.

An answer with no shelf citation is a normal answer. The companion is not scored on how often it
connects.

### Why no vector store yet

SPEC §7 expected one: *"retrieval across a library of books read over years does not fit."* With
the ladder in §2 it fits for longer than that assumed. A shelf line is ~30 tokens; the model
reads the shelf index the same way it reads the chapter index, and drills into a specific book's
path with a tool.

The threshold is roughly **two hundred finished books** — at which point the resident index is
~6k and the argument for embeddings becomes real. Until then, a vector store is a dependency
bought before it is needed.

### What it must never do

SPEC §7 constraint 2, unchanged and worth repeating because it is the one a tool-calling design
could quietly break: **prior reading never decides structure.** Station count and ordering come
from the current book's real text alone. The companion has no write tools (§3), which is what
makes this hold by construction rather than by discipline.

## 6. Providers

`@earendil-works/pi-ai` replaces the hand-written providers in `core/runtime`. The reason is no
longer "fewer lines": it is that the companion needs tool calling across several vendors, and
every one of the named targets is already implemented there.

| Wanted | In pi-ai |
| --- | --- |
| OpenAI / ChatGPT login | `openai`, `openai-codex` |
| Anthropic | `anthropic` |
| DeepSeek | `deepseek` |
| MiniMax | `minimax`, `minimax-cn` |
| (also) | Moonshot, Qwen, Groq, Bedrock, Google, Azure — 48 in total |

Cost to weigh before committing: ~89 MB of installed dependencies (`openai`, `@anthropic-ai/sdk`,
`@google/genai`, `@aws-sdk/client-bedrock-runtime`). The package uses `.lazy` entry points, so
the shipped increment is probably far smaller — **measure it before adopting, not after.**

### Two interfaces, one library

`LlmProvider` does **not** grow tool calling. The pipeline and the companion are different
shapes and should stay that way:

| | Shape | Interface |
| --- | --- | --- |
| Pipeline (`map`, `reduce`, `slides`, `recap`) | One shot, strict JSON schema, no tools, cacheable by content | `LlmProvider` — unchanged |
| Companion | Multi-turn, tools, streaming, not cacheable | New, or `pi-agent-core` |

Collapsing them would put a conversational loop behind the interface that `deckKey` assumes is
deterministic and single-shot. The pipeline's caching story depends on that assumption.

### The agent loop: adopt or write

`@earendil-works/pi-agent-core` exists and llm-space uses it. Coupling depth differs sharply from
pi-ai and the decision should be taken separately:

- `pi-ai` sits behind one seam and is reversible in an afternoon.
- An agent framework owns the model/tool loop and event protocol. Session persistence and
  compaction may still be application responsibilities; verify the actual API before adopting.

§0 settles which way this leans. The loop, tool protocol, and streaming events are ordinary
parts of a chat-bot. **Recommendation: adopt `pi-agent-core` unless
reading its API turns up a reason not to** — and keep ours to the parts that are actually ours:
the evidence rules, context construction, session compaction, and the shelf.

The risk to watch is the one §0 cannot remove: an agent framework brings opinions about messages
and state, and some of them will not match `Citation`. If the adaptation layer starts to approach
the size of the loop it replaced, that is the signal to stop and write the loop.

---

## 7. XML prompts

Every model-facing system prompt and prompt template uses XML structure. This includes the
companion, its compaction prompt, and the existing pipeline stages (`map`, `classify`, `reduce`,
`slides`, `recap`, and current ask prompts until replaced). API message roles remain separate;
XML organizes the content within each role. Existing pipeline prompts are only partly tagged
today, so this is a migration requirement, not a description of the current code.

Use [LLM Space's](https://github.com/deer-flow/llm-space) General Agent prompt as a structural reference: short named sections for role,
behavior, tools, and skills, with dynamic context in its own section. Cairn needs fewer rules
and no coding or deep-research workflow. A companion system prompt might begin:

```xml
<companion>
  <identity>Help the reader understand the book and their questions.</identity>
  <behavior>Answer clearly. Use tools when evidence or current information is needed.</behavior>
  <evidence>Ground book claims in fetched book material; cite fetched web pages and completed-book stations.</evidence>
  <skills>Load relevant reader skills on demand.</skills>
</companion>
```

The per-turn prompt puts the current station, chapter index, shelf index, conversation summary,
and reader message in distinct tags. Tool results also identify their source and result ID.
Escape dynamic titles, book text, web text, and user input as XML character data; never
interpolate them into tag names or instruction sections. Use well-formed XML and test rendered
prompts, including input containing `&`, `<`, quotes, and text that resembles closing tags.
The output contract may still request JSON where a pipeline stage needs a strict schema.

---

## 8. What this deletes

| Gone | Replaced by |
| --- | --- |
| `pipeline/ask.ts` — `askBook`, `askAnchored`, `noteIndexLocator`, `singleBook` | The companion loop; `read_chapter` |
| `pipeline/ask-outside.ts` | `search_web` and `fetch_web` |
| `Turn`, `Answer`, `OutsideAnswer` | `Message` and inline `Citation` |
| `AskPane`'s `BookAnswer` / `WebAnswer` | Chat text with inline citations and a tool trail |
| RPC `ask`, `askOutside` | One `chat` channel, streaming |
| SPEC §6 in full | This document |

Kept: the ask log (`store/asks.ts`, `stationHeat`) — where the reader stopped to ask is still the
closest thing to a quality signal this tool has, and a conversation knows which station it was on.

---

## 9. Open questions

1. **Cost per conversation.** §2 takes the standing book context from ~20k to ~5k per turn,
   while conversation compaction adds occasional model calls. Measure both before choosing a
   default model.
2. **Which provider is the default**, and whether the companion and the pipeline should use the
   same one. They have different requirements: the pipeline needs strict schema support, the
   companion needs good tool calling.
3. **Does the conversation sync?** It contains quoted book text (§4). The iCloud note in
   AGENTS.md applies unchanged.
4. **What "related" means in `recall_reading`.** Matching on the shelf index is a model
   judgement, and a model asked for a connection will produce one. The citation rule in §5 makes
   a bad connection checkable but does not make it rare. Whether that needs a relevance floor —
   or simply a reader who can say "stop doing that" — is unresolved.
5. **Streaming and citation timing.** Show draft text as it streams, then attach validated
   inline citations before treating the answer as complete. The UI needs an unambiguous
   provisional state so unsupported draft claims are not mistaken for final citations.
