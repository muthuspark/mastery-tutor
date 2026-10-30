import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { currentUser } from "@/lib/access";
import { SiteHeader } from "./site-header";

vi.mock("@/lib/access", () => ({ currentUser: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("renders authenticated actions without serializing user records and preserves a status override", async () => {
  const user = { id: "private-user-id", email: "private@example.com", name: "Private learner", emailVerified: true, createdAt: new Date(), updatedAt: new Date() };
  vi.mocked(currentUser).mockResolvedValue(user);
  const renderHeader = async (status?: string) => renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{await SiteHeader({ status })}</QueryClientProvider>,
  );
  const authenticated = await renderHeader();
  expect(authenticated).toContain('href="/"');
  expect(authenticated).toContain("Settings");
  expect(authenticated).toContain("Sign out");
  expect(authenticated).not.toMatch(/private-user-id|private@example.com|Private learner/);
  const status = await renderHeader("Your learning workspace");
  expect(status).toContain("Your learning workspace");
  expect(status).not.toMatch(/Settings|Sign out/);
});

it("propagates validation failures without assuming an authenticated user", async () => {
  vi.mocked(currentUser).mockRejectedValue(new Error("Session unavailable"));
  await expect(SiteHeader({})).rejects.toThrow("Session unavailable");
});
