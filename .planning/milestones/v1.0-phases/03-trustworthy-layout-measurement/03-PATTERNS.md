# Phase 3: Trustworthy Layout Measurement - Pattern Map

**Mapped:** 2026-08-04
**Files analyzed:** 18 new + 2 modified
**Analogs found:** 15 / 18 (3 use RESEARCH.md patterns — no codebase analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/measurement/types.ts` | model | transform (schema defs) | `src/content/schema.ts` | **exact** |
| `src/measurement/epoch.ts` | utility (class) | event-driven (cancellation) | `src/routes/ArticleView.tsx` L95–117 | role-match (structured upgrade) |
| `src/measurement/fontGate.ts` | utility | async/promise | *none* — RESEARCH Pattern 3 | no analog |
| `src/measurement/triggers.ts` | service (observer) | event-driven (multi-source coalesce) | `src/settings/SettingsContext.tsx` L113–165 + `src/reader/useScrollSave.ts` L142–202 | role-match |
| `src/measurement/textMeasurer.ts` | service (adapter) | transform (canvas measure) | `src/settings/applyTheme.ts` | role-match (typed seam) |
| `src/measurement/domMeasurer.ts` | service | DOM I/O (read layout) | `src/reader/useScrollSave.ts` L92–119 | role-match |
| `src/measurement/engine.ts` | service (orchestrator) | async pipeline | `src/routes/ArticleView.tsx` L95–170 | role-match |
| `src/measurement/driftGuard.ts` | service | sampling/transform | *none direct* — conceptual sibling: epoch commit guard (RESEARCH Pattern 4) | partial |
| `src/measurement/diagnostics.ts` | service (bus) | event-driven (pub-sub) | *none direct* — shape from `src/content/schema.ts` | no analog (shape only) |
| `src/measurement/useMeasurement.ts` | hook | React state binding | `src/reader/useScrollSave.ts` | **exact (role)** |
| `src/routes/ArticleView.tsx` *(modify)* | route/component | request-response | itself + useScrollSave mount pattern | exact |
| `tests/unit/measurement/*.test.ts` (×5) | test | unit invariant | `tests/unit/schema.test.ts` + `tests/unit/normalizeText.test.ts` | exact |
| `tests/e2e/measurement/*.spec.ts` (×2) | test | e2e real-browser | `tests/e2e/typography-live-apply.spec.ts` | exact |
| `tests/e2e/calibration/*` (×3) | test/harness | e2e matrix | `tests/e2e/a11y.spec.ts` + `tests/e2e/typography-live-apply.spec.ts` | exact |
| `calibration/fingerprint.json` | config/artifact | file I/O | *none* — RESEARCH §Calibration Matrix | no analog |
| `package.json` *(modify)* | config | — | itself | exact |

## Pattern Assignments

### `src/measurement/types.ts` (model, transform)

**Analog:** `src/content/schema.ts` — the project's locked Zod-at-boundary pattern.

**Why:** `Constraints`, `MeasurementResult`, `BlockMeasurement`, `EligibilityState`, and `DiagnosticEvent` are all Zod-validated boundary types consumed downstream by Phase 4. The discriminated-union + two-pass recursive declaration in `schema.ts` is the exact precedent for the `DiagnosticEvent` discriminated union (D3-05).

**Imports pattern** (`src/content/schema.ts` L16):
```typescript
import { z } from "zod";
```

**Discriminated union pattern** (`src/content/schema.ts` L55–71, L153–163) — copy this shape for `DiagnosticEvent`:
```typescript
// Each variant carries kind: z.literal(...) as the discriminant.
export const HeadingBlock = z.object({
  kind: z.literal("heading"),
  level: z.union([/* ... */]),
  content: z.array(InlineRun),
});
export const ParagraphBlock = z.object({
  kind: z.literal("paragraph"),
  content: z.array(InlineRun),
});
// ...one const per variant...
export const BlockSchema: z.ZodType<Block> = z.discriminatedUnion("kind", [
  HeadingBlock, ParagraphBlock, /* ... */
]);
```

**Two-pass recursive type pattern** (`src/content/schema.ts` L122–163) — use ONLY if `MeasurementResult`/`BlockMeasurement` needs to reference `Block`-shaped children recursively (likely NOT needed here; measurement results are flat per-block). The pattern is cited for completeness; the planner should prefer the simpler non-recursive `ReaderSettingsSchema` shape (`schema.ts` L209–228) for flat records:
```typescript
// Flat record pattern (schema.ts L209–228) — PREFER this for Constraints,
// EligibilityState, fingerprint rows:
export const ReaderSettingsSchema = z.object({
  schemaVersion: z.literal(1),           // STATE-04 migration hook
  font: z.enum(["serif", "sans", "dyslexic"]),
  size: z.union([z.literal(16), /* ... */]),
  // ...
});
export type ReaderSettings = z.infer<typeof ReaderSettingsSchema>;
```

**Rule to replicate:** schemas are the single source of truth; never hand-write a parallel TS type for non-recursive shapes (schema.ts L195–198). Inferred types are re-exported from `src/content/types.ts` — the new measurement types should either live in `types.ts` or a sibling `src/measurement/types.ts` re-export (planner's call).

**Pitfall to replicate the defense for:** V5 Input Validation — `DiagnosticEvent` is consumed by Phase 4 UI, so an unvalidated shape is an injection vector. Zod-validate at emit AND consume boundary (RESEARCH §Security Domain).

---

### `src/measurement/epoch.ts` (utility/class, event-driven cancellation)

**Analog:** `src/routes/ArticleView.tsx` L95–117 — the cancelled-flag async pattern. This is the SIMPLER ANCESTOR; `epoch.ts` is its structured upgrade for long-running measurement where multiple generations may race (RESEARCH §State of the Art).

**The ancestor pattern** (`src/routes/ArticleView.tsx` L93–117):
```typescript
// Load article on articleId change (cancelled-flag pattern preserved from
// Phase 1 — a slow load cannot overwrite a fast in-flight update).
useEffect(() => {
  let cancelled = false;
  setStatus("loading");
  setArticle(null);
  // Reset restore state on article swap ...
  openArticle(articleId)
    .then((a) => {
      if (cancelled) return;          // ← the staleness guard
      setArticle(a);
      setStatus(a ? "ready" : "error");
    })
    .catch(() => {
      if (cancelled) return;
      setStatus("error");
    });
  return () => {
    cancelled = true;                 // ← cancel-in-flight on cleanup
  };
}, [articleId]);
```

**The same pattern, second instance** (`src/settings/SettingsContext.tsx` L81–105) — confirms it is the project convention for async-load effects:
```typescript
useEffect(() => {
  let cancelled = false;
  loadSettings()
    .then((result) => {
      if (cancelled) return;
      // ...
    })
    .catch(() => {
      if (cancelled) return;
      setStorageState("unavailable");
    });
  return () => {
    cancelled = true;
  };
}, []);
```

**Upgrade target (RESEARCH Pattern 2, L274–302):** replace the boolean with a monotonic counter + `AbortController`. The boolean stays as the simpler form for short loads; the epoch is for long-running measurement where multiple generations may race.
```typescript
export class Epoch {
  private current = 0;
  private controller = new AbortController();
  bump(): { epoch: number; signal: AbortSignal } {
    this.controller.abort();                 // cancel in-flight (D3-07)
    this.controller = new AbortController();
    this.current += 1;
    return { epoch: this.current, signal: this.controller.signal };
  }
  isCurrent(candidate: number): boolean { return candidate === this.current; }
}
```

**Rule to replicate:** the cancelled-flag comment style — every async effect documents WHY the guard exists ("a slow X cannot overwrite a fast in-flight Y"). The epoch class should carry the same kind of comment citing PAGE-07.

**Grep-verified:** NO existing `AbortController` usage in the codebase — this is the first introduction. The planner should add a brief comment at the import site noting it is Baseline (RESEARCH §Environment Availability).

---

### `src/measurement/fontGate.ts` (utility, async/promise)

**Analog:** NONE in the codebase. Grep confirms the only mention of `document.fonts.ready` is a comment in `src/settings/tokens.ts` L11 noting Phase 2 is "font-load-safe — no `document.fonts.ready` gate required this phase."

**Use RESEARCH.md Pattern 3 (L304–324) as the reference:**
```typescript
// document.fonts.ready is Baseline-widely-available (MDN). The
// onloadingdone EVENT is NOT Baseline (MDN "Limited availability") — do NOT
// rely on it as the sole signal. Re-awaiting .ready after every trigger is
// the portable primitive.
export async function awaitFontsReady(signal: AbortSignal): Promise<void> {
  await document.fonts.ready;
  if (signal.aborted) throw new AbortError();
}
```

**Pitfalls to encode in comments (RESEARCH §Common Pitfalls 3 + §Anti-Patterns):**
- Do NOT rely on `document.fonts.onloadingdone` as the sole signal (MDN "Limited availability").
- Re-await `document.fonts.ready` after every trigger; the promise is re-awaitable and resolves fresh each time.
- A font swap after measurement invalidates every predicted line break (D3-06 hard gate).

**Import-style precedent:** the function takes an `AbortSignal` param (not a module-global) so it composes with `epoch.ts`. Follow the typed-seam discipline of `src/settings/applyTheme.ts` (single-purpose, typed input, no side effects beyond the documented one).

---

### `src/measurement/triggers.ts` (service/observer, event-driven coalescing)

**Analog:** `src/settings/SettingsContext.tsx` L57–165 (debounce + dual-event flush + cancel-on-cleanup) and `src/reader/useScrollSave.ts` L142–202 (listener + cleanup). Together these are the project's precedent for coalescing a stream of events into a debounced action.

**Debounce + pending-ref pattern** (`src/settings/SettingsContext.tsx` L57–129):
```typescript
/** Debounce window for settings writes (02-RESEARCH Open Question #2). */
const SAVE_DEBOUNCE_MS = 400;

