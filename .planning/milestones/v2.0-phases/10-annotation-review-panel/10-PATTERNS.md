# Phase 10: Annotation Review Panel - Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** 13 (6 new files / file groups, 7 modified)
**Analogs found:** 13 / 13 (11 exact, 2 role-match; 2 sub-mechanisms have no codebase precedent — see No Analog Found)

> This is a **composition phase**. CONTEXT.md's `<canonical_refs>` named the precedent
> files; every one was read this session and the excerpts below are verbatim from
> source. Line numbers are authoritative as of mapping date.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/routes/review/ReviewView.tsx` (NEW) | component (route view) | request-response (mount load → derive → render) | `src/ingestion/library/LibraryView.tsx` | exact |
| `src/routes/review/reviewFilter.ts` (NEW) | utility (pure derivation) | transform | `src/ingestion/library/libraryFilter.ts` + `src/portability/markdown.ts` | exact |
| `src/routes/review/ReviewNoteDialog.tsx` (NEW) | component (modal dialog) | CRUD | `src/reader/annotations/NotePopover.tsx` | exact (structural clone) |
| `src/routes/review/DeleteHighlightConfirm.tsx` (NEW) | component (alertdialog) | CRUD (destroy) | `src/ingestion/library/RemoveConfirm.tsx` | exact (structural clone) |
| `tests/unit/review-filter.test.ts` (NEW) | test (unit, pure) | transform | `tests/unit/library-search.test.ts` | exact |
| `tests/e2e/review-panel/*.spec.ts` (NEW, 6 specs) | test (e2e) | request-response | `tests/e2e/annotations/navigate-back.spec.ts` + `tests/e2e/portability/_portability.ts` | role-match |
| `src/App.tsx` (MODIFY) | route (app shell / hash router) | event-driven (hashchange) | itself — L32–37, L136–160 (extend, don't rewrite) | exact (self-extension) |
| `src/routes/ArticleView.tsx` (MODIFY) | component (route view) | event-driven (on-mount effect) | itself — L811–857 + L1015–1059 | exact (self-extension) |
| `src/ingestion/library/LibraryView.tsx` (MODIFY) | component | request-response | itself — header cluster + RemoveConfirm wiring | exact (self-extension) |
| `src/portability/conflicts.ts` (MODIFY, likely) | service (memoization substrate) | transform | itself — L193–227 | exact (lift-and-export) |
| `src/app.css` (MODIFY) | config (authored styles) | static | existing `.library-*` / dialog / `.status` blocks + `:root` tokens | role-match |
| `tests/component/App.test.tsx` (MODIFY) | test (component) | n/a | itself — L51–73 parseHash suite | exact (strengthen-only) |
| `tests/e2e/a11y.spec.ts` (MODIFY, likely) | test (e2e a11y) | n/a | itself — L36–44 route-enum pattern | exact |

## Pattern Assignments

### `src/routes/review/ReviewView.tsx` (component, request-response)

**Analog:** `src/ingestion/library/LibraryView.tsx` — same role (route view at a hash), same shape (`<main id="main">` + `<h1>` + `.status` + filter row + list + confirm-dialog wiring + refreshKey re-derivation).

**Imports pattern** (LibraryView.tsx L35–49):
```typescript
import { useEffect, useState } from "react";
import { listArticles } from "../../content/repository";
import type { CanonicalArticle } from "../../content/types";
import { IngestControl } from "../IngestControl";
import { TagFilter } from "./TagFilter";
import { filterLibrary } from "./libraryFilter";
import { loadAllTags } from "./tagsStore";
import { RemoveConfirm } from "./RemoveConfirm";
```
ReviewView mirrors this: `loadAllHighlights` (`../../persistence/highlightsStore`), `loadAllNotes` (`../../persistence/notesStore`), `listArticles` (`../../content/repository`), `loadAllTags` (`../../ingestion/library/tagsStore`), `TagFilter` (`../../ingestion/library/TagFilter`), its own `reviewFilter` + the two clone dialogs.

**Core load effect** — cancelled-flag + `Promise.all` + `refreshKey` re-trigger (LibraryView.tsx L66–97):
```typescript
const [refreshKey, setRefreshKey] = useState(0);

useEffect(() => {
  let cancelled = false;
  // Parallel load — each independent; Promise.all mirrors the
  // composite-library read discipline.
  Promise.all([listArticles(), loadAllLocations(), loadAllTags()])
    .then(([articles, locations, tags]) => {
      if (cancelled) return;
      setItems(articles);
      setStatus("ready");
    })
    .catch(() => {
      if (cancelled) return;
      setStatus("error");
    });
  return () => {
    cancelled = true;
  };
}, [refreshKey]);
```
ReviewView's version: `Promise.all([listArticles(), loadAllHighlights(), loadAllNotes(), loadAllTags()])` keyed on `[refreshKey]`. **Pitfall 6 (research):** after delete/edit commits, `setRefreshKey((k) => k + 1)` or rows go stale.

**Derived visible items** (LibraryView.tsx L102) — no effect chains, pure call in render body:
```typescript
const visibleItems = filterLibrary(items, { query, activeTag });
```
ReviewView: `const sections = deriveReviewSections(articles, highlights, notes, filters, sort)` (see reviewFilter.ts below).

**Page markup / live region / empty states** (LibraryView.tsx L104–138):
```typescript
return (
  <main id="main">
    {/* byte-stable page heading (skip-link target parity) */}
    <h1>Saved articles</h1>
    <IngestControl />
    <div className="status" role="status" aria-live="polite" aria-atomic="true">
      {status === "loading" && <p>Opening article…</p>}
      {status === "error" && (<> … </>)}
    </div>
    <LibrarySearch query={query} onQueryChange={setQuery} />
    <TagFilter tags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
    {visibleItems.length === 0 && status === "ready" ? (
      <>
        <h2>Your library is empty</h2>
        <p>Paste a URL or upload a file to begin.</p>
      </>
    ) : (
      <ul className="library-list"> … </ul>
    )}
