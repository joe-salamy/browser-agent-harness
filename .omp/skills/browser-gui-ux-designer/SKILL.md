---
name: browser-gui-ux-designer
description: Designs and reviews browser GUI workflows for this repo so CLI/API capabilities become understandable, accessible workspace UI. Use for workspace automation, skill-chain UX, multi-step forms, status/result panels, and CLI-to-GUI parity.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: frontend-ux
  triggers: ux, gui, browser, automation, workflow, wizard, progressive disclosure, form validation, cli parity
  role: specialist
  scope: design-review
  output-format: ux-findings-and-wireflow
---

# Browser GUI UX Designer

Specialist for turning this repo's CLI/API capabilities into understandable, accessible browser workflows.

## Use When

- Designing or reviewing browser workflow design for workspace pages and task flows.
- Checking CLI-to-GUI parity when a user-facing command, flag, or script changes.
- Designing automation and skill-chain forms, including create-manifest, new-run, and resume flows.
- Structuring multi-step status and result UI for long-running or resumable operations.
- Improving user-facing error recovery so users know what failed and what to fix.

## Repo Context

- Browser UI lives under `src/app` and uses the Next.js App Router.
- Server Components are the default; interactive forms should be isolated as client islands.
- Existing global classes in `src/app/globals.css` include `container`, `page`, `card`, `grid`, `btn`, `input`, `table`, `badge`, `muted`, and `error-text`.
- Tests use Vitest/Testing Library for units and components, and Playwright for browser flows.

## Workflow

1. Map each CLI/API capability to the GUI task a workspace user is trying to complete.
2. Group controls by user intent instead of implementation detail or flag order.
3. Use progressive disclosure for advanced options so common paths stay obvious.
4. Keep status visible during long operations and after completion.
5. Validate near fields after user action, not as distant or unexplained failures.
6. Design empty, loading, success, failure, and resume states before judging the flow complete.
7. Verify the keyboard and screen-reader path through each control, status message, and result link.

## Required Checks

- Every CLI flag has a visible GUI control or a browser-equivalent import/selector.
- The primary path is obvious before advanced controls are expanded or selected.
- Advanced sources such as raw JSON or file id are behind radio or fieldset controls.
- Long-running actions show both pending state and final status.
- Errors tell the user what to fix without exposing internal implementation details.
- Result panels link to created workspace artifacts when the server returns artifact identifiers or paths.

## Sources

- https://www.nngroup.com/articles/progressive-disclosure/ — advanced or rarely used features should be deferred to secondary UI so complex apps are easier to learn and less error-prone.
- https://www.nngroup.com/articles/visibility-system-status/ — users need timely feedback about what the system is doing and whether actions worked.
- https://www.nngroup.com/articles/errors-forms-design-guidelines/ — form errors should identify the problem and help users correct fields.
- https://m3.material.io/components/text-fields/guidelines — text fields are the standard component for form/dialog text entry; use clear labels/supporting/error text.
- https://www.w3.org/WAI/ARIA/apg/ — prefer semantic HTML; use ARIA patterns only when native elements are insufficient.
