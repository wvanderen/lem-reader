---
phase: 11-pdf-intake
plan: 01
subsystem: ingestion
tags: [pdf, unpdf, zod, schemas, fixtures, resource-limits, supply-chain]

# Dependency graph
requires:
  - phase: 07-url-ingestion
    provides: IngestionRequestSchema/IngestionFailureReasonEnum envelope + server/limits.ts cap pattern
  - phase: 08-markdown-library
    provides: markdown upload variant precedent + ArticleSourceSchema additive-widening precedent
provides:
  - unpdf@1.8.1 exact pin (human-approved) as the server-side PDF parser
  - pdf request variant (base64 + optional filename) on IngestionRequestSchema
  - Five PDF failure reasons (pdf-unreadable/encrypted/scanned/multi-column/too-large) — 16-member enum
  - "pdf" ArticleSourceSchema member + SourceBadge "PDF" case
  - PDF resource caps (PDF_MAX_BYTES, PDF_MAX_PAGES, PDF_EXTRACTION_TIMEOUT_MS, MAX_IMAGE_PIXELS, MAX_INGEST_BODY_BYTES)
  - Five committable synthetic PDF fixtures + deterministic self-verifying generator
affects: [11-pdf-intake (11-02 adapter, 11-03 orchestrator, 11-04 calibration, 11-05 client/e2e, 11-06 outline)]

# Tech tracking
tech-stack:
  added: ["unpdf 1.8.1 (exact pin, server-only — no src/ imports)"]
  patterns:
    - "Shared client+server cap constant lives in src/ (PDF_MAX_BYTES) with server/limits.ts re-export — /src→/server import direction is forbidden"
    - "Synthetic fixture corpus: deterministic generator + built-in self-check replaces sentinel spec assertions"

key-files:
  created:
    - .planning/phases/11-pdf-intake/11-01-unpdf-approval.md
    - tests/fixtures/pdf/generate-synthetic-pdfs.ts
    - tests/fixtures/pdf/README.md
    - tests/fixtures/pdf/synthetic-single-column.pdf
    - tests/fixtures/pdf/synthetic-two-column.pdf
    - tests/fixtures/pdf/synthetic-scanned.pdf
    - tests/fixtures/pdf/synthetic-outline.pdf
    - tests/fixtures/pdf/synthetic-corrupt.pdf
  modified:
    - package.json
    - package-lock.json
    - src/ingestion/types.ts
    - src/content/schema.ts
    - src/ingestion/library/SourceBadge.tsx
    - server/limits.ts
    - tests/unit/ingestion-schema.test.ts

key-decisions:
  - "unpdf pinned at 1.8.1 (user-approved T-11-SC gate, 2026-08-16) — supersedes the STACK.md 1.8.0 lock; diff verified API-neutral"
  - "PDF_MAX_BYTES = 10MB decoded lives in src/ingestion/types.ts; server/limits.ts imports + re-exports it so server modules read every cap from one module"
  - "MAX_IMAGE_PIXELS = 16,777,216 is TOTAL PIXELS (≈16MP), NOT bytes — corrects the ARCHITECTURE.md L781 '16 MB' label per 11-RESEARCH State of the Art"
  - "Synthetic fixtures are committable and carry their own integrity self-check; the D11-04 real-PDF calibration corpus stays local + gitignored"

patterns-established:
  - "Exact-pin supply-chain gate: blocking-human checkpoint → approval record artifact → --save-exact install (T-11-SC closure pattern)"
  - "Fixture-as-code: node-builtin-only deterministic generators with idempotency proof via second-emit hashing"

requirements-completed: []  # plan frontmatter requirements: [] — nothing to mark

# Metrics
duration: 7min
completed: 2026-08-16
status: complete
---

# Phase 11 Plan 01: PDF Intake Foundation Summary

**Human-gated unpdf@1.8.1 install plus additive PDF schema/enum/limit widenings and a five-fixture self-verifying synthetic PDF corpus — every later Phase 11 plan compiles against these contracts.**

## Performance

- **Duration:** 7 min (continuation session; excludes the pre-checkpoint legitimacy-audit session)
- **Started:** 2026-08-16T22:29:40Z (this continuation)
- **Completed:** 2026-08-16T22:37:06Z
- **Tasks:** 3/3 (Task 1 gate closed by user approval "approved 1.8.1")
- **Files modified:** 15 (8 created, 7 modified)

## Accomplishments

