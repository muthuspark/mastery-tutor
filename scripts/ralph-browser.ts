import { z } from "zod";

const count = z.number().int().nonnegative();
const reportSchema = z.object({
  stats: z.object({ expected: count, unexpected: count, flaky: count, skipped: count }),
  errors: z.array(z.unknown()), suites: z.array(z.unknown()),
});

// Collect actual error messages, not source snippets that may mention these terms.
function errorMessages(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(errorMessages);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => key === "message" && typeof item === "string" ? [item] : errorMessages(item));
}

export function assessBrowserReport(value: unknown, commandFailed: boolean) {
  const report = reportSchema.parse(value);
  const messages = errorMessages([report.errors, report.suites]);
  const reason = messages.slice(0, 5).join("\n");
  const infrastructure = /executable doesn't exist|browserType\.launch|EACCES|EPERM|ERR_CONNECTION_REFUSED|ECONNREFUSED|ERR_CONNECTION_RESET|No tests found|missing dependencies|Host system is missing dependencies/i;
  if (messages.some(message => infrastructure.test(message))) {
    return { status: "blocked" as const, reason: reason || "Browser environment unavailable", passed: report.stats.expected };
  }
  if (report.stats.unexpected || report.stats.flaky || report.errors.length) {
    return { status: "failed" as const, reason: reason || "Browser assertions failed or were flaky", passed: report.stats.expected };
  }
  if (commandFailed || !report.stats.expected || report.stats.skipped) {
    return { status: "blocked" as const, reason: reason || "Playwright did not complete all selected tests successfully (zero tests, skips, or runner failure)", passed: report.stats.expected };
  }
  return { status: "passed" as const, reason: "All selected browser tests passed without skips or retries", passed: report.stats.expected };
}
