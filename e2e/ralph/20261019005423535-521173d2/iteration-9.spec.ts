import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

const dialogName = "Building your learning path";

async function layout(page: Page, container: Locator, content: Locator[]) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(await container.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  for (const item of content) {
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(await item.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
}

async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

for (const width of [375, 768, 1440]) {
  test(`generation stays modal, recovers failures, and navigates on success at ${width}px`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = preparedMcqFixture();
    let release: (() => void) | undefined;
    let gate = Promise.resolve();
    let outcome: "http" | "network" | "success" = "http";
    const creations: unknown[] = [];
    const unexpectedWrites: string[] = [];
    const topicText = `Test-owned modal topic ${fixture.courseId}`;
    try {
      expect(isBalancedQuiz(fixture.questions)).toBe(true);
      const response = await request.get(`/api/courses/${fixture.courseId}`);
      expect(response.status(), "The existing server must see the fixture; set RALPH_TEST_DATABASE if needed").toBe(200);
      const course = await response.json();
      // Creation is deliberately controlled before dispatch: no CLI or paid
      // generation runs. Success returns an already prepared test-owned course.
      // The destination API and reload remain real, but this does not test
      // persistence of newly generated content or grading.
      await page.route("**/api/**", async route => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (req.method() === "POST" && path === "/api/courses") {
          creations.push(req.postDataJSON());
          const result = outcome;
          await gate;
          if (result === "network") await route.abort("failed");
          else if (result === "http") await route.fulfill({ status: 503, json: { error: { message: "Test-owned creation failure. Please try again." } } });
          else await route.fulfill({ json: { courseId: fixture.courseId } });
        } else if (req.method() !== "GET") {
          unexpectedWrites.push(`${req.method()} ${path}`);
          await route.abort("blockedbyclient");
        } else if (path === "/api/agents") {
          await route.fulfill({ json: { available: ["codex"], selected: "codex" } });
        } else if (path === "/api/courses") {
          await route.fulfill({ json: { courses: [{ id: fixture.courseId, topic: course.course.topic, createdAt: new Date().toISOString(), progress: { passed: 0, total: 1 } }] } });
        } else if (/\/api\/chapters\/[^/]+\/quiz$/.test(path)) {
          // Quiz regeneration is outside this modal test, including prefetches.
          await route.fulfill({ status: 503, json: { error: { message: "Quiz generation is outside this test." } } });
        } else await route.continue();
      });
      await page.goto("/");
      const main = page.getByRole("main", { includeHidden: true });
      const topic = main.locator('textarea[name="topic"]');
      const begin = main.getByRole("button", { name: "Begin", exact: true });
      // Exact hrefs come from SiteHeader and CourseList. DOM locators still
      // resolve these elements while a native modal removes them from the AX tree.
      const settings = page.locator('a[href="/settings"]');
      const study = main.locator(`a[href="/course/${fixture.courseId}"]`);
      await expect(settings).toHaveText("Profile settings");
      await expect(study).toContainText(course.course.topic);
      await expect(begin).toBeEnabled();
      await topic.fill(topicText);
      // Advance only the existing progress timer; no arbitrary waiting or
      // larger selector timeouts are needed for the 6.5-second stage change.
      await page.clock.install();

      for (const [index, result] of (["http", "network", "success"] as const).entries()) {
        outcome = result;
        gate = new Promise<void>(resolve => { release = resolve; });
        await begin.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
        const heading = dialog.getByRole("heading", { name: dialogName, exact: true });
        const status = dialog.getByRole("status");
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleName(dialogName);
        expect(await dialog.evaluate(element => element.matches(":modal"))).toBe(true);
        await expect(heading).toBeFocused();
        await expect(status).toHaveText("Reading the shape of your topic.");
        await expect(status).toHaveAttribute("aria-atomic", "true");
        await expect(dialog).toHaveAccessibleDescription("Reading the shape of your topic.");
        await expect(dialog.locator(".generation-desk")).toHaveAttribute("aria-hidden", "true");
        await expect(dialog.locator(".generation-progress")).toHaveAttribute("aria-hidden", "true");
        await expect(dialog.getByRole("progressbar")).toHaveCount(0);
        await expect.poll(() => creations.length).toBe(index + 1);
        expect(creations[index]).toEqual({ topic: topicText, agent: "codex" });

        for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab", "Escape", "Enter"]) {
          await page.keyboard.press(key);
          await expect(dialog).toBeVisible();
          await expect(heading).toBeFocused();
          await expect(page).toHaveURL("/");
        }
        // Native modal inertness must also reject direct background focus,
        // beyond the component's own Tab handler.
        for (const background of [settings, study]) {
          await background.evaluate(element => (element as HTMLElement).focus());
          await expect(heading).toBeFocused();
        }
        await expect(topic).toBeDisabled();
        const pendingButton = main.locator('.new-course-form button[type="submit"]');
        await expect(pendingButton).toHaveText("Starting your study…");
        await expect(pendingButton).toBeDisabled();
        await layout(page, dialog, [heading, status]);
        await capture(page, info, `${result}-modal-initial`);
        await page.clock.fastForward(6500);
        await expect(status).toHaveText("Putting each idea where it can do the most work.");
        await expect(dialog).toHaveAccessibleDescription("Putting each idea where it can do the most work.");
        await expect(heading).toBeFocused();
        await layout(page, dialog, [heading, status]);
        await capture(page, info, `${result}-modal-progress`);
        expect(creations).toHaveLength(index + 1);
        release!();

        if (result !== "success") {
          await expect(dialog).toHaveCount(0);
          const message = result === "http" ? "Test-owned creation failure. Please try again." : "Could not reach the tutor. Check the server and try again.";
          const alert = main.getByRole("alert").filter({ hasText: message });
          await expect(alert).toHaveText(message);
          await expect(topic).toHaveValue(topicText);
          await expect(topic).toBeEnabled();
          await expect(topic).toBeFocused();
          await expect(begin).toBeEnabled();
          // CourseList intentionally extends study-link hover backgrounds 12px
          // into the page gutters (-mx-3 px-3). Measure recovery within its form,
          // while still checking document overflow and the study link's viewport
          // bounds and internal overflow. The modal uses its own strict check.
          await layout(page, main.locator(".new-course-form"), [topic, alert, begin, study]);
          await capture(page, info, `${result}-recovery`);
          await settings.focus();
          await expect(settings).toBeFocused();
          await study.focus();
          await expect(study).toBeFocused();
          await expect(page).toHaveURL("/");
        }
      }

      await expect(page).toHaveURL(`/course/${fixture.courseId}`);
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(course.course.topic);
      await expect(page.getByRole("dialog", { name: dialogName, exact: true })).toHaveCount(0);
      await page.reload();
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(course.course.topic);
      await expect(main.getByRole("link", { name: "Prepared deterministic quiz Continue →", exact: true })).toBeVisible();
      await layout(page, main, [main.getByRole("heading", { level: 1 })]);
      await capture(page, info, "success-destination-after-reload");
      expect(creations).toHaveLength(3);
      expect(unexpectedWrites).toEqual([]);
      const saved = fixture.persisted();
      expect(saved.attempts).toEqual([]);
      expect(saved.answers).toEqual([]);
      expect(saved.chapter?.status).toBe("open");
      expect(saved.jobs).toEqual([]);
      // Topic preservation is transient across failures, not durable draft
      // storage; reload checks only the real prepared destination course.
    } finally {
      release?.();
      try { await page.close(); } finally { fixture.cleanup(); }
    }
  });
}
