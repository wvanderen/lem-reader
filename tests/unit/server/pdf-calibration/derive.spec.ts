// tests/unit/server/pdf-calibration/derive.spec.ts
// Plan 11-06 Task 3 — the LOCAL-ONLY derive driver (env-gated via the
// `calibrate:pdf` npm script: PDF_CALIBRATION_DERIVE=1). This spec runs the
// REAL pipeline over the REAL local corpus and writes the committed evidence
// record. In normal `npm run test` runs it SKIP VISIBLY (describe.skipIf —
// one of the documented intentional local-only skips, the user-accepted
// D11-04 CI limitation); the always-on replay.spec.ts is what CI replays.
//
// The derive path is ingest-only (deriveEvidence → ingest → withPdfDocument)
// — raw getDocumentProxy+destroy outside withPdfDocument poisons the shared
// pdfjs worker under jsdom (prior-session finding); this file never touches
// the raw API.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  deriveEvidence,
  loadEvidence,
  validateEvidence,
  verifyCorpus,
  writeEvidence,
  loadManifest,
} from "./harness";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const CORPUS_DIR = join(HERE, "..", "..", "..", "..", "corpus", "pdf");
const GROUND_TRUTH_DIR = join(HERE, "ground-truth");
const EVIDENCE_PATH = join(HERE, "pdf-evidence.json");

// The 238-page corpus book makes this the slowest spec in the suite; the
// default 5s timeout is far too tight for real-PDF extraction.
const DERIVE_TIMEOUT_MS = 300_000;

describe.skipIf(
  process.env.PDF_CALIBRATION_DERIVE !== "1",
)("calibration derive (LOCAL ONLY — PDF_CALIBRATION_DERIVE=1)",
() => {
  it(
    "verifyCorpus passes against the local corpus (T-11-07 integrity gate)",
    () => {
      const verification = verifyCorpus(CORPUS_DIR, loadManifest(MANIFEST_PATH));
      expect(verification).toEqual({ ok: true, missing: [], mismatched: [] });
    },
  );

  it(
    "deriveEvidence meets the D11-06 bar (validateEvidence ok — classification + ≥0.90 agreement)",
    async () => {
      const evidence = await deriveEvidence({
        manifestPath: MANIFEST_PATH,
        corpusDir: CORPUS_DIR,
        groundTruthDir: GROUND_TRUTH_DIR,
      });
      const validation = validateEvidence(loadManifest(MANIFEST_PATH), evidence);
      if (!validation.ok) {
        // Print the per-file problems so the tune-to-bar loop has its data.
        console.error("[pdf-calibration] D11-06 bar problems:\n" + validation.problems.join("\n"));
      }
      expect(validation.ok).toBe(true);
    },
    DERIVE_TIMEOUT_MS,
  );

  it(
    "writeEvidence records the derived evidence (refuse-empty guard honored)",
    async () => {
      const evidence = await deriveEvidence({
        manifestPath: MANIFEST_PATH,
        corpusDir: CORPUS_DIR,
        groundTruthDir: GROUND_TRUTH_DIR,
      });
      writeEvidence(evidence, EVIDENCE_PATH);
      expect(existsSync(EVIDENCE_PATH)).toBe(true);
      // The written record re-loads + re-validates (the exact bytes CI replays).
      const reloaded = loadEvidence(EVIDENCE_PATH);
      expect(reloaded.results.length).toBe(evidence.results.length);
      expect(validateEvidence(loadManifest(MANIFEST_PATH), reloaded).ok).toBe(true);
    },
    DERIVE_TIMEOUT_MS,
  );
});
