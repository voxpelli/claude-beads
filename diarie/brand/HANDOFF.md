# Handoff Spec: diarie.dev + brand-book.html

*Implementation contract for the two built pages. Token values:
[`tokens.css`](./tokens.css) / [`DESIGN.md`](./DESIGN.md). Rationale:
[`BRAND.md`](../BRAND.md). Both pages are single static HTML files with
fonts inlined; there is no build step to run in production — the reference
implementation is the spec's executable form, and this document is what
must survive any rewrite.*

## Overview

`index.html` is diarie.dev: dark ground (the light table), one screen of
hero followed by nine sections, two motion beats, zero external requests.
`brand-book.html` is the paper inversion of the same system. Everything
below applies to index.html unless marked *(book)*.

## Layout

| Property       | Value                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content column | `max-width: 66rem`, centered, `0 1.4rem` padding (book: 60rem)                                                                                                            |
| Section rhythm | `4.5rem 0` vertical padding; `3.2rem` below 540px                                                                                                                         |
| Section order  | hero → the record is yours → who it is for → the write side → ⁂ → taxonomy → library → the contract (band) → ⁂ → the refusals → lineage → closer → footer (⁂ = leaf rule) |
| Grids          | codes/types: 3 and 4 columns; aud/qa/sheet-grid: 2 columns                                                                                                                |

### Responsive behavior

| Breakpoint | Changes                                                           |
| ---------- | ----------------------------------------------------------------- |
| >840px     | Full layout as above                                              |
| 541–840px  | `codes`/`types` → 2 columns; `aud`, `qa`, `sheet-grid` → 1 column |
| ≤540px     | Everything 1 column; sections `3.2rem`; nav gap tightens          |

No layout uses fixed heights; all containers grow with content (long
translations must not clip — see Edge cases).

## Design tokens used

All colors, type cuts, radii, and durations come from `tokens.css` — no
literal values in components except the environmental ring tints
(`#191330`, `#1C1536`, `#1F183C`), which sit between `arkiv` and
`lysning-1` and are page-scoped atmosphere, not palette members.

| Token                 | Usage on these pages                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `--stil-arkiv` + cuts | h1 (`ordmarke`), h2 (`rubrik`), body (`brodtext`), exit-card numerals (`ordmarke` at 4.2rem) |
| `--stil-lasare`       | nav, eyebrows, terminals, agents card, stamps, footer fine print                             |
| `--markering`         | `.hl` marker wash — exactly 3 instances (why-fact 1, write-side, closer)                     |
| `--ease-lysning`      | every transition and animation; no other curve exists                                        |
| `--korn`              | grain overlay opacity (0.04)                                                                 |

## Components

| Component              | Variant/props                      | Notes                                                               |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `.mark` hero SVG       | halo ×4 + `.flower` group          | `transform-box: fill-box` required for per-circle scaling           |
| `.env`                 | 3 giant circles                    | `aria-hidden`, `z-index:-1`, clipped by `.hero` wrapper             |
| `.install`             | hero + closer instances            | JS binds every `.install`; button = only solid-fosfor element       |
| `.term`                | role="img" + aria-label            | Summarize the content in the label (WCAG H86); never leave it off   |
| `.sheet`               | tape ::before/::after, `.granskad` | Tilt −0.8°; ring shadow `0 0 0 6px lysning-2`                       |
| `.stamp` (refusals)    | `--r` rotation, `--d` delay        | Six items; dashed stämpel                                           |
| `.dnr` in `.dnr-scene` | INKOM date stamp                   | Scene rings behind; footer has `overflow:hidden`                    |
| `.leafrule`            | between section pairs              | `aria-hidden`; ornament background matches `arkiv` to mask the rule |
| `.hl`                  | inline span                        | Never inside headings; max 3/page                                   |

## States and interactions

