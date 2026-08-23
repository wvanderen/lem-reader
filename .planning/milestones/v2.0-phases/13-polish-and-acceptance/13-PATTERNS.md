# Phase 13: Polish and Acceptance - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 18 (8 modified, 10 new — counting `tests/e2e/chrome/*` as 4 specs and BackToLibrary as 1 new component)
**Analogs found:** 16 / 18 (2 partial: index.html inline script, dialog-centering spec mechanism)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `index.html` (M) | config / app entry | request-response (first paint) | `src/settings/applyTheme.ts` (writes to replicate); no inline-script analog exists | partial (write-discipline exact, script placement new) |
| `src/settings/settingsMirror.ts` (N) | utility / persistence seam | local storage I/O | `src/persistence/settingsStore.ts` | exact (seam-module + Zod-at-read) |
| `src/settings/SettingsContext.tsx` (M) | provider / store | CRUD (debounced persistence) | itself — L61 lazy-init target, L113-129 save seam, L194-207 clear seam | exact |
| `src/reader/ProgressHairline.tsx` (M) | component (presentational) | transform (ratio → scaleX) | `src/ingestion/library/LibraryRow.tsx` L75 (D8-11 ratio precedent) | exact |
| `src/reader/PaginatedSurface.tsx` (M) | component (container) | transform (offset → ratio prop) | itself — L551-556 already computes `pageStartGlobalOffset` | exact |
| `src/routes/ArticleView.tsx` (M) | route / component | request-response + render | itself — header block L1528-1579 (slim target); 12-06 fixed-chrome discipline | exact |
| `src/routes/review/ReviewView.tsx` (M) | route / component | request-response | `LibraryView.tsx` L202-210 ("Review highlights" nav button precedent) | exact |
| `src/reader/BackToLibrary.tsx` (N, shared anatomy) | component | request-response (nav) | `LibraryView.tsx` L202-210 + `src/reader/ModeToggle.tsx` minimal-component discipline | exact (composite) |
| `src/ingestion/library/LibraryView.tsx` (+ siblings) (M) | component (view) | request-response | itself — section structure L191-332 | exact |
| `src/app.css` (M) | config (authored CSS) | n/a (declarative) | itself — dialog blocks L1475/L669/L2030/L2240 (all carry the bug); L1025 geometry cap to preserve | exact |
| `tests/e2e/polish/cold-load-no-snap.spec.ts` (N) | test (e2e) | request-response (cold load) | `tests/e2e/progress.spec.ts` (beforeEach wipe + expect.poll + computed-style) | role-match (addInitScript mechanism new) |
| `tests/e2e/polish/first-paint-progress.spec.ts` (N) | test (e2e) | transform (scaleX read) | `tests/e2e/progress.spec.ts` L81-131 (matrix parsing + poll) | exact |
| `tests/e2e/portability/core-flow-spine.spec.ts` (N) | test (e2e, 3-engine) | CRUD round-trip | `tests/e2e/portability/round-trip.spec.ts` + `_portability.ts`; UI steps from `markdown-upload.spec.ts` + `capture-highlight.spec.ts` | exact (extension of shipped harness) |
| `tests/e2e/chrome/*.spec.ts` (N ×4) | test (e2e) | request-response / geometry | `progress.spec.ts` (computed-style + geometry); `LibraryView.tsx` L301 (`#/` fallback); pagination corpus specs (PAGE-03/04 stay green) | role-match (boundingBox centering assertion is new) |
| `tests/unit/pagination/progress-formula.test.ts` (N) | test (unit, pure) | transform (pure math) | `src/pagination/anchor.ts` (function under test); vitest structure per `tests/unit/server/pdf-to-blocks.spec.ts` L11-56 | exact |
| `tests/unit/settings/mirror.test.ts` (N) | test (unit) | local storage I/O | `src/persistence/settingsStore.ts` (result discriminations to test) + pdf-to-blocks.spec.ts structure | exact |
| `tests/unit/server/pdfTimeout.test.ts` (N) | test (unit, fake timers) | event-driven (timeout race) | `tests/unit/server/pdf-to-blocks.spec.ts` L47-56 (IngestionError assertion); `vi.useFakeTimers` precedent: `tests/component/PageTurnControls.test.tsx` L64 | exact |
| `.planning/phases/13-polish-and-acceptance/13-VERIFICATION.md` (N section) | doc (record sheet) | n/a | `.planning/milestones/v1.0-phases/06-prototype-acceptance/06-VERIFICATION.md` (ledger shape) | exact (shape copy) |

