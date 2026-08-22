---
phase: quick-260821-ov7
plan: 01
subsystem: ingestion
tags: [ingest, paste, plain-text, markdown-intake, reroute]
requires:
  - "server/ingest.ts staged pipeline (07-05) + markdown branch (08-01, D8-16/D8-17/D8-18)"
provides:
  - "Exported looksLikePlainText predicate + Stage 0.5 reroute ({html: tagless} → {markdown: tagless})"
  - "Plain-text pastes of rendered article text admit as md-<content-hash> articles identical to .md uploads"
affects:
  - "Every /api/ingest client (dev middleware, Vercel prod api function, future Cloudflare shape) — all funnel through ingest() per D7-05"
tech-stack:
  added: []
  patterns:
    - "Single-place orchestrator reroute preserving exactly-one-of by construction (1:1 variant rewrite)"
key-files:
  created:
    - tests/unit/server/ingest-plaintext-paste.spec.ts
  modified:
    - server/ingest.ts
    - src/ingestion/IngestControl.tsx
decisions:
  - "D1/D2: plain text admitted as first-class via the EXISTING markdown intake through a server-side Stage 0.5 reroute in ingest() — one place, all clients fixed"
  - "D3: rerouted articles take the EXISTING D8-17 title chain (no filename → 'Markdown document') — zero new title machinery"
  - "Conservative predicate direction: any tag opener (letter/slash/bang after '<') keeps the byte-stable html path, so prose mentioning a tag (the <br> case) is never rerouted"
metrics:
  duration: 76 min
  completed: 2026-08-21
status: complete
---

# Quick Task 260821-ov7: Fix paste flow — accept plain-text pastes Summary

Plain-text pastes (rendered article text, no HTML tags) now route through the existing markdown intake via an exported `looksLikePlainText` predicate + Stage 0.5 reroute in `server/ingest.ts`, producing the same `md-<content-hash>` article (D8-18) the identical text uploaded as `.md` would — while tagged HTML keeps the byte-stable Readability path and thin pastes keep the honest refusal.

## Tasks Completed

| Task | Name | Commit | Outcome |
| ---- | ---- | ------ | ------- |
| 1 | RED — plain-text paste reroute spec | 512d94d | 13 cases (8 predicate + 5 integration) written against the real `ingest()` orchestrator, zero mocks (ingest-pdf.spec.ts convention). RED run recorded honestly: **11 failed / 2 passed, exit=1** — the 8 predicate cases fail on the missing export, the 3 happy-path integration cases fail against the current refusing behavior; the 2 passing cases are the honest-refusal regression pins (whitespace-only + single-tag refuse today via the html path and must keep refusing — correct for RED). |
| 2 | GREEN — Stage 0.5 plain-text reroute | afbfde3 | Exported `looksLikePlainText` + `HTML_TAG_OPENER` regex (`/<[A-Za-z!/]/` against trimmed content) with the D8-16/Pitfall 8-2 security citation; Stage 0.5 reroute inserted after the exactly-one-of validation (`{html: tagless}` → `{markdown: tagless}`, `"html" in input` narrowing, no cast); dispatch flags + branch-body reads mechanically renamed to the rerouted `request`. Verify: new spec + normalization.spec.ts + markdown-to-blocks.spec.ts + vercel-ingest-endpoint.spec.ts — **4 files, 57 tests, all green, exit=0**. |
| 3 | Honest paste-box label + full gates | 2a33ea0 | "Paste HTML" → "Paste HTML or text" (htmlFor-linked accessible name) + 260821-ov7 citation comment. Gates: component spec **12/12 green** (unanchored `/paste html/i` still matches — zero test edits), `npm run build` **green** (build:api self-containment assertions + tsc + vite), eslint on the three touched files **clean**, full unit suite **1261 passed / 0 failed / 13 intentional skips (88 files passed, exit=0)**. |

## TDD Gate Compliance

- RED gate: `test(quick-260821-ov7): ...` commit 512d94d exists; the pre-implementation run exited non-zero (11/13 failing) with output recorded above.
- GREEN gate: `feat(quick-260821-ov7): ...` commit afbfde3 follows and turns the spec fully green (57/57 across the four-suite verification set).
- No refactor commit needed — the mechanical rename was part of the GREEN implementation.

## Verification Evidence

- Locked decision 5 coverage:
  - Tag-less multi-paragraph paste → `ok:true`, all-paragraph blocks, `md-<12hex>` id, `source:"markdown"` / `origin:"upload"`, title `"Markdown document"` (existing D8-17 fallback), `provenance.sourceUrl` undefined, confidence confident|low (integration case 1).
  - HTML paste unchanged: predicate negatives + the cited normalization.spec.ts proofs (full v1.0 fixture HTML via `ingest({html})` → ok:true through the html pipeline; `"<p>short</p>"` → thin-content refusal — both contain tag openers, never rerouted) + full suite green.
  - Honest refusals: whitespace-only (`"   \n  "`) and single-tag (`"<b>hi</b>"`) → `toEqual({ok:false, reason:"extraction-unsupported"})` (integration cases 3–4).
  - D8-18 identity: same TEXT as `{html}` and `{markdown}` → identical article ids (integration case 2).
  - Non-tag angle bracket (`"count: 5 < 6"` prose) admits with paragraph blocks (integration case 5 — CommonMark literal `<`, D8-16 inert-text escape).
  - `tests/unit/server/vercel-ingest-endpoint.spec.ts` green (D7-05 contract untouched).
  - NO deploy executed — no `vercel` commands run (orchestrator deploys and live-verifies).
- Locked decision 4 scope guards: across the three commits, git history shows ONLY `server/ingest.ts`, `tests/unit/server/ingest-plaintext-paste.spec.ts`, `src/ingestion/IngestControl.tsx` changed. `functions/**`, `wrangler.toml`, `server/markdownToBlocks.ts` (internals), `server/pdfToBlocks.ts`, `server/epubToBooks.ts`, and all D7-05 adapters byte-untouched.
- Threat register mitigations honored: T-OV7-01 (D8-16 boundary cited in the predicate doc comment — strict CommonMark escapes raw HTML, Block tree inert JSON, React escapes text children, `react/no-danger` structural rule); T-OV7-02 (no new amplification — markdown uploads already run same-size text through the same parser; three-layer body caps unchanged); T-OV7-03 accepted as designed (source "markdown"/origin "upload" are existing valid enum members; content-hash id gives intended save-once dedupe).

## Deviations from Plan

None — plan executed exactly as written. (Stage 0's exactly-one-of locals were renamed `inputHas*` so the five dispatch flags could read the rerouted `request` — the structure the plan's "insert AFTER the validation block and BEFORE the five has* flag computations" prescribes; and one stale closure comment saying "from `input`" was corrected to "from the request" as part of the mechanical rename. Both are within the plan's prescribed shape, not deviations.)

## Self-Check: PASSED

- Files exist: `server/ingest.ts`, `tests/unit/server/ingest-plaintext-paste.spec.ts` (150 lines ≥ 80 min), `src/ingestion/IngestControl.tsx` — all FOUND.
- `looksLikePlainText` present in `server/ingest.ts`; `Paste HTML or text` present in `src/ingestion/IngestControl.tsx`.
- Commits exist on the branch: 512d94d, afbfde3, 2a33ea0 — all FOUND.
