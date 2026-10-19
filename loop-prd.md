Make the UI consistent across all pages of Mastery Tutor, including container widths, page gutters, spacing, typography, colors, borders, buttons, forms, and loading, empty, and error states.

First inspect all routes and shared components to identify inconsistencies. Use the existing design language to establish reusable layout primitives and design tokens. Define a standard page container with a consistent maximum width, responsive horizontal padding, and alignment between headers and page content. Allow narrower reading or form layouts where useful, with explicit, reusable variants.

Apply these conventions across every page. Preserve functionality and accessibility. Avoid unrelated feature changes.

Acceptance criteria:
- Pages using the same layout variant have identical container widths, gutters, and alignment.
- Typography, spacing, and common controls follow shared conventions.
- Layouts work on mobile, tablet, and desktop without horizontal overflow.
- Any intentional layout exceptions are documented.
- Verify representative routes in the browser at multiple viewport sizes.
- Run lint, typecheck, and relevant tests.