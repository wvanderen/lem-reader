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
//   - D16-12 success arms (article: onCancel() then #/article/<id>;
//     book: onCancel() then onBookAdded()).
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
  IngestionError,
  type EpubIngestionSuccess,
} from "../../src/ingestion/IngestionClient";
import { dexieLibrarySource } from "../../src/ingestion/LibrarySource";
import { hasBook, saveBook } from "../../src/persistence/booksStore";
import type { CanonicalArticle } from "../../src/content/types";

const ingestUrlMock = vi.mocked(ingestUrl);
const ingestHtmlMock = vi.mocked(ingestHtml);
const ingestEpubMock = vi.mocked(ingestEpub);
const hasMock = vi.mocked(dexieLibrarySource.has);
const saveMock = vi.mocked(dexieLibrarySource.save);
const hasBookMock = vi.mocked(hasBook);
const saveBookMock = vi.mocked(saveBook);

// jsdom implements the HTMLDialogElement interface but NOT showModal/close
// behavior (Pitfall 2/5). Stub the two methods at the prototype level so
// the dialog sync effect exercises its real code path (mirrors
// SettingsPanel.test.tsx / import-preview-dialog.test.tsx).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

// Navigation + callback ordering recorder. The hash setter stub records
// every write (jsdom doesn't implement location.hash navigation — the
// the original control's suite L81-90 precedent), and tests push "cancel" /
// "bookAdded" markers from their onCancel/onBookAdded spies so the
// D16-12 ordering (close FIRST, then navigate/callback) is assertable as
// one ordered array.
const navEvents: string[] = [];

beforeEach(() => {
  ingestUrlMock.mockReset();
  ingestHtmlMock.mockReset();
  ingestEpubMock.mockReset();
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
  };
}

function renderDialog(overrides?: {
  open?: boolean;
  onCancel?: () => void;
  onBookAdded?: () => void;
}) {
  const onCancel = overrides?.onCancel ?? vi.fn();
  const onBookAdded = overrides?.onBookAdded ?? vi.fn();
  const utils = render(
    <AddDialog
      open={overrides?.open ?? true}
      onCancel={onCancel}
      onBookAdded={onBookAdded}
    />,
  );
  return { onCancel, onBookAdded, ...utils };
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
      expect(
        screen.getByText(/points somewhere the reader can't reach/i),
      ).not.toBeNull();
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
    expect(
      screen.getByRole("textbox", { name: "Paste HTML or text" }),
    ).not.toBeNull();
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
    await user.upload(
      fileInput(),
      new File(["PK"], "book.epub", { type: "application/epub+zip" }),
    );
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
    const { onCancel, onBookAdded, rerender } = renderDialog();

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
    rerender(
      <AddDialog open={false} onCancel={onCancel} onBookAdded={onBookAdded} />,
    );
    rerender(
      <AddDialog open={true} onCancel={onCancel} onBookAdded={onBookAdded} />,
    );

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

  it("article success: onCancel() FIRST, then window.location.hash = #/article/<id>", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [], // Phase 20 (20-02): envelope re-validation exposes the validated array
    });
    renderDialog({
      onCancel: vi.fn(() => navEvents.push("cancel")),
    });

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      // Ordered: the close callback fires BEFORE the hash write.
      expect(navEvents).toEqual(["cancel", "hash:#/article/ingested-id"]);
    });
  });

  it("book success: onCancel() FIRST, then onBookAdded(); hasBook→saveBook dedupe seam intact", async () => {
    const user = userEvent.setup();
    ingestEpubMock.mockResolvedValue(sampleBookResult());
    renderDialog({
      onCancel: vi.fn(() => navEvents.push("cancel")),
      onBookAdded: vi.fn(() => navEvents.push("bookAdded")),
    });

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));

    // Ordered: the close callback fires BEFORE the book-added callback.
    await waitFor(() => {
      expect(navEvents).toEqual(["cancel", "bookAdded"]);
    });
    await waitFor(() => expect(hasBookMock).toHaveBeenCalledWith("book-id"));
    expect(saveBookMock).toHaveBeenCalledTimes(1);
  });
});
