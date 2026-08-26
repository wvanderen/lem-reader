# Phase 15: Application Shell and Destinations - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** 11 (7 modified, 4 created)
**Analogs found:** 11 / 11 (every file rides an existing seam; the session-restore module is a composite of two role-match analogs)

> Zero new packages, zero Dexie changes. This phase's risk is breaking locked
> contracts — every pattern below is shipped, spec-covered code to copy verbatim
> in shape. Cross-reference 15-RESEARCH.md Patterns 1–5 and Pitfalls 1–10.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/App.tsx` (modify) | route (hash router) | request-response (route dispatch) | itself — `parseHash` L50-83, `switchLibraryView` L264-268, `onHash` L218-228 | exact (in-place extension) |
| `src/reader/Header.tsx` (modify) | component (shell chrome) | request-response | itself L93-167 + `LibraryView.tsx` view-switcher L431-464 (links-in-nav + aria-current) | exact |
| `src/ingestion/library/LibraryView.tsx` (modify) | component (destination view) | CRUD (Dexie load) + event-driven (restore) | itself L138-204 (focus effects) + `useScrollSave.ts` (capture discipline) | exact |
| `src/routes/review/ReviewView.tsx` (modify) | component (destination view) | CRUD | itself — rename-only pass L294-298, L344-358 | exact |
| `src/app.css` (modify) | config (authored styles) | declarative | `.view-switcher` L2058-2078 + `.visually-hidden` L154-161 + `.app-header` L392-412 | exact |
| `src/ingestion/library/librarySession.ts` (NEW) | utility (session store seam) | in-memory capture/restore | `readingState.ts` (pure-module seam) + `restoreLocation.ts` (clamp/degrade) | role-match (composite) |
| `tests/component/App.test.tsx` (modify) | test (unit) | n/a | itself — `parseHash` describe L51-128 | exact |
| `tests/unit/library/library-session.test.ts` (NEW) | test (unit) | n/a | `tests/unit/library/reading-state.test.ts` | exact-structural |
| `tests/e2e/chrome/shell-nav.spec.ts` (NEW) | test (e2e) | n/a | `route-entry.spec.ts` (nav/gating) + `header-geometry.spec.ts` (320px row assertion) | exact-structural |
| `tests/e2e/library/library-restore.spec.ts` (NEW) | test (e2e) | n/a | `reading-views.spec.ts` (matrix + seeding harness) | exact-structural |
| ~10 e2e specs pinning "Review highlights"/`#/review` (modify) | test (e2e update pass) | n/a | `route-entry.spec.ts` rename pattern | exact |

**Referenced-but-unchanged:** `src/reader/BackToLibrary.tsx` (D15-04 keeps it; contract at L35-51), `src/ingestion/library/pageMeta.ts` (Highlights retitles THROUGH it — no edit unless copy moves).

## Pattern Assignments

### `src/App.tsx` (route, request-response)

**Analog:** itself — the grammar, alias, and wiring all extend shipped seams.

**parseHash grammar — alias lands here** (lines 50-83; current `#/review` arm at L65-67):
```typescript
function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)(?:\/h\/([^/]+))?$/.exec(
    window.location.hash,
  );
  if (m) {
    return { name: "article", id: m[1] as string, jumpHighlightId: m[2] };
  }
  if (window.location.hash === "#/review") {
    return { name: "review" };
  }
  // ... closed literal allowlist for view segments, then:
  return { name: "list", view: "all" };
}
```
Grammar order stays: article regex → `#/highlights` → `#/review` alias → view segments → All fallback (D14-16 discipline; `#/review/x` still falls through to All — pinned by App.test.tsx L124-127).

**replaceState + DIRECT setView pairing — the alias mirror** (lines 264-268):
```typescript
const switchLibraryView = (next: LibraryViewName) => {
  if (view.name === "list" && view.view === next) return;
  history.replaceState(null, "", VIEW_HREFS[next]);  // fires NO hashchange
  setView(parseHash());                               // load-bearing direct update
};
```
The `#/review` → `#/highlights` normalization copies this EXACTLY: `history.replaceState(null, "", "#/highlights")` with a constant href (T-14-04 same-origin by construction) paired with the direct `setView(parseHash())` already in `onHash`. NEVER `location.hash = "#/highlights"` (fires a second hashchange — Pitfall 2) and NEVER `pushState` (corrupts Back-count semantics — RESEARCH anti-pattern).

