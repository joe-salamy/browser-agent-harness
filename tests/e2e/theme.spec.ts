import { expect, test } from "@playwright/test";

test("theme toggle persists and overrides system preference", async ({ page }) => {
  await page.goto("/");
  const select = page.getByLabel("Color theme");

  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

  await select.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("bah-theme"))).toBe(
    "dark",
  );

  await select.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await select.selectOption("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

  await select.selectOption("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("system dark preference applies dark palette without data-theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  const background = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim(),
  );
  expect(background).toBe("#0f172a");
});
