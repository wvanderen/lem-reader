// tests/component/SettingsPanel.test.tsx
// Component tests for the SettingsPanel dialog (D2-01). Per Pitfall 2, jsdom
// is NOT authoritative for the <dialog> focus-trap, inert backdrop, or
// focus-restore BEHAVIOR — those are proven by tests/e2e/panel-keyboard.spec.ts
// across Chromium/Firefox/WebKit. Here we assert only application-level
// concerns: open/close state flips, the aria-labelledby contract, the five
// fieldset/legend sections are present with verbatim copy, and the focus-
// restore CALL SITE exists (triggerRef.current?.focus() — Pitfall 1).
//
// Mirrors tests/component/ArticleView.test.tsx conventions: vi.mock hoisting,
// RTL role/label queries, beforeEach mockReset.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { contrastRatio } from "../../src/settings/customTheme";

// jsdom 25 implements the HTMLDialogElement interface but NOT showModal/close
// behavior (Pitfall 2). We stub the two methods at the prototype level so the
// SettingsPanel effect can exercise its real code paths (the call sites are
// the load-bearing assertions here). The focus-restore behavior itself is
// proven by tests/e2e/panel-keyboard.spec.ts.
beforeEach(() => {
  // Reset documentElement between tests so token writes do not bleed across.
  document.documentElement.className = "";
  document.documentElement.style.cssText = "";
  delete document.documentElement.dataset.theme;

  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

import { SettingsProvider } from "../../src/settings/SettingsContext";
import { SettingsPanel } from "../../src/reader/SettingsPanel";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SettingsProvider>
      <SettingsPanel open={open} onClose={onClose} />
    </SettingsProvider>
  );
}

function renderExpanded(ui: React.ReactElement) {
  const view = render(ui);
  for (const summary of view.container.querySelectorAll(".settings-group > summary")) {
    if (!(summary.parentElement as HTMLDetailsElement).open) fireEvent.click(summary);
  }
  return view;
}

describe("SettingsPanel — structure + aria (D2-01)", () => {
  it("renders a native <dialog> with aria-labelledby='settings-title'", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const dlg = document.querySelector("dialog.settings-panel");
    expect(dlg).not.toBeNull();
    expect(dlg?.getAttribute("aria-labelledby")).toBe("settings-title");
    // The labelledby target exists and carries the verbatim title.
    const title = document.getElementById("settings-title");
    expect(title?.tagName).toBe("H2");
    expect(title?.textContent).toBe("Reading settings");
  });

  it("renders the five fieldset/legend sections with verbatim copy (UI-SPEC §Copywriting)", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const legends = Array.from(document.querySelectorAll("legend")).map(
      (el) => el.textContent?.trim() ?? "",
    );
    // Each legend's text starts with the verbatim section name (size/measure
    // legends include the visible numeric readout).
    expect(legends.some((l) => l.startsWith("Typeface"))).toBe(true);
    expect(legends.some((l) => l.startsWith("Text size"))).toBe(true);
    expect(legends.some((l) => l.startsWith("Reading width"))).toBe(true);
    expect(legends.some((l) => l.startsWith("Spacing"))).toBe(true);
    expect(legends.some((l) => l.startsWith("Theme"))).toBe(true);
  });

  it("renders every Typeface/Spacing/Theme radio option verbatim", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    // RTL can query radios by role + name (the <span> text inside the label).
    for (const name of ["Serif", "Sans", "Dyslexia-friendly"]) {
      expect(screen.getByRole("radio", { name })).not.toBeNull();
    }
    for (const name of ["Compact", "Comfortable", "Spacious"]) {
      expect(screen.getByRole("radio", { name })).not.toBeNull();
    }
    // Issue #120 — the theme group carries the three presets PLUS the two
    // independently saved custom slots (no single "Custom" radio anymore).
    for (const name of ["Daylight", "Warm paper", "Night", "Custom light", "Custom dark"]) {
      expect(screen.getByRole("radio", { name })).not.toBeNull();
    }
    expect(screen.queryByRole("radio", { name: "Custom" })).toBeNull();
  });

  it("renders the size and reading-width ranges with the default readouts", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const size = screen.getByRole("slider", { name: /Text size/i });
    const measure = screen.getByRole("slider", { name: /Reading width/i });
    expect(size.getAttribute("aria-valuenow")).toBe(String(DEFAULT_SETTINGS.size));
    expect(measure.getAttribute("aria-valuenow")).toBe(String(DEFAULT_SETTINGS.measure));
    // Visible numeric readouts (UI-SPEC §Interaction 9 — survive forced-colors).
    expect(screen.getByText(`${DEFAULT_SETTINGS.size} px`)).not.toBeNull();
    expect(screen.getByText(`${DEFAULT_SETTINGS.measure} ch`)).not.toBeNull();
  });

  it("the close × carries aria-label='Close reading settings' and the Reset button reads 'Reset to defaults'", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "Close reading settings" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reset to defaults" })).not.toBeNull();
  });
});

