// tests/unit/server/epub-calibration/harness.ts
// Plan 12-08 Task 1 — the D12-12 calibration instrument core (the 11-06
// pdf-calibration mirror, EPUB edition — file-for-file layout per
// 12-PATTERNS §tests/unit/server/epub-calibration/).
//
// ROLE (11-PATTERNS §pdf-calibration analog, role-match):
//   - MANIFEST (committed) records the corpus: file + SHA-256 + expected
//     shape (DRM-free class, nav vs NCX vs none, expected admitted chapter
//     count, whether the TOC should resolve). The corpus EPUBs themselves
//     stay LOCAL + GITIGNORED (D12-12 — licensing/size; never commit real
//     books, never synthesize calibration fixtures — the synthetic corpus
//     is 12-01's job and exercises code paths, not thresholds).
//   - LOCAL derive (`npm run calibrate:epub`, env-gated) verifies corpus
//     presence + integrity against the manifest, runs the REAL adapter +
//     orchestrator path (ingest({epub}) → epubToBooks → EPUB_THRESHOLDS-
//     driven TOC-merge + admission), records the typed verdict +
//     chapterCount + fallbackUsed + anchorRoundTrip per book, snapshots the
//     exact EPUB_THRESHOLDS that produced every verdict, and writes the
//     derived evidence record.
//   - CI replay (always-on replay.spec.ts, authored in Task 3 with the
//     committed records) validates the committed epub-evidence.json against
//     the D12-12 bar + manifest. Missing record → loud failure ("EPUB
//     calibration requires the local corpus — see docs/epub-calibration.md")
//     — NEVER a silent skip (the T-11-15 discipline, EPUB edition).
//
// EXIT SEMANTICS: this module is a plain importable core — no process.exit
// anywhere. "Exit 2-class refusals" (missing corpus, tampered sha, empty
// results) are THROWS here; the derive spec maps them to test failures,
// which is how the exit codes surface under `npm run calibrate:epub`
// (vitest owns TS module resolution — the pdf derive precedent).
//
// D12-12 promotion bar, enforced by validateEvidence (every corpus book is
// DRM-free by corpus contract — Task 2's checkpoint guarantees it — so the
// bar is stated over the whole corpus):
//   1. EVERY entry admitted (a DRM-free real book the reader refuses is a
//      detection failure, not a success — unlike PDF, there is no
//      expected-refusal class here; DRM books belong in the 12-01 synthetic
//      refusal tests, never this corpus).
//   2. admitted chapterCount === expected.expectedChapters (the TOC-merge
//      admitted exactly the chapters the human counted in the real book).
//   3. fallbackUsed === false whenever expected.tocResolvable (the
//      calibration warning sign: fallback on a book whose nav/NCX resolves
//      means href normalization regressed — Pitfall 1).
//   4. anchorRoundTrip === true on every admitted entry (the per-chapter
//      SC#4 assertRoundTripAnchor gate passed inside ingestEpubBook — an ok
//      book envelope implies it, and the evidence records it explicitly).
//   5. non-empty results (refuse-empty — the fingerprint.compare.ts
//      L205-211 precedent: never validate or write a placeholder record).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { EPUB_THRESHOLDS, epubToBooks } from "../../../../server/epubToBooks";
import { ingest } from "../../../../server/ingest";

// ── Schemas (zod-at-boundary — every committed record validates on load) ────

/** Which navigation document the book's TOC resolves through. "none" books
 * (no usable nav AND no usable NCX) legitimately take the fallback
 * partition — the manifest records that expectation honestly. */
export const NAV_TYPE_ENUM = z.enum(["nav", "ncx", "none"] as const);
export type NavType = z.infer<typeof NAV_TYPE_ENUM>;

const SHA256_REGEX = /^[0-9a-f]{64}$/;

/** Verdict: "admitted" or "refused:" + the typed IngestionFailureReason. */
const VERDICT_REGEX = /^(admitted|refused:[a-z-]+)$/;

/** The expected shape of one corpus book. drmFree is a LITERAL true: the
 * corpus contract (Task 2's checkpoint) admits only DRM-free books — a DRM
 * book belongs in the 12-01 synthetic refusal tests, never this corpus, so
 * the schema itself refuses a manifest that drifts from that contract. */
export const ExpectedShapeSchema = z.object({
  drmFree: z.literal(true),
  navType: NAV_TYPE_ENUM,
  /** The chapter count the reader must ADMIT for this book (the human's
   * count over the real book's TOC, including admitted front matter and
   * excluding disclosed cover-plate skips). */
  expectedChapters: z.number().int().min(1),
  /** Whether the book's nav/NCX TOC should resolve to ≥ the merge floor —
   * when true, fallbackUsed === false is enforced (the Pitfall 1 warning
   * sign). "none" books record false and may legitimately fall back. */
  tocResolvable: z.boolean(),
});
export type ExpectedShape = z.infer<typeof ExpectedShapeSchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z
    .array(
      z.object({
        file: z.string().min(1),
        sha256: z.string().regex(SHA256_REGEX),
        expected: ExpectedShapeSchema,
        /** Producer tool when known (Sigil/calibre/InDesign…) — the pdf
         * manifest's entry-level producer convention, informational. */
        producer: z.string().optional(),
      }),
    )
    .min(1),
});
export type CalibrationManifest = z.infer<typeof ManifestSchema>;

