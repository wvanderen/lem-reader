# Phase 1: Canonical Article Foundation — Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 40 (new files — greenfield)
**Analogs found:** 0 source-code analogs (greenfield) → **all pattern references point to locked docs**

## ⚠ Greenfield Note for Planner

**There is no existing application source code in this repo.** The codebase directory contains only `AGENTS.md` and `.planning/`. Therefore this PATTERNS.md does not reference analog files; instead, every planned file maps to its **authoritative reference excerpt** in one of:

- `.planning/research/STACK.md` — version-pinned libraries and "What NOT to Use"
- `.planning/phases/01-canonical-article-foundation/01-RESEARCH.md` §Code Examples — ready-to-lift TypeScript/TSX/Zod excerpts
- `.planning/phases/01-canonical-article-foundation/01-UI-SPEC.md` — semantic element inventory, spacing scale, color tokens, typography, microcopy
- `.planning/phases/01-canonical-article-foundation/01-CONTEXT.md` — locked decisions D-01…D-09

**The planner's `<read_first>` blocks should cite these files by section.** The `<action>` blocks should lift code verbatim from RESEARCH.md §Code Examples and adjust only naming/layout.

## File Classification

> Role legend: `config` = build/tooling config · `model` = Zod schema + inferred TS types · `domain` = pure logic over the model · `service` = repository / I/O seam · `renderer` = React component emitting semantic HTML · `route` = top-level view · `fixture` = data asset · `devtool` = throwaway script (D-09) · `test` = Vitest/Playwright

| # | New File | Role | Data Flow | Primary Reference |
|---|----------|------|-----------|-------------------|
| 1 | `package.json` | config | n/a | `01-RESEARCH.md` §Standard Stack → Installation block (lines 134–155) |
| 2 | `tsconfig.json` | config | n/a | `01-RESEARCH.md` §Pitfall 8 (`resolveJsonModule: true`); STACK.md (TS 7.0.2 strict) |
| 3 | `tsconfig.node.json` | config | n/a | Vite 8 SPA convention (Vite docs, cited in STACK.md) |
| 4 | `vite.config.ts` | config | n/a | `01-RESEARCH.md` §Standard Stack (vite 8.1.5 + plugin-react 6.x) |
| 5 | `vitest.config.ts` | config | n/a | `01-RESEARCH.md` §Validation Architecture → Test Framework + §Wave 0 Gaps |
| 6 | `playwright.config.ts` | config | n/a | `01-RESEARCH.md` §Validation Architecture (3-engine matrix) + §Wave 0 Gaps |
| 7 | `eslint.config.js` | config | n/a | `01-RESEARCH.md` §Wave 0 Gaps + §Security verification task #2,#3 |
| 8 | `.prettierrc.json` | config | n/a | STACK.md Development Tools |
| 9 | `index.html` | config | n/a | Vite 8 SPA entry (STACK.md); `<div id="root">` per UI-SPEC §Component Inventory |
| 10 | `src/main.tsx` | config | request-response | STACK.md (client-only `createRoot` mount) |
| 11 | `src/App.tsx` | route | event-driven | `01-RESEARCH.md` §Pattern 7 (Routing); §Recommended Project Structure |
| 12 | `src/app.css` | config | n/a | `01-UI-SPEC.md` §Color + §Typography + §Spacing Scale + §Interaction 4–7; D-07 |
| 13 | `src/a11y/SkipLink.tsx` | renderer | request-response | `01-UI-SPEC.md` §Component Inventory + §Copywriting ("Skip to article") |
| 14 | `src/routes/FixtureList.tsx` | route | request-response | `01-UI-SPEC.md` §Component Inventory + §Interaction 1; `01-RESEARCH.md` §Pattern 8 |
| 15 | `src/routes/ArticleView.tsx` | route | request-response | `01-UI-SPEC.md` §Component Inventory + §Interaction 2; `01-RESEARCH.md` §Pattern 5 (Provenance Header) |
| 16 | `src/content/schema.ts` | model | transform | `01-RESEARCH.md` §Code Examples → "Normalized Block Schema" (lines 506–616); D-04, D-05, D-06 |
| 17 | `src/content/types.ts` | model | n/a | `01-RESEARCH.md` §Code Examples → `type CanonicalArticle = z.infer<…>` (line 613–615) |
| 18 | `src/content/normalizeText.ts` | domain | transform | `01-RESEARCH.md` §Code Examples → "Normalized Text + Grapheme Offsets" (lines 620–727); D-05 |
| 19 | `src/content/repository.ts` | service | CRUD | `01-RESEARCH.md` §Pattern 8 (Repository Interface); D-08 |
| 20 | `src/content/render/BlockRenderer.tsx` | renderer | transform | `01-RESEARCH.md` §Code Examples → "Recursive React Block Renderer" (lines 729–840); DOC-02, DOC-06 |
| 21 | `src/content/render/InlineRenderer.tsx` | renderer | transform | `01-RESEARCH.md` §Code Examples → `Inline`/`InlineList` (lines 735–757); D-04 |
| 22 | `src/fixtures/index.ts` | service | file-I/O | `01-RESEARCH.md` §Code Examples → "Fixture Loader" (lines 880–902); D-08, Pitfall 8 |
| 23 | `src/fixtures/articles/*.canonical.json` (5–7 files) | fixture | file-I/O | `01-CONTEXT.md` D-01/D-02/D-03; `01-RESEARCH.md` §Standard Stack → "NOT Installed" (deferred candidates) |
| 24 | `src/persistence/db.ts` | service | CRUD (reserved) | `01-RESEARCH.md` §Code Examples → "Dexie Schema Reserved" (lines 842–878); D-08, Pitfall 9 |
| 25 | `scripts/normalize-source.ts` | devtool | file-I/O | `01-CONTEXT.md` D-09 (throwaway dev tool) |
| 26 | `tests/unit/normalizeText.test.ts` | test | transform | `01-RESEARCH.md` §Validation Architecture (rows DOC-05); §Pitfalls 1, 2, 3 |
| 27 | `tests/unit/graphemeOffsets.test.ts` | test | transform | `01-RESEARCH.md` §Validation Architecture (rows DOC-05 graphemes); §Pitfall 1 |
| 28 | `tests/unit/schema.test.ts` | test | transform | `01-RESEARCH.md` §Validation Architecture (rows DOC-04, Security); §Pitfall 5 |
| 29 | `tests/unit/identity.test.ts` | test | transform | `01-RESEARCH.md` §Validation Architecture (DOC-04); D-06 |
| 30 | `tests/unit/selectors.test.ts` *(optional — merge into normalizeText)* | test | transform | `01-RESEARCH.md` §Validation Architecture (DOC-05 quote round-trip); lines 696–727 |
| 31 | `tests/component/BlockRenderer.test.tsx` | test | request-response | `01-RESEARCH.md` §Validation Architecture (DOC-02 per-kind); §Wave 0 Gaps |
| 32 | `tests/component/FixtureList.test.tsx` | test | request-response | `01-RESEARCH.md` §Validation Architecture (DOC-01 list) |
| 33 | `tests/component/ArticleView.test.tsx` | test | request-response | `01-RESEARCH.md` §Validation Architecture (DOC-03 source link) |
| 34 | `tests/e2e/open-every-fixture.spec.ts` | test | request-response | `01-RESEARCH.md` §Validation Architecture (DOC-01 e2e); §Wave 0 Gaps |
| 35 | `tests/e2e/a11y.spec.ts` | test | request-response | `01-RESEARCH.md` §Validation Architecture (axe baseline) |
| 36 | `README.md` | config | n/a | STACK.md Development Tools (optional) |