```
ReviewView mirrors: `<main id="main">` + `<h1>` (one-h1-per-page — Pitfall 8) + the same `.status` block carrying BOTH D10-10 empty states ("No highlights yet…" vs "No highlights match these filters.") AND D10-12 curation results ("Highlight removed.") + filter row (`TagFilter` + article `<select>` + confidence `<select>`) + sort `<select>` + grouped sections. D10-10 distinguishes the two empty states: `highlights.length === 0` → "no highlights yet" copy; derived-empty-but-nonzero → "no matches" copy.

**Dialog wiring + post-commit refresh** (LibraryView.tsx L163–181):
```typescript
<RemoveConfirm
  open={removeTarget !== null}
  articleId={removeTarget?.id ?? ""}
  articleTitle={removeTarget?.title ?? ""}
  onConfirm={() => {
    const removedId = removeTarget?.id;
    setRemoveTarget(null);
    setRefreshKey((k) => k + 1);            // ← re-derive from Dexie (Pitfall 6)
    if (removedId !== undefined &&
        window.location.hash === `#/article/${removedId}`) {
      window.location.hash = "#/";          // hash assignment → router fallback
    }
  }}
  onCancel={() => setRemoveTarget(null)}
/>
```

**Row jump navigation** (D10-03) — plain hash assignment pushes a history entry so Back returns to `#/review`:
```typescript
window.location.hash = `#/article/${articleId}/h/${highlightId}`;
```
(Precedent for hash navigation: LibraryView.tsx L177 `window.location.hash = "#/"`.) Confident rows only — the disabled-when-unresolved rule is AnnotationsDrawer.tsx L184–189 (`disabled={isUnresolved}`).

---

### `src/routes/review/reviewFilter.ts` (utility, transform)

**Analog:** `src/ingestion/library/libraryFilter.ts` — pure function, named filter interface, no Dexie/React/IO. Plus `src/portability/markdown.ts` for the join/tri-state/orphan/sort vocabulary.

**Pure derivation shape** (libraryFilter.ts L42–50, L65–89):
```typescript
export interface LibraryFilter {
  query: string;
  activeTag: string | null;
}

