// tests/component/ModeToggle.test.tsx
// Component tests for the D4-09 reading-mode toggle (UI-SPEC §Interaction 15 +
// §Copywriting). Covers aria-pressed reflection, aria-label copy, the glyph
// swap, the click → onToggle wiring, and the polite "Switched to … reading."
// announce on mode change. The persisted preference + the D4-10 anchor live
// in the parent (Header/ArticleView) — ModeToggle is presentational, so the
// test drives it via props without a provider.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { ModeToggle } from "../../src/reader/ModeToggle";

describe("ModeToggle (D4-09)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders a button with aria-pressed=true in paginated mode", () => {
    render(<ModeToggle mode="paginated" onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a button with aria-pressed=false in scrolling mode", () => {
    render(<ModeToggle mode="scrolling" onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("uses the UI-SPEC aria-label copy naming the current mode", () => {
    const { rerender } = render(<ModeToggle mode="paginated" onToggle={() => {}} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
      "Reading mode: paginated",
    );
    rerender(<ModeToggle mode="scrolling" onToggle={() => {}} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
      "Reading mode: scrolling",
    );
  });

  it("contains an inline <svg> glyph (the secondary cue beyond aria-pressed)", () => {
    const { container } = render(<ModeToggle mode="paginated" onToggle={() => {}} />);
    const svg = container.querySelector("button.mode-toggle svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("clicking the button calls onToggle exactly once", () => {
    const onToggle = vi.fn();
    render(<ModeToggle mode="paginated" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("announces 'Switched to scrolling reading.' on mode change (A11Y-08)", () => {
    const { rerender } = render(<ModeToggle mode="paginated" onToggle={() => {}} />);
    // No announce before the change.
    expect(screen.queryByText("Switched to scrolling reading.")).toBeNull();
    // Flip the mode — the announce effect fires (debounced via setTimeout(0)).
    rerender(<ModeToggle mode="scrolling" onToggle={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.getByText("Switched to scrolling reading.")).not.toBeNull();
  });

  it("announces 'Switched to paginated reading.' on the reverse switch", () => {
    const { rerender } = render(<ModeToggle mode="scrolling" onToggle={() => {}} />);
    rerender(<ModeToggle mode="paginated" onToggle={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.getByText("Switched to paginated reading.")).not.toBeNull();
  });

  it("renders the announce inside a polite live region (role=status)", () => {
    const { container } = render(<ModeToggle mode="paginated" onToggle={() => {}} />);
    const liveRegion = container.querySelector('div[role="status"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute("aria-live")).toBe("polite");
    expect(liveRegion?.getAttribute("aria-atomic")).toBe("true");
  });

  it("does NOT announce when the mode prop does not change (re-render only)", () => {
    const { rerender } = render(<ModeToggle mode="paginated" onToggle={() => {}} />);
    // Re-render with the SAME mode — no announce should appear.
    rerender(<ModeToggle mode="paginated" onToggle={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.queryByText(/Switched to/)).toBeNull();
  });
});
