# Phase 21: Integrated Refinement and Acceptance - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 21 is the **v2.1 closing phase** — correct the last known UI issues
and prove the complete milestone across the full browser and accessibility
matrix:

1. **POLISH-08 — tag menu geometry.** The tag menu opens adjacent to its
   invoking control, remains within the viewport, follows the trigger as
   geometry changes, and restores focus predictably when closed.
2. **POLISH-09 — truthful reading width.** The reading-width control
   reaches a truthful 64-character maximum at the slider's far-right
   endpoint, exposed identically visually and programmatically.
3. **POLISH-10 — Highlights cohesion.** The Highlights destination
   respects the shared layout grid and offers clear Library and
   article-context navigation.
4. **POLISH-11 — Impeccable-informed audit.** A visual/interaction audit
   resolves milestone-scope anti-patterns without replacing native
   semantics or weakening reduced-motion, forced-colors, zoom, or
   screen-reader behavior.
5. **ACPT-07 — v2.1 core flow.** The complete core flow (organize
   library, add content, edit metadata, navigate by TOC, create a
   cross-block highlight, review it, export/import controlled images)
   succeeds without loss in Chromium, Firefox, and WebKit.
6. **ACPT-08 — acceptance matrix.** Library, Highlights, Add, and Reader
   flows pass the documented keyboard, NVDA+Firefox, VoiceOver+Safari,
   reduced-motion, forced-colors, 320px reflow, and 400% zoom matrix with
   no blocker or major finding.

**Phase 21 does NOT ship** (backlog — do not fold in):
- New capabilities of any kind — this phase corrects and proves; it adds
  no features.
- The Uint8Array asset-row migration (stays un-paid; recorded revisit
  trigger — see D21-09).
- Animated-AVIF animation-gate residual (accepted per Phase 20 A4).

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- Honest full-suite gate (`npm run test` exit 0, every invocation
  recorded); byte-stable e2e anchors + strengthen-only; calm DOC-06 copy;
  44px touch targets; reduced-motion gates all motion; forced-colors
  compatibility.
- Manual SR acceptance is HUMAN-RUN on real hardware; requirements flip
  only when a zero-blocker/major run lands, with the fix-then-re-run loop
  (D13-06/D13-07). `docs/ACCEPTANCE-PROTOCOL.md` v1.2 is the durable
  instrument (D6-08 versioned + re-run).
- Phase 16 explicitly deferred the AddDialog manual SR pass to this
  phase's ACPT-08.
- Native `<dialog>`/showModal discipline for modals; popover=manual
  non-modal for the TocPanel; popover=auto for the tag popover (D21-05
  keeps this).
- POLISH-07 token-audit precedent: shared tokens, citation-commented
  intentional differences (e.g. Reader 64ch measure, .review-select
  16px register).
- D20-15 Blob asset-row shape is LOCKED (the WebKit Playwright boundary
  is resolved by documentation + real-Safari evidence, not migration).
- Playwright-WebKit refuses ALL Blob→IndexedDB puts (5 documented e2e
  skips; real Safari supports Blob IDB since Safari 10).
- Esc-close + focus-restore is the universal keyboard escape for
  top-layer overlays; engine focus-divergence asserted honestly per
  engine (D18-04 precedent).
- Milestone-scope requirements: POLISH-08..11, ACPT-07/08
  (.planning/REQUIREMENTS.md rows all Pending → this phase closes them).

</domain>

<decisions>
## Implementation Decisions

### Reading-width truth (POLISH-09)

- **D21-01: The slider's truthful far-right endpoint is 64ch — the 72
  step is REMOVED.** `MEASURE_STEPS` loses its lying maximum; far-right =
  64ch with the surface verifiably delivering 64 characters at that
  endpoint (visual width AND `aria-valuemax` agree).
