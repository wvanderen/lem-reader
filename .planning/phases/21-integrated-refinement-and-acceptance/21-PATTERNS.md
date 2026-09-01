# Phase 21: Integrated Refinement and Acceptance - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 19 primary touchpoints (11 source modifications, 4 new test files, 3 extension families, 2 docs) + 7 pinned-cell updates enumerated
**Analogs found:** 19 / 19 (this is a closing phase — nearly every deliverable lands in a file that already ships, so the analog IS the file itself; new test files copy precedent specs)

**Phase shape (D21-09 order, load-bearing):** POLISH-08/09/10 fixes → POLISH-11 audit → D21-10 remediation → ACPT-07/08 acceptance → D21-15 lint + honest full-suite gate. Nothing installs. Every hard sub-problem already has shipped machinery — composition, not invention.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/settings/tokens.ts` | config (token constants) | transform (stepped value set) | itself — `SIZE_STEPS` sibling discipline (L31-32) | exact |
| `src/content/schema.ts` | model (Zod schema) | validation | itself — `readingMode` `.default()` migration precedent (L368-372) | exact |
| `src/persistence/settingsStore.ts` | service (Dexie read seam) | CRUD read | itself — `loadSettings` safeParse seam (L63) | exact |
| `src/settings/settingsMirror.ts` | utility (localStorage seam) | CRUD read | itself — `readSettingsMirror` (L39-51) | exact |
| `src/portability/ExportImportService.ts` (+ `bundle.ts`, `conflicts.ts`) | service (import parse seam) | batch (bundle transform) | itself — `ExportBundleSchema.safeParse` (L300) | exact |
| `index.html` (paint-hint script) | config (entry script) | transform | itself — measure write (L83-85) | exact |
| `src/reader/SettingsPanel.tsx` | component (slider) | event-driven | itself (L455-477) — **verify-only; likely NO change** (min/max/step/aria all derive from `MEASURE_STEPS` array ends) | exact |
| `src/app.css` | config (styles) | n/a | itself — `.tag-popover` (L1949-1959), `.review-*` (L3047-3243), `.library-row` (L2066) | exact |
| `src/reader/Header.tsx` | component (trigger) | event-driven | itself — `.tags-trigger` button + TagIcon (L341-359) | exact |
| `src/routes/ArticleView.tsx` | component (popover mount) | event-driven | itself — popover mount (L2621-2629), toggle seam (L391-419) | exact |
| `src/routes/review/ReviewView.tsx` | component (review rows) | event-driven | itself — row button (L242-259) + `LibraryRow.tsx` icon anatomy (L208-227) | exact |
| `src/portability/zipSlip.ts` | utility (guard) | transform | itself — L34/L76/L77 lint sites | exact |
| `tests/e2e/<tag-menu-geometry>.spec.ts` **(NEW)** | test (e2e, 3 engines) | request-response (geometry assertions) | `tests/e2e/chrome/tag-popover.spec.ts` + `tests/e2e/toc/toc-geometry.spec.ts` | exact |
| `tests/unit/settings/<measure-clamp>.test.ts` **(NEW)** | test (unit) | CRUD read transform | `tests/unit/settings/mirror.test.ts` + `tests/unit/settingsSchema.test.ts` | exact |
| `tests/e2e/<truthful-measure>.spec.ts` **(NEW or extension)** | test (e2e) | request-response | `tests/e2e/typography-live-apply.spec.ts` | exact |
| `tests/e2e/<v21-core-flow-spine>.spec.ts` **(NEW)** | test (e2e, two-context) | batch (export→wipe→import→byte-equal) | `tests/e2e/portability/core-flow-spine.spec.ts` (ACPT-06 precedent, 452 lines) | exact |
| edge specs: `forced-colors`/`reduced-motion`/`reflow`/`high-zoom`/`touch-targets` (extend) | test (e2e) | request-response | `tests/e2e/high-zoom.spec.ts` + `tests/e2e/_edge-invariant.ts` (D6-09) | exact |
| `tests/e2e/review-panel/*` (extend) | test (e2e) | request-response | `tests/e2e/review-panel/jump-bidirectional.spec.ts` | exact |
| `docs/ACCEPTANCE-PROTOCOL.md` (v1.2→v1.3) | docs (acceptance instrument) | n/a | itself — Flow table format (L135-150) | exact |
| `21-AUDIT-FINDINGS.md` **(NEW, phase artifact)** | docs (audit report) | n/a | **no code analog** — impeccable skill audit methodology + `deferred-items.md` discipline | none |

**Pinned-cell updates (Pitfall 3's legitimately-updating set — enumerate up front, cite D21-01/02/03, everything else byte-stable):**

| File | Line | Current pinned value |
|------|------|---------------------|
| `tests/unit/settingsSchema.test.ts` | L80, L249 | `[72, { measure: 72 }]` valid-union row + fixture |
| `tests/unit/settings/mirror.test.ts` | L34 | `NON_DEFAULT.measure: 72` |
| `tests/unit/storageFallback.test.ts` | L49 | `measure: 72` |
| `tests/component/SettingsContext.test.tsx` | L144 | `update({ size: 24, measure: 72, ... })` |
| `tests/e2e/polish/cold-load-no-snap.spec.ts` | L46 | seeded `measure: 72` |
| `tests/e2e/polish/first-paint-mode-surface.spec.ts` | L57 | seeded `measure: 72` |
| `tests/e2e/pagination/fixtures-matrix.ts` | L79 | typography-matrix cell `measure: 72` |

**Byte-stable, DO NOT TOUCH:** the 5 documented webkit Blob→IDB skip sites — `imagery/offline-reopen.spec.ts:122`, `portability/round-trip.spec.ts:998`, `portability/import-preview.spec.ts:532`, `epub-intake.spec.ts:1312`, `ingestion/happy-path.spec.ts:201`; plus `tests/unit/portability/zip-slip.test.ts` (regression net for D21-15).

---

## Pattern Assignments

### POLISH-09 wave — the truthful-measure evolution

#### `src/settings/tokens.ts` (config, transform)

**Analog:** itself; `SIZE_STEPS` is the sibling discipline.

**Core pattern** (lines 30-32):
```typescript
// D2-07 — stepped/discrete (arrow-key navigable, predictable, calm).
export const SIZE_STEPS = [16, 18, 20, 22, 24] as const; // px — index 1 (18) is the default
export const MEASURE_STEPS = [52, 58, 64, 72] as const; // ch — index 2 (64) is the default
```
D21-01/D21-02 evolve L32 to `[40, 46, 52, 58, 64]` (uniform step 6 preserved so `SettingsPanel.tsx` L464's `step={MEASURE_STEPS[1] - MEASURE_STEPS[0]}` arithmetic and L462-469's array-end-derived min/max/aria keep working untouched). Keep the trailing comment style explaining the default index.

#### `src/content/schema.ts` (model, validation)

**Analog:** itself — the `readingMode` `.default()` block is the project's value-shape-migration-at-the-boundary precedent.

**Core pattern** (lines 360-372):
```typescript
measure: z.union([
  z.literal(52),
  z.literal(58),
  z.literal(64),
  z.literal(72),
]),
...
// D4-12 — readingMode preference. ... .default("paginated") is the
// value-shape migration mechanism: a v1 row lacking this field parses with
// the default on read (Pitfall 9 — no data wipe, no migration script).
readingMode: z.enum(["paginated", "scrolling"]).default("paginated"),
```
Drop `z.literal(72)` and add the new lower literals (40/46 per the tokens change). **THE TRAP (Pitfall 1):** this edit alone routes every stored `measure: 72` row to `{ ok: false, reason: "corrupt" }` → WipeConfirm. It MUST ship in the same change as the pre-parse clamp at all three seams below.

#### `src/persistence/settingsStore.ts` (service, CRUD read — clamp seam 1)

**Analog:** itself. The clamp wraps `raw.value` BEFORE `safeParse` at L63:

**Core pattern** (lines 56-71):
```typescript
const raw = await db.settings.get(KEY);
if (!raw?.value) {
  return { ok: true, settings: DEFAULT_SETTINGS };
}
const parsed = ReaderSettingsSchema.safeParse(raw.value);
if (parsed.success) {
  return { ok: true, settings: parsed.data };
}
// Persisted record failed Zod validation. STATE-04 contract: never
// silently coerce a corrupt record. Route to WipeConfirm ...
return { ok: false, reason: "corrupt" };
```
Becomes `safeParse(clampLegacyMeasure(raw.value))`. Preserve the header-comment discipline: cite D21-03 and STATE-04 (the map contains exactly `{72: 64}` so arbitrary corruption STILL fails parse and surfaces).

#### `src/settings/settingsMirror.ts` (utility, CRUD read — clamp seam 2)

**Analog:** itself. Insert the same clamp ahead of the parse at L44:

**Core pattern** (lines 39-51):
```typescript
export function readSettingsMirror(): ReaderSettings | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_MIRROR_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    const parsed = ReaderSettingsSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```
Without the clamp, a mirror painted with 72 returns null → falls to Dexie (double work) and the paint hint paints a dead 72ch. Keep null-on-doubt for everything except the enumerated legacy value.

#### `src/portability/ExportImportService.ts` (+ `bundle.ts` L106, `conflicts.ts` L704) (service, batch — clamp seam 3)

**Analog:** itself — the import parse gate is a single choke point:

**Core pattern** (lines 282-309):
```typescript
let raw: unknown;
try {
  raw = JSON.parse(strFromU8(bundleBytes));
} catch { ... }
const peeked = (raw as { schemaVersion?: unknown }).schemaVersion;
if (typeof peeked === "number" && peeked > 4) { ... }

// 5. Full schema parse — ALL issues, not just the first (Pitfall 11 #2).
const parsed = ExportBundleSchema.safeParse(raw);
```
A v2.1-era exported bundle carrying `preferences.measure: 72` embeds `ReaderSettingsSchema` (`bundle.ts` L106) — after the union drops 72, an unclamped import would refuse the bundle outright. Apply `clampLegacyMeasure` to the raw preferences block before `ExportBundleSchema.safeParse` (the seam at L300); the downstream plan/write path (`conflicts.ts` L704 `plan.preferences = bundle.preferences` → `ExportImportService.ts` L519-520 `db.settings.put`) then flows through the normal Dexie read clamp on next load.

#### `index.html` (config, transform — paint-hint seam 4)

**Analog:** itself. The mirror's inline copy discipline is documented in its own comments (L23-27: marker comments are extraction anchors for the sync-check unit test — if tokens change, update in the same commit):

**Core pattern** (lines 83-85):
```javascript
if (typeof s.measure === "number" && isFinite(s.measure)) {
  r.style.setProperty("--measure", s.measure + "ch");
}
```
Add the same one-line `{72: 64}` map here (`var m = LEGACY[s.measure] ?? s.measure` shape per research) so first paint matches hydration — no 72ch flash-then-clamp. This script cannot import modules; the map is an inline copy like FONT_STACKS.

#### Where the clamp function lives

Create `clampLegacyMeasure` as an exported pure function (research sketch below; placement planner's call — natural home is `src/settings/` beside the tokens it maps):

```typescript
// Source: project precedent — 09-03 applyPreferencesDefault read-hydration
// (value-shape migration at the boundary, no store change) + STATE-04
// never-silently-coerce contract.
const LEGACY_MEASURE: Readonly<Record<number, number>> = { 72: 64 };
export function clampLegacyMeasure(raw: unknown): unknown { ... }
```
**Hard rule (research Anti-Patterns):** the map contains exactly `{72: 64}` — never clamp arbitrary out-of-range values (silently coerces real corruption; V5/STATE-04 must survive).

#### `src/reader/SettingsPanel.tsx` — verify-only

**Analog:** itself (lines 455-477). The slider derives everything from `MEASURE_STEPS` array ends: `min={MEASURE_STEPS[0]}`, `max={MEASURE_STEPS[MEASURE_STEPS.length - 1]}`, `step={MEASURE_STEPS[1] - MEASURE_STEPS[0]}`, plus matching `aria-valuemin/aria-valuemax`. D21-04 keeps the inline readout `Reading width <span className="settings-value">{settings.measure} ch</span>` exactly as shaped. After the tokens change, `aria-valuemax` becomes 64 automatically — the truthful-64 e2e asserts this agreement rather than new component code.

---

### POLISH-08 wave — tag-menu anchoring (CSS anchor positioning)

#### `src/app.css` — `.tag-popover` block (config, styles)

**Analog:** itself; replaced wholesale. Current state to correct (lines 1943-1959):
```css
.tag-popover {
  position: fixed;
  top: calc(48px + var(--space-xs));      /* ← anchored to the HEADER, not the trigger */
  inset-inline-end: var(--space-md);      /* ← DELETE both insets (Pitfall 2) */
  margin: 0;
  padding: var(--space-md);
  background: var(--surface-raised);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  width: min(420px, calc(100vw - 2 * var(--space-md)));
}
```
**Replacement shape** (probe-verified on this repo's pinned Playwright 1.61.1 engines — all 5 anchor features report supported × chromium/firefox/webkit; MDN Baseline 2026):
```css
.tags-trigger { anchor-name: --tags-trigger; }
.tag-popover {
  position: fixed;                     /* stays fixed; insets resolve vs the anchor */
  position-anchor: --tags-trigger;
  position-area: block-end span-inline-end;
  position-try-fallbacks: flip-block, flip-inline;
  inset: auto;                         /* kill UA popover insets (MDN conflict note) */
  margin: var(--space-xs);             /* the calm gap below the trigger */
  /* padding/border/background/radius/width cap unchanged */
}
```
Keep the existing comment block (L1943-1948) and update it: cite D21-05, the probe evidence, and the retained `popover="auto"` contract (top layer + light-dismiss + Esc). Zero motion properties — reduced-motion gate stays trivially satisfied (A11Y-06, already noted in the comment).

#### `src/reader/Header.tsx` (component, event-driven — the trigger)

**Analog:** itself. The trigger already carries `.tags-trigger` (styles at app.css L1926-1941); the fix adds only `anchor-name` to that CSS rule — **no JSX change expected**. Context — the trigger is the header button (anatomy reference at L275-283 for the gear twin):
```typescript
aria-haspopup="dialog"
aria-expanded={settingsOpen}
```
`anchor-name` is document-scoped, so the DOM split (trigger in Header, popover in ArticleView) is a non-issue.

#### `src/routes/ArticleView.tsx` (component, event-driven — the mount)

**Analog:** itself. The mount stays byte-stable; only its CSS class resolves differently:

**Popover mount** (lines 2621-2629):
```tsx
<div
  ref={tagPopoverRef}
  popover="auto"
  role="dialog"
  aria-label="Article tags"
  className="tag-popover"
