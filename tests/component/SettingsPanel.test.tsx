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
import { render, screen, fireEvent, act } from "@testing-library/react";

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

describe("SettingsPanel — structure + aria (D2-01)", () => {
  it("renders a native <dialog> with aria-labelledby='settings-title'", () => {
    render(<Harness open={true} onClose={() => undefined} />);
    const dlg = document.querySelector("dialog.settings-panel");
    expect(dlg).not.toBeNull();
    expect(dlg?.getAttribute("aria-labelledby")).toBe("settings-title");
    // The labelledby target exists and carries the verbatim title.
    const title = document.getElementById("settings-title");
    expect(title?.tagName).toBe("H2");
    expect(title?.textContent).toBe("Reading settings");
  });

  it("renders the five fieldset/legend sections with verbatim copy (UI-SPEC §Copywriting)", () => {
    render(<Harness open={true} onClose={() => undefined} />);
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
    render(<Harness open={true} onClose={() => undefined} />);
    // RTL can query radios by role + name (the <span> text inside the label).
    for (const name of ["Serif", "Sans", "Dyslexia-friendly"]) {
      expect(screen.getByRole("radio", { name })).not.toBeNull();
    }
    for (const name of ["Compact", "Comfortable", "Spacious"]) {
      expect(screen.getByRole("radio", { name })).not.toBeNull();
    }
    for (const name of ["Sepia", "Light", "Dark"]) {
      expect(screen.getByRole("radio", { name })).not.toBeNull();
    }
  });

  it("renders the size and reading-width ranges with the default readouts", () => {
    render(<Harness open={true} onClose={() => undefined} />);
    const size = screen.getByRole("slider", { name: /Text size/i });
    const measure = screen.getByRole("slider", { name: /Reading width/i });
    expect(size.getAttribute("aria-valuenow")).toBe(String(DEFAULT_SETTINGS.size));
    expect(measure.getAttribute("aria-valuenow")).toBe(
      String(DEFAULT_SETTINGS.measure),
    );
    // Visible numeric readouts (UI-SPEC §Interaction 9 — survive forced-colors).
    expect(screen.getByText(`${DEFAULT_SETTINGS.size} px`)).not.toBeNull();
    expect(screen.getByText(`${DEFAULT_SETTINGS.measure} ch`)).not.toBeNull();
  });

  it("the close × carries aria-label='Close reading settings' and the Reset button reads 'Reset to defaults'", () => {
    render(<Harness open={true} onClose={() => undefined} />);
    expect(
      screen.getByRole("button", { name: "Close reading settings" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reset to defaults" }),
    ).not.toBeNull();
  });
});

describe("SettingsPanel — open/close state", () => {
  it("calls showModal() when open flips false→true and close() when it flips back", () => {
    const { rerender } = render(<Harness open={false} onClose={() => undefined} />);
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
    render(<Harness open={true} onClose={onClose} />);
    const dlg = document.querySelector("dialog.settings-panel") as HTMLDialogElement;
    // Simulate the browser firing `close` (Esc / scrim click / × click).
    dlg.dispatchEvent(new Event("close"));
    expect(onClose).toHaveBeenCalled();
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

// Verify the SettingsContext integration — a radio change rewrites the token.
// (Live-apply logic lives in SettingsContext; this asserts the wiring.)
describe("SettingsPanel — live-apply wiring (D2-03)", () => {
  it("selecting the 'Dark' radio writes data-theme='dark' on <html>", () => {
    render(<Harness open={true} onClose={() => undefined} />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    act(() => {
      fireEvent.click(dark);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("clicking Reset to defaults restores the D-07 baseline tokens", () => {
    render(<Harness open={true} onClose={() => undefined} />);
    // Perturb state first.
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    });
    expect(document.documentElement.dataset.theme).toBe("sepia");
    expect(document.documentElement.style.getPropertyValue("font-size")).toBe(
      "18px",
    );
  });
});