---

## Per-File Pattern Notes

The excerpts below are the **canonical lift-targets** for the planner's `<action>` blocks. They are reproduced from `01-RESEARCH.md` §Code Examples with the exact line ranges the planner should re-read.

### Config & Tooling (Wave 0)

#### `package.json`
**Source:** `01-RESEARCH.md` §Standard Stack → Installation block (lines 134–155).

**Locked runtime versions** (must match exactly; STACK.md-pinned):
```
react@19.2.8  react-dom@19.2.8  dexie@4.4.4  zod@4.4.3
```
**Locked dev versions:**
```
vite@8.1.5  @vitejs/plugin-react@^6  typescript@7.0.2
vitest@4.1.10  @testing-library/react@16.3.2  @testing-library/dom  @testing-library/user-event
jsdom  @playwright/test@1.61.1  @axe-core/playwright@4.12.1
eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y prettier
```

> **REQUIRED — `eslint-plugin-react` is non-optional.** The rules `react/no-danger` (Pitfall 6 stored-XSS guard) and `react/jsx-no-target-blank` (reverse-tabnabbing guard) are rules FROM this plugin. The flat-config `eslint.config.js` MUST register it: `import reactPlugin from "eslint-plugin-react";` then `plugins: { react: reactPlugin, ... }`. Without the plugin, the rules silently no-op and the security guarantee is false.

**Conventional npm scripts** (planner to specify):
- `dev` → `vite`
- `build` → `tsc && vite build` (or `vite build` if `tsc` runs in `tsc -b` mode)
- `preview` → `vite preview`
- `test:unit` → `vitest` (default watch; CI uses `--run`)
- `test:e2e` → `playwright test`
- `test` → `npm run test:unit -- --run && npm run test:e2e`
- `lint` → `eslint .`
- `format` → `prettier --write .`

**Forbidden deps:** `@chenglou/pretext` (Phase 3), any router lib (CONTEXT.md discretion), Tailwind/shadcn/component suites (STACK.md What NOT to Use), Redux/Zustand/XState (STACK.md What NOT to Use).

---

#### `tsconfig.json`
**Source:** `01-RESEARCH.md` §Pitfall 8 (line 487: `resolveJsonModule: true`); STACK.md (TS 7.0.2 strict).

**Required compiler options:**
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,   // RECOMMENDED — offsets/array access in normalizeText
    "resolveJsonModule": true,          // REQUIRED — Pitfall 8 (static .canonical.json imports)
    "verbatimModuleSyntax": true,       // RECOMMENDED — `import type` discipline
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "useDefineForClassFields": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```
**Why `noUncheckedIndexedAccess`:** `normalizeText.ts` slices and indexes arrays of grapheme clusters and blocks; turning this on surfaces any unchecked index the renderer might add.

---

#### `tsconfig.node.json`
**Source:** Vite 8 SPA convention.
```jsonc
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

---

#### `vite.config.ts`
**Source:** `01-RESEARCH.md` §Standard Stack (Vite 8.1.5 + plugin-react 6.x).
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Phase 1 is a static SPA — no server runtime, no proxy.
});
```

---

#### `vitest.config.ts`
**Source:** `01-RESEARCH.md` §Validation Architecture → Test Framework + §Wave 0 Gaps (line 1008).
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",                  // for component (RTL) tests only
    globals: true,
    setupFiles: ["./tests/setup.ts"],      // planner: add @testing-library/jest-dom matchers
    include: ["tests/unit/**/*.test.ts", "tests/component/**/*.test.tsx"],
    exclude: ["tests/e2e", "node_modules"],
    // jsdom is NOT authoritative for layout (STACK.md "What NOT to Use").
    // Layout/reading-order/focus assertions run in Playwright, not here.
  },
});
```

---

