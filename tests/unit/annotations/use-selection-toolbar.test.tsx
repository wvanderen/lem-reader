// tests/unit/annotations/use-selection-toolbar.test.tsx
// Issue #9 — component-level tests of the useSelectionToolbar hook. The
// selection lifecycle (selectionchange tracking + coalescing, containment
// guards, Gecko/WebKit saved-range restore, the keyboard routing matrix,
// focus-exit dismissal, article-swap reset) is proven HERE at hook level,
// against a small harness that renders the hook + the real SelectionToolbar.
//
// Semantic-only (RTL + jsdom — NO layout assertions): jsdom's Selection /
// Range APIs cover the lifecycle invariants (addRange/isCollapsed/cloneRange/
// focus/focusout); layout truth (real selection geometry, engine focus
// quirks) stays in the Playwright annotation specs (tests/e2e/annotations/*).
//
// jsdom gaps bridged here (test-only shims, NOT production behavior):
//   - Range.getBoundingClientRect is unimplemented in jsdom → stubbed to a
//     constant rect (the hook only transports the value into toolbar state).
//   - requestAnimationFrame is stubbed to a manually-flushed queue so the
//     coalescing invariant (multiple selectionchange events → ONE update per
//     frame) is deterministic.
import { describe, expect, it, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { useCallback, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useSelectionToolbar } from "../../../src/reader/annotations/useSelectionToolbar";
import type { SelectionToolbarController } from "../../../src/reader/annotations/useSelectionToolbar";
import { SelectionToolbar } from "../../../src/reader/annotations/SelectionToolbar";
import type {
  HighlightOverlayValue,
  ToolbarCaptureResult,
  CreateFromSelectionResult,
} from "../../../src/reader/annotations/HighlightOverlay";
import type { CanonicalArticle } from "../../../src/content/types";
import { defaultHighlightSlots } from "../../../src/content/schema";
import type { Block } from "../../../src/content/types";
import type { HighlightSlot } from "../../../src/content/schema";

// ── jsdom shims ─────────────────────────────────────────────────────────────

const FAKE_RECT = {
  left: 10,
  top: 20,
  right: 110,
  bottom: 44,
  width: 100,
  height: 24,
  x: 10,
  y: 20,
  toJSON: () => ({}),
};

beforeAll(() => {
  // jsdom does not implement Range.getBoundingClientRect (layout is
  // browser-owned). The hook only transports the value into toolbar state.
  Range.prototype.getBoundingClientRect = function () {
    return FAKE_RECT as DOMRect;
  };
});

// Manual rAF queue — deterministic coalescing tests.
let rafQueue: FrameRequestCallback[] = [];
beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
function flushRaf(): void {
  const cbs = rafQueue;
  rafQueue = [];
  for (const cb of cbs) cb(performance.now());
}
afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const makeArticle = (): CanonicalArticle => ({
  id: "test-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Test Article",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [paragraph("Hello highlightable world.")],
  footnotes: [],
});

/** The valid capture the fake creation "validated" (the toolbar's saved
 * state re-displays it — issue #195 carries the real capture on the result). */
const VALID_CAPTURE = {
  ok: true as const,
  blockIndex: 0,
  position: { start: 6, end: 19 },
};

interface FakeApi extends HighlightOverlayValue {
  captureCalls: number;
  createCalls: number;
  /** isCollapsed of the LIVE selection at createHighlightFromSelection time. */
  collapsedAtCreate: boolean | null;
}

function makeApi(overrides?: {
  captureResult?: ToolbarCaptureResult;
  createResult?: CreateFromSelectionResult;
}): FakeApi {
  const api: FakeApi = {
    captureCalls: 0,
    createCalls: 0,
    collapsedAtCreate: null,
    article: makeArticle(),
    highlights: [],
    highlightSlots: defaultHighlightSlots(),
    captureCurrentSelection: vi.fn((_root: HTMLElement): ToolbarCaptureResult => {
      api.captureCalls += 1;
      return (
        overrides?.captureResult ?? {
          ok: true,
          blockIndex: 0,
          position: { start: 6, end: 19 },
        }
      );
    }),
    createHighlightFromSelection: vi.fn(
      async (_root: HTMLElement): Promise<CreateFromSelectionResult> => {
        api.createCalls += 1;
        const sel = window.getSelection();
        api.collapsedAtCreate = sel ? sel.isCollapsed : null;
        return (
          overrides?.createResult ?? {
            ok: true,
            highlightId: "hl-new",
            position: { start: 6, end: 19 },
            capture: VALID_CAPTURE,
          }
        );
      },
    ),
    deleteHighlight: vi.fn(async () => {}),
    updateNote: vi.fn(),
    flushNoteSave: vi.fn(),
    ensureNoteSaved: vi.fn(async () => true),
    restoreNoteDraft: vi.fn(async () => null),
    noteSavePhase: "idle",
    resetNoteSaveState: vi.fn(),
    updateHighlightTags: vi.fn(async () => {}),
    updateHighlightColor: vi.fn(async () => {}),
    applyHighlightSlot: vi.fn(async () => {}),
    openPopoverFor: null,
    setOpenPopoverFor: vi.fn(),
    controlsFor: null,
    setControlsFor: vi.fn(),
    confirmDeleteFor: null,
    setConfirmDeleteFor: vi.fn(),
    storageState: "ok",
  };
  return api;
}

// ── Harness ─────────────────────────────────────────────────────────────────

function Harness({
  article,
  api,
  extraBody,
  onController,
  surfaceKey,
  highlightSlots,
  defaultHighlightSlotIndex,
}: {
  article: CanonicalArticle | null;
  api: HighlightOverlayValue;
  extraBody?: ReactNode;
  surfaceKey?: number;
  onController?: (ctl: SelectionToolbarController) => void;
  highlightSlots?: HighlightSlot[];
  defaultHighlightSlotIndex?: number;
}) {
  // Mirror the route's callback-ref pattern: the ref for imperative reads +
  // the state so the hook's effects re-run when the element mounts.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const cbRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    setEl(node);
  }, []);
  const apiRef = useRef<HighlightOverlayValue | null>(api);
  apiRef.current = api;
  const ctl = useSelectionToolbar({
    article,
    readingRootRef: ref,
    articleEl: el,
    highlightApiRef: apiRef,
    surfaceKey,
    highlightSlots,
    defaultHighlightSlotIndex,
  });
  onController?.(ctl);
  return (
    <div>
      {/* Focus sink OUTSIDE the reading root (focus-exit + outside-selection
          cases); the toolbar's DOM sits AFTER the root, matching the route. */}
      <button type="button" data-testid="outside">
        Outside
      </button>
      {/* Issue #220 — the reading root mirrors the route's armed-hold paint
          wiring: the held-slot-armed class + the inline --held-slot-tint
          custom property, driven by ctl.heldSlotTint. */}
      <div
        ref={cbRef}
        data-testid="reading-root"
        className={ctl.heldSlotTint !== null ? "held-slot-armed" : ""}
        style={
          ctl.heldSlotTint !== null
            ? ({ "--held-slot-tint": ctl.heldSlotTint } as CSSProperties)
            : undefined
        }
      >
        <p data-block-index="0">Hello highlightable world.</p>
        {extraBody}
      </div>
      <SelectionToolbar
        selectionRect={ctl.selectionRect}
        captureResult={ctl.captureResult}
        onHighlightAndNote={ctl.handleHighlightAndNote}
        slots={ctl.slots}
        onActivateSlot={ctl.handleActivateSlot}
        onFocusExit={ctl.dismissFromFocusExit}
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Select grapheme [start, end) of the root's first <p> text node. */
function selectInRoot(start = 0, end = 5): void {
  const root = document.querySelector('[data-testid="reading-root"]')!;
  const textNode = root.querySelector("p")!.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function selectInContainer(container: Element, start = 0, end = 5): void {
  const textNode = container.querySelector("p")!.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function fireSelectionChange(): void {
  document.dispatchEvent(new Event("selectionchange"));
}

function pressKey(key: string, target?: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  (target ?? window).dispatchEvent(event);
  return event;
}

function queryToolbar(): HTMLElement | null {
  return document.querySelector(".selection-toolbar");
}

function renderHarness(
  api: HighlightOverlayValue,
  opts?: {
    article?: CanonicalArticle | null;
    extraBody?: ReactNode;
    highlightSlots?: HighlightSlot[];
    defaultHighlightSlotIndex?: number;
  },
) {
  return render(
    <Harness
      article={opts?.article ?? makeArticle()}
      api={api}
      extraBody={opts?.extraBody}
      highlightSlots={opts?.highlightSlots}
      defaultHighlightSlotIndex={opts?.defaultHighlightSlotIndex}
    />,
  );
}

/** Select + flush → the actionable toolbar is mounted. */
async function mountActionableToolbar(api: FakeApi) {
  renderHarness(api);
  selectInRoot(6, 19); // "highlightable"
  fireSelectionChange();
  flushRaf();
  await waitFor(() => expect(queryToolbar()).not.toBeNull());
  return waitFor(() =>
    expect(document.querySelector<HTMLElement>(".selection-toolbar button")).not.toBeNull(),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useSelectionToolbar — selection tracking", () => {
  it("tracks a valid selection: toolbar mounts with buttons, capture computed", async () => {
    const api = makeApi();
    renderHarness(api);
    expect(queryToolbar()).toBeNull();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    expect(api.captureCalls).toBe(1);
    // Issue #222 — the generic "Highlight" button is GONE (the default-slot
    // creation is the default slot's pill): the row is the five slot pills +
    // "Highlight + note".
    expect(document.querySelectorAll(".selection-toolbar button").length).toBe(6);
    expect(document.querySelectorAll(".selection-toolbar button")[0]?.textContent).toBe("1Default");
    expect(
      Array.from(document.querySelectorAll(".selection-toolbar button")).some(
        (b) => b.textContent === "Highlight",
      ),
    ).toBe(false);
  });

  it("coalesces multiple selectionchange events into ONE update per frame", async () => {
    const api = makeApi();
    renderHarness(api);
    selectInRoot(6, 19);
    // Three events in the same frame (selection shaping) — one rAF update.
    fireSelectionChange();
    fireSelectionChange();
    fireSelectionChange();
    expect(api.captureCalls).toBe(0); // deferred — not yet flushed
    flushRaf();
    expect(api.captureCalls).toBe(1);
  });

  it("clears toolbar state on a collapsed selection", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    window.getSelection()?.removeAllRanges();
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).toBeNull());
  });

  it("ignores selections OUTSIDE the reading root", async () => {
    const api = makeApi();
    render(
      <div>
        <p id="chrome-text">chrome text here</p>
        <Harness article={makeArticle()} api={api} />
      </div>,
    );
    selectInContainer(document.getElementById("chrome-text")!.parentElement!);
    fireSelectionChange();
    flushRaf();
    await new Promise((r) => setTimeout(r, 0));
    expect(queryToolbar()).toBeNull();
    expect(api.captureCalls).toBe(0);
  });

  it("ignores selections inside the hidden measurement body (D5-08)", async () => {
    const api = makeApi();
    renderHarness(api, {
      extraBody: (
        <div className="article-body-measurement" aria-hidden="true">
          <p>hidden measurement text</p>
        </div>
      ),
    });
    selectInContainer(document.querySelector(".article-body-measurement")!, 0, 6);
    fireSelectionChange();
    flushRaf();
    await new Promise((r) => setTimeout(r, 0));
    expect(queryToolbar()).toBeNull();
    expect(api.captureCalls).toBe(0);
  });
});