export function filterLibrary(
  articles: CanonicalArticle[],
  filter: LibraryFilter,
): CanonicalArticle[] {
  const q = filter.query.trim().toLowerCase();
  return articles.filter((a) => {
    // Tag filter (single tag, AND-style within a tag).
    if (filter.activeTag !== null) {
      if (!(a.tags ?? []).includes(filter.activeTag)) return false;
    }
    // … query branch …
    return true;
  });
}
```
Review twin: `deriveReviewSections(articles, highlights, notes, { tag, articleId, confidence }, sort)` → `{ sections: ReviewSection[]; orphanEntries: ReviewEntry[] }`. Filters AND together (D10-08); confidence=All must INCLUDE ambiguous/orphan rows (anti-pattern: silent tri-state filtering).

**Ready-made row type** (markdown.ts L31–35):
```typescript
export type HighlightEntry = {
  highlight: HighlightRecord;
  note?: NoteRecord;
  status: "confident" | "ambiguous" | "orphan";
};
```

**The join + orphan rule** (markdown.ts L98–119 — `collectHighlightEntries`):
```typescript
const articleById = new Map(articles.map((a) => [a.id, a] as const));
const noteByHighlightId = new Map(notes.map((n) => [n.highlightId, n] as const));
for (const highlight of highlights) {
  const note = noteByHighlightId.get(highlight.id);
  const article = articleById.get(highlight.articleId);
  let status: HighlightEntry["status"];
  if (!article) {
    status = "orphan";                    // absent article → orphan, KEEP the row
  } else {
    const resolved = resolveQuoteSelector(article, highlight.quote, highlight.position);
    status = resolved === "ambiguous" || resolved === "orphan" ? resolved : "confident";
  }
  entries.push(note ? { highlight, note, status } : { highlight, status });
}
```
**D10-13 difference:** swap the per-highlight `resolveQuoteSelector` for the memoized in-text form (see Shared Pattern "Tri-state re-derivation"). Orphan tail heading: `UNMATCHED_SECTION_HEADING = "Highlights without an article"` (markdown.ts L129).

**Sort keys** — three verified precedents:
```typescript
// Position-within-section (AnnotationsDrawer.tsx L75–79):
const aStart = a.resolvedPosition?.start ?? a.record.position.start ?? Number.MAX_SAFE_INTEGER;

// Date — ISO-8601 lexicographic == chronological (markdown.ts L238–240):
if (prev === undefined || loc.savedAt > prev) { /* newer */ }

// Article title (markdown.ts L253):
a.article.provenance.title.localeCompare(b.article.provenance.title)
```

---

### `src/routes/review/ReviewNoteDialog.tsx` (component, CRUD)

**Analog:** `src/reader/annotations/NotePopover.tsx` — structural clone (Pitfall 8 lineage; ~150 lines is the priced cost). **Critical difference:** NotePopover reads `useHighlightOverlay()` (L67–75) — the per-article provider mounted inside ArticleView. The review panel lives OUTSIDE that provider, so the clone takes the highlight/note as props and calls `saveNote`/`deleteNote` directly. Per research Pitfall 7: prefer IMMEDIATE save on Done + flush-on-close over cloning the debounce.

**Dialog open/close sync + trigger capture** (NotePopover.tsx L99–131):
```typescript
useEffect(() => {
  const dlg = popoverRef.current;
  if (!dlg) return;
  if (openPopoverFor && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null; // Pitfall 1
    try {
      dlg.showModal();
    } catch { /* already in top layer / unsupported — editor still in DOM */ }
    const textarea = dlg.querySelector<HTMLTextAreaElement>("textarea");
    if (textarea) {
      textarea.focus();
      textarea.select();
    }
  } else if (!openPopoverFor && dlg.open) {
    dlg.close();
  }
}, [openPopoverFor]);
```

**Close listener — every close path routes through ONE cleanup** (NotePopover.tsx L139–149):
```typescript
useEffect(() => {
  const dlg = popoverRef.current;
  if (!dlg) return;
  const handleClose = () => {
    flushNoteSave();                 // ← clone must keep an equivalent flush
    setOpenPopoverFor(null);
    triggerRef.current?.focus();     // showModal does NOT auto-restore focus
  };
  dlg.addEventListener("close", handleClose);
  return () => dlg.removeEventListener("close", handleClose);
}, [flushNoteSave, setOpenPopoverFor]);
```

**Textarea render — React text child, never raw HTML** (NotePopover.tsx L271–283):
```typescript
<textarea
  id="highlight-popover-textarea"
  className="highlight-popover-textarea"
  value={noteText}
  placeholder="Add a note (optional)"
  onChange={(e) => { if (openPopoverFor) updateNote(openPopoverFor, e.currentTarget.value); }}
  rows={3}
