---
phase: 19-cross-block-highlights
verified: 2026-08-31T00:25:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 19: Cross-Block Highlights Verification Report

**Phase Goal:** Readers capture and manage a single honest annotation across multiple supported semantic blocks.
**Verified:** 2026-08-31T00:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reader can create one highlight from a native selection spanning eligible mounted blocks (SC1/ANNO-08) | ✓ VERIFIED | `captureSelection` (capture.ts L476-538) composes ONE global TextPositionSelector from two per-endpoint resolutions (`resolveSelectionEndpoint` L347-438) — no intermediate-block walk, no `multi-block` gate (grep: zero `"multi-block"` matches in src/). Unit cells: span composition, backwards Range, both-slice endpoints, caption offsets, refusals — **24/24 passed in verifier's own run** (`npx vitest run capture-offset-mapping.test.ts excerpt.test.ts`). E2e: span-capture.spec.ts (scrolling L89, paginated-within-page L133, overlap L187) + matrix kind/crossing cells; full gate 1581 e2e passed / 0 failed at this exact HEAD (1cc62c6) |
| 2 | Renders across blocks but behaves as one identity, one global grapheme range, one optional note (SC2/ANNO-09) | ✓ VERIFIED | One record: `countHighlightsInDexie === 1` asserted in span cells. One identity: `HighlightSlice.isFirst` slicer assignment (highlightRanges.ts L181), InlineRenderer stamps `id` only when `slice.isFirst === true` (L144) with `data-highlight-id` on every slice; paginated per-page first-occurrence pass (`seenHighlightIds` Set fragmentRenderer.tsx L123 + `claimSlices/claimItemSlices/claimCodeSegments` L332-346). Unit cells assert exactly ONE `id="hl-…"` per multi-slice highlight (list-highlight-render.test.tsx L152, L230, L495); e2e `[id="hl-…"]` toHaveCount(1) per mounted page (cross-fragment-render L334/400/463). Note 1:1: note-create-edit span cell (L148). Rendering across every readable kind: BlockRenderer `computeListItemSlices` (L446, recursion L480), caption offset, code segments; matrix covers all 8 kinds |
| 3 | Stays attached through repagination, mode/typography changes, reopening, review navigation, export/import (SC3/ANNO-10) | ✓ VERIFIED | survive-relayout.spec.ts L117: typography 18→24 + mode switch → `markTextsForHighlight` extents byte-equal + one `#hl-` id (verifier read assertion bodies L158-185). cross-fragment-render cell (a) L273: typography-triggered repagination, count===1 per mounted page. persist-reload L127: reload restores at same text. span-capture L225: review-jump focuses first slice. round-trip: multi-line `quote.exact` with BLOCK_SEPARATOR byte-equal + confident re-anchor (no `.unresolved`). All green in the full-suite gate at HEAD (chromium/firefox/webkit) |
| 4 | Review, edit, export, delete atomically without leftover fragments or guessed attachment (SC4/ANNO-11) | ✓ VERIFIED | Review: `firstFragmentExcerpt` adopted at all surfaces (ReviewView L168/169/545, Drawer L190/191, NotePopover L93; zero raw `quote.exact` → visible-text paths outside the helper). D19-11 no-badge + single-U+2026 cell (matrix L762). Edit: note-edit span cell reaches ONE record, extents unchanged. Export: markdown.ts `blockLines` (L176-179) splits on BLOCK_SEPARATOR, `escapeMarkdownLine` PER LINE, marker first-line-only, never truncates; unit cells L263/276/298/315/326. Delete: delete-confirm L123 — zero marks BOTH modes + note cascade. Long-span honesty: resolve-quote-selector L239+ (whole-article confident / mid-span-edit orphan / multi-line confident) |
| 5 | Unsupported boundaries rejected or narrowed with explicit explanation from the supported-content matrix (SC5/ANNO-12) | ✓ VERIFIED | `boundary-ineligible` reason on ineligible endpoint (capture.ts L376-380), refusal whole with NO position (D19-05 reject-whole; requirement wording is "rejected **or** narrowed" — rejection satisfies it). Verbatim hint `This selection includes content that can't be highlighted.` (SelectionToolbar L252; retired copy gone from src/). TESTED matrix: eligibility-matrix.spec.ts — 8 endpoint kinds, 4 crossings, 4 interior-gap cells, 3 refusal classes (boundary-ineligible verbatim + no-record asserted L569-612; footnote-body ineligible; overlap), D19-14 marker exclusion, backwards drag, D19-11. 63 cells green × 3 engines in gate |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

