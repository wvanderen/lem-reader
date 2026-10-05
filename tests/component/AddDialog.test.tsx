// tests/component/AddDialog.test.tsx
// Plan 16-02 Task 2 — RED gate, then component truth for the focused Add
// dialog (D16-01): a native <dialog> (showModal) structural clone of the
// BookRemoveConfirm lineage hosting the original three-form control's
// four-state submission
// spine behind a controlled 3-way source picker (D16-05).
//
// Per the SettingsPanel.test.tsx / import-preview-dialog.test.tsx
// precedent (Pitfall 2/5), jsdom is NOT authoritative for <dialog>
// focus-trap / inert-backdrop / Esc BEHAVIOR or geometry — those are
// proven by the Plan 16-04 e2e across Chromium/Firefox/WebKit. Here we
// assert the application-level contracts:
//   - the migrated state-machine + copy + dedupe coverage
//     ("Fetching article…", ingestUrl→has→save ordering, dedupe-refuse
//     no-write, calm DOC-06 copy, catch-all server-error, no jargon),
//   - the picker semantics (fieldset/legend "Add from", exactly 3
//     controlled radios, only the selected source's input visible),
//   - D16-07 switch preservation (URL/paste text + a picked File survive
//     source switches within one dialog session),
//   - D16-08 always-Web-address (fresh session state on every open),
//   - D16-10 in-flight blocking (Cancel + active submit disabled; the
//     `cancel` event is gated while submitting),
//   - D16-12 success arms as amended by issues #112/#113 — BOTH stay open
//     on the saved-result screen: article (title, ingestion limits,
//     Open article + Add another) and book (title, honest skip count,
//     Open book + Add another); onSaved invalidates the snapshot for each
//     while the dialog remains up, and no close/navigation ever happens
//     on its own (the never-opened item stays Unread).
//   - scrim dismissal (quick task 260908-o0w): an idle scrim click
//     (target === the dialog element — the dimmed ::backdrop) fires
//     onCancel, an inner-wrapper click is inert, and an in-flight
//     submission ignores the scrim (D16-10 extended to the click path).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock IngestionClient so the test never hits the network. The factory
// exposes all five ingest functions + the class (migrated from
// the original control's suite (L25-54), extended with the file arms).
vi.mock("../../src/ingestion/IngestionClient", () => ({
  ingestUrl: vi.fn(),
  ingestHtml: vi.fn(),
  ingestMarkdown: vi.fn(),
  ingestPdf: vi.fn(),
  ingestEpub: vi.fn(),
  ingestPastedTranscript: vi.fn(),
  browserPreferredLanguages: vi.fn(() => undefined),
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
vi.mock("../../src/ingestion/LibrarySource", () => {
  const save = vi.fn();
  return {
    dexieLibrarySource: {
      has: vi.fn(),
      save,
      saveIfAbsent: vi.fn(async (...args) => {
        await save(...args);
        return true;
      }),
    },
  };
});

// Mock booksStore (the book-level dedupe/save seams, D7-07 at book level).
vi.mock("../../src/persistence/booksStore", () => ({
  hasBook: vi.fn(),
  saveBook: vi.fn(),
}));

import { AddDialog } from "../../src/ingestion/AddDialog";
import {
  ingestUrl,
  ingestHtml,
  ingestEpub,
  ingestPastedTranscript,
  IngestionError,
  type EpubIngestionSuccess,
} from "../../src/ingestion/IngestionClient";
import { dexieLibrarySource } from "../../src/ingestion/LibrarySource";
import { hasBook, saveBook } from "../../src/persistence/booksStore";
import type { CanonicalArticle } from "../../src/content/types";

const ingestUrlMock = vi.mocked(ingestUrl);
const ingestHtmlMock = vi.mocked(ingestHtml);
const ingestEpubMock = vi.mocked(ingestEpub);
const ingestPastedTranscriptMock = vi.mocked(ingestPastedTranscript);
const hasMock = vi.mocked(dexieLibrarySource.has);
const saveMock = vi.mocked(dexieLibrarySource.save);
const hasBookMock = vi.mocked(hasBook);
const saveBookMock = vi.mocked(saveBook);

// jsdom implements the HTMLDialogElement interface but NOT showModal/close
// behavior (Pitfall 2/5). Stub the two methods at the prototype level so
// the dialog sync effect exercises its real code path (mirrors
// SettingsPanel.test.tsx / import-preview-dialog.test.tsx).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

// Navigation + callback ordering recorder. The hash setter stub records
// every write (jsdom doesn't implement location.hash navigation — the
// the original control's suite L81-90 precedent), and tests push "cancel" /
// "saved" markers from their onCancel/onSaved spies so the
// D16-12 ordering (close FIRST, then navigate/callback) is assertable as
// one ordered array.
const navEvents: string[] = [];

beforeEach(() => {
  ingestUrlMock.mockReset();
  ingestHtmlMock.mockReset();
  ingestEpubMock.mockReset();
  ingestPastedTranscriptMock.mockReset();
  hasMock.mockReset();
  saveMock.mockReset();
  hasBookMock.mockReset();
  saveBookMock.mockReset();
  // Default: not in library (article + book arms).
  hasMock.mockResolvedValue(false);
  saveMock.mockResolvedValue(undefined);
  hasBookMock.mockResolvedValue(false);
  saveBookMock.mockResolvedValue(undefined);
  navEvents.length = 0;
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      set hash(v: string) {
        navEvents.push(`hash:${v}`);
      },
      get hash() {
        return "";
      },
    },
    writable: true,
  });
});

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