/>
```
Store calls for the clone (notesStore.ts L46–58): `saveNote(note)` upserts; `deleteNote(highlightId)` removes. Empty-text policy is owned by the caller (D5-10): empty text → `deleteNote`, non-empty → `saveNote`. Notes are keyed to highlightId — orphan notes are editable (D10-11).

---

### `src/routes/review/DeleteHighlightConfirm.tsx` (component, CRUD-destroy)

**Analog:** `src/ingestion/library/RemoveConfirm.tsx` — structural clone, shortest canonical dialog form. **Critical difference:** Replace `dexieLibrarySource.remove(articleId)` with `deleteHighlight(highlightId)` (highlightsStore.ts L105–110 — one Dexie transaction cascade-deletes highlight AND its notes; the panel makes ONE call, not two).

**Props interface** (RemoveConfirm.tsx L24–35):
```typescript
interface RemoveConfirmProps {
  open: boolean;
  articleId: string;      // clone: highlightId: string
  articleTitle: string;   // clone: excerpt/quote context (informational)
  onConfirm: () => void;  // invoked AFTER the destructive write resolves
  onCancel: () => void;
}
```

**Open/close sync + `[data-initial-focus]` on the NON-destructive button** (RemoveConfirm.tsx L50–73):
```typescript
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  if (open && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    dlg.showModal(); // browser: focus trap, inert backdrop, Esc closes
    const initial =
      dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
      dlg.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ) ??
      dlg;
    initial.focus();  // WebKit quirk — explicit focus; marker sits on Keep, NOT Delete
  } else if (!open && dlg.open) {
    dlg.close();
  }
}, [open]);
```

**Pitfall 8 load-bearing handler** (RemoveConfirm.tsx L87–102):
```typescript
// The ONLY call site for the destructive store call in the new code. It lives
// in the destructive button's onClick — never in a catch block or effect.
const onDestructiveClick = async () => {
  try {
    await dexieLibrarySource.remove(articleId);  // clone: await deleteHighlight(highlightId)
  } catch {
    // If the delete throws, still close so the reader isn't stuck; the
    // refresh will reveal the row is still present; the reader can retry.
  }
  onConfirm();
};
```

**Alertdialog markup** (RemoveConfirm.tsx L109–149): `<dialog role="alertdialog" aria-modal="true" aria-labelledby aria-describedby>` + h2 title + body copy naming the cascade ("Your highlights and notes for it will also be removed." → clone states the note is removed with the highlight, per D10-12) + two buttons with `data-initial-focus` on the keep/cancel button.

---

### `src/App.tsx` (route, event-driven — MODIFY)

**Analog:** itself. Extend the two shapes below; keep the Gap 3 guard byte-stable.

**Current parseHash** (App.tsx L32–37):
```typescript
type View = { name: "list" } | { name: "article"; id: string };

function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)$/.exec(window.location.hash);
  return m ? { name: "article", id: m[1] as string } : { name: "list" };
}
```
Extended (research Pattern 1 — order matters: article-with-suffix → article-plain → review → list):
```typescript
type View =
  | { name: "list" }
  | { name: "article"; id: string; jumpHighlightId?: string }
  | { name: "review" };

