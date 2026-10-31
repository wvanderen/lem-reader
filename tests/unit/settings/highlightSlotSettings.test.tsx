// tests/unit/settings/highlightSlotSettings.test.tsx
// Issue #196 — the slot editor's custom color choice. The unit layer pins the
// editor's observable behavior (the e2e layer owns layout + zoom truth):
//
//   1. The five named radios + the Custom radio form ONE color-source group:
//      activating Custom writes a customColor snapshot; activating a named
//      choice clears it entirely (never an undefined-valued residue).
//   2. The native color input carries a LOCAL DRAFT while the reader drags
//      (issue #219 — Chrome/Windows fires the `input` event continuously in
//      the OS picker, and every React onChange previously patched settings:
//      a synchronous setSettings + applyTheme + a fresh context value, so
//      EVERY useSettings consumer — ArticleView included — re-rendered at
//      input-event rate). The draft drives the live preview locally (one
//      customHighlightTint call); the commit happens ONCE on settle — a
//      ~300ms quiet debounce, NOT the native `change` event (verified per
//      engine 2026-10-31: WebKit fires `change` on EVERY picker adjustment
//      — ColorInputType::didChooseColor dispatches input + change — so
//      change-based settle would keep the storm on WebKit; Chromium fires
//      change only at dismissal, Gecko only at Done). Pinning here: at most
//      ONE settings update per settle, the preview paints live from the
//      draft during the drag, and a named pick inside the settle window
//      cancels the pending draft (no custom resurrection).
//   3. The LIVE preview renders the literal mark anatomy (the shared
//      color-custom class + tint style) with the tint derived by the ONE
//      readableHighlightTint seam against the ACTIVE theme's bases — preview
//      = render by construction.
//
// The settle-count observation channel: a PROBE useSettings consumer that
// records every settings snapshot it renders with — a probe render IS a
// context-value change, the exact mechanism the #219 crawl ran through
// (every consumer re-rendering per drag event). Probe renders after the
// mount quiesce count settings updates one-for-one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import { SettingsProvider, useSettings } from "../../../src/settings/SettingsContext";
import { COLOR_SETTLE_MS, HighlightSlotSettings } from "../../../src/reader/HighlightSlotSettings";
import { highlightBases, customHighlightTint } from "../../../src/settings/highlightTint";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import * as settingsStore from "../../../src/persistence/settingsStore";
import type { ReaderSettings } from "../../../src/content/schema";

// Each editor starts from the shipped slots, independent of prior flushes.
beforeEach(() => {
  window.localStorage?.clear();
});

function mountEditor() {
  return render(
    <SettingsProvider>
      <HighlightSlotSettings />
    </SettingsProvider>,
  );
}

function slotGroup(index: number): HTMLElement {
  const groups = screen
    .getAllByRole("group")
    .filter((g) => g.getAttribute("aria-label") === `Slot ${index + 1}`);
  expect(groups, `slot ${index + 1} editor group`).toHaveLength(1);
  return groups[0] as HTMLElement;
}

function slotColorRadio(index: number, label: string): HTMLInputElement {
  // The five editors each scope their radios with name="slot-color-<i>" —
  // one radio per slot per choice.
  const radios = screen
    .getAllByRole("radio")
    .filter(
      (r) =>
        (r as HTMLInputElement).name === `slot-color-${index}` &&
        (r as HTMLInputElement).value === label.toLowerCase(),
    );
  expect(radios, `slot ${index + 1} ${label} radio`).toHaveLength(1);
  return radios[0] as HTMLInputElement;
}

/** The slot's live preview mark (scoped to ITS editor — five previews mount). */
function slotPreview(index: number): HTMLInputElement {
  return within(slotGroup(index)).getByText("How a highlight reads") as unknown as HTMLInputElement;
}

/** A useSettings consumer that records every DISTINCT settings snapshot it
 * renders with — issue #219's observation channel. One log entry = one
 * settings update (context value identity change), which is exactly what
 * re-rendered ArticleView per drag event in the crawl. Renders that re-see
 * the same snapshot (e.g. a harness rerender) log nothing. */
function SettingsProbe({ log }: { log: Array<string | undefined> }): null {
  const { settings } = useSettings();
  const lastRef = useRef<ReaderSettings | null>(null);
  if (settings !== lastRef.current) {
    lastRef.current = settings;
    log.push(settings.highlightSlots[1]?.customColor);
  }
  return null;
}