// Pending debounced write + the latest settings snapshot for flush-on-hide.
const saveTimer = useRef<number | null>(null);
const pendingRef = useRef<ReaderSettings | null>(null);

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
    saveSettings(s).catch((e) => { /* classify */ });
  }, SAVE_DEBOUNCE_MS);
}, []);
```

**Listener + cleanup pattern** (`src/settings/SettingsContext.tsx` L154–165):
```typescript
useEffect(() => {
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushSave();
  };
  const onPageHide = () => flushSave();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}, [flushSave]);
```

**Timer cleanup on unmount** (`src/settings/SettingsContext.tsx` L169–177) — replicate to avoid setState-after-unmount:
```typescript
useEffect(() => {
  return () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingRef.current = null;
  };
}, []);
```

**Rules to replicate:**
- **400ms is the project precedent** for a debounce window on user-driven change (D3-07 discretion explicitly cites "Phase 2's 400ms precedent"). TriggerCoalescer should default to ~400ms; the planner may tune.
- Passive listeners where the hook never calls `preventDefault` (`useScrollSave.ts` L171: `{ passive: true }`).
- Refs hold the latest snapshot so listener closures stay stable without re-registering (both analogs do this).
- The deprecated bfcache-breaking session-end events (`beforeunload`/`unload`) are FORBIDDEN — verified by acceptance-criteria grep in Phase 2.

**`ResizeObserver` is new** (grep-verified: no existing usage). The planner should add a comment citing Pitfall 1 (RESEARCH §Common Pitfalls 1): NEVER write measurement-derived geometry back to the observed element synchronously — write to async React state, or defer via `requestAnimationFrame` (the rAF-defer pattern is already used in `ArticleView.tsx` L142–160 for the restore scroll).

---

### `src/measurement/textMeasurer.ts` (service/adapter, transform)

**Analog:** `src/settings/applyTheme.ts` — the project's precedent for a single-purpose, typed-seam function that wraps a side-effectful operation behind a Zod-validated input. This file is also the ONLY file that imports a specific external concern (FONT_STACKS/SPACING_PRESETS), exactly as `textMeasurer.ts` must be the ONLY file that imports `@chenglou/pretext` (RESEARCH §Recommended Project Structure L219–220).

**The typed-seam pattern** (`src/settings/applyTheme.ts` L26–39):
```typescript
import type { ReaderSettings } from "../content/schema";
import { FONT_STACKS, SPACING_PRESETS } from "./tokens";