function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)(?:\/h\/([^/]+))?$/.exec(window.location.hash);
  if (m) return { name: "article", id: m[1]!, jumpHighlightId: m[2] };
  if (window.location.hash === "#/review") return { name: "review" };
  return { name: "list" };
}
```
(`[^/]+` for the highlightId capture — path-segment-safe; lookup-only usage, never innerHTML. Research Pitfall 4.)

**Gap 3 guard — UNCHANGED** (App.tsx L146–150):
```typescript
const onHash = () => {
  const hash = window.location.hash;
  if (hash !== "" && !hash.startsWith("#/")) return;
  setView(parseHash());
};
```

**View swap gains the review branch** (App.tsx L192–202):
```typescript
{view.name === "list" ? (
  <LibraryView />
) : (
  <ArticleView
    articleId={view.id}
    modeToggleHandlerRef={modeToggleHandlerRef}
    drawerOpen={drawerOpen}
    onCloseDrawer={() => setDrawerOpen(false)}
    onAnnotationCountChange={setAnnotationCount}
  />
)}
```
The `[view]` reset effect (L157–160) fires on review↔article swaps — desirable (drawer/count reset); panel state is re-derived from Dexie on mount by design. No Header changes (Pitfall 10 — mode-toggle fallback L165–173 already handles no-article).

---

### `src/routes/ArticleView.tsx` (component, event-driven — MODIFY)

**Analog:** itself. Three sections to reuse; the new `jumpHighlightId` prop threads from App.

**Props interface to extend** (ArticleView.tsx L80–104): add `jumpHighlightId?: string` alongside `articleId` / `modeToggleHandlerRef` / `drawerOpen` / `onCloseDrawer` / `onAnnotationCountChange`.

**Location-restore effect shape** (ArticleView.tsx L811–857) — the cancelled-flag + rAF discipline the new on-mount h-jump effect mirrors (and must coordinate with — research Pitfall 3: suppress/sequence the restore when `jumpHighlightId` was provided, deep-link wins):
```typescript
useEffect(() => {
  if (!article) return;
  let cancelled = false;
  loadLocation(article.id, article.revision)
    .then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.location) return;
      const rafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const articleEl = articleRef.current;
        if (!articleEl) return;
        const blocks = queryBlocks(articleEl);
        const target = findScrollTarget(article, blocks, loc.graphemeOffset);
        if (target) target.scrollIntoView({ block: "start" });  // never smooth
        setRestoredOffset(loc);
        setShowResumeBanner(true);
      });
      return () => cancelAnimationFrame(rafId);
    })
    .catch(() => { /* silent fall-through */ });
  return () => { cancelled = true; };
}, [article]);
```

**The jump pipeline to reuse verbatim on mount** (ArticleView.tsx L1015–1059 — `handleNavigateBack`, D5-11):
```typescript
const resolved = api.highlights.find((h) => h.record.id === highlightId);
if (!resolved || !resolved.resolvedPosition) return;   // unresolved → calm no-op

const offset = resolved.resolvedPosition.start;

