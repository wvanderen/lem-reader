---
phase: 7
slug: ingestion-substrate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-10
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `07-RESEARCH.md` §Validation Architecture (the four phase-exit gates: SSRF matrix SC#3, mXSS suite SC#4, round-trip anchor gate SC#1, v1→v3 Dexie migration SC#5).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (unit)** | Vitest 4.1.10 (existing) + jsdom env for `/server` unit tests |
| **Framework (e2e)** | Playwright 1.61.1 (existing) — chromium/firefox/webkit for reader-flow; real `wrangler pages dev` for SSRF integration |
| **Config file (unit)** | `vitest.config.ts` (existing; extend with a `server` project for `/server` imports) |
| **Config file (e2e)** | `playwright.config.ts` (existing; extend `webServer` to boot `wrangler pages dev` alongside `vite dev`) |
| **Quick run command** | `npm run test:unit -- --run` |
| **Full suite command** | `npm run test` (test:unit --run && test:e2e) |
| **Estimated runtime** | ~30–90 seconds (unit: fast; e2e adds the wrangler-backed SSRF matrix across 3 browsers) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run` (covers mXSS + extraction + normalization + confidence + slugify + migration-logic)
- **After every plan wave:** Run `npm run test` (full suite — adds SSRF integration matrix + happy-path e2e + Dexie migration e2e across chromium/firefox/webkit)
- **Before `/gsd-verify-work`:** Full suite must be green; all four phase-exit gates MUST pass
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

> Tasks are TBD until PLAN.md files exist. The planner must populate a row per task. The Requirement + Test-Type + Command anchors below are the contract the planner fills against.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-0x | 01 (Wave-1 spike) | 1 | ING-07/ING-08 | T-7-SSRF / T-7-XSS | jsdom-on-Workers compat resolved; DOMPurify safe on chosen DOM | spike + unit | `npx vitest run tests/unit/server/mxss.spec.ts` | ❌ W0 | ⬜ pending |
| 7-02-0x | (SSRF guard) | 1–2 | ING-08 | T-7-SSRF | private/loopback/link-local/CGNAT/cloud-metadata/dns-rebinding refused; no upstream body on refusal | e2e (integration) | `npx playwright test tests/e2e/ingestion/ssrf-matrix.spec.ts` | ❌ W0 | ⬜ pending |
| 7-03-0x | (extraction+sanitize) | 2 | ING-01/ING-02/ING-07 | T-7-XSS | Readability → DOMPurify → 9-kind Block tree; no script/on\*/javascript:/svg/math | unit (server) | `npx vitest run tests/unit/server/extraction.spec.ts && npx vitest run tests/unit/server/mxss.spec.ts` | ❌ W0 | ⬜ pending |
| 7-04-0x | (round-trip anchor gate) | 2 | ING-01 | — | every ingested article: TextPositionSelector+TextQuoteSelector → `confident` before entry | unit (server) | `npx vitest run tests/unit/server/normalization.spec.ts` | ❌ W0 | ⬜ pending |
| 7-05-0x | (confidence model) | 2 | ING-06 | — | three-state confident/low/unsupported with reader-visible reason | unit (server) | `npx vitest run tests/unit/server/confidence.spec.ts` | ❌ W0 | ⬜ pending |
| 7-06-0x | (slug+dedupe) | 2 | ING-01 | — | `id = slugify(canonical URL)`; re-ingest refused | unit (server) | `npx vitest run tests/unit/server/slugify.spec.ts` | ❌ W0 | ⬜ pending |
| 7-07-0x | (Dexie v3 + repo swap) | 2–3 | ING-01 | — | v1/v2 byte-unchanged; v3 additive; DexieLibrarySource implements ArticleRepository | e2e | `npx playwright test tests/e2e/ingestion/dexie-migration.spec.ts` | ❌ W0 | ⬜ pending |
| 7-08-0x | (ingestion form + client) | 3 | ING-01/ING-02/ING-06 | — | URL + paste-HTML → /api/ingest; honest failures via `.status` | e2e (happy-path) | `npx playwright test tests/e2e/ingestion/happy-path.spec.ts` | ❌ W0 | ⬜ pending |
| 7-09-0x | (repo-wide grep gate) | 3 | ING-07 | T-7-XSS | zero `dangerouslySetInnerHTML` in src/ server/ functions/ | repo grep | `! grep -rn "dangerouslySetInnerHTML" src/ server/ functions/` | ✅ (CI step) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test stubs + framework wiring that MUST land before the rest of the phase can claim automated verify on any task:

- [ ] `tests/unit/server/mxss.spec.ts` — covers ING-07 (mXSS gate, SC#4); DOMPurify Attack Classes payload corpus
- [ ] `tests/unit/server/extraction.spec.ts` — covers ING-01/ING-02 (Readability output → Block tree)
- [ ] `tests/unit/server/normalization.spec.ts` — covers ING-01 (round-trip anchor gate, SC#1)
- [ ] `tests/unit/server/confidence.spec.ts` — covers ING-06 (three-state thresholds)
- [ ] `tests/unit/server/slugify.spec.ts` — covers D7-07 (IDN/tracking-param normalization)
- [ ] `tests/e2e/ingestion/ssrf-matrix.spec.ts` — covers ING-08 (SSRF gate, SC#3); requires `wrangler pages dev` in CI
- [ ] `tests/e2e/ingestion/happy-path.spec.ts` — covers ING-01 (real URL → reader)
- [ ] `tests/e2e/ingestion/dexie-migration.spec.ts` — covers SC#5 (v1→v3 snapshot)
- [ ] Framework install: `wrangler@4.120.1` + `@cloudflare/vite-plugin@1.51.2` + `@mozilla/readability@0.6.0` + `isomorphic-dompurify@3.22.0` + `ip-address@10.5.0` (devDeps) — Wave 0
- [ ] `vitest.config.ts` extension: a `server` project that imports `/server` code with the jsdom env
- [ ] `playwright.config.ts` extension: `webServer` boots `wrangler pages dev` alongside `vite dev` for the ingestion e2e project
- [ ] Repo-wide `dangerouslySetInnerHTML` grep gate as a CI step (ING-07 structural defense; independent of ESLint)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-publisher URL extraction quality (calm reading feel) | ING-01 | The round-trip + confidence gates are automated; "calm, booklike feel vs v1.0 fixture" is subjective | Open an ingested real-publisher article and a fixture side-by-side; confirm pagination, annotation, and location restore are indistinguishable. Confirm low-confidence banner appears in DOC-06 voice. |

---

## The Four Phase-Exit Gates (detailed structure)

> Lifted verbatim from `07-RESEARCH.md` §Validation Architecture so verify-phase reads them without a round-trip.

### Gate 1: SSRF Regression Matrix (`tests/e2e/ingestion/ssrf-matrix.spec.ts`) — SC#3
Runs against REAL `wrangler pages dev` (the only honest way to exercise fetch+DNS+redirect). Must cover all 9 measures (Pitfall 3): scheme allowlist (file/gopher/data/dict/ftp refused), private/loopback/link-local IPs refused, cloud-metadata (169.254.169.254, metadata.google.internal, metadata.amazonaws.com) refused, CGNAT (100.64/10) refused, encoding bypasses (0x7f000001, dword, octal, IPv4-mapped IPv6) refused, redirect-into-internal refused (per-hop re-validation), DNS-rebinding simulation refused OR documented residual risk, and NO upstream body on refusal (every refused request returns ONLY `{ reason }`).

### Gate 2: mXSS Regression Suite (`tests/unit/server/mxss.spec.ts`) — SC#4
Pure Node unit test. Feed DOMPurify Attack Classes & Bypass History payloads through the full pipeline and assert the Block tree contains ZERO `<script>`, ZERO inline `on*`, ZERO `javascript:` URIs (ArticleSchema `linkableUrl` refinement fires), ZERO SVG/MathML. Repo-wide grep gate: `grep -rn "dangerouslySetInnerHTML" src/ server/ functions/` returns ZERO matches.

### Gate 3: Round-Trip Anchor Gate (`tests/unit/server/normalization.spec.ts` + inline in `server/ingest.ts`) — SC#1
Runs INLINE in the pipeline — every successfully ingested article MUST pass N-offset `deriveQuoteSelector` → `resolveQuoteSelector` → `confident` before it is returned to the client. An ingested article that cannot round-trip is REFUSED (`round-trip-anchor-failed`), not admitted to the library.

### Gate 4: v1→v3 Dexie Migration Snapshot (`tests/e2e/ingestion/dexie-migration.spec.ts`) — SC#5
Seed a Dexie v1/v2 database with the v1.0 fixture snapshot; trigger the v3 upgrade; assert EVERY v1.0 row is intact and addressable (settings readable, locations resolve, highlights re-anchor, notes attach).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (all 8 test files + framework install + config extensions)
- [ ] No watch-mode flags (vitest `--run`, playwright non-watch)
- [ ] Feedback latency < 90s (unit) / full-suite gated per-wave
- [ ] `nyquist_compliant: true` set in frontmatter (planner flips after populating the Per-Task Map)

**Approval:** pending
