// tests/unit/server/epub-calibration/derive.spec.ts
// Plan 12-08 Task 1 (Task 3 runs it) — the LOCAL-ONLY derive driver
// (env-gated via the `calibrate:epub` npm script: EPUB_CALIBRATION_DERIVE=1).
// This spec runs the REAL adapter + orchestrator path over the REAL local
// corpus and writes the committed evidence record. In normal `npm run test`
// runs it SKIP VISIBLY (describe.skipIf — the documented intentional
// local-only skip, the user-accepted D12-12 CI limitation); the always-on
// replay.spec.ts (authored in Task 3 alongside the committed records) is
// what CI replays.
//
// The derive path is ingest + epubToBooks (both deterministic, in-process);
// no raw zip/XML APIs are touched outside the adapter's own guards.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  deriveEvidence,
  loadCommittedEvidence,
  validateEvidence,
  verifyCorpus,
  writeEvidence,
  loadManifest,
} from "./harness";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const CORPUS_DIR = join(HERE, "..", "..", "..", "..", "corpus", "epub");
const EVIDENCE_PATH = join(HERE, "epub-evidence.json");

// Real-book derive work is fast (fflate + XML, no pdfjs), but the timeout
// mirrors the pdf derive's generosity so a pathological corpus book can
// never flake the local run at the 5s default.
const DERIVE_TIMEOUT_MS = 300_000;

describe.skipIf(
  process.env.EPUB_CALIBRATION_DERIVE !== "1",
)("calibration derive (LOCAL ONLY — EPUB_CALIBRATION_DERIVE=1)",
() => {
  it(
    "verifyCorpus passes against the local corpus (integrity gate)",
    () => {
      const verification = verifyCorpus(CORPUS_DIR, loadManifest(MANIFEST_PATH));
      expect(verification).toEqual({ ok: true, missing: [], mismatched: [] });
    },
  );

  it(
    "deriveEvidence meets the D12-12 bar (validateEvidence ok — admission + chapter counts + no fallback on resolvable TOCs + anchor round-trips)",
    async () => {
      const evidence = await deriveEvidence({
        manifestPath: MANIFEST_PATH,
        corpusDir: CORPUS_DIR,
      });
      const validation = validateEvidence(loadManifest(MANIFEST_PATH), evidence);
      if (!validation.ok) {
        // Print the per-file problems so the tune-to-bar loop has its data.
        console.error("[epub-calibration] D12-12 bar problems:\n" + validation.problems.join("\n"));
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
      });
      writeEvidence(evidence, EVIDENCE_PATH);
      expect(existsSync(EVIDENCE_PATH)).toBe(true);
      // The written record re-loads + re-validates (the exact bytes CI replays).
      const reloaded = loadCommittedEvidence(EVIDENCE_PATH);
      expect(reloaded.results.length).toBe(evidence.results.length);
      expect(validateEvidence(loadManifest(MANIFEST_PATH), reloaded).ok).toBe(true);
    },
    DERIVE_TIMEOUT_MS,
  );
});
