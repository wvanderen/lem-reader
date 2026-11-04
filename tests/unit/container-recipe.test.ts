// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the Node image ARG is expanded in FROM, never COPY --from", () => {
  const recipe = readFileSync(
    new URL("../../docker/playwright.Dockerfile", import.meta.url),
    "utf-8",
  );
  // Docker is not available to ordinary unit tests. This catches the specific
  // unsupported syntax; a real image build remains part of container evidence.
  expect(recipe).toMatch(/^FROM node:\$\{NODE_VERSION\}-slim AS node-runtime$/m);
  expect(recipe).toMatch(
    /^COPY --from=node-runtime \/usr\/local\/bin\/node \/usr\/local\/bin\/node$/m,
  );
  expect(recipe).not.toMatch(/^COPY --from=\S*\$/m);
});
