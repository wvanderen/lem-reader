# Phase 2: Accessible Scrolling Reader - Research

**Researched:** 2026-07-30
**Domain:** Accessibility-first client-only React reader UI + recoverable local-state persistence (Dexie/IndexedDB) + grapheme-offset location restore
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D2-01:** Typography/theme controls live in a **slide-over panel** opened by a gear button. Focus traps inside while open and **restores to the gear trigger on close** (Esc + overlay-click dismiss). Native dialog semantics (or equivalent roving-focus region with `aria-modal`) expected — planner picks the mechanism.
- **D2-02:** A **slim persistent top header** across **both** existing views (FixtureList + ArticleView) hosts the gear button. Must stay quiet/neutral (thin, low-contrast chrome, not a competing toolbar) to honor READ-04.
- **D2-03:** Typography/theme changes apply **live** (each control writes through to CSS custom properties immediately so the article behind the panel reflects the change). Persistence is **debounced**. No Save/Commit step.
- **D2-04:** A single **"Reset"** affordance restores the **D-07 warm-paper defaults** (serif body, default size/spacing, warm-paper theme, 64ch measure). The persisted default set IS the D-07 baseline, not "unset."
- **D2-05:** **Hybrid** typography model — named presets set correlated knobs at once PLUS individual fine-tune controls for font size and reading measure. Presets own line-height and letter/word-spacing; size and measure remain independently adjustable.
- **D2-06:** Three font families offered: warm-paper serif, clean system sans, and a **dyslexia-friendly option**. ⚠ Whether the dyslexic option ships as a true web font or a wide system-stack approximation was a research flag.
- **D2-07:** Size and measure fine-tune controls are **stepped (discrete)**, not continuous sliders. Stepped values are predictable, keyboard-friendly, calm.
- **D2-08:** **Line-height and letter/word-spacing are preset-internal only**, not individually user-adjustable.
- **D2-09:** Limited theme set: **Light, Dark, Sepia**, where **Sepia is the D-07 warm-paper default**.
- **D2-10:** On reopen, the reader **silently scrolls** to the saved grapheme offset, then shows a small **dismissible "You left off here" banner** with an option to jump to the top.
- **D2-11:** Location is saved **debounced on scroll** (~1–2s after scroll stops) **plus a flush on `pagehide`/`visibilitychange`-hidden**.
- **D2-12:** Visible progress is a **thin low-contrast scroll-progress hairline** under the header + a **screen-reader live region announcing heading changes**. No page-number identity, no prominent percentage bar.
- **D2-13:** STATE-05 storage failure is **graceful and non-blocking**: reader keeps reading, a dismissible `.status` banner explains prefs/location won't save, app falls back to **in-memory defaults**. Corrupt/unupgradeable DB is **wiped and re-initialized only on explicit user action** (never silently). Article reading NEVER depends on Dexie.

### the agent's Discretion
- **Panel mechanism** — native `<dialog>` vs. custom roving-focus region with `aria-modal`. Either must satisfy A11Y-01/02.
- **Dexie `version(2)` store shape** — exact settings record value-shape, the articles-store role, and v1→v2 migration specifics. The `version(1)` declaration in `src/persistence/db.ts` MUST NOT be edited (Pitfall 9).
- **Settings application path** — React context → CSS custom properties, OR `data-theme`/`data-prefs` attribute on `<html>` + token swap.
- **Exact preset names, step bounds, hairline placement/height** — planner/UI-SPEC refines; the hybrid/stepped model is locked.
- **"Left off" banner copy and lifecycle** — UI-SPEC copywriting contract (already approved).