function sampleBookResult(): EpubIngestionSuccess {
  return {
    book: {
      id: "book-id",
      title: "Sample Book",
      chapterArticleIds: ["epub-c01"],
      addedAt: "2026-08-29T00:00:00.000Z",
    } as unknown as EpubIngestionSuccess["book"],
    articles: [sampleArticle("epub-c01")],
    skippedCount: 2,
    // Phase 20 (20-04): EpubIngestionSuccess carries the (re-validated)
    // book envelope assets — zero until 20-06's container extraction.
    assets: [],
  };
}

function renderDialog(overrides?: { open?: boolean; onCancel?: () => void; onSaved?: () => void }) {
  const onCancel = overrides?.onCancel ?? vi.fn();
  const onSaved = overrides?.onSaved ?? vi.fn();
  const utils = render(
    <AddDialog
      open={overrides?.open ?? true}
      onCancel={onCancel}
      onSaved={onSaved}
      tagStats={[]}
    />,
  );
  return { onCancel, onSaved, ...utils };
}

/** The always-mounted file input (Pattern 3a) — by id, not by role: when a
 * non-file source is selected it carries the `hidden` attribute and must
 * still be reachable for the mount-survival assertions. */
function fileInput(): HTMLInputElement {
  const el = document.getElementById("ingest-file");
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("input#ingest-file is not mounted");
  }
  return el;
}

