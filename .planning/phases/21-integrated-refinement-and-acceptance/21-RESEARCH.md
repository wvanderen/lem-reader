# Phase 21: Integrated Refinement and Acceptance - Research

**Researched:** 2026-08-31
**Domain:** UI geometry correction (CSS anchor positioning), settings-boundary value migration, design-token conformance, visual/interaction audit methodology, cross-engine E2E acceptance spine, manual screen-reader acceptance protocol evolution
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reading-width truth (POLISH-09)**
- **D21-01**: The slider's truthful far-right endpoint is 64ch — the 72 step is REMOVED. `MEASURE_STEPS` loses its lying maximum; far-right = 64ch with the surface verifiably delivering 64 characters at that endpoint (visual width AND `aria-valuemax` agree).
- **D21-02**: The range EXTENDS DOWNWARD (toward e.g. `[40, 46, 52, 58, 64]` — exact steps are planner/researcher territory; uniform step spacing keeps the existing `step` arithmetic working).
- **D21-03**: Any stored `measure: 72` setting CLAMPS CALMLY to 64 on read — no migration prompt, no schema change; the persisted value simply maps onto the truthful range (agent owns the exact mechanism).
- **D21-04**: The settings readout stays as-is (inline "Reading width N ch") — no endpoint labels. Truth = shown value + aria attributes + the rendered column all agree at every step, in both reading modes.

**Tag menu (POLISH-08)**
- **D21-05**: Keep the `popover="auto"` interaction contract (top layer, light-dismiss + Esc) and fix the ANCHORING — the menu tracks its trigger (adjacent on open), stays within the viewport, repositions as geometry changes, and restores focus to the trigger on close. Positioning technology (CSS anchor positioning vs JS repositioning on resize/scroll) is researcher/planner territory — cross-engine support decides.

**Highlights destination (POLISH-10)**
- **D21-06**: Article-context navigation gets a VISIBLE row affordance — the whole-row jump mechanism stays, but each confident row carries a quiet open-in-reader glyph/explicit jump control so the destination is understandable at a glance (icon anatomy consistent with existing inline-SVG glyphs). Row semantics, ambiguous/orphan disabled rules, and orphan-tail shape are unchanged.
- **D21-07**: Shared grid = TOKEN CONFORMANCE, not a literal shared grid template. Highlights keeps its own row anatomy; every layout measurement (measure, gutters, spacing rhythm, responsive insets) derives from the same shared tokens/rules as Library. Concrete deviations are diagnosed by the researcher; intentional differences get citation comments (the POLISH-07 discipline).

