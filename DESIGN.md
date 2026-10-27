# Newton design system

Version: 2026-10-27

Status: approved direction, implemented across the landing page, studies, course index, chapter reader, and profile settings.

This document replaces the previous Nexus template reference. Use it as the source of truth for new interface work. Product behavior and learning requirements remain in PRODUCT.md and loop-prd.md.

## Direction

Newton is a quiet place to keep learning. The interface combines a white canvas, geometric typography, orange actions, and small pixel-art illustrations. It should feel thoughtful and approachable while giving reading, practice, and saved progress priority.

Use pixel art as a recognizable brand detail. Keep the working interface clear: readable type, familiar fields, explicit actions, and restrained separators.

## Color

All page backgrounds are white, including authentication, studies, courses, chapters, assessments, and settings. Secondary surfaces are neutral light gray. Do not reintroduce cream or warm beige backgrounds through page-specific overrides.

| Role | Token or value | Use |
| --- | --- | --- |
| Page | --color-paper: #fff | Page background and default surface |
| Secondary surface | --color-paper-2: oklch(0.97 0 0) | Progress panels, practice sections, active rows, supporting notes |
| Primary text | oklch(0.23 0.009 145) | Redesigned page text |
| Secondary text | oklch(0.47 0.012 86) | Supporting copy and metadata |
| Rule | oklch(0.72 0.018 88 / 45%) | Fine separators and panel outlines |
| Primary action | oklch(0.62 0.19 42) | Orange buttons and progress |
| Action hover | oklch(0.54 0.16 42) | Hover on redesigned primary actions |
| Mastered | Muted green | Completion labels and checks, paired with text |

Define shared backgrounds in app/globals.css. The aliases --paper, --surface, and --paper-deep inherit those tokens. Page styles may define their foreground and action tokens, but should inherit shared page backgrounds.

Existing fallback tokens still support older components. Prefer the redesigned foreground and action roles above when updating those components.

Use orange selectively for the next action, progress, and active navigation details. Keep errors, selection, and completion understandable without color alone.

## Typography

Authenticated pages use self-hosted Sora for headings and Manrope for body text, navigation, forms, buttons, and metadata.

| Element | Font | Typical size | Weight |
| --- | --- | --- | --- |
| Page heading | Sora | 36–40px desktop; 30px mobile | 600–700 |
| Featured course title | Sora | 28px desktop; 24px mobile | 600 |
| Section heading | Sora | 20–24px | 600 |
| Course and chapter row title | Manrope | 16–18px | 600 |
| Body and controls | Manrope | 16px | 400–600 |
| Supporting copy | Manrope | 14–15px | 400 |
| Metadata | Manrope | 12–13px | 400–500 |

Use modest negative tracking on headings, typically -0.03em to -0.04em. Keep body tracking natural and body line-height between 1.6 and 1.85. Limit lesson prose to roughly 65–75 characters per line.

The approved landing page retains Pixelify Sans headings and DM Mono text as an intentional pixel-themed entrance. Do not apply those fonts to dense study lists or lesson content. Code uses a monospace font; mathematical notation retains KaTeX.

Font files and their open-source licenses live in public/fonts. Serve fonts locally with font-display: swap.

## Layout and spacing

Use a 4px spacing unit, with 8px, 12px, 16px, 24px, and 32px as common steps. Group related text closely and use larger gaps between tasks.

Shared headers and footers align with the page gutters. Use fine horizontal rules, open layouts, and flat lists. Prefer square corners and small stepped details over rounded cards.

Typical content widths:

| Surface | Maximum width |
| --- | --- |
| Studies dashboard | 1420px |
| Course index | 1040px |
| Chapter reader | 1240px overall, with a reading column up to 760px |
| Profile settings | 896px |

Use flexible gutters on desktop and approximately 20px on small screens. Keep long titles and uninterrupted strings wrap-safe.

### Landing page

Use a compact header and footer, with Newton beneath the apple tree beside the email-code form. Fit the initial page into common desktop and portrait mobile viewports.

On small or short screens, shrink or hide decorative art before reducing control usability. Code-entry and error states need room. Allow scrolling when zoom, a keyboard, or unusually long content makes it necessary; never clip authentication controls.

### Studies dashboard

Lead with the workspace heading and a shallow resume panel. Place the study list beside the new-study form on desktop. Keep all saved studies reachable.

At sufficiently large desktop sizes, the dashboard fits the viewport and long study lists scroll within their section. On mobile, stack the resume panel, studies, and creation form with normal page scrolling.

Show real chapter counts and percentages. Preparing, failed, unstarted, and completed courses retain distinct, truthful actions.

### Course index

Show the course title with a small apple-tree illustration, followed by one progress summary and the export action. Present chapters as a sequential flat list.

