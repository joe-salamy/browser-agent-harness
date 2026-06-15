import { expect, test } from "@playwright/test";

test("MVP workspace run creates sourced output, audit events, and export", async ({ page }) => {
  test.skip(!process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY required for full MVP E2E verification.");
  const runId = Date.now();
  const filePath = `e2e-notes-${runId}.md`;
  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).click();
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();

  await page.getByRole("link", { name: /Demo Workspace/ }).click();
  await expect(page.getByRole("heading", { name: "Demo Workspace" })).toBeVisible();

  await page.getByLabel("File").setInputFiles({
    name: filePath,
    mimeType: "text/markdown",
    buffer: Buffer.from(`# Notes\nAcme wants a browser-native agent workspace. Cite ${filePath}.`),
  });
  await page.getByLabel("Workspace path").fill(filePath);
  await page.getByRole("button", { name: /upload file/i }).click();
  await expect(page.getByRole("link", { name: filePath })).toBeVisible();

  const credentialLabel = `E2E OpenRouter ${runId}`;
  await page.getByRole("link", { name: /model settings/i }).click();
  await page.getByLabel("Label").fill(credentialLabel);
  await page.getByLabel("OpenRouter API key").fill(process.env.OPENROUTER_API_KEY!);
  await page.getByRole("button", { name: /save credential/i }).click();
  const credentialRow = page.getByRole("row").filter({ hasText: credentialLabel });
  await expect(credentialRow).toContainText("OPENROUTER");
  await expect(credentialRow).toContainText("yes");
  await page.getByText("← Workspace").click();

  await page.getByLabel("Instructions").fill("Always cite workspace filenames.");
  await page.getByRole("button", { name: /save instructions/i }).click();

  await page.getByLabel("Prompt").fill(`Create a one paragraph summary that cites ${filePath} by filename.`);
  await page.getByRole("button", { name: /run agent/i }).click();
  await expect(page.getByText(/Status: SUCCEEDED/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: /open output file/i }).click();
  await expect(page.getByText(filePath)).toBeVisible();

  for (const eventType of ["agent.run.started", "agent.model.called", "agent.output.created", "agent.run.succeeded"]) {
    await expect(page.getByText(eventType)).toBeVisible();
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /download workspace export/i }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const archive = Buffer.concat(chunks).toString("utf8");
  expect(archive).toContain(filePath);
  expect(archive).toContain("outputs/");
  expect(archive).toContain("audit-log.json");
});
