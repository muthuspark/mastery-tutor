---
name: "Little Might"
description: "An editorial personal publication with warm paper, expressive serif headlines, fine rules, and orange accents."
colors:
  paper: "#f5f4ed"
  paper-2: "#efeee5"
  ink: "#0b0d0b"
  text-muted: "#52534e"
  text-soft: "#65655c"
  border: "#878b862e"
  rule: "#0b0d0b1f"
  rule-soft: "#0b0d0b0f"
  accent: "#f7591f"
  accent-tint: "#f7591f1a"
  footer: "#242422"
  field-inverted: "#ffffff"
typography:
  display-xl:
    fontFamily: '"Instrument Serif", "Times New Roman", serif'
    fontSize: "clamp(2.6rem, 1rem + 5.6vw, 5.4rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.022em"
  display-lg:
    fontFamily: '"Instrument Serif", "Times New Roman", serif'
    fontSize: "clamp(2.1rem, 1rem + 3.4vw, 3.6rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.018em"
  display-md:
    fontFamily: '"Instrument Serif", "Times New Roman", serif'
    fontSize: "clamp(1.6rem, 1rem + 1.4vw, 2.1rem)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.012em"
  archive-title:
    fontFamily: '"Instrument Serif", "Times New Roman", serif'
    fontSize: "clamp(1.35rem, 1.2rem + 0.6vw, 1.65rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.008em"
  body:
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  article:
    fontFamily: 'Lora, Georgia, "Times New Roman", serif'
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  article-desktop:
    fontFamily: 'Lora, Georgia, "Times New Roman", serif'
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.75
  eyebrow:
    fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    fontSize: "0.66rem"
    fontWeight: 500
    letterSpacing: "0.18em"
  eyebrow-desktop:
    fontFamily: '"Geist Mono", ui-monospace, monospace'
    fontSize: "0.72rem"
    fontWeight: 500
    letterSpacing: "0.2em"
rounded:
  chip: "4px"
  control: "6px"
  joined-form: "8px"
  overlay: "10px"
  circle: "999px"
spacing:
  base: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  gutter-mobile: "20px"
  lg: "24px"
  gutter-desktop: "32px"
  xl: "40px"
  hero-mobile: "56px"
  section-mobile: "80px"
  hero-desktop: "96px"
  section-desktop: "112px"
components:
  page-shell:
    width: "100%"
    size: "max-width: 1240px"
  subscribe-link:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  topic-chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.chip}"
    padding: "8px 14.4px"
    height: "min-height: 40px"
  topic-chip-hover:
    textColor: "{colors.accent}"
  newsletter-input:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "min-height: 48px"
  newsletter-submit:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "min-height: 48px"
  newsletter-submit-hover:
    backgroundColor: "{colors.accent}"
  newsletter-overlay:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.overlay}"
    padding: "20px"
    width: "min(30rem, calc(100vw - 2rem))"
---

# Design System: Little Might

## Overview

