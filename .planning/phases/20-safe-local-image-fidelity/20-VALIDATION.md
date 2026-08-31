---
phase: 20
slug: safe-local-image-fidelity
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-31
updated: 2026-08-31
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from plan `<verify>` blocks + 20-RESEARCH §Validation Architecture (revision R1, per checker fix — includes the 20-04/20-08 split).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit, jsdom env) + Playwright Test 1.61.1 (e2e — chromium/firefox/webkit) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` (existing, byte-stable) |
| **Quick run command** | `npx vitest run tests/unit/server/fetchImageAsset.spec.ts` (unit) · the touched-spec Playwright file(s) from the map below |
| **Full suite command** | `npm run test` (unit `--run` + 3-engine e2e; exit 0 = honest gate — 19-05 discipline) |
| **Estimated runtime** | ~30–60s (unit quick) · ~2–5min (touched e2e subset, 1 engine) · ~5–12min (imagery 3-engine matrix) · ~15–25min (full suite) |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted spec file(s) from the map below (`vitest run <files>` / `playwright test <spec> --project=chromium`)
- **After every plan wave:** Run `npm run test:unit -- --run && npm run test:e2e` (3 engines, fresh dev server — the 15-04 aged-server lesson; bounded `--workers` if machine load starves webkit, per 18-04, recorded honestly)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Phase gate (20-07-T1):** full `npm run test` in ONE invocation — exit 0, no engine skips; exact counts recorded in 20-OUTPUT.md
- **Max feedback latency:** 120 seconds (quick command)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-T1 | 01 | 1 | IMG-02 | T-20-SC, T-20-03 | Exact-pinned server-only installs (image-size/is-animated — audit OK, no caret/tilde, no install scripts, no src/ imports); cap constants single shared home re-exported; data: URI src unrepresentable in the schema union (parse-time scheme guarantee); width/height min(1) | unit + grep | `npx vitest run tests/unit/schema.test.ts tests/unit/ingestion-schema.test.ts && rg -c "MAX_ASSET_BYTES" server/limits.ts` | ✅ (extends) | ⬜ pending |
| 20-01-T2 | 01 | 1 | IMG-02 | T-20-01, T-20-04 | The SAME 9-measure SSRF pipeline parameterized — no forked image egress path; post-read bytes.byteLength re-check (header lies); document profile byte-stable (ssrf-matrix.spec untouched as the pin); refactor isolated in one commit | unit + e2e | `npx vitest run tests/unit/server/safe-fetch.spec.ts && npx playwright test tests/e2e/ingestion/ssrf-matrix.spec.ts --project=chromium` | ✅ (extends; ssrf-matrix = untouched pin) | ⬜ pending |
| 20-01-T3 | 01 | 1 | IMG-02 | T-20-02, T-20-03, T-20-05 | Magic-byte sniff authoritative over content-type headers (SVG-under-image/png refuses "type"); pixel cap on SNIFFED dims pre-store; EXIF orientation ≥5 swaps stored dims; every refusal is a returned typed value, never a throw; ImageAssetRefusal stays closed at fetch-level arms | unit | `npx vitest run tests/unit/server/fetchImageAsset.spec.ts` | ❌ W0 — created by this task | ⬜ pending |
| 20-02-T1 | 02 | 2 | IMG-01, IMG-02 | T-20-07, T-20-08, T-20-09 | Stage caps (count/budget/deadline) are typed AssetResolution arms — per-figure refusal, never a throw; deterministic document-order budget; alt+caption substrate byte-identical across the rewrite (D-05/D19-01) | unit | `npx vitest run tests/unit/server/assetStage.spec.ts` | ❌ W0 — created by this task | ⬜ pending |
| 20-02-T2 | 02 | 2 | IMG-01 | T-20-10, T-20-11 | Refusal count disclosed via extractionWarnings — never silent; src rewrite to asset: refs kills the beacon path; PDF path untouched (D20-01); default resolver-absent htmlToBlocks path byte-stable; Markdown non-http srcs → refused FigureBlocks (OQ2) | unit | `npx vitest run tests/unit/server/markdown-to-blocks.spec.ts tests/unit/server/extraction.spec.ts tests/unit/server/assetStage.spec.ts tests/unit/server/ingest-pdf.spec.ts` | ✅ (extends; pdf spec = untouched pin) | ⬜ pending |
| 20-02-T3 | 02 | 2 | IMG-02 (transport) | T-20-06, T-20-07 | The server is never trusted: zod parse + chunked base64 decode + decoded byteLength equality + sha256 re-hash === assetId at the client boundary; mismatch = calm typed whole-ingest refusal; assets absent → default [] back-compat | unit | `npx vitest run tests/unit/ingestion-client.test.ts tests/unit/ingestion-schema.test.ts` | ✅ (extends) | ⬜ pending |
| 20-03-T1 | 03 | 2 | IMG-03, IMG-04 | T-20-12 | Zod safeParse per asset row at the store boundary — corrupt rows drop calmly, never coerce; v6 Dexie block additive-only, v1..v5 byte-unchanged, no .upgrade() callback | unit + grep | `npx vitest run tests/unit/persistence/assets-cascade.spec.ts && rg -c "version\(6\)" src/persistence/db.ts` | ❌ W0 — spec created by this task | ⬜ pending |
| 20-03-T2 | 03 | 2 | IMG-03, IMG-04 | T-20-13, T-20-14 | One read-write transaction: asset-put failure rolls back the article put (saved article always complete); article/book delete cascades + re-ingest upsert range-delete all inside the same transaction (no orphan blobs) | unit | `npx vitest run tests/unit/persistence/assets-cascade.spec.ts tests/unit/library/library-source.test.ts tests/unit/persistence/books-store.test.ts` | ✅ (spec from T1 + existing suites) | ⬜ pending |
| 20-04-T1 | 04 | 3 | IMG-03, IMG-04 (save leg) | T-20-14 | Validated assets persist WITH the article/book in the save calls (complete saves); fixture registry self-verifies at module load; corpus carries zero remote wikimedia URLs (grep-gated exit code) | grep + e2e | `! rg -q "upload.wikimedia" src/fixtures/articles/figure-heavy.canonical.json && npx playwright test tests/e2e/ingestion/happy-path.spec.ts --project=chromium` | ❌ W0 — figure-assets.ts + regen fixture created by this task; happy-path.spec extends | ⬜ pending |
| 20-04-T2 | 04 | 3 | IMG-03, IMG-05, IMG-06 | T-20-05, T-20-16, T-20-17 | img element emitted ONLY on the resolved-object-URL branch (remote src structurally unrenderable); provider-owned create/revoke symmetry (revoke-all on switch/unmount, StrictMode-safe); refused/legacy/broken render the identical placeholder inside the same reserved box; caption-mark path byte-identical; no transition/animation CSS | unit + grep | `npx vitest run tests/unit/content/asset-provider.test.tsx && rg -c "figure-placeholder" src/app.css` | ❌ W0 — asset-provider.test.tsx created by this task | ⬜ pending |
| 20-05-T1 | 05 | 3 | IMG-04 | T-20-18 | v4 schema union (v1–v3 read unchanged, >4 forward-refuses); manifest assets block hashed into the verified metadata (tamper-evident); asset zip entries service-generated `assets/<articleId>/<assetId>` | unit | `npx vitest run tests/unit/portability/bundle-v4.spec.ts` | ❌ W0 — created by this task | ⬜ pending |
| 20-05-T2 | 05 | 3 | IMG-04 | T-20-19, T-20-20, T-20-22 | fflate filter-first entry caps + per-asset byte cap + total budget (zip bombs); per-asset sha256 + byteLength equality (transit tampering → corrupted refusal, never-throw); no-broken-refs gate; puts-only applyImport transaction with rollback proof; isSafeEntryName on every read | unit | `npx vitest run tests/unit/portability/bundle-v4.spec.ts tests/unit/portability/validate-bundle.test.ts` | ✅ (bundle-v4 from T1 + existing validate-bundle) | ⬜ pending |
| 20-05-T3 | 05 | 3 | IMG-04 | T-20-21 | Missing/damaged asset entries skip the article with an EXPLICIT preview warning — never silent placeholder-rewrite; assets ride article D9-14 conflicts (no new ConflictKind); no zod/crypto inside the apply closure | e2e | `npx playwright test tests/e2e/portability/round-trip.spec.ts tests/e2e/portability/import-preview.spec.ts --project=chromium` | ✅ (extends strengthen-only) | ⬜ pending |
| 20-06-T1 | 06 | 4 | IMG-01, IMG-02 | T-20-23, T-20-24, T-20-25, T-20-26, T-20-27 | Zero-network container extraction (fetch stubbed-to-throw cell passes); composed chapter-relative keys pass isSafeEntryName before any byte use; sniffImageAsset caps apply minus fetch; cover images never extracted; per-figure refusal disclosure via extractionWarnings | unit | `npx vitest run tests/unit/server/epub-to-books.spec.ts tests/unit/server/ingest-epub.spec.ts` | ✅ (extends) | ⬜ pending |
| 20-06-T2 | 06 | 4 | IMG-01 | T-20-27 | EPUB e2e realignment is strengthen-only with D20 citations; admitted figures render as local assets (no downgrade placeholders); refused figures disclose honestly | e2e | `npx playwright test tests/e2e/epub-intake.spec.ts --project=chromium` | ✅ (extends) | ⬜ pending |
| 20-08-T1 | 08 | 5 | IMG-03, IMG-05, IMG-06 | T-20-05, T-20-15 | Non-vacuous offline proof: route-abort guard registered pre-navigation + asserted-empty external-request array (any accidental fetch fails); page-count identity across all img load/error events + no fallback banner; 5 formats × 3 engines decode cells; refusal placeholder + caption-mark cells in both modes | e2e | `npx playwright test tests/e2e/imagery --project=chromium --project=firefox --project=webkit` | ❌ W0 — the four imagery specs created by this task | ⬜ pending |
| 20-08-T2 | 08 | 5 | IMG-05, IMG-06 (corpus honesty) | T-20-29 | Realignment is strengthen-only: every changed expectation carries a D20-xx citation, zero deletions without citation; regressions route back to the owning plan — pins never nudged to green; no production file touched | e2e | `npx playwright test tests/e2e/open-every-fixture.spec.ts --project=chromium && npx playwright test tests/e2e/library tests/e2e/pagination --project=chromium` | ✅ (extends) | ⬜ pending |
| 20-07-T1 | 07 | 6 | IMG-01..06 (gate) | T-20-28 | One-invocation honest gate from a fresh dev server; exact unit+e2e counts recorded; failures classified (stale-pin / regression / pre-existing) — never a silent subset/grep/engine-skip | full suite | `npm run test` | ✅ | ⬜ pending |
| 20-07-T2 | 07 | 6 | IMG-01..06 (ledger) | T-20-28, T-20-29 | Closure ledger maps every IMG row to plan + spec evidence; animated-AVIF residual + cap-tuning notes recorded honestly in deferred-items.md; no requirement claimed without an evidence pointer | grep (ledger) | `rg -c "IMG-0[1-6]" .planning/phases/20-safe-local-image-fidelity/20-OUTPUT.md` | ❌ W0 — 20-OUTPUT.md created by this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan — the phase's test scaffolds ship inside the executing tasks, per 20-RESEARCH §Validation Architecture §Wave 0 Gaps (mapped to owners):

- [ ] `tests/unit/server/fetchImageAsset.spec.ts` — sniff matrix (5 formats × valid/animated/svg-lying-header/pixel-bomb/EXIF-rotated; every refusal typed) — created by **20-01-T3**
- [ ] `tests/unit/server/assetStage.spec.ts` — collect/budget/rewrite; per-figure typed refusals; substrate byte-identity — created by **20-02-T1**
- [ ] `tests/unit/persistence/assets-cascade.spec.ts` — atomic save, cascades, upsert replacement — created by **20-03-T1**
- [ ] `src/fixtures/figure-assets.ts` + regenerated `figure-heavy.canonical.json` — self-verifying per-format fixture bytes — created by **20-04-T1**
- [ ] `tests/unit/content/asset-provider.test.tsx` — resolve/revoke lifecycle symmetry — created by **20-04-T2**
- [ ] `tests/unit/portability/bundle-v4.spec.ts` — v4 round-trip/bomb/sha256/dangling-ref/conflict-ride — created by **20-05-T1**
- [ ] `tests/e2e/imagery/{offline-reopen,geometry,decode-matrix,refusal-matrix}.spec.ts` — the 3-engine matrix — created by **20-08-T1**
- [ ] Corpus pins realignment (library/pagination/open-every-fixture, strengthen-only, cited) — executed by **20-08-T2**
- [ ] `20-OUTPUT.md` gate record + closure ledger — created by **20-07-T1/T2**
- [ ] Framework install: **none needed** — infrastructure complete (20-RESEARCH §Environment Availability: all dependencies ✓; the two npm installs are runtime deps owned by 20-01-T1's legitimacy-audit gate)

*`wave_0_complete` flips true when the first task-created scaffold commits (20-01-T3 in Wave 1).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.* The placeholder surface copy ("Image unavailable.") is asserted verbatim in 20-04-T2 acceptance and exercised by 20-08-T1 refusal cells; no new UI interaction pattern is introduced beyond the project baseline (20-UI-SPEC §Regression Targets lists no phase-20-specific manual row).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (19/19 rows; 9 task-created scaffolds ship inside their owning tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 covers all MISSING references (scaffold owners listed above; existing infra covers the rest)
- [x] No watch-mode flags (`vitest run` throughout; Playwright non-watch)
- [x] Feedback latency < 120s (quick command)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-31 (planner sign-off, revision R1 — populated from plan verify blocks + 20-RESEARCH §Validation Architecture per checker fix)