**File-extension note:** sibling conventions differ by directory — `tests/unit/pagination/*.test.ts` but `tests/unit/server/*.spec.ts`. The D13-11 test placed in `tests/unit/server/` should follow the local `.spec.ts` convention (e.g. `pdfTimeout.spec.ts`); the planner owns final names.

## Pattern Assignments

### `src/settings/settingsMirror.ts` (new utility — mirror seam)

**Analog:** `src/persistence/settingsStore.ts` (read in full, 86 lines)

**Seam-module pattern** (header + discriminated result + module-level exports, lines 1-31):
```typescript
// src/persistence/settingsStore.ts
// Persistence seam for reader preferences... ONE composite Zod-validated record
// keyed "reader-prefs" in the Dexie `settings` store... Mirrors
// src/content/repository.ts seam conventions: header comment citing the locked
// decisions, `import type` for types (verbatimModuleSyntax), module-level
// exported functions as the single-import surface.
import { db } from "./db";
import { ReaderSettingsSchema } from "../content/schema";
import type { ReaderSettings } from "../content/schema";
/** The composite-record key in the Dexie `settings` store (D2 discretion). */
const KEY = "reader-prefs";
```

**Zod-at-read / null-on-doubt pattern** (lines 54-75 — the mirror read must copy this discipline, returning `null` instead of `{ ok: false }`):
```typescript
export async function loadSettings(): Promise<SettingsLoadResult> {
  try {
    const raw = await db.settings.get(KEY);
    if (!raw?.value) {
      return { ok: true, settings: DEFAULT_SETTINGS };   // absent → defaults
    }
    const parsed = ReaderSettingsSchema.safeParse(raw.value);
    if (parsed.success) {
      return { ok: true, settings: parsed.data };
    }
    return { ok: false, reason: "corrupt" };              // never silently coerce
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}
```
Mirror divergence per Pitfall 4 (RESEARCH): mirror write failures are try/catch **no-ops** — never routed through `classifyStorageError`, never reaching `setStorageState`.

**Values the mirror carries** — `src/settings/defaults.ts` L8-16 (`DEFAULT_SETTINGS`: schemaVersion 2, font, size, measure, spacing, theme, readingMode) is the record shape; `src/settings/tokens.ts` L14-28 (`FONT_STACKS`, `SPACING_PRESETS`) holds the value maps the inline script must duplicate (A2 sync-check test).

---

### `index.html` inline pre-React script (new, D13-01)

**Analog for the writes:** `src/settings/applyTheme.ts` L29-39 — the script replicates these EXACT writes (T-02-02 parity):
```typescript
export function applyTheme(s: ReaderSettings): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme; // [data-theme] → token set (UI-SPEC §Color)
  root.style.setProperty("--font-body", FONT_STACKS[s.font]);
  root.style.setProperty("--font-size", `${s.size}px`);
  const preset = SPACING_PRESETS[s.spacing];
  root.style.setProperty("--line-height", String(preset.lineHeight));
  root.style.setProperty("--letter-spacing", preset.letterSpacing);
  root.style.setProperty("--word-spacing", preset.wordSpacing);
  root.style.setProperty("--measure", `${s.measure}ch`);
}
```
The inline script cannot import `tokens.ts` — it carries inline copies of `FONT_STACKS`/`SPACING_PRESETS` values keyed by `s.font`/`s.spacing`, with a unit sync-test asserting the copies match the module maps (RESEARCH A2). Placement: `<head>` or top of `<body>` in the current 12-line shell (`index.html` L1-12), before `/src/main.tsx`. Sketch shape: 13-RESEARCH.md §Pattern 1 (defensive try/catch, `setProperty`/`dataset` only, fail-silent to CSS literal fallbacks 18px/1.6/0). **No analog exists for the script itself — the planner should treat the RESEARCH sketch as the spec.**

---

### `src/settings/SettingsContext.tsx` (modified — lazy-init + mirror seams)

