# 12-08-OUTPUT.md — the honest full-suite phase-gate record (Phase 12)

The 04-11 / 09-07 / 11-06 discipline: the executor runs the full suite
itself in ONE invocation, records every run honestly (counts + exit code),
never subsets or skips to force green. Permanent record for
`/gsd-verify-work`.

**Command:** `npm run test` (vitest unit+server projects, then Playwright
e2e across chromium / firefox / webkit + the chromium-throttled-mobile perf
project)

**Date:** 2026-08-18 (UTC) · executor: GSD 12-08 sequential run

## Run log (every invocation, in order)

| Run | Result | Detail |
| --- | --- | --- |
| 1 | **exit 1** | e2e 999 passed / **1 failed** / 6 skipped — `[firefox] tests/e2e/progress.spec.ts:101 READ-05 progress hairline › fill scaleX increases toward 1 after scrolling to the bottom` (scaleX 0.25 vs ≥0.9). Unit leg green (1162 passed / 13 skipped). Passed in isolation on re-run → fixed 300ms-sleep load race (commit `e66cdde`, the 09-07 webkit-race class: deterministic `expect.poll` over the same end condition). |
| 2 | **exit 1** | e2e 996 passed / **4 failed** / 6 skipped — all `[webkit]` `page.goto("http://localhost:5173/")` dev-server navigation timeouts (download-smoke A1, reduced-motion ×2, review-panel empty-states) under full-suite parallelism, minutes after the 8 GB corpus derive had run; the same cells passed in runs 1 and 3. Environment load race, not a code regression — no harness change made (cells green in isolation and in run 3). |
| 3 | **exit 0** | ✅ **the phase gate** — see counts below. |

## Final (green) single-invocation counts — Run 3

| Leg | Counts |
| --- | --- |
| **Unit (vitest, `unit` + `server` projects)** | Test files: **79 passed / 2 skipped** (81) — the 2 skips are the env-gated local-only derive drivers (`pdf-calibration/derive.spec.ts`, `epub-calibration/derive.spec.ts`). Tests: **1162 passed / 13 skipped** (1175) — the 13 are the documented intentional set (3 epub-derive + 10 pdf-derive/skip cells). Includes the always-on `epub-calibration/replay.spec.ts` (3 tests: loud-missing branch, D12-12 bar, EPUB_THRESHOLDS pin) and `harness.test.ts` (28). |
| **E2E (Playwright: chromium / firefox / webkit + chromium-throttled-mobile perf)** | **1000 passed / 0 failed / 6 skipped** (7.3 min). The 6 skips are the documented intentional set (local-only derive + workerd-unreachable spike cells). |
| **Total** | **2162 passed / 0 failed / 19 skipped · `npm run test` exit 0** |

## SC#4 structural gates (recorded the same session)

- **Renderer dependency:** `grep -rn "epubjs\|epub\.js" src/ server/ package.json` → **zero matches** (broader sweep incl. `functions/`, `dev-server/`, `@futurepress`, `readium` tokens → zero matches). No vendor EPUB renderer anywhere; `fast-xml-parser` 5.10.1 + `fflate` 0.8.3 are the only parsing additions and live server-side.
- **Client bundle:** `npm run build` (tsc + vite build, 140ms render) →
  `grep -rl "fast-xml-parser" dist/assets/` → **zero files**. Bonus
  (11-01 discipline): `jsdom|unpdf|pdfjs` also absent from every
  `dist/assets` file. `fflate` rides the approved Phase 9 client-portability
  allowlist (ExportImportService) — server-side usage never reached the
  bundle by name.
- **Corpus isolation:** `git check-ignore corpus/epub/x.epub` exits 0; only
  `corpus/epub/README.md` is tracked under `corpus/epub/`.

## Calibration summary (D12-12 — the evidence behind the gate)

- `npm run calibrate:epub` (env-gated local derive, 8 GB heap): 7/7 corpus
  books **admitted** at their manifest-expected chapter counts
  (5/5/38/6/1/13/6), `fallbackUsed: false` on every resolvable TOC,
  `anchorRoundTrip: true` on every admitted book, `EPUB_THRESHOLDS`
  snapshot pinned by the always-on replay (T-12-20).
- Two honest gap records in the committed manifest: `single_entry_toc`
  (verbatim from the human corpus report) and `minimal_v2_two_block_template`
  (the IDPF packaging template legitimately fails the D12-10 admission
  floor; consequence: `ncx_primary_toc` unrepresented by an admitting book —
  covered by the synthetic `ncxOnlyBook` suite instead).
- Production findings logged to `deferred-items.md`: anchor-gate allocation
  churn on whole-novel chapters (default-heap OOM), unbounded per-chapter
  stage loop outside `withEpubTimeout`, and reader-manufactured anchor
  ambiguity from identical unsupported-block fallback descriptions.
