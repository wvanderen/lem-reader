# Reading experience recovery

Status: implementation approved and completed locally on `fix/reading-experience-recovery`, based on `origin/main` at `c1a1f014`. Targeted Linux Chromium/Firefox and container WebKit verification is green; reference-Mac CI and reported macOS Zen/Helium acceptance remain pending. See [the investigation and implementation evidence](../verification/2026-11-12-reading-experience-investigation.md).

## Report

Following Collections and Chapters, the reader reports slow/choppy page turns and missing page numbers in places that previously showed them. The supplied ToC screenshot shows repeated Mark finished / Mark unfinished actions crowding chapter navigation. The investigation subsequently reproduced the periodic turn delay on Linux Firefox/Chromium and demonstrated a 400 ms navigation-scope measurement debounce as a cause. Percentage-only orientation was also reproduced on locally available `origin/main`; see the evidence report for revision and platform limits.

## Confirmed decisions

- Treat this as regression recovery, not a broad Collections/Chapters redesign.
- Prioritize smooth page turns, then missing page numbers; include removal of completion-changing buttons from the ToC.
- Preserve useful organization features. Consider architectural changes only when evidence demonstrates they are necessary.
- The ToC primarily answers “Where am I, and where can I go?” It is not a completion checklist.
- Restrained current-location and finished indicators may remain where they aid orientation.
- Remove repeated Mark finished / Mark unfinished actions from the ToC. This does not delete saved completion information.
- Keep manual finished/unfinished correction in a secondary Reading status dialog reached through the existing library reading-state action for chaptered works, including readings outside collections, without resetting saved position. This placement and its change from direct toggle to dialog were explicitly approved. Do not add another always-visible reader control. Non-chaptered readings retain their direct library toggle.
- Short readings that can reasonably be laid out in full retain ordinary Page X of Y numbering. Genuinely long works may use clearly labeled local numbering plus overall progress, without expensive whole-work layout merely to obtain a total.
- Explicitly evaluate whether long-work subdivisions or bounded layout are applied too aggressively, including whether the supplied article should retain continuous, fully numbered reading. Chapter navigation need not dictate pagination strategy. Keep bounded layout where measurements justify it; neither a rewrite nor a higher cap is predetermined.
- Acceptance requires responsive, visually stable repeated turns, including internal layout-boundary crossings—not merely correct destination text or passing layout budgets. Measure turn latency and frame stalls separately from initial layout.
- Use the supplied article plus a short control reading and compare with a verified pre-regression revision where feasible. Check Firefox and Chromium; Linux evidence alone does not establish recovery on macOS/Zen. Existing approved CI budgets remain unchanged.

## Existing contracts and evidence

- Collections reference readings or chapters; they do not create independent progress. See `../../GLOSSARY.md` and `../adr/0011-reading-identity-and-collection-ownership.md`.
- Existing long-work design allows local page counts alongside overall positional progress, without requiring whole-work layout. See `collections-and-long-works.md` and `long-work-implementation-plan.md`.
- Explicit finished/unfinished correction without resetting saved position is an existing product requirement; ToC placement is an implementation choice.
- Existing performance budgets cover measurement/reflow, not directly page-turn latency or frame smoothness. Passing them alone cannot establish that this report is fixed.

## Supplied acceptance case

The reader supplied a library export containing **[Classics] Ludwig Feuerbach and the End of Classical German Philosophy** as the actual affected article.

- Article ID: `u-71e6da1d66f8`; revision 1; 125 canonical blocks; persisted structure present.
- Source: <https://marxist.com/classics-ludwig-feuerbach-and-the-end-of-classical-german-philosophy/all-pages.htm>.
- The full export remains an external user attachment, not a committed fixture. Avoid copying unrelated library content, annotations, or preferences into the repository.
- Reported affected environment: macOS, Zen (Firefox-based) and Helium (Chromium-based). The reader reports worse choppiness in Zen, but both are affected. Exact versions and hardware have not been established.
- Reported numbering symptom: page numbers were replaced by a percentage. The reader accepts percentages in some cases but misses the page numbers previously available for this article. This is not currently a report of transiently disappearing digits.
- Historical reader observation: articles exceeding 200 internal pages previously worked without issue before the cap was reached. This is useful baseline evidence to investigate, not a measured universal threshold or a new approved cap.
- Agent-run reproduction now exists for the supplied content on Linux Playwright Firefox/Chromium, including a reduced two-window case. It is not yet Mac/Zen/Helium validation.

## Implemented recovery

- A freshly mounted measurement scope requests immediate measurement through `TriggerCoalescer.measureScopeNow()`. Geometry/settings bursts retain the 400 ms debounce; font readiness, epochs/cancellation, stale-result rejection, last-valid-view retention and overflow correction stay with the existing engine/surface.
- Whole-layout admission has an independent 256,000-grapheme aggregate budget, including notes, alongside the existing 2,048-row guard. It no longer derives admission from continuation tile size. The 300-page ceiling, capacity refinement, canonical coverage check and assignment boundaries are unchanged. The source budget is not a promised page-count or universal performance threshold.
- The ToC keeps navigation and restrained finished status, but has no completion-changing controls. The library Reading status dialog corrects whole-reading and chapter records through existing shared persistence and button pending/error behavior. It supports uncollected works and never writes the saved passage position.
- Changes live in an isolated worktree based on `c1a1f014`; unrelated original-checkout edits and private user content were not incorporated.

## Remaining verification

- Validate repeated turns and perceived smoothness on the reported Mac in Zen and Helium. Linux browser runs do not establish compositor-presented smoothness or Mac recovery; occasional sampled frame gaps remain visible in the evidence report.
- Run the authoritative reference-Mac PR functional/performance gates and broader corpus acceptance. Local calibration/performance harness results are not reference-Mac budget acceptance.
- Keep CI routing, isolation, reference budgets and the 300-page cap unchanged. The private diagnostic's 150 ms stall detector is not an approved CI budget.

## Authorized investigation brief (completed)

1. Privately isolate the affected article and necessary reading configuration from the supplied export; do not commit unrelated library data. Select a short control reading.
2. Build and run a targeted, red-capable reproduction for repeated page turns and the percentage-only indicator. Record the actual surface, configuration, and workload; measure input-to-visible-turn latency and frame stalls, distinguishing ordinary turns from layout-window crossings and chapter handoffs. If the symptom cannot be reproduced, report that limitation rather than infer a cause from code alone.
3. Establish a verified historical comparison where feasible using the same content and comparable settings. Historical commits are candidates, not presumed good baselines.
4. Only after reproduction, test competing explanations and evaluate full-layout versus bounded-layout policy. Report evidence, proposed changes, trade-offs, and concrete acceptance criteria before implementing product changes. Do not silently alter reference budgets, CI routing, or runner isolation.
5. In the proposed recovery, include ToC action removal, an appropriate secondary correction surface, and restored honest page orientation. Preserve canonical positions, annotations, saved completion information, keyboard access, reduced motion, and both reading modes.
6. Verify Firefox and Chromium paths and explicitly distinguish Linux investigation evidence from Mac/Zen validation. Any unavailable target or unresolved symptom must remain visible in the report.

No new domain term or architectural ADR was needed. The implementation changes scheduling, admission policy and correction placement without replacing the canonical location, pagination, or shared completion models.
