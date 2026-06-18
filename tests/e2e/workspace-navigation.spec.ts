import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).click();
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
}

test("workspace navigation omits removed automation route", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: /Demo Workspace/ }).click();
  await expect(
    page.getByRole("heading", { name: "Demo Workspace" }),
  ).toBeVisible();
  const workspaceUrl = page.url();

  await expect(page.getByRole("link", { name: "Automation" })).toHaveCount(0);

  const response = await page.goto(`${workspaceUrl}/automation`);
  expect(response?.status()).toBe(404);
});
