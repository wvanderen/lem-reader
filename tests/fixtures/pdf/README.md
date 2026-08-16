# Synthetic PDF Fixtures (tests/fixtures/pdf/)

**These are GENERATED SYNTHETIC fixtures — committable by design.**

They exercise code paths (adapter parsing, scanned refusal, multi-column
refusal, outline-first heading mapping, dehyphenation) with known geometry.
They are **NOT** the D11-04 real-PDF calibration corpus — that corpus consists
of real-world PDFs, stays **local-only and gitignored**, and is used solely by
the calibration harness to derive/validate thresholds (SC#4b). Nothing in this
directory ever feeds calibration.

## Contents

| File | Purpose |
|------|---------|
| `generate-synthetic-pdfs.ts` | Deterministic generator + built-in integrity self-check |
| `synthetic-single-column.pdf` | 3 pages: 18pt bold title/heading, 12pt paragraphs, one hyphen-at-line-end split word (`conclu-` / `sion…`), ~200pt vertical gap between paragraph groups (figure stand-in) |
| `synthetic-two-column.pdf` | 2 pages, text in two x-ranges (~60–280 and ~312–532pt), each column well over 15% of page text — the refuse-side fixture for the D11-03 multi-column detector |
| `synthetic-scanned.pdf` | 2 pages with empty content streams — zero text items (the scanned/no-text-layer class) |
| `synthetic-outline.pdf` | 2 single-column pages + `/Outlines` tree with two bookmarks using explicit array destinations at page tops (outline-first heading fixture for D11-08) |
| `synthetic-corrupt.pdf` | Literal ASCII bytes `this is not a pdf` (the pdf-unreadable class) |

All valid fixtures are minimal PDF 1.4 documents: `%PDF-1.4` header, computed
xref offsets, `/MediaBox [0 0 612 792]`, Helvetica `/F1` + Helvetica-Bold
`/F2` resources, and `BT /Fx size Tf x y Td (text) Tj ET` operators. Each is
well under 10KB.

## Regenerating

```sh
node tests/fixtures/pdf/generate-synthetic-pdfs.ts
```

Requires Node with TypeScript type-stripping (Node ≥ 22.18 default; this repo
develops on Node 22 LTS). The script uses only `node:` builtins — zero repo
imports, zero npm dependencies.

**Output is deterministic (idempotent):** no timestamps, no random ids, no
environment reads. Re-running produces byte-identical files; the script proves
this itself every run.

## Built-in self-check

After writing, the generator re-reads every output and **exits non-zero** on
any violation:

1. The four valid fixtures begin with the `%PDF-` magic prefix.
2. The four valid fixtures exceed a 500-byte floor (guards against a
   truncated/empty emit).
3. The corrupt fixture contains its ASCII marker text.
4. A second in-process emit hashes byte-identical to the first AND to the
   bytes on disk (idempotency proof).

CI and local verification rely on this exit code — there is no separate spec
file for fixture integrity (the owning plans 11-02/11-03/11-05 create their
specs with real behavioral content; see 11-01-PLAN.md scope note).
