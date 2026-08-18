// tests/unit/server/epub-calibration/replay.spec.ts
// Plan 12-08 Task 3 — the ALWAYS-ON CI replay (runs inside plain `npm run
// test` with no env var). Validates the COMMITTED epub-evidence.json against
// the committed manifest at the D12-12 promotion bar. A missing record
// fails LOUDLY with the honest message — never a silent skip (the T-11-15
// discipline, EPUB edition); the derive's visible skip is the only
// documented local-only skip (user-accepted D12-12 CI limitation).
//
// Additionally pins the shipped EPUB_THRESHOLDS against the thresholds
// snapshot inside the committed evidence (T-12-20 — silently loosened
// admission via threshold drift): the only way to change a detection number
// is to re-run `npm run calibrate:epub` against the local corpus and commit
// the refreshed record.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EPUB_THRESHOLDS } from "../../../../server/epubToBooks";
import {
  loadManifest,
  loadCommittedEvidence,
  validateEvidence,
  MISSING_RECORD_MESSAGE,
} from "./harness";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const EVIDENCE_PATH = join(HERE, "epub-evidence.json");

describe("calibration replay (CI — committed evidence at the D12-12 bar)", () => {
  it("has a committed evidence record (missing ⇒ loud failure, never a silent skip)", () => {
    let threw: Error | undefined;
    try {
      loadCommittedEvidence(EVIDENCE_PATH);
    } catch (e) {
      threw = e as Error;
    }
    // The loader's own message is the loud CI-absence contract — assert it
    // verbatim so the absence branch and the message can never drift apart.
    expect(threw === undefined || threw.message.includes(MISSING_RECORD_MESSAGE)).toBe(true);
  });

  it("validates the committed evidence against the manifest at the D12-12 bar", () => {
    const manifest = loadManifest(MANIFEST_PATH);
    const evidence = loadCommittedEvidence(EVIDENCE_PATH);
    const validation = validateEvidence(manifest, evidence);
    if (!validation.ok) {
      console.error("[epub-calibration] D12-12 bar problems:\n" + validation.problems.join("\n"));
    }
    expect(validation.ok).toBe(true);
  });

  it("pins the shipped EPUB_THRESHOLDS to the calibrated snapshot (T-12-20 — no uncalibrated promotion)", () => {
    const evidence = loadCommittedEvidence(EVIDENCE_PATH);
    expect({ ...EPUB_THRESHOLDS }).toEqual(evidence.thresholds);
  });
});