### Deferred Ideas (OUT OF SCOPE)
- Responsive pagination, page-turn controls, dual-mode navigation, oversize/fallback diagnostics → **Phase 4**.
- Layout measurement, `document.fonts.ready` invalidation pipeline, stale-result cancellation, Pretext calibration → **Phase 3**. (Phase 2's typography changes reflow the scrolling view directly; it does NOT own the measurement/trust pipeline.)
- The **true OpenDyslexic web font** → **Phase 3** (Phase 2 ships system-stack approximation only).
- Highlights and notes → **Phase 5**.
- Heading navigator and line-focus aid → **v2** (ORNT-01/02).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| READ-01 | Clean semantic scrolling view | Already shipped by Phase 1's `ArticleBody`; Phase 2 adds the persistent header + progress chrome around it. |
| READ-02 | Change font family, size, line height, spacing, measure | Hybrid model (§Architecture Patterns); live-applied via `:root` custom properties + `data-theme`. |
| READ-03 | Limited set of accessible light/dark themes | `data-theme` attribute swap on `<html>` with Sepia/Light/Dark token sets (02-UI-SPEC §Color). |
| READ-04 | Calm interface; secondary controls don't permanently compete | Slide-over panel (closed by default) + slim quiet header (gear `--ink-soft` closed, `--accent` open). |
| READ-05 | Quiet structural progress; no permanent page-number identity | `scaleX` hairline (no transition) + heading live-region. No page numbers anywhere. |
| A11Y-01 | Full keyboard operation, no trap | Native `<dialog>` free focus trap; panel focus stays inside; article is `inert` while open. |
| A11Y-02 | Visible logical focus; predictable across navigation/mode | Manual focus-restore to gear trigger on dialog `close` (showModal does NOT auto-restore — §Pitfall 2). |
| A11Y-03 | Correct SR semantic order; no duplicate active content tree | Article stays mounted behind scrim; `<dialog>` makes it `inert` (browser-provided) — no re-render. |
| A11Y-04 | Zoom and reflow at narrow viewport | Authored CSS + measure cap; §Layout breakpoints verified in Playwright at 320px/200%. |
| A11Y-05 | Forced-colors / high-contrast | Global `@media (forced-colors: active)` gate already in `app.css`; new controls must carry glyph + state. |
| A11Y-06 | Reduced-motion; no required animation | Global gate already in `app.css`; hairline has NO transition; panel slide disabled under reduced-motion. |
| A11Y-07 | Pointer/touch parity | 44×44px hit targets on every new control; radios via labeled row, range/stepper arrow-key operable. |
| A11Y-08 | Concise programmatic status for consequential events | Polite live regions for resume announce + heading-change announce; debounced to avoid flooding. |
| STATE-01 | Current logical location restored on reopen | Grapheme offset → DOM scroll-target resolution (§Architecture Pattern 5); `[articleId+revision]` key in Dexie. |
| STATE-02 | Typography/theme/mode persist locally | Single composite settings record under key `"reader-prefs"`; debounced writes + flush on hide. |
| STATE-04 | Versioned/validated local records | Zod settings/location schemas; `schemaVersion` field; `db.version(2)` anchor. |
| STATE-05 | Recoverable error state on storage failure | Try/catch around all persistence; named-error detection; in-memory fallback; explicit wipe confirmation. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

These directives carry the same authority as locked decisions; research recommendations do not contradict them.

- **Authored CSS layers + CSS custom properties only.** NO Tailwind, NO component suite, NO shadcn. Typography/theme MUST drive through `:root` custom properties + element selectors, never inline styles or a framework.
- **Semantic HTML as the renderer; DOM reading order == document order.** The new panel/header/hairline use native elements (`<dialog>`, `<header>`, `<button>`, `<fieldset>`/`<legend>`, `<input type="radio">`, `<input type="range">`).
- **React state/context only (no Redux/Zustand/XState).** Preferences flow through a React context; Dexie is the persistence seam behind a repository interface.
- **Zod-at-boundary validation.** Every persisted settings/location record is validated on read AND write (`schema.ts` is the single source of truth).
- **No page-number anchors.** Location uses canonical normalized-text offsets (D-05), never page numbers / pixels / DOM paths / serialized ranges.
- **No DOM-emulators for layout truth.** jsdom (vitest) is NOT authoritative for `<dialog>` focus-trap/inert, IntersectionObserver, scroll, or zoom. Those run in Playwright across Chromium/Firefox/WebKit. jsdom tests cover application-level logic + aria attributes only.
- **GSD workflow enforcement.** Repo edits go through a GSD command (`/gsd-execute-phase`, `/gsd-quick`, etc.).

## Summary

Phase 2 turns Phase 1's static canonical-article foundation into a calm, adaptable, resumable reader. It introduces the app's **first persistent chrome** (a quiet top header), its **first user-mutable visual layer** (typography/theme via CSS custom properties), its **first persistence** (Dexie `version(2)` for settings + location), and its **first location-restore** path (grapheme offset → DOM scroll target). Every one of these has an accessibility gate: the header must be the quietest possible chrome (READ-04), the panel must trap and restore focus (A11Y-01/02) without duplicating the content tree (A11Y-03), and a total storage failure must never block reading (STATE-05).

The research flags raised in CONTEXT.md are all **resolved and largely pre-locked by the approved 02-UI-SPEC**: (1) the dyslexia-friendly font ships as a **font-load-safe system stack** (`Verdana, Tahoma, 'Segoe UI', Geneva, sans-serif`) with OpenDyslexic deferred to Phase 3 — this avoids the `document.fonts.ready` gate that Phase 3 owns; (2) the panel mechanism is **native `<dialog>` via `showModal()`**, which the browser (Baseline since March 2022 — all three target engines) provides with a free focus trap, Esc dismissal, `::backdrop`, and automatic `inert`-ing of the rest of the page; (3) settings apply via a **`data-theme` attribute on `<html>` plus `:root` custom properties written by a React context**; (4) the Dexie `version(2)` is a clean add-on keeping `version(1)` untouched. The single most important *implementation* finding: **`showModal()` does NOT auto-restore focus to the trigger on close** — the app must capture `document.activeElement` on open and call `.focus()` on the `close` event (A11Y-02), and this must be verified in Playwright because jsdom does not replicate the browser's focus-trap/inert behavior.

A second finding that shapes the plan: **Phase 2 does not need to move article reads into Dexie.** Fixtures are bundled static JSON imported at build time (D-08), article reading "NEVER depends on Dexie" (D2-13), and the `articles` store can stay reserved/unused. Dexie is used **only for user-mutable state** (settings + location). The `ArticleRepository` seam stays in-memory for article reads; the Dexie-backed implementation is optional for Phase 2 and risks unnecessary complexity.

**Primary recommendation:** Use native `<dialog>`/`showModal()` for both the settings panel and the wipe-confirmation alertdialog (with manual focus-restore to the trigger); persist settings as one composite Zod-validated record keyed `"reader-prefs"` and location keyed `[articleId+revision]` in Dexie `version(2)`; flush pending writes on BOTH `visibilitychange`-hidden and `pagehide`; drive the scroll-spy via `IntersectionObserver` with a negative-`rootMargin` sentinel line under the 48px header; keep article reads on the in-memory repository. Verify all focus/scroll/reflow behavior in Playwright across Chromium/Firefox/WebKit, never in jsdom.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reading-surface rendering | Browser / Client | — | React renders the semantic DOM once (Phase 1 `ArticleBody`); stays mounted behind the panel. |
| Typography/theme token application | Browser / Client | CSS (presentation) | `:root` custom properties + `data-theme` attribute; one-token-swap live preview. Not a backend concern. |
| Settings state (session) | Browser / Client | React context | React context is the single live-apply source of truth; no global state library (AGENTS.md). |
| Settings + location persistence | Database / Storage (IndexedDB) | Repository seam | Dexie wraps IndexedDB behind a repository interface (substitutable in tests). |
| Location-restore resolution | Client domain logic | — | Grapheme offset → DOM scroll target is pure domain computation over the D-05 substrate + rendered DOM; runs client-side but is not UI glue. |
| Focus trap / inert backdrop | Browser platform | — | Provided FREE by native `<dialog>`/`showModal()`; app must NOT re-implement. |
| Scroll-progress + heading detection | Browser platform | Client handlers | `IntersectionObserver` + scroll listeners; transform-driven hairline (no transition). |
| Article reads | Build-time static assets | In-memory repository | Bundled JSON fixtures (D-08); NOT Dexie in Phase 2 — reading never depends on storage. |
| Storage-failure recovery | Client domain logic | Storage | Detect named Dexie errors → fall back to in-memory defaults; never block the reader. |

## Standard Stack

> **No new packages are installed in Phase 2.** Every capability is delivered with the already-installed locked stack (React 19.2.8, Dexie 4.4.4, Zod 4.4.3) + browser primitives + native HTML + authored CSS. The Phase 1 `package.json` dependency set is complete for this phase.

### Core (already installed — do NOT add alternatives)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + React DOM | 19.2.8 | Reader shell, settings context, panel, header, banners | Locked stack; `createRoot` SPA. |
| TypeScript | 7.0.2 | Settings/location contracts, offset→DOM resolution types | Pagination-style boundary failures made explicit. |
| Dexie | 4.4.4 | `version(2)` schema; settings + location stores; transactions | Already reserved in `src/persistence/db.ts`. |
| Zod | 4.4.3 | Runtime validation of every persisted settings/location record (STATE-04) | Single source of truth, inferred types. |

### Browser Primitives Used This Phase (prefer over dependencies)

| Primitive | Phase 2 Use |
|-----------|-------------|
| `<dialog>` + `showModal()`/`close()` + `::backdrop` | Settings panel + wipe-confirmation alertdialog; free focus trap, Esc, inert backdrop. `[CITED: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog]` |
| `IntersectionObserver` | Heading scroll-spy (section-change announce) for A11Y-08. `[CITED: developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API]` |
| `pagehide` + `visibilitychange` | Flush pending location/settings writes before tab close/navigation (D2-11). `[CITED: developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event]` |
| CSS custom properties + `data-theme` attribute | Live-apply typography/theme with one token swap. |
| `Intl.Segmenter` (via Phase 1 `normalizeText.ts`) | Grapheme-offset substrate STATE-01 restores against (D-05). |
| Scroll events (`scroll` + `scrollTop`/`scrollHeight`) | Debounced location save + `scaleX` progress hairline ratio. |
| IndexedDB (via Dexie) | Local settings + location records. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff (rejected) |
|------------|-----------|---------------------|
| Native `<dialog>`/`showModal()` | Custom `role="dialog"` + roving-focus trap + manual `inert` | Re-implements what the browser already gives free (trap, Esc, backdrop, inert) — more bug surface, less accessible by default. UI-SPEC already prefers native `<dialog>`. |
| System-stack dyslexia font | True OpenDyslexic web font | Requires `document.fonts.ready` gating (a Phase 3 concern); FOUT risk; licensing/bundling. Deferred to Phase 3 per 02-UI-SPEC. |
| Composite settings record | Flat key/value token map | Multiple reads/writes, harder debounce, non-atomic flush. Single record wins. |
| Dexie for article reads | (keep) in-memory bundled fixtures | Adds IndexedDB round-trip + seeding for zero benefit; violates "reading never depends on Dexie" (D2-13). |

**Installation:** *None.* `npm install` is not run in Phase 2.

**Version verification:** Confirmed on registry this session — `dexie@4.4.4`, `zod@4.4.3` (match `package.json`). React/Vite/TS already pinned and verified in STACK.md.

## Package Legitimacy Audit

> Phase 2 installs **zero** external packages. All work uses already-installed locked-stack dependencies + browser primitives + native HTML + inline SVG. The shadcn/component-suite gate is **not run** because STACK.md explicitly forbids them (locked decision).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| dexie | npm | mature | high | github.com/dexie/Dexie.js | OK | Already installed (locked stack) |
| zod | npm | mature | high | github.com/colinhacks/zod | OK | Already installed (locked stack) |
| react / react-dom | npm | mature | very high | github.com/facebook/react | OK | Already installed (locked stack) |

**Packages removed due to [SLOP] verdict:** none (none proposed).
**Packages flagged as suspicious [SUS]:** none.

*No package discovered via WebSearch or training data is recommended for installation — all Phase 2 capabilities map to existing deps or browser primitives, so no `checkpoint:human-verify` install tasks are required.*

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │                <body> / #root                │
                     │                                              │
   hash route ─────▶ │  <SkipLink> (first focusable)               │
   (#/ , #/article)  │  ┌────────────────────────────────────────┐ │
                     │  │ <header class="app-header"> (~48px)     │ │
                     │  │   wordmark          gear button ──┐    │ │
                     │  └───────────────────────────────────│────┘ │
                     │  ┌───────────────────────────────────▼────┐ │
                     │  │ <div class="progress-hairline"> (2px)  │ │ ArticleView only
                     │  └────────────────────────────────────────┘ │
                     │  ┌────────────────────────────────────────┐ │
                     │  │ <main id="main">                       │ │
                     │  │   <article class="article-body">       │ │
                     │  │     provenance + <ArticleBody> ──┐     │ │
                     │  │   resume banner / status banner  │     │ │
                     │  └──────────────────────────────────│─────┘ │
                     │                                     │       │
                     │            (rendered once; NEVER    │       │
                     │             duplicated — A11Y-03)   │       │
                     │                                     │       │
                     │  ┌──────────────────────────────────▼─────┐ │
                     │  │ <dialog class="settings-panel">        │ │  gear opens via
                     │  │   (showModal: focus-trapped, inert     │ ◀── showModal()
                     │  │    backdrop, Esc close, ::backdrop)    │ │
                     │  │   Typeface/Size/Width/Spacing/Theme    │ │
                     │  │   fieldsets + Reset                    │ │
                     │  └────────────────────────────────────────┘ │
                     │  ┌────────────────────────────────────────┐ │
                     │  │ <dialog> wipe-confirmation (alertdialog)│ │ corrupt/unupgradeable
                     │  │   Reset local data / Keep reading      │ │  storage only
                     │  └────────────────────────────────────────┘ │
                     └─────────────────────────────────────────────┘
                  data-theme="sepia|light|dark"  ──┐
                  :root custom properties ──────── │ token swap drives the WHOLE tree
                                                     │
   Persistence (Dexie v2, behind repository seam):  │
     settings["reader-prefs"]  ◀── write (debounced + flush)
     location[articleId+rev]   ◀── write (debounced + flush)
     articles (RESERVED — unused in Phase 2)
```

A reader opens an article → `ArticleView` renders the provenance header + `ArticleBody` once → on mount, location-restore resolves the saved grapheme offset to a DOM node and scrolls there (silent) → resume banner + polite announce appear → scrolling updates the hairline (`scaleX`) and, via `IntersectionObserver`, the heading live-region → scroll-stop debounces a location write; `visibilitychange`/`pagehide` flushes it → opening the gear runs `<dialog>.showModal()` (article becomes `inert`, focus moves to the panel) → each control writes one `:root` token / `data-theme` immediately (live preview) and debounces a settings write → closing (Esc / scrim / ×) restores focus to the gear.

### Recommended Project Structure

```
src/
├── persistence/
│   ├── db.ts                    # (EDIT) ADD db.version(2).stores({...}); NEVER edit version(1)
│   ├── settingsStore.ts         # NEW — get/put ReaderSettings behind Zod boundary
│   └── locationStore.ts         # NEW — get/put LocationRecord keyed [articleId+revision]
├── content/
│   ├── repository.ts            # (unchanged) in-memory reads stay; Dexie NOT used for articles
│   ├── normalizeText.ts         # (unchanged) D-05 substrate STATE-01 resolves against
│   └── schema.ts                # (EDIT) ADD ReaderSettingsSchema + LocationRecordSchema (Zod)
├── settings/
│   ├── SettingsContext.tsx      # NEW — React context: live prefs + load/save + storage-error state
│   ├── applyTheme.ts            # NEW — writes data-theme attr + :root custom properties
│   ├── defaults.ts              # NEW — the D-07 warm-paper default ReaderSettings (Reset target)
│   └── tokens.ts                # NEW — preset→spacing maps, theme→token maps, step arrays
├── a11y/
│   ├── SkipLink.tsx             # (unchanged) established pattern
│   └── (new a11y-conscious components follow this file's pattern)
├── reader/
│   ├── Header.tsx               # NEW — <header class="app-header"> wordmark + gear
│   ├── SettingsPanel.tsx        # NEW — <dialog class="settings-panel"> + fieldsets + Reset
│   ├── WipeConfirm.tsx          # NEW — <dialog>/alertdialog for STATE-05 explicit wipe
│   ├── ProgressHairline.tsx     # NEW — 2px scaleX bar (aria-hidden)
│   ├── SectionAnnouncer.tsx     # NEW — polite region + IntersectionObserver scroll-spy
│   ├── ResumeBanner.tsx         # NEW — "You left off here" non-modal banner
│   └── restoreLocation.ts       # NEW — grapheme offset → DOM scroll target resolution
├── routes/
│   ├── ArticleView.tsx          # (EDIT) mount hairline/announcer/restore/resume; apply live theme
│   └── FixtureList.tsx          # (unchanged except Header now wraps both routes)
├── App.tsx                      # (EDIT) mount <Header> + <SettingsPanel>; provide SettingsContext
└── app.css                      # (EDIT) ADD header/panel/hairline/banner rules + [data-theme] tokens
```

### Pattern 1: Native `<dialog>` settings panel (D2-01, A11Y-01/02/03)

**What:** Use `<dialog>` opened with `showModal()` for the slide-over. The browser provides the focus trap, Esc dismissal, `::backdrop`, and makes the rest of the document `inert` (implicit `aria-modal="true"`). `[CITED: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog]`

**When to use:** Always for the settings panel and the wipe-confirmation (the latter as `role="alertdialog"`).

**Why native over custom:** Re-implementing a focus trap + roving tabindex + `inert` management is a known bug factory and is less accessible-by-default than the platform primitive. All three target engines support it (Baseline since March 2022).

**Critical implementation detail (A11Y-02):** `showModal()` does **NOT** auto-restore focus to the trigger on close. The app must (a) capture `document.activeElement` (the gear) on open, and (b) call `gearRef.current?.focus()` in the dialog's `close` handler.

**Example:**
```tsx
// Source: MDN <dialog> + this codebase's SkipLink pattern
import { useEffect, useRef } from "react";

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null); // the gear button

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement; // capture gear
      dlg.showModal(); // browser: focus → first focusable, trap, inert backdrop, Esc closes
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onClose = () => {
      onCloseState();        // flip React state / aria-expanded
      triggerRef.current?.focus(); // A11Y-02: restore to gear trigger
    };
    dlg.addEventListener("close", onClose);
    return () => dlg.removeEventListener("close", onClose);
  }, [onCloseState]);

  return (
    <dialog ref={ref} className="settings-panel" aria-labelledby="settings-title">
      <h2 id="settings-title">Reading settings</h2>
      {/* fieldsets: Typeface / Size / Reading width / Spacing / Theme + Reset + close (×) */}
    </dialog>
  );
}
```

### Pattern 2: Live-apply typography/theme (D2-03, D2-09, READ-02/03)

**What:** A React context holds the resolved `ReaderSettings`. An `applyTheme` effect writes a `data-theme="..."` attribute on `document.documentElement` (theme) and the four typography custom properties (`--font-body`, body `font-size`, `line-height`, `.article-body` `max-width`) on `:root`. Each control dispatches immediately (live preview); persistence is debounced separately.

```tsx
// settings/applyTheme.ts
// Source: this codebase's app.css :root + 02-UI-SPEC §Design System
const FONT_STACKS = {
  serif: "'Iowan Old Style', 'Source Serif Pro', 'Source Serif 4', Georgia, Charter, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  dyslexic: "Verdana, Tahoma, 'Segoe UI', Geneva, sans-serif", // D2-06 Option A — font-load-safe
} as const;

