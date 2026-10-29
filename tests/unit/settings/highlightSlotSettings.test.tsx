// tests/unit/settings/highlightSlotSettings.test.tsx
// Issue #196 — the slot editor's custom color choice. The unit layer pins the
// editor's observable behavior (the e2e layer owns layout + zoom truth):
//
//   1. The five named radios + the Custom radio form ONE color-source group:
//      activating Custom writes a customColor snapshot; activating a named
//      choice clears it entirely (never an undefined-valued residue).
//   2. The native color input commits per change (the TagEntry discipline —
//      the debounced settings write coalesces).
//   3. The LIVE preview renders the literal mark anatomy (the shared
//      color-custom class + tint style) with the tint derived by the ONE
//      readableHighlightTint seam against the ACTIVE theme's bases — preview
//      = render by construction.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SettingsProvider } from "../../../src/settings/SettingsContext";
import { HighlightSlotSettings } from "../../../src/reader/HighlightSlotSettings";
import { highlightBases, customHighlightTint } from "../../../src/settings/highlightTint";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

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

  it("changing the native color input commits the new hex per change (the picker owns the value)", () => {
    mountEditor();
    fireEvent.click(slotColorRadio(1, "custom"));
    const input = screen.getByLabelText("Slot 2 custom color") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "#1234ab" } });
    expect(input.value.toLowerCase()).toBe("#1234ab");
    // The preview follows the committed value through the SAME derivation.
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
