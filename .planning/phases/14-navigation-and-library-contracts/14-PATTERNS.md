# Phase 14: Navigation and Library Contracts - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** 13 (4 new, 9 modified)
**Analogs found:** 13 / 13 (every file has an in-repo analog; the one genuinely novel UI mechanism — `aria-current` links in a `<nav>` — is research-sourced with a partial in-repo state analog)

> Zero new dependencies this phase. Every pattern below is browser primitives + existing codebase shapes. All excerpt line numbers refer to the CURRENT files (pre-Phase-14).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ingestion/library/readingState.ts` (NEW) | service (pure domain module) | transform (derivation from existing rows) | `src/ingestion/library/bookProgress.ts` | exact |
| `src/ingestion/library/pageMeta.ts` (NEW, suggested) | utility | transform (string build + `document.title` write) | ReviewView `truncate`/ARIA_MAX_CHARS helper (L71-79) + bookProgress pure-module header | partial (no title code exists — repo grep: zero `document.title` writes) |
| `tests/unit/library/reading-state.test.ts` (NEW) | test | transform | `tests/unit/library/book-progress.test.ts` | exact |
| `tests/e2e/library/reading-views.spec.ts` (NEW) | test | request-response (seeding) + event-driven (focus/history) | `tests/e2e/library/progress-recent.spec.ts` + `tests/e2e/chrome/back-nav.spec.ts` | exact (clone harness) |
| `src/App.tsx` (modify) | route/controller | event-driven (hashchange → view state) | itself — `parseHash` L43-61, `onHash` L185-196, `hasAppHistory` L173; replaceState precedent ArticleView L1302-1312 | exact |
| `src/ingestion/library/LibraryView.tsx` (modify) | component | request-response (Promise.all load) + transform (filter/derive in render) | itself — load effect L104-154, partition L162-196, empty state L258-266; TagFilter single-select lift (partial) | exact |
| `src/routes/ArticleView.tsx` (modify) | component | event-driven (focus layering) + request-response (async truth) | itself — jump effect L1282-1394, restore effect L1401-1456, error h1 L1687, article h1 L1959, chapterContext L1198-1245/L1807-1812 | exact |
| `src/routes/review/ReviewView.tsx` (modify) | component | request-response (load) + mount effect | itself — h1 L328, load effect L278-301, truncate L71-79 | exact |
| `src/ingestion/library/LibraryRow.tsx` (modify) | component | transform (per-row derivation) | itself — `FINISHED_RATIO` fork L36, use L76-77 | exact |
| `src/ingestion/library/BookRow.tsx` (modify) | component | transform | itself — `progress >= 1` L120-121, totalsById memo L66-75 | exact |
| `src/ingestion/library/ContinueReadingStrip.tsx` (modify) | component | request-response + transform | itself — membership filters L128 (`progress >= FINISHED_THRESHOLD`) and L151 (`progress >= 1`) | exact |
| `src/ingestion/library/bookProgress.ts` (possible 1-line modify) | service | transform | itself — private `latestLocationByArticle` L43-54 | exact |
| `tests/component/App.test.tsx` (modify) | test | event-driven | itself — parseHash describe L51-102 | exact |

**Explicitly UNCHANGED** (contract, do not touch): `src/reader/BackToLibrary.tsx`, `index.html` (static `<title>Lem Reader</title>` stays the cold-load default, L6), `src/persistence/db.ts` (Pitfall 9 — zero store changes; v5 stores at L189-196 are read-only this phase).

## Pattern Assignments

### `src/ingestion/library/readingState.ts` (NEW — service, transform)

**Analog:** `src/ingestion/library/bookProgress.ts` — copy this file's shape exactly (header-comment discipline, store-seam contract, caller-supplied lookups).

**Module header + store-seam contract** (bookProgress.ts L1-13):
```typescript
// Plan 12-05 Task 1 — PURE book-level derivations over existing
// LocationRecords (D12-03 + D12-07). ZERO new measurement: every input is a
// persisted row ... plus a caller-supplied text-length lookup. This module
// has NO React usage and NO Dexie queries of its own — components own the
// reads (the store-seam discipline), this module owns the algebra.
//
// FINISHED_THRESHOLD is imported from ./ContinueReadingStrip (the exported
// single source of truth — never fork the constant). This module lives
// BESIDE the strip precisely to avoid a persistence→ingestion cycle ...
```

**Import discipline** (bookProgress.ts L34-35) — the exact two imports readingState.ts starts from:
```typescript
import type { Book, LocationRecord } from "../../content/schema";
import { FINISHED_THRESHOLD } from "./ContinueReadingStrip";
```

**Core pattern — pure function over rows + caller-supplied lookup** (bookProgress.ts L72-91):
```typescript
export function deriveBookProgress(
  book: Book,
  locations: LocationRecord[],
  textLengthOf: (articleId: string) => number | undefined,
): number {
  const total = book.chapterArticleIds.length;
  if (total === 0) return 0;
  const latest = latestLocationByArticle(locations);
  let finished = 0;
  for (const chapterId of book.chapterArticleIds) {
    const loc = latest.get(chapterId);
    if (!loc) continue; // never opened → unfinished
    const len = textLengthOf(chapterId);
    if (len === undefined) continue; // unknown text length → unfinished
    if (loc.graphemeOffset >= FINISHED_THRESHOLD * len) {
      finished += 1;
    }
  }
  return finished / total;
}
```
D14-19/D14-21 fall out of this verbatim: `deriveBookProgress(...) === 1` IS "all admitted chapters ≥98%, missing rows count unfinished". The new module wraps, never re-implements.

**Composable exports pattern** (bookProgress.ts L102-118): `resolveResumeChapterId` returns `string | null` — the "never opened" signal readingState.ts reuses: `resolveResumeChapterId(book, locations) === null` → `"unread"`.

**Fold reuse (Open Question 2):** `latestLocationByArticle` (bookProgress.ts L43-54) is private today. Either export it (one-line change, recommended by research) or consume LibraryView's fold — pick ONE owner, never a fourth copy (existing copies: bookProgress.ts L43-54, LibraryView.tsx L122-128, ContinueReadingStrip.tsx L101-107).

---

### `src/ingestion/library/pageMeta.ts` (NEW — utility, transform)

**Analog:** no exact match — `document.title` is written NOWHERE in `src/` today (repo grep, zero matches; only `index.html` L6 `<title>Lem Reader</title>`). Copy the pure-module conventions from bookProgress.ts and the truncation discipline from ReviewView.

**Truncation pattern** (ReviewView.tsx L71-79):
```typescript
/** Truncation limits for review rows (the AnnotationsDrawer discipline). */
const EXCERPT_MAX_CHARS = 120;
const ARIA_MAX_CHARS = 60;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}
```
Research recommends ~60-80 char cap on the content portion before appending " — Lem Reader" (planner confirms the number; e2e assertions use regex/prefix so the number can shift).

**Write shape (research Pattern 3):** `document.title = \`${truncateTitle(content)} — ${TITLE_SUFFIX}\`` — a plain text assignment, no injection surface; every destination (including error states, D14-06) sets its own title on mount so nothing needs restore-on-unmount.

