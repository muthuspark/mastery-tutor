import { expect, test } from "@playwright/test";

const studies = [
  { id: "os", topic: "Operating Systems", createdAt: "2026-10-01", startedAt: "2026-10-02", preparationStatus: "ready", progress: { passed: 4, total: 12 } },
  { id: "distributed", topic: "Distributed Systems fundamentals", createdAt: "2026-10-03", preparationStatus: "ready", progress: { passed: 0, total: 10 } },
  { id: "calculus", topic: "Differential Calculus", createdAt: "2026-09-01", startedAt: "2026-09-02", preparationStatus: "ready", progress: { passed: 2, total: 10 } },
  { id: "linear", topic: "Linear Algebra", createdAt: "2026-08-01", preparationStatus: "ready", progress: { passed: 3, total: 12 } },
  { id: "networks", topic: "Computer Networks", createdAt: "2026-10-04", preparationStatus: "generating", progress: { passed: 0, total: 8 } },
  { id: "databases", topic: "Database Systems", createdAt: "2026-10-05", preparationStatus: "ready", progress: { passed: 10, total: 10 } },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/agents", route => route.fulfill({ json: { available: ["deepseek"], selected: "deepseek" } }));
});

for (const width of [1440, 390]) {
  test(`resume workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await page.route("**/api/courses", route => route.fulfill({ json: { courses: studies } }));
    await page.goto("/");
    const featured = page.getByRole("region", { name: "Operating Systems", exact: true });
    await expect(featured.getByRole("link", { name: "Continue studying →" })).toHaveAttribute("href", "/course/os");
    await expect(featured.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
    await page.evaluate(() => document.fonts.ready);
    await expect(featured.locator("img")).toHaveCount(0);
    if (width > 767) await expect.poll(() => page.locator(".studies-books").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const list = page.getByRole("region", { name: "Your studies" });
    await expect(list.getByRole("link")).toHaveCount(6);
    await expect(list.getByText("Preparing your course")).toBeVisible();
    await expect(list.getByText("Review →")).toBeVisible();
    const creation = page.getByRole("region", { name: "Start something new" });
    await expect(creation.getByRole("button", { name: "Start a study →" })).toBeEnabled();
    const headerBox = (await page.locator("body > .site-header").boundingBox())!;
    const mainBox = (await page.getByRole("main").boundingBox())!;
    expect(Math.abs(headerBox.x - mainBox.x)).toBeLessThan(1);
    expect(Math.abs(headerBox.width - mainBox.width)).toBeLessThan(1);
    const listBox = (await list.boundingBox())!;
    const creationBox = (await creation.boundingBox())!;
    if (width > 767) expect(Math.abs(listBox.y - creationBox.y)).toBeLessThan(2);
    else expect(creationBox.y).toBeGreaterThan(listBox.y + listBox.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-resume-${width}.png`, fullPage: true });
  });
}

test("new learners see creation first without a misleading resume action", async ({ page }) => {
  await page.route("**/api/courses", route => route.fulfill({ json: { courses: [] } }));
  await page.goto("/");
  await expect(page.getByText("Your saved studies and progress will appear here.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue studying →" })).toHaveCount(0);
  const regions = page.getByRole("main").getByRole("region");
  await expect(regions.first()).toHaveAccessibleName("Start something new");
});

test("unstarted studies use Start studying and completed courses remain reviewable", async ({ page }) => {
  await page.route("**/api/courses", route => route.fulfill({ json: { courses: [studies[1], studies[4], studies[5]] } }));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start studying →" })).toHaveAttribute("href", "/course/distributed");
  await expect(page.getByRole("link", { name: /Database Systems.*Review/ })).toHaveAttribute("href", "/course/databases");
});

test("desktop keeps study actions in view and every saved study reachable", async ({ page }) => {
  const courses = Array.from({ length: 30 }, (_, index) => ({ ...studies[0], id: `saved-${index}`, topic: `Saved study ${index + 1}` }));
  await page.route("**/api/courses", route => route.fulfill({ json: { courses } }));
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const list = page.getByRole("region", { name: "Your studies" });
  await expect(list.getByRole("link")).toHaveCount(30);
  for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth <= innerWidth, y: document.documentElement.scrollHeight <= innerHeight })), `${width} × ${height}`).toEqual({ x: true, y: true });
    await expect(page.getByRole("button", { name: "Start a study →" })).toBeInViewport();
    await expect(page.getByRole("link", { name: "Continue studying →" })).toBeInViewport();
    await list.getByRole("link").last().scrollIntoViewIfNeeded();
    await list.getByRole("link").last().focus();
    await expect(list.getByRole("link").last()).toBeInViewport();
    await expect(page.getByRole("contentinfo")).toBeInViewport();
  }
});