describe("useSelectionToolbar — focus containment (Gecko/WebKit hold)", () => {
  it("keeps the toolbar mounted while it owns focus, even when the selection collapses", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    // Simulate the engine behavior: focus moves onto the toolbar and the
    // selection collapses synchronously inside focus().
    document.querySelector<HTMLElement>(".selection-toolbar button")!.focus();
    window.getSelection()?.removeAllRanges();
    fireSelectionChange();
    flushRaf();
    // The containment hold: toolbar stays mounted with its last state.
    expect(queryToolbar()).not.toBeNull();
    expect(api.captureCalls).toBe(1); // no re-capture
  });

  it("dismisses via focusout when focus EXITS the toolbar", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    const btn = document.querySelector<HTMLElement>(".selection-toolbar button")!;
    btn.focus();
    expect(queryToolbar()).not.toBeNull();
    // Focus leaves the toolbar root → the native focusout fires → dismissal.
    document.querySelector<HTMLElement>('[data-testid="outside"]')!.focus();
    await waitFor(() => expect(queryToolbar()).toBeNull());
  });
});

describe("useSelectionToolbar — saved-range restore (Plan 13-11 G6)", () => {
  it("restores the saved range before creating from a toolbar button", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    const btn = document.querySelector<HTMLElement>(".selection-toolbar button")!;
    btn.focus();
    // The Gecko/WebKit collapse: live selection gone, toolbar held.
    window.getSelection()?.removeAllRanges();
    fireSelectionChange();
    flushRaf();
    expect(queryToolbar()).not.toBeNull();
    // Activation: the restore branch re-enters the ONE creation path.
    fireEvent.click(btn);
    await waitFor(() => expect(api.createCalls).toBe(1));
    // The saved range was restored: the create path saw a NON-collapsed
    // selection (capture re-validated against the live DOM).
    expect(api.collapsedAtCreate).toBe(false);
    // Success clears the selection and auto-dismisses the toolbar (#220).
    await waitFor(() => expect(queryToolbar()).toBeNull());
    expect(window.getSelection()?.isCollapsed).toBe(true);
  });

  it("never resurrects a stale selection when focus is OUTSIDE the toolbar", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    // The G6 flow: focus moves onto the toolbar (selection collapses in
    // Gecko/WebKit), then EXITS → focusout dismissal clears the saved range
    // with the toolbar.
    const btn = document.querySelector<HTMLElement>(".selection-toolbar button")!;
    btn.focus();
    document.querySelector<HTMLElement>('[data-testid="outside"]')!.focus();
    await waitFor(() => expect(queryToolbar()).toBeNull());
    // H with a collapsed selection + focus outside the toolbar: calm bail.
    pressKey("h");
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createCalls).toBe(0);
  });
});

