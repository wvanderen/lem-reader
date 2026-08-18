// tests/unit/server/pdf-calibration/harness.ts
// Plan 11-06 Task 1 — the SC#4b calibration instrument core (the Phase 3
// fingerprint.compare.ts discipline, PDF edition — D11-04/05/06).
//
// ROLE (11-PATTERNS §pdf-calibration analog, role-match):
//   - MANIFEST (committed) records the corpus: file + SHA-256 + expected
//     classification + producer. The corpus PDFs themselves stay LOCAL +
//     GITIGNORED (D11-04 — licensing/size; never commit PDFs, never
//     synthesize calibration fixtures for CI).
//   - LOCAL derive (`npm run calibrate:pdf`, env-gated) verifies corpus
//     presence + integrity against the manifest, runs the REAL pipeline
//     (ingest({pdf}) → pdfToBlocks → PDF_THRESHOLDS-driven detection),
//     computes per-file agreement against committed ground-truth labels,
//     snapshots the exact PDF_THRESHOLDS that produced every verdict, and
//     writes the derived evidence record.
//   - CI replay (always-on replay.spec.ts) validates the COMMITTED
//     pdf-evidence.json against the D11-06 bar + manifest. Missing record →
//     loud failure ("calibration requires the local corpus — see
//     docs/pdf-calibration.md") — NEVER a silent skip (T-11-15).
//
// EXIT SEMANTICS: this module is a plain importable core — no process.exit
// anywhere. "Exit 2-class refusals" (missing corpus, tampered sha, empty
// results) are THROWS here; the derive spec maps them to test failures,
// which is how the exit codes surface under `npm run calibrate:pdf`
// (vitest owns TS module resolution — a plain-node run cannot resolve the
// repo's extensionless imports, hence the spec-based driver).
//
// D11-06 promotion bar, enforced by validateEvidence:
//   1. classification correctness for EVERY corpus entry:
//        single-column + borderline → admitted (borderline is the D11-02
//        admit-side tuning pressure — pull quotes/sidebars must NOT refuse)
//        scanned        → refused:pdf-scanned
//        multi-column   → refused:pdf-multi-column
//   2. every admitted entry: block-level agreement ≥ 0.90 against
//      ground-truth labels AND anchorRoundTrip === true (SC#4a — ingest's
//      assertRoundTripAnchor passed on the real PDF)
//   3. non-empty results (refuse-empty — fingerprint.compare.ts L205-211
//      precedent: never validate or write a placeholder record)
//
// Agreement metric (RESEARCH Pattern 8): align the extracted block sequence
// to the labels [{kind, level?, textPrefix}] by normalized-textPrefix fuzzy
// match with ±1 boundary drift; agreement = matched-kind / max(labels,
// blocks).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PDF_THRESHOLDS } from "../../../../server/pdfToBlocks";
import { ingest } from "../../../../server/ingest";
import type { Block } from "../../../../src/content/schema";

// ── Schemas (zod-at-boundary — every committed record validates on load) ────

/** The four corpus classes (D11-05). Borderline = pull quotes / sidebars /
 * indented blockquotes — expected ADMITTED (D11-02 admit-side pressure). */
export const PDF_CLASS_ENUM = z.enum([
  "single-column",
  "scanned",
  "multi-column",
  "borderline",
] as const);
export type PdfExpectedClass = z.infer<typeof PDF_CLASS_ENUM>;

/** Classes whose promotion bar requires admission + ≥0.90 agreement. */
export const ADMITTED_CLASSES: readonly PdfExpectedClass[] = [
  "single-column",
  "borderline",
];

const SHA256_REGEX = /^[0-9a-f]{64}$/;

/** Verdict: "admitted" or "refused:" + the typed IngestionFailureReason. */
const VERDICT_REGEX = /^(admitted|refused:[a-z-]+)$/;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z
    .array(
      z.object({
        file: z.string().min(1),
        sha256: z.string().regex(SHA256_REGEX),
        expectedClass: PDF_CLASS_ENUM,
        producer: z.string().optional(),
      }),
    )
    .min(1),
});
export type CalibrationManifest = z.infer<typeof ManifestSchema>;

export const EvidenceResultSchema = z.object({
  file: z.string().min(1),
  sha256: z.string().regex(SHA256_REGEX),
  expectedClass: PDF_CLASS_ENUM,
  verdict: z.string().regex(VERDICT_REGEX),
  agreement: z.number().min(0).max(1).optional(),
  anchorRoundTrip: z.boolean().optional(),
});
export type EvidenceResult = z.infer<typeof EvidenceResultSchema>;

