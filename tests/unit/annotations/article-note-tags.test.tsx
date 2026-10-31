import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ArticleNotes } from "../../../src/reader/annotations/ArticleNotes";
import { editArticleNote, loadArticleNotes } from "../../../src/persistence/articleNotesStore";
import { setArticleTags } from "../../../src/ingestion/library/tagsStore";

vi.mock("../../../src/persistence/articleNotesStore", () => ({
  loadArticleNotes: vi.fn(),
  editArticleNote: vi.fn(),
  deleteArticleNote: vi.fn(),
}));
// Issue #209 — the article-tag namespace is the control here: a note-tag
// commit must never route through it.
vi.mock("../../../src/ingestion/library/tagsStore", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setArticleTags: vi.fn(),
  // The real routeToStoredCasing fail-opens on a stats-read failure; the
  // mock mirrors the fail-open so the commit degrades to the exact write.
  // Tests may override it with a held promise to stage keystrokes INSIDE
  // the routing await (the interrupted-editing race).
  routeToStoredCasing: vi.fn(async (tags: string[]) => tags),
  // Suggestion stats are a lazy focus-time read; the real load would hit
  // IndexedDB in jsdom. The picker degrades to create-only with none.
  loadTagStats: vi.fn(async () => []),
}));
import { routeToStoredCasing } from "../../../src/ingestion/library/tagsStore";

const saved = {
  schemaVersion: 1 as const,
  id: "note-1",
  articleId: "article",
  text: "A kept reflection",
  createdAt: "2026-10-30T00:00:00.000Z",
  updatedAt: "2026-10-30T00:00:00.000Z",
};

it("a keystroke staged during a tag commit's routing await never reverts the commit", async () => {
  vi.mocked(loadArticleNotes).mockResolvedValue({ notes: [saved], drafts: [] });
  vi.mocked(editArticleNote).mockResolvedValue(undefined);
  // Hold the persisted-vocabulary routing open so the keystroke below lands
  // INSIDE the tag commit's await — the exact interrupted-editing window.
  let releaseRouting!: (routed: string[]) => void;
  vi.mocked(routeToStoredCasing).mockImplementationOnce(
    (tags) =>
      new Promise<string[]>((resolve) => {
        releaseRouting = () => resolve([...tags]);
      }),
  );
  render(<ArticleNotes articleId="article" onEditingChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "A kept reflection" }));
  const input = screen.getByLabelText("Add or search a tag");
  const text = screen.getByRole("textbox", { name: "Article note" });

  fireEvent.change(input, { target: { value: "slow-routed" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(routeToStoredCasing).toHaveBeenCalledWith(["slow-routed"]));
  // The reader keeps writing while the routing read is in flight.
  fireEvent.change(text, { target: { value: "A kept reflection, extended" } });
  releaseRouting(["slow-routed"]);

  await waitFor(() => {
    const last = vi.mocked(editArticleNote).mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({
      id: "note-1",
      text: "A kept reflection, extended",
      tags: ["slow-routed"],
    });
  });
});

it("mounts the always-visible tag field and commits tags onto the note only", async () => {
  vi.mocked(loadArticleNotes).mockResolvedValue({ notes: [saved], drafts: [] });
  render(<ArticleNotes articleId="article" onEditingChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "A kept reflection" }));

  // Always visible with the editor — no expansion step.
  const field = screen.getByRole("region", { name: "Article note tags" });
  const input = screen.getByLabelText("Add or search a tag");
  expect(field).toContainElement(input);

  // Enter commits through editArticleNote — with the note's identity and the
  // committed tag — and never through setArticleTags.
  fireEvent.change(input, { target: { value: "to-revisit" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(vi.mocked(editArticleNote)).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "note-1", tags: ["to-revisit"] }),
    ),
  );
  expect(vi.mocked(setArticleTags)).not.toHaveBeenCalled();
  expect(screen.getByText("to-revisit")).toBeInTheDocument();

  // Blur never silently creates a tag.
  fireEvent.change(input, { target: { value: "never-committed" } });
  fireEvent.blur(input);
  expect(screen.queryByText("never-committed")).not.toBeInTheDocument();
  const calls = vi.mocked(editArticleNote).mock.calls.length;
  await act(async () => {});
  expect(vi.mocked(editArticleNote)).toHaveBeenCalledTimes(calls);
});

it("explains that note text is required for a tag-only new draft and keeps it out of the saved list", async () => {
  vi.mocked(loadArticleNotes).mockResolvedValue({ notes: [], drafts: [] });
  vi.mocked(editArticleNote).mockResolvedValue(undefined);
  render(<ArticleNotes articleId="article" onEditingChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add article note" }));

  const field = screen.getByRole("region", { name: "Article note tags" });
  const input = field.querySelector("input")!;
  fireEvent.change(input, { target: { value: "essays" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(vi.mocked(editArticleNote)).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "", tags: ["essays"] }),
    ),
  );
  // The honest register: text is required; nothing claimed saved.
  expect(
    screen.getByRole("region", { name: "Article notes" }).querySelector(":scope > .status"),
  ).toHaveTextContent("Note text is required to save.");
  // Done closes the editor — a tag-only draft is recoverable, never saved.
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Article note tags" })).not.toBeInTheDocument(),
  );
});