describe("useSelectionToolbar — H/N shortcuts", () => {
  it("H creates a highlight from the live selection, dismisses, and arms the grace", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    pressKey("h");
    await waitFor(() => expect(api.createCalls).toBe(1));
    await waitFor(() => expect(queryToolbar()).toBeNull());
    expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
    // The grace is armed: Escape deletes exactly the new highlight.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
  });

  it("N creates a highlight AND opens the note popover for it", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    pressKey("n");
    await waitFor(() => expect(api.createCalls).toBe(1));
    await waitFor(() => expect(api.setOpenPopoverFor).toHaveBeenCalled());
    expect(api.setOpenPopoverFor).toHaveBeenCalledWith("hl-new");
    await waitFor(() => expect(queryToolbar()).toBeNull());
  });

  it("H/N bail (no hijack) with no selection", async () => {
    const api = makeApi();
    renderHarness(api);
    pressKey("h");
    pressKey("n");
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createCalls).toBe(0);
    expect(queryToolbar()).toBeNull();
  });

  it("an invalid capture keeps the hint toolbar and never creates", async () => {
    // Production: createHighlightFromSelection re-captures and returns the
    // typed not-ok (the toolbar keeps showing the hint — no clear, no toast).
    const api = makeApi({
      captureResult: { ok: false, reason: "overlap" },
      createResult: { ok: false, reason: "overlap" },
    });
    renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    // Hint variant: no buttons.
    expect(document.querySelectorAll(".selection-toolbar button").length).toBe(0);
    expect(queryToolbar()?.textContent).toContain("This overlaps an existing highlight.");
    pressKey("h");
    await waitFor(() => expect(api.createCalls).toBe(1));
    // Not-ok → calm bail: the toolbar stays mounted, nothing announced.
    expect(queryToolbar()).not.toBeNull();
    expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
  });
});

describe("useSelectionToolbar — keyboard routing matrix", () => {
  it("Enter on a focused <mark> exposes the highlight controls with focus (issue #175)", async () => {
    const api = makeApi();
    renderHarness(api, {
      extraBody: (
        <mark className="highlight" data-highlight-id="hl-7" tabIndex={0}>
          world
        </mark>
      ),
    });
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-7"]')!;
    mark.focus();
    const event = pressKey("Enter", mark);
    expect(event.defaultPrevented).toBe(true);
    // Keyboard activation requests the CONTROLS (not the note editor) and
    // moves focus into them.
    expect(api.setControlsFor).toHaveBeenCalledTimes(1);
    const request = vi.mocked(api.setControlsFor).mock.calls[0]?.[0];
    expect(request?.id).toBe("hl-7");
    expect(request?.focus).toBe(true);
    expect(request?.rect).not.toBeNull();
    expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
  });

  it("Space on a focused <mark> exposes the highlight controls too", async () => {
    const api = makeApi();
    renderHarness(api, {
      extraBody: (
        <mark className="highlight" data-highlight-id="hl-8" tabIndex={0}>
          world
        </mark>
      ),
    });
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-8"]')!;
    mark.focus();
    pressKey(" ", mark);
    expect(api.setControlsFor).toHaveBeenCalledTimes(1);
    const request = vi.mocked(api.setControlsFor).mock.calls[0]?.[0];
    expect(request?.id).toBe("hl-8");
    expect(request?.focus).toBe(true);
  });

  it("ONE plain Tab routes focus onto the toolbar's first button", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    expect(document.activeElement).toBe(document.body);
    const event = pressKey("Tab");
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement === document.querySelector(".selection-toolbar button")).toBe(
      true,
    );
  });

  it("Tab does NOT route into a hint-only toolbar (no buttons to focus)", async () => {
    const api = makeApi({
      captureResult: { ok: false, reason: "boundary-ineligible" },
    });
    renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    const event = pressKey("Tab");
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
    // The hint toolbar stays mounted (not dismissed by the failed routing).
    expect(queryToolbar()).not.toBeNull();
  });

  it("Tab ON the last button dismisses the toolbar (tab-past, no preventDefault)", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    const buttons = document.querySelectorAll<HTMLElement>(".selection-toolbar button");
    const lastBtn = buttons[buttons.length - 1]!;
    lastBtn.focus();
    const event = pressKey("Tab");
    expect(event.defaultPrevented).toBe(false);
    await waitFor(() => expect(queryToolbar()).toBeNull());
  });

  it("Tab after a focus-exit dismissal proceeds natively (no bounce-back trap)", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    // Tab #1 routes onto the first button...
    pressKey("Tab");
    expect(document.activeElement === document.querySelector(".selection-toolbar button")).toBe(
      true,
    );
    // ...focus exits → dismissal → toolbar unmounted...
    document.querySelector<HTMLElement>('[data-testid="outside"]')!.focus();
    await waitFor(() => expect(queryToolbar()).toBeNull());
    // ...Tab from body now proceeds natively (nothing to route into).
    const event = pressKey("Tab");
    expect(event.defaultPrevented).toBe(false);
  });

  it("keystrokes inside form fields never reach the matrix (isFormField guard)", async () => {
    const api = makeApi();
    renderHarness(api, {
      extraBody: <input data-testid="field" aria-label="field" />,
    });
    const field = document.querySelector<HTMLInputElement>('[data-testid="field"]')!;
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    // Focus (event target) inside an input — H must not hijack.
    pressKey("h", field);
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createCalls).toBe(0);
  });
});

describe("useSelectionToolbar — article lifecycle", () => {
  it("clears toolbar state across an article swap", async () => {
    const api = makeApi();
    const article = makeArticle();
    const { rerender } = renderHarness(api, { article });
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    // Swap: article → null (the route's load effect) clears the trio.
    rerender(<Harness article={null} api={api} onController={undefined} />);
    await waitFor(() => expect(queryToolbar()).toBeNull());
    // And a fresh selection on the new article mounts it again.
    rerender(<Harness article={makeArticle()} api={api} onController={undefined} />);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
  });
});

