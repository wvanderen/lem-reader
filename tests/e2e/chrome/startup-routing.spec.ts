import { test, expect } from "@playwright/test";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { ArticleSchema } from "../../../src/content/schema";

const article = ArticleSchema.parse({
  id: "startup-route",
  revision: 1,
  lang: "en",
  provenance: {
    title: "The arriving reading",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "startup-route",
  },
  blocks: [{ kind: "paragraph", content: [{ text: "A quiet opening passage." }] }],
});

test("a route arriving between initial render and subscription is not lost", async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
  await page.addInitScript((id) => {
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this === window && type === "hashchange") {
        // Deliver exactly at the render→subscription seam. replaceState
        // models a hashchange that has ALREADY dispatched: there is no
        // queued event for the new subscriber to rescue the initial view.
        EventTarget.prototype.addEventListener = original;
        history.replaceState(null, "", `#/article/${id}`);
      }
      return original.call(this, type, listener, options);
    };
  }, article.id);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`#/article/${article.id}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: article.provenance.title }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toHaveCount(0);
});
