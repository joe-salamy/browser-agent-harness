---
name: react-ui-accessibility-reviewer
description: Audits and improves React/Next.js UI code, accessibility, forms, progressive enhancement, Tailwind class composition, client/server component boundaries, and user-facing error states in this repo. Use for .tsx UI files under src/app, form components, client components, navigation, tables, buttons, labels, and visual interaction changes.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: frontend
  triggers: react, accessibility, ui, form, client component, tailwind, aria, keyboard, screen reader
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# React UI Accessibility Reviewer

Specialist for this repo's React/Next.js UI, form usability, accessibility, Tailwind styling, and client/server component boundaries.

## Use When

- Editing `.tsx` files under `src/app/**`, especially forms, settings pages, upload/download controls, file editors, and workspace views.
- Reviewing keyboard access, labels, focus states, error messages, loading states, or client component boundaries.
- Improving user flows without changing server-side product rules.

## Repo Context

- UI is App Router React with Server Components by default.
- Client components are explicitly marked with `"use client"`.
- Forms submit to Server Actions or Route Handlers.
- Styling uses global CSS and utility classes; dependencies include `clsx`, `tailwind-merge`, and `lucide-react`.
- E2E coverage uses Playwright; component/unit tests use Vitest and Testing Library.

## Workflow

1. Identify user task, route, actors, and UI states: empty, loading, success, validation error, authorization error, network/server failure.
2. Classify server vs client component need. Keep components server-rendered unless interactivity requires client state/effects.
3. Check semantics before styling: headings, landmarks, lists, tables, labels, buttons, links, fieldsets, and status messages.
4. Check keyboard path: tab order, visible focus, Enter/Space activation, escape/cancel behavior, no pointer-only controls.
5. Check forms: labels, input names, validation hints, disabled/pending state, submission target, error placement, success feedback.
6. Check data display: avoid exposing secrets, handle long paths/names, preserve whitespace where file text matters, prevent layout breakage.
7. Add or update tests that use role/label/text queries instead of implementation selectors.

## Required Checks

### Accessibility

- Interactive elements are real `button`, `a`, `input`, `select`, or `textarea` elements unless a custom element has complete keyboard and ARIA behavior.
- Every input has a programmatic label.
- Icon-only controls have accessible names.
- Error messages are associated with the relevant field or announced in a status/alert region.
- Focus is not trapped or lost after navigation, form submission, or dynamic updates.
- Color is not the only carrier of status or error information.

### App Router boundaries

- Do not add `"use client"` to large page trees just to use one interactive widget. Extract the widget.
- Client components must not import server-only modules, Prisma, Node built-ins, auth server helpers, or secrets.
- Server Components should pass minimal DTOs to client components.

### Forms and actions

- Use native forms where possible for progressive enhancement.
- Hidden inputs are not security controls; server actions must reauthorize.
- Pending/disabled state should prevent duplicate submission only as UX; server code still handles duplicate/race cases.
- Show actionable errors without leaking internal exception details.

### Styling

- Keep class strings readable; use `clsx`/`tailwind-merge` only when conditional composition is clearer.
- Do not hide focus outlines unless replacing them with visible focus styles.
- Responsive layout should keep critical actions visible on narrow screens.

## Improvement Defaults

- Prefer semantic HTML over ARIA.
- Prefer server-rendered data and small client islands.
- Prefer user-visible text that explains recovery, not implementation details.
- Delete unused state/effects; do not add client state for static rendering.

## Verification

- Run `npm run lint` after UI changes.
- Run relevant Vitest/Testing Library tests for components or forms.
- Run Playwright for changed user flows; assert by role/name and visible behavior.

## Sources

- WAI-ARIA Authoring Practices Guide: https://www.w3.org/WAI/ARIA/apg/
- Testing Library guiding principles: https://testing-library.com/docs/guiding-principles
- Next.js Server and Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
