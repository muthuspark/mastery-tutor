import { describe, expect, it } from "vitest";
import { assessBrowserReport } from "./ralph-browser";

const report = () => ({ stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 }, errors: [] as unknown[], suites: [] as unknown[] });
describe("Playwright evidence", () => {
  it("requires a complete successful report", () => {
    expect(assessBrowserReport(report(), false).status).toBe("passed");
    expect(assessBrowserReport(report(), true).status).toBe("blocked");
    expect(() => assessBrowserReport({}, false)).toThrow();
    expect(assessBrowserReport({ ...report(), errors: [{ message: "Error: No tests found." }] }, true).status).toBe("blocked");
    for (const stats of [{ expected: 0 }, { skipped: 1 }]) {
      expect(assessBrowserReport({ ...report(), stats: { ...report().stats, ...stats } }, false).status).toBe("blocked");
    }
  });
  it("separates infrastructure errors from assertions", () => {
    const failed = { ...report(), stats: { ...report().stats, unexpected: 1 }, suites: [{ results: [{ error: { message: "Expected quiz results to be visible" } }] }] };
    expect(assessBrowserReport(failed, true).status).toBe("failed");
    failed.suites[0].results[0].error.message = "browserType.launch: Executable doesn't exist";
    expect(assessBrowserReport(failed, true).status).toBe("blocked");
    expect(assessBrowserReport({ ...report(), errors: [{ message: "SyntaxError in spec" }] }, true).status).toBe("failed");
  });
  it("does not mistake error words in source snippets for infrastructure failures", () => {
    expect(assessBrowserReport({ ...report(), suites: [{ snippet: "EPERM", title: "ECONNREFUSED" }] }, false).status).toBe("passed");
  });
});
