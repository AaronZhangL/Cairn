# Issue tracker: Local Markdown

Specs and issues for Cairn live in `.scratch/` in this repository.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation tickets are separate files at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order.
- A `Status:` line near the top of each issue records its triage role. Comments append under `## Comments`.

When a skill says to publish a spec or ticket, write its file in the feature directory. When it says to fetch a ticket, read the referenced file.

## Wayfinding

- The map is `.scratch/<effort>/map.md`.
- Each decision ticket is `.scratch/<effort>/issues/<NN>-<slug>.md`, with `Type:` (`research`, `prototype`, `grilling`, or `task`) and `Status:` (`open`, `claimed`, or `resolved`) lines.
- A `Blocked by: NN, NN` line names prerequisites. A ticket is available when all blockers are resolved and it is open.
- Claim a ticket by setting `Status: claimed` before work. Resolve it by adding an `## Answer`, setting `Status: resolved`, and adding a short decision pointer to the map.
