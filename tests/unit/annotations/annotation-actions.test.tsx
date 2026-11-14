import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnnotationActions } from "../../../src/reader/annotations/AnnotationActions";

describe("AnnotationActions focus handoff", () => {
  it.each([false, true])("handles Tab explicitly (shift=%s)", (shiftKey) => {
    const triggerRef = createRef<HTMLButtonElement>();
    const nextFocusRef = createRef<HTMLButtonElement>();
    render(
      <>
        <AnnotationActions
          triggerRef={triggerRef}
          onTabForward={() => nextFocusRef.current?.focus()}
          disabled={false}
          onCopy={vi.fn()}
          onDelete={vi.fn()}
        />
        <button ref={nextFocusRef}>Done</button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const item = screen.getByRole("menuitem", { name: "Copy" });
    expect(item).toHaveFocus();
    // A key event alone deliberately supplies no browser-native Tab behavior.
    fireEvent.keyDown(item, { key: "Tab", shiftKey });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: shiftKey ? "More actions" : "Done" })).toHaveFocus();
  });
});