export function applyTheme(s: ReaderSettings): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.style.setProperty("--font-body", FONT_STACKS[s.font]);
  root.style.setProperty("--font-size", `${s.size}px`);
  const preset = SPACING_PRESETS[s.spacing];
  root.style.setProperty("--line-height", String(preset.lineHeight));
  // ...
}
```

**Copy this discipline:**
1. `import type` for type-only imports (mandatory — `tsconfig.json` L13 `verbatimModuleSyntax: true`).
2. Typed input derived from a Zod schema (never `any`).
3. Single responsibility — one exported function family, one external concern.
4. Header comment documents the security boundary (applyTheme L21–25: "every value derives from a Zod-validated enum… no injection surface").

**Pretext API reference (RESEARCH §Code Examples L452–489):** the ONLY import of `@chenglou/pretext` in the codebase:
```typescript
import { prepare, layout, prepareWithSegments, layoutWithLines } from "@chenglou/pretext";
```

**Pitfalls the adapter MUST defend (RESEARCH §Common Pitfalls 5, 6, 7):**
- **Pitfall 5:** Pretext README warns `system-ui` is unsafe for `layout()` on macOS. The `sans` FONT_STACK (`src/settings/tokens.ts` L17) starts with `system-ui`. Calibration MUST measure `sans`; if it fails, pin a named family or DOM-measure under `sans`.
- **Pitfall 6:** Pretext `prepare()` accepts `letterSpacing` but NOT `wordSpacing`. The `spacious` preset (`tokens.ts` L27) writes `wordSpacing: "0.05em"`. Calibration MUST include the spacious preset.
- **Pitfall 7:** Headings have hardcoded geometry independent of `--font-size` (see Shared Patterns §Heading Geometry below). The adapter MUST derive `font` + `lineHeight` per block kind, NOT assume body geometry for all.

**FONT_STACK source-of-truth** (`src/settings/tokens.ts` L14–19) — import from here, do not duplicate:
```typescript
export const FONT_STACKS = {
  serif: "'Iowan Old Style', 'Source Serif Pro', ..., serif",
  sans: "system-ui, -apple-system, ..., sans-serif",
  dyslexic: "Verdana, Tahoma, ..., sans-serif",
} as const;
```

---

### `src/measurement/domMeasurer.ts` (service, DOM I/O)

**Analog:** `src/reader/useScrollSave.ts` L92–119 — the project's precedent for imperative DOM reads via `getBoundingClientRect()` on a queried set of block elements. This is the closest existing DOM-measurement code.

**The DOM-read pattern** (`src/reader/useScrollSave.ts` L92–119):
```typescript
function computeOffset(): number {
  const article = articleRef.current;
  if (!article) return 0;
  const articleEl = articleElRef.current;
  if (!articleEl) return 0;
  const blocks = Array.from(
    articleEl.querySelectorAll<HTMLElement>(
      "h2, h3, h4, p, blockquote, li, pre, figure, sup, details",
    ),
  );
  if (blocks.length === 0) return 0;
  let consumed = 0;
  let offset = 0;
  for (const el of blocks) {
    const text = normalizeElText(el);
    const len = graphemeClusters(text, article.lang).length;
    const topRelativeToViewport = el.getBoundingClientRect().top;
    if (topRelativeToViewport <= HEADER_PX + 8) {
      offset = consumed;
    }
    consumed += len + BLOCK_SEPARATOR.length;
  }
  return offset;
}
```

**Second instance of the same primitive** (`src/reader/SectionAnnouncer.tsx` L63) — confirms `getBoundingClientRect()` on queried headings is the convention:
```typescript
(h) => h.getBoundingClientRect().top < HEADER_PX + 8,
```

**Block-selector convention** — reuse the EXACT selector list from `ArticleView.tsx` L50–56 (and `useScrollSave.ts` L98–100) so domMeasurer reads the same elements the renderer emitted:
```typescript
function queryBlocks(articleEl: HTMLElement): HTMLElement[] {
  return Array.from(
    articleEl.querySelectorAll<HTMLElement>(
      "h2, h3, h4, p, blockquote, li, pre, figure, sup, details",
    ),
  );
}
```

**DOM output map (from `src/content/render/BlockRenderer.tsx`)** — what each block kind renders to, so domMeasurer knows the selector per kind:
| Block kind | Rendered element | Source line |
|------------|------------------|-------------|
| heading (level N) | `<h1>`..`<h6>` | BlockRenderer L23–30 |
| paragraph | `<p>` | L31–36 |
| blockquote | `<blockquote>` (recursive) | L37–44 |
| bulleted-list | `<ul><li>` | L45–56 |
| numbered-list | `<ol start><li>` | L57–68 |
| figure | `<figure><img><figcaption>` | L69–79 |
| code-block | `<pre><code>` | L80–86 |
| footnote-reference | `<sup><a>` | L87–99 |
| unsupported | `<details class="disclosure">` | L100–111 |

**Rules to replicate:**
- **Batch reads before writes** (RESEARCH Pitfall 2): for DOM-measured kinds, read every block's `getBoundingClientRect` in a single read-phase before touching state. The analog does one read per block in a tight loop with no interleaved writes — preserve that.
- **Use fractional pixels:** `getBoundingClientRect().height` (fractional), NOT `offsetHeight`/`scrollHeight` (integer — hides sub-pixel drift). RESEARCH §State of the Art.
- **Per-line break extraction:** `Element.getClientRects()` on an inline `<span>` wrapper returns one DOMRect per CSS line (RESEARCH §Code Examples L491–517). This is NEW usage — no existing analog; cite MDN.

---

### `src/measurement/engine.ts` (service/orchestrator, async pipeline)

**Analog:** `src/routes/ArticleView.tsx` L95–170 — the project's most-complex async effect, combining the cancelled-flag load (L95–117) with a rAF-deferred follow-up (L142–160). The engine is this pattern extracted into a testable class.

**The rAF-defer + cancel pattern** (`src/routes/ArticleView.tsx` L124–170) — copy this for the engine's "wait for DOM commit before measuring" step:
```typescript
useEffect(() => {
  if (!article) return;
  let cancelled = false;
  loadLocation(article.id, article.revision)
    .then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.location) return;
      const loc = result.location;
      // Wait one animation frame so the article body is committed to the
      // DOM before we query block elements ...
      const rafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const articleEl = articleRef.current;
        if (!articleEl) return;
        const blocks = queryBlocks(articleEl);
        const target = findScrollTarget(article, blocks, loc.graphemeOffset);
        if (target) {
          target.scrollIntoView({ block: "start" });
        }
        setRestoredOffset(loc);
        setShowResumeBanner(true);
      });
      // rAF cleanup on unmount/re-render — if the article swaps before the
      // frame fires, we cancel it so we don't scroll a stale article.
      return () => cancelAnimationFrame(rafId);
    })
    .catch(() => {
      if (cancelled) return;
    });
  return () => {
    cancelled = true;
  };
}, [article]);
```

**Engine skeleton (RESEARCH §Code Examples L519–544):**
```typescript
async function runMeasurement(article, constraints, epoch): Promise<void> {
  const { epoch: captured, signal } = epoch.bump();
  try {
    await awaitFontsReady(signal);                         // D3-06
    const result = await measureAllBlocks(article, constraints, signal);
    // CommitGuard (PAGE-07):
    if (!epoch.isCurrent(captured) || signal.aborted) {
      diagnostics.emit({ kind: "late-epoch-drop", captured, current: epoch.current });
      return;                                              // stale → DROP
    }
    trustedView.commit(result);                            // newest → COMMIT
  } catch (e) {
    if (e instanceof AbortError) return;                   // cancelled, expected
    diagnostics.emit({ kind: "measurement-error", message: String(e) });
    // Reader keeps the last trusted view (PAGE-06) — no blank state.
  }
}
```

**Per-kind dispatch (RESEARCH Pattern 5, L354–366)** — mirrors the Block union split in `src/content/schema.ts`:
```typescript
// Eligible for the Pretext fast path: paragraph, heading (D3-01).
// DOM-measured by definition: blockquote, bulleted-list, numbered-list,
// figure, code-block, footnote-reference, unsupported.
// (Mirrors src/content/schema.ts Block union kinds.)
function chooseStrategy(kind: BlockKind, eligibility: EligibilityState): "pretext" | "dom" {
  if (kind !== "paragraph" && kind !== "heading") return "dom";
  return eligibility[kind].pretextEligible ? "pretext" : "dom";
}
```

**Rule to replicate:** the exhaustiveness pattern from `BlockRenderer.tsx` L21–113 — a `switch` over `block.kind` with NO default fallthrough, so TypeScript flags any missing case at compile time. The engine's per-kind dispatch should use the same shape.

---

### `src/measurement/driftGuard.ts` (service, sampling/transform)

**Analog:** NONE direct. Conceptually the closest sibling is the epoch commit guard (both are "check a condition at commit time and downgrade/drop"). The downgrade-on-drift mechanism is novel to this phase.

**Use RESEARCH Pattern 4 (L326–352) as the reference.** The guard samples N blocks per measurement pass, re-measures them via DOM, compares to the Pretext prediction, and downgrades the kind Pretext→DOM if drift exceeds tolerance. It emits a `runtime-guard-downgrade` diagnostic (D3-05).

**Closest existing "classify and route" pattern:** `src/persistence/errors.ts` (the `classifyStorageError` function referenced in SettingsContext L126 and useScrollSave L132). The driftGuard's "classify drift → decide strategy" is the same shape. Read `src/persistence/errors.ts` for the project's classify-and-route convention if needed.

**Rules to replicate:**
- D3-08 discretion: sampling cadence/threshold is the planner's call (RESEARCH Assumption A3 — must be cheap enough not to defeat Pretext's performance purpose).
- A downgrade MUST emit a diagnostic (D3-05) — never silently degrade.
- The guard exists BECAUSE Pretext is primary (D3-03); a build-time-only fingerprint cannot see runtime drift.

---

### `src/measurement/diagnostics.ts` (service/bus, event-driven pub-sub)

**Analog:** NONE direct — no event bus exists in the codebase. The SHAPE of events comes from `src/content/schema.ts` (discriminated union — see `types.ts` assignment above). The bus itself is new.

**Use RESEARCH §Architecture Patterns L191–197 + §Open Question 5 (L692–695) as the reference.** The bus is:
- In-memory only (NOT IndexedDB — STACK.md forbids persisting derived geometry; RESEARCH §Anti-Patterns L369).
- Versioned shape consumed by Phase 4's PAGE-09 UI (D3-05).
- Event kinds (RESEARCH L693): `drift-exceedance`, `dom-fallback`, `late-epoch-drop`, `calibration-failure`, `runtime-guard-downgrade`, `measurement-error`.

**Closest existing "in-memory observable" pattern:** the `useSettings()` context (`src/settings/SettingsContext.tsx` L215–221) — a useContext + throw-if-missing-provider shape. If the bus is exposed to React via context, follow this pattern:
```typescript
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used inside <SettingsProvider>");
  }
  return ctx;
}
```

**Rules to replicate:**
- **D3-04 (CRITICAL):** diagnostics are RECORDED but NOT shown to the reader in Phase 3. The status live-region (`role="status"` + `aria-live="polite"`, `ArticleView.tsx` L232) is RESERVED for consequential fallback events, NOT routine measurement chatter. Surfacing is Phase 4's job (PAGE-09).
- **V5 Input Validation (RESEARCH §Security Domain):** Zod-validate `DiagnosticEvent` at emit AND consume boundary; never `any`. Phase 4 will extend, not rewrite (RESEARCH L695).

---

### `src/measurement/useMeasurement.ts` (hook, React state binding)

**Analog:** `src/reader/useScrollSave.ts` — the project's first and only custom hook. This is the EXACT role-match: a side-effect hook that subscribes to a stream, debounces/coalesces, reads refs for stable closures, and cleans up on unmount.

**Hook signature pattern** (`src/reader/useScrollSave.ts` L68–72) — copy the nullable-article + ref + options shape:
```typescript
export function useScrollSave(
  article: CanonicalArticle | null,
  articleElRef: React.RefObject<HTMLElement | null>,
  options?: UseScrollSaveOptions,
): void {
```

**Ref-stable closures pattern** (`src/reader/useScrollSave.ts` L77–80) — replicate so listener closures don't re-register on every render:
```typescript
const optionsRef = useRef(options);
optionsRef.current = options;
const articleRef = useRef(article);
articleRef.current = article;
```

**Nullable-article no-op pattern** (`src/reader/useScrollSave.ts` L156–157) — the hook must be callable unconditionally (rules of hooks) even before the article loads:
```typescript
useEffect(() => {
  if (!article) return; // loading state — no scroll listener
  // ...
  return () => { /* cleanup */ };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [article]);
```

**PAGE-06 retention pattern (RESEARCH Pattern 1, L249–267):**
```typescript
// The trustedView state IS the "last valid view" (PAGE-06). It is replaced
// ONLY by a result that passed the font gate AND the epoch commit guard.
const [trustedView, setTrustedView] = useState<TrustedView | null>(null);
useEffect(() => {
  const engine = new MeasurementEngine({ article, constraints });
  const unsub = engine.onTrusted((result) => {
    setTrustedView(result);
  });
  return () => { engine.cancel(); unsub(); };
}, [article, constraints]);
```

**Rules to replicate:**
- Header comment documents the hook's purpose, what it NO-ops on, and the debounce window (see useScrollSave L1–25).
- Cleanup on unmount cancels timers AND unsubscribes (useScrollSave L204–214).
- The hook returns `void` (side-effect only) OR the trustedView state — planner's call, but if it returns state, follow the `useState<TrustedView | null>(null)` nullable-initial pattern.

---

### `src/routes/ArticleView.tsx` *(modify)* (route/component)

**Analog:** itself — the file already contains every pattern the measurement wiring needs (cancelled-flag, callback-ref, rAF-defer, status region). The modification is additive: mount `useMeasurement` and keep rendering the last trusted view.

**Callback-ref DOM node seam** (`src/routes/ArticleView.tsx` L73–85) — the existing seam a DOM-measurement path reads. NO change needed; `useMeasurement` consumes `articleEl` exactly as `SectionAnnouncer` already does (L257):
```typescript
const articleRef = useRef<HTMLElement>(null);
const [articleEl, setArticleEl] = useState<HTMLElement | null>(null);

const articleCallbackRef = useCallback((el: HTMLElement | null) => {
  articleRef.current = el;
  setArticleEl(el);
}, [], );
```

**Status region (DO NOT REPURPOSE)** (`src/routes/ArticleView.tsx` L232):
```typescript
<div className="status" role="status" aria-live="polite" aria-atomic="true">
```
D3-04 reserves this for consequential fallback events. Phase 3 must NOT write routine measurement chatter here. The CSS `.status` class is defined at `src/app.css` L257–271.

**Modification scope:** mount `useMeasurement(article, articleEl)` alongside the existing `useScrollSave(article, articleRef)` (L91). The scrolling view continues to render `<ArticleBody article={article} />` (L281) directly — in scrolling mode the "last valid view" machinery runs but its visible effect is subtle (reflow, not flash-blank). The payoff lands in Phase 4.

---

### `tests/unit/measurement/*.test.ts` (×5) (test, unit invariant)

**Analog:** `tests/unit/schema.test.ts` (Zod boundary validation) + `tests/unit/normalizeText.test.ts` (pure-function invariants). Together these are the project's unit-test conventions.

**Vitest import + describe/it.each pattern** (`tests/unit/schema.test.ts` L1–2, L47–58):
```typescript
import { describe, expect, it } from "vitest";
import { ArticleSchema, BlockSchema } from "../../src/content/schema";

describe("ArticleSchema.parse rejects bad identity / revision", () => {
  it.each([
    ["id is a URL (D-06 — id must be a slug, never the source URL)", { id: "https://example.com" }],
    ["revision is 0", { revision: 0 }],
    // ...
  ])("throws when %s", (_label, override) => {
    expect(() => ArticleSchema.parse(validArticle(override))).toThrow();
  });
});
```

**Test payload builder pattern** (`tests/unit/schema.test.ts` L15–30) — return `unknown` so Zod is exercised at runtime, overrides loosely typed:
```typescript
function validArticle(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "test-article",
    // ...
    ...overrides,
  };
}
```

**Header comment convention** (`tests/unit/normalizeText.test.ts` L10–14) — every test file opens with a comment naming the contract under test and the pitfalls guarded:
```typescript
/**
 * normalizeText substrate (D-05) — one deterministic string per article revision.
 * Guards Pitfall 2 (whitespace drift), Pitfall 3 (footnote body position),
 * code-block verbatim, and idempotency.
 */
```

**Rules to replicate:**
- `describe`/`it`/`expect` from `vitest` (NOT `@jest/globals`).
- `it.each` for parameterized rejection cases (schema.test.ts L47–58, L70–73, L98–105).
- Relative imports `../../src/...` (no path aliases — tsconfig has none).
- jsdom is the env (vitest.config.ts L7) but is NOT authoritative for layout (comment L12–13). Epoch/fontGate/diagnostics/textMeasurer tests prove INVARIANTS and CONTRACTS, not layout — this is the correct split.

**Specific test files (RESEARCH §Validation Architecture L604–612):**
- `epoch.test.ts` — PAGE-07 invariant (late epoch drops).
- `fontGate.test.ts` — D3-06 (await resolves before trust).
- `textMeasurer.test.ts` — adapter contract (Pretext mocked; verify call args).
- `driftGuard.test.ts` — D3-08 (downgrade on drift).
- `diagnostics.test.ts` — D3-05 (event shape validates against Zod).

---

### `tests/e2e/measurement/*.spec.ts` (×2) (test, e2e real-browser)

**Analog:** `tests/e2e/typography-live-apply.spec.ts` — the project's precedent for (a) image-stub `beforeEach`, (b) IndexedDB-wipe `beforeEach`, (c) real computed-style reads via `page.evaluate`. This is the EXACT harness the measurement e2e tests should reuse.

**Image-stub + IndexedDB-wipe beforeEach** (`tests/e2e/typography-live-apply.spec.ts` L17–34):
```typescript
const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});
```

**Real computed-style read** (`tests/e2e/typography-live-apply.spec.ts` L55–60) — the pattern for asserting real-browser layout:
```typescript
const defaultSize = await page.evaluate(
  () => getComputedStyle(document.body).fontSize,
);
expect(defaultSize).toBe("18px");
```

**test.describe block pattern** (`tests/e2e/typography-live-apply.spec.ts` L36):
```typescript
test.describe("READ-02 typography live-apply (02-04 gap 2)", () => {
  test("...", async ({ page }) => { /* ... */ });
});
```

**Specific files (RESEARCH §Validation Architecture L610–611):**
- `last-valid-view.spec.ts` — PAGE-06 (trusted view retained during re-measure; no blank flash).
- `stale-drop.spec.ts` — PAGE-07 e2e (rapid-trigger: late result never wins).

**Rules to replicate:**
- `BASE = "http://localhost:5173"` matches `playwright.config.ts` L14 `webServer.url`.
- Hash-route navigation: `await page.goto(\`${BASE}/#/article/${FIXTURE}\`)` (typography-live-apply L40).
- `await expect(page.getByRole("heading", { level: 1 })).toBeVisible()` as the "article loaded" sentinel (L41).
- The 3-engine matrix (chromium/firefox/webkit) is automatic via `playwright.config.ts` L7–11 — no per-test engine declaration needed.

---

### `tests/e2e/calibration/*` (×3) (test/harness, e2e matrix)

**Analog:** `tests/e2e/a11y.spec.ts` (fixture-loop × 3-engine matrix pattern) + `tests/e2e/typography-live-apply.spec.ts` (computed-style reads). The calibration harness combines both: loop fixtures × typography variants, read rendered DOM, compare to Pretext prediction.

**Fixture-loop pattern** (`tests/e2e/a11y.spec.ts` L14, L46–63):
```typescript
import { fixtures } from "../../src/fixtures";

for (const article of fixtures) {
  test.describe(`a11y ${article.id}`, () => {
    test("...", async ({ page }) => {
      await page.goto(`${BASE}/#/article/${article.id}`);
      // ...
    });
  });
}
```

**Fixtures source** (`src/fixtures/index.ts` L21–28) — the 6-fixture corpus (D3-09), already Zod-validated at module load:
```typescript
export const fixtures: readonly CanonicalArticle[] = [
  essayLongForm, technicalPost, figureHeavy,
  footnoteAcademic, listReference, unsupportedCase,
].map((raw) => ArticleSchema.parse(raw));
```

**Computed-style read for DOM truth** (`tests/e2e/typography-live-apply.spec.ts` L55–60) — extended in the calibration harness to `getBoundingClientRect().height` + `getClientRects().length` (RESEARCH §Code Examples L491–517).

**Calibration harness skeleton (RESEARCH Pattern 4, L331–352):**
```typescript
for (const fixture of fixtures) {           // D3-09: the 6 shipped articles
  for (const variant of TYPOGRAPHY_MATRIX) { // font × size × spacing × measure
    await page.goto(`${BASE}/#/article/${fixture.id}`);
    await applyVariant(page, variant);
    await page.evaluate(() => document.fonts.ready);   // D3-06
    for (const block of eligibleBlocks(fixture)) {
      const predicted = await textMeasurer.measure(block, variant);
      const rendered  = await readDomMeasurement(page, block);
      fingerprint.record(fixture.id, variant, block.kind, engine, {
        heightDrift: rendered.height - predicted.height,
        breaksMatch: deepEqual(predicted.breaks, rendered.breaks),
      });
    }
  }
}
await fingerprint.write("calibration/fingerprint.json");
```

**Typography matrix source** (`src/settings/tokens.ts` L14–32) — the closed sets the calibration loop iterates:
```typescript
FONT_STACKS: { serif, sans, dyslexic }        // 3 fonts
SIZE_STEPS: [16, 18, 20, 22, 24]              // 5 sizes
MEASURE_STEPS: [52, 58, 64, 72]               // 4 measures
SPACING_PRESETS: { compact, comfortable, spacious }  // 3 presets
```
Full matrix = 3×5×3×4 = 180 variants × 6 fixtures × 3 engines (RESEARCH §Calibration Matrix L591). Planner MAY sample, but MUST cover every font × spacing combination (Pitfalls 5 & 6).

**Specific files (RESEARCH §Recommended Project Structure L237–240):**
- `calibration.harness.ts` — the D3-08 harness driver.
- `fixtures-matrix.ts` — 6 fixtures × typography matrix expansion.
- `fingerprint.compare.ts` — D3-10 CI gate (diff fresh vs committed; `process.exit(1)` on regression).

---

### `calibration/fingerprint.json` (config/artifact, file I/O)

**Analog:** NONE — no committed JSON artifact exists in the repo. (The fixture `.canonical.json` files under `src/fixtures/articles/` are inputs, not generated artifacts.)

**Use RESEARCH §Calibration Matrix L594 + §Open Question 4 (L687–690) as the reference.** Shape:
```json
{ "engine": "chromium", "fixtureId": "essay-long-form", "variant": "...",
  "kind": { "eligible": true, "heightDriftP95": 0.3, "breaksMatchRatio": 1.0 } }
