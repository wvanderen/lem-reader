# 0001: The Pretext measurement adapter is calibration-gated

The measurement engine carries two adapters — DOM measurement (truth) and a Pretext-backed fast text measurer — but the per-block strategy dispatch was never connected, leaving the eligibility/fingerprint/drift plumbing with zero production callers. We decided to wire the dispatch **calibration-gated** rather than delete it: the fast measurer serves only blocks the calibration fingerprint marks eligible, DOM measurement remains the truth for everything else and the authority on any disagreement, and the post-render overflow guard is unchanged.

## Considered options

- **Delete the dormant dispatch** — rejected: the stack positions Pretext as the intended fast path, and calibration data is already collected. If no corpus ever becomes eligible, delete instead.

## Consequences

- The strategy seam becomes real (two adapters) at near-zero risk while eligibility is empty.
- Drift between the two measurers must surface through the existing diagnostics, not silently select a winner.