**Analog:** itself. Three exact anchor points (read in full, 221 lines):

**1. Lazy-init target** (L61 — the flash source):
```typescript
const [settings, setSettings] = useState<ReaderSettings>(() => DEFAULT_SETTINGS);
```
becomes `readSettingsMirror() ?? DEFAULT_SETTINGS` so the mount effect at L74-76 (`applyTheme(settings)`) writes byte-identical values to the inline script (Pitfall 2).

**2. Mirror-write seam** — `scheduleSave` (L113-129) funnels every `update()`/`reset()`; `flushSave` (L132-146) covers tab-hide. Mirror write hangs off the same `pendingRef.current` value:
```typescript
const scheduleSave = useCallback((next: ReaderSettings) => {
  pendingRef.current = next;
  if (saveTimer.current !== null) {
    window.clearTimeout(saveTimer.current);
  }
  saveTimer.current = window.setTimeout(() => {
    saveTimer.current = null;
    const s = pendingRef.current;
    if (!s) return;
    pendingRef.current = null;
    saveSettings(s).catch((e) => {
      setStorageState(classifyStorageError(e));   // Dexie failures classify; mirror writes must NOT
    });
  }, SAVE_DEBOUNCE_MS);
}, []);
```

**3. Mirror-clear seam** — `resetLocalData` (L194-207), the single post-wipe hook (Pitfall 1: localStorage survives `db.delete()`):
```typescript
resetLocalData: async () => {
  // Pitfall 8: this is the SEAM WipeConfirm calls from its destructive
  // button handler...
  if (saveTimer.current !== null) {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }
  pendingRef.current = null;
  setSettings(DEFAULT_SETTINGS);
  setStorageState("ok");
},
```

The Dexie-hydrate effect (L81-105) is untouched — reconciliation stays its job (stale mirror self-corrects on next save; planner may add hydrate-diff write per RESEARCH Open Question 2).

---

### `src/reader/ProgressHairline.tsx` (modified — ratio replaces N/M)

**Analog 1 — the D8-11 formula precedent:** `src/ingestion/library/LibraryRow.tsx` L71-77 (exact coordinate system to adopt):
```typescript
const total = useMemo(
  () => graphemeClusters(normalizeText(article), article.lang).length,
  [article],
);
const ratio = location ? Math.min(1, location.graphemeOffset / total) : 0;
```

**Analog 2 — the component's own ratio path** (ProgressHairline L43-53; the `page` branch is the bug POLISH-02 replaces):
```typescript
export function ProgressHairline({ progress, page }: ProgressHairlineProps) {
  const ratio = page
    ? page.total > 0
      ? page.current / page.total        // ← 1/1 → 100% on open; 1/2 → 50% at start
      : 0
    : Math.max(0, Math.min(1, progress ?? 0));   // ← ratio path stays
  return (
    <div className="progress-hairline" aria-hidden="true">
      <div
        className="progress-hairline-fill"
        style={{ transform: `scaleX(${ratio})`, transformOrigin: "left" }}
      />
    </div>
  );
}
```
Invariants to preserve byte-unchanged (Pitfall 10): `aria-hidden`, `transformOrigin: "left"`, no text node, no transition — pinned by `tests/e2e/progress.spec.ts` L51-79 + L133-154.

**Formula substrate (do NOT fork — REUSE-DO-NOT-FORK, anchor.ts L14-18):**
- `pageStartGlobalOffset(article, fragment)` — `src/pagination/anchor.ts` L59-72 (pure, D-05 coords)
- `graphemeLength(article)` — `src/content/normalizeText.ts` L109-111

Recommended: `ratio = total > 0 ? Math.min(1, pageStart / total) : 0` (13-RESEARCH Pattern 2 boundary table: 1-page open → 0%; page 1 → 0%; monotonic; last page < 100%).

---

### `src/reader/PaginatedSurface.tsx` (modified — compute the ratio)

**Analog:** itself — the substrate is already imported and used three times:

L474 (onAnchorChange effect):
```typescript
onAnchorChange?.(pageStartGlobalOffset(articleRef.current, p[currentPageIdx]!));
```
L551-556 (imperative handle):
```typescript
getCurrentAnchorOffset: () => {
  const p = pagesRef.current;
  const idx = currentPageIdxRef.current;
  if (!p || !p[idx]) return 0;
  return pageStartGlobalOffset(articleRef.current, p[idx]!);
},
```
L585 (the line POLISH-02 changes):
```typescript
<ProgressHairline page={{ current: currentPageIdx + 1, total: pages.length }} />
```
PageIndicator at L586 stays byte-unchanged ("N of M" — D-05). `graphemeLength(article)` is memoizable like LibraryRow's `total` (L71-74).

---

### `src/routes/ArticleView.tsx` (modified — header slim, metadata spot, back affordance)

**Analog:** itself. The header block to slim (L1528-1579, read in full): currently `<h1>` + `.meta` byline + optional book-context `.meta` + source link + `<TagEntry>` + Export-highlights button.

**What moves:** TagEntry (L1563-1566) to an article-top metadata spot rendered ONCE (out of the per-page pinned header). Its inert-at-mount discipline travels verbatim (`src/reader/TagEntry.tsx` L7-22: no autoFocus, no mount-time `.focus()` — grep-verified by open-every-fixture.spec.ts).

**Geometry guard (09-07 lesson — app.css L1012-1044, byte-unchanged cap):**
```css
.article-body.paginated-surface {
  grid-template-rows: minmax(auto, 25%) minmax(0, 1fr);
}
.article-body.paginated-surface > header {
  min-height: 0;
  overflow-y: auto;   /* TagEntry's ~103px form currently forces header scroll even at desktop */
}
```
The D13-13 acceptance bar: **no internal header scrolling at 360×640**. The 12-06 fixed-chrome precedent (app.css ~L2854, chapter nav `position: fixed` outside the grid flow) governs any article-start metadata spot that must not enter page-capacity math.

**effectiveMode machinery to preserve (T-04-15, L356-362):**
```typescript
const effectiveMode = sessionModeOverride ?? settings.readingMode;
const isPaginated = effectiveMode === "paginated";
```
Back-affordance mount: header start; `paginatedActive` gating at L1421/L1430 is the neighboring pattern.

---

### `src/reader/BackToLibrary.tsx` (new shared component) + `ReviewView.tsx` header

**Analog — the existing quiet nav button:** `src/ingestion/library/LibraryView.tsx` L202-210 (reuses `.article-export-highlights` quiet-button tokens + plain hash assignment):
```typescript
<button
  type="button"
  className="article-export-highlights"
  onClick={() => {
    window.location.hash = "#/review";
  }}
>
  Review highlights
</button>
```

**Router facts making `history.back()` + `#/` fallback safe** (`src/App.tsx`):
- L51-60 `parseHash`: unknown `#/` deep links map to `{ name: "list" }`
- L170-177 Gap-3 guard: only `#/`-prefixed hashes route; `location.hash = "#/"` is always a valid route-to-library
- ReviewView mount point: `src/routes/review/ReviewView.tsx` L320-323 (`<header className="review-header"><h1>Review highlights</h1></header>`)

Component anatomy follows the minimal-component discipline (header comment citing decisions, single responsibility, verbatim class hook — see `src/reader/PageIndicator.tsx` L1-11). Native `<button type="button">` = keyboard-reachable by construction. RESEARCH §Code Examples has the `hasAppHistory` sketch (Pitfall 7: deep-link with no in-app history must not exit the app).

---

### `src/ingestion/library/LibraryView.tsx` (+ siblings) (modified — bounded tidy)

**Analog:** itself — current section order (L191-332): `<main id="main">` → `<h1>Saved articles</h1>` → Review-highlights button → `<IngestControl />` → `.status` region → `<ContinueReadingStrip />` → `<LibrarySearch />` + `<TagFilter />` → `<ul className="library-list">` → RemoveConfirm/BookRemoveConfirm.

**Byte-stable anchors (Pitfall 8-5 — tidy must not break):**
- `<main id="main">` (skip-link target), `<h1>Saved articles</h1>` (e2e-asserted), `.status` live region copy, LibraryRow markup, the `#/` fallbacks at L297-302 / L321-327.
- Parallel-load cancelled-flag effect (L97-147) is the established load pattern — structure changes only, no new fetch logic.

---

### `src/app.css` (modified — dialog centering + header geometry + tidy tokens)

