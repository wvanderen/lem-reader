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
//   - issue #163 success arms — the saved-result screens of #112/#113 are
//     RETIRED; success closes the dialog split on the remembered
//     "Open after adding" preference (the mocked SettingsContext double's
//     openAfterAdd, default true): CHECKED → close-first navigation to the
//     article / the book's first AVAILABLE chapter (flagged articles open
//     too — the reader view carries the limits); UNCHECKED → onQuietSave
//     hands the host the confirmation ("Saved to your library.", books
//     appending the D12-11 skip sentence) then closes — never a
//     navigation, so the never-opened item stays Unread. Refusals and
//     errors preserve the input in place; the checkbox itself (native,
//     labeled, keyboard-operable) writes the preference through
//     SettingsContext.update and survives reopens.
//   - scrim dismissal (quick task 260908-o0w): an idle scrim click
//     (target === the dialog element — the dimmed ::backdrop) fires
//     onCancel, an inner-wrapper click is inert, and an in-flight
//     submission ignores the scrim (D16-10 extended to the click path).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useReducer } from "react";

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

// Issue #163 — the dialog now consumes the app-root settings context for
// the remembered openAfterAdd preference. jsdom tests replace the context
// with a state-backed double (the REAL provider's Dexie/mirror machinery is
// SettingsContext.test.tsx's subject): the holder starts from
// DEFAULT_SETTINGS every test, update() merges + re-renders consumers, and
// updateSpy records every preference write.
const { settingsHolder } = vi.hoisted(() => ({
  settingsHolder: {
    settings: null as Record<string, unknown> | null,
    listeners: new Set<() => void>(),
    update: null as ((patch: Record<string, unknown>) => void) | null,
  },
}));

vi.mock("../../src/settings/SettingsContext", () => ({
  useSettings: () => useSettingsTestDouble(),
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
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import type { ReaderSettings } from "../../src/content/schema";

const ingestUrlMock = vi.mocked(ingestUrl);
const ingestHtmlMock = vi.mocked(ingestHtml);
const ingestEpubMock = vi.mocked(ingestEpub);
const ingestPastedTranscriptMock = vi.mocked(ingestPastedTranscript);
const hasMock = vi.mocked(dexieLibrarySource.has);
const saveMock = vi.mocked(dexieLibrarySource.save);
const hasBookMock = vi.mocked(hasBook);
const saveBookMock = vi.mocked(saveBook);

// The settings-context double's write spy — reset with the holder below.
const updateSpy = vi.fn();

/**
 * useSettingsTestDouble — the mocked module's hook. A real hook (so React
 * wiring works): subscribes the consumer to the holder and returns its
 * current settings; update() merges into the holder, records the write,
 * and re-renders every subscriber.
 */
function useSettingsTestDouble() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const listener = () => force();
    settingsHolder.listeners.add(listener);
    return () => {
      settingsHolder.listeners.delete(listener);
    };
  }, []);
  return {
    settings: settingsHolder.settings as unknown as ReaderSettings,
    update: (patch: Partial<ReaderSettings>) => settingsHolder.update!(patch),
    reset: vi.fn(),
    storageState: "ok" as const,
    resetLocalData: vi.fn(),
  };
}

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
// "saved" / "quiet:<copy>" markers from their onCancel/onSaved/onQuietSave
// spies so the D16-12 ordering (close FIRST, then navigate) and the
// quiet-arm ordering (announce FIRST, then close) are assertable as one
// ordered array.
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
  // Issue #163 — fresh first-run settings every test: openAfterAdd true
  // (the schema default a new reader carries), update() merges + notifies.
  settingsHolder.settings = { ...DEFAULT_SETTINGS };
  settingsHolder.listeners.clear();
  updateSpy.mockReset();
  settingsHolder.update = (patch: Record<string, unknown>) => {
    settingsHolder.settings = { ...settingsHolder.settings, ...patch };
    updateSpy(patch);
    settingsHolder.listeners.forEach((l) => l());
  };
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

