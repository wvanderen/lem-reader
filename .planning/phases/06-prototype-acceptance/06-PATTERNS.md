# Phase 6: Prototype Acceptance - Pattern Map

**Mapped:** 2026-08-08
**Files analyzed:** 11 new/modified (9 new + 2 modified configs; +1 new doc-dir + 1 new planning artifact)
**Analogs found:** 9 / 11 with strong matches (2 are novel docs — no analog)

Phase 6 is **verification + gap-closure, not feature-building**. Every new/modified file is **test-tier (Playwright specs / Node gate), config-tier (playwright.config / package.json), or doc-tier (ACCEPTANCE-PROTOCOL / VERIFICATION)**. **No new production code is written** — the substrate (Phases 1–5) and the DEV instrumentation hooks (`__lemLastTrustedConstraints`, `__lemDiagnosticBus`, `__lemPagination`) already exist. This pattern map therefore points each new file at the **closest existing test/harness/config analog** to copy from.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/e2e/acceptance/core-reading-flow.spec.ts` (NEW) | test (e2e controller) | request-response (open→read→switch→restore→highlight) | `tests/e2e/open-every-fixture.spec.ts` + `tests/e2e/annotations/_fixtures.ts` + `tests/e2e/pagination/mode-switch-anchor.spec.ts` | exact |
| `tests/e2e/_edge-invariant.ts` (NEW) | utility (shared helper) | request-response (assertion over a `Page`) | `tests/e2e/annotations/_fixtures.ts` (helper module) + `tests/e2e/reflow.spec.ts` (overflow check) | exact |
| `tests/e2e/high-zoom.spec.ts` (NEW) | test (e2e edge) | request-response (setViewportSize + emulateMedia) | `tests/e2e/reflow.spec.ts` + `tests/e2e/forced-colors.spec.ts` | exact |
| `tests/e2e/font-failure.spec.ts` (NEW) | test (e2e edge, route interception) | request-response + network intercept (block/delay/swap) | `tests/e2e/measurement/stale-drop.spec.ts` + `tests/e2e/open-every-fixture.spec.ts` (beforeEach route stub) | exact |
| `tests/e2e/perf/perf.harness.spec.ts` (NEW) | test harness (batch measurement) | batch (measure N fixtures × profiles → temp file) | `tests/e2e/calibration/calibration.harness.spec.ts` | exact |
| `tests/e2e/perf/budget.compare.ts` (NEW) | utility (Node CLI gate) | batch transform (merge temp → p95 → diff → exit code) | `tests/e2e/calibration/fingerprint.compare.ts` | exact |
| `tests/e2e/perf/budget.json` (NEW) | config (committed contract) | data (static JSON artifact) | `calibration/fingerprint.json` | exact |
| `playwright.config.ts` (MODIFIED) | config | request-response (project matrix) | its own existing 3-engine `projects` array | exact (self-extension) |
| `package.json` (MODIFIED) | config | request-response (npm script) | the existing `"calibrate"` script line | exact (self-extension) |
| `docs/ACCEPTANCE-PROTOCOL.md` (NEW) | doc (process artifact) | manual (human-run checklist + charter) | **NO direct analog** — first process doc; borrow AGENTS.md GSD-managed md structure + `fingerprint.json` rationale discipline | none (novel doc) |
| `06-VERIFICATION.md` (NEW) | doc (evidence record) | manual (results ledger) | **NO direct analog** — first VERIFICATION.md in repo (glob confirmed) | none (novel doc) |

---

## Pattern Assignments

### `tests/e2e/acceptance/core-reading-flow.spec.ts` (test, request-response)

**Analog:** `tests/e2e/open-every-fixture.spec.ts` (corpus iteration + DOC-01 mount proof) + `tests/e2e/annotations/_fixtures.ts` (reusable harness) + `tests/e2e/pagination/mode-switch-anchor.spec.ts` (mode-switch round-trip + DEV-hook sentinel).

**Why this is the analog:** ACPT-01 (D6-13) is a *consolidated end-to-end flow* across the 6-fixture corpus × 3 engines, reusing the existing corpus list, selectors, and DEV hooks — not new feature logic. `open-every-fixture.spec.ts` already iterates `fixtures` and opens each via its hash route; `mode-switch-anchor.spec.ts` proves the M-toggle round-trip + pagination sentinel; `annotations/_fixtures.ts` provides the exact helpers (`openArticle`, `switchMode`, `selectRangeInBlock`, `findFirstBlockWithText`, `announcementRegion`) the consolidated flow needs.

**Imports + corpus iteration pattern** (`tests/e2e/open-every-fixture.spec.ts:13-16, 28-29`):
```typescript
import { test, expect } from "@playwright/test";
import { fixtures } from "../../src/fixtures";

