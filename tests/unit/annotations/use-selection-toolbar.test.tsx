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
import {
  describe,
  expect,
  it,
  vi,
  afterEach,
  beforeEach,
  beforeAll,
} from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSelectionToolbar } from "../../../src/reader/annotations/useSelectionToolbar";
import type {
  SelectionToolbarController,
} from "../../../src/reader/annotations/useSelectionToolbar";
import { SelectionToolbar } from "../../../src/reader/annotations/SelectionToolbar";
import type {
  HighlightOverlayValue,
  ToolbarCaptureResult,
  CreateFromSelectionResult,
} from "../../../src/reader/annotations/HighlightOverlay";
import type { CanonicalArticle } from "../../../src/content/types";
import type { Block } from "../../../src/content/types";

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
    originalHtmlHash:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [paragraph("Hello highlightable world.")],
  footnotes: [],
});

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
    highlights: [],
    captureCurrentSelection: vi.fn((_root: HTMLElement): ToolbarCaptureResult => {
      api.captureCalls += 1;
      return overrides?.captureResult ?? {
        ok: true,
        blockIndex: 0,
        position: { start: 6, end: 19 },
      };
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
          }
        );
      },
    ),
    deleteHighlight: vi.fn(async () => {}),
    updateNote: vi.fn(),
    flushNoteSave: vi.fn(),
    openPopoverFor: null,
    setOpenPopoverFor: vi.fn(),
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
}: {
  article: CanonicalArticle | null;
  api: HighlightOverlayValue;
  extraBody?: ReactNode;
  onController?: (ctl: SelectionToolbarController) => void;
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
  });
  onController?.(ctl);
  return (
    <div>
      {/* Focus sink OUTSIDE the reading root (focus-exit + outside-selection
          cases); the toolbar's DOM sits AFTER the root, matching the route. */}
      <button type="button" data-testid="outside">
        Outside
      </button>
      <div ref={cbRef} data-testid="reading-root">
        <p>Hello highlightable world.</p>
        {extraBody}
      </div>
      <SelectionToolbar
        selectionRect={ctl.selectionRect}
        captureResult={ctl.captureResult}
        onHighlight={ctl.handleHighlight}
        onHighlightAndNote={ctl.handleHighlightAndNote}
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
  opts?: { article?: CanonicalArticle | null; extraBody?: ReactNode },
) {
  return render(
    <Harness
      article={opts?.article ?? makeArticle()}
      api={api}
      extraBody={opts?.extraBody}
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
    expect(
      document.querySelector<HTMLElement>(".selection-toolbar button"),
    ).not.toBeNull(),
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
    expect(
      document.querySelectorAll(".selection-toolbar button").length,
    ).toBe(2);
    expect(
      document.querySelector(".selection-toolbar button")?.textContent,
    ).toBe("Highlight");
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
    selectInContainer(
      document.querySelector(".article-body-measurement")!,
      0,
      6,
    );
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
    document
      .querySelector<HTMLElement>(".selection-toolbar button")!
      .focus();
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
    const btn = document.querySelector<HTMLElement>(
      ".selection-toolbar button",
    )!;
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
    const btn = document.querySelector<HTMLElement>(
      ".selection-toolbar button",
    )!;
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
    // Success clears the toolbar + the (ephemeral) selection.
    await waitFor(() => expect(queryToolbar()).toBeNull());
    expect(window.getSelection()?.isCollapsed).toBe(true);
  });

  it("never resurrects a stale selection when focus is OUTSIDE the toolbar", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    // The G6 flow: focus moves onto the toolbar (selection collapses in
    // Gecko/WebKit), then EXITS → focusout dismissal clears the saved range
    // with the toolbar.
    const btn = document.querySelector<HTMLElement>(
      ".selection-toolbar button",
    )!;
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
  it("H creates a highlight from the live selection and dismisses the toolbar", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    pressKey("h");
    await waitFor(() => expect(api.createCalls).toBe(1));
    await waitFor(() => expect(queryToolbar()).toBeNull());
    expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
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
    expect(
      document.querySelectorAll(".selection-toolbar button").length,
    ).toBe(0);
    expect(queryToolbar()?.textContent).toContain(
      "This overlaps an existing highlight.",
    );
    pressKey("h");
    await waitFor(() => expect(api.createCalls).toBe(1));
    // Not-ok → calm bail: the toolbar stays mounted, nothing announced.
    expect(queryToolbar()).not.toBeNull();
    expect(api.setOpenPopoverFor).not.toHaveBeenCalled();
  });
});

describe("useSelectionToolbar — keyboard routing matrix", () => {
  it("Enter on a focused <mark> opens the note popover (D5-10)", async () => {
    const api = makeApi();
    renderHarness(api, {
      extraBody: (
        <mark className="highlight" data-highlight-id="hl-7" tabIndex={0}>
          world
        </mark>
      ),
    });
    const mark = document.querySelector<HTMLElement>(
      'mark[data-highlight-id="hl-7"]',
    )!;
    mark.focus();
    const event = pressKey("Enter", mark);
    expect(event.defaultPrevented).toBe(true);
    expect(api.setOpenPopoverFor).toHaveBeenCalledWith("hl-7");
  });

  it("Space on a focused <mark> opens the note popover too", async () => {
    const api = makeApi();
    renderHarness(api, {
      extraBody: (
        <mark className="highlight" data-highlight-id="hl-8" tabIndex={0}>
          world
        </mark>
      ),
    });
    const mark = document.querySelector<HTMLElement>(
      'mark[data-highlight-id="hl-8"]',
    )!;
    mark.focus();
    pressKey(" ", mark);
    expect(api.setOpenPopoverFor).toHaveBeenCalledWith("hl-8");
  });

  it("ONE plain Tab routes focus onto the toolbar's first button", async () => {
    const api = makeApi();
    await mountActionableToolbar(api);
    expect(document.activeElement).toBe(document.body);
    const event = pressKey("Tab");
    expect(event.defaultPrevented).toBe(true);
    expect(
      document.activeElement ===
        document.querySelector(".selection-toolbar button"),
    ).toBe(true);
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
    const buttons = document.querySelectorAll<HTMLElement>(
      ".selection-toolbar button",
    );
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
    expect(
      document.activeElement ===
        document.querySelector(".selection-toolbar button"),
    ).toBe(true);
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
    const field = document.querySelector<HTMLInputElement>(
      '[data-testid="field"]',
    )!;
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
    rerender(
      <Harness article={null} api={api} onController={undefined} />,
    );
    await waitFor(() => expect(queryToolbar()).toBeNull());
    // And a fresh selection on the new article mounts it again.
    rerender(
      <Harness article={makeArticle()} api={api} onController={undefined} />,
    );
    selectInRoot(6, 19);
    fireSelectionChange();
    flushRaf();
    await waitFor(() => expect(queryToolbar()).not.toBeNull());
  });
});