>
  <TagEntry articleId={article.id} tags={article.tags ?? []} />
</div>
```
**Focus-restore seam already ships** (lines 391-419) — POLISH-08's focus clause needs only e2e assertion, not new code:
```tsx
useEffect(() => {
  const el = tagPopoverRef.current;
  if (!el) return;
  if (tagsOpen && !el.matches(":popover-open")) {
    tagsTriggerRef.current = document.activeElement as HTMLElement | null;
    el.showPopover();
  } else if (!tagsOpen && el.matches(":popover-open")) {
    el.hidePopover();
  }
}, [tagsOpen]);
// ... toggle event: newState === "closed" → onCloseTags() + tagsTriggerRef.current?.focus()
```
Do NOT touch `TocPanel` (`popover="manual"`) or the native dialogs — their contracts are locked (D21-05).

---

### POLISH-10 wave — Highlights visible affordance + token conformance

#### `src/routes/review/ReviewView.tsx` (component, event-driven)

**Analog:** itself (row button) + `LibraryRow.tsx` (icon anatomy). The row button D21-06 extends (lines 242-259):
```tsx
<button
  type="button"
  className="review-row"
  aria-label={ariaLabel}          // "Go to highlight: …" — stays the SR contract
  disabled={isUnresolved}
  aria-disabled={isUnresolved ? "true" : undefined}
  onClick={() => {
    if (jumpable) {
      window.location.hash = `#/article/${entry.highlight.articleId}/h/${entry.highlight.id}`;
    }
  }}