#### `playwright.config.ts`
**Source:** `01-RESEARCH.md` §Validation Architecture (3-engine matrix: Chromium, Firefox, WebKit); §Wave 0 Gaps (line 1009).
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: { trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox",  use: { ...devices["Desktop Firefox"] } },
    { name: "webkit",   use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run dev",     // or `npm run preview` against `npm run build`
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```
**`@axe-core/playwright` 4.12.1** is consumed inside `tests/e2e/a11y.spec.ts` via `import AxeBuilder from "@axe-core/playwright"` (RESEARCH.md §Validation Architecture row "A11Y baseline").

---

#### `eslint.config.js`
**Source:** `01-RESEARCH.md` §Wave 0 Gaps (line 1019); §Security verification tasks #2, #3 (lines 1067–1068).

**Required rules (forbid Pitfalls 5, 6):**
- `react/no-danger` → `"error"` (Pitfall 6: stored XSS via `dangerouslySetInnerHTML`)
- `react/jsx-no-target-blank` → `"error"` (Pitfall: tabnabbing)
- `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` → `"error"`
- `jsx-a11y/*` recommended set (anchor-has-href, heading-level, list, etc.)

**Required plugin registration (BLOCKER — rules silently no-op without the plugin):**
```js
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";

export default [
  // ...
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    rules: {
      "react/no-danger": "error",
      "react/jsx-no-target-blank": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // ...jsx-a11y recommended...
    },
  },
];
```

Flat config (ESLint ≥9) format. Use `@typescript-eslint` parser + type-aware rules where possible.

---

#### `.prettierrc.json`
**Source:** STACK.md Development Tools (mechanical formatting; no CSS framework formatter dependency).
```jsonc
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```
(Planner's discretion on exact values; the constraint is "mechanical, committed, runs in pre-commit/CI.")

---

#### `index.html`
**Source:** Vite 8 SPA entry; `01-UI-SPEC.md` §Component Inventory line 272 (`<div id="root">` + `<body>` styles).
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lem Reader</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### App Shell (Wave 1)

#### `src/main.tsx`
**Source:** STACK.md ("client-only prototype, mount with `createRoot`").
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

---

#### `src/App.tsx`
**Source:** `01-RESEARCH.md` §Pattern 7 (Routing) — recommended option (a): React state + `location.hash` (lines 387–393).

**Pattern:**
```tsx
import { useState, useEffect } from "react";
import { FixtureList } from "./routes/FixtureList";
import { ArticleView } from "./routes/ArticleView";
import { SkipLink } from "./a11y/SkipLink";

type View = { name: "list" } | { name: "article"; id: string };

function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)$/.exec(window.location.hash);
  return m ? { name: "article", id: m[1] } : { name: "list" };
}

export function App() {
  const [view, setView] = useState<View>(() => parseHash());
  useEffect(() => {
    const onHash = () => setView(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return (
    <>
      <SkipLink />
      {view.name === "list" ? (
        <FixtureList />
      ) : (
        <ArticleView articleId={view.id} />
      )}
    </>
  );
}
```
**Convention:** No external router library. If the planner chooses React Router, that is an additive decision per CONTEXT.md discretion note (A2, LOW risk).

---

#### `src/app.css`
**Source:** `01-UI-SPEC.md` (Color §137–176, Typography §94–134, Spacing §68–91, Interaction §241–263). D-07 confirms the three `⚠ default` flags.

**Authoring pattern — authored CSS layers + custom properties, NOT Tailwind:**
```css
:root {
  /* D-07 warm-paper defaults (UI-SPEC §Color) */
  --surface: #FBF8F3;
  --surface-raised: #F2EDE3;
  --ink: #1F1B16;
  --ink-soft: #5C544A;
  --accent: #6B4423;
  --accent-hover: #4E2F18;
  --focus-ring: #6B4423;
  --destructive: #9B2C2C;       /* border/icon only — no destructive actions in Phase 1 */
  --hairline: #D9D1C2;

  /* UI-SPEC §Spacing Scale (multiples of 4) */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
  --touch: 44px;                /* min interactive hit area */

  /* UI-SPEC §Typography font stacks */
  --font-body: 'Iawan Old Style', 'Source Serif Pro', 'Source Serif 4', Georgia, Charter, 'Times New Roman', serif;
  --font-ui: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-code: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}

/* Defensive motion gate (UI-SPEC §Interaction 5) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
}

/* Forced colors safety (UI-SPEC §Interaction 7) */
@media (forced-colors: active) {
  a { text-decoration: underline; }      /* never let links lose underline */
}

/* Visible focus baseline (UI-SPEC §Interaction 4) */
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
/* outline: 0/none FORBIDDEN unless an equivalent replacement is supplied */
```
**CSS target selectors** per UI-SPEC §Component Inventory: `body`, `main`, `article`, `h1`–`h6`, `p`, `blockquote`, `figure`, `figcaption`, `pre`, `code`, `a`, plus class hooks `.skip-link`, `.meta`, `.disclosure`, `.status`. **Blocks must not carry CSS classes** (RESEARCH.md §Anti-Patterns last bullet) — CSS targets element selectors.

**Article body measure:** `max-width: 64ch; margin-inline: auto;` (UI-SPEC §Layout line 304).

---

#### `src/a11y/SkipLink.tsx`
**Source:** `01-UI-SPEC.md` §Component Inventory (line 273), §Copywriting ("Skip to article"), §Interaction 1 ("first focusable element after the skip link").

```tsx
export function SkipLink() {
  return <a className="skip-link" href="#main">Skip to article</a>;
}
```
**Convention:** First focusable element in DOM order. CSS makes it visually hidden until focused (planner writes the rule in `app.css`).

---

#### `src/routes/FixtureList.tsx`
**Source:** `01-UI-SPEC.md` §Component Inventory (lines 274–275), §Interaction 1 (lines 214–221), §Copywriting ("Saved articles", "Open article"). `01-RESEARCH.md` §Pattern 8 (uses `repository.list()`).

**Pattern:**
```tsx
import { useEffect, useState } from "react";
import { listArticles, openArticle } from "../content/repository";
import type { CanonicalArticle } from "../content/types";

export function FixtureList() {
  const [items, setItems] = useState<CanonicalArticle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    listArticles().then(setItems).then(() => setStatus("ready")).catch(() => setStatus("error"));
  }, []);
  return (
    <main id="main">
      <h1>Saved articles</h1>
      <div role="status" aria-live="polite" aria-atomic="true">
        {status === "loading" && "Opening article…"}
        {status === "error" && "Couldn't open this article."}
      </div>
      {items.length === 0 && status === "ready" ? (
        <>
          <h2>No articles yet</h2>
          <p>The article set is empty. Add a curated article to the prototype corpus, then reopen this page.</p>
        </>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id}>
              <article>
                <h2>{a.provenance.title}</h2>
                {/* metadata <dl> or <p class="meta">; source domain */}
                <a href={`#/article/${a.id}`} aria-labelledby={`title-${a.id}`}>Open article</a>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```
**Rules from UI-SPEC:** Hit area ≥ 44×44 (`--touch`); row is `<li>` containing `<a aria-labelledby=…>`; "Open article" copy verbatim.

---

#### `src/routes/ArticleView.tsx`
**Source:** `01-UI-SPEC.md` §Component Inventory (lines 276–279), §Interaction 2 (source link rel). `01-RESEARCH.md` §Pattern 5 (Provenance Header), lines 375–379.

**Pattern (lift directly):**
```tsx
import { ArticleBody } from "../content/render/BlockRenderer";
import { openArticle } from "../content/repository";
import type { CanonicalArticle } from "../content/types";
import { useEffect, useState } from "react";

export function ArticleView({ articleId }: { articleId: string }) {
  const [article, setArticle] = useState<CanonicalArticle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    openArticle(articleId)
      .then((a) => { setArticle(a); setStatus(a ? "ready" : "error"); })
      .catch(() => setStatus("error"));
  }, [articleId]);
  if (status !== "ready" || !article) {
    return (
      <main id="main">
        <div role="status" aria-live="polite" aria-atomic="true">
          {status === "loading" ? "Opening article…" : "Couldn't open this article."}
        </div>
      </main>
    );
  }
  const domain = new URL(article.provenance.sourceUrl).hostname;
  return (
    <main id="main">
      <article>
        <header>
          <h1>{article.provenance.title}</h1>
          {article.provenance.author && <p className="meta">{article.provenance.author}</p>}
          {/* publishedAt via Intl.DateTimeFormat(userLocale, …) */}
          <a href={article.provenance.sourceUrl} rel="noopener noreferrer" target="_blank">
            Originally published at {domain}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </header>
        <ArticleBody article={article} />
      </article>
    </main>
  );
}
```
**Locked constraints:**
- Source-URL link: `target="_blank"` + `rel="noopener noreferrer"` (Pitfall: tabnabbing; UI-SPEC §Interaction 2).
- Inline article links: same tab, always underlined (never hover-only) — UI-SPEC §Interaction 2.
- Never expose internal jargon (`fixture`, `Zod`, `revision`) in user-facing copy (UI-SPEC §Copywriting microcopy rules).

---

### Domain Model (Wave 0 — frozen contract)

#### `src/content/schema.ts`
**Source:** `01-RESEARCH.md` §Code Examples → "Normalized Block Schema" (lines 506–616).

**Lift the schema block verbatim**, with these locked design choices (all from RESEARCH.md):
- **D-04 inline marks:** `link | code | strong | em` ONLY (no strikethrough/sub/sup in Phase 1).
- **`Mark` is `z.union`** (not discriminated — marks are tiny and need ordered-check).
- **`BlockSchema` is `z.discriminatedUnion("kind", [...])`** — O(1) parse, clean TS narrowing.
- **Recursive schemas use the getter form:** `get children() { return z.array(BlockSchema) }` — Pitfall 7.
- **Footnote ids locked to `/^fn-\d+$/`** — Pitfall 4 (DOM clobbering).
- **Article `id` locked to `/^[a-z0-9-]+$/`** (slug; never the source URL — D-06).
- **`revision: z.number().int().min(1)`** — monotonic integer (D-06).
- **URL scheme allow-list** on `LinkMark.href` AND `Provenance.sourceUrl` AND `FigureBlock.src`:
  ```ts
  z.string().url().refine(
    (u) => /^https?:|^mailto:/i.test(new URL(u).protocol),
    { message: "Only http, https, mailto schemes allowed" },
  )
  ```
  (Pitfall 5 — stored XSS via `javascript:`/`data:`.)

**Critical schema fields** the planner must include:
```ts
ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  revision: z.number().int().min(1),
  lang: z.string().min(2),          // BCP-47; drives Intl.Segmenter locale
  provenance: Provenance,           // { sourceUrl, title, author?, publishedAt?, retrievedAt, originalHtmlHash, license? }
  blocks: z.array(BlockSchema).min(1),
  footnotes: z.array(FootnoteBody).default([]),
});
```

**Block kinds (locked set — closed discriminated union):**
`heading | paragraph | blockquote | bulleted-list | numbered-list | figure | code-block | footnote-reference | unsupported`

The renderer's `switch(block.kind)` MUST be exhaustive over this set; TS narrowing will flag any missing case.

---

#### `src/content/types.ts`
**Source:** `01-RESEARCH.md` §Code Examples (lines 613–615).

```ts
import type { z } from "zod";
import type { ArticleSchema, BlockSchema, InlineRun } from "./schema";

