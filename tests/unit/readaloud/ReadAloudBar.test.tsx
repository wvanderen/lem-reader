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
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
// The label maps are asserted LIVE from the component's own tables — one
// rename site (the labels never drift out of sync with the bar).
import { ReadAloudBar, FOLLOW_LABELS } from "../../../src/reader/ReadAloudBar";
import type { FollowLevel, TransportState } from "../../../src/readaloud/types";

afterEach(cleanup);

type BarProps = Partial<Parameters<typeof ReadAloudBar>[0]>;

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
  const { container } = render(<ReadAloudBar {...props} />);
  return { ...props, container };
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
    expect(
      screen.getByRole("button", { name: "Jump to spoken position" }),
    ).not.toBeNull();
    cleanup();

    renderBar("paused", { onJumpToSpoken: vi.fn() });
    expect(
      screen.getByRole("button", { name: "Jump to spoken position" }),
    ).not.toBeNull();
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

describe("ReadAloudBar — rate text (issue #43, O1; session-gated by #90)", () => {
  it("the rate is visible as text while a session exists, hidden when idle", () => {
    const stopped = renderBar("stopped", { rate: 1.5, followLevel: "progress-only" });
    expect(stopped.container.textContent).not.toContain("Rate:");
    cleanup();

    const playing = renderBar("playing", { rate: 0.75, followLevel: "word" });
    expect(playing.container.textContent).toContain("Rate: 0.75×");
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
      expect(
        screen.getByRole("button", { name: "Skip sentence backward" }),
      ).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Skip sentence forward" }),
      ).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Skip paragraph forward" }),
      ).not.toBeNull();
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