**Impeccable-informed audit (POLISH-11)**
- **D21-08**: The audit covers ALL primary user-facing surfaces — Library (views, filters, Add dialog), Highlights, Reader (scrolling + paginated, TOC, annotations chrome), Settings/dialogs, and error/refusal states. Methodology: the `impeccable` skill's audit approach, under the hard constraint that native semantics and reduced-motion/forced-colors/zoom/SR behavior never weaken.
- **D21-09**: The audit runs AFTER the POLISH-08/09/10 fixes — it validates the corrected state (including the three fixes themselves) and its findings apply to the final UI. Phase ordering: POLISH fixes → audit → remediation → acceptance runs last (acceptance validates the final audited state).
- **D21-10**: Remediation policy — fix blocker/major findings in-phase (the same bar as ACPT-08's no-blocker/major policy); minor/cosmetic findings are recorded in `deferred-items.md` with severity. The milestone still closes honestly with logged minors.

**WebKit Blob→IndexedDB residual (ACPT-07 webkit arm)**
- **D21-11**: Keep the D20-15 Blob shape and the 5 documented Playwright skips — NO Uint8Array migration. ACPT-07's webkit arm runs with the image-save cells engine-skipped exactly as Phase 20 documented them (chromium + firefox prove every affected flow); the boundary is recorded as reduced-gate honesty (v1.0 A4 precedent).
- **D21-12**: A ONE-TIME real-Safari image-flow verification (save → reopen offline → export → import with images) closes the production question. It folds into the ACPT-08 VoiceOver+Safari session (already in Safari) plus one sighted pass — one hardware session, evidence recorded in the protocol results.

**Acceptance mechanics (ACPT-07, ACPT-08)**
- **D21-13**: ACPT-07 closes via ONE INTEGRATED SPINE SPEC — a single continuous end-to-end journey (seed → organize via views/filters → add content → edit metadata → navigate by TOC → create a cross-block highlight → review it → export with images → wipe → import → verify byte-equal restoration) run across chromium/firefox/webkit. Mirrors the ACPT-06 consolidated core-flow-spine precedent; "without loss" is asserted as one unbroken journey. Webkit's image-save cells ride D21-11's documented skips.
- **D21-14**: ACCEPTANCE-PROTOCOL v1.2 → v1.3 grows by CAPABILITY FLOWS — scripted flows covering each v2.1 capability once (library views/filters, Add dialog — retiring the Phase-16 deferral, metadata edit, TOC navigation, cross-block highlight + review, images) on top of the existing reader/settings flows; exploratory charters kept. Roughly 8-10 scripted flows per SR engine — covers ACPT-08's flow list without exploding protocol length.
- **Flip policy (carried forward, not re-decided):** ACPT-08 flips only when the human NVDA+Firefox AND VoiceOver+Safari runs land zero blocker/major on protocol v1.3, with the fix-then-re-run loop (D13-06/D13-07). Automated matrix parts (keyboard, reduced-motion, forced-colors, reflow, zoom) extend the existing D6-09 edge-invariant spec machinery across the four destinations.

**Known-debt closure**
- **D21-15**: The 3 pre-existing `src/portability/zipSlip.ts` lint errors (Phase 9) are FIXED this phase (scoped disable-with-justification or equivalent) so the milestone closes with `npm run lint` green alongside the honest test gate.

### the agent's Discretion

- **Slider internals** — exact lower step values, the 72→64 clamp mechanism (read-time normalize vs load-time map), which pinned e2e cells legitimately update (strengthen-only for untouched specs).
- **Tag-menu anchoring mechanics** — CSS anchor positioning vs JS reposition on resize/scroll, viewport-keep strategy, narrow-width behavior; researcher verifies cross-engine support and picks.
- **Highlights deviation diagnosis** — which .review-* rules actually deviate from shared tokens; the visible row-affordance glyph choice (existing inline-SVG anatomy).
- **Audit mechanics** — how the impeccable-skill audit is executed and its findings mapped to blocker/major/minor severity; the findings report format.
- **Spine spec composition** — which fixtures/ingested content carry the journey (figure-heavy regenerated fixture has local assets), seeding strategy, byte-equality assertions (09-06 two-context machinery precedent), which webkit cells carry documented skips.
- **Protocol v1.3 authoring** — exact flow wording, expected outcomes as role + accessible name + state (Pitfall 7 discipline), results sheets.
- **Safari verification recording** — where the sighted-pass evidence lands (protocol results vs 21-VERIFICATION.md).
- **Phase gate shape** — honest full-suite invocation records (workers contention control precedent), lint gate wiring.

### Deferred Ideas (OUT OF SCOPE)
- **Uint8Array asset-row migration** — un-paid (D21-11); revisit trigger = any real-Safari image defect or a Playwright-WebKit fix. Stays recorded in Phase 20 deferred-items.md.
- **Animated-AVIF animation-gate residual** — accepted per Phase 20 A4; not reopened here.
- **Literal shared grid for Highlights rows** — rejected (D21-07); revisit only if token conformance proves insufficient visually.
- **Section-heading links into article context on Highlights** — rejected this phase (D21-06 chose row affordance); backlog candidate if section-level entry proves wanted.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLISH-08 | Tag menu opens adjacent to its invoking control, remains within the viewport, follows the trigger as geometry changes, and restores focus predictably when closed | CSS anchor positioning verified cross-engine by direct probe on the project's pinned Playwright browsers (§Pattern 1); focus-restore seam already ships (ArticleView toggle event) |
| POLISH-09 | Reading-width control reaches its displayed 64-character maximum at the slider's far-right endpoint and exposes the same truthful range programmatically | MEASURE_STEPS evolution + uniform-step arithmetic + the pre-parse 72→64 clamp seam (§Pattern 2, §Pitfall 1); `ch` unit spec-verified as the truth criterion |
| POLISH-10 | Highlights destination presents review content within the shared layout grid and provides direct, understandable navigation back to Library and into article context | Token-conformance diagnosis enumerated rule-by-rule (§Pattern 3); visible row-affordance glyph shape grounded in existing inline-SVG anatomy |
| POLISH-11 | Impeccable-informed visual and interaction audit resolves milestone-scope anti-patterns without weakening native semantics or a11y behavior | impeccable `audit` command methodology loaded and documented: 5 dimensions × 0-4 + P0-P3 severity mapped onto blocker/major/minor (§Pattern 4) |
| ACPT-07 | v2.1 core flow across Chromium, Firefox, WebKit without data or content loss | ACPT-06 core-flow-spine.spec.ts precedent read in full; every reusable helper located (§Pattern 5); webkit image-save skip sites enumerated |
| ACPT-08 | Library, Highlights, Add, and Reader flows pass the documented keyboard/NVDA/VoiceOver/reduced-motion/forced-colors/reflow/zoom matrix with no blocker or major finding | ACCEPTANCE-PROTOCOL.md v1.2 read in full; v1.3 growth plan + D6-09 edge-invariant extension path (§Pattern 6) |
</phase_requirements>

## Summary

Phase 21 is a closing phase with three small, precisely-scoped UI corrections, one design audit, and two acceptance proofs. Nothing new is installed; every fix lands in files that already ship. The decisive technical question — D21-05's "CSS anchor positioning vs JS repositioning, cross-engine support decides" — was answered **by direct probe on this project's own pinned Playwright 1.61.1 browsers**: `anchor-name`, `position-anchor`, `position-area`, `position-try-fallbacks`, and `anchor()` all report supported in chromium, firefox, AND webkit, and a behavioral probe proved an anchored `popover="auto"` panel opens adjacent below its trigger, follows the trigger across viewport resizes with zero JS listeners, and stays in-viewport at 240px width in all three engines. MDN independently marks the feature Baseline 2026 "newly available" since January 2026. **Recommendation: CSS anchor positioning, no JS repositioning, no `@supports` fork** — the entire matrix supports it natively.

The riskiest finding of this research is invisible in the UI: the 72→64 "calm clamp" (D21-03) is NOT a one-line change. `ReaderSettingsSchema` enumerates `z.literal(72)` (`src/content/schema.ts:360-365`), and `loadSettings` routes ANY parse failure to `{ ok: false, reason: "corrupt" }` → the **WipeConfirm destructive surface**. Naively deleting 72 from the union would tell every reader who ever slid the width to 72 that their data is corrupt and offer to wipe it — the exact opposite of calm. The clamp must run **pre-parse, at every settings-entry seam** (Dexie row read, localStorage mirror read, import-preferences path), and it must map ONLY the known-legacy value 72→64 so arbitrary corruption still fails parse and surfaces (STATE-04 never-silently-coerce preserved). The index.html paint-hint script reads the same mirror and needs the same one-line legacy map.

Everything else is composition over proven machinery: the ACPT-06 spine spec (read in full, 452 lines) is the template for D21-13's v2.1 twin with `selectRangeBetweenBlocks` (annotations/_fixtures.ts:619) already shipping for the cross-block highlight arm; ACCEPTANCE-PROTOCOL v1.2 (read in full) grows to v1.3 by adding capability flows in the existing role+name+state format; the impeccable skill's `audit` reference defines the POLISH-11 methodology with a P0-P3 severity ladder that maps cleanly onto D21-10's blocker/major/minor policy; and the three zipSlip lint errors were reproduced exactly (`no-control-regex` ×2 at L34/L76, `no-useless-escape` at L77) with behavior-identical fixes identified.

**Primary recommendation:** Ship POLISH-08 as pure CSS anchor positioning (trigger gets `anchor-name`, popover gets `position-anchor` + `position-area` + `position-try-fallbacks`, drop the fixed insets, reset `inset: auto`); ship POLISH-09 as `[40,46,52,58,64]` + a pre-parse legacy-72→64 map at three seams; then audit, then spine, then protocol — in exactly D21-09's order, with the honest full-suite gate and the new lint gate closing the milestone.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tag-menu anchoring (POLISH-08) | Browser/CSS (anchor positioning) | — | Layout-tracking is the browser's job; the probe proves all 3 engines reposition anchored fixed elements on geometry change with zero JS. React state (`tagsOpen`) stays the open/close truth; only geometry moves to CSS. |
| 72→64 clamp (POLISH-09) | Persistence/settings boundary (pre-parse normalizer) | — | The value-shape migration must sit where raw rows enter (settingsStore/mirror/import), ahead of the Zod trust boundary — the 09-03 `.default()` read-hydration precedent. |
| Measure truth assertion (POLISH-09) | CSS custom property (`--measure`) + e2e verification | — | One derivation point (`applyTheme.ts` L38) already owns the truth; both surfaces (`.article-body` L263, `.paginated-surface` L1100) consume `var(--measure)`. |
| Highlights affordance + conformance (POLISH-10) | React component (ReviewView rows) + app.css tokens | — | Row anatomy is component-owned; measurements derive from shared `--space-*`/1100px tokens per D21-07. |
| Visual/interaction audit (POLISH-11) | Agent-run skill methodology → findings document | — | The impeccable `audit` reference is a code-level audit protocol; findings land in a phase artifact feeding remediation. |
| ACPT-07 spine | Playwright e2e (3 engines) | Node-side bundle inspection | The 09-06 two-context machine A/B + raw IndexedDB row equality runs browser-side with Node-side unzip/compare. |
| ACPT-08 matrix (automated arms) | Playwright e2e edge specs | — | D6-09 `assertEdgeInvariant` machinery extended across four destinations. |
| ACPT-08 matrix (SR arms) | HUMAN-RUN on real hardware | — | Locked by D13-06/D13-07: NVDA+Firefox and VoiceOver+Safari runs are manual, flip at zero-blocker/major on v1.3. |

## Standard Stack

### Core

No new packages. This phase installs nothing — every deliverable lands in existing source/test/doc files. [VERIFIED: codebase inventory — package.json untouched by all six requirements]

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| CSS Anchor Positioning (browser platform) | Baseline 2026 (newly available since Jan 2026) | POLISH-08 trigger-tracking geometry | Native, zero-JS repositioning; probe-verified on this project's exact engine matrix [VERIFIED: direct probe + MDN Baseline badge] |
| Popover API (`popover="auto"`) | Shipping since Phase 13-10 | Tag-menu interaction contract (unchanged, D21-05) | Top layer + light-dismiss + Esc already proven; only anchoring changes |
| Playwright Test | 1.61.1 (pinned) | ACPT-07 spine + ACPT-08 automated matrix | Existing harness, 3 engine projects + throttled, workers:3 contention control |
| Vitest | 4.1.10 (pinned) | Clamp-seam unit tests, lint-fix regression | Existing unit runner |
| `impeccable` skill (agent skill, not a package) | installed at `~/.agents/skills/impeccable` | POLISH-11 audit methodology | D21-08 names it as the mandated methodology |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `assertEdgeInvariant` (in-repo helper) | `tests/e2e/_edge-invariant.ts` | ACPT-08 automated matrix arms | Extend/reuse — never fork (D6-09) |
| `_portability.ts` helpers | `tests/e2e/portability/_portability.ts` | Two-context A/B, `readAllRows`/`readRow`, `readBundleJson` | The spine's export→wipe→import→byte-equal arm |
| `selectRangeBetweenBlocks` | `tests/e2e/annotations/_fixtures.ts:619` | Cross-block highlight creation in the spine | The ANNO arm's selection driver |
| `openAddDialog` / `pickSource` | `tests/e2e/library/add-dialog.ts` | Add-dialog flows in spine + protocol substrate | ADD capability arm |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS anchor positioning | JS repositioning (toggle-event + getBoundingClientRect + resize/scroll listeners) | More code, more test surface, listener lifecycle bugs; only wins if an engine lacked support — the probe proves none does |
| Pre-parse legacy clamp (72→64) | Keeping `z.literal(72)` in the read union + post-parse mapping | Permissive union poisons the `ReaderSettings` type everywhere MEASURE_STEPS arithmetic runs; post-parse mapping multiplies seams |
| Removing the useless escape at zipSlip L77 | eslint-disable comment | Removal is behavior-identical and cleaner (`/` needs no escape inside a character class); disable comments reserved for the two control-regex lines where the "violation" IS the feature |

**Installation:** none — `npm install` is a no-op for this phase.

## Package Legitimacy Audit

> This phase installs **zero** external packages. No registry lookups required; no `[ASSUMED]` package names appear in this research. All "stack" is browser-platform CSS, in-repo helpers, and one pre-installed agent skill.

**Packages removed due to SLOP verdict:** none (none checked — nothing installs)
**Packages flagged as suspicious:** none

## Architecture Patterns

### System Architecture Diagram

The phase's work items flow in D21-09's locked order — fixes feed the audit, the audit feeds remediation, acceptance proves the final state:

```
                    ┌──────────────────────────────────────────────┐
                    │ WAVE A — the three corrections               │
                    │                                              │
  POLISH-08 ────────┤ .tags-trigger gets anchor-name               │
  (tag menu)        │ .tag-popover: position-anchor + position-area│
                    │   + position-try-fallbacks; insets removed   │
                    │ → geometry e2e (adjacency/resize/viewport/   │
                    │   focus-restore, 3 engines)                  │
                    │                                              │
  POLISH-09 ────────┤ MEASURE_STEPS [40,46,52,58,64]               │
  (truthful 64)     │ schema union drops literal(72)               │
                    │ legacy-72→64 pre-parse map @ 3 seams + hint  │
                    │ → clamp unit tests + truthful-64 e2e cells   │
                    │                                              │
  POLISH-10 ────────┤ review-row glyph (inline SVG) + token        │
  (Highlights)      │   conformance (conform-or-cite per rule)     │
                    │ → affordance e2e + conformance citations     │
                    └──────────────────────┬───────────────────────┘
                                           ▼
                    ┌──────────────────────────────────────────────┐
  POLISH-11 ────────│ impeccable audit (5 dimensions, all surfaces)│
  (audit)           │ → findings doc, P0-P3 → blocker/major/minor  │
                    └──────────────────────┬───────────────────────┘
                                           ▼
                    ┌──────────────────────────────────────────────┐
  D21-10 ───────────│ remediation: fix blocker/major in-phase;     │
                    │ minors → deferred-items.md w/ severity       │
                    └──────────────────────┬───────────────────────┘
                                           ▼
                    ┌──────────────────────────────────────────────┐
  ACPT-07 ──────────│ v2.1 core-flow spine spec (one journey,      │
                    │   3 engines; webkit image-save cells skip    │
                    │   per D21-11's documented sites)             │
  ACPT-08 ──────────│ edge-spec extension (4 destinations)         │
                    │ protocol v1.3 authoring                      │
                    │ HUMAN: NVDA+FF + VO+Safari zero-blocker runs │
                    │   (D21-12 Safari image arm folds into VO)    │
                    │ → flip REQUIREMENTS rows at proof            │
                    └──────────────────────┬───────────────────────┘
                                           ▼
                    ┌──────────────────────────────────────────────┐
  D21-15 + gate ────│ zipSlip lint fix → npm run lint green        │
                    │ honest full-suite gate (npm run test exit 0, │
                    │ every invocation recorded)                  │
                    └──────────────────────────────────────────────┘
```

### Recommended Project Structure

No new folders. Touched files only:

```
src/
├── settings/tokens.ts            # MEASURE_STEPS evolution (D21-01/02)
├── settings/settingsMirror.ts    # pre-parse legacy clamp (D21-03)
├── content/schema.ts             # measure union drops literal(72)
├── persistence/settingsStore.ts  # pre-parse legacy clamp (D21-03)
├── portability/ (import prefs)   # pre-parse legacy clamp (D21-03)
├── routes/ArticleView.tsx        # tag-popover anchoring (CSS class only)
├── routes/review/ReviewView.tsx  # row glyph affordance (D21-06)
├── app.css                       # .tag-popover re-anchor + .review-* conformance
├── portability/zipSlip.ts        # 3 lint fixes (D21-15)
├── App.tsx / Header              # anchor-name on tags-trigger (CSS only)
└── index.html                    # paint-hint legacy map (D21-03)
docs/
└── ACCEPTANCE-PROTOCOL.md        # v1.2 → v1.3 (D21-14)
tests/
├── unit/ (settings clamp, zipSlip regression holds)
└── e2e/ (tag-menu geometry spec, truthful-measure cells,
          review affordance, v2.1 core-flow spine, edge extensions)
```

### Pattern 1: CSS-anchored popover (POLISH-08)

**What:** The tag popover tracks its trigger using the browser's anchor positioning, replacing the current header-visual fixed positioning (`.tag-popover { position: fixed; top: calc(48px + var(--space-xs)); inset-inline-end: var(--space-md); }` — app.css L1949-1959, anchored to the *header*, not the trigger).

**When to use:** Exactly this pattern for the tag menu; leave `popover="manual"` TocPanel and native `<dialog>` surfaces untouched (their contracts are locked).

**Evidence:** Direct probe on the project's Playwright 1.61.1 engines (2026-08-31):

```text
CSS.supports probe (chromium / firefox / webkit):
  anchor-name: true / true / true
  position-anchor: true / true / true
  position-area: true / true / true
  position-try-fallbacks: true / true / true
  anchor() in inset: true / true / true

Behavioral probe (button in 48px right-aligned header, popover=auto,
position-area: block-end span-inline-end, try-fallbacks flip-block/flip-inline):
  opens adjacent below trigger:      true × 3 engines
  follows trigger on 800→360 resize: true × 3 engines (zero JS listeners)
  stays below trigger after resize:  true × 3 engines
  fully in-viewport at 240px width:  true × 3 engines (fallbacks flip)
```

[VERIFIED: probe executed in this research session against the repo's own node_modules/@playwright/test]

**Example shape** (trigger is in Header, popover mounts in ArticleView — `anchor-name` is document-scoped so the DOM split is a non-issue):

```css
/* Source: adapted from MDN position-area guide + verified probe.
   The popover default margin/inset must be reset (MDN:
   "Using position-area to position popovers" — UA popover styles
   conflict with author positioning). */
.tags-trigger {
  anchor-name: --tags-trigger; /* the Header button, 44x44 */
}
.tag-popover {
  position: fixed;                    /* stays fixed; insets resolve vs anchor */
  position-anchor: --tags-trigger;
  position-area: block-end span-inline-end;
  position-try-fallbacks: flip-block, flip-inline;
  margin: var(--space-xs);            /* the calm gap below the trigger */
  inset: auto;                        /* kill UA popover insets (MDN note) */
  /* width: min(420px, calc(100vw - 2 * var(--space-md))) — keep the cap */
  /* padding/border/background/radius unchanged */
}
/* DELETE: top: calc(48px + var(--space-xs)); inset-inline-end: var(--space-md); */
```

Notes:
- Scroll-following is inherent: the trigger sits in the always-visible 48px header, and anchored insets re-resolve on any geometry change (resize, zoom, reflow — the probe covered resize; zoom/reflow ride the same layout invalidation path).
- `popover="auto"` contract byte-stable (D21-05): top layer, light-dismiss, Esc — untouched.
- Focus-restore already ships (ArticleView L391-400 capture + toggle-event restore seam) — POLISH-08's focus clause needs only e2e assertion, not new code.
- Reduced-motion: zero motion properties involved (static repositioning), trivially satisfying the global gate.

### Pattern 2: The truthful-measure evolution (POLISH-09)

**What:** Three coordinated edits plus one verification spec.

1. **Steps** (`src/settings/tokens.ts` L32): `MEASURE_STEPS = [40, 46, 52, 58, 64]` — extends downward with the same uniform step 6 the shipped arithmetic already assumes (`step={MEASURE_STEPS[1] - MEASURE_STEPS[0]}` in SettingsPanel L464 derives 6 either way; min/max/aria derive from array ends L462-469 automatically). [ASSUMED: exact lower bound 40 — D21-02's example; planner may pick a different floor, any uniform-step-6 set works]
2. **Schema** (`src/content/schema.ts` L360-365): measure union drops `z.literal(72)`.
3. **Legacy clamp** — a bounded, exported normalizer applied to the raw record BEFORE `safeParse` at each settings-entry seam:

```typescript
// The ONE legacy-value map (D21-03). Bounded on purpose: ONLY the known
// pre-truthful-range value maps; any other out-of-range value still fails
// ReaderSettingsSchema.parse → "corrupt" → WipeConfirm (STATE-04
// never-silently-coerce holds for actual corruption).
const LEGACY_MEASURE: Record<number, number> = { 72: 64 };
export function clampLegacyMeasure<T extends { measure?: unknown }>(
  raw: T,
): T {
  const m = raw.measure;
  return typeof m === "number" && m in LEGACY_MEASURE
    ? { ...raw, measure: LEGACY_MEASURE[m] }
    : raw;
}
```

**The three seams** (each currently parses `ReaderSettingsSchema` directly):
- `src/persistence/settingsStore.ts` `loadSettings` (L63: `safeParse(raw.value)`) — clamp `raw.value` first.
- `src/settings/settingsMirror.ts` read path (mirror-painted 72 otherwise returns null → falls to Dexie; uniform clamping keeps the mirror useful and the paint hint correct).
- The import-preferences path — `src/portability/bundle.ts` L106 embeds `ReaderSettingsSchema` as the bundle's `preferences` block; a v2.1-era exported bundle carrying 72 must clamp calmly on re-import, not refuse. Apply the same normalizer where import hydrates preferences (`applyImport`/`applyPreferences` seam).
- Plus `index.html` paint hint (L83-84: `if (typeof s.measure === "number" ...) r.style.setProperty("--measure", s.measure + "ch")`) — add the same `{72: 64}` map inline so first paint matches hydration (no 72ch flash-then-clamp).

**Verification criterion (the "truthful" contract):** `ch` is spec-defined as "the used advance measure of the '0' (ZERO, U+0030) glyph in the font used to render it" [VERIFIED: CSS Values and Units Level 4 editor's draft, 2026-08-20]. So 64ch truth = the reading surface's content width equals 64 "0"-advances of the body font. E2e cells: assert `getComputedStyle` `--measure`/max-width resolution matches a measured 64-"0" ruler within sub-pixel tolerance on `.article-body` (scrolling, `max-width: var(--measure)` L263) AND `.article-body.paginated-surface` (`width: var(--measure)` L1100), with the slider at far-right, plus `aria-valuemax=64` agreement (D21-01) and readout "Reading width 64 ch" (D21-04 unchanged shape).

### Pattern 3: Highlights token conformance + visible affordance (POLISH-10)

**Diagnosis (D21-07 — enumerated for the planner's conform-or-cite decisions):**

| .review-* rule (app.css) | Library counterpart | Verdict basis |
|---|---|---|
| `.review-header/-filter-row/-legend/-section` all `max-width: 1100px; margin-inline: auto` (L3048/3063/3088/3098) | `.library-list/-header/-search/-section` identical 1100px family | **Conforms** — chrome measure matches |
| `.review-row` `padding: var(--space-md)` (L3132) | `.library-row` / `.book-row` `padding: var(--space-lg)` | **Deviation candidate** — conform to `--space-lg` or cite (row density difference) |
| `.review-section-list` `gap: var(--space-sm)` single column (L3114-3120) | `.library-list` `gap: var(--space-lg)` + 2/3-col responsive grid @640/1024 | **Legitimate anatomy difference** (D21-07 keeps own row anatomy) — citation comment |
| `.review-section h2` `font-size: 20px` (L3104) | Library h2 register (verify continue-reading h2 during implementation) | Verify-then-conform-or-cite |
| `.review-select` 16px (L3082) | Already citation-commented (POLISH-07 D15-03 intentional difference) | **Keep** — precedent |
| No `@media` rules in the review block (L3047-3243) | Library re-grids at 640/1024 | Single-column needs no re-grid; 1100px cap + main#main insets carry narrow widths — citation comment |

**Visible affordance (D21-06):** each confident row's `<button.review-row>` (ReviewView.tsx L244-259; orphan-tail rows and disabled/unresolved rules unchanged) gains a quiet inline-SVG glyph consistent with the shipped anatomy (GearIcon/TrashIcon pattern: 20×20, `currentColor` stroke, `pointer-events: none`, no new color tokens). Placement inside the row button (an SVG is non-interactive content — legal inside a button, unlike the sibling action cluster). The `aria-label` template (`Go to highlight: …`) stays the SR contract; the glyph is the visual-at-a-glance contract. Back-to-Library remains the shell-nav link (Phase 15) — no new chrome.

### Pattern 4: The impeccable audit execution (POLISH-11)

**Methodology (from the loaded skill's `audit` reference):** five dimensions, each scored 0-4 —
1. **Accessibility** (contrast, ARIA, keyboard, semantics, alt, forms)
2. **Performance** (layout thrash, expensive effects, render perf)
3. **Theming** (token usage, theme switching)
4. **Responsive** (fixed widths, touch targets, overflow, text scaling)
5. **Anti-Patterns** (the skill's absolute-bans list: side-stripe borders, gradient text, glassmorphism default, identical card grids, tracked eyebrows, text overflow, ghost-card border+shadow pairing, over-rounding, sketchy SVG, stripe backgrounds)

Findings tagged **P0 (blocking) / P1 (major) / P2 (minor) / P3 (polish)** with location, impact, standard violated, recommendation.

**Severity mapping (D21-10):** P0 → blocker, P1 → major (both = fix in-phase); P2/P3 → minor (log to `deferred-items.md` with severity). The audit's own "Anti-Patterns Verdict — start here, does this look AI-generated?" becomes the audit report's opening section.

**Execution constraints:** audit runs AFTER POLISH-08/09/10 land (D21-09 — it must validate the corrected state); covers every surface in D21-08's list; the hard rule is that any remediation preserves native semantics and never weakens reduced-motion/forced-colors/zoom/SR behavior (the project's existing specs are the regression net — remediation must keep them green, strengthen-only). Findings report lands as a phase artifact (e.g. `21-AUDIT-FINDINGS.md` or equivalent — planner names it) with the P0-P3 table + per-finding remediation status.

### Pattern 5: The v2.1 core-flow spine (ACPT-07 / D21-13)

The template is `tests/e2e/portability/core-flow-spine.spec.ts` (ACPT-06's 452-line consolidated proof — read in full during this research). The v2.1 twin composes:

- **Journey (one test, `test.setTimeout` ~90-120s per engine):** seed library (fixtures + a real ingestion through the Add dialog) → organize via views/filters (reading-views + search-tag-filter machinery) → add content (`openAddDialog`/`pickSource` from `tests/e2e/library/add-dialog.ts`) → edit metadata (metadata-edit precedent) → navigate by TOC (`tests/e2e/toc/` machinery) → create a **cross-block** highlight (`selectRangeBetweenBlocks`, annotations/_fixtures.ts:619 — the Phase 19 helper is the shipped way to drive a two-block native selection) → review it (route to Highlights, row jump back) → export with images (Settings UI download capture + Node-side `readBundleJson`) → wipe → import through ImportPreviewDialog → **byte-equal restoration** (`readAllRows`/`readRow` raw IndexedDB row equality per the 09-06 two-context machinery, extended to the asset rows).
- **Images arm reality:** export reads `loadAllAssets()` from Dexie — fixture-registry images (in-memory) do NOT travel; the images arm requires a real ingestion that writes Blob asset rows (Add dialog upload/EPUB container path). On webkit those save paths hit the documented Blob→IDB boundary → those cells engine-skip exactly per D21-11; chromium + firefox prove every affected flow. The skip sites already documented: offline-reopen:122, round-trip:998, import-preview:532, epub-intake:1312, happy-path:201 — all `browserName === "webkit"` citing Phase 20 deferred-items.md. **These five stay byte-stable; the spine adds its own documented webkit skip(s) in the same pattern.**
- **"Without loss" assertions:** raw-row byte equality across row kinds (now including assets on chromium/firefox), reimported cross-block highlight re-resolves confident through the shipped resolver, article opens from library, mark renders, pagination page-count identity, position restore — mirroring the ACPT-06 bar at v2.1 breadth.

### Pattern 6: Protocol v1.3 + the automated matrix extension (ACPT-08)

**v1.2 → v1.3 (D21-14):** `docs/ACCEPTANCE-PROTOCOL.md` (445 lines, read in full) grows by capability flows — library views/filters, Add dialog (retiring the Phase 16 manual-SR deferral), metadata edit, TOC navigation, cross-block highlight + review, images — each authored as **keyboard sequence + expected outcome (role + accessible name + state)** per the Pitfall 7 authoring rule (§2 of the protocol). Existing 6 reader/settings flows + 5 exploratory charters stay; results-record location updates from `06-VERIFICATION.md` to the Phase 21 verification artifact; header Version bumps to 1.3 with the D6-08 re-run contract intact. Target ~8-10 scripted flows per pairing.

**Automated arms:** the four edge specs (`forced-colors`, `reduced-motion`, `reflow`, `high-zoom` + touch-targets) extend to cover Library, Highlights, Add-dialog, and Reader destinations using the D6-09 machinery. Note a real design point: `assertEdgeInvariant` currently asserts article-surface truths (article role, `[data-block-index]` blocks, mode toggle) — destination-level cells for non-reader surfaces need either a destination-agnostic wrapper (assert the D6-09 (b)/(c) clauses — required functions reachable + no overflow — which are already destination-neutral) with the (a) clause reader-scoped, or per-destination variants. Strengthen-only: no existing assertion is removed. Keyboard/panel specs (`panel-keyboard`, Add-dialog focus discipline from ADD-04) already cover parts of the keyboard arm — extend, don't fork.

**Human arms (locked):** NVDA+Firefox (Windows) and VoiceOver+Safari (macOS) runs on protocol v1.3, zero-blocker/major to flip, fix-then-re-run loop D13-06/D13-07. D21-12's Safari image-flow verification (save → offline reopen → export → import with images) folds into the VO+Safari session (same browser) plus one sighted pass — one hardware session; a real EPUB-with-images upload is the network-free way to get real Blob asset rows on real Safari (container extraction, no fetch).

### Anti-Patterns to Avoid

- **Deleting `z.literal(72)` without the pre-parse clamp** — routes stored-72 readers to WipeConfirm ("corrupt"), violating D21-03 (see Pitfall 1 — this is THE phase's hidden trap).
- **Clamping ANY out-of-range measure value** — silently coerces actual corruption; the map must contain exactly `{72: 64}` so STATE-04 surfacing survives.
- **JS reposition listeners for the tag menu** — the probe proves the browser does this natively; listeners are the maintenance-heavy path D21-05 explicitly delegates cross-engine support to decide against.
- **Keeping `top`/`inset-inline-end` insets alongside anchor positioning** — author insets fight `position-area`; MDN documents the UA-popover `margin`/`inset` conflict explicitly.
- **Editing the five documented webkit skip sites** — byte-stable per D21-11; the spine's new skips cite the same deferred-items ledger.
- **Running the audit before the fixes** — D21-09 locks fixes → audit → remediation → acceptance.
- **Removing/weakening any existing assertion to make new cells pass** — strengthen-only is the standing discipline (D6-12).
- **Re-submitting the 09-07/15-04 lesson**: webkit-only failures with isolation-green re-runs = environment (check dev-server age, worker contention) before touching specs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trigger-tracking popover geometry | resize/scroll listener + rAF reposition loop | CSS anchor positioning (`position-area` + `position-try-fallbacks`) | Browser-owned layout tracking, probe-verified 3 engines, zero listener lifecycle, free viewport-keeping |
| Viewport overflow avoidance for the menu | manual clamp math on getBoundingClientRect | `position-try-fallbacks: flip-block, flip-inline` | Engine-native flip search; probe-verified in-viewport at 240px |
| Legacy settings value migration | Dexie schema version + upgrade callback | Pre-parse bounded value map at read seams | Pitfall 9 (no store change for value shapes); the 09-03 `.default()` precedent; no migration prompt (D21-03) |
| SR-flow verification | Automated SR assertion | Human protocol runs (D13-06/07) | Locked decision; axe/automation cannot replace cross-SR manual flows |
| Byte-equality export/import proof | Fresh comparison harness | `_portability.ts` two-context machine A/B | 09-06 shipped machinery; REUSE-DO-NOT-FORK |
| Cross-block selection in e2e | New Range-synthesis code | `selectRangeBetweenBlocks` | Phase 19 shipped helper at annotations/_fixtures.ts:619 |

**Key insight:** every hard sub-problem this phase touches already has shipped, verified machinery — the phase's craft is composition and honest gates, not invention.

## Runtime State Inventory

> This phase includes value-shape migrations (measure 72→64) — inventory completed.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | IndexedDB `lem-reader` settings row MAY carry `measure: 72` (any reader who used the old max); localStorage mirror `lem-settings-mirror-v1` same; exported v2/v3/v4 bundles' preferences block same | Code edit only (pre-parse clamp at 3 seams + paint hint) — no data migration, no row rewrite; on-disk 72 rows stay valid-but-clamped until next save |
| Live service config | None — client-only app, no external services | None — verified by project architecture (STACK.md: static hosting, no backend beyond dev middleware) |
| OS-registered state | None — no Task Scheduler/launchd/pm2 registrations in this repo | None — verified by repo survey (no daemon/service code) |
| Secrets/env vars | None consumed by any phase-21 file | None |
| Build artifacts | None affected — no package renames; zipSlip edits are behavior-identical (lint surface only) | None |

## Common Pitfalls

### Pitfall 1: The 72-clamp is a trust-boundary problem, not a token tweak
**What goes wrong:** Removing 72 from `MEASURE_STEPS` + the schema union makes every stored `measure: 72` row fail `ReaderSettingsSchema.safeParse` → `loadSettings` returns `{ok:false, reason:"corrupt"}` → **WipeConfirm offers to wipe the reader's library**.
**Why it happens:** `src/content/schema.ts:360-365` enumerates literals; `src/persistence/settingsStore.ts:63-71` routes parse failure to the corrupt path by design (STATE-04).
**How to avoid:** Bounded pre-parse map `{72: 64}` at the three seams (settingsStore read, mirror read, import preferences) + the index.html paint hint. ONLY the enumerated legacy value maps — arbitrary corruption still surfaces. Unit-test all three seams: a 72 row loads calmly at 64 with every other field intact; a garbage measure still fails parse.
**Warning signs:** any e2e/unit surfacing WipeConfirm after the tokens change; "corrupt" storage state on a previously-healthy profile.

### Pitfall 2: UA popover styles fight author positioning
**What goes wrong:** Anchored popover renders offset/centered oddly or `position-area` seems ignored.
**Why it happens:** MDN documents that default `[popover]` margin/inset styles conflict; author insets (`top`, `inset-inline-end`) also override the anchor resolution.
**How to avoid:** `margin: var(--space-xs); inset: auto;` on `.tag-popover`; DELETE the old fixed insets entirely.
**Warning signs:** popover adjacent in chromium but centered/offset in webkit.

### Pitfall 3: Pinned cells that legitimately move vs strengthen-only
**What goes wrong:** Existing e2e asserting `aria-valuemax="72"`, MEASURE_STEPS contents, or `.tag-popover` fixed geometry fail after the fix; broad "fix the spec" edits violate strengthen-only.
**Why it happens:** D21-02 explicitly authorizes updating cells the decision legitimately changes ("which pinned e2e cells legitimately update" is agent discretion); untouched specs must stay byte-stable.
**How to avoid:** Enumerate affected pinned assertions up front (measure-slider cells in settings/typography specs; any tag-popover geometry assertions; the 5 webkit skip sites); update those with the decision citation (D21-01/02/05); everything else byte-stable.
**Warning signs:** diffs touching spec files outside the enumerated set.

### Pitfall 4: The ch unit is the "0" glyph, not "average character"
**What goes wrong:** Verifying "64 characters" by counting arbitrary prose characters per line yields ~70-75 and looks like a lie.
**Why it happens:** `ch` is spec-defined as the advance measure of the "0" glyph [VERIFIED: css-values-4]; mixed-case prose glyphs vary in width.
**How to avoid:** The truthful-64 e2e measures against a 64-"0" ruler (a probe element/canvas measure of "0".repeat(64) in the body font) vs the surface's content width, plus `aria-valuemax` + readout agreement. This is the same measure definition the control displays — the D21-01 contract.
**Warning signs:** anyone proposing per-line character counting as the acceptance gate.

### Pitfall 5: WebKit starvation masquerading as regression (18-04/15-04/20-07 lesson)
**What goes wrong:** Full-suite gate exits 1 on a rotating set of late webkit specs; each re-runs green in isolation.
**Why it happens:** Reused stale dev server + worker oversubscription under machine load (documented 3× in project history).
**How to avoid:** Fresh dev server for gate runs; the pinned `workers: 3` contention control; record every invocation honestly (red runs included) with the starvation classification.
**Warning signs:** webkit-only, isolation-green, moving failure sets.

### Pitfall 6: Audit remediation weakening a11y to "fix" visual findings
**What goes wrong:** A cosmetic audit finding gets fixed by swapping a native control for styled divs, adding motion, or dropping semantic structure — trading a P2 for a blocker.
**Why it happens:** Visual polish pressure vs the hard constraint in D21-08.
**How to avoid:** Every remediation re-runs the a11y/edge specs (strengthen-only); the constraint is written into the findings doc as the remediation gate.
**Warning signs:** remediation diffs touching roles/semantics/motion properties.

### Pitfall 7: Protocol v1.3 expected outcomes drifting into verbatim SR phrasing
**What goes wrong:** Flaky human-run findings from voice/version phrasing differences.
**Why it happens:** SR output is not stable across versions/settings (protocol §2 Pitfall 7).
**How to avoid:** Every new capability-flow outcome authored as role + accessible name + state; phrasing notes are informational-only, severity minor at most (the boundary rule).
**Warning signs:** new flow tables containing "NVDA says…" as a gate.

## Code Examples

### Tag-menu anchoring (POLISH-08)
```css
/* Source: probe-verified adaptation of MDN Anchor positioning guide
   (developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning) +
   position-area popover note
   (developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-area). */
.tags-trigger { anchor-name: --tags-trigger; }
.tag-popover {
  position: fixed;
  position-anchor: --tags-trigger;
  position-area: block-end span-inline-end;
  position-try-fallbacks: flip-block, flip-inline;
  inset: auto;
  margin: var(--space-xs);
  width: min(420px, calc(100vw - 2 * var(--space-md)));
}
```

### The three-seam legacy clamp (POLISH-09)
```typescript
// Source: project precedent — 09-03 applyPreferencesDefault read-hydration
// (value-shape migration at the boundary, no store change) + STATE-04
// never-silently-coerce contract.
const LEGACY_MEASURE: Readonly<Record<number, number>> = { 72: 64 };

export function clampLegacyMeasure(raw: unknown): unknown {
  if (raw !== null && typeof raw === "object" && "measure" in raw) {
    const m = (raw as { measure?: unknown }).measure;
    if (typeof m === "number" && m in LEGACY_MEASURE) {
      return { ...(raw as object), measure: LEGACY_MEASURE[m] };
    }
  }
  return raw;
}
// settingsStore.loadSettings:  safeParse(clampLegacyMeasure(raw.value))
// settingsMirror read:         safeParse(clampLegacyMeasure(parsed JSON))
// import preferences seam:     safeParse(clampLegacyMeasure(bundle.preferences))
// index.html paint hint:       const m = LEGACY[s.measure] ?? s.measure
```

### Truthful-64 verification cell (POLISH-09)
```typescript
// Source: ch-unit contract (drafts.csswg.org/css-values-4#font-relative-lengths).
// At slider far-right: computed --measure is 64ch; a 64-"0" ruler equals the
// article content width within 1px; aria-valuemax is 64; readout says 64.
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

### zipSlip lint fixes (D21-15)
```typescript
// L34 + L76 — the control characters ARE the guard's purpose:
// eslint-disable-next-line no-control-regex -- this guard's function is
// detecting control characters in archive entry names (Pitfall 11 #6);
// the escape sequences are the payload, not an accident.
if (/[\0-\x1f]/.test(rawName)) return false;
// L77 — behavior-identical escape removal ("/" needs no escape in a class):
.replace(/[\\<>:"|?*]/g, "")
// Regression net: tests/unit/portability/zip-slip.test.ts stays byte-stable.
```
[VERIFIED: `npx eslint src/portability/zipSlip.ts` run this session — exactly 3 errors: L34/L76 `no-control-regex`, L77 `no-useless-escape`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JS listener loops for anchored overlays | CSS anchor positioning (`position-area`, `position-try-fallbacks`) | Baseline 2026 newly-available Jan 2026 [CITED: MDN Baseline badge]; probe-verified on this repo's engines 2026-08-31 | POLISH-08 becomes ~6 CSS declarations; the old fixed-position hack dies |
| `inset-area` (Chromium-only name) | `position-area` (both supported transiently) | 2024-2025 rename | Use `position-area` only; no fallback prefix needed on this matrix |
| Fixed 48px-header visual anchoring | True trigger anchoring | This phase | Menu geometry becomes correct at every viewport/zoom |

**Deprecated/outdated:**
- The `.tag-popover` `top: calc(48px + …)` / `inset-inline-end` block (app.css L1949-1959) — replaced wholesale this phase.
- Any notion of JS repositioning for popovers on this engine matrix — obsolete given native support.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Lower measure steps `[40, 46, 52, 58, 64]` (D21-02's example, uniform step 6) | Pattern 2 | Low — any uniform-step set keeps the arithmetic; planner confirms the floor (40 vs 46 barely matters; 40 helps 400% zoom) |
| A2 | Real Safari (VO session hardware) supports anchor positioning + IDB Blob like Playwright webkit's DOM engine but WITHOUT the Blob put bug | Patterns 1, 5, 6 | Low-medium — MDN Baseline covers Safari 26+ for anchoring [CITED]; real Safari IDB Blob documented Safari 10+ [VERIFIED: Phase 20 deferred-items evidence]; the D21-12 session is itself the verification |
| A3 | Anchor positioning has no SR-announcement impact (layout-only change; roles/names unchanged) | Pattern 1 | Minimal — geometry-only; the ACPT-08 SR runs re-prove anyway |
| A4 | The figure-heavy regenerated fixture's registry assets don't travel through export (export reads Dexie rows only) — the images arm needs real ingestion | Pattern 5 | Low — verified against 20-VERIFICATION data-flow (loadAllAssets → zip entries); composition fact, not assumption, but planner should confirm seeding choice |
| A5 | `.review-section h2` 20px register needs a Library-side comparison during implementation (continue-reading h2) | Pattern 3 | Trivial — one-line check during the conformance task |

## Open Questions (RESOLVED)

All four questions are substantively resolved and adopted by the phase plan set (adoption pointers per question; annotated 2026-08-31):

1. **Exact measure floor (D21-02)**
   - What we know: uniform step 6 required; `[40,46,52,58,64]` fits D21-02's example.
   - What's unclear: whether 40 or 46 is the better floor for 400%-zoom readability.
   - Recommendation: adopt `[40,46,52,58,64]`; the 320px-reflow + 400%-zoom matrix cells will empirically confirm the floor is usable.
   - **Adopted (OQ1 → 21-01 Task 1 step 2):** `MEASURE_STEPS = [40, 46, 52, 58, 64]` ships; the 320px-reflow + 400%-zoom matrix cells (21-06 Task 1) empirically confirm the floor.

2. **Edge-invariant extension shape**
   - What we know: D6-09 helper is article-surface-scoped ((a) clause); (b)/(c) clauses are destination-neutral.
   - What's unclear: destination-agnostic wrapper vs per-destination cell families.
   - Recommendation: wrapper asserting (b)+(c) at all four destinations + keep (a) reader-scoped — least new surface, strengthen-only trivially satisfied.
   - **Adopted (OQ2 → 21-06 Task 1):** the destination-agnostic `assertDestinationInvariant` wrapper asserts (b)+(c) at all four destinations; (a) stays reader-scoped.

3. **Safari sighted-pass evidence home (D21-12 discretion)**
   - What we know: protocol results sheet vs 21-VERIFICATION.md are the candidates.
   - Recommendation: record in the protocol results sheet (it IS a protocol run) with a pointer from 21-VERIFICATION.md — mirrors the ACPT-05 ledger discipline.
   - **Adopted (OQ3 → 21-06 Task 2 step 3):** evidence records in the protocol v1.3 results sheet with a pointer from 21-VERIFICATION.md.

4. **Audit findings artifact name**
   - What we know: D21-08/10 require a durable findings doc; name is free.
   - Recommendation: `21-AUDIT-FINDINGS.md` in the phase dir, referenced from VERIFICATION.
   - **Adopted (OQ4 → 21-04 Task 1):** the artifact ships as `21-AUDIT-FINDINGS.md` in the phase dir; the verification ledger references it at verify-work time.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | 22.22.3 (LTS line per STACK) | — |
| Playwright browsers (chromium/firefox/webkit) | spine + matrix | ✓ (probe ran all 3) | 1.61.1 pinned | — |
| Vite dev server | e2e webServer | ✓ | 8.x (project) | fresh-server discipline for gates |
| NVDA + Windows hardware | ACPT-08 human arm | ✗ (not on this macOS machine) | — | HUMAN-RUN off-machine, user-scheduled (ACPT-05 precedent: runs on their own schedule, results land in the verification ledger) |
| VoiceOver + Safari (macOS) | ACPT-08 human arm + D21-12 | ✓ (darwin host) | macOS current | — |
| `impeccable` skill | POLISH-11 audit | ✓ | `~/.agents/skills/impeccable` | — |
| eslint | D21-15 gate | ✓ | project config | — |

**Missing dependencies with no fallback:** NVDA+Firefox run (human, off-machine) — blocks only the ACPT-08 flip, not any code work; the flip policy already anticipates human scheduling.
**Missing dependencies with fallback:** none else.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright Test 1.61.1 (e2e: chromium/firefox/webkit + chromium-throttled) |
| Config file | `vitest` defaults + `playwright.config.ts` (workers: 3 pinned; single Vite webServer :5173) |
| Quick run command | `npm run test:unit -- --run <file>` / `npx playwright test <spec> --project=chromium` |
| Full suite command | `npm run test` (unit --run && playwright; exit 0 = gate) + `npm run lint` (new this phase, D21-15) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLISH-08 | Menu adjacent + viewport-kept + geometry-following + focus-restore | e2e (3 engines) | `npx playwright test tests/e2e/<tag-menu-geometry>.spec.ts` | ❌ Wave 0 |
| POLISH-09 (clamp) | Stored 72 → 64 calmly at all 3 seams; garbage still corrupt | unit | `npm run test:unit -- --run tests/unit/settings/<clamp>.test.ts` | ❌ Wave 0 |
| POLISH-09 (truth) | 64ch ruler ≈ content width both modes; aria/readout agree | e2e (3 engines) | `npx playwright test tests/e2e/<truthful-measure>.spec.ts` (or extend typography-live-apply) | ❌ Wave 0 |
| POLISH-10 | Row glyph visible + jump semantics intact | e2e (3 engines) | extend `tests/e2e/review-panel/` specs | ✅ (extend) |
| POLISH-11 | Audit findings doc + remediation keeps all suites green | mixed | `npm run test` after remediation | ❌ Wave 0 (findings doc) |
| ACPT-07 | One unbroken v2.1 journey, byte-equal restoration | e2e (3 engines, webkit image cells skip-documented) | `npx playwright test tests/e2e/<v21-core-flow-spine>.spec.ts` | ❌ Wave 0 |
| ACPT-08 (auto arms) | Edge matrix across 4 destinations | e2e (3 engines) | extend `forced-colors/reduced-motion/reflow/high-zoom/touch-targets` specs | ✅ (extend) |
| ACPT-08 (SR arms) | NVDA+FF, VO+Safari zero-blocker on v1.3 | manual-only (human hardware; D13-06/07 lock) | n/a — protocol run | n/a (doc: protocol v1.3) |

### Sampling Rate
- **Per task commit:** targeted unit/e2e for the touched surface (quick commands above)
- **Per wave merge:** full unit suite (`npm run test:unit -- --run`)
- **Phase gate:** `npm run test` exit 0 (every invocation recorded, workers-contention discipline) AND `npm run lint` exit 0 (D21-15's milestone-close condition) AND protocol v1.3 human runs landed zero-blocker/major before the ACPT-08 flip

### Wave 0 Gaps
- [ ] `tests/e2e/<tag-menu-geometry>.spec.ts` — POLISH-08 (adjacency, resize-follow, 240px viewport-keep, Esc/light-dismiss focus-restore, 3 engines)
- [ ] `tests/unit/settings/<measure-clamp>.test.ts` — POLISH-09 three-seam clamp + paint-hint map
- [ ] `tests/e2e/<truthful-measure>.spec.ts` (or typography-live-apply extension cells) — POLISH-09 ruler + aria + readout, both modes
- [ ] `tests/e2e/<v21-core-flow-spine>.spec.ts` — ACPT-07 (two-context, cross-block helper, asset row equality on chromium/firefox, documented webkit skips)
- [ ] Audit findings doc scaffold — POLISH-11
- [ ] `docs/ACCEPTANCE-PROTOCOL.md` v1.3 capability flows — ACPT-08 (authoring precedes the human runs)

## Security Domain

`security_enforcement: true`, ASVS Level 1 (config). This phase adds no new input surfaces; the security-relevant surface changes:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local-first, no accounts (unchanged) |
| V3 Session Management | no | No sessions (unchanged) |
| V4 Access Control | no | No privileged surfaces touched |
| V5 Input Validation | **yes** | The measure clamp MUST remain a bounded legacy map at the Zod boundary — schema stays the trust boundary; only the enumerated `{72:64}` value bypasses failure. Import-preferences path keeps `ReaderSettingsSchema` validation (bundle.ts L106) with the pre-parse map ahead of it. zipSlip L77 escape removal is behavior-identical (regression corpus `zip-slip-regression.spec.ts` + unit tests stay green/byte-stable). |
| V6 Cryptography | no | No crypto touched |

### Known Threat Patterns for this phase's changes

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile bundle with crafted preferences | Tampering | Unchanged: Zod parse at import; clamp maps only the enumerated legacy value — all other invalid values still refuse/correctly-classify (never widen the union for "tolerance") |
| Audit remediation introducing XSS/mXSS (dangerous HTML, styled replacements) | Tampering/Elevation | Remediation gate: no `dangerouslySetInnerHTML` (lint:no-danger stays firing), native semantics preserved, full suite green |
| Anchor-positioning CSS injection surface | — | None: anchor names are author-authored dashed-idents in authored CSS; no user content enters style properties |

## Sources

### Primary (HIGH confidence)
- Direct probes executed this session against the repo's own `@playwright/test` 1.61.1 browsers: CSS.supports matrix + behavioral geometry probe (chromium/firefox/webkit) — the D21-05 deciding evidence
- `npx eslint src/portability/zipSlip.ts` — the exact 3 errors reproduced
- Codebase reads: tokens.ts, schema.ts (L348-375), settingsStore.ts (L54-78), settingsMirror.ts, app.css (measure/tag-popover/review/library blocks), ArticleView.tsx (L378-412, L2595-2649), App.tsx (L196-235), ReviewView.tsx (L215-304), SettingsPanel.tsx (L440-494), zipSlip.ts, index.html paint hint, core-flow-spine.spec.ts, _edge-invariant.ts, _fixtures.ts (selectRangeBetweenBlocks), ACCEPTANCE-PROTOCOL.md (full), Phase 20 VERIFICATION + deferred-items (full), REQUIREMENTS.md, STATE.md
- CSS Values and Units Level 4 editor's draft (2026-08-20) — `ch` = advance measure of the "0" glyph

### Secondary (MEDIUM confidence)
- MDN `position-area` page — Baseline 2026 "newly available since January 2026" badge + popover default-styles conflict note (fetched 2026-08-31)
- MDN CSS Anchor Positioning module overview (fetched 2026-08-31; property/feature inventory)

### Tertiary (LOW confidence)
- None — no training-data-only claims load-bearing in this research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing installs; browser-platform features probe-verified on the exact engine matrix
- Architecture: HIGH — all patterns grounded in read-in-full precedents (spine spec, protocol, helpers) with line-level citations
- Pitfalls: HIGH — the WipeConfirm trap and popover-style conflict verified against source; lint errors reproduced by execution

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (stable; browser matrix is pinned by Playwright lockfile, so support facts do not drift mid-milestone)
