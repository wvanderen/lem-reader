import { test, expect } from "@playwright/test";

test("page fade is opt-in, persists, and obeys live reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    (window as unknown as { turnFades: number }).turnFades = 0;
    Element.prototype.animate = function (...args) {
      if (this.matches(".page-fragment")) {
        (window as unknown as { turnFades: number }).turnFades++;
      }
      return animate.apply(this, args);
    };
  });
  const fades = () => page.evaluate(() => (window as unknown as { turnFades: number }).turnFades);
  await page.goto("http://localhost:5173/#/article/essay-long-form");
  const fragment = page.locator(".page-fragment");
  await expect(fragment).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(fragment).toHaveAttribute("aria-label", "Page 2");
  expect(await fades()).toBe(0);
  await page.getByRole("button", { name: "Reading settings" }).click();
  const toggle = page.getByRole("checkbox", { name: "Animate page turns" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(fragment).toHaveAttribute("aria-label", "Page 3");
  expect(await fades()).toBe(1);
  await expect(fragment).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => fragment.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.getByRole("button", { name: "Previous page", exact: true }).click();
  await expect(fragment).toHaveAttribute("aria-label", "Page 2");
  expect(await fades()).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lem-settings-mirror-v1") ?? "{}").animatePageTurns)).toBe(true);
  await page.reload();
  await expect(fragment).toBeVisible();
  expect(await fades()).toBe(0);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(toggle).toBeChecked();
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/lem-motion-settings.png", fullPage: true });
  await toggle.uncheck();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  expect(await fades()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Reading settings" }).click();
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeVisible();
  await expect(page.locator("#page-turn-motion-help")).toBeVisible();
  await page.screenshot({ path: "/tmp/lem-motion-settings-mobile.png", fullPage: true });
});
