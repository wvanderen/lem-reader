# Phase 5: Durable Highlights and Notes - Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 20 new/modified source files + 7 unit test files + e2e suite
**Analogs found:** 20 / 20 (every file has at least a role-match analog — Phase 5 adds ZERO new infrastructure categories)

> **Headline finding:** Phases 1–4 already shipped every load-bearing substrate this phase consumes.
> The D-05 grapheme coordinate, the `TextPositionSelector`/`TextQuoteSelector` types + `deriveQuoteSelector()`,
> the reserved Dexie `highlights`/`notes` stores, the source-offset `PageFragment` model + `data-block-index`
> 1:1 mapping, and the D4-10/D4-11 anchor machinery all exist. Phase 5 is **domain logic that connects these
> existing seams** — every new file has a concrete in-repo analog whose imports, structure, error handling,
> and conventions it should mirror.

## File Classification

### New source files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/annotations/capture.ts` | service (pure + DOM read) | request-response (Selection → TextPositionSelector) | `src/reader/restoreLocation.ts` (reverse direction) + `src/content/normalizeText.ts` | exact |
| `src/annotations/resolution.ts` | service (pure logic) | transform (TextQuoteSelector → position \| "ambiguous" \| "orphan") | `src/content/normalizeText.ts` (`deriveQuoteSelector` sibling) + `src/pagination/anchor.ts` | exact |
| `src/annotations/overlap.ts` | utility (pure logic) | transform (range-intersection check) | `src/pagination/fragmentRenderer.tsx` (`resolveBlockSlice` range math) | role-match |
| `src/annotations/highlightRanges.ts` | service (pure logic) | transform (block↔highlight intersection + run slicing) | `src/pagination/splitBlock.ts` (`splitParagraphRuns`) + `fragmentRenderer.tsx` | exact |
| `src/persistence/highlightsStore.ts` | store (persistence seam) | CRUD | `src/persistence/locationStore.ts` | exact |
| `src/persistence/notesStore.ts` | store (persistence seam) | CRUD | `src/persistence/locationStore.ts` + `settingsStore.ts` | exact |
| `src/reader/annotations/useAnnotationState.ts` | hook | event-driven + CRUD (debounced save) | `src/reader/useScrollSave.ts` + `src/settings/SettingsContext.tsx` | exact |
| `src/reader/annotations/HighlightOverlay.tsx` | provider (React context) | event-driven (state distribution) | `src/settings/SettingsContext.tsx` (`SettingsProvider`) | exact |
| `src/reader/annotations/SelectionToolbar.tsx` | component (transient positioned) | request-response (tracks live selection) | `src/reader/ProgressHairline.tsx` + `PaginationFallbackBanner.tsx` | partial (no position:fixed analog exists) |
| `src/reader/annotations/NotePopover.tsx` | component (Popover API) | request-response (popover lifecycle) | `src/reader/SettingsPanel.tsx` (dialog lifecycle) + `WipeConfirm.tsx` (two-step confirm) | role-match |
| `src/reader/annotations/AnnotationsDrawer.tsx` | component (native `<dialog>`) | request-response (slide-over) | `src/reader/SettingsPanel.tsx` | exact |

### Modified existing files

| Modified File | Role | Change Scope | In-file Analog |
|---------------|------|--------------|-----------------|
| `src/content/normalizeText.ts` | service | Fill the stubbed `resolveQuoteSelector` (L149-152) per D5-02 | existing `deriveQuoteSelector` (L133-147) |
| `src/content/schema.ts` | model | Add `HighlightRecordSchema` + `NoteRecordSchema` (+ nested selector schemas) | existing `LocationRecordSchema` (L245-251) |
| `src/content/render/BlockRenderer.tsx` | component | `ArticleBody`/`BlockView` thread resolved highlights to `InlineList` | existing `ArticleBody` block map + `data-block-index` (L129-167) |
| `src/content/render/InlineRenderer.tsx` | component | `InlineList` wraps highlighted run slices in `<mark>` | existing `Inline` mark-wrapping loop (L11-35) |
| `src/persistence/db.ts` | config | Replace placeholder `Table<>` annotations on `highlights`/`notes` (L43-47) with real row types; NO version bump | existing `location!: Table<LocationRecordRow, [string, number]>` (L41) |
| `src/reader/Header.tsx` | component | Add annotations-trigger button inline-start of `ModeToggle` in `.header-controls` | existing `gear-button` (L62-75) |
| `src/pagination/fragmentRenderer.tsx` | component | `PageFragmentView` passes per-fragment highlight slices to `BlockView` (D5-16) | existing `resolveBlockSlice` (L98-131) |
| `src/routes/ArticleView.tsx` | route | Wire selection listener + H/N shortcuts + popover/drawer coordination + `user-select:none` on `.article-body-measurement` | existing M-shortcut global listener (L309-329) + mode-aware branch (L770-828) |
| `src/app.css` | config | Add `--highlight` token (3 themes) + `mark.highlight` styles + toolbar/popover/drawer styles + forced-colors overrides | existing `:root` token block (L6-37) + `[data-theme]` overrides (L43-65) + `.status` (L257-270) |

### Test files (Wave 0)

