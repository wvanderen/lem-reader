# Phase 4: Responsive Pagination and Dual-Mode Navigation - Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 17 (6 new modules in `src/pagination/`, 5 new components in `src/reader/`, 6 edits to existing files)
**Analogs found:** 17 / 17 (every new/modified file has a concrete in-repo analog; the novel surface is narrow — `src/pagination/` fragmentation logic + line-box mapping)

> **Key insight from RESEARCH §"Don't Hand-Roll":** Phase 4's novelty is narrow. The pagination engine's fragmentation logic and the DOM line-box → grapheme-offset mapping are the only genuinely new code. Everything else (state, persistence, diagnostics, anchor resolution, block rendering, staleness) is a verified reuse of prior-phase seams. The pattern map below is therefore organized to (a) give the new `src/pagination/` files concrete structural analogs to copy discipline from, and (b) pin the EXACT signatures/conventions of the reuse targets so the planner can write "import X from Y, call Z" without re-deriving them.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `src/pagination/types.ts` | model (Zod schemas) | transform | `src/measurement/types.ts` | exact (Zod-at-boundary, schemaVersion literal, discriminated union) |
| **NEW** `src/pagination/fragment.ts` | service (pure engine) | transform | `src/measurement/engine.ts` + `src/measurement/domMeasurer.ts` | role-match (engine orchestrator + pure DOM read-phase) |
| **NEW** `src/pagination/lineBoxes.ts` | service (DOM read-phase) | file-I/O (DOM read) | `src/measurement/domMeasurer.ts` | exact (batched `getClientRects`/`getBoundingClientRect` read-phase) |
| **NEW** `src/pagination/splitBlock.ts` | service (pure) | transform | `src/content/normalizeText.ts` (`blockText` switch) + `src/content/render/BlockRenderer.tsx` (`BlockView` switch) | exact (exhaustive `BlockKind` switch, Pattern F) |
| **NEW** `src/pagination/widowRules.ts` | utility (pure) | transform | `src/settings/applyTheme.ts` + `src/measurement/textMeasurer.ts` | role-match (single-purpose pure helper) |
| **NEW** `src/pagination/fragmentRenderer.tsx` | component | request-response | `src/content/render/BlockRenderer.tsx` (`BlockView` + `ArticleBody`) | exact (reuses `BlockView`/`InlineList` — NO fork) |
| **NEW** `src/reader/PaginatedSurface.tsx` | component (container) | request-response | `src/routes/ArticleView.tsx` | role-match (mounts hooks, owns `<article>`, callback-ref) |
| **NEW** `src/reader/ModeToggle.tsx` | component (control) | request-response | `src/reader/Header.tsx` (`gear-button`) | exact (quiet-chrome toggle button + inline SVG + aria-pressed) |
| **NEW** `src/reader/PageTurnControls.tsx` | component (control + hook) | event-driven | `src/reader/SectionAnnouncer.tsx` + `src/reader/Header.tsx` | exact (global window listeners + cleanup; quiet button) |
| **NEW** `src/reader/PageIndicator.tsx` | component (presentational) | request-response | `src/reader/ProgressHairline.tsx` | exact (decorative `aria-hidden` element driven by prop) |
| **NEW** `src/reader/PaginationFallbackBanner.tsx` | component (banner) | event-driven (subscription) | `src/reader/StorageBanner.tsx` + `src/reader/ResumeBanner.tsx` | exact (`.status` card, role=status, dismiss ×, auto-dismiss) |
| **EDIT** `src/content/schema.ts` | model | — | itself (L209 `ReaderSettingsSchema`) | exact (append `readingMode` field, bump schemaVersion literal) |
| **EDIT** `src/settings/defaults.ts` | config | — | itself (L8 `DEFAULT_SETTINGS`) | exact (mirror new schema field) |
| **EDIT** `src/measurement/types.ts` | model | — | itself (L51 `BlockMeasurementSchema`) | exact (append optional split-point fields) |
| **EDIT** `src/reader/Header.tsx` | component | — | itself + `src/reader/ModeToggle.tsx` (new) | exact (insert toggle inline-start of gear) |
| **EDIT** `src/reader/ProgressHairline.tsx` | component | — | itself (L34) | exact (add prop for fill source; keep `aria-hidden`) |
| **EDIT** `src/routes/ArticleView.tsx` | route (container) | request-response | itself (L260–295 render) | exact (mode-aware render branch) |

---

## Pattern Assignments

### `src/pagination/types.ts` (model, Zod schemas)