---

### `tests/unit/library/reading-state.test.ts` (NEW — test)

**Analog:** `tests/unit/library/book-progress.test.ts` — the established pure-suite discipline ("No React, no Dexie — ... owns only algebra ... the library-search.test.ts discipline for pure helpers", L1-6).

**Schema-built fixtures** (book-progress.test.ts L17-51) — build Book/LocationRecord through the Zod schemas, and supply text lengths via an identity lookup:
```typescript
import { BookSchema, LocationRecordSchema } from "../../../src/content/schema";

function makeBook(chapterIds: string[], skipped = 0): Book {
  return BookSchema.parse({ id: "epub-book000111", /* ... */ });
}
function loc(articleId: string, graphemeOffset: number, savedAt: string, revision = 1): LocationRecord {
  return LocationRecordSchema.parse({ schemaVersion: 1, articleId, revision, graphemeOffset, savedAt });
}
function lengthsOf(lengths: Record<string, number>) {
  return (articleId: string): number | undefined => lengths[articleId];
}
```

**Truth-table case style** (book-progress.test.ts L53-65) — boundary tests name the exact edge:
```typescript
it("counts a chapter finished at EXACTLY the FINISHED_THRESHOLD boundary (>=)", () => {
  // 0.98 x 100 = 98 — offset 98 is AT the boundary and counts.
  ...
  expect(progress).toBe(1);
});
it("one below the boundary is unfinished", () => { ... expect(progress).toBe(0); });
```
Required truth-table rows (from the phase test map): unread (no location), opened-at-0% → in-progress (D14-18), ≥98% → finished, book 39/40 → in-progress (D14-19), missing chapter row 11/12 → in-progress (D14-21), opened zero-length edge (ratio = min(1, x/0) = 1 → finished — PRESERVES current LibraryRow/strip behavior; document it).