- **D21-02: The range EXTENDS DOWNWARD** (toward e.g.
  `[40, 46, 52, 58, 64]` — exact steps are planner/researcher territory;
  uniform step spacing keeps the existing `step` arithmetic working).
  Rationale: real reader choice at the narrow end (high zoom, large type)
  now that the top is pinned.
- **D21-03: Any stored `measure: 72` setting CLAMPS CALMLY to 64 on
  read** — no migration prompt, no schema change; the persisted value
  simply maps onto the truthful range (agent owns the exact mechanism).
- **D21-04: The settings readout stays as-is** (inline "Reading width
  N ch") — no endpoint labels. Truth = shown value + aria attributes +
  the rendered column all agree at every step, in both reading modes.

### Tag menu (POLISH-08)

- **D21-05: Keep the `popover="auto"` interaction contract** (top layer,
  light-dismiss + Esc) and fix the ANCHORING — the menu tracks its
  trigger (adjacent on open), stays within the viewport, repositions as
  geometry changes, and restores focus to the trigger on close.
  Positioning technology (CSS anchor positioning vs JS repositioning on
  resize/scroll) is researcher/planner territory — cross-engine support
  decides.
- Current state to correct: `.tag-popover` is `position: fixed` under
  the header's inline-end cluster — anchored to the header visually, not
  to the trigger, so it detaches at some geometries.

### Highlights destination (POLISH-10)

- **D21-06: Article-context navigation gets a VISIBLE row affordance** —
  the whole-row jump mechanism stays, but each confident row carries a
  quiet open-in-reader glyph/explicit jump control so the destination is
  understandable at a glance (icon anatomy consistent with existing
  inline-SVG glyphs). Row semantics, ambiguous/orphan disabled rules,
  and orphan-tail shape are unchanged.
- **D21-07: Shared grid = TOKEN CONFORMANCE, not a literal shared grid
  template.** Highlights keeps its own row anatomy; every layout
  measurement (measure, gutters, spacing rhythm, responsive insets)
  derives from the same shared tokens/rules as Library. Concrete
  deviations are diagnosed by the researcher; intentional differences
  get citation comments (the POLISH-07 discipline).
- Back-to-Library navigation: the shell-nav Library link (Phase 15) is
  the direct path — no new back chrome.

### Impeccable-informed audit (POLISH-11)

- **D21-08: The audit covers ALL primary user-facing surfaces** —
  Library (views, filters, Add dialog), Highlights, Reader (scrolling +
  paginated, TOC, annotations chrome), Settings/dialogs, and
  error/refusal states. Methodology: the `impeccable` skill's audit
  approach, under the hard constraint that native semantics and
  reduced-motion/forced-colors/zoom/SR behavior never weaken.
- **D21-09: The audit runs AFTER the POLISH-08/09/10 fixes** — it
  validates the corrected state (including the three fixes themselves)
  and its findings apply to the final UI. Phase ordering: POLISH
  fixes → audit → remediation → acceptance runs last (acceptance
  validates the final audited state).
- **D21-10: Remediation policy — fix blocker/major findings in-phase**
  (the same bar as ACPT-08's no-blocker/major policy); minor/cosmetic
  findings are recorded in `deferred-items.md` with severity. The
  milestone still closes honestly with logged minors.

### WebKit Blob→IndexedDB residual (ACPT-07 webkit arm)

- **D21-11: Keep the D20-15 Blob shape and the 5 documented Playwright
  skips — NO Uint8Array migration.** ACPT-07's webkit arm runs with the
  image-save cells engine-skipped exactly as Phase 20 documented them
  (chromium + firefox prove every affected flow); the boundary is
  recorded as reduced-gate honesty (v1.0 A4 precedent).
- **D21-12: A ONE-TIME real-Safari image-flow verification** (save →
  reopen offline → export → import with images) closes the production
  question. It **folds into the ACPT-08 VoiceOver+Safari session**
  (already in Safari) plus one sighted pass — one hardware session,
  evidence recorded in the protocol results.
- The Uint8Array row-shape alternative stays recorded with its revisit
  trigger (real-world Safari image defects); it is not paid this phase.

### Acceptance mechanics (ACPT-07, ACPT-08)

- **D21-13: ACPT-07 closes via ONE INTEGRATED SPINE SPEC** — a single
  continuous end-to-end journey (seed → organize via views/filters → add
  content → edit metadata → navigate by TOC → create a cross-block
  highlight → review it → export with images → wipe → import → verify
  byte-equal restoration) run across chromium/firefox/webkit. Mirrors
  the ACPT-06 consolidated core-flow-spine precedent; "without loss" is
  asserted as one unbroken journey. Webkit's image-save cells ride
  D21-11's documented skips.
- **D21-14: ACCEPTANCE-PROTOCOL v1.2 → v1.3 grows by CAPABILITY FLOWS**
  — scripted flows covering each v2.1 capability once (library
  views/filters, Add dialog — retiring the Phase-16 deferral, metadata
  edit, TOC navigation, cross-block highlight + review, images) on top
  of the existing reader/settings flows; exploratory charters kept.
  Roughly 8-10 scripted flows per SR engine — covers ACPT-08's flow
  list without exploding protocol length.
- **Flip policy (carried forward, not re-decided):** ACPT-08 flips only
  when the human NVDA+Firefox AND VoiceOver+Safari runs land zero
  blocker/major on protocol v1.3, with the fix-then-re-run loop
  (D13-06/D13-07). Automated matrix parts (keyboard, reduced-motion,
  forced-colors, reflow, zoom) extend the existing D6-09 edge-invariant
  spec machinery across the four destinations.

### Known-debt closure

- **D21-15: The 3 pre-existing `src/portability/zipSlip.ts` lint errors
  (Phase 9) are FIXED this phase** (scoped disable-with-justification or
  equivalent) so the milestone closes with `npm run lint` green
  alongside the honest test gate.

### the agent's Discretion

- **Slider internals** — exact lower step values, the 72→64 clamp
  mechanism (read-time normalize vs load-time map), which pinned e2e
  cells legitimately update (strengthen-only for untouched specs).
- **Tag-menu anchoring mechanics** — CSS anchor positioning vs JS
  reposition on resize/scroll, viewport-keep strategy, narrow-width
  behavior; researcher verifies cross-engine support and picks.
- **Highlights deviation diagnosis** — which .review-* rules actually
  deviate from shared tokens; the visible row-affordance glyph choice
  (existing inline-SVG anatomy).
- **Audit mechanics** — how the impeccable-skill audit is executed and
  its findings mapped to blocker/major/minor severity; the findings
  report format.
- **Spine spec composition** — which fixtures/ingested content carry the
  journey (figure-heavy regenerated fixture has local assets), seeding
  strategy, byte-equality assertions (09-06 two-context machinery
  precedent), which webkit cells carry documented skips.
- **Protocol v1.3 authoring** — exact flow wording, expected outcomes as
  role + accessible name + state (Pitfall 7 discipline), results sheets.
- **Safari verification recording** — where the sighted-pass evidence
  lands (protocol results vs 21-VERIFICATION.md).
- **Phase gate shape** — honest full-suite invocation records (workers
  contention control precedent), lint gate wiring.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 21 goal + 5 success criteria (tag menu
  adjacency/truthful width/Highlights grid/no-loss core flow/no-blocker
  matrix). `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — POLISH-08..11, ACPT-07, ACPT-08 (§v2.1
  Requirements L66-74); traceability table rows (Phase 21, all Pending).
- `.planning/PROJECT.md` — v2.1 milestone framing ("Impeccable-informed
  interface refinement pass"); Constraints (a11y foundational; honesty;
  performance budget); Key Decisions table.

### Prior-phase contracts this phase extends
- `.planning/phases/20-safe-local-image-fidelity/deferred-items.md` —
  the WebKit Blob→IndexedDB boundary evidence, the 5 documented skips,
  and the un-paid Uint8Array Rule-4 option D21-11/D21-12 resolve.
- `.planning/phases/20-safe-local-image-fidelity/20-VERIFICATION.md` —
  IMG closure ledger + documented residuals this phase inherits.
- `.planning/phases/18-reader-orientation/18-CONTEXT.md` — popover
  interaction patterns (popover=manual TocPanel vs popover=auto tag
  popover), Esc-close + focus-restore universal escape, engine
  focus-divergence honesty.
- `.planning/phases/15-application-shell-and-destinations/15-CONTEXT.md`
  — shell nav/brand/destination grammar; POLISH-07 token-audit
  discipline D21-07 reuses; deferred-items.md (zipSlip lint debt).
- `.planning/phases/16-organized-library-and-focused-add-flow/16-CONTEXT.md`
  — AddDialog discipline; the manual-SR deferral ACPT-08 retires.
- v2.0 contracts via `.planning/STATE.md` decision index — ACPT-06
  consolidated core-flow-spine precedent (06-02), D6-09 edge-invariant
  helper, ACPT-05 protocol/flip discipline (D13-06/D13-07, v1.2), 09-06
  two-context export/import round-trip machinery.

### The acceptance instrument
- `docs/ACCEPTANCE-PROTOCOL.md` — the durable, re-runnable manual SR +
  keyboard protocol (v1.2 today; D21-14 grows it to v1.3). Read in full
  before authoring v1.3 flows or results sheets.

### Source code contracts (READ before implementing)
- `src/settings/tokens.ts` — `MEASURE_STEPS = [52, 58, 64, 72]` (L32)
  D21-01/D21-02 evolve; `SIZE_STEPS` sibling discipline.
- `src/settings/applyTheme.ts` — `--measure` write (L38) + the
  typography cascade contract (never bare-property writes).
- `src/reader/SettingsPanel.tsx` — the measure slider (L457-476: min/
  max/step/aria from MEASURE_STEPS) D21-04 keeps the readout shape of.
- `src/app.css` — `--measure: 64ch` (L40), `.article-body`
  `max-width: var(--measure)` (L263), `.article-body.paginated-surface`
  `width: var(--measure)` (L1100); `.tag-popover` fixed-position block
  (L1943-1963) D21-05 re-anchors; `.review-*` block (L3036+) D21-06/
  D21-07 extend; `.header-controls` geometry.
- `src/routes/ArticleView.tsx` — tag-popover mount (L2615-2626) wrapping
  byte-unchanged TagEntry; `tagsOpen` sync effect (L385-400).
- `src/App.tsx` — lifted `tagsOpen` state (L201-206); Header trigger
  wiring (L350-351, L383-384).
- `src/reader/TagEntry.tsx` — the wrapped tag-editing surface (stays
  byte-unchanged in spirit; only its anchor moves).
- `src/reader/TocPanel.tsx` — popover=manual reference pattern.
- `src/routes/review/ReviewView.tsx` — row jump button (D10-03 whole-row
  pattern L246) D21-06 extends with the visible affordance; section/
  filter/legend anatomy.
- `src/portability/zipSlip.ts` — L34/L76/L77 the 3 pre-existing lint
  errors D21-15 closes.
- `src/persistence/db.ts` + `src/persistence/assetsStore.ts` — D20-15
  Blob row shape (LOCKED, un-migrated per D21-11).
- `tests/e2e/` — existing edge specs (D6-09 `assertEdgeInvariant`
  helper in `tests/e2e/_edge-invariant.ts`), core-flow-spine precedent
  (`tests/e2e/core-flow-spine.spec.ts` if present — researcher
  confirms), library/review/pagination specs the spine joins; the 5
  documented webkit skip sites stay byte-stable.
- `tests/e2e/annotations/_fixtures.ts`, `tests/e2e/_library-helpers`
  (researcher confirms names) — seeding machinery the spine reuses.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **D6-09 `assertEdgeInvariant` helper** — the shared keyboard/overflow
  invariant for edge specs; ACPT-08's automated matrix parts extend the
  existing forced-colors/reduced-motion/reflow/high-zoom/touch-target
  specs rather than forking.
- **ACPT-06 core-flow-spine precedent (06-02)** — consolidated
  end-to-end spec shape, one representative typography, annotations
  fixtures harness reuse; D21-13's spine is its v2.1 twin.
- **09-06 two-context export/import machinery** — isolated
  browser-context A/B surrogate + offset byte-equality at raw IndexedDB
  row level; the spine's export→wipe→import→verify arm reuses it.
- **Popover patterns** — popover=auto (tag popover), popover=manual
  (TocPanel), native dialog (settings/annotations) — three shipped
  interaction contracts; POLISH-08 fixes anchoring within the existing
  auto contract.
- **POLISH-07 audit method** — four-surface token-coherence pass with
  citation-commented intentional differences; D21-07's conformance work
  and D21-08's audit reuse the vocabulary.
- **ACCEPTANCE-PROTOCOL.md v1.2** — scripted flows as role+name+state
  outcomes, exploratory charters, zero-blocker policy, results sheets —
  v1.3 grows within this structure.

### Established Patterns
- Honest gates: run the full suite, record every invocation, never
  silently green; documented engine skips carry probe-verified root
  causes (WebKit Blob boundary).
- Fix-major/log-minor remediation mirrors ACPT-08's no-blocker/major
  bar and the deferred-items discipline.
- One derivation point per truth; shared tokens with cited intentional
  differences; strengthen-only test discipline.
- Requirements flip at proof, not at instrument-ship (ACPT-05/06
  precedents; ACPT-08 flips on the human zero-blocker runs).

### Integration Points
- `src/settings/tokens.ts` + `applyTheme.ts` — MEASURE_STEPS evolution
  + 72-clamp.
- `.tag-popover` CSS + ArticleView popover mount — anchor correction.
- `ReviewView.tsx` rows + `.review-*` CSS — visible affordance + token
  conformance.
- `docs/ACCEPTANCE-PROTOCOL.md` — v1.3 authoring + results recording.
- `tests/e2e/` — new spine spec + edge-spec extensions; webkit skip
  sites unchanged.
- `src/portability/zipSlip.ts` — scoped lint justification.

</code_context>

<specifics>
## Specific Ideas

- **"The far-right endpoint never lies"** — 64 means 64: shown value,
  aria-valuemax, and the rendered column all agree, in both modes
  (D21-01/D21-04).
- **"The menu hugs its trigger"** — adjacency, viewport-keeping,
  geometry-following, focus-restore; behavior locked, tech free
  (D21-05).
- **"One unbroken journey"** — the v2.1 story is proven as a single
  no-loss spine, not a pile of segment proofs (D21-13).
- **"Audit the final state, then prove it"** — fixes → audit →
  remediation → acceptance, in that order (D21-09).
- **"Real Safari answers the real question"** — the Playwright-WebKit
  boundary is documented; production truth comes from one honest Safari
  session folded into the VO run (D21-12).

</specifics>

<deferred>
## Deferred Ideas

- **Uint8Array asset-row migration** — un-paid (D21-11); revisit trigger
  = any real-Safari image defect or a Playwright-WebKit fix. Stays
  recorded in Phase 20 deferred-items.md.
- **Animated-AVIF animation-gate residual** — accepted per Phase 20 A4;
  not reopened here.
- **Literal shared grid for Highlights rows** — rejected (D21-07);
  revisit only if token conformance proves insufficient visually.
- **Section-heading links into article context on Highlights** —
  rejected this phase (D21-06 chose row affordance); backlog candidate
  if section-level entry proves wanted.

</deferred>

---

*Phase: 21-integrated-refinement-and-acceptance*
*Context gathered: 2026-08-31*
