import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ArticleNotes } from "../../../src/reader/annotations/ArticleNotes";
import { loadArticleNotes } from "../../../src/persistence/articleNotesStore";

vi.mock("../../../src/persistence/articleNotesStore", () => ({
  loadArticleNotes: vi.fn(),
  editArticleNote: vi.fn(),
  deleteArticleNote: vi.fn(),
}));

it("keeps the same live region mounted for load errors and editor transitions", async () => {
  let rejectLoad!: (reason: Error) => void;
  vi.mocked(loadArticleNotes).mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectLoad = reject;
    }),
  );
  render(<ArticleNotes articleId="article" onEditingChange={vi.fn()} />);
  // The component's OWN live region (TagEntry mounts its own inside the
  // editor — the same two-region shape as the highlight panel).
  const ownStatus = () =>
    screen
      .getByRole("region", { name: "Article notes" })
      .querySelector<HTMLDivElement>(":scope > .status")!;
  const status = ownStatus();
  expect(status).toBeEmptyDOMElement();
  await act(async () => rejectLoad(new Error("storage unavailable")));
  expect(status).toHaveTextContent("Couldn't load article notes");
  fireEvent.click(screen.getByRole("button", { name: "Add article note" }));
  expect(ownStatus()).toBe(status);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(ownStatus()).toBe(status);
});
