// tests/component/SettingsContext.test.tsx
// Component tests for the live-apply SettingsContext (D2-03). Asserts that
// rendering SettingsProvider + a consumer, then calling update({...}), causes
// documentElement.dataset.theme + --font-body + font-size to update — these
// are DOM writes, NOT layout, so jsdom is authoritative here (Pitfall 2 only
// excludes <dialog> focus-trap/inert, scroll, and zoom — not setProperty).
// Also asserts reset() restores the DEFAULT_SETTINGS values on the DOM.
import { describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { SettingsProvider, useSettings } from "../../src/settings/SettingsContext";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

// A tiny consumer that exposes the context value via a ref side-effect so the
// test can drive update/reset from outside the React render cycle.
let latest:
  | {
      settings: ReturnType<typeof useSettings>["settings"];
      update: ReturnType<typeof useSettings>["update"];
      reset: ReturnType<typeof useSettings>["reset"];
      storageState: ReturnType<typeof useSettings>["storageState"];
    }
  | null = null;

function Probe() {
  const ctx = useSettings();
  latest = ctx;
  return null;
}

// Helper: read the live token value the provider wrote to documentElement.
function readTokens() {
  const root = document.documentElement;
  return {
    theme: root.dataset.theme,
    fontBody: root.style.getPropertyValue("--font-body"),
    fontSize: root.style.getPropertyValue("font-size"),
    measure: root.style.getPropertyValue("--measure"),
  };
}

describe("SettingsContext (D2-03 live-apply)", () => {
  it("applies the D-07 default tokens to <html> on mount", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    const tokens = readTokens();
    expect(tokens.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(tokens.fontBody).toContain("Iowan Old Style"); // serif stack
    expect(tokens.fontSize).toBe(`${DEFAULT_SETTINGS.size}px`);
    expect(tokens.measure).toBe(`${DEFAULT_SETTINGS.measure}ch`);
    expect(latest?.storageState).toBe("ok");
  });

  it("update({font:'sans'}) swaps --font-body live (single token swap, no Save step)", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    expect(readTokens().fontBody).toContain("Iowan Old Style");

    act(() => latest?.update({ font: "sans" }));

    expect(latest?.settings.font).toBe("sans");
    expect(readTokens().fontBody).toContain("system-ui");
    expect(readTokens().fontBody).not.toContain("Iowan Old Style");
  });

  it("update({theme:'dark'}) writes data-theme='dark' on <html>", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    expect(readTokens().theme).toBe("sepia");

    act(() => latest?.update({ theme: "dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(latest?.settings.theme).toBe("dark");
  });

  it("update({size, measure, spacing}) writes every typography token live", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() =>
      latest?.update({ size: 24, measure: 72, spacing: "spacious" }),
    );
    const tokens = readTokens();
    expect(tokens.fontSize).toBe("24px");
    expect(tokens.measure).toBe("72ch");
    expect(document.documentElement.style.getPropertyValue("line-height")).toBe(
      "1.8",
    );
    expect(
      document.documentElement.style.getPropertyValue("--word-spacing"),
    ).toBe("0.05em");
  });

  it("reset() restores the D-07 baseline (D2-04)", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => latest?.update({ font: "sans", theme: "dark", size: 24 }));
    act(() => latest?.reset());
    expect(latest?.settings).toEqual(DEFAULT_SETTINGS);
    const tokens = readTokens();
    expect(tokens.theme).toBe("sepia");
    expect(tokens.fontSize).toBe("18px");
    expect(tokens.measure).toBe("64ch");
    expect(tokens.fontBody).toContain("Iowan Old Style");
  });

  it("update merges a patch (does NOT replace the whole record)", () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => latest?.update({ font: "sans" })); // partial patch
    expect(latest?.settings).toEqual({
      ...DEFAULT_SETTINGS,
      font: "sans",
    });
    // Untouched knobs are preserved.
    expect(latest?.settings.size).toBe(DEFAULT_SETTINGS.size);
    expect(latest?.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("useSettings throws a clear error outside <SettingsProvider>", () => {
    // Suppress the expected console.error noise from React's error boundary.
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    function Orphan() {
      useSettings();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      /useSettings must be used inside <SettingsProvider>/,
    );
    spy.mockRestore();
  });
});
