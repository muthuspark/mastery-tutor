import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const discoveryError = "Could not check for learning agents. Try again.";
const installationAdvice = "Install the Codex or Claude CLI to begin.";

async function usableLayout(page: Page, controls: Locator[]) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const viewport = page.viewportSize()!;
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await control.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
}

async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

for (const width of [375, 768, 1440]) {
  test(`discovery retries preserve the topic through network and HTTP failures at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let mode: "network" | "http" | "success" = "network";
    let gate = Promise.resolve();
    let release: (() => void) | undefined;
    let discoveries = 0;
    const writes: string[] = [];
    // Controlled discovery is UI recovery evidence, not CLI detection evidence.
    // All writes are stopped before dispatch, including accidental course creation.
    // Empty course-list reads isolate this form from existing learner data.
    await page.route("**/api/**", async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() !== "GET") {
        writes.push(`${req.method()} ${path}`);
        await route.abort("blockedbyclient");
      } else if (path === "/api/agents") {
        discoveries += 1;
        const responseMode = mode;
        await gate;
        if (responseMode === "network") await route.abort("failed");
        else if (responseMode === "http") await route.fulfill({ status: 503, json: { error: { message: "Test-owned discovery failure" } } });
        else await route.fulfill({ json: { available: ["claude"], selected: "claude" } });
      } else if (path === "/api/courses") await route.fulfill({ json: { courses: [] } });
      else await route.continue();
    });
    const main = page.getByRole("main");
    const topic = main.getByRole("textbox", { name: "I want to learn", exact: true });
    const begin = main.getByRole("button", { name: "Begin", exact: true });
    const retry = main.getByRole("button", { name: "Retry agent discovery", exact: true });
    const alert = main.getByRole("alert").filter({ hasText: discoveryError });
    const topicText = "Test-owned linear algebra learning topic";
    try {
      await page.goto("/");
      await expect(alert).toHaveText(discoveryError);
      await expect(main.getByText(installationAdvice, { exact: true })).toHaveCount(0);
      await expect(begin).toBeDisabled();
      await expect(retry).toBeEnabled();
      await topic.fill(topicText);
      await usableLayout(page, [topic, alert, retry, begin]);
      await capture(page, info, "network-discovery-failure");
      expect(discoveries).toBe(1);

      for (const outcome of ["http", "success"] as const) {
        mode = outcome;
        gate = new Promise<void>(resolve => { release = resolve; });
        const before = discoveries;
        await retry.focus();
        await expect(retry).toBeFocused();
        await page.keyboard.press("Enter");
        const pending = main.getByRole("button", { name: "Checking agents…", exact: true });
        const status = main.getByRole("status").filter({ hasText: "Finding learning agents…" });
        await expect(status).toHaveText("Finding learning agents…");
        await expect(pending).toBeDisabled();
        await expect(begin).toBeDisabled();
        await expect(alert).toHaveCount(0);
        await expect(topic).toHaveValue(topicText);
        await expect(topic).toBeEnabled();
        await expect.poll(() => discoveries).toBe(before + 1);
        // Repeated keyboard activation of the now-disabled retry must not
        // dispatch a second request or submit the form.
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await usableLayout(page, [topic, status, pending, begin]);
        await capture(page, info, `${outcome}-retry-pending`);
        expect(discoveries).toBe(before + 1);
        expect(writes).toEqual([]);
        release!();
        if (outcome === "http") {
          await expect(alert).toHaveText(discoveryError);
          await expect(retry).toBeEnabled();
          await expect(begin).toBeDisabled();
          await expect(main.getByText(installationAdvice, { exact: true })).toHaveCount(0);
          await usableLayout(page, [topic, alert, retry, begin]);
          await capture(page, info, "repeated-http-discovery-failure");
        } else {
          await expect(main.getByText("Using Claude CLI", { exact: true })).toBeVisible();
          await expect(begin).toBeEnabled();
          await expect(retry).toHaveCount(0);
          await expect(alert).toHaveCount(0);
          await expect(main.getByText(installationAdvice, { exact: true })).toHaveCount(0);
          await usableLayout(page, [topic, begin]);
          await capture(page, info, "discovery-recovered");
        }
        await expect(status).toHaveCount(0);
        await expect(topic).toHaveValue(topicText);
        expect(discoveries).toBe(before + 1);
        expect(writes).toEqual([]);
        await expect(page).toHaveURL("/");
      }
      await expect(page.getByRole("dialog", { name: "Building your learning path", exact: true })).toHaveCount(0);
      // Topic preservation is across retries only; no durable topic storage is
      // promised by this form, so a reload must not assert topic persistence.
    } finally {
      release?.();
      await page.unrouteAll({ behavior: "wait" });
    }
  });

  test(`empty successful discovery retains installation guidance after retry and reload at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let discoveries = 0;
    const writes: string[] = [];
    await page.route("**/api/**", async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() !== "GET") {
        writes.push(`${req.method()} ${path}`);
        await route.abort("blockedbyclient");
      } else if (path === "/api/agents") {
        discoveries += 1;
        await route.fulfill(discoveries === 1
          ? { status: 500, json: { error: { message: "Test-owned discovery failure" } } }
          : { json: { available: [], selected: null } });
      } else if (path === "/api/courses") await route.fulfill({ json: { courses: [] } });
      else await route.continue();
    });
    await page.goto("/");
    const main = page.getByRole("main");
    const topic = main.getByRole("textbox", { name: "I want to learn", exact: true });
    const begin = main.getByRole("button", { name: "Begin", exact: true });
    const retry = main.getByRole("button", { name: "Retry agent discovery", exact: true });
    await expect(main.getByRole("alert").filter({ hasText: discoveryError })).toBeVisible();
    await topic.fill("Test-owned empty discovery topic");
    await retry.click();
    const guidance = main.getByRole("alert").filter({ hasText: installationAdvice });
    await expect(guidance).toHaveText(installationAdvice);
    await expect(topic).toHaveValue("Test-owned empty discovery topic");
    await expect(begin).toBeDisabled();
    await expect(retry).toHaveCount(0);
    await expect(main.getByRole("alert").filter({ hasText: discoveryError })).toHaveCount(0);
    await usableLayout(page, [topic, guidance, begin]);
    await capture(page, info, "empty-discovery-after-retry");
    expect(discoveries).toBe(2);
    await page.reload();
    // A fresh, successful empty response must give the same guidance rather
    // than inheriting the transient failure from the previous page instance.
    await expect(guidance).toHaveText(installationAdvice);
    await expect(begin).toBeDisabled();
    await expect(retry).toHaveCount(0);
    await expect(main.getByRole("alert").filter({ hasText: discoveryError })).toHaveCount(0);
    await usableLayout(page, [topic, guidance, begin]);
    await capture(page, info, "empty-discovery-after-reload");
    expect(discoveries).toBe(3);
    expect(writes).toEqual([]);
    await expect(page).toHaveURL("/");
  });
}