---

### `tests/e2e/library/reading-views.spec.ts` (NEW — test)

**Analog 1:** `tests/e2e/library/progress-recent.spec.ts` — clone the whole harness.

**beforeEach: image stub + clear-rows** (progress-recent.spec.ts L145-188): stub `page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, ...)`, goto BASE, wait for the "Saved articles" h1, then raw IndexedDB `.clear()` over `["articles","settings","location","highlights","notes"]` (ADD `"books"` — the store list predates v5). Clear-rows, NOT deleteDatabase (the webkit race, L151-154 comment).

**Seeding helper** (progress-recent.spec.ts L61-94) — `seedLocation` writes a LocationRecord via `page.evaluate` raw IndexedDB, key `[articleId, revision]`. Extend with `seedBook`/`seedArticleRows` writing to the `books` ("id, title, *tags") and `articles` ("id, revision, source, addedAt, *tags, bookId") stores — chapter rows carry BOTH `ingestionMeta.bookId` and top-level `bookId` (db.ts L189-196).

**The 0.98 truncation trap** (progress-recent.spec.ts L238-241) — documented in-repo, do not re-learn it:
```typescript
// (Math.floor(total * 0.98) is NOT enough — for every fixture, the
// floored offset yields ratio ≈ 0.9798 < 0.98 due to integer truncation.
// Using `total` itself makes the test deterministic.)
```
Seed `graphemeOffset = total` for Finished; floor-ratios only for in-progress states.

**openLibrary discipline** (progress-recent.spec.ts L120-143) — the LibraryView-does-NOT-remount fact is codified here: callers must seed BEFORE openLibrary or `page.reload()`. View switches via the direct setView path likewise never remount — e2e view-switch tests assert aria-current/URL/rows without expecting a remount.

**Analog 2:** `tests/e2e/chrome/back-nav.spec.ts` — the history-semantics assertion shape:
```typescript
// back-nav.spec.ts L94-96
await backToLibrary(page).click();
await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
await expect(page).toHaveURL(/#\/$/);
```
Clone for D14-13: library `#/` → click Unread (replaced) → click Finished (replaced) → open article (push) → Back → land on `#/finished` (the replaced entry), never an intermediate view. Both specs run 3-engine by default (plain `test()` inherits the matrix, back-nav.spec.ts L4-5).

**Focus/title assertions** (verified APIs, Playwright 1.61.1): `expect(locator).toBeFocused()` (auto-retries), `expect(page).toHaveTitle(/…/)`, `expect(page).toHaveURL(/#\/unread$/)`.

---

### `src/App.tsx` (modify — route/controller, event-driven)

**Analog:** itself. Three extension points:

**1. parseHash grammar** (App.tsx L43-61) — extend IN PLACE, match order preserved (article `/h/` regex FIRST, then `#/review`, then NEW view-segment literals, list fallback LAST):
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
  return { name: "list" };
}
```
New shape: `{ name: "list"; view: LibraryViewName }` with literal allowlist comparisons (`=== "#/unread"` etc.); unknown `#/` segments fall through to `{ name: "list", view: "all" }` — the D14-16 fallback mirrors the existing unknown-route → list discipline (unit-tested at App.test.tsx L67-72). `View` and `parseHash` are already exported (App.tsx L276-277) — the test surface extends for free.

**2. The onHash listener + fragment guard** (App.tsx L175-196) — DO NOT break the guard; note `hasAppHistory` is NOT flipped by view switches (replaceState fires no hashchange — correct by design, document it):
```typescript
const onHash = () => {
  const hash = window.location.hash;
  if (hash !== "" && !hash.startsWith("#/")) return;  // Gap 3 — native #fn-N/#main targets
  setHasAppHistory(true);
  setView(parseHash());
};
window.addEventListener("hashchange", onHash);
```