export type CanonicalArticle = z.infer<typeof ArticleSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type InlineRun = z.infer<typeof InlineRun>;
// re-export any other types the renderer/repository needs
```
**Convention:** Types are inferred from schemas — schemas are the single source of truth. Never hand-write a parallel type. (Zod-at-boundary, STACK.md Supporting Libraries → Zod row.)

---

#### `src/content/normalizeText.ts`
**Source:** `01-RESEARCH.md` §Code Examples → "Normalized Text + Grapheme Offsets" (lines 620–727). **This is the most important contract in Phase 1** (D-05).

**Lift verbatim.** Critical correctness rules to encode in the implementation and a docstring:

1. **ASCII-only whitespace collapse** (`/[\t\n\f\r ]+/g → " "`), then `trim()`. Do NOT apply Unicode normalization (NFC/NFKC) — Pitfall 2.
2. **Block separator: single `"\n"`** between blocks. Always exactly one — never doubled, never empty.
3. **Code-block source is verbatim** — do NOT collapse its whitespace (it IS readable text).
4. **Footnote reference contributes its visible `marker`** (e.g. `"[1]"`) at its body reading-order position; **footnote BODY text participates AFTER the body blocks** at the footnotes region — Pitfall 3.
5. **Grapheme offsets = segment ordinal, NOT `segment.index`** — Pitfall 1.
   ```ts
   export function graphemeClusters(text: string, locale: string): string[] {
     const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
     return Array.from(segmenter.segment(text), (s) => s.segment);
   }
   ```
   The canonical offset of the Nth cluster is the **array index N** — never `segment.index` (UTF-16 code-unit offset).

**Required exports (Phase 1 substrate):**
- `normalizeText(article): string`
- `graphemeClusters(text, locale): string[]`
- `graphemeLength(article): number`
- Type defs: `TextPositionSelector { start, end }`, `TextQuoteSelector { prefix, exact, suffix }`
- `deriveQuoteSelector(article, position, contextRadius?): TextQuoteSelector`

**Phase 1 ships the substrate only.** `resolveQuoteSelector()` (re-anchoring) is **Phase 5 scope** — do NOT implement it now (RESEARCH.md Open Question #4).

**Required unit-test cases** (planner inserts as test tasks):
- `"👨‍👩‍👧"` (ZWJ family) → 1 grapheme cluster
- `"é"` (precomposed) → 1; `"e\u0301"` (decomposed) → 1 (NOT 2)
- `"café"` → 4 graphemes, NOT 4 UTF-16 code units equal (trivially equal here; pick a test where they differ)
- Footnote body offset > reference offset (Pitfall 3)
- `normalizeText` is idempotent: `normalizeText(article) === normalizeText(article)` AND repeated application of whitespace collapse is a no-op
- NBSP (`\u00A0`), ZWJ (`\u200D`), RTL marks preserved (NOT collapsed — ASCII whitespace only)

---

#### `src/content/repository.ts`
**Source:** `01-RESEARCH.md` §Pattern 8 (Repository Interface, lines 395–399). D-08 (in-memory, no Dexie reads in Phase 1).

```ts
import type { CanonicalArticle } from "./types";
import { fixtures } from "../fixtures";