describe("completed pointer selection", () => {
  function releasePointer() {
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    const event = new Event("pointerup", { bubbles: true });
    Object.defineProperty(event, "button", { value: 0 });
    document.querySelector('[data-testid="reading-root"] p')!.dispatchEvent(event);
  }

  it("saves on release, auto-dismisses the toolbar, and arms the undo grace", async () => {
    const api = makeApi();
    const view = renderHarness(api);
    selectInRoot(6, 19);
    fireEvent(document, new Event("selectionchange"));
    flushRaf();
    await waitFor(() => expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy());
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    fireEvent(
      document.querySelector('[data-testid="reading-root"] p')!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
    expect(api.createCalls).toBe(1);
    // Issue #220 — auto-dismiss: the toolbar leaves on the creation (the
    // saved-state variant is gone), and the undo grace is armed: Escape
    // deletes exactly the new highlight.
    await waitFor(() => expect(queryToolbar()).toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
  });

  it("the pointer path never opens the note popover (N is the note route)", async () => {
    const api = makeApi();
    renderHarness(api);
    selectInRoot(6, 19);
    releasePointer();
    await waitFor(() => expect(api.createCalls).toBe(1));
    expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
  });

  it("does not save while shaping a selection or for invalid content", () => {
    const api = makeApi({ captureResult: { ok: false, reason: "overlap" } });
    renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    expect(api.createCalls).toBe(0);
    releasePointer();
    // The shared capture boundary refuses before anything persists.
    expect(api.createCalls).toBe(0);
  });
});

describe("pending pointer saves", () => {
  function deferredSave(api: FakeApi) {
    let resolve!: (result: CreateFromSelectionResult) => void;
    const promise = new Promise<CreateFromSelectionResult>((done) => {
      resolve = done;
    });
    vi.mocked(api.createHighlightFromSelection).mockImplementationOnce(() => promise);
    return async (id = "hl-first") => {
      await act(async () => {
        resolve({
          ok: true,
          highlightId: id,
          position: { start: 6, end: 19 },
          capture: VALID_CAPTURE,
        });
        await promise;
      });
    };
  }

  function release() {
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    fireEvent(
      document.querySelector('[data-testid="reading-root"] p')!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
  }

  it.each(["live range", "replacement range"])(
    "preserves a newer keyboard selection (%s)",
    async (kind) => {
      const api = makeApi();
      const finish = deferredSave(api);
      const view = renderHarness(api);
      selectInRoot(6, 19);
      release();
      if (kind === "live range")
        window
          .getSelection()!
          .getRangeAt(0)
          .setEnd(window.getSelection()!.getRangeAt(0).endContainer, 24);
      else selectInRoot(20, 24);
      fireEvent(document, new Event("selectionchange"));
      act(() => flushRaf());
      await finish();
      expect(window.getSelection()!.isCollapsed).toBe(false);
      expect(window.getSelection()!.getRangeAt(0).endOffset).toBe(24);
      // The superseded creation returned without clearing: the newer
      // selection's freshly published toolbar stays.
      expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy();
    },
  );

  it("saves a second completed pointer selection while the first is pending", async () => {
    const api = makeApi();
    const finish = deferredSave(api);
    renderHarness(api);
    selectInRoot(6, 19);
    release();
    fireEvent.pointerDown(document.querySelector('[data-testid="reading-root"] p')!);
    selectInRoot(20, 24);
    release();
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(2));
    await finish();
    // The grace targets the NEWEST creation only: Escape deletes exactly it.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledWith("hl-new");
    expect(api.deleteHighlight).not.toHaveBeenCalledWith("hl-first");
    expect(queryToolbar()).toBeNull();
  });

  it("Escape uses the same grace undo action during saving", async () => {
    const api = makeApi();
    const finish = deferredSave(api);
    renderHarness(api);
    selectInRoot(6, 19);
    release();
    await finish("hl-new"); // resolves the pending creation — the grace arms
    expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
    expect(queryToolbar()).toBeNull();
  });
});

describe("pointer save after highlight rendering", () => {
  it("completes the creation when rendering replaces selection text nodes", async () => {
    const api = makeApi();
    const view = renderHarness(api);
    selectInRoot(6, 19);
    vi.mocked(api.createHighlightFromSelection).mockImplementationOnce(async () => {
      const paragraph = view.getByTestId("reading-root").querySelector("p")!;
      // Highlight rendering replaces inline text nodes while the selection
      // still covers the same passage (especially across multiple blocks).
      paragraph.innerHTML = "Hello <mark>highlightable</mark> world.";
      const range = document.createRange();
      // The browser can retarget a cross-block range to block boundaries.
      range.selectNodeContents(paragraph);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      return {
        ok: true,
        highlightId: "hl-new",
        position: { start: 6, end: 19 },
        capture: VALID_CAPTURE,
      };
    });
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    fireEvent(
      view.getByTestId("reading-root").querySelector("p")!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
    // The creation lands (same-DOM-endpoint guard) and the grace arms.
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryToolbar()).toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
  });
});

describe("reading surface transitions", () => {
  it("the undo grace survives page changes without deleting the highlight", async () => {
    const api = makeApi();
    const article = makeArticle();
    const view = render(<Harness article={article} api={api} surfaceKey={1} />);
    selectInRoot(6, 19);
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    fireEvent(
      view.getByTestId("reading-root").querySelector("p")!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
    await waitFor(() => expect(api.createCalls).toBe(1));
    // A page turn (surfaceKey change) clears the toolbar but NOT the grace —
    // issue #220: the grace survives scrolling/resizing/surface movement.
    view.rerender(<Harness article={article} api={api} surfaceKey={2} />);
    expect(queryToolbar()).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
  });
});

// ── Issue #195 — highlight slots: the visible slot row + the default slot ───

describe("highlight slots (issue #195)", () => {
  /** Custom slot configuration: renamed slot 1 with tags, and slot 3 the
   * explicit default (recolored + tagged). */
  const SLOTS: HighlightSlot[] = [
    { name: "Reading list", color: "default", customColorActive: false, tags: ["to-read"] },
    { name: "Yellow", color: "yellow", customColorActive: false, tags: [] },
    { name: "Key ideas", color: "blue", customColorActive: false, tags: ["key-idea"] },
    { name: "Blue", color: "blue", customColorActive: false, tags: [] },
    { name: "Pink", color: "pink", customColorActive: false, tags: [] },
  ];

  function releasePointerOnParagraph() {
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    fireEvent(
      document.querySelector('[data-testid="reading-root"] p')!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
  }

  it("renders the visible slot row with number + name labels (color never the sole identifier)", async () => {
    const api = makeApi();
    const view = renderHarness(api, {
      highlightSlots: SLOTS,
      defaultHighlightSlotIndex: 2,
    });
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Slot 1: Reading list" })).toBeTruthy(),
    );
    expect(view.getByRole("button", { name: "Slot 3: Key ideas" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Slot 5: Pink" })).toBeTruthy();
    // The visible text carries the number and the name.
    expect(view.getByRole("button", { name: "Slot 2: Yellow" }).textContent).toBe("2Yellow");
  });

  it("the default slot is visible in the row but is NOT promoted by other activations", async () => {
    const api = makeApi();
    const view = renderHarness(api, {
      highlightSlots: SLOTS,
      defaultHighlightSlotIndex: 2,
    });
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    // Activating slot 4 (a one-off choice) must not rewrite the saved
    // default — the hook's own state never carries that write.
    await waitFor(() => expect(view.getByRole("button", { name: "Slot 4: Blue" })).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "Slot 4: Blue" }));
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "blue",
      tags: [],
    });
    // The default choice lives in settings; the toolbar exposes no setter.
    expect(api.updateHighlightTags).not.toHaveBeenCalled();
    expect(api.updateHighlightColor).not.toHaveBeenCalled();
  });

  it.each(["H", "button"])(
    "%s quick creation auto-dismisses and arms the grace for only the new highlight",
    async (route) => {
      const api = makeApi();
      const view = renderHarness(api);
      selectInRoot(6, 19);
      fireSelectionChange();
      flushRaf();
      await waitFor(() => expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy());
      if (route === "H") fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
      else fireEvent.click(view.getByRole("button", { name: "Slot 1: Default" }));
      // Issue #220 — the toolbar leaves on the creation; the grace is armed.
      await waitFor(() => expect(queryToolbar()).toBeNull());
      fireEvent.keyDown(window, { key: "Escape" });
      expect(api.deleteHighlight).toHaveBeenCalledWith("hl-new");
      expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
    },
  );

  it("a new native selection keeps the grace AND mounts fresh creation actions", async () => {
    const api = makeApi();
    const view = renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
    await waitFor(() => expect(queryToolbar()).toBeNull());
    // Selection can also be changed by assistive technology without a
    // pointerdown or Shift+arrow event reaching the page. The toolbar
    // mounts fresh over it — and the grace SURVIVES the new selection.
    selectInRoot(20, 24);
    fireSelectionChange();
    act(() => flushRaf());
    expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy();
    // Ladder precedence: the grace rung sits ABOVE the fresh toolbar, so
    // Escape undoes the earlier creation; the toolbar stays for the live
    // selection.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
    expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy();
  });

  it.each(["H", "slot"])(
    "%s uses a newer live selection before selectionchange is processed",
    async (route) => {
      const api = makeApi();
      const view = renderHarness(api);
      selectInRoot(6, 19);
      fireSelectionChange();
      flushRaf();
      fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
      await waitFor(() => expect(api.createCalls).toBe(1));
      // The first creation dismissed the toolbar; mount a fresh one over a
      // processed selection, THEN shape a newer live selection whose
      // selectionchange is deliberately not delivered yet.
      selectInRoot(20, 24);
      fireSelectionChange();
      act(() => flushRaf());
      await waitFor(() =>
        expect(view.getByRole("button", { name: "Slot 2: Yellow" })).toBeTruthy(),
      );
      selectInRoot(6, 12);
      if (route === "H") fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
      else fireEvent.click(view.getByRole("button", { name: "Slot 2: Yellow" }));
      await waitFor(() => expect(api.createCalls).toBe(2));
      expect(api.applyHighlightSlot).not.toHaveBeenCalled();
      expect(api.deleteHighlight).not.toHaveBeenCalled();
    },
  );

  it("H creates with the EXPLICIT default slot's payload", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 2 });
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "blue",
      tags: ["key-idea"],
    });
  });

  it("H falls back to the shipped slot 1 when no settings are wired (pre-#195 behavior)", async () => {
    const api = makeApi();
    renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "default",
      tags: [],
    });
  });

  it("the completed held-slot gesture creates with that slot's payload", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    releasePointerOnParagraph();
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "default",
      tags: ["to-read"],
    });
  });

  it("a slot activation with no selection no-ops (the panel owns applying)", async () => {
    const api = makeApi();
    let ctl: SelectionToolbarController | undefined;
    render(
      <Harness
        article={makeArticle()}
        api={api}
        highlightSlots={SLOTS}
        defaultHighlightSlotIndex={0}
        onController={(c) => {
          ctl = c;
        }}
      />,
    );
    // Issue #220 — the saved-state apply variant is gone: with the selection
    // collapsed (no toolbar mounted), a slot activation never writes.
    act(() => ctl!.handleActivateSlot(0));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    expect(api.applyHighlightSlot).not.toHaveBeenCalled();
  });

  it("retireGraceFor retires the grace only for the edited highlight", async () => {
    const api = makeApi();
    let ctl: SelectionToolbarController | undefined;
    render(
      <Harness
        article={makeArticle()}
        api={api}
        onController={(c) => {
          ctl = c;
        }}
      />,
    );
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    releasePointerOnParagraph();
    await waitFor(() => expect(api.createCalls).toBe(1));
    // An edit to a DIFFERENT highlight never retires this creation's grace.
    act(() => ctl!.retireGraceFor("hl-older"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");

    // A fresh creation arms a new grace; an edit to ITS highlight retires
    // it — Escape stays inert (no double delete, no stale grace).
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    releasePointerOnParagraph();
    await waitFor(() => expect(api.createCalls).toBe(2));
    act(() => ctl!.retireGraceFor("hl-new"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledTimes(1);
    expect(queryToolbar()).toBeNull();
  });
});

// ── Issue #197 — hold-a-slot-number selection gesture ───────────────────────

describe("held-number selection (issue #197)", () => {
  const SLOTS: HighlightSlot[] = [
    { name: "Reading list", color: "default", customColorActive: false, tags: ["to-read"] },
    { name: "Yellow", color: "yellow", customColorActive: false, tags: [] },
    { name: "Key ideas", color: "blue", customColorActive: false, tags: ["key-idea"] },
    { name: "Blue", color: "blue", customColorActive: false, tags: [] },
    { name: "Pink", color: "pink", customColorActive: false, tags: [] },
  ];

  function paragraphEl(): Element {
    return document.querySelector('[data-testid="reading-root"] p')!;
  }

  function pressPointerButton(): void {
    fireEvent(paragraphEl(), new Event("pointerdown", { bubbles: true }));
  }

  function releasePointerButton(): void {
    fireEvent(
      paragraphEl(),
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
  }

  function pressDigit(key: string, target?: Window | Node, init?: KeyboardEventInit): void {
    fireEvent(target ?? window, new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  }

  function releaseDigit(key: string): void {
    fireEvent(window, new KeyboardEvent("keyup", { key, bubbles: true }));
  }

  /** The real reader order: digit down → press → drag (selection changes) →
   * release. The toolbar's rAF flush keeps it assertable. */
  async function holdAndSelect(api: FakeApi, digit = "3"): Promise<void> {
    pressDigit(digit);
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    releasePointerButton();
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
  }

  it("a digit held while the selection completes creates with that slot's payload, dismisses, and arms the grace", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    await holdAndSelect(api, "3");
    // Slot 3 ("Key ideas") — color + tags ride the ONE creation path; the
    // explicit default (slot 1) is NOT used.
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "blue",
      tags: ["key-idea"],
    });
    // Issue #220 — auto-dismiss + grace: the toolbar leaves on the creation
    // and Escape deletes exactly it. Quick creation never opens the
    // annotation panel, and the temporary choice never writes settings.
    await waitFor(() => expect(queryToolbar()).toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
    expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
    expect(api.updateHighlightTags).not.toHaveBeenCalled();
    expect(api.updateHighlightColor).not.toHaveBeenCalled();
  });

  it("releasing the number before the pointer STILL creates (release order does not matter)", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("2");
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    // Mid-drag the toolbar is suppressed (issue #220: pointer-up mount
    // only) — the digit's early release does not surface anything.
    expect(queryToolbar()).toBeNull();
    releaseDigit("2");
    releasePointerButton();
    // The arm survived the mid-gesture digit release: the creation fires on
    // the pointer release, with slot 2's payload.
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "yellow",
      tags: [],
    });
  });

  it("a digit pressed MID-GESTURE arms the slot and the release creates", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    // The digit arrives at any point during the gesture — here, after the
    // sweep shaped its selection. The paint is live while it is armed.
    expect(document.querySelector('[data-testid="reading-root"]')?.className).not.toContain(
      "held-slot-armed",
    );
    pressDigit("4");
    expect(document.querySelector('[data-testid="reading-root"]')?.className).toContain(
      "held-slot-armed",
    );
    expect(
      (
        document.querySelector('[data-testid="reading-root"]') as HTMLElement
      ).style.getPropertyValue("--held-slot-tint"),
    ).toBe("var(--highlight-blue)");
    releasePointerButton();
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "blue",
      tags: [],
    });
    // The paint cleared with the pointer release (the mark takes over).
    expect(document.querySelector('[data-testid="reading-root"]')?.className).not.toContain(
      "held-slot-armed",
    );
  });

  it("Escape during the hold cancels creation, leaves the selection, and the release shows the toolbar", async () => {
    const api = makeApi();
    const view = renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("4");
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    // Mid-drag the toolbar is suppressed — the sweep must not be blocked.
    expect(queryToolbar()).toBeNull();
    fireEvent(window, new KeyboardEvent("keydown", { key: "Escape" }));
    releasePointerButton();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    expect(window.getSelection()!.isCollapsed).toBe(false);
    // The release still publishes the surviving selection's toolbar (the
    // keyboard/touch alternative stays intact).
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Slot 1: Reading list" })).toBeTruthy(),
    );
    await waitFor(() => expect(view.getByRole("button", { name: "Slot 4: Blue" })).toBeTruthy());
  });

  it("auto-repeat of the held digit does not re-arm an Escape-cancelled gesture", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("5");
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent(window, new KeyboardEvent("keydown", { key: "Escape" }));
    // The OS auto-repeat keeps firing keydown while the digit is down —
    // repeats must re-affirm the hold WITHOUT clearing the cancellation.
    pressDigit("5", window, { repeat: true });
    releasePointerButton();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
  });

  it("a fresh digit press mid-gesture does not re-arm an Escape-cancelled gesture", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("3");
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent(window, new KeyboardEvent("keydown", { key: "Escape" }));
    // Even a deliberate second digit during the SAME cancelled gesture
    // cannot resurrect the creation — only a new pointerdown re-arms.
    pressDigit("4");
    releasePointerButton();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    expect(window.getSelection()!.isCollapsed).toBe(false);
  });

  it("Escape with a digit held but no gesture in progress still fires the grace", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    // A just-created highlight's grace is live; then the reader presses a
    // digit WITHOUT starting a drag (the hold alone is inert).
    pressDigit("1");
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    releasePointerButton();
    await waitFor(() => expect(api.createCalls).toBe(1));
    pressDigit("3");
    fireEvent(window, new KeyboardEvent("keydown", { key: "Escape" }));
    // Escape still means undo for the fresh creation — the held digit with
    // no gesture never blocks it (the grace rung sits above the armed rung).
    expect(api.deleteHighlight).toHaveBeenCalledWith("hl-new");
    expect(queryToolbar()).toBeNull();
  });

  it("a fresh gesture re-arms after an Escape cancellation (new pointerdown, digit still held)", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("3");
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent(window, new KeyboardEvent("keydown", { key: "Escape" }));
    releasePointerButton();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    // A new pointer gesture while the digit is STILL down is new intent.
    pressPointerButton();
    releasePointerButton();
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "blue",
      tags: ["key-idea"],
    });
  });

  it("digit keydowns inside editable fields never arm the gesture", async () => {
    const api = makeApi();
    renderHarness(api, {
      highlightSlots: SLOTS,
      defaultHighlightSlotIndex: 0,
      extraBody: <input data-testid="field" aria-label="field" />,
    });
    const field = document.querySelector<HTMLInputElement>('[data-testid="field"]')!;
    // The reader types "3" into a field; the hold state must stay clean so
    // the NEXT ordinary selection creates nothing.
    pressDigit("3", field);
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    releasePointerButton();
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
  });

  it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"])(
    "a %s-modified digit never arms the gesture",
    async (modifier) => {
      const api = makeApi();
      renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
      fireEvent(
        window,
        new KeyboardEvent("keydown", { key: "3", bubbles: true, [modifier]: true }),
      );
      pressPointerButton();
      selectInRoot(6, 19);
      fireSelectionChange();
      flushRaf();
      releasePointerButton();
      expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    },
  );

  it("a window blur mid-hold leaves later ordinary selections ordinary", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("2");
    // The keyup can never arrive once the window loses focus mid-hold.
    fireEvent(window, new Event("blur"));
    pressPointerButton();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    releasePointerButton();
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
  });

  it("releasing a digit after Shift cancels creation and clears the hold", () => {
    const api = makeApi();
    renderHarness(api);
    pressDigit("2", window, { code: "Digit2" });
    pressPointerButton();
    selectInRoot(6, 19);
    fireEvent.keyUp(window, { key: "@", code: "Digit2", shiftKey: true });
    releasePointerButton();
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    pressPointerButton();
    releasePointerButton();
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    expect(window.getSelection()?.toString()).not.toBe("");
  });

  it("releasing a DIFFERENT digit does not end the held slot", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("3");
    releaseDigit("4");
    await holdAndSelect(api, "3");
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "blue",
      tags: ["key-idea"],
    });
  });

  it("a digit held while selecting never auto-creates without a pointer gesture", async () => {
    const api = makeApi();
    renderHarness(api, { highlightSlots: SLOTS, defaultHighlightSlotIndex: 0 });
    pressDigit("3");
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await new Promise((r) => setTimeout(r, 0));
    // The hold alone is inert: only a completed pointer selection can
    // create — ordinary (keyboard/AT) selections never auto-create.
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    expect(queryToolbar()).not.toBeNull();
  });
});