Behavioral evidence basis: every SC is behavior-dependent; each has passing behavioral tests at this exact code state — verifier's own unit run (24/24) plus the honest full-suite gate run by the 19-05 executor at HEAD 1cc62c6 (unit 1416 passed / 0 failed / 13 documented skips; e2e 1581 passed / 10 skipped / 0 failed, chromium/firefox/webkit, fresh dev server, no filtering — 19-05-SUMMARY permanent record) and corroborated by the orchestrator's post-merge build + unit gates (exit 0) at the same clean tree.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/annotations/capture.ts` | Endpoint-composed span capture; boundary-ineligible + empty-span reasons; captionLocalStart | ✓ VERIFIED | 538 lines; per-endpoint resolver, reason-only refusals, caption alignment L392-396; substantive, wired (HighlightOverlay imports) |
| `src/annotations/excerpt.ts` | Pure firstFragmentExcerpt | ✓ VERIFIED | 55 lines, no React/DOM; 3 distinguishable honesty cases; adopted at 6 call sites |
| `src/annotations/highlightRanges.ts` | `HighlightSlice.isFirst` + `sliceCodeForHighlights` | ✓ VERIFIED | L74/L181 (isFirst), L203-279 (CodeSegment + segmentation); consumed by InlineRenderer/BlockRenderer/fragmentRenderer |
| `src/content/render/BlockRenderer.tsx` | List threading + caption + code mark paths | ✓ VERIFIED | `computeListItemSlices` L446 with D19-15 recursion L480; `captionHighlightSlices`/`codeSegments` props consumed L196-271 |
| `src/pagination/fragmentRenderer.tsx` | Per-page first-occurrence pass + entry-local threading | ✓ VERIFIED | `seenHighlightIds` L123; claim functions L332-346/L571-622; `computeEntryListItemSlices` L489 with recursion L531; caption/code forwarding L297-315 |
| `src/portability/markdown.ts` | Multi-line export, per-line escape | ✓ VERIFIED | `blockLines` L176-179; `escapeMarkdownLine` per fragment; marker first-line-only |
| `src/fixtures/articles/nested-list-paths.canonical.json` | 3-level list recursion fixture | ✓ VERIFIED | Registered in loader (index.ts L16) + FIXTURES (fixtures-matrix.ts L44); iterated by corpus specs in gate |
| `tests/e2e/annotations/eligibility-matrix.spec.ts` | The tested matrix | ✓ VERIFIED | 21 cells / 63 engine-runs; all kinds/gaps/refusals greppable by title; imports `_fixtures` harness |
| `tests/e2e/annotations/span-capture.spec.ts` | Span success + overlap + jump cells | ✓ VERIFIED | 4 cells incl. review-jump |
| Unit test files (5) | capture-offset-mapping, excerpt, list-highlight-render, cross-fragment-slicing, resolve-quote-selector | ✓ VERIFIED | All exist, substantive; capture+excerpt 24/24 in verifier's run; rest green in gate |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| capture.ts | HighlightOverlay.tsx | CaptureResult.reason → CreateFromSelectionResult | ✓ WIRED | Union synced (`boundary-ineligible`/`empty-span` at HighlightOverlay L89-90); overlap check `rangesOverlap(capture.position, pos)` L195 global-range |
| HighlightOverlay.tsx | SelectionToolbar.tsx | reason → hint ternary | ✓ WIRED | New branch L252; empty-span → existing empty copy; retired branch absent |
| excerpt.ts | ReviewView/Drawer/NotePopover | `firstFragmentExcerpt` | ✓ WIRED | 6 derivation sites verified by grep; zero raw-exact visible-text paths remain |
| highlightRanges.ts | InlineRenderer.tsx | `slice.isFirst` → id stamping | ✓ WIRED | L144 conditional id; data-highlight-id unconditional |
| BlockRenderer/fragmentRenderer | highlightRanges.ts | slicer consumed, not forked | ✓ WIRED | `sliceRunsForHighlights`/`sliceCodeForHighlights` consumed; no reimplementation |
| markdown.ts blockLines | escapeMarkdownLine | per-line escape | ✓ WIRED | `.map` over split fragments applies escape per line |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| ReviewView row | `excerpt` | `entry.highlight.quote.exact` (resolved Dexie records) | Yes — stored selector-derived quote | ✓ FLOWING |
| SelectionToolbar hint | capture result reason | live `captureSelection` | Yes | ✓ FLOWING |
| BlockRenderer marks | `HighlightSlice[]` | stored positions × block intersection | Yes | ✓ FLOWING |
| markdown export | `quote.exact` | stored full span | Yes — full, untruncated | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Span capture composition + refusal taxonomy + excerpt honesty | `npx vitest run tests/unit/annotations/capture-offset-mapping.test.ts tests/unit/annotations/excerpt.test.ts` | 2 files / **24 tests passed**, 0 failed (963ms) | ✓ PASS |
| Full unit suite | post-merge orchestrator gate at HEAD 1cc62c6 | 1416 passed / 0 failed / 13 documented skips, exit 0 | ✓ PASS |
| Full e2e matrix (3 engines) | 19-05 honest gate at HEAD 1cc62c6 | 1581 passed / 10 skipped / 0 failed, exit 0 | ✓ PASS |

### Probe Execution

Not applicable — phase declares no `scripts/*/tests/probe-*.sh` probes; verification is via vitest/playwright gates above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ANNO-08 | 19-01, 19-05 | One highlight from spanning selection | ✓ SATISFIED | Truth 1 evidence |
| ANNO-09 | 19-03, 19-04 | One global range, one identity, block-local fragments | ✓ SATISFIED | Truth 2 evidence |
| ANNO-10 | 19-02, 19-04, 19-05 | Attached through repagination/mode/typography/reopen/export-import/review-nav | ✓ SATISFIED | Truth 3 evidence |
| ANNO-11 | 19-02, 19-05 | Atomic review/edit/export/delete, no leftovers, no guessed anchors | ✓ SATISFIED | Truth 4 evidence |
| ANNO-12 | 19-01, 19-03, 19-05 | Unsupported boundaries rejected with explicit explanation per tested matrix | ✓ SATISFIED | Truth 5 evidence |

Orphaned requirements: none — REQUIREMENTS.md maps exactly ANNO-08..12 to Phase 19 (all marked Complete); every ID is claimed by ≥1 plan frontmatter. ANNO-13 (cross-page capture) is a declared Future Requirement, honestly preserved (capture-rejects cross-page refusal byte-unchanged, green).

### Anti-Patterns Found

None. Zero TODO/FIXME/XXX/HACK/PLACEHOLDER markers across all 15 phase-modified source files. Zero real `test.skip`/`test.fixme` calls in tests/e2e/annotations/ (single grep match is the header-discipline comment in capture-rejects.spec.ts L16). No stub returns; refusal paths return typed reasons by design. Schema/persistence/normalizeText/app.css untouched across the entire phase (`git diff f9f1580~1..HEAD` on those paths is empty) — prohibitions verified.

### Prohibition Verification (judgment-tier, LLM-judge with direct code evidence)

All 16 plan-level prohibitions verified against code: no narrowing machinery (refusals reason-only, no position); zero Dexie/schema changes (empty diff); no intermediate DOM walk (endpoint-only composition); no span chrome (D19-11 cell); single-U+2026 honesty (unit cells); export never truncates (full-span split); markers never in marks (D19-14 cells); slicer not forked; no geometry changes (app.css untouched); no cross-page capture machinery; entry-local coordinate discipline (splittingBlockGraphemeLength); no engine subsets (full gate unfiltered); strengthen-only spec edits. None flagged.

### Human Verification Required

None. All five success criteria assert runtime behavior that real-browser e2e cells exercise and the full 3-engine gate proves at this exact HEAD. The residual human dimension — screen-reader reading experience of multi-slice spans and visual calm of cross-block marks — is the ACPT-08 acceptance matrix explicitly traced to Phase 21 (Pending) in REQUIREMENTS.md; the automatable portion (aria discipline, exact hint strings, mark anatomy, keyboard activation) is asserted in-phase (phases 16/17 verification precedent for the same ACPT-08 deferral).

### Gaps Summary

No gaps. All five roadmap success criteria are verified with behavioral evidence: the capture core composes one global range from endpoints (unit-proven 24/24 in verifier's own run), rendering threads marks across every readable kind in both reading modes with exactly one DOM id per highlight per mounted document, durability is pinned across repagination/mode/typography/reload/jump/export-import by dedicated span cells, atomic management (review/edit/export/delete + note cascade) is e2e-proven, and the supported-content matrix is tested in real browsers with verbatim refusal copy and no-record assertions. All 16 commits present in git log; working tree clean at HEAD 1cc62c6.

---

_Verified: 2026-08-31T00:25:00Z_
_Verifier: the agent (gsd-verifier)_