describe("AddDialog (16-02 Task 2)", () => {
  // ── Migrated from the original control's suite (submission spine) ─────

  it("announces 'Fetching article…' in the dialog status region while submitting", async () => {
    const user = userEvent.setup();
    // Never resolves — keeps the dialog in the submitting state.
    ingestUrlMock.mockReturnValue(new Promise(() => {}));
    renderDialog();

    const urlInput = screen.getByRole("textbox", { name: "Add by URL" });
    await user.type(urlInput, "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const region = document.querySelector("dialog .status");
      expect(region?.getAttribute("role")).toBe("status");
      expect(region?.getAttribute("aria-live")).toBe("polite");
      expect(region?.getAttribute("aria-atomic")).toBe("true");
      expect(region?.textContent).toContain("Fetching article…");
    });
  });

  it("calls ingestUrl with the URL, then has + save, then navigates (order)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [], // Phase 20 (20-02): envelope re-validation exposes the validated array
    });
    renderDialog();

    const urlInput = screen.getByRole("textbox", { name: "Add by URL" });
    await user.type(urlInput, "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(ingestUrlMock).toHaveBeenCalledTimes(1));
    expect(ingestUrlMock.mock.calls[0]![0]).toBe("https://example.com/article");
    await waitFor(() => expect(hasMock).toHaveBeenCalledWith("ingested-id"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
  });

  it("refuses re-ingest via has with 'Already in your library.' and NEVER calls save (D7-07/D16-09)", async () => {
    const user = userEvent.setup();
    hasMock.mockResolvedValue(true); // already in library
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [], // Phase 20 (20-02): envelope re-validation exposes the validated array
    });
    renderDialog();

    const urlInput = screen.getByRole("textbox", { name: "Add by URL" });
    await user.type(urlInput, "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/already in your library/i)).not.toBeNull();
    });
    // save MUST NOT be called — dedupe-refuse is a refusal-only no-write.
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("maps ssrf-blocked-metadata to a calm DOC-06 phrase (no jargon)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("ssrf-blocked-metadata"));
    renderDialog();

    const urlInput = screen.getByRole("textbox", { name: "Add by URL" });
    await user.type(urlInput, "http://169.254.169.254/");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/points somewhere the reader can't reach/i)).not.toBeNull();
    });
  });

  it("maps an unknown Error to 'Something went wrong. Try again.' (catch-all)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new Error("boom"));
    renderDialog();

    const urlInput = screen.getByRole("textbox", { name: "Add by URL" });
    await user.type(urlInput, "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong. try again/i)).not.toBeNull();
    });
  });

  it("does NOT leak internal jargon (fixture / Zod / schema / revision) in refusal copy", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("server-error"));
    renderDialog();

    const urlInput = screen.getByRole("textbox", { name: "Add by URL" });
    await user.type(urlInput, "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent?.toLowerCase()).not.toMatch(
        /\b(fixture|zod|schema|revision)\b/,
      );
    });
  });

  // ── Picker semantics (D16-05) ───────────────────────────────────────────

  it("renders a fieldset with legend 'Add from' and exactly 3 radios: Web address / Paste text / Upload file", () => {
    renderDialog();
    const group = screen.getByRole("group", { name: "Add from" });
    expect(group.tagName).toBe("FIELDSET");
    const radios = within(group).getAllByRole("radio");
    expect(radios.length).toBe(3);
    expect(screen.getByRole("radio", { name: "Web address" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Paste text" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Upload file" })).not.toBeNull();
  });

  it("with source=url: only the URL input is visible — paste input absent, file input present but hidden-attribute'd (Pattern 3a)", () => {
    renderDialog();
    // The URL input is in the tree and reachable.
    expect(screen.getByRole("textbox", { name: "Add by URL" })).not.toBeNull();
    // The paste textarea is UNMOUNTED (absent from the tree, not CSS-hidden).
    expect(screen.queryByRole("textbox", { name: /paste html/i })).toBeNull();
    expect(document.getElementById("ingest-paste")).toBeNull();
    // The file input is ALWAYS MOUNTED but carries the hidden attribute.
    const file = fileInput();
    expect(file.hasAttribute("hidden")).toBe(true);
  });

  it("switching to Upload file unhides the file input; switching to Paste text mounts only the textarea", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    expect(fileInput().hasAttribute("hidden")).toBe(false);
    expect(screen.getByRole("button", { name: "Add file" })).not.toBeNull();

    await user.click(screen.getByRole("radio", { name: "Paste text" }));
    expect(screen.getByRole("textbox", { name: "Paste HTML or text" })).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: /add by url/i })).toBeNull();
    expect(fileInput().hasAttribute("hidden")).toBe(true);
  });

  // ── Switch preservation (D16-07) ────────────────────────────────────────

  it("typed URL text survives switching to Paste text and back", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/keep-me",
    );
    await user.click(screen.getByRole("radio", { name: "Paste text" }));
    // URL input unmounted; paste textarea mounted.
    expect(screen.queryByRole("textbox", { name: /add by url/i })).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Web address" }));
    const urlAgain = screen.getByRole("textbox", {
      name: "Add by URL",
    }) as HTMLInputElement;
    expect(urlAgain.value).toBe("https://example.com/keep-me");
  });

  it("a picked file survives switching away and back — hasFile still true, Add file still enabled", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(fileInput(), new File(["PK"], "book.epub", { type: "application/epub+zip" }));
    const addFile = screen.getByRole("button", {
      name: "Add file",
    }) as HTMLButtonElement;
    expect(addFile.disabled).toBe(false);

    await user.click(screen.getByRole("radio", { name: "Web address" }));
    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    const addFileAgain = screen.getByRole("button", {
      name: "Add file",
    }) as HTMLButtonElement;
    expect(addFileAgain.disabled).toBe(false);
    // The FileList itself survived the switches (always-mounted input).
    expect(fileInput().files?.length).toBe(1);
    expect(fileInput().files?.[0]?.name).toBe("book.epub");
  });

  // ── Always Web address (D16-08) ─────────────────────────────────────────

  it("opens on Web address — the url radio is checked and the others are not", () => {
    renderDialog();
    const url = screen.getByRole("radio", {
      name: "Web address",
    }) as HTMLInputElement;
    const paste = screen.getByRole("radio", {
      name: "Paste text",
    }) as HTMLInputElement;
    const file = screen.getByRole("radio", {
      name: "Upload file",
    }) as HTMLInputElement;
    expect(url.checked).toBe(true);
    expect(paste.checked).toBe(false);
    expect(file.checked).toBe(false);
  });

  it("cancel → reopen: url radio checked again and the session state is fresh (no memory, D16-08)", async () => {
    const user = userEvent.setup();
    const { onCancel, onSaved, rerender } = renderDialog();

    // Dirty the session: type a URL, switch to paste, type paste text.
    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/once",
    );
    await user.click(screen.getByRole("radio", { name: "Paste text" }));
    await user.type(
      screen.getByRole("textbox", { name: "Paste HTML or text" }),
      "<article>draft</article>",
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // The parent flips the open prop false → true (the Cancel path).
    rerender(<AddDialog open={false} onCancel={onCancel} onSaved={onSaved} tagStats={[]} />);
    rerender(<AddDialog open={true} onCancel={onCancel} onSaved={onSaved} tagStats={[]} />);

    const urlRadio = screen.getByRole("radio", {
      name: "Web address",
    }) as HTMLInputElement;
    expect(urlRadio.checked).toBe(true);
    const urlAgain = screen.getByRole("textbox", {
      name: "Add by URL",
    }) as HTMLInputElement;
    expect(urlAgain.value).toBe("");
    // The paste group unmounted again (source reset to url).
    expect(document.getElementById("ingest-paste")).toBeNull();
  });

  // ── In-flight blocking (D16-10) ─────────────────────────────────────────

  it("disables the Cancel button and the active submit button while submitting", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockReturnValue(new Promise(() => {}));
    renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText("Fetching article…")).not.toBeNull();
    });
    const cancelBtn = screen.getByRole("button", {
      name: "Cancel",
    }) as HTMLButtonElement;
    const addBtn = screen.getByRole("button", {
      name: /^add$/i,
    }) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);
    expect(addBtn.disabled).toBe(true);
  });

  it("routes an idle dialog's cancel event through onCancel (the 09-06 open-prop mirror)", () => {
    const { onCancel } = renderDialog();
    const dlg = document.querySelector("dialog.add-dialog")!;
    expect(dlg).not.toBeNull();
    act(() => {
      dlg.dispatchEvent(new Event("cancel"));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("BLOCKS the cancel event while a submission is in flight — no onCancel, dialog stays open (D16-10)", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    ingestUrlMock.mockReturnValue(new Promise(() => {}));

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByText("Fetching article…")).not.toBeNull();
    });

    const dlg = document.querySelector("dialog.add-dialog")!;
    act(() => {
      dlg.dispatchEvent(new Event("cancel"));
    });
    expect(onCancel).not.toHaveBeenCalled();
    // The dialog never churned state — still open, still submitting.
    const dlgEl = dlg as HTMLDialogElement;
    expect(dlgEl.open).toBe(true);
    expect(screen.getByText("Fetching article…")).not.toBeNull();
  });

  // ── Success arms (D16-12) ───────────────────────────────────────────────

  it("article success STAYS OPEN on the result screen: onSaved fires, no close, no navigation (issue #112)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [], // Phase 20 (20-02): envelope re-validation exposes the validated array
    });
    const { onCancel, onSaved } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    // The dialog NEVER closes and NEVER navigates on its own — the reader
    // chooses Open article (the never-opened article stays Unread).
    expect(onCancel).not.toHaveBeenCalled();
    expect(navEvents).toEqual([]);
    expect(document.querySelector("dialog.add-dialog")).not.toBeNull();
  });

  it("book success STAYS OPEN on the result screen: onSaved fires, no close, no navigation (issue #113)", async () => {
    const user = userEvent.setup();
    ingestEpubMock.mockResolvedValue(sampleBookResult());
    renderDialog({
      onCancel: vi.fn(() => navEvents.push("cancel")),
      onSaved: vi.fn(() => navEvents.push("saved")),
    });

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));

    // Ordered: onSaved fires while the dialog stays up (the library
    // reflects the book without waiting for navigation), and NO close or
    // hash write happens on its own — the never-opened book stays Unread.
    await waitFor(() => {
      expect(navEvents).toEqual(["saved"]);
    });
    await waitFor(() => expect(hasBookMock).toHaveBeenCalledWith("book-id"));
    expect(saveBookMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saved to your library.")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Sample Book", level: 3 })).not.toBeNull();
    // The honest skip disclosure rides the result card (skippedCount 2).
    expect(screen.getByText("2 chapters could not be read.")).not.toBeNull();
  });
});

