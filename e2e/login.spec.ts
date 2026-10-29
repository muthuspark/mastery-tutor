import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteHeaderFallback } from "../components/site-header-shell";
test.use({ storageState: { cookies: [], origins: [] } });

test("landing page fits normal viewports and keeps short-screen controls reachable", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("img", { name: /Isaac Newton/ })).toBeVisible();
  for (const [width, height] of [[1440, 900], [1366, 768], [768, 1024], [390, 844], [375, 667], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth,
      vertical: document.documentElement.scrollHeight > innerHeight,
    }));
    expect(overflow.horizontal, `${width} × ${height}`).toBe(false);
    // Short landscape screens deliberately scroll instead of shrinking controls.
    if (height >= 480) expect(overflow.vertical, `${width} × ${height}`).toBe(false);
    await page.getByRole("button", { name: "Email me a code" }).scrollIntoViewIfNeeded();
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Code error at ${width} × ${height}`).toBe(true);
    if (height >= 480) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), `Code error at ${width} × ${height}`).toBe(true);
    await page.getByRole("button", { name: "Change email" }).scrollIntoViewIfNeeded();
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
  await page.getByRole("button", { name: "Start a study →" }).click();
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

// Keep observations in the runner so redirects/document replacements cannot erase a flash.
type HeaderSample = { path: string; settings: boolean; signOut: boolean; beta: boolean; href: string | null; transient?: boolean };
async function observeHeader(page: Page) {
  const samples: HeaderSample[] = [];
  await page.exposeBinding("recordHeader", (_source, sample: HeaderSample) => { samples.push(sample); });
  await page.addInitScript(() => {
    const report = (window as unknown as { recordHeader: (sample: HeaderSample) => Promise<void> }).recordHeader;
    let previous = "";
    function sample() {
      const header = [...document.querySelectorAll<HTMLElement>(".site-header")].find(node => node.getClientRects().length > 0);
      if (!header) return;
      const state = {
        path: location.pathname,
        settings: !!header.querySelector('a[href="/settings"]'),
        signOut: [...header.querySelectorAll("button")].some(button => /Sign(?:ing)? out/.test(button.textContent ?? "")),
        beta: !!header.querySelector(".login-beta"),
        href: header.querySelector(".site-brand")?.getAttribute("href") ?? null,
      };
      const key = JSON.stringify(state);
      if (key !== previous) { previous = key; void report(state); }
    }
    new MutationObserver(records => {
      // Inspect added controls too: an action inserted and removed in one frame must be caught.
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const controls = [node, ...node.querySelectorAll(".account-control")].filter(element => element.matches(".account-control"));
          for (const control of controls) {
            if (!control.closest(".site-header") && !(record.target instanceof Element && record.target.closest(".site-header"))) continue;
            void report({ path: location.pathname, settings: control.matches('a[href="/settings"]'), signOut: control.matches("button"), beta: false, href: null, transient: true });
          }
        }
      }
      sample();
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    function frame() { sample(); requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  });
  return samples;
}

async function delayNavigation(page: Page, milliseconds: number) {
  let delayed = 0;
  await page.route("**/*", async route => {
    const request = route.request();
    if (request.isNavigationRequest() || request.headers()["rsc"] === "1") {
      delayed++;
      await new Promise(resolve => setTimeout(resolve, milliseconds));
    }
    await route.continue();
  });
  return () => delayed;
}

async function settleHeader(page: Page) {
  // Let mutation reports and two paint opportunities reach the runner before asserting history.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

for (const delay of [0, 400]) {
  test(`signed-out header never flashes account actions during logo navigation (${delay} ms delay)`, async ({ page }) => {
    const samples = await observeHeader(page);
    const delayed = delay ? await delayNavigation(page, delay) : undefined;
    await page.goto("/login");
    await expect(page.locator(".site-header .login-beta")).toBeVisible();
    const logo = page.getByRole("link", { name: "Newton", exact: true });
    await logo.focus();
    await expect(logo).toBeFocused();
    await logo.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".site-header .login-beta")).toBeVisible();
    // Also exercise the original protected destination independently of the fixed href.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".site-header .login-beta")).toBeVisible();
    await settleHeader(page);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.filter(sample => sample.settings || sample.signOut)).toEqual([]);
    await expect(logo).toHaveAttribute("href", "/login");
    expect((await page.request.get("/api/courses")).status()).toBe(401);
    if (delayed) expect(delayed()).toBeGreaterThan(0);
  });
}

test("header observer catches actions inserted and removed before a paint", async ({ page }) => {
  const samples = await observeHeader(page);
  await page.goto("/login");
  await expect(page.locator(".login-beta")).toBeVisible();
  await page.evaluate(() => {
    const nav = document.createElement("nav");
    nav.innerHTML = '<a class="account-control" href="/settings">Settings</a><button class="account-control">Sign out</button>';
    const header = document.querySelector(".site-header")!;
    header.append(nav);
    nav.remove();
  });
  await settleHeader(page);
  expect(samples.some(sample => sample.transient && sample.settings)).toBe(true);
  expect(samples.some(sample => sample.transient && sample.signOut)).toBe(true);
});

test("signed-in header keeps actions through logo navigation and becomes public after logout", async ({ page }) => {
  const samples = await observeHeader(page);
  await signIn(page, "header@example.com");
  await expect(page.locator(".site-header .account-navigation")).toBeVisible();
  for (const delay of [0, 400]) {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
    await expect(page.locator(".site-header .account-navigation")).toBeVisible();
    await settleHeader(page);
    const start = samples.length;
    const delayed = delay ? await delayNavigation(page, delay) : undefined;
    const logo = page.getByRole("link", { name: "Newton", exact: true });
    await expect(logo).toHaveAttribute("href", "/");
    await logo.focus();
    await logo.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Your learning workspace" })).toBeVisible();
    await logo.click();
    await settleHeader(page);
    await expect(page.locator(".site-header .account-navigation")).toBeVisible();
    const transition = samples.slice(start).filter(sample => !sample.transient);
    expect(transition.some(sample => sample.path === "/")).toBe(true);
    expect(transition.every(sample => sample.settings && sample.signOut && !sample.beta && sample.href === "/")).toBe(true);
    if (delayed) expect(delayed()).toBeGreaterThan(0);
    await page.unrouteAll({ behavior: "wait" });
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".site-header .login-beta")).toBeVisible();
  await settleHeader(page);
  const signedOutStart = samples.length;
  const logo = page.getByRole("link", { name: "Newton", exact: true });
  await expect(logo).toHaveAttribute("href", "/login");
  await logo.click();
  await settleHeader(page);
  expect(samples.slice(signedOutStart).filter(sample => sample.settings || sample.signOut)).toEqual([]);
  await expect(page).toHaveURL(/\/login$/);
});

test("neutral header fallback preserves public header geometry", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".site-header .login-beta")).toBeVisible();
  // Render the real fallback directly: fast session checks may never emit it over the network.
  const fallback = renderToStaticMarkup(createElement(SiteHeaderFallback));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    const before = await page.locator(".site-header").boundingBox();
    const publicHeader = await page.locator(".site-header").evaluate(header => header.outerHTML);
    await page.locator(".site-header").evaluate((header, html) => { header.outerHTML = html; }, fallback);
    await expect(page.getByRole("link", { name: "Newton", exact: true })).toBeVisible();
    await expect(page.locator(".site-header .account-control, .site-header .login-beta")).toHaveCount(0);
    const pending = await page.locator(".site-header").boundingBox();
    expect(pending).toEqual(before);
    await page.locator(".site-header").evaluate((header, html) => { header.outerHTML = html; }, publicHeader);
  }
});

test("login adapts across narrow, tablet, landscape, and enlarged-text contexts", async ({ page }) => {
  await page.route("**/api/auth/email-otp/send-verification-otp", route => route.fulfill({ json: { success: true } }));
  await page.route("**/api/auth/sign-in/email-otp", route => route.fulfill({
    status: 400, json: { error: { message: "This code has expired. Request another code and try again." } },
  }));
  const contexts = [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 390, height: 360 },
    { width: 320, height: 568, enlarged: true },
  ];
  for (const viewport of contexts) {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    if (viewport.enlarged) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.evaluate(() => document.fonts.ready);
    const email = page.getByLabel("Email address");
    expect(await email.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    await email.fill("learner.with.a.long.email.address@example.com");
    await email.press("Enter");
    const code = page.getByLabel("Login code");
    await expect(code).toBeFocused();
    await code.fill("123456");
    await code.press("Enter");
    await expect(page.locator("#login-error")).toContainText("expired");
    expect(await email.count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator(".login-form button").all()) {
      const bounds = await button.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/login-adapt-${viewport.width}-${viewport.height}${viewport.enlarged ? "-large-text" : ""}.png`, fullPage: true });
    await page.getByRole("button", { name: "Change email" }).click();
    await expect(email).toBeFocused();
    await expect(email).toHaveValue("learner.with.a.long.email.address@example.com");
    await expect(page.locator("#login-error")).toHaveCount(0);
  }
});
