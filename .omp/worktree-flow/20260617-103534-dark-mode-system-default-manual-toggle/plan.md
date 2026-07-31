# Dark Mode (system default + manual toggle)

## Context

The Browser Agent Harness UI is light-only. Every color flows through 6 CSS
variables in `src/app/globals.css` (`--background`, `--foreground`, `--muted`,
`--border`, `--card`, `--accent`) plus 4 hardcoded literals and 1 inline style;
no Tailwind color utilities are used anywhere in `src`. The ask: add dark mode
that **defaults to the OS/browser preference** (`prefers-color-scheme`) and also
lets the user manually pick Light / Dark / System, persisted across reloads
without a flash of the wrong theme (FOUC).

End state: opening the app on a system in dark mode shows dark UI immediately;
a small theme control on every page lets the user override and persist their
choice; reverting to "System" returns control to the OS preference.

## Approach

The theme is driven by CSS variables. `:root` holds the light palette (as
today). A `@media (prefers-color-scheme: dark)` block overrides the variables
for the system-dark case **unless** the user forced light. A
`[data-theme="dark"]` attribute on `<html>` forces dark regardless of system.
A `[data-theme="light"]` force needs no block of its own — the `:not()` guard
on the media query prevents system-dark from applying, so `:root` light values
stand. The FOUC is prevented by a tiny inline `<script>` in the root layout
that sets `data-theme` from `localStorage` before paint.

### Step 1 — Convert `globals.css` to a theme-variable system with dark rules

File: `src/app/globals.css` (currently the only file defining colors).

1. In `:root` (lines 3–11), keep the 6 existing variables and **add 6 new ones**
   to replace the hardcoded literals elsewhere in the file. Final `:root`:

   ```css
   :root {
     color-scheme: light;
     --background: #f8fafc;
     --foreground: #0f172a;
     --muted: #64748b;
     --border: #cbd5e1;
     --card: #ffffff;
     --accent: #2563eb;
     --error: #b91c1c;
     --secondary-bg: #e2e8f0;
     --secondary-fg: #0f172a;
     --input-bg: #ffffff;
     --badge-bg: #e0f2fe;
     --badge-fg: #075985;
   }
   ```

2. Add the system-dark block immediately after `:root}`. The `:not()` guard
   means it only applies when the user has NOT forced light:

   ```css
   @media (prefers-color-scheme: dark) {
     :root:not([data-theme="light"]) {
       color-scheme: dark;
       --background: #0f172a;
       --foreground: #e2e8f0;
       --muted: #94a3b8;
       --border: #334155;
       --card: #1e293b;
       --accent: #3b82f6;
       --error: #f87171;
       --secondary-bg: #334155;
       --secondary-fg: #e2e8f0;
       --input-bg: #1e293b;
       --badge-bg: #082f49;
       --badge-fg: #7dd3fc;
     }
   }
   ```

3. Add the forced-dark block after the media query (same dark values, duplicated
   intentionally — CSS has no mixin; keeping the block literal is clearer than
   indirection):

   ```css
   [data-theme="dark"] {
     color-scheme: dark;
     --background: #0f172a;
     --foreground: #e2e8f0;
     --muted: #94a3b8;
     --border: #334155;
     --card: #1e293b;
     --accent: #3b82f6;
     --error: #f87171;
     --secondary-bg: #334155;
     --secondary-fg: #e2e8f0;
     --input-bg: #1e293b;
     --badge-bg: #082f49;
     --badge-fg: #7dd3fc;
   }
   ```

   Specificity is sound: `:root` is (0,1,0); `:root:not([data-theme="light"])`
   is (0,2,0); `[data-theme="dark"]` is (0,1,0). The media block wins when
   system is dark and user didn't force light; `[data-theme="dark"]` overrides
   `:root` by source order when system is light but user forced dark.

4. Replace the 4 hardcoded color literals with the new variables:
   - `.error-text` (line 51): `color: #b91c1c` → `color: var(--error)`.
   - `.btn.secondary` (lines 75–76): `background: #e2e8f0; color: #0f172a` →
     `background: var(--secondary-bg); color: var(--secondary-fg)`.
   - `.input, textarea, select` (line 85): `background: white` →
     `background: var(--input-bg)`.
   - `.badge` (lines 115–116): `background: #e0f2fe; color: #075985` →
     `background: var(--badge-bg); color: var(--badge-fg)`.

   Leave `.card`'s `box-shadow` (line 57, `rgba(15,23,42,0.06)`) unchanged — it
   is near-invisible on dark but harmless; cards are delineated by `--border`.

   No edge handling needed: every variable has a value in both `:root` and the
   dark blocks, so no selector can resolve to an unset variable.