const BASE = "http://localhost:5173";

for (const article of fixtures) {
  test.describe(`open ${article.id}`, () => {
    test("...", async ({ page }) => {
      await page.goto(`${BASE}/#/article/${article.id}`);
```
> **Planner note:** D6-13 resolved to a **sibling** spec (not extending `open-every-fixture`, which stays the DOC-01 mount smoke). Iterate the **`FIXTURES` array from `tests/e2e/pagination/fixtures-matrix.ts`** (or re-export from `annotations/_fixtures.ts` — it already does `export { FIXTURES }`). Use **one representative typography** (D-07 default serif/18/64/comfortable) × 6 fixtures × 3 engines = 18 runs (RESEARCH Open Question 2), NOT the full 54-cell `CORPUS_MATRIX` (typography-stress is already PAGE-03's job).

**Reuse the shared annotation harness instead of re-deriving selectors** (`tests/e2e/annotations/_fixtures.ts:44-57, 70-105, 312-319`):
```typescript
export async function wipeDatabase(page: Page): Promise<void> {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => { /* indexedDB.deleteDatabase("lem-reader") */ });
}

export async function openArticle(page: Page, fixtureId: string): Promise<void> {
  await page.goto(`${BASE}/#/article/${fixtureId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // waits for visible block + window.__lemPagination DEV hook + 600ms settle
}

export async function switchMode(page: Page): Promise<void> {
  const before = await modeToggle(page).getAttribute("aria-label"); // /^Reading mode:/
  await page.keyboard.press("m");
  await expect(modeToggle(page)).not.toHaveAttribute("aria-label", before ?? "");
  await page.waitForTimeout(400);
}
```
> **Planner note:** `openArticle` already waits for the pagination engine DEV hook + fonts settle — reuse it verbatim. `switchMode` drives the **M shortcut** (D4-06 keyboard bundle). The `H` highlight shortcut + toolbar path is proven in `capture-highlight.spec.ts:48-72` (`selectRangeInBlock` → `.selection-toolbar` → `Highlight` button → `mark.highlight[data-highlight-id]` + `announcementRegion` contains `/Highlight saved/i`).

**Mode-switch round-trip + DEV-hook sentinel** (`tests/e2e/pagination/mode-switch-anchor.spec.ts:42-55, 89-98`):
```typescript
async function waitForPagination(page, fixture) {
  await page.goto(`${BASE}/#/article/${fixture}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () => (window).__lemPagination !== undefined, undefined, { timeout: 8000 });
  await page.waitForTimeout(600);
}
// ...
await page.keyboard.press("m");
await expect(toggle).toHaveAttribute("aria-label", "Reading mode: scrolling");
```
> **Planner note (Pitfall 6 — avoid duplication):** The consolidated spec asserts the **END-TO-END flow as one contract** (open → read-through → switch → restore → create+navigate highlight) using EXISTING selectors/helpers. It does NOT re-prove PAGE-01/ANNO-01 in isolation — those specs stay authoritative.

---

### `tests/e2e/_edge-invariant.ts` (utility, request-response)

**Analog:** `tests/e2e/annotations/_fixtures.ts` (shared-helper module shape: type-only imports + pure `Page`→assertion functions) + `tests/e2e/reflow.spec.ts:22-49` (the overflow check that is the load-bearing (c) assertion).

**Why this is the analog:** D6-09 demands ONE shared invariant applied to every edge condition. The repo's established pattern for cross-spec test helpers is `annotations/_fixtures.ts` — a `.ts` module (NOT a spec) that exports `Page`→`void` functions with type-only imports. The (c) overflow assertion already exists verbatim in `reflow.spec.ts`; lift it into the helper.

**Shared-helper module shape** (`tests/e2e/annotations/_fixtures.ts:21-31`):
```typescript
import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { FIXTURES } from "../pagination/fixtures-matrix";
export { FIXTURES };
```
> **Planner note:** Name the file `_edge-invariant.ts` (leading underscore — matches the `_fixtures.ts` convention for non-spec helper modules so Playwright's `testDir` glob does NOT pick it up as a spec).

**The (c) overflow assertion to lift** (`tests/e2e/reflow.spec.ts:24-49`):
```typescript
const overflow = await page.evaluate(() => {
  return {
    body: { scrollW: document.body.scrollWidth, clientW: document.body.clientWidth },
    article: (() => {
      const el = document.querySelector(".article-body");
      if (!el) return null;
      return { scrollW: el.scrollWidth, clientW: el.clientWidth };
    })(),
  };
});
expect(overflow.body.scrollW,
  `body scrolls horizontally at 320px (scrollW ${overflow.body.scrollW} > clientW ${overflow.body.clientW})`
).toBeLessThanOrEqual(overflow.body.clientW + 1); // 1px sub-pixel tolerance
if (overflow.article) {
  expect(overflow.article.scrollW, `article-body scrolls horizontally`).toBeLessThanOrEqual(overflow.article.clientW + 1);
}
```
> **Planner note:** The invariant's (a) "full content reachable via keyboard in BOTH modes" and (b) "no required function unreachable" can be expressed against the EXISTING selectors: `page.getByRole("article")`, `page.locator("[data-block-index]")` (every block represented — see `src/routes/ArticleView.tsx`), `page.getByRole("button", { name: "Reading settings" })`, and `modeToggle`/`drawerTrigger` from `_fixtures.ts`. Re-export those from `_edge-invariant.ts` so all edge specs import from one place.

---

### `tests/e2e/high-zoom.spec.ts` (test, request-response)

**Analog:** `tests/e2e/reflow.spec.ts` (the `setViewportSize({width:320})` + overflow assertion — the load-bearing reflow primitive) + `tests/e2e/forced-colors.spec.ts` (the `emulateMedia` `beforeEach` pattern).

**Why this is the analog:** D6-10 locks 400% zoom + 320 CSS px reflow. RESEARCH verified Playwright has **NO native zoom API** — `setViewportSize({width:320})` IS the cross-engine load-bearing reflow assertion (already used by `reflow.spec.ts`); `document.body.style.zoom=4` is a *secondary* engine-variable check (chromium yes, firefox 126+, webkit partial). `deviceScaleFactor` is DPR, NOT zoom (Pitfall 2).

**The load-bearing viewport + overflow pattern** (`tests/e2e/reflow.spec.ts:11-16, 18-20`):
```typescript
test.describe("Reflow at 320px (A11Y-04)", () => {
  test.beforeEach(async ({ page }) => {
    // 320 CSS px is the WCAG reflow breakpoint. Tall viewport so the panel
    // (full-height sheet) has room to lay out.
    await page.setViewportSize({ width: 320, height: 800 });
  });

  test("article body has no horizontal overflow at 320px", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await expect(page.getByRole("article")).toBeVisible();
```

**Settings-panel operability assertion** (D6-09 invariant (b) — `tests/e2e/reflow.spec.ts:52-75`):
```typescript
await page.getByRole("button", { name: "Reading settings" }).click();
const dlg = page.locator("dialog.settings-panel");
await expect(dlg).toBeVisible();
for (const legend of ["Typeface", "Text size", "Reading width", "Spacing", "Theme"]) {
  await expect(page.getByText(legend, { exact: false }).first()).toBeVisible();
}
await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeVisible();
await expect(page.getByRole("button", { name: "Close reading settings" })).toBeVisible();
```

> **Planner note (Pitfall 3 — CSS zoom engine variance):** Treat `setViewportSize({width:320})` as **load-bearing + cross-engine**. Add `await page.evaluate(() => { (document.body.style as any).zoom = "4"; })` as a **secondary, engine-aware** assertion — skip on engines where unsupported, or assert only "no content is LOST" (not exact layout). Document the variance in a spec comment. Iterate **all 6 FIXTURES** (not just `FIRST_FIXTURE`) since the invariant applies uniformly.

---

### `tests/e2e/font-failure.spec.ts` (test, request-response + network intercept)

**Analog:** `tests/e2e/measurement/stale-drop.spec.ts` (the DEV-hook observation point + rapid-trigger race + V7 pageerror guard) + `tests/e2e/open-every-fixture.spec.ts:22-26` (the `page.route` stub pattern) — PLUS RESEARCH's injected-`@font-face` example (the critical gotcha).

**Why this is the analog:** The font-failure spec exercises the *font gate (D3-06), last-valid-view (PAGE-06), and stale-drop (PAGE-07)* machinery against a real pending font load. `stale-drop.spec.ts` is the existing spec that observes exactly that machinery via the `__lemLastTrustedConstraints` DEV hook + asserts no reader-visible error (V7). The harness pattern (PIXEL_SVG stub, IndexedDB wipe, hash-route, h1 sentinel) is identical.

**CRITICAL GOTCHA — Lem Reader loads NO web fonts** (RESEARCH finding 2, verified `src/settings/tokens.ts` FONT_STACKS are all OS-installed cascades; `src/app.css` + `index.html` have no `@font-face`). The harness MUST **inject a web font first**, then intercept the injected URL. RESEARCH §Code Examples prescribes the exact pattern:
```typescript
async function injectTestFont(page: import("@playwright/test").Page): Promise<void> {
  await page.addStyleTag({
    content: `
      @font-face {
        font-family: "TestInjectedFont";
        src: url("/test-injected-font.woff2") format("woff2");
      }
      .article-body, .page-fragment { font-family: "TestInjectedFont", var(--font-body); }
    `,
  });
}
// (a) BLOCK
await page.route("**/test-injected-font.woff2", (route) => route.abort());
// (b) DELAY
await page.route("**/test-injected-font.woff2", async (route) => {
  await new Promise((r) => setTimeout(r, 1500)); await route.continue();
});
```
> **Planner note (Pitfall 1):** `page.route('**/*.woff2', ...)` on the unmodified app intercepts NOTHING — the test passes vacuously. The `addStyleTag` MUST run before/around navigation so `document.fonts.ready` becomes genuinely pending. Verify via `page.on('request')` that the font is actually requested.

**The DEV-hook observation point** (`tests/e2e/measurement/stale-drop.spec.ts:44-58, 96-115`):
```typescript
const pageErrors: string[] = [];
page.on("pageerror", (err) => pageErrors.push(String(err)));
// ...
await page.waitForFunction(
  () => (window).__lemLastTrustedConstraints !== undefined, undefined, { timeout: 5000 });
// ... trigger re-measure ...
const committed = await page.evaluate(() =>
  (window).__lemLastTrustedConstraints as { size: number; viewportWidthPx: number } | undefined);
expect(committed, "a trusted view must have committed").not.toBeNull();
// V7 — measurement must NEVER throw to the reader
expect(pageErrors, "no uncaught errors during the race").toEqual([]);
```
> **Planner note:** DELAY mode asserts `__lemLastTrustedConstraints` UPDATES after `document.fonts.ready` resolves (re-commit). SWAP mode asserts the stale-epoch guard drops the stale result (only newer commits) — directly reusing the `stale-drop.spec.ts` rapid-trigger harness shape. The (a)/(b)/(c) shared invariant (D6-09) applies via `_edge-invariant.ts` imported here.

---

### `tests/e2e/perf/perf.harness.spec.ts` (test harness, batch measurement)

**Analog:** `tests/e2e/calibration/calibration.harness.spec.ts` (per-engine temp-file + `afterAll` write + DEV-hook observation) — **mirror this EXACTLY** (RESEARCH §Don't Hand-Roll).

**Why this is the analog:** D6-04 locks the ACPT-04 CI gate to mirror Phase 3's calibration CI gate. The calibration harness is the proven shape: each Playwright engine's worker accumulates results in module scope, writes them to `.calibration-tmp/<engine>.json` in `afterAll`, and a Node script merges + diffs. The perf harness swaps "height-drift samples" for "cold/warm wall-clock samples" but keeps the per-engine-temp-file + afterAll-write + Node-merge structure identical.

**Imports + module-scope accumulator + afterAll write** (`tests/e2e/calibration/calibration.harness.spec.ts:32-35, 52, 181-183, 242-255`):
```typescript
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fixtures } from "../../../src/fixtures";

const TMP_DIR = resolve(process.cwd(), ".calibration-tmp");

const engineResults: BlockResult[] = [];  // module-scope accumulator per worker

test(`calibration: measure fixtures × typography matrix (per-engine)`, async ({ page, browserName }) => {
  test.setTimeout(300_000);
  // ... measure, push to engineResults ...
});

test.afterAll(async ({ browserName }) => {
  if (engineResults.length === 0) return;
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(resolve(TMP_DIR, `${browserName}.json`), JSON.stringify(engineResults, null, 2), "utf8");
});
```

**The measurement seam — DEV hooks already exist** (`src/measurement/useMeasurement.ts:130-136, 155-158`):
```typescript
const unsubTrusted = engine.onTrusted((result) => {
  setTrustedView(result);
  // DEV-only debug hook for the PAGE-07 e2e (stale-drop.spec.ts).
  if (import.meta.env.DEV) {
    (window).__lemLastTrustedConstraints = result.constraints;
  }
});
// ...
if (import.meta.env.DEV) {
  (window).__lemDiagnosticBus = diagnostics;  // for PAGE-09 banner tests
}
```
> **Planner note (RESEARCH finding 5 + Don't Hand-Roll):** Cold = first `__lemLastTrustedConstraints` write; warm = subsequent writes (instrument by counting writes around a re-trigger). Do NOT add timing probes to `ArticleView.tsx` or `engine.ts` — that violates D3-04 (invisible by default). The hooks are gated `import.meta.env.DEV` (present in `npm run dev`, stripped from `vite build`). **Worst-case targets** (RESEARCH finding 3): `essay-long-form` (text, 2994 chars) + `list-reference`/`technical-post` (structure) — NOT `figure-heavy` (figures stubbed to 1×1 SVG in tests; smallest normalized text at 1475 chars).

---

### `tests/e2e/perf/budget.compare.ts` (utility, Node CLI gate)

**Analog:** `tests/e2e/calibration/fingerprint.compare.ts` — **mirror this EXACTLY** (RESEARCH §Pattern 1 + §Don't Hand-Roll). This is the single highest-fidelity analog in the phase.

**Why this is the analog:** D6-04 = "CI perf gate mirroring Phase 3's calibration CI gate." `fingerprint.compare.ts` is the complete, proven Node-gate: load per-engine temp files → refuse-empty guard (exit 2) → aggregate → write committed artifact → diff vs committed → `process.exit(1)` on regression. The perf gate swaps "eligibility regression" for "p95 exceeds budget" but keeps the skeleton, exit codes, and CI invocation identical.

**Imports + refuse-empty guard + exit-code gate** (`tests/e2e/calibration/fingerprint.compare.ts:29-34, 151-165, 197-211, 258-276`):
```typescript
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = process.cwd();
const FINGERPRINT_PATH = resolve(REPO_ROOT, "calibration", "fingerprint.json");
const TMP_DIR = resolve(REPO_ROOT, ".calibration-tmp");

function loadTempResults(): BlockResult[] {
  if (!existsSync(TMP_DIR)) return [];
  const out: BlockResult[] = [];
  for (const f of readdirSync(TMP_DIR)) {
    if (!f.endsWith(".json")) continue;
    try { out.push(...JSON.parse(readFileSync(resolve(TMP_DIR, f), "utf8"))); } catch {}
  }
  return out;
}

function main(): void {
  const freshResults = loadTempResults();
  if (freshResults.length === 0) {
    console.error("[calibration] refusing to overwrite fingerprint.json with empty data");
    process.exit(2);  // refuse-empty guard — exit 2
  }
  // ... aggregate, write committed artifact ...
  if (regressions.length > 0) {
    console.error("[calibration] REGRESSION ...");
    process.exit(1);  // THE CI GATE — exit 1
  }
  process.exit(0);
}
main();
```
> **Planner note (Pitfall 4):** `budget.json` is committed EMPTY/placeholder on Wave 1 — the harness measures FIRST, the budget numbers are locked ONLY after the executor runs the harness + the user approves (D6-01 measure-first). Do NOT commit a guessed budget in the PLAN. The `process.exit(1)` gate is the regression detector; `process.exit(2)` refuses to overwrite a real budget with empty data (mirror the calibration guard exactly).

---

### `tests/e2e/perf/budget.json` (config, static data)

**Analog:** `calibration/fingerprint.json` (the committed-artifact schema).

**Why this is the analog:** D6-04 locks the perf gate to mirror calibration. The fingerprint JSON is the proven schema for a versioned, machine-generated, rationale-annotated measurement contract.

**Schema to mirror** (`calibration/fingerprint.json:1-8`):
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-05T14:17:10.380Z",
  "toleranceBound": { "heightDriftPx": 1, "breaksExact": true },
  "rationale": "Calibration run with tolerance ... Derived from 2592 block samples across chromium/firefox/webkit engines.",
  "engines": { ... }
}
```
> **Planner note:** Mirror `schemaVersion`, `generatedAt`, `toleranceBound` (→ the headroom tolerance), and `rationale` fields. The perf artifact's `engines` shape is `{ fixture, profile: "desktop"|"throttled-mobile", engine, phase: "cold"|"warm", wallClockMs }` per RESEARCH §Code Examples. Wave 1 commits a **placeholder** (rationale = "budget not yet measured — see D6-01") so the compare script's first-run path (no committed budget → exit 0, like `fingerprint.compare.ts:238-243`) is exercised.

---

### `playwright.config.ts` (config, MODIFIED)

**Analog:** its own existing 3-engine `projects` array (`playwright.config.ts:7-11`).

**Existing matrix** (`playwright.config.ts:1-18`):
```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: { trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
```
> **Planner note (RESEARCH finding 4 + Pitfall 5 — chromium-only throttle):** Add a `chromium-throttled-mobile` project. CPU/network throttle is **chromium-only via CDP** (`context.newCDPSession(page)` → `Emulation.setCPUThrottlingRate` / `Network.emulateNetworkConditions`) — `[ASSUMED]`, planner/executor must verify API availability in Playwright 1.61.1. Gate the project to chromium only; do NOT declare it for firefox/webkit (they'd silently ignore the throttle → misleadingly-fast numbers). The manual sign-off (D6-04) covers firefox/webkit on the full device matrix. Exact throttle values (4× CPU + Slow 3G recommended) are executor discretion per RESEARCH Open Question 1.

---

### `package.json` (config, MODIFIED)

**Analog:** the existing `"calibrate"` script line (`package.json:14`).

**Existing precedent** (`package.json:7-16`):
```json
"scripts": {
  "test:unit": "vitest",
  "test:e2e": "playwright test",
  "test": "npm run test:unit -- --run && npm run test:e2e",
  "calibrate": "playwright test calibration.harness && node tests/e2e/calibration/fingerprint.compare.ts",
  "lint": "eslint .",
  "format": "prettier --write ."
}
```
> **Planner note:** Add `"perf"` mirroring `"calibrate"` exactly: `"perf": "playwright test perf.harness && node tests/e2e/perf/budget.compare.ts"` (RESEARCH §Code Examples). No new dependencies are added (RESEARCH §Package Legitimacy Audit — Phase 6 adds zero packages). Do NOT wire `perf` into the default `test` script (it's a separate CI/release gate, like `calibrate` is).

---

### `docs/ACCEPTANCE-PROTOCOL.md` (doc, manual process) — NO DIRECT ANALOG

**Closest available:** `AGENTS.md` (the repo's only existing process doc — GSD-managed markdown with a header, section structure, and canonical cross-references) + `calibration/fingerprint.json` `rationale` field (the discipline of versioning + explaining measurement contracts).

**Why no analog:** No `docs/` directory exists (`ls docs` → `NO_DOCS_DIR`). The only repo-root `.md` is `AGENTS.md`. No prior `VERIFICATION.md` exists anywhere in `.planning/` (glob confirmed). This is the first durable process artifact.

**Structural borrowings:**
- **AGENTS.md** — top-of-file project-summary header + `<decisions>`/`<canonical_refs>`-style sectioning + "Downstream agents MUST read these" cross-reference discipline.
- **fingerprint.json `rationale`** (`calibration/fingerprint.json:8`) — versioning discipline: every measurement/contract artifact carries a human-readable rationale + `generatedAt`.

**Required content (from D6-05/D6-06/D6-07/D6-08 — locked, not discretion):**
1. **Versioned header** (D6-08) — version + "re-run on material reader-surface changes" flag.
2. **SR matrix** (D6-05) — NVDA+Firefox (Windows) + VoiceOver+Safari (macOS); JAWS recorded as v1.x coverage boundary, NOT a gate.
3. **6 scripted core flows** (D6-06) — each step with expected outcome authored as **role + accessible name** (NOT verbatim SR phrasing — Pitfall 7), mirroring how `panel-keyboard.spec.ts` asserts `dlg.contains(activeElement)` (structure, not phrasing).
4. **Exploratory charter** (D6-06) — goal-based edge scenarios.
5. **Severity rubric** (D6-07) — blocker/major/minor definitions; **zero-blocker/major = pass**; minor SR-output quirks recorded, not blocking.

> **Planner note (Pitfall 7):** Author expected outcomes as "role + accessible name + state" (programmatically verifiable) and "informational expected phrasing" (a guide, not a gate). The automated cross-reference is `tests/e2e/panel-keyboard.spec.ts` (focus trap/restore) + `tests/e2e/section-announce.spec.ts` (A11Y-08) — the keyboard substrate this protocol layers manual SR verification onto.

---

### `06-VERIFICATION.md` (doc, evidence record) — NO DIRECT ANALOG

**Closest available:** `AGENTS.md` GSD-managed markdown structure + the `fingerprint.json` rationale + `generatedAt` discipline.

**Why no analog:** Glob across `.planning/phases/**/*VERIFICATION*` returned **nothing** — this is the first VERIFICATION.md in the project (Phase 5 has none). The format is novel.

**Required content (locked by CONTEXT.md `## Integration Points` + ROADMAP success criteria):**
1. **ACPT-01 result** — full-suite green + `core-reading-flow.spec.ts` results (6 fixtures × 3 engines).
2. **ACPT-02 result** — `docs/ACCEPTANCE-PROTOCOL.md` run record on NVDA+Firefox + VoiceOver+Safari; zero-blocker finding; deferred-items list.
3. **ACPT-03 result** — `high-zoom` + `font-failure` (NEW) + audited `forced-colors`/`reduced-motion`/`reflow`/`touch-targets` results; the shared invariant holds.
4. **ACPT-04 result** — measured p95 cold/warm tables + **user-approved budget sign-off** (D6-01) + throttled-mobile chromium gate + full-device-matrix manual sign-off (D6-04).
5. **Honest full-suite execution** — `npm run test` exit 0 (the Plan 04-11/05-05 precedent: no subset, no grep, no engine-skip).

---

## Shared Patterns

### Image-stub + IndexedDB-wipe harness (every e2e spec)
**Source:** `tests/e2e/open-every-fixture.spec.ts:20-26` + `tests/e2e/annotations/_fixtures.ts:44-57` (canonical helper) + `tests/e2e/measurement/stale-drop.spec.ts:21-34`
**Apply to:** `core-reading-flow.spec.ts`, `high-zoom.spec.ts`, `font-failure.spec.ts`, `perf/perf.harness.spec.ts`
```typescript
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }));
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve(); req.onerror = () => resolve(); req.onblocked = () => resolve();
    });
  });
});
```
> Reuse `wipeDatabase(page)` from `annotations/_fixtures.ts` rather than re-inlining — the corpus is the single source of truth (Plan 04-02 precedent). The `BASE = "http://localhost:5173"` constant + hash-route `${BASE}/#/article/<id>` is universal across all e2e specs.

### V7 — measurement never throws to the reader
**Source:** `tests/e2e/measurement/stale-drop.spec.ts:43-44, 115`
**Apply to:** `font-failure.spec.ts` (every mode), `perf/perf.harness.spec.ts`
```typescript
const pageErrors: string[] = [];
page.on("pageerror", (err) => pageErrors.push(String(err)));
// ... trigger the condition ...
expect(pageErrors, "no uncaught errors during the race").toEqual([]);
```

### DEV-hook observation (no production instrumentation)
**Source:** `src/measurement/useMeasurement.ts:133-136, 155-158` (DEV-gated) + `tests/e2e/measurement/stale-drop.spec.ts:52-58` + `tests/e2e/annotations/_fixtures.ts:95-101` (`__lemPagination`)
**Apply to:** `font-failure.spec.ts` (DELAY/SWAP re-commit), `perf/perf.harness.spec.ts` (cold/warm write counting)
```typescript
await page.waitForFunction(
  () => (window).__lemLastTrustedConstraints !== undefined, undefined, { timeout: 5000 });
```
> All three hooks (`__lemLastTrustedConstraints`, `__lemDiagnosticBus`, `__lemPagination`) are gated `import.meta.env.DEV` — present under `npm run dev` (which `playwright.config.ts` `webServer` runs), stripped from `vite build`. NEVER add timing/observation code to `src/` for Phase 6 (D3-04 invisible-by-default + RESEARCH Don't Hand-Roll).

### CI-gate-on-regression (the `process.exit(1)` Node gate)
**Source:** `tests/e2e/calibration/fingerprint.compare.ts:197-276` (the precedent)
**Apply to:** `tests/e2e/perf/budget.compare.ts` — mirror EXACTLY
- Exit **0** — no regression (or first run, no committed budget).
- Exit **1** — regression (committed p95 exceeded).
- Exit **2** — refuse to overwrite a real artifact with empty temp data.

### Cross-engine real-browser truth (STACK.md mandate)
**Source:** `playwright.config.ts:7-11` (3-engine matrix) + every existing e2e spec
**Apply to:** ALL new specs. No DOM emulator (jsdom/happy-dom) is ever authoritative for layout/font/zoom/perf — only for pure logic in the unit suite.

---

## No Analog Found

| File | Role | Data Flow | Reason | Fallback Authority |
|------|------|-----------|--------|--------------------|
| `docs/ACCEPTANCE-PROTOCOL.md` | doc (process) | manual | First process doc in repo; no `docs/` dir exists, no prior SR protocol | D6-05/D6-06/D6-07/D6-08 (locked shape) + AGENTS.md md structure + `panel-keyboard.spec.ts`/`section-announce.spec.ts` (automated substrate the protocol layers SR verification onto) |
| `06-VERIFICATION.md` | doc (evidence) | manual | First VERIFICATION.md in `.planning/` (glob confirmed; Phase 5 has none) | CONTEXT.md `## Integration Points` + ROADMAP success criteria 1–4 + the Plan 04-11/05-05 honest-full-suite precedent |

> Both are **documentation-tier** artifacts with no code analog. The planner should author them from the locked decisions (D6-05..D6-08 for the protocol; ROADMAP success criteria + this phase's wave results for VERIFICATION), borrowing only the repo's markdown/comment-header discipline.

---

## Metadata

**Analog search scope:** `tests/e2e/**` (37 specs + 2 helper modules), `tests/e2e/calibration/`, `tests/e2e/measurement/`, `tests/e2e/annotations/`, `tests/e2e/pagination/`, `src/measurement/`, `src/routes/ArticleView.tsx`, `playwright.config.ts`, `package.json`, `calibration/fingerprint.json`, `AGENTS.md`, `.planning/phases/**`, `docs/`, repo-root `*.md`.
**Files scanned:** 18 source/test files read in full; 3 glob/grep surveys.
**Reusable helpers confirmed:** `annotations/_fixtures.ts` (`openArticle`, `switchMode`, `selectRangeInBlock`, `findFirstBlockWithText`, `modeToggle`, `drawerTrigger`, `announcementRegion`, `wipeDatabase`), `pagination/fixtures-matrix.ts` (`FIXTURES`, `VIEWPORTS`, `SAMPLED_TYPOGRAPHY`, `CORPUS_MATRIX`).
**Pattern extraction date:** 2026-08-08.

## PATTERN MAPPING COMPLETE

**Phase:** 6 - Prototype Acceptance
**Files classified:** 11 (9 new + 2 modified)
**Analogs found:** 9 / 11

### Coverage
- Files with exact analog: **9** (all test/harness/config files map to a proven in-repo pattern — calibration gate, edge specs, annotations harness, fixtures-matrix)
- Files with no analog: **2** (both documentation-tier: `docs/ACCEPTANCE-PROTOCOL.md` + `06-VERIFICATION.md` — first of their kind; author from locked decisions)

### Key Patterns Identified
- **The perf CI gate mirrors `fingerprint.compare.ts` EXACTLY** — per-engine temp file → Node merge → `process.exit(1)` on regression; `npm run perf` mirrors `npm run calibrate`; `budget.json` mirrors `fingerprint.json` schema. (D6-04)
- **The edge-condition shared invariant lifts `reflow.spec.ts:22-49`** (the overflow check) into a `_edge-invariant.ts` helper module shaped like `annotations/_fixtures.ts`, applied uniformly to high-zoom + font-failure + the 4 audited specs. (D6-09/D6-12)
- **Font-failure MUST inject a `@font-face` before `page.route()`** — Lem Reader loads zero web fonts; intercepting the unmodified app is a vacuous-pass trap. The measurement DEV hooks (`__lemLastTrustedConstraints`, `__lemDiagnosticBus`) are the observation seam; no production instrumentation. (D6-11 / RESEARCH finding 2 + 5)
- **High-zoom uses `setViewportSize({width:320})` as the load-bearing reflow assertion** (Playwright has no zoom API; `deviceScaleFactor` is DPR not zoom); `document.body.style.zoom=4` is a secondary engine-variable check. (D6-10 / RESEARCH finding 1)
- **ACPT-01 reuses the `annotations/_fixtures.ts` harness wholesale** (`openArticle`/`switchMode`/`selectRangeInBlock`/`announcementRegion`) rather than re-deriving selectors — a sibling spec, not an extension of `open-every-fixture`. (D6-13)
- **Worst-case perf targets = `essay-long-form` (text) + `list-reference`/`technical-post` (structure)** — NOT `figure-heavy` (figures stubbed to 1×1 SVG in tests). (D6-02 / RESEARCH finding 3)
- **CPU/network throttle is chromium-only** (CDP) — the throttled-mobile Playwright project is chromium-gated; manual sign-off (D6-04) covers firefox/webkit. (RESEARCH finding 4 + A1)

### File Created
`.planning/phases/06-prototype-acceptance/06-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns + the five empirical findings (no-zoom-API, no-web-fonts, figure-heavy-not-worst-case, calibration-gate-mirror, chromium-only-throttle) directly in PLAN.md action sections.