export const EvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  /** The PDF_THRESHOLDS snapshot that produced every recorded verdict —
   * thresholds live WITH their evidence so a recorded pass is auditable
   * against the numbers that produced it (D11-04). ZodRecord has no .min —
   * the non-empty check is a refine. */
  thresholds: z
    .record(z.string(), z.number())
    .refine((r) => Object.keys(r).length > 0, {
      message: "thresholds snapshot must not be empty",
    }),
  results: z.array(EvidenceResultSchema).min(1),
});
export type PdfCalibrationEvidence = z.infer<typeof EvidenceSchema>;

/** Ground-truth label (D11-06): one ordered block label for admitted-class
 * PDFs — kind (+ optional heading level) + a normalized text prefix (the
 * first ~40 chars of the block's text).
 *
 * Label vocabulary (WIDENED at calibration review, 11-06 Task 3): the human
 * corrector labeled semantic structure beyond the extractor's two text kinds
 * — `footnote`, `table header`, `table content` — and level-1 document
 * titles. These are the numerator of truth; the schema must accept them.
 * Matching (see labelMatchesBlock) maps the vocabulary onto the extraction's
 * kind via an equivalence class: `heading` labels must match heading blocks;
 * every body-text kind (paragraph/footnote/table header/table content)
 * matches paragraph blocks — PDF footnotes and tables ARE body text in
 * Phase 11 (pdfToBlocks Pattern 1), so the metric discriminates exactly the
 * behavior the thresholds control (heading-vs-body), never the intentional
 * scope decision. */
export const PDF_LABEL_KINDS = [
  "heading",
  "paragraph",
  "footnote",
  "table header",
  "table content",
] as const;
export type PdfLabelKind = (typeof PDF_LABEL_KINDS)[number];

export const GroundTruthLabelSchema = z.object({
  kind: z.enum(PDF_LABEL_KINDS),
  level: z.number().int().min(1).max(6).optional(),
  textPrefix: z.string().min(1),
});
export type GroundTruthLabel = z.infer<typeof GroundTruthLabelSchema>;

/** A whole label file — an ordered, non-empty array of labels. */
export const GroundTruthFileSchema = z.array(GroundTruthLabelSchema).min(1);

// ── Manifest loading ─────────────────────────────────────────────────────────

/** Parse + validate a manifest VALUE (pure — the in-memory fixtures of
 * harness.test.ts exercise this directly). Rejects unknown expectedClass
 * values and missing schemaVersion via zod, and duplicate files explicitly
 * (zod cannot see cross-entry uniqueness). */
export function parseManifest(value: unknown): CalibrationManifest {
  const parsed = ManifestSchema.parse(value);
  const seen = new Set<string>();
  for (const entry of parsed.entries) {
    if (seen.has(entry.file)) {
      throw new Error(
        `[pdf-calibration] manifest lists duplicate file: ${entry.file}`,
      );
    }
    seen.add(entry.file);
  }
  return parsed;
}

/** Load + validate a manifest from disk. */
export function loadManifest(manifestPath: string): CalibrationManifest {
  return parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
}

/** Load + validate a ground-truth label file. */
export function loadGroundTruth(labelPath: string): GroundTruthLabel[] {
  return GroundTruthFileSchema.parse(JSON.parse(readFileSync(labelPath, "utf8")));
}

/** Load + validate a committed evidence record. */
export function loadEvidence(evidencePath: string): PdfCalibrationEvidence {
  return EvidenceSchema.parse(JSON.parse(readFileSync(evidencePath, "utf8")));
}

// ── verifyCorpus (T-11-07 — corpus integrity before any derive work) ────────

export interface CorpusVerification {
  ok: boolean;
  /** Manifest files absent from the corpus dir. */
  missing: string[];
  /** Files whose on-disk SHA-256 disagrees with the manifest. */
  mismatched: string[];
}

/** Verify corpus presence + byte integrity against the manifest (node:crypto
 * SHA-256). Pure check — callers decide how to surface a failure (derive
 * THROWS on !ok, the exit-2-class refusal; nothing derives against a
 * tampered or partial corpus). */
