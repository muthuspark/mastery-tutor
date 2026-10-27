import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
test.use({ storageState: { cookies: [], origins: [] } });

test("landing page fits the viewport and keeps code-entry and errors usable", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("img", { name: /Isaac Newton/ })).toBeVisible();
  for (const [width, height] of [[1440, 900], [1366, 768], [768, 1024], [390, 844], [375, 667], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth,
      vertical: document.documentElement.scrollHeight > innerHeight,
    })), `${width} × ${height}`).toEqual({ horizontal: false, vertical: false });
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeInViewport();
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route("**/api/auth/email-otp/send-verification-otp", route => route.fulfill({ json: { success: true } }));
  await page.route("**/api/auth/sign-in/email-otp", route => route.fulfill({ status: 400, json: { error: { message: "This code is incorrect. Please try again." } } }));
  await page.getByLabel("Email address").fill("mobile@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Login code")).toBeFocused();
  await page.getByLabel("Login code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#login-error")).toContainText("This code is incorrect");
  for (const [width, height] of [[375, 667], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), `Code error at ${width} × ${height}`).toBe(true);
    await expect(page.getByRole("button", { name: "Change email" })).toBeInViewport();
  }
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByLabel("Email address")).toBeFocused();
});

async function signIn(page: Page, email: string) {
  await page.goto("/login"); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Login code")).toBeVisible();
  const records = readFileSync("data/login-e2e-outbox.jsonl", "utf8").trim().split("\n").map(line => JSON.parse(line));
  await page.getByLabel("Login code").fill(records.filter(row => row.email === email).at(-1).code);
  await page.getByLabel("Login code").press("Enter");
  await expect(page.getByLabel("What do you want to learn?")).toBeVisible();
}
function seedCourse(email: string, key: string) {
  const sqlite = new Database("data/login-e2e.db");
  try {
    const user = sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string };
    sqlite.prepare('INSERT OR IGNORE INTO courses(id,user_id,topic,created_at,started_at) VALUES (?,?,?,?,?)').run(key, user.id, `${key} study`, Date.now(), Date.now());
    sqlite.prepare(`INSERT OR IGNORE INTO chapters(id,course_id,idx,title,objectives,prerequisites,status,content,content_generation_status,quiz_generation_status,quiz_generation_version,generated_at,created_at) VALUES (?,?,0,?,'["Learn the key idea"]','[]','open',?,'ready','ready',1,?,?)`).run(`${key}-chapter`, key, `${key} lesson`, `## ${key} reading\n\nA private lesson for ${key}.`, Date.now(), Date.now());
    for (let index = 0; index < 10; index++) {
      const questionId = `00000000-0000-4000-8000-${String((key === "owner" ? 1 : 101) + index).padStart(12, "0")}`;
      sqlite.prepare("INSERT OR IGNORE INTO questions(id,chapter_id,type,prompt,options,rubric,model_answer,concept_tag,created_at) VALUES (?,?,'mcq',?,'[\"Yes\",\"No\",\"Maybe\",\"Unknown\"]','The lesson supports this answer.',?,'idea',?)").run(questionId, `${key}-chapter`, `Did you read ${key} (${index + 1})?`, ["Yes", "No", "Maybe", "Unknown"][index % 4], Date.now());
    }
  } finally { sqlite.close(); }
}

