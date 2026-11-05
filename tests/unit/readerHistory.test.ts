import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leaveArticleToLibrary, navigateToChapter } from "../../src/reader/readerHistory";

beforeEach(() => {
  history.replaceState(null, "", "#/article/first-chapter");
});

afterEach(() => vi.restoreAllMocks());

describe("chapter-session close navigation", () => {
  it("skips every pushed chapter to the original in-app destination", () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    navigateToChapter("second-chapter", true);
    navigateToChapter("third-chapter", true);
    leaveArticleToLibrary(true);
    expect(go).toHaveBeenCalledWith(-3);
  });

  it("keeps a cold chapter session's close inside the app after later crossings", () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    navigateToChapter("second-chapter", false);
    navigateToChapter("third-chapter", true);
    leaveArticleToLibrary(true);
    expect(window.location.hash).toBe("#/");
    expect(go).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it("a reload's cold entry retires the previous session's exit depth", () => {
    navigateToChapter("second-chapter", true);
    navigateToChapter("third-chapter", false);
    leaveArticleToLibrary(true);
    expect(window.location.hash).toBe("#/");
  });

  it("preserves unrelated history state on the departing entry", () => {
    history.replaceState({ unrelated: "retained" }, "");
    const states: unknown[] = [];
    const replace = history.replaceState.bind(history);
    vi.spyOn(history, "replaceState").mockImplementation((state, unused, url) => {
      states.push(state);
      replace(state, unused, url);
    });
    navigateToChapter("second-chapter", true);
    expect(states[0]).toMatchObject({ unrelated: "retained" });
  });
});