if (isPaginated) {
  const surface = surfaceRef.current;
  const pages = surface?.getPages();
  if (surface && pages && pages.length > 0) {
    const pageIdx = fragmentContainingOffset(pages, offset, article);
    surface.turnToPage(pageIdx);
  }
} else {
  const blocks = queryBlocks(articleRef.current);
  const target = findScrollTarget(article, blocks, offset);
  target?.scrollIntoView({ block: "center" });
}
// Firefox settle guard — BOTH calls, verbatim:
const focusMark = () => {
  document.getElementById(`hl-${highlightId}`)?.focus();
};
requestAnimationFrame(focusMark);
window.setTimeout(focusMark, 120);
```
On-mount form must wait for THREE settles (article ready, highlights resolved, pagination committed — research Pitfall 2; bounded rAF retry is the recommended shape), then strip the suffix:
```typescript
history.replaceState(null, "", `#/article/${articleId}`);
```
**No `replaceState`/`pushState` usage exists anywhere in `src/` today** (verified by grep) — this is the one genuinely new platform call. Never strip via `location.hash` assignment (fires hashchange → re-mount; research Pitfall 1).

**Date formatting** (ArticleView.tsx L106–115) — row dates mirror with `dateStyle: "short"`:
```typescript
function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
```

---

### `src/ingestion/library/LibraryView.tsx` (component — MODIFY)

**Analog:** itself. D10-02: a "Review highlights" button in the header cluster, alongside existing library controls (where `<IngestControl />` mounts, LibraryView.tsx L108–110), same button styling tokens. Navigation via `window.location.hash = "#/review"` (the L177 fallback precedent). Minimal diff — no other changes to this file.

---

### `src/portability/conflicts.ts` (service — MODIFY, likely)

**Analog:** itself. Open Question 1 recommends lift-and-export (2-line change, zero behavior change) over a mirrored twin:

**MemoizedArticleText** (conflicts.ts L193–204):
```typescript
class MemoizedArticleText {
  private readonly clustersById = new Map<string, readonly string[]>();

  clustersFor(article: CanonicalArticle): readonly string[] {
    let clusters = this.clustersById.get(article.id);
    if (clusters === undefined) {
      clusters = graphemeClusters(normalizeText(article), article.lang);
      this.clustersById.set(article.id, clusters);
    }
    return clusters;
  }
}
```

**resolveHighlightStatus** (conflicts.ts L213–227) — the memoized tri-state call the panel derivation mirrors:
```typescript
function resolveHighlightStatus(
  article: CanonicalArticle,
  clusters: readonly string[],
  highlight: HighlightRecord,
): "confident" | "ambiguous" | "orphan" {
  const resolved = resolveQuoteSelectorInText(
    clusters,
    highlight.quote,
    article.lang,
    highlight.position,
  );
  return resolved === "ambiguous" || resolved === "orphan" ? resolved : "confident";
}
```
Fallback if export is rejected: mirror verbatim with a citation comment. Never fork `resolveQuoteSelectorInText` itself (resolution.ts L179–228 is the canonical core).

---

### `src/app.css` (config, static — MODIFY)

**Analog:** existing library/dialog/row sections. **Tokens-only discipline is verifiable:** all 30 hex color literals live inside the `:root` token block (L6–43); every other rule uses `var(--…)` (502 usages). Anchor blocks to extend alongside:

| Existing block | Lines | Reused for |
|---|---|---|
| `.status` live region | L321–333 | review page status copy (D10-10/D10-12) |
| `.library-list` | L1771+ | grouped review sections list markup |
| `.tag-chip` (+ `[aria-pressed="true"]`) | L1888–1913 | TagFilter chips mounted in review filter row (as-is) |
| `.library-remove-confirm-*` | L2044–2062 | DeleteHighlightConfirm clone styling |
| `.annotations-drawer-entry-*` (see AnnotationsDrawer.tsx classes) | — | row anatomy: blockquote excerpt, note preview, badge |

New selectors are ADDITIVE (new class hooks only — the L1760 comment states the section rule). No transition/animation properties (global reduced-motion gate). No virtualization (CONTEXT discretion: plain list baseline).

---

### `tests/unit/review-filter.test.ts` (test, transform — NEW)

**Analog:** `tests/unit/library-search.test.ts` — plain-Node pure-function suite, no Dexie/React/jsdom.

**Schema-constructed fixtures** (library-search.test.ts L22–38):
```typescript
function makeArticle(overrides: Record<string, unknown>): CanonicalArticle {
  return ArticleSchema.parse({
    id: "test-id",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Untitled",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash: "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "body" }] }],
    ...overrides,
  });
}
```
Matrix style (L82–147): no-filter identity, each filter branch alone, AND-composition, empty-result, input-not-mutated, whitespace edge. Review suite covers additionally: three sorts (ISO-date ordering, title localeCompare, position-within-section), orphan tail membership, tri-state join (confident/ambiguous/orphan classification), confidence=All includes ambiguous/orphan.

---

### `tests/component/App.test.tsx` (test — MODIFY, strengthen-only)

**Analog:** itself. Extend the parseHash describe (App.test.tsx L51–73):
```typescript
describe("parseHash — route parser (unit)", () => {
  it("maps '#/article/<id>' to the article view", () => {
    window.location.hash = "#/article/a-one";
    expect(parseHash()).toEqual({ name: "article", id: "a-one" });
  });
  it("maps an empty hash to the list view", () => { … });
  it("maps a bare '#/' to the list view", () => { … });
  it("maps an unrecognized route hash to the list view", () => { … });
});
```
New cases (research Pitfall 5 ordering): `#/article/<id>/h/<hid>` → article + jumpHighlightId; `#/article/<id>/h/` (trailing slash, no id) → list; `#/review` → review; `#/review/x` → list (unknown); keep every existing case green. Note `parseHash` is exported from `src/App.tsx` (L215) for exactly this unit testing.