// ── Saved-result screen (issue #112) ─────────────────────────────────────────
// An article save keeps the dialog OPEN on a clear result: the status region
// announces "Saved to your library.", the result card shows the saved title
// + any ingestion-limit disclosures + the original link, and the actions row
// becomes Close / Add another / Open article. Closing (Close/Esc/scrim)
// returns to the prior destination with the never-opened article Unread;
// Open article close-first navigates (D16-12); Add another runs the ONE
// resetSession and refocuses the Web address field. A refusal NEVER enters
// result mode.
describe("AddDialog — saved result (issue #112)", () => {
  async function saveUrlArticle(overrides?: Partial<Awaited<ReturnType<typeof ingestUrl>>>) {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
      ...overrides,
    });
    const utils = renderDialog();
    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByText("Saved to your library.")).not.toBeNull();
    });
    return { user, ...utils };
  }

  function flaggedArticleMeta(): Awaited<ReturnType<typeof ingestUrl>>["article"] {
    return {
      ...sampleArticle("flagged-id"),
      ingestionMeta: {
        source: "url",
        origin: "url",
        sourceUrl: "https://example.com/article",
        originalHtmlHash: "sha256:0",
        extractionConfidence: "low",
        extractionWarnings: ["1 image could not be fetched"],
        annotationsDegraded: true,
      },
    } as Awaited<ReturnType<typeof ingestUrl>>["article"];
  }

  it("the result card shows the saved title with Open article + Add another (and Close) actions", async () => {
    await saveUrlArticle();

    expect(screen.getByRole("heading", { name: "Article", level: 3 })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open article" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add another" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).not.toBeNull();
    // The intake chrome yields to the result: the shared submit is gone,
    // the source picker + tags fieldset are hidden.
    expect(screen.queryByRole("button", { name: /^add$/i })).toBeNull();
    expect(document.querySelector("fieldset.add-source-picker")!.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("fieldset.add-tags-fieldset")!.hasAttribute("hidden")).toBe(true);
  });

  it("a confident save is silent about limits (no disclosure lines) but shows the original link when a sourceUrl exists", async () => {
    await saveUrlArticle();

    // The limit sentences never render for a confident save...
    expect(document.querySelector(".add-result .extraction-note")).toBeNull();
    expect(document.querySelector(".add-result .partial-content-note")).toBeNull();
    expect(document.querySelector(".add-result .annotations-note")).toBeNull();
    // ...but the AC's "original link" shows when a sourceUrl is available
    // (the quiet standalone provenance line — no limits to attach it to).
    const source = document.querySelector(".add-result .add-result-source")!;
    expect(source).not.toBeNull();
    const link = source.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/article");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.textContent).toContain("See the original");
  });

  it("a confident save with no sourceUrl (paste arm) shows no original link either", async () => {
    const bare = sampleArticle("bare-id") as Awaited<ReturnType<typeof ingestUrl>>["article"];
    delete (bare.provenance as { sourceUrl?: string }).sourceUrl;
    await saveUrlArticle({ article: bare });

    expect(document.querySelector(".add-result .add-result-source")).toBeNull();
    expect(screen.queryByText("See the original")).toBeNull();
  });

  it("an operation failure never enters result mode (distinct from the saved result, no snapshot broadcast)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("server-error"));
    const { onSaved } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong. try again/i)).not.toBeNull();
    });
    // Distinct surfaces: no result card, no outcome actions, no
    // invalidation broadcast (nothing was saved).
    expect(document.querySelector(".add-result")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open article" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add another" })).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("a flagged save discloses the ingestion limits with the original link", async () => {
    await saveUrlArticle({ article: flaggedArticleMeta() });

    // The low-confidence sentence + the escape hatch (href from the saved
    // article's provenance, new-tab).
    const note = document.querySelector(".add-result .extraction-note")!;
    expect(note.textContent).toContain("This article may be incomplete or inaccurate");
    const link = note.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/article");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toContain("See the original");
    // The per-part warning line + the degraded-anchoring sentence.
    expect(document.querySelector(".add-result .partial-content-heading")!.textContent).toContain(
      "Some content could not be processed.",
    );
    expect(document.querySelector(".add-result .partial-content-note li")!.textContent).toBe(
      "1 image could not be fetched",
    );
    expect(document.querySelector(".add-result .annotations-note")!.textContent).toContain(
      "Highlights may be unreliable on this article.",
    );
  });

  it("Open article navigates close-first (ordered: cancel, then the hash write)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    renderDialog({
      onCancel: vi.fn(() => navEvents.push("cancel")),
      onSaved: vi.fn(),
    });
    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByText("Saved to your library.")).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Open article" }));

    // Ordered: the close callback fires BEFORE the hash write (D16-12).
    await waitFor(() => {
      expect(navEvents).toEqual(["cancel", "hash:#/article/ingested-id"]);
    });
  });

  it("Add another resets the session: source back to Web address, fields + result cleared, URL field focused", async () => {
    const { user } = await saveUrlArticle();

    await user.click(screen.getByRole("button", { name: "Add another" }));

    // Fresh session (D16-08 shape) — result gone, Web address checked, the
    // URL field empty, the status region collapsed back to idle.
    expect(screen.queryByText("Saved to your library.")).toBeNull();
    expect(document.querySelector(".add-result")).toBeNull();
    const urlRadio = screen.getByRole("radio", {
      name: "Web address",
    }) as HTMLInputElement;
    expect(urlRadio.checked).toBe(true);
    expect((document.getElementById("ingest-url") as HTMLInputElement).value).toBe("");
    // The picker + tags fieldset are visible again.
    expect(document.querySelector("fieldset.add-source-picker")!.hasAttribute("hidden")).toBe(
      false,
    );
    expect(document.querySelector("fieldset.add-tags-fieldset")!.hasAttribute("hidden")).toBe(
      false,
    );
    // Focus rail: the reader's next decision is the Web address field.
    // The focus hand-off rides a rAF (post-commit), so wait for it.
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById("ingest-url"));
    });
  });

  it("Add another clears picked tags (the tags ride resetSession)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    render(
      <AddDialog
        open={true}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        tagStats={[{ tag: "essays", count: 2 }]}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/tagged",
    );
    await user.type(screen.getByLabelText("Add or search a tag"), "essays");
    await user.keyboard("{Enter}");
    expect(screen.getByText("essays")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByText("Saved to your library.")).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Add another" }));

    await waitFor(() => {
      expect(screen.queryByText("essays")).not.toBeInTheDocument();
    });
  });

  it("the save landing moves focus to the result heading (keyboard + SR land on the title)", async () => {
    await saveUrlArticle();

    const heading = screen.getByRole("heading", {
      name: "Article",
      level: 3,
    });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("Esc in result mode closes through onCancel (returns to the prior destination)", async () => {
    const { onCancel } = await saveUrlArticle();

    act(() => {
      (document.querySelector("dialog.add-dialog") as HTMLDialogElement).dispatchEvent(
        new Event("cancel"),
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("a refusal never enters result mode: calm copy only, no result actions", async () => {
    const user = userEvent.setup();
    hasMock.mockResolvedValue(true); // dedupe-refuse
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    const { onSaved } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/already in your library/i)).not.toBeNull();
    });
    // Distinct surfaces: no result card, no outcome actions, no
    // invalidation broadcast (nothing was saved).
    expect(document.querySelector(".add-result")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open article" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add another" })).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    // The submit stays (retry available), the result is not shown.
    expect(screen.getByRole("button", { name: /^add$/i })).not.toBeNull();
  });
});

