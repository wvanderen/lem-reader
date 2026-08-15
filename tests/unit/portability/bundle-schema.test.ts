// tests/unit/portability/bundle-schema.test.ts
// Plan 09-01 Task 2 (TDD RED → GREEN) — PORT-01/02 versioning hook truth.
// Locks the D9-04 envelope shape: schemaVersion z.literal(1) forward-rejects
// v2+ (the "exported by a newer Lem Reader version" refusal gate), all five
// record blocks compose the EXISTING schemas from src/content/schema.ts (no
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

  it("rejects schemaVersion 2 (forward-compat gate — no silent partial import)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 2,
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