// ── Issue #220 — the Escape ladder (topmost layer wins) ─────────────────────

describe("Escape ladder (issue #220)", () => {
  it("rung 3 over a fresh selection: dismisses, collapses the selection, returns focus to the reading context", async () => {
    const api = makeApi();
    renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    // Park focus on a page button (the Tab-routed toolbar case behaves the
    // same: its unmount drops focus; the ladder makes it explicit).
    document.querySelector<HTMLElement>(".selection-toolbar button")!.focus();
    fireEvent.keyDown(window, { key: "Escape" });
    // The toolbar's first explicit keyboard dismissal: unmount + collapse +
    // focus back on the neutral reading context (body — where focus rests
    // during ordinary keyboard reading).
    expect(queryToolbar()).toBeNull();
    expect(window.getSelection()!.isCollapsed).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(api.deleteHighlight).not.toHaveBeenCalled();
    // Otherwise nothing: a second Escape over no toolbar/no grace is inert.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).not.toHaveBeenCalled();
  });

  it("the hint toolbar is also dismissed by the fresh-toolbar rung", async () => {
    const api = makeApi({ captureResult: { ok: false, reason: "overlap" } });
    renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryToolbar()).toBeNull();
    expect(window.getSelection()!.isCollapsed).toBe(true);
  });

  it("the grace rung sits above the fresh-toolbar rung", async () => {
    const api = makeApi();
    const view = renderHarness(api);
    selectInRoot(6, 19);
    fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
    await waitFor(() => expect(api.createCalls).toBe(1));
    // A NEW selection mounts the toolbar while the grace is still live.
    selectInRoot(20, 24);
    fireSelectionChange();
    act(() => flushRaf());
    await waitFor(() => expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    // Topmost layer wins: the grace fires; the toolbar stays for the live
    // selection (a second Escape then takes the toolbar rung).
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
    expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(window.getSelection()!.isCollapsed).toBe(true);
    expect(queryToolbar()).toBeNull();
  });

  it("the armed-hold rung sits below the grace rung", async () => {
    const api = makeApi();
    renderHarness(api);
    // Creation arms the grace.
    selectInRoot(6, 19);
    fireEvent.keyDown(window, { key: "h" });
    await waitFor(() => expect(api.createCalls).toBe(1));
    // Then a digit + pointer gesture starts (mid-drag, no toolbar).
    fireEvent.keyDown(window, { key: "3", code: "Digit3" });
    fireEvent.pointerDown(document.querySelector('[data-testid="reading-root"] p')!);
    selectInRoot(6, 19);
    fireEvent(document, new Event("selectionchange"));
    act(() => flushRaf());
    fireEvent.keyDown(window, { key: "Escape" });
    // Grace wins over the mid-hold cancel: the just-created highlight is
    // deleted; the gesture is NOT cancelled, so its release still creates.
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
    fireEvent(
      document.querySelector('[data-testid="reading-root"] p')!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(2));
  });

  it("an armed hold without a grace cancels on Escape (rung 4)", async () => {
    const api = makeApi();
    renderHarness(api);
    fireEvent.keyDown(window, { key: "3", code: "Digit3" });
    fireEvent.pointerDown(document.querySelector('[data-testid="reading-root"] p')!);
    selectInRoot(6, 19);
    fireEvent(document, new Event("selectionchange"));
    act(() => flushRaf());
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent(
      document.querySelector('[data-testid="reading-root"] p')!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    expect(api.deleteHighlight).not.toHaveBeenCalled();
  });
});

// ── Issue #220 — the undo grace ──────────────────────────────────────────────

describe("undo grace (issue #220)", () => {
  it("expires after ~4s: a later Escape does nothing", async () => {
    vi.useFakeTimers();
    try {
      const api = makeApi();
      renderHarness(api);
      selectInRoot(6, 19);
      fireEvent.keyDown(window, { key: "h" });
      await vi.advanceTimersByTimeAsync(0);
      expect(api.createCalls).toBe(1);
      // Just inside the window the grace is live.
      await vi.advanceTimersByTimeAsync(3900);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(api.deleteHighlight).toHaveBeenCalledTimes(1);
      // Past the window (a fresh creation, then expiry): Escape is inert.
      selectInRoot(6, 19);
      fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
      await vi.advanceTimersByTimeAsync(0);
      expect(api.createCalls).toBe(2);
      await vi.advanceTimersByTimeAsync(4001);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(api.deleteHighlight).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a newer creation becomes the new target (one shot, one target)", async () => {
    const api = makeApi();
    renderHarness(api);
    selectInRoot(6, 19);
    fireEvent.keyDown(window, { key: "h" });
    await waitFor(() => expect(api.createCalls).toBe(1));
    selectInRoot(20, 24);
    fireSelectionChange();
    act(() => flushRaf());
    fireEvent(window, new KeyboardEvent("keydown", { key: "h" }));
    await waitFor(() => expect(api.createCalls).toBe(2));
    fireEvent.keyDown(window, { key: "Escape" });
    // Exactly the newest creation, exactly once.
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledTimes(1);
  });

  it("survives scroll and resize (the old dismiss-on-scroll is gone)", async () => {
    const api = makeApi();
    renderHarness(api);
    selectInRoot(6, 19);
    fireEvent.keyDown(window, { key: "h" });
    await waitFor(() => expect(api.createCalls).toBe(1));
    fireEvent(document, new Event("scroll"));
    fireEvent(window, new Event("resize"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
  });

  it("a dialog opening retires the grace: focus landing inside dialog[open]", async () => {
    const api = makeApi();
    renderHarness(api, {
      extraBody: (
        <dialog data-testid="panel" aria-label="Panel">
          <button type="button">Panel button</button>
        </dialog>
      ),
    });
    selectInRoot(6, 19);
    fireEvent.keyDown(window, { key: "h" });
    await waitFor(() => expect(api.createCalls).toBe(1));
    // The dialog opens (showModal moves focus inside): the observable
    // "dialog opening" moment. The grace retires at open — BEFORE Escape.
    const dialog = document.querySelector<HTMLDialogElement>('[data-testid="panel"]')!;
    dialog.open = true;
    fireEvent.focusIn(dialog.querySelector("button")!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).not.toHaveBeenCalled();
  });

  it("the article swap clears the grace (never deletes across articles)", async () => {
    const api = makeApi();
    const article = makeArticle();
    const view = render(<Harness article={article} api={api} />);
    selectInRoot(6, 19);
    fireEvent.keyDown(window, { key: "h" });
    await waitFor(() => expect(api.createCalls).toBe(1));
    view.rerender(<Harness article={makeArticle()} api={api} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.deleteHighlight).not.toHaveBeenCalled();
  });
});

// ── Issue #220 — pointer-up toolbar mount (mid-drag suppression) ────────────

describe("toolbar suppression during drag (issue #220)", () => {
  it("no mount and no reposition while the pointer is down; mounts on release", async () => {
    const api = makeApi();
    const view = renderHarness(api);
    const paragraph = document.querySelector('[data-testid="reading-root"] p')!;
    fireEvent.pointerDown(paragraph);
    selectInRoot(6, 12);
    fireSelectionChange();
    flushRaf();
    // Mid-drag: the sweep is never blocked by a floating toolbar.
    expect(queryToolbar()).toBeNull();
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    expect(queryToolbar()).toBeNull(); // still shaping — still suppressed
    fireEvent(paragraph, Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }));
    // Release: the toolbar mounts with the FINAL selection's geometry —
    // capture runs once for the published state.
    await waitFor(() => expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy());
  });

  it("a plain click (collapse) during the gesture dismisses on release", async () => {
    const api = makeApi();
    renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
    const paragraph = document.querySelector('[data-testid="reading-root"] p')!;
    // Click elsewhere: pointerdown + collapse + pointerup.
    fireEvent.pointerDown(paragraph);
    window.getSelection()!.removeAllRanges();
    fireSelectionChange(); // suppressed mid-gesture
    flushRaf();
    expect(queryToolbar()).not.toBeNull(); // the old state holds mid-gesture
    fireEvent(paragraph, Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }));
    await waitFor(() => expect(queryToolbar()).toBeNull());
  });

  it("keyboard selections keep the immediate mount (no pointer involved)", async () => {
    const api = makeApi();
    const view = renderHarness(api);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(view.getByRole("button", { name: "Slot 1: Default" })).toBeTruthy());
  });
});