---

### `tests/e2e/review-panel/*.spec.ts` (test, e2e — NEW, 6 specs)

**Analog (spec structure):** `tests/e2e/annotations/navigate-back.spec.ts`. **Analog (seeding):** `tests/e2e/portability/_portability.ts` helpers — do not fork.

**Deterministic-state discipline** (navigate-back.spec.ts L19–21):
```typescript
test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);   // from tests/e2e/annotations/_fixtures.ts
});
```

**Async focus assertion — retry, never fixed waits** (navigate-back.spec.ts L51–59) — the jump-bidirectional spec reuses this shape:
```typescript
await expect(async () => {
  const focusedId = await page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute?.("data-highlight-id") ?? null;
  });
  expect(focusedId, "navigate-back focuses the <mark>").toBe(hlId);
}).toPass({ timeout: 3000 });
```

**Seeder helpers** (_portability.ts): `seedRows(page, SeedRows)` L191–225 (one IndexedDB transaction across all stores); `makeArticle({ id, title, paragraphs, … })` L232–255 (ArticleSchema-validated); `confidentHighlightOn(article, opts)` L261–276 (derived-and-verified confident anchor); `highlightRow(articleId, anchor, id)` L279–293 (minimal schema-valid row). Tri-state matrix falls out of two knobs: orphan via `articleId: "ghost-article"`, ambiguous via duplicated body text.

---

### `tests/e2e/a11y.spec.ts` (test — MODIFY, likely)

**Analog:** itself — route-enum pattern (a11y.spec.ts L36–44):
```typescript
test("fixture list: zero serious/critical WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const serious = seriousViolations(results);
  expect(ids).not.toContain("heading-order");
  expect(ids).not.toContain("list");
  expect(serious).toEqual([]);
});
```
Add a `#/review` case (seeded so the list is non-empty) with the same Pitfall-10 heading-order/list guards. Same extension applies to `forced-colors.spec.ts` / `reduced-motion.spec.ts` / `panel-keyboard.spec.ts` if their selectors are route-scoped.

## Shared Patterns

### Native dialog open/close + focus discipline
**Source:** `src/ingestion/library/RemoveConfirm.tsx` L50–85 (shortest form); identical in WipeConfirm, SettingsPanel, AnnotationsDrawer (L83–112), NotePopover.
**Apply to:** `ReviewNoteDialog.tsx`, `DeleteHighlightConfirm.tsx` (both clones).
Open: capture `document.activeElement` → `showModal()` → focus `[data-initial-focus]` (WebKit quirk). Close: `close` listener restores `triggerRef.current?.focus()`. Every close path (Done/Esc/delete) routes through one cleanup. `[data-initial-focus]` sits on the NON-destructive button.

