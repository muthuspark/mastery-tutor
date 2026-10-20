import { expect, test } from "@playwright/test";

test("chapter images preserve proportions and fit the reading column on desktop and mobile", async ({ page }) => {
  const chapter = { id: "image-chapter", idx: 0, title: "Nerve cells", status: "passed", pretest: null };
  await page.route("**/api/courses/image-course", route => route.fulfill({ json: { course: { topic: "Biology" }, chapters: [chapter] } }));
  await page.route("**/api/chapters/image-chapter", route => route.fulfill({ json: {
    chapter,
    html: '<p>A neuron carries a signal along its axon.</p><p><img src="https://upload.wikimedia.org/test-neuron.svg" alt="A neuron with a long axon" loading="lazy" decoding="async"></p><p><a href="https://en.wikipedia.org/wiki/Neuron">Source: Wikipedia</a></p><p>The signal travels to another cell.</p>',
  } }));
  await page.route("https://upload.wikimedia.org/test-neuron.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800" viewBox="0 0 1600 800"><rect width="1600" height="800" fill="#f5f3ef"/><circle cx="400" cy="400" r="180" fill="#8b7355"/><path d="M580 400H1450" stroke="#c41e3a" stroke-width="16"/></svg>' }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/course/image-course/ch/0");
    const image = page.getByRole("img", { name: "A neuron with a long axon" });
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1600);
    const bounds = (await image.boundingBox())!;
    const column = (await page.locator(".prose-editorial").boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(column.width);
    expect(bounds.width / bounds.height).toBeCloseTo(2, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Source: Wikipedia" })).toBeVisible();
    await expect(page.getByText("The signal travels to another cell.")).toBeVisible();
  }
});
