# diarie — Brand

*Status: v0.1.1, drawn 2026-07-18 and revised the same day after an external
audit. Canonical. `brand-book.html` is a rendering of this file and the token
files; when they disagree, the files win.*

This is the visual and verbal identity of diarie, held to the same test as the
code: **plain files you own, and nothing that owns you back.** The brand is a
markdown file, two token files, and two hand-editable SVG:s. There is no
portal, no Figma you must be invited to, no webfont CDN phoning home.
Uninstall everything and the identity is still here, in the repo, diffable.

## The idea

**One anchor: the diarium.** Every Swedish myndighet keeps one — the
registry where each incoming and outgoing handling is recorded, numbered,
findable, never hidden. That is offentlighetsprincipen, 1766, the world's
first freedom-of-information law, and it maps onto the invariants one to
one. A malformed row is represented, never silently dropped. Git is the
audit log. Every task has its id — its diarienummer. The register aesthetic
is not decoration on the ethos; it *is* the ethos, 250 years older than the
tool. When the brand must say one thing, it says this.

**Two supporting motifs**, subordinate to the anchor:

- **Herbarium** — the -arium sibling, an archive of living things — gives
  the identity its mark and its warmth. Linné's specimen sheets are
  280-year-old plain files: paper, a pressed flower, a label, a stamp —
  still readable, no vendor, no format rot. His taxonomy is diarie's type
  system (one genus per specimen, many descriptors), and the dependency
  graph is the root system, with `ready` above the soil.
- **Genomlysning** — examining a sheet by backlighting it, which in Swedish
  is also the word for scrutiny — gives the mark its halo. Not an aura: the
  light table. The glow *is* the honesty.

One sentence, for when only one fits: *diarie is a public record of your
own work — pressed flat, backlit, and honest.*

## The mark

The mark is a pressed *Linnaea borealis* — the twinflower, named for Linné,
his own favorite: a small, modest, Nordic woodland plant. Two nodding bells
on one forked stem, which is also the tool's central pair — the CLI reads,
your editor writes. Behind it, the light table: a halo in four flat steps.

Files: [`diarie-mark.svg`](./brand/diarie-mark.svg) (square),
[`diarie-favicon.svg`](./brand/diarie-favicon.svg) (the pixel cut: leaves and
bracts dropped, strokes thickened, bells enlarged — use it below 24 px,
the full mark above) and
[`diarie-lockup.svg`](./brand/diarie-lockup.svg) (mark + wordmark). Both are
commented and meant to be edited by hand; the lockup's wordmark is Fraunces
converted to outlines, so neither file needs a font installed.

Rules, few and firm:

- **The halo is stepped, never a gradient.** This is risograph light, not
  lens flare. Four steps: `lysning-1` through `lysning-4`, outer to inner.
- **The flower is papper or arkiv.** Cream on dark, ink on paper. No third
  color, no gradients, no outline version.
- **Clearspace is one bell-height** on all sides (26 units on the mark's
  256 grid). Minimum size: 24 px for the mark, 140 px wide for the lockup.
- **Don't** detach the bells, tilt the mark, add a drop shadow, place it on
  photography, or animate it beyond the one sanctioned reveal (see Motion).

Named honestly, because the reader is honest: the twinflower is not an
unclaimed symbol. It appears in Linné's own coat of arms (1757) and in the
Linnean Society of London's heraldry — scientific-heritage bodies, not
software, so confusion risk is low but not zero. And *Linnea* is among
Sweden's most common given names: to a Swedish eye the flower reads as
culturally familiar rather than proprietary. diarie borrows the specimen;
it does not claim the species.

## Color

Names are Swedish, ASCII-folded in code. The glossary, so nothing is a
secret handshake: *arkiv* — archive; *yta* — surface; *lysning*, from
*genomlysning* — backlighting, scrutiny; *papper* — paper; *hektograf* — the
violet copying-ink of old offices, the color of every stamp pad and
anilinpenna in every Swedish myndighet of the analog era; *lavendel* —
lavender; *fosfor* — phosphor, the green of the terminal; *bärnsten* — amber;
*stämpel* — stamp.

Canonical values live in [`tokens.css`](./brand/tokens.css) (with
[`tokens.json`](./brand/tokens.json) as the tooling twin). The palette, with its
verified WCAG ratios:

