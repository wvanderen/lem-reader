import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNavigationIntent } from "../../../src/reader/useNavigationIntent";

describe("asynchronous collection navigation", () => {
  it("allows the current intent, but retires it on a newer press", () => {
    const { result } = renderHook(useNavigationIntent);
    const first = result.current();
    expect(first()).toBe(true);
    const second = result.current();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("retires a delayed continuation on departure even before hashchange dispatch", () => {
    const { result } = renderHook(useNavigationIntent);
    const isCurrent = result.current();
    const original = window.location.href;
    window.history.replaceState(null, "", "#/elsewhere");
    expect(isCurrent()).toBe(false);
    window.history.replaceState(null, "", original);
  });

  it("does not revive an intent after leaving and returning to the same hash", () => {
    const { result } = renderHook(useNavigationIntent);
    const isCurrent = result.current();
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(isCurrent()).toBe(false);
  });

  it("retires a delayed continuation when its view unmounts", () => {
    const { result, unmount } = renderHook(useNavigationIntent);
    const isCurrent = result.current();
    unmount();
    expect(isCurrent()).toBe(false);
  });
});
