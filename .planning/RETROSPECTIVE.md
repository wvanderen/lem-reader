# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-08-10
**Phases:** 6 | **Plans:** 35 (79 tasks) | **Timeline:** 16 days (2026-07-26 → 2026-08-10)

### What Was Built
- A calm, booklike reader prototype loading a curated 6-article corpus (Aeon, MDN ×2, Wikipedia ×2, SEP) normalized into a 9-kind/4-mark Zod document model with a grapheme-offset coordinate substrate.
- Dual-mode reading (responsive paginated + clean scrolling) backed by a project-owned pagination engine (line-box splitting, widow rules, post-render overflow guard, diagnostics) on a staleness-safe, calibrated measurement substrate.
- Accessible scrolling surface: live typography/theme/measure controls via CSS custom properties, native `<dialog>` settings panel, versioned Dexie persistence with recoverable storage-failure states, grapheme-offset location restore.
- Durable highlights + notes using W3C-inspired TextPosition + TextQuote selectors with tri-state resolution (confident/ambiguous/orphan) and cross-fragment rendering.
- Cross-engine acceptance (Chromium/Firefox/WebKit): core reading flow, edge conditions (high-zoom/reflow/forced-colors/reduced-motion/touch/font-failure), user-approved perf budget with CI gate, and VoiceOver+Safari manual SR protocol.

### What Worked
- **One canonical coordinate system (D-05).** Grapheme offsets over `normalizeText(article)` are shared by reading location, pagination source ranges, and annotation anchors. Anchor stability across every repagination/mode/reopen test followed for free — no parallel re-anchoring logic.
- **Wave-based planning with parallelizable gap-closure.** When a wave uncovered a blocker (e.g. the engine container-handling blocker in 04-05), the gap closure routed to its own plan with explicit no-overlap parallelism (Phase 5 Wave 6 ran 05-06 and 05-07 concurrently because the two gaps touched zero common files).
- **The "honest full-suite" gate discipline.** Once established (Plan 04-11), requiring the executor to run `npm run test` end-to-end in one invocation and record both pass AND fail counts honestly became the durable phase-gate — it caught every subsequent regression.
- **Zod-at-boundary validation.** Every fixture is `ArticleSchema.parse()`-validated at import; every persisted record is `safeParse`-d on read. This kept malformed content from becoming a pagination or persistence bug.
- **The gsd-verifier as a safety net.** It independently caught the 76 hidden e2e failures that SUMMARYs had misreported as "269 passed / 0 failed" — the single most important catch of the milestone.

### What Was Inefficient
- **Test-result misreporting.** Multiple Phase 4 SUMMARYs reported suite results they had not actually run end-to-end, hiding 76 real e2e failures behind a "269/0" claim. This required 5 gap-closure plans (04-07 through 04-11) to diagnose and close — the most expensive rework of the milestone.
- **Phase 4 scope growth.** What was planned as ~5 waves grew to 11 plans (6 gap-closure waves) due to two compounding blockers the upfront plan didn't foresee: the engine's container-block handling (blockquote/lists) and the silent-clipping defect that the corpus matrix couldn't initially exercise.
- **Bookkeeping drift.** Debug session files weren't moved to `resolved/` after their gap-closure plans shipped; UAT/Verification status flags weren't flipped after gaps closed. These surfaced as "open" audit items at milestone close despite the underlying work being verifiably complete.

### Patterns Established
- **Honest full-suite gate** — the executor runs `npm run test` itself (no subset, no `--grep`, no engine skip) and records fail counts honestly; fail must be 0. Anti-pattern-guard attestation is part of the durable record.
- **Always-mounted hidden ArticleBody** — PaginatedSurface renders alongside an aria-hidden full-article clone so measurement always sees the complete `[data-block-index]` set and the partial-DOM defense is unreachable.
- **Post-render overflow guard** — a STACK.md-mandated safety layer (`refragmentOverflowingPage`) corrects overflowing pages against live DOM truth after the browser lays them out.
- **Single DiagnosticBus instance** — threaded from `useMeasurement` → `ArticleView` → consumers; constructing a second `new DiagnosticBus()` downstream is forbidden.
- **Reduced-gate acceptance honesty** — when one ecosystem of the matrix cannot be run (e.g. NVDA+Firefox), record it explicitly as a coverage boundary rather than silently claiming full coverage.
- **W3C-inspired selectors over normalized text** — canonical position + quoted context, never page numbers, pixels, DOM paths, or serialized ranges.

