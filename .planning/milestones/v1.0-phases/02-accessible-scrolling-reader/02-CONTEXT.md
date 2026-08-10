# Phase 2: Accessible Scrolling Reader - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the **accessible scrolling reading experience** and the **recoverable local-state layer** that supports it. It turns Phase 1's static foundation (canonical article model + semantic renderer + fixtures) into a calm, adaptable reader the user can actually configure and resume.

It delivers 17 requirements across four groups:
- **READ-01…05** — a clean semantic scrolling view; user-adjustable typography (font family, size, line-height, spacing, measure); a limited set of accessible light/dark themes; a calm interface whose secondary controls do not permanently compete with content; quiet structural location/progress that does not treat page number as permanent identity.
- **A11Y-01…08** — full keyboard operation with no trap; visible logical focus that stays predictable across navigation/mode/repagination; correct screen-reader semantic order without a duplicate active content tree; zoom/reflow; forced-colors/high-contrast; reduced-motion; pointer/touch parity; concise programmatic status for consequential events.
- **STATE-01** — current logical location restored on reopen.
- **STATE-02** — typography, theme, and preferred reading-mode persist locally across sessions.
- **STATE-04** — versioned/validated local records so migrations do not corrupt data.
- **STATE-05** — a recoverable error state when storage is unavailable, full, corrupt, or cannot be upgraded.

**Phase 2 does NOT ship** (deferred):
- Responsive **pagination**, dual-mode navigation, page-turn controls, oversize/fallback diagnostics — **Phase 4** (PAGE-01…05, PAGE-09). Phase 2 ships scrolling only.
- Layout **measurement** / `document.fonts.ready` invalidation / stale-result cancellation / Pretext calibration — **Phase 3** (PAGE-06…08). (Note: typography changes in Phase 2 will cause reflow, but Phase 2 does not own the formal measurement/trust pipeline; it re-renders the scrolling view directly.)
- Highlights and notes — **Phase 5** (ANNO-01…07, STATE-03).
- The heading navigator and line-focus aid — **v2** (ORNT-01/02).

The location-restore substrate is already locked by Phase 1: **grapheme offsets over `normalizeText(article)`** (D-05), keyed **`[articleId+revision]`** (D-06). Phase 2 populates the already-reserved Dexie slots (`settings`, `location`, `articles`) and swaps the in-memory `ArticleRepository` for a Dexie-backed implementation behind the existing interface.

</domain>

<decisions>
## Implementation Decisions

### Settings UI Surface (READ-04, A11Y-01, A11Y-02, STATE-02)

- **D2-01:** Typography/theme controls live in a **slide-over panel** opened by a gear button. The panel overlays the article; focus traps inside while open and **restores to the gear trigger on close** (Esc and overlay-click dismiss). This is the most keyboard/screen-reader-predictable surface and keeps the article uncluttered (READ-04). Native dialog semantics (or an equivalent roving-focus region with `aria-modal`) are expected — planner picks the mechanism.
- **D2-02:** A **slim persistent top header** is introduced across **both** existing views (FixtureList and ArticleView) to host the gear button and give focus a stable, predictable home. The header must stay quiet/neutral to honor READ-04 — thin, low-contrast chrome, not a competing toolbar. This is the first persistent chrome in the app (Phase 1 had none).
- **D2-03:** Typography/theme changes apply **live, as the reader adjusts them** (each control writes through to CSS custom properties immediately so the article behind the panel reflects the change in context). Preference persistence is **debounced** (no per-pixel write storm). There is no separate Save/Commit step.
- **D2-04:** The panel has a single **"Reset" affordance** that restores the **D-07 warm-paper defaults** (serif body, default size/spacing, the warm-paper theme, 64ch measure). The persisted default set IS the D-07 baseline, not "unset" — STATE-02's default values are the warm-paper tokens.

### Typography Control Model (READ-02)