- **T-11-SC supply-chain gate closed with a durable record** — user approved unpdf pin 1.8.1 at the blocking-human checkpoint; approval + legitimacy evidence (unjs publisher, MIT, ~1.85M weekly downloads, zero runtime deps, no install scripts, bundled types) committed as `.planning/phases/11-pdf-intake/11-01-unpdf-approval.md`, resolving 11-RESEARCH Open Question 1 (1.8.0 STACK lock vs 1.8.1 current patch).
- **All PDF contracts shipped additively** (Pitfall 9 discipline): fourth `pdf` base64-in-JSON request variant with optional filename; five new failure reasons slotting before the `already-in-library`/`server-error` tail (16-member enum); `"pdf"` source member + exhaustive-switch `case "pdf"` badge; server-only import boundary verified (`grep 'from "unpdf"' src/` → no matches).
- **Server resource caps landed (T-11-01 DoS mitigation)**: `PDF_MAX_BYTES` (10MB decoded, shared via re-export), `PDF_MAX_PAGES = 500`, `PDF_EXTRACTION_TIMEOUT_MS = 30_000` (OQ2 → mirrors REQUEST_TIMEOUT_MS), `MAX_IMAGE_PIXELS = 16_777_216` with the pixels-not-bytes provenance correction, `MAX_INGEST_BODY_BYTES = ceil(bytes×4/3)+2048` (base64 inflation, Pitfall 7).
- **Synthetic fixture corpus committed and battle-verified**: deterministic generator (485 lines, node: builtins only, type-stripping-safe) emits five fixtures each <3KB with a built-in self-check (magic prefix, 500-byte floor, corrupt marker, second-emit hash idempotency). Beyond the acceptance criteria, every fixture was additionally parsed with real pdf.js via unpdf: page counts, both two-column x-ranges, zero-text scanned pages, outline destinations resolving to page objects, and corrupt throwing `Invalid PDF structure.`
- **Verification green**: `npx vitest run tests/unit/ingestion-schema.test.ts` → 39/39 passed; `npx tsc --noEmit` → exit 0; `node tests/fixtures/pdf/generate-synthetic-pdfs.ts` → exit 0 with self-check PASS.

## Task Commits

Each task was committed atomically:

1. **Task 1: Approve unpdf package legitimacy + exact pin (T-11-SC)** - `4cc4451` (docs — approval record artifact; the plan's "no file changes" gate task, recorded per gate-closure convention)
2. **Task 2: Install pinned unpdf + widen schemas, limits, badge** - `7571bb1` (feat)
3. **Task 3: Synthetic PDF fixture corpus + self-verifying generator** - `62c590d` (feat)

**Plan metadata:** this commit (docs: complete plan).

## Files Created/Modified

- `package.json` / `package-lock.json` — unpdf@1.8.1 exact pin (runtime dep)
- `src/ingestion/types.ts` — pdf request variant, five PDF failure reasons, exported `PDF_MAX_BYTES`
- `server/limits.ts` — `PDF_MAX_BYTES` re-export + `PDF_MAX_PAGES` / `PDF_EXTRACTION_TIMEOUT_MS` / `MAX_IMAGE_PIXELS` / `MAX_INGEST_BODY_BYTES`
- `src/content/schema.ts` — `"pdf"` ArticleSourceSchema member
- `src/ingestion/library/SourceBadge.tsx` — `case "pdf": return "PDF"` (no-default switch forced the case, as designed)
- `tests/unit/ingestion-schema.test.ts` — 16-member exact-order enum, six-member source enum, base64 parse/reject cases
- `tests/fixtures/pdf/generate-synthetic-pdfs.ts` — deterministic generator + self-check
- `tests/fixtures/pdf/synthetic-*.pdf` (×5) + `tests/fixtures/pdf/README.md` — the committable corpus
- `.planning/phases/11-pdf-intake/11-01-unpdf-approval.md` — T-11-SC gate-closure record

## Decisions Made

- **Pin 1.8.1 over the STACK.md 1.8.0 lock** — user choice at the checkpoint; the exact-pin discipline is what matters, and 1.8.0→1.8.1 was verified API-neutral (Math.sumPrecise polyfill refactor).
- **Shared cap constant placement** — `PDF_MAX_BYTES` lives in `src/ingestion/types.ts` because `/src → /server` imports are forbidden (client picker needs it too); `server/limits.ts` imports + re-exports so every server cap still reads from one module.
- **`MAX_IMAGE_PIXELS` provenance correction** — documented as TOTAL PIXELS (w×h ≈ 16 megapixels), correcting ARCHITECTURE.md L781's "16 MB" label per 11-RESEARCH State of the Art.
- **Wave-0 sentinel scope honored** — pdf-to-blocks.spec.ts / ingest-pdf.spec.ts / pdf-intake.spec.ts were NOT pre-created; their owning plans (11-02 T1, 11-03 T2, 11-05 T1) create them with real content. Fixture integrity lives in the generator self-check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - planned-consequence test update] Moved `"pdf"` from the rejects list to the parses list**
- **Found during:** Task 2 (test extension)
- **Issue:** The pre-existing `it.each([... "pdf" ...]) rejects source %s` case contradicted the widened enum — "pdf" is now a valid member, so the old assertion would fail.
- **Fix:** Removed `"pdf"` from the rejects list (kept `"PDF"` uppercase as an invalid case) and added it to the parses `it.each`; the plan's "extend the two exact-array assertions" instruction implicitly required this sibling change.
- **Files modified:** tests/unit/ingestion-schema.test.ts
- **Verification:** 39/39 tests pass.
- **Committed in:** 7571bb1 (Task 2 commit)

