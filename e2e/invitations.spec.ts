import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("only the owner can invite; the recipient can immediately sign in to a private workspace", async ({ page, browser }) => {
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "Invite a learner" });
  await expect(section).toBeVisible();
  await section.getByLabel("Learner’s email address").fill(" App-Invited@Example.com ");
  await section.getByRole("button", { name: "Send invitation" }).click();
  await expect(section.getByRole("status")).toContainText("app-invited@example.com");
  await expect(section.getByRole("status")).toContainText("accepted for sending");
  await page.reload(); await expect(section).toBeVisible();

  const learnerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const learner = await learnerContext.newPage();
  await learner.goto("/login"); await learner.getByLabel("Email address").fill("app-invited@example.com");
  await learner.getByRole("button", { name: "Email me a code" }).click();
  await expect(learner.getByLabel("Login code")).toBeVisible();
  const messages = readFileSync("data/login-e2e-outbox.jsonl", "utf8").trim().split("\n").map(line => JSON.parse(line));
  await learner.getByLabel("Login code").fill(messages.filter(message => message.email === "app-invited@example.com").at(-1).code);
  await learner.getByLabel("Login code").press("Enter");
  await expect(learner.getByLabel("What do you want to learn?")).toBeVisible();
  await learner.goto("/settings"); await expect(learner.getByLabel(/About me/)).toHaveValue("");
  await expect(learner.getByRole("region", { name: "Invite a learner" })).toHaveCount(0);
  expect((await learnerContext.request.post("/api/invitations", { data: { email: "not-allowed@example.com" } })).status()).toBe(403);
  await learnerContext.close();
});
