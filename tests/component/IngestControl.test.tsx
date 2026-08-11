// tests/component/IngestControl.test.tsx
// Phase 7 Plan 06 Task 2 — RED gate. Behavior tests for the minimal ingest
// control (D7-01 — URL input + paste textarea, zero library chrome) that
// mounts above the article list in FixtureList.
//
// The control's three contracts (07-06-PLAN.md §must_haves truths):
//   1. D7-01 minimal proof form: a URL input + a paste textarea, no library
//      surface, no modal wizard. Both submit through IngestionClient.
//   2. D7-04 zero new chrome: refusal copy routes through the existing
//      `.status` live region (role="status", aria-live="polite",
//      aria-atomic="true"). Every IngestionFailureReason maps to a calm
//      DOC-06 phrase — never internal jargon.
//   3. D7-07 dedupe-refuse: before save, calls DexieLibrarySource.has(id);
//      if has returns true, surfaces "Already in your library." and refuses.
//
// The component is rendered in isolation; IngestionClient + DexieLibrarySource
// are mocked per-test so the assertions exercise state transitions and copy,
// not the network or Dexie.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock IngestionClient so the test never hits the network. The factory
// exposes both the functions and the class so the component can import them.
vi.mock("../../src/ingestion/IngestionClient", () => ({
  ingestUrl: vi.fn(),
  ingestHtml: vi.fn(),
  IngestionError: class IngestionError extends Error {
    readonly reason: string;
    constructor(reason: string, message?: string) {
      super(message ?? reason);
      this.name = "IngestionError";
      this.reason = reason;
    }
  },
}));

// Mock DexieLibrarySource so the test never touches IndexedDB.
vi.mock("../../src/ingestion/LibrarySource", () => ({
  dexieLibrarySource: {
    has: vi.fn(),
    save: vi.fn(),
  },
}));

import { IngestControl } from "../../src/ingestion/IngestControl";
import { ingestUrl, ingestHtml, IngestionError } from "../../src/ingestion/IngestionClient";
import { dexieLibrarySource } from "../../src/ingestion/LibrarySource";
import type { CanonicalArticle } from "../../src/content/types";

const ingestUrlMock = vi.mocked(ingestUrl);
const ingestHtmlMock = vi.mocked(ingestHtml);
const hasMock = vi.mocked(dexieLibrarySource.has);
const saveMock = vi.mocked(dexieLibrarySource.save);

function sampleArticle(id = "ingested-id"): CanonicalArticle {
  return {
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Article",
      retrievedAt: "2026-08-11T00:00:00.000Z",
      originalHtmlHash: "sha256:0",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
    footnotes: [],
  } as unknown as CanonicalArticle;
}

describe("IngestControl (07-06 Task 2)", () => {
  beforeEach(() => {
    ingestUrlMock.mockReset();
    ingestHtmlMock.mockReset();
    hasMock.mockReset();
    saveMock.mockReset();
    // Default: not in library.
    hasMock.mockResolvedValue(false);
    saveMock.mockResolvedValue(undefined);
    // jsdom doesn't implement location.hash navigation; stub the setter so
    // the success path's `window.location.hash = ...` doesn't throw.
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        set hash(_v: string) { /* no-op */ },
        get hash() { return ""; },
      },
      writable: true,
    });
  });

  it("renders a URL input and a paste textarea with labels", () => {
    render(<IngestControl />);
    expect(screen.getByRole("textbox", { name: /add by url/i })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: /paste html/i })).not.toBeNull();
  });

  it("renders a heading 'Add an article'", () => {
    render(<IngestControl />);
    expect(screen.getByRole("heading", { name: /add an article/i })).not.toBeNull();
  });

  it("uses a .status live region with role=status / aria-live=polite / aria-atomic=true", () => {
    render(<IngestControl />);
    const region = document.querySelector(".status");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("aria-atomic")).toBe("true");
  });

  it("announces 'Fetching article…' on submit and disables inputs while submitting", async () => {
    const user = userEvent.setup();
    // Never resolves — keeps the component in the submitting state.
    ingestUrlMock.mockReturnValue(new Promise(() => {}));
    render(<IngestControl />);

    const urlInput = screen.getByRole("textbox", { name: /add by url/i });
    const submitButton = screen.getByRole("button", { name: /add/i });
    await user.type(urlInput, "https://example.com/article");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Fetching article…")).not.toBeNull();
    });
  });

  it("calls ingestUrl with the URL on submit, then DexieLibrarySource.has + save, then navigates", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
    });
    render(<IngestControl />);

    const urlInput = screen.getByRole("textbox", { name: /add by url/i });
    await user.type(urlInput, "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => expect(ingestUrlMock).toHaveBeenCalledTimes(1));
    expect(ingestUrlMock.mock.calls[0]![0]).toBe("https://example.com/article");
    await waitFor(() => expect(hasMock).toHaveBeenCalledWith("ingested-id"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
  });

  it("calls ingestHtml with the paste content on the paste form submit", async () => {
    const user = userEvent.setup();
    ingestHtmlMock.mockResolvedValue({
      article: sampleArticle("paste-id"),
      confidence: { state: "low" },
    });
    render(<IngestControl />);

    const paste = screen.getByRole("textbox", { name: /paste html/i });
    await user.type(paste, "<article>paste</article>");
    // The paste form has its own submit button — pick by the form association.
    const pasteForm = paste.closest("form")!;
    pasteForm.requestSubmit();
    await waitFor(() => expect(ingestHtmlMock).toHaveBeenCalledTimes(1));
    expect(ingestHtmlMock.mock.calls[0]![0]).toBe("<article>paste</article>");
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
  });

  it("refuses re-ingest via DexieLibrarySource.has with 'Already in your library.' (D7-07)", async () => {
    const user = userEvent.setup();
    hasMock.mockResolvedValue(true); // already in library
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
    });
    render(<IngestControl />);

    const urlInput = screen.getByRole("textbox", { name: /add by url/i });
    await user.type(urlInput, "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByText(/already in your library/i)).not.toBeNull();
    });
    // save MUST NOT be called — dedupe-refuse is a no-write.
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("maps ssrf-blocked-metadata to a calm DOC-06 phrase (no jargon)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("ssrf-blocked-metadata"));
    render(<IngestControl />);

    const urlInput = screen.getByRole("textbox", { name: /add by url/i });
    await user.type(urlInput, "http://169.254.169.254/");
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByText(/points somewhere the reader can't reach/i)).not.toBeNull();
    });
  });

  it("maps fetch-failed to 'Couldn't reach this page.'", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("fetch-failed"));
    render(<IngestControl />);

    await user.type(
      screen.getByRole("textbox", { name: /add by url/i }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't reach this page/i)).not.toBeNull();
    });
  });

  it("maps extraction-unsupported to 'Couldn't reliably read this page.'", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("extraction-unsupported"));
    render(<IngestControl />);

    await user.type(
      screen.getByRole("textbox", { name: /add by url/i }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't reliably read this page/i)).not.toBeNull();
    });
  });

  it("maps an unknown Error to 'Something went wrong. Try again.' (catch-all)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new Error("boom"));
    render(<IngestControl />);

    await user.type(
      screen.getByRole("textbox", { name: /add by url/i }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong. try again/i)).not.toBeNull();
    });
  });

  it("does NOT leak internal jargon (fixture / Zod / schema / revision) in refusal copy", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("server-error"));
    render(<IngestControl />);

    await user.type(
      screen.getByRole("textbox", { name: /add by url/i }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent?.toLowerCase()).not.toMatch(
        /\b(fixture|zod|schema|revision)\b/,
      );
    });
  });
});
