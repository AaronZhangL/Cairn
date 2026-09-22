# Visual design

Why the interface looks the way it does. Read this before changing
`packages/ui/src/tokens.css` or any CSS that affects appearance — several values here are
load-bearing, and changing one silently breaks contrast or the depth hierarchy.

The rules come from Apple's design talks (*Designing Fluid Interfaces*, WWDC 2018; *The Details
of UI Typography*, WWDC 2020; *Principles of Great Design*, WWDC 2026), taken only where they
apply to this app.

## The strategy: stage-led

**Chrome recedes; the slide is the only object in the window with real elevation.**

This is a player. Attention belongs on the content. Three rules follow, and they come up
constantly:

1. **Only the slide gets a shadow** (`--elev-stage`). A bigger surface reads as a thicker one,
   so the deepest shadow is reserved for it. Everything else is flat or uses `--elev-low`.
2. **The current station is not a painted block.** It is marked by weight (620), full ink, and
   the accent dot. A filled highlight bar competes with the slide for attention — that was the
   problem with the previous design.
3. **Regions separate by surface, not by rules.** The sidebar and the ask pane use `--chrome`
   and carry no border. Where a divider seems necessary, use a scroll-edge fade instead of a
   1px line.

### Directions that were rejected

- **Floating translucent chrome** (content scrolling under a `backdrop-filter` layer). The best
  looking of the three, but the payoff lands in the moment of scrolling and is nearly invisible
  at rest, and its performance in WKWebView is unverified.
- **Solid panels** (three rounded cards with gaps). The most robust, but the gaps eat content
  width the sidebar does not have, and it reads as tidy rather than as depth.
- **Native macOS sidebar vibrancy.** **Not possible.** Electrobun's native layer ships no
  `NSVisualEffectView`; only `transparent: true`, which makes the window background see-through
  but not blurred. Real material would mean patching its native code.

## Colour

Every token lives in `packages/ui/src/tokens.css`, named for its role rather than its
appearance. `--chrome` means "the surrounding interface", not "grey": it is darker than
`--page` in dark mode and lighter in light mode.

| Token | Role |
| --- | --- |
| `--page` | The content area — the centre pane |
| `--chrome` | Sidebar and ask pane. Deliberately close to `--page` |
| `--card` | Floating surfaces: menus, modals |
| `--ink` | Body text and the current item |
| `--ink-quiet` | The chrome's default text. Chrome recedes by being quiet, never by dropping below 4.5:1 |
| `--dim` | Secondary information: durations, counts, hints |
| `--accent` | Current station, transport controls, actionable emphasis |
| `--stage` / `--stage-*` | The slide surface and the type on it |
| `--elev-low` / `--elev-mid` / `--elev-stage` | Three levels of elevation; the third belongs to the slide alone |

### Contrast, measured

Recompute this table whenever a colour changes. Text needs ≥ 4.5; state colours ≥ 3.0.

| Pair | Light | Dark |
| --- | --- | --- |
| `--ink` / `--chrome` | 13.81 | 16.79 |
| `--ink-quiet` / `--chrome` | 9.19 | 11.64 |
| `--dim` / `--chrome` | 4.99 | 6.01 |
| `--accent` / `--chrome` | 4.93 | 9.54 |
| `--ink` / `--page` | 15.50 | 16.37 |
| `--dim` / `--page` | 5.60 | 5.86 |
| `--accent` / `--page` | 5.54 | 9.30 |
| `--stage-ink` / `--stage` | 15.57 | 12.17 |
| `--stage-dim` / `--stage` | 6.47 | 5.06 |
| `--done` / `--chrome` | 4.06 | 8.08 |

Two more numbers decide whether the hierarchy holds at all. WCAG does not grade them; adjacent
surfaces normally sit between 1.2 and 1.6.

| Relationship | Light | Dark |
| --- | --- | --- |
| `--chrome` / `--page` (region) | 1.12 | 1.03 |
| `--stage` / `--page` (elevation) | 15.31 | 1.47 |

In dark mode `--stage` is **lighter** than `--page`, the reverse of light mode: in the dark a
stage cannot separate by being darker, only by being lifted. The previous palette had both as
warm blacks at 1.17, and the slide sank into the background — the most visible flaw it had.

### Accent