// ── Issue #220 — the live armed-hold paint ───────────────────────────────────

describe("armed-hold live paint (issue #220)", () => {
  it("paints only while armed AND the pointer is down, with the slot's derived tint", () => {
    const api = makeApi();
    renderHarness(api);
    const root = document.querySelector('[data-testid="reading-root"]') as HTMLElement;
    // Digit-first: armed before the press — no paint yet (nothing to paint).
    fireEvent.keyDown(window, { key: "3", code: "Digit3" });
    expect(root.className).not.toContain("held-slot-armed");
    // The press starts the sweep: the paint comes on with slot 3's token.
    fireEvent.pointerDown(root.querySelector("p")!);
    expect(root.className).toContain("held-slot-armed");
    expect(root.style.getPropertyValue("--held-slot-tint")).toBe("var(--highlight-green)");
    // A mid-gesture re-arm to another slot re-derives the tint.
    fireEvent.keyDown(window, { key: "2", code: "Digit2" });
    expect(root.style.getPropertyValue("--held-slot-tint")).toBe("var(--highlight-yellow)");
    // Release: paint off (the mark takes over on creation).
    fireEvent(
      root.querySelector("p")!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
    expect(root.className).not.toContain("held-slot-armed");
  });

  it("a plain digit tap outside a gesture never sticks (no paint, no later creation)", async () => {
    const api = makeApi();
    renderHarness(api);
    const root = document.querySelector('[data-testid="reading-root"]') as HTMLElement;
    fireEvent.keyDown(window, { key: "4", code: "Digit4" });
    fireEvent.keyUp(window, { key: "4", code: "Digit4" });
    // A later ordinary gesture stays ordinary.
    selectInRoot(6, 19);
    fireEvent(document, new Event("selectionchange"));
    act(() => flushRaf());
    fireEvent.pointerDown(root.querySelector("p")!);
    expect(root.className).not.toContain("held-slot-armed");
    fireEvent(
      root.querySelector("p")!,
      Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
  });
});

// ── Issue #220 — stale-arm hygiene ───────────────────────────────────────────

describe("stale-arm hygiene (issue #220)", () => {
  const SLOTS_HELD: HighlightSlot[] = [
    { name: "Reading list", color: "default", customColorActive: false, tags: ["to-read"] },
    { name: "Yellow", color: "yellow", customColorActive: false, tags: [] },
    { name: "Key ideas", color: "blue", customColorActive: false, tags: ["key-idea"] },
    { name: "Blue", color: "blue", customColorActive: false, tags: [] },
    { name: "Pink", color: "pink", customColorActive: false, tags: [] },
  ];

  it("a failed-capture armed release with the digit already up disarms: a later plain drag stays ordinary", async () => {
    const api = makeApi({ captureResult: { ok: false, reason: "overlap" } });
    renderHarness(api, { highlightSlots: SLOTS_HELD, defaultHighlightSlotIndex: 0 });
    const root = document.querySelector('[data-testid="reading-root"]') as HTMLElement;
    const paragraph = root.querySelector("p")!;
    // Armed gesture whose capture fails; the digit was released MID-gesture.
    fireEvent.keyDown(window, { key: "3", code: "Digit3" });
    fireEvent.pointerDown(paragraph);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent.keyUp(window, { key: "3", code: "Digit3" }); // plain mid-gesture release
    fireEvent(paragraph, Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    // The gesture ended without a creation and the digit is up: the arm is
    // dead — a later PLAIN drag never paints and never creates.
    fireEvent.pointerDown(paragraph);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    expect(root.className).not.toContain("held-slot-armed");
    fireEvent(paragraph, Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
  });

  it("a failed-capture armed release with the digit STILL down keeps the arm for the retry", async () => {
    const api = makeApi({ captureResult: { ok: false, reason: "overlap" } });
    renderHarness(api, { highlightSlots: SLOTS_HELD, defaultHighlightSlotIndex: 0 });
    const root = document.querySelector('[data-testid="reading-root"]') as HTMLElement;
    const paragraph = root.querySelector("p")!;
    fireEvent.keyDown(window, { key: "3", code: "Digit3" });
    fireEvent.pointerDown(paragraph);
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    fireEvent(paragraph, Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.createHighlightFromSelection).not.toHaveBeenCalled();
    // The capture now succeeds (the reader adjusted the passage), and the
    // digit never came up: the immediate retry gesture still creates.
    vi.mocked(api.captureCurrentSelection).mockImplementation(() => ({
      ok: true,
      blockIndex: 0,
      position: { start: 6, end: 19 },
    }));
    fireEvent.pointerDown(paragraph);
    fireEvent(paragraph, Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }));
    await waitFor(() => expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createHighlightFromSelection).mock.calls[0]?.[1]).toEqual({
      color: "blue",
      tags: ["key-idea"],
    });
  });
});

describe("cancelled gestures and pending creation grace", () => {
  it.each([false, true])(
    "pointercancel preserves the arm only while its digit is held (%s)",
    async (held) => {
      const api = makeApi();
      renderHarness(api);
      const root = document.querySelector('[data-testid="reading-root"] p')!;
      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      fireEvent.pointerDown(root);
      selectInRoot(6, 19);
      if (!held) fireEvent.keyUp(window, { key: "1", code: "Digit1" });
      fireEvent.pointerCancel(root);
      fireEvent.pointerDown(root);
      selectInRoot(6, 19);
      fireEvent(root, Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }));
      await act(async () => {});
      expect(api.createHighlightFromSelection).toHaveBeenCalledTimes(held ? 1 : 0);
    },
  );

  it.each(["keyboard", "pointer"])(
    "a dialog retires pending %s creation grace even if closed before saving finishes",
    async (path) => {
      const api = makeApi();
      let finish!: (result: CreateFromSelectionResult) => void;
      vi.mocked(api.createHighlightFromSelection).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      renderHarness(api, {
        extraBody: (
          <dialog data-testid="panel">
            <button>Panel</button>
          </dialog>
        ),
      });
      selectInRoot(6, 19);
      if (path === "keyboard") fireEvent.keyDown(window, { key: "h" });
      else {
        fireEvent.keyDown(window, { key: "1", code: "Digit1" });
        fireEvent(
          document.querySelector('[data-testid="reading-root"] p')!,
          Object.assign(new Event("pointerup", { bubbles: true }), { button: 0 }),
        );
      }
      const dialog = document.querySelector<HTMLDialogElement>('[data-testid="panel"]')!;
      dialog.open = true;
      fireEvent.focusIn(dialog.querySelector("button")!);
      dialog.open = false;
      await act(async () => {
        finish({
          ok: true,
          highlightId: "hl-pending",
          position: { start: 6, end: 19 },
          capture: VALID_CAPTURE,
        });
      });
      fireEvent.keyDown(window, { key: "Escape" });
      expect(api.deleteHighlight).not.toHaveBeenCalled();

      // Retirement applies to that pending creation, not future creations.
      selectInRoot(6, 19);
      fireEvent.keyDown(window, { key: "h" });
      await act(async () => {});
      fireEvent.keyDown(window, { key: "Escape" });
      expect(api.deleteHighlight).toHaveBeenCalledExactlyOnceWith("hl-new");
    },
  );
});