test("two learners sign in, study, keep private profiles, resume, and sign out across tabs", async ({ browser }) => {
  const ownerContext = await browser.newContext(); const secondContext = await browser.newContext();
  const owner = await ownerContext.newPage(); const second = await secondContext.newPage();
  await signIn(owner, "owner@example.com"); seedCourse("owner@example.com", "owner");
  await owner.getByRole("link", { name: /Profile settings/ }).click();
  await owner.getByLabel(/About me/).fill("Experienced owner"); await owner.getByRole("button", { name: "Save profile" }).click(); await expect(owner.getByText("Profile saved.")).toBeVisible();
  await expect(owner.getByRole("combobox")).toHaveCount(0);
  await owner.goto("/"); await expect(owner.getByRole("heading", { name: "owner study", level: 2 })).toBeVisible();
  await signIn(second, "second@example.com"); seedCourse("second@example.com", "second");
  await second.reload(); await expect(second.getByRole("heading", { name: "second study", level: 2 })).toBeVisible(); await expect(second.getByText("owner study")).toHaveCount(0);
  await second.goto("/settings"); await expect(second.getByLabel(/About me/)).toHaveValue("");
  await second.getByLabel(/About me/).fill("New learner"); await second.getByRole("button", { name: "Save profile" }).click(); await expect(second.getByText("Profile saved.")).toBeVisible();
  expect((await secondContext.request.get("/api/courses/owner/export")).status()).toBe(404);
  expect((await secondContext.request.post("/api/chapters/owner-chapter/regenerate", { data: {} })).status()).toBe(404);
  await owner.goto("/course/owner/ch/0"); await expect(owner.getByRole("heading", { name: "owner lesson", exact: true })).toBeVisible();
  await expect(owner.getByText("A private lesson for owner.")).toBeVisible();
  await second.goto("/course/second/ch/0"); await expect(second.getByRole("heading", { name: "second lesson", exact: true })).toBeVisible();
  // Quiz evidence persists in the learner's course and remains private.
  const graded = await ownerContext.request.post("/api/chapters/owner-chapter/attempts", { data: { answers: [{ questionId: "00000000-0000-4000-8000-000000000001", response: "Yes" }] } });
  expect(graded.status()).toBe(200);
  expect(await graded.json()).toMatchObject({ passed: true, complete: true });
  await owner.goto("/"); await expect(owner.getByText("1 of 1 chapters mastered")).toBeVisible();
  await owner.reload(); await expect(owner.getByText("1 of 1 chapters mastered")).toBeVisible();
  expect((await secondContext.request.get("/api/courses/owner")).status()).toBe(404);
  await owner.goto("/settings"); await expect(owner.getByLabel(/About me/)).toHaveValue("Experienced owner");
  await owner.reload(); await expect(owner.getByLabel(/About me/)).toHaveValue("Experienced owner");
  const anotherTab = await ownerContext.newPage(); await anotherTab.goto("/");
  await owner.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(owner).toHaveURL(/\/login$/); await expect(anotherTab).toHaveURL(/\/login$/);
  expect((await ownerContext.request.get("/api/courses")).status()).toBe(401);
  await owner.goBack(); await expect(owner).toHaveURL(/\/login$/); await expect(owner.getByText("Experienced owner")).toHaveCount(0);
  await signIn(owner, "switch@example.com");
  await expect(owner.getByText("owner study")).toHaveCount(0);
  await owner.goto("/settings"); await expect(owner.getByLabel(/About me/)).toHaveValue("");
  await ownerContext.close(); await secondContext.close();
});

test("mobile login supports keyboard submission and a fresh course", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.screenshot({ path: "test-results/login-mobile.png", fullPage: true });
  await signIn(page, "mobile@example.com");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByLabel("What do you want to learn?").fill("Ecology for beginners");
  await page.getByRole("button", { name: "Create study →" }).click();
  await expect(page).toHaveURL(/\/course\//);
});

test("invitation and delivery errors are recoverable without exposing provider details", async ({ page }) => {
  await page.goto("/login");
  await page.screenshot({ path: "test-results/login-desktop.png", fullPage: true });
  await page.getByLabel("Email address").fill("uninvited@example.com"); await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.locator("#login-error")).toContainText("invitation-only");
  await page.getByLabel("Email address").fill("delivery-failure@example.com"); await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.locator("#login-error")).toContainText("could not send your code"); await expect(page.getByText("private-provider-error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeEnabled();
});
