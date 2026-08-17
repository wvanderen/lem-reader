---
phase: 11-pdf-intake
verified: 2026-08-17T20:57:00Z
status: human_needed
score: 28/29 must-haves verified
behavior_unverified: 1 # 11-02 truth 4's timeout-race clause — present + wired, firing path exercised by no test (repo-wide grep re-confirmed this cycle)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 23/24
  gaps_closed:
    - "UAT Test 2 (not a verification gap — a UAT gap): synthetic-outline.pdf false-refusal closed by 11-07 and now verified at adapter/ingest/browser levels (truths 25–29 below)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Extraction runs under one proxy with pixel/page caps checked before extraction and a timeout race (11-02 resource invariants) — the TIMEOUT FIRING clause"
    test: "Trigger a PDF extraction that exceeds PDF_EXTRACTION_TIMEOUT_MS (30s) — e.g. a pathologically complex document, or a unit test stubbing a never-resolving op inside withPdfDocument with fake timers"
    expected: "The Promise.race timer rejects with IngestionError('server-error', 'PDF extraction timed out — …'), the timer is cleared, and pdf.loadingTask.destroy() still runs in the finally block (no leaked proxy)"
    why_human: "The race construct is present and wired (server/pdfToBlocks.ts withPdfDocument L620–651, re-read by verifier this cycle) but the cancellation path is a runtime transition no automated test exercises — repo-wide grep for useFakeTimers/PDF_EXTRACTION_TIMEOUT_MS/extraction timed out across tests/ returns only two unrelated component tests (ModeToggle, PageTurnControls); NOTE: 11-UAT.md Test 10's skip reason claims this is 'unit-covered in pdf-to-blocks.spec.ts' — that claim is factually incorrect (see Anti-Patterns)"
human_verification:
  - test: "Exercise the 30s PDF-extraction timeout (hang an extraction or upload a pathologically complex PDF) and observe the refusal"
    expected: "Typed server-error envelope with the timeout message reaches the .status live region as calm copy; no worker/proxy leak (subsequent ingests still succeed)"
    why_human: "Cancellation invariant — the only must-have clause with no automated coverage (no fake-timers or hanging-op test exists anywhere in tests/, re-confirmed by repo-wide grep this cycle)"
  - test: "Optional bookkeeping: re-run 11-UAT.md Test 2 manually (upload tests/fixtures/pdf/synthetic-outline.pdf → structured h2 headings) and flip its result from issue → pass"
    expected: "Article opens with 'Outlined Document' and 'Second Section' as h2 headings; the flow is already automated identically (and green on 3 engines) by the 11-07 e2e test, so this is confirmation + record-keeping, not a code risk"
    why_human: "The UAT record still shows result: issue / status: diagnosed from before the fix; the e2e proves the behavior but the UAT ledger entry itself is a human-maintained document"
---

# Phase 11: PDF Intake Verification Report

