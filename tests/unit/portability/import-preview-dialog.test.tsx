// tests/unit/portability/import-preview-dialog.test.tsx
// Plan 09-05 — RTL component truth for ImportPreviewDialog (D9-11).
// Per the SettingsPanel.test.tsx precedent (Pitfall 2), jsdom is NOT
// authoritative for <dialog> focus-trap/inert/backdrop BEHAVIOR — those are
// proven by the 09-06 e2e across real engines. Here we assert the
// application-level concerns the plan locks:
//   - the summary counts text renders from a synthetic ImportPreviewData,
//   - the Cancel import button carries [data-initial-focus] (Pitfall 8 —
//     non-destructive default focus),
//   - the Import button is present (the sole onProceed path),
//   - override plumbing: flipping the highlight-id select to Keep both and
//     submitting calls onProceed with overrides whose highlight-id is
//     keep-both and whose other kinds remain skip (D9-14 defaults),
//   - the preferences checkbox initial state follows applyPreferencesDefault
//     (D9-12 fresh-device detection).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// jsdom implements the HTMLDialogElement interface but NOT showModal/close
// behavior. Stub the two methods at the prototype level so the dialog sync
// effect exercises its real code path (mirrors SettingsPanel.test.tsx).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

import { ImportPreviewDialog } from "../../../src/reader/ImportPreviewDialog";
import type { ImportPreviewData, Overrides } from "../../../src/portability/conflicts";

/** A synthetic preview with every conflict kind present so the whole
 * grouped list renders, including the id-kind three-option selects.
 * (Book counts ride the 12-07 preview shape; the summary sentence's copy
 * is 12-06+ UI scope.) */
function samplePreview(applyPreferencesDefault: boolean): ImportPreviewData {
  return {
    incoming: { books: 1, articles: 4, highlights: 6, notes: 2, locations: 3 },
    added: { books: 1, articles: 3, highlights: 6, notes: 1, locations: 3 },
    conflicts: [
      {
        kind: "article-revision",
        count: 1,
        sampleIds: ["article-a"],
      },
      {
        kind: "highlight-id",
        count: 2,
        sampleIds: ["hl-1", "hl-2"],
      },
    ],
    resolution: { confident: 5, ambiguous: 1, orphan: 0 },
    fixtureBackedHighlights: 1,
    applyPreferencesDefault,
  };
}

const DEFAULTS: Overrides = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  location: "skip",
};

function renderDialog(overrides?: {
  preview?: ImportPreviewData;
  onProceed?: (o: Overrides, applyPreferences: boolean) => void;
}) {
  const onProceed = overrides?.onProceed ?? vi.fn().mockResolvedValue(undefined);
  render(
    <ImportPreviewDialog
      open={true}
      preview={overrides?.preview ?? samplePreview(false)}
      onProceed={onProceed}
      onCancel={vi.fn()}
    />,
  );
  return { onProceed };
}

describe("ImportPreviewDialog — preview copy + override plumbing (D9-11)", () => {
  it("renders the summary counts sentence from the preview data", () => {
    renderDialog();
    // The sentence is one text node: incoming counts with "(N new)" where
    // added differs from incoming (articles 4→3 new, notes 2→1 new).
    expect(
      screen.getByText(
        "This bundle contains 4 articles (3 new), 6 highlights, 2 notes (1 new), and 3 reading positions.",
      ),
    ).toBeTruthy();
  });

  it("renders conflict lines, warning lines, and the preferences checkbox", () => {
    renderDialog();
    expect(screen.getByText(/1 conflicting article with a different version/)).toBeTruthy();
    expect(screen.getByText(/2 conflicting highlights/)).toBeTruthy();
    expect(screen.getByText(/1 highlight will import as ambiguous/)).toBeTruthy();
    expect(screen.getByText(/1 highlight anchor to bundled sample articles/)).toBeTruthy();
    expect(screen.getByLabelText("Apply imported reading preferences")).toBeTruthy();
  });

  it("carries [data-initial-focus] on Cancel import (Pitfall 8) and renders the Import button", () => {
    renderDialog();
    const cancel = screen.getByRole("button", { name: "Cancel import" });
    expect(cancel.hasAttribute("data-initial-focus")).toBe(true);
    // The Import button is the sole onProceed path (load-bearing handler).
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
  });

  it("defaults every override select to Skip and offers Keep both only for the id kinds", () => {
    renderDialog();
    const articleSelect = screen.getByLabelText(
      "Import choice for articles with a different version",
    ) as HTMLSelectElement;
    expect(articleSelect.value).toBe("skip");
    expect(Array.from(articleSelect.options).map((o) => o.value)).toEqual(["skip", "overwrite"]);

    const highlightSelect = screen.getByLabelText(
      "Import choice for highlights",
    ) as HTMLSelectElement;
    expect(highlightSelect.value).toBe("skip");
    expect(Array.from(highlightSelect.options).map((o) => o.value)).toEqual([
      "skip",
      "overwrite",
      "keep-both",
    ]);
  });

  it("submitting after flipping highlight-id to Keep both calls onProceed with keep-both there and skip elsewhere", () => {
    const onProceed = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onProceed });
    const highlightSelect = screen.getByLabelText("Import choice for highlights");
    act(() => {
      fireEvent.change(highlightSelect, { target: { value: "keep-both" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Import" }));
    });
    expect(onProceed).toHaveBeenCalledTimes(1);
    const [overrides, applyPreferences] = onProceed.mock.calls[0] as [Overrides, boolean];
    expect(overrides).toEqual({
      ...DEFAULTS,
      "highlight-id": "keep-both",
    });
    // The synthetic preview's fresh-device default is false here.
    expect(applyPreferences).toBe(false);
  });

  it("preferences checkbox initial state follows applyPreferencesDefault (D9-12)", () => {
    renderDialog({ preview: samplePreview(true) });
    expect(
      (screen.getByLabelText("Apply imported reading preferences") as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("an ESC-originated close (open prop still true) routes cleanup through onCancel; the controlled close does not", () => {
    // 09-06 Rule 1 regression lock: Esc closes the native dialog WITHOUT the
    // parent knowing — the close listener must call onCancel so the parent's
    // import state machine + file input reset on EVERY close path. The
    // controlled close (Proceed/Cancel already flipped the open prop) must
    // NOT re-invoke onCancel (it would wipe the Proceed status message).
    const onCancel = vi.fn();
    const { container, rerender } = render(
      <ImportPreviewDialog
        open={true}
        preview={samplePreview(false)}
        onProceed={vi.fn().mockResolvedValue(undefined)}
        onCancel={onCancel}
      />,
    );
    const dlg = container.querySelector("dialog.import-preview");
    expect(dlg).not.toBeNull();
    // ESC path: dispatch `close` while the open prop is still true.
    act(() => {
      dlg!.dispatchEvent(new Event("close", { bubbles: false }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Controlled path: parent flips open → the sync effect calls close() →
    // the same `close` event fires, but openRef is now false → no onCancel.
    rerender(
      <ImportPreviewDialog
        open={false}
        preview={samplePreview(false)}
        onProceed={vi.fn().mockResolvedValue(undefined)}
        onCancel={onCancel}
      />,
    );
    act(() => {
      dlg!.dispatchEvent(new Event("close", { bubbles: false }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1); // still exactly the ESC call
  });
});