**onHash + hasAppHistory** (lines 218-228) — the alias normalization composes INSIDE this handler, after the Gap-3 fragment guard:
```typescript
const onHash = () => {
  const hash = window.location.hash;
  if (hash !== "" && !hash.startsWith("#/")) return;
  setHasAppHistory(true);
  setView(parseHash());
};
```

**Constant href table** (lines 89-94) — extend with `"#/highlights"`; never interpolate:
```typescript
const VIEW_HREFS: Record<LibraryViewName, string> = {
  all: "#/",
  unread: "#/unread",
  "in-progress": "#/in-progress",
  finished: "#/finished",
};
```

**Header wiring site** (lines 273-283) — the new `destination` prop derives from `view` here (App derives, Header stays presentational); `articleMounted={view.name === "article"}` (L277) already exists. Also the mount site for `history.scrollRestoration = "manual"` (Pitfall 3 — once, early; grep-confirmed currently unset).

---

### `src/reader/Header.tsx` (component, request-response)

**Analog:** itself + the LibraryView view-switcher link pattern.

**Wordmark → brand link** (line 94 today):
```typescript
<span className="app-wordmark">Lem Reader</span>
// becomes <a className="app-wordmark" href="#/">Lem Reader</a>
```
Accessible name = text (D15-10 — no aria-label, no "home" suffix). Fixed literal `href="#/"` (D15-05). Update the stale comment at L6-7 ("Wordmark is a <span>, NOT a link") and app.css L411 in the same commit.

**articleMounted gating — ModeToggle joins** (lines 113-124 tags, 132-152 annotations; ModeToggle currently UNGATED at L153):
```typescript
{articleMounted && (
  <button
    type="button"
    className="tags-trigger"
    onClick={onToggleTags}
    aria-label="Article tags"
    aria-haspopup="dialog"
    aria-expanded={tagsOpen}
  >
    <TagIcon aria-hidden="true" />
  </button>
)}
```
Wrap `<ModeToggle mode={settings.readingMode} onToggle={onToggleMode} />` (L153) in the same `{articleMounted && …}` guard → header reads `[tags][annotations][mode][gear]` in Reader (D15-15). The gear button (L154-167) stays ungated (D15-16).

**Destination nav shape** — mirror the view-switcher (LibraryView.tsx L431-464, excerpt below under LibraryView). Placement: inline-start beside the brand, inside `.app-header` before `.header-controls` (D15-01). Plain `<a>` links — NO onClick interception (hash assignment pushes a history entry, which IS the desired Back semantics for destination navigation; modified clicks fall through natively). New `destination` prop threads from App.

---

### `src/ingestion/library/LibraryView.tsx` (component, CRUD + event-driven restore)

**Analog:** itself (focus/state/load seams) + `useScrollSave.ts` (capture-on-leave).

**view-switcher nav — the shell-nav mirror** (lines 431-464):
```typescript
<nav className="view-switcher" aria-label="Library views">
  {VIEW_LINKS.map(({ view: linkView, href, label }) => (
    <a
      key={linkView}
      href={href}
      aria-current={view === linkView ? "page" : undefined}
      onClick={(e) => {
        // Unmodified left clicks only (D14-13): middle/cmd/ctrl/
        // shift/alt fall through to native fragment navigation.
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        e.preventDefault();
        onSwitchView(linkView);
      }}
    >
      {status === "ready"
        ? `${label} (${linkView === "all" ? allCount : stateCounts[linkView]})`
        : label}
    </a>
  ))}
</nav>
```
The shell nav reuses `aria-current={active ? "page" : undefined}` exactly (D15-09: Library link only, NEVER the brand) but drops the interception. TWO `<nav>` landmarks in the document require DISTINCT labels — shell nav gets e.g. `aria-label="Primary"` (discretion; must differ from "Library views").

**VIEW_LINKS constant table** (lines 97-106) — the shell-nav link table copies this shape:
```typescript
const VIEW_LINKS: ReadonlyArray<{
  view: LibraryViewName;
  href: string;
  label: string;
}> = [
  { view: "all", href: "#/", label: "All" },
  // ...
];
```

