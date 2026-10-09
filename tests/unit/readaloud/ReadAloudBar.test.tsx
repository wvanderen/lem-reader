// tests/unit/readaloud/ReadAloudBar.test.tsx
// Issue #40 — RTL component suite for the read-aloud transport bar
// (MarkReadAndClose.test.tsx house style — semantic component glue ONLY;
// layout truth stays in Playwright). The acceptance contract pinned here:
//   1. Real buttons; the primary button's accessible NAME carries the state
//      as visible text ("Read aloud" stopped / "Pause" playing / "Play"
//      paused — never color).
//   2. Issue #90 — the idle collapse: stopped, the bar is the ONE quiet
//      entry ("Read aloud") — no Stop, no follow text, no rate — even with
//      the hook's floor follow level supplied; mid-session the follow level
//      shows as plain TEXT, the floor ("Shows progress only") until the
//      session's probe resolves. The configured rate shows beside it while
//      a session exists (issue #43, O1, session-gated by #90).
//   3. Exactly ONE polite role="status" region owns the transport
//      announcements.
//   4. Clicks route: primary → onPrimary in every state; Stop always routes
//      onStop. (Speech-unavailable refusal is hook behavior: the entry/Play
//      button always stays enabled here — the press never dead-ends.)
//   5. Issue #43 (O3): the skip controls render only while a session exists
//      and route their clicks without touching the transport.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
// The label maps are asserted LIVE from the component's own tables — one
// rename site (the labels never drift out of sync with the bar).
import {
  ReadAloudBar,
  FOLLOW_LABELS,
  READALOUD_HEIGHT_VAR,
} from "../../../src/reader/ReadAloudBar";
import { ReadAloudVoicePopover } from "../../../src/reader/ReadAloudVoicePopover";
import type { FollowLevel, TransportState } from "../../../src/readaloud/types";

afterEach(cleanup);

type BarProps = Partial<Parameters<typeof ReadAloudBar>[0]>;

/** jsdom 30 applies the UA popover rule ([popover] → display:none when
 *  closed) but implements no open lifecycle. Lift the panel with an inline
 *  display override — the row-tags.test.tsx discipline (inline beats UA in
 *  the cascade; test-only; the real open/close/anchor lifecycle is the e2e
 *  suite's job). */
function liftPanel() {
  const panel = document.querySelector(".readaloud-voice-popover") as HTMLElement | null;
  if (panel) panel.style.display = "block";
}

/** Render the bar with the hook's honest defaults (floor follow level,
 * no announcement) and return the props (spies) + the container. */