**Analog:** itself. The root-cause bug (D13-14) appears in FOUR centered modals — all read, all confirmed:

`dialog.highlight-popover` L1475-1476 (the reported bug; the comment at L1489-1490 documents the intended centering):
```css
dialog.highlight-popover {
  margin: 0;                     /* ← defeats UA margin:auto modal centering → top-left */
  ...
}
/* ... showModal()/close() toggle the reflected `open` attribute. Native
   <dialog> + showModal centers the element in the viewport ... */
```
Same `margin: 0` on: `dialog.wipe-confirm` L670, `dialog.library-remove-confirm` L2031, `dialog.import-preview` L2241 — fix all four (`margin: auto`, or `margin-inline: auto; margin-block: auto`) in one sweep (WHATWG-verified, 13-RESEARCH Pattern 3).

**DO NOT touch the intentional side sheets:** `dialog.settings-panel` L442-477 (anchored inline-end) and `dialog.annotations-drawer` (~L1699) — blanket `dialog { margin: auto }` breaks them (anti-pattern).

No-motion CSS discipline model (L877-885): ".progress-hairline-fill ... Intentionally NO transition/animation property." — any new tidy CSS follows the same token-only, zero-motion rule.

---

### `tests/e2e/polish/cold-load-no-snap.spec.ts` (new — SC#1)

**Analog:** `tests/e2e/progress.spec.ts` (read in full) — spec skeleton, wipe discipline, computed-style reads:
```typescript
test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/ (route) => ...PIXEL_SVG...);
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();  // + onerror/onblocked → resolve
    });
  });
});
```
Seeding precedent: raw Dexie `settings` put via `seedRows` (`_portability.ts` L191-225, used in round-trip.spec.ts L111-127 with distinctive non-default prefs — font "sans", size 22, theme "dark") + the mirror key via `page.addInitScript`/`evaluate`. The MutationObserver no-snap mechanism itself is new — use the RESEARCH §Code Examples sketch (records `data-theme`/`style` mutations on `documentElement` from navigation start; assert no default→persisted flip anywhere in the timeline, and the scrolling surface present from first ArticleView paint).

### `tests/e2e/polish/first-paint-progress.spec.ts` (new — SC#2 boundary)

**Analog:** `tests/e2e/progress.spec.ts` L81-131 — matrix-parsing + 12-08 settle-race discipline:
```typescript
const transform = await page
  .locator(".progress-hairline-fill")
  .evaluate((el) => getComputedStyle(el).transform);
const match = /matrix\(([\d.eE+-]+)/.exec(transform ?? "");
...
await expect.poll(async () => { ... }, { timeout: 5000, ... }).toBeGreaterThanOrEqual(0.9);
```
Boundary assertions: 1-page article → scaleX < 0.1 on open (was 100%); multi-page page-1 → near 0 (was 1/M). **No fixed sleeps for load-bearing assertions** (Pitfall 8).

### `tests/e2e/portability/core-flow-spine.spec.ts` (new — ACPT-06)

**Analog 1 — two-context machine A/B:** `tests/e2e/portability/round-trip.spec.ts` L85-107:
```typescript
const machineA = await browser.newContext();
const machineB = await browser.newContext();
...
const pageA = await machineA.newPage();
await prepareFreshPage(pageA);
const anchorAlpha = confidentHighlightOn(PASTE_ARTICLE);   // shipped resolver, no forked offsets
```
Truth path: `readRow`/`countRows`/`readAllRows` raw IndexedDB helpers (`_portability.ts` L105-176) for D13-09 byte-equality.

**Analog 2 — UI `.md` upload:** `tests/e2e/library/markdown-upload.spec.ts` L46-82 (`MARKDOWN_WITH_FRONTMATTER` — proven ING-06 threshold-clearing: ≥3 blocks, ≥500 chars, 5 confident offsets) + L156-174:
```typescript
const fileInput = page.locator("input#ingest-file");
await fileInput.setInputFiles({
  name: "calm-reading.md",
  mimeType: "text/markdown",
  buffer: Buffer.from(MARKDOWN_WITH_FRONTMATTER, "utf-8"),
});
await page.getByRole("button", { name: /add file/i }).click();
await page.waitForURL(/#\/article\/md-/, { timeout: 15_000 });
```