const PRESETS = { // D2-08 — preset-internal spacing
  compact:     { lineHeight: 1.4, letterSpacing: "0",     wordSpacing: "0" },
  comfortable: { lineHeight: 1.6, letterSpacing: "0",     wordSpacing: "0" }, // D-07 default
  spacious:    { lineHeight: 1.8, letterSpacing: "0.01em", wordSpacing: "0.05em" },
} as const;

export function applyTheme(s: ReaderSettings) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;                          // [data-theme] → token set (02-UI-SPEC §Color)
  root.style.setProperty("--font-body", FONT_STACKS[s.font]);
  root.style.setProperty("font-size", `${s.size}px`);    // body knob; headings are em-relative (02-UI-SPEC Dimension 4)
  const p = PRESETS[s.spacing];
  root.style.setProperty("line-height", String(p.lineHeight));
  root.style.setProperty("--letter-spacing", p.letterSpacing);
  root.style.setProperty("--word-spacing", p.wordSpacing);
  // .article-body max-width bound via a CSS var, e.g. --measure: 64ch
  root.style.setProperty("--measure", `${s.measure}ch`);
}
```

### Pattern 3: Dexie `version(2)` + Zod-validated composite records (STATE-02/04)

**What:** Add `db.version(2).stores({...})` without editing `version(1)`. Settings live as ONE composite Zod-validated record under key `"reader-prefs"`; location is keyed by the compound `[articleId+revision]`. `[CITED: dexie.org/docs/Dexie/Dexie.version()]`

```ts
// persistence/db.ts — ADD only (Pitfall 9: never edit version(1))
this.version(2).stores({
  // Re-declaring reserved slots at v2 anchors STATE-04 versioning and gives a
  // clean migration hook. v1 wrote NO records (static fixtures), so no data
  // migration is needed; identical store definitions are a schema no-op in Dexie ≥3.
  articles: "id, revision",
  settings: "key",
  location: "[articleId+revision]",
});
```

```ts
// content/schema.ts — ADD (Zod-at-boundary, STATE-04)
export const ReaderSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  font: z.enum(["serif", "sans", "dyslexic"]),
  size: z.union([z.literal(16), z.literal(18), z.literal(20), z.literal(22), z.literal(24)]),
  measure: z.union([z.literal(52), z.literal(58), z.literal(64), z.literal(72)]),
  spacing: z.enum(["compact", "comfortable", "spacious"]),
  theme: z.enum(["sepia", "light", "dark"]),
});
export type ReaderSettings = z.infer<typeof ReaderSettingsSchema>;

