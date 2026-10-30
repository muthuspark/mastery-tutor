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

These foreground and action roles are shared globally, including quizzes, results, loading screens, recovery screens, and the not-found page. Route styles should not redefine the shared theme.

Use orange selectively for the next action, progress, and active navigation details. Keep errors, selection, and completion understandable without color alone.

## Typography

All pages use self-hosted EB Garamond for body text, navigation, forms, buttons, and metadata. Authenticated headings retain Roboto Condensed. Regular and italic variable fonts cover weights 400–800. Their font-face declarations live once in app/globals.css so initial loads and client navigation use the same type system.

| Element | Font | Typical size | Weight |
| --- | --- | --- | --- |
| Page heading | Roboto Condensed | 36–40px desktop; 30px mobile | 600–700 |
| Featured course title | Roboto Condensed | 28px desktop; 24px mobile | 600 |
| Section heading | Roboto Condensed | 20–24px | 600 |
| Course and chapter row title | EB Garamond | 16–18px | 600 |
| Body and controls | EB Garamond | 16px | 400–600 |
| Supporting copy | EB Garamond | 14–15px | 400 |
| Metadata | EB Garamond | 12–13px | 400–500 |

Use modest negative tracking on headings, typically -0.03em to -0.04em. Keep body tracking natural and body line-height between 1.6 and 1.85. Limit lesson prose to roughly 65–75 characters per line.

The approved landing page retains Pixelify Sans headings and EB Garamond body text as an intentional pixel-themed entrance. Do not apply those fonts to dense study lists or lesson content. Code uses a monospace font; mathematical notation retains KaTeX.

Font files and their open-source licenses live in public/fonts. Serve fonts locally with font-display: swap.

## Layout and spacing

Use a 4px spacing unit, with 8px, 12px, 16px, 24px, and 32px as common steps. Group related text closely and use larger gaps between tasks.

Shared headers and footers align with the page gutters. Use fine horizontal rules, open layouts, and flat lists. Prefer square corners and small stepped details over rounded cards.

On screens at least 768px wide, faint 1px vertical column rules run the full page height, 16px outside the shared navigation and content shell. Use --layout-guide for these rules and the desktop studies column divider. Keep reading content free of interior decorative lines, and hide outer guides on smaller screens.

Typical content widths:

| Surface | Maximum width |
| --- | --- |
| Studies dashboard | 1240px |
| Course index | 1240px, aligned with the shared navigation |
| Chapter reader | 1240px overall, with a reading column up to 760px |
| Profile settings | 1240px overall, left-aligned form up to 896px |

Use flexible gutters on desktop and approximately 20px on small screens. Keep long titles and uninterrupted strings wrap-safe.

The landing page inherits the same 1240px maximum shell width and shared gutters as authenticated pages, keeping the header and vertical guides aligned across routes.

Shared page padding is 24px vertically on desktop and 20px on narrow screens. Individual compositions can add space within their content, and recovery screens should start from these shared defaults.

### Landing page

Use a compact header and footer, with Newton beneath the apple tree beside the email-code form. Fit the initial page into common desktop and portrait mobile viewports.

Frame the entrance with horizontal rules below the header and above the footer, joined to the outer column guides. In the two-column desktop layout, add a full-height rule centered in the gap between artwork and sign-in. Omit that interior vertical rule when the layout stacks or the artwork is hidden. Use --layout-guide throughout.

On small or short screens, shrink or hide decorative art before reducing control usability. Code-entry and error states need room. Allow scrolling when zoom, a keyboard, or unusually long content makes it necessary; never clip authentication controls.

### Studies dashboard

Lead with the workspace heading and an open resume strip with top and bottom dividers, no side borders, no background fill, and no illustration. Place the study list beside the new-study form on desktop. Keep all saved studies reachable.

At sufficiently large desktop sizes, the dashboard fits the viewport and long study lists scroll within their section. On mobile, stack the resume panel, studies, and creation form with normal page scrolling.

Show real chapter counts and percentages. Preparing, failed, unstarted, and completed courses retain distinct, truthful actions. Use the same 12-segment progress treatment for the resume strip and saved studies. On phones, use 14px progress metadata and action labels, a full-width resume action, and a 12px gap between study titles and actions. Keep keyboard focus outlines inside saved-study rows so scrolling containers do not clip them.

### Course index

Use the approved Study console direction: a compact course title with progress and Export notes in the same desktop toolbar. Align the content with the shared navigation. Do not add illustrations or introductory labels.

Align the course title directly with the shared navigation gutter. Omit page-level back arrows and back-navigation rows.

Present chapters as one dense full-width directory with aligned chapter numbers, titles, statuses, and actions. Omit visible column headers; begin the list directly below the course toolbar. Use roughly 48px rows on desktop, allowing long titles to increase the row height. On small screens, place status below the title while keeping the chapter number and action visible. Keep the chapter sequence intact. Omit unlocking explanations and prerequisite lists.