**Phase Goal:** Readers can add PDF documents to their library with text extracted and normalized — and honest failure when a PDF is scanned, image-only, or unrecoverably multi-column.
**Verified:** 2026-08-17T20:57:00Z
**Status:** human_needed
**Re-verification:** Yes — refreshed after 11-07 gap closure (previous report covered 11-01→11-06; this report adds full verification of 11-07's five truths and regression-checks the prior 24)

## Goal Achievement

### Observable Truths

Roadmap Success Criteria (the contract) are truths 1–4; plan-level must-have truths follow (deduplicated — 11-05's three truths restate SC#1–SC#3 at browser level and are folded into them); 11-07's five gap-closure truths are 25–29. Verifier-run evidence this cycle: 3-suite unit verify **60/60 green**, playwright pdf-intake **24/24 green (chromium+firefox+webkit)**, `tsc --noEmit` **exit 0**, corpus SHA-256 **6/6 match**, dist/ boundary greps **0 matches** (fresh post-11-07 build).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC#1** Reader uploads a text-heavy PDF → normalized article that opens, paginates, annotates, restores location identically | ✓ VERIFIED | **Verifier re-ran `npx playwright test pdf-intake`: 24/24 across 3 engines** — happy path (waitForURL `#/article/pdf-`, h1 title chain, badge, visible fixture text), annotate-survives-reload, location-restore all green. Unit ingest suite green in verifier's 60/60 run |
| 2 | **SC#2** Scanned/image-only PDFs detected and refused honestly — no silent garbage enters library | ✓ VERIFIED | `pdf-scanned` thrown from majority-near-empty verdict BEFORE assembly (code re-read L1127–1132 — **unchanged by 11-07**, git log shows 6f8c655 is the only pdfToBlocks.ts commit since 11-06 and its diff touches only the isReaderable region); e2e scanned refusal green ×3 engines in verifier run |
| 3 | **SC#3** Multi-column PDFs honestly refused — reader never sees silently reordered text | ✓ VERIFIED | `pdf-multi-column` gate unchanged (code re-read L1133–1138); denominator (textBearingPages counter L1153–1162) untouched; e2e two-column refusal green ×3 engines in verifier run |
| 4 | **SC#4** Round-trip anchor gate on every extracted PDF article + calibration harness validates thresholds on a real-PDF corpus before promotion | ✓ VERIFIED | `assertRoundTripAnchor` still on all branches (8 occurrences in ingest.ts, grep); **verifier recomputed all 6 corpus SHA-256 hashes — 6/6 exact match**; replay.spec (thresholds pin `{...PDF_THRESHOLDS}` toEqual evidence) green in verifier's 3-suite run — mechanically proves PDF_THRESHOLDS byte-identical to committed 11-06 evidence after 11-07 |
| 5 | unpdf installed at human-approved exact pin; no module under src/ imports it (11-01) | ✓ VERIFIED | package.json `"unpdf": "1.8.1"` exact (re-grepped); `grep 'from "unpdf"' src/` → 0 matches |
| 6 | IngestionRequestSchema accepts pdf base64 variant + optional filename, rejects non-base64 (11-01) | ✓ VERIFIED | Regression: types.ts pdf base64 variant present (prior verification ran 39 schema cases green; schema untouched since) |
| 7 | 16-member failure enum incl. five PDF members; "pdf" source member; PDF badge (11-01) | ✓ VERIFIED | `case "pdf"` in SourceBadge (grep hit); e2e badge assertions green ×3 engines this cycle |
| 8 | Five synthetic fixtures + deterministic self-verifying generator (11-01) | ✓ VERIFIED | Regression: fixtures present (outline fixture exercised end-to-end this cycle at all three levels); generator unchanged since prior verification's exit-0 self-check run |
| 9 | Text-heavy single-column PDF extracts into five-field result with paragraphs/headings (11-02 T1/T2 assembly) | ✓ VERIFIED | Adapter suite green in verifier's 60/60 run (five-field contract, schema-parse, headings, dehyphenation, x-gap joins cells all present in spec) |
| 10 | Scanned refuses `pdf-scanned`; multi-column refuses `pdf-multi-column` — never silently reordered (11-02) | ✓ VERIFIED | Same suite (synthetic-scanned/two-column refusal cells) + e2e green ×3 engines this cycle |
| 11 | Encrypted/corrupt refuse via `pdf-encrypted`/`pdf-unreadable`; page cap refuses `pdf-too-large` (11-02) | ✓ VERIFIED | Regression: mapPdfjsError name-match cells + assertPageCap boundary cells (501 throws / 500 passes) green in verifier run; corrupt e2e green ×3 |
| 12 | One-proxy lifecycle, caps before extraction, timeout race (11-02 resource invariants) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Proxy reuse, maxImageSize, assertPageCap-before-extract, destroy-in-finally all re-read present (withPdfDocument L620–651) and behavior-tested by the 35 adapter cells that drive the real proxy. **The timeout-race FIRING path (30s timer → server-error + destroy) is still exercised by NO test — repo-wide grep re-confirmed this cycle.** Additionally discovered: 11-UAT.md Test 10's skip reason asserts this is "unit-covered in pdf-to-blocks.spec.ts" — factually incorrect (full it() inventory enumerated; no such test). See Human Verification |
| 13 | `ingest({pdf, filename})` → ok:true, pdf-<hash> id, blocks pass round-trip anchor gate (11-03) | ✓ VERIFIED | Fourth branch + round-trip gate unchanged (grep); ingest suite green in verifier's 60/60 run incl. the new outline case |
| 14 | Identical PDF bytes always produce the same id (11-03) | ✓ VERIFIED | Regression: content-hash id discipline re-proven by dedupe e2e (green ×3 this cycle) + `pdf-[0-9a-f]{12}` assertions in outline ingest test |
| 15 | D11-07 title chain + D11-09 doubled-title consume on the pdf branch (11-03) | ✓ VERIFIED | Re-proven behaviorally this cycle: outline ingest test asserts provenance.title === "outline-notes" (filename channel) AND both headings survive (consume does not fire) — green |
| 16 | Oversized bodies refused by content-length BEFORE readBody accumulates (11-03) | ✓ VERIFIED | Regression: MAX_INGEST_BODY_BYTES guards present in middleware (grep ×4); UAT Test 7 client-side cap passed |
| 17 | Picker accepts .pdf; client refuses oversized PDFs before network cost (11-04) | ✓ VERIFIED | Regression: `accept=".md,.html,.pdf"` present (grep hit); UAT Test 7 pass |
| 18 | PDF base64-encoded in browser, posted via ingestPdf with filename (11-04) | ✓ VERIFIED | Regression: `export async function ingestPdf` present (grep hit); e2e drives the real path 24/24 |
| 19 | Five PDF refusals surface as calm DOC-06 copy in .status live region (11-04) | ✓ VERIFIED | Regression: refusal copy asserted by 3 e2e cells green ×3 engines this cycle; pdf-copy byte-pins verified in prior cycle, file untouched since |
| 20 | Client bundle contains no unpdf/pdfjs code (11-04) | ✓ VERIFIED | **Re-checked against the fresh post-11-07 build**: `grep -rln InvalidPDFException dist/` → 0 files; `grep -rln unpdf dist/` → 0 files |
| 21 | Committed manifest + evidence record corpus, SHA-256, thresholds (11-06 T1) | ✓ VERIFIED | manifest.json + pdf-evidence.json present; **verifier recomputed 6/6 corpus hashes this cycle — exact match** |
| 22 | CI replays committed evidence at the D11-06 bar, fails honestly when missing (11-06 T2) | ✓ VERIFIED | replay.spec 3/3 green in verifier's run (incl. existsSync loud-failure cell + thresholds pin) |
| 23 | Every corpus PDF classified correctly AND admitted ≥ 0.90 agreement (11-06 T3) | ✓ VERIFIED | validateEvidence bar enforcement green via replay.spec; corpus files unchanged (hashes re-verified) so committed verdicts remain valid |
| 24 | Full honest suite passes in one invocation with counts + exit code recorded (11-06 T4) | ✓ VERIFIED | 11-06-OUTPUT.md record present (RED + GREEN preserved); orchestrator re-ran the full suite after 11-07 merged: unit green, e2e **949 passed / 6 intentional skips / 0 failed** across 3 engines, `npm run build` exit 0; verifier independently re-ran the phase-specific suites (60/60 unit + 24/24 e2e + tsc 0) |
| 25 | pdfToBlocks on synthetic-outline.pdf returns isReaderable true with ≥3 blocks including the outline-coerced h2 headings (11-07) | ✓ VERIFIED | Code read L1349–1350: `blocks.length >= 3 && (textBearingPages >= 1 \|\| verdict.nearEmptyPages === 0)`; test at spec L120–140 asserts isReaderable true + ≥3 blocks + both level-2 headings ("Outlined Document", "Second Section") — green in verifier's 60/60 run. RED commit 2989397 (15:39:41) proves the assertion bit: it failed against the old formula at exactly `expect(result.isReaderable).toBe(true)` |
| 26 | ingest() on synthetic-outline.pdf → ok:true, pdf-<hash> article, BOTH h2 headings survive, high\|low confidence (11-07) | ✓ VERIFIED | Spec L115–156 read: asserts ok:true, `/^pdf-[0-9a-f]{12}$/`, source pdf, origin upload, high\|low confidence, provenance.title "outline-notes", BOTH headings in article.blocks — green in verifier's run. Load-bearing filename "outline-notes.pdf" observed in code (D11-09 consume cannot fire — heading survival is part of the proof) |
| 27 | Browser upload of synthetic-outline.pdf navigates to #/article/pdf-<id>, renders outline bookmarks as h2 headings, one PDF-badged row (11-07) | ✓ VERIFIED | e2e L217–264 read: uploadPdf → waitForURL(/#\/article\/pdf-/) → h1 "outline-notes" → BOTH h2 headings visible → back to #/ → pdfLibraryRows count 1. **Verifier ran the full spec: 24/24 across chromium/firefox/webkit** — the outline admission cell green on every engine |
| 28 | Scanned detection NOT loosened: synthetic-scanned.pdf still refuses at adapter/orchestrator/browser; calibration replay green with PDF_THRESHOLDS byte-untouched (11-07) | ✓ VERIFIED | (a) `git show 6f8c655` — the ONLY production diff is the isReaderable expression + 17-line comment; zero PDF_THRESHOLDS lines touched; (b) scanned majority gate re-read unchanged at L1127 (throws before assembly); (c) replay.spec thresholds pin green in verifier's run; (d) e2e scanned refusal (calm copy + zero rows + no navigation) green ×3 engines; (e) acceptance grep `rg -c "verdict\.nearEmptyPages === 0" server/pdfToBlocks.ts` = 1 |
| 29 | Middle band stays refused: minority-near-empty + zero-text-bearing document keeps isReaderable false even with ≥3 blocks (11-07) | ✓ VERIFIED | Guard test at spec L390–434 read: multi-page probe via serializePdf (2 sparse 4-line pages + 1 single-line near-empty page) asserts `blocks.length >= 3` AND `isReaderable === false` — green in verifier's run. Truth-table check: textBearingPages=0 + nearEmptyPages=1 ⇒ both disjunct arms false ⇒ refuses. Passed in RED (old formula) and stays green in GREEN — a boundary pin by design, per the recorded TDD discipline |

**Score:** 28/29 truths verified (1 present, behavior-unverified)

### Required Artifacts (11-07 — full three-level verification)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/pdfToBlocks.ts` | relaxed isReaderable admission algebra; contains `nearEmptyPages === 0`; ≥1335 lines | ✓ VERIFIED | 1353 lines; expression + comment present at L1332–1350; L2 substantive (17-line admission-algebra/safety-envelope comment, no debt markers); L3 wired — isReaderable consumed by server/ingest.ts !isReaderable gate (verified in RED commit's failing assertions: the gate read it) |
| `tests/unit/server/pdf-to-blocks.spec.ts` | outline isReaderable assertion + middle-band guard; ≥500 lines | ✓ VERIFIED | 543 lines; outline admission test L120–140 + middle-band guard L390–434; green under verifier run |
| `tests/unit/server/ingest-pdf.spec.ts` | full-pipeline outline-fixture admission; ≥390 lines | ✓ VERIFIED | 406 lines; dedicated describe L115–156; green under verifier run |
| `tests/e2e/pdf-intake.spec.ts` | browser-level outline upload admission; ≥445 lines | ✓ VERIFIED | 470 lines; OUTLINE_PDF const L79 + admission test L217–264; green ×3 engines under verifier run |

### Key Link Verification (11-07)

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server/pdfToBlocks.ts | server/ingest.ts | isReaderable feeds the !isReaderable refusal gate | ✓ WIRED | RED commit 2989397's failing ingest test (`extraction-unsupported` refusal) proves the gate reads this exact field; GREEN flips it — behaviorally demonstrated both directions |
| tests/unit/server/ingest-pdf.spec.ts | server/ingest.ts | `fixtureB64("synthetic-outline.pdf")` through the full pipeline | ✓ WIRED | Pattern present L128; ok:true + id/heading assertions green |
| tests/e2e/pdf-intake.spec.ts | dev-server /api/ingest + server/ingest.ts | uploadPdf drives real picker → POST → admission → #/article/pdf- | ✓ WIRED | waitForURL(/#\/article\/pdf-/) L236 passed on all 3 engines |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| e2e outline admission | article DOM | real upload pipeline over real fixture bytes | Yes — h2 headings asserted visible, pdf- URL, 1 PDF-badged row | ✓ FLOWING |
| outline ingest test | response.article | real ingest() over fixtureB64 bytes | Yes — ok:true, real id/shape/heading assertions | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 11-07 verify command (adapter + ingest + calibration replay) | `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts tests/unit/server/ingest-pdf.spec.ts tests/unit/server/pdf-calibration/replay.spec.ts` | **60/60 passed, exit 0** (1.27s) | ✓ PASS |
| Browser proof, 3 engines (outline admission + SC#1 happy + 3 refusals + dedupe + annotate/restore) | `npx playwright test pdf-intake` | **24 passed / 0 failed** (16.6s) | ✓ PASS |
| Types gate (incl. derive.spec TS6133 fix) | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Acceptance grep (code-only disjunct form) | `rg -c "verdict\.nearEmptyPages === 0" server/pdfToBlocks.ts` | 1 | ✓ PASS |
| Thresholds byte-untouched | replay.spec pin + `git show 6f8c655` diff inspection | pin green; diff touches only isReaderable region + 1-line derive.spec import fix | ✓ PASS |
| Corpus integrity | shasum -a 256 over corpus/pdf vs manifest.json entries | 6/6 exact match | ✓ PASS |
| Client bundle boundary (fresh build) | `grep -rln "InvalidPDFException\|unpdf" dist/` | 0 files | ✓ PASS |
| RED→GREEN discipline | `git log` 2989397 (15:39:41, tests) → 6f8c655 (15:40:58, fix) | Correct order; RED commit stat = tests only (+107 lines, 2 files) | ✓ PASS |
| Timeout-firing test coverage | repo-wide grep `useFakeTimers\|PDF_EXTRACTION_TIMEOUT_MS\|extraction timed out` in tests/ | Only 2 unrelated component tests — no PDF timeout test exists | ✗ CONFIRMS gap (truth 12) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` declared by this phase's plans; the phase's runnable checks are the vitest/playwright suites above, all executed by the verifier.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|---------------------|---------|----------|
| ING-04 | 11-02, 11-03, 11-04, 11-05, 11-06, 11-07 | Reader can add a document by uploading a PDF; text extracted and normalized, honest failure when scanned/image-only or unrecoverably multi-column | ✓ SATISFIED | Full pipeline verified end-to-end (truths 1–29) incl. the closed UAT Test 2 outline gap; REQUIREMENTS.md L15 marks ING-04 `[x]` and the coverage table (L106) marks it Complete |

Orphaned requirements: **none** — REQUIREMENTS.md maps only ING-04 to Phase 11; 11-01 declares `requirements: []` (foundation work consumed downstream). All commits from the phase exist in git history (11-07's four verified: 2989397, 6f8c655, e1026bb, ce13fca).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| .planning/phases/11-pdf-intake/11-UAT.md | 56 | Test 10 skip reason claims the timeout race is "unit-covered in tests/unit/server/pdf-to-blocks.spec.ts" — **factually incorrect** (full it() inventory enumerated; no such test exists repo-wide) | ⚠️ Warning | Documentation inaccuracy only — no code defect; but it risks the timeout gap being considered closed when it is not. Recommend correcting the skip reason (or closing the gap with a fake-timers test) when Test 10 is dispositioned |
| server/pdfToBlocks.ts (withPdfDocument timeout clause) | 631–651 | Untested cancellation path | ⚠️ Warning | See truth 12 / Human Verification — unchanged from prior verification |
| tests/unit/server/pdf-to-blocks.spec.ts | 510 | "placeholder" in a test NAME ("rejects … placeholder titles") | ℹ️ Info | isSanePdfTitle behavior test — not a stub (carried from prior verification) |

Zero `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers across the five 11-07-modified files (grep exit 1). Zero empty implementations. All four 11-07 commits verified in git history with correct RED→GREEN ordering.

### Human Verification Required

### 1. PDF extraction timeout fires cleanly (the one uncovered behavior)

**Test:** Trigger an extraction that exceeds `PDF_EXTRACTION_TIMEOUT_MS` (30 s) — upload a pathologically complex PDF, or (cheaper) add a fake-timers unit test stubbing a never-resolving `op` inside `withPdfDocument`.
**Expected:** Typed `server-error` refusal with the "PDF extraction timed out…" message; the timer is cleared; `pdf.loadingTask.destroy()` still runs in the `finally`; subsequent ingests succeed (no leaked proxy/worker).
**Why human:** Cancellation invariant — the race is present and wired (verifier code-read L620–651 this cycle) but no automated test anywhere in tests/ exercises the timer firing; grep cannot see whether a hung op is actually preempted. Note the UAT Test 10 skip-reason's "unit-covered" claim is inaccurate (see Anti-Patterns).

### 2. UAT Test 2 record flip (bookkeeping)

**Test:** Optionally re-run 11-UAT.md Test 2 manually (upload `tests/fixtures/pdf/synthetic-outline.pdf` → expect structured h2 headings) and update the UAT ledger from `result: issue` to pass.
**Expected:** "Outlined Document" and "Second Section" render as h2 headings; admission navigates to the article.
**Why human:** The identical flow is already automated and green on all 3 engines (11-07 e2e) — this is confirmation plus updating a human-maintained record, not a code risk.

### Executor-Fact Discrepancies (SUMMARY/context vs codebase — resolved in the codebase's favor)

| Claim | Actual (verifier-observed) | Verdict |
|------|---------------------------|---------|
| 11-07 SUMMARY: "55 pre-existing cells" + "59 passed / 0 failed" after GREEN across the two suites | Confirmed via RED commit (55 pre-existing + 2 new outline tests) and verifier's own 60/60 across the three suites (57 + 3 replay) | Accurate |
| 11-07 SUMMARY: e2e "24 passed / 0 failed" | Verifier reproduced exactly: 24/24 (16.6s) | Accurate |
| 11-07 SUMMARY: derive.spec.ts TS6133 auto-fix in 6f8c655 | `git show 6f8c655 --stat` confirms 2-file diff incl. derive.spec.ts 1-line change; verifier's `tsc --noEmit` exit 0 | Accurate |
| 11-UAT.md Test 10 skip reason: timeout race "unit-covered in pdf-to-blocks.spec.ts" | **False** — no such test exists (it() inventory + repo-wide grep) | Inaccurate — flagged as Warning |

### Gaps Summary

No failed truths, no missing/stub artifacts, no unwired links, no debt markers, no requirement gaps. The 11-07 gap closure is genuinely closed and pinned at all three levels: the production change is exactly one expression + comment (git-diff-verified), the tests that were missing when the bug shipped now exist and demonstrably bite (RED→GREEN commit pair), scanned/multi-column/middle-band refusals are provably un-loosened (code read + guard test + thresholds replay pin + 3-engine e2e), and ING-04 stands satisfied end-to-end. The single non-verified item is unchanged from the prior cycle and remains a **test-coverage hole, not a code hole**: `withPdfDocument`'s timeout-firing branch (30 s race) has no automated coverage anywhere in tests/ — a fake-timers unit test would close it without production changes. Newly surfaced this cycle: the UAT ledger's Test 10 skip reason misstates this coverage as existing, which should be corrected so the gap cannot be mistaken for closed.

---

_Verified: 2026-08-17T20:57:00Z_
_Verifier: the agent (gsd-verifier)_