export function verifyCorpus(
  corpusDir: string,
  manifest: CalibrationManifest,
): CorpusVerification {
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const entry of manifest.entries) {
    const path = join(corpusDir, entry.file);
    if (!existsSync(path)) {
      missing.push(entry.file);
      continue;
    }
    const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (digest !== entry.sha256) mismatched.push(entry.file);
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

// ── Agreement metric (D11-06 — labels ↔ extracted blocks) ───────────────────

/** Normalization for textPrefix fuzzy matching: lowercase + whitespace
 * collapse + producer footnote-marker stripping (case/whitespace-insensitive;
 * hyphen-insensitivity is NOT wanted here — unlike the D11-09 title match,
 * block prefixes must stay strict about content). Bracketed digit runs are
 * footnote/citation markers producers inject ("economy[1] borrowed") — they
 * are not content and break prefix containment otherwise. */
function normalizeForPrefix(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/\[[0-9]+\]/g, "").trim();
}

/** Space-stripped form — the last-resort fuzzy tier. Producers emit
 * kerned-tight run boundaries with no recoverable space ("Catalyst2025" vs
 * the labeled "Catalyst 2025"); comparing with spaces removed recovers the
 * match without weakening kind or order discipline. */
function spaceless(s: string): string {
  return s.replace(/\s+/g, "");
}

/** The concatenated inline text of a block ("" for unsupported blocks). */
function blockText(block: Block): string {
  if (!("content" in block) || !Array.isArray(block.content)) return "";
  return block.content.map((run) => run.text).join("");
}

/** The extraction kind a label kind matches against (equivalence class —
 * see GroundTruthLabelSchema: heading labels need heading blocks; every
 * body-text kind needs a paragraph block. Level is informational — the
 * extractor clamps outline depth to 2-6 and the metric matches kind+prefix,
 * never level). */
function extractionKindForLabel(kind: PdfLabelKind): "heading" | "paragraph" {
  return kind === "heading" ? "heading" : "paragraph";
}

/** Does this label match this block? Kind equivalence must hold (heading-
 * where-heading, body-text-where-body-text); the normalized label prefix
 * must be a prefix of the normalized block text (fuzzy fallback:
 * containment in either direction, tolerant of lead-in drift producers
 * introduce). */
function labelMatchesBlock(label: GroundTruthLabel, block: Block): boolean {
  if (extractionKindForLabel(label.kind) !== block.kind) return false;
  const want = normalizeForPrefix(label.textPrefix);
  if (want.length === 0) return false;
  const have = normalizeForPrefix(blockText(block));
  if (have.length === 0) return false;
  if (have.startsWith(want) || have.includes(want)) return true;
  // Reverse containment ONLY for substantial blocks: a real block whose
  // entire text the label prefix covers (lead-in drift). A tiny fragment
  // block (an equation's "𝑘=0" leftover) must NOT steal its label and jump
  // the monotone cursor past real content — calibration lesson from TRACE's
  // equation cluster, where a 4-char fragment consumed the big equation's
  // label and cost eight downstream matches.
  if (have.replace(/\s+/g, "").length >= 8 && want.includes(have)) return true;
  // Spaceless tier — kerned run boundaries ("Catalyst2025" ↔ "Catalyst 2025").
  const wantFlat = spaceless(want);
  const haveFlat = spaceless(have);
  if (wantFlat.length === 0 || haveFlat.length === 0) return false;
  return haveFlat.startsWith(wantFlat) || haveFlat.includes(wantFlat);
}

/**
 * computeAgreement — matched-kind / max(labels, blocks) with a MONOTONE
 * full-lookahead alignment (11-06 Task 3 calibration finding). The original
 * ±1-drift greedy walk derailed permanently on CLUSTERED divergence: two
 * consecutive extra blocks (an equation fragmenting into 3, a TOC entry
 * splitting off a heading) blinded every later match — a 95%-correct
 * extraction scored 0.02. The monotone walk keeps the plan's honesty (each
 * label takes the EARLIEST unused block at or after the cursor, so extra
 * and missing blocks still cost the denominator exactly once) while
 * measuring real structural agreement instead of walk artifacts. The
 * committed behavior table (one extra block between labels ⇒ 2/3) is
 * unchanged under both walks.
 */
export function computeAgreement(
  labels: GroundTruthLabel[],
  blocks: Block[],
): number {
  const denominator = Math.max(labels.length, blocks.length);
  if (denominator === 0) return 1;
  let matched = 0;
  let bi = 0;
  const used = new Set<number>();
  for (let li = 0; li < labels.length; li++) {
    const label = labels[li]!;
    for (let b = bi; b < blocks.length; b++) {
      if (used.has(b)) continue;
      if (labelMatchesBlock(label, blocks[b]!)) {
        used.add(b);
        matched += 1;
        bi = b + 1;
        break;
      }
    }
  }
  return matched / denominator;
}