function renderDialog(overrides?: {
  open?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
  onQuietSave?: (notice: string) => void;
}) {
  const onCancel = overrides?.onCancel ?? vi.fn(() => navEvents.push("cancel"));
  const onSaved = overrides?.onSaved ?? vi.fn(() => navEvents.push("saved"));
  const onQuietSave =
    overrides?.onQuietSave ?? vi.fn((notice: string) => navEvents.push(`quiet:${notice}`));
  const utils = render(
    <AddDialog
      open={overrides?.open ?? true}
      onCancel={onCancel}
      onSaved={onSaved}
      onQuietSave={onQuietSave}
      tagStats={[]}
    />,
  );
  return { onCancel, onSaved, onQuietSave, ...utils };
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
    rerender(
      <AddDialog
        open={false}
        onCancel={onCancel}
        onSaved={onSaved}
        onQuietSave={vi.fn()}
        tagStats={[]}
      />,
    );
    rerender(
      <AddDialog
        open={true}
        onCancel={onCancel}
        onSaved={onSaved}
        onQuietSave={vi.fn()}
        tagStats={[]}
      />,
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

  // ── Success arms (issue #163 — the remembered openAfterAdd checkbox) ────

  it("CHECKED article success: onSaved fires, then close-first navigation — cancel, then the hash write (D16-12 order)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    // Ordered: the snapshot invalidation first (the library re-derives
    // behind the landing), then the close, then the article's hash write.
    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "cancel", "hash:#/article/ingested-id"]);
    });
  });

  it("CHECKED book success: opens the book's first AVAILABLE chapter (a chapter IS an article)", async () => {
    const user = userEvent.setup();
    ingestEpubMock.mockResolvedValue(sampleBookResult());
    renderDialog();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));

    // Ordered: invalidate, close-first, then the first live chapter's hash.
    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "cancel", "hash:#/article/epub-c01"]);
    });
    await waitFor(() => expect(hasBookMock).toHaveBeenCalledWith("book-id"));
    expect(saveBookMock).toHaveBeenCalledTimes(1);
  });

  it("CHECKED flagged article success: still opens — the reader view renders the processing limits (the ONE copy home)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle("flagged-auto"),
      confidence: { state: "low" },
      assets: [],
    });
    renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/flagged",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "cancel", "hash:#/article/flagged-auto"]);
    });
  });

  it("CHECKED book success with NO live chapter falls back to the quiet close (no dead hash)", async () => {
    const user = userEvent.setup();
    ingestEpubMock.mockResolvedValue({ ...sampleBookResult(), articles: [] });
    renderDialog();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));

    // The honest nothing-to-open edge: no hash write ever happens; the
    // confirmation rides the quiet arm instead.
    await waitFor(() => {
      expect(navEvents).toEqual([
        "saved",
        "quiet:Saved to your library. 2 chapters could not be read.",
        "cancel",
      ]);
    });
  });

  it("UNCHECKED article success: announces through onQuietSave, closes onto the library, never navigates", async () => {
    const user = userEvent.setup();
    settingsHolder.settings = { ...DEFAULT_SETTINGS, openAfterAdd: false };
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    const { onCancel, onSaved } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    // Ordered: invalidate + announce FIRST, then the close. No hash write —
    // the never-opened article stays Unread on the library.
    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "quiet:Saved to your library.", "cancel"]);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("UNCHECKED book success appends the honest skip count to the confirmation (the D12-11 sentences)", async () => {
    const user = userEvent.setup();
    settingsHolder.settings = { ...DEFAULT_SETTINGS, openAfterAdd: false };
    ingestEpubMock.mockResolvedValue(sampleBookResult());
    renderDialog();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));

    await waitFor(() => {
      expect(navEvents).toEqual([
        "saved",
        "quiet:Saved to your library. 2 chapters could not be read.",
        "cancel",
      ]);
    });
  });

  it("UNCHECKED clean book success is silent about skips (the confirmation carries no skip sentence)", async () => {
    const user = userEvent.setup();
    settingsHolder.settings = { ...DEFAULT_SETTINGS, openAfterAdd: false };
    ingestEpubMock.mockResolvedValue({ ...sampleBookResult(), skippedCount: 0 });
    renderDialog();

    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(
      fileInput(),
      new File(["PK"], "sample.epub", { type: "application/epub+zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));

    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "quiet:Saved to your library.", "cancel"]);
    });
  });

  it("a refusal NEVER navigates and NEVER announces the save — the input is preserved for retry", async () => {
    const user = userEvent.setup();
    hasMock.mockResolvedValue(true); // dedupe-refuse
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    const { onSaved, onQuietSave } = renderDialog();

    const urlInput = screen.getByRole("textbox", { name: "Add by URL" });
    await user.type(urlInput, "https://example.com/dup");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/already in your library/i)).not.toBeNull();
    });
    // Distinct surfaces: no close, no landing, no announcement.
    expect(onSaved).not.toHaveBeenCalled();
    expect(onQuietSave).not.toHaveBeenCalled();
    expect(navEvents).toEqual([]);
    // D16-11 — the URL survives for the retry.
    expect((urlInput as HTMLInputElement).value).toBe("https://example.com/dup");
  });

  it("an operation failure (server-error) stays open with calm copy — no close, no landing", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockRejectedValue(new IngestionError("server-error"));
    const { onSaved, onQuietSave } = renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/boom",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong. try again/i)).not.toBeNull();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onQuietSave).not.toHaveBeenCalled();
    expect(navEvents).toEqual([]);
  });
});