export const LocationRecordSchema = z.object({
  schemaVersion: z.literal(1),
  articleId: z.string().regex(/^[a-z0-9-]+$/),   // matches ArticleSchema.id (D-06)
  revision: z.number().int().min(1),              // D-06 monotonic
  graphemeOffset: z.number().int().min(0),
  savedAt: z.string().datetime(),
});
export type LocationRecord = z.infer<typeof LocationRecordSchema>;
```

**Settings store value-shape (D2 discretion — RECOMMENDED):** a single composite record keyed `"reader-prefs"`, NOT a flat token map. One read, one (debounced) write, atomic flush, one source of truth. `schemaVersion: 1` makes future migration detectable (STATE-04).

```ts
// persistence/settingsStore.ts
const KEY = "reader-prefs";
export async function loadSettings(): Promise<ReaderSettings | null> {
  const raw = await db.settings.get(KEY);
  if (!raw) return null;
  const parsed = ReaderSettingsSchema.safeParse(raw.value); // validate on READ
  return parsed.success ? parsed.data : null; // corrupt → null → fall to defaults
}
export async function saveSettings(s: ReaderSettings): Promise<void> {
  await db.settings.put({ key: KEY, value: s }); // s already validated by construction
}
```

### Pattern 4: Scroll-save debounce + dual-event flush (D2-11, STATE-01)

**What:** Debounce location writes ~1000–1500ms after scroll stops; ALSO register `visibilitychange` (primary) and `pagehide` (navigation/closure) to flush the pending write synchronously. MDN: `visibilitychange` is the most reliable session-end signal; `pagehide` is bfcache-safe and next-best; `beforeunload` is unreliable and breaks bfcache. `[CITED: developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event]`

```ts
// reader/useScrollSave.ts (sketch)
const pending = useRef<LocationRecord | null>(null);
const timer = useRef<number>();

