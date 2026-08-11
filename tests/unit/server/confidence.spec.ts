// tests/unit/server/confidence.spec.ts
// Plan 07-03 Task 2 — ING-06 three-state confidence model. Replaces the
// Wave-0 stub with real table-driven tests over the locked formula from
// 07-RESEARCH.md §Confidence Thresholds L529-546:
//   - isProbablyReaderable=false           → unsupported ("page-not-readerable")
//   - unsupportedBlockRatio > 0.4          → low ("high-unsupported-ratio") (Pitfall 1)
//   - blockCount>=3 && textLength>=500     → confident
//   - else (readerable but thin)           → low ("extraction-thin")
//
// Pitfall 2 honored: deriveConfidence computes textLength via the SHARED
// normalizeText(article) from src/content/normalizeText.ts (no fork). The
// tests build small CanonicalArticle fixtures and assert on the derived state
// + reason; the unsupported-ratio case uses 3 unsupported + 7 paragraph blocks.
import { describe, it, expect } from "vitest";
import { deriveConfidence } from "../../../server/confidence";
import type { CanonicalArticle } from "../../../src/content/schema";

/** Build a minimal article with N paragraph blocks each carrying `textPer`. */
function articleWith(
  blockCount: number,
  textPer: string,
  opts: { unsupported?: number } = {},
): CanonicalArticle {
  const blocks: CanonicalArticle["blocks"] = [];
  for (let i = 0; i < blockCount; i++) {
    blocks.push({
      kind: "paragraph",
      content: [{ text: textPer, marks: [] }],
    });
  }
  for (let i = 0; i < (opts.unsupported ?? 0); i++) {
    blocks.push({
      kind: "unsupported",
      originalKind: `unknown-${i}`,
      plainDescription: `unsupported-${i}`,
    });
  }
  return {
    id: "test-article",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Test",
      retrievedAt: "2026-08-11T00:00:00Z",
      originalHtmlHash: "sha256:test",
    },
    blocks,
    footnotes: [],
  };
}

/** A paragraph with ~600 chars of body text (well past the 500 threshold). */
const LONG_BODY = "This is a sufficiently long paragraph body. ".repeat(14); // ~616 chars

describe("deriveConfidence — ING-06 three-state model (07-03 Task 2)", () => {
  it("isProbablyReaderable=false → { state: 'unsupported', reason: 'page-not-readerable' }", () => {
    const article = articleWith(5, LONG_BODY);
    const result = deriveConfidence(article, { isReaderable: false });
    expect(result.state).toBe("unsupported");
    expect(result.reason).toBe("page-not-readerable");
  });

  it("blockCount>=3 && textLength>=500, low unsupported ratio → { state: 'confident' }", () => {
    // 5 paragraphs × ~616 chars = ~3080 chars normalized text, well past 500
    const article = articleWith(5, LONG_BODY);
    const result = deriveConfidence(article, { isReaderable: true });
    expect(result.state).toBe("confident");
    expect(result.reason).toBeUndefined();
  });

  it("blockCount<3 (readerable) → { state: 'low', reason: 'extraction-thin' }", () => {
    // 2 paragraphs × ~616 chars = ~1232 chars (past 500) but blockCount<3
    const article = articleWith(2, LONG_BODY);
    const result = deriveConfidence(article, { isReaderable: true });
    expect(result.state).toBe("low");
    expect(result.reason).toBe("extraction-thin");
  });

  it("textLength<500 (readerable, enough blocks) → { state: 'low', reason: 'extraction-thin' }", () => {
    // 5 paragraphs but only ~20 chars each = ~100 chars total (< 500)
    const article = articleWith(5, "short body text.");
    const result = deriveConfidence(article, { isReaderable: true });
    expect(result.state).toBe("low");
    expect(result.reason).toBe("extraction-thin");
  });

  it("unsupportedBlockRatio>0.4 → { state: 'low', reason: 'high-unsupported-ratio' } (Pitfall 1)", () => {
    // 3 unsupported + 7 paragraph = 30% unsupported... need >40%. Use 5 unsupported + 5 paragraph = 50%.
    // Each paragraph carries long body so blockCount + textLength would otherwise pass.
    const article = articleWith(5, LONG_BODY, { unsupported: 5 });
    const result = deriveConfidence(article, { isReaderable: true });
    expect(result.state).toBe("low");
    expect(result.reason).toBe("high-unsupported-ratio");
  });

  it("unsupportedBlockRatio just under 0.4 remains confident (boundary)", () => {
    // 3 unsupported + 7 paragraph = 30% — under the 0.4 threshold
    const article = articleWith(7, LONG_BODY, { unsupported: 3 });
    const result = deriveConfidence(article, { isReaderable: true });
    expect(result.state).toBe("confident");
  });

  it("isReaderable=false short-circuits even with high unsupported ratio", () => {
    const article = articleWith(5, LONG_BODY, { unsupported: 5 });
    const result = deriveConfidence(article, { isReaderable: false });
    expect(result.state).toBe("unsupported");
    expect(result.reason).toBe("page-not-readerable");
  });
});
