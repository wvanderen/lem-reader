// tests/unit/readaloud/ReadAloudBar.test.tsx
// Issue #40 — RTL component suite for the read-aloud transport bar
// (MarkReadAndClose.test.tsx house style — semantic component glue ONLY;
// layout truth stays in Playwright). The acceptance contract pinned here:
//   1. Real Play/Pause/Stop buttons; the primary button's accessible NAME
//      flips between "Play" and "Pause" as transport state (visible text,
//      never color).
//   2. The probed follow level is visible as TEXT ("Follows: …") — and
//      absent before the first probe of the session (null).
//   3. Exactly ONE polite role="status" region owns the transport
//      announcements.
//   4. Clicks route: primary → Play when stopped/paused; Pause when playing;
//      Stop always routes onStop. (Speech-unavailable refusal is hook
//      behavior: Play always stays enabled here — the press never dead-ends.)
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ReadAloudBar } from "../../../src/reader/ReadAloudBar";
import type { TransportState } from "../../../src/readaloud/types";

afterEach(cleanup);

function renderBar(state: TransportState, overrides: Partial<Parameters<typeof ReadAloudBar>[0]> = {}) {
  const props = {
    state,
    followLevel: null,
    announcement: null,
    onPrimary: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<ReadAloudBar {...props} />);
  return props;
}

describe("ReadAloudBar — transport buttons", () => {
  it("stopped: buttons named 'Play' and 'Stop'; Stop disabled", () => {
    renderBar("stopped");
    expect(screen.getByRole("button", { name: "Play" })).not.toBeNull();
    const stop = screen.getByRole("button", { name: "Stop" });
    expect((stop as HTMLButtonElement).disabled).toBe(true);
  });

  it("playing: the primary button's name flips to 'Pause' (state, not color)", () => {
    renderBar("playing");
    expect(screen.getByRole("button", { name: "Pause" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("paused: the primary button reads 'Play' again (resume affordance)", () => {
    renderBar("paused");
    expect(screen.getByRole("button", { name: "Play" })).not.toBeNull();
  });

  it("clicks route: primary when stopped → onPrimary; playing → onPrimary; Stop → onStop", () => {
    const props = renderBar("stopped");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(props.onPrimary).toHaveBeenCalledTimes(1);
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
  it("follow level renders as text once probed; absent before it", () => {
    const { container } = render(
      <ReadAloudBar
        state="stopped"
        followLevel={null}
        announcement={null}
        onPrimary={() => {}}
        onStop={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("Follows:");
    cleanup();

    const probed = render(
      <ReadAloudBar
        state="playing"
        followLevel="word"
        announcement="Reading aloud."
        onPrimary={() => {}}
        onStop={() => {}}
      />,
    );
    expect(probed.container.textContent).toContain("Follows: word");
  });

  it.each([
    ["word", "Follows: word"],
    ["sentence", "Follows: sentence"],
    ["passage", "Follows: passage"],
    ["progress-only", "Follows: progress only"],
  ] as const)("label table maps %s → '%s'", (level, label) => {
    render(
      <ReadAloudBar
        state="playing"
        followLevel={level}
        announcement={null}
        onPrimary={() => {}}
        onStop={() => {}}
      />,
    );
    expect(screen.getByText(label)).not.toBeNull();
    cleanup();
  });

  it("exactly ONE role=status region carries the announcement", () => {
    const { container } = render(
      <ReadAloudBar
        state="playing"
        followLevel="sentence"
        announcement="Reading aloud."
        onPrimary={() => {}}
        onStop={() => {}}
      />,
    );
    const regions = container.querySelectorAll('[role="status"]');
    expect(regions).toHaveLength(1);
    expect(regions[0]!.getAttribute("aria-live")).toBe("polite");
    expect(regions[0]!.textContent).toBe("Reading aloud.");
  });
});
