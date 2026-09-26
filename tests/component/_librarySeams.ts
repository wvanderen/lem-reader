// tests/component/_librarySeams.ts
// Issue #101 — the App test's persistence-seam stubs, defined once. The
// library snapshot composes EVERY store seam in one Promise.all; in jsdom
// (no IndexedDB in files that mock the repository) the un-mocked seams
// reject on open, so each store module is stubbed resolved-empty via
// importOriginal (the rest of the module stays real) — the PENDING
// listArticles mock alone owns the load state the file pins.
import { vi } from "vitest";

/**
 * Return the real module with ONE async read seam replaced by a mock that
 * resolves to `value`. `seam` is the export name to stub.
 */
export async function seamsResolvedEmpty<M extends object>(
  importOriginal: () => Promise<M>,
  seam: string,
  value: unknown,
): Promise<M> {
  const actual = await importOriginal();
  return { ...actual, [seam]: vi.fn(async () => value) } as M;
}
