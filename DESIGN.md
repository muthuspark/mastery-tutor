---
version: "alpha"
name: "Paper & Ink"
description: "Design an editorial, literary, thoughtful landing page with paper and ink aesthetic. Ideal for editoras, blogs literários, revistas culturais, portfolios de escritores. AI-ready template."
colors:
  primary: "#faf9f7"
  secondary: "#1a1a1a"
  tertiary: "#c41e3a"
  neutral: "#f5f3ef"
  surface: "#666666"
  accent: "#8b7355"
typography:
  h1:
    fontFamily: Cormorant Garamond
    fontSize: 2.5rem
    fontWeight: 700
  body-md:
    fontFamily: Cormorant Garamond
    fontSize: 1rem
    fontWeight: 400
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    padding: 12px
---

## Overview

Design an editorial, literary, thoughtful landing page with paper and ink aesthetic. Ideal for editoras, blogs literários, revistas culturais, portfolios de escritores. AI-ready template. There's something almost subversive about bringing paper texture into a digital interface. For centuries, the relationship between ink and substrate was the entire design medium — letterpress operators obsessed over impression depth, printmakers chose papers that would hold ink without feathering, and book designers understood that the tooth of a page affected readability as much as the typeface itself.

When screens arrived, we spent decades pretending paper didn't exist. Flat design wiped every texture clean. But the pendulum swung back because readers noticed what was missing: warmth. A screen rendering Garamond on pure white (#fff) feels clinical. That same Garamond on a cream field with subtle fiber noise feels like something you want to spend an afternoon with.

The Paper & Ink aesthetic isn't skeuomorphism — nobody's adding fake leather stitching here. It's a selective reintroduction of analog signal. Ink bleed on headlines. Slight halftone grain in illustrations. Off-white backgrounds that reduce eye strain while signaling 'this content was crafted, not generated.' It borrows the authority of print without pretending the screen is a page.

- Density: 5/10 — Balanced
- Variance: 4/10 — Moderate
- Motion: 4/10 — Subtle

- **Style:** Editorial, Literary, Thoughtful, Elegant
- **Keywords:** paper, ink, editorial, literary, Cormorant Garamond, Source Serif 4, drop caps, pull quotes, horizontal rules, warm cream, crimson accent
- **Era:** Classic Literary + 2024 Modern
- **Light/Dark:** ✓ Full / ✗ No

## Colors

- **Warm Cream** (#faf9f7) — Light surface, card backgrounds
- **Charcoal** (#1a1a1a) — Dark surface, primary background
- **Crimson Accent** (#c41e3a) — Primary accent, CTAs and interactive elements
- **Light Cream** (#f5f3ef) — Secondary surface
- **Medium Grey** (#666666) — Secondary text, borders, muted elements
- **Soft Brown** (#8b7355) — Extended palette, decorative use


## Typography

- **Display / Hero:** Cormorant Garamond — Weight 700, tight tracking, used for headline impact
- **Accent:** Cormorant Garamond' for headings — Used for decorative or emphasis text
- **Body:** Cormorant Garamond — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Cormorant Garamond — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem


## Layout

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Split-screen (text left, visual right).
- **Feature sections:** Zig-zag alternating text+image rows. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).


## Elevation & Depth

Drop caps (first letter large and decorative), pull quotes with elegant styling, elegant horizontal rules (thin lines with ornaments), literary typography hierarchy, smooth page-like transitions 300ms

- **Physics:** Ease-out curves, 200-300ms duration. Smooth and predictable.
- **Entry animations:** Fade + translate-Y (16px → 0) over 420ms ease-out. Staggered cascades for lists: 80ms between items.
- **Hover states:** Subtle color shift + shadow adjustment over 200ms.
- **Page transitions:** Fade only (200ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.


## Shapes

Base corner radius: 8px. See rounded tokens in front matter for the full scale.


## Components

- **Primary Button:** Subtly rounded (0.5rem) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Subtly rounded (0.5rem) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.


## Do's and Don'ts

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No pure black (#000000) — use off-black or charcoal variants
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

- Do Cormorant Garamond + Source Serif 4 carregados
- Do Warm cream background #faf9f7
- Do Drop caps decorativos
- Do Pull quotes com estilo elegante
- Do Horizontal rules elegantes
- Do Crimson accent #c41e3a
- Do Typography hierarchy literária
- Do Responsivo mobile/tablet/desktop


## Use Case

Publishers, Literary blogs, Cultural magazines, Writer portfolios
