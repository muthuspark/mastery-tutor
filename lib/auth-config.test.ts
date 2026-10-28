import { afterEach, expect, it, vi } from "vitest";
import { authConfig, isConfiguredInvite as isInvited, normalizeEmail, ownerEmail } from "./auth-config";
afterEach(() => vi.unstubAllEnvs());
it("normalizes email case and whitespace without rewriting address components", () => {
  vi.stubEnv("OWNER_EMAIL", " Owner@Example.com "); vi.stubEnv("INVITED_EMAILS", " First.Last+beta@example.com,second@example.com");
  expect(ownerEmail()).toBe("owner@example.com"); expect(isInvited("OWNER@example.com")).toBe(true);
  expect(normalizeEmail(" First.Last+Beta@Example.com ")).toBe("first.last+beta@example.com");
  expect(isInvited("first.last+beta@example.com")).toBe(true); expect(isInvited("firstlast@example.com")).toBe(false); expect(isInvited("first.last@example.com")).toBe(false);
});
it("fails clearly for missing settings and requires HTTPS for deployed production hosts", () => {
  vi.stubEnv("BETTER_AUTH_SECRET", ""); expect(authConfig).toThrow("BETTER_AUTH_SECRET");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-has-at-least-thirty-two-characters"); vi.stubEnv("BETTER_AUTH_URL", ""); expect(authConfig).toThrow("BETTER_AUTH_URL");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000"); vi.stubEnv("OWNER_EMAIL", ""); expect(authConfig).toThrow("OWNER_EMAIL");
  vi.stubEnv("OWNER_EMAIL", "owner@example.com"); vi.stubEnv("MAILTRAP_API_KEY", ""); expect(authConfig).toThrow("MAILTRAP_API_KEY");
  vi.stubEnv("MAILTRAP_API_KEY", "test-key"); vi.stubEnv("FROM_EMAIL", "tutor@example.com"); vi.stubEnv("AI_PROVIDER", ""); expect(authConfig).toThrow("AI_PROVIDER");
  vi.stubEnv("AI_PROVIDER", "codex"); expect(authConfig().baseURL).toBe("http://localhost:3000");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_URL", "http://tutor.example.com"); expect(authConfig).toThrow("HTTPS");
  vi.stubEnv("BETTER_AUTH_URL", "https://tutor.example.com"); expect(authConfig().baseURL).toBe("https://tutor.example.com");
});

it("allows HTTP only for loopback production origins and selects appropriate session cookies", async () => {
  const { getCookies } = await import("better-auth/cookies");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-has-at-least-thirty-two-characters");
  vi.stubEnv("OWNER_EMAIL", "owner@example.com");
  vi.stubEnv("MAILTRAP_API_KEY", "test-key");
  vi.stubEnv("FROM_EMAIL", "tutor@example.com");
  vi.stubEnv("AI_PROVIDER", "codex");
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3105", "http://[::1]:3000"]) {
    vi.stubEnv("BETTER_AUTH_URL", origin);
    expect(authConfig().baseURL).toBe(origin);
    expect(getCookies(authConfig()).sessionToken.attributes.secure).toBe(false);
  }
  for (const origin of ["http://tutor.example.com", "http://192.168.1.24:3000", "http://localhost.example.com", "http://localhost@evil.example", "http://127.0.0.1.example.com", "http://[::ffff:192.168.1.24]:3000"]) {
    vi.stubEnv("BETTER_AUTH_URL", origin);
    expect(authConfig).toThrow("HTTPS");
  }
  vi.stubEnv("BETTER_AUTH_URL", "https://tutor.example.com");
  expect(getCookies(authConfig()).sessionToken.attributes.secure).toBe(true);
});
