// tests/component/PageTurnControls.test.tsx
// Component tests for the D4-05 keyboard bundle + D4-06 swipe + the A11Y-08
// "Page N of M" announce (UI-SPEC §Interaction 16-19). The paginated surface
// is mocked via a stub handle so the test asserts PageTurnControls' LISTENER
// + announce + focus behavior in isolation (the surface itself is covered by
// PaginatedSurface.test.tsx).
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { PageTurnControls } from "../../src/reader/PageTurnControls";
import type { PaginatedSurfaceHandle } from "../../src/reader/PaginatedSurface";

/**
 * Build a stub surface handle that records every turn call. Returns the ref
 * the component consumes + the recording mock for assertions.
 */
function makeSurface(): {
  ref: React.RefObject<PaginatedSurfaceHandle | null>;
  turn: ReturnType<typeof vi.fn>;
  state: { page: number; total: number };
} {
  const state = { page: 2, total: 4 };
  const turn = vi.fn((direction: "next" | "previous") => {
    const moved =
      direction === "next" ? state.page < state.total : state.page > 1;
    if (moved) {
      state.page += direction === "next" ? 1 : -1;
    }
    return { page: state.page, total: state.total, moved };
  });
  const handle: PaginatedSurfaceHandle = {
    turn,
    turnToPage: vi.fn((idx: number) => {
      const moved = idx + 1 !== state.page;
      state.page = idx + 1;
      return { page: state.page, total: state.total, moved };
    }),
    getCurrentAnchorOffset: () => 0,
    getState: () => ({ page: state.page, total: state.total }),
    getPages: () => null,
  };
  const ref = createRef<PaginatedSurfaceHandle | null>();
  ref.current = handle;
  return { ref, turn, state };
}

/**
 * Dispatch a keydown on window (where PageTurnControls registers) with the
 * given key + shiftKey. cancelable:true so preventDefault is honored.
 */
function dispatchKey(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe("PageTurnControls — keyboard bundle (D4-05)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("PageDown calls turn('next')", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey("PageDown");
    expect(surface.turn).toHaveBeenCalledWith("next");
  });

  it("ArrowRight calls turn('next')", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey("ArrowRight");
    expect(surface.turn).toHaveBeenCalledWith("next");
  });

  it("Space (no shift) calls turn('next')", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey(" ");
    expect(surface.turn).toHaveBeenCalledWith("next");
  });

  it("PageUp calls turn('previous')", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey("PageUp");
    expect(surface.turn).toHaveBeenCalledWith("previous");
  });

  it("ArrowLeft calls turn('previous')", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey("ArrowLeft");
    expect(surface.turn).toHaveBeenCalledWith("previous");
  });

  it("Shift+Space calls turn('previous')", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey(" ", true);
    expect(surface.turn).toHaveBeenCalledWith("previous");
  });

  it("calls preventDefault on handled keys (so Space does not also scroll)", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    const event = dispatchKey(" ");
    expect(event.defaultPrevented).toBe(true);
  });

  it("does NOT call turn when enabled is false (listener removed on mode-switch)", () => {
    const surface = makeSurface();
    render(
      <PageTurnControls
        enabled={false}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey("PageDown");
    expect(surface.turn).not.toHaveBeenCalled();
  });
});

describe("PageTurnControls — form-field/dialog bail (T-04-10, A11Y-01)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("bails when the key lands inside an <input> (never hijacks Space in a form)", () => {
    const surface = makeSurface();
    render(
      <div>
        <input data-testid="field" />
        <PageTurnControls
          enabled={true}
          surfaceRef={surface.ref}
          articleEl={document.body}
        />
      </div>,
    );
    const input = screen.getByTestId("field");
    input.focus();
    // Dispatch the key on the input so event.target is the input; it bubbles
    // to window where the listener receives it.
    fireEvent.keyDown(input, { key: " ", shiftKey: false, bubbles: true });
    expect(surface.turn).not.toHaveBeenCalled();
  });

  it("bails when the key lands inside a contenteditable element", () => {
    const surface = makeSurface();
    render(
      <div>
        <div data-testid="editable" />
        <PageTurnControls
          enabled={true}
          surfaceRef={surface.ref}
          articleEl={document.body}
          />
      </div>,
    );
    const editable = screen.getByTestId("editable");
    // jsdom does NOT implement isContentEditable (returns undefined). Stub it
    // on this element so the handler's isFormField path is exercised; the
    // production behavior (real browsers) is proven by the e2e suite.
    Object.defineProperty(editable, "isContentEditable", {
      configurable: true,
      get: () => true,
    });
    editable.focus();
    fireEvent.keyDown(editable, { key: "PageDown", bubbles: true });
    expect(surface.turn).not.toHaveBeenCalled();
  });
});