>
  {content}
</button>
```
Add the quiet open-in-reader glyph INSIDE the row button (an SVG is non-interactive content — legal inside a button). Row semantics, ambiguous/orphan disabled rules (L224-233), and orphan-tail shape stay unchanged.

**Icon anatomy to clone** — `LibraryRow.tsx` EditIcon (lines 202-227; TrashIcon L168-200 is the twin):
```tsx
function EditIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
```
Anatomy contract (mirrored across Header Gear/Highlighter/Tag/Contents icons and LibraryRow Trash/Edit): 20×20 box, viewBox 24, `currentColor` stroke, strokeWidth 1.75, round caps/joins, `aria-hidden` + `focusable="false"`, doc comment citing the mirrored precedent. No new color tokens. (Header.tsx L289-386 has four more clones if a different glyph shape fits better.)

#### `src/app.css` — `.review-*` conformance (config, styles)

**Analog:** `.library-row` family + the `.review-select` citation-comment precedent. The diagnosis table (research §Pattern 3, verified against source):

| Rule | Library counterpart | Action |
|---|---|---|
| `.review-header/-filter-row/-legend/-section` all `max-width: 1100px; margin-inline: auto` (L3047-3101) | `.library-list` family identical | **Conforms** — no change |
| `.review-row` `padding: var(--space-md)` (L3132) | `.library-row`/`.book-row` `padding: var(--space-lg)` (L2066-2067, L3260-3261) | Conform to `--space-lg` OR cite row-density difference (D21-07 planner call) |
| `.review-section-list` single column, `gap: var(--space-sm)` (L3114-3120) | `.library-list` 2/3-col responsive grid @640/1024 | **Legitimate anatomy difference** (D21-07) — citation comment |
| `.review-section h2` `font-size: 20px` (L3104) | Library h2 register | Verify-then-conform-or-cite during implementation |
| `.review-select` 16px (L3079-3082) | — | **Keep** — already citation-commented |

**Citation-comment format to copy** (app.css L3079-3082, the POLISH-07 D15-03 precedent D21-07 reuses):
```css
/* POLISH-07 (D15-03) intentional difference: 16px form-control register
   (the .settings-row / .import-preview select / dialog-button register) —
   NOT drift from the 14px Label chrome register; do not "fix" to 14px. */
