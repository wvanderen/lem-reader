// tests/unit/server/pdf-calibration/harness.test.ts
// Plan 11-06 Task 1 (TDD RED→GREEN) — the pure behavior table for the
// calibration harness core. Every fixture here is IN-MEMORY (or a tmp-dir
// byte file for the SHA-256 verification paths): these tests prove the
// harness MECHANICS only. They are NOT calibration fixtures — D11-04 forbids
// synthesizing PDFs for calibration; the real corpus stays local + gitignored
// and is exercised exclusively by the env-gated derive.spec.ts (Task 3).
//
// Behavior table (11-06-PLAN.md Task 1 <behavior>):
//   - loadManifest rejects duplicate files / unknown expectedClass /
//     missing schemaVersion
//   - verifyCorpus detects a sha256 mismatch (returns the offending file)
//   - validateEvidence fails on: missing result, sha256 disagreement,
//     admitted-vs-scanned/multi-column contradiction, refused-vs-
//     single-column/borderline contradiction, agreement < 0.90, absent
//     thresholds, empty results (refuse-empty — fingerprint.compare.ts
//     L205-211 precedent)
//   - validateEvidence passes a hand-built valid manifest+evidence pair
//   - (the corpus-dir gitignore is proven by `git check-ignore` in the task
//     verify step, not here)
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  parseManifest,
  loadManifest,
  verifyCorpus,
  validateEvidence,
  writeEvidence,
  computeAgreement,
  type CalibrationManifest,
  type PdfCalibrationEvidence,
  type GroundTruthLabel,
} from "./harness";
import type { Block } from "../../../../src/content/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

const para = (t: string): Block => ({
  kind: "paragraph",
  content: [{ text: t, marks: [] }],
});
const heading = (t: string, level: 2 | 3 = 2): Block => ({
  kind: "heading",
  level,
  content: [{ text: t, marks: [] }],
});

const SINGLE_BYTES = "single-column-report-bytes";
const SCAN_BYTES = "scanned-image-only-bytes";
const JOURNAL_BYTES = "journal-two-column-bytes";
const ESSAY_BYTES = "borderline-essay-bytes";

const VALID_MANIFEST: unknown = {
  schemaVersion: 1,
  entries: [
    {
      file: "report.pdf",
      sha256: sha256(SINGLE_BYTES),
      expectedClass: "single-column",
      producer: "Word",
    },
    { file: "scan.pdf", sha256: sha256(SCAN_BYTES), expectedClass: "scanned" },
    {
      file: "journal.pdf",
      sha256: sha256(JOURNAL_BYTES),
      expectedClass: "multi-column",
      producer: "LaTeX",
    },
    { file: "essay.pdf", sha256: sha256(ESSAY_BYTES), expectedClass: "borderline" },
  ],
};

/** A hand-built VALID evidence record for VALID_MANIFEST — the D11-06 bar
 * satisfied: classifications correct (borderline + single-column admitted,
 * scanned refused pdf-scanned, multi-column refused pdf-multi-column) and
 * every admitted entry at agreement ≥ 0.90 with anchorRoundTrip true. */
function validEvidence(): PdfCalibrationEvidence {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-16T00:00:00.000Z",
    thresholds: { headingFontRatio: 1.15, scannedItemFloor: 8 },
    results: [
      {
        file: "report.pdf",
        sha256: sha256(SINGLE_BYTES),
        expectedClass: "single-column",
        verdict: "admitted",
        agreement: 0.95,
        anchorRoundTrip: true,
      },
      {
        file: "essay.pdf",
        sha256: sha256(ESSAY_BYTES),
        expectedClass: "borderline",
        verdict: "admitted",
        agreement: 0.92,
        anchorRoundTrip: true,
      },
      {
        file: "scan.pdf",
        sha256: sha256(SCAN_BYTES),
        expectedClass: "scanned",
        verdict: "refused:pdf-scanned",
      },
      {
        file: "journal.pdf",
        sha256: sha256(JOURNAL_BYTES),
        expectedClass: "multi-column",
        verdict: "refused:pdf-multi-column",
      },
    ],
  };
}

// ── parseManifest / loadManifest ────────────────────────────────────────────