export interface ArticleRepository {
  list(): Promise<CanonicalArticle[]>;
  open(id: string): Promise<CanonicalArticle | null>;
}

export const inMemoryRepository: ArticleRepository = {
  async list() { return [...fixtures]; },
  async open(id) { return fixtures.find((a) => a.id === id) ?? null; },
};

// Module-level convenience wrappers (used by routes) — single import surface
export const listArticles = inMemoryRepository.list;
export const openArticle = inMemoryRepository.open;
```
**Why interface now:** D-08 leaves repository shape to the planner; defining it now makes Phase 2's Dexie swap a one-line provider change (Pitfall 9 forward-compat).

---

### Renderer (Wave 1)

#### `src/content/render/BlockRenderer.tsx`
**Source:** `01-RESEARCH.md` §Code Examples → "Recursive React Block Renderer" (lines 729–840). DOC-02 + DOC-06.

**Lift the `BlockView` + `ArticleBody` components verbatim.** Critical rules:

- **NEVER use `dangerouslySetInnerHTML`** (Pitfall 6) — code blocks render their source as a text child of `<pre><code>`; React auto-escapes.
- **Walk `article.blocks` in array order** — DOM output order == array order == document reading order, by construction.
- **Footnote refs render `<sup><a id="fn-ref-N" href="#fn-N">…</a></sup>`; footnote bodies render `<section aria-label="Footnotes"><ol>` with `<li id="fn-N">`.** Back-links via `<a href="#fn-ref-N">`. (RESEARCH.md lines 366, 822–839.)
- **Unsupported blocks render `<details className="disclosure"><summary>…</summary><ul>…</ul></details>` INLINE at their array position** — DOC-06, UI-SPEC §Interaction 3.

**Heading-level rendering:** Use the dynamic-tag pattern from RESEARCH.md line 762:
```tsx
const Tag = (`h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
return <Tag><InlineList runs={block.content} /></Tag>;
```

**Footnote id convention:** `fn-ref-N` for the reference anchor (in body); `fn-N` for the body anchor (in footnotes region). The Zod regex `/^fn-\d+$/` is on the body id; the renderer derives `fn-ref-N` deterministically. **Never** carry source HTML `id` attributes through (Pitfall 4).

---

#### `src/content/render/InlineRenderer.tsx`
**Source:** `01-RESEARCH.md` §Code Examples lines 735–757 (`Inline` + `InlineList`).

**Lift verbatim.** Mark-application order rule: wrap the text node in marks in `run.marks` order (`strong`, `em`, `code`, `link`). The `link` mark uses the schema-validated `href` directly (already scheme-allow-listed — Pitfall 5 defense in depth at the schema boundary).

---

### Fixtures (Wave 1 — gated on user approval, D-03)

#### `src/fixtures/index.ts`
**Source:** `01-RESEARCH.md` §Code Examples → "Fixture Loader" (lines 880–902). D-08, Pitfall 8.

**Lift verbatim:**
```ts
import { ArticleSchema, type CanonicalArticle } from "../content/schema";
import essayLongForm from "./articles/essay-long-form.canonical.json";
import technicalPost from "./articles/technical-post.canonical.json";
// … 5–7 fixtures total (D-01)

// Fail-fast: a malformed fixture throws at module load — fixtures are bundled
// code, not user input. Build fails loudly.
export const fixtures: readonly CanonicalArticle[] = [
  essayLongForm, technicalPost, /* … */
].map((raw) => ArticleSchema.parse(raw));
```
**Convention:** Static `import` of `.canonical.json` (requires `resolveJsonModule: true` in `tsconfig.json`). **Never** `fetch('/public/...')` at runtime (Pitfall 8 — loses types, HMR, tree-shaking, build-time validation).

---

#### `src/fixtures/articles/*.canonical.json` (5–7 files)
**Source:** `01-CONTEXT.md` D-01 (genre coverage), D-02 (real published long-form with real provenance), D-03 (criteria locked; candidates need user approval).

**Required fixture file naming:** `<slug>.canonical.json` where `<slug>` matches the `id` field (e.g. `essay-long-form.canonical.json` ↔ `id: "essay-long-form"`).

**Required corpus coverage (D-01):**
| Fixture | Stress element |
|---------|----------------|
| Long-form essay | prose + blockquotes |
| Technical post | code blocks + inline code |
| Figure/photo-heavy piece | `<figure>` + `<figcaption>` |
| Footnote/academic piece | `footnote-reference` + footnotes region |
| List-heavy reference | `<ul>`/`<ol>` (possibly nested) |
| ≥1 unsupported case | `unsupported` block (e.g. embedded video, table, interactive) |

**Open item (planner must surface):** RESEARCH.md Open Question #1 — the **candidate article list needs user approval before normalization**. Planner should insert a `checkpoint:human-verify` task at the START of Wave 1 (or pre-Wave 0).

**Fixture JSON shape:** Must satisfy `ArticleSchema` (see schema.ts). Real `provenance.sourceUrl`, real author/publish date, real SHA-256 `originalHtmlHash` of the source HTML (computed by the throwaway script — D-09/A6).

---

### Persistence (Wave 0 — reserved)

#### `src/persistence/db.ts`
**Source:** `01-RESEARCH.md` §Code Examples → "Dexie Schema Reserved" (lines 842–878). D-08, Pitfall 9.

**Lift verbatim.** Critical rule (Pitfall 9): **`version(1)` is shipped ONCE in Phase 1 and NEVER edited.** Phase 2 adds `version(2).stores({...})`. Reserve all slots now to minimize future bumps.

Reserved slots:
```ts
articles:   "id, revision",                  // Phase 2
settings:   "key",                            // Phase 2
location:   "[articleId+revision]",          // Phase 2 (STATE-01)
highlights: "id, [articleId+revision]",      // Phase 5 (ANNO)
notes:      "id, highlightId",                // Phase 5 (ANNO)
```

**Phase 1 does NOT read or write through Dexie** (D-08). Fixtures are bundled JSON imported at build time, read via `inMemoryRepository`. The Dexie import + class declaration is reserved only.

---

### Throwaway Dev Tool (Wave 1, after fixture approval)

#### `scripts/normalize-source.ts`
**Source:** `01-CONTEXT.md` D-09 ("throwaway dev-time normalization script").

**Purpose:** Read a saved source HTML file → emit a `.canonical.json` fixture for human review/correction. **This is NOT live-extraction product code** (Out of Scope per PROJECT.md). It is a one-shot authoring aid.

**Required behaviors (planner's call on internals):**
- Reads source HTML from disk (`fs.readFileSync` or `node:fs/promises`).
- Walks the DOM (use `linkedom` or `node-html-parser` — planner's choice; not a runtime dep).
- Emits the block tree per `ArticleSchema`, producing one `unsupported` block per element it can't normalize (UI-SPEC §Interaction 3 — disclosure copy is human-edited afterward).
- Computes `originalHtmlHash` as SHA-256 over the source HTML bytes (`node:crypto` `createHash("sha256")` — A6).
- Writes the JSON to `src/fixtures/articles/<slug>.canonical.json`.

**Critical:** This script is **throwaway**. The emitted JSON (after human review) is the source of truth, not the script. The script is never imported by the app bundle; mark it clearly as `// THROWAWAY — D-09 dev tool, not product code`.

---

### Tests (Wave 0 + Wave 1)

All test files are listed in `01-RESEARCH.md` §Validation Architecture → Phase Requirements → Test Map (rows DOC-01…DOC-06 + A11Y baseline + Security).

#### `tests/setup.ts` (shared)
**Source:** `01-RESEARCH.md` §Wave 0 Gaps (line 1020).
```ts
import "@testing-library/jest-dom/vitest";
// Optional: import { vi } from "vitest"; vi.setConfig({ … });
```

#### Unit tests (`tests/unit/*.test.ts`)
- **`normalizeText.test.ts`** — idempotency, ASCII whitespace collapse, NBSP/ZWJ preservation, block separator = single `\n`, code-block verbatim, footnote body offset > ref offset. Property-based via `@fast-check/vitest` (RESEARCH.md Wave 0 Gaps line 1021).
- **`graphemeOffsets.test.ts`** — emoji `"👨‍👩‍👧"` = 1 cluster; `"é"` and `"e\u0301"` both = 1; `"café"` = 4; CJK sample; canonical offset = array index, NOT `segment.index` (Pitfall 1 regression test).
- **`schema.test.ts`** — every block kind round-trips through `ArticleSchema.parse`; URL scheme rejection (`javascript:`, `data:`, `file:`, `vbscript:`) on `link.href`, `provenance.sourceUrl`, `figure.src` (Pitfall 5 + Security verification task #1); heading-level reject on 0/7/8; footnote id regex reject on `"main"` (Pitfall 4); article id regex reject on URL-shaped strings (D-06).
- **`identity.test.ts`** — `id` matches `/^[a-z0-9-]+$/`; `revision` is `int().min(1)`; revision bumps when normalized content changes (D-06 — model the rule even if manual discipline is the enforcement).
- **`selectors.test.ts`** (or merged into `normalizeText.test.ts`) — `deriveQuoteSelector(article, {start, end}).exact` round-trips through `graphemeClusters(normalizeText(article))` for emoji/accented/CJK content; context radius default = 32.

#### Component tests (`tests/component/*.test.tsx`)
**Environment:** jsdom via Vitest. **Query by role/label/visible text only** (RTL convention; RESEARCH.md §Standard Stack).
- **`BlockRenderer.test.tsx`** — one test per block kind asserting the rendered tag name (`<h1>`–`<h6>`, `<p>`, `<blockquote>`, `<ul>`, `<ol start=…>`, `<figure>`+`<figcaption>`, `<pre><code>`, `<sup><a>`, `<details>`). Asserts unsupported renders `<details>` at canonical position.
- **`FixtureList.test.tsx`** — list renders all fixtures; row hit area `aria-labelledby`; copy "Saved articles" / "Open article".
- **`ArticleView.test.tsx`** — provenance header shows title (`<h1>`) + author/date; source-URL link has `target="_blank"` + `rel="noopener noreferrer"`; inline link is NOT `target="_blank"`; footnotes region has `aria-label="Footnotes"`.

#### E2E tests (`tests/e2e/*.spec.ts`)
**Environment:** Playwright, 3-engine matrix (Chromium, Firefox, WebKit). Required for any DOM reading-order, focus, or rendered-structure assertion (STACK.md "What NOT to Use": no DOM emulators for layout truth).
- **`open-every-fixture.spec.ts`** — iterate `fixtures`; open each; assert `<h1>` visible; assert no console errors; assert source-URL link present. DOC-01 smoke.
- **`a11y.spec.ts`** — `AxeBuilder` from `@axe-core/playwright`; run on fixture-list + each article view; assert zero serious/critical violations. Asserts `heading-order`, `list` rules (Pitfall 10).

---

## Cross-Cutting Conventions

The following rules apply to EVERY file in Phase 1. The planner should inline-cite them in each plan's `<action>` block rather than re-stating.

### TypeScript Strictness
- **`"strict": true`** mandatory (STACK.md: "Strict TypeScript makes block kinds … explicit").
- **`"noUncheckedIndexedAccess": true`** recommended — `normalizeText`, renderer, and selectors all index arrays.
- **`"verbatimModuleSyntax": true`** recommended — enforces `import type` for type-only imports (matches `import type { … }` pattern in RESEARCH.md §Code Examples).
- **Inferred types from Zod schemas** — never hand-write a parallel type. `type Block = z.infer<typeof BlockSchema>` (RESEARCH.md §Code Examples line 614).

### Zod-at-Boundary
- **Every fixture is parsed through `ArticleSchema.parse(raw)` at import time** in `src/fixtures/index.ts` (Pitfall 8). No fixture bypasses validation, even "trusted" ones.
- **Schemas are the single source of truth** for types. UI/repository/storage layers consume `z.infer<...>` types.
- **Recursive schemas use the getter form:** `get children() { return z.array(BlockSchema) }` (Pitfall 7).

### Discriminated-Union Block Model
- **Blocks:** `z.discriminatedUnion("kind", [...])` with discriminator `"kind"` — O(1) parse + clean TS narrowing in renderer's `switch`.
- **Inline marks:** `z.union([...])` (NOT discriminated) — set is tiny and ordered-check is fine.
- **Renderer's `switch(block.kind)` MUST be exhaustive** over the 9 locked kinds — TS narrowing enforces this.

### Semantic-HTML Rendering Rules
- **NEVER `dangerouslySetInnerHTML`** anywhere (Pitfall 6). Enforced statically by ESLint rule `react/no-danger`.
- **DOM reading order == `article.blocks` array order**, by construction. Never reorder for visual purposes (RESEARCH.md §Anti-Patterns).
- **Native elements only** — `<article>`, `<h1>`–`<h6>`, `<p>`, `<a>`, `<ul>`/`<ol>`, `<figure>`+`<figcaption>`, `<blockquote>`, `<pre><code>`, `<section aria-label>`, `<details>`+`<summary>`. No ARIA layer where a native equivalent exists (none needed in Phase 1).
- **Blocks must NOT carry CSS classes** (RESEARCH.md §Anti-Patterns). CSS targets element selectors + a small allow-list of class hooks: `.skip-link`, `.meta`, `.disclosure`, `.status`, `.visually-hidden`.

### URL Safety (Pitfall 5)
- **Scheme allow-list** `{ http, https, mailto }` enforced in the Zod schema on every URL field: `link.href`, `provenance.sourceUrl`, `figure.src`. `javascript:`, `data:`, `file:`, `vbscript:` rejected at parse time.
- **`target="_blank"` paired with `rel="noopener noreferrer"`** on every new-tab link (UI-SPEC §Interaction 2; reverse-tabnabbing defense). ESLint rule `react/jsx-no-target-blank` enforces.

### DOM Clobbering Prevention (Pitfall 4)
- **Footnote ids locked to `/^fn-\d+$/`** in Zod schema. Renderer derives `fn-ref-N` deterministically.
- **Source HTML `id` attributes NEVER carried through** into fixtures.

### Grapheme-Offset Discipline (Pitfall 1, D-05)
- **Canonical offset of the Nth grapheme cluster = array index N**, NOT `segment.index` (UTF-16 code-unit offset).
- **`Intl.Segmenter(article.lang, { granularity: "grapheme" })`** — locale comes from the fixture's BCP-47 `lang` field.

### Whitespace Discipline (Pitfall 2, D-05)
- **ASCII-only whitespace collapse** `/[\t\n\f\r ]+/g → " "` then `trim()`.
- **NO Unicode normalization** (no NFC, no NFKC) — would break `Intl.Segmenter` reproducibility across revisions.
- **Code-block source is verbatim** — never collapsed.

### CSS Authoring (STACK.md "What NOT to Use")
- **Authored CSS layers + CSS custom properties** in `src/app.css`. NO Tailwind, NO component suite, NO shadcn.
- **Custom properties for theme tokens** (D-07 warm-paper defaults): `--surface`, `--surface-raised`, `--ink`, `--ink-soft`, `--accent`, `--accent-hover`, `--focus-ring`, `--destructive`, `--hairline`.
- **Spacing scale (multiples of 4)**: `--space-xs/sm/md/lg/xl/2xl/3xl` + `--touch` (44px).
- **Reading measure:** `max-width: 64ch; margin-inline: auto;` on the article body, invariant across breakpoints.
- **Relative block rhythm:** `em` (not `px`) inside article body so Phase 2 size changes preserve calm.
- **`prefers-reduced-motion: reduce`** defensive block (UI-SPEC §Interaction 5).
- **`forced-colors: active`** safety block (UI-SPEC §Interaction 7).

### React / State Discipline (STACK.md "What NOT to Use")
- **React state/context only.** NO Redux, Zustand, XState, or any global state library.
- **`createRoot` mount, client-only.** NO SSR framework (Next.js/Remix) — STACK.md core.
- **Hash-based routing** (`#/article/<id>`) — RESEARCH.md §Pattern 7 recommendation; planner may swap for React Router per CONTEXT.md discretion (LOW risk, additive).

### Persistence Seam (D-08, Pitfall 9)
- **Phase 1 reads via `inMemoryRepository`** — never through Dexie.
- **Dexie `version(1)` shipped ONCE in Phase 1, NEVER edited.** Phase 2 adds `version(2).stores({...})`. All slots reserved now.
- **Repository interface defined now** — makes Phase 2 swap a one-line provider change.

### GSD Workflow
- All work enters through `/gsd-execute-phase` (or `/gsd-quick` for small fixes). No direct edits outside GSD. (AGENTS.md §GSD Workflow Enforcement.)

---

## No Analog Found (all greenfield)

| File Group | Reason | Fallback Authority |
|------------|--------|--------------------|
| All 40 files | Greenfield project — no `src/`, no `package.json`, no installed deps. | All patterns derived from locked docs: STACK.md, `01-RESEARCH.md` §Code Examples + §Architecture Patterns, `01-UI-SPEC.md`, `01-CONTEXT.md` decisions D-01…D-09. The planner lifts code excerpts from `01-RESEARCH.md` §Code Examples verbatim (lines cited per-file above). |

---

## Open Items the Planner Must Resolve

| # | Item | Authority | Recommendation |
|---|------|-----------|----------------|
| 1 | **Fixture candidate approval (D-03)** — highest-risk open item. | RESEARCH.md Open Question #1 | Insert `checkpoint:human-verify` task at START of Wave 1 (or pre-Wave 0) where the researcher proposes 5–7 candidate URLs + licensing notes; user approves before normalization begins. |
| 2 | **Walking-skeleton "DB read/write" interpretation (A3)** — generic template says "one real DB read/write"; D-08 defers IndexedDB. | RESEARCH.md Open Question #2 | In-memory repository round-trip. Document the deviation in SKELETON.md so the orchestrator sees the rationale. |
| 3 | **Routing approach (A2)** — hash vs React Router. | RESEARCH.md §Pattern 7 | Hash-based routing (keeps dependency surface minimal; matches STACK.md "no premature abstractions"). |
| 4 | **`TextQuoteSelector.resolve()` scope** — Phase 5 needs it; types + `derive()` belong in Phase 1. | RESEARCH.md Open Question #4 | Ship types + `derive()` only. `resolve()` is Phase 5. |
| 5 | **Wave plan / plan-file partitioning** — how to split the 40 files across plans/waves. | Planner's discretion | Suggested: Plan 01 (Wave 0) = configs + test infra + schema/types/normalizeText (the frozen contract) + reserved Dexie; Plan 02 (Wave 1, gated on Q1) = fixtures + repository + renderer + routes + skip-link + e2e/a11y tests. |

---

## Metadata

**Analog search scope:** `.planning/research/STACK.md`, `.planning/PROJECT.md`, `AGENTS.md`, `.planning/phases/01-canonical-article-foundation/{CONTEXT,RESEARCH,UI-SPEC,VALIDATION}.md`. Codebase `src/` not searched (does not exist — greenfield).

**Pattern extraction date:** 2026-07-28

**Verification of source authority:**
- STACK.md — locked stack, HIGH confidence, version-pinned (RESEARCH.md §Metadata).
- `01-RESEARCH.md` §Code Examples — direct implementation of D-04/D-05/D-06; `Intl.Segmenter` behavior verified against MDN; Zod patterns verified against zod.dev (RESEARCH.md §Sources).
- `01-UI-SPEC.md` — UI design contract; status `draft` but the three `⚠ default` flags are resolved by CONTEXT.md D-07.
- `01-CONTEXT.md` — USER DECISIONS from `/gsd-discuss-phase`; locked.

**Downstream consumer:** `gsd-planner` — use this file's per-file Pattern Notes as `<read_first>` and `<action>` lift-targets. Cross-Cutting Conventions section applies to every plan.
