// tests/unit/server/pdf-calibration/replay.spec.ts
// Plan 11-06 Task 3 — the ALWAYS-ON CI replay (runs inside plain `npm run
// test` with no env var). Validates the COMMITTED pdf-evidence.json against
// the committed manifest at the D11-06 promotion bar. A missing record
// fails LOUDLY with the honest message — never a silent skip (T-11-15);
// the derive's visible skip is the only documented local-only skip
// (user-accepted D11-04 CI limitation).
//
// Additionally pins the shipped PDF_THRESHOLDS against the thresholds
// snapshot inside the committed evidence (T-11-14 — uncalibrated thresholds
// may not be promoted): the only way to change a detection number is to
// re-run `npm run calibrate:pdf` against the local corpus and commit the
// refreshed record.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PDF_THRESHOLDS } from "../../../../server/pdfToBlocks";
import { loadEvidence, loadManifest, validateEvidence } from "./harness";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const EVIDENCE_PATH = join(HERE, "pdf-evidence.json");

const MISSING_RECORD_MESSAGE =
  "calibration requires the local corpus — see docs/pdf-calibration.md";

describe("calibration replay (CI — committed evidence at the D11-06 bar)", () => {
  it("has a committed evidence record (missing ⇒ loud failure, never a silent skip)", () => {
    expect(
      existsSync(EVIDENCE_PATH),
      `${MISSING_RECORD_MESSAGE} (no committed pdf-evidence.json — run npm run calibrate:pdf locally and commit the derived record)`,
    ).toBe(true);
  });

  it("validates the committed evidence against the manifest at the D11-06 bar", () => {
    expect(existsSync(EVIDENCE_PATH), MISSING_RECORD_MESSAGE).toBe(true);
    const manifest = loadManifest(MANIFEST_PATH);
    const evidence = loadEvidence(EVIDENCE_PATH);
    const validation = validateEvidence(manifest, evidence);
    if (!validation.ok) {
      console.error("[pdf-calibration] D11-06 bar problems:\n" + validation.problems.join("\n"));
    }
    expect(validation.ok).toBe(true);
  });

  it("pins the shipped PDF_THRESHOLDS to the calibrated snapshot (T-11-14 — no uncalibrated promotion)", () => {
    expect(existsSync(EVIDENCE_PATH), MISSING_RECORD_MESSAGE).toBe(true);
    const evidence = loadEvidence(EVIDENCE_PATH);
    expect({ ...PDF_THRESHOLDS }).toEqual(evidence.thresholds);
  });
});