function renderBar(state: TransportState, overrides: BarProps = {}) {
  const props = {
    state,
    followLevel: "progress-only" as FollowLevel,
    announcement: null,
    rate: 1,
    onPrimary: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  const { container, rerender } = render(<ReadAloudBar {...props} />);
  return { ...props, container, rerender };
}

describe("ReadAloudBar — transport buttons", () => {
  it("stopped (idle): the ONE quiet entry 'Read aloud' — no Stop, no follow text, no rate", () => {
    // The hook supplies the floor ("progress-only") even when stopped — the
    // idle collapse must hide it anyway (issue #90's regression case).
    const { container } = renderBar("stopped", { followLevel: "progress-only" });
    expect(screen.getByRole("button", { name: "Read aloud" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(container.textContent).not.toContain(FOLLOW_LABELS["progress-only"]);
    expect(container.textContent).not.toContain("Rate:");
  });

  it("idle free-floats: the pill wrapper goes chrome-less until a session exists", () => {
    const idle = renderBar("stopped");
    expect(idle.container.querySelector(".readaloud-cluster--idle")).not.toBeNull();
    cleanup();

    const active = renderBar("playing");
    expect(active.container.querySelector(".readaloud-cluster--idle")).toBeNull();
    expect(active.container.querySelector(".readaloud-cluster")).not.toBeNull();
  });

  it("playing: the primary button's name flips to 'Pause' (state, not color)", () => {
    renderBar("playing");
    expect(screen.getByRole("button", { name: "Pause" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  });

  it("paused: the primary button reads 'Play' again (resume affordance)", () => {
    renderBar("paused");
    expect(screen.getByRole("button", { name: "Play" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  });

  it("clicks route: primary in every state; Stop → onStop while a session exists", () => {
    const idle = renderBar("stopped");
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(idle.onPrimary).toHaveBeenCalledTimes(1);
    expect(idle.onStop).not.toHaveBeenCalled();
    cleanup();

    const playing = renderBar("playing");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(playing.onPrimary).toHaveBeenCalledTimes(1);
    expect(playing.onStop).not.toHaveBeenCalled();
    cleanup();

    const active = renderBar("playing");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(active.onStop).toHaveBeenCalledTimes(1);
  });
});

describe("ReadAloudBar — follow level + the ONE polite region", () => {
  it("follow level renders as plain text mid-session (the floor until the probe), never idle", () => {
    const idle = renderBar("stopped", { followLevel: "progress-only" });
    expect(idle.container.textContent).not.toContain("Highlights");
    expect(idle.container.textContent).not.toContain(FOLLOW_LABELS["progress-only"]);
    cleanup();

    // Mid-session before the probe resolves, the hook holds the FLOOR — it
    // shows as text (never stale, issue #43 O1).
    const floor = renderBar("playing");
    expect(floor.container.textContent).toContain(FOLLOW_LABELS["progress-only"]);
    cleanup();

    const probed = renderBar("playing", {
      followLevel: "word",
      announcement: "Reading aloud.",
    });
    expect(probed.container.textContent).toContain(FOLLOW_LABELS.word);
  });

  it.each(Object.entries(FOLLOW_LABELS) as [FollowLevel, string][])(
    "label table maps %s → '%s'",
    (level, label) => {
      renderBar("playing", { followLevel: level });
      expect(screen.getByText(label)).not.toBeNull();
      cleanup();
    },
  );

  it("exactly ONE role=status region carries the announcement", () => {
    const { container } = renderBar("playing", {
      followLevel: "sentence",
      announcement: "Reading aloud.",
    });
    const regions = container.querySelectorAll('[role="status"]');
    expect(regions).toHaveLength(1);
    expect(regions[0]!.getAttribute("aria-live")).toBe("polite");
    expect(regions[0]!.textContent).toBe("Reading aloud.");
  });
});

describe("ReadAloudBar — jump to spoken position (issue #42)", () => {
  it("renders only while a session exists AND a jump handler is provided", () => {
    renderBar("stopped", { onJumpToSpoken: vi.fn() });
    expect(screen.queryByRole("button", { name: "Jump to spoken position" })).toBeNull();
    cleanup();

    renderBar("playing");
    expect(screen.queryByRole("button", { name: "Jump to spoken position" })).toBeNull();
    cleanup();

    renderBar("playing", { onJumpToSpoken: vi.fn() });
    expect(screen.getByRole("button", { name: "Jump to spoken position" })).not.toBeNull();
    cleanup();

    renderBar("paused", { onJumpToSpoken: vi.fn() });
    expect(screen.getByRole("button", { name: "Jump to spoken position" })).not.toBeNull();
  });

  it("clicks route to onJumpToSpoken without touching the transport", () => {
    const props = renderBar("playing", { onJumpToSpoken: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "Jump to spoken position" }));
    expect(props.onJumpToSpoken).toHaveBeenCalledTimes(1);
    expect(props.onPrimary).not.toHaveBeenCalled();
    expect(props.onStop).not.toHaveBeenCalled();
  });

  it("the jump notice rides the SAME single status region, fresh over the transport copy", () => {
    const { container } = renderBar("playing", {
      followLevel: "word",
      announcement: "Reading aloud.",
      notice: "Jumped to spoken position.",
      onJumpToSpoken: () => {},
    });
    const regions = container.querySelectorAll('[role="status"]');
    expect(regions).toHaveLength(1);
    // The notice is the feedback for the reader's LAST action — it takes
    // precedence while fresh (the route clears it when the transport next
    // announces).
    expect(regions[0]!.textContent).toBe("Jumped to spoken position.");
    cleanup();

    const noNotice = renderBar("playing", {
      followLevel: "word",
      announcement: "Read aloud paused.",
      onJumpToSpoken: () => {},
    });
    const region = noNotice.container.querySelector('[role="status"]');
    expect(region!.textContent).toBe("Read aloud paused.");
  });
});

describe("ReadAloudBar — speed select (issue #165; session-gated by #90)", () => {
  it("the speed is an editable select while a session exists, hidden when idle", () => {
    renderBar("stopped", { rate: 1.5, followLevel: "progress-only" });
    expect(screen.queryByRole("combobox", { name: "Read-aloud speed" })).toBeNull();
    cleanup();

    renderBar("playing", {
      rate: 0.75,
      followLevel: "word",
      onRateChange: vi.fn(),
    });
    const speed = screen.getByRole("combobox", { name: "Read-aloud speed" });
    expect((speed as HTMLSelectElement).value).toBe("0.75");
    // The ladder is the RATE_STEPS steps, each labelled with its "×" value.
    const labels = Array.from(speed.querySelectorAll("option")).map((o) => o.textContent ?? "");
    expect(labels).toContain("0.5×");
    expect(labels).toContain("1×");
    expect(labels).toContain("3×");
  });

  it("renders without the select when no rate handler is provided (the older pure-text bar)", () => {
    renderBar("playing", { rate: 1 });
    expect(screen.queryByRole("combobox", { name: "Read-aloud speed" })).toBeNull();
  });

  it("a change routes the picked number to onRateChange without touching the transport", () => {
    const props = renderBar("playing", { rate: 1, onRateChange: vi.fn() });
    fireEvent.change(screen.getByRole("combobox", { name: "Read-aloud speed" }), {
      target: { value: "1.5" },
    });
    expect(props.onRateChange).toHaveBeenCalledTimes(1);
    expect(props.onRateChange).toHaveBeenCalledWith(1.5);
    expect(props.onPrimary).not.toHaveBeenCalled();
    expect(props.onStop).not.toHaveBeenCalled();
  });

  it("a stored rate off the ladder is appended so the select never shows a valueless state", () => {
    renderBar("playing", { rate: 1.1, onRateChange: vi.fn() });
    const speed = screen.getByRole("combobox", { name: "Read-aloud speed" });
    const labels = Array.from(speed.querySelectorAll("option")).map((o) => o.textContent ?? "");
    expect((speed as HTMLSelectElement).value).toBe("1.1");
    expect(labels).toContain("1.1×");
  });
});

describe("ReadAloudBar — the Voice popover (issue #165)", () => {
  function stubSpeech(voices: Array<Record<string, unknown>>): void {
    Object.defineProperty(window, "speechSynthesis", {
      value: { getVoices: () => voices },
      configurable: true,
      writable: true,
    });
  }

  // jsdom has no popover lifecycle (the row-tags.test.tsx discipline): the
  // sync open/close effect only needs the calls not to throw. The REAL
  // open/close/anchor geometry is the e2e suite's job.
  beforeEach(() => {
    HTMLDivElement.prototype.showPopover = vi.fn();
    HTMLDivElement.prototype.hidePopover = vi.fn();
  });

  it("the Voice button renders only while a session exists AND a voice handler is provided", () => {
    renderBar("stopped", { onVoiceChange: vi.fn() });
    expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
    cleanup();

    renderBar("playing");
    expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
    cleanup();

    const props = renderBar("playing", { onVoiceChange: vi.fn() });
    const voice = screen.getByRole("button", { name: "Voice" });
    expect(voice.getAttribute("aria-haspopup")).toBe("dialog");
    expect(voice.getAttribute("aria-expanded")).toBe("false");
    // Opening flips the expansion state (the panel content itself is the
    // popover component's own suite below).
    fireEvent.click(voice);
    expect(props.rerender).toBeDefined();
    expect(screen.getByRole("button", { name: "Voice" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("opening the popover shows the probed FILTERED local-voice list (system default first)", async () => {
    stubSpeech([
      { voiceURI: "cloud", name: "Cloud Voice", lang: "en", localService: false },
      { voiceURI: "zora", name: "Zora", lang: "fr", localService: true },
    ]);
    render(
      <ReadAloudVoicePopover
        open
        voice={undefined}
        onVoiceChange={vi.fn()}
        onClose={vi.fn()}
        triggerRef={{ current: null }}
      />,
    );
    liftPanel();
    const select = (await screen.findByRole("combobox", {
      name: "Read-aloud voice",
    })) as HTMLSelectElement;
    await screen.findByRole("option", { name: "Zora (fr)" });
    const labels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent ?? "");
    expect(labels).toContain("System default voice");
    expect(labels).toContain("Zora (fr)");
    expect(labels).not.toContain("Cloud Voice (en)");
  });

  it("a stored voice the filter hid is appended so the select always shows the live truth", async () => {
    stubSpeech([
      { voiceURI: "zora", name: "Zora", lang: "fr", localService: true },
      { voiceURI: "gone", name: "Uninstalled", lang: "en", localService: false },
    ]);
    render(
      <ReadAloudVoicePopover
        open
        voice="gone"
        onVoiceChange={vi.fn()}
        onClose={vi.fn()}
        triggerRef={{ current: null }}
      />,
    );
    liftPanel();
    // The filtered list drops the remote voice; the stored-but-hidden voice
    // is appended under its real name (the unfiltered probe labels it).
    await screen.findByRole("option", { name: "Uninstalled" });
    const select = screen.getByRole("combobox", { name: "Read-aloud voice" }) as HTMLSelectElement;
    expect(select.value).toBe("gone");
  });

  it("labels an unavailable saved voice with the effective system fallback", async () => {
    stubSpeech([{ voiceURI: "zora", name: "Zora", lang: "fr", localService: true }]);
    render(
      <ReadAloudVoicePopover
        open
        voice="gone"
        onVoiceChange={vi.fn()}
        onClose={vi.fn()}
        triggerRef={{ current: null }}
      />,
    );
    liftPanel();
    const option = await screen.findByRole("option", {
      name: "gone (unavailable — using system default)",
    });
    expect((option as HTMLOptionElement).selected).toBe(true);
  });

  it("a voice pick routes '' and URIs through onVoiceChange without touching the transport", async () => {
    stubSpeech([{ voiceURI: "zora", name: "Zora", lang: "fr", localService: true }]);
    const onVoiceChange = vi.fn();
    render(
      <ReadAloudVoicePopover
        open
        voice="zora"
        onVoiceChange={onVoiceChange}
        onClose={vi.fn()}
        triggerRef={{ current: null }}
      />,
    );
    liftPanel();
    const select = (await screen.findByRole("combobox", {
      name: "Read-aloud voice",
    })) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "" } });
    expect(onVoiceChange).toHaveBeenCalledWith("");
    fireEvent.change(select, { target: { value: "zora" } });
    expect(onVoiceChange).toHaveBeenCalledWith("zora");
  });

  it("Done routes through onClose exactly once and restores focus to the invoker ref", async () => {
    stubSpeech([{ voiceURI: "zora", name: "Zora", lang: "fr", localService: true }]);
    const onClose = vi.fn();
    // The invoker ref is the bar's Voice button (WebKit never focuses
    // buttons on click, so the popover cannot rely on activeElement).
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const focusSpy = vi.spyOn(trigger, "focus");
    const triggerRef = { current: trigger as HTMLElement };
    render(
      <ReadAloudVoicePopover
        open
        voice={undefined}
        onVoiceChange={vi.fn()}
        onClose={onClose}
        triggerRef={triggerRef}
      />,
    );
    liftPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    trigger.remove();
  });
});

describe("ReadAloudBar — skip controls (issue #43, O3)", () => {
  const skipHandlers = {
    onSkipSentenceBack: vi.fn(),
    onSkipSentenceForward: vi.fn(),
    onSkipParagraphForward: vi.fn(),
  };

  it("renders the three skip buttons only while a session exists AND handlers are provided", () => {
    renderBar("stopped", { ...skipHandlers });
    expect(screen.queryByRole("button", { name: "Skip sentence backward" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip sentence forward" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip paragraph forward" })).toBeNull();
    cleanup();

    for (const state of ["playing", "paused"] as const) {
      renderBar(state, { ...skipHandlers });
      expect(screen.getByRole("button", { name: "Skip sentence backward" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Skip sentence forward" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Skip paragraph forward" })).not.toBeNull();
      cleanup();
    }

    renderBar("playing"); // no handlers — the bar renders without skips
    expect(screen.queryByRole("button", { name: "Skip sentence backward" })).toBeNull();
  });

  it("clicks route to the skip handlers without touching the transport", () => {
    const props = renderBar("playing", { ...skipHandlers });
    fireEvent.click(screen.getByRole("button", { name: "Skip sentence backward" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip sentence forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip paragraph forward" }));
    expect(skipHandlers.onSkipSentenceBack).toHaveBeenCalledTimes(1);
    expect(skipHandlers.onSkipSentenceForward).toHaveBeenCalledTimes(1);
    expect(skipHandlers.onSkipParagraphForward).toHaveBeenCalledTimes(1);
    expect(props.onPrimary).not.toHaveBeenCalled();
    expect(props.onStop).not.toHaveBeenCalled();
  });
});

describe("ReadAloudBar — expanded-band reservation (issue #90)", () => {
  // setup.ts installs a never-firing RO stub so mounts don't crash; the
  // band reservation needs DELIVERIES (the PaginatedSurface.test.tsx
  // controllable-mock precedent — each test file gets a fresh environment,
  // so the shared stub is unaffected elsewhere). The component's publish
  // re-reads offsetHeight (never the entries), so fire() only needs to
  // redeliver the callback.
  const roInstances: BandResizeObserverMock[] = [];
  let measuredHeight: number;

  class BandResizeObserverMock {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      roInstances.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    fire() {
      this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
    }
  }

  beforeEach(() => {
    roInstances.length = 0;
    measuredHeight = 72;
    vi.stubGlobal("ResizeObserver", BandResizeObserverMock);
    // jsdom reports 0 for offsetHeight (it does no layout); pin the
    // cluster's measured band through the prototype and restore after.
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => measuredHeight,
    });
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
    vi.unstubAllGlobals();
  });

  it("idle reserves nothing; a live session marks the bar expanded", () => {
    const idle = renderBar("stopped");
    expect(document.body.style.getPropertyValue(READALOUD_HEIGHT_VAR)).toBe("");
    expect(idle.container.querySelector(".readaloud-bar--expanded")).toBeNull();
    cleanup();

    const active = renderBar("playing");
    expect(active.container.querySelector(".readaloud-bar--expanded")).not.toBeNull();
  });

  it("publishes --readaloud-h live (wrap-count aware) and un-publishes at session end", () => {
    const playing = renderBar("playing");
    expect(document.body.style.getPropertyValue(READALOUD_HEIGHT_VAR)).toBe("72px");

    // The pill wraps on a narrow viewport → the observer redelivers and the
    // fresh height wins (the wrap-count-aware contract).
    measuredHeight = 88;
    for (const ro of roInstances) ro.fire();
    expect(document.body.style.getPropertyValue(READALOUD_HEIGHT_VAR)).toBe("88px");

    // Session end (state flip, not unmount) un-publishes — idle reserves
    // nothing.
    playing.rerender(<ReadAloudBar {...playing} state="stopped" />);
    expect(document.body.style.getPropertyValue(READALOUD_HEIGHT_VAR)).toBe("");
  });

  it("unmount mid-session un-publishes (the cleanup path)", () => {
    renderBar("playing");
    expect(document.body.style.getPropertyValue(READALOUD_HEIGHT_VAR)).toBe("72px");
    cleanup();
    expect(document.body.style.getPropertyValue(READALOUD_HEIGHT_VAR)).toBe("");
  });
});