### Step 2 — Remove the inline color in the sign-in form

File: `src/app/(auth)/sign-in/sign-in-form.tsx`, line 59.

Replace `<p role="alert" style={{ color: "#b91c1c" }}>` with
`<p role="alert" className="error-text">`. The `.error-text` class already
applies the same red via `var(--error)` after Step 1, so this both removes the
last hardcoded color and adapts it to dark mode. No other inline colors exist
in `src` (verified by search).

### Step 3 — Add FOUC-prevention script + `suppressHydrationWarning` to root layout

File: `src/app/layout.tsx`.

1. Add `suppressHydrationWarning` to the `<html>` tag — the inline script mutates
   `document.documentElement.dataset.theme` before React hydrates, which would
   otherwise throw a hydration mismatch warning. This is the standard
   next-themes pattern.

2. Add an inline `<script>` as the **first child of `<body>`**, before
   `<ThemeToggle />` and `{children}`. It must run synchronously before paint:

   ```tsx
   <script
     dangerouslySetInnerHTML={{
       __html:
         "(function(){try{var t=localStorage.getItem('bah-theme');var d=document.documentElement;if(t==='light'||t==='dark'){d.dataset.theme=t;}else{d.removeAttribute('data-theme');}}catch(e){}})();",
     }}
   />
   ```

   Storage key: `bah-theme`. Values: `'light'`, `'dark'`, or `'system'`
   (absence also means system). If the stored value is `light`/`dark`, set
   `data-theme`; otherwise remove it so the media query drives the theme. The
   `try/catch` guards against disabled localStorage (private mode).

### Step 4 — Create the `ThemeToggle` client component

New file: `src/app/theme-toggle.tsx`. No existing equivalent found; this is the
single new component the feature needs.

```tsx
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "bah-theme";
type Theme = "system" | "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  // After hydration, read the effective theme from <html data-theme>.
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" || current === "dark" ? current : "system");
  }, []);

  function onChange(value: Theme) {
    setTheme(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* localStorage unavailable — non-fatal */
    }
    if (value === "light" || value === "dark") {
      document.documentElement.dataset.theme = value;
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  return (
    <label
      style={{
        position: "fixed",
        top: 12,
        right: 16,
        zIndex: 50,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "var(--muted)",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "4px 8px",
      }}
    >
      <span style={{ fontWeight: 700 }}>Theme</span>
      <select
        className="input"
        style={{ width: "auto", padding: "4px 6px" }}
        value={theme}
        aria-label="Color theme"
        onChange={(event) => onChange(event.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
```

Notes:
- Initial `useState("system")` avoids a hydration mismatch: the server renders
  `system` with no `data-theme`, and the `useEffect` reconciles to the real
  value after mount. The select's `value` is a controlled attribute on a
  client component — React updates it post-hydration without warning.
- The `<select>` reuses the existing `.input` class (gets `--input-bg`,
  `--border`, radius) with inline overrides to shrink it. The wrapper uses the
  theme variables directly so it adapts to dark mode.
- Fixed top-right placement puts the control on every page without restructuring
  each page's `<main>`. Pages use `<main className="container page">` with
  ≥32px top padding and 16px side gutters, so the small control sits in the
  top-right gutter without overlapping content. This is the only placement
  choice the user might want to revisit (see Assumptions).
- Accessible: real `<label>` + `<select>` with `aria-label`, keyboard-operable,
  no pointer-only interaction.

### Step 5 — Render `ThemeToggle` in the root layout

File: `src/app/layout.tsx`. Import `ThemeToggle` from `./theme-toggle` and
render it in `<body>` after the FOUC `<script>` and before `{children}`:

```tsx
<body>
  <script dangerouslySetInnerHTML={{ __html: "..." }} />
  <ThemeToggle />
  {children}
</body>
```

This makes the toggle appear on every route (landing, sign-in, workspaces,
settings) since they all inherit the root layout.

### Step 6 — Add a Vitest component test for `ThemeToggle`

New file: `src/app/theme-toggle.test.tsx`. Mirror the test style of
`upload-form.test.tsx` / `run-form.test.tsx` (Testing Library + jsdom).

Cases (assert behavior, not defaults):
1. Renders with `value="system"` when no `data-theme` is set and no localStorage.
2. Changing to "Dark" sets `document.documentElement.dataset.theme` to `"dark"`
   and `localStorage.getItem('bah-theme')` to `"dark"`.
3. Changing to "Light" sets `data-theme="light"` and localStorage to `"light"`.
4. Changing back to "System" removes the `data-theme` attribute and stores
   `"system"`.