/** Mount the editor + probe; returns the rerender harness, the probe log,
 * and the probe-render baseline after the mount quiesce. `await act` lets
 * the provider's one-shot loadSettings classification settle so the baseline
 * is clean. */
async function mountEditorWithProbe(): Promise<{
  log: Array<string | undefined>;
  baseline: number;
  rerender: (showEditor: boolean) => void;
  unmount: () => void;
}> {
  const log: Array<string | undefined> = [];
  const utils = render(
    <SettingsProvider>
      <SettingsProbe log={log} />
      <HighlightSlotSettings />
    </SettingsProvider>,
  );
  // Flush the mount-time loadSettings promise chain (storage classification
  // can mint one extra context value) so the baseline below is stable.
  await act(async () => {});
  return {
    log,
    baseline: log.length,
    rerender: (showEditor: boolean) =>
      utils.rerender(
        <SettingsProvider>
          <SettingsProbe log={log} />
          {showEditor ? <HighlightSlotSettings /> : null}
        </SettingsProvider>,
      ),
    unmount: utils.unmount,
  };
}

/** Simulate one picker drag: a burst of `input` events (the OS picker fires
 * them continuously while dragging — Chrome/Windows at input-event rate). */
function dragColorInput(input: HTMLInputElement, hexes: string[]): void {
  for (const hex of hexes) fireEvent.input(input, { target: { value: hex } });
}

describe("HighlightSlotSettings custom color (issue #196)", () => {
  it("the shipped slots start named — every Custom radio unchecked, no custom input value", () => {
    mountEditor();
    const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;
    // The native input shows the SEED (never a stored custom color).
    expect(input.value.toLowerCase()).toBe("#e9c46a");
    // Slot 2 ships as the named Yellow — its named radio checked, Custom not.
    expect(slotColorRadio(1, "yellow").checked).toBe(true);
    expect(slotColorRadio(1, "custom").checked).toBe(false);
  });

  it("activating Custom writes the snapshot; the preview mark renders the derived tint anatomy", () => {
    mountEditor();
    fireEvent.click(slotColorRadio(1, "custom"));
    const custom = slotColorRadio(1, "custom");
    expect(custom.checked).toBe(true);
    // The named choice of the slot stays as the FALLBACK (Yellow seeded).
    expect(slotColorRadio(1, "yellow").checked).toBe(false);

    // The preview: the literal mark anatomy (color-custom + the derived
    // tint under --highlight-custom), derived against the ACTIVE theme's
    // bases through the ONE seam the reader's marks use.
    const preview = slotPreview(1);
    expect(preview.classList.contains("highlight")).toBe(true);
    expect(preview.classList.contains("color-custom")).toBe(true);
    const expected = customHighlightTint("#e9c46a", highlightBases(DEFAULT_SETTINGS));
    expect(preview.getAttribute("style")).toContain(`--highlight-custom: ${expected}`);
  });

  it("changing the native color input previews the new hex live from LOCAL state — no settings write until settle", async () => {
    mountEditor();
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "#1234ab" } });
    expect(input.value.toLowerCase()).toBe("#1234ab");
    // The preview follows the draft through the SAME derivation.
    const preview = slotPreview(1);
    const expected = customHighlightTint("#1234ab", highlightBases(DEFAULT_SETTINGS));
    expect(preview.getAttribute("style")).toContain(`--highlight-custom: ${expected}`);
  });

  it("picking a named choice clears the snapshot — the Custom radio + preview revert (no undefined-valued residue)", () => {
    mountEditor();
    fireEvent.click(slotColorRadio(1, "custom"));
    expect(slotColorRadio(1, "custom").checked).toBe(true);
    fireEvent.click(slotColorRadio(1, "green"));
    expect(slotColorRadio(1, "custom").checked).toBe(false);
    expect(slotColorRadio(1, "green").checked).toBe(true);
    // The preview mark drops the custom anatomy entirely (the named fill
    // class owns the paint again — Default renders bare, Green color-green).
    const preview = slotPreview(1);
    expect(preview.classList.contains("color-custom")).toBe(false);
    expect(preview.classList.contains("color-green")).toBe(true);
    expect(preview.getAttribute("style") ?? "").not.toContain("--highlight-custom");
  });
});

