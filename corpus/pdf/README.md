# corpus/pdf/ — the local real-PDF calibration corpus (D11-04/05)

This directory holds the **real PDFs** the Phase 11 detection/assembly
thresholds are calibrated against. It is **local-only**:

- **Never commit PDFs into this directory.** Licensing and repository-size
  concerns keep the binaries out of git (user-accepted limitation, D11-04).
  Everything here is gitignored except this README.
- **Never synthesize PDFs as calibration fixtures.** Synthetic fixtures
  exercise code paths (and live committed under `tests/fixtures/pdf/`), but
  calibration numbers tuned against synthetic documents prove nothing about
  real producers. D11-04 explicitly forbids it.

## What belongs here

6–10 real PDFs spanning all four corpus classes (D11-05):

| Class           | Count    | Shape                                                |
| --------------- | -------- | ---------------------------------------------------- |
| single-column   | ≥ 2      | include one Word export and one LaTeX build           |
| scanned         | ≥ 1      | image-only pages (no extractable text)                |
| multi-column    | ≥ 1      | journal/newsletter two-column layouts                 |
| borderline      | ≥ 1      | pull quotes, sidebars, or indented blockquotes        |

Vary producers where possible (InDesign/print exports alongside Word/LaTeX).

## Workflow

See **`docs/pdf-calibration.md`** for the full derive workflow: place the
PDFs here, report filename → class (+ producer), then the agent authors the
committed manifest (`tests/unit/server/pdf-calibration/manifest.json`,
with SHA-256 integrity hashes) and drafts ground-truth labels for your
review. Only derived evidence (manifest, labels, `pdf-evidence.json`)
ever commits — never the PDFs.
