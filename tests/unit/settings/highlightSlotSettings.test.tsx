// tests/unit/settings/highlightSlotSettings.test.tsx
// Issue #196 — the slot editor's custom color choice; issue #219 — the
// picker drag commits on settle; issue #222 — the settings ACCORDION and
// the slots' DORMANT custom hex. The unit layer pins the editor's
// observable behavior (the e2e layer owns layout + zoom truth):
//
//   1. The slot list is a collapsed accordion: one row per slot (number +
//      swatch + name + the default badge), ONE editor expanded at a time.
//   2. The named radios + the Custom radio form ONE color-source group, and
//      the native color input renders ONLY while Custom is that slot's
//      active source (the always-visible input confused — #222).
//   3. The hex is a DORMANT memory (ADR 0008, amended): a named pick keeps
//      the stored hex (customColorActive: false) instead of destroying it;
//      the Custom pill REACTIVATES the remembered hex — the seed applies
//      only on first-ever activation.
//   4. The native color input keeps its LOCAL DRAFT while the reader drags
//      (issue #219 — the input-event render storm): the draft drives the
//      live preview locally; the commit happens ONCE on settle (a ~300ms
//      quiet window, NOT the native `change` event). A named pick inside
//      the settle window cancels the pending draft.
//   5. The LIVE preview renders the literal mark anatomy (the shared
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

/** Expand one slot's editor through its collapsed row (the accordion). */
function expandSlot(index: number): void {
  const row = screen
    .getAllByRole("button")
    .find(
      (b) =>
        b.getAttribute("aria-expanded") !== null &&
        b.getAttribute("aria-label")?.startsWith(`Slot ${index + 1}: `),
    );
  expect(row, `slot ${index + 1} row toggle`).toBeDefined();
  fireEvent.click(row as HTMLElement);
}

function defaultSlotName(index: number): string {
  return DEFAULT_SETTINGS.highlightSlots[index]?.name ?? "";
}

function slotGroup(index: number): HTMLElement {
  const groups = screen
    .getAllByRole("group")
    .filter((g) => g.getAttribute("aria-label") === `Slot ${index + 1}`);
  expect(groups, `slot ${index + 1} editor group`).toHaveLength(1);
  return groups[0] as HTMLElement;
}