function schedule(loc: LocationRecord) {
  pending.current = loc;
  clearTimeout(timer.current);
  timer.current = window.setTimeout(flush, 1200); // debounce window
}
async function flush() {
  const loc = pending.current;
  if (!loc) return;
  pending.current = null;
  try { await locationStore.save(loc); }
  catch (e) { notifyStorageFailure(e); } // STATE-05 — never throw to reader
}
useEffect(() => {
  const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", flush); // covers navigation/closure
  return () => {
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", flush);
  };
}, []);
```

### Pattern 5: Grapheme offset → DOM scroll target (STATE-01, D-05)

**What:** The saved location is a **grapheme offset into `normalizeText(article)`** (the D-05 flat string). To restore, resolve that offset to a DOM node and `scrollIntoView`. Phase 1 deferred `resolveQuoteSelector` (a Phase 5 concern); location restore only needs a **best-effort block-level** target, not exact-character re-anchoring.

**Recommended approach — walk the rendered DOM accumulating normalized-text contributions:**
1. After render, query the article body's block elements in document order (`<h2>`…`<h4>`, `<p>`, `<li>`, `<blockquote>`, `<pre>`, `<figure>`, footnote `<li>`).
2. For each, compute its normalized-text contribution using the SAME logic as `normalizeText` (collapse ASCII whitespace, join runs with spaces, `BLOCK_SEPARATOR` between blocks). Maintain a running grapheme count via `Intl.Segmenter` (locale = `article.lang`).
3. Find the block whose offset range contains the saved offset (or the nearest preceding block if the offset falls mid-paragraph — scroll to that block's top, which is calm and predictable).
4. `element.scrollIntoView({ block: "start" })` — but honor reduced-motion: under `prefers-reduced-motion`, the global gate already sets `scroll-behavior: auto`, so the scroll is instant; otherwise a single calm scroll is acceptable.

```ts
// reader/restoreLocation.ts (sketch — domain logic, unit-testable with the rendered tree)
import { graphemeClusters } from "../content/normalizeText";

export function findScrollTarget(
  article: CanonicalArticle,
  blocks: HTMLElement[],      // rendered block elements in document order
  offset: number,
): HTMLElement | null {
  let consumed = 0;
  let last: HTMLElement | null = null;
  for (const el of blocks) {
    last = el;
    const text = normalizeElText(el); // mirrors normalizeText per-block rules
    const len = graphemeClusters(text, article.lang).length;
    if (offset <= consumed + len) return el; // offset falls in/after this block
    consumed += len + 1; // +BLOCK_SEPARATOR
  }
  return last; // clamp to end if offset overshoots (corpus changed)
}
```

> **Note:** the per-element text-normalization MUST match `normalizeText`'s block rules exactly (collapse ASCII whitespace only; code-block source verbatim; footnote markers as visible text). Reuse the same helpers, not a parallel implementation, so offsets stay consistent with the D-05 contract.

### Pattern 6: Scroll-spy heading announce + progress hairline (D2-12, A11Y-08)

**What:** A polite `role="status"` region announces `"Section: {heading text}."` when the most-recently-passed heading changes. A separate 2px `aria-hidden` hairline shows scroll progress via `transform: scaleX(ratio)` with NO transition.

```ts
// reader/SectionAnnouncer.tsx (sketch)
useEffect(() => {
  const headings = Array.from(articleEl!.querySelectorAll("h2, h3, h4"));
  const obs = new IntersectionObserver(
    (entries) => {
      // rootMargin negative-top places a sentinel line UNDER the 48px header
      const passed = headings
        .filter((h) => h.getBoundingClientRect().top < HEADER_PX + 8)
        .pop();
      if (passed && passed.textContent !== currentRef.current) {
        currentRef.current = passed.textContent;
        debouncedAnnounce(`Section: ${passed.textContent}.`);
      }
    },
    { rootMargin: `-${HEADER_PX}px 0px -60% 0px`, threshold: [0] },
  );
  headings.forEach((h) => obs.observe(h));
  return () => obs.disconnect();
}, [articleEl]);
```
`[CITED: developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API]` — `rootMargin` grows/shrinks the root box; negative-top makes a heading "pass" when it crosses under the header.

### Anti-Patterns to Avoid
- **Re-implementing a focus trap / `inert` by hand** when `<dialog>`/`showModal()` provides it free — more bugs, less accessible.
- **Persisting settings as many key/value pairs** — breaks atomic flush + debounce; use one composite record.
- **Moving article reads into Dexie** in Phase 2 — adds a storage dependency to reading that D2-13 explicitly forbids.
- **`beforeunload` for flush** — unreliable on mobile, breaks bfcache. Use `visibilitychange` + `pagehide`.
- **A transition on the hairline `transform`** — the global reduced-motion gate would have to suppress it; simpler to have NO transition ever (UI-SPEC §Interaction 12).
- **Editing `version(1)` in db.ts** — Pitfall 9; corrupts the upgrade path. Add `version(2)`.
- **Storing offsets as UTF-16 indexes or page numbers** — violates D-05/D2-12; always grapheme offsets over normalized text.
- **Relying on jsdom to verify focus-trap/scroll/zoom** — jsdom does not implement `<dialog>` inert/top-layer or layout. Verify in Playwright.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal focus trap + restore | Custom roving-tabindex + keydown Tab handler | Native `<dialog>`/`showModal()` | Browser-correct trap, Esc, `::backdrop`, `inert` — cross-engine, accessible by default. |
| Modal backdrop + scrim click dismiss | Absolutely-positioned `<div>` + click-outside logic | `::backdrop` (or `<dialog>` backdrop) + `close` event | Avoids z-index/pointer-event edge cases. |
| Making the article non-interactive while panel open | Manual `aria-hidden`/`inert` on every sibling | `<dialog>` auto-`inert` of the rest of the document | One attribute, browser-managed, A11Y-03-safe. |
| Scroll-position → "current section" math | `scroll` + `getBoundingClientRect` polling loop | `IntersectionObserver` | Off-main-thread intersection calc; no jank. |
| Session-end flush detection | `beforeunload` + `unload` | `visibilitychange` + `pagehide` | bfcache-safe, reliable across engines. |
| IndexedDB transactions/migrations/queries | Raw `indexedDB` API | Dexie (already installed) | Schema versioning, upgrades, indexes, error ergonomics. |
| Grapheme-aware text length | `string.length` (UTF-16 code units) | `Intl.Segmenter` via Phase 1 `graphemeClusters()` | D-05 contract; é/emoji/ZWJ correctness. |
| Date formatting in copy | Hand-built date strings | `Intl.DateTimeFormat` (existing pattern) | Locale correctness; UI-SPEC §Copywriting. |

**Key insight:** The four riskiest Phase 2 mechanisms — modal a11y, scroll-spy, session-end flush, grapheme offset math — all have correct platform/locked-stack primitives. The project's job is to *wire* them correctly behind Zod-validated boundaries, not to *build* them.

## Runtime State Inventory

> Phase 2 is not a rename/refactor of runtime state, but it is the first phase to **introduce persisted runtime state** (Dexie records). This inventory documents what Phase 2 creates and what must remain stable.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None yet — Dexie `version(1)` wrote ZERO records (Phase 1 reads bundled JSON only; verified in `repository.ts` + `db.ts` comment). Phase 2 CREATES the first records: `settings["reader-prefs"]`, `location[articleId+revision]`. | Code: define `version(2)` + Zod schemas + stores. No data migration (empty DB). |
| Live service config | None — no external services; client-only SPA. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — no secrets; static fixtures. | None. |
| Build artifacts | `package.json` deps unchanged (no installs); `dist/` rebuilt by Vite. | None beyond normal build. |

**Single content-tree invariant (A11Y-03):** the article is rendered exactly once by `<ArticleBody>`. When the settings panel opens, the article is NOT re-rendered or duplicated — it stays mounted and the browser makes it `inert`. Verified by the existing `BlockRenderer` single-mount design + `<dialog>` semantics.

## Common Pitfalls

### Pitfall 1: Assuming `showModal()` restores focus to the trigger
**What goes wrong:** Reader opens the panel from the gear, closes it (Esc/scrim/×), and focus lands on `<body>` or the top of the page — violating A11Y-02 ("focus remains predictable").
**Why it happens:** The browser moves focus INTO the dialog on `showModal()`, but does **not** remember or restore the previously-focused element on `close`. `[CITED: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog — "Ensure a mechanism is provided..."; the focus-restore is the app's responsibility]`
**How to avoid:** Capture `document.activeElement` in the open effect; call `.focus()` on it in the dialog `close` event handler. Store the ref (not a DOM snapshot that could go stale).
**Warning signs:** axe won't catch this (it's runtime behavior, not markup). Verify with a Playwright keyboard test: focus gear → open → Esc → assert `document.activeElement === gear`.

