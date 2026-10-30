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
  const status = screen.getByRole("status");
  expect(status).toBeEmptyDOMElement();
  await act(async () => rejectLoad(new Error("storage unavailable")));
  expect(status).toHaveTextContent("Couldn't load article notes");
  fireEvent.click(screen.getByRole("button", { name: "Add article note" }));
  expect(screen.getByRole("status")).toBe(status);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(screen.getByRole("status")).toBe(status);
});
