// tests/unit/readaloud/follow.test.ts
// Issue #42 — the follow-behavior decision policy truth table
// (src/readaloud/follow.ts). The one rule under test: the follower never
// fights the reader — manual navigation suspends following, and following
// silently resumes when speech re-enters the reader's current view.
import { describe, expect, it } from "vitest";
import {
  paginatedFollowDecision,
  scrollingFollowDecision,
} from "../../../src/readaloud/follow";

describe("paginatedFollowDecision", () => {
  it("turns to the spoken page while following (the auto page-turn)", () => {
    expect(
      paginatedFollowDecision({ suspended: false, displayedPage: 2, spokenPage: 3 }),
    ).toEqual({ action: "turn", suspended: false });
  });

  it("stays put when speech is on the displayed page", () => {
    expect(
      paginatedFollowDecision({ suspended: false, displayedPage: 3, spokenPage: 3 }),
    ).toEqual({ action: "none", suspended: false });
  });

  it("a manual turn suspends: speech on another page does NOT turn", () => {
    expect(
      paginatedFollowDecision({ suspended: true, displayedPage: 0, spokenPage: 4 }),
    ).toEqual({ action: "none", suspended: true });
  });

  it("speech re-entering the displayed page re-acquires following", () => {
    expect(
      paginatedFollowDecision({ suspended: true, displayedPage: 4, spokenPage: 4 }),
    ).toEqual({ action: "none", suspended: false });
  });
});

describe("scrollingFollowDecision", () => {
  it("scrolls when the spoken passage is out of view while following", () => {
    expect(scrollingFollowDecision({ suspended: false, spokenInView: false })).toEqual({
      action: "scroll",
      suspended: false,
    });
  });

  it("stays put while the spoken passage is in view", () => {
    expect(scrollingFollowDecision({ suspended: false, spokenInView: true })).toEqual({
      action: "none",
      suspended: false,
    });
  });

  it("a manual scroll suspends: out-of-view speech does NOT yank back", () => {
    expect(scrollingFollowDecision({ suspended: true, spokenInView: false })).toEqual({
      action: "none",
      suspended: true,
    });
  });

  it("the spoken passage re-entering the viewport re-acquires following", () => {
    expect(scrollingFollowDecision({ suspended: true, spokenInView: true })).toEqual({
      action: "none",
      suspended: false,
    });
  });
});