describe("parseManifest", () => {
  it("accepts a valid manifest (4 classes, optional producer)", () => {
    const m = parseManifest(VALID_MANIFEST);
    expect(m.entries).toHaveLength(4);
    expect(m.entries[0]).toMatchObject({ file: "report.pdf", expectedClass: "single-column" });
    expect(m.entries[3]?.producer).toBeUndefined();
  });

  it("rejects duplicate files", () => {
    const dup = JSON.parse(JSON.stringify(VALID_MANIFEST)) as { entries: unknown[] };
    dup.entries[1] = { ...dup.entries[1]!, file: "report.pdf" };
    expect(() => parseManifest(dup)).toThrow(/duplicate/i);
  });

  it("rejects unknown expectedClass values", () => {
    const bad = JSON.parse(JSON.stringify(VALID_MANIFEST)) as { entries: unknown[] };
    bad.entries[0] = { ...bad.entries[0]!, expectedClass: "two-column" };
    expect(() => parseManifest(bad)).toThrow();
  });

  it("rejects a missing schemaVersion", () => {
    const bad = JSON.parse(JSON.stringify(VALID_MANIFEST)) as Record<string, unknown>;
    delete bad.schemaVersion;
    expect(() => parseManifest(bad)).toThrow(/schemaVersion/i);
  });
});

describe("loadManifest", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pdf-calib-manifest-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads and parses a valid manifest file from disk", () => {
    const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify(VALID_MANIFEST), "utf8");
    const m = loadManifest(path);
    expect(m.entries).toHaveLength(4);
  });

  it("throws on an unreadable path", () => {
    expect(() => loadManifest(join(dir, "nope.json"))).toThrow();
  });
});

// ── verifyCorpus (T-11-07 — manifest SHA-256 verification before derive) ────

describe("verifyCorpus", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pdf-calib-corpus-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes when every file is present with the manifest sha256", () => {
    writeFileSync(join(dir, "report.pdf"), SINGLE_BYTES, "utf8");
    writeFileSync(join(dir, "scan.pdf"), SCAN_BYTES, "utf8");
    writeFileSync(join(dir, "journal.pdf"), JOURNAL_BYTES, "utf8");
    writeFileSync(join(dir, "essay.pdf"), ESSAY_BYTES, "utf8");
    const v = verifyCorpus(dir, parseManifest(VALID_MANIFEST));
    expect(v.ok).toBe(true);
  });

  it("detects a sha256 mismatch and returns the offending file", () => {
    writeFileSync(join(dir, "report.pdf"), "TAMPERED-BYTES", "utf8");
    writeFileSync(join(dir, "scan.pdf"), SCAN_BYTES, "utf8");
    writeFileSync(join(dir, "journal.pdf"), JOURNAL_BYTES, "utf8");
    writeFileSync(join(dir, "essay.pdf"), ESSAY_BYTES, "utf8");
    const v = verifyCorpus(dir, parseManifest(VALID_MANIFEST));
    expect(v.ok).toBe(false);
    expect(v.mismatched).toContain("report.pdf");
  });

  it("reports a missing corpus file", () => {
    writeFileSync(join(dir, "report.pdf"), SINGLE_BYTES, "utf8");
    const v = verifyCorpus(dir, parseManifest(VALID_MANIFEST));
    expect(v.ok).toBe(false);
    expect(v.missing).toContain("scan.pdf");
  });
});

// ── validateEvidence (the D11-06 promotion bar) ─────────────────────────────