// ── validateEvidence (the D11-06 promotion bar — CI replays this) ───────────

export type EvidenceValidation =
  | { ok: true }
  | { ok: false; problems: string[] };

/** The expected verdict for a class (the classification-correctness half of
 * the bar). Borderline + single-column are expected ADMITTED — the D11-02
 * balanced-tuning mandate makes the borderline class the admit-side
 * pressure; scanned/multi-column refuse with their SPECIFIC typed reason
 * (a scanned doc refused as multi-column is still a misclassification). */
export function expectedVerdictForClass(cls: PdfExpectedClass): string {
  switch (cls) {
    case "single-column":
    case "borderline":
      return "admitted";
    case "scanned":
      return "refused:pdf-scanned";
    case "multi-column":
      return "refused:pdf-multi-column";
  }
}

/**
 * validateEvidence — enforce the D11-06 bar over a manifest + evidence pair.
 * Defensive zod re-parse first (hand-built or drifted records fail loudly,
 * not silently), then the semantic rules: every manifest entry has exactly
 * one matching result (sha256 + expectedClass agreeing), classification
 * correct for every entry, agreement ≥ 0.90 AND anchorRoundTrip === true
 * for every admitted entry, thresholds present, results non-empty
 * (refuse-empty — the fingerprint.compare.ts L205-211 precedent).
 */
