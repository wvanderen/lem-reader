// tests/unit/library/library-row.test.tsx
// Issue #38 — component coverage for the LibraryRow "{duration} read here"
// meta line. The row is otherwise byte-stable chrome (its structure is
// pinned by the e2e suite); this suite pins ONLY the issue #38 enrichment:
//   1. the label renders as a quiet .meta line when provided;
//   2. it is ABSENT when undefined (under-one-minute suppression — silence
//      is the empty state);
//   3. it carries no interactive elements (no new keyboard stops).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../src/persistence/booksStore", () => ({
  setBookTags: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  setArticleTags: vi.fn().mockResolvedValue(undefined),
}));

import { LibraryRow } from "../../../src/ingestion/library/LibraryRow";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";

function makeArticle(): CanonicalArticle {
  return ArticleSchema.parse({
    id: "row-article",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Row Article",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body text." }] }],
  });
}

function renderRow(timeReadLabel?: string) {
  return render(
    <LibraryRow article={makeArticle()} total={100} timeReadLabel={timeReadLabel} />,
  );
}

describe("LibraryRow — the time-read meta line (issue #38)", () => {
  it("renders the provided label as a quiet .meta line", () => {
    renderRow("5 min read here");
    const line = screen.getByText("5 min read here");
    expect(line).toHaveClass("meta", "library-row-time-read");
  });

  it("renders nothing when the label is undefined (suppressed under one minute)", () => {
    const { container } = renderRow(undefined);
    expect(container.querySelector(".library-row-time-read")).toBeNull();
    expect(screen.queryByText(/read here/)).toBeNull();
  });

  it("the label line carries no interactive elements (no new keyboard stops)", () => {
    renderRow("5 min read here");
    const line = document.querySelector(".library-row-time-read");
    expect(
      line!.querySelectorAll("a, button, input, select, textarea, [tabindex]"),
    ).toHaveLength(0);
  });
});
