import { PassThrough } from "node:stream";
import { Suspense } from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { currentUser } from "@/lib/access";
import { SiteHeader } from "./site-header";
import { SiteHeaderFallback } from "./site-header-shell";

vi.mock("@/lib/access", () => ({ currentUser: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("streams a neutral header while session validation is pending, then resolves public content", async () => {
  let resolveSession!: (value: null) => void;
  vi.mocked(currentUser).mockReturnValue(new Promise(resolve => { resolveSession = resolve; }));
  const output = new PassThrough();
  let html = "";
  let resolveShell!: () => void;
  const shell = new Promise<void>(resolve => { resolveShell = resolve; });
  const complete = new Promise<void>((resolve, reject) => {
    output.on("data", chunk => { html += chunk.toString(); resolveShell(); });
    output.on("end", resolve);
    output.on("error", reject);
  });
  const stream = renderToPipeableStream(
    <div><Suspense fallback={<SiteHeaderFallback />}><SiteHeader /></Suspense><main>Page shell</main></div>,
    { onShellReady() { stream.pipe(output); }, onError(error) { output.destroy(error as Error); } },
  );
  try {
    await shell;
    expect(currentUser).toHaveBeenCalledOnce();
    expect(html).toContain('class="site-header"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('alt="Newton"');
    expect(html).not.toMatch(/Private beta|Settings|Sign out|account-navigation/);
    resolveSession(null);
    await complete;
    expect(html).toContain("Private beta");
    expect(html).not.toMatch(/Settings|Sign out|account-navigation/);
  } finally { stream.abort(); }
});

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
