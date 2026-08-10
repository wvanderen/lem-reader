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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 35 | Established honest full-suite gate, wave-based gap-closure planning, and reduced-gate acceptance honesty |

### Cumulative Quality

| Milestone | Tests | Final Suite | Zero-Dep Additions |
|-----------|-------|-------------|--------------------|
| v1.0 | 1157 | 1157 passed / 0 failed / exit 0 | React 19, Dexie, Zod, Pretext (4 runtime deps; Vitest/Playwright/axe-core for testing) |

### Top Lessons (Verified Across Milestones)

1. Never trust a reported test count you didn't run yourself — verify with an honest end-to-end suite run.
2. One canonical coordinate system (grapheme offsets over normalized text) makes location, pagination, and annotations interoperable for free.