| Test File | Role | Closest Test Analog |
|-----------|------|---------------------|
| `tests/unit/annotations/resolve-quote-selector.test.ts` | unit (pure logic) | `tests/unit/selectors.test.ts` |
| `tests/unit/annotations/capture-offset-mapping.test.ts` | unit (DOM stubs + pure logic) | `tests/unit/restoreLocation.test.ts` |
| `tests/unit/annotations/selector-roundtrip.test.ts` | unit (round-trip invariant) | `tests/unit/selectors.test.ts` |
| `tests/unit/annotations/highlight-schema.test.ts` | unit (Zod boundary) | `tests/unit/locationSchema.test.ts` + `settingsSchema.test.ts` |
| `tests/unit/annotations/highlights-store-error.test.ts` | unit (STATE-05 routing) | `tests/unit/storageFallback.test.ts` |
| `tests/unit/annotations/overlap.test.ts` | unit (range math) | `tests/unit/pagination/*.test.ts` |
| `tests/e2e/annotations/*.spec.ts` | e2e (real-browser corpus matrix) | `tests/e2e/pagination/*.spec.ts` + `tests/e2e/forced-colors.spec.ts` |

---

## Pattern Assignments

### `src/persistence/highlightsStore.ts` (store, CRUD)

**Analog:** `src/persistence/locationStore.ts` (read in full — 112 lines). This is the **closest possible analog**: same Dexie seam, same compound-key store, same Zod-at-boundary + `classifyStorageError` discipline. Copy its structure verbatim and swap the schema + the query.

**Imports pattern** (`locationStore.ts` L24-28):
```typescript
import { db } from "./db";
import type { LocationRecordRow } from "./db";
import { LocationRecordSchema } from "../content/schema";
import type { LocationRecord } from "../content/schema";
import { classifyStorageError } from "./errors";
```

**Discriminated LoadResult + "never throws" contract** (`locationStore.ts` L30-42) — copy this shape exactly, rename to `HighlightsLoadResult`:
```typescript
export type LocationLoadResult =
  | { ok: true; location: LocationRecord | null }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };
```

**Read-path: try → safeParse per row → classify** (`locationStore.ts` L63-88). Phase 5 differs in two ways, both called out in RESEARCH.md §Pattern 3:
1. **Compound-index range query** for cross-revision lookup (D5-01): `db.highlights.where("[articleId+revision]").between([articleId, 0], [articleId, Number.MAX_SAFE_INTEGER])` — NOT `db.highlights.get([id, rev])`. (Pitfall 6.)
2. **Validate each row + drop invalid** (defensive — a single corrupt row must not block all highlights), unlike locationStore's single-record "corrupt → route to WipeConfirm". Loop `HighlightRecordSchema.safeParse(row)` and push successes.

**Save (upsert) — throws propagate** (`locationStore.ts` L101-111): `await db.highlights.put(h)`.

**Cascade-delete via Dexie transaction** (RESEARCH.md §Pattern 3 + Pitfall 10) — NEW pattern not in locationStore:
```typescript
export async function deleteHighlight(highlightId: string): Promise<void> {
  await db.transaction("rw", db.highlights, db.notes, async () => {
    await db.highlights.delete(highlightId);
    await db.notes.where("highlightId").equals(highlightId).delete();
  });
}
```
D5-12: "A highlight and its note are removed together." Dexie transaction = atomic.

---

### `src/persistence/notesStore.ts` (store, CRUD)

**Analog:** `src/persistence/locationStore.ts` + `src/persistence/settingsStore.ts` (sibling seam).
- 1:1 via `highlightId` index (already declared in `db.ts` L61: `notes: "id, highlightId"`).
- Load by highlightId: `db.notes.where("highlightId").equals(highlightId).first()`.
- Empty-text note = no NoteRecord (delete or never create) per D5-10.
- Mirror `settingsStore.ts` L84-86 single-record `put` for save; mirror `locationStore.ts` safeParse-on-read for load.
- No cascade-delete here — `deleteHighlight` owns the transaction (above).

---

### `src/content/schema.ts` additions (model, Zod-at-boundary)

**In-file analog:** `LocationRecordSchema` (`schema.ts` L245-251):
```typescript
export const LocationRecordSchema = z.object({
  schemaVersion: z.literal(1), // STATE-04 migration hook
  articleId: z.string().regex(/^[a-z0-9-]+$/), // matches ArticleSchema.id (D-06)
  revision: z.number().int().min(1), // D-06 monotonic
  graphemeOffset: z.number().int().min(0), // D-05 offset into normalizeText
  savedAt: z.string().datetime(), // ISO-8601 — used for last-write-wins tiebreak
});
export type LocationRecord = z.infer<typeof LocationRecordSchema>;
```

**Add** (per RESEARCH.md §Pattern 3 — schemas are single source of truth here):
- `TextPositionSelectorSchema` (`z.object({ start, end }).refine(s => s.end > s.start)`) — mirrors the existing interface at `normalizeText.ts` L117-120 (grapheme offsets, start-inclusive/end-exclusive).
- `TextQuoteSelectorSchema` (`z.object({ prefix, exact: z.string().min(1), suffix })`) — mirrors `normalizeText.ts` L123-127.
- `HighlightRecordSchema` — `schemaVersion: z.literal(1)`, `id`, `articleId` (reuse the `/^[a-z0-9-]+$/` regex), `revision: z.number().int().min(1)`, `position: TextPositionSelectorSchema`, `quote: TextQuoteSelectorSchema`, `createdAt: z.string().datetime()`.
- `NoteRecordSchema` — `schemaVersion: z.literal(1)`, `id`, `highlightId`, `text: z.string()` (NEVER HTML — Pitfall 8 XSS defense), `updatedAt: z.string().datetime()`.