// ── Book saved-result screen (issue #113) ────────────────────────────────────
// A book save keeps the dialog OPEN on the result screen exactly like an
// article save: the status region announces "Saved to your library.", the
// card shows the book title + the D12-11 skip count when anything was
// skipped, and the actions row becomes Close / Add another / Open book.
// Closing (Close/Esc/scrim) leaves every chapter unlocated → the book is
// Unread; Open book close-first navigates to the first AVAILABLE chapter's
// #/article/<id> hash (a chapter IS an article); Add another runs the ONE
// resetSession with the dialog kept up. A book refusal NEVER enters result
// mode.
describe("AddDialog — book saved result (issue #113)", () => {
  async function saveEpubBook(overrides?: Partial<EpubIngestionSuccess>) {
    const user = userEvent.setup();
    ingestEpubMock.mockResolvedValue({
      ...sampleBookResult(),
      skippedCount: 0,
      ...overrides,
    });
    const utils = renderDialog();
    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));
    await waitFor(() => {
      expect(screen.getByText("Saved to your library.")).not.toBeNull();
    });
    return { user, ...utils };
  }

  it("the result card shows the book title with Open book + Add another (and Close) actions", async () => {
    await saveEpubBook();

    expect(screen.getByRole("heading", { name: "Sample Book", level: 3 })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open book" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add another" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).not.toBeNull();
    // The intake chrome yields to the result; the article-only controls
    // never render for a book.
    expect(screen.queryByRole("button", { name: "Open article" })).toBeNull();
    expect(document.querySelector("fieldset.add-source-picker")!.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("fieldset.add-tags-fieldset")!.hasAttribute("hidden")).toBe(true);
  });

  it("a clean save (skippedCount 0) is silent about skips", async () => {
    await saveEpubBook();
    expect(screen.queryByText(/could not be read/)).toBeNull();
    // The card still renders its title + the outcome actions.
    expect(screen.getByRole("heading", { name: "Sample Book", level: 3 })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open book" })).not.toBeNull();
  });

  it("a skipped save discloses the count (the D12-11 byte-stable copy, singular)", async () => {
    await saveEpubBook({ skippedCount: 1 });
    expect(screen.getByText("1 chapter could not be read.")).not.toBeNull();
  });

  it("Open book navigates close-first to the first available chapter (ordered: cancel, then the hash write)", async () => {
    const user = userEvent.setup();
    ingestEpubMock.mockResolvedValue(sampleBookResult());
    renderDialog({
      onCancel: vi.fn(() => navEvents.push("cancel")),
      onSaved: vi.fn(),
    });
    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open book" })).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Open book" }));

    // Ordered: the close callback fires BEFORE the hash write (D16-12);
    // the target is the first DECLARED live chapter (epub-c01).
    await waitFor(() => {
      expect(navEvents).toEqual(["cancel", "hash:#/article/epub-c01"]);
    });
  });

  it("Add another resets the session after a book save: fields + result cleared, tags gone, URL field focused", async () => {
    const user = userEvent.setup();
    ingestEpubMock.mockResolvedValue(sampleBookResult());
    render(
      <AddDialog
        open={true}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        tagStats={[{ tag: "essays", count: 2 }]}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.type(screen.getByLabelText("Add or search a tag"), "essays");
    await user.keyboard("{Enter}");
    expect(screen.getByText("essays")).toBeInTheDocument();
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));
    await waitFor(() => {
      expect(screen.getByText("Saved to your library.")).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Add another" }));

    // Fresh session (D16-08 shape, dialog still up) — result gone, Web
    // address checked, the file pick cleared, tags cleared, the status
    // region collapsed back to idle, focus on the Web address field.
    await waitFor(() => {
      expect(screen.queryByText("Saved to your library.")).toBeNull();
    });
    expect(document.querySelector(".add-result")).toBeNull();
    const urlRadio = screen.getByRole("radio", {
      name: "Web address",
    }) as HTMLInputElement;
    expect(urlRadio.checked).toBe(true);
    expect(fileInput().value).toBe("");
    expect(screen.queryByText("essays")).not.toBeInTheDocument();
    expect(document.querySelector("fieldset.add-source-picker")!.hasAttribute("hidden")).toBe(
      false,
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById("ingest-url"));
    });
  });

  it("the save landing moves focus to the book title heading (keyboard + SR land on the title)", async () => {
    await saveEpubBook();

    const heading = screen.getByRole("heading", {
      name: "Sample Book",
      level: 3,
    });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("a book result with no live chapter renders no Open book control (the nothing-to-open edge)", async () => {
    await saveEpubBook({
      book: {
        id: "book-id",
        title: "Sample Book",
        chapterArticleIds: ["epub-c01"],
        addedAt: "2026-08-29T00:00:00.000Z",
      } as unknown as EpubIngestionSuccess["book"],
      articles: [],
    });

    expect(screen.queryByRole("button", { name: "Open book" })).toBeNull();
    // The other outcome actions stay (Close / Add another remain useful).
    expect(screen.getByRole("button", { name: "Close" })).not.toBeNull();
  });

  it("a book dedupe-refuse never enters result mode: calm copy only, no result actions", async () => {
    const user = userEvent.setup();
    hasBookMock.mockResolvedValue(true); // book-level dedupe-refuse
    ingestEpubMock.mockResolvedValue(sampleBookResult());
    const { onSaved } = renderDialog();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));

    await waitFor(() => {
      expect(screen.getByText(/already in your library/i)).not.toBeNull();
    });
    // Distinct surfaces: no result card, no outcome actions, no
    // invalidation broadcast (nothing was saved).
    expect(document.querySelector(".add-result")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open book" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add another" })).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    // The submit stays (retry available), the result is not shown.
    expect(screen.getByRole("button", { name: "Add file" })).not.toBeNull();
  });
});