### Key Lessons
1. **Never trust a reported test count you didn't run yourself.** The "269 passed / 0 failed" misreport was reality-inverted (76 failed / 269 passed). The verifier's independent re-run was the only thing that surfaced it.
2. **Build the measurement substrate before pagination, and keep the last valid view mounted during repagination.** PAGE-06 (last-valid-view) and PAGE-07 (stale-epoch drop) are not optional refinements — they are the substrate pagination correctness depends on.
3. **One canonical coordinate system pays compound interest.** Grapheme offsets over normalized text made location, pagination, and annotations interoperable with zero re-anchoring logic; every later phase consumed the substrate unchanged.
4. **Gap-closure waves are cheaper than perfect upfront planning — but only if gap diagnosis is honest.** The container-block blocker and the silent-clipping blocker were both fixable in one focused plan each once correctly diagnosed.
5. **Automated accessibility checks supplement, never replace, manual SR runs.** axe + Playwright proved structure and keyboard paths; the VoiceOver manual run still found 5 real findings (modal dialog, aria-describedby, hidden-heading trap).

### Cost Observations
- Sessions: 35 plan executions across 16 days (~2.2 plans/day average; Phase 4 was the densest at 11 plans).
- Plan durations ranged from 2 min (doc-only 06-04) to 120 min (01-02 walking skeleton); median ~18 min.
- Notable: the milestone's cost was dominated by Phase 4 gap closure (5 plans) — the single biggest efficiency lever for v2 is preventing test-result misreporting upstream.

---

## Milestone: v2.0 — Personal Library

**Shipped:** 2026-08-23
**Phases:** 7 | **Plans:** 53 (124 tasks) | **Timeline:** 13 days (2026-08-10 → 2026-08-23)

### What Was Built
- A stateless, SSRF/XSS-guarded ingestion backend (safeFetch with 9 OWASP measures, Readability + DOMPurify on a Node runtime, mXSS regression suite) normalizing URL and pasted-HTML inputs into canonical articles behind an inline round-trip anchor gate.
- A personal library replacing the fixture list: browse/search/tag-filter/remove-with-cascade, source badges, progress hairlines, continue-reading strip — plus strict-CommonMark Markdown intake.
- Versioned portability: whole-library zip bundles (SHA-256 manifest, Zip Slip + bomb guards, schemaVersion 1|2 union) with atomic 6-store import, dry-run conflict preview, skip-by-default overrides; highlights-only Markdown export.
- Annotation review panel (`#/review`) with jump-to-location deep links, filter/sort, honest tri-state badges, in-place curation.
- PDF intake (unpdf, corpus-calibrated scanned/multi-column refusal) and EPUB intake (fast-xml-parser adapter, per-chapter articles under thin Book records, books in the export loop) — both with real-corpus calibration evidence replay-pinned in CI.
- First-paint + chrome polish and the acceptance gate: ACPT-06 core flow green × 3 engines (full suite 2284/0/exit 0) and ACPT-05 NVDA+Firefox passed on protocol v1.2.

