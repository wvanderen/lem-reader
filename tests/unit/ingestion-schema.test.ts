import { describe, expect, it } from "vitest";
import {
  ArticleSchema,
  ArticleSourceSchema,
  IngestionMetaSchema,
} from "../../src/content/schema";
import {
  IngestionFailureReasonEnum,
  IngestionRequestSchema,
  IngestionResponseSchema,
} from "../../src/ingestion/types";

/**
 * Phase 7 — additive schema extensions (07-02-PLAN.md Task 1).
 *
 * Behavior cases for:
 *   - `ArticleSourceSchema` (D7-08 origin discriminator)
 *   - `IngestionMetaSchema` (the derived per-article metadata sub-schema)
 *   - `ArticleSchema.ingestionMeta: IngestionMetaSchema.optional()` (backward-compat
 *     via `.optional()` — Pitfall 9 mirroring the ReaderSettings.readingMode precedent)
 *   - `Provenance.sourceUrl: httpUrl.optional()` (D7-08 — paste-HTML articles omit it)
 *   - `IngestionRequestSchema` / `IngestionResponseSchema` / `IngestionFailureReasonEnum`
 *     in `src/ingestion/types.ts` (the client-side request/response envelope schemas)
 *
 * Existing v1.0 fixtures must continue to parse unchanged (ingestionMeta absent
 * → undefined; Provenance.sourceUrl still supplied).
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function validV1Article(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "test-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Test Article",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "sha256:abc123def456",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Hello world." }] }],
    footnotes: [],
    ...overrides,
  };
}

const validIngestionMeta = {
  source: "url",
  origin: "url",
  sourceUrl: "https://example.com/article",
  originalHtmlHash: "sha256:abc",
  fetchedAt: "2026-08-10T00:00:00Z",
  extractionConfidence: "high",
  extractionWarnings: [],
} as const;

// ── ArticleSourceSchema (D7-08) ──────────────────────────────────────────────

describe("ArticleSourceSchema", () => {
  it("enum equals exactly [fixture, url, paste] (D7-08)", () => {
    // Zod 4: `.options` is the value array; `.enum` is now the object map.
    expect(ArticleSourceSchema.options).toEqual(["fixture", "url", "paste"]);
  });

  it.each(["fixture", "url", "paste"] as const)(
    "parses source %s",
    (source) => {
      expect(ArticleSourceSchema.parse(source)).toBe(source);
    },
  );

  it.each(["invalid-source", "markdown", "pdf", "epub-chapter", "", "URL"])(
    "rejects source %s (closed enum — forward-compat via later widening)",
    (bad) => {
      expect(() => ArticleSourceSchema.parse(bad)).toThrow();
    },
  );
});

// ── IngestionMetaSchema ──────────────────────────────────────────────────────

describe("IngestionMetaSchema", () => {
  it("parses the canonical url-origin shape", () => {
    const parsed = IngestionMetaSchema.parse(validIngestionMeta);
    expect(parsed.source).toBe("url");
    expect(parsed.origin).toBe("url");
    expect(parsed.sourceUrl).toBe("https://example.com/article");
    expect(parsed.extractionConfidence).toBe("high");
  });

  it("parses the canonical paste-origin shape (D7-08 — origin/sourceUrl/fetchedAt absent)", () => {
    const parsed = IngestionMetaSchema.parse({
      source: "paste",
      originalHtmlHash: "sha256:pasted",
      extractionConfidence: "low",
    });
    expect(parsed.source).toBe("paste");
    expect(parsed.origin).toBeUndefined();
    expect(parsed.sourceUrl).toBeUndefined();
    expect(parsed.fetchedAt).toBeUndefined();
  });

  it("defaults extractionWarnings to [] when absent", () => {
    const parsed = IngestionMetaSchema.parse({
      source: "fixture",
      originalHtmlHash: "sha256:x",
      extractionConfidence: "high",
    });
    expect(parsed.extractionWarnings).toEqual([]);
  });

  it("rejects extractionConfidence: 'unsupported' (that state never reaches persistence — ING-06)", () => {
    expect(() =>
      IngestionMetaSchema.parse({
        ...validIngestionMeta,
        extractionConfidence: "unsupported",
      }),
    ).toThrow();
  });

  it("rejects a non-http sourceUrl (mirrors Provenance.sourceUrl's httpUrl refinement)", () => {
    expect(() =>
      IngestionMetaSchema.parse({
        ...validIngestionMeta,
        sourceUrl: "javascript:alert(1)",
      }),
    ).toThrow();
  });
});

// ── ArticleSchema.ingestionMeta.optional() (Pitfall 9 backward-compat) ───────

describe("ArticleSchema.ingestionMeta (additive optional — Pitfall 9)", () => {
  it("parses a v1.0 fixture WITHOUT ingestionMeta (no error, hydrates to undefined)", () => {
    const parsed = ArticleSchema.parse(validV1Article());
    expect(parsed.ingestionMeta).toBeUndefined();
  });

  it("parses an ingested article WITH full ingestionMeta", () => {
    const parsed = ArticleSchema.parse(
      validV1Article({ ingestionMeta: validIngestionMeta }),
    );
    expect(parsed.ingestionMeta?.source).toBe("url");
    expect(parsed.ingestionMeta?.extractionConfidence).toBe("high");
  });

  it("accepts a Provenance WITHOUT sourceUrl (paste-HTML case, D7-08)", () => {
    const parsed = ArticleSchema.parse(
      validV1Article({
        provenance: {
          title: "Pasted Article",
          retrievedAt: "2026-08-10T00:00:00Z",
          originalHtmlHash: "sha256:pasted",
        },
      }),
    );
    expect(parsed.provenance.sourceUrl).toBeUndefined();
  });

  it("rejects an invalid ingestionMeta.source enum value", () => {
    expect(() =>
      ArticleSchema.parse(
        validV1Article({
          ingestionMeta: { ...validIngestionMeta, source: "invalid-source" },
        }),
      ),
    ).toThrow();
  });
});

// ── src/ingestion/types.ts envelope schemas ──────────────────────────────────

describe("IngestionRequestSchema (D7-03 — {url} | {html})", () => {
  it("parses a url request", () => {
    expect(IngestionRequestSchema.parse({ url: "https://example.com" })).toEqual({
      url: "https://example.com",
    });
  });

  it("parses an html request", () => {
    expect(IngestionRequestSchema.parse({ html: "<p>hi</p>" })).toEqual({
      html: "<p>hi</p>",
    });
  });

  it("throws when NEITHER url NOR html is supplied", () => {
    expect(() => IngestionRequestSchema.parse({})).toThrow();
  });

  it("rejects a non-http url scheme (mirrors Provenance/IngestionMeta httpUrl)", () => {
    expect(() =>
      IngestionRequestSchema.parse({ url: "javascript:alert(1)" }),
    ).toThrow();
  });

  it("rejects empty html (D7-03 — paste path requires content)", () => {
    expect(() => IngestionRequestSchema.parse({ html: "" })).toThrow();
  });
});

describe("IngestionResponseSchema", () => {
  it("parses a confident success envelope (ok: true, article, confidence.state)", () => {
    const raw = {
      ok: true,
      article: validV1Article({ ingestionMeta: validIngestionMeta }),
      confidence: { state: "confident" },
    };
    const parsed = IngestionResponseSchema.parse(raw);
    if (!parsed.ok) throw new Error("expected ok envelope");
    expect(parsed.confidence.state).toBe("confident");
    expect(parsed.article.ingestionMeta?.source).toBe("url");
  });

  it("parses a low-confidence success envelope", () => {
    const parsed = IngestionResponseSchema.parse({
      ok: true,
      article: validV1Article({ ingestionMeta: validIngestionMeta }),
      confidence: { state: "low" },
    });
    if (!parsed.ok) throw new Error("expected ok envelope");
    expect(parsed.confidence.state).toBe("low");
  });

  it("parses a failure envelope with one of the 11 IngestionFailureReason values", () => {
    const parsed = IngestionResponseSchema.parse({
      ok: false,
      reason: "ssrf-blocked-private-ip",
    });
    if (parsed.ok) throw new Error("expected failure envelope");
    expect(parsed.reason).toBe("ssrf-blocked-private-ip");
  });

  it("rejects a failure envelope with an unknown reason", () => {
    expect(() =>
      IngestionResponseSchema.parse({ ok: false, reason: "mystery-reason" }),
    ).toThrow();
  });
});

describe("IngestionFailureReasonEnum (the 11 cataloged reasons)", () => {
  it("exposes exactly the 11 reasons from RESEARCH.md + the dedupe-refuse + unsupported-extraction additions", () => {
    expect(IngestionFailureReasonEnum.options).toEqual([
      "ssrf-blocked-scheme",
      "ssrf-blocked-private-ip",
      "ssrf-blocked-metadata",
      "fetch-failed",
      "response-too-large",
      "unsupported-content-type",
      "extraction-unsupported",
      "extraction-too-low-confidence",
      "round-trip-anchor-failed",
      "already-in-library",
      "server-error",
    ]);
    expect(IngestionFailureReasonEnum.options).toHaveLength(11);
  });
});
