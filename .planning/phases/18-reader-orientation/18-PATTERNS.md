# Phase 18: Reader Orientation - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 14 (4 new source, 5 modified source, 1 deleted source, 4 new/modified test files)
**Analogs found:** 13 / 13 needing analogs (2 sub-patterns are genuinely NEW — see "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/content/toc.ts` (NEW) | service (pure domain derivation) | transform (canonical article → TOC entries) | `src/pagination/anchor.ts` | exact — pure domain module over `articleGraphemeIndex`, jsdom-testable, "reuse do not fork" contract style |
| `src/reader/sectionSpy.ts` (NEW) | utility/hook (extraction) | event-driven (scroll + IntersectionObserver → current heading) | `src/reader/SectionAnnouncer.tsx` L48-113 | exact — it IS the code being extracted |
| `src/reader/TocPanel.tsx` (NEW) | component | event-driven (open/close/jump) + request-response (entry → offset) | `src/routes/ArticleView.tsx` L333-375 (tag-popover seam) + `src/reader/annotations/AnnotationsDrawer.tsx` (list/empty UI only) | strong — controlled-popover mechanics exact; `popover="manual"` + hand-rolled Esc is NEW |
| `src/reader/RestorationMarker.tsx` (NEW) | component | event-driven (restore → transient cue + announce) | `src/reader/ResumeBanner.tsx` (announce discipline) + `ArticleView.tsx` L1594-1611 (transient lifecycle) | strong — announce verbatim; actions chrome retires |
| `src/routes/ArticleView.tsx` (MODIFY) | controller/container | event-driven (restore, jump dispatch, popover state) | itself — tag seam L333-375, deep-link effect L1343-1455, `handleNavigateBack` L1732-1776 | exact — in-place extension of three shipped seams |
| `src/reader/Header.tsx` (MODIFY) | component | request-response (trigger toggle) | itself — tags-trigger block L177-188 | exact — 5th button copies 4th button's anatomy |
| `src/reader/SectionAnnouncer.tsx` (MODIFY) | component | event-driven | itself — consumes extracted `sectionSpy` | exact — contract must stay byte-stable |
| `src/reader/ResumeBanner.tsx` (DELETE, D18-06) | — | — | — | retirement across 4 surfaces (see Shared Pattern 8) |
| `src/app.css` (MODIFY) | config/styles | — | itself — L84-92, L1009-1083, L3694-3751 | exact — retire + extend documented blocks |
| `tests/unit/toc.test.ts` (NEW) | test (unit) | transform invariants | `tests/unit/normalizeText.test.ts` | exact — pure-module Vitest shape |
| `tests/e2e/toc/toc-navigation.spec.ts` (NEW) | test (e2e) | event-driven | `tests/e2e/chrome/tag-popover.spec.ts` | exact — popover open/close/focus-restore + axe pass |
| `tests/e2e/toc/toc-geometry.spec.ts` (NEW) | test (e2e) | — | `tag-popover.spec.ts` + `tests/e2e/_edge-invariant.ts` (D6-09) | strong — joins existing edge-invariant/touch-target matrix |
| `tests/e2e/toc/restoration-cue.spec.ts` (NEW) | test (e2e) | — | `tests/e2e/chrome/mobile-first-page-chrome.spec.ts` L59-91 + `library/reading-views.spec.ts` L1001-1021 | exact — seed location → reload → assert restore surface |
| `tests/e2e/chrome/mobile-first-page-chrome.spec.ts` L79 + `tests/e2e/library/reading-views.spec.ts` L1017-1019 (MODIFY) | test (e2e) | — | themselves | exact — the 2 phase-owned banner-retirement sites |

## Pattern Assignments

### `src/content/toc.ts` (service, transform) — NEW

**Analog:** `src/pagination/anchor.ts` (pure domain module over the D-05 substrate)

Copy the module anatomy: contract-citing header comment, `articleGraphemeIndex` import, pure functions, jsdom-safe (no DOM/React), O(1) offset lookups.

**Module header + import pattern** (`anchor.ts` L1-28):
```typescript
// src/pagination/anchor.ts
// Pure passage-anchor helpers... REUSE, DO NOT FORK: per-block grapheme
// lengths derive from `blockNormalizedText`... Pure domain logic — no DOM,
// no React, no side effects. jsdom-safe to unit test.
import type { CanonicalArticle } from "../content/types";
import { articleGraphemeIndex, ... } from "../content/normalizeText";
```

**O(1) block-offset lookup pattern** (`anchor.ts` L63-77 — `pageStartGlobalOffset`):
```typescript
export function pageStartGlobalOffset(
  article: CanonicalArticle,
  fragment: PageFragment,
): number {
  if (fragment.blocks.length === 0) return 0;
  const first = fragment.blocks[0];
  if (!first) return 0;
  // Out-of-range blockIndex clamps to the sentinel entry (index blocks.length)
  const blockIndex = Math.min(first.blockIndex, article.blocks.length);
  return (
    articleGraphemeIndex(article).blockStartOffsets[blockIndex]! +
    first.startGrapheme
  );
}
```
TOC destinations use the same lookup with `startGrapheme = 0`: `blockStartOffsets[headingBlockIndex]!`.

**Source data contract** (`src/content/schema.ts` L58-69 — `HeadingBlock`; levels 1-6, NO ids):
```typescript
export const HeadingBlock = z.object({
  kind: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), ... z.literal(6)]),
  content: z.array(InlineRun),
});
```
Derivation rules from CONTEXT D18-09/10/11: skip `level === 1` (provenance-rendered), `text = block.content.map((r) => r.text).join("")` (duplicates AS-IS), depth from a level stack (skipped levels nest deeper with NO invented intermediates), synthetic "Top of article" entry at offset 0.

---

### `src/reader/sectionSpy.ts` (utility, event-driven) — NEW

**Analog:** `src/reader/SectionAnnouncer.tsx` L48-113 — verbatim extraction source, parameterized by heading selector.

**Detection core to extract** (L48-113):
```typescript
const HEADER_PX = 48;                      // L34 — sentinel line 48+8px
const ANNOUNCE_DEBOUNCE_MS = 250;          // L37

useEffect(() => {
  if (!articleEl) return;
  const headings = Array.from(
    articleEl.querySelectorAll<HTMLHeadingElement>("h2, h3, h4"), // ← becomes a PARAMETER
  );
  if (headings.length === 0) return;

  const detect = () => {                                    // L61-79
    const passed = headings.filter(
      (h) => h.getBoundingClientRect().top < HEADER_PX + 8,
    );
    const current = passed.length > 0 ? passed[passed.length - 1] : null;
    const text = current?.textContent?.trim() ?? "";
    if (text && text !== currentRef.current) { /* debounced notify */ }
  };

  const obs = new IntersectionObserver(detect, {              // L84-88
    rootMargin: `-${HEADER_PX}px 0px -60% 0px`,
    threshold: [0],
  });
  headings.forEach((h) => obs.observe(h));

  let rafId: number | null = null;                           // L94-102 rAF-throttled scroll fallback
  const onScroll = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => { rafId = null; detect(); });
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {                                             // L104-112 full cleanup
    obs.disconnect();
    window.removeEventListener("scroll", onScroll);
    if (rafId !== null) cancelAnimationFrame(rafId);
    /* + clear debounce timer */
  };
}, [articleEl]);
```
Extraction contract (Pitfall 5): announcer keeps selector `"h2, h3, h4"` + its `Section: {text}.` announce byte-identical; TocPanel passes `"h2, h3, h4, h5, h6"` and maps the current heading's element → `data-block-index` → `aria-current` entry. Callback signature returns the heading ELEMENT (not just text) so the TOC can map to block index.

---

### `src/reader/TocPanel.tsx` (component, event-driven) — NEW

**Analog A (open/close mechanics):** `src/routes/ArticleView.tsx` L333-375 — the controlled popover seam. Adjust: `popover="manual"` (persistent, no light dismiss), NO `role="dialog"`/`aria-haspopup` on the surface (Pitfall 3 / NotePopover VoiceOver history), hand-rolled Esc.

**Controlled popover sync + single close seam** (L338-375, adapt refs/names):
```tsx
const tagPopoverRef = useRef<HTMLDivElement>(null);
const tagsTriggerRef = useRef<HTMLElement | null>(null);

// Sync prop → popover shown state; capture trigger BEFORE showPopover()
useEffect(() => {
  const el = tagPopoverRef.current;
  if (!el) return;
  if (tagsOpen && !el.matches(":popover-open")) {
    tagsTriggerRef.current = document.activeElement as HTMLElement | null;
    el.showPopover();
  } else if (!tagsOpen && el.matches(":popover-open")) {
    el.hidePopover(); // fires the same toggle event as native paths
  }
}, [tagsOpen]);

// ONE close seam: state sync + focus restore on EVERY close path
useEffect(() => {
  const el = tagPopoverRef.current;
  if (!el) return;
  const handleToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === "closed") {
      onCloseTags();
      tagsTriggerRef.current?.focus(); // D18-01 focus return
    }
  };
  el.addEventListener("toggle", handleToggle);
  return () => el.removeEventListener("toggle", handleToggle);
}, [onCloseTags]);
```

**NEW (no codebase analog — from RESEARCH Pattern 1):** manual Esc for `popover="manual"` (gets NO native Esc):
```tsx
const onKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    tocPanelRef.current?.hidePopover(); // routes through the one toggle seam
  }
};
```

**Analog B (entry markup + aria-current):** `src/reader/Header.tsx` L144-157 (shell-nav link + aria-current discipline — but use `aria-current="true"`, NOT `"page"`; page denotes another-page links):
```tsx
<a href="#/" aria-current={destination === "library" ? "page" : undefined}>
  Library
</a>
```
Entry shape (intercepted link, duplicates render AS-IS per D18-11):
```tsx
<a
  href="#toc-3"                      // fragment-only, defense-in-depth
  aria-current={isCurrent ? "true" : undefined}
  onClick={(e) => { e.preventDefault(); onActivate(entry); }}
>
  {entry.text}
</a>
```

**Analog C (list/scroll/empty-state UI only, NOT the open mechanism):** `src/reader/annotations/AnnotationsDrawer.tsx` — list container, internal scrolling, calm empty state. Panel semantics: labeled `<nav aria-label="Contents">` + nested `<ul>` (host-language-first; no ARIA widget roles). Headingless note per D18-13 replaces the drawer's empty-state copy discipline.

**D18-15 open-scrolled-to-current:** on open, `scrollIntoView({ block: "nearest" })` the `aria-current` entry inside the panel's own scroll container (panel owns scrolling; no page-level scroll).

---

### `src/reader/RestorationMarker.tsx` (component, event-driven) — NEW

**Analog A (announce discipline — copy verbatim):** `src/reader/ResumeBanner.tsx` L33-47:
```tsx
<div
  className="status resume-banner"
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  ...
  {/* The region's aria-live="polite" announces this text on mount. */}
  <span className="visually-hidden">Returned to where you left off.</span>
</div>
```
The marker keeps exactly this announce pattern + copy ("Returned to where you left off." — D18-05 reuses verbatim). Drops ALL buttons/actions/copy-to-read-past (D18-06).

**Analog B (transient lifecycle):** `ArticleView.tsx` L1594-1611 — auto-dismiss registered ONLY while shown, `once: true` listeners, cleanup both:
```tsx
useEffect(() => {
  if (!showResumeBanner) return;
  const dismiss = () => setShowResumeBanner(false);
  window.addEventListener("scroll", dismiss, { passive: true, once: true });
  window.addEventListener("pointerdown", dismiss, { passive: true, once: true });
  return () => {
    window.removeEventListener("scroll", dismiss);
    window.removeEventListener("pointerdown", dismiss);
  };
}, [showResumeBanner]);
```
Marker adapts this to a timed fade (D18-07: ~few seconds → CSS opacity transition; reduced-motion = instant/step via the global gate — NEVER rAF-driven style writes, Pitfall 8). Fire on reopen-restore ONLY (D18-08) — the parent gates mounting.

---

### `src/routes/ArticleView.tsx` (controller, event-driven) — MODIFY

Three shipped seams extend in place; all line references from current file.

**1. TOC jump handler — copy the `handleNavigateBack` tail verbatim (D5-11)** (L1732-1776):
```tsx
const handleNavigateBack = useCallback(
  (highlightId: string) => {
    onCloseDrawer();
    if (!article || !articleRef.current) return;
    ...
    const offset = resolved.resolvedPosition.start;

    if (isPaginated) {
      // PAGINATED: fragmentContainingOffset (anchor.ts) → turnToPage
      const surface = surfaceRef.current;
      const pages = surface?.getPages();
      if (surface && pages && pages.length > 0) {
        const pageIdx = fragmentContainingOffset(pages, offset, article);
        surface.turnToPage(pageIdx);
      }
    } else {
      // SCROLLING: findScrollTarget + scrollIntoView (reusing Phase 2 EXACTLY)
      const blocks = queryBlocks(articleRef.current);
      const target = findScrollTarget(article, blocks, offset);
      target?.scrollIntoView({ block: "center" });
    }

    // Firefox settle guard — BOTH calls, verbatim (D4-07)
    const focusMark = () => {
      document.getElementById(`hl-${highlightId}`)?.focus();
    };
    requestAnimationFrame(focusMark);
    window.setTimeout(focusMark, 120);
  },
  [article, isPaginated, onCloseDrawer],
);
```
TOC version: offset comes from `TocEntry.offset`; destination focus resolves via `[data-block-index="${blockIndex}"]` + `tabIndex={-1}` (option b in RESEARCH Pattern 2 — avoids inventing ids, Pitfall-4 discipline; `BlockRenderer.tsx` L66-70 already forwards a `tabIndex` prop).

**2. Paginated reopen-restore (Pitfall 1 gap closure) — reuse the deep-link readiness gate** (L1343-1455):
```tsx
// Bounded rAF retry loop: (a) article truthy, (b) payload loaded,
// (c) paginated: first pagination commit (surfaceRef.getPages() non-empty)
const RETRY_CAP_MS = 5000;
...
const pages = isPaginated ? surfaceRef.current?.getPages() ?? null : null;
if (isPaginated && (!pages || pages.length === 0)) {
  if (performance.now() - startedAt >= RETRY_CAP_MS) { finish(); return; }
  requestAnimationFrame(attempt);
  return;
}
// Ready → the same D5-11 tail: fragmentContainingOffset → turnToPage
```
Restore wiring point: the existing restore effect L1462-1542 — swap `setShowResumeBanner(true)` (L1521) for marker mount; in paginated mode run the offset→page resolution through this readiness template (or feed `initialAnchorOffset` pre-commit via `currentAnchorOffsetRef`, already threaded at L2133).

**3. Paginated location saves (Pitfall 2 gap closure) — mirror `useScrollSave.ts` discipline** (`src/reader/useScrollSave.ts` L124-133 + L171-184):
```typescript
function scheduleSave(loc: LocationRecord) {
  pendingRef.current = loc;
  if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  saveTimer.current = window.setTimeout(() => { saveTimer.current = null; flush(); },
    SAVE_DEBOUNCE_MS); // 1200
}
// Dual-event flush: visibilitychange-hidden + pagehide (bfcache-safe)
document.addEventListener("visibilitychange", onVisibility);
window.addEventListener("pagehide", onPageHide);
```
Save on `handleAnchorChange` (per-turn offsets, L2134) reusing `saveLocation` + same `LocationRecord` shape — no schema change.

**Restore-effect guard to preserve** (L1472): `if (jumpPendingRef.current) return;` — deep-link jump wins over restore; marker must not fire on deep-link arrivals (D18-08).

---

### `src/reader/Header.tsx` (component, request-response) — MODIFY

**Analog: itself — the tags-trigger block** (L177-188), copied for the contents trigger (5th button, inline-START of the group so it reads `[contents][tags][annotations][mode][gear]` per D18-02):
```tsx
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
Notes: (a) mirror the 44×44 quiet-button geometry + `--ink-soft` default / `--accent` on `aria-expanded="true"` (Header.tsx L19-24 discipline); (b) `aria-haspopup` — the TOC panel is NOT a dialog (Pitfall 3); omit `aria-haspopup="dialog"` or use a truthful value — planner decides with UI-SPEC; (c) glyph anatomy: copy `TagIcon`/`HighlighterIcon` shape exactly (L301-318: 20×20 viewBox 24, `strokeWidth="1.75"`, `aria-hidden`, `focusable="false"`); (d) NEW PROP TRIO: `tocOpen` / `onToggleToc` mirror `tagsOpen` / `onToggleTags` (L73-81 — App owns open state, the drawerOpen pattern).

---

### `src/reader/SectionAnnouncer.tsx` (component, event-driven) — MODIFY

**Analog: itself.** Replace the inline detection effect (L48-113, excerpted under `sectionSpy.ts` above) with a call to the extracted module, selector `"h2, h3, h4"`. The announce string `` `Section: ${text}.` `` (L76) and every visible behavior must stay byte-identical — `tests/e2e/section-announce.spec.ts` diff must be ZERO (Pitfall 5 warning sign).

---

### `src/app.css` (config/styles) — MODIFY

Four concrete sites:

1. **Retire** `.resume-banner*` rules L1009-1083 (+ the L3650-3692 narrow-tuning block per RESEARCH) — delete as one inventoried task (Pitfall 9).
2. **Reduced-motion gate already covers new motion** (L84-92) — marker fade MUST be a CSS `transition` so this gate kills it:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
}
```
3. **≤639px geometry re-check** — extend the L3725-3751 block; the measured 320px budget is documented at L3705-3723 (4×46px controls leave ~10px slack; 5th 44px button ≈ ~40px deficit — UI-SPEC decision, candidates in RESEARCH Pitfall 6). Keep the honesty rules: `.header-start { flex-shrink: 0 }` (deficit = real overflow, never silent overlap), 44px touch targets non-negotiable, 48px row.
4. **New panel/marker/trigger styles** — place overrides at FILE END (the L3715-3717 cascade lesson: an earlier same-specificity rule lost to the base `.header-controls` gap at ~L1379). Use POLISH-07 tokens (`--space-*`, `--hairline`, `--touch`, `--ink-soft`); popover closed-state hiding comes free from UA `display:none` — do not hand-roll.

---

### `tests/unit/toc.test.ts` (test, unit) — NEW

**Analog:** `tests/unit/normalizeText.test.ts` (pure-module Vitest shape):
```typescript
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import { ... } from "../../src/content/normalizeText";
import type { CanonicalArticle } from "../../src/content/types";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "norm-test", revision: 1, lang: "en",
  provenance: { sourceUrl: "...", title: "...", retrievedAt: "...", originalHtmlHash: "..." },
};

describe("...", () => {
  it("...", () => { expect(...).toBe(...); });
});
```
Cover (Wave 0): skipped-level nesting without invention, duplicates as-is, `blockStartOffsets` destination correctness, headingless → Top-only, h1 exclusion, Top entry at offset 0.

---

### `tests/e2e/toc/toc-navigation.spec.ts` (test, e2e) — NEW

**Analog:** `tests/e2e/chrome/tag-popover.spec.ts` — copy its harness conventions wholesale:

- **Seeding** (L30, L60-64, L141-143): `prepareFreshPage` (image-stub + app-boot + clear-stores — NEVER `deleteDatabase`) + `makeArticle`/`seedRows` from `../portability/_portability`; for the TOC corpus (skips/duplicates/h5-h6/chapter) use `seedArticleRows` from `reading-views.spec.ts` L506-535 (ArticleSchema.parse in Node → raw IndexedDB puts; chapter rows carry denormalized `bookId`).
- **Article-readiness sentinel** (L83-101 — no fixed sleeps):
```typescript
await page.waitForFunction(
  () => {
    const visible =
      document.querySelector(".page-fragment [data-block-index]") ??
      document.querySelector(
        ".article-body:not(.article-body-measurement) [data-block-index]",
      );
    return !!visible;
  },
  undefined,
  { timeout: 10_000 },
);
```
- **Focus-restore assertion with the WebKit exception** (L113-132): chromium/firefox poll `document.activeElement === trigger`; webkit asserts the weaker "not trapped in closed surface" (documented drawer-view quirk).
- **Esc + outside-activation coverage** (L192-216): light-dismiss point computed from the popover's boundingBox, not hardcoded offsets.
- **Axe pass on the open-panel state** (L247-259): `AxeBuilder.withTags([...WCAG_TAGS])`, assert zero serious/critical.
- **Zero fixed sleeps** (file convention, L19-21); expect/expect.poll only.

Add: entry activation closes panel + focuses destination heading (visible focus cue, D18-03); same-offset equivalence across both modes (ORNT-03); `aria-current` follows scroll/turn (D18-12); Enter activation on entries (Pitfall 4 — un-intercepted activation must not re-route).

### `tests/e2e/toc/toc-geometry.spec.ts` (test, e2e) — NEW

**Analog:** same tag-popover harness + joins the D6-09 `assertEdgeInvariant` helper (`tests/e2e/_edge-invariant.ts`) and existing touch-target/reflow/high-zoom suites. Assert at 320px/400%: no focus trap (Tab escapes panel → page, D18-04), open/close never changes logical location (scroll offset / current page stable), no inert obscuring, 5-button header passes the touch-target audit.

### `tests/e2e/toc/restoration-cue.spec.ts` (test, e2e) — NEW

**Analog:** `tests/e2e/chrome/mobile-first-page-chrome.spec.ts` L59-91 — the seed-location + reload + assert-restore shape:
```typescript
await page.evaluate(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lem-reader");
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("location", "readwrite");
      transaction.objectStore("location").put({
        schemaVersion: 1,
        articleId: "essay-long-form",
        revision: 1,
        graphemeOffset: 500,
        savedAt: new Date().toISOString(),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
});
await page.reload();
await expect(page.getByRole("status").filter({ hasText: "You left off here" })).toBeVisible();
```
Swap the last assertion for marker presence + "Returned to where you left off." announce; add presence-then-absence with generous timeouts (~4s fade, RESEARCH OQ5), no-dismissal-interaction, content-not-shifted, and (after OQ1/OQ2 closure) the paginated-mode variant: reopen lands on the saved page with the marker at that page's edge.

### Banner-retirement modifications (2 sites, phase-owned)

- `tests/e2e/chrome/mobile-first-page-chrome.spec.ts` L79: `.filter({ hasText: "You left off here" })` → marker assertion; geometry checks L84-91 referencing `.resume` box re-target the marker.
- `tests/e2e/library/reading-views.spec.ts` L1017-1020: `page.locator(".resume-banner")` + `"You left off here"` → marker assertions; keep the restore-beats-h1 invariant (`articleH1` not focused, L1020).

## Shared Patterns

### 1. Controlled popover + ONE toggle-event close seam (focus discipline)
**Source:** `ArticleView.tsx` L338-375
**Apply to:** TocPanel, ArticleView TOC state, Header trigger.
Every close path (button toggle, Esc, entry activation, view swap) funnels through the single `toggle` listener → state sync + focus restore to trigger. A second focus-restore path is the anti-pattern.

### 2. Polite status-region announce
**Source:** `ResumeBanner.tsx` L36-47 / `SectionAnnouncer.tsx` L115-124 / `TagEntry.tsx` L149-158
**Apply to:** RestorationMarker announce, any TOC SR feedback.
```tsx
<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
  {message}
</div>
```
Freshly-inserted regions announce initial content — mount-time announce needs no extra effect.

### 3. Mode-aware offset jump tail (D5-11)
**Source:** `ArticleView.tsx` L1732-1776 (+ deep-link copy L1422-1445)
**Apply to:** TOC entry activation, paginated restore closure.
`fragmentContainingOffset(pages, offset, article) → surfaceRef.current.turnToPage(idx)` (paginated) / `findScrollTarget(article, queryBlocks(el), offset) → scrollIntoView` (scrolling), then `requestAnimationFrame(fn); window.setTimeout(fn, 120)` focus guard. Import from `restoreLocation.ts`/`anchor.ts` — never reimplement.

### 4. rAF-coalesced listeners + full cleanup
**Source:** `SectionAnnouncer.tsx` L94-112, `ArticleView.tsx` L1571-1592, `useScrollSave.ts`
**Apply to:** sectionSpy, any TOC/marker scroll listeners. Passive listeners, rAF coalescing, cancel timers/frames in cleanup, debounce constants (250ms announce / 1200ms save).

### 5. Reduced-motion = CSS transitions only
**Source:** `app.css` L84-92 global gate
**Apply to:** marker fade, panel slide/sheet motion. No rAF-driven style writes anywhere in new code (Pitfall 8).

### 6. Canonical offsets as the only location currency; TOC never persisted
**Source:** `normalizeText.ts` L137-195 (`articleGraphemeIndex.blockStartOffsets`), `restoreLocation.ts`, `anchor.ts`
**Apply to:** toc.ts derivation, jump handler, marker attach. Zero Dexie writes/schema changes this phase (Pitfall 9); derived page/DOM positions computed, never stored.

### 7. DOM resolution scoped to the VISIBLE surface
**Source:** `ArticleView.tsx` L201-205 (`queryBlocks` = `[data-block-index]`) + tag-popover sentinel's `.article-body:not(.article-body-measurement)` guard
**Apply to:** TOC destination focus, sectionSpy, marker attach. In paginated mode the hidden measurement clone (L2099) also carries `[data-block-index]` — always exclude it (Pitfall 7).

### 8. ResumeBanner retirement = one inventoried 4-surface task
**Sites:** `src/reader/ResumeBanner.tsx` (delete) · `ArticleView.tsx` (`showResumeBanner` state L243, auto-dismiss L1594-1611, `handleResume`/`handleStartFromTop` L1697-1715, render mount) · `app.css` L1009-1083 + L3650-3692 · 2 e2e assertion sites. Acceptance: `grep "resume-banner|Resume reading|Start from top"` returns zero hits.

### 9. Test discipline (strengthen-only + honest gate)
**Source:** `section-announce.spec.ts` (byte-stable contract), tag-popover.spec.ts (zero fixed sleeps, webkit focus-restore exception), `reading-views.spec.ts` L506-535 (`seedArticleRows`)
**Apply to:** all new specs. Only the 2 banner sites retire (phase-owned); everything else strengthens only; full `npm run test` exit 0 recorded honestly.

## No Analog Found

Sub-patterns with no shipped precedent — planner uses RESEARCH.md patterns + explicit plan documentation (these are the phase's genuinely NEW code):

| Sub-pattern | File | Reason | RESEARCH Reference |
|------|------|--------|--------------------|
| `popover="manual"` persistent non-modal panel | `TocPanel.tsx` | First non-dialog overlay in the codebase (5 shipped dialogs use `<dialog>`/showModal; tag popover uses `popover="auto"` light-dismiss). Manual state = no native Esc/outside-dismiss | Pattern 1 (adapted tag seam) + Pitfall 3 |
| Hand-rolled Esc keydown on a popover | `TocPanel.tsx` | No existing hand-rolled Esc (dialogs/popover=auto get it native) | Code Examples §Manual Esc |
| Full-width sheet at narrow width | `TocPanel.tsx` + `app.css` | No sheet surface ships; closest geometry precedents are the ≤639px wordmark collapse (app.css L3725) and dialog centering | OQ3/OQ4 — UI-SPEC decision |
| 5-button ≤639px header relief | `Header.tsx` + `app.css` | Sanctioned relief ladder exhausted (~40px deficit documented L3705-3723) | Pitfall 6 candidates (a)-(d) |

## Metadata

**Analog search scope:** `src/` (reader, content, pagination, routes, ingestion/library), `tests/unit/`, `tests/e2e/` (chrome, library, annotations, pagination, portability helpers), `src/app.css` targeted blocks
**Files scanned:** 20 source/test files read (TagEntry, ResumeBanner, SectionAnnouncer, Header, restoreLocation, normalizeText L100-209, schema L40-99, anchor, ArticleView targeted L185-229/L318-402/L1326-1619/L1700-1779/L2080-2154, useScrollSave, PaginatedSurface L125-189, BlockRenderer targeted, app.css targeted L80-97/L1005-1099/L3694-3755, tag-popover.spec, reading-views.spec targeted, mobile-first-page-chrome.spec targeted, section-announce.spec, normalizeText.test)
**Pattern extraction date:** 2026-08-30
**Confidence:** HIGH — every load-bearing excerpt read directly this session; line numbers current as of Phase 18 planning
