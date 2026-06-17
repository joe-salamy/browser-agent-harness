import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).click();
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
}

async function chooseRunMode(page: Page, name: "New run" | "Resume") {
  const radio = page.getByRole("radio", { name });
  if ((await radio.count()) > 0) {
    await radio.first().check();
    return;
  }

  const tab = page.getByRole("tab", { name });
  if ((await tab.count()) > 0) {
    await tab.first().click();
    return;
  }

  await page.getByRole("button", { name }).click();
}

test("Automation dry-runs manifest creation, chain runs, and resumes", async ({
  page,
}) => {
  await signIn(page);

  await page.getByRole("link", { name: /Demo Workspace/ }).click();
  await expect(
    page.getByRole("heading", { name: "Demo Workspace" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Automation" }).click();
  await expect(page).toHaveURL(/\/workspaces\/[^/]+\/automation$/);
  await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible();

  await page.getByLabel("Goal").fill("Summarize workspace files.");
  await page.getByRole("button", { name: "Preview manifest creation" }).click();
  await expect(page.getByText(/Status: DRY_RUN/).first()).toBeVisible();
  await expect(page.getByText(/Goal characters:/)).toBeVisible();

  const manifest = {
    version: 1,
    id: "e2e-dry-run-chain",
    name: "E2E Dry Run Chain",
    steps: [
      {
        id: "summarize",
        skillId: "server.research-synthesis",
        prompt: "Summarize the supplied workspace context.",
        outputPath:
          "chains/e2e-dry-run-chain/{{runId}}/{{stepIndex}}-summarize.md",
      },
    ],
  };

  await chooseRunMode(page, "New run");
  await page.getByRole("radio", { name: "Paste/import manifest JSON" }).check();
  await page
    .getByRole("textbox", { name: /manifest json/i })
    .fill(JSON.stringify(manifest, null, 2));
  await page
    .getByLabel("Initial input")
    .fill("Use the workspace files to produce a concise summary.");
  await page.getByRole("button", { name: "Preview chain run" }).click();
  await expect(page.getByText(/Status: DRY_RUN/).last()).toBeVisible();
  await expect(page.getByText(/Mode: new/)).toBeVisible();
  await expect(page.getByText("e2e-dry-run-chain")).toBeVisible();

  await chooseRunMode(page, "Resume");
  await page
    .getByLabel("State file path")
    .fill("chains/example/run/chain-state.json");
  await page.getByRole("button", { name: "Preview resume" }).click();
  await expect(page.getByText(/Status: DRY_RUN/).last()).toBeVisible();
  await expect(page.getByText(/Mode: resume/)).toBeVisible();
});
