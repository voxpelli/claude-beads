---
version: alpha
name: diarie
description: >-
  The visual identity of diarie — a flat-YAML task tracker that is just
  files. Registry honesty (diarium), herbarium warmth, stepped light.
colors:
  arkiv: "#171126"
  yta: "#1F1733"
  yta-2: "#2A1F45"
  lysning-1: "#221940"
  lysning-2: "#2E2257"
  lysning-3: "#3C2D6E"
  lysning-4: "#4B3A87"
  papper: "#EFE6D2"
  lavendel: "#B7ABDD"
  hektograf-ljus: "#9C90C4"
  hektograf: "#6B4FC8"
  fosfor: "#5CE49A"
  barnsten: "#E8A13C"
  stampel: "#D8453E"
  stampel-ljus: "#E8756B"
  stampel-mork: "#A83732"
  kant: "rgba(239, 230, 210, 0.16)"
  markering: "rgba(107, 79, 200, 0.32)"
typography:
  ordmarke:
    fontFamily: Fraunces
    fontSize: 88px
    fontWeight: 520
    lineHeight: 1
    fontVariation: '"opsz" 144, "wght" 520, "SOFT" 60, "WONK" 1'
  rubrik:
    fontFamily: Fraunces
    fontSize: 34px
    fontWeight: 480
    lineHeight: 1.15
    fontVariation: '"opsz" 72, "wght" 480, "SOFT" 40, "WONK" 1'
  brodtext:
    fontFamily: Fraunces
    fontSize: 17px
    fontWeight: 415
    lineHeight: 1.65
    fontVariation: '"opsz" 15, "wght" 415, "SOFT" 0, "WONK" 0'
  lasare:
    fontFamily: Fragment Mono
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.7
  lasare-detalj:
    fontFamily: Fragment Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.1em
rounded:
  xs: 3px
  sm: 4px
  md: 6px
spacing:
  sm: 1rem
  md: 1.4rem
  lg: 2.4rem
  xl: 4.5rem
components:
  term:
    backgroundColor: "{colors.yta-2}"
    textColor: "{colors.papper}"
    rounded: "{rounded.md}"
    typography: "{typography.lasare}"
    padding: 1.1rem
  specimen-sheet:
    backgroundColor: "{colors.papper}"
    textColor: "{colors.arkiv}"
    rounded: "{rounded.md}"
    padding: 1.4rem
  install:
    backgroundColor: "{colors.yta-2}"
    textColor: "{colors.papper}"
    rounded: "{rounded.md}"
    typography: "{typography.lasare}"
  install-button:
    backgroundColor: "{colors.fosfor}"
    textColor: "{colors.arkiv}"
    rounded: "{rounded.sm}"
    typography: "{typography.lasare}"
  marker-wash:
    backgroundColor: "{colors.markering}"
    textColor: "{colors.papper}"
    rounded: "{rounded.xs}"
  stamp-dnr:
    textColor: "{colors.stampel-ljus}"
    typography: "{typography.lasare-detalj}"
  exit-card:
    backgroundColor: "{colors.yta}"
    textColor: "{colors.lavendel}"
    rounded: "{rounded.md}"
    padding: 1.3rem
---

# diarie — DESIGN.md

*Agent-facing projection of the diarie identity. Canonical sources are
[`tokens.css`](./tokens.css) (values), [`BRAND.md`](../BRAND.md) (rationale),
and the SVG files (geometry); when this file and those disagree, those win.
Implementation contract for the built pages: [`HANDOFF.md`](./HANDOFF.md). Border colors are outside
the component schema: hairlines are always `kant` at 0.5px, stamp borders
always `stampel` (dark ground) or `stampel-mork` (paper) at 1.5px.
Lint: `npx @google/design.md lint DESIGN.md` — current status: 0 errors,
11 accepted warnings (palette members referenced by the page ground, halo,
borders, and terminal states rather than by schema components).*

## Overview

diarie is a task tracker that is just files — no daemon, no database, the
CLI a reader over YAML the user's editor writes. The identity holds one
anchor and two motifs. Anchor: the **diarium**, the Swedish public
registry — every record numbered, findable, never hidden. Motifs: the
**herbarium** (Linné's specimen sheets: 280-year-old plain files; the
pressed twinflower mark) and **genomlysning** (the archivist's light table;
in Swedish also the word for scrutiny — the halo is backlighting, not aura).

The register is honest, so the design is honest: consequences are named,
contrast ratios are computed and published, costs are stated with their
revival triggers. Any visual decision that cannot be traced to the anchor,
a motif, or an invariant in VISION.md does not belong in the system.

## Colors