function slotColorRadio(index: number, label: string): HTMLInputElement {
  // The expanded editor scopes its radios with name="slot-color-<i>" —
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

/** The slot's live preview mark (scoped to ITS editor — one mounts). */
function slotPreview(index: number): HTMLElement {
  return within(slotGroup(index)).getByText("How a highlight reads") as unknown as HTMLElement;
}

function customColorInput(index: number): HTMLInputElement {
  return screen.getByLabelText(`Slot ${index + 1} custom color`) as HTMLInputElement;
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

describe("HighlightSlotSettings — the settings accordion (issue #222)", () => {
  it("five collapsed rows: number, swatch, name, and the default badge on slot 1 only — no editor fields", () => {
    mountEditor();
    const toggles = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    expect(toggles).toHaveLength(5);
    for (const [i, toggle] of toggles.entries()) {
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      // The row paints the slot anatomy: swatch + number + name.
      expect(toggle.querySelector(".highlight-color-swatch")).not.toBeNull();
      expect(toggle.textContent).toContain(String(i + 1));
      expect(toggle.textContent).toContain(defaultSlotName(i));
    }
    // The default badge marks exactly the default slot's row.
    expect(toggles[0]?.textContent).toContain("Default");
    expect(toggles[1]?.textContent).not.toContain("Default");
    // Collapsed means collapsed: no editor fields anywhere. The row's own
    // sample mark preview is the ONE thing the collapsed list keeps
    // (issue #222 repair — the five .highlight-slot-preview marks exist
    // while the accordion is closed; the editor's LIVE preview mounts
    // only with its editor and replaces the row's while open).
    expect(screen.queryByLabelText("Slot 1 name")).toBeNull();
    expect(screen.queryByLabelText("Slot 1 custom color")).toBeNull();
    expect(screen.getAllByText("How a highlight reads")).toHaveLength(5);
  });

  it("expanding a row reveals its editor; expanding another collapses the first (ONE at a time)", () => {
    mountEditor();
    expandSlot(1);
    expect(screen.getByLabelText("Slot 2 name")).toBeDefined();
    expect(screen.queryByLabelText("Slot 1 name")).toBeNull();
    const second = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-label") === `Slot 2: ${defaultSlotName(1)}`);
    expect(second?.getAttribute("aria-expanded")).toBe("true");

    expandSlot(2);
    expect(screen.getByLabelText("Slot 3 name")).toBeDefined();
    expect(screen.queryByLabelText("Slot 2 name")).toBeNull();
  });

  it("collapsing again (the same row) hides the editor", () => {
    mountEditor();
    expandSlot(0);
    expect(screen.getByLabelText("Slot 1 name")).toBeDefined();
    expandSlot(0);
    expect(screen.queryByLabelText("Slot 1 name")).toBeNull();
  });
});

describe("HighlightSlotSettings — the dormant custom hex (issue #222)", () => {
  it("the native color input renders ONLY while Custom is the slot's active source", () => {
    mountEditor();
    expandSlot(1);
    // Shipped slot 2 is the named Yellow: no color input at all.
    expect(screen.queryByLabelText("Slot 2 custom color")).toBeNull();
    // Activating Custom mounts the input (with the seed — first-ever use).
    fireEvent.click(slotColorRadio(1, "custom"));
    expect(customColorInput(1).value.toLowerCase()).toBe("#e9c46a");
    // A named pick unmounts it again.
    fireEvent.click(slotColorRadio(1, "green"));
    expect(screen.queryByLabelText("Slot 2 custom color")).toBeNull();
  });

  it("a named pick keeps the remembered hex DORMANT; Custom reactivates it — the seed only on first-ever activation", async () => {
    mountEditor();
    expandSlot(1);
    // First-ever activation seeds.
    fireEvent.click(slotColorRadio(1, "custom"));
    expect(customColorInput(1).value.toLowerCase()).toBe("#e9c46a");
    // The reader picks a real hex — and lets it SETTLE (issue #219: an
    // un-settled draft would be cancelled by the later named intent).
    fireEvent.input(customColorInput(1), { target: { value: "#1234ab" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, COLOR_SETTLE_MS + 20));
    });
    // …then returns to a named fill — the hex STAYS (dormant), not destroyed.
    fireEvent.click(slotColorRadio(1, "green"));
    expect(slotColorRadio(1, "green").checked).toBe(true);
    // Re-choosing Custom reactivates the REMEMBERED hex — not the seed.
    fireEvent.click(slotColorRadio(1, "custom"));
    expect(customColorInput(1).value.toLowerCase()).toBe("#1234ab");
  });

  it("the preview mark paints the ACTIVE source: the named fill while dormant, the derived tint while active", () => {
    mountEditor();
    expandSlot(1);
    fireEvent.click(slotColorRadio(1, "custom"));
    fireEvent.input(customColorInput(1), { target: { value: "#1234ab" } });
    // Active: the literal custom anatomy with the derived tint.
    let preview = slotPreview(1);
    expect(preview.classList.contains("color-custom")).toBe(true);
    const expected = customHighlightTint("#1234ab", highlightBases(DEFAULT_SETTINGS));
    expect(preview.getAttribute("style")).toContain(`--highlight-custom: ${expected}`);
    // Dormant: the named fill owns the paint again — no custom anatomy.
    fireEvent.click(slotColorRadio(1, "green"));
    preview = slotPreview(1);
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
    expandSlot(1);
    fireEvent.click(slotColorRadio(1, "custom"));
    // The Custom activation itself is one settings update (the snapshot
    // seed) — the drag assertions below baseline OFF that commit.
    const input = customColorInput(1);
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
    expandSlot(1);
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = customColorInput(1);

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

  it("a named pick inside the settle window cancels the pending draft — the abandoned draft never lands (the remembered hex stays)", async () => {
    const { log, baseline } = await mountEditorWithProbe();
    expandSlot(1);
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = customColorInput(1);
    dragColorInput(input, ["#1234ab"]);
    // The reader abandons Custom before the settle fires.
    fireEvent.click(slotColorRadio(1, "green"));
    await act(async () => {
      vi.advanceTimersByTime(COLOR_SETTLE_MS * 2);
    });
    // The named pick is the LAST intent: the abandoned draft never lands.
    // Issue #222 — the SEED hex stays remembered (dormant); only the draft
    // is gone.
    expect(log.length).toBe(baseline + 2); // Custom seed + named (dormancy) pick
    expect(log[log.length - 1]).toBe("#e9c46a");
    expect(slotColorRadio(1, "custom").checked).toBe(false);
    expect(slotColorRadio(1, "green").checked).toBe(true);
    // Re-choosing Custom reactivates the remembered SEED — never the draft.
    fireEvent.click(slotColorRadio(1, "custom"));
    expect(customColorInput(1).value.toLowerCase()).toBe("#e9c46a");
  });

  it("unmounting the editor inside the settle window flushes the pending draft (the pick is never dropped)", async () => {
    const { log, baseline, rerender } = await mountEditorWithProbe();
    expandSlot(1);
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = customColorInput(1);
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
      expandSlot(1);
      fireEvent.click(slotColorRadio(1, "custom"));
      const input = customColorInput(1);
      dragColorInput(input, ["#1234ab"]);
      expect(log.length).toBe(baseline + 1); // the Custom activation only

      if (eventName === "visibilitychange") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      }
      act(() => {
        (eventName === "pagehide" ? window : document).dispatchEvent(new Event(eventName));
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0]?.[0].highlightSlots[1]?.customColor).toBe("#1234ab");
      expect(log.length).toBe(baseline + 2);

      // A second lifecycle signal and the old timer must not duplicate the commit/save.
      act(() => {
        window.dispatchEvent(new Event("pagehide"));
        vi.advanceTimersByTime(COLOR_SETTLE_MS + 400);
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(log.length).toBe(baseline + 2);
    },
  );
});