| Element                        | State            | Behavior                                                                          |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------------- |
| Links                          | hover            | color → `papper` (dark) / `arkiv` (book); underline persists                      |
| Any focusable                  | `:focus-visible` | 2px `fosfor` outline, 3px offset (book: `hektograf`)                              |
| Copy button                    | default → click  | Clipboard write; label swaps to "copied" for 1600ms — text change only, no motion |
| Copy button                    | clipboard denied | Fallback: select the command text via Range so manual copy works                  |
| Install command                | any              | Never animates, never pulses — hard rule                                          |
| Type-specimen sliders *(book)* | input            | Update `font-variation-settings` live; native range = keyboard operable           |

## Animation / motion

Beat 1 (hero, load) and beat 2 (refusal stamps, scroll) are the page's
entire motion budget. All animation is gated behind
`@media (prefers-reduced-motion: no-preference)` **and** the `.anim` class
set by the head script; without either, everything renders complete and
static — full information parity, not a degraded page.

| Element              | Trigger                        | Animation                                           | Duration | Delay             | Easing           |
| -------------------- | ------------------------------ | --------------------------------------------------- | -------- | ----------------- | ---------------- |
| `.env circle` ×3     | load                           | fade + settle (`lysning` keyframe: 1.09 → 0.99 → 1) | 700ms    | 0/70/140ms        | `--ease-lysning` |
| `.halo` ×4           | load                           | same                                                | 700ms    | 200/290/380/470ms | same             |
| `.flower`            | load                           | fade + 7px rise                                     | 700ms    | 580ms             | same             |
| `h1` / tagline / sub | load                           | fade + 10px rise                                    | 700ms    | 740/900/1040ms    | same             |
| `.stamps .stamp` ×6  | ≥40% in viewport, once/session | settle from scale 1.16                              | 700ms    | 0–400ms stagger   | same             |

Sequence completes ≤1.8s. Stamp beat guards: `sessionStorage`
`diarie-stamps` set on first fire; if storage throws or
IntersectionObserver is absent, stamps render visible immediately.

## Edge cases

- **No JS**: head script never runs → no `.anim` class → fully static
  page; copy buttons present but inert (command remains selectable).
- **Reduced motion**: durations zeroed via token override + `.anim` never
  set; identical content.
- **Blocked storage/private mode**: try/catch around all storage; stamps
  degrade to always-visible.
- **Long strings / translations**: no fixed heights; `.term` and `.sheet
  pre` scroll horizontally (`overflow-x:auto`) rather than wrap code.
- **Slow connection**: single request; fonts are inline (`font-display:
  block` is safe — no network fetch can delay them). The measured cost of
  this trade is in BRAND.md; revival trigger: cold-mobile LCP > 2.5s.
- **Link previews**: `og.png` (1200×630) must be deployed at
  `https://diarie.dev/og.png` — the only sibling asset.
- **Empty/loading/error states**: none exist; the page has no data
  dependencies by design.

## Accessibility notes

- Landmarks: `header` (nav labelled "Site") → `main` → `footer`; one `h1`;
  section `h2`s in document order — focus order follows source order, no
  tabindex anywhere.
- Decorative visuals (`.env`, leaf rules, tape, `granskad`) are
  `aria-hidden`; meaningful visuals (`.mark`, terminals, `.dnr`) carry
  `role="img"` + descriptive `aria-label`.
- Contrast: every text/background pairing published in BRAND.md with WCAG
  and APCA values; follow APCA on disagreement. No body-size `stampel` on
  arkiv; no body-size `hektograf` anywhere on dark.
- `color-scheme: dark` (meta + CSS) so UA controls and scrollbars match.
- Copy buttons have `aria-label="Copy install command"`; the "copied"
  swap is text content, announced by nature of the button label change.

## Deployment

diarie.dev root = `index.html` + `og.png`. Everything else is repo
material. `brand-book.html` works from `file://` by design. At first npm
publish: update the INKOM stamp dates (index footer, book footer) and the
`dnr` version to the release, and verify the npm links resolve.
