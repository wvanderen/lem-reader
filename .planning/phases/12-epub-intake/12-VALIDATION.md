---
phase: 12
slug: epub-intake
status: executed
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-17
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit, projects `unit` + `server`) + Playwright 1.61.1 (e2e, chromium/firefox/webkit + chromium-throttled-mobile perf) |
| **Config file** | vitest.config.ts (workspace projects) + playwright.config.ts |
| **Quick run command** | `npm run test:unit -- --run tests/unit/server/epub-to-books.spec.ts` (per-task targeted file) |
| **Full suite command** | `npm run test` (one invocation — the honest gate; 04-11/09-07/11-06 precedent) |
| **Estimated runtime** | unit ~11s; e2e ~7.5 min (3 engines + throttled perf); calibration replay < 2s; local corpus derive ~100s (8 GB heap) |

---

## Sampling Rate

- **After every task commit:** the task's targeted vitest/playwright file(s) from `<verify><automated>`
- **After every plan wave:** `npm run test:unit -- --run` + the phase's playwright project files
- **Before `/gsd-verify-work`:** Full suite green (12-08 Task 3 records it in 12-08-OUTPUT.md)
- **Max feedback latency:** ~60s per task (targeted files only)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | ING-05 | T-12-SC | Human approves fast-xml-parser legitimacy + exact pin before install | checkpoint | (blocking human-verify gate — approval record 12-01-fxml-approval.md) | ✅ | ✅ green |
| 12-01-02 | 01 | 1 | ING-05 | T-12-01 | Schemas widen additively; EPUB caps defined; no parser import under src/ | unit | `npx vitest run tests/unit/ingestion-schema.test.ts && npx tsc --noEmit` | ✅ | ✅ green |
| 12-01-03 | 01 | 1 | ING-05 | — | Self-verifying synthetic EPUB generator (NOT the D12-12 corpus); module-load self-check | unit | generator self-check at import (epub-to-books.spec + e2e import it) | ✅ | ✅ green |
| 12-02-01 | 02 | 2 | ING-05 | T-12-01/02/04/06/07/08 | Bomb filter before inflation; Slip gate on every entry; entity/proto/DTD refusals; DRM allowlist; timeout race; chapter cap | unit | `npx vitest run tests/unit/server/epub-to-books.spec.ts` | ✅ | ✅ green |
| 12-02-02 | 02 | 2 | ING-05 | T-12-05 | Figure downgrade — no remote fetch, no URL leak; TOC-merge + fallback partition; admission floor | unit | same spec, merge/admission/downgrade describe blocks | ✅ | ✅ green |
| 12-03-01 | 03 | 3 | ING-05 | T-12-09/13 | Client posts widened epub envelope; book ok-variant re-validation; typed refusal mapping | unit | `npx vitest run tests/unit/ingestion-client.test.ts` | ✅ | ✅ green |
| 12-04-01 | 04 | 3 | ING-05 | T-12-09/14 | Orchestrator fifth branch; per-chapter stages 2+; skip disclosure algebra; content-hash ids | unit | `npx vitest run tests/unit/server/ingest-epub.spec.ts` | ✅ | ✅ green |
| 12-05-01 | 05 | 4 | ING-05 | — | Dexie v5 additive books store; book cascade transaction; repository tests | unit | `npx vitest run tests/unit/library/book-filter.test.ts tests/unit/persistence` | ✅ | ✅ green |
| 12-05-02 | 05 | 4 | ING-05 | — | Upload → book grouping → chapter reading → resume → refusals with zero side effects | e2e | `npx playwright test epub-intake` | ✅ | ✅ green |
| 12-06-01 | 06 | 5 | ING-05 | — | SC#2 chapter substrate pins (persisted rows, modes, annotations, restore) | unit + e2e | targeted spec runs (12-06-SUMMARY) | ✅ | ✅ green |
| 12-07-01 | 07 | 5 | ING-05 | T-12-SC | Portability: books/chapters in export→import round-trip; v1 bundle imports; book conflict skip | unit + e2e | targeted spec runs (12-07-SUMMARY) | ✅ | ✅ green |
| 12-08-01 | 08 | 6 | ING-05 | T-12-20/21 | Manifest SHA-256 integrity; D12-12 bar validation; refuse-empty; loud-missing-record branch | unit | `npx vitest run tests/unit/server/epub-calibration/harness.test.ts && git check-ignore corpus/epub/x.epub` | ✅ | ✅ green |
| 12-08-02 | 08 | 6 | ING-05 | — | Human supplies real corpus (cannot be synthesized per D12-12) | checkpoint | (blocking human-verify gate — 7 books + 2 gap records) | n/a | ✅ green |
| 12-08-03 | 08 | 6 | ING-05 | T-12-20/21/SC | Evidence at the bar (7/7 admitted, counts, no fallback, anchors); replay never silently skips; SC#4 greps; honest full gate | integration + full | `npm run calibrate:epub && npx vitest run tests/unit/server/epub-calibration && npm run test` | ✅ | ✅ green (12-08-OUTPUT.md) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/server/epub-fixtures.ts` — self-verifying synthetic EPUB generator (12-01 Task 3)
- [x] `tests/unit/server/epub-to-books.spec.ts` — parser/TOC-merge/DRM/slip/bomb/caps/admission (12-02)
- [x] `tests/unit/server/ingest-epub.spec.ts` — orchestrator fifth branch (12-04)
- [x] `tests/e2e/epub-intake.spec.ts` — upload → grouping → reading → resume → refusals (12-05)
- [x] `tests/unit/library/book-filter.test.ts` — book/chapter search + tag surfacing (12-05)
- [x] `tests/unit/server/epub-calibration/` — harness + derive/replay + manifest + evidence (12-08)

*Existing infrastructure (vitest workspace, playwright matrix, lint:no-danger) covers everything else.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Corpus shape expectations (expected chapter counts, nav classes) | ING-05 (D12-12) | The corpus books are human-supplied local artifacts; the executor derived each expected count by inspecting the book's real nav/NCX TOC with the derivation basis recorded per-entry in manifest.json | Review manifest.json bases + the epub-evidence.json verdict rows against the books (12-08 Task 2→3) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint tasks are gates, not verification gaps)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** executed 2026-08-18 — honest full-suite gate exit 0 (12-08-OUTPUT.md run 3: unit 1162/0/13 + e2e 1000/0/6).