Names are Swedish, ASCII-folded: *arkiv* archive (page ground), *yta*
surface, *lysning* the stepped backlight (four flat steps, outer → inner,
never a gradient), *papper* herbarium paper, *hektograf* the violet
copy-ink of the analog office, *fosfor* terminal phosphor, *bärnsten*
amber, *stämpel* stamp red.

**The highlights have jobs — this is the load-bearing rule.** The accents
are the CLI's exit-code contract: `fosfor` is exit 0 and `ready`, and
speaks only for the terminal — never decorative, never where it could be
mistaken for "workable". `barnsten` is exit 1 (asked wrong; stale claims).
`stampel` is exit 2 — the rejection stamp belongs to `validate`. Blocked
is `lavendel`: waiting, not wrong.

Contrast is verified in both models (WCAG 2.x and APCA-W3); the full table
lives in BRAND.md. Follow APCA where they disagree: `hektograf` on arkiv
(Lc −22) is borders and decoration only, even at display sizes;
`stampel-ljus` (Lc −46) carries short status labels, not paragraphs; on
papper use `stampel-mork`. Body text on arkiv is `papper` (primary),
`lavendel` (secondary), `hektograf-ljus` (muted).

## Typography

Two voices, no third, because the architecture has exactly two sides: the
**archive voice** is Fraunces — what the human wrote — and the **reader
voice** is Fragment Mono — what the CLI reports. The split is semantic: on
any surface addressing both audiences, human-facing prose is serif and
machine-facing content (commands, output, codes, the agents card) is mono.

Fraunces is variable; the cuts are tokens. `ordmarke` (opsz 144, WONK 1)
is the identity cut — wordmark and hero only, at 40px and above. `rubrik`
keeps the wonk for headings. `brodtext` turns wonk and softness off:
character belongs at display sizes, never in running text. Sizes in the
front matter are reference points; the pages scale them with `clamp()`.

Fonts are always self-hosted (both OFL, no Reserved Font Names — subsetting
needs attribution only). On the site they are subset and inlined so the
page arrives whole; the measured cost is named in BRAND.md.

## Layout

One centered column, `max-width: 66rem`, `1.4rem` side padding. Vertical
rhythm in rem: `1rem` grid gaps, `1.4rem` component padding, `2.4rem`
column gaps, `4.5rem` section padding (spacing tokens sm–xl). Breakpoints:
below **840px** multi-column grids collapse to one or two columns; below
**540px** everything is single-column and sections tighten to `3.2rem`.
The scene recurs between chapters via the leaf rule; the light table
appears at full strength only in the hero and faintly behind the footer
stamp — the lamp left on.

## Elevation & Depth

The system is flat; depth is light, not shadow. The only permitted shadow
is the specimen sheet's mounting ring (`box-shadow: 0 0 0 6px` in
`lysning-2` — paper pressed onto the table). All other depth comes from
stepped light (concentric flat circles in the lysning ramp, at any scale)
and surface steps (arkiv → yta → yta-2). A static risograph grain covers
the dark ground at 4% opacity (`--korn`) — texture, never animated.

## Shapes

Corners are `6px` on cards and terminals, `3px` on the marker wash;
borders are `0.5px` hairlines in `kant`. Stamps are the sharp exception:
`1.5px` borders, rotated a few degrees off true (−4° to −7°), dashed for
`granskad`, solid with an inner rule for the `INKOM` date stamp. The mark's
bells are deliberately asymmetric — pressed specimens are never symmetric —
and the halo is always four flat steps.

## Components

The built vocabulary, with token bindings in the front matter: **term**
(terminal block; phosphor for commands and exit-0 output, lavendel for
structure, amber for staleness, stämpel-ljus for errors; `role="img"` with
a summarizing `aria-label` per WCAG H86); **specimen-sheet** (paper card,
tilted −0.8°, tape corners, optional `granskad` stamp; YAML with hektograf
keys); **install** (mono pill with copy button — the button is the page's
only solid-fosfor element and never animates); **marker-wash** (emphasis,
at most three per page); **stamp-dnr** (`INKOM <date>` over `dnr <version>`; site footer and release notes only); **exit-card** (oversized
`ordmarke`-cut numeral colored by exit code); the **leaf rule** (hairline
with the mark's opposite leaf-pair). Full states, motion timings, and edge
cases: HANDOFF.md.

## Do's and Don'ts

Do: stepped light at any scale; static grain up to 5%; name the
consequence, not the adjective; lowercase `diarie` always; consequences
with revival triggers; mono for anything a machine said.

Don't — these are identity, not preference: no gradient glow (the halo is
stepped or it is not the halo); no mascot (the twinflower is a specimen —
it does not wave or wear a hard hat during errors); no dark-pattern motion
(nothing animates on or near a call to action); no tracking, ever; no
third typeface; no second easing (`cubic-bezier(0.22, 0, 0.18, 1)` is the
only curve); no fosfor as decoration; no brand asset behind a login.
