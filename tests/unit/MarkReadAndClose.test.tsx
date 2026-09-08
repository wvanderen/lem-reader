// tests/unit/MarkReadAndClose.test.tsx
// 260908-oht Task 2 — RTL component suite for the explicit end-of-article
// completion affordance + the extracted shared close-navigation contract
// (leaveArticleToLibrary). Semantic component glue ONLY (RestorationMarker
// .test.tsx house style — layout truth stays in Playwright):
//   1. A native button with the accessible name "Mark read and close"
//      exists in BOTH placements (visible text label — no aria-label
//      indirection).
//   2. Click fires onMarkRead() FIRST, then navigates (save-before-navigate
//      — the flush-persisted offset must be in flight before unmount).
//   3. hasAppHistory routes through the ONE shared contract: history.back()
//      when true, the literal "#/" route when false (identical to Back to
//      library — Pitfall 7 deep-link safety).
//   4. The placement prop maps to the mark-read-close-flow / -page classes.
//   5. BackToLibrary regression: byte-identical behavior after the
//      extraction (it has no pre-existing test — this pins it).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkReadAndClose } from "../../src/reader/MarkReadAndClose";
import { BackToLibrary } from "../../src/reader/BackToLibrary";

afterEach(() => {
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("MarkReadAndClose — explicit completion affordance", () => {
  it("renders a button named 'Mark read and close' in flow placement with the flow class", () => {
    render(
      <MarkReadAndClose onMarkRead={() => {}} hasAppHistory={false} placement="flow" />,
    );
    const button = screen.getByRole("button", { name: "Mark read and close" });
    expect(button).not.toBeNull();
    expect(button.className).toContain("mark-read-close-flow");
  });

  it("renders a button named 'Mark read and close' in page placement with the page class", () => {
    render(
      <MarkReadAndClose onMarkRead={() => {}} hasAppHistory={false} placement="page" />,
    );
    const button = screen.getByRole("button", { name: "Mark read and close" });
    expect(button).not.toBeNull();
    expect(button.className).toContain("mark-read-close-page");
  });

  it("click with hasAppHistory=true: onMarkRead once, then history.back() — in that order", () => {
    const order: string[] = [];
    const onMarkRead = vi.fn(() => order.push("onMarkRead"));
    const backSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => order.push("back"));
    render(
      <MarkReadAndClose onMarkRead={onMarkRead} hasAppHistory={true} placement="flow" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark read and close" }));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(backSpy).toHaveBeenCalledTimes(1);
    // Save-before-navigate: the mark-read side effect precedes the back() call.
    expect(order).toEqual(["onMarkRead", "back"]);
  });

  it("click with hasAppHistory=false: onMarkRead called, then the hash becomes '#/'", () => {
    const onMarkRead = vi.fn();
    render(
      <MarkReadAndClose onMarkRead={onMarkRead} hasAppHistory={false} placement="flow" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark read and close" }));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/");
  });
});

describe("BackToLibrary — leaveArticleToLibrary regression", () => {
  it("calls history.back() when hasAppHistory is true", () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<BackToLibrary hasAppHistory={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it("sets the hash to '#/' when hasAppHistory is false (deep-link safety)", () => {
    render(<BackToLibrary hasAppHistory={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(window.location.hash).toBe("#/");
  });
});