**Reference:** [littlemight.com](https://littlemight.com/), inspected 25 October 2026. This is an external design reference, not a description of Newton's current UI. It does not replace the repository's root design guide.

**Interpretation: an illustrated field journal.** The publication pairs expressive editorial typography with practical interface text and technical metadata. Warm paper, dark ink, hand-drawn imagery and orange emphasis establish its character. Large horizontal bands and thin rules organize the homepage; generous whitespace separates stories without enclosing every item in a card.

### Evidence and scope

- Inspected the rendered homepage at desktop `1367 × 799` and mobile `390 × 844`, plus the [YC article](https://littlemight.com/yc-summer-2026/) at desktop.
- Extracted custom properties, typography, component rules and media queries from the site's [published stylesheet](https://littlemight.com/_astro/_slug_.CbiYOqDc.css). The hashed stylesheet URL may change with deployment.
- Verified fonts through computed styles and loaded font faces. Values in frontmatter come from the live CSS and rendered elements. Semantic aliases such as `footer` name literal source colors; spacing names group observed utility values.
- Descriptive language and reuse guidance are interpretation. Responsive behavior was checked on the homepage; article mobile sizes below come from CSS. Hover, focus, overlay and reduced-motion behavior are CSS-defined unless stated otherwise. No form was submitted and no complete accessibility audit was performed.

### Composition and spacing

The principal homepage wrapper is centered with `max-width: 1240px`, including `20px` horizontal padding below `640px` and `32px` above it. Primary sections use `80px` vertical padding on small screens and `112px` from `640px`. The hero uses `56px` on small screens and `96px` from `640px`.

At `1024px`, the hero gives text up to `54%` of the inner width, has a minimum height of `660px`, and places the illustration as a right-aligned background. Its image size is `clamp(460px, 52%, 860px)`. A paper-to-transparent horizontal mask protects text readability. Below that breakpoint the illustration becomes an in-flow image above the copy, rather than disappearing.

The page progresses through the illustrated introduction, publication facts, muted press marks, featured and signature stories, topic links, an archive list, an inverted promotion, topic descriptions, an orange newsletter section and a dark footer. Preserve the changes in density between these sections.

## Colors

### Paper and ink

- **Paper / background:** `paper`, also named `--color-bg-warm` and `--color-paper` in source. It covers the main page and makes the illustration blend into the composition.
- **Secondary paper:** `paper-2` supplies subtle form and inset surfaces.
- **Ink:** `ink`, also `--color-text`, supplies principal text and the dark promotional band.
- **Muted and soft text:** `text-muted` supports descriptions; `text-soft` supports dates and quieter metadata. Do not reduce body text to the opacity used for decorative press logos.
- **Footer charcoal:** `footer` is a separate literal footer background, rather than the darker promotional ink.

### Orange and rules

- **Accent:** use orange for selected italic headline passages, primary calls to action, hover feedback and the full newsletter band. Its role varies by section; it is not limited to small decorative marks.
- **Accent tint:** a translucent orange surface for small interaction details.
- **Rule:** approximately 12% ink, used for section divisions, archive rows and control outlines. `rule-soft` is the lighter approximately 6% variant. `border` is a separate translucent gray-green token; preserve its alpha value.
- The inverted newsletter field deliberately uses white. This extraction records that exception rather than replacing it with paper.

## Typography

There are **four active families**, each with a distinct role:

| Role | Family | Treatment |
| --- | --- | --- |
| Headlines, wordmark and expressive emphasis | Instrument Serif | Primarily regular 400; real italic for selected phrases |
| Homepage descriptions, interface and forms | Inter | Regular body, medium and semibold controls |
| Navigation, eyebrows, dates, tags and code | Geist Mono | Small sizes, uppercase metadata and deliberate tracking |
| Long-form article paragraphs | Lora | Comfortable serif reading text, distinct from headline type |

Use the fluid `display-xl`, `display-lg` and `display-md` tokens directly. At the inspected desktop width, the first two resolved to `86.4px` and `57.6px`. The mobile hero resolved to `41.6px`. Headline tracking is tight and line-height is close to one; body text has more breathing room.

Eyebrows are uppercase, `0.66rem` with `0.18em` tracking by default. At `900px` they become `0.72rem` with `0.2em` tracking. Desktop navigation is a separate treatment: Geist Mono `0.78rem`, weight 500, tracking `0.15em`.

Article `.prose` is `18px / 1.75`, maximum width `700px`; at `900px` it becomes `20px / 1.75`, maximum width `760px`. The inspected article lead paragraph has an additional `21.6px / 33.48px` treatment. Ordinary paragraphs have `1.375rem` bottom spacing. Article headings use Instrument Serif; computed h2/h3 weight is 700 although the loaded Instrument Serif face is 400. Treat that as existing browser weight synthesis, not evidence of a native bold font file.

## Elevation

The homepage is mostly flat. Section rules, whitespace and paper tones do the main separation work. Avoid adding shadows to every story or container.

Two CSS-defined exceptions:

- Joined inverted newsletter form: `0 2px 8px #0000001f`.
- Newsletter overlay panel: `0 22px 64px #0b0d0b2e`, against a `#0b0d0b3d` scrim.

The header is sticky at the top with a 92%-opaque warm-paper background and `6px` backdrop blur. This is a narrow navigation treatment, not a general translucent-card system.

The dark promotional band includes a CSS dot texture with `22px` repetition and a masked fade. A CSS-defined orange scan effect runs once for `2.4s` after a `0.2s` delay; reduced-motion rules disable it. Ordinary color and opacity transitions are generally `150ms`. Keep these effects subordinate to reading.

## Components

### Navigation

The wordmark is serif and left aligned. Desktop navigation uses uppercase mono labels with orange hover text. The Subscribe link uses a small orange rectangle with `6px` corners: `8px 16px` padding on small screens and `10px 20px` from `640px`; hover reduces opacity to 90%.

Below `640px`, the text navigation hides while the wordmark and Subscribe remain. The inspected mobile header did not show a replacement hamburger control; do not invent one as part of a faithful extraction.

### Hero and illustration

The opening composition combines a serif headline, orange italic emphasis, an author portrait/eyebrow, a short deck, explanatory sans text and a newsletter prompt. The desktop illustration overlaps the visual territory beside the copy, without becoming a framed card. Mobile presents the artwork first.

The artwork uses monochrome hand-drawn objects, soft shading and sparse warm details. Use this art direction as a reference; the site's author portrait and [hero asset](https://littlemight.com/images/home-hero-me-v1c-cutout.png) are source-specific assets, not generic reusable product illustrations.

### Archive rows

`.dateline-row` is a ruled list item, not an elevated card. It uses `25.6px` vertical padding and a `1px` top rule; the last item also gets a bottom rule.

Below `820px`, it is one column. At `820px`, use `9rem 1fr auto` columns with `32px` horizontal gaps and baseline alignment. Titles use the `archive-title` token, descriptions use Inter `0.98rem / 1.5` with a `58ch` limit, dates use mono `0.7rem`, and tags use mono `0.66rem`. Titles and tags turn orange on hover.

### Topic chips

Small rectangular outline links with `4px` corners, a `1px` rule border, transparent fill and `40px` minimum height. Labels are uppercase Geist Mono `0.68rem`, weight 500, tracking `0.14em`; padding is `8px 14.4px`. Hover changes both border and text to accent. Preserve wrapping for long collections.

### Newsletter forms

There are multiple forms; do not collapse them into one universal appearance:

- **Hero inline form:** a joined input/action treatment. The action uses uppercase mono `0.7rem`, weight 500, tracking `0.12em`, with orange background and `24px` horizontal padding. Its hover background is ink.
- **Standard component:** wrapping flex fields with `0.6rem` gaps. Inputs are secondary paper, `1px` rule border, `6px` corners and `48px` minimum height. Focus uses a `2px` orange outline offset by `2px`. The submit button is ink with paper text, changing to orange on hover.
- **Inverted section form:** joined white input and ink arrow action inside an `8px` clipped wrapper, maximum width `26rem`, with `52px` minimum field height. It uses the subtle form shadow listed above. Field focus uses a white inset outline.
- CSS-defined disabled submit buttons use 60% opacity and a not-allowed cursor. Status text appears below the form; error uses accent, success uses muted text. These states were inspected in CSS, not exercised with a submission.

### Newsletter overlay

The published component defines a fixed overlay with a centered paper panel, `10px` corners and maximum width `30rem`. The base padding is `20px`; the narrow-screen variant uses `16px`. Its close control is a `40px` outlined circle. The title is Instrument Serif with tight line-height. The overlay was identified in DOM/CSS; opening, focus trapping and keyboard dismissal were not tested.

### Article content and links

Keep the narrow Lora reading column separate from broad homepage grids. Body links use a fine underline offset by `5px`, changing text and underline to accent on hover. Figures can break the reading rhythm with larger illustration or data-graphic treatments.

Article CSS defines distinct quote and code styles, including orange vertical markers. These are source-specific article treatments, not a general rule to place stripes on every container. Code uses Geist Mono, horizontally scrollable dark blocks, and small inline-code surfaces.

### Press marks and footer

Press logos are grayscale at 45% opacity, moving to 75% on hover. Their wrapping row uses `32px` vertical gaps and `40px` horizontal gaps, widening to `56px` from `640px`.

The footer changes to charcoal, with a serif wordmark and grouped text links. Keep the column structure and generous padding rather than treating it as a small copyright strip.

## Do's and Don'ts

### Do

- **Do** preserve the four font roles; article Lora and homepage Inter serve different reading contexts.
- **Do** use the source's fluid headline formulas, real italics and orange emphasis.
- **Do** retain `1240px` shells, responsive gutters, thin rules and generous section spacing.
- **Do** adapt structure at the observed breakpoints: `640px` navigation/gutters, `820px` archive rows, `900px` reading type, `1024px` hero art.
- **Do** preserve artwork on mobile and distinguish illustrative assets from interface decoration.
- **Do** keep source-specific values and neutral aliases identifiable so later adaptation is deliberate.

### Don't

- **Don't** turn every archive entry into a rounded, shadowed card.
- **Don't** substitute Inter or Lora for Instrument Serif headlines, or Instrument Serif for all reading text.
- **Don't** apply orange uniformly: large orange sections and restrained orange link states play different roles.
- **Don't** infer a complete dark theme from the dark promotion and footer.
- **Don't** assume loaded-but-unused font declarations, hidden components or framework utility scales are all active design choices.
- **Don't** treat observed CSS as proof of accessible contrast or tested keyboard behavior. Check those when adapting components.
- **Don't** copy the author's identity, artwork or written content into another brand without the necessary rights.