Terracotta `#b03a0b`, `#f0a44f` in dark. Swapping it is an isolated decision: change `--accent`,
`--soft` and `--stage-accent`, then recompute the three accent rows above.

## Typography

**One fixed `letter-spacing` is wrong somewhere.** Tracking and leading both follow size, in
opposite directions.

| Level | Size | Weight | Tracking | Leading |
| --- | --- | --- | --- | --- |
| Slide title `.s-h1` | 7.4cqw | 800 | `-.035em` | 1.1 |
| Slide heading `.s-h2` | 3cqw | 700 | `-.015em` | — |
| Pane and station titles | 15px | 640 | `-.011em` | — |
| Body | 15px | 400 | `0` | 1.55 |
| Station rows | 13px | 400/620 | `0` | — |
| Secondary text | 11.5px | 450 | `+.004em` | — |
| Small labels (stage names, kickers) | 10px | 620 | `+.075em` | — |

The pattern: **large type tightens, body sits at zero, small type opens up**; leading moves
inversely to size. Hierarchy is built from weight, size and leading together, not from size
alone — weight adds presence without taking more space.

System fonts first (`-apple-system` / `SF Pro Text` / `PingFang SC`), with
`font-optical-sizing: auto`. They already ship optical sizing and tracking tables; override only
with a reason.

### The fit ladder

Every slide size above is a fraction of the stage, so a string longer than its box **overflows
rather than shrinks**. The text comes from a model and has no length limit, so the sizes in the
table are the *designed* sizes, not the only ones a field is drawn at.

`packages/core/src/fit.ts` holds one budget per field — how many display units fit at the
designed size, derived as `available width ÷ font size × allowed lines` and shown with its
arithmetic. The layouts stamp a rung on the element (`data-fit`), and three rules in
`slide.css` turn the rung into type:

| Rung | Size | Tracking | Leading |
| --- | --- | --- | --- |
| `0` | ×1 | +0 | +0 |
| `1` | ×0.8 | `+.008em` | `+.06` |
| `2` | ×0.62 | `+.016em` | `+.12` |

The deltas are why this is one ladder and not three ad-hoc rules: **a field cannot step down in
size without its tracking and leading following**, which is the rule at the top of this section.
Every size is written as `calc(<designed> * var(--fit, 1))`, so the table above still reads as
the design.

Two numbers must move together. The rung thresholds in `fit.ts` are the reciprocals of the
scales here (`1/0.8`, `1/0.62`); change a scale without the threshold and a string lands on a
rung that still does not fit it. Past the last rung there is no size left, and
`pipeline/slides.ts` drops the slide instead of rendering it broken.

A list steps as a whole, from its longest item — three claims at three sizes read as an
emphasis nobody intended.

Nothing here can be unit-tested: overflow is a property of real layout and there is no render
setup. `?gauntlet` in `bun run dev` draws every layout at its worst, which is what the budgets
are checked against.

## Motion

There is almost none today, deliberately. When adding it:

- **Springs, not fixed-duration easing.** A spring can be interrupted and carries velocity; a
  scripted animation cannot.
- **Critically damped by default** (damping `1.0`, response `0.3–0.4`), no overshoot. Add bounce
  (damping ~`0.8`) only when the gesture itself carried momentum — a flick, a drag release.
- **Every animation is interruptible**, and starts from the current on-screen value, never from
  the target.
- **Feedback happens on pointer-down, not on release**, and updates continuously during the
  interaction rather than only at the end.
- Animate `transform` and `opacity` only.

## Accessibility

- `prefers-reduced-motion`: short opacity cross-fades; drop translation and overshoot.
- `prefers-reduced-transparency`: translucent surfaces such as the caption pill become solid.
- `prefers-contrast: more`: near-solid surfaces with a defined border.

The caption sits on a dark pill with a blur rather than using a text stroke: the stage is dark,
but slide type can run behind the caption, and a shadow alone will not separate them.

## Before changing anything

- [ ] Changed a colour → recompute both contrast tables; text pairs stay ≥ 4.5
- [ ] Added a shadow → check nothing is now competing with the slide for elevation
- [ ] Added a divider → ask whether a surface difference or an edge fade would do instead
- [ ] Added a type size → give it tracking and leading appropriate to that size
- [ ] Looked at it in both light and dark