**3. replaceState switch wiring** — the load-bearing mechanic: `history.replaceState(null, "", "#/unread")` fires NO hashchange/popstate (verified in-repo at ArticleView.tsx L1302-1309). The switch handler must do BOTH the replaceState AND a direct `setView(parseHash())`. Precedent for template-built same-origin URLs (ArticleView.tsx L1301-1312):
```typescript
// Terminal path shared by every outcome: silently strip the /h/ suffix
// and release the restore suppression. history.replaceState fires NO
// hashchange/popstate (research Pitfall 1 — a location.hash assignment
// would re-run the router, re-parse mid-view, and knock focus off the
// <mark>). The URL is template-built from the validated article id
// only — same-origin by construction, no user text enters it
// (T-10-03b).
const finish = () => {
  history.replaceState(null, "", `#/article/${article.id}`);
  ...
};
```

**Warm-mount flag threading** — copy the `hasAppHistory` shape (App.tsx L165-173: comment-cited, threaded via props). D14-03 needs a PER-MOUNT "was this mount caused by an in-app navigation" value (research suggests a navSeq counter or `inAppNavRef`); thread it into LibraryView/ArticleView/ReviewView exactly as `hasAppHistory` is threaded at L250-262. Destinations stay PUSH (`window.location.hash = "#/article/<id>"` — LibraryView.tsx L220, LibraryRow.tsx L115, BackToLibrary.tsx L44).

---

### `src/ingestion/library/LibraryView.tsx` (modify — component)

**Analog:** itself, four extension points; TagFilter for lifted single-select state (partial).

**1. Byte-stable anchors — inviolable** (LibraryView.tsx L207-209, L238, L268): `<h1>Saved articles</h1>` gains ONLY `tabIndex={-1}` + ref (D14-25 — text/level unchanged); `.status` live region and `.library-list` class stay byte-identical.

**2. Load effect + latest-savedAt fold** (LibraryView.tsx L104-154) — the `[refreshKey]` cycle stays the single load; counts update on it (D14-23 discretion — no new invalidation machinery):
```typescript
Promise.all([listArticles(), loadAllLocations(), loadAllTags(), listBooks()])
  .then(([articles, locations, tags, booksResult]) => {
    ...
    const latest = new Map<string, LocationRecord>();
    for (const loc of locations) {
      const prev = latest.get(loc.articleId);
      if (!prev || loc.savedAt > prev.savedAt) {
        latest.set(loc.articleId, loc);
      }
    }
```
Build ONE `totalsById` Map here (useMemo on items identity — BookRow.tsx L66-75 / strip L111-117 precedent) and pass `totalsById.get` as the policy's `textLengthOf` lookup (avoids per-row Intl.Segmenter recompute).

**3. Book/article partition** (LibraryView.tsx L162-173) — the `ingestionMeta.bookId` partition feeds the policy; one item per book per view (D14-24) falls out:
```typescript
const standaloneArticles: CanonicalArticle[] = [];
const chaptersByBook = new Map<string, CanonicalArticle[]>();
for (const article of items) {
  const bookId = article.ingestionMeta?.bookId;
  if (bookId) { ... chaptersByBook.set(bookId, list); }
  else standaloneArticles.push(article);
}
```

**4. Empty state** (LibraryView.tsx L258-266) — the D8-04 calm-voice shape per-view copies:
```typescript
<>
  <h2>Your library is empty</h2>
  <p>Paste a URL or upload a file to begin.</p>
</>
```

**Partial analog for the switcher:** TagFilter.tsx (L42-55) shows the lifted single-select pattern (`activeTag`/`onSelect` props, `aria-pressed` chip) — but D14-22 mandates LINKS + `aria-current="page"` in a `<nav aria-label="…">` (NOT pressed-buttons/tablist; a second nav exists at ArticleView chapter-nav L2048+, so the label is required). Counts live in the accessible names ("Unread (3)", D14-23).

**Focus effects (Pitfall 3 — the remount trap):** LibraryView does NOT remount across view switches (verified: progress-recent.spec.ts L126-131). TWO effects are required: mount-effect (warm-gated h1 focus, D14-03) + `[activeView]`-keyed effect (h1 focus on every switch, D14-15). No cleanup — focusing twice is idempotent (StrictMode-safe).

---

### `src/routes/ArticleView.tsx` (modify — component)

**Analog:** itself. The D14-05/D14-10 layering means ALL focus policy stays inside this file at ONE decision point — never a third competing effect.

**Deep-link jump effect** (L1282-1394) — the layering template. The `jumpPendingRef` claim-before-early-return discipline (L1284-1287) and the terminal `finish()` (L1308-1312, quoted above) are exactly how the h1-default must compose: h1 focus fires only in the terminal fall-through branches (no jump param + no saved location + warm mount):
```typescript
useEffect(() => {
  if (!jumpHighlightId) return; // normal open — no jump, restore runs
  // Claim pending BEFORE the early returns so the restore effect
  // (declared below) can never start racing the jump ...
  jumpPendingRef.current = true;
```

**Focus settle guard** (L1378-1384) — the firefox double-call pattern for any focus-after-scroll:
```typescript
const focusMark = () => {
  document.getElementById(`hl-${jumpHighlightId}`)?.focus();
};
requestAnimationFrame(focusMark);
window.setTimeout(focusMark, 120);
```

**Restore effect** (L1401-1456) — `jumpPendingRef.current` suppression at L1411 is the exact "most-specific wins" mechanism the h1-default hooks into; restore beats h1 (D14-10).

**Error h1** (L1679-1693) — the D14-06 title+focus parity target:
```typescript
if (status !== "ready" || !article) {
  return (
    <main id="main">
      <div className="status" role="status" aria-live="polite" aria-atomic="true">
        {status === "loading" ? (
          <p>Opening article…</p>
        ) : (
          <>
            <h1>Couldn't open this article.</h1>
            <p>The article could not be loaded. Select it again from the list, or try a different article.</p>
          </>
        )}
      </div>
    </main>
  );
}
```

**Article h1** (L1959): `<h1>{article.provenance.title}</h1>` — gains `tabIndex={-1}` + ref only.

**chapterContext async truth** (L1198-1245 load; L1807-1812 render) — the D14-07 title key. The title effect keys on `[article, chapterContext, status]` so the standalone form upgrades to "Chapter title — Book title — Lem Reader" when the tolerant Book lookup resolves (null until then; missing/corrupt row → simple form, never an error, L1205-1213).

---

### `src/routes/review/ReviewView.tsx` (modify — component)

**Analog:** itself. h1 at L328 (`<h1>Review highlights</h1>` inside `<header className="review-header">`, L320-329) gains `tabIndex={-1}` + ref + a warm-gated mount focus effect; title effect sets "Review highlights — Lem Reader". The load-effect shape (L278-301, cancelled-flag Promise.all keyed on `[refreshKey]`) is where async truth lands — title set in the same component.

---

### `src/ingestion/library/LibraryRow.tsx` (modify — component)

**Analog:** itself. The FINISHED_RATIO fork to DELETE (L36) and its use (L76-77):
```typescript
/** D8-12 — articles at >= 98% grapheme-offset progress are "Finished". */
const FINISHED_RATIO = 0.98;              // ← DELETE (D14-20)
...
const ratio = location ? Math.min(1, location.graphemeOffset / total) : 0;
const isFinished = ratio >= FINISHED_RATIO;   // ← becomes articleReadingState(...)
```
Keep the ratio math for the hairline (`showHairline`); the FINISHED decision routes through `readingState.articleReadingState(location, total)`. The per-article grapheme total useMemo (L72-75) stays — it becomes the `total` argument.

---

### `src/ingestion/library/BookRow.tsx` (modify — component)

**Analog:** itself. The derivation to wrap (L120-121):
```typescript
const isFinished = progress >= 1;
const showHairline = progress > 0 && !isFinished;
```
becomes `bookReadingState(book, locations, totalsById.get)` — but KEEP the `deriveBookProgress` memo (L91-97) for the hairline ratio. The `totalsById` useMemo (L66-75) is the pattern LibraryView's new shared map copies.

---

### `src/ingestion/library/ContinueReadingStrip.tsx` (modify — component)

**Analog:** itself. The two membership filters that refactor onto the policy (behavior identical — current predicate IS in-progress):
- L127-128: `const progress = Math.min(1, location.graphemeOffset / total); if (progress >= FINISHED_THRESHOLD) return [];` → `articleReadingState(location, total) !== "in-progress"` equivalent
- L148-151: `resolveResumeChapterId(book, locations) === null` / `progress >= 1` gates → `bookReadingState(book, locations, ...)` — the function ALREADY composes both calls exactly (L146-151), so the refactor is mechanical
- `FINISHED_THRESHOLD` export (L56) stays THE single source — untouched; surface unchanged (Phase 16 owns the redesign).

---

### `tests/component/App.test.tsx` (modify — test)

**Analog:** itself — the parseHash describe (L51-102). Strengthen-only: every existing case byte-stable; ADD view-segment cases in the same style:
```typescript
it("maps '#/unread' to the list view with view: unread", () => {
  window.location.hash = "#/unread";
  expect(parseHash()).toEqual({ name: "list", view: "unread" });
});
it("maps '#/finished' to the list view with view: finished", () => { ... });
it("maps '#/unknown-view' to the list view with view: all (D14-16)", () => { ... });
```
The beforeEach hash-reset (L43-49) and the fragment-guard App tests (L104-141) stay untouched.

## Shared Patterns

### Store-seam: pure modules beside components
**Source:** `bookProgress.ts` L1-35 · **Apply to:** `readingState.ts`, `pageMeta.ts`
No React, no Dexie, caller-supplied lookups; components own reads, the module owns algebra. Import `FINISHED_THRESHOLD` from `./ContinueReadingStrip` — ANY literal `0.98` in new code is a fork (D8-12/D14-20).

### The latest-savedAt fold (three existing copies — one owner, no fourth)
**Sources:** bookProgress.ts L43-54 (private) · LibraryView.tsx L122-128 · ContinueReadingStrip.tsx L101-107 · **Apply to:** readingState.ts (via export from bookProgress.ts — recommended) — identical comparison discipline (`loc.savedAt > prev.savedAt`; ISO-8601 strings compare lexicographically).

### replaceState fires no events — pair with a direct state update
**Source:** ArticleView.tsx L1302-1312 (in-repo verified comment) · **Apply to:** App.tsx switch wiring, the switcher onClick. URL/DOM desync is THE failure mode (Pitfall 2); unit-test all four entry paths (cold load, Back, middle-click via hashchange, direct click).

### tabindex=-1 h1 focus — per-view ownership, no cleanup, no cold-load focus
**Sources:** the layering sites ArticleView L1282-1394/L1401-1456 · **Apply to:** LibraryView (mount + `[activeView]` effects — Pitfall 3 remount trap), ArticleView (terminal fall-through branches only — Pitfall 1 focus fights), ReviewView (warm mount only), error branches (D14-06). Focus effects need NO cleanup (StrictMode double-mount idempotent, Pitfall 9).

### Threaded flags via props (the hasAppHistory precedent)
**Source:** App.tsx L165-173 → L250/262 · **Apply to:** the warm-mount signal for D14-03. Same shape: comment-cited, owned by App, threaded at render.

### Byte-stable anchors + strengthen-only testing
**Sources:** LibraryView.tsx L6-14 header contract; App.test.tsx L74-75 ("Strengthen-only: every case above stays byte-stable") · **Apply to:** ALL test changes. `<h1>Saved articles</h1>`, `.status`, `.library-list` are load-bearing e2e anchors (happy-path.spec, progress-recent.spec, back-nav.spec must stay green unmodified).

### e2e seeding + deterministic Finished states
**Source:** progress-recent.spec.ts L61-94/L145-188/L238-241 · **Apply to:** reading-views.spec.ts. Seed `graphemeOffset = total` for Finished (the floor trap); clear-rows (add "books" store) not deleteDatabase; seed before openLibrary or reload.

### Calm DOC-06 voice for empty/error copy
**Source:** LibraryView.tsx L239-248, L263-265; ReviewView.tsx L346-351 · **Apply to:** per-view empty states (D14-26) — short, honest, action-adjacent; error titles say error (D14-06).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `<nav>` + `aria-current="page"` switcher UI (inside LibraryView) | component (new sub-UI) | event-driven (click → replaceState) | No `aria-current` usage exists in the repo today (TagFilter uses `aria-pressed` buttons — state-lift analog only). Use RESEARCH.md Pattern 2/5 verbatim: real `<a href="#/unread">`, modified-click guard (`e.button !== 0 || e.metaKey || ...` → return), `preventDefault` + direct router update, exactly one `aria-current="page"`. |

## Metadata

**Analog search scope:** `src/App.tsx`, `src/routes/**` (ArticleView, ReviewView), `src/ingestion/library/**` (all 10 files), `src/reader/BackToLibrary.tsx`, `src/persistence/db.ts`, `index.html`, `tests/component/`, `tests/unit/library/`, `tests/e2e/library/`, `tests/e2e/chrome/`
**Files scanned:** 20 source/test files read (ArticleView via 5 targeted non-overlapping sections per the CONTEXT.md line map)
**Pattern extraction date:** 2026-08-25
