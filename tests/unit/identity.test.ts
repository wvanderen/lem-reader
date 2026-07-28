import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";

/**
 * Identity contract (D-06): stable slug id + monotonic integer revision.
 *
 * Manual discipline rule: revision MUST bump whenever normalized content
 * changes. Two fixtures with the same .id and different .revision represent
 * revisions of the same article. Saved locations/annotations (later phases)
 * record the revision they were made against so a mismatch is detectable.
 */

describe("ArticleSchema.shape.id (D-06 stable slug)", () => {
  it("accepts a lowercase slug", () => {
    expect(ArticleSchema.shape.id.parse("essay-long-form")).toBe("essay-long-form");
  });

  it("rejects a slug with uppercase letters", () => {
    expect(() => ArticleSchema.shape.id.parse("Essay Long Form")).toThrow();
  });

  it("rejects a URL-shaped id (id must NEVER be the source URL — D-06)", () => {
    expect(() => ArticleSchema.shape.id.parse("https://example.com/a")).toThrow();
  });

  it("rejects a slug with spaces", () => {
    expect(() => ArticleSchema.shape.id.parse("two words")).toThrow();
  });
});

describe("ArticleSchema.shape.revision (D-06 monotonic integer)", () => {
  it("accepts revision 1", () => {
    expect(ArticleSchema.shape.revision.parse(1)).toBe(1);
  });

  it("accepts a large revision", () => {
    expect(ArticleSchema.shape.revision.parse(42)).toBe(42);
  });

  it("rejects 0 (revisions start at 1)", () => {
    expect(() => ArticleSchema.shape.revision.parse(0)).toThrow();
  });

  it("rejects negative revisions", () => {
    expect(() => ArticleSchema.shape.revision.parse(-1)).toThrow();
  });

  it("rejects non-integer revisions (1.5)", () => {
    expect(() => ArticleSchema.shape.revision.parse(1.5)).toThrow();
  });
});

describe("revision discipline (documented manual rule)", () => {
  // Two fixtures with the same id and different revisions represent revisions
  // of the SAME article. Revision bumps whenever normalized content changes.
  it("permits the same id with different revisions (same article, two revisions)", () => {
    const base = {
      id: "same-article",
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/a",
        title: "Same",
        retrievedAt: "2026-01-01T00:00:00Z",
        originalHtmlHash: "sha256:aaa",
      },
      blocks: [{ kind: "paragraph" as const, content: [{ text: "v1 body" }] }],
    };
    const r1 = ArticleSchema.parse({ ...base, revision: 1 });
    const r2 = ArticleSchema.parse({ ...base, revision: 2, blocks: [{ kind: "paragraph", content: [{ text: "v2 body edited" }] }] });
    expect(r1.id).toBe(r2.id);
    expect(r1.revision).toBe(1);
    expect(r2.revision).toBe(2);
  });
});