// ── Issue #164 — pairing is presentation ────────────────────────────────────
// Complementary light/dark themes share one visual container (.theme-pair);
// unpaired themes remain standalone rows. Pairing never splits the native
// radio group, and no theme gains a variant to complete a pair.
describe("SettingsPanel — theme shelf pairing (#164)", () => {
  it("complementary themes share a .theme-pair container; unpaired themes stand alone", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const pairs = Array.from(document.querySelectorAll(".theme-pair"));
    const expectedPairs = [
      ["Daylight", "Night"],
      ["In Defense of Marxism", "In Defense of Marxism (Night)"],
      ["Custom light", "Custom dark"],
    ];
    expect(pairs).toHaveLength(expectedPairs.length);
    const namesIn = (el: Element) =>
      Array.from(el.querySelectorAll('input[name="theme"]')).map(
        (i) => i.closest("label")?.textContent ?? "",
      );
    expectedPairs.forEach((names, i) => {
      expect(namesIn(pairs[i]!)).toEqual(names);
    });
    // The unpaired themes never ride inside a pair container.
    for (const name of ["Warm paper", "Trans pride", "Bi pride"]) {
      const radio = screen.getByRole("radio", { name });
      expect(radio.closest(".theme-pair")).toBeNull();
    }
    // The nine radios remain ONE native group (arrow-key walk intact).
    expect(document.querySelectorAll('input[name="theme"]')).toHaveLength(9);
  });
});

describe("SettingsPanel — open/close state", () => {
  it("calls showModal() when open flips false→true and close() when it flips back", () => {
    const { rerender } = renderExpanded(<Harness open={false} onClose={() => undefined} />);
    const dlg = document.querySelector("dialog.settings-panel") as HTMLDialogElement;
    expect(dlg.open).toBe(false);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();

    rerender(<Harness open={true} onClose={() => undefined} />);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(dlg.open).toBe(true);

    rerender(<Harness open={false} onClose={() => undefined} />);
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    expect(dlg.open).toBe(false);
  });

  it("fires onClose when the dialog 'close' event dispatches (Esc/scrim)", () => {
    const onClose = vi.fn();
    renderExpanded(<Harness open={true} onClose={onClose} />);
    const dlg = document.querySelector("dialog.settings-panel") as HTMLDialogElement;
    // Simulate the browser firing `close` (Esc / scrim click / × click).
    dlg.dispatchEvent(new Event("close"));
    expect(onClose).toHaveBeenCalled();
  });
});

