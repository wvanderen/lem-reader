// tests/unit/library/tag-picker.test.tsx
// Issue #75 (decision #71) — the ONE shared TagPicker (variant A refined):
//   - most-used suggestion order with type-to-filter; counts never render
//   - ArrowDown/Up + Enter keyboard completion; aria combobox wiring
//   - case-insensitive routing to the stored casing (Q7A), against stats
//     AND against the live selection (the stale-stats defense)
//   - inline create-new for an unmatched draft; toggle-off on re-pick
//   - pill chips with the inside-× remove; chips BELOW the input
//   - explicit focus management: focusOnMount only when asked (the reader's
//     TagEntry host must stay inert at mount — Pitfall 8-5)
//
// jsdom is fine for this component: it owns no layout, no popover API, no
// fonts. The real-browser suggestion geometry is the e2e suite's job.
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagPicker } from "../../../src/ui/TagPicker";
import type { TagStat } from "../../../src/ingestion/library/tagsStore";

const STATS: TagStat[] = [
  { tag: "essays", count: 3 },
  { tag: "slow-web", count: 2 },
  { tag: "attention", count: 2 },
  { tag: "books", count: 1 },
];

function mountPicker(overrides: Partial<Parameters<typeof TagPicker>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <TagPicker
      stats={STATS}
      selected={[]}
      onChange={onChange}
      inputId="picker-under-test"
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

async function openSuggestions(input: HTMLInputElement, draft: string) {
  const user = userEvent.setup();
  await user.type(input, draft);
  return { user, listbox: screen.getByRole("listbox") };
}

describe("TagPicker: suggestions + filtering", () => {
  it("renders the combobox input with the shared placeholder", () => {
    mountPicker();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("placeholder", "Add or search a tag…");
  });

  it("shows most-used suggestions on focus-empty draft (ordering rides the stats fold)", async () => {
    const user = userEvent.setup();
    mountPicker();
    const input = screen.getByRole("combobox");
    await user.click(input);
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "essays",
      "slow-web",
      "attention",
      "books",
    ]);
  });

  it("filters by case-insensitive substring of the draft; a non-exact draft still offers create", async () => {
    mountPicker();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    const { listbox } = await openSuggestions(input, "ES");
    const options = within(listbox).getAllByRole("option");
    // "essays" matches the substring; "ES" itself is NOT a case-duplicate of
    // it (different letters — Q7A covers near-CASE duplicates), so the
    // inline create option legitimately rides along.
    expect(options.map((o) => o.textContent)).toEqual(["essays", "Add “ES”"]);
  });

  it("counts NEVER render — the numbers live in the ordering only (Q6)", async () => {
    mountPicker();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await openSuggestions(input, "essays");
    expect(screen.getByRole("listbox").textContent).not.toMatch(/\d/);
  });

  it("already-selected tags never reappear as suggestions (any casing)", async () => {
    const user = userEvent.setup();
    mountPicker({ selected: ["ESSAYS"] });
    const input = screen.getByRole("combobox");
    await user.click(input);
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "slow-web",
      "attention",
      "books",
    ]);
  });
});

describe("TagPicker: keyboard + picking", () => {
  it("ArrowDown/ArrowUp move the active option; Enter picks the active (stored casing)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mountPicker({ onChange });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "tt"); // matches "attention" + the create option
    await user.keyboard("{ArrowDown}{ArrowDown}"); // wrap: attention → create → attention
    const active = within(screen.getByRole("listbox")).getByRole("option", {
      selected: true,
    });
    expect(active.textContent).toBe("attention");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("picker-under-test-listbox"),
    );
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["attention"]);
  });

  it("ArrowUp reopens the post-commit closed list — Enter then picks (no invisible active)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // A STATEFUL host: the commit's selection feeds back into `selected`,
    // so the reopened list excludes it like every real host does.
    function Host() {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <TagPicker
          stats={STATS}
          selected={selected}
          onChange={(next) => {
            onChange(next);
            setSelected(next);
          }}
          inputId="picker-under-test"
        />
      );
    }
    render(<Host />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "books");
    const option = within(screen.getByRole("listbox")).getByRole("option", {
      name: "books",
    });
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(onChange).toHaveBeenCalledWith(["books"]);
    // Flush the commit's state batch before asserting the closed list.
    await act(async () => {});
    // The commit closes the list; focus STAYS on the input — the
    // closed-but-focused state a bare ArrowUp must recover from (the
    // pre-fix hole: ArrowUp mutated `active` invisibly, Enter committed
    // nothing).
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{ArrowUp}"); // wraps to the LAST remaining suggestion
    const active = within(screen.getByRole("listbox")).getByRole("option", {
      selected: true,
    });
    expect(active.textContent).toBe("attention");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["books", "attention"]);
  });

  it("Enter on an unmatched draft offers + commits the inline create", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mountPicker({ onChange });
    const input = screen.getByRole("combobox");
    await user.type(input, "brand-new");
    const create = within(screen.getByRole("listbox")).getByText("Add “brand-new”");
    expect(create).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["brand-new"]);
    // The draft clears after a commit (the field is ready for the next tag).
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  });

  it("Q7A — typing a near-case duplicate of a SELECTED tag toggles it off (no twin stacking)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mountPicker({ selected: ["essays"], onChange });
    const input = screen.getByRole("combobox");
    await user.type(input, "ESSAYS");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("clicking a suggestion commits it (mousedown keeps the typing anchor)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mountPicker({ onChange });
    const input = screen.getByRole("combobox");
    await user.type(input, "books");
    const option = within(screen.getByRole("listbox")).getByRole("option", {
      name: "books",
    });
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(onChange).toHaveBeenCalledWith(["books"]);
  });
});

describe("TagPicker: chips", () => {
  it("renders selected tags as pill chips BELOW the input, × inside", () => {
    mountPicker({ selected: ["essays", "slow-web"] });
    const picker = screen.getByRole("combobox").closest(".tag-picker")!;
    const chips = picker.querySelector(".tag-picker-chips")!;
    // The chips ul follows the input row in DOM order (the typing anchor
    // never shifts when the first chip appears).
    expect(picker.lastElementChild).toBe(chips);
    expect(chips.querySelectorAll(".tag-picker-pill").length).toBe(2);
  });

  it("the inside-× removes exactly its tag", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mountPicker({ selected: ["essays", "slow-web"], onChange });
    await user.click(screen.getByRole("button", { name: "Remove tag essays" }));
    expect(onChange).toHaveBeenCalledWith(["slow-web"]);
  });
});

describe("TagPicker: focus discipline", () => {
  it("focusOnMount focuses the input (explicitly-opened popover hosts)", () => {
    mountPicker({ focusOnMount: true });
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("default mount is INERT — no focus steal (Pitfall 8-5)", () => {
    mountPicker();
    expect(screen.getByRole("combobox")).not.toHaveFocus();
  });
});