// Backdrop scrim dismissal (quick task 260908-o0w). jsdom cannot hit-test
// the ::backdrop (Pitfall 2/5 — the real-browser proof lives in
// tests/e2e/scrim-dismiss.spec.ts), so the listener logic is exercised
// directly: a scrim click is a native click dispatched on the dialog
// element itself (the listener sees target === dialog), and the negative
// case is the same bubbling click dispatched on the .add-dialog-inner
// wrapper (target = a descendant — visible-content clicks never dismiss).
describe("AddDialog — backdrop scrim dismissal (260908-o0w)", () => {
  it("an idle dialog's scrim click (target === dialog) fires onCancel", () => {
    const { onCancel } = renderDialog();
    const dlg = screen.getByRole("dialog") as HTMLDialogElement;
    act(() => {
      dlg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("a bubbling click on the .add-dialog-inner wrapper does NOT fire onCancel", () => {
    const { onCancel } = renderDialog();
    const dlg = screen.getByRole("dialog") as HTMLDialogElement;
    const inner = dlg.querySelector(".add-dialog-inner");
    expect(inner).not.toBeNull();
    act(() => {
      inner!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("BLOCKS the scrim click while a URL submission is in flight; once it settles, the scrim dismisses again (D16-10)", async () => {
    const user = userEvent.setup();
    // Terminal outcome = dedupe-refuse error, so the dialog STAYS OPEN
    // after the held promise resolves (the D16-12 success arm would close
    // it on its own and muddy the assertion).
    hasMock.mockResolvedValue(true);
    type UrlSuccess = Awaited<ReturnType<typeof ingestUrl>>;
    let resolveIngest!: (value: UrlSuccess) => void;
    ingestUrlMock.mockReturnValue(
      new Promise<UrlSuccess>((resolve) => {
        resolveIngest = resolve;
      }),
    );
    const { onCancel } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByText("Fetching article…")).not.toBeNull();
    });

    // In flight: the live submittingRef mirror gates the scrim — no
    // onCancel, no state churn, the dialog stays open.
    const dlg = screen.getByRole("dialog") as HTMLDialogElement;
    act(() => {
      dlg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(dlg.open).toBe(true);

    // Settle the submission (dedupe-refuse error) → idle-but-open, and
    // the scrim dismissal works again.
    resolveIngest({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    await waitFor(() => {
      expect(screen.getByText(/already in your library/i)).not.toBeNull();
    });
    act(() => {
      dlg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ── Discoverability hint (issue #60, decision #58) ──────────────────────────
// The Web-address source gains the quiet hint line the file source already
// had, so YouTube transcript import is visible before the reader tries it.
// The pinned strings are LOAD-BEARING product surface (the youtube-copy.test
// byte-for-byte discipline, decision #58's pinned copy): every character is
// asserted exactly, and the e2e-driven anchor (input#ingest-url) must not
// move; form#add-url-form anchors these component tests only.
describe("AddDialog — discoverability hint (issue #60)", () => {
  it("shows the pinned hint line under the URL input, byte-for-byte", () => {
    renderDialog();
    const form = document.getElementById("add-url-form");
    expect(form).not.toBeNull();
    const hint = form!.querySelector("p.meta");
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toBe("Article pages and YouTube videos");
  });

  it("renders the hint as ordinary text following the URL input in DOM order — no ARIA tricks", () => {
    renderDialog();
    const input = document.getElementById("ingest-url")!;
    const hint = document.querySelector("form#add-url-form p.meta")!;
    // The hint follows the field it describes in document order, so screen
    // readers announce it naturally — robust to any future insertion
    // between label, input, and hint (no exact-child-list pinning).
    expect(input.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Ordinary text: a plain paragraph whose ONLY attribute is its class —
    // nothing to hide it (aria-hidden), repurpose its announcement (role),
    // or make it a live region (aria-live); zoom-safe plain text.
    expect(hint.tagName).toBe("P");
    expect(hint.className).toBe("meta");
    expect(Array.from(hint.attributes).map((a) => a.name)).toEqual(["class"]);
  });

  it("keeps every other Add-dialog copy byte-unchanged (placeholder + radio labels + file hint)", () => {
    renderDialog();
    // The URL placeholder is byte-unchanged (decision #58: no placeholder
    // change — the hint carries the discoverability weight).
    const urlInput = document.getElementById("ingest-url") as HTMLInputElement;
    expect(urlInput.placeholder).toBe("https://example.com/article");
    // The three radio labels are byte-unchanged (decision #58: no
    // radio-label change).
    expect(screen.getByRole("radio", { name: "Web address" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Paste text" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Upload file" })).toBeTruthy();
    // The file source's hint (the pattern this mirrors) is untouched.
    const fileHint = document.querySelector("form#add-file-form p.meta");
    expect(fileHint?.textContent).toBe("Accepts .md, .html, PDF, and EPUB books");
  });
});

// ── Transcript swap (issue #84, decision #70) ────────────────────────────────
// The bot-check fallback is an IN-PLACE swap of the content slot: the
// picker + source forms HIDE (never unmount — the picked file must
// survive), the transcript flow renders in their position, the ONE
// bottom submit flips label + form= target, and the stacked second
// action row is retired. The status card sits ABOVE the form and hosts
// the refusal copy that explains the swap. "Back to web address" returns
// with the typed URL intact (D16-11).
describe("AddDialog — transcript content swap (issue #84)", () => {
  const YT_URL = "https://www.youtube.com/watch?v=swapTest123";

  async function refuseWithBotCheck() {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("youtube-bot-check"));
    renderDialog();
    await user.type(screen.getByRole("textbox", { name: "Add by URL" }), YT_URL);
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "YouTube is asking for extra verification",
      );
    });
    return { user };
  }

  it("swaps the content slot: picker + source forms hidden, transcript flow mounted, refusal copy in the top status card", async () => {
    await refuseWithBotCheck();

    // The status card hosts the bot-check context (the same copy map).
    expect(screen.getByRole("status").textContent).toContain(
      "YouTube is asking for extra verification, so this video can't be added right now.",
    );
    // The picker + source content hide via the hidden attribute (mount
    // preservation), and the transcript flow renders instead.
    const picker = document.querySelector("fieldset.add-source-picker")!;
    expect(picker.hasAttribute("hidden")).toBe(true);
    const content = document.querySelector(".add-source-content")!;
    expect(content.hasAttribute("hidden")).toBe(true);
    expect(document.getElementById("add-transcript-form")).not.toBeNull();
    expect(document.getElementById("ingest-transcript-title")).not.toBeNull();
    // The video URL rides provenance prefilled from the refused URL.
    expect((document.getElementById("ingest-transcript-url") as HTMLInputElement).value).toBe(
      YT_URL,
    );
    // The always-mounted file input SURVIVED the swap (Pattern 3a).
    expect(document.getElementById("ingest-file")).not.toBeNull();
  });

  it("the status card renders ABOVE the content slot (the one-anatomy order)", async () => {
    await refuseWithBotCheck();
    const status = screen.getByRole("status");
    const picker = document.querySelector("fieldset.add-source-picker")!;
    expect(status.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the shared bottom submit flips to 'Add transcript' targeting the transcript form; the second action row is retired", async () => {
    await refuseWithBotCheck();

    const submit = screen.getByRole("button", {
      name: "Add transcript",
    }) as HTMLButtonElement;
    expect(submit.getAttribute("form")).toBe("add-transcript-form");
    // Disabled while the required title/text are empty (the no-silent-
    // "Transcript" gate now rides the SHARED button).
    expect(submit.disabled).toBe(true);
    // No stacked second action row, no inner duplicate submit, no
    // "No thanks" — the quiet Back control replaced it.
    expect(document.querySelector(".add-transcript-actions")).toBeNull();
    expect(screen.queryByRole("button", { name: "No thanks" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to web address" })).toBeTruthy();
    expect(document.querySelectorAll("button.add-dialog-submit").length).toBe(1);
  });

  it("Back to web address retires the swap with the typed URL preserved (D16-11)", async () => {
    const { user } = await refuseWithBotCheck();

    await user.click(screen.getByRole("button", { name: "Back to web address" }));

    // The swap retired: picker + URL form visible again, transcript form
    // unmounted, URL text intact.
    expect(document.querySelector("fieldset.add-source-picker")!.hasAttribute("hidden")).toBe(
      false,
    );
    expect(document.querySelector(".add-source-content")!.hasAttribute("hidden")).toBe(false);
    expect(document.getElementById("add-transcript-form")).toBeNull();
    expect((document.getElementById("ingest-url") as HTMLInputElement).value).toBe(YT_URL);
    // The shared submit re-armed for the URL arm.
    const add = screen.getByRole("button", { name: /^add$/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    // The provenance prefill does not survive the retired offer into a
    // future swap — it re-prefills from the NEXT refused URL (D16-08's
    // fresh-session discipline at field level).
    expect(
      (document.getElementById("ingest-transcript-url") as HTMLInputElement | null)?.value ?? "",
    ).toBe("");
  });

  it("submits through the shared button: title + text ride ingestPastedTranscript; success shows the result screen (issue #112)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("youtube-bot-check"));
    renderDialog({
      onCancel: vi.fn(() => navEvents.push("cancel")),
    });
    await user.type(screen.getByRole("textbox", { name: "Add by URL" }), YT_URL);
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "YouTube is asking for extra verification",
      );
    });

    ingestPastedTranscriptMock.mockResolvedValue({
      article: sampleArticle("pasted-swap-id"),
      confidence: { state: "low" },
      assets: [],
    });

    await user.type(screen.getByLabelText("Title"), "Pasted Lecture");
    await user.type(
      screen.getByRole("textbox", { name: /paste the transcript/i }),
      "0:00\nA cue pasted by hand",
    );
    expect(
      (screen.getByRole("button", { name: "Add transcript" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Add transcript" }));

    // Issue #112 — the transcript arm is an ARTICLE arm: the dialog stays
    // open on the result screen (no close, no navigation). The swapped
    // transcript flow yields to the result card.
    await waitFor(() => {
      expect(screen.getByText("Saved to your library.")).not.toBeNull();
    });
    expect(navEvents).toEqual([]);
    expect(screen.getByRole("heading", { name: "Article", level: 3 })).not.toBeNull();
    expect(document.getElementById("add-transcript-form")).toBeNull();
    expect(screen.getByRole("button", { name: "Open article" })).not.toBeNull();
    expect(ingestPastedTranscriptMock).toHaveBeenCalledWith(
      "0:00\nA cue pasted by hand",
      "Pasted Lecture",
      YT_URL,
    );
  });
});
