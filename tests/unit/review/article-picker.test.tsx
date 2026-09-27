// tests/unit/review/article-picker.test.tsx
// Issue #107 (the dropped follow-up of decision #72) — the review page's
// ONE searchable ArticlePicker:
//   - the empty-query BROWSE list shows only articles WITH highlights,
//     count-descending with alphabetical ties; counts render (decision
//     #72 — visible counts; the TagPicker counts-never-render rule is a
//     tagging decision, not a picker-family one)
//   - zero-highlight articles stay findable BY SEARCH (with their honest
//     "0 highlights"), never in the browse list
//   - an honest no-match line for an unmatched query
//   - TagPicker keyboard discipline: ArrowDown/Up open + move (wrapping),
//     Enter picks, Escape NOT intercepted, aria combobox wiring
//   - picking reports the article id exactly once (the review host
//     navigates into the URL scope — this unit pins the contract)
//
// jsdom is fine for this component: it owns no layout, no popover API, no
// fonts (the tag-picker.test.tsx precedent). Suggestions filter over the
// EFFECTIVE title (readerTitle override wins — D17-09), pinned here too.
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticlePicker } from "../../../src/ui/ArticlePicker";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";

function makeArticle(id: string, title: string, readerTitle?: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash: "0".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: `${title} body text.` }] },
    ],
    ...(readerTitle !== undefined ? { readerTitle } : {}),
  });
}

const ARTICLES: CanonicalArticle[] = [
  makeArticle("a-beta", "Beta Ledger"),
  makeArticle("a-alpha", "Alpha Field Notes"),
  makeArticle("a-gamma", "Gamma Essays"),
  makeArticle("a-zero", "The Unmarked Notebook"),
];

const COUNTS = new Map([
  ["a-beta", 2],
  ["a-alpha", 1],
  ["a-gamma", 5],
  // a-zero: zero highlights — absent from the fold entirely
]);

function mountPicker(
  overrides: Partial<Parameters<typeof ArticlePicker>[0]> = {},
) {
  const onPick = vi.fn();
  const utils = render(
    <ArticlePicker
      articles={ARTICLES}
      counts={COUNTS}
      inputId="article-picker-under-test"
      onPick={onPick}
      {...overrides}
    />,
  );
  return { onPick, ...utils };
}

/** Option accessible names — title + rendered count text. */
function optionTexts(listbox: HTMLElement): string[] {
  return within(listbox)
    .getAllByRole("option")
    .map((o) => o.textContent);
}

describe("ArticlePicker: browse list (empty query)", () => {
  it("focus shows ONLY highlighted articles, count-desc, ties alphabetical — counts render", async () => {
    const user = userEvent.setup();
    mountPicker();
    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    // gamma (5) → beta (2) → alpha (1); the zero-highlight notebook is
    // noise in the browse list and is absent.
    expect(optionTexts(listbox)).toEqual([
      "Gamma Essays5 highlights",
      "Beta Ledger2 highlights",
      "Alpha Field Notes1 highlight",
    ]);
    expect(within(listbox).queryByText("The Unmarked Notebook")).toBeNull();
  });

  it("singular count vocabulary for a single highlight", async () => {
    const user = userEvent.setup();
    mountPicker();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("1 highlight")).toBeInTheDocument();
    expect(screen.getByText("2 highlights")).toBeInTheDocument();
  });
});

