---
phase: 20-safe-local-image-fidelity
plan: 02
subsystem: ingestion
tags: [asset-stage, ssrf, zod, base64, sha256, typed-refusals, envelope, markdown-figures]

# Dependency graph
requires:
  - phase: 20-safe-local-image-fidelity (Plan 01)
    provides: fetchImageAsset/sniffImageAsset seam, ImageAsset/ImageAssetRefusal types, safeFetchCore two-profile SSRF, eight shared image caps, three-state FigureBlock
provides:
  - runAssetStage + rewriteFiguresWithAssets + the AssetResolution stage-level supertype (count/budget/deadline arms)
  - figureSrcResolver hook on htmlToBlocks (EPUB container-marker path for 20-06; default-absent byte-stable)
  - Markdown non-http figures promoted to refused FigureBlocks (OQ2; D20-06 one placeholder surface)
  - runAssetStage wired into the ingest orchestrator post-extract pre-stamp with extractionWarnings refusal disclosure
  - AssetEnvelopeSchema on both IngestionResponseSchema ok-variants + ValidatedAsset transport re-validation (decode + byteLength + assetId re-hash) on IngestionSuccess
affects: [20-03 asset persistence, 20-04 renderer + AssetProvider, 20-06 epub container extraction, 20-07 corpus cap tuning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage-level budget arms live ONLY on AssetResolution — fetch-level refusals stay closed in 20-01's ImageAssetRefusal (cross-plan contract)"
    - "Deterministic document-order budgeting: count cap before any fetch, running decoded-byte budget over accepted assets, deadline checked before each dispatch"
    - "Zod .default([]) envelope widening is back-compat on the wire but REQUIRED on the parsed output — mock sites ripple (five fixed)"
    - "Client transport re-validation reuses sha256Hex from portability/manifest (no forked hash) and a chunked base64ToBytes decode sibling"

key-files:
  created:
    - server/assetStage.ts
    - tests/unit/server/assetStage.spec.ts
  modified:
    - server/ingest.ts
    - server/htmlToBlocks.ts
    - server/markdownToBlocks.ts
    - src/ingestion/types.ts
    - src/ingestion/IngestionClient.ts
    - src/ingestion/ingestCopy.ts
    - tests/unit/server/markdown-to-blocks.spec.ts
    - tests/unit/server/extraction.spec.ts
    - tests/unit/ingestion-client.test.ts
    - tests/unit/ingestion-schema.test.ts
    - tests/component/AddDialog.test.tsx
    - tests/unit/server/ingest-adapter.spec.ts
    - tests/unit/server/vercel-ingest-endpoint.spec.ts

key-decisions:
  - "Refused figures keep originalSrc as provenance (where the bytes would have come from) while the src key is omitted entirely — no stale remote URL survives into the canonical model"
  - "refusedCount counts per-FIGURE occurrences (the placeholders the reader sees), not unique srcs; pre-existing no-src figures are disclosed by their placeholder surface (D20-06), not the warning count"
  - "Byte-identical twins (same assetId) reuse the first budget admission without double-charging (D7-07 identical-bytes-self-identify)"
  - "Envelope tamper failures reuse the calm server-error IngestionError reason — indistinguishable from any server malfunction for the reader; no enum churn"
  - "Server envelope uses Buffer.toString('base64') (C++-side, no JS stack limit; plan-sanctioned server-side) while the client decodes with a chunked 0x8000 base64ToBytes"

patterns-established:
  - "Scaffolding-cast sequencing: a server envelope field may ship one task ahead of its schema with an explicit removable `as` cast + NOTE, removed the moment the schema widens"
  - "The single-article client path (key-narrowed, never full-schema-parsed) validates NEW envelope fields with their own z.array(...).parse before the crypto gate"

requirements-completed: []  # IMG-01/IMG-02 unit-level proof shipped here, but both close at the e2e/corpus plans (20-04/20-05 imagery specs, 20-07 cap re-check) — mirrors the 04-02 PAGE-01 / 20-01 IMG-02 split precedent

# Metrics
duration: 18min
completed: 2026-08-31
status: complete
---

# Phase 20 Plan 02: Inline Asset Stage + Network-Path Integration Summary

**Per-article collect/budget/deadline/fetch/rewrite stage wired into the locked ingest orchestration with a re-validating asset envelope — URL/paste/Markdown figures become self-contained asset refs or calm refused FigureBlocks, proven by substrate byte-identity against the real splittingBlockText**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-31T14:55:30Z
- **Completed:** 2026-08-31T15:13:00Z
- **Tasks:** 3 (Tasks 1 & 3 TDD: RED→GREEN)
- **Files modified:** 14 (2 created, 12 modified)

## Accomplishments

- **IMG-01/IMG-02 end-to-end for the three network-path sources**: URL, paste/html-upload, and Markdown ingest now rewrite every accepted figure inline to `asset:img-<12hex>` refs with originalSrc provenance and stored orientation-corrected dims (D20-04 — a saved article is always complete; D20-12 self-contained model); PDF stays text-only (D20-01 — pdfToBlocks byte-unchanged, verified 0-line diff)
- **D20-05 composure proven at every layer**: count cap refuses beyond-cap srcs with NO fetch; response budget refuses mid-list deterministically in document order; deadline refuses remaining srcs at dispatch; one bad image never blocks the article — refused figures stay FigureBlocks with alt + caption intact and src omitted
- **D-05 substrate byte-identity**: the spec imports the REAL splittingBlockText and asserts the figure-case output is byte-identical before/after the rewrite for every figure position (top-level, nested-in-list, nested-in-blockquote) — saved locations, highlights, and caption anchors untouched by construction (D19-01)
- **Honesty constraint enforced (T-20-10)**: refusedCount disclosed via `ingestionMeta.extractionWarnings` ("N image(s) could not be included"), never silent
- **OQ2 resolved**: Markdown non-http figures (relative paths, data: URIs, bare words) promote to refused FigureBlocks with alt preserved — one placeholder surface everywhere (D20-06), no UnsupportedBlock arm
- **Pitfall 10 closed**: the envelope carries base64 assets; the client re-validates each one (Zod parse → chunked decode → byteLength re-check → sha256 assetId re-hash) before exposure — the server is never trusted; any mismatch fails the whole ingest calmly
- **Full-suite honesty**: 1504 unit tests passed / 0 failed / 13 documented skips; SSRF matrix byte-stable (19 passed / 2 documented residuals on chromium)

## Task Commits

Each task was committed atomically (TDD tasks: RED test commit → GREEN feat commit):

1. **Task 1: server/assetStage.ts — collect, budget, fetch, rewrite** — `190ae42` (test) + `c664b89` (feat)
2. **Task 2: htmlToBlocks resolver hook, Markdown promotion, ingest wiring** — `7604d40` (feat)
3. **Task 3: Envelope widening + client transport re-validation** — `7a22cb1` (test) + `2ee12bf` (feat)

## TDD Gate Compliance

- Task 1: RED `190ae42` (13 failing cells against the placeholder stub) → GREEN `c664b89` (13/13) ✓
- Task 3: RED `7a22cb1` (10 failing cells / 91 pre-existing green) → GREEN `2ee12bf` (101/101) ✓
- Task 2 is not TDD-flagged: behavior-locked by the extended extraction + markdown specs in the same commit (87 cells across the four server specs)

## Files Created/Modified

- `server/assetStage.ts` — NEW: `runAssetStage(blocks, {signal, deadlineMs})` (unique-src collection in document order, MAX_FIGURES_PER_ARTICLE count cap, bounded-concurrency ASSET_FETCH_CONCURRENCY pool over fetchImageAsset, ASSET_STAGE_DEADLINE_MS dispatch gate, MAX_ASSET_RESPONSE_BYTES running budget), `rewriteFiguresWithAssets` (downgradeFigures-shaped recursion; four-field-only accepted rewrite), `AssetResolution` supertype
- `tests/unit/server/assetStage.spec.ts` — NEW: 13 cells — per-figure refusal, count cap (121 figures, exactly 120 fetches), response budget (2MB+2MB vs 3MB), deadline (pre-expired + mid-flight), bounded concurrency peak, nested containers, substrate byte-identity, four-field-only diff, never-throws-on-seam-rejection; zero throw assertions
- `server/htmlToBlocks.ts` — optional `figureSrcResolver` threaded htmlToBlocks → visit → figureBlock; claimed non-http srcs become FigureBlocks carrying the raw marker src (20-06 path); default-absent path byte-stable
- `server/markdownToBlocks.ts` — `figureFromImage` non-http arm returns `{ kind: "figure", alt, caption: [] }` (src omitted)
- `server/ingest.ts` — `runAssetStage` post-extract pre-BUILD for non-PDF paths; extractionWarnings disclosure; `toAssetEnvelope` (Buffer base64) + `AssetEnvelope` interface; ok-return carries `assets`
- `src/ingestion/types.ts` — `AssetEnvelopeSchema` + `assets: z.array(...).default([])` on BOTH ok-variants
- `src/ingestion/IngestionClient.ts` — `ValidatedAsset`, exported `validateEnvelopeAssets` (decode + byteLength + re-hash; calm server-error refusal), `IngestionSuccess.assets`, per-field Zod parse on the key-narrowed path
- `src/ingestion/ingestCopy.ts` — `base64ToBytes` (chunked 0x8000 decode sibling)
- Specs extended: extraction (+3 resolver cells), markdown-to-blocks (refused-FigureBlock cells replace the unsupported cell), ingestion-client (+4 re-validation cells), ingestion-schema (+6 envelope cells)
- Ripple fixes: AddDialog.test.tsx ×3, ingest-adapter.spec.ts, vercel-ingest-endpoint.spec.ts mocks gain `assets: []`

## Decisions Made

- Refused figures keep `originalSrc` provenance while the `src` key is omitted entirely (destructured out, not set to undefined) — no stale remote URL survives into the canonical model, and the provenance stays diagnostic
- `refusedCount` counts per-figure occurrences (matching the placeholders the reader sees); pre-existing no-src figures are disclosed by the D20-06 placeholder surface, not the warning count — locked by the nested-container cell
- Byte-identical twins (same assetId from different URLs) reuse the first budget admission without double-charging — D7-07 identical-bytes-self-identify composed with the budget
- Envelope tamper failures throw `IngestionError("server-error")` — the calm catch-all copy is the right reader surface for a tampered/buggy server; no enum widening needed (the plan's "narrowly widened OR existing reason" resolved to the existing reason)
- Server encodes with `Buffer.toString("base64")` (C++-side — the 11-04 String.fromCharCode stack limit never applies); the client's chunked `base64ToBytes` mirrors the encode helper's discipline

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Schema one task behind the server envelope**
- **Found during:** Task 2 (ingest wiring)
- **Issue:** Task 2 attaches `assets` to the ok-return but Task 3 owns the IngestionResponseSchema widening — the literal would not typecheck against the unwidened union
- **Fix:** temporary explicit `as IngestionResponse` cast + NOTE comment; removed in Task 3's commit the moment the schema carried the field
- **Files modified:** server/ingest.ts
- **Verification:** tsc clean at both commits; cast removal diff visible in 2ee12bf
- **Committed in:** 7604d40 (cast added), 2ee12bf (cast removed)

**2. [Rule 3 - Blocking] Zod .default([]) output-required ripples**
- **Found during:** Task 3 (tsc --noEmit after the schema widening)
- **Issue:** `.default([])` makes `assets` REQUIRED on the parsed output — five mock sites constructing ok-envelopes/IngestionSuccess failed to compile (AddDialog ×3, ingest-adapter, vercel-endpoint)
- **Fix:** each mock gained `assets: []` with a phase comment; the epub book return in ingest.ts also emits `assets: []` until 20-06
- **Files modified:** tests/component/AddDialog.test.tsx, tests/unit/server/ingest-adapter.spec.ts, tests/unit/server/vercel-ingest-endpoint.spec.ts, server/ingest.ts
- **Verification:** tsc clean; full unit suite 1504/0/13
- **Committed in:** 2ee12bf

**3. [Rule 1 - Test-craft] refusedCount semantics correction in the RED spec**
- **Found during:** Task 1 GREEN (12/13)
- **Issue:** the byte-identity cell expected refusedCount 4, counting the pre-existing no-src figure — but the stage's warning count covers only figures IT refused (http srcs with a refusal resolution)
- **Fix:** expectation corrected to 3 with a comment citing the D20-06 placeholder-as-disclosure split; implementation unchanged
- **Files modified:** tests/unit/server/assetStage.spec.ts
- **Verification:** 13/13 green
- **Committed in:** c664b89

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 test-craft)
**Impact on plan:** All fixes were sequencing/compile correctness requirements of the planned design — no scope creep, no behavior changes beyond the plan's contract.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration; no new packages (composition over 20-01's substrate, exactly as PATTERNS predicted).