font-size: 16px;
```
New intentional differences get the same shape with their decision citation (e.g. "D21-07 intentional difference: …").

---

### D21-15 — zipSlip lint fixes

#### `src/portability/zipSlip.ts` (utility, transform)

**Analog:** itself. The 3 reproduced errors (verified `npx eslint` this research):

L34 and L76 — the control-char regexes ARE the guard's purpose:
```typescript
if (/[\0-\x1f]/.test(rawName)) return false;          // L34 — no-control-regex
...
.replace(/[\0-\x1f]/g, "")                             // L76 — no-control-regex
```
Fix: `eslint-disable-next-line no-control-regex` with a justification comment (the escape sequences are the payload, not an accident — Pitfall 11 #6).

L77 — behavior-identical escape removal (preferred over a disable):
```typescript
.replace(/[\/\\<>:"|?*]/g, "")   // L77 — no-useless-escape ("/" needs no escape in a class)
```
Fix: `.replace(/[\\<>:"|?*]/g, "")`. Regression net `tests/unit/portability/zip-slip.test.ts` + `tests/e2e/portability/zip-slip-regression.spec.ts` stay green/byte-stable.

---

### New test files

#### `tests/e2e/<tag-menu-geometry>.spec.ts` (NEW — POLISH-08)

**Analog:** `tests/e2e/chrome/tag-popover.spec.ts` (copy its harness + close-path assertions wholesale).

**Harness/imports pattern** (tag-popover.spec.ts L22-32, 60-64):
```typescript
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { makeArticle, prepareFreshPage, seedRows } from "../portability/_portability";
const BASE = "http://localhost:5173";

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);   // image-stub + app-boot + clear-stores (NOT deleteDatabase)
});
```

**Focus-restore assertion with the documented webkit divergence** (tag-popover.spec.ts L108-132 — the D18-04 engine-honesty precedent):
```typescript
async function expectFocusOnTrigger(page: Page): Promise<void> {
  const browserName = test.info().project.name;
  if (browserName === "webkit") {
    // weaker but meaningful: focus is not trapped in the closed surface
    ...
    return;
  }
  await expect.poll(() =>
    page.evaluate(() => document.activeElement === document.querySelector(".tags-trigger")),
  ).toBe(true);
}
```

**New geometry cells this spec adds** (per research §Validation): adjacency (popover opens below the trigger, not the header's inline-end corner), resize-follow (e.g. 800→360 re-resolves adjacent with zero JS), viewport-keep at ~240px (fallbacks flip), Esc/light-dismiss + focus restore. Geometry assertions use `boundingBox()` math on `.tag-popover` vs the trigger's `.tags-trigger` box (L198-205 shows the boundingBox precedent). Waits: expect/expect.poll/waitForFunction only — zero fixed sleeps (file convention, L19-21).

#### `tests/unit/settings/<measure-clamp>.test.ts` (NEW — POLISH-09)

**Analog:** `tests/unit/settings/mirror.test.ts` (jsdom + seam-discipline structure) + `tests/unit/settingsSchema.test.ts` (valid/invalid union tables).

**Fixture pattern** (mirror.test.ts L30-38 — note this NON_DEFAULT currently uses `measure: 72`, a legitimately-updating pinned cell):
```typescript
const NON_DEFAULT: ReaderSettings = {
  schemaVersion: 2,
  font: "sans",
  size: 22,
  measure: 72,        // → update to 64 (or a truthy non-default like 58) per D21-01
  spacing: "spacious",
  theme: "dark",
  readingMode: "scrolling",
};
```
Cells to author: a stored-72 Dexie row loads calmly at 64 with every other field intact (all three seams); a garbage measure (e.g. 71, "64", null) STILL fails parse → corrupt/null per seam contract; the index.html paint-hint map matches the module map (extend the existing marker-comment sync-check pattern, index.html L26-27).

#### `tests/e2e/<truthful-measure>.spec.ts` or `typography-live-apply.spec.ts` extension (NEW cells — POLISH-09 truth)

**Analog:** `tests/e2e/typography-live-apply.spec.ts` (the slider-driven live-apply substrate). The ruler cell (research §Code Examples):
```typescript
const ruler = await page.evaluate(() => {
  const el = document.querySelector(".article-body")!;
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  probe.textContent = "0".repeat(64);
  el.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return { ruler: w, body: el.getBoundingClientRect().width };
});
expect(Math.abs(ruler.ruler - ruler.body)).toBeLessThanOrEqual(1);
```
Assert on BOTH surfaces: `.article-body` scrolling (`max-width: var(--measure)`, app.css L263) AND `.article-body.paginated-surface` (`width: var(--measure)`, L1100), slider at far-right, plus `aria-valuemax="64"` and readout "Reading width 64 ch" agreement. **Pitfall 4:** `ch` = the "0"-glyph advance (css-values-4) — measure the 64-"0" ruler, never count prose characters.

#### `tests/e2e/<v21-core-flow-spine>.spec.ts` (NEW — ACPT-07, D21-13)

**Analog:** `tests/e2e/portability/core-flow-spine.spec.ts` — the ACPT-06 twin, copy its shape wholesale.

**Two-context journey skeleton** (core-flow-spine.spec.ts L101-118):
```typescript
test("ACPT-07 — v2.1 core flow: nothing lost across machines", async ({ browser }) => {
  test.setTimeout(90_000); // one unbroken journey per engine; planner may extend
  const machineA = await browser.newContext();
  const machineB = await browser.newContext();
  try {
    const pageA = await machineA.newPage();
    await prepareFreshPage(pageA);
    await openAddDialog(pageA);
    await pickSource(pageA, "file");
    ...
```

**Helper inventory to compose (REUSE-DO-NOT-FORK)** — all shipped, all verified:
- `tests/e2e/portability/_portability.ts`: `prepareFreshPage` (L50), `readRow` (L114), `readAllRows` (L164), `seedRows` (L212), `makeArticle` (L278), `confidentHighlightOn` (L307), `buildBundleZip` (L356), `readBundleJson` (L372)
- `tests/e2e/annotations/_fixtures.ts`: `selectRangeBetweenBlocks` (L619 — the Phase 19 cross-block selection driver), `findFirstBlockWithText`, `selectRangeInBlock`, `countHighlightsInDexie`, `announcementRegion`, `wipeDatabase`, `openArticle`, `switchMode`, `FIXTURES`
- `tests/e2e/library/add-dialog.ts`: `openAddDialog` (L26), `pickSource` (L39)
- `tests/e2e/library/markdown-payload.ts`: `MARKDOWN_WITH_FRONTMATTER` (import from the non-spec helper — NEVER from a .spec module; the L49-63 comment documents why both spec-import forms were rejected)
- The `paginationDev` `__lemPagination` DEV-hook reader (core-flow-spine.spec.ts L84-99) for page-count identity

**Journey arms (D21-13):** seed → organize via views/filters (reading-views + search-tag-filter machinery) → add content through the Add dialog → edit metadata (metadata-edit precedent) → navigate by TOC (`tests/e2e/toc/` machinery) → cross-block highlight via `selectRangeBetweenBlocks` → review it (route to Highlights, row jump back) → export with images (download capture + Node-side `readBundleJson`) → wipe → import through ImportPreviewDialog → byte-equal restoration (`readAllRows`/`readRow` raw-row equality, extended to asset rows on chromium/firefox). Images arm needs a REAL ingestion that writes Blob asset rows (fixture-registry images don't travel through export — research A4).

**Webkit skip pattern for the image cells** (offline-reopen.spec.ts L122-125 — cite the same ledger, add the spine's own skip in this shape):
```typescript
test.skip(
  browserName === "webkit",
  "WebKit cannot store Blob values in IndexedDB (deferred-items.md) — persisted-asset seeding is engine-skipped",
);
```

#### Edge-spec extensions (ACPT-08 automated arms)

**Analog:** `tests/e2e/high-zoom.spec.ts` structure + `tests/e2e/_edge-invariant.ts` (D6-09 helper — extend, never fork).

**Extension loop pattern** (high-zoom.spec.ts L41-69):
```typescript
test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
  await page.setViewportSize(REFLOW_VIEWPORT);
});
for (const fixture of FIXTURES) {
  test.describe(`high-zoom @ ${fixture}`, () => {
    test("...shared invariant holds...", async ({ page }) => {
      await openArticle(page, fixture);
      await assertEdgeInvariant(page, { fixture, condition: ZOOM_LABEL });
```
Design point (research Open Question 2): `assertEdgeInvariant`'s (a) clause is article-scoped; (b)/(c) are destination-neutral. Recommended extension shape: a destination-agnostic wrapper asserting (b)+(c) at Library, Highlights, Add-dialog, and Reader destinations, keeping (a) reader-scoped — strengthen-only, no existing assertion removed. Keyboard/panel coverage extends `panel-keyboard.spec.ts` + the ADD-04 Add-dialog focus cells rather than forking.

#### `tests/e2e/review-panel/*` extension (POLISH-10)

**Analog:** `tests/e2e/review-panel/jump-bidirectional.spec.ts` — harness discipline header (L34-45: wipeDatabase + app load before seedRows; seed rows built through `ArticleSchema` + shipped derive/resolve machinery so they re-resolve confident; retry-assert via `expect(async …).toPass`, never fixed sleeps). New cells assert the visible glyph (role/name state of the row button unchanged; glyph present inside confident rows, absent/disabled rules intact on orphan + ambiguous rows).

---

### Docs

#### `docs/ACCEPTANCE-PROTOCOL.md` v1.2 → v1.3 (D21-14)

**Analog:** itself. Growth points against the existing structure (§1 Matrix L42, §2 Authoring L90, §3 Flows L113-311, §4 Charters L313, §5 Severity L369, §6 Results L410, §7 Re-run L432):

**Flow authoring format to copy** (Flow A, L140-146):
```markdown
| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| A1 | From the fixture list, **Tab** to an article link ... | Navigation occurs; the article view mounts. The page exposes a **heading level 1** ... |
```
New capability flows (library views/filters, Add dialog — retiring the Phase-16 deferral, metadata edit, TOC navigation, cross-block highlight + review, images) each get a Goal + table + Pass criterion in this exact format, target ~8-10 scripted flows per SR engine total. Pitfall 7 discipline: outcomes are role + accessible name + state, never verbatim SR phrasing. Bump header Version to 1.3; update the results-record location from `06-VERIFICATION.md` to the Phase 21 verification artifact; keep the D6-08 re-run contract intact.

#### `21-AUDIT-FINDINGS.md` (NEW phase artifact — POLISH-11)

**No code analog** — see "No Analog Found". Structure: the impeccable audit's 5 dimensions × 0-4 scores, findings table with P0-P3 → blocker/major/minor mapping (D21-10), opening "Anti-Patterns Verdict" section, per-finding remediation status, and the remediation gate (native semantics preserved; reduced-motion/forced-colors/zoom/SR behavior never weakened; all suites stay green — Pitfall 6).

---

## Shared Patterns

### Zod-at-read trust boundary (apply to every POLISH-09 seam)

**Source:** `src/persistence/settingsStore.ts` L63-71 (the canonical form), mirrored in `settingsMirror.ts` L44 and `ExportImportService.ts` L300.

The schema is THE trust boundary; the clamp is a bounded legacy-value map applied to the raw record BEFORE `safeParse` — never a widened union, never a post-parse coercion. Only the enumerated `{72: 64}` value bypasses failure; everything else still refuses/classifies (STATE-04, V5). Unit-test all seams: 72 loads calmly at 64; garbage still surfaces.

### Toggle-event close seam + focus restore (apply to any popover work)

**Source:** `src/routes/ArticleView.tsx` L391-419.

One seam for every close path (programmatic, light-dismiss, Esc): the native `toggle` event with `newState === "closed"` → state sync + `tagsTriggerRef.current?.focus()`. Trigger captured on open BEFORE `showPopover()`. Already shipped — POLISH-08 only asserts it.

### Inline-SVG icon anatomy (apply to the POLISH-10 glyph)

**Source:** `src/reader/Header.tsx` L289-386 (Gear/Highlighter/Tag/Contents), `src/ingestion/library/LibraryRow.tsx` L168-227 (Trash/Edit).

20×20, viewBox 24, `fill="none"`, `stroke="currentColor"`, strokeWidth 1.75, round caps/joins, `aria-hidden` + `focusable="false"` (the parent's aria-label carries the name), doc comment citing the mirrored precedent. No new color tokens; forced-colors-safe by construction.

### Citation-comment discipline for intentional differences (apply to all POLISH-10/D21-07 conformance calls)

**Source:** `src/app.css` L3079-3082 (`.review-select` 16px register), L258-261 (Reader 64ch measure).

Format: `/* POLISH-07 (Dxxx-yy) intentional difference: <what> — NOT drift from <shared rule>; do not "fix" it to <value>. */` Every deviation is conform-or-cite; nothing silent.

### Webkit engine-skip documentation pattern (apply to the spine's image cells)

**Source:** `tests/e2e/imagery/offline-reopen.spec.ts` L117-125.

`test.skip(browserName === "webkit", "<probe-verified root cause> (deferred-items.md) — <what chromium+firefox still prove>")`. The 5 existing sites stay byte-stable; new skips cite the same ledger.

### Honest-gate + strengthen-only discipline (apply to the whole phase)

Every `npm run test` invocation recorded (red runs included, webkit-starvation classification per Pitfall 5: fresh dev server, `workers: 3`, isolation-green re-runs = environment); `npm run lint` joins the gate (D21-15). No existing assertion is removed to make new cells pass — only the enumerated pinned cells (table above) update, each with its decision citation; the 5 webkit skip sites and `zip-slip.test.ts` stay byte-stable. Phase ordering is locked by D21-09: fixes → audit → remediation → acceptance.

### Playwright harness conventions (apply to all new/extended specs)

**Source:** `tests/e2e/portability/_portability.ts` + spec headers.

- `prepareFreshPage` (clear-stores, NEVER `deleteDatabase` — races the live Dexie connection); `wipeDatabase` + one app load before `seedRows` where full wipe is needed
- Waits: `expect`/`expect.poll`/`waitForFunction` only — zero fixed sleeps
- Real-UI driving only for flow steps (no DEV hooks except the committed `__lemPagination` pagination reader)
- Import helpers from non-spec modules (`_portability.ts`, `_fixtures.ts`, `add-dialog.ts`, `markdown-payload.ts`) — never from `.spec` files (the core-flow-spine L49-63 comment documents the rejected alternatives)

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `21-AUDIT-FINDINGS.md` (phase artifact) | docs | n/a | No existing audit-findings doc in the repo; methodology comes from the `impeccable` skill's audit reference (5 dimensions × 0-4, P0-P3) mapped onto D21-10's blocker/major/minor policy — planner authors the format |
| CSS anchor positioning declarations | config (styles) | n/a | No anchor-positioned element exists in the codebase yet — this is the first. The pattern is new platform CSS, probe-verified on the project's exact engine matrix (research §Pattern 1); copy the research's replacement shape, not a codebase file |

## Metadata

**Analog search scope:** `src/` (settings, persistence, content, portability, reader, routes/review, ingestion/library), `tests/e2e/` (chrome, portability, annotations, library, review-panel, imagery, polish, edge specs, `_edge-invariant.ts`), `tests/unit/` (settings, portability, storageFallback), `tests/component/`, `docs/ACCEPTANCE-PROTOCOL.md`, `index.html`, `src/app.css` (targeted blocks)
**Files scanned:** ~35 (all read with line-level citations; large files via targeted ranges)
**Pinned-cell enumeration:** `rg 'measure: 72|valuemax.*72'` over tests/ — 7 files listed above
**Pattern extraction date:** 2026-08-31
