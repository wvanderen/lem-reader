// tests/unit/portability/bundle-schema.test.ts
// Plan 09-01 Task 2 (TDD RED → GREEN), extended by Plan 12-07 Task 1 —
// PORT-01/02 versioning hook truth. Locks the D9-04 envelope shape:
// schemaVersion is the 1|2 UNION (the ReaderSettingsSchema precedent —
// v1 rows hydrate, v3+ forward-rejects per D9-04), books compose BookSchema
// optionally (absent on v1, always present on v2 writes), all five record
// blocks compose the EXISTING schemas from src/content/schema.ts (no
// record shape re-declared), preferences are always present (D9-12), and
// fixtureIds carries only fixture ids (fixtures never serialize).
import { describe, expect, it } from "vitest";
import { ExportBundleSchema, BUNDLE_FILENAME, resolveAppVersion } from "../../../src/portability/bundle";

// ── Fixture builders (schema-valid minimal records) ─────────────────────────

function sampleArticle() {
  return {
    id: "example-article",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Example article",
      retrievedAt: "2026-08-01T00:00:00.000Z",
      originalHtmlHash: "sha256:deadbeef",
    },
    blocks: [
      {
        kind: "paragraph" as const,
        content: [{ text: "Example paragraph text.", marks: [] }],
      },
    ],
  };
}

function sampleLocation() {
  return {
    schemaVersion: 1 as const,
    articleId: "example-article",
    revision: 1,
    graphemeOffset: 0,
    savedAt: "2026-08-15T00:00:00.000Z",
  };
}

function sampleHighlight() {
  return {
    schemaVersion: 1 as const,
    id: "hl-1",
    articleId: "example-article",
    revision: 1,
    position: { start: 0, end: 7 },
    quote: { prefix: "", exact: "Example", suffix: " paragraph text." },
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

function sampleNote() {
  return {
    schemaVersion: 1 as const,
    id: "note-1",
    highlightId: "hl-1",
    text: "A reader note",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

/** A schema-valid Book row (Phase 12 — the 12-03 BookSchema contract). */
function sampleBook(overrides: Record<string, unknown> = {}) {
  return {
    id: "epub-000000000001",
    title: "The Synthetic Book",
    authors: ["Ada Author"],
    language: "en",
    chapterArticleIds: [
      "epub-000000000001-c00",
      "epub-000000000001-c01",
    ],
    skippedChapterCount: 0,
    source: "epub-upload" as const,
    originalFileHash: "sha256:" + "c".repeat(64),
    addedAt: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

function samplePreferences() {
  return {
    schemaVersion: 2 as const,
    font: "serif" as const,
    size: 18 as const,
    measure: 64 as const,
    spacing: "comfortable" as const,
    theme: "sepia" as const,
    readingMode: "paginated" as const,
  };
}

/** The valid v1 envelope: all five record blocks + fixtureIds (D9-04/D9-12). */
export function sampleBundle() {
  return {
    schemaVersion: 1 as const,
    exportedAt: "2026-08-15T12:00:00.000Z",
    appVersion: "0.1.0",
    articles: [sampleArticle()],
    locations: [sampleLocation()],
    highlights: [sampleHighlight()],
    notes: [sampleNote()],
    preferences: samplePreferences(),
    fixtureIds: ["some-fixture"],
  };
}

// ── The contract ─────────────────────────────────────────────────────────────

describe("ExportBundleSchema (D9-04 envelope)", () => {
  it("parses a v1 bundle with all five record blocks and fixtureIds", () => {
    const result = ExportBundleSchema.safeParse(sampleBundle());
    expect(result.success).toBe(true);
  });

  it("v1 regression (12-07): a v1 bundle carries NO books key and hydrates books to undefined", () => {
    const result = ExportBundleSchema.safeParse(sampleBundle());
    expect(result.success).toBe(true);
    if (result.success) {
      expect("books" in result.data).toBe(false);
      expect(result.data.books).toBeUndefined();
    }
  });

  it("parses a v2 bundle with a books array (the 12-07 write shape)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 2,
      books: [sampleBook()],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(2);
      expect(result.data.books).toHaveLength(1);
      expect(result.data.books?.[0]?.title).toBe("The Synthetic Book");
    }
  });

  it("parses a v2 bundle with books: [] (writers always emit the field)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 2,
      books: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.books).toEqual([]);
    }
  });

  it("tolerates a books-less v2 envelope on read (optional field, version-independent)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects schemaVersion 3 (forward-compat gate — no silent partial import)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed book row inside a v2 bundle (BookSchema composition)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 2,
      books: [sampleBook({ source: "not-a-source" })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bundle missing preferences (D9-12 — always present)", () => {
    const { preferences: _preferences, ...withoutPrefs } = sampleBundle();
    const result = ExportBundleSchema.safeParse(withoutPrefs);
    expect(result.success).toBe(false);
  });

  it("rejects a bundle missing fixtureIds", () => {
    const { fixtureIds: _fixtureIds, ...withoutFixtureIds } = sampleBundle();
    const result = ExportBundleSchema.safeParse(withoutFixtureIds);
    expect(result.success).toBe(false);
  });

  it("rejects a malformed exportedAt (non-datetime string)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      exportedAt: "not-a-datetime",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an article row that violates ArticleSchema", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      articles: [{ ...sampleArticle(), id: "NOT_A_VALID_SLUG" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("bundle artifacts", () => {
  it("BUNDLE_FILENAME is the D9-01 locked zip name", () => {
    expect(BUNDLE_FILENAME).toBe("lem-reader-bundle-v1.zip");
  });

  it("resolveAppVersion returns a non-empty string (\"dev\" under vitest — no define)", () => {
    const version = resolveAppVersion();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
    // vitest applies no __APP_VERSION__ define, so the typeof-guard path
    // must yield the diagnostic fallback (D9-04).
    expect(version).toBe("dev");
  });
});