**2. [Rule 1 - bug] noUncheckedIndexedAccess errors in the generator self-check**
- **Found during:** Task 3 (type-check)
- **Issue:** Array indexing `first[i]`/`second[i]` yields `T | undefined` under the repo's strict settings; initial tsc run failed (and the failure was initially masked by piping tsc through `head` — the pipe returned head's exit code).
- **Fix:** Guarded both lookups (`if (!a || !b) { problems.push(...); continue; }`) and re-ran tsc unpiped to capture the true exit code.
- **Files modified:** tests/fixtures/pdf/generate-synthetic-pdfs.ts
- **Verification:** `npx tsc --noEmit` exit 0 (verified without pipe); generator still exits 0.
- **Committed in:** 62c590d (Task 3 commit)

**3. [Rule 3 - blocking] server/limits.ts re-export needed a local binding**
- **Found during:** Task 2 (limits widening)
- **Issue:** `export { PDF_MAX_BYTES } from "../src/ingestion/types"` re-exports without binding the name locally, but `MAX_INGEST_BODY_BYTES` references it in the same module.
- **Fix:** Split into `import { PDF_MAX_BYTES } from "../src/ingestion/types"; export { PDF_MAX_BYTES };` — matching the plan's "import and re-export" wording.
- **Files modified:** server/limits.ts
- **Verification:** tsc + vitest green.
- **Committed in:** 7571bb1 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs/test-consequences, 1 Rule 3 blocker)
**Impact on plan:** All fixes were correctness requirements of the planned work itself. No scope creep; no shipped behavior edited (all widenings additive).

## Authentication Gates

None. The single human gate (Task 1 package legitimacy, `blocking-human`) was resolved before this continuation session: user replied "approved 1.8.1"; recorded in `11-01-unpdf-approval.md`.

## Issues Encountered

None beyond the auto-fixed deviations above. Extra hardening performed voluntarily: all five fixtures were parsed with real pdf.js (unpdf) to prove they are structurally valid documents — page counts, column x-ranges, zero-text scanned pages, outline destinations resolving to page objects, corrupt input throwing — even though the acceptance criteria only required prefix/size/marker/idempotency checks.

## Known Stubs

None. Every shipped surface is real: schemas validate, constants are consumed by name in later plans' contracts, the generator runs standalone, and the fixtures parse in a real PDF engine.

## User Setup Required

None — no external services; unpdf is a local dependency.

## Next Phase Readiness

- **Ready for 11-02** (pdfToBlocks adapter): fixtures are in place (`tests/fixtures/pdf/`), `unpdf` is installed server-only, and 11-02 Task 1 creates `tests/unit/server/pdf-to-blocks.spec.ts` against `synthetic-single-column.pdf` (dehyphenation), `synthetic-two-column.pdf` (gutter detection), and `synthetic-scanned.pdf` (zero-text floor).
- **Ready for 11-03** (pipeline fourth branch): the 16-member failure enum + `PDF_MAX_BYTES`/`MAX_INGEST_BODY_BYTES` caps are importable from `server/limits.ts` / `src/ingestion/types.ts`.
- **Ready for 11-05** (client + e2e): `case "pdf"` badge and the pdf request variant parse/reject behavior are locked by unit tests.
- **No blockers.** Note for later plans: `synthetic-outline.pdf`'s bookmarks resolve via explicit array destinations (`[pageRef /XYZ 0 792 0]`) — verified readable through `getDocumentProxy().getOutline()`.

---

*Phase: 11-pdf-intake*
*Completed: 2026-08-16*

## Self-Check: PASSED

12/12 verified — all 9 created files exist on disk; all 3 task commits (4cc4451, 7571bb1, 62c590d) present in git log.