export const EvidenceResultSchema = z.object({
  file: z.string().min(1),
  sha256: z.string().regex(SHA256_REGEX),
  verdict: z.string().regex(VERDICT_REGEX),
  chapterCount: z.number().int().min(0).optional(),
  fallbackUsed: z.boolean().optional(),
  anchorRoundTrip: z.boolean().optional(),
});
export type EvidenceResult = z.infer<typeof EvidenceResultSchema>;

export const EvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  /** The EPUB_THRESHOLDS snapshot that produced every recorded verdict —
   * thresholds live WITH their evidence so a recorded pass is auditable
   * against the numbers that produced it (D12-12, the D11-04 mirror; the
   * replay pins EPUB_THRESHOLDS deep-equal against this object — T-12-20).
   * ZodRecord has no .min — the non-empty check is a refine. */
  thresholds: z
    .record(z.string(), z.number())
    .refine((r) => Object.keys(r).length > 0, {
      message: "thresholds snapshot must not be empty",
    }),
  results: z.array(EvidenceResultSchema).min(1),
});
export type EpubCalibrationEvidence = z.infer<typeof EvidenceSchema>;

// ── Manifest / evidence loading ──────────────────────────────────────────────

/** Parse + validate a manifest VALUE (pure — the in-memory fixtures of
 * harness.test.ts exercise this directly). Rejects unknown navType values,
 * non-DRM-free expectations, and missing schemaVersion via zod, and
 * duplicate files explicitly (zod cannot see cross-entry uniqueness). */