### Pitfall 2: Testing `<dialog>` focus-trap/inert in jsdom
**What goes wrong:** Component tests pass in vitest/jsdom but the real focus trap, `inert` backdrop, and top-layer rendering don't behave the same in a real browser.
**Why it happens:** jsdom implements the `HTMLDialogElement` *API* (`show`/`showModal`/`close`/`open`) but NOT the inert/top-layer/focus-management *behavior* — those require real layout. The existing `vitest.config.ts` already warns "jsdom is NOT authoritative for layout."
**How to avoid:** In vitest, assert only application-level concerns (open/close state, `aria-labelledby`, control presence, the focus-restore call site). Assert the actual trap + Esc + inert + scroll in Playwright across all three engines.
**Warning signs:** A vitest test that asserts "Tab does not leave the dialog" — that is a Playwright test, not a vitest test.

### Pitfall 3: Editing `version(1)` in `db.ts` (Pitfall 9 carry-over)
**What goes wrong:** Editing the shipped `version(1)` declaration breaks Dexie's upgrade chain for any client that already opened v1, or silently reorders the version history.
**Why it happens:** Tempting to "just add the new index" to the existing declaration.
**How to avoid:** Add `db.version(2).stores({...})` as a new declaration on the same `db` instance. Dexie ≥3 knows prior versions automatically when both are declared. `version(1)` stays byte-for-byte as shipped.
**Warning signs:** Any diff that touches the `this.version(1)` block.

### Pitfall 4: Flush only on `pagehide` (or only on `beforeunload`)
**What goes wrong:** Location is lost when the user switches tabs or the mobile browser is killed from the app switcher.
**Why it happens:** `pagehide` is not reliably fired on mobile app-close; `beforeunload` is unreliable and breaks bfcache. `[CITED: developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event]`
**How to avoid:** Register BOTH `visibilitychange` (treat `document.visibilityState === "hidden"` as the primary flush) AND `pagehide`. The debounced write is the common path; the flush is the safety net.
**Warning signs:** A single `beforeunload`/`unload` listener — remove it.

### Pitfall 5: Settings write storm during live-apply
**What goes wrong:** Dragging the size stepper or toggling theme fires a Dexie write per change, hammering IndexedDB.
**Why it happens:** Live-apply (D2-03) means every control change updates the context immediately.
**How to avoid:** Decouple *token application* (immediate, in-memory) from *persistence* (debounced ~300–500ms for settings, ~1000–1500ms for location). The `applyTheme` effect runs every change; the `saveSettings` call is debounced.
**Warning signs:** Dexie write count > 1 per finished adjustment gesture.

### Pitfall 6: Heading live-region floods on fast scroll (A11Y-08)
**What goes wrong:** Rapid scroll announces a dozen section changes per second, spamming the screen reader.
**Why it happens:** `IntersectionObserver` fires per threshold crossing.
**How to avoid:** Track only the *most-recently-passed* heading; debounce the announce write; only announce when the current section text actually changes. UI-SPEC requires "concise, non-repetitive."
**Warning signs:** Announce region text changing more than ~once per 400ms.

### Pitfall 7: Heading hierarchy inversion at large body sizes
**What goes wrong:** At 24px body, subheadings no longer look larger than body text.
**Why it happens:** Hard-coded px heading sizes don't scale with the body knob.
**How to avoid:** UI-SPEC Dimension 4 already locks this: subheadings ≈ `1.22em`, display ≈ `1.78em` (em-relative). Honor it; do not re-introduce fixed px headings.
**Warning signs:** Any `h2 { font-size: 22px }` after the body size becomes variable.

### Pitfall 8: Silent wipe on corrupt/unupgradeable DB (STATE-05)
**What goes wrong:** A `db.delete()` in a catch block destroys the reader's data without consent.
**Why it happens:** "Just reset and move on" is the easy recovery.
**How to avoid:** D2-13 is explicit: wipe ONLY on explicit user action via the focus-trapped "Reset local data?" alertdialog. Until then, fall back to in-memory defaults and keep the banner shown.
**Warning signs:** `db.delete()` outside the wipe-confirm handler.

### Pitfall 9: CSS injection / DOM clobbering via persisted values
**What goes wrong:** A malformed persisted value reaches `innerHTML` or a `style` injection.
**Why it happens:** Persisted records flowing into the DOM.
**How to avoid:** Settings values are constrained Zod enums/literals (not free strings) applied via `style.setProperty` (which does not parse selectors) and `dataset.theme` (a data attribute, not HTML). The renderer already forbids `dangerouslySetInnerHTML` (Phase 1, `react/no-danger`). Location offsets are numbers. No new XSS surface. (See §Security Domain.)

## Code Examples

Verified patterns from official sources + the existing codebase.

### Settings as one composite record (read/write with STATE-05 handling)
```ts
// persistence/settingsStore.ts — Source: Dexie.version() docs + this codebase schema.ts
import { db } from "./db";
import { ReaderSettingsSchema, type ReaderSettings } from "../content/schema";
import { DEFAULT_SETTINGS } from "../settings/defaults";

const KEY = "reader-prefs";
export type SettingsLoadResult =
  | { ok: true; settings: ReaderSettings }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

export async function loadSettings(): Promise<SettingsLoadResult> {
  try {
    const raw = await db.settings.get(KEY);
    if (!raw?.value) return { ok: true, settings: DEFAULT_SETTINGS }; // first run
    const parsed = ReaderSettingsSchema.safeParse(raw.value);
    return parsed.success
      ? { ok: true, settings: parsed.data }
      : { ok: false, reason: "corrupt" }; // STATE-04 reject → STATE-05 banner
  } catch (e) {
    return { ok: false, reason: isUnupgradeable(e) ? "unupgradeable" : "unavailable" };
  }
}
```