describe("PageTurnControls — swipe (D4-06)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /** Build a synthetic Touch for jsdom. */
  function touch(x: number, y: number, target: EventTarget): Touch {
    return {
      clientX: x,
      clientY: y,
      identifier: 0,
      target,
      // The remaining Touch fields are required by the type but unused here.
      force: 0,
      pageX: x,
      pageY: y,
      radiusX: 0,
      radiusY: 0,
      rotationAngle: 0,
      screenX: x,
      screenY: y,
    } as Touch;
  }

  it("single-touch right-to-left horizontal swipe turns next (natural book convention)", () => {
    const surface = makeSurface();
    const articleEl = document.createElement("article");
    document.body.appendChild(articleEl);
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={articleEl}
      />,
    );
    articleEl.dispatchEvent(
      new TouchEvent("touchstart", { touches: [touch(200, 100, articleEl)] }),
    );
    articleEl.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        changedTouches: [touch(100, 105, articleEl)], // dx=-100 (right-to-left), dy=+5
      }),
    );
    expect(surface.turn).toHaveBeenCalledWith("next");
    document.body.removeChild(articleEl);
  });

  it("single-touch left-to-right horizontal swipe turns previous", () => {
    const surface = makeSurface();
    const articleEl = document.createElement("article");
    document.body.appendChild(articleEl);
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={articleEl}
      />,
    );
    articleEl.dispatchEvent(
      new TouchEvent("touchstart", { touches: [touch(100, 100, articleEl)] }),
    );
    articleEl.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        changedTouches: [touch(200, 105, articleEl)], // dx=+100 (left-to-right)
      }),
    );
    expect(surface.turn).toHaveBeenCalledWith("previous");
    document.body.removeChild(articleEl);
  });

  it("multi-touch bails so pinch-zoom stays native (Pitfall 10)", () => {
    const surface = makeSurface();
    const articleEl = document.createElement("article");
    document.body.appendChild(articleEl);
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={articleEl}
      />,
    );
    // Two touches start → multi-touch flag set → touchend bails.
    articleEl.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [touch(100, 100, articleEl), touch(200, 100, articleEl)],
      }),
    );
    articleEl.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        changedTouches: [touch(50, 100, articleEl)],
      }),
    );
    expect(surface.turn).not.toHaveBeenCalled();
    document.body.removeChild(articleEl);
  });

  it("vertical-dominant gesture bails (vertical pan stays native)", () => {
    const surface = makeSurface();
    const articleEl = document.createElement("article");
    document.body.appendChild(articleEl);
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={articleEl}
      />,
    );
    articleEl.dispatchEvent(
      new TouchEvent("touchstart", { touches: [touch(100, 100, articleEl)] }),
    );
    // dx=10, dy=200 — vertical-dominant, not a horizontal swipe.
    articleEl.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        changedTouches: [touch(110, 300, articleEl)],
      }),
    );
    expect(surface.turn).not.toHaveBeenCalled();
    document.body.removeChild(articleEl);
  });

  it("short horizontal drag below the threshold does not turn", () => {
    const surface = makeSurface();
    const articleEl = document.createElement("article");
    document.body.appendChild(articleEl);
    render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={articleEl}
      />,
    );
    articleEl.dispatchEvent(
      new TouchEvent("touchstart", { touches: [touch(100, 100, articleEl)] }),
    );
    // dx=20 (< 40px threshold) — not a swipe.
    articleEl.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        changedTouches: [touch(120, 100, articleEl)],
      }),
    );
    expect(surface.turn).not.toHaveBeenCalled();
    document.body.removeChild(articleEl);
  });
});

describe("PageTurnControls — announce (A11Y-08)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("announces 'Page N of M.' after a successful turn (debounced)", () => {
    const surface = makeSurface(); // starts at page 2 of 4
    const { container } = render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    // Turn next → page 3 of 4.
    dispatchKey("PageDown");
    // No announce yet (debounced 250ms).
    expect(container.querySelector('div[role="status"]')?.textContent).toBe("");
    // Flush the 250ms debounce.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(container.querySelector('div[role="status"]')?.textContent).toBe(
      "Page 3 of 4.",
    );
  });

  it("does NOT announce when the turn was a no-op (boundary: already on last page)", () => {
    const surface = makeSurface();
    surface.state.page = 4;
    surface.state.total = 4;
    const { container } = render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    dispatchKey("PageDown"); // at last page → moved:false → no announce
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(container.querySelector('div[role="status"]')?.textContent).toBe("");
  });

  it("rapid turns reflect the FINAL page (debounce anti-flood)", () => {
    const surface = makeSurface(); // page 2 of 4
    const { container } = render(
      <PageTurnControls
        enabled={true}
        surfaceRef={surface.ref}
        articleEl={document.body}
      />,
    );
    // Two rapid next-turns: page 2 → 3 → 4.
    dispatchKey("PageDown");
    dispatchKey("PageDown");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    // Only ONE announce, reflecting the final page (4 of 4).
    expect(container.querySelector('div[role="status"]')?.textContent).toBe(
      "Page 4 of 4.",
    );
  });
});
