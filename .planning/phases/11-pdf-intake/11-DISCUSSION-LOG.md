# Phase 11: PDF Intake - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-16
**Phase:** 11-pdf-intake
**Areas discussed:** Multi-column policy, Calibration corpus & bar, Title & heading sources

---

## Gray-area selection

Presented 4 areas: Multi-column policy, Calibration corpus & bar, Refusal
vocabulary, Title & heading sources. User selected 3 (all but Refusal
vocabulary — left to agent discretion with the typed-reason + DOC-06
discipline locked by prior phases).

## Multi-column policy

### Q1: Posture when a PDF is detected as multi-column

| Option | Description | Selected |
|--------|-------------|----------|
| Detect + refuse (Recommended) | Detection runs; NO reconstruction in Phase 11; typed refusal via DOC-06 surface. Pitfall 7: reconstruction is a separable sub-project. | ✓ |
| Reconstruct + low-confidence | Column-band reading-order reconstruction; admit flagged low-confidence. Risks silently reordered text (SC#3 hard line). | |
| Hybrid: clean 2-col only | Reconstruct only high-certainty 2-column layouts; refuse messier. Two code paths to calibrate. | |

**User's choice:** Detect + refuse (Recommended)
**Notes:** —

### Q2: Detection strictness (false-positive refusal vs false-negative garbled admission)

| Option | Description | Selected |
|--------|-------------|----------|
| Bias to refuse (Recommended) | Aggressive detection; honest refusal is calm, gibberish is worst. | |
| Balanced | Moderate thresholds; corpus tunes both directions; requires borderline cases in corpus. | ✓ |
| Bias to admit | Only unmistakable column structure refuses; anchor gate is the backstop. | |

**User's choice:** Balanced
**Notes:** —

### Q3: Whole-document verdict vs page-weighted

| Option | Description | Selected |
|--------|-------------|----------|
| Page-weighted majority (Recommended) | Refuse only when columnar pages dominate (>~50% of text-bearing pages, corpus-tuned). Tolerates stray figure pages. | ✓ |
| Any-page triggers | Any single columnar page refuses the whole PDF. Most conservative. | |
| You decide | Researcher/planner picks aggregation once corpus behavior is known. | |

**User's choice:** Page-weighted majority (Recommended)
**Notes:** —

## Calibration corpus & bar

### Q1: Corpus source

| Option | Description | Selected |
|--------|-------------|----------|
| Committed real PDFs (Recommended) | Genuinely-free real PDFs committed; mirrors v1.0 curated-corpus philosophy; repo-size cost. | |
| Generated synthetic PDFs | Deterministic, no licensing; exercises only generators used — doesn't retire the real-world risk SC#4 targets. | |
| Mix: few real + synthetic matrix | 2-3 real anchors + synthetic threshold sweep. Two fixture kinds. | |

**User's choice:** "real PDFs - local only?" (free-text)
**Notes:** Follow-up presented the CI collision (calibration gates run in CI;
local-only corpus breaks re-derivation). Two resolutions offered: (a) commit
derived evidence only, CI replays recorded numbers; (b) commit 2-3 tiny real
PDFs for CI, fuller corpus local. **User: "let's do (a) - I don't mind the CI
limitation here."** → D11-04 locked.

### Q2: Corpus shape

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest + 6-10 PDFs (Recommended) | Committed manifest (filename + SHA-256 + expected classification) + gitignored local PDFs across 4 classes (single-column/scanned/multi-column/borderline) and producers (Word/LaTeX/InDesign). CI fails honestly when absent. | ✓ |
| Minimal 3-4 PDFs | One per class; faster curation, weaker threshold confidence. | |
| You decide | Researcher proposes composition during Phase 11 research. | |

**User's choice:** Manifest + 6-10 PDFs (Recommended)
**Notes:** —

### Q3: Promotion bar (SC#4 pass bar)

| Option | Description | Selected |
|--------|-------------|----------|
| Classify + structure bar (Recommended) | Class correctness for every corpus PDF + ≥90% block-level agreement vs human-labeled ground truth on admitted PDFs. D3-01 per-kind-gate spirit. | ✓ |
| Pipeline-gates-only bar | assertRoundTripAnchor + deriveConfidence + human spot-check. Weaker; subjective. | |
| You decide | Researcher proposes metrics + ratio. | |

**User's choice:** Classify + structure bar (Recommended)
**Notes:** —

## Title & heading sources

### Q1: Provenance.title fallback chain

| Option | Description | Selected |
|--------|-------------|----------|
| Info w/ checks → filename (Recommended) | Sanity-checked Info-title (reject untitled/Word-prefix/garbage) → filename minus .pdf → neutral "PDF document". D8-17 chain shape. | ✓ |
| Filename-first always | Simple, predictable; 'download(3).pdf' shows as title. | |
| You decide | Chain existence locked; garbage-list + order researcher's. | |

**User's choice:** Info w/ checks → filename (Recommended)
**Notes:** —

### Q2: Heading detection signal

| Option | Description | Selected |
|--------|-------------|----------|
| Outline-first, size fallback (Recommended) | PDF outline/bookmarks are primary when present (author-declared structure); calibrated font-size heuristics fill gaps. Researcher must verify unpdf exposes outline→destination mapping; degrade to font-size-only if not. | ✓ |
| Font-size only | Single code path; matches ARCHITECTURE L345 sketch; ignores embedded author structure. | |

**User's choice:** Outline-first, size fallback (Recommended)
**Notes:** —

### Q3: Page-1 title duplication

| Option | Description | Selected |
|--------|-------------|----------|
| Match → consume (Recommended) | Largest page-1 text matching the chosen title is consumed, no heading block emitted (one-h1-per-page; ArticleView renders provenance title). | ✓ |
| Always keep as heading | Simpler; doubled title on well-formed PDFs. | |
| You decide | Dedup rule decided post-corpus. | |

**User's choice:** Match → consume (Recommended)
**Notes:** —

## Closing check

User confirmed ready for context ("I'm ready for context") — no additional
gray areas requested.

## the agent's Discretion

- Refusal vocabulary granularity (not selected for discussion; typed-reason +
  DOC-06 discipline locked by prior phases)
- Column-detection algorithm specifics + exact majority ratio
- Scanned-detection threshold quantification
- Garbage-title pattern list
- Ground-truth label format + agreement metric definition
- Resource-limit exact values (16MB / 500 pages / timeout suggested)
- PDF upload UI details (binary POST, client cap)

## Deferred Ideas

None raised during discussion (deferred list in CONTEXT.md is the confirmed
pre-existing phase boundary, not new scope creep).