## Threat Surface

All six threat-register mitigations landed as planned: T-20-06 (client re-validation), T-20-07 (response budget), T-20-08 (count cap), T-20-09 (deadline + concurrency 4), T-20-10 (extractionWarnings disclosure), T-20-11 (src rewritten to asset: refs at ingest). No new security-relevant surface beyond the plan's threat model.

## Next Phase Readiness

- 20-03 (persistence) consumes `IngestionSuccess.assets: ValidatedAsset[]` exactly as exposed
- 20-04 (renderer) consumes the three figure states + stored dims; `assetRef` discrimination already in the schema
- 20-06 (EPUB) reuses `figureSrcResolver` (shipped here), `sniffImageAsset`, `rewriteFiguresWithAssets`, `validateEnvelopeAssets`, and the book envelope's `assets` field (schema + default already in place)
- 20-07 re-checks the cap constants against corpus evidence (tuning is a named follow-up)
- IMG-01/IMG-02 remain Pending in REQUIREMENTS.md by design — they close at the e2e/corpus plans (20-04/20-05 imagery specs, 20-07), mirroring the 20-01 split precedent

## Self-Check: PASSED

- Created files exist: server/assetStage.ts ✓, tests/unit/server/assetStage.spec.ts ✓
- All five task commits present in git log: 190ae42, c664b89, 7604d40, 7a22cb1, 2ee12bf ✓
- Verification commands re-run: the five plan specs (assetStage, markdown-to-blocks, extraction, ingestion-client, ingestion-schema) → 167/167 ✓; full unit suite → 1504 passed / 0 failed / 13 documented skips ✓; ssrf-matrix chromium → 19 passed / 2 documented residual skips ✓; server/pdfToBlocks.ts + server/safeFetch.ts → 0-line diff vs pre-plan HEAD ✓; rg checks: figureSrcResolver ×9, runAssetStage ×2, extractionWarnings push, AssetEnvelopeSchema ×5, sha256/digest ×3 ✓

---
*Phase: 20-safe-local-image-fidelity*
*Completed: 2026-08-31*