### `.status` live region
**Source:** `src/ingestion/library/LibraryView.tsx` L112–123; `src/routes/ArticleView.tsx` L1064.
**Apply to:** `ReviewView.tsx` — loading/error states, both D10-10 empty states, and D10-12 curation announcements ("Highlight removed.").
```typescript
<div className="status" role="status" aria-live="polite" aria-atomic="true"> … </div>
```

### Cancelled-flag async load + refreshKey re-derivation
**Source:** `src/ingestion/library/LibraryView.tsx` L68–97, L170.
**Apply to:** `ReviewView.tsx`. Load via `Promise.all` of the whole-library Zod-validated readers: `loadAllHighlights()` (highlightsStore.ts L124–135), `loadAllNotes()` (notesStore.ts L71–82), `loadAllTags()` (tagsStore.ts L50–59), `listArticles()`. No new store code. Bump `refreshKey` after every curation commit.

### Tri-state re-derivation (memoized per article)
**Source:** `src/annotations/resolution.ts` L179–228 (`resolveQuoteSelectorInText` — REUSE-DO-NOT-FORK) + `src/portability/conflicts.ts` L193–227 (memoization wrapper).
**Apply to:** `reviewFilter.ts` derivation. Map non-string results → `"confident"`. Absent article → `"orphan"` without dropping. Display-only (RECV-02 repair deferred).

### Destructive writes fire ONLY in the Proceed onClick (Pitfall 8)
**Source:** `src/ingestion/library/RemoveConfirm.tsx` L87–102; `src/reader/annotations/NotePopover.tsx` L188–195.
**Apply to:** both clone dialogs. Single grep-verifiable call site per component: `deleteHighlight(highlightId)` lives only in DeleteHighlightConfirm's destructive handler; `saveNote`/`deleteNote` only in ReviewNoteDialog's Done/close paths.

### Structural-clone dialogs, never shared abstractions
**Source:** Phase 08-04 / 09-05 lineage (RemoveConfirm is itself a clone of WipeConfirm — see its header L1–14).
**Apply to:** both new dialogs. Do NOT import NotePopover (bound to `useHighlightOverlay` provider) or RemoveConfirm (hardcodes `dexieLibrarySource.remove`).

### Tokens-only authored CSS
**Source:** `src/app.css` — all hex colors in `:root` (L6–43); 502 `var(--…)` usages elsewhere.
**Apply to:** all new review selectors (badges, rows, sections, dialogs). Additive class hooks only; no transitions/animations.

## No Analog Found

| Mechanism | Where needed | Reason | Fallback source |
|-----------|--------------|--------|-----------------|
| `history.replaceState` silent suffix strip | ArticleView h-jump effect | Zero `replaceState`/`pushState` usage in `src/` (grep-verified); only `location.hash` assignment exists (LibraryView L177 — which fires hashchange and must NOT be used for the strip) | RESEARCH Pattern 5 + MDN semantics (replaceState fires no hashchange/popstate) |
| On-mount readiness-gated jump (three async settles) | ArticleView h-jump effect | Location-restore effect (L811–857) waits on ONE settle; no existing effect waits on article + highlights-resolved + pagination-commit together | Location-restore effect shape (cancelled flag + rAF) + bounded rAF retry until `getPages().length > 0` (research Open Question 2 recommendation) |

## Metadata

**Analog search scope:** `src/` (all 105 source files surveyed via glob/line-count), `tests/` (component/unit/e2e), `src/app.css`
**Files read this session:** App.tsx, LibraryView.tsx, libraryFilter.ts, AnnotationsDrawer.tsx, RemoveConfirm.tsx, NotePopover.tsx, markdown.ts, highlightsStore.ts, notesStore.ts, TagFilter.tsx, tagsStore.ts, ArticleView.tsx (L1–130, L795–869, L1000–1094), conflicts.ts (L180–249), resolution.ts (L170–249), anchor.ts (L85–112), App.test.tsx, library-search.test.ts, navigate-back.spec.ts, _portability.ts (L178–352), a11y.spec.ts (L1–60), app.css (grep-verified token discipline)
**Pattern extraction date:** 2026-08-15
