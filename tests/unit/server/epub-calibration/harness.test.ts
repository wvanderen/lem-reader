// tests/unit/server/epub-calibration/harness.test.ts
// Plan 12-08 Task 1 — the pure behavior table for the calibration harness
// core. Every fixture here is IN-MEMORY (or a tmp-dir byte file for the
// SHA-256 verification paths): these tests prove the harness MECHANICS only.
// They are NOT calibration fixtures — D12-12 forbids synthesizing EPUBs for
// calibration; the real corpus stays local + gitignored and is exercised
// exclusively by the env-gated derive.spec.ts (Task 3).
//
// Behavior table (12-08-PLAN.md Task 1 action 3):
//   - validateEvidence passes a hand-built manifest+evidence pair
//   - validateEvidence fails each bar clause INDEPENDENTLY: wrong
//     chapterCount, fallback on a resolvable book, missing anchor flag,
//     empty results (+ missing result, sha256 disagreement, refused DRM-free
//     book, ghost entry, absent thresholds)
//   - verifyCorpus flags a sha256 mismatch
//   - writeEvidence refuses empty results
//   - loadCommittedEvidence throws the loud calibration-requires message
//     when the record is absent (the temp-rename test — replay.spec.ts's
//     absence branch routes through this loader)
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseManifest,
  loadManifest,
  verifyCorpus,
  validateEvidence,
  writeEvidence,
  loadCommittedEvidence,
  MISSING_RECORD_MESSAGE,
  type EpubCalibrationEvidence,
} from "./harness";

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

const NAV_BOOK_BYTES = "epub3-nav-novel-bytes";
const NCX_BOOK_BYTES = "epub2-ncx-collection-bytes";
const SPLIT_BOOK_BYTES = "publisher-split-front-matter-bytes";
const NONE_BOOK_BYTES = "no-usable-toc-bytes";

/** The hand-built manifest: four books spanning the shape classes the bar
 * discriminates — EPUB 3 nav, EPUB 2 NCX-only, publisher chapter-splitting
 * with real front matter, and a no-TOC book that legitimately falls back
 * (tocResolvable: false — fallbackUsed true is EXPECTED there, and the bar
 * permits it). */
const VALID_MANIFEST: unknown = {
  schemaVersion: 1,
  entries: [
    {
      file: "novel-nav.epub",
      sha256: sha256(NAV_BOOK_BYTES),
      expected: {
        drmFree: true,
        navType: "nav",
        expectedChapters: 12,
        tocResolvable: true,
      },
      producer: "Sigil",
    },
    {
      file: "collection-ncx.epub",
      sha256: sha256(NCX_BOOK_BYTES),
      expected: {
        drmFree: true,
        navType: "ncx",
        expectedChapters: 8,
        tocResolvable: true,
      },
      producer: "calibre",
    },
    {
      file: "split-front-matter.epub",
      sha256: sha256(SPLIT_BOOK_BYTES),
      expected: {
        drmFree: true,
        navType: "nav",
        expectedChapters: 13, // 12 chapters + admitted front matter
        tocResolvable: true,
      },
    },
    {
      file: "no-toc.epub",
      sha256: sha256(NONE_BOOK_BYTES),
      expected: {
        drmFree: true,
        navType: "none",
        expectedChapters: 5,
        tocResolvable: false, // fallback partition is the honest expectation
      },
    },
  ],
};

/** A hand-built VALID evidence record for VALID_MANIFEST — the D12-12 bar
 * satisfied: every DRM-free book admitted at its expected chapter count,
 * fallbackUsed false wherever the TOC resolves (and honestly true on the
 * no-TOC book), anchorRoundTrip true everywhere. */
function validEvidence(): EpubCalibrationEvidence {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-18T00:00:00.000Z",
    thresholds: { minChapterBlocks: 3, tocMergeMinEntries: 2, maxNestedXmlTags: 40 },
    results: [
      {
        file: "novel-nav.epub",
        sha256: sha256(NAV_BOOK_BYTES),
        verdict: "admitted",
        chapterCount: 12,
        fallbackUsed: false,
        anchorRoundTrip: true,
      },
      {
        file: "collection-ncx.epub",
        sha256: sha256(NCX_BOOK_BYTES),
        verdict: "admitted",
        chapterCount: 8,
        fallbackUsed: false,
        anchorRoundTrip: true,
      },
      {
        file: "split-front-matter.epub",
        sha256: sha256(SPLIT_BOOK_BYTES),
        verdict: "admitted",
        chapterCount: 13,
        fallbackUsed: false,
        anchorRoundTrip: true,
      },
      {
        file: "no-toc.epub",
        sha256: sha256(NONE_BOOK_BYTES),
        verdict: "admitted",
        chapterCount: 5,
        fallbackUsed: true, // tocResolvable:false — the bar permits fallback
        anchorRoundTrip: true,
      },
    ],
  };
}