| token | hex | role | WCAG 2.x | APCA Lc |
| --- | --- | --- | --- | --- |
| `arkiv` | `#171126` | page ground | — | — |
| `yta` / `yta-2` | `#1F1733` / `#2A1F45` | raised surfaces, code | — | — |
| `lysning-1…4` | `#221940 → #4B3A87` | the halo, outer → inner | decorative | decorative |
| `papper` | `#EFE6D2` | text on dark; paper surface | 14.78:1 | −91 |
| `lavendel` | `#B7ABDD` | secondary text | 8.63:1 | −60 |
| `hektograf-ljus` | `#9C90C4` | muted text | 6.29:1 | −45 |
| `hektograf` | `#6B4FC8` | ink: borders, display; body on papper | 3.13 / 4.73:1 | −22 / 65 |
| `fosfor` | `#5CE49A` | the terminal's voice | 11.37:1 | −75 |
| `bärnsten` | `#E8A13C` | warnings, staleness | 8.38:1 | −59 |
| `stämpel` | `#D8453E` | the rejection stamp | 4.23:1 — large only | −32 |
| `stämpel-ljus` / `-mörk` | `#E8756B` / `#A83732` | red at body size, dark / paper | 6.28 / 5.19:1 | −46 / 67 |

APCA values are Lc per APCA-W3 0.0.98G-4g (negative = light-on-dark), given
alongside WCAG 2.x because APCA is the stricter, perceptually honest model —
and it is stricter here in two places worth naming. `hektograf` on arkiv
scores Lc −22: decorative and border use only, even at display sizes.
`stämpel-ljus` scores Lc −46: fine for short status labels, not for
paragraphs. Where the two models disagree, follow APCA.

**The highlights have jobs.** This is the rule that keeps the palette from
being a mood board. The accents are the exit-code contract, in color:

- `fosfor` is **exit 0** and `ready` — the answer, on stdout. It speaks for
  the CLI and for nothing else. Never use it decoratively where it could be
  mistaken for "this is workable".
- `bärnsten` is **exit 1** — you asked wrong (`ENOSTORE`, `EUSAGE`,
  `EEXIST`) — and stale claims. Correctable, not condemned.
- `stämpel` is **exit 2** — it ran, and the answer is no. The stamp belongs
  to `validate`, because `validate` is the authority that rejects.

One hazard, named plainly because pretending otherwise would be off-brand:
dark ground with a single acid-green accent is a default AI aesthetic in
2026. What keeps this palette specific is everything the default lacks — the
paper, the stamps, the stepped light, the amber and red as full citizens,
and the fact that every accent is a semantic claim you can check against the
CLI:s actual exit codes.

## Type

Two voices, no third — because the architecture has exactly two sides:

- **The archive voice** is [Fraunces](https://github.com/undercasetype/Fraunces)
  (OFL): what the human wrote. Old-style, soft-serifed, a bit wonky — the
  hand in the herbarium label.
- **The reader voice** is
  [Fragment Mono](https://github.com/weiweihuanghuang/fragment-mono) (OFL):
  what the CLI reports. Plain, legible, unornamented — klarspråk as a
  typeface.

Fraunces is a variable font; the cuts are tokens:

| cut | axes | use |
| --- | --- | --- |
| `ordmärke` | opsz 144 · wght 520 · SOFT 60 · WONK 1 | the wordmark and hero only, ≥ 40 px |
| `rubrik` | opsz 72 · wght 480 · SOFT 40 · WONK 1 | headings |
| `brödtext` | opsz 15 · wght 415 · SOFT 0 · WONK 0 | running text — wonk off at reading sizes |

Neither family declares a Reserved Font Name in its upstream OFL notice
(verified against both projects' license files), so subsetting and inlining
require attribution only — the copyright lines travel in a comment at the
bottom of every page.

**Fonts are self-hosted, always.** No Google Fonts hotlinking, no font CDN:s
— partly the LG München GDPR ruling, mostly the principle: a page that
depends on a third party to render its own name has already lost the
argument this project exists to make. On diarie.dev the subset woff2:s are
inlined as data URI:s, so the page is one file and arrives whole. Regenerate
the subsets from the upstream OFL files with:

```bash
pyftsubset "Fraunces[SOFT,WONK,opsz,wght].ttf" --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+2192,U+00B7" \
  --layout-features="*" --no-hinting
```

## Voice

The register is klarspråk. Swedish law requires public language to be
*vårdat, enkelt och begripligt* — cared-for, simple, comprehensible
(Språklagen 2009:600, §11) — and a tool named after a myndighet's registry
writes like one, at its best. The README already does; this section only
writes the rules down.

1. **Name the consequence, not the adjective.** Not "invalid priority" but
   "invalid priority `urgent` — it will be treated as `medium`". The
   consequence is the part that tells the reader whether to care.
2. **The refusal is part of the product.** Say no plainly, give the reason,
   and where one exists, name the revival trigger. Never apologize for a
   design decision; never hide one.
3. **No superlatives.** The strongest available sentence is a plain claim:
   "That is the whole product." If a sentence would survive on a SaaS
   landing page, rewrite it.
4. **diarie is lowercase.** Always, including at the start of a sentence.
   It is a command, not a company.
5. **House punctuation:** the em-dash pivot (setup — destination) and the
   colon as the seam between claim and evidence. Both make the reasoning
   visible, which is the point of the reasoning.
6. **Never anthropomorphize past the one licensed phrase:** *the reader is
   honest.* The tool has no feelings, only obligations.
7. **Swedish is seasoning, not gatekeeping.** Loanwords welcome — always
   glossed on first use.

Words that do not appear: *blazing, seamless, powerful, supercharge,
game-changing, simply, just* (the adverb), and any sentence beginning
"Unlock".

## Motion

Motion follows the same discipline as color: scarce, and with a job.

- **At most three beats per page; the hero owns one.** Everything else is
  functional transition, not spectacle.
- **Never on the install command or any call to action.** Motion that leans
  on a decision is a dark pattern; diarie does not lean.
- **One easing:** `--ease-lysning`, `cubic-bezier(0.22, 0, 0.18, 1)` — slow
  start, fast middle, very slow stop; the light coming up on the table.
  Never the browser's default `ease`.
- **Reduced motion is full parity.** `prefers-reduced-motion` gets the
  complete page, rendered at once — the same information, calm. Degrading
  honestly applies to animation too.
- **Nothing runs longer than two seconds,** and below-the-fold beats fire
  once per session, not on every scroll.

## Applications

**The CLI itself.** Terminal output uses the semantic tokens: ready rows in
`fosfor`, stale claims in `bärnsten`, `validate` findings in `stämpel`,
structure in `lavendel`. `NO_COLOR` and non-TTY output are respected without
information loss — color is annotation, never the message.

**The stamp.** Releases carry the diarienummer device: a rectangular date
stamp, stamp-red, reading `INKOM <date>` over `dnr <version>` — the mark a
registrar puts on a handling the day it arrives. It appears on the site
footer, in release notes, and nowhere else — a stamp used everywhere
certifies nothing. Its sibling `granskad` (examined) may appear once, on a
specimen sheet.

**The small devices.** The marker wash — a hektograf tint over a key
phrase, at most three per page, because emphasis is scarce. And the leaf
rule: a hairline carrying the mark's opposite leaf-pair, letting the scene
recur between sections. The closing line on any diarie surface makes the
exit the pitch — leaving is free, and saying so is the brand.

**diarie.dev.** One static HTML document. Fonts inlined, zero external
requests, no analytics, no cookies, no consent banner because there is
nothing to consent to. The consequence, named: ≈152 KiB of subset fonts
become ≈203 KiB of base64 (+33 %), the page lands around a quarter-megabyte
as a single request, and fonts cannot be cached separately from it — a
repeat visit refetches everything unless the file itself is cached.
Performance orthodoxy says split them; diarie keeps the one file because
the page is the artifact — it survives `curl`, `file://`, and the archive
whole — and pays the cost knowingly. If measurement ever shows LCP above
2.5 s on a cold mobile load, that is the named trigger for revisiting.
One sibling asset exists: `og.png` (1200 × 630), the link-preview card —
path-rendered from the mark, wordmark, and tagline so it needs no fonts.
Scrapers fetch it; the page never does. View source is a feature: the page practices what the
tool preaches, and it survives `curl`, `file://`, and the Internet Archive
without modification.

**The README.** Badges only for claims that are true and checkable (license,
CI, version). No stars-counter theater.

## The refusals, brand edition

Like the roadmap's non-goals, these are identity:

- **No gradient glow.** The halo is stepped or it is not the halo. The
  sanctioned atmosphere is stepped light at any scale and static print
  grain (`--korn`, ≤ 5 % opacity) — risograph, never lens flare.
- **No mascot.** The twinflower is a specimen, not a character. It does not
  wave, wink, or wear a hard hat during errors.
- **No dark-pattern motion** — no pulsing CTA:s, no fake urgency, no
  confetti at the moment of a decision.
- **No tracking, ever,** on any diarie surface. A registry that surveils its
  readers has misunderstood which direction the transparency goes.
- **No third typeface, no second easing, no off-token colors.** Scarcity is
  what makes the system legible.
- **No brand asset behind a login.** The brand is files. Leaving — forking,
  re-theming, deleting — must always be free.

## Lineage

The same canon as [VISION.md](./VISION.md), applied one layer up: local-first
(Ink & Switch), convivial tools (Illich), calm technology (Weiser & Brown),
worse-is-better (Gabriel), and the indieweb's own-your-data ethos — plus
Linné's herbarium and the Swedish diarium, which were local-first before the
term, and klarspråk, which was tone-of-voice guidance before brand books.
The canon is not borrowed for the occasion; it is the author's own
long-kept library. Maggie Appleton's
[Home-Cooked Software](https://maggieappleton.com/home-cooked-software)
carries the Illich thread — that people "should have agency and ownership
over their data and software." Amber Case's calm-technology work holds the
standard the site aims at: the smallest possible claim on attention. And
Jeremy Keith's [Declarative design](https://adactio.com/journal/18982)
names the test diarie applies to itself: "It all depends on whether the
philosophy behind the tool matches your own philosophy."

A visual identity is a small place to apply them. That is the point.
