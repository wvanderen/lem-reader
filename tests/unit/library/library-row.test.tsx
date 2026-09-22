// tests/unit/library/library-row.test.tsx
// Issue #38 — component coverage for the LibraryRow "{duration} read here"
// meta line. The row is otherwise byte-stable chrome (its structure is
// pinned by the e2e suite); this suite pins ONLY the issue #38 enrichment:
//   1. the label renders as a quiet .meta line when provided;
//   2. it is ABSENT when undefined (under-one-minute suppression — silence
//      is the empty state);
//   3. it carries no interactive elements (no new keyboard stops).
// Issue #41 — plus the transcript-article video-duration line (flow N3):
// rendered from the persisted ingestionMeta.transcript duration, absent for
// every other source, no interactive elements.
// Issue #76 (decision #72) — plus the per-article review entry: at ≥ 1
// highlight the cluster gains an anchor to #/highlights?article=<id> whose
// aria-label carries the count; 0/undefined renders nothing (the gate IS
// the zero state) and its presence alone still earns the cluster (chapter
// sub-rows).
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
import {
  FAKE_HASH,
  transcriptIngestionMeta,
} from "../fixtures/transcript-meta";

function makeArticle(transcript?: {
  durationSeconds: number;
}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "row-article",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Row Article",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: FAKE_HASH,
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body text." }] }],
    ...(transcript
      ? {
          ingestionMeta: transcriptIngestionMeta({
            durationSeconds: transcript.durationSeconds,
          }),
        }
      : {}),
  });
}

function renderRow(timeReadLabel?: string, article?: CanonicalArticle) {
  return render(
    <LibraryRow
      article={article ?? makeArticle()}
      total={100}
      timeReadLabel={timeReadLabel}
    />,
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

describe("LibraryRow — the video-duration meta line (issue #41, flow N3)", () => {
  it("renders the transcript duration as quiet text beside the source badge", () => {
    renderRow(undefined, makeArticle({ durationSeconds: 735 }));
    const line = screen.getByText("12 min");
    expect(line).toHaveClass("meta", "library-row-duration");
  });

  it("renders nothing for a non-transcript article (silence is the empty state)", () => {
    const { container } = renderRow(undefined);
    expect(container.querySelector(".library-row-duration")).toBeNull();
  });

  it("the duration line carries no interactive elements (no new keyboard stops)", () => {
    renderRow(undefined, makeArticle({ durationSeconds: 735 }));
    const line = document.querySelector(".library-row-duration");
    expect(
      line!.querySelectorAll("a, button, input, select, textarea, [tabindex]"),
    ).toHaveLength(0);
  });
});

describe("LibraryRow — the per-article review entry (issue #76)", () => {
  it("renders the highlights anchor at ≥ 1 with the count in the aria-label", () => {
    render(<LibraryRow article={makeArticle()} total={100} highlightCount={3} />);
    const link = screen.getByLabelText("Review 3 highlights for Row Article");
    expect(link).toHaveClass("library-row-highlights");
    expect(link).toHaveAttribute("href", "#/highlights?article=row-article");
  });

  it("uses the singular label at exactly 1 highlight", () => {
    render(<LibraryRow article={makeArticle()} total={100} highlightCount={1} />);
    expect(
      screen.getByLabelText("Review 1 highlight for Row Article"),
    ).toBeInTheDocument();
  });

  it("renders nothing at 0 and when undefined (the gate IS the zero state)", () => {
    const zero = render(
      <LibraryRow article={makeArticle()} total={100} highlightCount={0} />,
    );
    expect(
      zero.container.querySelector(".library-row-highlights"),
    ).toBeNull();
    expect(
      zero.container.querySelector(".library-row-actions"),
    ).toBeNull();
    zero.unmount();
    const absent = render(
      <LibraryRow article={makeArticle()} total={100} />,
    );
    expect(
      absent.container.querySelector(".library-row-highlights"),
    ).toBeNull();
  });

  it("the entry alone earns the action cluster (chapter sub-rows have no other buttons)", () => {
    render(
      <LibraryRow
        article={makeArticle()}
        total={100}
        headingLevel={3}
        highlightCount={2}
      />,
    );
    const cluster = document.querySelector(".library-row-actions");
    expect(cluster).not.toBeNull();
    expect(cluster!.children).toHaveLength(1);
  });
});