**Focus substrate the row-restore extends** (lines 138-145 refs; 180-184 mount effect; 198-204 view-switch effect):
```typescript
useEffect(() => {
  setDocumentTitle("Saved articles");
  if (warmMount) h1Ref.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
}, [],);

useEffect(() => {
  const prev = lastViewRef.current;
  lastViewRef.current = view;
  if (prev === null) return; // the mount run
  if (prev === view) return; // StrictMode twin — same view, not a switch
  h1Ref.current?.focus();
}, [view]);
```
Row-focus restore PREEMPTS the mount-effect h1 focus (most-specific target wins — D14-05 layering). Preserve the `lastViewRef` previous-value comparison (Pitfall 8: booleans are not StrictMode-safe). The L193-197 comment pins h1 `focus()` WITHOUT preventScroll (reset-to-list-top) — row restore deliberately differs; the plan must pin the scroll/focus ordering (RESEARCH Pitfall 5).

**Restore state to capture** (lines 148-149):
```typescript
const [query, setQuery] = useState("");
const [activeTag, setActiveTag] = useState<string | null>(null);
```
Initialize via lazy `useState(() => peekLibraryContext()…)` initializers; write the snapshot on change + unmount cleanup (DOM still mounted at cleanup — `window.scrollY` is valid).

**Load gate for scroll/row restore** (lines 222-272, `Promise.all` → `setStatus("ready")`): restore scroll + row focus ONLY in the post-ready path (Pitfall 4 — `scrollTo` clamps to zero height before rows paint).

**D10-02 button fate** (lines 388-396) — the in-page "Review highlights" button; RESEARCH Open Question Q1 recommends REMOVE (shell link replaces it); whatever the planner picks, `route-entry.spec.ts (a)` updates in the same commit:
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

---

### `src/routes/review/ReviewView.tsx` (component, CRUD)

**Analog:** itself — rename-only pass.

**Title + warm-gated focus** (lines 294-298):
```typescript
useEffect(() => {
  setDocumentTitle("Review highlights");
  if (hasAppHistory) h1Ref.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
}, [],);
```
Becomes `setDocumentTitle("Highlights")` — the suffix/separator live ONLY inside the helper (D14-02; title renders "Highlights — Lem Reader").

**review-header render** (lines 346-357):
```typescript
<header className="review-header">
  <BackToLibrary hasAppHistory={hasAppHistory} />
  <h1 ref={h1Ref} tabIndex={-1}>
    Review highlights
  </h1>
</header>
```
h1 text → "Highlights"; `tabIndex={-1}` + ref stay. BackToLibrary mount is unchanged (D15-04).

---

### `src/ingestion/library/librarySession.ts` (NEW — utility, session store seam)

**Analog 1 — pure-module discipline:** `src/ingestion/library/readingState.ts` header (lines 1-9):
```typescript
// Plan 14-01 Task 1 — PURE reading-state policy (D14-20: ONE derivation
// owned by ONE module). ... zero new measurement, zero React usage, zero
// Dexie queries of its own (the store-seam discipline this file mirrors
// from bookProgress.ts: components own the reads, this module owns the
// algebra).
```
Copy: module-level singleton snapshot + pure comparators; NO React imports, NO Dexie imports (D15-12). jsdom-unit-testable. Recommended API from RESEARCH §Code Examples: `captureLibraryContext(ctx)`, `peekLibraryContext()`, pure `viewMatches(landing, captured)`, `clampScroll(saved, listHeight)`.

**Analog 2 — clamp/degrade-calmly:** `src/reader/restoreLocation.ts` `findScrollTarget` (lines 123-146):
```typescript
export function findScrollTarget(
  article: CanonicalArticle,
  blocks: HTMLElement[],
  offset: number,
): HTMLElement | null {
  if (blocks.length === 0) return null;
  let consumed = 0;
  let last: HTMLElement | null = null;
  for (const el of blocks) {
    last = el;
    const len = elementGraphemeLength(article, el);
    if (offset <= consumed + len) {
      return el;
    }
    consumed += len + BLOCK_SEPARATOR.length;
  }
  // Offset overshoots the article's total length — clamp to the last block.
  // This is the "corpus changed since save" fallback ... defensive clamp
  // keeps restore calm under any drift.
  return last;
}
```
The library twin: `clampScroll(saved, listHeight)` clamps to bottom; vanished row → caller falls back to h1 (D14-05 default); view mismatch → filters apply, scroll/focus reset (D15-14). "Never restore something that isn't true."