- **D2-05:** Hybrid model — a few **named presets** set the correlated knobs at once, PLUS **individual fine-tune controls for font size and reading measure**. Presets own line-height and letter/word-spacing; size and measure remain independently adjustable on top of any preset.
- **D2-06:** Three font families are offered: the **warm-paper serif** (D-07 default stack), a clean **system sans**, and a **dyslexia-friendly option** (accessibility-first audience per PROJECT.md). ⚠ **Research flag:** whether the dyslexic-friendly option ships as a true web font (e.g. OpenDyslexic — requires `document.fonts.ready` safe-handling per STACK.md) or a wide system-stack approximation (e.g. Verdana/Tahoma, font-load-safe) is left to the researcher/planner. Phase 1 deliberately used system-only stacks; introducing a web font is a new tradeoff that must be validated.
- **D2-07:** Size and measure fine-tune controls are **stepped (discrete)**, not continuous sliders — e.g. size ~16/18/20/22/24px, measure ~52/58/64/72ch. Stepped values are predictable, keyboard-friendly (arrow keys), easy to label, and calm. Exact step values/bounds are the planner's call.
- **D2-08:** **Line-height and letter/word-spacing are preset-internal only** (set by the Compact/Comfortable/Spacious-style presets), not individually user-adjustable. This keeps the panel calm and avoids five free knobs; presets still make them "adjustable" per READ-02's enumeration.

### Theme Set (READ-03)