### Dexie named-error detection (STATE-05)
```ts
// Source: Dexie error-handling patterns [CITED: dexie.org/docs]
function isUnupgradeable(e: unknown): boolean {
  const name = (e as { name?: string } | undefined)?.name ?? "";
  return ["UpgradeError", "VersionError", "UnknownError"].includes(name);
}
function isQuota(e: unknown): boolean {
  return (e as { name?: string } | undefined)?.name === "QuotaExceeded";
}
```

### State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `beforeunload`/`unload` for flush | `visibilitychange` + `pagehide` | bfcache era (2020s) | Flush reliably without breaking bfcache |
| Custom modal focus traps | Native `<dialog>`/`showModal()` | Baseline March 2022 (all 3 engines) | Free trap/Esc/inert; less code, more accessible |
| Raw IndexedDB | Dexie transactions + versioning | Dexie 4.x | Migrations, indexes, error ergonomics |
| `scroll` + `getBoundingClientRect` polling | `IntersectionObserver` | Baseline March 2019 | Off-main-thread, no jank |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `document.fonts.ready` is irrelevant in Phase 2 because all three font stacks are system-only (no web font). | Standard Stack / Pattern 2 | LOW — if OpenDyslexic were pulled into Phase 2, a `document.fonts.ready` gate would be needed (Phase 3 owns this). UI-SPEC locks system-only, so risk is contained. |
| A2 | The `articles` Dexie store stays unused in Phase 2 (fixtures remain bundled JSON; reading never depends on Dexie). | Pattern 3 / Runtime State | LOW — if a later requirement demanded offline article cache, the store is already reserved; no schema change needed. |
| A3 | Dexie named errors include `QuotaExceeded`, `OpenFailedError`, `UpgradeError`, `VersionError` as documented. | Pitfall 8 / Code Examples | LOW — verify exact names against Dexie 4.4.4 source if a test mocks them; behavior (catch + classify + fall back) is robust to name drift. |
| A4 | `scrollIntoView({ block: "start" })` under the global `prefers-reduced-motion` gate (which sets `scroll-behavior: auto`) yields an instant, calm scroll. | Pattern 5 | LOW — the global gate is already in `app.css`; verify in Playwright reduced-motion mode. |

*All other claims are tagged `[CITED: ...]` (official MDN / Dexie docs, verified via WebFetch this session) or are direct readings of the locked codebase / approved 02-UI-SPEC.*

## Open Questions

1. **Should `version(2)` re-declare identical stores, or only add genuinely-new indexes?**
   - What we know: `version(1)` already reserves `articles`/`settings`/`location`/`highlights`/`notes` with final index syntax. Dexie ≥3 treats re-declaring identical stores at a higher version as a schema no-op.
   - What's unclear: whether the planner prefers an explicit identical re-declaration (documents intent, anchors STATE-04) vs. only declaring if an index actually changes.
   - Recommendation: **Declare `version(2).stores({...})` with the Phase-2-populated stores** (`settings`, `location`, optionally `articles`) even if identical — it documents the activation point and gives a clean migration hook. Cost is zero; benefit is a clear version boundary. (Confirmed safe per Dexie.version() docs.)

2. **Exact debounce windows (D2-11, D2-03).**
   - What we know: UI-SPEC says "~1–2s" for location; settings debounce is the planner's call.
   - Recommendation: location **1200ms**, settings **400ms**. Both flush immediately on `visibilitychange`-hidden/`pagehide`. Tunable in one constant each.

3. **Range input vs. labeled stepper for Size/Reading-width (UI-SPEC leaves either open).**
   - What we know: UI-SPEC §Interaction 9 permits `<input type="range">` OR a `−`/`+` stepper; both must be arrow-key operable with a 44px target and a visible readout.
   - Recommendation: `<input type="range">` with a visible numeric readout + `aria-valuenow` — fewer custom ARIA, native arrow-key support, native forced-colors handling. (Planner's call; either passes the contract.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (≥20.19 / 22 LTS) | Vite 8 build | ✓ | v22.22.3 | — |
| npm | dependency mgmt | ✓ | 10.9.8 | — |
| IndexedDB | Dexie persistence | ✓ (all 3 target engines) | browser-native | STATE-05 in-memory defaults if unavailable |
| `IntersectionObserver` | heading scroll-spy | ✓ (Baseline 2019) | browser-native | skip announce (degrade quietly) |
| `<dialog>`/`showModal()` | settings panel + wipe confirm | ✓ (Baseline March 2022) | browser-native | none needed for target matrix |
| Playwright (Chromium/Firefox/WebKit) | layout/focus/scroll verification | ✓ | 1.61.1 | — |
| git | commit_docs | ✓ | present | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** if IndexedDB is unavailable (rare private-browsing modes), STATE-05 fallback to in-memory defaults keeps reading working — by design.

## Validation Architecture

> `workflow.nyquist_validation` is enabled in `.planning/config.json`. This section maps Phase 2 requirements to the test matrix. **jsdom (vitest) is NOT authoritative for `<dialog>` focus-trap/inert, IntersectionObserver, scroll, or zoom** — those run in Playwright across Chromium/Firefox/WebKit (per STACK.md "What NOT to Use" and the existing `vitest.config.ts` comment).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component, jsdom) + Playwright 1.61.1 (e2e, 3 engines) + `@axe-core/playwright` 4.12.1 |
| Config file | `vitest.config.ts` (jsdom, `tests/unit` + `tests/component`) / `playwright.config.ts` (`tests/e2e`, chromium+firefox+webkit) |
| Quick run command | `npm run test:unit -- --run` |
| Full suite command | `npm run test` (unit --run + e2e across 3 engines) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| READ-02 | Typography controls change `:root` tokens live | unit/component | `npm run test:unit -- --run tests/component/SettingsPanel.test.tsx` | ❌ Wave 0 |
| READ-03 | Theme sets `data-theme` on `<html>` | component | `npm run test:unit -- --run tests/component/SettingsContext.test.tsx` | ❌ Wave 0 |
| READ-04 | Header is quiet; panel closes by default | e2e (visual+axe) | `npx playwright test a11y.spec.ts` | ✅ (extend) |
| READ-05 | No page numbers; hairline is aria-hidden | e2e | `npx playwright test progress.spec.ts` | ❌ Wave 0 |
| A11Y-01 | No keyboard trap; Tab cycles in panel | e2e (keyboard) | `npx playwright test panel-keyboard.spec.ts` | ❌ Wave 0 |
| A11Y-02 | Focus restored to gear on close | e2e (keyboard) | `npx playwright test panel-keyboard.spec.ts` | ❌ Wave 0 |
| A11Y-03 | Single content tree; article inert not duplicated | e2e (axe + DOM) | `npx playwright test a11y.spec.ts` | ✅ (extend) |
| A11Y-04 | Reflow at 320px / 200% zoom | e2e | `npx playwright test reflow.spec.ts` | ❌ Wave 0 |
| A11Y-05 | Forced-colors preserves meaning | e2e (emulated) | `npx playwright test forced-colors.spec.ts` | ❌ Wave 0 |
| A11Y-06 | Reduced-motion: no required animation | e2e (emulated) | `npx playwright test reduced-motion.spec.ts` | ❌ Wave 0 |
| A11Y-07 | 44×44px touch targets; pointer parity | e2e | `npx playwright test touch-targets.spec.ts` | ❌ Wave 0 |
| A11Y-08 | Concise heading-change announce (debounced) | e2e | `npx playwright test section-announce.spec.ts` | ❌ Wave 0 |
| STATE-01 | Saved offset restored on reopen | unit (resolve) + e2e | `npm run test:unit -- --run tests/unit/restoreLocation.test.ts` | ❌ Wave 0 |
| STATE-02 | Settings persist across reload | e2e | `npx playwright test persistence.spec.ts` | ❌ Wave 0 |
| STATE-04 | Zod rejects corrupt settings/location | unit | `npm run test:unit -- --run tests/unit/settingsSchema.test.ts` | ❌ Wave 0 |
| STATE-05 | Storage failure → banner + in-memory fallback; no silent wipe | unit + e2e | `npm run test:unit -- --run tests/unit/storageFallback.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run` (fast jsdom logic + schema + resolve).
- **Per wave merge:** `npm run test` (full unit + Playwright across Chromium/Firefox/WebKit).
- **Phase gate:** Full suite green before `/gsd-verify-work`; manual keyboard + screen-reader pass before ship (axe reports only automatable issues — existing `a11y.spec.ts` header documents this).