**Capture-on-leave timing analog:** `src/reader/useScrollSave.ts` — refs hold live values so rewrites are idempotent (L76-82 `optionsRef`/`articleRef`), cleanup clears pending state (L188-196); `HEADER_PX = 48` (L41) documents the header-height constant discipline the 48px geometry depends on (D15-01).

---

### `src/app.css` (config, declarative)

**Analog:** `.view-switcher` block (lines 2058-2078) — `.shell-nav` mirrors it:
```css
.view-switcher {
  max-width: 1100px;
  margin: var(--space-lg) auto 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}
.view-switcher a {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch);          /* 44px */
  padding-inline: var(--space-xs);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.45;
  /* :focus-visible inherits the global 2px ring rule (app.css). */
}
.view-switcher a[aria-current="page"] {
  font-weight: 600;
  text-decoration-thickness: 2px;
}
```
`.shell-nav a` copies the link anatomy (44px touch, `--font-ui` 14px, inherited focus ring, weight-600 + underline scoped to `aria-current` — never color alone, forced-colors safety). Header-resident variant must NOT wrap (`flex-wrap: nowrap`) — the 48px row is single-row by D15-01/D15-17.

**`.app-header` geometry to preserve** (lines 392-412):
```css
.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  min-height: 48px;
  padding-inline: var(--space-lg);
  background: var(--surface);
  border-bottom: 1px solid var(--hairline);
}
.app-wordmark {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink-soft);
  /* Wordmark is a <span>, NOT a link — UI-SPEC line 306 (no global Home route). */
}
```
The L411 comment must be REWRITTEN with the D15-05 citation when the wordmark becomes a link. `.header-controls` (L1299-1303): `display: inline-flex; gap: var(--space-sm);` — the narrow-width tuning targets (Pitfall 1: gap 8→4px, header padding `--space-lg`→`--space-sm/md` in a `<640px` query, nav-link padding 0-2px).

**Wordmark collapse — use `.visually-hidden`, never `display: none`** (lines 154-161):
```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
```
Keeps the brand link keyboard/SR-reachable (Pitfall 9 / D15-17); compact-mark treatment is the planner's discretion alternative.

**Token inventory for the POLISH-07 audit** (D15-03): `--space-*` scale + `--touch: 44px` (L22-30), global `:focus-visible` 2px ring (L131-134, "outline: 0/none FORBIDDEN"), `main#main` shared inset `padding-inline: var(--space-md); padding-block: var(--space-3xl);` (L204-207), 1100px measure caps (`.view-switcher` L2059, `.library-search` L2082). Drift = deviation from these WITHOUT a cited reason (Reader's `paginated-main` 48px block inset L214-221 is INTENTIONAL — cite, don't "fix").

---

### `tests/component/App.test.tsx` (test — parseHash unit surface)

**Analog:** itself; extend the `parseHash` describe (L51-128). Existing alias-adjacent cases (lines 119-127):
```typescript
it("maps '#/review' to the review view", () => {
  window.location.hash = "#/review";
  expect(parseHash()).toEqual({ name: "review" });
});

it("maps '#/review/x' (unknown sub-route) to the list view", () => {
  window.location.hash = "#/review/x";
  expect(parseHash()).toEqual({ name: "list", view: "all" });
});
```
Add: `#/highlights` → review; `#/review` → review WITH the legacyAlias marker (per the chosen View shape — RESEARCH Open Question Q4); the unknown-segment All fallback stays. Mock discipline: `vi.mock("../../src/content/repository", …)` + `beforeEach` hash reset (L14-49). Strengthen-only — every existing case stays byte-stable.

---

### `tests/unit/library/library-session.test.ts` (NEW — test)

**Analog:** `tests/unit/library/reading-state.test.ts` (lines 1-59):
```typescript
// PURE coverage — no React, no Dexie; the module owns only algebra over
// LocationRecord/Book inputs (the book-progress.test.ts fixture discipline:
// schema-parse builders, lengthsOf identity lookup, boundary-named cases).
import { describe, expect, it } from "vitest";
import { articleReadingState, bookReadingState, countByState } from
  "../../../src/ingestion/library/readingState";
```
Copy the structure: header comment citing the D15-11..14 rows pinned, plain `describe`/`it` boundary-named cases (`viewMatches`: landing===captured true; mismatch false; `clampScroll`: saved ≤ height passes through; saved > height clamps to height; snapshot round-trip capture→peek→capture-overwrite). No schema-parse builders needed — the snapshot is plain literals (view name, strings, number, nullable id).