describe("ArticlePicker: search", () => {
  it("a query finds zero-highlight articles, ranked after highlighted ones, honest 0", async () => {
    const user = userEvent.setup();
    mountPicker();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "note");
    // "note" matches Alpha Field Notes (1 highlight) AND the zero-
    // highlight notebook — the notebook is searchable and trails the
    // highlighted match.
    expect(optionTexts(screen.getByRole("listbox"))).toEqual([
      "Alpha Field Notes1 highlight",
      "The Unmarked Notebook0 highlights",
    ]);
  });

  it("search is case-insensitive and highlighted rows rank first by count", async () => {
    const user = userEvent.setup();
    mountPicker();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "E");
    // Every fixture title carries an "e" — full library, ranked.
    expect(optionTexts(screen.getByRole("listbox"))).toEqual([
      "Gamma Essays5 highlights",
      "Beta Ledger2 highlights",
      "Alpha Field Notes1 highlight",
      "The Unmarked Notebook0 highlights",
    ]);
  });

  it("search keys on the EFFECTIVE title (readerTitle override wins — D17-09)", async () => {
    const user = userEvent.setup();
    const renamed = [makeArticle("a-renamed", "Canonical Boring Title", "Reader's Chosen Name")];
    mountPicker({ articles: renamed, counts: new Map([["a-renamed", 1]]) });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "chosen");
    expect(optionTexts(screen.getByRole("listbox"))).toEqual([
      "Reader's Chosen Name1 highlight",
    ]);
    // A canonical-only substring is NOT searchable — the override is the
    // ONE name (D17-08); the honest no-match option answers instead.
    await user.clear(input);
    await user.type(input, "boring");
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute("aria-disabled", "true");
    expect(options[0]!.textContent).toBe("No articles match “boring”");
  });

  it("an unmatched query renders the honest no-match line as a disabled option", async () => {
    const user = userEvent.setup();
    mountPicker();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "zzz-nothing");
    const listbox = screen.getByRole("listbox");
    // The no-match line IS the listbox's sole (disabled, unselectable)
    // option — the listbox never renders option-less (axe
    // aria-required-children), and keyboard active can never land on it.
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute("aria-disabled", "true");
    expect(options[0]!.textContent).toBe("No articles match “zzz-nothing”");
    // The keyboard can still not commit anything: Enter does nothing.
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("suggestions cap at 8 — the TagPicker register", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) =>
      makeArticle(`m-${i}`, `Cap Corpus ${String(i).padStart(2, "0")}`),
    );
    mountPicker({
      articles: many,
      counts: new Map(many.map((a) => [a.id, 1])),
    });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "Cap Corpus");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(8);
  });

  it("a query matching the whole cap of highlighted articles keeps the zero-highlight match visible (decision #72 — findable by search)", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) =>
      makeArticle(`m-${i}`, `Cap Corpus ${String(i).padStart(2, "0")}`),
    );
    // Zero highlights — absent from the counts fold entirely.
    const stranded = makeArticle("m-stranded", "Cap Corpus Zero");
    mountPicker({
      articles: [...many, stranded],
      counts: new Map(many.map((a) => [a.id, 1])),
    });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "Cap Corpus");
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    // The cap holds at 8 — but the matching zero-count row takes the
    // reserved last slot instead of being pushed past the cap by the
    // highlighted head.
    expect(options).toHaveLength(8);
    expect(options[0]).toHaveTextContent("1 highlight");
    expect(options.at(-1)).toHaveTextContent("Cap Corpus Zero0 highlights");
  });

  it("a query matching only zero-highlight articles fills the cap with honest zeros", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) =>
      makeArticle(`m-${i}`, `Cap Corpus ${String(i).padStart(2, "0")}`),
    );
    mountPicker({ articles: many, counts: new Map() });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "Cap Corpus");
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(8);
    for (const option of options) {
      expect(option).toHaveTextContent("0 highlights");
    }
  });
});

describe("ArticlePicker: keyboard + picking", () => {
  it("ArrowDown opens the closed list, moves active (aria-selected), wraps; Enter picks the active", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    mountPicker({ onPick });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.click(input);
    const listbox = screen.getByRole("listbox");
    // Active starts at 0 (gamma). Two ArrowDowns walk gamma → beta →
    // alpha; a third wraps back to the head.
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(
      within(listbox).getByRole("option", { selected: true }).textContent,
    ).toBe("Alpha Field Notes1 highlight");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("article-picker-under-test-listbox"),
    );
    await user.keyboard("{ArrowDown}");
    expect(
      within(listbox).getByRole("option", { selected: true }).textContent,
    ).toBe("Gamma Essays5 highlights");
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("a-gamma");
  });

  it("ArrowUp from the bare focused input opens and lands on the LAST option", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    mountPicker({ onPick });
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onPick).toHaveBeenCalledWith("a-alpha");
  });

  it("Enter on the bare focused input picks the active browse suggestion (focus opens the list — the keyboard browse path)", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    mountPicker({ onPick });
    const input = screen.getByRole("combobox");
    act(() => input.focus());
    // Focus alone opens the browse list (the click-to-pick register);
    // Enter then commits the active (head) suggestion.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("a-gamma");
  });

  it("mousedown on a suggestion picks it", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    mountPicker({ onPick });
    await user.click(screen.getByRole("combobox"));
    const option = within(screen.getByRole("listbox")).getByRole("option", {
      name: /Beta Ledger/,
    });
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    expect(onPick).toHaveBeenCalledWith("a-beta");
  });

  it("Escape is NOT intercepted — the list stays open, focus stays put (the route's calm no-op)", async () => {
    const user = userEvent.setup();
    mountPicker();
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(input).toHaveFocus();
  });
});

describe("ArticlePicker: aria wiring", () => {
  it("combobox input exposes expanded + controls + the listbox contract", async () => {
    const user = userEvent.setup();
    mountPicker();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute(
      "aria-controls",
      "article-picker-under-test-listbox",
    );
    await user.click(input);
    const listbox = screen.getByRole("listbox");
    expect(listbox.id).toBe("article-picker-under-test-listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
  });
});