describe("validateEvidence", () => {
  it("passes a hand-built valid manifest+evidence pair", () => {
    const res = validateEvidence(parseManifest(VALID_MANIFEST), validEvidence());
    expect(res.ok).toBe(true);
  });

  it("fails when a manifest entry lacks a result", () => {
    const evidence = validEvidence();
    evidence.results = evidence.results.filter((r) => r.file !== "essay.pdf");
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.problems.some((p) => p.includes("essay.pdf"))).toBe(true);
  });

  it("fails when a result's sha256 disagrees with the manifest", () => {
    const evidence = validEvidence();
    evidence.results[0]!.sha256 = sha256("different-bytes");
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.problems.some((p) => p.includes("sha256"))).toBe(true);
  });

  it("fails when an admitted verdict contradicts an expected scanned class", () => {
    const evidence = validEvidence();
    const scan = evidence.results.find((r) => r.file === "scan.pdf")!;
    scan.verdict = "admitted";
    scan.agreement = 0.95;
    scan.anchorRoundTrip = true;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });

  it("fails when an admitted verdict contradicts an expected multi-column class", () => {
    const evidence = validEvidence();
    const journal = evidence.results.find((r) => r.file === "journal.pdf")!;
    journal.verdict = "admitted";
    journal.agreement = 0.95;
    journal.anchorRoundTrip = true;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });

  it("fails when a refused verdict contradicts an expected single-column class", () => {
    const evidence = validEvidence();
    evidence.results[0]!.verdict = "refused:pdf-multi-column";
    delete evidence.results[0]!.agreement;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });

  it("fails when a refused verdict contradicts an expected borderline class", () => {
    const evidence = validEvidence();
    const essay = evidence.results.find((r) => r.file === "essay.pdf")!;
    essay.verdict = "refused:pdf-scanned";
    delete essay.agreement;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });

  it("fails when a scanned class is refused with the WRONG reason (must be pdf-scanned)", () => {
    const evidence = validEvidence();
    evidence.results[2]!.verdict = "refused:pdf-multi-column";
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.problems.some((p) => p.includes("scan.pdf"))).toBe(true);
  });

  it("fails when an admitted result's agreement is below 0.90", () => {
    const evidence = validEvidence();
    evidence.results[0]!.agreement = 0.85;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });

  it("fails when an admitted result's agreement is missing", () => {
    const evidence = validEvidence();
    delete evidence.results[0]!.agreement;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });

  it("fails when thresholds are absent", () => {
    const evidence = validEvidence() as unknown as Record<string, unknown>;
    delete evidence.thresholds;
    const res = validateEvidence(
      parseManifest(VALID_MANIFEST),
      evidence as unknown as PdfCalibrationEvidence,
    );
    expect(res.ok).toBe(false);
  });

  it("fails when results are empty (refuse-empty — fingerprint.compare.ts L205-211 precedent)", () => {
    const evidence = validEvidence();
    evidence.results = [];
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.problems.some((p) => /empty/i.test(p))).toBe(true);
  });

  it("fails on a result for a file the manifest does not list", () => {
    const evidence = validEvidence();
    evidence.results.push({
      file: "ghost.pdf",
      sha256: sha256("ghost-bytes"),
      expectedClass: "single-column",
      verdict: "admitted",
      agreement: 0.99,
      anchorRoundTrip: true,
    });
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });
});

// ── writeEvidence (refuse-empty guard on the committed artifact) ────────────

describe("writeEvidence", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pdf-calib-write-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to write empty results and creates no file", () => {
    const evidence = validEvidence();
    evidence.results = [];
    const path = join(dir, "pdf-evidence.json");
    expect(() => writeEvidence(evidence, path)).toThrow(/empty/i);
    expect(existsSync(path)).toBe(false);
  });

  it("writes a valid evidence record as JSON + trailing newline", () => {
    const path = join(dir, "pdf-evidence.json");
    writeEvidence(validEvidence(), path);
    expect(existsSync(path)).toBe(true);
    const txt = readFileSync(path, "utf8");
    expect(txt.endsWith("\n")).toBe(true);
    expect(JSON.parse(txt).results).toHaveLength(4);
  });
});

// ── computeAgreement (labels ↔ extracted blocks; D11-06 metric) ─────────────

describe("computeAgreement", () => {
  const labels: GroundTruthLabel[] = [
    { kind: "heading", level: 2, textPrefix: "Introduction" },
    { kind: "paragraph", textPrefix: "This paper studies calm reading" },
  ];

  it("returns 1 on a perfectly aligned pair", () => {
    const blocks = [heading("Introduction"), para("This paper studies calm reading in depth.")];
    expect(computeAgreement(labels, blocks)).toBe(1);
  });

  it("tolerates ±1 boundary drift — an extra extracted block between labels still matches both", () => {
    const blocks = [
      heading("Introduction"),
      para("a stray boundary fragment"),
      para("This paper studies calm reading in depth."),
    ];
    // matched 2 of max(labels=2, blocks=3) — drift preserves the matches;
    // the extra block still costs the denominator (extra content honesty).
    expect(computeAgreement(labels, blocks)).toBeCloseTo(2 / 3, 5);
  });

  it("penalizes kind mismatch (paragraph where a heading is labeled)", () => {
    const blocks = [para("Introduction and overview"), para("This paper studies calm reading.")];
    expect(computeAgreement(labels, blocks)).toBeLessThan(1);
  });

  it("matches case- and whitespace-insensitively on the text prefix", () => {
    const blocks = [
      heading("INTRODUCTION"),
      para("This   paper studies calm reading in depth."),
    ];
    expect(computeAgreement(labels, blocks)).toBe(1);
  });
});
