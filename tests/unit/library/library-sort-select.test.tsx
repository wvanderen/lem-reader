// tests/unit/library/library-sort-select.test.tsx
// Issue #115 — component coverage for the library sort control. The
// e2e suite owns ordering truth in real browsers; this suite pins the
// CONTROL contract:
//   1. the native <select> renders the three options with the persisted
//      value selected, labeled "Sort library by" (visually hidden label —
//      the LibrarySearch precedent);
//   2. a change lifts the new LibrarySortKind to the parent (LibraryView
//      writes it through SettingsContext — persistence + bundle travel);
//   3. keyboard operation: the native select receives focus and changes
//      by keyboard events (RTL fireEvent.change models the committed
//      selection; real key handling is browser-native and covered in e2e).
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LibrarySortSelect } from "../../../src/ingestion/library/LibrarySortSelect";

describe("LibrarySortSelect (issue #115)", () => {
  it("renders the three orders with the persisted value selected and the hidden label as its accessible name", () => {
    render(<LibrarySortSelect sort="recently-added" onSortChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Sort library by" });
    expect(select).not.toBeNull();
    const options = Array.from((select as HTMLSelectElement).options).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(["Recently added", "Title", "Recently opened"]);
    expect((select as HTMLSelectElement).value).toBe("recently-added");
  });

  it("reflects a non-default persisted choice (the restored preference)", () => {
    render(<LibrarySortSelect sort="title" onSortChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Sort library by" }) as HTMLSelectElement;
    expect(select.value).toBe("title");
  });

  it("lifts the chosen LibrarySortKind to the parent on change", () => {
    const onSortChange = vi.fn();
    render(<LibrarySortSelect sort="recently-added" onSortChange={onSortChange} />);
    const select = screen.getByRole("combobox", { name: "Sort library by" });
    fireEvent.change(select, { target: { value: "recently-opened" } });
    expect(onSortChange).toHaveBeenCalledWith("recently-opened");
  });

  it("stays controllable — the DOM value follows the prop, not the event", () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <LibrarySortSelect sort="recently-added" onSortChange={onSortChange} />,
    );
    const select = screen.getByRole("combobox", { name: "Sort library by" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "title" } });
    // The parent owns the value: until it passes a new prop, the select
    // still shows the old choice (the LibrarySearch controlled discipline).
    expect(select.value).toBe("recently-added");
    rerender(<LibrarySortSelect sort="title" onSortChange={onSortChange} />);
    expect(select.value).toBe("title");
  });
});
