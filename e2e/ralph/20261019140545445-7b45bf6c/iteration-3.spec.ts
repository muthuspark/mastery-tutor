import { expect, test, type Locator, type Page } from "@playwright/test";

const courseId = "ralph-unlock-guidance-iteration-3";
const coursePath = `/course/${courseId}`;
const bridgeTitle = "Connecting foundational concepts with practical applications and interconnected systems";
const missingMessage = "A listed prerequisite is unavailable in this course. This chapter cannot unlock until all listed prerequisites are mastered.";

const cases = [
  { name: "no declared prerequisites", prerequisites: [], expected: [], missing: false },
  {
    name: "multiple prerequisites with mixed mastery states",
    prerequisites: [2, 0, 1],
    expected: ["Foundations: Mastered", "Practice: Not yet mastered", `${bridgeTitle}: Mastered`],
    missing: false,
  },
  { name: "mastered prerequisite still requires sequential progression", prerequisites: [0], expected: ["Foundations: Mastered"], missing: false },
  { name: "unavailable prerequisite reference", prerequisites: [99, 0], expected: ["Foundations: Mastered"], missing: true },
];

async function assertReadable(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  await element.scrollIntoViewIfNeeded();
  const bounds = await element.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [375, 1440]) {
  test.describe(`locked chapter guidance at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const scenario of cases) {
      test(scenario.name, async ({ page }, info) => {
        // Match the existing course accessibility tests' read-only presentation
        // fixtures. No real grading, unlocking, or persistence is claimed here.
        const chapters = [
          { id: "foundation", idx: 0, title: "Foundations", status: "passed", prerequisites: [] },
          { id: "practice", idx: 1, title: "Practice", status: "open", prerequisites: [] },
          { id: "bridge", idx: 2, title: bridgeTitle, status: "passed", prerequisites: [] },
          { id: "advanced", idx: 3, title: "Advanced applications", status: "locked", prerequisites: scenario.prerequisites },
        ];
        const unexpectedApiRequests: string[] = [];
        await page.route("**/api/**", async route => {
          const request = route.request();
          if (new URL(request.url()).pathname === `/api/courses/${courseId}` && request.method() === "GET") {
            await route.fulfill({ json: {
              course: { topic: "Unlock guidance fixture" }, chapters,
              progress: { passed: 2, total: 4 },
            } });
          } else {
            // Prevent unintended reset, generation, or other learner-data access.
            unexpectedApiRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
            await route.abort("blockedbyclient");
          }
        });
        await page.goto(coursePath);
        const main = page.getByRole("main");
        const rows = main.locator("ol > li");
        const locked = rows.nth(3);
        const guidance = locked.getByText(
          `Unlocks when you pass the mastery check for “${bridgeTitle}”${scenario.prerequisites.length ? " with all listed prerequisites mastered" : ""}.`,
          { exact: true },
        );

        async function assertGuidance() {
          await expect(main.getByRole("heading", { name: "Unlock guidance fixture", exact: true })).toBeVisible();
          await expect(rows).toHaveCount(4);
          await expect(rows.locator(".chapter-title")).toHaveText(chapters.map(chapter => chapter.title));
          await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "50");
          await expect(main.getByRole("link", { name: "Continue: Practice →", exact: true })).toHaveAttribute("href", `${coursePath}/ch/1`);
          await expect(locked.getByText("Locked", { exact: true })).toBeVisible();
          await assertReadable(page, guidance);
          await expect(locked.getByText("Required prerequisites:", { exact: true })).toHaveCount(scenario.prerequisites.length ? 1 : 0);
          const prerequisites = locked.getByRole("listitem");
          await expect(prerequisites).toHaveCount(scenario.expected.length);
          if (scenario.expected.length) await expect(prerequisites).toHaveText(scenario.expected);
          for (const item of await prerequisites.all()) await assertReadable(page, item);
          await expect(locked.getByText(missingMessage, { exact: true })).toHaveCount(scenario.missing ? 1 : 0);
          if (scenario.missing) {
            await assertReadable(page, locked.getByText(missingMessage, { exact: true }));
            await expect(locked).not.toContainText("Chapter 100");
            await expect(locked).not.toContainText("undefined");
          }
          // An empty declaration must not invent requirements for earlier lessons.
          if (!scenario.prerequisites.length) {
            await expect(locked).not.toContainText("Foundations");
            await expect(locked).not.toContainText("Practice");
          }
          await expect(locked.getByRole("link")).toHaveCount(0);
          await expect(locked.getByRole("button")).toHaveCount(0);
          await expect(locked.locator("[tabindex], input, select, textarea, [contenteditable=true]")).toHaveCount(0);
        }

        await assertGuidance();
        // Static locked content must neither navigate nor open a reset dialog.
        await locked.getByText("Advanced applications", { exact: true }).click();
        await expect(page).toHaveURL(coursePath);
        await expect(main.getByRole("dialog")).toHaveCount(0);

        // Tab past the last available lesson: guidance adds no inert keyboard stop.
        const read = rows.nth(2).getByRole("link", { name: `Read lesson → ${bridgeTitle}`, exact: true });
        await read.focus();
        await expect(read).toBeFocused();
        await page.keyboard.press("Tab");
        expect(await locked.evaluate(node => node.contains(document.activeElement))).toBe(false);
        await page.keyboard.press("Shift+Tab");
        await expect(read).toBeFocused();

        // A fresh course read renders the same explanation; this is reload
        // consistency for the display fixture, not a database persistence test.
        await page.reload();
        await assertGuidance();
        await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
        await assertGuidance();
        expect(unexpectedApiRequests).toEqual([]);
        await info.attach("locked-chapter-guidance-enlarged-text", {
          body: await page.screenshot({ fullPage: true }), contentType: "image/png",
        });
      });
    }
  });
}
