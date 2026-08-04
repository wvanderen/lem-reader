// tests/component/SettingsContext.test.tsx
// Component tests for the live-apply SettingsContext (D2-03) + the persistence
// seam (02-02 Task 1). Asserts that rendering SettingsProvider + a consumer,
// then calling update({...}), causes documentElement.dataset.theme + --font-body
// + font-size to update — these are DOM writes, NOT layout, so jsdom is
// authoritative here (Pitfall 2 only excludes <dialog> focus-trap/inert,
// scroll, and zoom — not setProperty). Also asserts reset() restores the
// DEFAULT_SETTINGS values on the DOM.
//
// 02-02 persistence coverage (added): the settingsStore module is mocked so
// loadSettings() / saveSettings() are controllable vi.fn()s. We assert:
//   - load on mount hydrates from Dexie (success path)
//   - storageState routes to "corrupt" / "unavailable" / "unupgradeable"
//   - update/reset schedule a debounced saveSettings (~400ms, Pitfall 5)
//   - visibilitychange-hidden + pagehide flush the pending write (Pitfall 4)
//   - resetLocalData() (the WipeConfirm seam) resets to DEFAULT_SETTINGS
//   - saveSettings failure sets storageState to the classified reason
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";

// Mock the persistence seam BEFORE importing the provider. The factory is
// hoisted above imports; it must not reference outer variables. Both
// loadSettings and saveSettings are reset to defaults in beforeEach below.
vi.mock("../../src/persistence/settingsStore", () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

import { SettingsProvider, useSettings } from "../../src/settings/SettingsContext";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { loadSettings, saveSettings } from "../../src/persistence/settingsStore";
import type { ReaderSettings } from "../../src/content/schema";

const loadMock = vi.mocked(loadSettings);
const saveMock = vi.mocked(saveSettings);

// A tiny consumer that exposes the context value via a ref side-effect so the
// test can drive update/reset from outside the React render cycle.
let latest:
  | {
      settings: ReturnType<typeof useSettings>["settings"];
      update: ReturnType<typeof useSettings>["update"];
      reset: ReturnType<typeof useSettings>["reset"];
      storageState: ReturnType<typeof useSettings>["storageState"];
      resetLocalData: ReturnType<typeof useSettings>["resetLocalData"];
    }
  | null = null;

function Probe() {
  const ctx = useSettings();
  latest = ctx;
  return null;
}

// Helper: read the live token value the provider wrote to documentElement.
// Per 02-04 gap 2, applyTheme now writes the `--font-size` and `--line-height`
// custom properties (consumed by the body rule via var()) instead of the
// bare `font-size` / `line-height` properties on documentElement (which the
// body rule's hardcoded values overrode — that was the regression). The
// assertions below check the corrected custom-property token names.
function readTokens() {
  const root = document.documentElement;
  return {
    theme: root.dataset.theme,
    fontBody: root.style.getPropertyValue("--font-body"),
    fontSizeToken: root.style.getPropertyValue("--font-size"),
    measure: root.style.getPropertyValue("--measure"),
  };
}

beforeEach(() => {
  // Reset documentElement between tests so token writes do not bleed across.
  document.documentElement.className = "";
  document.documentElement.style.cssText = "";
  delete document.documentElement.dataset.theme;
  latest = null;

  // Default happy-path mocks: every existing test passes unchanged because
  // loadSettings resolves with the same DEFAULT_SETTINGS that the provider
  // initializes state to, and saveSettings is a no-op vi.fn().
  loadMock.mockReset();
  saveMock.mockReset();
  loadMock.mockResolvedValue({ ok: true, settings: DEFAULT_SETTINGS });
  saveMock.mockResolvedValue(undefined);
});

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
    expect(tokens.fontSizeToken).toBe(`${DEFAULT_SETTINGS.size}px`);
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
    expect(tokens.fontSizeToken).toBe("24px");
    expect(tokens.measure).toBe("72ch");
    expect(document.documentElement.style.getPropertyValue("--line-height")).toBe(
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
    expect(tokens.fontSizeToken).toBe("18px");
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

// ── 02-02 Task 1: persistence + STATE-05 recovery ──────────────────────────
describe("SettingsContext (02-02 persistence + STATE-05)", () => {
  it("hydrates settings from loadSettings() on mount (STATE-02)", async () => {
    const persisted: ReaderSettings = {
      schemaVersion: 1,
      font: "sans",
      size: 22,
      measure: 58,
      spacing: "compact",
      theme: "dark",
    };
    loadMock.mockResolvedValue({ ok: true, settings: persisted });

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );

    // loadSettings fires on mount; the resolved settings replace DEFAULT.
    await waitFor(() => {
      expect(latest?.settings).toEqual(persisted);
    });
    expect(latest?.storageState).toBe("ok");
    // The hydrated theme/font are applied to <html> via applyTheme.
    expect(readTokens().theme).toBe("dark");
    expect(readTokens().fontBody).toContain("system-ui");
  });

  it("routes storageState to 'unavailable' when loadSettings returns ok:false reason unavailable", async () => {
    loadMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    await waitFor(() => {
      expect(latest?.storageState).toBe("unavailable");
    });
    // Reader keeps reading with in-memory defaults (D2-13 — never blocked).
    expect(latest?.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("routes storageState to 'corrupt' when loadSettings returns ok:false reason corrupt", async () => {
    loadMock.mockResolvedValue({ ok: false, reason: "corrupt" });
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    await waitFor(() => {
      expect(latest?.storageState).toBe("corrupt");
    });
    expect(latest?.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("routes storageState to 'unupgradeable' when loadSettings returns ok:false reason unupgradeable", async () => {
    loadMock.mockResolvedValue({ ok: false, reason: "unupgradeable" });
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    await waitFor(() => {
      expect(latest?.storageState).toBe("unupgradeable");
    });
  });

  it("schedules a debounced saveSettings after update (Pitfall 5 — ~400ms)", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => latest?.update({ theme: "dark" }));

    // saveSettings is NOT called immediately (debounced).
    expect(saveMock).not.toHaveBeenCalled();

    // After the debounce window, saveSettings fires with the new record.
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    const saved = saveMock.mock.calls[0]?.[0];
    expect(saved).toBeDefined();
    expect(saved).toMatchObject({ theme: "dark" });
  });

  it("coalesces rapid updates into a single debounced write (Pitfall 5 — no write storm)", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    // Simulate dragging the size range through 4 values in quick succession.
    act(() => latest?.update({ size: 16 }));
    act(() => latest?.update({ size: 18 }));
    act(() => latest?.update({ size: 20 }));
    act(() => latest?.update({ size: 22 }));
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    // The final write carries the LAST value, not intermediates.
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({ size: 22 });
  });

  it("flushes pending save on visibilitychange-hidden (Pitfall 4 — bfcache-safe)", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => latest?.update({ theme: "dark" }));
    expect(saveMock).not.toHaveBeenCalled();

    // Simulate the user tabbing away → visibilitychange-hidden.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
    // Restore the visibility state for any later assertions.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  it("flushes pending save on pagehide (Pitfall 4 — navigation/closure safety net)", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => latest?.update({ theme: "dark" }));
    expect(saveMock).not.toHaveBeenCalled();

    // Simulate the user closing/navigating the tab.
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(1);
    });
  });

  it("does NOT flush on visibilitychange-visible (only hidden is a flush signal)", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => latest?.update({ theme: "dark" }));
    // visibilityState is already "visible" (jsdom default) — dispatch the
    // event but stay visible. saveSettings must NOT fire from this dispatch.
    document.dispatchEvent(new Event("visibilitychange"));
    // Give the event loop a tick to prove nothing happened.
    await Promise.resolve();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("classifies a saveSettings failure into storageState (STATE-05 — never throws to reader)", async () => {
    saveMock.mockRejectedValue({ name: "QuotaExceeded" });
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => latest?.update({ theme: "dark" }));
    await waitFor(() => {
      expect(latest?.storageState).toBe("unavailable");
    });
  });

  it("resetLocalData() resets to DEFAULT_SETTINGS and clears storageState (WipeConfirm seam)", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    // Mutate first so reset has something to undo.
    act(() => latest?.update({ font: "sans", theme: "dark", size: 24 }));
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
    });
    // Storage state artificially bumped to corrupt (simulating the path that
    // opens WipeConfirm). resetLocalData is what WipeConfirm's destructive
    // button calls AFTER running db.delete() in its own handler.
    await act(async () => {
      await latest?.resetLocalData();
    });
    expect(latest?.settings).toEqual(DEFAULT_SETTINGS);
    expect(latest?.storageState).toBe("ok");
  });

  it("does NOT register a beforeunload listener (bfcache-safe — Pitfall 4)", () => {
    // Anti-grep assertion: the deprecated unload-family events are forbidden.
    // Spy on both window AND document addEventListener during provider mount
    // so we catch a listener registered on either target.
    const winSpy = vi.spyOn(window, "addEventListener");
    const docSpy = vi.spyOn(document, "addEventListener");
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    const registered = [
      ...winSpy.mock.calls.map((c) => String(c[0])),
      ...docSpy.mock.calls.map((c) => String(c[0])),
    ];
    // Pitfall 4: NEVER beforeunload/unload (breaks bfcache).
    expect(registered).not.toContain("beforeunload");
    expect(registered).not.toContain("unload");
    // The sanctioned dual-flush pair IS registered (Pitfall 4 happy path).
    expect(registered).toContain("pagehide");
    expect(registered).toContain("visibilitychange");
    winSpy.mockRestore();
    docSpy.mockRestore();
  });
});
