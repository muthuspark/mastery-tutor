import { afterEach, expect, it, vi } from "vitest";
import { authConfig, isInvited, normalizeEmail, ownerEmail } from "./auth-config";
afterEach(() => vi.unstubAllEnvs());
it("normalizes email case and whitespace without rewriting address components", () => {
  vi.stubEnv("OWNER_EMAIL", " Owner@Example.com "); vi.stubEnv("INVITED_EMAILS", " First.Last+beta@example.com,second@example.com");
  expect(ownerEmail()).toBe("owner@example.com"); expect(isInvited("OWNER@example.com")).toBe(true);
  expect(normalizeEmail(" First.Last+Beta@Example.com ")).toBe("first.last+beta@example.com");
  expect(isInvited("first.last+beta@example.com")).toBe(true); expect(isInvited("firstlast@example.com")).toBe(false); expect(isInvited("first.last@example.com")).toBe(false);
});
it("fails clearly for missing settings and requires HTTPS in production", () => {
  vi.stubEnv("BETTER_AUTH_SECRET", ""); expect(authConfig).toThrow("BETTER_AUTH_SECRET");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-has-at-least-thirty-two-characters"); vi.stubEnv("BETTER_AUTH_URL", ""); expect(authConfig).toThrow("BETTER_AUTH_URL");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000"); vi.stubEnv("OWNER_EMAIL", ""); expect(authConfig).toThrow("OWNER_EMAIL");
  vi.stubEnv("OWNER_EMAIL", "owner@example.com"); vi.stubEnv("MAILTRAP_API_KEY", ""); expect(authConfig).toThrow("MAILTRAP_API_KEY");
  vi.stubEnv("MAILTRAP_API_KEY", "test-key"); vi.stubEnv("FROM_EMAIL", "tutor@example.com"); vi.stubEnv("AI_PROVIDER", ""); expect(authConfig).toThrow("AI_PROVIDER");
  vi.stubEnv("AI_PROVIDER", "codex"); expect(authConfig().baseURL).toBe("http://localhost:3000");
  vi.stubEnv("NODE_ENV", "production"); expect(authConfig).toThrow("HTTPS");
  vi.stubEnv("BETTER_AUTH_URL", "https://tutor.example.com"); expect(authConfig().baseURL).toBe("https://tutor.example.com");
});