describe("slot custom color drag settle (issue #219)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a picker drag issues at most ONE settings update per settle; the preview paints live from local state", async () => {
    const { log, baseline } = await mountEditorWithProbe();
    fireEvent.click(slotColorRadio(1, "custom"));
    // The Custom activation itself is one settings update (the snapshot
    // seed) — the drag assertions below baseline OFF that commit.
    const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;
    const dragHexes = ["#100000", "#220000", "#301111", "#3a2222", "#4a1234"];
    dragColorInput(input, dragHexes);

    // DURING the drag: the probe consumer saw NO new settings snapshot —
    // every useSettings consumer (ArticleView included) stays quiet. Five
    // input events, zero settings updates (the pre-#219 code was five).
    expect(log.length).toBe(baseline + 1); // +1 = the Custom activation only

    // The live preview + the input paint the DRAFT hex through the SAME
    // derivation the reader's marks use — before anything is committed.
    const last = dragHexes[dragHexes.length - 1] as string;
    expect(input.value.toLowerCase()).toBe(last);
    const preview = slotPreview(1);
    const draftTint = customHighlightTint(last, highlightBases(DEFAULT_SETTINGS));
    expect(preview.getAttribute("style")).toContain(`--highlight-custom: ${draftTint}`);

    // Settle: exactly ONE update carrying the final hex.
    await act(async () => {
      vi.advanceTimersByTime(COLOR_SETTLE_MS);
    });
    expect(log.length).toBe(baseline + 2);
    expect(log[log.length - 1]).toBe(last);
    // The preview still paints the same tint (now from the committed value).
    expect(preview.getAttribute("style")).toContain(`--highlight-custom: ${draftTint}`);
  });

  it("a slow drag never commits mid-drag — the settle window resets per event", async () => {
    const { log, baseline } = await mountEditorWithProbe();
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;

    // Drag ticks spaced just under the settle window: a fixed-once timer
    // would have committed at the first window edge; the reset-per-event
    // window keeps the storm away for the WHOLE drag.
    const ticks = ["#100000", "#200000", "#300000"];
    for (const hex of ticks) {
      await act(async () => {
        vi.advanceTimersByTime(COLOR_SETTLE_MS - 10);
      });
      fireEvent.input(input, { target: { value: hex } });
      expect(log.length).toBe(baseline + 1); // still only the Custom activation
    }
    await act(async () => {
      vi.advanceTimersByTime(COLOR_SETTLE_MS);
    });
    expect(log.length).toBe(baseline + 2);
    expect(log[log.length - 1]).toBe(ticks[ticks.length - 1]);
  });

  it("a named pick inside the settle window cancels the pending draft — no custom resurrection", async () => {
    const { log, baseline } = await mountEditorWithProbe();
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;
    dragColorInput(input, ["#1234ab"]);
    // The reader abandons Custom before the settle fires.
    fireEvent.click(slotColorRadio(1, "green"));
    await act(async () => {
      vi.advanceTimersByTime(COLOR_SETTLE_MS * 2);
    });
    // The named pick is the LAST intent: customColor never re-lands.
    expect(log.length).toBe(baseline + 2); // Custom seed + named clear
    expect(log[log.length - 1]).toBeUndefined();
    expect(slotColorRadio(1, "custom").checked).toBe(false);
    expect(slotColorRadio(1, "green").checked).toBe(true);
  });

  it("unmounting the editor inside the settle window flushes the pending draft (the pick is never dropped)", async () => {
    const { log, baseline, rerender } = await mountEditorWithProbe();
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;
    dragColorInput(input, ["#1234ab"]);
    // The panel unmounts (route change / teardown) before the window ends.
    rerender(false);
    expect(log.length).toBe(baseline + 2);
    expect(log[log.length - 1]).toBe("#1234ab");
  });
  it.each(["pagehide", "visibilitychange"])(
    "%s persists the pending draft before the provider flush, without waiting for timers",
    async (eventName) => {
      const save = vi.spyOn(settingsStore, "saveSettings").mockResolvedValue(undefined);
      const { log, baseline } = await mountEditorWithProbe();
      const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;
      dragColorInput(input, ["#1234ab"]);
      expect(log.length).toBe(baseline);

      if (eventName === "visibilitychange") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      }
      act(() => {
        (eventName === "pagehide" ? window : document).dispatchEvent(new Event(eventName));
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0]?.[0].highlightSlots[1]?.customColor).toBe("#1234ab");
      expect(log.length).toBe(baseline + 1);

      // A second lifecycle signal and the old timer must not duplicate the commit/save.
      act(() => {
        window.dispatchEvent(new Event("pagehide"));
        vi.advanceTimersByTime(COLOR_SETTLE_MS + 400);
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(log.length).toBe(baseline + 1);
    },
  );
});