---

### `tests/e2e/chrome/shell-nav.spec.ts` (NEW — test)

**Analog A — nav/gating structure:** `tests/e2e/review-panel/route-entry.spec.ts`. Harness + selector discipline (lines 26-48, 95-117):
```typescript
import { BASE, wipeDatabase, FIXTURES } from "../annotations/_fixtures";

test.describe("RECV-01.a review-panel route entry", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("(a) LibraryView 'Review highlights' button navigates to #/review", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Review highlights" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#\/review$/);
  });

  test("(e) annotations-trigger is not rendered on #/review (articleMounted gating)", async ({ page }) => {
    await page.goto(`${BASE}/#/review`);
    // Regex name because the aria-label appends a formatted count when
    // highlights exist. The trigger is conditionally rendered (NOT
    // CSS-hidden) — count 0 proves the Header conditional is false
    // outside the article view.
    await expect(
      page.getByRole("button", { name: /Highlights and notes/ }),
    ).toHaveCount(0);
    // Contrast leg — the same regex matches on the article view, so the
    // zero-count above pins the gating rather than a bad selector.
    await page.goto(`${BASE}/#/article/${FIXTURES[0]}`);
    await expect(
      page.getByRole("button", { name: /Highlights and notes/ }),
    ).toBeVisible();
  });
});
```
Copy: `BASE`/`wipeDatabase` from `tests/e2e/annotations/_fixtures.ts` (L33/L44), role/name queries only, and the COUNT-ZERO + CONTRAST-LEG gating pattern (ModeToggle absent on Library/Highlights, present in Reader; gear everywhere). Update pass note: tests (a)-(d) here drive the retired vocabulary and must be renamed in the same commit as the grammar change.

**Analog B — 320px geometry assertion:** `tests/e2e/chrome/header-geometry.spec.ts` (lines 31, 49-65, 73-93):
```typescript
const SMALL_PHONE = { width: 360, height: 640 } as const;
// ...
await page.setViewportSize({ width: SMALL_PHONE.width, height: SMALL_PHONE.height });

const headerGeom = await page.evaluate(() => {
  const header = document.querySelector<HTMLElement>("article.article-body > header");
  if (!header) return null;
  return {
    scrollHeight: header.scrollHeight,
    clientHeight: header.clientHeight,
    // ...
  };
});
expect(
  headerGeom!.scrollHeight,
  `header must not scroll internally at 360×640 (...)`,
).toBeLessThanOrEqual(headerGeom!.clientHeight);
```
The shell-nav 320×640 Reader assertion mirrors this evaluate-geometry style over `.app-header` (scrollHeight ≤ clientHeight + no horizontal overflow; brand link still keyboard-reachable when collapsed). Plain `test()` blocks inherit the 3-engine matrix.

---

### `tests/e2e/library/library-restore.spec.ts` (NEW — test)

**Analog:** `tests/e2e/library/reading-views.spec.ts` — the NAV-04 matrix + seeding harness.

**Seeding + readiness discipline** (lines 539-565, 585-630):
```typescript
async function seedCorpus(page: Page): Promise<void> {
  for (const book of CORPUS_BOOKS) await seedBook(page, book);
  await seedArticleRows(page, CORPUS_ARTICLES);
  for (const l of CORPUS_LOCATIONS) {
    await seedLocation(page, l.articleId, l.graphemeOffset, l.savedAt);
  }
}

