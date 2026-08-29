// tests/unit/library/effective-metadata.test.ts
// Plan 17-01 — the META-01/02/03 substrate truth table for
// effectiveMetadata.ts (D14-20: ONE derivation owned by ONE module) plus
// the ArticleSchema override-field boundary guards. PURE coverage — no
// React, no Dexie; every article is built via ArticleSchema.parse of a
// literal row object (the reading-state.test.ts schema-parse builder
// discipline — NEVER hand-write a CanonicalArticle literal).
//
// Guards pinned here (17-01-PLAN.md must_haves):
//   - META-01: a row carrying readerTitle round-trips ArticleSchema.parse
//     with the field intact AND its provenance deep-equal to the input
//     (the strip-mode trap guard — Pitfall 1: undeclared keys are stripped
//     on every Dexie read, so overrides MUST be schema-declared).
//   - D17-04: an empty-string override FAILS safeParse — no schema state
//     can represent a blank override (Pitfall 2: an empty string written
//     to a row would drop the WHOLE article at the next read).
//   - META-02/META-03: effectiveTitle/effectiveAuthor derive override ??
//     canonical, including the absent-author restore
//     (`undefined ?? undefined === undefined` — every consumer's existing
//     truthy guard renders nothing).
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import {
  effectiveAuthor,
  effectiveTitle,
} from "../../../src/ingestion/library/effectiveMetadata";

/** Build a minimal valid article row (the ingestion-schema.test.ts
 * validV1Article shape) with per-test overrides spread over it. The row is
 * ALWAYS validated through ArticleSchema.parse at the call site — the
 * schema is the single source of truth (Zod-at-boundary). */
function makeRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "test-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Canonical Title",
      author: "Canonical Author",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "sha256:abc123def456",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Hello world." }] }],
    footnotes: [],
    ...overrides,
  };
}

describe("ArticleSchema override fields (META-01 — additive; provenance untouched)", () => {
  it("a row carrying readerTitle round-trips ArticleSchema.parse with the field intact (Pitfall 1 strip-mode guard)", () => {
    const parsed = ArticleSchema.parse(
      makeRow({ readerTitle: "My Chosen Name" }),
    );
    expect(parsed.readerTitle).toBe("My Chosen Name");
  });

  it("parsing a row with an override leaves provenance deep-equal to the input provenance (META-01 — canonical bytes are the identity/anchor contract)", () => {
    const provenance = {
      sourceUrl: "https://example.com/article",
      title: "Canonical Title",
      author: "Canonical Author",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "sha256:abc123def456",
    };
    const parsed = ArticleSchema.parse(
      makeRow({ provenance, readerTitle: "Renamed" }),
    );
    expect(parsed.provenance).toEqual(provenance);
  });

  it("safeParse REJECTS an empty-string readerTitle (D17-04 — blank override unrepresentable; Pitfall 2 row-poison guard)", () => {
    const result = ArticleSchema.safeParse(makeRow({ readerTitle: "" }));
    expect(result.success).toBe(false);
  });
});

describe("effectiveTitle/effectiveAuthor (META-02 — one derivation; META-03 — clear-to-canonical)", () => {
  it("override present → effectiveTitle returns the override (reader-owned wins)", () => {
    const article = ArticleSchema.parse(
      makeRow({ readerTitle: "My Chosen Name" }),
    );
    expect(effectiveTitle(article)).toBe("My Chosen Name");
  });

  it("override present → effectiveAuthor returns the override (reader-owned wins)", () => {
    const article = ArticleSchema.parse(
      makeRow({ readerAuthor: "Renamed Author" }),
    );
    expect(effectiveAuthor(article)).toBe("Renamed Author");
  });

  it("override absent → effectiveTitle falls back to the canonical provenance.title", () => {
    const article = ArticleSchema.parse(makeRow());
    expect(effectiveTitle(article)).toBe("Canonical Title");
  });

  it("override absent → effectiveAuthor falls back to the canonical provenance.author", () => {
    const article = ArticleSchema.parse(makeRow());
    expect(effectiveAuthor(article)).toBe("Canonical Author");
  });

  it("absent override + absent canonical author → effectiveAuthor is undefined (META-03 absent-author restore)", () => {
    const article = ArticleSchema.parse(
      makeRow({
        provenance: {
          sourceUrl: "https://example.com/article",
          title: "Canonical Title",
          retrievedAt: "2026-01-01T00:00:00Z",
          originalHtmlHash: "sha256:abc123def456",
        },
      }),
    );
    expect(article.provenance.author).toBeUndefined();
    expect(effectiveAuthor(article)).toBeUndefined();
  });
});