// ── The remembered "Open after adding" checkbox (issue #163) ─────────────────
// The preference governs the success landing for EVERY source arm. The
// checkbox is a native control with a wrapped label (accessible name +
// keyboard operation for free); its state is the openAfterAdd READER
// PREFERENCE read and written through SettingsContext — remembered across
// sessions and dialog reopens, never reset by the D16-08 fresh-session
// reset.
describe("AddDialog — the Open after adding checkbox (issue #163)", () => {
  it("renders a checkbox named 'Open after adding', CHECKED by default (the first-run state)", () => {
    renderDialog();
    const box = screen.getByRole("checkbox", { name: "Open after adding" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    // A native checkbox: keyboard-operable by construction (Space toggles),
    // no ARIA role tricks to verify beyond the label association above.
  });

  it("starts UNCHECKED when the remembered preference is false (the hydrated state)", () => {
    settingsHolder.settings = { ...DEFAULT_SETTINGS, openAfterAdd: false };
    renderDialog();
    const box = screen.getByRole("checkbox", { name: "Open after adding" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it("toggling writes the openAfterAdd preference through SettingsContext.update", async () => {
    const user = userEvent.setup();
    renderDialog();
    const box = screen.getByRole("checkbox", { name: "Open after adding" });
    await user.click(box);
    expect(updateSpy).toHaveBeenCalledWith({ openAfterAdd: false });
    // The controlled checkbox reflects the merged state (the double
    // re-renders its subscribers).
    expect(
      (screen.getByRole("checkbox", { name: "Open after adding" }) as HTMLInputElement).checked,
    ).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Open after adding" }));
    expect(updateSpy).toHaveBeenCalledWith({ openAfterAdd: true });
  });

  it("REOPENING the dialog keeps the remembered state (resetSession never touches the preference)", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog();
    await user.click(screen.getByRole("checkbox", { name: "Open after adding" }));
    expect(
      (screen.getByRole("checkbox", { name: "Open after adding" }) as HTMLInputElement).checked,
    ).toBe(false);

    // The parent flips the open prop false → true (the Cancel path).
    rerender(
      <AddDialog
        open={false}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        onQuietSave={vi.fn()}
        tagStats={[]}
      />,
    );
    rerender(
      <AddDialog
        open={true}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        onQuietSave={vi.fn()}
        tagStats={[]}
      />,
    );

    // D16-08 resets the SESSION (URL field empty again) but the PREFERENCE
    // carries: the checkbox is still unchecked — remembered, not forgotten.
    expect((document.getElementById("ingest-url") as HTMLInputElement).value).toBe("");
    expect(
      (screen.getByRole("checkbox", { name: "Open after adding" }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("the checkbox is disabled while a submission is in flight (the tags-fieldset gate)", async () => {
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
    expect(
      (screen.getByRole("checkbox", { name: "Open after adding" }) as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it("the checkbox sits ABOVE the actions row and OUTSIDE the swapped content slot (visible in every source arm)", async () => {
    const user = userEvent.setup();
    renderDialog();
    const checkboxRow = document.querySelector(".add-open-after")!;
    const actions = document.querySelector(".add-dialog-actions")!;
    expect(checkboxRow).not.toBeNull();
    // DOM order: the outcome preference precedes the action row.
    expect(
      checkboxRow.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Still visible after switching to the file arm (not part of the
    // per-source content slot).
    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    expect(
      (screen.getByRole("checkbox", { name: "Open after adding" }) as HTMLInputElement).disabled,
    ).toBe(false);
  });
});

// ── Unread preservation is now the READER's choice (issue #163) ──────────────
// The #112/#113 saved-result screens are retired: success closes the
// dialog in both checkbox states, so no result card, no outcome actions,
// and no focus rail exist anywhere in the dialog.
describe("AddDialog — the saved-result screen is retired (issue #163)", () => {
  it("no outcome actions or result card exist in any state (success closes the dialog itself)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    renderDialog();

    expect(screen.queryByRole("button", { name: "Open article" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open book" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add another" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(document.querySelector(".add-result")).toBeNull();

    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "cancel", "hash:#/article/ingested-id"]);
    });
    // The dismissal surface is Cancel-only now.
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull();
  });

  it("the save announces NOTHING in the dialog's own region on the checked arm (the reader route is the landing)", async () => {
    const user = userEvent.setup();
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    renderDialog();
    await user.type(
      screen.getByRole("textbox", { name: "Add by URL" }),
      "https://example.com/article",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "cancel", "hash:#/article/ingested-id"]);
    });
    // The dialog region never carried a success phrase — the library's
    // status region owns confirmations (quiet arm) and the reader route
    // owns the checked arm.
    expect(screen.getByRole("status").textContent).not.toContain("Saved to your library.");
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

  it("submits through the shared button: title + text ride ingestPastedTranscript; success opens the article (issue #163)", async () => {
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

    // Issue #163 — the transcript arm is an ARTICLE arm: the remembered
    // checkbox (checked by default) opens the saved article — invalidate,
    // close-first, then the hash write. The swapped transcript flow yields
    // to the landing; the reader view renders the low-confidence
    // disclosures.
    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "cancel", "hash:#/article/pasted-swap-id"]);
    });
    expect(ingestPastedTranscriptMock).toHaveBeenCalledWith(
      "0:00\nA cue pasted by hand",
      "Pasted Lecture",
      YT_URL,
    );
  });

  it("UNCHECKED transcript success closes onto the library announcement (the quiet arm, issue #163)", async () => {
    const user = userEvent.setup();
    settingsHolder.settings = { ...DEFAULT_SETTINGS, openAfterAdd: false };
    ingestUrlMock.mockRejectedValue(new IngestionError("youtube-bot-check"));
    renderDialog();
    await user.type(screen.getByRole("textbox", { name: "Add by URL" }), YT_URL);
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "YouTube is asking for extra verification",
      );
    });

    ingestPastedTranscriptMock.mockResolvedValue({
      article: sampleArticle("pasted-quiet-id"),
      confidence: { state: "confident" },
      assets: [],
    });

    await user.type(screen.getByLabelText("Title"), "Pasted Lecture");
    await user.type(
      screen.getByRole("textbox", { name: /paste the transcript/i }),
      "0:00\nA cue pasted by hand",
    );
    await user.click(screen.getByRole("button", { name: "Add transcript" }));

    await waitFor(() => {
      expect(navEvents).toEqual(["saved", "quiet:Saved to your library.", "cancel"]);
    });
  });
});