**Analog 3 — UI highlight creation:** `tests/e2e/annotations/capture-highlight.spec.ts` L41-73 (`_fixtures.ts` helpers: `openArticle`, `findFirstBlockWithText`, `selectRangeInBlock`, `announcementRegion`; toolbar → `mark.highlight` → "Highlight saved." announce).

**Analog 4 — export/import through Settings UI:** `_portability.ts` `openSettings` (L83-88), `bundleInput` (L96-98), `settingsStatus` (L91-93); round-trip.spec.ts header L22-32 documents the full download-capture → unzip → re-import flow. Plain `test(...)` inherits the 3-engine matrix from `playwright.config.ts` L7-11 (no per-project filtering — verified). Books excluded (D13-08; they have their own spec at round-trip.spec.ts ~L296).

### `tests/e2e/chrome/*.spec.ts` (new ×4)

**Analog:** `progress.spec.ts` computed-style/geometry evaluation pattern (`.evaluate(el => getComputedStyle(el)...)`) for header-geometry assertions at 360×640; existing library specs (`tests/e2e/library/browse-open.spec.ts`, `search-tag-filter.spec.ts`, `v1-regression.spec.ts`) stay byte-unchanged for the tidy; pagination corpus specs (`tests/e2e/pagination/`) stay green after header slimming (Pitfall 5). Dialog-centering: `locator.boundingBox()` centering-within-tolerance is the new mechanism (parameterized across the 4 modals × 3 engines). Back-nav: `history.back()` + deep-link `#/` fallback cases per Pitfall 7.

### `tests/unit/server/pdfTimeout.spec.ts` (new — D13-11 fake timers)

**Analog:** sibling `tests/unit/server/pdf-to-blocks.spec.ts` — imports + typed-refusal assertion (L11-26, L47-56):
```typescript
import { ... } from "../../../server/pdfToBlocks";
import { IngestionError } from "../../../server/errors";
...
/** Rejects with an IngestionError carrying exactly `reason`. */
async function refusalOf(name: string): Promise<string> {
  try {
    await pdfToBlocks(fixtureBytes(name));
  } catch (err) {
    expect(err).toBeInstanceOf(IngestionError);
    return (err as IngestionError).reason;
  }
  throw new Error(`expected ${name} to refuse; it resolved instead`);
}
```
Target under test: `server/pdfToBlocks.ts` L620-656 `withPdfDocument` — the `Promise.race` + `setTimeout(PDF_EXTRACTION_TIMEOUT_MS)` + `reject(new IngestionError("server-error", "PDF extraction timed out — the document was too complex to read safely."))` + `await pdf.loadingTask.destroy()` in the outer `finally`. Fake-timers precedent: `tests/component/PageTurnControls.test.tsx` L64 `vi.useFakeTimers({ shouldAdvanceTime: true })`. RESEARCH §Pattern 5 sketch: never-resolving op → `vi.advanceTimersByTimeAsync(PDF_EXTRACTION_TIMEOUT_MS)` → assert typed rejection + `destroy()` called. Zero production changes.

### `tests/unit/settings/mirror.test.ts` + `tests/unit/pagination/progress-formula.test.ts` (new — pure unit)

**Analog:** `pdf-to-blocks.spec.ts` vitest structure (describe/it, plain imports from `src/`); formula tests exercise `pageStartGlobalOffset` (anchor.ts L59-72) + `graphemeLength` (normalizeText.ts L109-111) directly — pure functions, jsdom-safe per anchor.ts L20-21 ("no DOM, no React, no side effects"). Boundary table from 13-RESEARCH Pattern 2 (1-page→0%, page1→0%, monotonic, clamp, total=0→0). Mirror tests cover read/write/clear/stale/invalid/quota-throw (Pitfalls 1/3/4).

### `.planning/phases/13-polish-and-acceptance/13-VERIFICATION.md` (record-sheet sections)

**Analog:** `.planning/milestones/v1.0-phases/06-prototype-acceptance/06-VERIFICATION.md` (Phase 6 acceptance ledger — findings-table shape, zero-blocker/major policy rows, role+name outcomes). Runbook content: `docs/ACCEPTANCE-PROTOCOL.md` as-documented (D13-04). D13-07: ACPT-05 stays unchecked until user-run NVDA+Firefox results land.