### Wave 0 Gaps
- [ ] `tests/component/SettingsPanel.test.tsx` — open/close state, aria-labelledby, control presence, focus-restore call site (NOT the trap itself).
- [ ] `tests/component/SettingsContext.test.tsx` — live token application + `data-theme`.
- [ ] `tests/unit/restoreLocation.test.ts` — grapheme offset → DOM block resolution (pure domain logic, jsdom-safe).
- [ ] `tests/unit/settingsSchema.test.ts` + `tests/unit/locationSchema.test.ts` — Zod accept/reject (STATE-04).
- [ ] `tests/unit/storageFallback.test.ts` — named-error classification + in-memory-default path (mock Dexie).
- [ ] `tests/e2e/panel-keyboard.spec.ts` — focus trap + restore + Esc + scrim dismiss (3 engines).
- [ ] `tests/e2e/persistence.spec.ts` — settings + location survive reload; `visibilitychange` flush.
- [ ] `tests/e2e/section-announce.spec.ts` + `progress.spec.ts` — hairline + debounced announce.
- [ ] `tests/e2e/reflow.spec.ts` / `forced-colors.spec.ts` / `reduced-motion.spec.ts` / `touch-targets.spec.ts` — a11y variant coverage.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"` (`.planning/config.json`). Phase 2 persists user data locally and renders content.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts; local-only prototype. |
| V3 Session Management | no | No server sessions. |
| V4 Access Control | no | No privileged operations beyond local storage. |
| V5 Input Validation | **yes** | Zod schemas validate every persisted settings/location record on read AND write (STATE-04). Enum/literal constraints (no free strings). |
| V6 Cryptography | no | No secrets; no crypto. |
| V7 Error Handling | **yes** | STATE-05: storage failures caught, classified, never crash the reader; fall back to in-memory defaults. |
| V12 Files & Resources | no | No file upload. |
| V13 API & Web Service | no | Client-only. |
| V14 Configuration | **yes** | `react/no-danger` enforced (Phase 1); no `eval`; `target="_blank"` links carry `rel="noopener noreferrer"` (existing reverse-tabnabbing defense). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation (in place / added this phase) |
|---------|--------|---------------------|
| Stored XSS via persisted settings | Tampering | Settings values are Zod enums/literals (not free strings) applied via `style.setProperty` (no selector parsing) + `dataset.theme` (data attr, not HTML). Renderer forbids `dangerouslySetInnerHTML` (`react/no-danger`). **No new XSS surface.** |
| DOM clobbering via persisted ids | Tampering | Location records carry `articleId` (regex `^[a-z0-9-]+$`, matches `ArticleSchema.id`) and `revision` (int). No persisted id is used as a DOM `id` without the existing `fn-\d+` guard. |
| CSS injection via custom property | Tampering | All `style.setProperty` values are derived from Zod-validated enums/numbers — never reader-supplied free text. |
| Quota exhaustion / storage DoS | Denial of Service | STATE-05: `QuotaExceeded` → banner + in-memory defaults; reading never blocked. |
| Reverse tabnabbing | Spoofing | Existing: provenance link `rel="noopener noreferrer"`. No new `target="_blank"` in Phase 2 surface. |

**Security conclusion:** Phase 2 introduces **no high-severity risk**. The persisted-data surface is constrained enums + numeric offsets validated by Zod at both boundaries; the renderer already forbids raw-HTML injection. STATE-05 error handling prevents storage failures from crashing the app. No security blocker for planning.

## Sources

### Primary (HIGH confidence — official docs, verified via WebFetch this session)
- MDN `<dialog>` — developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog (focus management, showModal, inert backdrop, Esc, cross-engine Baseline March 2022, jsdom limitations inferred from API-vs-behavior gap).
- MDN IntersectionObserver API — developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API (rootMargin sentinel pattern, threshold, isIntersecting, Baseline March 2019).
- MDN `pagehide` event — developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event (bfcache-compat, not reliable on mobile close, visibilitychange is best).
- Dexie `Dexie.version()` — dexie.org/docs/Dexie/Dexie.version() (`version(N).stores().upgrade()`, keep prior versions, Dexie ≥3 auto-knows declared versions).

### Codebase authority (HIGH — direct reading)
- `src/persistence/db.ts` (reserved v1 schema, Pitfall 9 lock).
- `src/content/{repository,normalizeText,schema}.ts` + `render/BlockRenderer.tsx` (D-05/D-06/D-08 substrate, single-mount renderer, Zod-at-boundary, `react/no-danger`).
- `src/App.tsx` + `routes/{ArticleView,FixtureList}.tsx` + `a11y/SkipLink.tsx` + `app.css` (mount points, `:root` tokens, global reduced-motion/forced-colors gates, hash router).
- `.planning/phases/02-accessible-scrolling-reader/02-UI-SPEC.md` (approved design contract — resolves D2-06, D2-09, settings path, hairline, copywriting).
- `.planning/research/STACK.md` + `AGENTS.md` (locked stack + "What NOT to Use").

### Secondary (MEDIUM)
- Dexie error-class names (`QuotaExceeded`, `OpenFailedError`, `UpgradeError`, `VersionError`) — Dexie documented error model; exact names to be confirmed against Dexie 4.4.4 if a test mocks them (behavior is robust to name drift).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — locked STACK.md, no new packages, registry-verified.
- Architecture (dialog, persistence, restore, scroll-spy): HIGH — grounded in official MDN/Dexie docs + direct codebase reading; UI-SPEC pre-resolved the discretion items.
- Pitfalls: HIGH — focus-restore gap and jsdom limitation are documented platform behaviors; Pitfall 9 carry-over is explicit in the codebase.

**Research date:** 2026-07-30
**Valid until:** 2026-08-29 (30 days — stable platform primitives + locked stack; the only fast-moving item, Dexie error names, is robust to drift).