// Backdrop scrim dismissal (quick task 260908-o0w). jsdom cannot hit-test
// the ::backdrop (Pitfall 2 — real-browser proof lives in
// tests/e2e/scrim-dismiss.spec.ts), so the listener logic is exercised
// directly: a scrim click is a native click dispatched on the dialog
// element itself (the listener sees target === dialog), and the negative
// case is the same bubbling click dispatched on the .settings-panel-inner
// wrapper (target = a descendant — visible-content clicks never dismiss).
describe("SettingsPanel — backdrop scrim dismissal (260908-o0w)", () => {
  it("a click whose target is the dialog element itself calls onClose", () => {
    const onClose = vi.fn();
    renderExpanded(<Harness open={true} onClose={onClose} />);
    const dlg = screen.getByRole("dialog", {
      name: "Reading settings",
    }) as HTMLDialogElement;
    dlg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a bubbling click on the .settings-panel-inner wrapper does NOT call onClose", () => {
    const onClose = vi.fn();
    renderExpanded(<Harness open={true} onClose={onClose} />);
    const dlg = screen.getByRole("dialog", {
      name: "Reading settings",
    }) as HTMLDialogElement;
    const inner = dlg.querySelector(".settings-panel-inner");
    expect(inner).not.toBeNull();
    inner!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// Source-level invariant (Pitfall 1 / A11Y-02): the focus-restore CALL SITE
// must exist. jsdom cannot replicate the actual focus-restore behavior
// (Pitfall 2 — that is a Playwright assertion), but the call site presence is
// the load-bearing guard. This test fails if a future refactor drops the line.
//
// Vite's ?raw import (works in vitest) sidesteps @types/node — we read the
// module source as a string at import time.
import settingsPanelSource from "../../src/reader/SettingsPanel.tsx?raw";

describe("SettingsPanel — focus-restore call site (Pitfall 1)", () => {
  it("contains `triggerRef.current?.focus()` in the close listener", () => {
    expect(settingsPanelSource).toContain("triggerRef.current?.focus()");
    // Sanity: there is also a showModal call (the trap-enabler).
    expect(settingsPanelSource).toContain(".showModal()");
  });
});

// ── Issues #86/#120 — the TWO custom slots + builder ─────────────────────────
// jsdom is NOT authoritative for color rendering; these tests pin the
// APPLICATION wiring only: per-slot seeding/resume semantics, slot
// independence, the inline token writes applyTheme performs (string-level),
// the hex commit/draft contract, the contrast guardrail affordances, and the
// two reset semantics. The real browser proof (labels, focus, visibility,
// computed colors) lives in tests/e2e/chrome/custom-theme.spec.ts across the
// three engines.
describe("SettingsPanel — custom theme builder (issues #86/#120)", () => {
  const inlineToken = (prop: string) => document.documentElement.style.getPropertyValue(prop);

  function builderIn(doc: ParentNode): Element | null {
    return doc.querySelector("details.custom-theme-builder");
  }

  it("activating Custom light seeds from its MATCHING preset and mounts the builder", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    expect(document.documentElement.dataset.theme).toBe("custom-light");
    // Seeded from the LIGHT preset (issue #120: a slot seeds from its
    // matching preset, not the previously active theme) — the 5 stored
    // tokens land inline (decision #73: the inline writes ARE the theme).
    expect(inlineToken("--surface")).toBe("#f7f7f5");
    expect(inlineToken("--ink")).toBe("#1c1f1d");
    expect(inlineToken("--accent")).toBe("#22604a");
    // Derived tokens resolve too (the 15-prop palette).
    expect(inlineToken("--highlight")).toMatch(/^#[0-9a-f]{6}$/);
    // Issue #101 — the builder is a lazy chunk now; await its disclosure
    // (the seeding + inline writes above stay synchronous assertions).
    expect(await screen.findByText("Customize colors")).not.toBeNull();
    // The disclosure affordance + the five labeled rows.
    for (const label of ["Surface", "Raised surface", "Text", "Accent", "Hairline"]) {
      expect(await screen.findByText(label)).not.toBeNull();
    }
  });

  it("activating Custom dark seeds from its MATCHING preset (the slots never share a record)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom dark" }));
    });
    expect(document.documentElement.dataset.theme).toBe("custom-dark");
    expect(inlineToken("--surface")).toBe("#141a17");
    expect(inlineToken("--ink")).toBe("#e6e9e4");
    expect(inlineToken("--accent")).toBe("#7cc7a1");
    expect(await screen.findByText("Customize colors")).not.toBeNull();
  });

  it("every color picker and hex field carries an accessible name", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    for (const label of ["Surface", "Raised surface", "Text", "Accent", "Hairline"]) {
      expect(await screen.findByLabelText(`${label} color`)).not.toBeNull();
      expect(await screen.findByLabelText(`${label} hex value`)).not.toBeNull();
    }
  });

  // Issue #146/#164 — the chrome rows group under one plainly named fieldset
  // so the five-row calm holds; every row keeps the A11Y-05 rule (a visible
  // text label, never the swatch color alone). The legend carries no room
  // terminology (#164).
  it("groups the four chrome rows under a 'Frame' fieldset (#146, #164)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    await screen.findByText("Customize colors");
    const group = document.querySelector("fieldset.custom-theme-group");
    expect(group).not.toBeNull();
    expect(group?.querySelector("legend")?.textContent).toBe("Frame");
    for (const label of ["Band", "Band text", "Lit board", "Brass"]) {
      expect(await screen.findByLabelText(`${label} color`)).not.toBeNull();
      expect(await screen.findByLabelText(`${label} hex value`)).not.toBeNull();
    }
  });

  // Issue #164 — the editing UI stays visual: no numerical contrast
  // readouts, no room terminology, and silence while the colors are fine.
  it("shows no contrast numbers or room terminology, and stays silent while colors are fine (#164)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    await screen.findByText("Customize colors");
    const panel = document.querySelector("dialog.settings-panel");
    expect(panel?.textContent).not.toMatch(/room/i);
    expect(panel?.textContent).not.toMatch(/\d:\d/);
    // Healthy seed colors: no message and no correction affordance —
    // correction happens only when the reader asks for it.
    expect(screen.queryByText(/hard to read/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Improve readability" })).toBeNull();
  });

  it("an untouched chrome row shows its DERIVED value; editing stores it (#146 derive-until-edited)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    // The derived band (resolved from the light seeds, not the :root literal).
    const band = (await screen.findByLabelText("Band hex value")) as HTMLInputElement;
    expect(band.value).toMatch(/^#[0-9a-f]{6}$/);
    expect(band.value).not.toBe("#1d3128"); // derived, not the Daylight literal copied
    // Editing writes the token through — inline on <html>.
    act(() => {
      fireEvent.change(band, { target: { value: "#223344" } });
    });
    expect(inlineToken("--board")).toBe("#223344");
    expect(band.value).toBe("#223344");
  });

  it("a non-green accent repaints the band inline — never the preset enamel (#146)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    const before = inlineToken("--board");
    const accent = (await screen.findByLabelText("Accent hex value")) as HTMLInputElement;
    act(() => {
      fireEvent.change(accent, { target: { value: "#a12345" } });
    });
    expect(inlineToken("--accent")).toBe("#a12345");
    const after = inlineToken("--board");
    expect(after).toMatch(/^#[0-9a-f]{6}$/);
    expect(after).not.toBe(before); // the band followed the accent
    expect(after).not.toBe("#1d3128"); // ...and is not the preset enamel
  });

  it("warns when colors need attention and Improve readability moves only the metal (#164)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    const raised = await screen.findByLabelText("Raised surface hex value");
    const brass = await screen.findByLabelText("Brass hex value");
    // With the untouched seed colors no message shows (conditional messaging).
    expect(screen.queryByText(/hard to read/)).toBeNull();
    act(() => {
      fireEvent.change(raised, { target: { value: "#3a775f" } });
      fireEvent.change(brass, { target: { value: "#3a775f" } });
    });
    expect(await screen.findByText(/Some color combinations may be hard to read\./)).not.toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Improve readability" }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/hard to read/)).toBeNull();
    });
    // The reader's chosen raised surface rides untouched; only the metal
    // moved, and the pair clears the non-text floor again.
    expect(inlineToken("--surface-raised")).toBe("#3a775f");
    expect(inlineToken("--brass")).not.toBe("#3a775f");
    expect(contrastRatio(inlineToken("--brass"), inlineToken("--surface-raised"))).toBeGreaterThanOrEqual(3);
  });

  it("a hard-to-read band pair warns and Improve readability moves the band only (#146, #164)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    // Break EXACTLY the band pair: a near-white band under the derived
    // near-white band text.
    const band = (await screen.findByLabelText("Band hex value")) as HTMLInputElement;
    act(() => {
      fireEvent.change(band, { target: { value: "#f5f5f0" } });
    });
    expect(await screen.findByText(/hard to read/)).not.toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Improve readability" }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/hard to read/)).toBeNull();
    });
    // The band moved (offender); the band text stayed DERIVED (nothing was
    // invented); the other policed pairs ride untouched.
    const fixedBoard = inlineToken("--board");
    expect(fixedBoard).not.toBe("#f5f5f0");
    expect(contrastRatio(inlineToken("--board-text"), fixedBoard)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inlineToken("--brass"), inlineToken("--surface"))).toBeGreaterThanOrEqual(
      3,
    );
    expect(inlineToken("--surface")).toBe("#f7f7f5");
    expect(inlineToken("--accent")).toBe("#22604a");
  });

  it("a valid hex commit applies the token inline and snaps the field", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    const hex = (await screen.findByLabelText("Text hex value")) as HTMLInputElement;
    act(() => {
      fireEvent.change(hex, { target: { value: "#123456" } });
    });
    expect(inlineToken("--ink")).toBe("#123456");
    expect(hex.value).toBe("#123456");
  });

  it("an invalid (incomplete) hex leaves the stored token unchanged and keeps the draft", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    const hex = (await screen.findByLabelText("Text hex value")) as HTMLInputElement;
    act(() => {
      fireEvent.change(hex, { target: { value: "#12" } });
    });
    expect(inlineToken("--ink")).toBe("#1c1f1d");
    expect(hex.value).toBe("#12");
  });

  it("switching to a preset and back RESUMES that slot's stored record", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    const hex = await screen.findByLabelText("Text hex value");
    act(() => {
      fireEvent.change(hex, { target: { value: "#123456" } });
    });
    // To a preset: data-theme flips, the inline palette is REMOVED (the CSS
    // block owns the preset again), the builder unmounts.
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Daylight" }));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(inlineToken("--ink")).toBe("");
    expect(builderIn(document)).toBeNull();
    // Back to Custom light: the STORED record resumes (edit intact) — not a
    // re-seed.
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    expect(document.documentElement.dataset.theme).toBe("custom-light");
    expect(inlineToken("--ink")).toBe("#123456");
    expect(inlineToken("--surface")).toBe("#f7f7f5");
  });

  it("the two slots are independent: edits in one never ride into the other", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    // Edit the light slot.
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    let hex = await screen.findByLabelText("Text hex value");
    act(() => {
      fireEvent.change(hex, { target: { value: "#123456" } });
    });
    // Switch to the dark slot: it seeds from the DARK preset (the light
    // slot's edit does not bleed in).
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom dark" }));
    });
    expect(document.documentElement.dataset.theme).toBe("custom-dark");
    expect(inlineToken("--ink")).toBe("#e6e9e4");
    expect(inlineToken("--surface")).toBe("#141a17");
    // Edit the dark slot too.
    hex = await screen.findByLabelText("Text hex value");
    act(() => {
      fireEvent.change(hex, { target: { value: "#654321" } });
    });
    expect(inlineToken("--ink")).toBe("#654321");
    // Back to the light slot: ITS edit resumes untouched.
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    expect(inlineToken("--ink")).toBe("#123456");
    expect(inlineToken("--surface")).toBe("#f7f7f5");
  });

  it("the builder warns when colors need attention and Improve readability restores the offending pair only (#164)", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    // Break EXACTLY ONE policed pair: ink = the surface color (text on
    // surface 1:1). The accent pair still clears AA on the untouched
    // surface — Improve readability must move the ink only.
    const hex = await screen.findByLabelText("Text hex value");
    act(() => {
      fireEvent.change(hex, { target: { value: "#f7f7f5" } });
    });
    expect(await screen.findByText(/hard to read/)).not.toBeNull();
    // Before any correction request: the reader's chosen colors are kept
    // exactly as set (#164 — correction is never automatic).
    expect(inlineToken("--ink")).toBe("#f7f7f5");
    expect(inlineToken("--surface")).toBe("#f7f7f5");
    expect(screen.getByRole("button", { name: "Improve readability" })).not.toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Improve readability" }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/hard to read/)).toBeNull();
    });
    // The offender moved; its pair now clears AA; the untouched tokens ride.
    expect(contrastRatio(inlineToken("--ink"), inlineToken("--surface"))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(inlineToken("--surface")).toBe("#f7f7f5");
    expect(inlineToken("--accent")).toBe("#22604a");
    expect(inlineToken("--hairline")).toBe("#d5d8d2");
  });

  it("Reset to base colors restores the slot's seed tokens while staying custom", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    const hex = await screen.findByLabelText("Text hex value");
    act(() => {
      fireEvent.change(hex, { target: { value: "#123456" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset to base colors" }));
    });
    expect(document.documentElement.dataset.theme).toBe("custom-light");
    expect(inlineToken("--ink")).toBe("#1c1f1d");
    expect(inlineToken("--surface")).toBe("#f7f7f5");
  });

  it("the panel-wide Reset drops BOTH slots; each re-activation re-seeds fresh", async () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    let hex = await screen.findByLabelText("Text hex value");
    act(() => {
      fireEvent.change(hex, { target: { value: "#123456" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom dark" }));
    });
    hex = await screen.findByLabelText("Text hex value");
    act(() => {
      fireEvent.change(hex, { target: { value: "#654321" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(builderIn(document)).toBeNull();
    // Re-activation seeds from the matching presets AGAIN (the edited
    // records were dropped — decision #73: wholesale Reset, re-seed on next
    // activation).
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom light" }));
    });
    expect(inlineToken("--ink")).toBe("#1c1f1d");
    expect(inlineToken("--surface")).toBe("#f7f7f5");
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom dark" }));
    });
    expect(inlineToken("--ink")).toBe("#e6e9e4");
    expect(inlineToken("--surface")).toBe("#141a17");
  });
});

// Verify the SettingsContext integration — a radio change rewrites the token.
// (Live-apply logic lives in SettingsContext; this asserts the wiring.)
describe("SettingsPanel — live-apply wiring (D2-03)", () => {
  it("selecting the 'Dark' radio writes data-theme='dark' on <html>", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const dark = screen.getByRole("radio", { name: "Night" });
    act(() => {
      fireEvent.click(dark);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("clicking Reset to defaults restores the D-07 baseline tokens", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    // Perturb state first.
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Night" }));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    // Per 02-04 gap 2, applyTheme now writes the --font-size custom property
    // (consumed by the body rule via var()) instead of the bare font-size
    // property the body rule overrode.
    expect(document.documentElement.style.getPropertyValue("--font-size")).toBe("18px");
  });
});

// ── Issue #43 (O8) — the read-aloud voice + rate controls ────────────────────

describe("SettingsPanel — read-aloud controls (issue #43, O8)", () => {
  function stubSpeech(voices: Array<Record<string, unknown>>): void {
    Object.defineProperty(window, "speechSynthesis", {
      value: { getVoices: () => voices },
      configurable: true,
      writable: true,
    });
  }

  it("without speechSynthesis the section degrades to a calm help line (no dead controls)", () => {
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    expect(screen.getByText("Read aloud isn't available in this browser.")).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Read-aloud voice" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "Read-aloud rate" })).toBeNull();
  });

  it("with speech: the probed FILTERED local-voice list renders (remote voices filtered)", async () => {
    stubSpeech([
      { voiceURI: "cloud", name: "Cloud Voice", lang: "en", localService: false },
      { voiceURI: "zora", name: "Zora", lang: "fr", localService: true },
    ]);
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const select = screen.getByRole("combobox", { name: "Read-aloud voice" });
    // The probed list arrived: the system default + the LOCAL voice only.
    await screen.findByRole("option", { name: "Zora (fr)" });
    const optionLabels = Array.from(select.querySelectorAll("option")).map(
      (o) => o.textContent ?? "",
    );
    expect(optionLabels).toContain("System default voice");
    expect(optionLabels).toContain("Zora (fr)");
    expect(optionLabels).not.toContain("Cloud Voice (en)");
  });

  it("the rate control spans 0.5–3 and applies a stepped change", async () => {
    stubSpeech([]);
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const rate = screen.getByRole("slider", { name: "Read-aloud rate" });
    expect(rate.getAttribute("min")).toBe("0.5");
    expect(rate.getAttribute("max")).toBe("3");
    expect(rate.getAttribute("step")).toBe("0.25");
    expect(rate.getAttribute("aria-valuenow")).toBe("1");
    fireEvent.change(rate, { target: { value: "1.5" } });
    // The value rides the live settings state (the debounced Dexie save is
    // the seam's own concern — the control's job is the state flip).
    await screen.findByText("1.5×");
    expect(rate.getAttribute("aria-valuenow")).toBe("1.5");
  });

  it("picking a voice updates the select's live value", async () => {
    stubSpeech([{ voiceURI: "zora", name: "Zora", lang: "fr", localService: true }]);
    renderExpanded(<Harness open={true} onClose={() => undefined} />);
    const select = await screen.findByRole("combobox", { name: "Read-aloud voice" });
    fireEvent.change(select, { target: { value: "zora" } });
    expect((select as HTMLSelectElement).value).toBe("zora");
  });
});

it("starts with Reading open and preserves independent disclosure choices while mounted", () => {
  const { rerender } = render(<Harness open={true} onClose={() => undefined} />);
  const reading = screen.getByText("Reading", { selector: "summary" })
    .parentElement as HTMLDetailsElement;
  const appearance = screen.getByText("Appearance", { selector: "summary" })
    .parentElement as HTMLDetailsElement;
  const data = screen.getByText("Your data", { selector: "summary" })
    .parentElement as HTMLDetailsElement;
  expect(reading.open).toBe(true);
  expect(appearance.open).toBe(false);
  expect(data.open).toBe(false);
  fireEvent.click(appearance.querySelector("summary")!);
  expect(appearance.open).toBe(true);
  expect(reading.open).toBe(true);
  rerender(<Harness open={false} onClose={() => undefined} />);
  rerender(<Harness open={true} onClose={() => undefined} />);
  expect(appearance.open).toBe(true);
  expect(data.open).toBe(false);
});