- **D2-09 (the agent's discretion, confirmed consistent):** A limited set of **Light, Dark, and Sepia** themes, where **Sepia is the D-07 warm-paper default** (the `--surface #FBF8F3` / `--ink #1F1B16` tokens already in `app.css`). Light and Dark are additional accessible palettes. This is consistent with the Reset-to-warm-paper decision (D2-04) and READ-03's "limited set." All themes must remain legible under `forced-colors` (A11Y-05, already gated in `app.css`) and the existing `prefers-reduced-motion` gate.

### Location Restore + Progress (STATE-01, READ-05, A11Y-08, STATE-05)

- **D2-10:** On reopen, the reader **silently scrolls to the saved grapheme offset**, then shows a small **dismissible "You left off here" banner** with an option to jump to the current top. Quiet and non-jarring; the banner gives agency without forcing a scroll decision. Substrate is locked (D-05 offsets, `[articleId+revision]` key).
- **D2-11:** Location is saved **debounced on scroll** (e.g. 1–2s after scroll stops) **plus a flush on `pagehide`/`visibilitychange`-hidden**. Balances STATE-01 accuracy against Dexie write frequency; the flush covers tab-close and navigation. Exact debounce window is the planner's call.
- **D2-12:** Visible progress is a **thin, low-contrast scroll-progress hairline** at the top of the reading surface (under the header) — quiet, always-present, glanceable, no page-number identity. Paired with a **screen-reader live region that announces section (heading) changes** (A11Y-08). No prominent percentage bar.
- **D2-13:** STATE-05 storage failure is **graceful and non-blocking**: the reader keeps reading, a dismissible `.status` banner (existing `role="status"` / `aria-live="polite"` pattern) explains that preferences/location won't save this session, and the app falls back to **in-memory defaults**. A corrupt or unupgradeable DB is **wiped and re-initialized only on explicit user action** (never silently). Fixtures are static, so article reading never depends on Dexie.

### the agent's Discretion

- **Panel mechanism** — native `<dialog>` vs. a custom roving-focus region with `aria-modal`. Planner decides; either must satisfy A11Y-01/02.
- **Dexie `version(2)` store shape** — the Phase 1 schema reserved `settings: "key"`, `location: "[articleId+revision]"`, and `articles: "id, revision"` slots. The exact settings record value-shape (preset id + overrides vs. flat token map), the articles-store role (does it mirror fixtures?), and the v1→v2 migration specifics are planner/architecture decisions. The `version(1)` declaration in `src/persistence/db.ts` MUST NOT be edited (Pitfall 9 — Phase 2 adds `db.version(2).stores({...})`).
- **Settings application path** — whether preferences are read once into a React context that drives CSS custom properties, or applied via a `data-theme`/`data-prefs` attribute on `<html>` + token swap. Either honors the authored-CSS/no-Tailwind constraint.
- **Exact preset names, step bounds, and hairline placement/height** — planner/UI-SPEC refines; the model (hybrid, stepped, preset-internal spacing) is locked.
- **"Left off" banner copy and lifecycle** (how long it stays, what dismisses it) — UI-SPEC copywriting contract.

### Folded Todos
*None — `todo.match-phase` returned no matches for Phase 2.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision, Core Value, Constraints, Key Decisions table, Out-of-Scope list. Anchors the accessibility-first audience and "calm, booklike" promise that every Phase 2 decision serves.
- `.planning/REQUIREMENTS.md` — **READ-01…05, A11Y-01…08, STATE-01, STATE-02, STATE-04, STATE-05 are this phase's requirements.** §Traceability maps each to Phase 2.
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria (5), dependencies (Phase 1). Roadmap-level decisions: canonical coordinate system before durable location; semantic scrolling stays viable; calibrated measurement required before any Pretext fast path (a Phase 3 concern, not Phase 2).

### Stack & architecture authority
- `.planning/research/STACK.md` — locked stack (React 19.2.8, TS 7.0.2, Vite 8.1.5, Dexie 4.4.4, Zod 4.4.3). Browser primitives directly relevant to Phase 2: `document.fonts.ready` (relevant if D2-06 ships a web font), IndexedDB via Dexie, `Intl.Segmenter` (underpins the D-05 offsets Phase 2 restores against). **What NOT to use:** Tailwind/component suites/shadcn, Redux/Zustand (use React state/context), page-number anchors, DOM-emulators for layout truth.
- `AGENTS.md` — project instructions embedding STACK.md, conventions, architecture notes, and GSD workflow enforcement.

### Prior-phase contracts this phase extends
- `.planning/phases/01-canonical-article-foundation/01-CONTEXT.md` — **D-04** (inline marks), **D-05** (grapheme-offset coordinate system — Phase 2 stores STATE-01 offsets against this), **D-06** (stable id + monotonic revision — Phase 2 location key), **D-07** (warm-paper defaults — Phase 2 default theme + Reset baseline), **D-08** (repository seam — Phase 2 swaps in Dexie-backed impl), **D-09** (dev-time normalization script).
- `.planning/phases/01-canonical-article-foundation/01-UI-SPEC.md` — **UI design contract; MUST read before executor.** Phase 2 extends its locked visual surface: warm-paper color tokens + spacing scale (multiples of 4), 4-size/2-weight type scale, copywriting contract, the 7 interaction patterns (focus, reduced-motion, forced-colors, status, links, disclosure, skip-link), semantic component inventory, and breakpoints. Phase 2's new chrome (header, settings panel, progress hairline, restore banner) must stay consistent with this contract.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/persistence/db.ts` — **Reserved Dexie schema** with `articles: "id, revision"`, `settings: "key"`, `location: "[articleId+revision]"` slots explicitly reserved for Phase 2. Comment locks the rule: Phase 2 adds `db.version(2).stores({...})` WITHOUT editing the shipped `version(1)` declaration (Pitfall 9).
- `src/content/repository.ts` — **`ArticleRepository` interface** (`list()`, `open(id)`). Phase 2 swaps the Dexie-backed implementation in behind this seam; module-level `listArticles`/`openArticle` wrappers mean callers need no refactor.
- `src/content/normalizeText.ts` — **D-05 grapheme-offset substrate.** `normalizeText(article)` produces the single deterministic normalized-text string; Phase 2's STATE-01 restore computes the scroll target from a stored grapheme offset against this output.
- `src/App.tsx` — Hash-based router (`View` type, `hashchange` listener, `parseHash`). The new persistent header + settings panel mount here; the router itself stays (settings is a panel, not a route — D2-01/D2-02).
- `src/routes/ArticleView.tsx` — Reader route with `loading`/`ready`/`error` status states and provenance header. This is where location-restore-on-open (D2-10), the progress hairline (D2-12), and the live typography application visibly land.
- `src/app.css` — **Authored CSS + `:root` custom properties.** Phase 2 typography/theme controls bind to `--font-body`, `--font-ui`, body `font-size`/`line-height`, and `.article-body { max-width: 64ch }`. Already contains the `prefers-reduced-motion` gate, the `forced-colors` gate, the `:focus-visible` baseline, and the `.status` / `.visually-hidden` / `.skip-link` helpers that D2-13 and the panel will reuse.
- `src/a11y/SkipLink.tsx` — established a11y-component pattern to follow for new a11y-conscious components (panel, header).

### Established Patterns
- **Authored CSS layers + CSS custom properties** (no Tailwind, no component suite) — Phase 2 MUST drive typography/theme through custom properties, not inline styles or a new framework.
- **Zod-at-boundary validation** (`schema.ts` is the single source of truth) — every persisted settings/location record is validated on read and write (STATE-04).
- **Hash-based routing, no router library** — settings is deliberately a panel, not a route (D2-01), so no new route is added.
- **React state/context, no external state library** — preferences flow through React context; Dexie is the persistence seam.
- **Status region pattern** (`role="status"` + `aria-live="polite"`) — reused for the restore announce (A11Y-08) and the STATE-05 storage-failure notice (D2-13).
- **Defensive `prefers-reduced-motion` and `forced-colors` gates** already global in `app.css` — Phase 2 inherits them; any panel/transition animation must respect reduced-motion.

### Integration Points
- **Dexie schema** (`src/persistence/db.ts`) — Phase 2 populates `settings`, `location`, (optionally) `articles` via `db.version(2)`.
- **`ArticleRepository`** (`src/content/repository.ts`) — Dexie-backed implementation slot.
- **`:root` + `.article-body` custom properties** (`src/app.css`) — typography/theme controls bind here.
- **`App.tsx` router/shell** — persistent header + settings panel mount point.
- **`ArticleView`** — location restore (open), scroll-save (scroll/hide), progress hairline, and live typography application.

### Creative Options the Architecture Enables
- Preferences via React context → CSS custom properties, OR via a `data-theme`/`data-prefs` attribute on `<html>` + token swap (either honors no-Tailwind).
- Progress hairline as a pure-scroll-driven `scaleX` bar (reduced-motion-safe since the existing gate disables transitions).

</code_context>

<specifics>
## Specific Ideas

- "Calm, booklike, low-distraction" remains the guiding aesthetic (carried from Phase 1). The new persistent header must be the quietest possible chrome — a thin bar, not a toolbar — or it risks violating READ-04.
- The "left off here" banner should feel like a polite tap on the shoulder, not a modal interruption — dismissible, small, and gone once the reader scrolls.
- Accessibility-first audience: the dyslexia-friendly font option (D2-06) is a deliberate accessibility choice, not a novelty — its inclusion reflects PROJECT.md's primary reader.
- Live-apply settings (D2-03) exists so the reader can feel whether a typography choice is calm *against their actual article*, not in the abstract.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases (confirmed, not new):
- Responsive pagination, page-turn controls, dual-mode navigation, oversize/fallback diagnostics → **Phase 4**.
- Layout measurement, `document.fonts.ready` invalidation pipeline, stale-result cancellation, Pretext calibration → **Phase 3**. (Phase 2's typography changes cause reflow but Phase 2 re-renders scrolling directly; it does not own the formal measurement/trust pipeline.)
- Highlights and notes (consume the D-05 coordinate system) → **Phase 5**.
- Heading navigator and line-focus aid → **v2** (ORNT-01/02).

</deferred>

---

*Phase: 2-accessible-scrolling-reader*
*Context gathered: 2026-07-30*