// ── parseManifest / loadManifest ────────────────────────────────────────────

describe("parseManifest", () => {
  it("accepts a valid manifest (3 nav types, optional producer)", () => {
    const m = parseManifest(VALID_MANIFEST);
    expect(m.entries).toHaveLength(4);
    expect(m.entries[0]).toMatchObject({
      file: "novel-nav.epub",
      expected: { navType: "nav", expectedChapters: 12, tocResolvable: true },
    });
    expect(m.entries[2]?.producer).toBeUndefined();
  });

  it("rejects duplicate files", () => {
    const dup = JSON.parse(JSON.stringify(VALID_MANIFEST)) as { entries: unknown[] };
    dup.entries[1] = { ...(dup.entries[1] as { file: string }), file: "novel-nav.epub" };
    expect(() => parseManifest(dup)).toThrow(/duplicate/i);
  });

  it("rejects unknown navType values", () => {
    const bad = JSON.parse(JSON.stringify(VALID_MANIFEST)) as {
      entries: { expected: { navType: string } }[];
    };
    bad.entries[0]!.expected.navType = "toc";
    expect(() => parseManifest(bad)).toThrow();
  });

  it("rejects a drmFree:false expectation (the corpus contract is DRM-free books only)", () => {
    const bad = JSON.parse(JSON.stringify(VALID_MANIFEST)) as {
      entries: { expected: { drmFree: boolean } }[];
    };
    bad.entries[0]!.expected.drmFree = false;
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
    dir = mkdtempSync(join(tmpdir(), "epub-calib-manifest-"));
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

// ── verifyCorpus (manifest SHA-256 verification before derive) ──────────────

describe("verifyCorpus", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "epub-calib-corpus-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes when every file is present with the manifest sha256", () => {
    writeFileSync(join(dir, "novel-nav.epub"), NAV_BOOK_BYTES, "utf8");
    writeFileSync(join(dir, "collection-ncx.epub"), NCX_BOOK_BYTES, "utf8");
    writeFileSync(join(dir, "split-front-matter.epub"), SPLIT_BOOK_BYTES, "utf8");
    writeFileSync(join(dir, "no-toc.epub"), NONE_BOOK_BYTES, "utf8");
    const v = verifyCorpus(dir, parseManifest(VALID_MANIFEST));
    expect(v.ok).toBe(true);
  });

  it("detects a sha256 mismatch and returns the offending file", () => {
    writeFileSync(join(dir, "novel-nav.epub"), "TAMPERED-BYTES", "utf8");
    writeFileSync(join(dir, "collection-ncx.epub"), NCX_BOOK_BYTES, "utf8");
    writeFileSync(join(dir, "split-front-matter.epub"), SPLIT_BOOK_BYTES, "utf8");
    writeFileSync(join(dir, "no-toc.epub"), NONE_BOOK_BYTES, "utf8");
    const v = verifyCorpus(dir, parseManifest(VALID_MANIFEST));
    expect(v.ok).toBe(false);
    expect(v.mismatched).toContain("novel-nav.epub");
  });

  it("reports a missing corpus file", () => {
    writeFileSync(join(dir, "novel-nav.epub"), NAV_BOOK_BYTES, "utf8");
    const v = verifyCorpus(dir, parseManifest(VALID_MANIFEST));
    expect(v.ok).toBe(false);
    expect(v.missing).toContain("collection-ncx.epub");
  });
});

// ── validateEvidence (the D12-12 promotion bar) ─────────────────────────────

describe("validateEvidence", () => {
  it("passes a hand-built valid manifest+evidence pair", () => {
    const res = validateEvidence(parseManifest(VALID_MANIFEST), validEvidence());
    expect(res.ok).toBe(true);
  });

  it("fails when a manifest entry lacks a result", () => {
    const evidence = validEvidence();
    evidence.results = evidence.results.filter((r) => r.file !== "no-toc.epub");
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.problems.some((p) => p.includes("no-toc.epub"))).toBe(true);
  });

  it("fails when a result's sha256 disagrees with the manifest", () => {
    const evidence = validEvidence();
    evidence.results[0]!.sha256 = sha256("different-bytes");
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.problems.some((p) => p.includes("sha256"))).toBe(true);
  });

  it("fails when a DRM-free corpus book is refused (every corpus book must admit)", () => {
    const evidence = validEvidence();
    evidence.results[0]!.verdict = "refused:epub-unreadable";
    delete evidence.results[0]!.chapterCount;
    delete evidence.results[0]!.fallbackUsed;
    delete evidence.results[0]!.anchorRoundTrip;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(
      res.ok === false && res.problems.some((p) => /not admitted/i.test(p)),
    ).toBe(true);
  });

  it("fails when an admitted result's chapterCount is wrong", () => {
    const evidence = validEvidence();
    evidence.results[0]!.chapterCount = 11; // expected 12
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(
      res.ok === false && res.problems.some((p) => /chapter count mismatch/i.test(p)),
    ).toBe(true);
  });

  it("fails when an admitted result's chapterCount is missing", () => {
    const evidence = validEvidence();
    delete evidence.results[0]!.chapterCount;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(
      res.ok === false && res.problems.some((p) => /lacks chapterCount/i.test(p)),
    ).toBe(true);
  });

  it("fails when the fallback partition fired on a book whose TOC resolves (Pitfall 1)", () => {
    const evidence = validEvidence();
    evidence.results[1]!.fallbackUsed = true; // collection-ncx resolves
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(
      res.ok === false && res.problems.some((p) => /whose TOC resolves/i.test(p)),
    ).toBe(true);
  });

  it("permits fallback on a book whose TOC does not resolve (honest expectation)", () => {
    // no-toc.epub keeps fallbackUsed: true in the valid fixture — prove the
    // bar clause scopes to tocResolvable books only.
    const res = validateEvidence(parseManifest(VALID_MANIFEST), validEvidence());
    expect(res.ok).toBe(true);
  });

  it("fails when an admitted result's fallbackUsed is missing", () => {
    const evidence = validEvidence();
    delete evidence.results[0]!.fallbackUsed;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(
      res.ok === false && res.problems.some((p) => /lacks fallbackUsed/i.test(p)),
    ).toBe(true);
  });

  it("fails when an admitted result's anchorRoundTrip flag is missing", () => {
    const evidence = validEvidence();
    delete evidence.results[0]!.anchorRoundTrip;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
    expect(
      res.ok === false && res.problems.some((p) => /anchorRoundTrip/i.test(p)),
    ).toBe(true);
  });

  it("fails when an admitted result's anchorRoundTrip is false", () => {
    const evidence = validEvidence();
    evidence.results[0]!.anchorRoundTrip = false;
    const res = validateEvidence(parseManifest(VALID_MANIFEST), evidence);
    expect(res.ok).toBe(false);
  });

  it("fails when thresholds are absent", () => {
    const evidence = validEvidence() as unknown as Record<string, unknown>;
    delete evidence.thresholds;
    const res = validateEvidence(
      parseManifest(VALID_MANIFEST),
      evidence as unknown as EpubCalibrationEvidence,
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
      file: "ghost.epub",
      sha256: sha256("ghost-bytes"),
      verdict: "admitted",
      chapterCount: 3,
      fallbackUsed: false,
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
    dir = mkdtempSync(join(tmpdir(), "epub-calib-write-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to write empty results and creates no file", () => {
    const evidence = validEvidence();
    evidence.results = [];
    const path = join(dir, "epub-evidence.json");
    expect(() => writeEvidence(evidence, path)).toThrow(/empty/i);
    expect(existsSync(path)).toBe(false);
  });

  it("writes a valid evidence record as JSON + trailing newline", () => {
    const path = join(dir, "epub-evidence.json");
    writeEvidence(validEvidence(), path);
    expect(existsSync(path)).toBe(true);
    const txt = readFileSync(path, "utf8");
    expect(txt.endsWith("\n")).toBe(true);
    expect(JSON.parse(txt).results).toHaveLength(4);
  });
});

// ── loadCommittedEvidence (the loud CI-absence branch — temp-rename test) ───

describe("loadCommittedEvidence (the replay's missing-record branch)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "epub-calib-replay-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws the loud calibration-requires message when the record is absent", () => {
    // The message is plain text with no regex metacharacters — build the
    // matcher from the ONE exported constant so spec and loader cannot drift.
    expect(() => loadCommittedEvidence(join(dir, "epub-evidence.json"))).toThrow(
      new RegExp(MISSING_RECORD_MESSAGE),
    );
  });

  it("loads a present record, then throws loud once it is renamed away", () => {
    const path = join(dir, "epub-evidence.json");
    writeEvidence(validEvidence(), path);
    const loaded = loadCommittedEvidence(path);
    expect(loaded.results).toHaveLength(4);
    renameSync(path, join(dir, "epub-evidence.json.away"));
    expect(() => loadCommittedEvidence(path)).toThrow(
      /EPUB calibration requires the local corpus — see docs\/epub-calibration\.md/,
    );
    expect(existsSync(path)).toBe(false);
  });
});