```

**Rules:**
- Committed to the repo (NOT IndexedDB — STACK.md forbids persisting derived geometry; RESEARCH §Anti-Patterns L369).
- Read at runtime only to log a baseline, NEVER to gate reading.
- CI diffs fresh vs committed; a previously-eligible kind drifting outside tolerance fails the build (D3-10).
- Planner picks exact schema + repo path (D3-08/D3-10 discretion); `calibration/fingerprint.json` at repo root is the minimal viable shape.

---

### `package.json` *(modify)* (config)

**Analog:** itself. The modification is additive: one new dependency + one optional script.

**Dependency to add** (RESEARCH §Standard Stack L96–97, §Installation L109–111):
```json
"dependencies": {
  "@chenglou/pretext": "0.0.8",
  "dexie": "4.4.4",
  "react": "19.2.8",
  "react-dom": "19.2.8",
  "zod": "4.4.3"
}
```
- Pin EXACT (no `^`/`~`) — matches the project's convention for every other dependency (L18–21) and STACK.md's mandate for Pretext.
- Verified: no `postinstall` script (RESEARCH §Package Legitimacy Audit L125).

**Optional script to add** (RESEARCH §Validation Architecture L570–571, §Open Question 4):
```json
"scripts": {
  "calibrate": "playwright test tests/e2e/calibration/"
}
```

**Existing scripts** (`package.json` L7–16) — the planner should NOT duplicate; the calibration run extends the existing `test:e2e` infrastructure.

---

## Shared Patterns

### Pattern A: Zod-at-boundary validation (V5 Input Validation)
**Source:** `src/content/schema.ts` L1–241
**Apply to:** `src/measurement/types.ts` (ALL new types), `src/measurement/diagnostics.ts` (emit + consume), `tests/e2e/calibration/fingerprint.compare.ts` (fingerprint row validation).
```typescript
// Every boundary type is a Zod schema; inferred types are the single source
// of truth. Never hand-write a parallel TS type for non-recursive shapes.
export const ReaderSettingsSchema = z.object({ /* ... */ });
export type ReaderSettings = z.infer<typeof ReaderSettingsSchema>;
```
**Rule:** `tsconfig.json` L13 `verbatimModuleSyntax: true` — `import type` is MANDATORY for type-only imports (see every analog file).

### Pattern B: Cancelled-flag → Epoch-guarded async (PAGE-07)
**Source:** `src/routes/ArticleView.tsx` L93–117 + `src/settings/SettingsContext.tsx` L81–105 (ancestors) → `src/measurement/epoch.ts` (structured upgrade).
**Apply to:** `src/measurement/engine.ts`, `src/measurement/useMeasurement.ts`, `src/measurement/triggers.ts`.
```typescript
let cancelled = false;
asyncWork().then((r) => {
  if (cancelled) return;     // ← the staleness guard
  commit(r);
});
return () => { cancelled = true; };
```
**Upgrade:** replace boolean with `Epoch` class (monotonic counter + `AbortController`) for long-running measurement where multiple generations race.

### Pattern C: Debounce (~400ms) + ref-stable closures + cleanup
**Source:** `src/settings/SettingsContext.tsx` L57–177 + `src/reader/useScrollSave.ts` L77–214.
**Apply to:** `src/measurement/triggers.ts` (TriggerCoalescer), `src/measurement/useMeasurement.ts`.
```typescript
const DEBOUNCE_MS = 400;  // Phase 2 precedent — D3-07 discretion cites this
const timer = useRef<number | null>(null);
const pendingRef = useRef<T | null>(null);
// Latest snapshot in ref so listener closures stay stable across re-renders.
// Cleanup on unmount: clearTimeout + null the ref.
```

### Pattern D: Imperative DOM read via getBoundingClientRect on queried blocks
**Source:** `src/reader/useScrollSave.ts` L92–119 + `src/reader/SectionAnnouncer.tsx` L63.
**Apply to:** `src/measurement/domMeasurer.ts`, `tests/e2e/calibration/readDom.ts` (harness helper).
```typescript
const blocks = Array.from(
  articleEl.querySelectorAll<HTMLElement>("h2, h3, h4, p, blockquote, li, pre, figure, sup, details"),
);
for (const el of blocks) {
  const top = el.getBoundingClientRect().top;   // fractional pixels
  // ...
}
```
**Rule:** reuse the EXACT selector list so measurement reads what the renderer emitted (`BlockRenderer.tsx`).

### Pattern E: Single-purpose typed adapter behind a Zod-validated seam
**Source:** `src/settings/applyTheme.ts` L26–39.
**Apply to:** `src/measurement/textMeasurer.ts` (the ONLY `@chenglou/pretext` import), `src/measurement/fontGate.ts`.
```typescript
export function applyTheme(s: ReaderSettings): void {
  // One responsibility; typed input from a Zod schema; no `any`.
}
```
**Rule:** the adapter file's header comment documents the security boundary (applyTheme L21–25 is the model).

### Pattern F: Exhaustive switch over block.kind (no default fallthrough)
**Source:** `src/content/render/BlockRenderer.tsx` L21–113 + `src/content/normalizeText.ts` L41–63.
**Apply to:** `src/measurement/engine.ts` (per-kind dispatch), `src/measurement/domMeasurer.ts`, `src/measurement/textMeasurer.ts`.
```typescript
function blockText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return inlineText(block.content);
    case "blockquote":
      return block.children.map(blockText).join(BLOCK_SEPARATOR);
    // ... every case handled; NO default — TS flags missing cases at compile time
  }
}
```

### Pattern G: Test harness — image-stub + IndexedDB-wipe beforeEach (e2e)
**Source:** `tests/e2e/typography-live-apply.spec.ts` L17–34.
**Apply to:** `tests/e2e/measurement/*.spec.ts`, `tests/e2e/calibration/*`.
```typescript
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }));
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
```

### Pattern H: 3-engine Playwright matrix + fixture loop (e2e)
**Source:** `playwright.config.ts` L7–11 (engines) + `tests/e2e/a11y.spec.ts` L46–63 (fixture loop).
**Apply to:** `tests/e2e/calibration/*` (the calibration harness MUST run across all 3 engines — PAGE-08).
```typescript
// playwright.config.ts — engines declared once, automatic for every test:
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox",  use: { ...devices["Desktop Firefox"] } },
  { name: "webkit",   use: { ...devices["Desktop Safari"] } },
],
```

## Cross-Cutting Constants & Facts

### Heading geometry (Pitfall 7 — RESEARCH §Common Pitfalls 7)
**Source:** `src/app.css` L142–153.
Headings have HARDCODED geometry that does NOT consume `--font-size`/`--line-height`. The `textMeasurer` adapter MUST derive `font` + `lineHeight` per block kind:
```css
h1 { font-size: 32px; line-height: 1.2; font-weight: 600; }
h2, h3, h4 { font-size: 22px; line-height: 1.3; font-weight: 600; }
```
Only `body` consumes the custom properties (`src/app.css` L135–141):
```css
body {
  font-size: var(--font-size, 18px);
  line-height: var(--line-height, 1.6);
  letter-spacing: var(--letter-spacing, 0);
  word-spacing: var(--word-spacing, 0);
  font-weight: 400;
}
```

### Reduced-motion + forced-colors gates (inherit, do NOT re-declare)
**Source:** `src/app.css` L74–97.
**Apply to:** any measurement-driven affordance (Phase 3 has NONE — D3-04 invisible by default, but Phase 4 will). The global gates are inherited; do not re-declare. The `.visually-hidden` helper (`src/app.css` L116–123) and `.status` card (`src/app.css` L257–271) are available if needed.

### D-05 grapheme substrate (must not fork)
**Source:** `src/content/normalizeText.ts` L1–140.
Phase 3 measurement offsets that need to round-trip against reader state MUST reuse `normalizeText(article)` + `graphemeClusters(text, lang)` from this module. Phase 2's `findScrollTarget` + `useScrollSave` already reuse it exactly — Phase 3 must NOT fork a parallel implementation. (Phase 3 only needs height + break COUNT/POSITION for calibration; the offset mapping back to grapheme offsets is Phase 4's — RESEARCH §Code Examples L485–488.)

### LOW-risk definite-assignment `!` precedent
**Source:** `src/persistence/db.ts` L40–47.
```typescript
export class LemReaderDB extends Dexie {
  settings!: Table<SettingsRecord, string>;
  location!: Table<LocationRecordRow, [string, number]>;
  // ...
}
```
**When to replicate:** ONLY for typed handles on late-initialized framework-owned properties (Dexie resolves stores by name from version declarations at runtime). The `Epoch` class in `src/measurement/epoch.ts` does NOT need this — its `controller` is initialized inline (`private controller = new AbortController();`, RESEARCH Pattern 2 L279). Do NOT use `!` to suppress null-check warnings on measurement results or DOM nodes — those genuinely may be null and must be guarded.

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/measurement/fontGate.ts` | utility | async/promise | First use of `document.fonts.ready` in the codebase (grep-verified). Use RESEARCH Pattern 3. |
| `src/measurement/diagnostics.ts` | service (bus) | event-driven (pub-sub) | No event bus exists in the codebase. Shape from `schema.ts` discriminated union; bus itself is new. Use RESEARCH L191–197 + Open Question 5. |
| `calibration/fingerprint.json` | config/artifact | file I/O | No committed generated artifact exists. Use RESEARCH §Calibration Matrix. |
| `src/measurement/driftGuard.ts` | service | sampling/transform | Partial match only — the downgrade-on-drift mechanism is novel. Conceptual sibling: epoch commit guard. Use RESEARCH Pattern 4. |
| `tests/e2e/calibration/readDom.ts` (harness helper) | test util | DOM I/O | `getClientRects()` per-line usage is new (RESEARCH §Code Examples L491–517). Existing `getBoundingClientRect` usage (useScrollSave L112) is the partial analog. |

## Metadata

**Analog search scope:**
- `src/**/*.ts`, `src/**/*.tsx` (full source tree)
- `tests/**/*.ts`, `tests/**/*.tsx` (full test tree)
- `playwright.config.ts`, `vitest.config.ts`, `tsconfig.json`, `package.json` (config)

**Files scanned:** 28 source files (glob) + 17 test files (glob) + 4 config files = 49 files; 14 read in full for excerpt extraction.

**Grep-verified absence (no prior art):**
- `ResizeObserver` — 0 matches (new in triggers.ts)
- `document.fonts` — 1 match (comment only in `src/settings/tokens.ts` L11)
- `AbortController` — 0 matches (new in epoch.ts)
- `@chenglou/pretext` — 0 matches (new dependency; textMeasurer.ts is the sole import site)
- `getClientRects` — 0 matches (new in domMeasurer.ts / calibration harness)
- `getBoundingClientRect` — 4 matches (the domMeasurer analog chain: useScrollSave L112, SectionAnnouncer L63, section-announce.spec.ts L65)

**Pattern extraction date:** 2026-08-04
**Research validity:** PATTERNS.md valid as long as 03-RESEARCH.md is valid (until 2026-09-03). Re-verify Pretext API if planning slips past that date.
