// tests/unit/library/reading-stats-strip.test.tsx
// Issue #38 — component coverage for the ambient ReadingStatsStrip. The
// render helper builds one LibrarySnapshot directly from schema-validated
// rows (the book-row.test.tsx discipline — no Dexie in a component test).
//
// Contracts pinned:
//   1. null while not ready (loading/failed — fail-quiet spare chrome);
//   2. null at zero visits — silence IS the empty state (no zeros, no
//      placeholders);
//   3. the "You've read {duration} across {N} visits." sentence in plain
//      document order (singular "1 visit" honored);
//   4. "{N} finished." appears ONLY when the finished count is nonzero;
//   5. no interactive elements — the strip introduces no new keyboard
//      stops (no links, buttons, or focusables of any kind);
//   6. no streaks/goals/words-read vocabulary anywhere in the surface.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReadingStatsStrip } from "../../../src/ingestion/library/ReadingStatsStrip";
import { ReadingSessionRecordSchema } from "../../../src/content/schema";
import type { ReadingSessionRecord } from "../../../src/content/schema";
import { EMPTY_LIBRARY_SNAPSHOT } from "../../../src/ingestion/library/librarySnapshot";
import type { LibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";

function session(
  id: string,
  articleId: string,
  activeSeconds: number,
): ReadingSessionRecord {
  return ReadingSessionRecordSchema.parse({
    schemaVersion: 1,
    id,
    articleId,
    startedAt: "2026-09-15T10:00:00.000Z",
    endedAt: "2026-09-15T10:05:00.000Z",
    startOffset: 0,
    endOffset: 120,
    activeSeconds,
  });
}

function snapshotWith(
  sessions: ReadingSessionRecord[],
  overrides: Partial<LibrarySnapshot> = {},
): LibrarySnapshot {
  return {
    ...EMPTY_LIBRARY_SNAPSHOT,
    articles: [
      // A minimal schema-valid standalone article (the membership set).
      {
        id: "article-a",
        revision: 1,
        lang: "en",
        provenance: {
          title: "Article A",
          retrievedAt: "2026-09-01T00:00:00.000Z",
          originalHtmlHash: "sha256:" + "0".repeat(64),
        },
        blocks: [{ kind: "paragraph", content: [{ text: "Body text." }] }],
      },
    ],
    readingSessions: sessions,
    ...overrides,
  } as LibrarySnapshot;
}

function renderStrip(
  sessions: ReadingSessionRecord[],
  finishedCount = 0,
  ready = true,
) {
  return render(
    <ReadingStatsStrip
      snapshot={snapshotWith(sessions)}
      ready={ready}
      finishedCount={finishedCount}
    />,
  );
}

describe("ReadingStatsStrip — spare-chrome nulls", () => {
  it("renders nothing while the snapshot is not ready", () => {
    const { container } = renderStrip([], 0, false);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing at zero visits — silence is the empty state", () => {
    const { container } = renderStrip([]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReadingStatsStrip — the ambient sentence", () => {
  it("reads the sentence in plain document order (plural visits)", () => {
    renderStrip([
      session("v1", "article-a", 120),
      session("v2", "article-a", 180),
    ]);
    const strip = screen.getByText(/You've read/);
    expect(strip.textContent).toBe("You've read 5 min across 2 visits.");
  });

  it("honors the singular visit", () => {
    renderStrip([session("v1", "article-a", 30)]);
    const strip = screen.getByText(/You've read/);
    expect(strip.textContent).toBe("You've read under a minute across 1 visit.");
  });

  it("emphasizes only the duration (a <strong> inside plain text)", () => {
    renderStrip([session("v1", "article-a", 3600)]);
    const strong = document.querySelector(".library-stats-strip strong");
    expect(strong?.textContent).toBe("1 h");
  });

  it("omits the second sentence at a zero finished count", () => {
    renderStrip([session("v1", "article-a", 120)], 0);
    expect(screen.getByText(/You've read/).textContent).not.toContain("finished.");
  });

  it("appends '{N} finished.' when the finished count is nonzero", () => {
    renderStrip([session("v1", "article-a", 120)], 3);
    expect(screen.getByText(/You've read/).textContent).toBe(
      "You've read 2 min across 1 visit. 3 finished.",
    );
  });
});

describe("ReadingStatsStrip — ambient discipline (issue #38)", () => {
  it("introduces no new keyboard stops — zero interactive elements", () => {
    renderStrip([session("v1", "article-a", 120)], 2);
    const strip = document.querySelector(".library-stats-strip");
    expect(strip).not.toBeNull();
    expect(strip!.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
  });

  it("carries no streaks, goals, daily targets, or words-read vocabulary", () => {
    renderStrip([session("v1", "article-a", 120)], 1);
    const text = document.querySelector(".library-stats-strip")!.textContent ?? "";
    expect(text).not.toMatch(/streak|goal|daily|words/i);
  });
});