export function validateEvidence(
  manifest: CalibrationManifest,
  evidence: PdfCalibrationEvidence,
): EvidenceValidation {
  const problems: string[] = [];

  // Refuse-empty FIRST (before schema validation short-circuits): a record
  // with no results is a placeholder, not evidence — the explicit
  // fingerprint.compare.ts L205-211 precedent behavior.
  if (!evidence.results || evidence.results.length === 0) {
    problems.push(
      "[pdf-calibration] evidence results are empty — refusing to validate a placeholder record (refuse-empty guard)",
    );
    return { ok: false, problems };
  }

  const parsedManifest = ManifestSchema.safeParse(manifest);
  if (!parsedManifest.success) {
    problems.push(
      `manifest failed schema validation: ${parsedManifest.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`,
    );
  }
  const parsedEvidence = EvidenceSchema.safeParse(evidence);
  if (!parsedEvidence.success) {
    problems.push(
      `evidence failed schema validation (thresholds/results shape): ${parsedEvidence.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`,
    );
  }
  if (problems.length > 0) return { ok: false, problems };

  const resultsByFile = new Map(evidence.results.map((r) => [r.file, r]));

  // Every manifest entry: exactly one result, hashes agreeing, verdict correct.
  for (const entry of manifest.entries) {
    const result = resultsByFile.get(entry.file);
    if (!result) {
      problems.push(`manifest entry has no evidence result: ${entry.file}`);
      continue;
    }
    if (result.sha256 !== entry.sha256) {
      problems.push(
        `sha256 disagreement for ${entry.file}: manifest ${entry.sha256} vs evidence ${result.sha256}`,
      );
    }
    if (result.expectedClass !== entry.expectedClass) {
      problems.push(
        `expectedClass disagreement for ${entry.file}: manifest ${entry.expectedClass} vs evidence ${result.expectedClass}`,
      );
    }
    const expected = expectedVerdictForClass(entry.expectedClass);
    if (result.verdict !== expected) {
      problems.push(
        `classification incorrect for ${entry.file}: expected ${expected}, recorded ${result.verdict}`,
      );
    }
    if (result.verdict === "admitted") {
      if (result.agreement === undefined) {
        problems.push(`admitted result lacks agreement: ${entry.file}`);
      } else if (result.agreement < 0.9) {
        problems.push(
          `admitted result below the 0.90 agreement bar: ${entry.file} (${result.agreement})`,
        );
      }
      if (result.anchorRoundTrip !== true) {
        problems.push(
          `admitted result lacks anchorRoundTrip === true: ${entry.file} (SC#4a)`,
        );
      }
    }
  }

  // No results for files the manifest does not list (ghost evidence).
  const manifestFiles = new Set(manifest.entries.map((e) => e.file));
  for (const result of evidence.results) {
    if (!manifestFiles.has(result.file)) {
      problems.push(
        `evidence result for a file absent from the manifest: ${result.file}`,
      );
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

// ── deriveEvidence (LOCAL mode — the real pipeline over the real corpus) ────

export interface DerivePaths {
  manifestPath: string;
  corpusDir: string;
  groundTruthDir: string;
}

/**
 * deriveEvidence — run the REAL orchestrator over every corpus PDF and
 * record what it actually did. Per file: read bytes → base64 →
 * ingest({pdf, filename}) (the full pipeline: caps, pdfToBlocks detection
 * on the CURRENT PDF_THRESHOLDS, ArticleSchema.parse, the SC#4a
 * assertRoundTripAnchor gate, confidence). An ok response records
 * "admitted" + agreement against the committed ground-truth labels +
 * anchorRoundTrip: true (ok implies the anchor gate passed). A typed
 * refusal records "refused:" + the reason. The CURRENT PDF_THRESHOLDS
 * snapshot rides along so every verdict is auditable against the numbers
 * that produced it. Throws (never writes partial evidence) on corpus
 * integrity failure or missing ground-truth label files.
 */
export async function deriveEvidence(
  paths: DerivePaths,
): Promise<PdfCalibrationEvidence> {
  const manifest = loadManifest(paths.manifestPath);

  // T-11-07: integrity gate BEFORE any derive work.
  const verification = verifyCorpus(paths.corpusDir, manifest);
  if (!verification.ok) {
    throw new Error(
      `[pdf-calibration] corpus verification failed — missing: [${verification.missing.join(", ")}], sha256 mismatch: [${verification.mismatched.join(", ")}]. Calibration requires the local corpus — see docs/pdf-calibration.md`,
    );
  }

  const results: EvidenceResult[] = [];
  const missingLabels: string[] = [];
  for (const entry of manifest.entries) {
    const bytes = readFileSync(join(paths.corpusDir, entry.file));
    const b64 = Buffer.from(bytes).toString("base64");
    const response = await ingest({ pdf: b64, filename: entry.file });
    if (response.ok && "article" in response) {
      // Admitted — the SC#4a anchor gate ran INSIDE ingest and passed
      // (ok implies assertRoundTripAnchor did not refuse). Agreement needs
      // ground truth: required for admitted-expected classes, computed
      // opportunistically for any admission (a misclassified scanned doc
      // admitted by the thresholds is exactly the evidence tuning needs).
      const labelPath = join(paths.groundTruthDir, `${entry.file}.json`);
      if (!existsSync(labelPath)) {
        if (ADMITTED_CLASSES.includes(entry.expectedClass)) {
          missingLabels.push(entry.file);
        }
        results.push({
          file: entry.file,
          sha256: entry.sha256,
          expectedClass: entry.expectedClass,
          verdict: "admitted",
          anchorRoundTrip: true,
        });
      } else {
        const labels = loadGroundTruth(labelPath);
        results.push({
          file: entry.file,
          sha256: entry.sha256,
          expectedClass: entry.expectedClass,
          verdict: "admitted",
          agreement:
            Math.round(computeAgreement(labels, response.article.blocks) * 10000) /
            10000,
          anchorRoundTrip: true,
        });
      }
    } else if (!response.ok) {
      results.push({
        file: entry.file,
        sha256: entry.sha256,
        expectedClass: entry.expectedClass,
        verdict: `refused:${response.reason}`,
      });
    } else {
      // ok:true but the book envelope — unreachable on the pdf path (the
      // pdf branch always answers with the single-article variant); keep the
      // harness honest by recording the contract violation.
      results.push({
        file: entry.file,
        sha256: entry.sha256,
        expectedClass: entry.expectedClass,
        verdict: "refused:server-error",
      });
    }
  }

  if (missingLabels.length > 0) {
    throw new Error(
      `[pdf-calibration] admitted-class PDFs missing ground-truth label files: [${missingLabels.join(", ")}] — author ground-truth/<file>.pdf.json before deriving (see docs/pdf-calibration.md)`,
    );
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    thresholds: { ...PDF_THRESHOLDS },
    results,
  };
}

// ── writeEvidence (refuse-empty guard on the committed artifact) ────────────

/**
 * writeEvidence — write the derived evidence record. Refuses to write a
 * record with empty results (the fingerprint.compare.ts L205-211
 * precedent: never overwrite the committed artifact with placeholder
 * data — CI replays this file as the durable truth).
 */
export function writeEvidence(
  evidence: PdfCalibrationEvidence,
  evidencePath: string,
): void {
  if (!evidence.results || evidence.results.length === 0) {
    throw new Error(
      "[pdf-calibration] refusing to overwrite the committed evidence record with empty results — the corpus derive produced no verdicts (see docs/pdf-calibration.md)",
    );
  }
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
}