async function openView(page: Page, hash: string): Promise<void> {
  await page.goto(`${BASE}/${hash}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  // Readiness: counts render only at status ready — present even on empty views.
  await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
    timeout: 10_000,
  });
}
```
beforeEach: image-stub route + goto BASE + h1 wait + raw IndexedDB CLEAR-ROWS over `["articles","settings","location","highlights","notes","books"]` — "clear-rows, NOT deleteDatabase, to avoid the webkit deleteDatabase race" (L592-595). Seed rows via shipped Zod schemas in Node (`ArticleSchema.parse`, `LocationRecordSchema.parse` — L91-104). Seed BEFORE navigation (load effect runs once per mount).

**The assertion NAV-03 supersedes** (lines 824-851 — "Back refocuses the library h1"): update deliberately in the restore commit — Back with captured+matched row → ROW link focused; no capture or mismatch → h1 (unchanged). Every changed assertion carries its D15-11..14 citation in the spec comment (RESEARCH Pitfall 7).

**Row selector precedent** (line 834):
```typescript
await page
  .locator(`.library-list a[href="#/article/${fixtures[0]!.id}"]`)
  .click();
```
Same constant-template selector the app-side row lookup should use (T-10-02c — ids from validated records only).

---

### ~10 e2e spec files pinning "Review highlights" / `#/review` (modify — rename update pass)

**Analog:** `route-entry.spec.ts` — every pinned `getByRole("heading", { level: 1, name: "Review highlights" })`, `toHaveURL(/#\/review$/)`, and `getByRole("button", { name: "Review highlights" })` swaps to the Highlights vocabulary in ONE commit with the grammar + copy change. Hit list (RESEARCH Pitfall 6): reading-views, route-entry, listing, empty-states, tri-state, curate, jump-bidirectional, forced-colors, panel-keyboard spec files + App.test.tsx. Gate: `rg "Review highlights|#/review" src tests` leaves only intentional alias-test hits. Strengthen-only discipline permits locked-decision renames (D14-25 precedent); ADD alias-compat specs rather than weakening old coverage.

## Shared Patterns

### Links-in-a-labeled-nav with aria-current (D14-22 → shell level)
**Source:** `src/ingestion/library/LibraryView.tsx` L431-464
**Apply to:** `Header.tsx` shell nav, `route-entry`-driven shell-nav specs.
`aria-current={active ? "page" : undefined}` on exactly one link; distinct `aria-label` per nav landmark (two navs coexist after this phase).

### replaceState + direct setView (D14-13)
**Source:** `src/App.tsx` L264-268
**Apply to:** the `#/review` alias normalization in `onHash` + cold-load path.
Constant href only (VIEW_HREFS discipline); the direct `setView(parseHash())` is load-bearing (hashchange does NOT fire for replaceState).

### Pure-module store seam (D15-12)
**Source:** `src/ingestion/library/readingState.ts` L1-9 (discipline), `src/reader/restoreLocation.ts` L123-146 (clamp)
**Apply to:** `librarySession.ts` + its unit test.
Zero React, zero Dexie; components own IO (read on mount, write on change/unmount); clamps never restore something that isn't true.

### articleMounted conditional gating (D5-09/D13-10 → D15-15)
**Source:** `src/reader/Header.tsx` L113/L132
**Apply to:** the ModeToggle wrap; gear stays ungated (D15-16).

### Per-destination title via one helper (D14-02)
**Source:** `src/ingestion/library/pageMeta.ts` L24-48
**Apply to:** ReviewView rename (`setDocumentTitle("Highlights")`); suffix/separator/truncation NEVER re-implemented at call sites.

### Byte-stable anchors + strengthen-only tests
**Source:** `route-entry.spec.ts` (selector discipline), `reading-views.spec.ts` (matrix structure)
**Apply to:** all new/updated specs. `main#main`, one h1, `.status`, `.library-list`, `<h1>Saved articles</h1>` survive; honest full-suite gate `npm run test` exit 0.

### Seeding discipline (webkit-safe)
**Source:** `reading-views.spec.ts` beforeEach L585-630 + `_fixtures.ts` `wipeDatabase`
**Apply to:** `library-restore.spec.ts`. Clear-rows never deleteDatabase; seed-before-openView; shipped Zod schemas build rows in Node.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | All files have analogs. Closest gap: session-scoped scroll + row-focus restore has no single in-repo precedent (the shipped split is useScrollSave→Dexie vs restoreLocation→reader; D15-12 rejects the Dexie half) — hence the role-match composite above. |

## Metadata

**Analog search scope:** `src/` (App, reader/, ingestion/library/, routes/review/), `src/app.css`, `tests/component/`, `tests/unit/library/`, `tests/e2e/{chrome,library,review-panel,annotations}/`
**Files scanned:** ~30 (11 analog files read; structure surveys via glob/grep)
**Pattern extraction date:** 2026-08-25