**Note text security** (RESEARCH.md §Security Domain V5 + Pitfall 8): `text: z.string()` with NO HTML parsing. React escapes text children by default; the `react/no-danger` ESLint rule (enabled since Phase 1) statically forbids `dangerouslySetInnerHTML`. `id` is `crypto.randomUUID()` (RESEARCH.md Open Question #2 recommendation) — no collision with `fn-N` footnote IDs.

---

### `src/persistence/db.ts` modification (config, type-annotation fix)

**In-file analog:** `location!` annotation (`db.ts` L41):
```typescript
location!: Table<LocationRecordRow, [string, number]>;
```

**Change** (`db.ts` L43-47) — replace the PLACEHOLDER annotations with real row types. NO `version()` block edit (Pitfall 9 — never edit shipped v1/v2 blocks; RESEARCH.md confirms v1 declarations are sufficient):
```typescript
// CURRENT (Phase 1 placeholder):
highlights!: Table<{ id: string; "[articleId+revision]": string }, string>;
notes!: Table<{ id: string; highlightId: string }, string>;

// PHASE 5 (real row types — mirrors LocationRecordRow):
highlights!: Table<HighlightRecordRow, string>;
notes!: Table<NoteRecordRow, string>;
```
Runtime-unaffected (Dexie resolves stores by name from version declarations, not TS types). STATE.md Phase 02-02 authorized this exact `Table<>` definite-assignment pattern. Define `HighlightRecordRow` / `NoteRecordRow` interfaces next to the existing `LocationRecordRow` (`db.ts` L25-31) — they equal the Zod-inferred record types.

---

### `src/content/normalizeText.ts` — `resolveQuoteSelector` (service, transform)

**In-file analog:** `deriveQuoteSelector` (`normalizeText.ts` L133-147) — the sibling function. Phase 5 implements the **already-shipped tri-state contract stub** at L149-152. Reuse the same imports already in this file (`graphemeClusters`, `normalizeText`).

**Locked contract** (stub L149-152, return shape pre-locked by Phase 1):
```typescript
resolveQuoteSelector(article, selector): TextPositionSelector | "ambiguous" | "orphan"
```

**Pure function — jsdom-safe.** Mirror the discipline of `src/pagination/anchor.ts` (pure offset math, no DOM, no React, header comment citing locked decisions). D5-02 algorithm (exact-first → prefix/suffix disambiguate → orphan fallback) is in RESEARCH.md §Pattern 2 with full pseudocode.

> **Planner discretion:** the implementation may live inline in `normalizeText.ts` (filling the stub) OR in `src/annotations/resolution.ts` with `normalizeText.ts` re-exporting. The contract + signature stay in `normalizeText.ts`. Either path is fine; the in-file analog is the same (`deriveQuoteSelector`).

---

### `src/annotations/resolution.ts` (service, transform) — if separated

**Analog:** `src/pagination/anchor.ts` (pure passage-anchor helpers, 112 lines). Copy its **module-header discipline** (L1-21): cite the locked decisions (D5-01/D5-02), declare "Pure domain logic — no DOM, no React, no side effects. jsdom-safe to unit test with synthetic fixtures," and the REUSE-DO-NOT-FORK warning citing `normalizeText`/`graphemeClusters`.

**Imports pattern** (`anchor.ts` L23-29):
```typescript
import type { CanonicalArticle } from "../content/types";
import {
  BLOCK_SEPARATOR,
  blockNormalizedText,
  graphemeClusters,
} from "../content/normalizeText";
```

---

### `src/annotations/capture.ts` (service, request-response + DOM read)

**Analog:** `src/reader/restoreLocation.ts` (147 lines) — **the reverse direction**. `restoreLocation` maps article-global grapheme offset → DOM block; `capture` maps DOM Selection/Range → article-global grapheme offset. Both MUST reuse the SAME `normalizeRunText` + `graphemeClusters` from `normalizeText.ts` (Pattern 5 — never fork normalization; any divergence shifts every anchor).

**Imports pattern** (`restoreLocation.ts` L20-25):
```typescript
import type { CanonicalArticle } from "../content/types";
import {
  BLOCK_SEPARATOR,
  graphemeClusters,
  normalizeRunText,
} from "../content/normalizeText";
```

**The load-bearing detail** (RESEARCH.md §Pattern 1 + Pitfall 1): `normalizeRunText` collapses `[\t\n\f\r ]+` to a single space and trims; `inlineText` joins runs with `" "`. The DOM renders adjacent runs WITHOUT separators. Build an explicit DOM-offset → normalized-grapheme-offset map by walking the block's text nodes (TreeWalker SHOW_TEXT) and aligning raw text to normalized text via the whitespace-collapse rules. NEVER use `selection.toString()` as the anchor (Pitfall 2 — whitespace serialization varies by engine).

**Discriminated invalid-result shape** (RESEARCH.md §Pattern 1):
```typescript
export type CaptureResult =
  | { ok: true; blockIndex: number; position: TextPositionSelector }
  | { ok: false; reason: "empty" | "multi-block" | "ineligible" | "measurement-body" };
```

**Block-ancestor lookup** uses `data-block-index` (D5-08) — the SAME attribute `ArticleView.queryBlocks` (`ArticleView.tsx` L87-91) already queries:
```typescript
function queryBlocks(articleEl: HTMLElement): HTMLElement[] {
  return Array.from(articleEl.querySelectorAll<HTMLElement>("[data-block-index]"));
}
```

---

### `src/annotations/overlap.ts` (utility, transform)

**Analog:** Range-intersection math in `src/pagination/fragmentRenderer.tsx` (`resolveBlockSlice` L98-131 + `sliceChildBlocks` L256-280). The disjoint-range check (D5-13) is a simpler 1-D interval-intersection test: given a candidate `[start, end)` and each persisted highlight's `[hlStart, hlEnd)`, reject if `Math.max(start, hlStart) < Math.min(end, hlEnd)`. Pure function, no DOM. Mirror `fragmentRenderer.tsx`'s exhaustive per-kind handling if per-kind eligibility is folded in here.

---

### `src/annotations/highlightRanges.ts` (service, transform)

**Analog:** `src/pagination/splitBlock.ts` (`splitParagraphRuns` L186-221) + `src/pagination/fragmentRenderer.tsx` (`sliceParagraph` L146-177).

**Reuse `splitParagraphRuns` verbatim** (RESEARCH.md §Pattern 4 + "Don't Hand-Roll"): it already preserves inline marks across splits (Pitfall 4 — a link split by a highlight boundary becomes two link runs). The `<mark>` overlay walks the block's `InlineRun[]`, calls `splitParagraphRuns` at each highlight boundary, and wraps the highlighted slice in `<mark>`. **Do not reimplement run slicing.**

**Cross-fragment intersection** (RESEARCH.md §Code Examples "Cross-Fragment Highlight Slicing" + §Pattern 4): for each `PageFragment` entry `{ blockIndex, startGrapheme, endGrapheme }`, compute the article-global range and intersect with the highlight range:
```typescript
const intersectStart = Math.max(highlight.start, entryStart);
const intersectEnd = Math.min(highlight.end, entryEnd);
if (intersectStart < intersectEnd) { /* render <mark> for the visible slice */ }
```

---

### `src/reader/annotations/useAnnotationState.ts` (hook, event-driven + CRUD)

**Analogs:** `src/reader/useScrollSave.ts` (197 lines) + `src/settings/SettingsContext.tsx` (L60-177).

Copy the **debounced-save + dual-event-flush pattern** verbatim from `SettingsContext` (D2-03 — the note persistence cadence pattern notes reuse per CONTEXT.md). Key excerpts:

**Debounce timer + pending ref** (`SettingsContext.tsx` L67-68, L113-129):
```typescript
const saveTimer = useRef<number | null>(null);
const pendingRef = useRef<ReaderSettings | null>(null);

const scheduleSave = useCallback((next: ReaderSettings) => {
  pendingRef.current = next;
  if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  saveTimer.current = window.setTimeout(() => {
    saveTimer.current = null;
    const s = pendingRef.current;
    if (!s) return;
    pendingRef.current = null;
    saveSettings(s).catch((e) => setStorageState(classifyStorageError(e)));
  }, SAVE_DEBOUNCE_MS);
}, []);
```

**Flush on visibilitychange-hidden + pagehide** (`SettingsContext.tsx` L154-165) — bfcache-safe; the deprecated session-end events are FORBIDDEN:
```typescript
useEffect(() => {
  const onVisibility = () => { if (document.visibilityState === "hidden") flushSave(); };
  const onPageHide = () => flushSave();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}, [flushSave]);
```

**Load-on-mount cancelled-flag pattern** (`SettingsContext.tsx` L81-105 + `ArticleView.tsx` L455-484) — a slow load cannot overwrite a fast in-flight update. Mirror exactly for `loadHighlights(articleId)`.

**Error routing** — `classifyStorageError(e)` from `src/persistence/errors.ts` (read in full — 71 lines). Never throw to the reader (STATE-05). Annotation persistence failures route to the EXISTING `StorageBanner` (no new surface).

**Resolution timing** (RESEARCH.md Open Question #1 — planner discretion): recommend eager batch-resolve on open (`resolveQuoteSelector` is a pure function; same-revision path is sub-ms).

---

### `src/reader/annotations/HighlightOverlay.tsx` (provider, event-driven)

**Analog:** `src/settings/SettingsContext.tsx` (`SettingsProvider`, L60-213) — the codebase's first and only React context provider. Copy its structure:
- `createContext<Value | null>(null)` + `useX()` hook that throws if used outside the provider (L55, L215-220).
- `useMemo` for the context value to keep it referentially stable (L179-210).
- The provider holds the resolved-highlight state + CRUD handlers + debounced note save (delegated to `useAnnotationState`).

Distribute: `{ highlights: ResolvedHighlight[], createHighlight, updateNote, deleteHighlight, openPopoverFor, ... }`. `ResolvedHighlight` carries the tri-state (`"confident" | "ambiguous" | "orphan"`) so the renderer + drawer can branch (D5-04).

---

### `src/reader/annotations/AnnotationsDrawer.tsx` (component, request-response)

**Analog:** `src/reader/SettingsPanel.tsx` (297 lines) — **copy the `<dialog>`/`showModal` lifecycle verbatim** (D5-09: "reuses the D2-01 native `<dialog>` slide-over pattern"). The drawer is a sibling `<dialog class="annotations-drawer">` with the SAME sheet geometry as `.settings-panel`.

**Dialog open/close + focus-restore** (`SettingsPanel.tsx` L42-79) — Pitfall 1: `showModal()` does NOT auto-restore focus to the trigger. Capture `document.activeElement` on open, restore in the `close` listener:
```typescript
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  if (open && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    dlg.showModal();
    const first = dlg.querySelector<HTMLElement>("button, [href], input, ...") ?? dlg;
    first.focus();
  } else if (!open && dlg.open) {
    dlg.close();
  }
}, [open]);

useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  const handleClose = () => { onClose(); triggerRef.current?.focus(); };
  dlg.addEventListener("close", handleClose);
  return () => dlg.removeEventListener("close", handleClose);
}, [onClose]);
```

**Drawer body** — `<ol>` of entries in reading order (D5-09: grapheme-start-offset ascending; no sort/filter for MVP per UI-SPEC §Interaction 30). Each `<li>` contains one jump `<button class="drawer-entry">` (whole row = jump affordance) + sibling action buttons (`Edit note` / `Delete`) OUTSIDE the jump button. Empty-state reuses the `.status` card pattern (`PaginationFallbackBanner.tsx` L43-49 shows the `role="status"` + `.status` class combo).

**Ambiguous/orphan entries** (D5-04): jump button `disabled`; visually-hidden note appended to `aria-label` ("This highlight can't be located, so jumping is disabled."). Edit disabled; Delete stays enabled.

---

### `src/reader/annotations/NotePopover.tsx` (component, request-response)

**Analogs:** `src/reader/SettingsPanel.tsx` (lifecycle/focus discipline) + `src/reader/WipeConfirm.tsx` (two-step confirm).

**Mechanism difference from the drawer:** Popover API (`popover="manual"`) — NOT `<dialog>`/`showModal`. UI-SPEC §Design System locks this: `<dialog>` is too heavy (centered + backdrop); the popover needs top-layer + no light-dismiss + no backdrop. `showPopover()`/`hidePopover()` controlled by React state.

**Two-step delete confirm** (D5-12 — mirrors WipeConfirm, Pitfall 8) — copy `WipeConfirm.tsx` L85-102 + L120-143:
- Step 1: `Delete` button (border uses `--destructive`).
- Step 2: confirm prompt replaces popover body; **non-destructive default focus** via `[data-initial-focus]` on the Keep button — an accidental Enter cannot delete:
```typescript
const initial =
  dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
  dlg.querySelector<HTMLElement>("button, ...") ?? dlg;
initial.focus();
```
- Destructive button: `--destructive` border + text; hover inverts (fill `--destructive`, text `--surface`). Keep button: neutral `--hairline` border.

**Debounced note save** — delegate to `useAnnotationState` (the hook owns the `scheduleNoteSave`/`flushNoteSave` from the SettingsContext pattern above). On `Done`/`Escape`: final flush before close so no edit is lost. Empty textarea = no NoteRecord (D5-10).

**Focus management:** on open via "Highlight + note" → focus the empty textarea; on open via activating an existing highlight → focus the textarea with existing text selected; on `Done`/`Escape` → focus back to the `<mark>` (mirrors the gear-button trigger-restore pattern).

---

### `src/reader/annotations/SelectionToolbar.tsx` (component, request-response)

**Analogs (partial — no `position: fixed` analog exists):** `src/reader/ProgressHairline.tsx` (fixed-positioned, tracks scroll) + `src/reader/PaginationFallbackBanner.tsx` (transient chrome, lifecycle).

**Mechanism** (UI-SPEC §Design System + §Interaction 25): a conditionally-rendered `position: fixed` element. NOT a popover (would light-dismiss on the `mouseup` that finalizes the selection), NOT a `<dialog>` (too heavy). `z-index: 8` (above content at 1 + hairline/chevrons at 5; below header at 10 + top-layer dialogs/popovers).

**Geometry** (UI-SPEC §Layout): computed from `selection.getRangeAt(0).getBoundingClientRect()` on each `selectionchange` (rAF-throttled). Edge-clamp horizontally to `--space-sm` from viewport edge; flip-below when <60px above. In paginated mode, clamp to page content-box width (not full viewport) to avoid the page-turn chevrons.

**Lifecycle:** appears on a VALID non-collapsed single-block selection (D5-06); dismisses on collapse, `Escape`, action activation, page turn, mode switch, drawer/settings open, or popover open. Shows the invalid-selection hint (multi-block / overlap) in place of the buttons when the selection is invalid (D5-06/D5-13 + UI-SPEC §Interaction 34).

**Reduced motion:** instant mount/unmount, no transition/animation property (A11Y-06 — mirrors `ProgressHairline.tsx` L17 "the global reduced-motion gate is trivially satisfied").

---

### `src/content/render/InlineRenderer.tsx` modification (component)

**In-file analog:** the existing `Inline` mark-wrapping loop (L11-35):
```typescript
function Inline({ run }: { run: InlineRun }) {
  let node: React.ReactNode = run.text;
  for (const mark of run.marks) {
    switch (mark.type) {
      case "strong": node = <strong>{node}</strong>; break;
      case "em": node = <em>{node}</em>; break;
      case "code": node = <code>{node}</code>; break;
      case "link": node = <a href={mark.href} title={mark.title}>{node}</a>; break;
    }
  }
  return <>{node}</>;
}
```

**Change:** `InlineList` accepts an optional `highlights` prop (highlight ranges intersecting THIS block). When present, walk the runs, call `splitParagraphRuns` (from `splitBlock.ts` L186) at each highlight boundary, and wrap the highlighted slice in `<mark class="highlight" id="hl-{id}" data-highlight-id="{id}" tabindex={0} aria-label="…" aria-haspopup="dialog">`. Modifiers `has-note` (dotted underline) + `unresolved` (dashed outline) per D5-14/D5-04.

**DO NOT FORK** (UI-SPEC §Phase Scope + CONTEXT.md canonical_refs): the overlay renders INTO the existing semantic output. DOC-02 reading-order + D-05 offset integrity depend on reusing the same renderer.

---

### `src/content/render/BlockRenderer.tsx` modification (component)

**In-file analog:** the `ArticleBody` top-level block map (L129-167) — already emits `data-block-index` per block (L140). Thread resolved highlights down to `InlineList` via the block's article-global offset range. `BlockView` already destructures `[K in `data-${string}`]` props (L29-33) — extend the prop type to carry highlights per block.

---

### `src/pagination/fragmentRenderer.tsx` modification (component, D5-16)

**In-file analog:** `resolveBlockSlice` (L98-131) + `sliceParagraph` (L146-177). The renderer already slices blocks at the fragment's `[startGrapheme, endGrapheme)` range via `splitParagraphRuns`. Phase 5 ADDS: intersect each highlight range with the fragment's article-global range (per `highlightRanges.ts`) and pass the visible slice to `BlockView` so each fragment renders its own `<mark>` for the visible portion. All fragment marks sharing the same `data-highlight-id` (D5-16: no silent gaps at a page turn).

---

### `src/reader/Header.tsx` modification (component)

**In-file analog:** the existing `gear-button` (L62-75) + `.header-controls` group (L60). Add the annotations-trigger button INLINE-START of `ModeToggle` (UI-SPEC §Interaction 30: group reads `[annotations] [mode] [gear]`). Mirror the gear-button geometry exactly: 44×44 hit area, transparent background, `--ink-soft` default, `--accent` ONLY when `[aria-expanded="true"]`. `aria-haspopup="dialog"`. Inline-SVG glyph (`aria-hidden="true"`; `aria-label` carries the name). Count badge (`<span class="annotations-trigger-badge" aria-hidden="true">{N}</span>`) when N>0. Header does NOT grow (the three controls share the same 44×44 geometry).

---

### `src/routes/ArticleView.tsx` modification (route)

**In-file analogs** (multiple — ArticleView is the integration point):
- **Selection listener + H/N shortcuts:** mirror the existing M-shortcut global `window.addEventListener("keydown", ...)` pattern (`ArticleView.tsx` L309-329) — registered when `article && articleEl`, bails on form fields/dialogs via `isFormField` (imported from `PageTurnControls` L34). H/N are selection-dependent (guard checks `window.getSelection()`).
- **`user-select: none` on `.article-body-measurement`:** the hidden measurement wrapper already exists (`ArticleView.tsx` L793-795). Add the CSS rule in `app.css` (D5-08 / Pitfall 3 — `visibility: hidden` alone does NOT prevent text selection in all engines).
- **Popover/drawer coordination:** mount `<HighlightOverlay>` wrapping the article body; mount `<SelectionToolbar>`, `<NotePopover>`, `<AnnotationsDrawer>` as siblings. The drawer-trigger lives in `Header` (which `App` already renders).
- **Navigate-back landing (D5-11):** reuse the EXISTING `findScrollTarget` (scrolling mode) + `fragmentContainingOffset`/`commitTurn` (paginated mode) — the D4-10/D4-11 anchor machinery in reverse. Focus the `<mark>` after the turn/scroll (D4-07 focus precedent).

**Cancelled-flag load pattern** (`ArticleView.tsx` L455-484) — reuse for `loadHighlights(articleId)` on article open.

---

### `src/app.css` modifications (config)

**In-file analogs:**
- **`--highlight` token:** add to the existing `:root` block (L6-37) and override under each `[data-theme]` selector (L43-65). UI-SPEC §Color locks the values: Sepia `#f5e6c8`, Light `#f7eaa6`, Dark `#5c4a23` (ink-on-highlight ≥ 4.5:1 in every theme).
- **`mark.highlight` + modifiers:** new authored CSS (no framework). Solid `var(--highlight)` fill for normal; `.has-note` adds `text-decoration: underline dotted; text-decoration-color: var(--ink-soft); text-decoration-thickness: 2px; text-underline-offset: 3px`; `.unresolved` swaps fill → `outline: 1px dashed var(--ink-soft); outline-offset: 1px; background-color: transparent`.
- **Forced-colors override** (D5-15 / A11Y-05) — extend the existing `@media (forced-colors: active)` block (L86-90):
```css
@media (forced-colors: active) {
  mark.highlight {
    background-color: Highlight;
    color: HighlightText;
    text-decoration: underline;
    text-decoration-color: CanvasText;
    text-underline-offset: 2px;
  }
}
```
The three inline states (normal / note-bearing / ambiguous-orphan) MUST stay distinguishable by SHAPE (fill / dotted underline / dashed outline), not color alone.
- **`.article-body-measurement` `user-select: none`** (Pitfall 3 / D5-08).
- **Toolbar / popover / drawer styles:** authored CSS bound to the class hooks in UI-SPEC §Component Inventory. `.selection-toolbar` = `position: fixed; z-index: 8; --surface-raised bg; --hairline border; 4px radius; no shadow`. `.highlight-popover` = 8px radius, `--surface-raised`, max-width 380px. `.annotations-drawer` = reuses `.settings-panel` sheet geometry verbatim.

---

## Shared Patterns (cross-cutting — apply to ALL new files)

### 1. Zod-at-boundary validation (STATE-04)

**Source:** `src/content/schema.ts` (single source of truth) + `src/persistence/locationStore.ts` L77 (`LocationRecordSchema.safeParse(raw)`).
**Apply to:** every highlight/note read from Dexie; every record shape that crosses the persistence boundary. NEVER silently coerce a corrupt record (route to STATE-05 via `classifyStorageError`).

### 2. Storage error classification (STATE-05)

**Source:** `src/persistence/errors.ts` (read in full — `classifyStorageError(e): "unavailable" | "corrupt" | "unupgradeable"`).
**Apply to:** `highlightsStore.ts`, `notesStore.ts`, `useAnnotationState.ts`. Persistence failures NEVER throw to the reader — they route to the existing `StorageBanner` (no new surface). Reading continues with in-memory state (D2-13).

### 3. Debounced save + dual-event flush (D2-03)

**Source:** `src/settings/SettingsContext.tsx` L113-165 (`scheduleSave` + `flushSave` + visibilitychange/pagehide listeners) + `src/reader/useScrollSave.ts` L124-184.
**Apply to:** note textarea persistence (`useAnnotationState.ts`). The deprecated bfcache-breaking session-end events are FORBIDDEN. Debounce window matches the settings cadence (~400-800ms).

### 4. Native `<dialog>`/`showModal` + focus-restore (D2-01, Pitfall 1)

**Source:** `src/reader/SettingsPanel.tsx` L42-79.
**Apply to:** `AnnotationsDrawer.tsx`. Capture `document.activeElement` on open; restore in the `close` listener. Cross-engine: explicitly focus `[data-initial-focus]` (WebKit does not auto-focus modal-dialog controls).

### 5. Confirm-the-destructive-action (Pitfall 8)

**Source:** `src/reader/WipeConfirm.tsx` L85-102 + L120-143 (`[data-initial-focus]` on the non-destructive button; `--destructive` border on the destructive button).
**Apply to:** highlight delete confirm in `NotePopover.tsx` (and the drawer's inline confirm). An accidental Enter NEVER deletes.

### 6. REUSE normalization — never fork (Pattern 5)

**Source:** `src/content/normalizeText.ts` (the single canonical coordinate) + `src/reader/restoreLocation.ts` L1-15 + `src/pagination/anchor.ts` L14-18 (both cite "never fork normalization").
**Apply to:** `capture.ts`, `resolution.ts`, `highlightRanges.ts`, `useAnnotationState.ts` (offset math). Import `normalizeText`/`graphemeClusters`/`blockNormalizedText`/`normalizeRunText`/`deriveQuoteSelector` directly from `src/content/normalizeText.ts`. ANY divergence shifts every anchor.

### 7. REUSE run slicing — never reimplement (Pitfall 4)

**Source:** `src/pagination/splitBlock.ts` `splitParagraphRuns` L186-221 (preserves inline marks across splits).
**Apply to:** `highlightRanges.ts` + `InlineRenderer.tsx` modification + `fragmentRenderer.tsx` modification. The `<mark>` overlay slices runs at highlight boundaries via `splitParagraphRuns` — a link split by a highlight boundary becomes two link runs.

### 8. `.status` live region for consequential events (D2-13/D3-04)

**Source:** `src/app.css` L257-270 (`.status` card) + `ArticleView.tsx` L683-693 (the live region) + `PaginationFallbackBanner.tsx` L43-49.
**Apply to:** annotation save/delete announces (D5-12) + the orphan/ambiguous open-announce. Concise copy: "Highlight saved." / "Note saved." / "Highlight deleted." / "{N} highlight(s) couldn't be relocated." Routine editing is silent (the textarea persists debounced with no per-keystroke announce).

### 9. Exhaustive switch, no default (Pattern F)

**Source:** `src/content/render/BlockRenderer.tsx` `BlockView` (L36-126) + `src/pagination/splitBlock.ts` `classifyBlock` (L145-159).
**Apply to:** any per-block-kind annotation eligibility/overlay logic. TS flags a missing case at compile time; no `default:` swallow.

### 10. Global gates (reduced-motion + forced-colors + `:focus-visible`)

**Source:** `src/app.css` L75-96 (global `@media` gates + `:focus-visible` baseline).
**Apply to:** EVERY new annotation surface inherits these automatically (no transition/animation property on any new selector; the `<mark>` focus ring uses the existing `:focus-visible` baseline). Forced-colors: the three inline highlight states MUST stay distinguishable by SHAPE (fill / dotted underline / dashed outline), never color alone.

---

## No Analog Found

**None.** Every file has at least a role-match analog. The closest-to-novel file is `SelectionToolbar.tsx` (no `position: fixed` transient-chrome analog exists), but it combines well-understood patterns: `ProgressHairline`'s fixed positioning + `PaginationFallbackBanner`'s transient lifecycle + UI-SPEC §Interaction 25's edge-clamp/flip-below geometry. The three genuinely novel implementation challenges (selection capture offset mapping, `resolveQuoteSelector` algorithm, `<mark>` overlay INTO the renderer) all have concrete codebase-grounded approaches in RESEARCH.md §Patterns 1/2/4 with analogs cited above.

---

## Test Patterns

### Unit tests (Vitest, jsdom-safe — pure logic only)

**Analogs:**
- `tests/unit/selectors.test.ts` (100 lines) — `parseArticle` helper + `baseArticle` fixture + `describe/it` structure. **Copy verbatim** for `resolve-quote-selector.test.ts`, `selector-roundtrip.test.ts`.
- `tests/unit/restoreLocation.test.ts` (241 lines) — `makeBlock(text, kind, tag)` HTMLElement stub factory carrying `.textContent` + `dataset.kind`. **Copy verbatim** for `capture-offset-mapping.test.ts` (DOM stubs + offset-mapping assertions; no layout — jsdom is sufficient for the pure mapping logic).
- `tests/unit/locationSchema.test.ts` + `settingsSchema.test.ts` — Zod boundary tests. **Copy** for `highlight-schema.test.ts` (corrupt-record rejection, STATE-04).
- `tests/unit/storageFallback.test.ts` (168 lines) — `vi.mock("../../src/persistence/db", ...)` factory + `vi.mocked(db.settings.get)` pattern + `classifyStorageError` assertions. **Copy verbatim** for `highlights-store-error.test.ts` — mock `db.highlights`/`db.notes` instead.
- `tests/unit/pagination/*.test.ts` — pure range-math tests. **Copy** for `overlap.test.ts`.

**Pitfall (jsdom is NOT authoritative for layout):** selection capture, `<mark>` rendering, cross-fragment slicing, and forced-colors MUST run in Playwright across chromium/firefox/webkit (STACK.md forbids DOM emulators for layout truth). Unit tests cover ONLY the pure logic (resolveQuoteSelector, offset mapping, schemas, persistence errors, overlap).

### E2E tests (Playwright, real browsers)

**Analogs:**
- `tests/e2e/pagination/*.spec.ts` — corpus × theme × mode matrix across 3 engines. **Copy the matrix structure** for `tests/e2e/annotations/*.spec.ts`.
- `tests/e2e/forced-colors.spec.ts` — emulated forced-colors. **Copy** for the forced-colors shape-distinction test (3 inline states distinguishable by shape, not color).
- `tests/e2e/pagination/mode-switch-anchor.spec.ts` + `repagination-anchor.spec.ts` — anchor-survival patterns. **Copy** for the highlight-survives-relayout tests (ANNO-05).

**Phase gate** (RESEARCH.md §Sampling Rate): full `npm run test` suite green (753+ existing + all new annotation tests) across chromium/firefox/webkit before `/gsd-verify-work`. Mirrors the Phase 4 Plan 04-11 precedent (full suite, honest pass/fail counts, no subset/grep/engine-skip).

---

## Metadata

**Analog search scope:** `src/` (all subdirectories), `tests/unit/`, `tests/e2e/`. Read in full: `normalizeText.ts`, `db.ts`, `locationStore.ts`, `settingsStore.ts`, `errors.ts`, `BlockRenderer.tsx`, `InlineRenderer.tsx`, `anchor.ts`, `splitBlock.ts`, `fragmentRenderer.tsx`, `types.ts`, `restoreLocation.ts`, `schema.ts`, `SettingsContext.tsx`, `WipeConfirm.tsx`, `SettingsPanel.tsx`, `Header.tsx`, `PaginationFallbackBanner.tsx`, `ArticleView.tsx`, `useScrollSave.ts`, `PaginatedSurface.tsx` (head), `app.css` (`:root` + theme blocks), `selectors.test.ts`, `restoreLocation.test.ts` (head), `storageFallback.test.ts` (head).

**Files scanned:** 24 source files + 3 test files (representative).
**Pattern extraction date:** 2026-08-07
**Confidence:** HIGH — every new file maps to a concrete in-repo analog; Phase 5 adds zero new infrastructure categories (RESEARCH.md §"Don't Hand-Roll" + §Runtime State Inventory confirm).
