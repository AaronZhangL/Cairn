# Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot ask pane with a persistent, source-checkable reading chat that can read the current book, search and fetch the web, compact context, and relate finished books.

**Architecture:** Keep the generation pipeline's `LlmProvider` unchanged. Run Pi Agent Core and Pi AI in the desktop main process only; Cairn owns the book tools, durable chat, evidence validation, reading-completion state, and compacted context. The renderer receives typed chat events over the existing Electrobun bridge.

**Tech Stack:** Bun, TypeScript, Electrobun RPC, React, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`.

**Spec:** `docs/COMPANION.md` (the staged design approved in conversation).

## Global Constraints

- Do not migrate or alter the one-shot generation pipeline provider while introducing chat.
- Only the main process owns model credentials, book text reads, and web access.
- No new server component, vector database, shell tool, subagent, or write tool for the companion.
- Model-facing prompts, including existing pipeline prompts, must be well-formed XML with escaped dynamic data.
- Keep the complete chat and evidence archive even after context compaction.
- Keep user-visible copy in both English and Chinese.
- Do not commit until `bun test`, `bun run typecheck`, and the desktop Vite build pass.
- Preserve the staged edits to `AGENTS.md`, `docs/SPEC.md`, and `docs/COMPANION.md`.

## Review Focus

1. A reader opens the recap without finishing its audio: no finished-book memory. Task 2 tests this.
2. A book is regenerated under the same ID: old completion and old chat evidence must not describe the new path. Tasks 2 and 3 test this.
3. A tool call is interrupted after returning partial material: no unsupported final citation or orphan tool result. Tasks 3, 6, and 7 test this.
4. A web URL resolves to a private address or redirects there: fetch is rejected. Task 4 tests this.
5. A long chat compacts while a tool call is pending: the complete call/result pair remains intact and the archive is preserved. Task 5 tests this.

## Sequence and interfaces

The first milestone is a working chat against the current book. Subsequent milestones add web evidence, compaction, shelf memory, and prompt migration. Each milestone leaves a runnable app; old ask RPC remains until the new UI is ready.

### Task 1: Prove the Pi integration in the main process

**Files:** `apps/desktop/package.json`, `bun.lock`, `apps/desktop/src/main/companion/model.ts`, `apps/desktop/tests/main/companion/model.test.ts`.

**Interfaces:** Produce `resolveChatModel(settings: ShellSettingsValues): Promise<ChatModelResolution>` where the result contains a Pi model, stream function, and credential resolver or an explicit typed setup error. Do not modify `LlmProvider`.

- [ ] Pin matching Pi package versions after checking the current registry and installed declarations; register only providers actually supported by Cairn settings.
- [ ] Write a failing test showing the current Codex-login and generic-key settings both resolve, while a missing credential returns a typed setup failure. Run `bun test apps/desktop/tests/main/companion/model.test.ts` and confirm the intended failure.
- [ ] Implement the smallest adapter. Verify how Pi's Codex provider receives a credential: never assume its store reads `~/.codex/auth.json`. If the existing login cannot be adapted safely, stop this task and report that blocker before changing the default model route.
- [ ] Run the focused test, `bun run typecheck`, and `cd apps/desktop && bun run build`. Smoke-test an agent prompt in the real Electrobun main process; a Vite webview build alone does not prove the Bun-side package works.

### Task 2: Record an actual finished reading

**Files:** `packages/core/src/store/reading.ts`, `packages/core/tests/store/reading.test.ts`, `apps/desktop/src/main/reading.ts`, `apps/desktop/src/main/rpc.ts`, `apps/desktop/src/shared/schema.ts`, `apps/desktop/src/bridge.ts`, `apps/desktop/src/App.tsx`.

**Interfaces:** `markFinished(bookId, pathGeneratedAt)` writes a per-book completion record only after the recap deck's `onEnded`; `isFinished(entry, path, record)` requires a completed generated path and matching `generatedAt`.

- [ ] Write failing pure tests for recap completion, merely opening recap, incomplete deck generation, and regeneration with the same book ID but a new `generatedAt`.
- [ ] Add the record and bridge call. The reader-facing playback event, not chat or the model, marks completion. Deleting a book removes its completion record as part of its directory.
- [ ] Run `bun test packages/core/tests/store/reading.test.ts` and the relevant desktop tests; manually finish a recap in the app and confirm the record is written once.

### Task 3: Define durable chat and evidence before the agent loop

**Files:** `packages/core/src/companion/types.ts`, `packages/core/src/companion/citations.ts`, `packages/core/tests/companion/citations.test.ts`, `apps/desktop/src/main/companion/session.ts`, `apps/desktop/tests/main/companion/session.test.ts`.

**Interfaces:** A per-book session records user, assistant, and tool messages with stable IDs; evidence records contain `resultId`, source type, and bounded source metadata. `validateCitations(text, citations, evidence)` accepts only spans and references backed by recorded results. Session writes are atomic and tied to `Path.generatedAt`.

- [ ] Write failing tests for valid chapter/web/shelf citations, unknown result IDs, mismatched reference targets, out-of-range spans, malformed stored JSON, and a regenerated path.
- [ ] Implement immutable validators and main-process persistence under `books/<id>/`. Keep the full archive; compaction will write a separate working-context record rather than rewriting it.
- [ ] Run the focused tests. Inspect the persisted JSON to ensure it contains no absolute file paths or credentials.

### Task 4: Add bounded, read-only tools

**Files:** `apps/desktop/src/main/companion/book-tools.ts`, `web-tools.ts`, `shelf-tools.ts`, their mirrored tests, and `apps/desktop/src/main/tavily.ts` only if its existing result cannot be reused.

**Interfaces:** `read_notes`, `read_chapter`, `recall_reading`, `search_web`, and `fetch_web` return bounded text plus evidence metadata for Task 3. `ask_user` and `load_skill` are added only after their user-visible control path is defined in Task 7.

- [ ] Write failing tests for invalid chapter indices, truncation, books that are generated but not finished, missing recap, search without a key, and public-to-private URL redirects.
- [ ] Reuse `loadPath`, `loadNotes`, `loadChapter`, existing Tavily settings, and the completed-reading record. Fetch only public HTTP(S) pages, bound response size and time, and reject private/local destinations at every redirect.
- [ ] Run focused tests. Confirm a tool result has a stable `resultId` and source identity before it can enter the transcript.

### Task 5: Build XML context and safe compaction

**Files:** `packages/core/src/companion/context.ts`, `xml.ts`, `compact.ts`, and mirrored tests; locale prompt files under `packages/core/src/companion/prompts/`.

**Interfaces:** `buildContext` supplies path briefs, one-line chapter index, finished-book shelf index, prior summary, and recent complete turns; `compactContext` preserves the durable transcript and returns a new summary plus retained-turn boundary. Escape every dynamic XML value.

- [ ] Write failing tests for `<`, `&`, quotes, closing-tag-looking text, large tool results, a tool call/result pair at the retention boundary, and compaction failure leaving the prior archive unchanged.
- [ ] Implement book-context selection separately from conversation-history compaction. Trigger using the selected model's context window and reserved output room, with a manual compact path; retain a bounded recent tail and source IDs needed for later verification.
- [ ] Run focused tests. Inspect a rendered prompt for both locales; it must be well-formed XML and must not treat book/web text as instructions.

### Task 6: Run one companion turn through Pi

**Files:** `apps/desktop/src/main/companion/run.ts`, `apps/desktop/src/main/companion/events.ts`, mirrored tests, and a small hook in `apps/desktop/src/main/rpc.ts`.

**Interfaces:** `runTurn({ bookId, nodeId, question, selection, signal }, emit)` loads the durable session, configures the Pi agent with Task 4 tools and Task 5 context, emits ordered draft/tool/final/error events, validates citations with Task 3, persists final state, and releases `pauseBackgroundBuilds()` in every exit path.

- [ ] Write failing tests for a tool-call cycle, cancellation, error cleanup, tool-call cap, automatic web search, and final citation rejection when evidence is absent.
- [ ] Implement the main-process loop using Pi's `prepareRequest`/context hooks and awaited event subscription. Only publish a completed answer after citation validation; stream provisional text distinctly.
- [ ] Run focused tests and one real main-process conversation with a test book. Verify interruption cancels active tool I/O and background deck building resumes.

### Task 7: Replace the right pane and bridge atomically

**Files:** `apps/desktop/src/shared/schema.ts`, `apps/desktop/src/shared/types.ts`, `apps/desktop/src/bridge.ts`, `apps/desktop/src/main/index.ts`, `apps/desktop/src/App.tsx`, `packages/ui/src/panes/AskPane.tsx` (or a renamed `CompanionPane.tsx`), both UI dictionaries, relevant UI tests.

**Interfaces:** One streamed chat channel supports load history, send, cancel, manual compact, and clarification response. Messages show provisional text, final inline citations, and a collapsible tool trail. Preserve selection and current-station context.

- [ ] Write failing bridge/state tests for book switching, late events from a prior book, cancellation, restoration after restart, and a draft that never becomes a cited final answer after failure.
- [ ] Wire typed main-to-webview events and replace the old `ask`/`askOutside` rendering. Add `ask_user` response UI and `load_skill` only if the built-in reader skills have concrete content; do not add empty framework scaffolding.
- [ ] Run focused tests, typechecks, and the Vite build; inspect Chinese and English panes in the real app. Verify book/web/shelf citations navigate to their actual source.

### Task 8: Complete provider choice and XML migration; retire old ask

**Files:** `apps/desktop/src/shared/settings.ts`, `apps/desktop/src/main/settings.ts`, `packages/ui/src/settings/pages.tsx`, both UI dictionaries, `packages/core/src/pipeline/prompts/en.ts`, `zh.ts`, `packages/core/src/pipeline/prompts/xml.ts`, mirrored tests; remove `packages/core/src/pipeline/ask.ts` and `ask-outside.ts` only after call sites and tests move.

**Interfaces:** Provider selection exposes only tested Pi routes and never sends credentials to a web page or search provider. Pipeline prompt outputs remain behaviorally equivalent JSON-schema requests while their role content becomes XML.

- [ ] Write failing settings tests for persisted provider selection and secret handling; write prompt snapshot/parse tests for all model-facing templates with XML-special book data.
- [ ] Add the explicitly supported provider choices. Migrate pipeline prompts without changing budgets, cache keys, stage schemas, or generation concurrency. Remove old ask code, RPC methods, tests, and UI copy made orphaned by Task 7.
- [ ] Run `bun test`, `bun run typecheck`, and `cd apps/desktop && bun run build`. Exercise one book-grounded chat, one web-backed answer, one finished-book connection, one compaction, and one full generation run in the packaged desktop path.

## Handoff

Implement tasks in order. A task is complete only when its focused tests and relevant build checks pass. The Pi compatibility proof in Task 1 is an explicit stop condition: do not replace the working ask pane or generation provider on an unverified runtime assumption.