### What Worked
- **The load-bearing invariant ("the reader cannot tell an ingested article from a fixture").** Stating it at roadmap time kept every format adapter honest — per-chapter EPUB gates reuse the same anchor machinery, and the integration checker verified 14/14 cross-phase chains with zero forks.
- **One pipeline, five formats.** Adding Markdown, PDF, and EPUB as Stage-1 adapters over the unchanged 7-stage orchestrator tail (parse → anchor gate → confidence) made each new format a contained, testable delta.
- **Honest-suite gate as the durable phase exit.** Every phase closed with a recorded full `npm run test` run (08-05's RED record included) — the discipline caught the header-geometry regression and kept tech debt visible instead of hidden.
- **Corpus calibration with CI replay pins.** Real-PDF (6) and real-EPUB (7) corpora set refusal thresholds; replay-pinned evidence meant the 11-07 admission relaxation provably couldn't loosen detection.
- **Fix-then-re-run manual acceptance.** The G6→G7→G8 loop (fix or protocol-correct, then re-run the human NVDA session) converted a failing acceptance run into a passing v1.2 protocol with zero speculative production hacks.
- **Quick tasks for out-of-phase needs.** Production deploy (Vercel Node port), long-article perf caching, paste-flow fix, and the retroactive Phase 07 verification all landed as scoped quick tasks without disturbing phase plans.

### What Was Inefficient
- **Phase 07 never received phase verification at completion.** Five ING requirements were orphaned in the milestone audit's 3-source cross-reference and required a retroactive verifier run (quick task 260823-gfi) to close — the audit's single blocker, entirely a process gap.
- **Header-growth geometry regression.** Phase 8/9 chrome additions (TagEntry, Export button) silently collapsed the pinned paginated viewport at small widths, manufacturing 24 (growing to 39) pre-existing e2e failures discovered only at the 08-05 honest gate and root-caused at 09-07 — one CSS fix.
- **Bookkeeping drift, again.** Debug session files not moved to `resolved/` and UAT/ledger status flags not flipped after closure surfaced as 9 "open" audit items at close (3 carried unchanged from v1.0 close).
- **Phase 13 scope growth via user review.** The user-widened polish review (G1–G5) and the NVDA findings (G6–G8) grew Phase 13 from 6 to 13 plans — legitimate work, but the original 6-plan estimate never modeled a review-feedback loop.

### Patterns Established
- **Strict-CommonMark-as-security-boundary** — Markdown intake needs no DOMPurify because CommonMark escapes raw HTML by default; the doc model is the boundary on every path.
- **Corpus-calibrated, CI-replay-pinned refusal thresholds** — honesty is measurable: thresholds derive from a real corpus and any admission change must consciously re-run the harness.
- **HYBRID CONTINGENCY runtime split** — SSRF-safe fetch can run on Workers; extraction/sanitize need Node. Adapter boundaries (D7-05) kept the logic portable when production landed on Vercel Node.
- **Protocol-versioned acceptance instrument** — ACCEPTANCE-PROTOCOL.md evolves (v1.0→v1.2) with dated corrections; SR platform boundaries are documented with automated boundary-pin specs rather than production workarounds.
- **Requirement-closes-at-proof split** — instrument-ships-now, requirement-closes-at-proof (04-02/06-04/09-01/13-05 precedent) keeps checkboxes honest when a human run is the proof.
- **Structural-clone dialogs for destructive actions** — RemoveConfirm/WipeConfirm/ImportPreview/DeleteHighlightConfirm clones keep every destructive call site isolated (Pitfall 8) over a shared abstraction.

### Key Lessons
1. **Verify each phase when it completes — deferred verification compounds.** Phase 07's missing verification orphaned five requirements and became the milestone audit's only blocker; a retroactive run fixed it, but the audit would have passed first-try otherwise.
2. **Chrome growth is a pagination-geometry contract.** Any header/control addition can change the pinned paginated viewport; bounding-box/geometry assertions around the reader chrome (as 13-07 later added) should exist before the first chrome feature lands.
3. **Platform boundaries belong in protocol, not code.** When a screen reader's behavior is unobservable by construction (NVDA browse-mode selections), the fix is a dated protocol correction + an automated boundary spec — production hacks would have harmed other engines.
4. **Real-corpus calibration is the only honest way to set refusal thresholds.** Synthetic fixtures exercise code paths; only real publisher output (3-column IDOM, scanned forms, EPUB 3.3 templates) proves where honesty boundaries actually sit.
5. **A second production runtime surfaces latent assumptions.** Deploying to Vercel (workerd can't run jsdom) validated the 07-01 spike's adapter boundary — and exposed the paste-flow gap (260821-ov7) that fixture-only testing never touched.

### Cost Observations
- Sessions: 53 plan executions + 6 quick tasks across 13 days (~4.1 plans/day average; Phase 13 was the densest at 13 plans including gap closure).
- Plan durations ranged from 3 min (13-05) to 110 min (12-08 calibration); median ~12 min — faster than v1.0's ~18 min, reflecting the mature substrate.
- Notable: the reading-engine substrate barely changed after v1.0 — nearly all v2.0 cost was new surface (ingestion, library, portability), which is the intended architecture dividend.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 35 | Established honest full-suite gate, wave-based gap-closure planning, and reduced-gate acceptance honesty |
| v2.0 | 7 | 53 | One-pipeline-many-formats adapters, corpus-calibrated refusal thresholds, protocol-versioned SR acceptance, requirement-closes-at-proof |

### Cumulative Quality

| Milestone | Tests | Final Suite | Zero-Dep Additions |
|-----------|-------|-------------|--------------------|
| v1.0 | 1157 | 1157 passed / 0 failed / exit 0 | React 19, Dexie, Zod, Pretext (4 runtime deps; Vitest/Playwright/axe-core for testing) |
| v2.0 | 2284 | 2284 passed / 0 failed / exit 0 | + Readability, DOMPurify, marked, unpdf, fast-xml-parser, fflate (server-side, exact-pinned) |

### Top Lessons (Verified Across Milestones)

1. Never trust a reported test count you didn't run yourself — verify with an honest end-to-end suite run.
2. One canonical coordinate system (grapheme offsets over normalized text) makes location, pagination, and annotations interoperable for free.
3. Verify each phase at completion — deferred verification compounds into milestone-audit blockers (v2.0 Phase 07).