No `matchMedia` mock is needed — the component never reads `matchMedia`; it only
reads/writes `data-theme` and localStorage. jsdom supports `localStorage` and
`dataset` natively. Reset `document.documentElement.removeAttribute("data-theme")`
and `localStorage.clear()` in `beforeEach`.

### Step 7 — Add a Playwright e2e test for theme

New file: `tests/e2e/theme.spec.ts`. Targets the public landing page `/` (no
auth, no `OPENROUTER_API_KEY` needed — unlike `mvp.spec.ts`).

```ts
import { expect, test } from "@playwright/test";

test("theme toggle persists and overrides system preference", async ({ page }) => {
  await page.goto("/");
  const select = page.getByLabel("Color theme");

  // System default: no data-theme attribute.
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

  // Force dark.
  await select.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("bah-theme"))).toBe("dark");

  // Force light.
  await select.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // Back to system removes the override.
  await select.selectOption("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

  // Persists across reload (FOUC script reapplies it).
  await select.selectOption("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("system dark preference applies dark palette without data-theme", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  // color-scheme is driven by the media query; assert via computed style.
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("--background").trim(),
  );
  expect(bg).toBe("#0f172a");
  await ctx.close();
});
```

This exercises the NEW behavior: the manual override, persistence across reload
(FOUC script), and the system-dark media-query path. Run with
`npx playwright test theme` (no API key required).

### Step 8 — Verify

Run, in order, from the repo root:

1. `npm run lint` — eslint clean.
2. `npm run typecheck` — `tsc --noEmit` clean.
3. `npm run test` — Vitest; the new `theme-toggle.test.tsx` plus existing tests
   pass.
4. `npx playwright test theme` — the two theme e2e tests pass (no
   `OPENROUTER_API_KEY` needed). Requires the dev server (Playwright auto-starts
   it via `webServer` config).
5. Manual smoke: `npm run dev`, open `http://localhost:3000`, toggle
   System/Light/Dark, reload to confirm persistence, change OS theme to confirm
   System tracks it.

## Critical files & anchors

- `src/app/globals.css` — `:root` (lines 3–11) and the hardcoded literals at
  lines 51, 75–76, 85, 115–116. The entire color system lives here; this is
  where the dark palette and variable conversion happen.
- `src/app/layout.tsx` — root `<html>`/`<body>` (lines 13–15). Add
  `suppressHydrationWarning`, the FOUC `<script>`, and `<ThemeToggle />`.
- `src/app/(auth)/sign-in/sign-in-form.tsx:59` — the only inline color in `src`;
  swap `style` for `className="error-text"`.
- `src/app/theme-toggle.tsx` — new client component (Step 4). Pattern to mirror:
  `src/app/workspaces/[workspaceId]/refresh-listener.tsx` (minimal `"use client"`
  component).
- `tests/e2e/theme.spec.ts` — new e2e (Step 7). Config at `playwright.config.ts`
  auto-starts dev server; chromium project only.

## Assumptions & contingencies

- **Toggle placement = fixed top-right.** Chosen as the least-invasive option
  that puts the control on every page without adding a shared header bar (the
  repo has no layout-level header today). If the user prefers a dedicated top
  bar or per-page placement, the only change is the wrapper styling/position in
  `ThemeToggle` and possibly a `<header>` in the layout — the theme logic is
  unaffected.
- **Three-state control (System / Light / Dark) via a `<select>`.** A select is
  the most compact, accessible, icon-free option given the repo has no icon
  library (`lucide-react` is not installed). A segmented-button group is an
  aesthetic alternative; the state model and storage contract stay identical.
- **Storage key `bah-theme`, values `system|light|dark`.** Namespaced to avoid
  localhost collisions. If a different key is desired, update it in
  `theme-toggle.tsx` and the FOUC script string in `layout.tsx` (two sites).
- **No Tailwind `dark:` variant or config change.** The repo uses zero Tailwind
  color utilities, so introducing the `dark:` variant would create a second
  convention. Plain CSS variables + media query + attribute selector is the
  single convention. If the codebase later adopts Tailwind color utilities, a
  `@custom-variant dark` can be added then — out of scope here.
- **Contingency — jsdom `localStorage` flakiness:** if the Vitest test sees
  `localStorage is not defined`, add `window.localStorage` is already defined in
  jsdom 29; if not, define a minimal stub in `vitest.setup.ts`. Unlikely given
  the installed version.
- **Contingency — Playwright `colorScheme` dark assertion:** if
  `getComputedStyle(...).getPropertyValue("--background")` returns `""` because
  the variable is set on `:root` not `body`, read from
  `getComputedStyle(document.documentElement)` instead.