## Shared Patterns

### Header comment citing locked decisions (EVERY new/modified file)
Every source file read opens with a comment block naming the decisions/plans it implements (SettingsContext L1-27, applyTheme L1-25, anchor.ts L1-21, TagEntry L7-22, ProgressHairline L1-23, PaginatedSurface, NotePopover L1-51...). New files (`settingsMirror.ts`, `BackToLibrary.tsx`) must open the same way, citing D13-01/D13-15 etc.

### `.status` live region for any new user-facing copy
**Source:** `LibraryView.tsx` L215-226; `ReviewView.tsx` L328-346; `TagEntry.tsx` L149-158
```typescript
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  ...calm copy...
</div>
```
**Apply to:** any chrome-polish copy (back affordance announcements if any); calm DOC-06 voice, no jargon.

### Cancelled-flag async load (load effects)
**Source:** `SettingsContext.tsx` L81-105; `LibraryView.tsx` L97-147
```typescript
useEffect(() => {
  let cancelled = false;
  loadSomething().then((result) => {
    if (cancelled) return;
    ...
  });
  return () => { cancelled = true; };
}, []);
```
**Apply to:** any new mount effect (back-affordance history flag, metadata-spot mount).

### Pitfall 8 destructive-action isolation (single call sites)
**Source:** `SettingsContext.tsx` L194-207 (`resetLocalData` — only WipeConfirm calls it; `db.delete()` runs only in WipeConfirm.tsx). The mirror-clear joins `resetLocalData` as the single post-wipe seam. **Apply to:** mirror invalidation; do not add a second clear site.

### Zero-motion + token-only CSS discipline
**Source:** `app.css` L877-885 (`.progress-hairline-fill` — "Intentionally NO transition/animation property"); global reduced-motion gate. **Apply to:** all tidy CSS, hairline changes, dialog fixes — no transition property anywhere new.

### `expect.poll` end-condition polling (no fixed sleeps)
**Source:** `tests/e2e/progress.spec.ts` L119-131 (the 12-08 Rule 3 fix comment). **Apply to:** every new e2e spec (Pitfall 8: webkit goto timeouts + firefox rAF-throttle are the two known flake classes).

### REUSE-DO-NOT-FORK
**Source:** `_portability.ts` L4-14 (header), `anchor.ts` L14-18. **Apply to:** offsets via `pageStartGlobalOffset`/`graphemeLength` (never new accumulation walks), highlights via `confidentHighlightOn`, machine isolation via `browser.newContext()` + `prepareFreshPage` — the phase's key risk is forking shipped substrate (13-RESEARCH "Key insight").

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `index.html` inline script (the artifact itself) | config / entry script | request-response (pre-paint) | Repo has no inline-script precedent — index.html is a bare 12-line Vite shell. The **write discipline** has an exact analog (applyTheme.ts) and the RESEARCH sketch (§Pattern 1) is the spec; planner validates cross-engine inline-script ordering. |
| Dialog-centering e2e assertion (`boundingBox` tolerance) | test mechanism | geometry | No existing spec asserts viewport centering. Mechanism is standard Playwright (`locator.boundingBox()`); parameterize across the 4 modals × 3 engines. |
| `addInitScript` MutationObserver no-snap recorder | test mechanism | event-driven (mutation records) | New to the repo (only e2e init-script precedent is none found). RESEARCH §Code Examples sketch is the spec; `document.fonts`-style observer discipline from 02-03 scroll-spy is the nearest in-repo MutationObserver use. |

## Metadata

**Analog search scope:** `src/settings/`, `src/persistence/`, `src/reader/` (+ `annotations/`), `src/routes/` (+ `review/`), `src/ingestion/library/`, `src/pagination/`, `src/content/`, `server/`, `tests/e2e/` (portability, library, annotations, progress, pagination dir listing), `tests/unit/` (pagination, persistence, server dirs; component fake-timers grep), `index.html`, `playwright.config.ts`, `src/app.css` (6 targeted block reads + grep), `.planning/milestones/v1.0-phases/06-prototype-acceptance/` (existence check)
**Files scanned:** ~30 read or grep-verified at file:line granularity
**Pattern extraction date:** 2026-08-18
