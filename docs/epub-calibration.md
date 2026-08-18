# EPUB Calibration — threshold tuning against real EPUBs (D12-12)

The chapter-admission and TOC-merge thresholds (every detection/assembly
number in `server/epubToBooks.ts`'s `EPUB_THRESHOLDS`) are calibrated
against **real EPUBs** before promotion. This document is the workflow
contract: how evidence is derived locally and replayed in CI — the
`docs/pdf-calibration.md` discipline (D11-04/05/06), EPUB edition.

## Why real EPUBs stay local (the accepted limitation)

Real books carry licensing and size constraints, so the corpus lives in
`corpus/epub/` — **gitignored** (D12-12). What commits is the **derived
evidence** only:

- `tests/unit/server/epub-calibration/manifest.json` — corpus file list +
  SHA-256 integrity hashes + expected shape per book (`drmFree`, `navType`
  nav/ncx/none, `expectedChapters`, `tocResolvable`, optional producer)
- `tests/unit/server/epub-calibration/epub-evidence.json` — the derived
  record: per-book verdicts (admitted chapter count, fallbackUsed,
  anchorRoundTrip) and the exact `EPUB_THRESHOLDS` snapshot that produced
  them

**CI cannot re-derive the numbers** — it replays the committed record
against the bar. That limitation was explicitly accepted at phase planning
(the D11-04 mirror). Synthetic EPUB fixtures (12-01's self-verifying
generator) exercise code paths and are committable BY CONSTRUCTION; they
are never calibration inputs.

## The promotion bar (D12-12)

`validateEvidence` (in `tests/unit/server/epub-calibration/harness.ts`)
enforces, inside `npm run test` via the always-on `replay.spec.ts`:

1. **Every DRM-free corpus book admitted** — the corpus contains no
   expected-refusal class (DRM books belong in the 12-01 synthetic refusal
   tests); a real book the reader refuses is a detection failure.
2. **Admitted `chapterCount === expectedChapters`** — the TOC-merge
   admitted exactly the chapters the human counted in the real book
   (front matter included where it admits, disclosed skips excluded).
3. **`fallbackUsed === false` whenever `tocResolvable`** — the calibration
   warning sign: the one-chapter-per-spine-item fallback firing on a book
   whose nav/NCX resolves means href normalization regressed (Pitfall 1).
   Books with `navType: "none"` record the fallback honestly.
4. **`anchorRoundTrip === true` on every admitted entry** — the per-chapter
   SC#4 `assertRoundTripAnchor` gate passed inside `ingest({epub})`.
5. **No placeholders:** results non-empty (refuse-empty — the
   `fingerprint.compare.ts` exit-2 precedent), thresholds present, hashes
   agreeing with the manifest — and `replay.spec.ts` pins the shipped
   `EPUB_THRESHOLDS` deep-equal against the evidence snapshot, so the only
   way to change a detection number is to re-derive against the corpus and
   commit the refreshed record.

## Local derive workflow

1. **Place the corpus.** Put 6–10 DRM-free EPUBs into `corpus/epub/`
   spanning the shape classes (see that directory's README for
   composition).
2. **Report the shapes.** Tell the agent each filename → navType, expected
   admitted chapter count, whether the TOC should resolve (+ producer if
   known). The agent computes SHA-256 values and authors `manifest.json`.
3. **Derive.** `npm run calibrate:epub` — env-gated
   (`EPUB_CALIBRATION_DERIVE=1`) so CI never attempts the local-only
   derive. The derive verifies corpus presence + SHA-256 against the
   manifest (refuses on mismatch or absence), runs the real adapter +
   orchestrator path (`ingest({epub})` → `epubToBooks` → the current
   `EPUB_THRESHOLDS`), and writes `epub-evidence.json`.
4. **Review + tune to bar.** If any book refuses, admits the wrong chapter
   count, or trips the fallback on a resolvable TOC, adjust
   `EPUB_THRESHOLDS` in `server/epubToBooks.ts` — **strengthen-only** (the
   full synthetic suites from 12-02/12-04,
   `npx vitest run tests/unit/server/epub-to-books.spec.ts
   tests/unit/server/ingest-epub.spec.ts`, must stay green after any
   change — synthetic extreme cases must never flip) — and re-derive.
5. **Commit derived evidence only** — manifest, `epub-evidence.json`,
   `replay.spec.ts`, and any `EPUB_THRESHOLDS` change. Never the books.

## CI replay contract

- `replay.spec.ts` runs in the normal vitest `server` project (always-on,
  part of `npm run test`, no env var). It loads the committed
  `manifest.json` + `epub-evidence.json` and runs `validateEvidence` — a
  regressed threshold set, a drifted hash, or a below-bar verdict row
  fails the build, and the thresholds pin fails any uncalibrated
  `EPUB_THRESHOLDS` change.
- **Missing record fails loudly:** if `epub-evidence.json` is absent the
  spec fails with *"EPUB calibration requires the local corpus — see
  docs/epub-calibration.md"* — never a silent skip.
- `derive.spec.ts` is the LOCAL-only derive driver, gated by
  `describe.skipIf(process.env.EPUB_CALIBRATION_DERIVE !== "1")` — the
  documented, visible skip in normal runs (the accepted D12-12 CI
  limitation). It runs the corpus verification, the derive, the
  refuse-empty write guard, and the committed write.
- The derive rides vitest (not plain `node`) because vitest owns the
  repo's TS module resolution; exit semantics map to spec pass/fail —
  "exit 2"-class refusals (missing corpus, tampered SHA-256, empty
  results) are failing assertions inside the spec.