Use a narrow 48px chapter column, 20px desktop column gaps, and 8px outer cell padding. Keep Status and Action compact at the right, with Read and Retake distributed across the action column. Preserve the full navigation-aligned width rather than adding outer margins.

Keep the course console white and charcoal with neutral separators. Completed progress segments and pixel checks are charcoal; locked chapters use a small pixel lock and readable muted text. Only the first open chapter receives an orange Continue action and a small orange position marker. Other open chapters remain accessible with a text continuation action. Mastered chapters keep separate quiet Read and Retake actions. Locked chapters remain non-navigable. Server-side prerequisite and access rules remain unchanged.

Retaking requires the existing confirmation dialog and its explanation of what is reset. Visual updates must preserve saved progress, exports, and prerequisite rules.

### Chapter reader

Use a single left-aligned reading column within the navigation-aligned page shell, with text at most 760px wide and no chapter sidebar. Align metadata, title, and lesson body with the shared page gutter. Do not reserve an arrow gutter or render a back-navigation control. Use a compact 32px desktop title and 24px mobile title with quiet chapter and status metadata. Omit introductory taglines.

Place practice scenarios and questions directly on white, without an outer panel. Separate the scenario and bold question through spacing and typography, using natural left-aligned wrapping. Show feedback as smaller supporting text with a fine separator below, without an enclosing box. Answers use radio buttons and thin row separators, with a thin charcoal outline on the selected answer. Reserve orange for the available primary submission action; disabled practice buttons use neutral surfaces and readable muted text.

Keep practice, original explanations, additional explanation levels, and assessment controls in their existing order. Preserve generation, loading, recovery, and explanation-depth behavior.

On screens below 768px, practice and lesson text use the full shell width with the shared page gutters. Keep answer text at 16px, touch targets at least 44px high, and the chapter quiz action full-width below the explanation controls.

Use 24px between the chapter heading and practice, 4px between feedback label and feedback copy, 16px around the feedback separator and before answer choices, and 24px before the question. Leave 48px between the end of practice and the lesson. Keep the hint beside Continue when space allows, wrapping naturally on narrow screens.

Lessons scroll naturally. Tables, equations, and diagrams may scroll within their own regions when necessary; they must not widen the whole page. Overflowing equations remain keyboard accessible.

### Profile settings

Use a clear heading, a small books illustration, and an open form layout. Align the settings title and form in the shared navigation-width shell without a back-arrow gutter. Keep the optional About me field, character count, personalization explanation, save feedback, and retry states visible.

Owner-only invitations remain a separate section below the learner profile. Preserve the existing access rules. Do not expose technical provider configuration in learner flows.

## Components

### Header and footer

Use browser Back and Forward for history navigation. Omit page-level back controls on content, settings, assessment, preparation, and recovery screens. The persistent Newton logo links to studies even on direct entry. Preserve forward course/chapter links, quiz question navigation, and contextual result actions such as Review chapter and View course.

Use the single newton-logo.svg image with a compact, all-lowercase Pixelify Sans Semibold “newton” wordmark and an orange pixel-art apple replacing the “o”. The wordmark is outlined for consistent rendering without loading a font. Preserve its aspect ratio and use the image alt text “Newton”. Authenticated navigation uses Settings and Sign out with matching monochrome 16px pixel icons and 44px interaction heights. Use no button borders or permanent underlines; underline on hover and keyboard focus. Settings opens within the app, so omit an external-link arrow. Authentication shows Private beta.

All authenticated routes share the same header geometry, gutters, logo size, and navigation type. Do not override the header or footer independently on a route. The landing page may adjust its composition for its pixel typography and single-screen layout.

Use a slim neutral footer with no divider. Center the single line “Read. Practice. Reflect.” in small muted text across pages.

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

- public/images/newton-under-apple-tree.webp: landing illustration. Do not use it on the course index.
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

Shared fonts, colors, controls, header, footer, and navigation live in app/globals.css. Route-specific composition styles live in app/login/login.css, app/studies.css, app/course/[id]/course-index.css, app/course/[id]/ch/[idx]/reader.css, and app/settings/settings.css. Keep those files focused on the layout and content needs of each page.

Before editing Next.js code, read the relevant bundled guide in node_modules/next/dist/docs as required by AGENTS.md.

For UI changes, verify relevant existing component and browser tests. Inspect representative desktop and mobile renders. Check long titles, empty and failed states, keyboard focus, and image proportions when affected. Use the production build to verify font, CSS, and route integration.

The route crawl in e2e/style-uniformity.spec.ts checks shared styles at 1440px, 390px, and 320px. It records computed styles in test-results/style-audit.json and screenshots in test-results/style-audit. Run it when changing shared typography, colors, or page chrome.