Highlight open chapters with a neutral surface and an orange continuation cue. Mastered chapters keep separate Read and Retake actions. Locked chapters show their actual sequential and prerequisite requirements and remain non-navigable.

Retaking requires the existing confirmation dialog and its explanation of what is reset. Visual updates must preserve saved progress, exports, and prerequisite rules.

### Chapter reader

Use a compact course outline beside the reading column on desktop. On mobile, use a horizontally scrollable chapter navigation strip above the lesson.

Keep practice, original explanations, additional explanation levels, and assessment controls in their existing order. Preserve generation, loading, recovery, and explanation-depth behavior.

Lessons scroll naturally. Tables, equations, and diagrams may scroll within their own regions when necessary; they must not widen the whole page. Overflowing equations remain keyboard accessible.

### Profile settings

Use a clear heading, a small books illustration, and an open form layout. Keep the optional About me field, character count, personalization explanation, save feedback, and retry states visible.

Owner-only invitations remain a separate section below the learner profile. Preserve the existing access rules. Do not expose technical provider configuration in learner flows.

## Components

### Header and footer

Use the pixel apple beside the Newton wordmark on redesigned pages. Authenticated navigation retains Profile settings and Sign out. Authentication shows Private beta.

Use a slim neutral footer with a fine rule. Standard authenticated footer copy is “Grow your understanding.” and “Read. Practice. Reflect.”

### Buttons

Use solid orange for the main action and an outline or text treatment for secondary actions. Labels describe the outcome, such as Continue studying, Create study, Save profile, or Export notes.

Use square or subtly stepped edges. A shallow lower edge can reinforce pixel styling, but avoid large decorative shadows. Preserve visible keyboard focus and clear hover, pressed, pending, and disabled states.

Controls should have comfortable touch targets, normally at least 44px high. Long labels wrap on narrow screens.

### Fields

Use white fields, thin neutral borders, readable 16px text, and visible labels. Placeholders provide examples rather than replacing labels.

Keep help text, errors, character counts, and field associations intact. Preserve entered text after a failed request. Show success feedback close to the action.

### Progress

Use segmented rectangular tracks with actual proportional fill. Filled segments use orange; the remaining track is neutral gray.

Pair progress with a textual summary. Use accessible progress semantics where already present. Decorative tracks that repeat an adjacent summary are hidden from assistive technology.

### Lists and chapter states

Use spacing, typography, and fine horizontal separators. Avoid wrapping every row in a card. Chapter numbers and completion checks use small square treatments.

Status labels and actions must distinguish available, mastered, locked, preparing, and failed content without relying on color alone.

## Pixel artwork

Approved assets:

- public/images/newton-under-apple-tree.webp: landing illustration and compact course or resume vignette.
- public/images/studies-books.webp: supporting illustration for creation and settings.
- public/images/pixel-apple.svg: compact brand mark.

Keep crisp pixel edges with image-rendering: pixelated. Preserve transparency and aspect ratio. Render raster assets through next/image with appropriate sizes. Preload prominent above-the-fold artwork; supporting illustrations can load normally.

Artwork supports the task. Keep it small on authenticated screens and hide it when space is constrained. Decorative images have empty alt text and are excluded from the accessibility tree. The landing illustration has a meaningful description.

Generation prompts and provenance are stored beside generated artwork. Font licenses stay with the font files.

## Accessibility and behavior

Preserve skip links, landmarks, heading hierarchy, field labels, keyboard operation, and visible focus. Dialogs contain focus, support cancellation when appropriate, and restore focus to their trigger.

Support narrow screens, long course titles, enlarged text, and reduced motion. Scope CSS to its intended page so client navigation does not spread styles to unrelated screens.

Do not change authentication, study ordering, chapter access, progress calculations, quiz behavior, profile ownership, or invitation permissions as part of visual work.

Use short color transitions, typically 150–200ms. Do not add decorative motion to reading and assessment flows.

## Avoid

- Cream or beige page backgrounds.
- Pixel or monospace fonts throughout authenticated interfaces.
- Large decorative illustrations in study and reading layouts.
- Repetitive card grids, nested panels, gradients used as decoration, and glass effects.
- Game scores, streaks, XP, or other unsupported product features.
- Hidden or truncated saved studies.
- Forced viewport clipping on reading, settings, or accessibility states.
- Unsupported claims about learning effectiveness.

## Implementation and review

Shared tokens and controls live in app/globals.css. Route-specific styles currently live in app/login/login.css, app/studies.css, app/course/[id]/course-index.css, app/course/[id]/ch/[idx]/reader.css, and app/settings/settings.css.

Before editing Next.js code, read the relevant bundled guide in node_modules/next/dist/docs as required by AGENTS.md.

For UI changes, verify relevant existing component and browser tests. Inspect representative desktop and mobile renders. Check long titles, empty and failed states, keyboard focus, and image proportions when affected. Use the production build to verify font, CSS, and route integration.
