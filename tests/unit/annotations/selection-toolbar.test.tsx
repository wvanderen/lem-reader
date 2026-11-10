import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultHighlightSlots } from "../../../src/content/schema";
import { SelectionToolbar } from "../../../src/reader/annotations/SelectionToolbar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const onActivateSlot = vi.fn();
  const onHighlightAndNote = vi.fn();
  const view = render(
    <SelectionToolbar
      selectionRect={new DOMRect(20, 200, 100, 20)}
      captureResult={{ ok: true, blockIndex: 0, position: { start: 0, end: 12 } }}
      slots={defaultHighlightSlots()}
      defaultSlotIndex={2}
      onActivateSlot={onActivateSlot}
      onHighlightAndNote={onHighlightAndNote}
      onFocusExit={vi.fn()}
    />,
  );
  return { ...view, onActivateSlot, onHighlightAndNote };
}

// jsdom has no PointerEvent constructor; define the pointer fields explicitly.
function pointer(target: HTMLElement, type: string, x = 0) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: "touch" },
    clientX: { value: x },
    clientY: { value: 0 },
  });
  fireEvent(target, event);
}

describe("compact selection toolbar", () => {
  it("keeps six directly named actions and reveals the default status on focus", () => {
    const view = setup();
    expect(view.getAllByRole("button")).toHaveLength(6);
    fireEvent.focus(view.getByRole("button", { name: "Slot 3: Green" }));
    expect(view.container.querySelector(".selection-toolbar-label-text")?.textContent).toBe(
      "Save as 3: Green — default slot",
    );
    expect(
      view.container.querySelector(".selection-toolbar-label")?.getAttribute("data-visible"),
    ).toBe("true");
  });

  it("saves a normal touch tap immediately", () => {
    const view = setup();
    const button = view.getByRole("button", { name: "Slot 2: Yellow" });
    pointer(button, "pointerdown");
    pointer(button, "pointerup");
    fireEvent.click(button, { detail: 1 });
    expect(view.onActivateSlot).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each(["Slot 2: Yellow", "Highlight + note"])(
    "inspects %s without saving on release, then allows a new tap",
    (name) => {
      vi.useFakeTimers();
      const view = setup();
      const button = view.getByRole("button", { name });
      pointer(button, "pointerdown");
      fireEvent.focus(button);
      expect(
        view.container.querySelector(".selection-toolbar-label")?.getAttribute("data-visible"),
      ).toBe("false");
      act(() => vi.advanceTimersByTime(500));
      expect(
        view.container.querySelector(".selection-toolbar-label")?.getAttribute("data-visible"),
      ).toBe("true");
      pointer(button, "pointerup");
      fireEvent.click(button, { detail: 1 });
      expect(view.onActivateSlot).not.toHaveBeenCalled();
      expect(view.onHighlightAndNote).not.toHaveBeenCalled();
      pointer(button, "pointerdown");
      pointer(button, "pointerup");
      fireEvent.click(button, { detail: 1 });
      expect(
        view.onActivateSlot.mock.calls.length + view.onHighlightAndNote.mock.calls.length,
      ).toBe(1);
    },
  );

  it("cancels inspection when the touch moves or is cancelled", () => {
    vi.useFakeTimers();
    const view = setup();
    const button = view.getByRole("button", { name: "Slot 1: Default" });
    pointer(button, "pointerdown");
    pointer(button, "pointermove", 20);
    act(() => vi.advanceTimersByTime(600));
    expect(
      view.container.querySelector(".selection-toolbar-label")?.getAttribute("data-visible"),
    ).toBe("false");
    pointer(button, "pointerdown");
    pointer(button, "pointercancel");
    act(() => vi.advanceTimersByTime(600));
    expect(
      view.container.querySelector(".selection-toolbar-label")?.getAttribute("data-visible"),
    ).toBe("false");
  });

  it("cleans up a pending hold when the selection disappears without unmounting the component", () => {
    vi.useFakeTimers();
    const view = setup();
    pointer(view.getByRole("button", { name: "Slot 1: Default" }), "pointerdown");
    view.rerender(
      <SelectionToolbar
        selectionRect={null}
        captureResult={null}
        slots={defaultHighlightSlots()}
        onActivateSlot={view.onActivateSlot}
        onHighlightAndNote={view.onHighlightAndNote}
        onFocusExit={vi.fn()}
      />,
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(view.queryByRole("toolbar")).toBeNull();
  });

  it("cleans up a pending hold on unmount", () => {
    vi.useFakeTimers();
    const view = setup();
    pointer(view.getByRole("button", { name: "Slot 1: Default" }), "pointerdown");
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
