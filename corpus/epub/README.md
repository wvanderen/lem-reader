# corpus/epub/ — the local real-EPUB calibration corpus (D12-12)

This directory holds the **real EPUBs** the Phase 12 detection/assembly
thresholds are calibrated against. It is **local-only**:

- **Never commit EPUBs into this directory.** Licensing and repository-size
  concerns keep the binaries out of git (user-accepted limitation, D12-12 —
  the D11-04 mirror). Everything here is gitignored except this README.
- **Never synthesize EPUBs as calibration fixtures.** Synthetic fixtures
  exercise code paths (and live in the committed self-verifying generator
  `tests/unit/server/epub-fixtures.ts`, Plan 12-01), but calibration numbers
  tuned against synthetic books prove nothing about real publisher output.
  D12-12 explicitly reserves the synthetic corpus for code paths.

## What belongs here

6–10 real, **DRM-free** EPUBs spanning the shapes the promotion bar
discriminates:

| Shape                              | Count | What it proves                                   |
| ---------------------------------- | ----- | ------------------------------------------------ |
| EPUB 3 nav, deep-nested TOC        | ≥ 1   | depth-1 units only; nesting does not fragment    |
| EPUB 3 nav, publisher chapter-split | ≥ 1  | spine ranges merge into one chapter per TOC entry |
| EPUB 2 NCX-only                    | ≥ 1   | the NCX fallback resolution path                 |
| OPF nested under OEBPS/            | ≥ 1   | href normalization against the OPF directory     |
| Real front matter before first TOC entry | ≥ 1 | the leading front-matter unit admits or skips honestly |
| Degenerate single-entry TOC        | where findable | the depth-2 descent (optional — record the gap honestly) |

**No DRM-protected books.** Every corpus book must admit — a DRM book
belongs in the 12-01 synthetic refusal tests (`epub-protected`), never this
corpus. The manifest schema enforces `drmFree: true` literally.

## Workflow

See **`docs/epub-calibration.md`** for the full derive workflow: place the
EPUBs here, report filename → shape (+ expected admitted chapter count +
producer), then the agent authors the committed manifest
(`tests/unit/server/epub-calibration/manifest.json`, with SHA-256 integrity
hashes). Only derived evidence (manifest, `epub-evidence.json`) ever
commits — never the books.