export function parseManifest(value: unknown): CalibrationManifest {
  const parsed = ManifestSchema.parse(value);
  const seen = new Set<string>();
  for (const entry of parsed.entries) {
    if (seen.has(entry.file)) {
      throw new Error(
        `[epub-calibration] manifest lists duplicate file: ${entry.file}`,
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

/** Load + validate a committed evidence record. */
export function loadEvidence(evidencePath: string): EpubCalibrationEvidence {
  return EvidenceSchema.parse(JSON.parse(readFileSync(evidencePath, "utf8")));
}

/** The loud CI-absence message — the D12-12 mirror of the pdf replay's
 * "calibration requires the local corpus" contract (never a silent skip).
 * Exported so replay.spec.ts and the docs quote ONE string. */
export const MISSING_RECORD_MESSAGE =
  "EPUB calibration requires the local corpus — see docs/epub-calibration.md";

/**
 * loadCommittedEvidence — the replay's record loader: absent record THROWS
 * the loud message instead of skipping (T-11-15 discipline, EPUB edition).
 * The temp-rename test in harness.test.ts pins this throw; replay.spec.ts
 * routes every read through here so the absence branch and the message can
 * never drift apart.
 */
export function loadCommittedEvidence(
  evidencePath: string,
): EpubCalibrationEvidence {
  if (!existsSync(evidencePath)) {
    throw new Error(
      `${MISSING_RECORD_MESSAGE} — no committed epub-evidence.json ` +
        `(run npm run calibrate:epub locally against corpus/epub/ and commit ` +
        `the derived record)`,
    );
  }
  return loadEvidence(evidencePath);
}

// ── verifyCorpus (corpus integrity before any derive work) ──────────────────

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

// ── validateEvidence (the D12-12 promotion bar — CI replays this) ───────────

export type EvidenceValidation =
  | { ok: true }
  | { ok: false; problems: string[] };

/**
 * validateEvidence — enforce the D12-12 bar over a manifest + evidence pair.
 * Defensive zod re-parse first (hand-built or drifted records fail loudly,
 * not silently), then the semantic rules: every manifest entry has exactly
 * one matching result (sha256 agreeing), every DRM-free corpus book
 * admitted with chapterCount === expectedChapters, fallbackUsed === false
 * wherever expected.tocResolvable, anchorRoundTrip === true on every
 * admitted entry, thresholds present, results non-empty (refuse-empty —
 * the fingerprint.compare.ts L205-211 precedent).
 */
export function validateEvidence(
  manifest: CalibrationManifest,
  evidence: EpubCalibrationEvidence,
): EvidenceValidation {
  const problems: string[] = [];

  // Refuse-empty FIRST (before schema validation short-circuits): a record
  // with no results is a placeholder, not evidence — the explicit
  // fingerprint.compare.ts L205-211 precedent behavior.
  if (!evidence.results || evidence.results.length === 0) {
    problems.push(
      "[epub-calibration] evidence results are empty — refusing to validate a placeholder record (refuse-empty guard)",
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

  // Every manifest entry: exactly one result, hashes agreeing, admitted at
  // the expected shape (the bar clauses, each independently reportable).
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
    if (result.verdict !== "admitted") {
      // The corpus is DRM-free by contract — every book must admit.
      problems.push(
        `DRM-free corpus book not admitted: ${entry.file} recorded ${result.verdict}`,
      );
      continue;
    }
    if (result.chapterCount === undefined) {
      problems.push(`admitted result lacks chapterCount: ${entry.file}`);
    } else if (result.chapterCount !== entry.expected.expectedChapters) {
      problems.push(
        `chapter count mismatch for ${entry.file}: expected ${entry.expected.expectedChapters}, recorded ${result.chapterCount}`,
      );
    }
    if (result.fallbackUsed === undefined) {
      problems.push(`admitted result lacks fallbackUsed: ${entry.file}`);
    } else if (entry.expected.tocResolvable && result.fallbackUsed !== false) {
      problems.push(
        `fallback partition fired on a book whose TOC resolves (Pitfall 1 warning sign): ${entry.file} (fallbackUsed: ${result.fallbackUsed})`,
      );
    }
    if (result.anchorRoundTrip !== true) {
      problems.push(
        `admitted result lacks anchorRoundTrip === true: ${entry.file} (SC#4 per-chapter gate)`,
      );
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

// ── deriveEvidence (LOCAL mode — the real adapter + orchestrator path) ──────

export interface DerivePaths {
  manifestPath: string;
  corpusDir: string;
}

/**
 * deriveEvidence — run the REAL pipeline over every corpus EPUB and record
 * what it actually did. Per file: read bytes → base64 → ingest({epub,
 * filename}) (the full orchestrator path: caps, epubToBooks detection on the
 * CURRENT EPUB_THRESHOLDS, per-chapter ArticleSchema.parse + the SC#4
 * assertRoundTripAnchor gate + confidence, book assembly). An ok book
 * envelope records "admitted" + chapterCount (articles.length — the count
 * the reader would save) + fallbackUsed + anchorRoundTrip: true (ok implies
 * every admitted chapter passed the per-chapter anchor gate). A typed
 * refusal records "refused:" + the reason. fallbackUsed comes from the
 * adapter itself (epubToBooks) because the ingest book envelope does not
 * carry it — derive runs the real adapter path too, so the evidence records
 * the adapter's own warning flag. The CURRENT EPUB_THRESHOLDS snapshot
 * rides along so every verdict is auditable against the numbers that
 * produced it. Throws (never writes partial evidence) on corpus integrity
 * failure.
 */
export async function deriveEvidence(
  paths: DerivePaths,
): Promise<EpubCalibrationEvidence> {
  const manifest = loadManifest(paths.manifestPath);

  // Corpus integrity gate BEFORE any derive work.
  const verification = verifyCorpus(paths.corpusDir, manifest);
  if (!verification.ok) {
    throw new Error(
      `[epub-calibration] corpus verification failed — missing: [${verification.missing.join(", ")}], sha256 mismatch: [${verification.mismatched.join(", ")}]. ${MISSING_RECORD_MESSAGE}`,
    );
  }

  const results: EvidenceResult[] = [];
  for (const entry of manifest.entries) {
    const bytes = readFileSync(join(paths.corpusDir, entry.file));
    const b64 = Buffer.from(bytes).toString("base64");
    const response = await ingest({ epub: b64, filename: entry.file });
    if (response.ok && "book" in response) {
      // Admitted — the per-chapter SC#4 anchor gate ran INSIDE
      // ingestEpubBook and passed for every admitted chapter (an ok book
      // envelope implies it); record it explicitly from the envelope shape.
      // fallbackUsed rides the adapter result (the orchestrator envelope
      // deliberately does not carry it — it is a calibration signal, not a
      // reader-facing one).
      let fallbackUsed: boolean | undefined;
      try {
        const adapter = await epubToBooks(new Uint8Array(bytes));
        fallbackUsed = adapter.fallbackUsed;
      } catch {
        // Unreachable when ingest admitted (the adapter is deterministic
        // and ingest already ran it once) — leaving fallbackUsed undefined
        // makes validateEvidence flag the contract violation honestly.
      }
      results.push({
        file: entry.file,
        sha256: entry.sha256,
        verdict: "admitted",
        chapterCount: response.articles.length,
        fallbackUsed,
        anchorRoundTrip: true,
      });
    } else if (!response.ok) {
      results.push({
        file: entry.file,
        sha256: entry.sha256,
        verdict: `refused:${response.reason}`,
      });
    } else {
      // ok:true but the single-article envelope — unreachable on the epub
      // path (the epub branch always answers with the book variant); keep
      // the harness honest by recording the contract violation.
      results.push({
        file: entry.file,
        sha256: entry.sha256,
        verdict: "refused:server-error",
      });
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    thresholds: { ...EPUB_THRESHOLDS },
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
  evidence: EpubCalibrationEvidence,
  evidencePath: string,
): void {
  if (!evidence.results || evidence.results.length === 0) {
    throw new Error(
      "[epub-calibration] refusing to overwrite the committed evidence record with empty results — the corpus derive produced no verdicts (see docs/epub-calibration.md)",
    );
  }
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
}
