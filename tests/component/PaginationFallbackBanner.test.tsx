// tests/component/PaginationFallbackBanner.test.tsx
// Issue #240 — the banner renders the VALIDATED failure explanation (never a
// generic inference), and its escape routes differ per failure class:
//   unpageable-content — the disclosed session flip already happened; the
//     banner offers the reversible "Switch to pages" + original source.
//   processing-error — modes are untouched; the banner offers "Try pages
//     again" + explicit "Read in scrolling" + original source.
// The one polite status-region discipline holds (role=status, atomic), and
// copy is static per class — diagnostic fields never render raw.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaginationFallbackBanner } from "../../src/reader/PaginationFallbackBanner";
import { classifyPaginationFailure } from "../../src/reader/paginationFailure";
import type { PaginationFailure } from "../../src/reader/paginationFailure";

const failureFor = (kind: "dom-fallback" | "measurement-error", reason?: string): PaginationFailure => {
  const classified = classifyPaginationFailure(
    kind === "measurement-error"
      ? { kind: "measurement-error", message: "boom", ts: new Date().toISOString() }
      : { kind: "dom-fallback", ts: new Date().toISOString(), ...(reason !== undefined ? { reason } : {}) },
  );
  if (!classified) throw new Error("expected a classified failure");
  return classified;
};

describe("PaginationFallbackBanner (issue #240)", () => {
  it("renders the specific unpageable-content heading, the scrolling disclosure, and Switch to pages", async () => {
    const onSwitchToPages = vi.fn();
    const onDismiss = vi.fn();
    render(
      <PaginationFallbackBanner
        failure={failureFor("dom-fallback", "oversized-block")}
        originalSourceUrl="https://example.com/post"
        onSwitchToPages={onSwitchToPages}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "An element in this article is too large to fit on one page.",
    );
    expect(screen.getByText(/Switched to scrolling so you can keep reading/)).toBeInTheDocument();
    // The polite announce rides the status region.
    expect(screen.getByText("Switched to scrolling reading.")).toBeInTheDocument();
    // Escape routes: reversible pages + the original source.
    expect(screen.getByRole("button", { name: "Switch to pages" })).toBeInTheDocument();
    const source = screen.getByRole("link", { name: /See the original/ });
    expect(source).toHaveAttribute("href", "https://example.com/post");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(source).toHaveAttribute("target", "_blank");
    // A processing error's retry/scrolling actions never appear here.
    expect(screen.queryByRole("button", { name: "Try pages again" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Read in scrolling" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Switch to pages" }));
    expect(onSwitchToPages).toHaveBeenCalledTimes(1);
  });

  it("renders the distinct processing-error copy with retry + scrolling escape routes and no mode claim", async () => {
    const onRetryPages = vi.fn();
    const onContinueScrolling = vi.fn();
    const onDismiss = vi.fn();
    render(
      <PaginationFallbackBanner
        failure={failureFor("dom-fallback", "zero-progress")}
        onRetryPages={onRetryPages}
        onContinueScrolling={onContinueScrolling}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Preparing this article as pages didn't finish.",
    );
    expect(screen.getByText(/Something went wrong while preparing pages/)).toBeInTheDocument();
    expect(screen.getByText("Preparing pages failed. You can try again or read in scrolling.")).toBeInTheDocument();
    // No false disclosure: processing errors did NOT flip the mode.
    expect(screen.queryByText(/Switched to scrolling/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try pages again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read in scrolling" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try pages again" }));
    expect(onRetryPages).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Read in scrolling" }));
    expect(onContinueScrolling).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders the measurement-error processing failure without the diagnostic message", () => {
    render(
      <PaginationFallbackBanner
        failure={failureFor("measurement-error")}
        onRetryPages={vi.fn()}
        onContinueScrolling={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Preparing this article as pages didn't finish.",
    );
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("omits the original-source route when the article has no source URL", () => {
    render(
      <PaginationFallbackBanner
        failure={failureFor("dom-fallback", "unsplittable-block-overflow")}
        onSwitchToPages={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link", { name: /See the original/ })).toBeNull();
  });

  it("dismisses from either class", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <PaginationFallbackBanner failure={failureFor("dom-fallback", "oversized-block")} onDismiss={onDismiss} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(
      <PaginationFallbackBanner failure={failureFor("dom-fallback", "zero-progress")} onDismiss={onDismiss} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("keeps the one-polite-status-region discipline (role=status, polite, atomic)", () => {
    const { container } = render(
      <PaginationFallbackBanner
        failure={failureFor("dom-fallback", "page-ceiling")}
        onSwitchToPages={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const region = container.querySelector(".status.pagination-fallback-banner");
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });
});