**Analog:** `src/measurement/types.ts` (entire file — 136 lines; the discipline template for the new module's contracts).

**Imports pattern** (`src/measurement/types.ts:14`):
```typescript
import { z } from "zod";
```
Single import. `import type` is mandatory for cross-module type refs under `verbatimModuleSyntax: true` (see engine.ts L37–44 for the pattern).

**Schema declaration pattern** (`src/measurement/types.ts:22-41, 51-56, 63-69`):
```typescript
// Constraints: every field is a closed enum / literal union — no open types
export const ConstraintsSchema = z.object({
  font: z.enum(["serif", "sans", "dyslexic"]),
  size: z.union([z.literal(16), z.literal(18), /* ... */]),
  // ...
});

// Per-record: schemaVersion literal so the contract can evolve without retrofit
export const MeasurementResultSchema = z.object({
  schemaVersion: z.literal(1),
  constraints: ConstraintsSchema,
  blocks: z.array(BlockMeasurementSchema),
  computedAt: z.string().datetime(),
});
export type MeasurementResult = z.infer<typeof MeasurementResultSchema>;
```

**Apply to `PageFragmentSchema` / `FragmentationResultSchema`** — copy RESEARCH §Architecture Pattern 1 skeleton verbatim:
```typescript
export const PageFragmentSchema = z.object({
  schemaVersion: z.literal(1),
  pageIndex: z.number().int().min(0),
  blocks: z.array(z.object({
    blockIndex: z.number().int().min(0),
    startGrapheme: z.number().int().min(0),
    endGrapheme: z.number().int().min(0),
  })),
});
export type PageFragment = z.infer<typeof PageFragmentSchema>;
```
`FragmentationResultSchema` mirrors `MeasurementResultSchema`: `schemaVersion: z.literal(1)`, `status: z.enum(["ok", "fallback"])`, `pages: z.array(...)`, optional `reason: z.string()`.

**Header comment pattern** (`src/measurement/types.ts:1-13`) — every schema file opens with a comment block citing the locked decision IDs (D4-01, D4-02, D-05) and the security boundary (Zod-validate at emit AND consume for any reader-facing contract). Copy this discipline.

---

### `src/pagination/fragment.ts` (service, pure engine — the orchestrator)

**Analog:** `src/measurement/engine.ts` (`MeasurementEngine` class — 367 lines) for orchestrator discipline + diagnostic emission; `src/measurement/domMeasurer.ts` (`measureAllBlocks` — 105 lines) for the pure-function DOM read-phase.

**Header comment pattern** (`src/measurement/engine.ts:1-35`) — copy this exactly: a multi-line comment block tracing the pipeline (`bump → fontGate → measureAllBlocks → commit-guard → trustedView`), citing PAGE-06/PAGE-07/PAGE-09 and V7 error classification. Phase 4's equivalent traces: `walk article.blocks → for each: atomic? place whole : read line boxes → apply widow rules → emit page fragment → termination guards`.

**Diagnostic emission pattern** (`src/measurement/engine.ts:164-171, 196-200`) — pagination failures emit through the SAME `DiagnosticBus`:
```typescript
this.opts.diagnostics.emit({
  kind: "dom-fallback",        // or "measurement-error"
  ts: new Date().toISOString(),
});
```
The 6 kinds are the closed set (`src/measurement/types.ts:128-135`); Phase 4 emits MORE of `dom-fallback` and `measurement-error`, never a 7th kind.

**Error classification pattern (V7)** (`src/measurement/engine.ts:191-201`) — AbortError → silent cancel; anything else → diagnostic, NEVER a throw to the reader:
```typescript
} catch (e) {
  if (e instanceof AbortError) return;
  this.opts.diagnostics.emit({
    kind: "measurement-error",
    message: String(e),
    ts: new Date().toISOString(),
  });
}
```

**Pure DOM read-phase pattern** (`src/measurement/domMeasurer.ts:83-104`) — the canonical "batch every read before any write" discipline (Pitfall 2 — layout thrash):
```typescript
export function measureAllBlocks(articleEl: HTMLElement, signal: AbortSignal): BlockMeasurement[] {
  const elements = Array.from(articleEl.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const out: BlockMeasurement[] = [];
  for (const el of elements) {
    if (signal.aborted) throw new AbortError();
    const rect = el.getBoundingClientRect();
    const lineCount = el.getClientRects().length;
    out.push({ kind: kindForElement(el), heightPx: rect.height, lineCount });
  }
  return out;
}
```
`paginate()` mirrors this: read all line boxes in one pass, build the `FragmentationResult`, return it; the caller (`useEffect`) commits via `setPages` AFTER the read-phase completes.

**Exhaustive switch, no default (Pattern F)** (`src/measurement/engine.ts:343-367`) — `chooseStrategy` is the template for the per-kind fragmentation dispatch:
```typescript
export function chooseStrategy(kind: BlockKind, eligibility: EligibilityState): "pretext" | "dom" {
  switch (kind) {
    case "heading":      return eligibility.heading.pretextEligible ? "pretext" : "dom";
    case "paragraph":    return eligibility.paragraph.pretextEligible ? "pretext" : "dom";
    case "blockquote":   return "dom";
    case "bulleted-list":return "dom";
    case "numbered-list":return "dom";
    case "figure":       return "dom";
    case "code-block":   return "dom";
    case "footnote-reference": return "dom";
    case "unsupported":  return "dom";
  }
}
```
`splitBlock.ts` uses the SAME `BlockKind` union (`src/measurement/engine.ts:63-72`) — import it, do not re-declare. The switch returns "atomic" vs "splitting" per D4-02.

**Constructor/options pattern** (`src/measurement/engine.ts:74-94, 115-131`) — if `paginate()` is wrapped in a class, copy the `MeasurementEngineOptions` interface + defensive-copy constructor. If it's a free function, copy `domMeasurer.ts`'s `(articleEl, signal) => result` signature.

---

### `src/pagination/lineBoxes.ts` (service, DOM read-phase — the split-point primitive)

**Analog:** `src/measurement/domMeasurer.ts` (exact role-match: batched DOM read-phase producing structured output).

**Imports pattern** (`src/measurement/domMeasurer.ts:26-27`):
```typescript
import type { BlockMeasurement } from "./types";
import { AbortError } from "./fontGate";
```
For `lineBoxes.ts`: import `graphemeClusters` from `../content/normalizeText` and `normalizeElText` from `../reader/restoreLocation` (Pitfall 3 — do NOT fork normalization).

**The canonical block selector** (`src/measurement/domMeasurer.ts:34`, also `src/measurement/engine.ts:304`, `src/reader/useScrollSave.ts:99`, `src/routes/ArticleView.tsx:54`):
```typescript
const BLOCK_SELECTOR = "h2, h3, h4, p, blockquote, li, pre, figure, sup, details";
```
**CRITICAL:** this exact string is reused at 4 sites. Pagination MUST NOT fork a 5th variant. Copy it verbatim with a comment citing the other 4 sites.

**Read-phase discipline** (`src/measurement/domMeasurer.ts:92-103`):
```typescript
for (const el of elements) {
  if (signal.aborted) throw new AbortError();
  // Per-block: read rect + line boxes in tight succession, no interleaved writes
  const rect = el.getBoundingClientRect();
  const lineCount = el.getClientRects().length;
  out.push({ /* ... */ });
}
```
`lineBoxes.ts` extends this: instead of just counting `getClientRects().length`, walk character offsets with `Range.setStart`/`setEnd` and record each line box's `(charOffset, topPx, bottomPx)`. The structural discipline (single querySelectorAll up front, AbortSignal check per block, no writes) is identical. See RESEARCH §Architecture Pattern 2 for the `Range.getClientRects()` skeleton.

**`Element.getClientRects()` is already used** (`src/measurement/domMeasurer.ts:97`) — `lineCount = el.getClientRects().length`. Phase 4 reuses the same primitive at finer granularity.

---

### `src/pagination/splitBlock.ts` (service, pure — per-kind fragmentation)

**Analog:** `src/content/normalizeText.ts` (`blockText` function L41-63) + `src/content/render/BlockRenderer.tsx` (`BlockView` L21-113) — both are exhaustive `block.kind` switches over the same 9-kind union.

**Exhaustive switch pattern** (`src/content/normalizeText.ts:41-63`):
```typescript
function blockText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return inlineText(block.content);
    case "blockquote":
      return block.children.map(blockText).join(BLOCK_SEPARATOR);
    case "bulleted-list":
    case "numbered-list":
      return block.items.map(/* ... */).join(BLOCK_SEPARATOR);
    case "figure":
      return [block.alt, inlineText(block.caption)].filter(Boolean).join(BLOCK_SEPARATOR);
    case "code-block":
      return block.source; // VERBATIM
    case "footnote-reference":
      return block.marker;
    case "unsupported":
      return block.plainDescription;
  }
}
```
`splitBlock.ts` mirrors this structure but returns `{ before, after }` fragment pairs per D4-02's atomic/splitting classification. Atomic kinds (`figure`, `heading`, `code-block`, `footnote-reference`, `unsupported`) return a "move whole" signal; splitting kinds (`paragraph`, list items, blockquote children) return the run-split result.

**InlineRun splitting (Pattern 3)** — reuses the `Mark` union (`src/content/schema.ts:38-46`) and `InlineRun` (`schema.ts:48-51`). The split walks runs accumulating grapheme count via `graphemeClusters(run.text, lang)` (imported from `../content/normalizeText`), splits the boundary run's text into two slices, BOTH slices inherit the run's marks verbatim. See RESEARCH §Pattern 3 skeleton.

**Recursion pattern** (`src/content/render/BlockRenderer.tsx:37-68`) — blockquote children and list items contain nested `Block[]`. The fragmentation policy recurses into these the same way `BlockView` recurses (note the `key={i}` pattern and the `.map` over `item.content`).

---

### `src/pagination/widowRules.ts` (utility, pure)

**Analog:** `src/settings/applyTheme.ts` (39 lines) + `src/measurement/textMeasurer.ts` (175 lines) — both are single-purpose pure helper modules with header comments citing locked decisions.

**Module structure pattern** (`src/settings/applyTheme.ts:1-38`):
```typescript
// src/settings/applyTheme.ts
// The live-apply mutator (D2-03): writes `data-theme` + the typography
// custom properties on documentElement ...
// [citation block citing UI-SPEC sections + security notes]
import type { ReaderSettings } from "../content/schema";
import { FONT_STACKS, SPACING_PRESETS } from "./tokens";

export function applyTheme(s: ReaderSettings): void {
  // pure transformation — no React, no side-effects beyond the DOM write
}
```
`widowRules.ts` copies this: header comment citing D4-03 (heading widow) + D4-04 (line widow/orphan = 2-line rule), pure exported functions taking the line-box array + page geometry and returning the adjusted split index. No React, no DOM reads — pure arithmetic over the `LineBox[]` from `lineBoxes.ts`.

**Constants pattern** (`src/measurement/useMeasurement.ts:43-45`):
```typescript
const RUNTIME_DRIFT_TOLERANCE_PX = 1.0;
const RUNTIME_DRIFT_SAMPLE_SIZE = 5;
```
Module-level named constants with comments citing the decision. `widowRules.ts` exports `HEADING_WIDOW_LINES = 2` and `SPLIT_WIDOW_LINES = 2` (D4-03/D4-04).

---

### `src/pagination/fragmentRenderer.tsx` (component)

**Analog:** `src/content/render/BlockRenderer.tsx` (`BlockView` + `ArticleBody`) — the renderer being REUSED, not forked.

**CRITICAL reuse contract** (`src/content/render/BlockRenderer.tsx:21, 115`) — import `BlockView` and `InlineList`, do NOT reimplement:
```typescript
import { BlockView } from "../content/render/BlockRenderer";
// renders one block via the SAME semantic output scrolling mode uses
<BlockView block={block} />
```
The fragment renderer's job is to SLICE blocks (per `splitBlock.ts`) and feed the slices to `BlockView`. DOC-02 reading order + D-05 offset integrity + security (React escapes, no `dangerouslySetInnerHTML`) all depend on this reuse — `react/no-danger` is enabled (RESEARCH §Project Constraints).

**Security comment pattern** (`src/content/render/BlockRenderer.tsx:9-17`):
```typescript
// Security (Pitfall 6): the renderer emits ONLY React text children / JSX
// elements — code-block source renders as an auto-escaped text child of
// <pre><code>. The React raw-HTML injection prop is FORBIDDEN anywhere in this
// file; ESLint react/no-danger (enabled in Plan 01) enforces statically.
```
Copy this comment into `fragmentRenderer.tsx` — it applies identically.

**Exhaustive switch in the renderer** (`src/content/render/BlockRenderer.tsx:22-112`) — `BlockView` is the canonical Pattern F switch. The fragment renderer does NOT add a parallel switch; it calls `BlockView` for each block (or block slice).

**Semantic wrapper** (`src/content/render/BlockRenderer.tsx:121-143` — the footnotes `<section aria-label="Footnotes">`) — the page fragment wrapper follows the same discipline: `<section class="page-fragment" aria-label="Page {N}">` per UI-SPEC §Component Inventory.

---

### `src/reader/PaginatedSurface.tsx` (component, container)

**Analog:** `src/routes/ArticleView.tsx` (298 lines) — the route it lives inside and mirrors.

**Hook composition pattern** (`src/routes/ArticleView.tsx:92-103`):
```typescript
useScrollSave(article, articleRef);
useMeasurement(article, articleRef);
```
**CRITICAL:** ArticleView currently IGNORES `useMeasurement`'s return value. Phase 4 wires it in:
```typescript
const trustedView = useMeasurement(article, articleRef);  // now READ
```
PaginatedSurface receives `trustedView` (or ArticleView derives pages and passes them down — planner's architecture call). The hook-calling discipline (unconditional calls, refs for stable closures) is identical.

**Callback-ref + state seam** (`src/routes/ArticleView.tsx:74-86`):
```typescript
const articleRef = useRef<HTMLElement>(null);
const [articleEl, setArticleEl] = useState<HTMLElement | null>(null);
const articleCallbackRef = useCallback((el: HTMLElement | null) => {
  articleRef.current = el;
  setArticleEl(el);
}, []);
// ...
<article ref={articleCallbackRef} className="article-body">
```
PaginatedSurface reuses this exact seam (or the parent ArticleView owns it and passes the ref down). The `<article>` element is shared between both modes — it gains a `.paginated-surface` modifier in paginated mode (UI-SPEC §Component Inventory L734), not a duplicate tree.

**Cancelled-flag async pattern** (`src/routes/ArticleView.tsx:107-129, 136-182`):
```typescript
useEffect(() => {
  let cancelled = false;
  // async work...
  return () => { cancelled = true; };
}, [articleId]);
```
The repagination effect (capture offset BEFORE swap, `setPages(newPages)`, re-anchor AFTER) uses this same discipline so a stale pagination pass cannot overwrite a newer one. Pairs with Phase 3's `trustedView` retention (PAGE-06) — the old page stays mounted until the new one commits.

**`requestAnimationFrame` deferral** (`src/routes/ArticleView.tsx:154-172`):
```typescript
const rafId = requestAnimationFrame(() => {
  if (cancelled) return;
  // DOM query after browser layout commits
});
return () => cancelAnimationFrame(rafId);
```
Use this when querying block elements after a page-swap re-render, mirroring the restore logic.

---

### `src/reader/ModeToggle.tsx` (component, control)

**Analog:** `src/reader/Header.tsx` (`gear-button` — L24-37) for the quiet-chrome toggle button + inline SVG glyph.

**Quiet-chrome button pattern** (`src/reader/Header.tsx:24-37`):
```typescript
<button
  type="button"
  className="gear-button"
  onClick={onOpenSettings}
  aria-label="Reading settings"
  aria-haspopup="dialog"
  aria-expanded={settingsOpen}
>
  <GearIcon aria-hidden="true" />
</button>
```
ModeToggle mirrors this exactly with `class="mode-toggle"`, `aria-pressed={isPaginated}`, `aria-label="Reading mode: paginated"` (or scrolling). The `M` keyboard shortcut is registered separately in `PageTurnControls.tsx` (or a dedicated global-listener effect) — see that file's pattern.

**Inline SVG glyph pattern** (`src/reader/Header.tsx:42-59`):
```typescript
function GearIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={ariaHidden} focusable="false">
      {/* paths */}
    </svg>
  );
}
```
ModeToggle defines `PaginatedIcon` / `ScrollingIcon` (or a single glyph that swaps). `aria-hidden="true"` because `aria-label` carries the name; `focusable="false"` so IE/old Edge doesn't put the SVG in tab order. The glyph state change is the secondary cue beyond `aria-pressed` (forced-colors safety — UI-SPEC §Color contract L322).

**Settings flow** — ModeToggle calls `useSettings().update({ readingMode: "paginated" | "scrolling" })`. The `update` function (`src/settings/SettingsContext.tsx:182-187`) already live-applies + debounces the save:
```typescript
update: (patch) => setSettings((prev) => {
  const next = { ...prev, ...patch };
  scheduleSave(next);
  return next;
}),
```
No new persistence code — `readingMode` flows the same path as every other preference (D2-03 live-apply).

---

### `src/reader/PageTurnControls.tsx` (component + global-listener hook)

**Analog:** `src/reader/SectionAnnouncer.tsx` (125 lines) for the global window-listener + cleanup pattern; `src/reader/Header.tsx` for the chevron buttons.

**Global listener + cleanup pattern** (`src/reader/SectionAnnouncer.tsx:94-113`):
```typescript
let rafId: number | null = null;
const onScroll = () => {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => { raf = null; detect(); });
};
window.addEventListener("scroll", onScroll, { passive: true });
return () => {
  obs.disconnect();
  window.removeEventListener("scroll", onScroll);
  if (rafId !== null) cancelAnimationFrame(rafId);
  if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
};
```
PageTurnControls registers `keydown` on `window` with `{ passive: true }`, calls `preventDefault()` ONLY on handled keys (UI-SPEC §Interaction 16), and removes the listener on cleanup. The swipe handler registers `touchstart`/`touchend` with the same discipline.

**Passive-listener + rAF throttle** — copy `SectionAnnouncer.tsx`'s `rafId` guard so a burst of key presses doesn't queue multiple turns.

**Debounced announce pattern** (`src/reader/SectionAnnouncer.tsx:69-78`) — the "Page N of M" announce uses the SAME `timerRef` debounce (~250ms) so rapid turns don't flood the live region:
```typescript
if (timerRef.current !== null) window.clearTimeout(timerRef.current);
timerRef.current = window.setTimeout(() => {
  setAnnounce(`Page ${n} of ${m}.`);
}, ANNOUNCE_DEBOUNCE_MS);
```

**Chevron button pattern** (`src/reader/Header.tsx:24-37`) — page-side chevrons are `<button type="button" class="page-turn page-turn-previous" aria-label="Previous page" aria-disabled={atFirstPage}>` with inline-SVG chevron-left/right glyphs. The disabled state uses `aria-disabled` + opacity (NOT `disabled` attribute — keeps it focusable for the SR announce) per UI-SPEC §Interaction 17.

---

### `src/reader/PageIndicator.tsx` (component, presentational)

**Analog:** `src/reader/ProgressHairline.tsx` (50 lines) — exact role-match: decorative `aria-hidden` element driven by a numeric prop.

**Presentational pattern** (`src/reader/ProgressHairline.tsx:34-49`):
```typescript
interface ProgressHairlineProps {
  progress: number;  // clamped [0,1]
}
export function ProgressHairline({ progress }: ProgressHairlineProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className="progress-hairline" aria-hidden="true">
      <div className="progress-hairline-fill"
        style={{ transform: `scaleX(${clamped})`, transformOrigin: "left" }} />
    </div>
  );
}
```
PageIndicator mirrors this: `aria-hidden="true"` (decorative — SR users get the polite "Page N of M" announce from PageTurnControls instead, per UI-SPEC §Component Inventory L729), driven by `{ current, total }` props, renders `<span class="page-indicator">{n} of {m}</span>` via `Intl.NumberFormat`.

**Defensive clamp** — copy the `Math.max(0, Math.min(1, ...))` discipline for any numeric prop.

**No-transition contract** (`src/reader/ProgressHairline.tsx:14-18`) — the comment block explicitly states NO `transition`/`animation` on the fill. PageIndicator copies this: the N/M text swaps instantly (calm aesthetic; reduced-motion gate trivially satisfied).

---

### `src/reader/PaginationFallbackBanner.tsx` (component, banner)

**Analog:** `src/reader/StorageBanner.tsx` (65 lines) + `src/reader/ResumeBanner.tsx` (98 lines) — exact role-match: `.status` card, `role=status`, dismiss ×, non-modal.

**`.status` card pattern** (`src/reader/StorageBanner.tsx:19-45`):
```typescript
export function StorageBanner({ onDismiss }: StorageBannerProps) {
  return (
    <div className="status storage-banner" role="status"
      aria-live="polite" aria-atomic="true">
      <div className="storage-banner-main">
        <h2>Your reading settings can&apos;t be saved right now.</h2>
        <p>Local storage is unavailable, so changes won&apos;t be kept...</p>
      </div>
      <button type="button" className="storage-banner-dismiss"
        aria-label="Dismiss" onClick={onDismiss}>
        <DismissIcon aria-hidden="true" />
      </button>
    </div>
  );
}
```
PaginationFallbackBanner copies this structure: `class="status pagination-fallback-banner"`, heading + body + actions (**Switch to pages** + ×). The `.status` base styles are already in `src/app.css:257-271` (`margin-block: var(--space-lg); padding: var(--space-lg); background: var(--surface-raised); border: 1px solid var(--hairline); border-radius: 4px`).

**DismissIcon pattern** (`src/reader/StorageBanner.tsx:47-64`, also `ResumeBanner.tsx:80-97`) — the × glyph is IDENTICAL in both files. Extract or copy verbatim (inline SVG, `aria-hidden`, `focusable="false"`).

**Secondary action button pattern** (`src/reader/ResumeBanner.tsx:58-65`):
```typescript
<button type="button" className="resume-banner-secondary" onClick={onStartFromTop}>
  Start from top
</button>
```
The **Switch to pages** button follows this (`class="pagination-fallback-switch"`).

**Copywriting contract** — UI-SPEC §Copywriting L351-355 locks the banner copy verbatim:
- heading: `This part of the article is too large to fit on one page.`
- body: `Switched to scrolling so you can keep reading. You can switch back to pages anytime.`
- dismiss: `aria-label="Dismiss"`
- announce: `Switched to scrolling reading.`

**Auto-dismiss lifecycle** — the PARENT (PaginatedSurface or ArticleView) drives the auto-dismiss listener on first scroll/pointer activity, mirroring how ArticleView drives ResumeBanner's auto-dismiss (`src/routes/ArticleView.tsx:207-219`):
```typescript
useEffect(() => {
  if (!showResumeBanner) return;
  const dismiss = () => setShowResumeBanner(false);
  window.addEventListener("scroll", dismiss, { passive: true, once: true });
  window.addEventListener("pointerdown", dismiss, { passive: true, once: true });
  return () => { /* cleanup both */ };
}, [showResumeBanner]);
```

**DiagnosticBus subscription pattern** (`src/measurement/diagnostics.ts:58-71`) — the banner's visibility is driven by a subscription:
```typescript
const unsub = diagnostics.subscribe((event) => {
  if (event.kind === "dom-fallback" || event.kind === "measurement-error") {
    setShowBanner(true);
  }
});
return unsub;  // cleanup
```
Only 2 of the 6 kinds trigger the banner (UI-SPEC §23 table — locked). The other 4 stay in the ring buffer (`diagnostics.recent()`) for DEV-only inspection.

---

### EDIT `src/content/schema.ts` (model — add `readingMode`)

**Analog:** itself, L209-228 (`ReaderSettingsSchema`).

**Schema evolution pattern** (D4-12 — schemaVersion 1→2):
```typescript
// BEFORE (L209-227):
export const ReaderSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  font: z.enum(["serif", "sans", "dyslexic"]),
  // ...
  theme: z.enum(["sepia", "light", "dark"]),
});

// AFTER:
export const ReaderSettingsSchema = z.object({
  schemaVersion: z.literal(2),                          // bump 1 → 2
  font: z.enum(["serif", "sans", "dyslexic"]),
  // ...
  theme: z.enum(["sepia", "light", "dark"]),
  readingMode: z.enum(["paginated", "scrolling"]).default("paginated"),  // D4-12
});
```
**`.default("paginated")`** is the migration mechanism: existing v1 rows (no `readingMode` field) parse with the default on read. No data migration script needed. The settings Dexie store is key-value (`src/persistence/db.ts:55` — `settings: "key"`); Dexie is opaque to the value shape.

**Comment-cite-the-decision pattern** (`src/content/schema.ts:208`):
```typescript
// Single composite record under Dexie key "reader-prefs" (D2 discretion / ...)
```
The new field's comment cites D4-12 + PROJECT.md ("Pagination is the distinctive default experience, but it is not mandatory").

---

### EDIT `src/settings/defaults.ts` (config — mirror the new field)

**Analog:** itself, L8-15.

**Mirror pattern:**
```typescript
// BEFORE:
export const DEFAULT_SETTINGS: ReaderSettings = {
  schemaVersion: 1,
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "sepia",
};

// AFTER:
export const DEFAULT_SETTINGS: ReaderSettings = {
  schemaVersion: 2,                  // bump to match schema
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "sepia",
  readingMode: "paginated",          // D4-12 — PROJECT.md default
};
```
The comment style (`// D-07 warm-paper serif`) carries through — `// D4-12 paginated default per PROJECT.md`.

---

### EDIT `src/measurement/types.ts` (model — extend `BlockMeasurement` with split-point data)

**Analog:** itself, L51-56 (`BlockMeasurementSchema`).

**Optional-field append pattern:**
```typescript
// BEFORE (L51-56):
export const BlockMeasurementSchema = z.object({
  kind: z.string(),
  heightPx: z.number(),
  lineCount: z.number().int(),
});

// AFTER (if the planner chooses to extend BlockMeasurement — RESEARCH §Architecture
// Patterns notes the pagination engine MAY carry split-point data here OR in a
// parallel structure owned by src/pagination/):
export const BlockMeasurementSchema = z.object({
  kind: z.string(),
  heightPx: z.number(),
  lineCount: z.number().int(),
  // Phase 4 split-point data — OPTIONAL so existing Phase 3 emit sites stay valid.
  // Present only for splitting kinds after the line-box read-phase.
  lineBoxes: z.array(z.object({
    charOffset: z.number().int().min(0),
    topPx: z.number(),
    bottomPx: z.number(),
  })).optional(),
});
```
The `.optional()` is critical — Phase 3's `measureAllBlocks` (`src/measurement/domMeasurer.ts:98-102`) does NOT populate it; only Phase 4's line-box read does. Alternatively (RESEARCH §Architecture Patterns) the planner keeps `LineBox[]` entirely inside `src/pagination/` and does NOT edit this file — both paths are valid; the planner picks one.

**`schemaVersion: z.literal(1)` stays** (`src/measurement/types.ts:64`) — `MeasurementResult.schemaVersion` does NOT bump; the split-point data is an optional extension within the same v1 shape.

---

### EDIT `src/reader/Header.tsx` (component — insert ModeToggle)

**Analog:** itself + the new `ModeToggle.tsx`.

**Insertion pattern** (`src/reader/Header.tsx:20-40`) — the toggle sits inline-start of the gear, header does NOT grow:
```typescript
// BEFORE:
export function Header({ onOpenSettings, settingsOpen }: HeaderProps) {
  return (
    <header className="app-header">
      <span className="app-wordmark">Lem Reader</span>
      <button type="button" className="gear-button" /* ... */ >
        <GearIcon aria-hidden="true" />
      </button>
    </header>
  );
}

// AFTER:
export function Header({ onOpenSettings, settingsOpen, readingMode, onToggleMode }: HeaderProps) {
  return (
    <header className="app-header">
      <span className="app-wordmark">Lem Reader</span>
      <ModeToggle mode={readingMode} onToggle={onToggleMode} />
      <button type="button" className="gear-button" /* ... */ >
        <GearIcon aria-hidden="true" />
      </button>
    </header>
  );
}
```
**Props addition** — `HeaderProps` gains `readingMode` + `onToggleMode`, threaded from `App.tsx` (which already owns `settingsOpen` state — L105). The header is rendered in `App.tsx:127-130`; the new props come from `useSettings()`.

---

### EDIT `src/reader/ProgressHairline.tsx` (component — add fill-source prop)

**Analog:** itself, L24-49.

**Prop-extension pattern:**
```typescript
// BEFORE:
interface ProgressHairlineProps {
  progress: number;  // scroll ratio [0,1]
}
export function ProgressHairline({ progress }: ProgressHairlineProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className="progress-hairline" aria-hidden="true">
      <div className="progress-hairline-fill"
        style={{ transform: `scaleX(${clamped})`, transformOrigin: "left" }} />
    </div>
  );
}

// AFTER (D4-08 — fill derives from N/M in paginated mode, scroll-ratio in scrolling):
interface ProgressHairlineProps {
  /** Scroll ratio [0,1] — scrolling mode. */
  progress?: number;
  /** Page position — paginated mode. When present, overrides progress. */
  page?: { current: number; total: number };
}
export function ProgressHairline({ progress = 0, page }: ProgressHairlineProps) {
  const ratio = page ? (page.total > 0 ? page.current / page.total : 0) : Math.max(0, Math.min(1, progress));
  return (
    <div className="progress-hairline" aria-hidden="true">
      <div className="progress-hairline-fill"
        style={{ transform: `scaleX(${ratio})`, transformOrigin: "left" }} />
      {page && <span className="page-indicator">{page.current} of {page.total}</span>}
    </div>
  );
}
```
**No-transition contract stays** — the comment block L14-18 is preserved; the N/M swap is instant (calm aesthetic). The `.page-indicator` CSS is authored (UI-SPEC §Component Inventory L729).

---

### EDIT `src/routes/ArticleView.tsx` (route — mode-aware render branch)

**Analog:** itself, L260-295 (the render block).

**Branch pattern (the central edit of the phase):**
```typescript
// BEFORE (L260-295):
return (
  <>
    <ProgressHairline progress={progress} />
    <SectionAnnouncer articleEl={articleEl} />
    <main id="main">
      {showResumeBanner && <ResumeBanner /* ... */ />}
      <article ref={articleCallbackRef} className="article-body">
        <header>/* provenance */</header>
        <ArticleBody article={article} />
      </article>
    </main>
  </>
);

// AFTER (mode-aware — the Phase 4 branch point):
const trustedView = useMeasurement(article, articleRef);  // now READ (was ignored)
const { settings } = useSettings();
const isPaginated = settings.readingMode === "paginated";

return (
  <>
    <ProgressHairline
      progress={progress}
      page={isPaginated && pages ? { current: currentPageIdx + 1, total: pages.length } : undefined}
    />
    <SectionAnnouncer articleEl={articleEl} />
    <main id="main">
      {showResumeBanner && <ResumeBanner /* ... */ />}
      {showFallbackBanner && <PaginationFallbackBanner /* ... */ />}
      <article ref={articleCallbackRef} className={isPaginated ? "article-body paginated-surface" : "article-body"}>
        <header>/* provenance — shared between modes */</header>
        {isPaginated ? (
          <PaginatedSurface
            article={article}
            trustedView={trustedView}
            articleEl={articleEl}
            onAnchorOffset={handleAnchorOffset}
            /* ... */
          />
        ) : (
          <ArticleBody article={article} />
        )}
      </article>
    </main>
  </>
);
```
**Mode-switch anchor wiring** (D4-10) — `handleAnchorOffset` reuses the existing helpers from this file:
- Scrolling → Paginated: `offset = computeOffset()` pattern from `useScrollSave.ts:92-119` (extract or expose it).
- Paginated → Scrolling: `findScrollTarget(article, blocks, offset)?.scrollIntoView({block:"start"})` — already imported at `ArticleView.tsx:28`, already called at L159, L225. The EXACT same call serves the mode-switch anchor.

**The shared `<article>` element** — UI-SPEC §Component Inventory L734 mandates the SAME `<article>` element in both modes (no duplicate tree). The `.paginated-surface` modifier toggles the page-content-box geometry via CSS.

---

## Shared Patterns (cross-cutting — apply to ALL Phase 4 files)

### S1: Zod-at-boundary validation
**Source:** `src/content/schema.ts:14`, `src/measurement/types.ts:14`
**Apply to:** `src/pagination/types.ts` (the new contract), `src/content/schema.ts` edit (the `readingMode` field).
```typescript
import { z } from "zod";
export const PageFragmentSchema = z.object({ /* ... */ });
export type PageFragment = z.infer<typeof PageFragmentSchema>;
```
Schemas are the single source of truth; never hand-write a parallel type for non-recursive shapes. Phase 4's `PageFragment` is non-recursive → infer the type. (The recursive `Block` two-pass pattern at `schema.ts:127-163` does NOT apply here.)

### S2: Exhaustive block-kind switch, no default (Pattern F)
**Source:** `src/content/render/BlockRenderer.tsx:22-112`, `src/measurement/engine.ts:343-367`, `src/content/normalizeText.ts:41-63`
**Apply to:** `src/pagination/splitBlock.ts`, `src/pagination/fragment.ts` (the per-kind fragmentation policy).
```typescript
switch (block.kind) {
  case "heading":          /* ... */ break;
  case "paragraph":        /* ... */ break;
  case "blockquote":       /* ... */ break;
  case "bulleted-list":    /* ... */ break;
  case "numbered-list":    /* ... */ break;
  case "figure":           /* ... */ break;
  case "code-block":       /* ... */ break;
  case "footnote-reference": /* ... */ break;
  case "unsupported":      /* ... */ break;
  // NO default — TS flags missing cases at compile time
}
```
Import `Block` from `src/content/types.ts` (or `BlockKind` from `src/measurement/engine.ts:63`); do NOT re-declare the union.

### S3: Cancelled-flag / epoch-guard async pattern
**Source:** `src/routes/ArticleView.tsx:107-129` (cancelled flag), `src/measurement/engine.ts:141-202` (epoch guard)
**Apply to:** the repagination effect in `PaginatedSurface.tsx` or `ArticleView.tsx` (capture offset → `setPages(newPages)` → re-anchor).
```typescript
useEffect(() => {
  let cancelled = false;
  // async pagination work
  return () => { cancelled = true; };
}, [/* deps */]);
```
A stale pagination pass MUST NOT overwrite a newer layout (PAGE-05/SC4). Pairs with Phase 3's `trustedView` retention (the old page stays mounted until the new one commits — PAGE-06).

### S4: Listener + cleanup discipline (window/document/ResizeObserver)
**Source:** `src/reader/SectionAnnouncer.tsx:94-113`, `src/reader/useScrollSave.ts:156-214`, `src/measurement/triggers.ts:60-96`
**Apply to:** `src/reader/PageTurnControls.tsx` (keyboard + swipe), `ModeToggle` announce, the `M` shortcut.
```typescript
window.addEventListener("keydown", onKey, { passive: true });
return () => window.removeEventListener("keydown", onKey);
```
Passive listeners (`{ passive: true }`); `preventDefault()` ONLY on handled keys; cleanup removes every listener.

### S5: Ref-stable closures (hooks)
**Source:** `src/measurement/useMeasurement.ts:67-73`, `src/reader/useScrollSave.ts:77-80`, `src/settings/SettingsContext.tsx:67-68`
**Apply to:** any new hook in `PaginatedSurface.tsx` that reads article/settings without re-running its effect on every change.
```typescript
const settingsRef = useRef(settings);
settingsRef.current = settings;
```
The effect closure reads `settingsRef.current` so it stays stable across re-renders.

### S6: DiagnosticBus emission + subscription
**Source:** `src/measurement/diagnostics.ts:42-71` (emit/subscribe/recent), `src/measurement/engine.ts:164-200` (emit sites)
**Apply to:** `src/pagination/fragment.ts` (emit `dom-fallback`/`measurement-error` on failure), `PaginationFallbackBanner.tsx` (subscribe for reader-visible surfacing).
```typescript
// emit (engine/pagination)
diagnostics.emit({ kind: "dom-fallback", ts: new Date().toISOString() });
// subscribe (UI)
const unsub = diagnostics.subscribe((event) => {
  if (event.kind === "dom-fallback" || event.kind === "measurement-error") setShowBanner(true);
});
return unsub;
```
The 6 kinds are the closed set (`src/measurement/types.ts:128-135`); Phase 4 emits MORE of 2 existing kinds, never a 7th. Only `dom-fallback` + `measurement-error` are reader-visible (UI-SPEC §23 table — locked).

### S7: Authored CSS + custom properties, no Tailwind/component suite
**Source:** `src/app.css` (entire file), `src/settings/applyTheme.ts:29-38` (custom-property writes)
**Apply to:** every new class hook (`.mode-toggle`, `.page-turn`, `.page-turn-previous`, `.page-turn-next`, `.page-indicator`, `.pagination-fallback-banner`, `.paginated-surface`, `.page-fragment`).
```typescript
// applyTheme pattern — write custom properties for live-apply
root.style.setProperty("--measure", `${s.measure}ch`);
```
Page geometry lives in CSS (`width: var(--measure)`, `height: calc(100vh - 48px - 2px - 2 * var(--space-2xl))` per UI-SPEC §Layout L771-786). The `.status` card base styles are already authored at `src/app.css:257-271` — the banner extends them.

### S8: Inline SVG glyph (no icon library)
**Source:** `src/reader/Header.tsx:42-59` (gear), `src/reader/StorageBanner.tsx:47-64` (× dismiss)
**Apply to:** `ModeToggle.tsx` (paginated/scrolling glyphs), `PageTurnControls.tsx` (chevron-left/right), `PaginationFallbackBanner.tsx` (× dismiss — copy verbatim from StorageBanner).
```typescript
<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="1.75"
  aria-hidden="true" focusable="false">
  {/* paths */}
</svg>
```
`aria-hidden="true"` because `aria-label` carries the name; `focusable="false"` for IE/old Edge. The glyph state change is the secondary cue beyond `aria-pressed`/`aria-disabled` (forced-colors safety).

### S9: Polite live-region announce (role=status + aria-live=polite + aria-atomic=true)
**Source:** `src/reader/SectionAnnouncer.tsx:115-124`, `src/reader/StorageBanner.tsx:20-26`, `src/reader/ResumeBanner.tsx:33-39`
**Apply to:** `PageTurnControls.tsx` ("Page N of M" announce), `ModeToggle.tsx` ("Switched to paginated/scrolling reading"), `PaginationFallbackBanner.tsx` (banner region).
```typescript
<div className="visually-hidden" role="status"
  aria-live="polite" aria-atomic="true">
  {announce}
</div>
```
`polite` (never `assertive` — interrupts SR mid-utterance). `.visually-hidden` is authored at `src/app.css:116`. Debounced ~250ms so rapid turns don't flood (SectionAnnouncer L74-77).

### S10: D-05 grapheme substrate reuse (DO NOT FORK)
**Source:** `src/content/normalizeText.ts` (`graphemeClusters` L91-94, `BLOCK_SEPARATOR` L13, `normalizeRunText` L24-26), `src/reader/restoreLocation.ts` (`normalizeElText` L50-62, `findScrollTarget` L81-104), `src/reader/useScrollSave.ts` (`computeOffset` L92-119)
**Apply to:** `src/pagination/lineBoxes.ts` (map DOM offsets → grapheme offsets), `src/pagination/splitBlock.ts` (split at grapheme boundaries), `ArticleView.tsx` (mode-switch anchor D4-10, repagination anchor D4-11).
```typescript
import { graphemeClusters, BLOCK_SEPARATOR } from "../content/normalizeText";
import { normalizeElText, findScrollTarget } from "../reader/restoreLocation";
```
**Pitfall 3:** any divergence in text normalization shifts every split point and breaks the D-05 round-trip. Reuse `normalizeElText` for the DOM text and `graphemeClusters` for the offset math. The block selector string `"h2, h3, h4, p, blockquote, li, pre, figure, sup, details"` is reused verbatim at 4 sites — pagination is the 5th, copy it byte-identical.

### S11: Staleness-safe pipeline reuse (DO NOT RE-IMPLEMENT)
**Source:** `src/measurement/useMeasurement.ts` (returns `trustedView`), `src/measurement/engine.ts` (font-gate + epoch guard)
**Apply to:** `ArticleView.tsx` (read `useMeasurement()` return — currently ignored at L103), `PaginatedSurface.tsx` (consume `trustedView` to derive pages).
```typescript
const trustedView = useMeasurement(article, articleRef);  // PAGE-06/07 already inside
```
Phase 4 does NOT re-implement trust. PAGE-06 (last-valid-view retention) + PAGE-07 (late-epoch drop) live inside the hook; Phase 4 inherits them by reading the return value. Repagination anchor (D4-11) captures the offset BEFORE swapping pages so the old page stays mounted during compute.

### S12: React state/context only (no Redux/Zustand)
**Source:** `src/settings/SettingsContext.tsx` (the project's only context), `src/measurement/useMeasurement.ts` (hooks, not stores)
**Apply to:** all Phase 4 state — `readingMode` flows through `SettingsContext`; pagination state (pages, current page index, fallback flag) is React `useState`/`useRef` local to `PaginatedSurface.tsx`/`ArticleView.tsx`.
```typescript
const { settings, update } = useSettings();
const [pages, setPages] = useState<PageFragment[] | null>(null);
const [currentPageIdx, setCurrentPageIdx] = useState(0);
```
**Persisting derived page boundaries is FORBIDDEN** (STACK.md) — `pages` is never written to Dexie; it recomputes on every `trustedView` commit.

---

## Test Pattern Analogs

### Unit test (pure domain logic — pagination contracts)
**Analog:** `tests/unit/restoreLocation.test.ts` (241 lines)
**Apply to:** `tests/unit/pagination/fragment.test.ts`, `splitBlock.test.ts`, `widowRules.test.ts`, `lineBoxes.test.ts`.
```typescript
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}
// HTMLElement stubs carrying .textContent + dataset.kind (jsdom — no layout)
function makeBlock(text: string, kind?: string, tag = "p"): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (kind) el.dataset.kind = kind;
  return el;
}
```
jsdom is sufficient for pure offset/splitting math (no `getClientRects` layout truth). The pagination engine is testable with a `MeasurementResult` stub + HTMLElement stubs carrying mocked `.getClientRects()`.

### Component test (React Testing Library)
**Analog:** `tests/component/ArticleView.test.tsx`, `tests/component/SettingsContext.test.tsx`
**Apply to:** `tests/component/PaginatedSurface.test.tsx`, `ModeToggle.test.tsx`, `PageTurnControls.test.tsx`.
Query by role + label (RTL convention); assert `aria-pressed`, `aria-disabled`, live-region announces.

### E2E test (real-browser layout truth — REQUIRED for pagination correctness)
**Analog:** `tests/e2e/measurement/stale-drop.spec.ts` (117 lines) — the PAGE-07 race test; `tests/e2e/measurement/last-valid-view.spec.ts`.
**Apply to:** `tests/e2e/pagination/*.spec.ts` — PAGE-03 (exactly-once/no-clipping/no-duplication/non-termination) MUST run in Chromium/Firefox/WebKit across the 6-fixture corpus × viewport × typography matrix.
```typescript
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }));  // image-stub
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => { /* IndexedDB-wipe for deterministic state */ });
});
```
Image-stub + IndexedDB-wipe + hash-route navigation + h1-visible sentinel — copy the harness verbatim from `stale-drop.spec.ts:21-34`. The DEV-only `window.__lem*` debug hook pattern (`useMeasurement.ts:122-125`) is the template for exposing pagination internals to e2e assertions.

---

## No Analog Found

**None.** Every Phase 4 file has a concrete in-repo analog. The two genuinely novel pieces — `src/pagination/lineBoxes.ts` (the `Range.getClientRects()` → grapheme-offset mapping) and `src/pagination/splitBlock.ts` (the run-splitting logic) — have no prior implementation in this codebase (Pretext was rejected by the calibration fingerprint — RESEARCH §Standard Stack + Pitfall 1), but they reuse the structural discipline of `src/measurement/domMeasurer.ts` (batched read-phase) and `src/content/normalizeText.ts` (exhaustive block-kind switch) respectively. The RESEARCH §Architecture Patterns + §Code Examples provide the skeleton; this PATTERNS.md pins the surrounding conventions (imports, comments, error handling, diagnostic emission) to copy from.

---

## Metadata

**Analog search scope:** `src/` (all subdirectories), `tests/` (all subdirectories), `.planning/research/STACK.md` (embedded in AGENTS.md).
**Files scanned:** 41 source files (`.ts`/`.tsx`), 33 test files (`.test.ts`/`.test.tsx`/`.spec.ts`), 1 CSS file (`src/app.css`).
**Pattern extraction date:** 2026-08-05.
**Reuse-target signatures pinned (planner copies these verbatim):**
- `useMeasurement(article, articleElRef): MeasurementResult | null` — `src/measurement/useMeasurement.ts:58`
- `DiagnosticBus.emit({kind, ts})` / `.subscribe(handler): () => void` / `.recent(): readonly DiagnosticEvent[]` — `src/measurement/diagnostics.ts:42,58,69`
- `findScrollTarget(article, blocks, offset): HTMLElement | null` — `src/reader/restoreLocation.ts:81`
- `normalizeElText(el): string` — `src/reader/restoreLocation.ts:50`
- `graphemeClusters(text, locale): string[]` + `BLOCK_SEPARATOR` + `normalizeRunText(text)` — `src/content/normalizeText.ts:91,13,24`
- `BlockView({block})` + `ArticleBody({article})` + `InlineList({runs})` — `src/content/render/BlockRenderer.tsx:21,115` + `src/content/render/InlineRenderer.tsx:37`
- `useSettings(): { settings, update, reset, storageState, resetLocalData }` — `src/settings/SettingsContext.tsx:215`
- `BlockKind` union — `src/measurement/engine.ts:63` (import, do not re-declare)
- `BLOCK_SELECTOR = "h2, h3, h4, p, blockquote, li, pre, figure, sup, details"` — reused at `domMeasurer.ts:34`, `engine.ts:304`, `useScrollSave.ts:99`, `ArticleView.tsx:54` (5th site in pagination — copy byte-identical)
